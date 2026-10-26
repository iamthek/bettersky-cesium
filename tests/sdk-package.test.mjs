import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';
import { compactShader, validateShaderAssembly } from '../scripts/sdk/build.mjs';
import { emitPublicDeclarations } from '../scripts/sdk/declarations.mjs';
import { copyrightLine, inspectJavaScript, inspectPublicDeclarations, readAssetManifest, readJson, readTarEntries, repoRoot, validatePackageEntries } from '../scripts/sdk/shared.mjs';

function tarEntry(name, { type = '0', data = Buffer.from('ok') } = {}) {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write(`${header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0')}\0 `, 148);
  return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512), Buffer.alloc(1024)]);
}

test('tar reader retains bytes without extracting and rejects traversal, links and corrupt headers', () => {
  const [entry] = readTarEntries(tarEntry('package/dist/index.js'));
  assert.equal(entry.path, 'dist/index.js');
  assert.equal(entry.data.toString(), 'ok');
  assert.throws(() => readTarEntries(tarEntry('package/../secret')), /Unsafe package path/);
  assert.throws(() => readTarEntries(tarEntry('package/link', { type: '2' })), /Unsupported tar entry/);
  const corrupt = tarEntry('package/index.js');
  corrupt[0] ^= 1;
  assert.throws(() => readTarEntries(corrupt), /checksum/);
});

test('release gate accepts Apache-2.0 metadata and NOTICE and rejects changed publication contracts', async () => {
  const root = await readJson(join(repoRoot, 'package.json'));
  const assets = await readAssetManifest();
  const manifest = {
    name: root.name, version: root.version, type: 'module', license: 'Apache-2.0', author: root.author,
    repository: { type: 'git', url: 'git+https://github.com/iamthek/bettersky-cesium.git' },
    bugs: { url: 'https://github.com/iamthek/bettersky-cesium/issues' },
    homepage: 'https://iamthek.github.io/bettersky-cesium/',
    files: ['dist/index.js', 'dist/index.d.ts', 'dist/assets/', 'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }, types: './dist/index.d.ts',
    peerDependencies: { cesium: '>=1.142.0' }, dependencies: { three: '>=0.160.1' },
  };
  const bundle = `/*! BetterSky for Cesium ${root.version}. ${copyrightLine(root.author)}. SPDX-License-Identifier: Apache-2.0. */\nimport {Cartesian2} from 'cesium';class BetterSky{};export {BetterSky};`;
  const entries = [
    { path: 'package.json', data: Buffer.from(JSON.stringify(manifest)) },
    { path: 'dist/index.js', data: Buffer.from(bundle) },
    { path: 'dist/index.d.ts', data: await emitPublicDeclarations() },
    ...await Promise.all(['README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'].map(async path => ({ path, data: await readFile(join(repoRoot, path)) }))),
    ...await Promise.all(assets.assets.map(async asset => ({ path: `dist/assets/${asset.path}`, data: await readFile(join(repoRoot, 'static/BetterSkyAssets', asset.path)) }))),
  ];
  assert.equal((await validatePackageEntries(entries)).license, 'Apache-2.0');
  const replaceEntry = (path, data) => entries.map(entry => entry.path === path ? { path, data } : entry);
  for (const changed of [
    { license: 'SEE LICENSE IN LICENSE' },
    { repository: { type: 'git', url: 'git+https://github.com/other/project.git' } },
    { bugs: { url: 'https://github.com/other/project/issues' } },
    { homepage: 'https://www.npmjs.com/package/bettersky-cesium' },
    { author: { ...manifest.author, name: 'Other author' } },
    { files: [...manifest.files, 'README.zh-CN.md'] },
    { private: true },
  ]) {
    await assert.rejects(validatePackageEntries(replaceEntry('package.json', Buffer.from(JSON.stringify({ ...manifest, ...changed })))), /Invalid release package metadata|Release contact metadata|Invalid ESM\/type\/file exports/);
  }
  await assert.rejects(validatePackageEntries(entries.filter(entry => entry.path !== 'NOTICE')), /Missing package file: NOTICE/);
  await assert.rejects(validatePackageEntries(replaceEntry('NOTICE', Buffer.from('Changed copyright notice'))), /Packaged document differs.*NOTICE/);
  await assert.rejects(validatePackageEntries(replaceEntry('dist/index.js', Buffer.from(bundle.replace('SPDX-License-Identifier: Apache-2.0.', '')))), /Bundle banner/);
  for (const path of ['README.zh-CN.md', 'src/index.ts', 'dist/index.js.map', '.env.local', 'screenshots/demo.png']) {
    await assert.rejects(validatePackageEntries([...entries, { path, data: Buffer.from('not public package content') }]), /Unexpected or duplicate package file/);
  }
});

test('generated public declarations document every member and parameter and retain UTF-8 archive bytes', async () => {
  const bytes = await emitPublicDeclarations();
  assert.ok(inspectPublicDeclarations(bytes.toString('utf8')).declarations > 0);
  const [entry] = readTarEntries(tarEntry('package/dist/index.d.ts', { data: bytes }));
  assert.deepEqual(entry.data, bytes);
});

test('declaration checks reject removed or empty JSDoc and parameter descriptions before packing', async () => {
  const source = (await emitPublicDeclarations()).toString('utf8');
  const mutations = [
    [source.replace(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*(enabled\?: boolean;)/, '$1'), /Missing JSDoc.*BetterSkyHbaoOptions.enabled/],
    [source.replace(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*(enabled\?: boolean;)/, '/** @default true */\n  $1'), /Empty JSDoc description.*BetterSkyHbaoOptions.enabled/],
    [source.replace(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*(enabled\?: boolean;)/, '/** */\n  $1'), /Empty JSDoc description.*BetterSkyHbaoOptions.enabled/],
    [source.replace(/^[\t ]*\* @param viewerOrScene[^\r\n]*(?:\r?\n|$)/m, ''), /Missing @param.*BetterSkyConstructor.constructor.viewerOrScene/],
    [source.replace(/(@param viewerOrScene)[^\r\n]*/, '$1'), /Missing @param.*BetterSkyConstructor.constructor.viewerOrScene/],
    [source.replace(/\/\*\*[\s\S]*?\*\//g, ''), /Missing JSDoc/],
  ];
  for (const [modified, expected] of mutations) {
    assert.notEqual(modified, source, 'The fixture mutation must remove a reviewed comment.');
    assert.throws(() => inspectPublicDeclarations(modified), expected);
    await assert.rejects(validatePackageEntries([{ path: 'dist/index.d.ts', data: Buffer.from(modified) }]), expected);
    const entries = readTarEntries(tarEntry('package/dist/index.d.ts', { data: Buffer.from(modified) }));
    await assert.rejects(validatePackageEntries(entries), expected);
  }
});

test('declaration checks distinguish method parameters from punctuation inside field types', () => {
  const source = `/** Fixture options. */
export interface Options {
  /** Callback type. */
  callback?: (value: [number, number]) => void;
  /** Update options.\n   * @param options Updated values.\n   * @param amount Update amount.\n   */
  update(options: Map<string, [number, number]>, amount?: number): void;
}
`;
  assert.doesNotThrow(() => inspectPublicDeclarations(source));
  assert.throws(() => inspectPublicDeclarations(source.replace(' @param amount Update amount.', '')), /Missing @param.*Options.update.amount/);
  assert.doesNotThrow(() => inspectPublicDeclarations(source.replace('callback?: (value: [number, number]) => void;', 'callback?: (value: [number, number]) => void; /** Documented field. */ documented: number;')));
  assert.throws(() => inspectPublicDeclarations(source.replace('callback?: (value: [number, number]) => void;', 'callback?: (value: [number, number]) => void; undocumented: number;')), /Missing JSDoc.*Options.undocumented/);
});

test('ESM validation requires external dependencies and blocks dynamic code execution', () => {
  const safe = "import {Cartesian2} from 'cesium';class BetterSky{};export {BetterSky};";
  assert.deepEqual(inspectJavaScript(safe).exports.sort(), ['BetterSky']);
  assert.throws(() => inspectJavaScript(safe + 'export default BetterSky;'), /Unexpected public exports/);
  assert.throws(() => inspectJavaScript(safe + "eval('1')"), /Forbidden dynamic/);
  assert.throws(() => inspectJavaScript(safe + "new Function('return 1')"), /Forbidden dynamic/);
  assert.throws(() => inspectJavaScript(safe + "globalThis['Function']('return 1')"), /Forbidden dynamic/);
  assert.throws(() => inspectJavaScript(safe.replace("'cesium'", "'./Library/private.js'")), /Unexpected SDK import/);
});

test('ESM validation accepts named Cesium imports and rejects whole-module imports and re-exports', () => {
  const publicApi = 'class BetterSky{};export {BetterSky};';
  assert.deepEqual(inspectJavaScript("import {Cartesian2 as Position} from 'cesium';" + publicApi).imports, ['cesium']);
  for (const statement of [
    "import * as Cesium from 'cesium';",
    "import Cesium from 'cesium';",
    "import {default as Cesium} from 'cesium';",
    "import {\"default\" as Cesium} from 'cesium';",
    "import * as Cesium from 'cesium/Source/Cesium.js';",
    "import 'cesium';",
  ]) assert.throws(() => inspectJavaScript(statement + publicApi), /Cesium imports must use explicit named exports/);
  for (const statement of [
    "export * from 'cesium';",
    "export * as Cesium from 'cesium';",
    "export {default as Cesium} from 'cesium';",
  ]) assert.throws(() => inspectJavaScript(statement + publicApi), /Cesium namespace\/default re-exports are forbidden/);
});

test('named Cesium imports omit unused engine exports and reject invalid dependency re-exports', async () => {
  const buildConsumer = (source, engineSource = 'export class Cartesian2 {} export class UnusedExport {}') => {
    const modules = new Map([
      ['fixture:sdk', source],
      ['cesium', "export {Cartesian2, UnusedExport} from 'fixture:engine';"],
      ['fixture:engine', engineSource],
    ]);
    return build({
      configFile: false, publicDir: false, logLevel: 'silent',
      plugins: [{
        name: 'cesium-unused-export-fixture',
        enforce: 'pre',
        resolveId: id => modules.has(id) ? `\0${id}` : null,
        load: id => modules.get(id.slice(1)) ?? null,
      }],
      build: {
        write: false, emptyOutDir: false, copyPublicDir: false, minify: false,
        lib: { entry: 'fixture:sdk', formats: ['es'], fileName: () => 'index.js' },
        rolldownOptions: { input: 'fixture:sdk' },
      },
    });
  };
  const publicApi = 'export {BetterSky};';
  const named = "import {Cartesian2} from 'cesium';class BetterSky {static position = Cartesian2;}" + publicApi;
  const namespace = "import * as Cesium from 'cesium';class BetterSky {static cesium = Cesium;}" + publicApi;
  const namedResult = await buildConsumer(named);
  const namespaceResult = await buildConsumer(namespace);
  const codeOf = result => (Array.isArray(result) ? result.flatMap(item => item.output) : result.output).map(item => item.code || '').join('\n');
  assert.ok(!codeOf(namedResult).includes('UnusedExport'));
  assert.ok(codeOf(namespaceResult).includes('UnusedExport'));
  // Rolldown validates all re-exports before tree shaking, even when the SDK only
  // imports named exports. Preserve this guard for mismatched Cesium components.
  await assert.rejects(buildConsumer(named, 'export class Cartesian2 {}'), /MISSING_EXPORT/);
  await assert.rejects(buildConsumer(namespace, 'export class Cartesian2 {}'), /MISSING_EXPORT/);
});

test('shader compaction preserves directives, protected markers and exact shadow fragments', async () => {
  const source = '#define SAMPLE_COUNT 4\n// safely removable explanation\n/*__CLOUD_LAYER_DENSITY__*/\nfloat transmittanceSum = 0.0;\n';
  const compacted = compactShader(source);
  assert.ok(!compacted.includes('safely removable'));
  assert.ok(compacted.includes('#define SAMPLE_COUNT 4\n'));
  assert.ok(compacted.includes('/*__CLOUD_LAYER_DENSITY__*/'));
  assert.ok(compacted.includes('float transmittanceSum = 0.0;'));
  assert.equal((await validateShaderAssembly()).focusedReplacements, 3);
});
