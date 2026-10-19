import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectTarball, listDirectoryEntries, packageDirectory, repoRoot, runPackageManager, sha256, validatePackageEntries } from './shared.mjs';

export async function packSdk(args = process.argv.slice(2)) {
  let requestedOutput;
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== '--output-dir' || !args[index + 1] || requestedOutput) throw new Error('Usage: pack:sdk [--output-dir <delivery directory>]');
    requestedOutput = args[++index];
  }
  const assembledEntries = await listDirectoryEntries(packageDirectory);
  const manifest = await validatePackageEntries(assembledEntries);
  const outputDirectory = resolve(requestedOutput || join(homedir(), 'CodexDocuments', 'sdk-releases', manifest.name, manifest.version));
  const localPath = relative(repoRoot, outputDirectory);
  if (!localPath || (!localPath.startsWith(`..${sep}`) && localPath !== '..' && !isAbsolute(localPath))) throw new Error('The delivery directory must be outside the source repository.');
  await mkdir(outputDirectory, { recursive: true });
  const realDifference = relative(await realpath(repoRoot), await realpath(outputDirectory));
  if (!realDifference || (!realDifference.startsWith(`..${sep}`) && realDifference !== '..' && !isAbsolute(realDifference))) throw new Error('The resolved delivery directory must be outside the source repository.');
  const dryRun = JSON.parse((await runPackageManager('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDirectory })).stdout);
  const expectedPaths = assembledEntries.map(entry => entry.path).sort();
  if (dryRun.length !== 1 || JSON.stringify(dryRun[0].files.map(file => file.path).sort()) !== JSON.stringify(expectedPaths)) throw new Error('npm pack dry-run differs from the assembled whitelist.');
  const filename = dryRun[0].filename;
  if (!filename || filename.includes('/') || filename.includes('\\')) throw new Error('Invalid dry-run filename.');
  try {
    await lstat(join(outputDirectory, filename));
    throw new Error('Delivery tarball already exists. Use a new output directory to preserve its hash and reports.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const packed = JSON.parse((await runPackageManager('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', outputDirectory], { cwd: packageDirectory })).stdout);
  if (packed.length !== 1 || !packed[0].filename || packed[0].filename.includes('/') || packed[0].filename.includes('\\')) throw new Error('Invalid npm pack result.');
  const tarball = join(outputDirectory, packed[0].filename);
  const inspected = await inspectTarball(tarball);
  const hashes = new Map(assembledEntries.map(entry => [entry.path, sha256(entry.data)]));
  for (const entry of inspected.entries) if (hashes.get(entry.path) !== sha256(entry.data)) throw new Error(`Packed bytes differ from assembled file: ${entry.path}`);
  const result = { name: manifest.name, version: manifest.version, tarball, sha256: inspected.sha256, files: inspected.entries.map(entry => ({ path: entry.path, bytes: entry.data.length, sha256: sha256(entry.data) })) };
  await writeFile(`${tarball}.sha256`, `${inspected.sha256}  ${packed[0].filename}\n`);
  await writeFile(`${tarball}.manifest.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) packSdk().catch(error => { console.error(error.message); process.exitCode = 1; });
