import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { inspectTarball, officialRegistry, readAssetManifest, readJson, repoRoot, runPackageManager, sha256 } from "./shared.mjs";
import { browserAcceptance } from "./fixture.mjs";

function argumentsOf(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === "--") continue;
    if (!value.startsWith("--")) throw new Error("Unexpected argument: " + value);
    result[value.slice(2)] = values[index + 1]?.startsWith("--") || index === values.length - 1 ? true : values[++index];
  }
  return result;
}
const inside = (parent, target) => {
  const difference = relative(resolve(parent), resolve(target));
  return difference === "" || (!difference.startsWith(".." + sep) && difference !== ".." && !isAbsolute(difference));
};
const pendingWrites = new Map();
const writeJson = (file, value) => {
  const snapshot = JSON.stringify(value, null, 2) + "\n";
  const next = (pendingWrites.get(file) || Promise.resolve()).then(() => writeFile(file, snapshot));
  pendingWrites.set(file, next);
  return next;
};
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".bin": "application/octet-stream", ".exr": "application/octet-stream" };
function execute(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", bytes => { output += bytes; });
    child.stderr.on("data", bytes => { output += bytes; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveRun(output) : reject(new Error("Command failed (" + code + "): " + command + " " + args.join(" ") + "\n" + output.slice(-12000))));
  });
}
async function latest(name) {
  const response = await fetch(officialRegistry + "/" + name + "/latest", { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Registry metadata failed for " + name + ": " + response.status);
  return (await response.json()).version;
}
// Cesium 1.142's barrel also imports symbols removed by newer compatible-range
// component releases. Verify its known compatible consumer lock separately from
// the clean-install probe below; never override Cesium's component dependencies.
const compatibleCesiumComponents = {
  "1.142.0": { "@cesium/engine": "26.0.0", "@cesium/widgets": "16.0.0" },
};
async function versionFromEntry(entry, name) {
  let directory = dirname(entry);
  while (true) {
    try { const data = await readJson(join(directory, "package.json")); if (data.name === name) return data.version; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Cannot locate manifest for " + name);
    directory = parent;
  }
}
async function cesiumComponents(entry) {
  const require = createRequire(entry);
  const components = {};
  for (const name of ["@cesium/engine", "@cesium/widgets"]) components[name] = await versionFromEntry(require.resolve(name), name);
  return components;
}
async function installFixture(manager, project, environment, report, reportFile, id, mode = "clean") {
  const command = manager === "npm" && mode === "frozen" ? "ci" : "install";
  const flags = mode === "lockfile" ? [manager === "npm" ? "--package-lock-only" : "--lockfile-only"] : mode === "frozen" && manager === "pnpm" ? ["--frozen-lockfile"] : [];
  for (let attempt = 1; ; attempt++) {
    try {
      await runPackageManager(manager, [command, ...flags, "--ignore-scripts", "--registry=" + officialRegistry, ...(manager === "npm" ? ["--no-audit", "--no-fund", "--prefer-offline", "--maxsockets=1", "--fetch-retries=4", "--fetch-retry-mintimeout=1000", "--fetch-retry-maxtimeout=15000", "--fetch-timeout=60000"] : [])], { cwd: project, env: environment });
      return;
    } catch (error) {
      // Keep a credential-free summary before the isolated cache is removed.
      const logDirectory = join(environment.npm_config_cache, "_logs");
      const logs = await readdir(logDirectory).catch(() => []);
      const logFile = logs.filter(name => name.endsWith("debug-0.log")).sort().at(-1);
      const logText = logFile ? await readFile(join(logDirectory, logFile), "utf8").catch(() => "") : "";
      const registryRequests = [...logText.matchAll(/(?:GET|POST|PUT)\s+(?:\d{3}\s+)?(https:\/\/registry\.npmjs\.org\/[^\s]+)/g)].slice(-12).map(match => match[1]);
      const transportCode = error.message.match(/(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ERR_SSL_CIPHER_OPERATION_FAILED)/)?.[0];
      (report.installFailures ??= []).push({ id, mode, attempt, code: transportCode || "INSTALL_ERROR", registryRequests });
      await writeJson(reportFile, report);
      if (attempt >= 5 || (!transportCode && !/network aborted/.test(error.message))) throw error;
      console.log("Transient registry failure, retry " + attempt + "/5: " + id);
      await new Promise(resolveWait => setTimeout(resolveWait, attempt * 1000));
    }
  }
}
async function probeCleanCesium(work, cesiumVersion, viteVersion, environment, report, reportFile) {
  const id = "upstream-clean-cesium" + cesiumVersion;
  const project = join(work, id);
  await mkdir(project, { recursive: true });
  await writeJson(join(project, "package.json"), { name: id, private: true, type: "module", dependencies: { cesium: cesiumVersion }, devDependencies: { vite: viteVersion } });
  await writeFile(join(project, ".npmrc"), "@cesium:registry=" + officialRegistry + "/\n");
  const probe = { id, cesiumVersion, manager: "npm", strategy: "clean-install", cesiumComponentOverrides: false, zeroOverrides: true, status: "pending", purpose: "Observe upstream Cesium barrel compatibility without the SDK or component pins" };
  report.automatic.upstreamProbes.push(probe);
  await writeJson(reportFile, report);
  await installFixture("npm", project, environment, report, reportFile, id);
  const require = createRequire(join(project, "package.json"));
  probe.components = await cesiumComponents(require.resolve("cesium"));
  await writeFile(join(project, "index.html"), '<!doctype html><script type="module" src="/main.js"></script>');
  await writeFile(join(project, "main.js"), 'import { Cartesian2 } from "cesium";\nconsole.log(new Cartesian2(1, 2));\n');
  await writeFile(join(project, "vite.config.js"), 'export default { build: { target: "es2022" } };\n');
  const vite = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
  try {
    await execute(process.execPath, [vite, "build"], { cwd: project, env: environment });
    probe.status = "passed";
    probe.hostBuild = "passed";
  } catch (error) {
    // A failing build is observational only when it names the upstream barrel
    // and component exports. Other failures still block SDK acceptance.
    probe.hostBuild = "failed";
    probe.failure = String(error).slice(-12000);
    if (!/cesium[\\/]Source[\\/]Cesium\.js/.test(probe.failure) || !/(?:is not exported|No matching export)/i.test(probe.failure) || !/@cesium[\\/](?:engine|widgets)/.test(probe.failure)) {
      probe.status = "error";
      await writeJson(reportFile, report);
      throw error;
    }
    probe.status = "failed";
    probe.classification = "upstream-barrel-component-export-mismatch";
  }
  console.log("Observed " + id + ": " + probe.status + " " + JSON.stringify(probe.components));
  await writeJson(reportFile, report);
}
function fixtureHtml(id) {
  return '<!doctype html><html><head><meta charset="UTF-8"><title>BetterSky SDK acceptance ' + id +
    '</title><style>html,body{margin:0;background:#10151d;color:#eee;font:14px monospace}#viewer{width:640px;height:360px}pre{white-space:pre-wrap;max-width:1000px}button{font-size:16px;padding:8px}</style></head><body><h1>' +
    id + '</h1><p id="status">RUNNING</p><div id="viewer"></div><button id="dispose">Dispose viewer</button><pre id="result">Waiting for runtime checks</pre><script type="module" src="/main.js"></script></body></html>';
}
function fixtureMain(id, base, checkSnow) {
  return [
    'import { Viewer, EllipsoidTerrainProvider, JulianDate, Cartesian3, Math as CesiumMath, SceneMode, Color } from "cesium";',
    'const Cesium = { Viewer, EllipsoidTerrainProvider, JulianDate, Cartesian3, Math: CesiumMath, SceneMode, Color };',
    'import { BetterSky } from "bettersky-cesium";',
    'import "cesium/Build/Cesium/Widgets/widgets.css";',
    "(" + browserAcceptance.toString() + ")()(Cesium, BetterSky, " + JSON.stringify(id) + ", " + JSON.stringify(base) + ", " + JSON.stringify(checkSnow) + ");",
  ].join("\n");
}
function fixtureResourceRoot(item) {
  return (item.assetsBase.startsWith(item.base) ? item.assetsBase.slice(item.base.length) : item.assetsBase.replace(/^\//, "")).replace(/\/$/, "");
}
function fixtureConfig(item) {
  const resourceRoot = fixtureResourceRoot(item);
  const config = {
    base: item.base, publicDir: false,
    define: { CESIUM_BASE_URL: JSON.stringify(item.assetsBase) },
    build: { target: "es2022", outDir: item.dist, sourcemap: false },
  };
  if (item.kind === "source-baseline") config.resolve = { alias: { "bettersky-cesium": join(repoRoot, "src/index.ts") }, dedupe: ["cesium", "three"] };
  const targets = [
    { src: "node_modules/bettersky-cesium/dist/assets/**/*", dest: resourceRoot + "/BetterSkyAssets", rename: { stripBase: 4 } },
    { src: "node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}", dest: resourceRoot, rename: { stripBase: 4 } },
  ];
  return 'import { defineConfig } from "vite";\nimport { viteStaticCopy } from "vite-plugin-static-copy";\nconst config = ' + JSON.stringify(config) + ';\nconfig.plugins = [viteStaticCopy(' + JSON.stringify({ targets }) + ')];\nexport default defineConfig(config);\n';
}
async function verifyFixtureAssets(item, manifest) {
  const resourceRoot = join(item.dist, fixtureResourceRoot(item));
  const installedAssets = join(dirname(item.dist), "node_modules/bettersky-cesium/dist/assets");
  const resources = [];
  // Check the served paths as well as bytes: a successful build can still copy
  // assets under an unwanted node_modules prefix and leave every runtime URL broken.
  for (const asset of manifest.assets) {
    const path = join(resourceRoot, "BetterSkyAssets", asset.path);
    const bytes = await readFile(path);
    assert.ok(bytes.equals(await readFile(join(installedAssets, asset.path))), "Copied SDK asset bytes differ: " + path);
    assert.equal(sha256(bytes), asset.sha256, "Copied SDK asset hash differs: " + path);
    resources.push({ path: asset.path, bytes: bytes.length, sha256: asset.sha256 });
  }
  const cesiumDirectories = ["Workers", "Assets", "ThirdParty", "Widgets"];
  for (const directory of cesiumDirectories) {
    const path = join(resourceRoot, directory);
    assert.ok((await stat(path)).isDirectory(), "Copied Cesium directory missing: " + path);
    assert.ok((await readdir(path)).length > 0, "Copied Cesium directory empty: " + path);
  }
  item.assetCopy = { status: "passed", resources, cesiumDirectories };
}
async function serveFixture(item, report, reportFile, expectedResources) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === item.base + "__acceptance/result") {
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 1024 * 1024) throw new Error("Acceptance result too large");
        }
        const result = JSON.parse(body);
        assert.equal(result.caseId, item.id);
        report.browser.results[item.id] = result;
        report.browser.status = report.fixtures.every(fixture => report.browser.results[fixture.id]?.status === "passed") ? "passed" : "pending";
        await writeJson(reportFile, report);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"recorded":true}');
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
      const prefix = item.base === "/" ? "" : item.base.slice(0, -1);
      if (prefix && !url.pathname.startsWith(prefix + "/")) { response.writeHead(404).end(); return; }
      const requested = decodeURIComponent(url.pathname.slice(prefix.length));
      const file = resolve(item.dist, "." + (requested === "/" ? "/index.html" : requested));
      if (!inside(item.dist, file)) { response.writeHead(403).end(); return; }
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      if (requested.includes("/BetterSkyAssets/")) {
        const asset = requested.split("/BetterSkyAssets/")[1];
        expectedResources.set(item.id + ":" + asset, { status: 200, bytes: info.size });
      }
      response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : await readFile(file));
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain" });
      response.end(String(error));
    }
  });
  await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
  return { server, url: "http://127.0.0.1:" + server.address().port + item.base };
}
async function finalize(options) {
  const reportFile = resolve(options.report);
  const report = await readJson(reportFile);
  const evidence = await readJson(resolve(options.evidence));
  const inspected = await inspectTarball(report.artifact.path);
  assert.equal(inspected.sha256, report.artifact.sha256, "Artifact changed after acceptance");
  assert.equal(report.automatic.status, "passed", "Automatic checks incomplete");
  assert.equal(report.browser.status, "passed", "Browser checks incomplete");
  assert.equal(evidence.artifactSha256, inspected.sha256);
  assert.equal(evidence.visualPassed, true, "Visual review incomplete");
  assert.ok(evidence.reviewer && evidence.reviewedAt && evidence.notes);
  assert.deepEqual([...evidence.checkedCaseIds].sort(), report.fixtures.map(item => item.id).sort());
  assert.equal(evidence.performanceComparison?.status, "passed", "Before/after performance comparison incomplete");
  const baseline = report.fixtures.find(item => item.kind === "source-baseline");
  const comparisonPrefix = "npm-cesium" + report.versions.cesium[0] + "-three" + report.versions.three[0] + "-";
  const comparison = report.fixtures.find(item => item.kind === "package" && item.id.startsWith(comparisonPrefix) && item.id.endsWith("-root"));
  assert.ok(baseline && comparison, "Same-version before/after fixtures missing");
  for (const item of [baseline, comparison]) {
    const metrics = report.browser.results[item.id]?.metrics;
    assert.ok(metrics && Number.isFinite(metrics.startupMs) && metrics.startupMs > 0 && Number.isFinite(metrics.frameMs) && metrics.frameMs > 0);
    assert.ok(metrics.frameSamples?.length >= 30, "Frame-time samples missing");
  }
  assert.equal(evidence.performanceComparison.baselineCaseId, baseline.id);
  assert.equal(evidence.performanceComparison.packageCaseId, comparison.id);
  for (const item of report.fixtures) {
    const result = report.browser.results[item.id];
    assert.equal(result.status, "passed");
    assert.equal(result.errors.length, 0);
    assert.ok(result.checks.every(check => check.passed));
    assert.ok(result.checks.some(check => check.name === "effects change actual rendered pixels" && check.passed));
    for (const asset of report.expectedAssets) assert.ok(report.resourceResponses.some(response => response.key === item.id + ":" + asset && response.status === 200), "Runtime asset response missing: " + item.id + ":" + asset);
  }
  report.review = evidence;
  report.status = "passed";
  report.completedAt = new Date().toISOString();
  await writeJson(reportFile, report);
  console.log("Acceptance finalized: " + reportFile);
}
async function cleanupRecordedWorkspace(options) {
  const reportFile = resolve(options.report);
  const report = await readJson(reportFile);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.artifact.name, "bettersky-cesium");
  const parent = await realpath(join(tmpdir(), "bettersky-sdk-acceptance"));
  const workspace = resolve(report.workspace);
  assert.equal(dirname(workspace).toLowerCase(), parent.toLowerCase());
  assert.match(basename(workspace), /^run-[A-Za-z0-9]+$/);
  assert.ok(!inside(await realpath(repoRoot), workspace));
  try {
    assert.equal(await realpath(workspace), workspace);
    assert.equal((await lstat(workspace)).isSymbolicLink(), false);
    await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  report.status = "failed";
  report.failure = "Superseded acceptance run; artifact is not eligible for publication.";
  report.cleanup = "passed";
  await writeJson(reportFile, report);
  console.log("Removed only recorded acceptance workspace: " + workspace);
}
async function refreshFixtures(options) {
  const report = await readJson(resolve(options.report));
  const assets = await readAssetManifest();
  const artifact = await inspectTarball(report.artifact.path);
  assert.equal(artifact.sha256, report.artifact.sha256);
  const workspace = await realpath(report.workspace);
  assert.ok(!inside(await realpath(repoRoot), workspace));
  for (const item of report.fixtures) {
    const project = dirname(item.dist);
    assert.ok(inside(workspace, project) && inside(project, item.dist));
    const projectRequire = createRequire(join(project, "package.json"));
    await writeFile(join(project, "index.html"), fixtureHtml(item.id));
    await writeFile(join(project, "main.js"), fixtureMain(item.id, item.base, report.expectedAssets.includes("snowCoverMask.png")));
    await writeFile(join(project, "vite.config.js"), fixtureConfig(item));
    const vite = join(dirname(projectRequire.resolve("vite/package.json")), "bin/vite.js");
    await execute(process.execPath, [vite, "build"], { cwd: project });
    await verifyFixtureAssets(item, assets);
    console.log("Refreshed same-artifact fixture " + item.id);
  }
  await writeJson(resolve(options.report), report);
}
async function verify(options) {
  const tarball = resolve(options.tarball);
  const inspected = await inspectTarball(tarball);
  const assets = await readAssetManifest();
  const reportDirectory = resolve(options["report-dir"] || dirname(tarball));
  const requestedWorkParent = resolve(options["work-dir"] || join(tmpdir(), "bettersky-sdk-acceptance"));
  assert.ok(!inside(repoRoot, requestedWorkParent), "Acceptance workspace must be outside the repository");
  assert.ok(!inside(repoRoot, reportDirectory), "Acceptance report must be outside the repository");
  await mkdir(requestedWorkParent, { recursive: true });
  await mkdir(reportDirectory, { recursive: true });
  // Windows TEMP can contain an 8.3 alias; Vite's HTML proxy IDs require one canonical root.
  const workParent = await realpath(requestedWorkParent);
  const realRepository = await realpath(repoRoot);
  assert.ok(!inside(realRepository, await realpath(workParent)), "Workspace junction points into the repository");
  assert.ok(!inside(realRepository, await realpath(reportDirectory)), "Report junction points into the repository");
  const work = await mkdtemp(join(workParent, "run-"));
  const realWork = await realpath(work);
  const reportFile = join(reportDirectory, inspected.manifest.name + "-" + inspected.manifest.version + (options["registry-smoke"] ? "-registry-smoke.json" : "-acceptance.json"));
  const report = {
    schemaVersion: 1, status: "pending", startedAt: new Date().toISOString(),
    artifact: { path: tarball, name: inspected.manifest.name, version: inspected.manifest.version, sha256: inspected.sha256 },
    automatic: { status: "pending", matrix: [], upstreamProbes: [] }, browser: { status: "pending", results: {} },
    fixtures: [], expectedAssets: assets.assets.map(asset => asset.path), workspace: work, cleanup: "pending",
  };
  const servers = [];
  const requests = new Map();
  const environment = { ...process.env, npm_config_cache: join(work, "npm-cache") };
  try {
    const rootManifest = await readJson(join(repoRoot, "package.json"));
    const require = createRequire(join(repoRoot, "package.json"));
    const viteVersion = require("vite/package.json").version;
    const [currentCesium, currentThree] = await Promise.all([latest("cesium"), latest("three")]);
    const staticCopyVersion = rootManifest.devDependencies["vite-plugin-static-copy"];
    const minimumCesium = rootManifest.dependencies.cesium.match(/^>=\s*(\d+\.\d+\.\d+)$/)?.[1];
    const minimumThree = rootManifest.dependencies.three.match(/^>=\s*(\d+\.\d+\.\d+)$/)?.[1];
    assert.ok(minimumCesium && minimumThree, "Explicit minimum runtime dependency versions are required");
    const versions = options["registry-smoke"] ? { cesium: [currentCesium], three: [currentThree] } : { cesium: [minimumCesium, currentCesium], three: [minimumThree, currentThree] };
    const typescriptVersion = rootManifest.devDependencies.typescript;
    report.versions = { ...versions, registry: officialRegistry, registryCheckedAt: new Date().toISOString(), vite: viteVersion, staticCopy: staticCopyVersion, typescript: typescriptVersion, node: process.version, packageManager: rootManifest.packageManager };
    if (!options["registry-smoke"] && compatibleCesiumComponents[minimumCesium]) await probeCleanCesium(work, minimumCesium, viteVersion, environment, report, reportFile);
    for (const manager of ["npm", "pnpm"]) {
      for (const cesiumVersion of [...new Set(versions.cesium)]) {
        for (const threeVersion of [...new Set(versions.three)]) {
          const id = manager + "-cesium" + cesiumVersion + "-three" + threeVersion;
          const project = join(work, id);
          await mkdir(project, { recursive: true });
          const controlsThreeVersion = threeVersion !== currentThree;
          const dependencies = { "bettersky-cesium": options["registry-smoke"] ? inspected.manifest.version : "file:" + tarball.replaceAll("\\", "/"), cesium: cesiumVersion };
          const componentPins = compatibleCesiumComponents[cesiumVersion];
          if (componentPins) Object.assign(dependencies, componentPins);
          if (controlsThreeVersion) dependencies.three = threeVersion;
          const manifest = { name: "bettersky-acceptance-fixture", private: true, type: "module", dependencies, devDependencies: { vite: viteVersion, typescript: typescriptVersion, "vite-plugin-static-copy": staticCopyVersion } };
          // Only the lower-three compatibility case needs test-only version control.
          // Default-consumer cases have no overrides and let the SDK install three itself.
          if (manager === "npm" && controlsThreeVersion) manifest.overrides = { three: threeVersion };
          await writeJson(join(project, "package.json"), manifest);
          await writeFile(join(project, ".npmrc"), "@cesium:registry=" + officialRegistry + "/\n");
          if (manager === "pnpm") {
            await writeFile(join(project, "pnpm-workspace.yaml"), (controlsThreeVersion ? "overrides:\n  three: " + JSON.stringify(threeVersion) + "\n" : "") +
              "storeDir: " + JSON.stringify(join(work, "pnpm-store").replaceAll("\\", "/")) + "\n");
          }
          console.log("Install " + id);
          const installStrategy = { mode: componentPins ? "locked-compatible-components" : "clean-install", cesiumComponentPins: componentPins || {}, threeOverride: controlsThreeVersion ? threeVersion : null };
          if (componentPins) {
            await installFixture(manager, project, environment, report, reportFile, id, "lockfile");
            const lockfile = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
            const lockHash = sha256(await readFile(join(project, lockfile)));
            await installFixture(manager, project, environment, report, reportFile, id, "frozen");
            assert.equal(sha256(await readFile(join(project, lockfile))), lockHash, "Frozen install changed the compatible fixture lock");
            installStrategy.lockfile = { file: lockfile, sha256: lockHash, verifiedBy: manager === "npm" ? "npm ci" : "pnpm install --frozen-lockfile" };
          } else {
            await installFixture(manager, project, environment, report, reportFile, id);
          }
          const projectRequire = createRequire(join(project, "package.json"));
          const sdkRoot = await realpath(join(project, "node_modules/bettersky-cesium"));
          const sdkEntry = join(sdkRoot, "dist/index.js");
          for (const entry of inspected.entries) assert.ok((await readFile(join(sdkRoot, entry.path))).equals(entry.data), "Installed package differs from accepted bytes: " + entry.path);
          const sdkRequire = createRequire(sdkEntry);
          const resolved = { sdk: sdkEntry, cesium: sdkRequire.resolve("cesium"), three: sdkRequire.resolve("three") };
          assert.equal(await versionFromEntry(resolved.cesium, "cesium"), cesiumVersion);
          assert.equal(await versionFromEntry(resolved.three, "three"), threeVersion);
          assert.equal(await realpath(resolved.cesium), await realpath(projectRequire.resolve("cesium")), "Cesium must be shared");
          const components = await cesiumComponents(resolved.cesium);
          if (componentPins) assert.deepEqual(components, componentPins, "Compatible Cesium component pins did not resolve through the real Cesium entry");
          await writeFile(join(project, "acceptance.ts"), [
            'import { BetterSky, type BetterSkyOptions, type BetterSkyResolvedOptions } from "bettersky-cesium";',
            'import type { Viewer } from "cesium";',
            'declare const viewer: Viewer;',
            'const options: BetterSkyOptions = { time: undefined, coverage: 0.5, cloud: { altitudes: [4000,6000,10000,0] }, volumetricLight: { quality: "low" }, snow: false };',
            'const betterSkyInstance: BetterSky = new BetterSky(viewer, options);',
            'betterSkyInstance.update({ cloud: { densityScales: [0.1,0.1,0.01,0] } });',
            'const snapshot: BetterSkyResolvedOptions = betterSkyInstance.getOptions();',
            'const unsubscribe: () => void = betterSkyInstance.subscribeAssets(state => { const status = state.status; const errors = state.errors; void status; void errors; });',
            'const defaults: BetterSkyResolvedOptions = BetterSky.getDefaultOptions(); const ready: Promise<void> = betterSkyInstance.loadAssets(); const retried: Promise<void> = betterSkyInstance.retryAssets();',
            'void snapshot; void ready; void retried; unsubscribe(); betterSkyInstance.update({ enabled: false, rain: true, hbao: { enabled: false, intensity: 80 }, snow: true }); betterSkyInstance.dispose();',
          ].join("\n"));
          const typescriptRoot = await realpath(join(project, "node_modules/typescript"));
          const typescriptManifest = await readJson(join(typescriptRoot, "package.json"));
          const tsc = join(typescriptRoot, typescriptManifest.bin.tsc);
          await execute(process.execPath, [tsc, "--noEmit", "--strict", "--exactOptionalPropertyTypes", "--skipLibCheck", "false", "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "--lib", "ES2022,DOM", "acceptance.ts"], { cwd: project, env: environment });
          await mkdir(join(project, "licenses"), { recursive: true });
          // License texts are not served as runtime assets; the integration fixture keeps
          // them outside the public asset root, matching the documented recommendation.
          for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) await cp(join(sdkRoot, file), join(project, "licenses", file));
          const cases = [{ suffix: "root", base: "/", assetsBase: "/cesium/" }];
          if (!options["registry-smoke"] && manager === "npm" && cesiumVersion === versions.cesium[0] && threeVersion === versions.three[0]) {
            cases.push({ suffix: "subpath", base: "/app/", assetsBase: "/app/cesium/" }, { suffix: "custom-assets", base: "/", assetsBase: "/vendor/cesium/" }, { suffix: "source-baseline", base: "/", assetsBase: "/cesium/" });
          }
          for (const variant of cases) {
            const caseId = id + "-" + variant.suffix;
            const outDirectory = join(project, "dist-" + variant.suffix);
            await writeFile(join(project, "index.html"), fixtureHtml(caseId));
            await writeFile(join(project, "main.js"), fixtureMain(caseId, variant.base, report.expectedAssets.includes("snowCoverMask.png")));
            const vite = join(dirname(projectRequire.resolve("vite/package.json")), "bin/vite.js");
            const item = { id: caseId, kind: variant.suffix === "source-baseline" ? "source-baseline" : "package", base: variant.base, assetsBase: variant.assetsBase, dist: outDirectory };
            await writeFile(join(project, "vite.config.js"), fixtureConfig(item));
            await execute(process.execPath, [vite, "build"], { cwd: project, env: environment });
            await verifyFixtureAssets(item, assets);
            report.fixtures.push(item);
            report.browser.status = "pending";
            if (options.serve) {
              const hosted = await serveFixture(item, report, reportFile, requests);
              servers.push(hosted.server);
              item.url = hosted.url;
              console.log("BROWSER " + item.id + " " + hosted.url);
            }
          }
          report.automatic.matrix.push({ id, manager, cesiumVersion, threeVersion, components, resolved, installStrategy, cesiumComponentOverrides: false, zeroOverrides: !controlsThreeVersion, typecheck: "passed", hostBuild: "passed" });
          await writeJson(reportFile, report);
          console.log("Passed install/types/build " + id);
        }
      }
    }
    report.automatic.status = "passed";
    await writeJson(reportFile, report);
    if (options.serve) {
      console.log("REPORT " + reportFile + "\nSend 'finish' on stdin after browser review to stop servers and clean the isolated workspace.");
      await new Promise(resolveWait => {
        process.stdin.setEncoding("utf8");
        const stop = () => {
          process.stdin.off("data", onInput);
          process.stdin.pause();
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
          resolveWait();
        };
        const onInput = text => { if (text.trim() === "finish") stop(); };
        process.stdin.on("data", onInput);
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
    } else {
      console.log("Automatic checks complete; browser acceptance is pending. Use --serve to run the browser fixtures.");
    }
  } catch (error) {
    report.status = "failed";
    report.failure = String(error);
    report.automatic.status = "failed";
    await writeJson(reportFile, report);
    throw error;
  } finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(resolveClose));
    }
    const finalReport = await readJson(reportFile).catch(() => report);
    finalReport.resourceResponses = [...requests.entries()].map(([key, value]) => ({ key, ...value }));
    assert.ok(inside(workParent, work) && work !== workParent);
    assert.equal(await realpath(work), realWork);
    assert.equal((await lstat(work)).isSymbolicLink(), false);
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    finalReport.cleanup = "passed";
    if (options["registry-smoke"] && finalReport.automatic.status === "passed" && finalReport.browser.status === "passed") {
      finalReport.status = "passed";
      finalReport.completedAt = new Date().toISOString();
    }
    await writeJson(reportFile, finalReport);
    console.log("Cleaned acceptance workspace: " + work);
  }
}

const options = argumentsOf(process.argv.slice(2));
if (options.help) console.log("verify:sdk --tarball <file> [--work-dir <outside-repo>] [--report-dir <outside-repo>] [--serve]\nverify:sdk --finalize --report <file> --evidence <browser-review.json>");
else {
  try {
    if (options.refresh) await refreshFixtures(options);
    else if (options.cleanup) await cleanupRecordedWorkspace(options);
    else if (options.finalize) await finalize(options);
    else {
      if (!options.tarball || options.tarball === true) throw new Error("--tarball is required");
      await verify(options);
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
}
