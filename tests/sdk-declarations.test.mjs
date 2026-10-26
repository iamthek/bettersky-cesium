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
  assert.match(source, /getOptions\(\): BetterSkyOptions/);
  assert.match(source, /readonly assetsReady: Promise<void>/);
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
import BetterSky, { BetterSky as Named, type BetterSkyOptions } from './index.js';
import type { Viewer } from 'cesium';
declare const viewer: Viewer;
const constructor: typeof BetterSky = Named;
const name: string = constructor.name;
const defaultPreload: Promise<void> = BetterSky.preloadAssets();
const namedPreload: Promise<void> = Named.preloadAssets();
const constructorPreload: Promise<void> = constructor.preloadAssets();
class Extended extends Named {}
const effects: InstanceType<typeof Named> = new Extended(viewer, { hbao: { denoise: false } });
const options: BetterSkyOptions = effects.getOptions();
effects.coverage = 0.5;
effects.update({ toneMappingMode: 2, hbao: { intensity: 80 } });
effects.subscribeAssets(() => { const state: string = effects.assetStatus; });
const ready: Promise<void> = effects.assetsReady;
if (effects.pass) effects.pass.showSnow = false;
// @ts-expect-error Denoising is construction-only in runtime updates.
effects.update({ hbao: { denoise: false } });
// @ts-expect-error Unsupported historical mode.
effects.toneMappingMode = 3;
// @ts-expect-error Unknown public option.
effects.update({ unknown: true });
`);
    const require = createRequire(import.meta.url);
    const manifestPath = require.resolve('typescript/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const result = spawnSync(process.execPath, [join(dirname(manifestPath), manifest.bin.tsc), '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM', join(directory, 'consumer.ts')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    const child = relative(process.cwd(), directory);
    if (child.startsWith('.sdk-type-consumer-') && !child.includes('/') && !child.includes('\\')) await rm(directory, { recursive: true, force: true });
  }
});
