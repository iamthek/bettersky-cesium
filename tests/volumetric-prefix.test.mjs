import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as Cesium from "cesium";

const fragment = await readFile(new URL("../Library/shaders/geospatial/volumetricLight.frag.glsl", import.meta.url), "utf8");
const composite = await readFile(new URL("../Library/shaders/geospatial/volumetricLightComposite.glsl", import.meta.url), "utf8");

function functionBody(source, name) {
    const start = source.indexOf("{", source.indexOf(name + "("));
    let depth = 1, end = start + 1;
    for (; depth; end++) {
        if (source[end] === "{") depth++;
        else if (source[end] === "}") depth--;
    }
    return source.slice(start + 1, end - 1);
}

// Evaluate the real shader's scalar RGB-channel equations. Integration and
// cloud ordering are compared against independent Beer-law closed forms.
const accumulate = new Function("integral", "extinction", "lengthInStep", "incidentLight", "exp", "max",
    functionBody(fragment, "accumulateFog").replace(/float (\w+)/g, "let $1")
        .replace(/integral\.rgb/g, "integral[0]").replace(/integral\.a/g, "integral[1]") + ";return integral;");
const prefixAfter = new Function("prefix", "before", "max", "clamp", "vec3", "vec4",
    functionBody(composite, "volumetricLightPrefixAfter")
        .replace(/prefix\.rgb/g, "prefix[0]").replace(/before\.rgb/g, "before[0]")
        .replace(/prefix\.a/g, "prefix[1]").replace(/before\.a/g, "before[1]"));
// Test optical ordering in native radiance units; the display-unit calibration
// is shared by the opaque and Gaussian paths outside this scalar fixture.
const cloudReturn = composite.slice(composite.lastIndexOf("return before.rgb"), composite.lastIndexOf("}"))
    .replaceAll("BS_ATMOSPHERE_RADIANCE_SCALE", "1.0");
const combine = new Function("before", "after", "frontCloud", "baseAtmosphere",
    cloudReturn.replace(/\.rgb/g, "[0]").replace(/\.a/g, "[1]"));
const after = (prefix, before) => prefixAfter(prefix, before, Math.max,
    (x, low, high) => Math.max(low, Math.min(high, x)), x => x, (...x) => x);

test("Gaussian fog stops at its endpoint, including a partial sample cell and shell gaps", () => {
    const extinction = 0.1, source = 3;
    const integrate = modelDistance => {
        const integral = [0, 1];
        for (const [start, end] of [[0, 5], [10, 20]]) {
            const length = Math.max(Math.min(end, modelDistance) - start, 0);
            accumulate(integral, extinction, length, source, Math.exp, Math.max);
        }
        return integral;
    };
    for (const [distance, opticalLength] of [[0, 0], [2, 2], [8, 5], [12, 7], [30, 15]]) {
        const [scatter, transmission] = integrate(distance);
        assert(Math.abs(transmission - Math.exp(-extinction * opticalLength)) < 1e-12);
        assert(Math.abs(scatter - source * (1 - transmission)) < 1e-12);
    }
    assert(integrate(2)[1] > integrate(30)[1], "a nearby model must not use the full opaque-path attenuation");
});

test("prefix fog splits around a front cloud without including back-of-model medium or duplicating cloud opacity", () => {
    const extinction = 0.15, incident = 2, base = 0.7, cloudRadiance = 0.8, cloudOpacity = 0.6;
    const beforeLength = 3, modelDistance = 8;
    const beforeT = Math.exp(-extinction * beforeLength);
    const prefixT = Math.exp(-extinction * modelDistance);
    const before = [incident * (1 - beforeT), beforeT];
    const prefix = [incident * (1 - prefixT), prefixT];
    const back = after(prefix, before);
    const backT = Math.exp(-extinction * (modelDistance - beforeLength));
    assert(Math.abs(back[1] - backT) < 1e-12);
    assert(Math.abs(back[0] - incident * (1 - backT)) < 1e-12);
    const result = combine(before, back, [cloudRadiance * cloudOpacity, cloudOpacity], base);
    const expected = incident * (1 - beforeT) + beforeT * (cloudRadiance * cloudOpacity
        + (1 - cloudOpacity) * (incident * (1 - backT) + backT * base));
    assert(Math.abs(result - expected) < 1e-12);
    assert(Math.abs(combine(before, back, [0, 0], base) - (prefix[0] + prefix[1] * base)) < 1e-12);
    assert(Math.abs(combine(before, back, [cloudRadiance, 1], base) - (before[0] + before[1] * cloudRadiance)) < 1e-12);
    assert.equal(combine([0, 1], [0, 1], [0, 0], base), base);
});

async function createHarness({ failTextureAt, failCommandAt } = {}) {
    const textures = new Set(), framebuffers = new Set(), programs = new Set();
    let textureCount = 0, commandCount = 0;
    class Texture {
        constructor(options) {
            if (++textureCount === failTextureAt) throw new Error("texture failed");
            Object.assign(this, options);textures.add(this);
        }
        destroy() { assert(textures.delete(this)); }
    }
    class Framebuffer {
        constructor(options) { Object.assign(this, options);framebuffers.add(this); }
        destroy() { assert(framebuffers.delete(this)); }
    }
    const context = {
        defaultTexture: {},
        createViewportQuadCommand(shader, options) {
            if (++commandCount === failCommandAt) throw new Error("command failed");
            const shaderProgram = { destroy() { assert(programs.delete(this)); } };
            programs.add(shaderProgram);
            return { shader, options, shaderProgram };
        },
    };
    const scene = { context, camera: {}, drawingBufferWidth: 1920, drawingBufferHeight: 1080 };
    const pipeline = { _frame: 1, sceneDepth: { uniformMap: {} }, cloudMaterialPass: {}, _useLogDepth: true };
    const shadowPass = { uniformMap: {}, ready: true };
    const sandbox = vm.createContext({});
    const module = new vm.SourceTextModule(await readFile(new URL("../Library/geospatial/VolumetricLightPass.js", import.meta.url), "utf8"), { context: sandbox });
    await module.link(async name => {
        const values = name === "cesium" ? { ...Cesium, Texture, Framebuffer, RenderState: { fromCache: value => structuredClone(value) } }
            : name.endsWith("SceneDepth.js") ? { withSceneDepth: shader => shader }
            : name.endsWith("FocusedCloudShadowPass.js") ? { volumetricLightSunlightGLSL: "" }
            : name.endsWith("?raw") ? { default: await readFile(new URL("../Library/geospatial/" + name.slice(0, -4), import.meta.url), "utf8") }
            : undefined;
        assert(values, name);
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context: sandbox });
    });
    await module.evaluate();
    return { Pass: module.namespace.default, context, scene, pipeline, shadowPass, textures, framebuffers, programs };
}

test("prefix uses the fourth low-resolution MRT, is frame-scoped, and releases independently of opaque history", async () => {
    const h = await createHarness();
    const pass = new h.Pass(h.scene, { pipeline: h.pipeline, shadowPass: h.shadowPass });
    pass.setOptions({ mode: "volumetric", quality: "balanced" });
    pass._ensureResources(h.context);
    assert.equal(h.framebuffers.size, 3);
    assert.equal(h.textures.size, 10, "current-only Gaussian prefix has no redundant history attachments");
    for (const framebuffer of [pass._current.passState.framebuffer]) {
        assert.equal(framebuffer.colorTextures.length, 4);
        const prefix = framebuffer.colorTextures[3];
        assert.equal(prefix.width, 960);assert.equal(prefix.height, 540);
        assert.equal(prefix.pixelDatatype, Cesium.PixelDatatype.HALF_FLOAT);
    }
    for (const target of pass._history) assert.equal(target.passState.framebuffer.colorTextures.length, 3);
    assert.equal(pass.byteLength, 960 * 540 * (40 + 32 * 2));
    assert.equal(pass.modelPrefixTexture, undefined);
    pass._rendered = true;pass._renderedFrame = h.pipeline._frame;
    assert.equal(pass.modelPrefixTexture, pass._current.modelPrefix);
    h.pipeline._frame++;
    assert.equal(pass.modelPrefixTexture, undefined, "a skipped frame cannot reuse a previous foreground integral");
    pass.invalidateHistory();
    assert.equal(pass.uniformMap.u_volumetricLightModelPrefixAvailable(), false);
    pass.destroy();
    assert.equal(h.textures.size, 0);assert.equal(h.framebuffers.size, 0);assert.equal(h.programs.size, 0);
});

for (const failure of [{ failTextureAt: 4 }, { failTextureAt: 10 }, { failCommandAt: 2 }]) {
    test(`partial foreground fog resource creation rolls back atomically: ${JSON.stringify(failure)}`, async () => {
        const h = await createHarness(failure);
        const pass = new h.Pass(h.scene, { pipeline: h.pipeline, shadowPass: h.shadowPass });
        pass.setOptions({ mode: "volumetric" });
        assert.throws(() => pass._ensureResources(h.context), /failed/);
        assert.equal(h.textures.size, 0);assert.equal(h.framebuffers.size, 0);assert.equal(h.programs.size, 0);
        assert.equal(pass.byteLength, 0);
        pass.destroy();
    });
}
