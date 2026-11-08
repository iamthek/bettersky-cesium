import {
    Cartesian3, DynamicAtmosphereLightingType, Pass, ShadowMode, SunLight,
} from "cesium";
import SceneStateLease from "./SceneStateLease.js";
import { getAuxiliaryShaderProgram, installSceneDrawObserver } from "./CesiumAdapter.js";

const DEFAULTS = Object.freeze({
    sunIntensity: 2,
    ambientIntensity: 1.2,
    irradianceScale: 1,
    shadows: Object.freeze({ enabled: true, maximumDistance: 1500, size: 1024, softShadows: true }),
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function smoothstep(low, high, value) {
    const x = clamp((value - low) / (high - low), 0, 1);
    return x * x * (3 - 2 * x);
}

/** A shared, smoothly varying light state. Elevation is in radians.
 * This uses an analytic relative air-mass approximation, avoiding synchronous
 * GPU LUT readback every frame. It is not a surface re-lighting model for splats.
 */
export function computeLightingState(elevation, options = DEFAULTS) {
    const sine = Math.sin(elevation);
    const daylight = smoothstep(-0.10, 0.25, sine);
    const sky = 0.03 + 0.97 * smoothstep(-0.12, 0.12, sine);
    const zenithDegrees = 90 - Math.max(0, elevation * 180 / Math.PI);
    const airMass = 1 / Math.max(0.025, Math.cos(zenithDegrees * Math.PI / 180) +
        0.50572 * Math.pow(96.07995 - zenithDegrees, -1.6364));
    const relativeMass = Math.max(0, airMass - 1);
    const redTransmission = Math.exp(-0.04 * relativeMass);
    const visibility = smoothstep(-0.015, 0.055, sine);
    const sunIntensity = (options.sunIntensity ?? DEFAULTS.sunIntensity) * redTransmission * visibility;
    const ambient = (options.ambientIntensity ?? DEFAULTS.ambientIntensity) * 0.20 * sky;
    return {
        sunElevation: elevation,
        daylightFactor: 0.035 + 0.965 * daylight,
        sunIntensity,
        sunColor: [1, Math.exp(-0.04 * relativeMass), Math.exp(-0.14 * relativeMass)],
        ambientColor: [ambient * 0.82, ambient * 0.90, ambient],
    };
}

// Replace only the native terrain lighting calculation. All imagery, clipping,
// transparency, native receive-shadow wrappers and log-depth handling remain native.
const terrainLightingBlock = /#ifdef ENABLE_VERTEX_LIGHTING\s+float diffuseIntensity = [\s\S]*?#else\s+vec4 finalColor = color;\s+#endif/;
const terrainLighting = `
#if defined(ENABLE_VERTEX_LIGHTING) || defined(ENABLE_DAYNIGHT_SHADING)
    #ifdef ENABLE_VERTEX_LIGHTING
        vec3 bsTerrainNormal = normalize(v_normalEC);
    #else
        // Cesium already supplies an ellipsoid normal when vertex normals are absent.
        vec3 bsTerrainNormal = normalize(normalEC);
    #endif
    #ifdef HDR
        vec3 bsTerrainAlbedo = color.rgb;
    #else
        vec3 bsTerrainAlbedo = czm_srgbToLinear(color.rgb);
    #endif
    float bsTerrainDiffuse = max(dot(normalize(czm_lightDirectionEC), bsTerrainNormal), 0.0);
    // The native SunLight default intensity is 2. A factor of 0.5 makes the
    // noon diffuse multiplier approximately one while preserving its HDR range.
    vec3 bsTerrainDirect = czm_lightColorHdr * (0.5 * bsTerrainDiffuse);
    vec3 bsTerrainRadiance = bsTerrainAlbedo * (bsTerrainDirect + bsTerrainAmbientColor) * bsTerrainGain;
    #ifndef HDR
        bsTerrainRadiance = czm_linearToSrgb(czm_pbrNeutralTonemapping(bsTerrainRadiance));
    #endif
    vec4 finalColor = vec4(bsTerrainRadiance, color.a);
#else
    vec4 finalColor = color;
#endif
`;

function alive(object) { return object && !(typeof object.isDestroyed === "function" && object.isDestroyed()); }

/** Owns natural scene light/IBL settings without owning any host GPU resources.
 * Construction is side-effect free; update(options, enabled) acquires/releases
 * the lease so a failed outer BetterSky construction can cleanly roll back.
 */
export default class LightingController {
    constructor(scene, options = {}) {
        this.scene = scene;
        this._options = { ...DEFAULTS, ...options, shadows: { ...DEFAULTS.shadows, ...options.shadows } };
        this._sun = new SunLight();
        this._ambient = new Cartesian3();
        this._surfaceNormal = new Cartesian3();
        this._collections = new Map();
        this._targets = new Map();
        this._terrainShaders = new WeakMap();
        this._terrainUniformMaps = new WeakMap();
        this._enabled = false;
        this._destroyed = false;
        this.state = computeLightingState(Math.PI / 2, this._options);
        this._terrainUniforms = {
            bsTerrainAmbientColor: () => this._ambient,
            bsTerrainGain: () => this._options.irradianceScale,
        };
    }

    get enabled() { return this._enabled; }
    get daylightFactor() { return this.state.daylightFactor; }

    update(options = {}, enabled = this._enabled) {
        if (this._destroyed) return;
        this._options = { ...this._options, ...options,
            shadows: { ...this._options.shadows, ...options.shadows } };
        if (enabled && !this._enabled) this._activate();
        if (!enabled && this._enabled) this._deactivate();
        if (this._enabled) this._applySettings();
        this.updateFrame();
    }

    _write(lease, target, key, value) {
        // Some Cesium setters clear a pending dirty flag even on identical
        // assignments. Only write settings that actually changed.
        if (target && target[key] !== value) lease.write(target, key, value);
    }

    _activate() {
        this._lease = new SceneStateLease({ restore: "if-unchanged" });
        this._enabled = true;
        try {
            this._applySettings();
            this._attach(this.scene.primitives);
            this._observer = installSceneDrawObserver(this.scene, {
                beforeDraw: (command, context, passState, actual) => this.adaptTerrainDraw(
                    command, actual.shaderProgram, actual.uniformMap,
                ),
            });
        } catch (error) {
            this._deactivate();
            throw error;
        }
    }

    _applySettings() {
        const scene = this.scene, lease = this._lease, options = this._options;
        this._write(lease, scene, "light", this._sun);
        this._write(lease, scene.atmosphere, "dynamicLighting", DynamicAtmosphereLightingType.SUNLIGHT);
        this._write(lease, scene.globe, "enableLighting", true);
        this._write(lease, scene.globe, "dynamicAtmosphereLighting", true);
        this._write(lease, scene.globe, "dynamicAtmosphereLightingFromSun", true);
        // The native no-normal path otherwise fades out all day/night shading
        // at ground level. The adapted shader additionally removes its 5x boost.
        this._write(lease, scene.globe, "lightingFadeOutDistance", 0);
        this._write(lease, scene.globe, "lightingFadeInDistance", 1);
        this._write(lease, scene.globe, "lambertDiffuseMultiplier", 0.9);
        this._write(lease, scene.globe, "shadows", ShadowMode.RECEIVE_ONLY);
        const shadows = options.shadows;
        this._write(lease, scene.shadowMap, "enabled", shadows.enabled);
        this._write(lease, scene.shadowMap, "maximumDistance", shadows.maximumDistance);
        this._write(lease, scene.shadowMap, "size", shadows.size);
        this._write(lease, scene.shadowMap, "softShadows", shadows.softShadows);
        for (const entry of this._targets.values()) this._applyTarget(entry);
    }

    _attach(primitive) {
        if (!alive(primitive)) return;
        if (primitive.primitiveAdded && typeof primitive.get === "function") {
            if (this._collections.has(primitive)) return;
            const removeAdded = primitive.primitiveAdded.addEventListener(child => this._attach(child));
            let removeRemoved;
            try { removeRemoved = primitive.primitiveRemoved.addEventListener(child => this._detach(child)); }
            catch (error) { removeAdded(); throw error; }
            this._collections.set(primitive, () => { removeAdded(); removeRemoved(); });
            for (let i = 0; i < primitive.length; ++i) this._attach(primitive.get(i));
            return;
        }
        const manager = primitive.environmentMapManager;
        if (!manager || !primitive.imageBasedLighting || this._targets.has(primitive)) return;
        const entry = { primitive, manager, brightness: manager.brightness ?? 1,
            maximumSecondsDifference: manager.maximumSecondsDifference ?? 3600,
            lease: new SceneStateLease({ restore: "if-unchanged" }) };
        // Match the diffuse sky fill used by terrain. The generated environment
        // keeps directional colour/reflections; only its constant diffuse term
        // receives this shared hemisphere fill. Explicit host SH stays authoritative.
        if (!primitive.imageBasedLighting.sphericalHarmonicCoefficients) {
            entry.coefficients = Array.from({ length: 9 }, () => new Cartesian3());
            entry.lease.write(primitive.imageBasedLighting, "sphericalHarmonicCoefficients", entry.coefficients);
        }
        this._targets.set(primitive, entry);
        this._applyTarget(entry);
    }

    _applyTarget(entry) {
        if (!alive(entry.primitive) || !alive(entry.manager)) return;
        const { primitive, manager, lease } = entry;
        // Keep host-provided IBL factors, SH coefficients and environment maps.
        // Scaling environment brightness avoids violating IBL's [0,1] factors.
        this._write(lease, manager, "brightness", entry.brightness * this._options.ambientIntensity);
        this._write(lease, manager, "enabled", true);
        this._write(lease, manager, "maximumSecondsDifference", Math.min(entry.maximumSecondsDifference, 300));
        this._write(lease, primitive, "shadows", this._options.shadows.enabled ? ShadowMode.ENABLED : ShadowMode.DISABLED);
    }

    _detach(primitive) {
        if (this._collections.has(primitive)) {
            if (alive(primitive)) for (let i = 0; i < primitive.length; ++i) this._detach(primitive.get(i));
            this._collections.get(primitive)();
            this._collections.delete(primitive);
        }
        const entry = this._targets.get(primitive);
        if (!entry) return;
        this._targets.delete(primitive);
        // PrimitiveCollection may raise removal after destroying the primitive.
        if (alive(primitive) && alive(entry.manager)) entry.lease.restore();
    }

    updateFrame() {
        if (this._destroyed) return;
        const scene = this.scene, context = scene.context;
        const renderMode = `${!!scene.highDynamicRange}/${!!(scene.frameState?.useLogDepth ?? scene.logarithmicDepthBuffer)}`;
        if (this._renderMode !== renderMode) {
            this._renderMode = renderMode;
            // Cesium keeps separate HDR/log-depth shadow derivatives. Mark the
            // native shadow state dirty so a mode switch builds receive as well
            // as cast commands before executing the newly selected variant.
            if (this._enabled && scene.shadowMap) scene.shadowMap.dirty = true;
        }
        const position = scene.camera?.positionWC ?? scene.camera?.position;
        const sun = context?.uniformState?.sunDirectionWC;
        let elevation = Math.PI / 2;
        if (position && sun) {
            const ellipsoid = scene.globe?.ellipsoid;
            if (ellipsoid?.geodeticSurfaceNormal) ellipsoid.geodeticSurfaceNormal(position, this._surfaceNormal);
            else Cartesian3.normalize(position, this._surfaceNormal);
            elevation = Math.asin(clamp(Cartesian3.dot(this._surfaceNormal, sun), -1, 1));
        }
        this.state = computeLightingState(elevation, this._options);
        const state = this.state;
        Cartesian3.fromArray(state.ambientColor, 0, this._ambient);
        this._sun.color.red = state.sunColor[0];
        this._sun.color.green = state.sunColor[1];
        this._sun.color.blue = state.sunColor[2];
        this._sun.color.alpha = 1;
        this._sun.intensity = state.sunIntensity;
        if (!this._enabled) return;
        for (const [collection, remove] of this._collections) {
            if (alive(collection)) continue;
            remove(); this._collections.delete(collection);
        }
        for (const [primitive, entry] of this._targets) {
            if (!alive(primitive) || !alive(entry.manager)) this._targets.delete(primitive);
            else if (entry.coefficients) {
                const source = entry.manager.sphericalHarmonicCoefficients;
                // Environment cubes update asynchronously after clock jumps.
                // Fade their diffuse irradiance with the same daylight state as
                // scanned content so a stale daytime cube cannot light the night.
                for (let i = 0; i < 9; ++i) Cartesian3.multiplyByScalar(source?.[i] ?? Cartesian3.ZERO,
                    this.state.daylightFactor, entry.coefficients[i]);
                Cartesian3.add(entry.coefficients[0], this._ambient, entry.coefficients[0]);
            }
        }
    }

    /** Called by the instance draw adapter for the actual native colour shader. */
    adaptTerrainDraw(command, shaderProgram, uniformMap) {
        if (!this._enabled || command.pass !== Pass.GLOBE || !shaderProgram?.fragmentShaderSource) return undefined;
        let shader = this._terrainShaders.get(shaderProgram);
        if (!shader) {
            const sources = shaderProgram.fragmentShaderSource.sources;
            if (!sources.some(source => terrainLightingBlock.test(source))) return undefined;
            shader = getAuxiliaryShaderProgram(this.scene.context, shaderProgram, "bs_natural_terrain", () => {
                const source = shaderProgram.fragmentShaderSource.clone();
                source.sources = source.sources.map(text => text.replace(terrainLightingBlock, terrainLighting));
                source.sources.unshift("uniform vec3 bsTerrainAmbientColor;\nuniform float bsTerrainGain;");
                return source;
            });
            this._terrainShaders.set(shaderProgram, shader);
        }
        let uniforms = uniformMap && this._terrainUniformMaps.get(uniformMap);
        if (!uniforms) {
            uniforms = { ...uniformMap, ...this._terrainUniforms };
            if (uniformMap) this._terrainUniformMaps.set(uniformMap, uniforms);
        }
        return { shaderProgram: shader, uniformMap: uniforms };
    }

    _deactivate() {
        this._enabled = false;
        const errors = [];
        try { this._observer?.destroy(); } catch (error) { errors.push(error); }
        this._observer = undefined;
        for (const remove of this._collections.values()) {
            try { remove(); } catch (error) { errors.push(error); }
        }
        this._collections.clear();
        for (const entry of this._targets.values()) {
            if (!alive(entry.primitive) || !alive(entry.manager)) continue;
            try { entry.lease.restore(); } catch (error) { errors.push(error); }
        }
        this._targets.clear();
        try { if (alive(this.scene)) this._lease?.restore(); } catch (error) { errors.push(error); }
        this._lease = undefined;
        if (errors.length) throw new AggregateError(errors, "[BetterSky] Failed to restore natural lighting settings.");
    }

    isDestroyed() { return this._destroyed; }
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._deactivate();
    }
}
