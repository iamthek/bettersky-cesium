import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as Cesium from "cesium";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createHarness({ failFramebufferAt } = {}) {
    const captures = [];
    const combined = [];
    const textures = new Set();
    const framebuffers = new Set();
    let callbacks;
    let framebufferAttempts = 0;
    let observers = 0;
    let destroyedObservers = 0;
    let destroyedShaders = 0;
    let clears = 0;
    class Texture {
        constructor(options) { Object.assign(this, options); textures.add(this); }
        destroy() { assert(textures.delete(this)); }
    }
    class Framebuffer {
        constructor(options) {
            if (++framebufferAttempts === failFramebufferAt) throw new Error("injected framebuffer failure");
            Object.assign(this, options);
            framebuffers.add(this);
        }
        destroy() { assert(framebuffers.delete(this)); }
    }
    class ClearCommand {
        constructor(options) { Object.assign(this, options); }
        execute() { clears++; }
    }
    const sandbox = vm.createContext({ console });
    const replacements = {
        cesium: { ...Cesium, Texture, Framebuffer, ClearCommand,
            PassState: class { constructor(context) { this.context = context; } },
            RenderState: { fromCache: value => value },
            ShaderSource: class { constructor(options) { Object.assign(this, options); } },
        },
        "Library/internal/CesiumAdapter.js": {
            installSceneDrawObserver(scene, listener) {
                callbacks = listener;
                observers++;
                return { suspend: run => run(), destroy() { destroyedObservers++; } };
            },
            resolveSceneDepthTexture(scene, framebuffer) { return framebuffer.depthStencilTexture; },
        },
        "Library/shaders/geospatial/sceneDepth.glsl?raw": {
            default: await readFile(path.join(root, "Library/shaders/geospatial/sceneDepth.glsl"), "utf8"),
        },
        "Library/shaders/geospatial/depthReconstruction.glsl?raw": {
            default: await readFile(path.join(root, "Library/shaders/geospatial/depthReconstruction.glsl"), "utf8"),
        },
    };
    const modules = new Map();
    async function load(name) {
        if (modules.has(name)) return modules.get(name);
        const values = replacements[name];
        const module = values
            ? new vm.SyntheticModule(Object.keys(values), function () {
                for (const [key, value] of Object.entries(values)) this.setExport(key, value);
            }, { context: sandbox, identifier: name })
            : new vm.SourceTextModule(await readFile(path.join(root, name), "utf8"), { context: sandbox, identifier: name });
        modules.set(name, module);
        return module;
    }
    const entry = await load("Library/internal/SceneDepth.js");
    await entry.link((specifier, parent) => load(specifier.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)) : specifier));
    await entry.evaluate();
    const defaultTexture = { name: "host-default" };
    const context = {
        defaultTexture,
        uniformState: { inverseProjection: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
            currentFrustum: new Cesium.Cartesian2(1, 1000) },
        createViewportQuadCommand(shader, options) {
            return {
                shaderProgram: { destroy() { destroyedShaders++; } },
                execute() {
                    const uniforms = options.uniformMap;
                    if (!uniforms.sourceDepth) {
                        combined.push({ scene: uniforms.sceneDistance(), terrain: uniforms.terrainDistance(),
                            model: uniforms.modelDistance(), coverage: uniforms.modelCoverage(),
                            modelAvailable: uniforms.modelAvailable() });
                        return;
                    }
                    captures.push({ packed: uniforms.packedDepth(), log: uniforms.logarithmicDepth(),
                        source: uniforms.sourceDepth(),
                        inverseProjection: Cesium.Matrix4.clone(uniforms.sourceInverseProjection()),
                        near: uniforms.sourceFrustum().x, far: uniforms.sourceFrustum().y });
                },
            };
        },
    };
    const scene = { context, drawingBufferWidth: 8, drawingBufferHeight: 4,
        globe: { depthTestAgainstTerrain: false, terrainProvider: {} } };
    const depth = new entry.namespace.default(scene);
    return { depth, scene, context, captures, combined, textures, framebuffers, defaultTexture,
        get callbacks() { return callbacks; },
        get observers() { return observers; }, get destroyedObservers() { return destroyedObservers; },
        get destroyedShaders() { return destroyedShaders; }, get clears() { return clears; },
    };
}

test("depth capture preserves packed terrain before later native-depth updates and owns its attachments", async () => {
    const h = await createHarness();
    assert.equal(h.observers, 0);
    assert.equal(h.textures.size, 0);
    h.depth.beginFrame(true);
    const packed = { name: "packed-terrain" };
    h.context.uniformState.globeDepthTexture = packed;
    h.callbacks.onGlobeDepthCopy({}, h.context, {});
    assert.equal(h.captures.length, 1);
    assert.equal(h.captures[0].source, packed);
    assert.equal(h.captures[0].packed, true);
    assert.equal(h.captures[0].log, true);
    assert.equal(h.depth.uniformMap.u_betterSkyTerrainDistanceAvailable(), true);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), false);
    h.context.uniformState.globeDepthTexture = { name: "terrain-plus-model" };
    assert.equal(h.captures[0].source, packed);
    assert.equal(h.textures.size, 5);
    assert.equal(h.depth.byteLength, 8 * 4 * 32);
    h.depth.destroy();
    h.depth.destroy();
    assert.equal(h.textures.size, 0);
    assert.equal(h.framebuffers.size, 0);
    assert.equal(h.destroyedObservers, 1);
    assert.equal(h.destroyedShaders, 2);
});

test("old frustum depth is decoded with saved projection before a new frustum clears it", async () => {
    const h = await createHarness();
    h.depth.beginFrame(false);
    const source = { name: "native-depth" };
    const framebuffer = { depthStencilTexture: source };
    const passState = { framebuffer };
    const farProjection = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(2, 3, 4));
    h.context.uniformState.inverseProjection = farProjection;
    h.context.uniformState.currentFrustum = new Cesium.Cartesian2(1000, 1e6);
    h.callbacks.onDraw({ pass: Cesium.Pass.CESIUM_3D_TILE, renderState: { depthMask: true } }, h.context, passState);
    h.context.uniformState.inverseProjection = Cesium.Matrix4.IDENTITY;
    h.context.uniformState.currentFrustum = new Cesium.Cartesian2(1, 1000);
    h.callbacks.beforeClear({ depth: 1 }, h.context, passState);
    assert.equal(h.captures.length, 1);
    assert.equal(h.captures[0].source, source);
    assert.equal(h.captures[0].packed, false);
    assert.equal(h.captures[0].log, false);
    assert.equal(h.captures[0].near, 1000);
    assert.equal(h.captures[0].far, 1e6);
    assert(Cesium.Matrix4.equals(h.captures[0].inverseProjection, farProjection));
    h.callbacks.onDraw({ pass: Cesium.Pass.OPAQUE, renderState: { depthMask: true } }, h.context, passState);
    h.callbacks.beforePostProcess(h.context, {}, source);
    assert.equal(h.captures[1].near, 1);
    assert.equal(h.captures[1].far, 1000);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), true);
    // Auxiliary/post-process work after final capture cannot contaminate this frame.
    h.callbacks.beforeClear({ depth: 1 }, h.context, passState);
    assert.equal(h.captures.length, 2);
    h.depth.destroy();
});

test("history invalidates on depth-mode, terrain, background-policy and size changes without reallocating unchanged frames", async () => {
    const h = await createHarness();
    h.depth.beginFrame(true);
    h.callbacks.beforePostProcess(h.context, {}, {});
    const allocated = [...h.textures];
    const generation = h.depth.generation;
    h.depth.beginFrame(true);
    assert.equal(h.depth.generation, generation);
    assert.deepEqual([...h.textures], allocated);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), false);
    assert.equal(h.depth.uniformMap.u_betterSkyTerrainDistanceAvailable(), false);
    h.depth.backgroundOnly = true;
    assert.equal(h.depth.generation, generation + 1);
    assert.equal(h.depth.uniformMap.u_betterSkyBackgroundDepth(), true);
    h.depth.beginFrame(false);
    assert.equal(h.depth.generation, generation + 2);
    h.scene.globe.depthTestAgainstTerrain = true;
    h.depth.beginFrame(false);
    assert.equal(h.depth.generation, generation + 3);
    h.scene.globe.terrainProvider = {};
    h.depth.beginFrame(false);
    assert.equal(h.depth.generation, generation + 4);
    h.scene.drawingBufferWidth = 16;
    h.depth.beginFrame(false);
    assert.equal(h.textures.size, 0);
    h.callbacks.beforePostProcess(h.context, {}, {});
    assert.equal(h.depth.byteLength, 16 * 4 * 32);
    h.depth.destroy();
});

test("partial depth-target allocation rolls back and a later frame can retry", async () => {
    const h = await createHarness({ failFramebufferAt: 3 });
    h.depth.beginFrame(true);
    assert.throws(() => h.callbacks.beforePostProcess(h.context, {}, {}), /injected framebuffer failure/);
    assert.equal(h.textures.size, 0);
    assert.equal(h.framebuffers.size, 0);
    h.depth.beginFrame(true);
    h.callbacks.beforePostProcess(h.context, {}, {});
    assert.equal(h.textures.size, 5);
    h.depth.destroy();
    assert.equal(h.framebuffers.size, 0);
});

test("model proxy uniforms track texture replacement without owning native model resources", async () => {
    const h = await createHarness();
    assert.equal(h.depth.uniformMap.u_betterSkyModelDepthAvailable(), false);
    assert.equal(h.depth.uniformMap.u_betterSkyDepth(), h.defaultTexture);
    const first = { name: "first-proxy" };
    const model = { depthTexture: first, coverageTexture: { name: "coverage" } };
    h.depth.modelColorPass = model;
    assert.equal(h.depth.uniformMap.u_betterSkyModelDepthAvailable(), true);
    h.depth.beginFrame(true);
    h.callbacks.beforePostProcess(h.context, {}, {});
    assert.equal(h.combined[0].model, first);
    assert.equal(h.combined[0].coverage, model.coverageTexture);
    assert.equal(h.combined[0].modelAvailable, true);
    assert.equal(h.depth.uniformMap.u_betterSkyDepth(), h.depth.texture);
    model.depthTexture = { name: "LOD-rebuilt-proxy" };
    h.depth.beginFrame(true);
    h.callbacks.beforePostProcess(h.context, {}, {});
    assert.equal(h.combined[1].model, model.depthTexture);
    h.depth.destroy();
});

test("invalid frustum metadata is not published and a later valid frame recovers", async () => {
    const h = await createHarness();
    for (const frustum of [[NaN, 1000], [1, Infinity], [1000, 1], [-1, 1000]]) {
        h.depth.beginFrame(true);
        h.context.uniformState.currentFrustum = new Cesium.Cartesian2(...frustum);
        h.callbacks.onDraw({ pass: Cesium.Pass.OPAQUE, renderState: { depthMask: true } }, h.context,
            { framebuffer: {} });
        h.callbacks.beforePostProcess(h.context, {}, {});
        assert.equal(h.captures.length, 0);
        assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), false);
    }
    h.depth.beginFrame(true);
    h.context.uniformState.currentFrustum = new Cesium.Cartesian2(0.1, 8667758.4);
    const projection = new Cesium.PerspectiveFrustum({ fov: Math.PI / 3, aspectRatio: 16 / 9,
        near: 0.1, far: 8667758.4 }).projectionMatrix;
    h.context.uniformState.inverseProjection = Cesium.Matrix4.inverse(projection, new Cesium.Matrix4());
    h.callbacks.onDraw({ pass: Cesium.Pass.OPAQUE, renderState: { depthMask: true } }, h.context,
        { framebuffer: {} });
    h.callbacks.beforePostProcess(h.context, {}, {});
    assert.equal(h.captures.length, 1);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), true);
    h.depth.beginFrame(true);
    h.context.uniformState.inverseProjection[11] = Infinity;
    h.callbacks.onDraw({ pass: Cesium.Pass.OPAQUE, renderState: { depthMask: true } }, h.context,
        { framebuffer: {} });
    h.callbacks.beforePostProcess(h.context, {}, {});
    assert.equal(h.captures.length, 1);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), false);
    h.depth.destroy();
});

test("empty sky frames never decode a stale native depth attachment", async () => {
    const h = await createHarness();
    h.depth.beginFrame(true);
    h.callbacks.beforePostProcess(h.context, {}, { name: "old-frustum-depth" });
    assert.equal(h.captures.length, 0);
    assert.equal(h.depth.uniformMap.u_betterSkyDepthAvailable(), true);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), false);
    assert.equal(h.depth.uniformMap.u_betterSkyTerrainDistanceAvailable(), false);
    h.depth.beginFrame(true);
    h.context.uniformState.globeDepthTexture = { name: "current-terrain" };
    h.callbacks.onGlobeDepthCopy({}, h.context, {});
    h.callbacks.beforePostProcess(h.context, {}, { name: "stale-scene" });
    assert.equal(h.captures.length, 1);
    assert.equal(h.depth.uniformMap.u_betterSkyTerrainDistanceAvailable(), true);
    assert.equal(h.depth.uniformMap.u_betterSkySceneDistanceAvailable(), false);
    h.depth.destroy();
});
