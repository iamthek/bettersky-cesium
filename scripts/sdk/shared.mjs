import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { delimiter } from 'node:path';
import { parse } from 'acorn';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const packageDirectory = join(repoRoot, '.sdk-package');
export const distDirectory = join(repoRoot, 'dist');
export const officialRegistry = 'https://registry.npmjs.org';
// Copyright year for the generated banner; LICENSE must carry the same line.
export const copyrightYear = 2026;
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

// Single source for the copyright line: package.json author name and email.
export function copyrightLine(author) {
  if (!author?.name || !author?.email) throw new Error('package.json author.name and author.email are required.');
  return `Copyright (c) ${copyrightYear} ${author.name} (${author.email})`;
}

export function runPackageManager(manager, args, { cwd = repoRoot, env = process.env, interactive = false } = {}) {
  if (!['npm', 'pnpm'].includes(manager)) throw new Error(`Unsupported package manager: ${manager}`);
  const candidates = [];
  const activeCli = process.env.npm_execpath;
  if (activeCli && ((manager === 'pnpm' && /pnpm/i.test(activeCli)) || (manager === 'npm' && /npm-cli/i.test(activeCli)))) candidates.push(activeCli);
  for (const directory of [dirname(process.execPath), ...(process.env.PATH || '').split(delimiter)]) {
    if (manager === 'npm') candidates.push(join(directory, 'node_modules/npm/bin/npm-cli.js'));
    else candidates.push(join(directory, 'pnpm.cjs'), join(directory, 'node_modules/pnpm/bin/pnpm.cjs'), join(directory, 'pnpm.exe'));
  }
  const cli = candidates.find(candidate => existsSync(candidate));
  if (!cli) throw new Error(`Cannot locate ${manager} CLI. Run this command through pnpm run.`);
  return new Promise((resolveRun, reject) => {
    const executable = cli.endsWith('.exe') ? cli : process.execPath;
    const commandArgs = executable === cli ? args : [cli, ...args];
    const child = spawn(executable, commandArgs, { cwd, env, windowsHide: true, stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        const details = (stderr || stdout).trim().slice(-8000);
        reject(new Error(`${manager} exited ${code}${details ? ': ' + details : ' (see the CLI output above)'}`));
      }
      else resolveRun({ stdout, stderr });
    });
  });
}

export function assertInside(parent, target) {
  const absoluteParent = resolve(parent);
  const absoluteTarget = resolve(target);
  const difference = relative(absoluteParent, absoluteTarget);
  if (!difference || difference === '..' || difference.startsWith(`..${sep}`) || isAbsolute(difference)) {
    throw new Error(`Expected a child of ${absoluteParent}: ${absoluteTarget}`);
  }
  return absoluteTarget;
}

// Only SDK-owned directories may be removed; symlinks are never followed.
export async function removeOwnedDirectory(target) {
  const absoluteTarget = resolve(target);
  if (![distDirectory, packageDirectory].includes(absoluteTarget)) throw new Error(`Not an SDK-owned output: ${absoluteTarget}`);
  assertInside(repoRoot, absoluteTarget);
  try {
    const info = await lstat(absoluteTarget);
    if (info.isSymbolicLink()) throw new Error(`Refusing linked output directory: ${absoluteTarget}`);
    assertInside(await realpath(repoRoot), await realpath(absoluteTarget));
    await rm(absoluteTarget, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function assertRelativePath(path) {
  if (!path || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe package path: ${path}`);
  }
}

export async function readAssetManifest() {
  const manifest = await readJson(join(repoRoot, 'scripts/sdk/assets-manifest.json'));
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('Asset manifest must not be empty.');
  const paths = new Set();
  for (const asset of manifest.assets) {
    assertRelativePath(asset.path);
    if (paths.has(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !asset.purpose || !asset.source || !asset.license) {
      throw new Error(`Incomplete or duplicate asset manifest entry: ${asset.path}`);
    }
    if (/unverified|unknown|pending|待核|未知/i.test(asset.license)) throw new Error(`Unverified asset license: ${asset.path}`);
    paths.add(asset.path);
  }
  return manifest;
}

export async function listDirectoryEntries(directory) {
  const entries = [];
  async function visit(current, prefix = '') {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const absolutePath = join(current, item.name);
      if (item.isSymbolicLink()) throw new Error(`Linked package entry: ${path}`);
      if (item.isDirectory()) await visit(absolutePath, path);
      else if (item.isFile()) entries.push({ path, data: await readFile(absolutePath) });
      else throw new Error(`Unsupported package entry: ${path}`);
    }
  }
  await visit(directory);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function inspectJavaScript(source) {
  const comments = [];
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', onComment: comments });
  const imports = [];
  const exported = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (/^cesium(?:\/|$)/.test(node.source?.value || '')) {
      // Whole-module imports force consumer bundlers to resolve every Cesium
      // re-export, including exports absent from a newer compatible engine.
      if (node.type === 'ImportDeclaration' && (node.specifiers.length === 0 || node.specifiers.some(item => item.type !== 'ImportSpecifier' || (item.imported.name || item.imported.value) === 'default'))) {
        throw new Error(`Cesium imports must use explicit named exports: ${node.source.value}`);
      }
      if (node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.specifiers.some(item => (item.local.name || item.local.value) === 'default'))) {
        throw new Error(`Cesium namespace/default re-exports are forbidden: ${node.source.value}`);
      }
    }
    if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source)) imports.push(node.source.value);
    if (node.type === 'ImportExpression') throw new Error('Unexpected dynamic import in the single-file SDK.');
    if (node.type === 'ExportDefaultDeclaration') exported.add('default');
    if (node.type === 'ExportNamedDeclaration') {
      for (const item of node.specifiers || []) exported.add(item.exported.name || item.exported.value);
      if (node.declaration?.id) exported.add(node.declaration.id.name);
    }
    if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee?.type === 'Identifier' && ['eval', 'Function'].includes(node.callee.name)) {
      throw new Error(`Forbidden dynamic code execution: ${node.callee.name}`);
    }
    // Also reject indirect global eval/Function access, including computed strings.
    if (node.type === 'MemberExpression') {
      const property = node.computed ? node.property.value : node.property.name;
      if (['eval', 'Function'].includes(property)) throw new Error(`Forbidden dynamic code property: ${property}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  if (imports.length === 0 || imports.some(value => !/^(cesium|three)(\/|$)/.test(value))) throw new Error(`Unexpected SDK import: ${imports.join(', ')}`);
  if (exported.size !== 2 || !exported.has('BetterSky') || !exported.has('default')) throw new Error(`Unexpected public exports: ${[...exported]}`);
  if (comments.some(comment => /sourceMappingURL|sourceURL/.test(comment.value))) throw new Error('Debug mapping comment found.');
  return { imports: [...new Set(imports)], exports: [...exported] };
}

function scanText(path, data) {
  if (!/\.(?:js|ts|json|md)$/.test(path) && path !== 'LICENSE') return;
  const source = data.toString('utf8');
  const forbidden = [
    /sourceMappingURL|sourceURL|sourcesContent/,
    /(?:[A-Za-z]:[\\/](?:Users|MyHomeCode|MyWorkCode)|\/(?:Users|home)\/[^\s"']+)/i,
    /\b(?:npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /(?:_authToken|NPM_TOKEN|NODE_AUTH_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/,
  ];
  if (forbidden.some(pattern => pattern.test(source))) throw new Error(`Sensitive/debug content found in ${path}`);
  if (path.endsWith('.d.ts') && /(?:Library\/|\.\/|\.\.\/|sourceMappingURL)/.test(source)) throw new Error('Internal path exposed in public declarations.');
}

export async function validatePackageEntries(entries) {
  const root = await readJson(join(repoRoot, 'package.json'));
  const assets = await readAssetManifest();
  const expected = new Map([
    ['package.json', null], ['README.md', null], ['README.zh-CN.md', null], ['LICENSE', null], ['THIRD_PARTY_NOTICES.md', null],
    ['dist/index.js', null], ['dist/index.d.ts', null],
    ...assets.assets.map(asset => [`dist/assets/${asset.path}`, asset.sha256]),
  ]);
  const actual = new Map();
  for (const entry of entries) {
    assertRelativePath(entry.path);
    if (!expected.has(entry.path) || actual.has(entry.path)) throw new Error(`Unexpected or duplicate package file: ${entry.path}`);
    if (!Buffer.isBuffer(entry.data)) throw new Error(`Package entry must contain bytes: ${entry.path}`);
    if (expected.get(entry.path) && sha256(entry.data) !== expected.get(entry.path)) throw new Error(`Asset hash mismatch: ${entry.path}`);
    scanText(entry.path, entry.data);
    actual.set(entry.path, entry.data);
  }
  for (const path of expected.keys()) if (!actual.has(path)) throw new Error(`Missing package file: ${path}`);
  for (const path of ['README.md', 'README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    if (sha256(actual.get(path)) !== sha256(await readFile(join(repoRoot, path)))) throw new Error(`Packaged document differs from the reviewed repository file: ${path}`);
  }
  if (!actual.get('LICENSE').toString('utf8').includes(copyrightLine(root.author))) throw new Error('LICENSE must contain the copyright line derived from package.json author.');
  if (sha256(actual.get('dist/index.d.ts')) !== sha256(await readFile(join(repoRoot, 'scripts/sdk/public-api.d.ts')))) throw new Error('Packaged public declarations differ from the reviewed API.');
  const manifest = JSON.parse(actual.get('package.json').toString('utf8'));
  const expectedFiles = ['dist/index.js', 'dist/index.d.ts', 'dist/assets/', 'README.md', 'README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
  const allowedMetadata = ['name', 'version', 'description', 'type', 'license', 'author', 'homepage', 'keywords', 'files', 'exports', 'types', 'peerDependencies', 'dependencies', 'engines', 'sideEffects'];
  if (Object.keys(manifest).some(key => !allowedMetadata.includes(key)) || manifest.name !== root.name || manifest.version !== root.version || manifest.type !== 'module' || manifest.license !== 'SEE LICENSE IN LICENSE') throw new Error('Invalid release package metadata.');
  if (JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles) || JSON.stringify(manifest.exports) !== JSON.stringify({ '.': { types: './dist/index.d.ts', import: './dist/index.js' } }) || manifest.types !== './dist/index.d.ts') throw new Error('Invalid ESM/type/file exports.');
  if (JSON.stringify(manifest.peerDependencies) !== JSON.stringify({ cesium: root.dependencies.cesium }) || JSON.stringify(manifest.dependencies) !== JSON.stringify({ three: root.dependencies.three })) throw new Error('Invalid runtime dependency contract.');
  if (!manifest.author?.name || manifest.author.email !== root.author?.email || manifest.author.email !== 'iamthek@qq.com' || manifest.author.url || manifest.homepage !== 'https://www.npmjs.com/package/' + root.name) throw new Error('Release contact metadata must use the approved email and npm package page.');
  inspectJavaScript(actual.get('dist/index.js').toString('utf8'));
  if (!actual.get('dist/index.js').toString('utf8').startsWith(`/*! BetterSky for Cesium ${manifest.version}. ${copyrightLine(root.author)}.`)) throw new Error('Bundle banner must contain the copyright line derived from package.json author.');
  return manifest;
}

function readTarString(bytes) { return bytes.toString('utf8').replace(/\0.*$/s, ''); }
function readTarNumber(bytes) {
  const value = readTarString(bytes).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error('Unsupported tar numeric field.');
  return value ? parseInt(value, 8) : 0;
}

// No extraction to disk: reject links, traversal, duplicate entries and corrupt headers.
export function readTarEntries(bytes) {
  const entries = [];
  let offset = 0;
  let pendingPath;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) break;
    const checksum = readTarNumber(header.subarray(148, 156));
    const calculated = header.reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
    if (checksum !== calculated) throw new Error('Corrupt tar header checksum.');
    const size = readTarNumber(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 48);
    const name = readTarString(header.subarray(0, 100));
    const prefix = readTarString(header.subarray(345, 500));
    let path = pendingPath || (prefix ? `${prefix}/${name}` : name);
    pendingPath = undefined;
    const start = offset + 512;
    if (!Number.isSafeInteger(size) || start + size > bytes.length) throw new Error('Truncated tar entry.');
    const data = Buffer.from(bytes.subarray(start, start + size));
    if (type === 'x') {
      const pax = data.toString('utf8');
      for (const match of pax.matchAll(/(?:^|\n)\d+ ([^=]+)=([^\n]*)/g)) {
        if (match[1] === 'path') pendingPath = match[2];
        else if (!['mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(match[1])) throw new Error(`Unsupported PAX field: ${match[1]}`);
      }
    } else {
      if (!path.startsWith('package/')) throw new Error(`Invalid tar root: ${path}`);
      path = path.slice('package/'.length).replace(/\/$/, '');
      if (type !== '0') throw new Error(`Unsupported tar entry type: ${type}`);
      assertRelativePath(path);
      entries.push({ path, data });
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  if (entries.length === 0 || offset + 1024 > bytes.length || pendingPath || !bytes.subarray(offset).every(value => value === 0)) throw new Error('Incomplete tar archive or unexpected trailing content.');
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function inspectTarball(absolutePath) {
  if (!isAbsolute(absolutePath)) throw new Error('Tarball path must be absolute.');
  const archive = await readFile(absolutePath);
  const entries = readTarEntries(gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 }));
  const manifest = await validatePackageEntries(entries);
  return { manifest, entries, sha256: sha256(archive) };
}
