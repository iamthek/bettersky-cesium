import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as Three from "three";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
    "local_weather.png", "turbulence.png", "shape.bin", "shape_detail.bin", "stbn.bin",
    "irradiance.exr", "scattering.exr", "transmittance.exr",
];
const requiredUrls = base => requiredFiles.map(file => new URL(`BetterSkyAssets/GeospatialAssets/${file}`, base).href);
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const bytes = (...values) => Uint8Array.from(values).buffer;
const response = buffer => ({ ok: true, arrayBuffer: async () => buffer });

// Isolate the real module cache per test while keeping network completion controllable.
// No Viewer, DOM image decoder, or GPU implementation is needed for preloading.
async function createHarness() {
    const requests = [];
    const errors = [];
    let assetBase = "https://cdn.example/sdk/v1/";
    let renderingConstructions = 0;
    const context = vm.createContext({
        URL, ArrayBuffer, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
        Float32Array, Float64Array, DataView, TextDecoder, Error, AggregateError,
        Float16Array: globalThis.Float16Array ?? Uint16Array,
        document: { baseURI: "https://app.example/view/index.html" },
        console: { error: error => errors.push(error) },
        fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    });
    class RenderingResource {
        constructor() { renderingConstructions++; assert.fail("preloading must not construct rendering resources"); }
    }
    const replacements = {
        three: Three,
        cesium: {
            buildModuleUrl: value => new URL(value, assetBase).href,
            Viewer: RenderingResource,
            Texture: RenderingResource,
            Texture3D: RenderingResource,
        },
    };
    const modules = new Map();
    async function load(key) {
        if (!modules.has(key)) {
            // Linking several loaders can request this module before its file read
            // finishes; keep that pending read so they share one actual cache.
            modules.set(key, (async () => {
                const values = replacements[key];
                return values ? new vm.SyntheticModule(Object.keys(values), function () {
                    for (const [name, value] of Object.entries(values)) this.setExport(name, value);
                }, { context, identifier: key })
                    : new vm.SourceTextModule(await readFile(path.join(projectRoot, key), "utf8"), { context, identifier: key });
            })());
        }
        return modules.get(key);
    }
    const link = (specifier, parent) => load(specifier.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)) : specifier);
    const entry = new vm.SourceTextModule(`
        export { default as preloadAssets } from "./Library/internal/preloadAssets.js";
        export { loadAssetBuffer, invalidateAssetBuffer } from "./Library/internal/AssetCache.js";
        export { default as ArrayBufferLoader } from "./Library/geospatial/ArrayBufferLoader.js";
        export { createTypedArrayLoaderClass } from "./Library/geospatial/TypedArrayLoader.js";
        export { EXRLoader } from "./Library/geospatial/EXRLoader.js";
    `, { context, identifier: "entry.js" });
    await entry.link(link);
    await entry.evaluate();
    return {
        ...entry.namespace,
        requests,
        errors,
        setAssetBase(value) { assetBase = value; },
        get renderingConstructions() { return renderingConstructions; },
    };
}

test("preloading downloads the eight required files once across concurrent calls and normal loaders", async () => {
    const harness = await createHarness();
    const urls = requiredUrls("https://cdn.example/sdk/v1/");
    const first = harness.preloadAssets();
    const concurrent = harness.preloadAssets();
    const normalLoad = new harness.ArrayBufferLoader().loadAsync(urls[2]);
    assert.deepEqual(harness.requests.map(request => request.url), urls);
    assert.equal(harness.renderingConstructions, 0);
    const buffers = harness.requests.map((request, index) => {
        const buffer = bytes(index, index + 1);
        request.resolve(response(buffer));
        return buffer;
    });
    assert.deepEqual(await Promise.all([first, concurrent]), [undefined, undefined]);
    assert.equal(await normalLoad, buffers[2]);
    assert.equal(await harness.preloadAssets(), undefined);
    assert.equal(await new harness.ArrayBufferLoader().loadAsync(urls[2]), buffers[2]);
    assert.equal(harness.requests.length, 8, "completed raw buffers remain available to ordinary initialization");
    assert.equal(harness.renderingConstructions, 0);
    assert.equal(harness.errors.length, 0);
});

test("preload failures aggregate every failed URL and retry only missing downloads", async () => {
    const harness = await createHarness();
    const urls = requiredUrls("https://cdn.example/sdk/v1/");
    let settled = false;
    const preload = harness.preloadAssets();
    const result = preload.then(() => { settled = true; }, error => { settled = true; return error; });
    const networkError = new Error("connection reset");
    harness.requests[0].reject(networkError);
    harness.requests[5].resolve({ ok: false, status: 503, statusText: "Unavailable" });
    for (const [index, request] of harness.requests.entries()) {
        if (![0, 5, 7].includes(index)) request.resolve(response(bytes(index)));
    }
    await nextTurn();
    assert.equal(settled, false, "a fast failure must not reject before the other downloads finish");
    harness.requests[7].resolve(response(bytes(7)));
    const error = await result;
    assert(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, new RegExp(urls[0].replaceAll(".", "\\.")));
    assert.equal(error.errors[0].cause, networkError);
    assert(error.errors[1].message.includes(urls[5]));
    assert.match(error.errors[1].cause.message, /HTTP 503/);

    const retry = harness.preloadAssets();
    assert.deepEqual(harness.requests.slice(8).map(request => request.url), [urls[0], urls[5]]);
    for (const request of harness.requests.slice(8)) request.resolve(response(bytes(1, 2)));
    assert.equal(await retry, undefined);
    assert.equal(await harness.preloadAssets(), undefined);
    assert.equal(harness.requests.length, 10);
});

test("cache keys normalize relative URLs and keep different asset base URLs independent", async () => {
    const harness = await createHarness();
    const relative = harness.loadAssetBuffer("../assets/shared.bin");
    const absolute = harness.loadAssetBuffer("https://app.example/assets/shared.bin");
    assert.equal(relative, absolute);
    assert.equal(harness.requests[0].url, "https://app.example/assets/shared.bin");
    harness.requests[0].resolve(response(bytes(1)));
    await relative;

    const first = harness.preloadAssets();
    for (const request of harness.requests.slice(1)) request.resolve(response(bytes(2)));
    await first;
    harness.setAssetBase("https://other.example/sdk/v2/");
    const second = harness.preloadAssets();
    assert.deepEqual(harness.requests.slice(9).map(request => request.url), requiredUrls("https://other.example/sdk/v2/"));
    for (const request of harness.requests.slice(9)) request.resolve(response(bytes(3)));
    await second;
    assert.equal(harness.requests.length, 17);
});

test("late invalidation cannot evict a replacement pending or completed buffer", async () => {
    const harness = await createHarness();
    const url = "https://cdn.example/shared.bin";
    const oldBuffer = bytes(1);
    const first = harness.loadAssetBuffer(url);
    harness.requests[0].resolve(response(oldBuffer));
    await first;
    harness.invalidateAssetBuffer(url, oldBuffer);
    const replacement = harness.loadAssetBuffer(url);
    harness.invalidateAssetBuffer(url, oldBuffer);
    assert.equal(harness.loadAssetBuffer(url), replacement);
    const newBuffer = bytes(2);
    harness.requests[1].resolve(response(newBuffer));
    assert.equal(await replacement, newBuffer);
    harness.invalidateAssetBuffer(url, oldBuffer);
    assert.equal(await harness.loadAssetBuffer(url), newBuffer);
    assert.equal(harness.requests.length, 2);
    harness.invalidateAssetBuffer(url, newBuffer);
    const third = harness.loadAssetBuffer(url);
    assert.equal(harness.requests.length, 3);
    harness.requests[2].resolve(response(bytes(3)));
    await third;
});

test("shared streaming downloads retain progress and loader request options", async () => {
    const harness = await createHarness();
    const url = "https://cdn.example/stream.bin";
    const progress = [];
    const observerError = new Error("progress observer failed");
    const first = harness.loadAssetBuffer(url, event => progress.push(event), {
        requestHeader: { "X-Asset-Version": "2" }, withCredentials: true,
    });
    const shared = harness.loadAssetBuffer(url, () => { throw observerError; });
    assert.equal(first, shared);
    assert.deepEqual({ ...harness.requests[0].options }, {
        headers: { "X-Asset-Version": "2" }, credentials: "include",
    });
    harness.requests[0].resolve(new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(Uint8Array.from([1, 2]));
            controller.enqueue(Uint8Array.from([3, 4, 5]));
            controller.close();
        },
    }), { headers: { "Content-Length": "5" } }));
    assert.deepEqual(new Uint8Array(await first), Uint8Array.from([1, 2, 3, 4, 5]));
    assert.deepEqual(progress.map(({ loaded, total, lengthComputable }) => ({ loaded, total, lengthComputable })), [
        { loaded: 2, total: 5, lengthComputable: true },
        { loaded: 5, total: 5, lengthComputable: true },
    ]);
    assert.deepEqual(harness.errors, [observerError, observerError]);
});

test("a corrupt EXR is evicted and a later load parses a fresh real asset", async () => {
    const harness = await createHarness();
    const loader = new harness.EXRLoader();
    const url = "https://cdn.example/transmittance.exr";
    const loading = loader.loadAsync(url);
    const rejected = assert.rejects(loading);
    harness.requests[0].resolve(response(bytes(0, 1, 2, 3)));
    await rejected;
    const retry = loader.loadAsync(url);
    assert.equal(harness.requests.length, 2);
    const file = await readFile(path.join(projectRoot, "static/BetterSkyAssets/GeospatialAssets/transmittance.exr"));
    harness.requests[1].resolve(response(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)));
    const texture = await retry;
    assert.equal(texture.image.width, 256);
    assert.equal(texture.image.height, 64);
    assert(texture.image.data.byteLength > 0);
    const rebuilt = await loader.loadAsync(url);
    assert.notEqual(rebuilt, texture, "decoded texture wrappers belong to each consumer");
    assert.deepEqual(rebuilt.image.data, texture.image.data);
    assert.equal(harness.requests.length, 2, "valid EXR bytes are reused when decoded again");
    await nextTurn();
    assert.equal(harness.errors.length, 0);
});

test("typed parsing and consumer callback failures report once without unhandled rejections", async () => {
    for (const callbackFailure of [false, true]) {
        const harness = await createHarness();
        const observed = [];
        const managerEvents = [];
        const manager = new Three.LoadingManager();
        manager.itemStart = url => managerEvents.push(["start", url]);
        manager.itemError = url => managerEvents.push(["error", url]);
        manager.itemEnd = url => managerEvents.push(["end", url]);
        const TypedLoader = harness.createTypedArrayLoaderClass(buffer => new Uint16Array(buffer));
        const loader = new TypedLoader(manager);
        const url = "https://cdn.example/typed.bin";
        const callbackError = new Error("consumer rejected decoded bytes");
        loader.load(url, () => { throw callbackError; }, undefined, error => observed.push(error));
        harness.requests[0].resolve(response(callbackFailure ? bytes(1, 2) : bytes(1, 2, 3)));
        await nextTurn();
        assert.equal(observed.length, 1);
        if (callbackFailure) assert.equal(observed[0], callbackError);
        else assert(observed[0] instanceof RangeError);
        assert.deepEqual(managerEvents.map(([event]) => event), ["start", "error", "end"]);
        const retry = loader.loadAsync(url);
        assert.equal(harness.requests.length, 2, "bytes rejected by parsing or consumption are invalidated");
        harness.requests[1].resolve(response(bytes(1, 2)));
        assert.equal((await retry).length, 1);
        await nextTurn();
        assert.equal(harness.errors.length, 0);
    }
});
