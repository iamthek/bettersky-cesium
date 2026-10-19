import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { test } from 'node:test';

const artifact = Buffer.from('accepted SDK artifact');
const artifactHash = createHash('sha256').update(artifact).digest('hex');

// Run the actual CLI in an isolated temporary directory. Both the package-manager
// and fetch are replaced there; no test can publish or contact a real registry.
async function fixture(t, scenario = {}) {
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, 'bettersky-publish-'));
  t.after(async () => {
    const cleanupDirectory = await realpath(directory);
    assert.equal(relative(temporaryRoot, cleanupDirectory), basename(directory), 'Cleanup must stay in the exact generated temporary directory');
    await rm(cleanupDirectory, { recursive: true, force: true });
  });
  const tarball = join(directory, 'accepted.tgz');
  const reportPath = join(directory, 'acceptance.json');
  const receiptPath = join(directory, 'fixture-sdk-1.0.0-publication.json');
  const scenarioPath = join(directory, 'scenario.json');
  await copyFile(new URL('../scripts/sdk/publish.mjs', import.meta.url), join(directory, 'publish.mjs'));
  await writeFile(tarball, artifact);
  await writeFile(reportPath, JSON.stringify({
    schemaVersion: 1, status: 'passed',
    artifact: { name: 'fixture-sdk', version: '1.0.0', sha256: artifactHash },
    automatic: { status: 'passed' }, browser: { status: 'passed' }, cleanup: 'passed',
    review: { visualPassed: true, artifactSha256: artifactHash, performanceComparison: { status: 'passed' } },
  }));
  await writeFile(scenarioPath, JSON.stringify(scenario));
  await writeFile(join(directory, 'shared.mjs'), `
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
export const officialRegistry = 'https://registry.npmjs.org';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export const inspectTarball = async path => ({ manifest: { name: 'fixture-sdk', version: '1.0.0' }, sha256: sha256(await readFile(path)) });
export async function runPackageManager(manager, args) {
  await appendFile(new URL('./calls.jsonl', import.meta.url), JSON.stringify(args) + '\\n');
  if (args[0] === 'whoami') return { stdout: 'fixture-account\\n', stderr: '' };
  if (args[0] !== 'publish') throw new Error('Unexpected package-manager command');
  const scenario = await readJson(new URL('./scenario.json', import.meta.url));
  if (scenario.uploadError) throw new Error(scenario.uploadError);
  return { stdout: 'Your package is being processed and may take a few minutes to become available\\n+ fixture-sdk@1.0.0', stderr: '' };
}
`);
  await writeFile(join(directory, 'bootstrap.mjs'), `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const scenario = JSON.parse(await readFile(new URL('./scenario.json', import.meta.url), 'utf8'));
let lookups = 0;
globalThis.fetch = async (url, options) => {
  assert.ok(options?.signal instanceof AbortSignal, 'Every registry request needs a timeout signal');
  if (String(url).endsWith('.tgz')) {
    if (scenario.tarballTimeout) throw new DOMException('Tarball request timed out', 'TimeoutError');
    return new Response(scenario.differentArtifact ? 'different bytes' : await readFile(new URL('./accepted.tgz', import.meta.url)));
  }
  lookups++;
  if (scenario.lookupTimeout && lookups > 1) throw new DOMException('Metadata request timed out', 'TimeoutError');
  if (!scenario.availableFrom || lookups < scenario.availableFrom) return new Response('', { status: 404 });
  return Response.json({ name: 'fixture-sdk', version: '1.0.0', _npmUser: { name: 'registry-account' }, dist: { tarball: 'https://registry.npmjs.org/fixture-sdk/-/fixture-sdk-1.0.0.tgz', integrity: 'sha512-fixture' } });
};
globalThis.setTimeout = callback => { queueMicrotask(callback); return 0; };
await import('./publish.mjs');
`);
  return {
    receiptPath,
    async scenario(value) { await writeFile(scenarioPath, JSON.stringify(value)); },
    async receipt() { return JSON.parse(await readFile(receiptPath, 'utf8')); },
    async calls() {
      try { return (await readFile(join(directory, 'calls.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
    async run(...options) {
      return new Promise((resolveRun, reject) => {
        const child = spawn(process.execPath, [join(directory, 'bootstrap.mjs'), '--tarball', tarball, '--report', reportPath, ...options], { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => resolveRun({ code, stdout, stderr }));
      });
    },
  };
}

test('an accepted upload can become visible after several polls and requires matching registry bytes', async t => {
  const setup = await fixture(t, { availableFrom: 4 });
  const result = await setup.run();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Verified published package/);
  const receipt = await setup.receipt();
  assert.equal(receipt.status, 'published');
  assert.equal(receipt.sha256, artifactHash);
  assert.equal(receipt.account, 'fixture-account');
  assert.deepEqual((await setup.calls()).map(args => args[0]), ['whoami', 'publish']);
});

test('npm exit 0 without registry visibility stays processing and repeated invocation never uploads', async t => {
  const setup = await fixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await setup.run();
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Publication is processing/);
    assert.doesNotMatch(result.stdout, /Verified published package/);
    const receipt = await setup.receipt();
    assert.equal(receipt.status, 'processing');
    assert.equal(receipt.npmExitCode, 0);
    assert.equal(receipt.publishedAt, undefined);
  }
  assert.deepEqual((await setup.calls()).map(args => args[0]), ['whoami', 'publish']);
  await setup.scenario({ availableFrom: 1 });
  const verified = await setup.run('--verify-only');
  assert.equal(verified.code, 0, verified.stderr);
  assert.equal((await setup.receipt()).status, 'published');
  assert.equal((await setup.calls()).length, 2);
});

test('an original npm failure remains nonzero and its unconfirmed receipt prevents automatic retries', async t => {
  const setup = await fixture(t, { uploadError: 'npm exited 1: E403 authentication failed' });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await setup.run();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /npm exited 1: E403 authentication failed/);
    assert.match(result.stderr, /--verify-only/);
    assert.equal((await setup.receipt()).status, 'unconfirmed');
  }
  assert.equal((await setup.calls()).filter(args => args[0] === 'publish').length, 1);
});

test('a failed npm response can still be confirmed as published by matching registry bytes', async t => {
  const setup = await fixture(t, { uploadError: 'npm exited 1: response lost', availableFrom: 2 });
  const result = await setup.run();
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await setup.receipt()).status, 'published');
});

test('verify-only and existing-package paths confirm publicly and write a receipt without npm login', async t => {
  for (const options of [[], ['--verify-only']]) {
    const setup = await fixture(t, { availableFrom: 1 });
    const result = await setup.run(...options);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await setup.calls(), []);
    assert.equal((await setup.receipt()).status, 'published');
    assert.equal((await setup.receipt()).account, 'registry-account');
  }
});

test('verify-only never uploads when the package is missing and cannot report verified success', async t => {
  const setup = await fixture(t);
  const result = await setup.run('--verify-only');
  assert.equal(result.code, 1);
  assert.deepEqual(await setup.calls(), []);
  await assert.rejects(readFile(setup.receiptPath), { code: 'ENOENT' });
});

test('a registry hash mismatch is a real failure before and after upload', async t => {
  for (const availableFrom of [1, 2]) {
    const setup = await fixture(t, { availableFrom, differentArtifact: true });
    const result = await setup.run();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Registry tarball differs from the accepted artifact/);
    assert.equal((await setup.calls()).filter(args => args[0] === 'publish').length, availableFrom - 1);
  }
});

test('registry transport timeouts after npm exit 0 leave a pending verification instead of an upload failure', async t => {
  for (const scenario of [{ lookupTimeout: true }, { availableFrom: 2, tarballTimeout: true }]) {
    const setup = await fixture(t, scenario);
    const result = await setup.run();
    assert.equal(result.code, 0, result.stderr);
    const receipt = await setup.receipt();
    assert.equal(receipt.status, 'processing');
    assert.match(receipt.lastVerificationError, /request timed out/);
  }
});

test('dry-run never creates or rewrites a publication receipt', async t => {
  const setup = await fixture(t);
  assert.equal((await setup.run('--dry-run')).code, 0);
  await assert.rejects(readFile(setup.receiptPath), { code: 'ENOENT' });
  assert.equal((await setup.run()).code, 0);
  const before = await readFile(setup.receiptPath, 'utf8');
  await setup.scenario({ availableFrom: 1 });
  assert.equal((await setup.run('--dry-run')).code, 0);
  assert.equal(await readFile(setup.receiptPath, 'utf8'), before);
});
