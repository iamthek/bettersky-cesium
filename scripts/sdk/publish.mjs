import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { inspectTarball, officialRegistry, readJson, runPackageManager, sha256 } from "./shared.mjs";

const confirmationAttempts = 13;
const confirmationIntervalMs = 10000;

function parseOptions(values) {
  const options = {};
  for (let index = 0; index < values.length; index++) {
    const key = values[index];
    if (key === "--") continue;
    if (!key.startsWith("--")) throw new Error("Unexpected argument: " + key);
    options[key.slice(2)] = values[index + 1]?.startsWith("--") || index === values.length - 1 ? true : values[++index];
  }
  return options;
}
async function publishedVersion(name, version, timeoutMs = 15000) {
  const response = await fetch(officialRegistry + "/" + encodeURIComponent(name) + "/" + encodeURIComponent(version), { signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("Registry lookup failed: HTTP " + response.status);
  return response.json();
}
async function verifyRegistryArtifact(metadata, hash) {
  assert.ok(typeof metadata.dist?.tarball === "string", "Registry metadata has no tarball URL");
  const url = new URL(metadata.dist.tarball);
  assert.equal(url.origin, officialRegistry, "Unexpected registry tarball host");
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error("Published tarball unavailable: HTTP " + response.status);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, "Registry tarball differs from the accepted artifact");
}
async function waitForPublication(inspected) {
  const deadline = Date.now() + (confirmationAttempts - 1) * confirmationIntervalMs;
  let lastVerificationError;
  for (let attempt = 0; attempt < confirmationAttempts; attempt++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    let metadata;
    try {
      metadata = await publishedVersion(inspected.manifest.name, inspected.manifest.version, Math.min(15000, remainingMs));
    } catch (error) { lastVerificationError = error.message; }
    if (metadata) {
      try {
        await verifyRegistryArtifact(metadata, inspected.sha256);
        return { metadata };
      } catch (error) {
        // A different artifact is a real failure. A failed download leaves the
        // result unconfirmed; do not repeatedly download or upload the package.
        if (error instanceof assert.AssertionError) throw error;
        return { lastVerificationError: error.message };
      }
    }
    const waitMs = Math.min(confirmationIntervalMs, deadline - Date.now());
    if (attempt + 1 < confirmationAttempts && waitMs > 0) await new Promise(resolveWait => setTimeout(resolveWait, waitMs));
  }
  return { lastVerificationError };
}
async function savePublication(path, publication) {
  await writeFile(path, JSON.stringify(publication, null, 2) + "\n");
}
async function saveVerifiedPublication(inspected, metadata, path, previous, dryRun) {
  if (!dryRun) await savePublication(path, {
    schemaVersion: 1, status: "published", publishedAt: new Date().toISOString(),
    name: inspected.manifest.name, version: inspected.manifest.version, sha256: inspected.sha256,
    account: previous?.account || metadata._npmUser?.name, registry: officialRegistry,
    tarball: metadata.dist.tarball, integrity: metadata.dist.integrity,
  });
  console.log("Verified published package: https://www.npmjs.com/package/" + inspected.manifest.name + "/v/" + inspected.manifest.version);
}
async function confirmPublication(inspected, path, previous, dryRun) {
  const { metadata, lastVerificationError } = await waitForPublication(inspected);
  if (metadata) {
    await saveVerifiedPublication(inspected, metadata, path, previous, dryRun);
    return;
  }
  if (previous && !dryRun) await savePublication(path, { ...previous, checkedAt: new Date().toISOString(), lastVerificationError });
  if (previous?.status === "processing" && previous.npmExitCode === 0) {
    console.log("Publication is processing: npm exited 0, but the registry artifact is not yet verified. No upload was attempted again. Run with --verify-only to check later. Receipt: " + path);
    if (lastVerificationError) console.log("Last registry verification error: " + lastVerificationError);
    return;
  }
  const reason = previous?.uploadError || "The registry artifact could not be confirmed.";
  throw new Error(reason + " No further upload was attempted. Run with --verify-only to check again." + (previous ? " Receipt: " + path + ". Only remove this receipt to retry after independently confirming that npm rejected the upload." : ""));
}
async function publish(options) {
  assert.ok(!(options["dry-run"] && options["verify-only"]), "Use either --dry-run or --verify-only");
  assert.ok(typeof options.tarball === "string", "--tarball is required");
  assert.ok(typeof options.report === "string", "--report is required");
  const tarball = resolve(options.tarball);
  const inspected = await inspectTarball(tarball);
  const report = await readJson(resolve(options.report));
  assert.equal(report.schemaVersion, 1, "Unsupported acceptance report");
  assert.equal(report.status, "passed", "Acceptance is incomplete or failed");
  assert.equal(report.artifact.name, inspected.manifest.name);
  assert.equal(report.artifact.version, inspected.manifest.version);
  assert.equal(report.artifact.sha256, inspected.sha256, "Accepted artifact hash changed");
  assert.equal(report.automatic.status, "passed");
  assert.equal(report.browser.status, "passed");
  assert.equal(report.review.visualPassed, true);
  assert.equal(report.review.artifactSha256, inspected.sha256);
  assert.equal(report.review.performanceComparison.status, "passed");
  assert.equal(report.cleanup, "passed", "Acceptance workspace cleanup is incomplete");
  const publicationPath = join(dirname(tarball), inspected.manifest.name + "-" + inspected.manifest.version + "-publication.json");
  let previous;
  try { previous = await readJson(publicationPath); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previous) {
    assert.equal(previous.schemaVersion, 1, "Unsupported publication receipt");
    assert.equal(previous.name, inspected.manifest.name, "Publication receipt names a different package");
    assert.equal(previous.version, inspected.manifest.version, "Publication receipt names a different version");
    assert.equal(previous.sha256, inspected.sha256, "Publication receipt names a different artifact");
    assert.equal(previous.registry, officialRegistry, "Publication receipt names a different registry");
    assert.ok(["processing", "unconfirmed", "published"].includes(previous.status), "Unknown publication receipt status");
  }
  // Any previous upload attempt is verification-only until its result is known.
  if (previous || options["verify-only"]) {
    await confirmPublication(inspected, publicationPath, previous, options["dry-run"]);
    return;
  }
  const existing = await publishedVersion(inspected.manifest.name, inspected.manifest.version);
  if (existing) {
    await verifyRegistryArtifact(existing, inspected.sha256);
    await saveVerifiedPublication(inspected, existing, publicationPath, undefined, options["dry-run"]);
    console.log("This exact artifact is already published; no upload was attempted.");
    return;
  }
  const identity = await runPackageManager("npm", ["whoami", "--registry=" + officialRegistry]);
  const account = identity.stdout.trim();
  assert.ok(account, "npm login is required");
  const args = ["publish", tarball, "--access", "public", "--registry=" + officialRegistry];
  if (options["dry-run"]) args.push("--dry-run");
  // Upload the accepted bytes directly. Never invoke build, pack or version here.
  let uploadError;
  try {
    const output = await runPackageManager("npm", args, { cwd: dirname(tarball), interactive: !options["dry-run"] && !!process.stdin.isTTY });
    console.log(output.stdout);
    if (output.stderr) console.error(output.stderr);
  } catch (error) { uploadError = error; }
  if (options["dry-run"]) {
    if (uploadError) throw uploadError;
    console.log("Package dry-run passed for " + inspected.manifest.name + "@" + inspected.manifest.version + " as " + account + "; no upload performed. Actual publication authorization and 2FA are not verified by --dry-run.");
    return;
  }
  // npm exit 0 can precede registry visibility by several minutes. Persist that
  // distinction before polling so later invocations cannot re-upload this version.
  const publication = {
    schemaVersion: 1, status: uploadError ? "unconfirmed" : "processing", attemptedAt: new Date().toISOString(),
    name: inspected.manifest.name, version: inspected.manifest.version, sha256: inspected.sha256,
    account, registry: officialRegistry,
    ...(uploadError ? { uploadError: uploadError.message } : { npmExitCode: 0 }),
  };
  await savePublication(publicationPath, publication);
  await confirmPublication(inspected, publicationPath, publication, false);
}

const options = parseOptions(process.argv.slice(2));
if (options.help) console.log("publish:sdk --tarball <accepted.tgz> --report <acceptance.json> [--dry-run | --verify-only]");
else publish(options).catch(error => { console.error(error.message); process.exitCode = 1; });
