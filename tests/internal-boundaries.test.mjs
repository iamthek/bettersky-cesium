import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as Cesium from "cesium";
import { Matrix4 as ThreeMatrix4, Vector3 } from "three";
import { Cartesian3, Matrix4 } from "../Library/internal/MathTypes.js";
import SceneStateLease from "../Library/internal/SceneStateLease.js";
import { getSceneCoverage, getSceneDepthFrustums } from '../Library/internal/CesiumAdapter.js';

test("internal vector projection matches the existing homogeneous divide and reuses its receiver", () => {
    const matrix = [2, 0, 0, 0.1, 0, 3, 0, 0.2, 0, 0, 4, 0.3, 5, 6, 7, 1];
    const vector = new Cartesian3(3, 4, 5);
    const expected = new Vector3(3, 4, 5).applyMatrix4(new ThreeMatrix4().fromArray(matrix));
    assert.equal(vector.applyMatrix4(matrix), vector);
    assert.deepEqual([vector.x, vector.y, vector.z], [expected.x, expected.y, expected.z]);
    const copy = new Matrix4();
    assert.equal(copy.copy(matrix), copy);
    assert.deepEqual(Array.from({ length: 16 }, (_, index) => copy[index]), matrix);
    assert.equal(copy.copy(undefined), undefined);
});

test("scene leases record the original value once and preserve the default restoration policy", () => {
    const host = { enabled: true, cache: 100 };
    const lease = new SceneStateLease();
    lease.write(host, "enabled", false);
    lease.write(host, "cache", 2000);
    lease.write(host, "cache", 3000);
    host.cache = 5000;
    lease.restore();
    assert.deepEqual(host, { enabled: true, cache: 100 });
    lease.restore();

    const cooperative = new SceneStateLease({ restore: "if-unchanged" });
    cooperative.write(host, "cache", 2000);
    cooperative.write(host, "enabled", false);
    host.cache = 5000;
    cooperative.restore();
    assert.deepEqual(host, { enabled: true, cache: 5000 });
});

test("a failed scene property restoration does not skip the remaining host properties", () => {
    const host = { enabled: true, cache: 100 };
    const lease = new SceneStateLease();
    lease.write(host, "enabled", false);
    lease.write(host, "cache", 2000);
    Object.defineProperty(host, "enabled", { set() { throw new Error("host setter failed"); } });
    assert.throws(() => lease.restore(), AggregateError);
    assert.equal(host.cache, 100);
    lease.restore();
});

async function createHbaoHarness() {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const sandbox = vm.createContext({ console });
    class Stage {
        constructor(options) { Object.assign(this, options); this.ready = true; this.destroyed = false; }
        update() {}
        _isSupported() { return true; }
        isDestroyed() { return this.destroyed; }
        destroy() {
            assert.equal(this.destroyed, false);
            this.destroyed = true;
            for (const stage of this.stages ?? []) stage.destroy();
        }
    }
    const replacements = {
        cesium: { ...Cesium, PostProcessStageComposite: Stage },
        "Library/PostProcessStage.js": { default: Stage },
    };
    const modules = new Map();
    async function load(name) {
        if (modules.has(name)) return modules.get(name);
        let module;
        const values = replacements[name] ?? (name.endsWith("?raw") ? { default: "" } : undefined);
        if (values) {
            module = new vm.SyntheticModule(Object.keys(values), function () {
                for (const [key, value] of Object.entries(values)) this.setExport(key, value);
            }, { context: sandbox, identifier: name });
        } else {
            module = new vm.SourceTextModule(await readFile(path.join(root, name), "utf8"), { context: sandbox, identifier: name });
        }
        modules.set(name, module);
        return module;
    }
    const entry = await load("Library/HBAOEffectPass.js");
    await entry.link((specifier, parent) => load(specifier.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
        : specifier));
    await entry.evaluate();
    return entry.namespace.default;
}

test("HBAO stages and camera caches belong to each instance", async () => {
    const HBAO = await createHbaoHarness();
    const makeScene = position => ({
        camera: {
            frustum: new Cesium.PerspectiveFrustum({ fov: 1, aspectRatio: 1, near: 1, far: 1000 }),
            position: new Cesium.Cartesian3(position, 0, 0),
            positionCartographic: { height: 10 },
        },
        globeHeight: 0,
        context: { uniformState: {} },
        postProcessStages: { _logDepthOptimization: true },
    });
    const first = new HBAO(makeScene(1));
    const firstStage = first.stage;
    const second = new HBAO(makeScene(2));
    assert.notEqual(first.stage, second.stage);
    first.enabled = false;
    assert.equal(first.stage.enabled, false);
    assert.equal(second.stage.enabled, true);
    first.update({});
    second.update({});
    assert.equal(first._lastViewPosition.x, 1);
    assert.equal(second._lastViewPosition.x, 2);
    first.destroy();
    first.destroy();
    assert.equal(firstStage.isDestroyed(), true);
    assert.equal(second.stage.isDestroyed(), false);
    second.destroy();
});

test("HBAO follows projection aspect changes and chains both bilateral filter directions", async () => {
    const HBAO = await createHbaoHarness();
    const frustum = new Cesium.PerspectiveFrustum({ fov: 1, aspectRatio: 16 / 9, near: 1, far: 1e7 });
    const scene = {
        camera: { frustum, position: new Cesium.Cartesian3() },
        context: { uniformState: {} }, postProcessStages: {},
    };
    const pass = new HBAO(scene);
    const [generate, blurX, blurY] = pass.stage.stages[0].stages;
    assert.equal(blurX.uniforms.colorTexture2, generate.name);
    assert.equal(blurY.uniforms.colorTexture2, blurX.name);
    for (const aspect of [16 / 9, 9 / 16, 1]) {
        frustum.aspectRatio = aspect;
        pass.update(scene.context, true);
        assert.equal(pass._focalLength.x, frustum.projectionMatrix[0]);
        assert.equal(pass._focalLength.y, frustum.projectionMatrix[5]);
    }
    pass.destroy();
});

test('coverage reads pre-OIT alpha and selects the correct revealage channel', () => {
    const color = {};
    const accumulation = {};
    const revealage = {};
    const oit = { _translucentMRTSupport: true, _accumulationTexture: accumulation, _revealageTexture: revealage };
    const scene = { _environmentState: { useOIT: true }, view: {
        oit, globeDepth: { colorFramebufferManager: { getColorTexture: () => color } },
    } };
    assert.deepEqual(getSceneCoverage(scene), { color, transmittance: accumulation, alphaChannel: true });
    oit._translucentMRTSupport = false;
    assert.deepEqual(getSceneCoverage(scene), { color, transmittance: revealage, alphaChannel: false });
    scene._environmentState.useOIT = false;
    assert.equal(getSceneCoverage(scene), undefined);
});

test('depth copies retain Cesium frustum offsets and never substitute a missing frustum', () => {
    const textures = [{}, {}];
    const scene = { useDepthPicking: true, opaqueFrustumNearOffset: 0.9999, view: {
        frustumCommandsList: [{ near: 0.1, far: 100 }, { near: 100, far: 100000 }],
        pickDepths: textures.map(texture => ({ framebuffer: { getColorTexture: () => texture } })),
    } };
    assert.deepEqual(getSceneDepthFrustums(scene), [
        { texture: textures[0], near: 0.1, far: 100 },
        { texture: textures[1], near: 99.99, far: 100000 },
    ]);
    scene.view.pickDepths.pop();
    assert.deepEqual(getSceneDepthFrustums(scene), []);
});
