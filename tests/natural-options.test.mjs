import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OPTIONS, cloneOptions, mergeOptions, prepareOptions } from "../src/options.js";

test("natural lighting defaults keep sunlight, ambient fill, and Gaussian calibration independent", () => {
  const options = cloneOptions(DEFAULT_OPTIONS);
  assert.equal(options.highDynamicRange, true);
  assert.equal(options.toneMappingMode, 8);
  assert.equal(options.toneMappingExposure, 1);
  assert.equal(options.irradianceScale, 1);
  assert.equal(options.depthTestAgainstTerrain, true);
  assert.deepEqual(options.cloud.denoise, { temporalAlpha: 0.12, currentFrameAlpha: 0.35,
    motionAlpha: 0.6, varianceGamma: 1.25, spatialFilterStrength: 0.35 });
  assert.deepEqual(options.lighting, {
    sunIntensity: 2, ambientIntensity: 1.2,
    shadows: { enabled: true, maximumDistance: 1500, size: 1024, softShadows: true },
  });
  assert.deepEqual(options.gaussianSplat, { colorSpace: "auto", exposureOffset: -0.5, daylightResponse: true });
  assert.deepEqual([options.hbao.maxRadius, options.hbao.blackPoint, options.hbao.whitePoint, options.hbao.gamma], [5, 0, 0.85, 1]);
  options.lighting.shadows.size = 4096;
  options.gaussianSplat.exposureOffset = 2;
  assert.equal(DEFAULT_OPTIONS.lighting.shadows.size, 1024);
  assert.equal(DEFAULT_OPTIONS.gaussianSplat.exposureOffset, -0.5);
});

test("partial lighting and Gaussian updates preserve unrelated nested settings and caller ownership", () => {
  const input = { lighting: { ambientIntensity: 1.5, shadows: { enabled: false } }, gaussianSplat: { exposureOffset: -2 } };
  const { options } = prepareOptions(input);
  const merged = mergeOptions(DEFAULT_OPTIONS, options);
  assert.equal(merged.lighting.sunIntensity, 2);
  assert.equal(merged.lighting.ambientIntensity, 1.5);
  assert.equal(merged.lighting.shadows.enabled, false);
  assert.equal(merged.lighting.shadows.maximumDistance, 1500);
  assert.equal(merged.gaussianSplat.colorSpace, "auto");
  assert.equal(merged.gaussianSplat.exposureOffset, -2);
  options.lighting.shadows.enabled = true;
  assert.equal(input.lighting.shadows.enabled, false);
});

test("natural lighting configuration rejects invalid nested values before applying any command", () => {
  for (const input of [
    { preserveModelColors: true }, { preserveModelColors: false }, { preserveModelColors: undefined },
    { lighting: null }, { lighting: { sunIntensity: -1 } }, { lighting: { ambientIntensity: Infinity } },
    { lighting: { unknown: undefined } }, { lighting: { shadows: false } },
    { lighting: { shadows: { enabled: 1 } } }, { lighting: { shadows: { maximumDistance: 0 } } },
    { lighting: { shadows: { size: 1000 } } }, { lighting: { shadows: { size: 0 } } },
    { lighting: { shadows: { size: 1.5 } } }, { lighting: { shadows: { softShadows: "yes" } } },
    { lighting: { shadows: { unknown: undefined } } }, { gaussianSplat: null },
    { gaussianSplat: { colorSpace: "display-p3" } }, { gaussianSplat: { exposureOffset: NaN } },
    { gaussianSplat: { daylightResponse: 1 } }, { gaussianSplat: { unknown: undefined } },
  ]) {
    assert.throws(() => prepareOptions(input), /BetterSky/, JSON.stringify(input));
  }
  for (const colorSpace of ["auto", "srgb", "linear"]) {
    assert.doesNotThrow(() => prepareOptions({ lighting: { sunIntensity: 0, ambientIntensity: 0 },
      gaussianSplat: { colorSpace, exposureOffset: -12, daylightResponse: false } }));
  }
  for (const highDynamicRange of [true, false, null]) assert.doesNotThrow(() => prepareOptions({ highDynamicRange }));
});
