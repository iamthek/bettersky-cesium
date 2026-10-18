# BetterSky4Cesium SDK — Quick Start

**English** | [简体中文](START.zh-CN.md)

> Draft for the planned npm SDK, updated 2026-10-18. SDK packaging, obfuscation and the commands below have not been validated for release. The package name/version are provisional. This document does not claim that `better-sky4cesium@0.1.0` is available. After implementation and verification, this guide will become the package-root README shown on npm.

EffectPipeline is a CesiumJS plugin that adds volumetric clouds, atmosphere, cloud shadows, volumetric light and optional HBAO/SMAA to an existing scene. It uses the host's existing `CESIUM_BASE_URL`. The intended package contains compiled and obfuscated ESM, public TypeScript declarations and the required static assets.

## 1. Requirements and installation

- A browser application with a bundler; the examples below use Vite. Create the Viewer and EffectPipeline on the client, after the container is mounted.
- Cesium **1.142.0** and one active EffectPipeline/Viewer per page, with a globe and a 3D perspective camera.
- A browser/GPU supporting WebGL 2, 3D/array textures and the required floating-point render targets, plus native `Float16Array` and `structuredClone`.
- For the copy command below, use Node.js **22 or newer**. Choose a Vite version compatible with your exact Node version. SDK consumers may use npm or pnpm.

After the release is available, run **one** of these commands in the application directory that owns its `package.json`:

```bash
npm install --save-exact better-sky4cesium@0.1.0 cesium@1.142.0
```

```bash
pnpm add -E better-sky4cesium@0.1.0 cesium@1.142.0
```

Both install the same npm registry package. Cesium is a peer dependency shared with the application; three is installed as an SDK runtime dependency. There is no SDK install-time build, asset download or copy step. The SDK's shader imports will already be bundled, so the application will not need a GLSL raw-text loader for it.

## 2. Copy static assets from node_modules

Copy everything inside `node_modules/better-sky4cesium/dist/assets/` into **`EffectPipelineAssets/` under your Cesium asset root**. For a Vite application with `CESIUM_BASE_URL='/cesium/'`, the destination is `public/cesium/EffectPipelineAssets/`.

Run the following command from the application directory after installation. It also copies Cesium's standard resource directories and the SDK notices. It works with Node.js in PowerShell and common Unix shells:

```bash
node --input-type=module -e "import { cpSync, mkdirSync } from 'node:fs'; mkdirSync('public/cesium/EffectPipelineAssets', { recursive: true }); cpSync('node_modules/better-sky4cesium/dist/assets', 'public/cesium/EffectPipelineAssets', { recursive: true }); for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) { cpSync('node_modules/cesium/Build/Cesium/' + dir, 'public/cesium/' + dir, { recursive: true }); } for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) { cpSync('node_modules/better-sky4cesium/' + file, 'public/cesium/EffectPipelineAssets/' + file); }"
```

The resulting layout is below. Keep exactly one `EffectPipelineAssets/` level, with no extra `assets/` directory:

```text
public/
  cesium/
    Workers/
    Assets/
    ThirdParty/
    Widgets/
    EffectPipelineAssets/
      LICENSE
      THIRD_PARTY_NOTICES.md
      snowCoverMask.png
      ...other shipped effect assets
      GeospatialAssets/
        local_weather.png
        ...shipped .exr, .bin and .png files
```

Vite serves `public/` at the configured application base and copies it into the application build. Other bundlers must provide the equivalent static hosting. Preserve the SDK notices when distributing the application, and retain the applicable Cesium/three notices for the dependency files you distribute.

Use the direct dependency paths under `node_modules/` for both npm and pnpm; pnpm's links are handled by the filesystem. Do not copy from hard-coded `.pnpm/` paths or fetch assets from the source repository. In a workspace, install the dependencies and run the copy command in the consuming application's directory.

Repeat the copy step in CI before building. The command merges and overwrites files; it does not remove obsolete files. When upgrading, replace only `EffectPipelineAssets/` and invalidate old caches, so JavaScript and assets stay on the same version. Preserve Cesium's other directories and keep application-owned files outside `EffectPipelineAssets/`.

### Alternative: let Vite copy assets automatically

Choose this instead of maintaining copies in `public/`. Install the plugin using the package manager already used by the application; this example targets Vite 6:

```bash
npm install --save-dev vite-plugin-static-copy@2.3.2
```

```bash
pnpm add -D vite-plugin-static-copy@2.3.2
```

Merge the following targets into your Vite configuration. Use the same `base` and `define` settings shown in the next section. Remove overlapping manually maintained asset copies before choosing this route.

```js
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Add to the existing plugins array in vite.config.js:
viteStaticCopy({
  targets: [
    {
      src: 'node_modules/better-sky4cesium/dist/assets/*',
      dest: 'cesium/EffectPipelineAssets',
    },
    {
      src: 'node_modules/better-sky4cesium/{LICENSE,THIRD_PARTY_NOTICES.md}',
      dest: 'cesium/EffectPipelineAssets',
    },
    {
      src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}',
      dest: 'cesium',
    },
  ],
})
```

The plugin serves these files during development and copies them into the build. The SDK asset target copies every shipped root entry, including the `GeospatialAssets/` directory. The URL layout is the same as the manual route. For other Vite versions, select a compatible plugin version.

## 3. Configure URLs and attach to a Viewer

Keep the host's existing `CESIUM_BASE_URL`. If it is not configured yet, the following Vite example matches the copy paths above:

```js
import { defineConfig } from 'vite'

const base = '/' // Use '/app/' when hosted at https://example.com/app/.

export default defineConfig({
  base,
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`),
  },
  // Keep the application's existing plugins; add the copy plugin if chosen.
})
```

Once the application has created its Cesium `viewer`, attach the SDK:

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { EffectPipeline } from 'better-sky4cesium'

const effects = new EffectPipeline(viewer, {
  time: undefined, // Preserve the application's current clock time.
})

effects.update({ coverage: 0.5 })
effects.enabled = false
effects.enabled = true

// On page/component teardown, dispose of the effects before the Viewer:
// effects.dispose()
// viewer.destroy()
```

The package will also provide `EffectPipeline` as a default export. No plugin-specific asset URL is needed: resources resolve through Cesium's `buildModuleUrl('EffectPipelineAssets/...')` using the host's `CESIUM_BASE_URL`.

With `CESIUM_BASE_URL='/cesium/'`, the weather texture URL is `/cesium/EffectPipelineAssets/GeospatialAssets/local_weather.png`. For deployment under `/app/`, configure the host's `CESIUM_BASE_URL='/app/cesium/'`; plugin resources follow automatically. Match the application base and server mount path. Browser URLs must never contain `node_modules/` or the local `public/` directory name.

If your application already hosts Cesium resources elsewhere, copy `EffectPipelineAssets/` alongside its `Workers/`, `Assets/`, `ThirdParty/` and `Widgets/` directories. Keep using that Cesium base URL. An HTTPS asset host needs appropriate CORS headers.

`new EffectPipeline(viewer)` applies the full built-in preset, including a fixed clock time. `time: undefined` preserves the current time. The pipeline may also change HDR, logarithmic depth and gamma settings; disposal does not promise a full reset of every scene setting. Keep continuous rendering enabled for cloud animation and temporal reconstruction. If using Cesium's explicit rendering mode, the application must keep requesting frames.

## 4. Check the integration

- Verify that both SDK and Cesium resource requests return actual files, not a 404 or an HTML fallback. Preserve filename case and the `GeospatialAssets/` hierarchy.
- If clouds or the atmosphere are missing, check network failures, the browser console and WebGL capabilities. Loading the ESM module alone does not prove the textures are ready.
- If assets are missing after installation, check the copy step. Installing an npm package does not make its `node_modules/` directory publicly accessible.
- If a subdirectory deployment fails, align the application `base`, `CESIUM_BASE_URL` and server mount path.
- Keep one active instance per page. Dispose of it before destroying the Viewer; creating another instance while it is active is outside the first-release contract.

The package will contain obfuscated runtime JavaScript and public declarations, without original implementation files or sourcemaps. Browser-delivered JavaScript, GLSL and textures remain inspectable at runtime; obfuscation does not guarantee protection against reverse engineering.

## License

[Proprietary trial license](LICENSE). All individuals and organizations may currently try the SDK at no charge, including commercial projects and production deployments, without individual approval. The SDK and the consuming application may remain closed source. There is no fixed charging date. The licensor may end the free trial for specified versions or uses with at least 30 calendar days' published notice; continued affected use then requires separate authorization, which may be paid. Lawful trial use is not charged retroactively, and existing separate authorizations retain their agreed terms.

Include the license and [third-party notices](THIRD_PARTY_NOTICES.md) with permitted application distributions and inform recipients of the trial and future authorization conditions. Third-party materials retain their original terms. See the full license for distribution restrictions.
