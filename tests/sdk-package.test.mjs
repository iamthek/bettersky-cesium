import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { compactShader, validateShaderAssembly } from '../scripts/sdk/build.mjs';
import { inspectJavaScript, readTarEntries } from '../scripts/sdk/shared.mjs';

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

test('ESM validation requires external dependencies and blocks dynamic code execution', () => {
  const safe = "import {Cartesian2} from 'cesium';class BetterSky{};export {BetterSky};export default BetterSky;";
  assert.deepEqual(inspectJavaScript(safe).exports.sort(), ['BetterSky', 'default']);
  assert.throws(() => inspectJavaScript(safe + "eval('1')"), /Forbidden dynamic/);
  assert.throws(() => inspectJavaScript(safe + "new Function('return 1')"), /Forbidden dynamic/);
  assert.throws(() => inspectJavaScript(safe + "globalThis['Function']('return 1')"), /Forbidden dynamic/);
  assert.throws(() => inspectJavaScript(safe.replace("'cesium'", "'./Library/private.js'")), /Unexpected SDK import/);
});

test('ESM validation accepts named Cesium imports and rejects whole-module imports and re-exports', () => {
  const publicApi = 'class BetterSky{};export {BetterSky};export default BetterSky;';
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

test('named Cesium imports avoid resolving unrelated missing engine re-exports in consumer bundles', async () => {
  const buildConsumer = source => {
    const modules = new Map([
      ['fixture:sdk', source],
      ['cesium', "export {Cartesian2, MissingExport} from 'fixture:engine';"],
      ['fixture:engine', 'export class Cartesian2 {}'],
    ]);
    return build({
      configFile: false, publicDir: false, logLevel: 'silent',
      plugins: [{
        name: 'cesium-missing-export-fixture',
        enforce: 'pre',
        resolveId: id => modules.has(id) ? `\0${id}` : null,
        load: id => modules.get(id.slice(1)) ?? null,
      }],
      build: {
        write: false, emptyOutDir: false, copyPublicDir: false, minify: false,
        lib: { entry: 'fixture:sdk', formats: ['es'], fileName: () => 'index.js' },
        rollupOptions: { input: 'fixture:sdk' },
      },
    });
  };
  const publicApi = 'export {BetterSky};export default BetterSky;';
  const named = "import {Cartesian2} from 'cesium';class BetterSky {static position = Cartesian2;}" + publicApi;
  const namespace = "import * as Cesium from 'cesium';class BetterSky {static cesium = Cesium;}" + publicApi;
  await assert.doesNotReject(buildConsumer(named));
  await assert.rejects(buildConsumer(namespace), /MissingExport.*not exported/);
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
