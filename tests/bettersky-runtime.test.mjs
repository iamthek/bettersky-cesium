import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as Cesium from "cesium";

// Exercise the public entry against observable host mutations, using real Cesium
// scene-mode/frustum values and counted pass wrappers instead of a WebGL device.
async function createHarness({ globals = {}, failPreRender = false, preloadAssets = () => Promise.resolve() } = {}) {
  const passes = [];
  const errors = [];
  const counters = { installs: 0, updates: 0, preloads: 0 };
  const context = vm.createContext({
    Float16Array: Uint16Array,
    structuredClone,
    console: { error: (...args) => errors.push(args) },
    ...globals,
  });
  class Pass {
    constructor(scene, options) {
      this.scene = scene;
      this.options = options;
      this.enabled = options.show;
      this.stage = { enabled: options.show, destroyed: false,
        isDestroyed() { return this.destroyed; },
        destroy() { assert.equal(this.destroyed, false); this.destroyed = true; } };
      this.cloudMaterialPass = { hazeSunColor: new Cesium.Cartesian3(), invalidateHistory() {} };
      this._customDarkParam = {};
      this.assetStatus = "ready";
      this.assetErrors = Object.freeze([]);
      this.assetsReady = Promise.resolve();
      this.destroyed = false;
      passes.push(this);
    }
    update() { counters.updates++; }
    setVolumetricLightOptions(options) { this.volumetricLight = options; }
    retryAssets() { return this.assetsReady; }
    subscribeAssets(listener) { this.assetListener = listener; return () => { this.assetListener = undefined; }; }
    restoreScene() {}
    isDestroyed() { return this.destroyed; }
    destroy() {
      assert.equal(this.destroyed, false);
      this.destroyed = true;
      if (!this.stage.isDestroyed()) this.stage.destroy();
    }
  }
  const source = await readFile(new URL("../BetterSky.js", import.meta.url), "utf8");
  const optionsSource = await readFile(new URL("../src/options.js", import.meta.url), "utf8");
  async function loadEntry() {
    const entry = new vm.SourceTextModule(source, { context });
    await entry.link(specifier => {
      if (specifier === "./src/options.js") return new vm.SourceTextModule(optionsSource, { context });
      const exports = specifier === "cesium" ? Cesium : specifier.endsWith("preloadAssets.js")
        ? { default() { counters.preloads++; return preloadAssets(); } }
        : specifier.endsWith("viewportQuadCommand.js")
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

test("static preloading forwards completion and failure without constructing an instance", async () => {
  let resolvePreload;
  let rejectPreload;
  let pending = new Promise(resolve => { resolvePreload = resolve; });
  const harness = await createHarness({ preloadAssets: () => pending });
  assert.equal(harness.BetterSky.preloadAssets(), pending);
  assert.equal(harness.counters.preloads, 1);
  assert.equal(harness.counters.installs, 0);
  assert.equal(harness.passes.length, 0);
  resolvePreload();
  assert.equal(await pending, undefined);

  pending = new Promise((resolve, reject) => { rejectPreload = reject; });
  const failure = new AggregateError([new Error("missing asset")], "preload failed");
  const rejected = assert.rejects(harness.BetterSky.preloadAssets(), error => error === failure);
  rejectPreload(failure);
  await rejected;
  assert.equal(harness.passes.length, 0);

  // Preloading does not acquire the active-instance lease or require rendering globals.
  new harness.BetterSky(harness.createViewer()).dispose();
  const unsupported = await createHarness({ globals: { Float16Array: undefined, structuredClone: undefined } });
  assert.equal(await unsupported.BetterSky.preloadAssets(), undefined);
  assert.equal(unsupported.counters.installs, 0);
  assert.equal(unsupported.passes.length, 0);
});

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
  assert.throws(() => { effects.smaaEnabled = true; }, /已销毁/);
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
    assert.throws(() => { effects.enabled = true; }, /重建/);
    assert.throws(() => { effects.smaaEnabled = true; }, /重建/);
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

const snapshot = effects => structuredClone(effects.getOptions());

test("default snapshots preserve the shipped preset and never share caller-owned objects", async () => {
  const harness = await createHarness();
  const defaults = harness.BetterSky.defaultOptions;
  assert.equal(defaults.time, "2026-05-01T06:00Z");
  assert.equal(defaults.gamma, 2.2);
  assert.equal(defaults.volumetricLight.mode, "volumetric");
  assert.equal(defaults.cloud.hazeQuality, "high");
  assert.equal(defaults.hbao.intensity, 100);
  defaults.cloud.altitudes[0] = 99;
  defaults.hbao.gamma = 99;
  const viewer = harness.createViewer();
  const effects = new harness.BetterSky(viewer);
  const original = snapshot(effects);
  assert.equal(original.cloud.altitudes[0], 4000);
  assert.equal(original.hbao.gamma, 2.5);
  assert.equal(original.hbao.denoise, true);
  assert.equal(viewer.scene.gamma, 2.2);
  assert.equal(viewer.scene.highDynamicRange, true);
  assert.equal(harness.passes[0].options.denoise, true);
  assert(Cesium.JulianDate.equals(viewer.clock.currentTime, Cesium.JulianDate.fromIso8601("2026-05-01T06:00Z")));
  const copy = effects.getOptions();
  copy.cloud.denoise.temporalAlpha = 0.9;
  copy.localWeatherVelocity[0] = 90;
  copy.hbao.intensity = 90;
  assert.deepEqual(snapshot(effects), original);
  effects.dispose();
});

test("all convenience setters save the same normalized configuration as update and retain HBAO values", async () => {
  const harness = await createHarness();
  const effects = new harness.BetterSky(harness.createViewer());
  const cases = [
    [() => { effects.coverage = 0.62; }, { coverage: 0.62 }],
    [() => { effects.toneMappingExposure = 3.5; }, { toneMappingExposure: 3.5 }],
    [() => { effects.toneMappingMode = 7; }, { toneMappingMode: 7 }],
    [() => { effects.localWeatherVelocity = new Cesium.Cartesian2(-0.1, 0.2); }, { localWeatherVelocity: [-0.1, 0.2] }],
    [() => effects.setCloudAltitudes(new Cesium.Cartesian4(1000, 3000, 5000, 0)), { cloud: { altitudes: [1000, 3000, 5000, 0] } }],
    [() => effects.setCloudHeights([100, 200, 300, 0]), { cloud: { heights: [100, 200, 300, 0] } }],
    [() => effects.setCloudDensityScales([0.2, 0.3, 0.4, 0]), { cloud: { densityScales: [0.2, 0.3, 0.4, 0] } }],
    [() => effects.setCloudShapeDetailAmounts([0.4, 0.3, 0.2, 0]), { cloud: { shapeDetailAmounts: [0.4, 0.3, 0.2, 0] } }],
    [() => { effects.hbaoIntensity = 55; }, { hbao: { intensity: 55 } }],
    [() => { effects.hbaoMaxRadius = 45; }, { hbao: { maxRadius: 45 } }],
    [() => { effects.smaaEnabled = false; }, { smaa: false }],
    [() => { effects.enabled = false; }, { enabled: false }],
  ];
  for (const [set, patch] of cases) {
    set();
    const viaSetter = snapshot(effects);
    effects.update(patch);
    assert.deepEqual(snapshot(effects), viaSetter);
  }
  assert.equal(effects.pass.coverage, 0.62);
  assert.deepEqual(Cesium.Cartesian4.pack(effects.pass.cloudMaterialPass.altitudes, []), [1000, 3000, 5000, 0]);
  effects.enabled = true;
  effects.hbaoEnabled = false;
  effects.hbaoIntensity = 65;
  assert.equal(effects.hbaoEnabled, false);
  assert.equal(effects.getOptions().hbao, false);
  effects.hbaoEnabled = true;
  assert.equal(effects.getOptions().hbao.intensity, 65);
  assert.equal(effects.getOptions().hbao.maxRadius, 45);
  assert.equal(harness.passes[0]._intensity, 65);
  effects.update({ hbao: false });
  effects.update({ hbao: { bias: 0.15 } });
  assert.equal(effects.getOptions().hbao.intensity, 65);
  assert.equal(effects.getOptions().hbao.bias, 0.15);
  effects.dispose();
});

test("invalid commands reject all fields before committing configuration, host settings, time, or pass values", async () => {
  const harness = await createHarness();
  const viewer = harness.createViewer();
  const effects = new harness.BetterSky(viewer);
  const original = snapshot(effects);
  const originalTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
  const invalidCommands = [
    { unknown: true }, { cloud: { unknown: true } }, { hbao: { unknown: 1 } }, { volumetricLight: { unknown: 1 } },
    { coverage: Infinity }, { coverage: -0.1 }, { coverage: 1.1 }, { toneMappingMode: 3 }, { gamma: 0 },
    { toneMappingExposure: NaN }, { irradianceScale: -1 }, { bloomIntensity: -1 }, { darkParamY: NaN },
    { aerialPerspectiveStrength: 2 }, { enabled: 1 }, { smaa: null }, { hbao: null }, { cloud: [] },
    { localWeatherVelocity: [0, Infinity] }, { localWeatherVelocity: [1] },
    { cloud: { altitudes: [1, 2, NaN, 0] } }, { cloud: { heights: [1, -2, 3, 0] } },
    { cloud: { densityScales: [0, 0, Infinity, 0] } }, { cloud: { shapeDetailAmounts: [0, 2, 0, 0] } },
    { cloud: { hazeSunColor: [1, -1, 1] } }, { cloud: { hazeGroundDensityScale: 2 } },
    { cloud: { hazeAnisotropy: 0.95 } }, { cloud: { hazeDensityScale: -1 } },
    { cloud: { hazeHeightFalloff: 0 } }, { cloud: { lodRange: [50, 10] } },
    { cloud: { denoise: { motionAlpha: 2 } } }, { cloud: { denoise: { unknown: 0 } } },
    { volumetricLight: { density: NaN } }, { volumetricLight: { maxDistance: 0 } },
    { hbao: { intensity: -1 } }, { hbao: { gamma: 0 } }, { hbao: { blackPoint: 1 } },
    { time: "invalid time" }, { time: 123 }, { time: "" },
    JSON.parse('{"cloud":{"__proto__":{"polluted":true}}}'),
  ];
  for (const invalid of invalidCommands) {
    assert.throws(() => effects.update({ coverage: 0.8, gamma: 3, ...invalid }), /BetterSky/);
    assert.deepEqual(snapshot(effects), original);
    assert.equal(viewer.scene.gamma, 2.2);
    assert.equal(effects.pass.coverage, 0.34);
    assert(Cesium.JulianDate.equals(viewer.clock.currentTime, originalTime));
  }
  for (const set of [
    () => { effects.coverage = 2; }, () => { effects.toneMappingExposure = Infinity; },
    () => { effects.hbaoIntensity = -1; }, () => { effects.hbaoMaxRadius = NaN; },
    () => effects.setCloudHeights([1, -1, 1, 0]),
  ]) {
    assert.throws(set, /BetterSky/);
    assert.deepEqual(snapshot(effects), original);
  }
  effects.dispose();
});

test("constructor-only HBAO denoise accepts identical updates and rejects changes without partial commits", async () => {
  const harness = await createHarness();
  const effects = new harness.BetterSky(harness.createViewer(), { hbao: { denoise: false } });
  effects.update({ hbao: { denoise: false, intensity: 42 } });
  assert.equal(effects.getOptions().hbao.denoise, false);
  assert.equal(effects.getOptions().hbao.intensity, 42);
  const previous = snapshot(effects);
  assert.throws(() => effects.update({ coverage: 0.7, hbao: { denoise: true } }), /仅支持构造/);
  assert.deepEqual(snapshot(effects), previous);
  effects.hbaoEnabled = false;
  assert.throws(() => effects.update({ hbao: { denoise: true } }), /仅支持构造/);
  effects.hbaoEnabled = true;
  assert.equal(effects.getOptions().hbao.denoise, false);
  effects.dispose();
});

test("recommended artistic gain ranges remain usable beyond one", async () => {
  const harness = await createHarness();
  const effects = new harness.BetterSky(harness.createViewer(), { darkParamY: 2, hbao: { whitePoint: 1.5 } });
  assert.equal(effects.getOptions().darkParamY, 2);
  assert.equal(effects.pass._customDarkParam.y, 2);
  assert.equal(effects.getOptions().hbao.whitePoint, 1.5);
  assert.equal(harness.passes[0]._whitePoint, 1.5);
  effects.update({ darkParamY: -0.5, hbao: { whitePoint: 2.5 } });
  assert.equal(effects.getOptions().darkParamY, -0.5);
  assert.equal(effects.pass._customDarkParam.y, -0.5);
  assert.equal(effects.getOptions().hbao.whitePoint, 2.5);
  assert.equal(harness.passes[0]._whitePoint, 2.5);
  effects.dispose();
});

test("invalid constructor options reject before scene changes and validate time even without a Viewer clock", async () => {
  const harness = await createHarness();
  for (const options of [
    { time: "invalid time", gamma: 4 }, { coverage: 2 }, { cloud: { unknown: undefined } },
    { hbao: { denoise: 1 } }, { volumetricLight: { quality: "invalid" } },
  ]) {
    const viewer = harness.createViewer();
    assert.throws(() => new harness.BetterSky(viewer.scene, options), /BetterSky/);
    assert.equal(viewer.scene.gamma, 1);
    assert.equal(viewer.stages.size, 0);
    assert.equal(viewer.callbacks.size, 0);
    assert.equal(harness.passes.length, 0);
  }
  const effects = new harness.BetterSky(harness.createViewer().scene, { time: null });
  assert.throws(() => effects.update({ coverage: 0.8, time: "invalid time" }), /ISO 8601/);
  assert.equal(effects.coverage, 0.34);
  effects.dispose();
});

test("scene settings gates apply per command and snapshots report actual skipped scene settings", async () => {
  const harness = await createHarness();
  const viewer = harness.createViewer();
  const originalTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
  const effects = new harness.BetterSky(viewer, { applySceneSettings: false, time: undefined });
  assert.equal(effects.getOptions().gamma, 1);
  assert.equal(effects.getOptions().highDynamicRange, false);
  assert(Cesium.JulianDate.equals(viewer.clock.currentTime, originalTime));
  effects.update({ applySceneSettings: false, gamma: 4, highDynamicRange: true });
  assert.equal(viewer.scene.gamma, 1);
  assert.equal(effects.getOptions().gamma, 1);
  assert.equal(effects.getOptions().applySceneSettings, false);
  effects.update({ gamma: 3 });
  assert.equal(viewer.scene.gamma, 3);
  assert.equal(effects.getOptions().gamma, 3);
  assert.equal(effects.getOptions().applySceneSettings, true);
  effects.update({ time: "2025-05-01T00:00Z" });
  assert(Cesium.JulianDate.equals(viewer.clock.currentTime, Cesium.JulianDate.fromIso8601("2025-05-01T00:00Z")));
  effects.dispose();
});

test("input vectors are copied and legacy haze commands do not reinterpret saved defaults", async () => {
  const harness = await createHarness();
  const vector = new Cesium.Cartesian4(1, 2, 3, 0);
  const effects = new harness.BetterSky(harness.createViewer(), { cloud: { altitudes: vector } });
  vector.x = 999;
  assert.equal(effects.getOptions().cloud.altitudes[0], 1);
  assert.equal(effects.pass.cloudMaterialPass.altitudes.x, 1);
  assert.equal(effects.getOptions().volumetricLight.mode, "volumetric");
  effects.update({ cloud: { hazeDensityScale: 0.00002 } });
  assert.equal(effects.getOptions().volumetricLight.mode, "legacy");
  effects.update({ volumetricLight: { mode: "volumetric" }, cloud: { hazeDensityScale: 0.00003 } });
  assert.equal(effects.getOptions().volumetricLight.mode, "volumetric");
  const heights = [50, 100, 150, 0];
  effects.setCloudHeights(heights);
  heights[0] = 999;
  assert.equal(effects.getOptions().cloud.heights[0], 50);
  assert.equal(effects.pass.cloudMaterialPass.heights.x, 50);
  effects.dispose();
});

test("resource delegation stays observable after disposal and every mutating public entry rejects disposal", async () => {
  const harness = await createHarness();
  const effects = new harness.BetterSky(harness.createViewer());
  assert.equal(effects.assetStatus, "ready");
  assert(Object.isFrozen(effects.assetErrors));
  assert.equal(await effects.assetsReady, undefined);
  assert.equal(await effects.retryAssets(), undefined);
  const listener = () => {};
  const pass = effects.pass;
  const unsubscribe = effects.subscribeAssets(listener);
  assert.equal(pass.assetListener, listener);
  unsubscribe();
  assert.equal(pass.assetListener, undefined);
  effects.dispose();
  assert.equal(effects.assetStatus, "disposed");
  assert(Object.isFrozen(effects.assetErrors));
  assert.equal(await effects.assetsReady, undefined);
  const commands = [
    () => { effects.enabled = true; }, () => { effects.coverage = 0.5; },
    () => { effects.toneMappingExposure = 3; }, () => { effects.toneMappingMode = 7; },
    () => { effects.localWeatherVelocity = [0, 0]; }, () => { effects.hbaoEnabled = true; },
    () => { effects.hbaoIntensity = 10; }, () => { effects.hbaoMaxRadius = 10; },
    () => { effects.smaaEnabled = true; }, () => effects.setCloudAltitudes([1, 2, 3, 0]),
    () => effects.setCloudHeights([1, 2, 3, 0]), () => effects.setCloudDensityScales([0, 0, 0, 0]),
    () => effects.setCloudShapeDetailAmounts([0, 0, 0, 0]), () => effects.update({}),
    () => effects.retryAssets(), () => effects.subscribeAssets(listener),
  ];
  for (const command of commands) assert.throws(command, /已销毁/);
});
