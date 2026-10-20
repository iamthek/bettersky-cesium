import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as Cesium from "cesium";
import * as Three from "three";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Execute the real pass classes with counted GPU handles and controllable asset loads.
async function createHarness({ realPrecomputed = false, failTextureAt, failFramebufferAt, failCommandAt } = {}) {
    const liveTextures = new Set();
    const liveFramebuffers = new Set();
    const requests = [];
    const precomputedRequests = [];
    const errors = [];
    let allocations = 0;
    let shaderReferences = 0;
    let textureAttempts = 0;
    let framebufferAttempts = 0;
    let commandAttempts = 0;
    const context = vm.createContext({ console: { error: error => errors.push(error), log() {} } });

    class Texture {
        constructor(options = {}) {
            if (++textureAttempts === failTextureAt) throw new Error("injected texture allocation failure");
            this.options = options;
            this.destroyed = false;
            allocations++;
            liveTextures.add(this);
        }
        generateMipmap() {}
        isDestroyed() { return this.destroyed; }
        destroy() {
            assert.equal(this.destroyed, false, "texture must only be destroyed once");
            this.destroyed = true;
            liveTextures.delete(this);
        }
    }
    class Texture3D extends Texture {
        constructor(options) {
            // Match Texture3D's top-level dimensions rather than inferring them from source.
            assert.ok(Number.isInteger(options.width) && options.width > 0);
            assert.ok(Number.isInteger(options.height) && options.height > 0);
            assert.ok(Number.isInteger(options.depth) && options.depth > 0);
            super(options);
            this.width = options.width;
            this.height = options.height;
            this.depth = options.depth;
            this.dimensions = { x: this.width, y: this.height, z: this.depth };
        }
    }
    class Framebuffer {
        constructor(options) {
            if (++framebufferAttempts === failFramebufferAt) throw new Error("injected framebuffer allocation failure");
            this.options = options;
            this.destroyed = false;
            liveFramebuffers.add(this);
        }
        destroy() {
            assert.equal(this.destroyed, false, "framebuffer must only be destroyed once");
            this.destroyed = true;
            liveFramebuffers.delete(this);
            if (this.options.destroyAttachments !== false) {
                for (const texture of this.options.colorTextures) texture.destroy();
            }
        }
    }
    class RenderPass {
        constructor(options) { Object.assign(this, options); }
        execute() {}
        isDestroyed() { return this.destroyed ?? false; }
        destroy() {
            assert.equal(this.destroyed, undefined, "stage must only be destroyed once");
            this.destroyed = true;
        }
    }
    function pendingRequest(url) {
        return new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
    }
    class PrecomputedTexturesLoader {
        load(url, resolve, onProgress, reject) { precomputedRequests.push({ url, resolve, reject }); }
    }
    const replacements = {
        cesium: {
            ...Cesium,
            Texture,
            Framebuffer,
            RenderState: class {
                constructor(options) { Object.assign(this, options); }
                static fromCache(options) { return options; }
            },
            Resource: { createIfNeeded: url => ({ fetchImage: () => pendingRequest(url) }) },
            buildModuleUrl: value => value,
        },
        three: Three,
        "Library/Texture3D.js": { default: Texture3D },
        "Library/PostProcessStage.js": { default: RenderPass, viewportTriangleVertexShaderText: "" },
        "Library/geospatial/PrecomputedTexturesLoader.js": { default: PrecomputedTexturesLoader },
        "Library/geospatial/PrecomputedDataLoader.js": {
            createData3DTextureLoaderClass: () => class { loadAsync(url) { return pendingRequest(url); } },
            createData3DTextureLoader: () => assert.fail("binary precomputed loader is outside this EXR test"),
            createDataTextureLoader: () => assert.fail("binary precomputed loader is outside this EXR test"),
        },
    };
    if (realPrecomputed) {
        delete replacements["Library/geospatial/PrecomputedTexturesLoader.js"];
        replacements["Library/geospatial/EXRLoader.js"] = {
            EXRLoader: class {
                setRequestHeader() {}
                setPath() {}
                setWithCredentials() {}
                load(url, resolve, onProgress, reject) { precomputedRequests.push({ resolve, reject }); }
            },
        };
    }
    const modules = new Map();
    function synthetic(key, values) {
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [name, value] of Object.entries(values)) this.setExport(name, value);
        }, { context, identifier: key });
    }
    async function load(key) {
        if (modules.has(key)) return modules.get(key);
        let module;
        if (replacements[key]) module = synthetic(key, replacements[key]);
        else if (key.endsWith("?raw")) module = synthetic(key, { default: await readFile(path.join(projectRoot, key.slice(0, -4)), "utf8") });
        else module = new vm.SourceTextModule(await readFile(path.join(projectRoot, key), "utf8"), { context, identifier: key });
        modules.set(key, module);
        return module;
    }
    const entry = await load("Library/GeospatialPipelinePass.js");
    await entry.link((specifier, parent) => load(specifier.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
        : specifier));
    await entry.evaluate();

    const sharedVertexArray = { destroy() { assert.fail("viewport vertex array belongs to the context"); } };
    const sharedShader = {
        destroy() {
            shaderReferences--;
            assert.ok(shaderReferences >= 0, "each command releases one shader-cache reference");
        },
    };
    const hostTexture = { isDestroyed: () => false, destroy() { assert.fail("host texture must survive disposal"); } };
    const scene = {
        drawingBufferWidth: 1024,
        drawingBufferHeight: 768,
        context: {
            _gl: { TEXTURE_2D_ARRAY: 0x8c1a },
            uniformState: {},
            defaultTexture: hostTexture,
            defaultTexture3D: hostTexture,
            createViewportQuadCommand() {
                if (++commandAttempts === failCommandAt) throw new Error("injected shader creation failure");
                shaderReferences++;
                return { shaderProgram: sharedShader, vertexArray: sharedVertexArray, execute() {} };
            },
        },
    };
    const stages = new Set();
    scene.postProcessStages = {
        _stages: [],
        contains: stage => stages.has(stage),
        add(stage) { stages.add(stage); stage._index = this._stages.push(stage) - 1; return stage; },
        remove(stage) {
            stages.delete(stage);
            this._stages.splice(this._stages.indexOf(stage), 1);
            stage.destroy();
            return true;
        },
    };
    return {
        Pipeline: entry.namespace.default,
        PrecomputedLoader: modules.get("Library/geospatial/PrecomputedTexturesLoader.js").namespace.default,
        scene,
        requests,
        precomputedRequests,
        errors,
        liveTextures,
        liveFramebuffers,
        failNextTexture(offset = 1) { failTextureAt = textureAttempts + offset; },
        get allocations() { return allocations; },
        get shaderReferences() { return shaderReferences; },
    };
}

async function flushLoads(harness, reject = false) {
    for (const request of harness.requests.splice(0)) {
        if (reject) request.reject(new Error("asset unavailable"));
        else request.resolve({ width: 1, height: 1, image: { width: 1, height: 1, depth: 1, data: new Uint8Array(4) } });
    }
    for (const request of harness.precomputedRequests.splice(0)) {
        if (reject) request.reject(new Error("atmosphere unavailable"));
        else {
            const texture = { image: { width: 1, height: 1, depth: 1, data: new Float32Array(4) } };
            request.resolve({ scatteringTexture: texture, irradianceTexture: texture, transmittanceTexture: texture });
        }
    }
    await new Promise(resolve => setImmediate(resolve));
}

test("disposal releases owned resources once and ignores asset completions after disposal", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, { showSnow: true });
    const hostDefault3D = harness.scene.context.defaultTexture3D;
    harness.scene.postProcessStages.add(pipeline.stage);
    pipeline.precomputed();
    const allocations = harness.allocations;
    pipeline.destroy();
    pipeline.destroy();
    assert.equal(pipeline.isDestroyed(), true);
    await flushLoads(harness);
    assert.equal(harness.allocations, allocations);
    assert.equal(harness.liveTextures.size, 0);
    assert.equal(harness.liveFramebuffers.size, 0);
    assert.equal(harness.shaderReferences, 0);
    assert.equal(harness.scene.context.defaultTexture3D, hostDefault3D);
    assert.equal(harness.errors.length, 0);
});

test("rebuilds, resizing, completed assets, and recreating in one scene retain no owned resources", async () => {
    const harness = await createHarness();
    for (let cycle = 0; cycle < 2; cycle++) {
        const pipeline = new harness.Pipeline(harness.scene, { showSnow: true });
        harness.scene.postProcessStages.add(pipeline.stage);
        pipeline.precomputed();
        await flushLoads(harness);
        const textures = harness.liveTextures.size;
        const framebuffers = harness.liveFramebuffers.size;
        const shaders = harness.shaderReferences;
        for (let index = 0; index < 3; index++) {
            pipeline.toneMappingMode = index;
            assert.equal(harness.liveTextures.size, textures, "parameter rebuild must replace threshold resources");
            assert.equal(harness.liveFramebuffers.size, framebuffers);
            assert.equal(harness.shaderReferences, shaders);
        }
        harness.scene.drawingBufferWidth += 8;
        pipeline.init(true);
        pipeline.cloudMaterialPass.init(true);
        pipeline.shadowMaterialPass.update();
        assert.equal(harness.liveTextures.size, textures);
        assert.equal(harness.liveFramebuffers.size, framebuffers);
        assert.equal(harness.shaderReferences, shaders);
        // A caller may replace a uniform texture; disposal still owns only its allocations.
        pipeline.localWeatherTexture = harness.scene.context.defaultTexture;
        pipeline.destroy();
        assert.equal(harness.liveTextures.size, 0);
        assert.equal(harness.liveFramebuffers.size, 0);
        assert.equal(harness.shaderReferences, 0);
    }
});

test("failed image, binary, and atmosphere loads are handled after disposal", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, { showSnow: true });
    pipeline.precomputed();
    pipeline.destroy();
    await flushLoads(harness, true);
    assert.equal(harness.errors.length, 0);
    assert.equal(harness.liveTextures.size, 0);
    assert.equal(harness.liveFramebuffers.size, 0);
    assert.equal(harness.shaderReferences, 0);
});

test("failed nested initialization releases partial GPU allocations before a retry", async () => {
    const baseline = await createHarness();
    const pipeline = new baseline.Pipeline(baseline.scene, {});
    const textures = baseline.allocations;
    const framebuffers = baseline.liveFramebuffers.size;
    const commands = baseline.shaderReferences;
    pipeline.destroy();
    for (const [option, count] of [["failTextureAt", textures], ["failFramebufferAt", framebuffers], ["failCommandAt", commands]]) {
        for (let position = 1; position <= count; position++) {
            const harness = await createHarness({ [option]: position });
            assert.throws(() => new harness.Pipeline(harness.scene, {}), /injected/);
            assert.equal(harness.liveTextures.size, 0, `${option} ${position}: leaked texture`);
            assert.equal(harness.liveFramebuffers.size, 0, `${option} ${position}: leaked framebuffer`);
            assert.equal(harness.shaderReferences, 0, `${option} ${position}: leaked shader`);
            const retry = new harness.Pipeline(harness.scene, {});
            retry.destroy();
            assert.equal(harness.liveTextures.size, 0);
            assert.equal(harness.liveFramebuffers.size, 0);
            assert.equal(harness.shaderReferences, 0);
        }
    }
});

test("failed asset loads leave usable fallbacks and never reject an unhandled promise", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, { showSnow: true });
    pipeline.precomputed();
    await flushLoads(harness, true);
    assert.equal(harness.errors.length, 7);
    assert.equal(pipeline.localWeatherTexture, harness.scene.context.defaultTexture);
    assert.equal(pipeline.shapeTexture, pipeline._defaultTexture3D);
    assert.deepEqual(pipeline._defaultTexture3D.dimensions, { x: 1, y: 1, z: 1 });
    assert.equal(pipeline._defaultTexture3D.options.source.arrayBufferView.byteLength, 4);
    pipeline.destroy();
    assert.equal(harness.liveTextures.size, 0);
    assert.equal(harness.liveFramebuffers.size, 0);
    assert.equal(harness.shaderReferences, 0);
});

test("precomputed conversion and consumer callback failures notify onError once", async () => {
    for (const conversionFailure of [true, false]) {
        const harness = await createHarness({ realPrecomputed: true });
        const loader = new harness.PrecomputedLoader();
        if (!conversionFailure) loader.type = Three.HalfFloatType;
        const errors = [];
        let completed = 0;
        loader.load("assets/", () => {
            completed++;
            throw new Error("GPU upload failed");
        }, undefined, error => errors.push(error));
        const requests = harness.precomputedRequests.splice(0);
        // Resolve inside promises, matching FileLoader's onLoad execution context.
        for (const request of requests) {
            await Promise.resolve().then(() => request.resolve({
                image: { width: 1, height: 32, data: conversionFailure ? null : new Uint16Array(4) },
            }));
        }
        requests[0].reject(new Error("late duplicate error"));
        assert.equal(errors.length, 1);
        assert.equal(completed, conversionFailure ? 0 : 1);
    }

    const harness = await createHarness({ realPrecomputed: true });
    const loader = new harness.PrecomputedLoader();
    const loading = loader.loadAsync("assets/");
    const rejected = assert.rejects(loading, /download failed/);
    harness.precomputedRequests[0].reject(new Error("download failed"));
    await rejected;
});

test("resource failures are observable and explicit retry reloads only failed assets", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, {});
    assert.equal(pipeline.assetStatus, "idle");
    const notifications = [];
    const unsubscribe = pipeline.subscribeAssets(() => notifications.push(pipeline.assetStatus));
    pipeline.precomputed();
    assert.equal(pipeline.assetStatus, "loading");
    const weather = harness.requests.shift();
    assert.match(weather.url, /local_weather\.png$/);
    weather.reject(new Error("weather download failed"));
    await flushLoads(harness);
    await pipeline.assetsReady;
    assert.equal(pipeline.assetStatus, "error");
    assert.equal(pipeline.assetErrors.length, 1);
    assert.equal(pipeline.assetErrors[0].id, "weather");
    assert.equal(pipeline.assetErrors[0].required, true);
    assert.match(pipeline.assetErrors[0].error.message, /weather download failed/);
    assert(Object.isFrozen(pipeline.assetErrors));
    assert(Object.isFrozen(pipeline.assetErrors[0]));
    const successfulShape = pipeline.shapeTexture;
    const retry = pipeline.retryAssets();
    assert.equal(harness.requests.length, 1, "successful images and binary tasks are not repeated");
    assert.equal(harness.precomputedRequests.length, 0, "the successful LUT set is not repeated");
    assert.equal(pipeline.assetStatus, "loading");
    await flushLoads(harness);
    await retry;
    assert.equal(pipeline.assetStatus, "ready");
    assert.equal(pipeline.assetErrors.length, 0);
    assert.equal(pipeline.shapeTexture, successfulShape);
    assert(notifications.includes("error"));
    unsubscribe();
    pipeline.destroy();
    assert.equal(pipeline.assetStatus, "disposed");
});

test("reading readiness before the first frame starts and waits for required assets even when disabled", async () => {
    for (const show of [true, false]) {
        const harness = await createHarness();
        const pipeline = new harness.Pipeline(harness.scene, { show });
        assert.equal(harness.requests.length, 0, "construction preserves lazy resource loading");
        assert.equal(harness.precomputedRequests.length, 0);
        let settled = false;
        const ready = pipeline.assetsReady.then(() => { settled = true; });
        assert.equal(harness.requests.length, 5);
        assert.equal(harness.precomputedRequests.length, 1);
        assert.equal(pipeline.assetStatus, "loading");
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false, "readiness must wait for actual resource outcomes");
        // Repeated reads observe the current load, without issuing duplicate requests.
        void pipeline.assetsReady;
        assert.equal(harness.requests.length, 5);
        assert.equal(harness.precomputedRequests.length, 1);
        await flushLoads(harness);
        await ready;
        assert.equal(settled, true);
        assert.equal(pipeline.assetStatus, "ready");
        assert.equal(pipeline.enabled, show);
        pipeline.destroy();
    }
});

test("disposal settles readiness requested immediately after disabled construction", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, { show: false });
    const ready = pipeline.assetsReady;
    const allocated = harness.allocations;
    pipeline.destroy();
    await ready;
    await pipeline.assetsReady;
    assert.equal(pipeline.assetStatus, "disposed");
    await flushLoads(harness);
    assert.equal(harness.allocations, allocated, "late callbacks do not allocate GPU resources");
    assert.equal(harness.liveTextures.size, 0);
    assert.equal(harness.liveFramebuffers.size, 0);
    assert.equal(harness.shaderReferences, 0);
});

test("optional snow does not block required readiness and disposal settles pending readiness", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, { showSnow: true });
    const snow = harness.requests.shift();
    assert.match(snow.url, /snowCoverMask\.png$/);
    pipeline.precomputed();
    await flushLoads(harness);
    await pipeline.assetsReady;
    snow.reject(new Error("optional snow unavailable"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pipeline.assetErrors[0].id, "snow");
    assert.equal(pipeline.assetErrors[0].required, false);
    pipeline.destroy();

    const pending = new harness.Pipeline(harness.scene, {});
    pending.precomputed();
    const ready = pending.assetsReady;
    pending.destroy();
    await ready;
    await pending.assetsReady;
    assert.equal(pending.assetStatus, "disposed");
    await flushLoads(harness);
    assert.equal(harness.liveTextures.size, 0);
});

test("a partial atmosphere GPU upload rolls back atomically and can retry without repeating other assets", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, {});
    pipeline.precomputed();
    // The LUT callback uploads synchronously; defer other task completions until after this failure.
    harness.failNextTexture(2);
    const lut = harness.precomputedRequests.shift();
    const texture = { image: { width: 1, height: 1, depth: 1, data: new Float32Array(4) } };
    lut.resolve({ scatteringTexture: texture, irradianceTexture: texture, transmittanceTexture: texture });
    await flushLoads(harness);
    await pipeline.assetsReady;
    assert.equal(pipeline.assetStatus, "error");
    assert.equal(pipeline.assetErrors.length, 1);
    assert.equal(pipeline.assetErrors[0].id, "atmosphere");
    assert.equal(pipeline._u_scattering_texture, pipeline._defaultTexture3D);
    assert.equal(pipeline._u_irradiance_texture, harness.scene.context.defaultTexture);
    const allocated = harness.liveTextures.size;
    const retry = pipeline.retryAssets();
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.precomputedRequests.length, 1);
    await flushLoads(harness);
    await retry;
    assert.equal(pipeline.assetStatus, "ready");
    assert.equal(harness.liveTextures.size, allocated + 3);
    pipeline.destroy();
    assert.equal(harness.liveTextures.size, 0);
});

test("pipeline cleanup attempts every independent release and aggregates failures once", async () => {
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, {});
    harness.scene.postProcessStages.add(pipeline.stage);
    pipeline.precomputed();
    await flushLoads(harness);
    const injectAfterRelease = (resource, label) => {
        const release = resource.destroy.bind(resource);
        resource.destroy = () => { release(); throw new Error(label); };
    };
    pipeline._sceneLease = { restore() { throw new Error("host restore failed"); } };
    injectAfterRelease(pipeline.stage, "stage cleanup failed");
    injectAfterRelease(pipeline.volumetricLightPass, "light cleanup failed");
    injectAfterRelease(pipeline._aerialPerspectiveOutputColor, "render target cleanup failed");
    injectAfterRelease(pipeline.localWeatherTexture, "asset cleanup failed");
    assert.throws(() => pipeline.destroy(), error => {
        assert.equal(error.name, "AggregateError");
        assert.equal(error.errors.length, 5);
        return true;
    });
    pipeline.destroy();
    assert.equal(pipeline.isDestroyed(), true);
    assert.equal(pipeline.assetStatus, "disposed");
    assert.equal(harness.liveTextures.size, 0);
    assert.equal(harness.liveFramebuffers.size, 0);
    assert.equal(harness.shaderReferences, 0);
});

test("loading the real pipeline leaves every Cesium math prototype untouched", async () => {
    const types = [Cesium.Cartesian2, Cesium.Cartesian3, Cesium.Cartesian4, Cesium.Matrix4];
    const before = types.map(Type => Object.getOwnPropertyDescriptors(Type.prototype));
    const harness = await createHarness();
    const pipeline = new harness.Pipeline(harness.scene, {});
    pipeline.destroy();
    for (let index = 0; index < types.length; index++) {
        assert.deepEqual(Object.getOwnPropertyDescriptors(types[index].prototype), before[index]);
    }
});
