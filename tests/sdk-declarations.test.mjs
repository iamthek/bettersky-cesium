import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { emitPublicDeclarations, inspectPublicDeclarations, validateDeclarationContract } from '../scripts/sdk/declarations.mjs';

test('public declaration documentation supports multiline and nested TypeScript syntax', () => {
  const source = `/** Public options. */
export interface Options {
  /** Nested public settings. */
  settings?: {
    /** Display name. */
    name: string;
  };
  /** Apply an update.
   * @param options Values to apply.
   */
  update<T>(
    options: Map<string, [T, number]>,
  ): void;
}
`;
  assert.doesNotThrow(() => inspectPublicDeclarations(source));
  assert.throws(() => inspectPublicDeclarations(source.replace('/** Display name. */', '')), /Missing JSDoc.*Options.settings.name/);
  assert.throws(() => inspectPublicDeclarations(source.replace('   * @param options Values to apply.\n', '')), /Missing @param.*Options.update.options/);
});

test('TypeScript emits only the documented public facade without implementation paths or maps', async () => {
  const source = (await emitPublicDeclarations()).toString('utf8');
  assert.match(source, /export declare const BetterSky: BetterSkyConstructor/);
  assert.match(source, /preloadAssets\(\): Promise<void>/);
  assert.match(source, /new \(viewerOrScene: Viewer \| Scene, options\?: BetterSkyOptions\): BetterSky/);
  assert.match(source, /getOptions\(\): BetterSkyResolvedOptions/);
  assert.match(source, /getDefaultOptions\(\): BetterSkyResolvedOptions/);
  assert.match(source, /getAssetState\(\): BetterSkyAssetState/);
  assert.doesNotMatch(source, /export default|BetterSkyPass|readonly assetsReady|readonly defaultOptions/);
  assert.match(source, /@param viewerOrScene/);
  assert.match(source, /@default 0\.34/);
  assert.doesNotMatch(source, /RuntimeBetterSky|BetterSky\.js|Library\/|\.\.\/|sourceMappingURL|sourceURL/);
  const facade = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.doesNotThrow(() => validateDeclarationContract(source, facade));
  assert.throws(() => validateDeclarationContract(source.replace('coverage?: number', 'coverage?: string'), facade), /differ from the reviewed typed API/);
});

test('generated types preserve constructor reflection, subclassing, and valid consumer calls', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.sdk-type-consumer-'));
  try {
    await writeFile(join(directory, 'index.d.ts'), await emitPublicDeclarations());
    await writeFile(join(directory, 'consumer.ts'), `
import { BetterSky, type BetterSkyOptions, type BetterSkyResolvedOptions, type BetterSkyAssetState } from './index.js';
import type { Viewer } from 'cesium';
declare const viewer: Viewer;
const constructor: typeof BetterSky = BetterSky;
const name: string = constructor.name;
const defaults: BetterSkyResolvedOptions = BetterSky.getDefaultOptions();
defaults.cloud.altitudes[0] = 4500;
const enabled: boolean = defaults.hbao.enabled;
const denoise: boolean = defaults.hbao.denoise;
const preset = { time: undefined, cloud: { altitudes: [4000, 6000, 10000, 0], hazeSunColor: [1, 0.78, 0.42], layerTypes: ['cumulus', 'altocumulus', 'cirrus'], lodRange: [200000, 500000] }, localWeatherVelocity: [0, 0] } as const;
const options: BetterSkyOptions = preset;
const namedPreload: Promise<void> = BetterSky.preloadAssets();
const constructorPreload: Promise<void> = constructor.preloadAssets();
class Extended extends BetterSky {}
const betterSkyInstance: InstanceType<typeof BetterSky> = new Extended(viewer, { ...options, hbao: { enabled: false, denoise: false } });
const snapshot: BetterSkyResolvedOptions = betterSkyInstance.getOptions();
const completeAltitude: number = snapshot.cloud.altitudes[0];
const completeDenoise: number = snapshot.cloud.denoise.temporalAlpha;
betterSkyInstance.update({ toneMappingMode: 2, hbao: { enabled: true, intensity: 80 }, snow: true, rain: false, nightGlowIntensity: 0.5 });
const unsubscribe = betterSkyInstance.subscribeAssets((state: BetterSkyAssetState) => {
  const status: string = state.status;
  // @ts-expect-error Resource snapshots are read-only.
  state.status = 'ready';
  // @ts-expect-error Resource error arrays are read-only.
  state.errors.push({});
});
const resources: BetterSkyAssetState = betterSkyInstance.getAssetState();
const ready: Promise<void> = betterSkyInstance.loadAssets();
const retried: Promise<void> = betterSkyInstance.retryAssets();
// @ts-expect-error Denoising is construction-only in runtime updates.
betterSkyInstance.update({ hbao: { denoise: false } });
// @ts-expect-error Unsupported historical mode must fail within the unified update API.
betterSkyInstance.update({ toneMappingMode: 3 });
// @ts-expect-error HBAO requires an object.
betterSkyInstance.update({ hbao: false });
// @ts-expect-error Unknown public option.
betterSkyInstance.update({ unknown: true });
// @ts-expect-error The internal implementation name has been replaced.
betterSkyInstance.update({ darkParamY: 0.5 });
// @ts-expect-error The static getter has been removed.
BetterSky.defaultOptions;
// @ts-expect-error Shortcuts have been removed.
betterSkyInstance.coverage = 0.5;
// @ts-expect-error Cloud setters have been removed.
betterSkyInstance.setCloudAltitudes([1, 2, 3, 0]);
// @ts-expect-error Passive-looking resource loading getter has been removed.
betterSkyInstance.assetsReady;
// @ts-expect-error Separate resource status getters have been removed.
betterSkyInstance.assetStatus;
// @ts-expect-error Separate resource error getters have been removed.
betterSkyInstance.assetErrors;
// @ts-expect-error Internal passes are not public.
betterSkyInstance.pass;
unsubscribe(); betterSkyInstance.dispose();
`);
    const require = createRequire(import.meta.url);
    const manifestPath = require.resolve('typescript/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const result = spawnSync(process.execPath, [join(dirname(manifestPath), manifest.bin.tsc), '--ignoreConfig', '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--skipLibCheck', 'false', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM', join(directory, 'consumer.ts')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    const child = relative(process.cwd(), directory);
    if (child.startsWith('.sdk-type-consumer-') && !child.includes('/') && !child.includes('\\')) await rm(directory, { recursive: true, force: true });
  }
});
