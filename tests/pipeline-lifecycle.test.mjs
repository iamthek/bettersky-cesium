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
async function createHarness({ realPrecomputed = false } = {}) {
    const liveTextures = new Set();
    const liveFramebuffers = new Set();
    const requests = [];
    const precomputedRequests = [];
    const errors = [];
    let allocations = 0;
    let shaderReferences = 0;
    const context = vm.createContext({ console: { error: error => errors.push(error), log() {} } });

    class Texture {
        constructor(options = {}) {
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
    function pendingRequest() {
        return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    }
    class PrecomputedTexturesLoader {
        load(url, resolve, onProgress, reject) { precomputedRequests.push({ resolve, reject }); }
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
            Resource: { createIfNeeded: () => ({ fetchImage: pendingRequest }) },
            buildModuleUrl: value => value,
        },
        three: Three,
        "Library/Texture3D.js": { default: Texture3D },
        "Library/PostProcessStage.js": { default: RenderPass, viewportTriangleVertexShaderText: "" },
        "Library/geospatial/PrecomputedTexturesLoader.js": { default: PrecomputedTexturesLoader },
        "Library/geospatial/PrecomputedDataLoader.js": {
            createData3DTextureLoaderClass: () => class { loadAsync() { return pendingRequest(); } },
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
