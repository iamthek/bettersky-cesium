# BetterSky for Cesium

**English** | [简体中文](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/README.zh-CN.md)

BetterSky for Cesium is a CesiumJS visual effects plugin. Its **BetterSky** adds volumetric clouds, atmosphere, cloud shadows, volumetric light and image enhancement to an existing 3D globe scene.

## Highlights

- Layered volumetric clouds with configurable shape, altitude, coverage and motion.
- Atmospheric scattering, moving cloud shadows and sunlight shafts in one scene.
- Bloom, lens flare, tone mapping and optional HBAO/SMAA.
- Built-in presets, partial parameter updates and runtime switches through one API.

## Usage

Use Cesium **1.142.0 or later**, three **0.160.1 or later**, a browser bundler and one active BetterSky/Viewer per page. These are minimum supported versions; they do not imply that every future release has already been tested. Check rendering and lifecycle behavior when upgrading dependencies because the plugin uses renderer internals. The browser/GPU must support WebGL 2, 3D/array textures, the required floating-point render targets, native `Float16Array` and `structuredClone`.

### Install

Choose npm or pnpm in the consuming application's directory:

```bash
npm install bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

```bash
pnpm add bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

Both install the same package. Cesium is shared with the application; three (`>=0.160.1`) is installed automatically as a runtime dependency. Applications may pin versions they have verified within these ranges.

Cesium installs its matching engine and widgets through its own dependencies. No Cesium component overrides are required. Preserve the application's lockfile and validate the complete dependency combination after an upgrade.

### Copy assets

The plugin uses the host's **`CESIUM_BASE_URL`**. Copy the contents of `node_modules/bettersky-cesium/dist/assets/` into **`BetterSkyAssets/` under that Cesium asset root**. For `CESIUM_BASE_URL='/cesium/'` in a Vite application:

| Source | Destination |
| --- | --- |
| `node_modules/bettersky-cesium/dist/assets/` contents | `public/cesium/BetterSkyAssets/` |
| Cesium's `Workers/`, `Assets/`, `ThirdParty/`, `Widgets/` | Keep the application's existing copies under `public/cesium/` |

> **Tip:** Under the license terms, keep `LICENSE` and `THIRD_PARTY_NOTICES.md` with any copy of the SDK or its runtime build that you distribute.

Use `vite-plugin-static-copy` to copy the runtime assets automatically during dev and build instead of maintaining copies under `public/` by hand:

```bash
npm install -D vite-plugin-static-copy@4.1.1
```

```js
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // Copy entries inside assets, preserving GeospatialAssets/.
          src: 'node_modules/bettersky-cesium/dist/assets/**/*',
          dest: 'cesium/BetterSkyAssets',
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
})
```

The `assets/**/*` pattern includes nested resources. `rename: { stripBase: 4 }` removes `node_modules/bettersky-cesium/dist/assets/` while preserving `GeospatialAssets/` and its files. npm and pnpm both use the paths above, without accessing `.pnpm/`. CI builds copy the assets automatically too. On upgrade, replace only `BetterSkyAssets/` and refresh cached assets so JavaScript and resources stay on the same version.

Keep the application's existing Cesium asset configuration. If Cesium assets are not configured yet, copy them in the same plugin:

```js
viteStaticCopy({
  targets: [
    {
      src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}',
      dest: 'cesium',
      rename: { stripBase: 4 },
    },
    // BetterSky targets from above
  ],
})
```

For a site hosted at `/app/`, use the matching application base and `CESIUM_BASE_URL='/app/cesium/'`. Plugin assets then load from `/app/cesium/BetterSkyAssets/`. If Cesium resources are already hosted elsewhere, put `BetterSkyAssets/` alongside their `Workers/` directory. No additional plugin asset URL is needed.

### Attach to a Viewer

After the application has created its Cesium `viewer` on the client:

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

const effects = new BetterSky(viewer, {
  time: undefined, // Preserve the application's current clock time.
})

effects.update({ coverage: 0.5 })
effects.enabled = false
effects.enabled = true
```

Keep rendering continuously for animated clouds. The pipeline applies scene settings such as HDR, gamma and logarithmic depth; disposal does not restore all settings. On page/component teardown, dispose of the effects before destroying the Viewer:

```js
effects.dispose()
viewer.destroy()
```

`dispose()` is safe to call more than once, including while assets are loading. Requests are not actively canceled; late callbacks skip GPU resource creation after disposal. Dispose of the previous instance before creating a replacement.

If effects are missing, first check resource requests under `CESIUM_BASE_URL + 'BetterSkyAssets/'`, the browser console and WebGL capabilities. Requests must return actual files rather than an HTML fallback.

## License

[Proprietary trial license](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/LICENSE). All individuals and organizations may currently try the SDK at no charge, including commercial projects and production deployments, without individual approval. The SDK and applications using it may remain closed source. There is no fixed charging date. The licensor may end the free trial for specified versions or uses with at least 30 calendar days' published notice; continued affected use then requires separate authorization, which may be paid. Lawful trial use is not charged retroactively, and existing separate authorizations retain their agreed terms.

Permitted application distributions must include the license and [third-party notices](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/THIRD_PARTY_NOTICES.md), and inform recipients of the trial and future authorization conditions. Third-party materials retain their original terms; see the full license for distribution restrictions. For licensing questions, contact [iamthek@qq.com](mailto:iamthek@qq.com).

## Support the Project

If this project helped you, please, kind stranger, buy me a coffee 🙏☕ Just a tired developer running on caffeine here — your support keeps the project alive and improving.

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="Alipay" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="WeChat Pay" width="200" height="300">
</p>
