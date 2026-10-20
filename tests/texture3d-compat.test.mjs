import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SourceTextModule, SyntheticModule } from "node:vm";
import test from "node:test";

// Point this at another installed Cesium Source/Cesium.js to run the same suite
// against a newer version without changing the project's dependency installation.
const cesiumUrl = process.env.CESIUM_COMPAT_MODULE
    ? pathToFileURL(resolve(process.env.CESIUM_COMPAT_MODULE)).href
    : import.meta.resolve("cesium");
const Cesium = await import(cesiumUrl);
const { PixelDatatype, PixelFormat, WebGLConstants: GL } = Cesium;
const textureSource = await readFile(new URL("../Library/Texture3D.js", import.meta.url), "utf8");
const adapterSource = await readFile(new URL("../Library/internal/CesiumAdapter.js", import.meta.url), "utf8");

async function loadTexture3D(pixelDatatype = PixelDatatype) {
    const cesiumModule = new SyntheticModule(Object.keys(Cesium), function () {
        for (const name of Object.keys(Cesium)) {
            this.setExport(name, name === "PixelDatatype" ? pixelDatatype : Cesium[name]);
        }
    });
    const textureModule = new SourceTextModule(textureSource);
    const adapterModule = new SourceTextModule(adapterSource);
    await adapterModule.link(specifier => {
        assert.equal(specifier, "cesium");
        return cesiumModule;
    });
    await textureModule.link((specifier) => {
        if (specifier === "cesium") return cesiumModule;
        assert.equal(specifier, "./internal/CesiumAdapter.js");
        return adapterModule;
    });
    await textureModule.evaluate();
    return textureModule.namespace.default;
}

const Texture3D = await loadTexture3D();

function createContext() {
    const calls = [];
    const allocations = new Map();
    let boundTexture;
    const gl = { ...GL };
    for (const name of ["activeTexture", "pixelStorei", "texParameteri", "deleteTexture"]) {
        gl[name] = (...args) => calls.push({ name, args });
    }
    gl.createTexture = () => ({});
    gl.bindTexture = (target, texture) => {
        boundTexture = texture;
        calls.push({ name: "bindTexture", args: [target, texture] });
    };
    gl.texStorage3D = (...args) => {
        assert.ok(!allocations.has(boundTexture), "storage must be allocated only once");
        allocations.set(boundTexture, args.slice(3, 6));
        calls.push({ name: "texStorage3D", args });
    };
    gl.texImage3D = (...args) => {
        assert.ok(!allocations.has(boundTexture), "updates must not redefine existing storage");
        allocations.set(boundTexture, args.slice(3, 6));
        validateUpload(args[8], args[9]);
        calls.push({ name: "texImage3D", args });
    };
    gl.texSubImage3D = (...args) => {
        const dimensions = allocations.get(boundTexture);
        assert.ok(dimensions, "storage must exist before an upload");
        for (let axis = 0; axis < 3; axis++) {
            assert.ok(args[axis + 2] + args[axis + 5] <= dimensions[axis], "upload must fit the allocated volume");
        }
        validateUpload(args[9], args[10]);
        calls.push({ name: "texSubImage3D", args });
    };
    return { context: { _gl: gl, webgl2: true }, calls };
}

function validateUpload(datatype, data) {
    if (data === null || !ArrayBuffer.isView(data)) return;
    const expected = new Map([
        [GL.FLOAT, Float32Array],
        [GL.HALF_FLOAT, Uint16Array],
        [GL.UNSIGNED_BYTE, Uint8Array],
    ]).get(datatype);
    assert.ok(expected, `unexpected GL datatype ${datatype}`);
    assert.ok(data instanceof expected, `GL datatype ${datatype} must match the uploaded TypedArray`);
}

const datatypes = [
    { name: "FLOAT", datatype: PixelDatatype.FLOAT, glDatatype: GL.FLOAT, internalFormat: GL.RGBA32F, ArrayType: Float32Array },
    { name: "HALF_FLOAT", datatype: PixelDatatype.HALF_FLOAT, glDatatype: GL.HALF_FLOAT, internalFormat: GL.RGBA16F, ArrayType: Uint16Array },
    { name: "UNSIGNED_BYTE", datatype: PixelDatatype.UNSIGNED_BYTE, glDatatype: GL.UNSIGNED_BYTE, internalFormat: GL.RGBA8, ArrayType: Uint8Array },
];

for (const { name, datatype, glDatatype, internalFormat, ArrayType } of datatypes) {
    for (const useTexStorage of [false, true]) {
        for (const initialSource of [false, true]) {
            test(`Cesium ${Cesium.VERSION}: ${name}, immutable=${useTexStorage}, initialSource=${initialSource}`, () => {
                const { context, calls } = createContext();
                const data = new ArrayType(4 * 3 * 2 * 4);
                const texture = new Texture3D({
                    context, width: 4, height: 3, depth: 2,
                    pixelFormat: PixelFormat.RGBA, pixelDatatype: datatype,
                    useTexStorage, source: initialSource ? { arrayBufferView: data } : undefined,
                });

                assert.equal(texture.pixelDatatype, datatype, "the logical Cesium datatype is preserved");
                assert.equal(texture._internalFormat, internalFormat);
                assert.equal(texture.sizeInBytes, data.byteLength);
                const allocations = calls.filter(({ name }) => name === "texStorage3D" || name === "texImage3D");
                assert.equal(allocations.length, 1);
                assert.equal(allocations[0].name, useTexStorage ? "texStorage3D" : "texImage3D");
                const constructorUpload = calls.find(({ name }) => name === (useTexStorage ? "texSubImage3D" : "texImage3D"));
                if (!useTexStorage || initialSource) {
                    assert.equal(constructorUpload.args[useTexStorage ? 9 : 8], glDatatype);
                }

                calls.length = 0;
                texture.copyFrom({ source: { arrayBufferView: data } });
                texture.copyFrom({
                    xOffset: 1, yOffset: 1, zOffset: 1, skipColorSpaceConversion: true,
                    source: { width: 1, height: 1, depth: 1, arrayBufferView: new ArrayType(4) },
                });
                // Exercise the non-TypedArray source branch separately from the volume upload.
                const image = { width: 1, height: 1, depth: 1 };
                texture.copyFrom({ source: image });

                assert.ok(calls.every(({ name }) => name !== "texStorage3D" && name !== "texImage3D"));
                const updates = calls.filter(({ name }) => name === "texSubImage3D");
                assert.equal(updates.length, 3);
                assert.deepEqual(updates[0].args.slice(2, 8), [0, 0, 0, 4, 3, 2]);
                assert.deepEqual(updates[1].args.slice(2, 8), [1, 1, 1, 1, 1, 1]);
                assert.ok(updates.every(({ args }) => args[9] === glDatatype));
                assert.equal(updates[2].args[10], image);
                assert.ok(calls.some(({ name, args }) => name === "pixelStorei" && args[0] === GL.UNPACK_COLORSPACE_CONVERSION_WEBGL && args[1] === GL.NONE));
                assert.equal(texture._initialized, true);

                texture.destroy();
                assert.equal(calls.filter(({ name }) => name === "deleteTexture").length, 1);
                assert.equal(texture.isDestroyed(), true);
            });
        }
    }
}

test("half-float component formats and typed upload retain 16-bit data", () => {
    for (const [pixelFormat, internalFormat, components] of [
        [PixelFormat.RED, GL.R16F, 1], [PixelFormat.RG, GL.RG16F, 2],
        [PixelFormat.RGB, GL.RGB16F, 3], [PixelFormat.RGBA, GL.RGBA16F, 4],
    ]) {
        const { context, calls } = createContext();
        const data = new Uint16Array(components * 2);
        data.fill(0x3c00, 0, components);
        data.fill(0x4000, components);
        const texture = new Texture3D({
            context, width: 1, height: 2, depth: 1,
            pixelFormat, pixelDatatype: PixelDatatype.HALF_FLOAT,
            flipY: true, unpackAlignment: 2, source: { arrayBufferView: data },
        });
        const { args } = calls.find(({ name }) => name === "texImage3D");
        assert.equal(args[2], internalFormat);
        assert.equal(args[8], GL.HALF_FLOAT);
        assert.ok(args[9] instanceof Uint16Array);
        const flippedData = [...data.slice(components), ...data.slice(0, components)];
        assert.deepEqual([...args[9]], flippedData);
        calls.length = 0;
        texture.copyFrom({ source: { arrayBufferView: data } });
        const update = calls.find(({ name }) => name === "texSubImage3D");
        assert.equal(update.args[9], GL.HALF_FLOAT);
        assert.deepEqual([...update.args[10]], flippedData);
        assert.ok(calls.some(({ name, args }) => name === "pixelStorei" && args[0] === GL.UNPACK_ALIGNMENT && args[1] === (components % 2 === 0 ? 4 : 2)));
    }
});

test("data-object constructor uses the same WebGL2 datatype for mutable and immutable storage", () => {
    for (const useTexStorage of [false, true]) {
        const { context, calls } = createContext();
        const data = new Uint16Array(4);
        new Texture3D({
            context, width: 1, height: 1, depth: 1,
            pixelDatatype: PixelDatatype.HALF_FLOAT, useTexStorage,
            source: { width: 1, height: 1, data },
        });
        const { args } = calls.find(({ name }) => name === (useTexStorage ? "texSubImage3D" : "texImage3D"));
        assert.equal(args[useTexStorage ? 9 : 8], GL.HALF_FLOAT);
        assert.equal(args[useTexStorage ? 10 : 9], data);
    }
});

test("Texture3D does not depend on Cesium's private datatype conversion helper", async () => {
    const CompatibleTexture3D = await loadTexture3D({ ...PixelDatatype, toWebGLConstant: undefined });
    const { context, calls } = createContext();
    const texture = new CompatibleTexture3D({
        context, width: 1, height: 1, depth: 1, pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    texture.copyFrom({ source: { arrayBufferView: new Uint16Array(4) } });
    assert.equal(calls.find(({ name }) => name === "texSubImage3D").args[9], GL.HALF_FLOAT);
});
