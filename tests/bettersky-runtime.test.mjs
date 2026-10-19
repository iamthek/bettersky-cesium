import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as Cesium from "cesium";

// Exercise the public entry against observable host mutations, using real Cesium
// scene-mode/frustum values and counted pass wrappers instead of a WebGL device.
async function createHarness({ globals = {}, failPreRender = false } = {}) {
  const passes = [];
  const errors = [];
  const counters = { installs: 0, updates: 0 };
  const context = vm.createContext({
    Float16Array: Uint16Array,
    structuredClone,
    console: { error: (...args) => errors.push(args) },
    ...globals,
  });
  class Pass {
    constructor(scene, options) {
      this.scene = scene;
      this.enabled = options.show;
      this.stage = { enabled: options.show, destroyed: false,
        isDestroyed() { return this.destroyed; },
        destroy() { assert.equal(this.destroyed, false); this.destroyed = true; } };
      this.cloudMaterialPass = { hazeSunColor: new Cesium.Cartesian3(), invalidateHistory() {} };
      this._customDarkParam = {};
      this.destroyed = false;
      passes.push(this);
    }
    update() { counters.updates++; }
    setVolumetricLightOptions() {}
    restoreScene() {}
    isDestroyed() { return this.destroyed; }
    destroy() {
      assert.equal(this.destroyed, false);
      this.destroyed = true;
      if (!this.stage.isDestroyed()) this.stage.destroy();
    }
  }
  const source = await readFile(new URL("../BetterSky.js", import.meta.url), "utf8");
  async function loadEntry() {
    const entry = new vm.SourceTextModule(source, { context });
    await entry.link(specifier => {
      const exports = specifier === "cesium" ? Cesium : specifier.endsWith("viewportQuadCommand.js")
        ? { installViewportCommands() { counters.installs++; } }
        : { default: Pass };
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await entry.evaluate();
    return entry.namespace.BetterSky;
  }
  function createViewer() {
    const stages = new Set();
    const callbacks = new Set();
    const scene = {
      mode: Cesium.SceneMode.SCENE3D,
      camera: { frustum: new Cesium.PerspectiveFrustum() },
      globe: { depthTestAgainstTerrain: false },
      highDynamicRange: false,
      logarithmicDepthBuffer: false,
      gamma: 1,
      context: Object.fromEntries(["webgl2", "floatingPointTexture", "halfFloatingPointTexture", "colorBufferFloat", "colorBufferHalfFloat", "textureFloatLinear", "textureHalfFloatLinear"].map(key => [key, true])),
      postProcessStages: {
        contains: stage => stages.has(stage),
        add(stage) { stages.add(stage); },
        remove(stage) { stages.delete(stage); stage.destroy(); },
      },
      preRender: { addEventListener(callback) {
        if (failPreRender) throw new Error("injected callback registration failure");
        callbacks.add(callback);
        return () => callbacks.delete(callback);
      } },
    };
    return { scene, clock: { currentTime: Cesium.JulianDate.fromIso8601("2024-01-01T00:00Z") },
      stages, callbacks, render: () => [...callbacks].forEach(callback => callback()) };
  }
  return { BetterSky: await loadEntry(), loadEntry, createViewer, passes, errors, counters };
}

test("only one active public instance is allowed across duplicate bundles and disposal permits rebuilding", async () => {
  const harness = await createHarness();
  const viewer = harness.createViewer();
  const otherViewer = harness.createViewer();
  const DuplicateBetterSky = await harness.loadEntry();
  const effects = new harness.BetterSky(viewer);
  assert.equal(viewer.stages.size, 3);
  assert.throws(() => new DuplicateBetterSky(otherViewer), /dispose/);
  assert.equal(otherViewer.scene.highDynamicRange, false);
  assert.equal(otherViewer.stages.size, 0);
  assert.equal(otherViewer.callbacks.size, 0);
  assert.equal(harness.counters.installs, 1);
  effects.dispose();
  effects.dispose();
  effects.smaaEnabled = true;
  assert.throws(() => effects.update({}), /已销毁/);
  assert.equal(viewer.stages.size, 0);
  assert.equal(viewer.callbacks.size, 0);
  const rebuilt = new DuplicateBetterSky(otherViewer);
  rebuilt.dispose();
  assert(harness.passes.every(pass => pass.destroyed && pass.stage.destroyed));
});

test("unsupported scenes and required browser capabilities fail before any host or GPU mutation", async () => {
  const mutations = [
    viewer => { viewer.scene.mode = Cesium.SceneMode.SCENE2D; },
    viewer => { viewer.scene.mode = Cesium.SceneMode.COLUMBUS_VIEW; },
    viewer => { viewer.scene.globe = undefined; },
    viewer => { viewer.scene.camera.frustum = new Cesium.OrthographicFrustum(); },
    ...["webgl2", "floatingPointTexture", "halfFloatingPointTexture", "colorBufferFloat", "colorBufferHalfFloat", "textureFloatLinear", "textureHalfFloatLinear"]
      .map(capability => viewer => { viewer.scene.context[capability] = false; }),
  ];
  for (const mutate of mutations) {
    const harness = await createHarness();
    const viewer = harness.createViewer();
    mutate(viewer);
    assert.throws(() => new harness.BetterSky(viewer), /BetterSky/);
    assert.equal(harness.counters.installs, 0);
    assert.equal(harness.passes.length, 0);
    assert.equal(viewer.scene.highDynamicRange, false);
    assert.equal(viewer.stages.size, 0);
    assert.equal(viewer.callbacks.size, 0);
    // Rejection must not leave the global lease occupied.
    new harness.BetterSky(harness.createViewer()).dispose();
  }
  for (const capability of ["Float16Array", "structuredClone"]) {
    const harness = await createHarness({ globals: { [capability]: undefined } });
    assert.throws(() => new harness.BetterSky(harness.createViewer()), new RegExp(capability));
    assert.equal(harness.counters.installs, 0);
    assert.equal(harness.passes.length, 0);
  }
});

test("an unsupported frame stops all passes once and requires dispose and reconstruction", async () => {
  for (const invalidate of [
    viewer => { viewer.scene.mode = Cesium.SceneMode.SCENE2D; },
    viewer => { viewer.scene.camera.frustum = new Cesium.OrthographicFrustum(); },
    viewer => { viewer.scene.globe = undefined; },
  ]) {
    const harness = await createHarness();
    const viewer = harness.createViewer();
    const effects = new harness.BetterSky(viewer);
    viewer.render();
    assert.equal(harness.counters.updates, 3);
    invalidate(viewer);
    for (let frame = 0; frame < 3; frame++) viewer.render();
    assert.equal(harness.counters.updates, 3);
    assert.equal(harness.errors.length, 1);
    assert(harness.passes.every(pass => !pass.enabled));
    Object.assign(viewer.scene, { mode: Cesium.SceneMode.SCENE3D, globe: {} });
    viewer.scene.camera.frustum = new Cesium.PerspectiveFrustum();
    effects.enabled = true;
    effects.smaaEnabled = true;
    assert.throws(() => effects.update({ enabled: true }), /重建/);
    viewer.render();
    assert.equal(harness.counters.updates, 3);
    assert(harness.passes.every(pass => !pass.enabled));
    effects.dispose();
    new harness.BetterSky(viewer).dispose();
  }
});

test("a failed public constructor releases passes and singleton lease and restores scene and clock", async () => {
  const harness = await createHarness({ failPreRender: true });
  const viewer = harness.createViewer();
  const originalTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
  assert.throws(() => new harness.BetterSky(viewer), /injected/);
  assert.equal(viewer.scene.highDynamicRange, false);
  assert.equal(viewer.scene.logarithmicDepthBuffer, false);
  assert.equal(viewer.scene.gamma, 1);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, false);
  assert(Cesium.JulianDate.equals(viewer.clock.currentTime, originalTime));
  assert.equal(viewer.stages.size, 0);
  assert.equal(viewer.callbacks.size, 0);
  assert(harness.passes.every(pass => pass.destroyed));
  assert.throws(() => new harness.BetterSky(viewer), /injected/);
});
