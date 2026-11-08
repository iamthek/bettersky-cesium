import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    Cartesian2, Cartesian3, DynamicAtmosphereLightingType, Ellipsoid,
    Event, Pass, PrimitiveCollection, ShaderSource, ShadowMode, SunLight,
} from "cesium";
import LightingController, { computeLightingState } from "../Library/internal/LightingController.js";

function createScene() {
    const nativeLight = { nativeLight: true };
    const mainFramebuffer = {};
    const scene = {
        light: nativeLight,
        primitives: new PrimitiveCollection({ destroyPrimitives: false }),
        atmosphere: { dynamicLighting: DynamicAtmosphereLightingType.NONE },
        globe: { ellipsoid: Ellipsoid.WGS84, enableLighting: false,
            dynamicAtmosphereLighting: false, dynamicAtmosphereLightingFromSun: false,
            lightingFadeOutDistance: 10000000, lightingFadeInDistance: 20000000,
            lambertDiffuseMultiplier: .9, shadows: ShadowMode.DISABLED },
        shadowMap: { enabled: false, maximumDistance: 5000, size: 2048, softShadows: false },
        camera: { positionWC: new Cartesian3(Ellipsoid.WGS84.maximumRadius, 0, 0) },
        context: {
            uniformState: { sunDirectionWC: new Cartesian3(1, 0, 0) },
            draw() {}, clear() {},
        },
        preRender: new Event(),
        postProcessStages: { execute() {} },
        frameState: { passes: { render: true } },
        _environmentState: { useGlobeDepthFramebuffer: true },
        _view: { globeDepth: { framebuffer: mainFramebuffer, executeCopyDepth() {} } },
    };
    return { scene, nativeLight };
}

function primitive(brightness = 1) {
    const factor = new Cartesian2(.7, .6);
    return {
        environmentMapManager: { brightness, enabled: false, maximumSecondsDifference: 3600 },
        imageBasedLighting: { imageBasedLightingFactor: factor },
        shadows: ShadowMode.RECEIVE_ONLY,
        destroy() { assert.fail("lighting must not destroy host primitives or environment resources"); },
    };
}

test("shared light state has neutral noon light, warm low sun, and no direct-light floor at night", () => {
    const noon = computeLightingState(Math.PI / 2);
    const evening = computeLightingState(5 * Math.PI / 180);
    const night = computeLightingState(-Math.PI / 4);
    assert.equal(noon.sunIntensity, 2);
    assert.equal(noon.daylightFactor, 1);
    assert.equal(night.sunIntensity, 0);
    assert.equal(night.daylightFactor, .035);
    assert(evening.sunIntensity > night.sunIntensity && evening.sunIntensity < noon.sunIntensity);
    assert(evening.sunColor[0] > evening.sunColor[1] && evening.sunColor[1] > evening.sunColor[2]);
    assert(noon.sunColor.every(value => value > .999));
    assert(night.ambientColor.every(value => value > 0));
    assert(night.ambientColor[2] < noon.ambientColor[2] * .04);
    const before = computeLightingState(-.015001), after = computeLightingState(-.014999);
    assert(Math.abs(before.sunIntensity - after.sunIntensity) < 1e-7, "the horizon should not pop");
});

test("native PBR diffuse fill shares terrain ambient and restores only owned SH coefficients", () => {
    const { scene } = createScene();
    const model = primitive();
    scene.primitives.add(model);
    const controller = new LightingController(scene);
    controller.update({}, true);
    const coefficients = model.imageBasedLighting.sphericalHarmonicCoefficients;
    assert(coefficients[0].z >= controller.state.ambientColor[2]);
    scene.context.uniformState.sunDirectionWC = new Cartesian3(-1, 0, 0);
    controller.updateFrame();
    assert(coefficients[0].z < .02);
    controller.destroy();
    assert.equal(model.imageBasedLighting.sphericalHarmonicCoefficients, undefined);
});

test("changing HDR or depth mode invalidates native shadow derivatives only on transitions", () => {
    const { scene } = createScene();
    const controller = new LightingController(scene);
    controller.update({}, true);
    scene.shadowMap.dirty = false;
    controller.updateFrame();
    assert.equal(scene.shadowMap.dirty, false);
    scene.highDynamicRange = true;
    controller.updateFrame();
    assert.equal(scene.shadowMap.dirty, true);
    scene.shadowMap.dirty = false;
    scene.frameState.useLogDepth = true;
    controller.updateFrame();
    assert.equal(scene.shadowMap.dirty, true);
    controller.destroy();
});

test("leases apply native sunlight, environment lighting and near shadows, then restore host settings", () => {
    const { scene, nativeLight } = createScene();
    const building = primitive(1.5);
    scene.primitives.add(building);
    const controller = new LightingController(scene);
    const originalDraw = scene.context.draw;
    assert.equal(scene.light, nativeLight, "construction alone has no host side effects");
    const originalFactor = building.imageBasedLighting.imageBasedLightingFactor;
    controller.update({}, true);
    assert(scene.light instanceof SunLight);
    assert.equal(scene.atmosphere.dynamicLighting, DynamicAtmosphereLightingType.SUNLIGHT);
    assert.equal(scene.globe.enableLighting, true);
    assert.equal(scene.shadowMap.enabled, true);
    assert.equal(scene.shadowMap.maximumDistance, 1500);
    assert.equal(scene.shadowMap.size, 1024);
    assert.equal(scene.shadowMap.softShadows, true);
    assert(Math.abs(building.environmentMapManager.brightness - 1.8) < 1e-12);
    assert.equal(building.imageBasedLighting.imageBasedLightingFactor, originalFactor);
    assert.equal(building.environmentMapManager.maximumSecondsDifference, 300);
    assert.equal(building.shadows, ShadowMode.ENABLED);
    assert.equal(scene.primitives.primitiveAdded.numberOfListeners, 1);
    controller.update({}, false);
    assert.equal(scene.light, nativeLight);
    assert.equal(scene.atmosphere.dynamicLighting, DynamicAtmosphereLightingType.NONE);
    assert.equal(scene.globe.enableLighting, false);
    assert.equal(scene.globe.lightingFadeOutDistance, 10000000);
    assert.equal(scene.shadowMap.enabled, false);
    assert.equal(scene.shadowMap.maximumDistance, 5000);
    assert.equal(scene.shadowMap.size, 2048);
    assert.equal(building.environmentMapManager.brightness, 1.5);
    assert.equal(building.environmentMapManager.enabled, false);
    assert.equal(building.environmentMapManager.maximumSecondsDifference, 3600);
    assert.equal(building.shadows, ShadowMode.RECEIVE_ONLY);
    assert.equal(scene.primitives.primitiveAdded.numberOfListeners, 0);
    assert.equal(scene.preRender.numberOfListeners, 0);
    assert.equal(scene.context.draw, originalDraw);
    controller.destroy();
});

test("late and nested tilesets are managed, removed primitives are restored, and updates never compound brightness", () => {
    const { scene } = createScene();
    const nested = scene.primitives.add(new PrimitiveCollection({ destroyPrimitives: false }));
    const controller = new LightingController(scene);
    controller.update({}, true);
    const building = nested.add(primitive(2));
    assert.equal(building.environmentMapManager.brightness, 2.4);
    controller.update({ ambientIntensity: 1.5, shadows: { enabled: false } });
    assert.equal(building.environmentMapManager.brightness, 3);
    assert.equal(building.shadows, ShadowMode.DISABLED);
    controller.update({ ambientIntensity: 1.5 });
    assert.equal(building.environmentMapManager.brightness, 3);
    nested.remove(building);
    assert.equal(building.environmentMapManager.brightness, 2);
    assert.equal(building.shadows, ShadowMode.RECEIVE_ONLY);
    const later = nested.add(primitive());
    scene.primitives.remove(nested);
    assert.equal(later.environmentMapManager.brightness, 1);
    assert.equal(nested.primitiveAdded.numberOfListeners, 0);
    controller.destroy();
});

test("sun changes update owned light and shared splat response, while external host replacements survive disable", () => {
    const { scene } = createScene();
    const controller = new LightingController(scene);
    controller.update({ sunIntensity: 3 }, true);
    const ownedLight = scene.light;
    assert.equal(ownedLight.intensity, 3);
    scene.context.uniformState.sunDirectionWC = new Cartesian3(-1, 0, 0);
    controller.updateFrame();
    assert.equal(ownedLight.intensity, 0);
    assert.equal(controller.daylightFactor, .035);
    const external = { replacement: true };
    scene.light = external;
    controller.update({}, false);
    assert.equal(scene.light, external);
    controller.destroy();
    controller.destroy();
});

test("terrain shader keeps native clipping and shadow code and provides independent ambient without low-altitude fade", () => {
    const { scene } = createScene();
    let programs = 0;
    const cache = new WeakMap();
    scene.context.shaderCache = {
        getDerivedShaderProgram(base) { return cache.get(base); },
        createDerivedShaderProgram(base, key, options) {
            const result = { ...options, id: ++programs };
            cache.set(base, result); return result;
        },
    };
    const nativeSource = `
        uniform sampler2D nativeImagery;
        void nativeMain() {
            if (someNativeClippingCondition) discard;
            vec4 color = texture(nativeImagery, uv);
            #ifdef ENABLE_VERTEX_LIGHTING
                float diffuseIntensity = clamp(nativeDiffuse, 0.0, 1.0);
                vec4 finalColor = vec4(color.rgb * czm_lightColor * diffuseIntensity, color.a);
            #elif defined(ENABLE_DAYNIGHT_SHADING)
                float diffuseIntensity = clamp(nativeDiffuse * 5.0 + .3, 0.0, 1.0);
                diffuseIntensity = mix(1.0, diffuseIntensity, fade);
                vec4 finalColor = vec4(color.rgb * czm_lightColor * diffuseIntensity, color.a);
            #else
                vec4 finalColor = color;
            #endif
            out_FragColor = finalColor;
        }
        void main() { nativeMain(); applyNativeReceiveShadow(); }
    `;
    const native = { fragmentShaderSource: new ShaderSource({ sources: [nativeSource], defines: ["HDR", "ENABLE_DAYNIGHT_SHADING"] }),
        vertexShaderSource: { nativeVertex: true }, _attributeLocations: { native: 0 } };
    const controller = new LightingController(scene);
    assert.equal(controller.adaptTerrainDraw({ pass: Pass.GLOBE }, native, {}), undefined);
    controller.update({ irradianceScale: 1.3 }, true);
    const uniforms = { nativeImagery: () => "original imagery" };
    const adapted = controller.adaptTerrainDraw({ pass: Pass.GLOBE }, native, uniforms);
    const shader = adapted.shaderProgram.fragmentShaderSource.sources.join("\n");
    assert.match(shader, /someNativeClippingCondition/);
    assert.match(shader, /applyNativeReceiveShadow/);
    assert.match(shader, /bsTerrainDirect \+ bsTerrainAmbientColor/);
    assert.match(shader, /czm_lightColorHdr/);
    assert.match(shader, /normalize\(normalEC\)/);
    assert.match(shader, /normalize\(v_normalEC\)/);
    assert.doesNotMatch(shader, /mix\(1.0, diffuseIntensity, fade\)/);
    assert.equal(adapted.shaderProgram.vertexShaderSource, native.vertexShaderSource);
    assert.equal(adapted.uniformMap.nativeImagery(), "original imagery");
    assert.equal(adapted.uniformMap.bsTerrainGain(), 1.3);
    assert(adapted.uniformMap.bsTerrainAmbientColor() instanceof Cartesian3);
    assert.equal(native.fragmentShaderSource.sources[0], nativeSource, "the native program is never changed");
    assert.equal(controller.adaptTerrainDraw({ pass: Pass.CESIUM_3D_TILE }, native, uniforms), undefined);
    controller.adaptTerrainDraw({ pass: Pass.GLOBE }, native, uniforms);
    assert.equal(programs, 1, "the native shader owns one reusable derivative");
    controller.destroy();
});

test("night glow is confined to sky radiance and default atmosphere composition does not re-light scene colors", async () => {
    const source = await readFile(new URL("../Library/shaders/geospatial/AerialPerspectiveEffect.frag.glsl", import.meta.url), "utf8");
    const start = source.indexOf("vec3 GetSunAndSkyIrradiance(\n  const sampler2D");
    const end = source.indexOf("vec3 GetSolarRadiance()", start);
    assert(!source.slice(start, end).includes("u_customDarkParam"));
    const defaults = await readFile(new URL("../Library/shaders/postprocess/geospatialPipelineDefaults.glsl", import.meta.url), "utf8");
    assert(!defaults.includes("#define SUN_IRRADIANCE"));
    assert(!defaults.includes("#define SKY_IRRADIANCE"));
});
