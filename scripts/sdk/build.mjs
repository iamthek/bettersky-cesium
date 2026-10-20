import { build, normalizePath } from 'vite';
import { parse } from 'acorn';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { emitPublicDeclarations } from './declarations.mjs';
import {
  copyrightLine, distDirectory, inspectJavaScript, inspectPublicDeclarations, listDirectoryEntries, packageDirectory, readAssetManifest,
  readJson, removeOwnedDirectory, repoRoot, sha256, validatePackageEntries,
} from './shared.mjs';

function count(source, value) { return source.split(value).length - 1; }
function requireCount(source, value, expected = 1) {
  if (count(source, value) !== expected) throw new Error(`GLSL assembly expected ${expected} match(es): ${value}`);
}

// First release only removes redundant blank/standalone comment lines. Exact
// replacement fragments, preprocessor lines, token spacing and legal notices stay intact.
export function compactShader(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  const compacted = normalized.replace(/^[\t ]*\/\/[^\n]*(?:\n|$)/gm, line => /copyright|license|permission|redistribution|SPDX|@preserve/i.test(line) ? line : '\n').replace(/\n{3,}/g, '\n\n');
  const semantic = text => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/\s+/g, '');
  if (semantic(compacted) !== semantic(normalized)) throw new Error('Shader token sequence changed during compaction.');
  return compacted;
}

export async function validateShaderAssembly(shaders = new Map()) {
  const shader = async name => {
    const absolutePath = join(repoRoot, 'Library/shaders', name);
    return shaders.get(absolutePath) ?? compactShader(await readFile(absolutePath, 'utf8'));
  };
  const density = await shader('geospatial/cloudLayerDensity.glsl');
  const cloud = await shader('geospatial/cloudsMaterial.frag.glsl');
  const shadow = await shader('geospatial/shadowMaterial.frag.glsl');
  for (const source of [cloud, shadow]) {
    requireCount(source, '/*__CLOUD_LAYER_DENSITY__*/');
    if (source.replace('/*__CLOUD_LAYER_DENSITY__*/', density).includes('/*__CLOUD_LAYER_DENSITY__*/')) throw new Error('Unresolved cloud density marker.');
  }
  const assembledShadow = shadow.replace('/*__CLOUD_LAYER_DENSITY__*/', density);
  const focusedSource = await readFile(join(repoRoot, 'Library/geospatial/FocusedCloudShadowPass.js'), 'utf8');
  const focusedAst = parse(focusedSource, { sourceType: 'module', ecmaVersion: 'latest' });
  const focusedFunction = focusedAst.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'createFocusedFragmentShader');
  if (!focusedFunction) throw new Error('Focused cloud shader assembly function is missing.');
  const fragments = ['uniform mat4 inverseShadowMatrices', 'vec4 marchClouds(', 'void getRayNearFar(', 'float transmittanceSum = 0.0;', 'extinctionSum += media.extinction;', 'float frontDepth = min(weightedDistanceSum / transmittanceSum, maxRayDistance);'];
  for (const fragment of fragments) requireCount(assembledShadow, fragment);
  const uniformStart = assembledShadow.indexOf(fragments[0]);
  const marchStart = assembledShadow.indexOf(fragments[1], uniformStart);
  const marchEnd = assembledShadow.indexOf(fragments[2], marchStart);
  if (!(uniformStart < marchStart && marchStart < marchEnd)) throw new Error('Invalid focused cloud shader slice boundaries.');
  const runFocused = source => new vm.Script(`(${focusedSource.slice(focusedFunction.start, focusedFunction.end)})()`).runInNewContext({ shadowFragmentShaderSource: source, cloudLayerDensityGLSL: density }, { timeout: 1000 });
  const focused = runFocused(shadow);
  const originalShadow = (await readFile(join(repoRoot, 'Library/shaders/geospatial/shadowMaterial.frag.glsl'), 'utf8')).replace(/\r\n/g, '\n');
  if (compactShader(focused) !== compactShader(runFocused(originalShadow))) throw new Error('Focused shader output changed after compaction.');
  for (const fragment of ['float firstSampleDistance = maxRayDistance;', 'firstSampleDistance = min(firstSampleDistance, rayDistance);', 'transmittanceSum > 1e-20']) requireCount(focused, fragment);
  for (const marker of ['/*__CLOUD_LAYER_DENSITY__*/', 'float frontDepth = min(weightedDistanceSum / transmittanceSum, maxRayDistance);']) if (focused.includes(marker)) throw new Error(`Focused shader replacement was skipped: ${marker}`);
  const replacements = [
    ['geospatial/AerialPerspectiveEffect.frag.glsl', '/*__VOLUMETRIC_LIGHT_COMPOSITE__*/', 'geospatial/volumetricLightComposite.glsl'],
    ['geospatial/volumetricLight.frag.glsl', '/*__VOLUMETRIC_LIGHT_SUNLIGHT__*/', 'geospatial/volumetricLightShadow.glsl'],
  ];
  for (const [name, marker, insert] of replacements) {
    const source = await shader(name);
    requireCount(source, marker);
    if (source.replace(marker, await shader(insert)).includes(marker)) throw new Error(`Unresolved volumetric marker: ${marker}`);
  }
  for (const [name, marker] of [['postprocess/geospatialPipelineDefaults.glsl', '__GS_MASK_DEFINE__'], ['postprocess/geospatialPipeline.frag.glsl', '__TONE_MAPPING_MODE__'], ['postprocess/selectedFeatures.glsl', '__SELECTED_ID_TEXTURE_WIDTH__']]) requireCount(await shader(name), marker);
  return { densityPaths: 3, focusedSlices: true, focusedReplacements: 3, volumetricPaths: 2, substitutions: 3 };
}

export async function buildSdk() {
  const startedAt = performance.now();
  const root = await readJson(join(repoRoot, 'package.json'));
  if (root.private !== true || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(root.version || '')) throw new Error('Root package must remain private with an explicit SDK version.');
  const publicDeclarations = await emitPublicDeclarations();
  inspectPublicDeclarations(publicDeclarations.toString('utf8'));
  const assetManifest = await readAssetManifest();
  const notices = new Set();
  const shaders = new Map();
  const rawShaders = new Map();
  const stringMatchers = new Set();
  const generated = await build({
    configFile: false, root: repoRoot, publicDir: false,
    plugins: [{
      name: 'sdk-inline-safe-shaders', enforce: 'pre',
      async load(id) {
        if (!id.endsWith('.glsl?raw')) return null;
        const path = resolve(id.slice(0, -4));
        const source = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
        const compacted = compactShader(source);
        rawShaders.set(path, source);
        shaders.set(path, compacted);
        return { code: `export default ${JSON.stringify(compacted)};`, moduleType: 'js' };
      },
      transform(source, id) {
        if (!id.endsWith('.js') || !normalizePath(id).startsWith(`${normalizePath(repoRoot)}/`) || id.includes('node_modules')) return null;
        const comments = [];
        const ast = parse(source, { sourceType: 'module', ecmaVersion: 'latest', onComment: comments });
        for (const comment of comments) if (/copyright|SPDX|@license|@preserve|permission is hereby granted|redistribution and use/i.test(comment.value)) notices.add(comment.value);
        const visit = node => {
          if (!node || typeof node !== 'object') return;
          if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && ['replace', 'replaceAll', 'indexOf', 'lastIndexOf', 'includes', 'split'].includes(node.callee.property?.name) && typeof node.arguments[0]?.value === 'string') stringMatchers.add(node.arguments[0].value);
          for (const value of Object.values(node)) Array.isArray(value) ? value.forEach(visit) : value && typeof value === 'object' && visit(value);
        };
        visit(ast);
        return null;
      },
    }],
    build: {
      write: false, emptyOutDir: false, copyPublicDir: false, sourcemap: false,
      target: 'es2022', minify: 'oxc', cssCodeSplit: false,
      lib: { entry: join(repoRoot, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
      rolldownOptions: { external: id => /^(cesium|three)(\/|$)/.test(id), output: { codeSplitting: false, preserveModules: false, sourcemap: false } },
    },
  });
  for (const [path, original] of rawShaders) for (const fragment of stringMatchers) if (fragment.trim().length >= 8 && original.includes(fragment) && count(original, fragment) !== count(shaders.get(path), fragment)) throw new Error(`GLSL exact-match fragment changed: ${fragment}`);
  const shaderChecks = await validateShaderAssembly(shaders);
  const chunks = (Array.isArray(generated) ? generated.flatMap(item => item.output) : generated.output);
  if (chunks.length !== 1 || chunks[0].type !== 'chunk' || chunks[0].fileName !== 'index.js') throw new Error('SDK must produce exactly one ESM JavaScript chunk.');
  const minifiedBundle = chunks[0].code;
  inspectJavaScript(minifiedBundle);
  const banner = `/*! BetterSky for Cesium ${root.version}. ${copyrightLine(root.author)}. SPDX-License-Identifier: Apache-2.0. See LICENSE, NOTICE and THIRD_PARTY_NOTICES.md. */\n`;
  const retainedNotices = [...notices].map(notice => `/*${notice}*/\n`).join('');
  const finalBundle = banner + retainedNotices + minifiedBundle + '\n';
  inspectJavaScript(finalBundle);
  await removeOwnedDirectory(distDirectory);
  await removeOwnedDirectory(packageDirectory);
  await mkdir(join(distDirectory, 'assets'), { recursive: true });
  await writeFile(join(distDirectory, 'index.js'), finalBundle);
  // Retain the generated UTF-8 JSDoc bytes for editor hover and parameter hints.
  await writeFile(join(distDirectory, 'index.d.ts'), publicDeclarations);
  for (const asset of assetManifest.assets) {
    const sourcePath = join(repoRoot, 'static/BetterSkyAssets', asset.path);
    const data = await readFile(sourcePath);
    if (sha256(data) !== asset.sha256) throw new Error(`Source asset hash mismatch: ${asset.path}`);
    const target = join(distDirectory, 'assets', asset.path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, data);
  }
  const manifest = {
    name: root.name, version: root.version, description: 'Atmosphere, volumetric clouds and lighting effects for CesiumJS.',
    type: 'module', license: root.license, author: root.author, repository: root.repository, bugs: root.bugs, homepage: root.homepage,
    keywords: ['cesium', 'atmosphere', 'clouds', 'volumetric-light'], sideEffects: true,
    files: ['dist/index.js', 'dist/index.d.ts', 'dist/assets/', 'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }, types: './dist/index.d.ts',
    peerDependencies: { cesium: root.dependencies.cesium }, dependencies: { three: root.dependencies.three }, engines: { node: '>=22.0.0' },
  };
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(join(packageDirectory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ['README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(repoRoot, file), join(packageDirectory, file));
  for (const entry of await listDirectoryEntries(distDirectory)) {
    const target = join(packageDirectory, 'dist', entry.path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, entry.data);
  }
  await validatePackageEntries(await listDirectoryEntries(packageDirectory));
  console.log(JSON.stringify({ name: root.name, version: root.version, output: packageDirectory, assets: assetManifest.assets.length, shaders: shaders.size, shaderChecks, minifier: 'oxc', bundleBytes: Buffer.byteLength(finalBundle), minifiedBytes: Buffer.byteLength(minifiedBundle), buildMilliseconds: Math.round(performance.now() - startedAt) }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildSdk().catch(error => { console.error(error.message); process.exitCode = 1; });
