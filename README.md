# BetterSky for Cesium

**English** | [简体中文](https://github.com/iamthek/bettersky-cesium/blob/main/README.zh-CN.md)

Bring your Cesium globe to life with layered clouds, moving cloud shadows and sunlight streaming through the sky. BetterSky plugs into an existing, official CesiumJS Viewer and brings atmosphere, lighting and image effects together in one SDK.

[Live demo](https://iamthek.github.io/bettersky-cesium/) · [User guide & API](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.md) · [npm](https://www.npmjs.com/package/bettersky-cesium)

![BetterSky clouds, atmosphere and lighting in the Cesium demo](https://raw.githubusercontent.com/iamthek/bettersky-cesium/main/docs/images/demo.gif)

## Highlights

- **Build your sky** — Three cloud layers with adjustable cloud types, height, thickness, density and weather motion.
- **Add depth and light** — Atmospheric perspective, day/night skies, moving cloud shadows and volumetric sunlight.
- **Polish the image** — Bloom, lens flare, tone mapping, HBAO ambient occlusion and SMAA antialiasing.
- **Keep rendering practical** — Low-resolution cloud sampling, temporal reconstruction, distance-based detail and high-altitude fading reduce rendering work.
- **Fit your application** — Attach to an existing Viewer, start with the built-in preset, then change options or toggle effects at runtime. TypeScript declarations include parameter help.

## Quick start

Use a browser application with Cesium `>=1.142.0`, WebGL 2, the required floating-point texture support, `Float16Array` and `structuredClone`. BetterSky supports a 3D globe with a perspective camera and one active instance per page. See the [guide](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.md#requirements) for the full requirements.

### 1. Install

Choose npm or pnpm. This example uses the verified Cesium `1.146.0` combination:

```bash
npm install bettersky-cesium@0.2.0 cesium@1.146.0
```

```bash
pnpm add bettersky-cesium@0.2.0 cesium@1.146.0
```

Already using a compatible Cesium version? Install only `bettersky-cesium@0.2.0` and keep your verified lockfile. Cesium is shared with the application; three (`>=0.160.1`) is installed automatically. The [compatibility notes](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.md#compatibility-and-deployment) explain a known Cesium dependency combination to avoid.

### 2. Prepare assets

BetterSky uses your application's `CESIUM_BASE_URL`. If that URL is `/cesium/`, prepare these files in a Vite application's `public/` directory:

| Source | Destination |
| --- | --- |
| `node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}` | `public/cesium/` — keep all four directories |
| Contents of `node_modules/bettersky-cesium/dist/assets/` | `public/cesium/BetterSkyAssets/` — keep the nested directories |

If Cesium assets are already configured, add only `BetterSkyAssets/` under the same root. The guide includes [automatic copying and subpath deployment](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.md#assets-and-deployment).

### 3. Attach to your Viewer

Set the asset URL before creating your Viewer, then attach BetterSky:

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

window.CESIUM_BASE_URL = '/cesium/'

// Create your application's Cesium Viewer here.
const effects = new BetterSky(viewer, { time: undefined })

// Change only the options you need.
effects.update({ coverage: 0.5 })

// When leaving the scene, dispose of BetterSky before destroying the Viewer.
// effects.dispose()
```

`time: undefined` keeps your application's clock. Keep the Viewer rendering continuously for animated clouds. Continue with the [user guide](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.md) for options, asset loading, retries and cleanup, or browse the [changelog](https://github.com/iamthek/bettersky-cesium/blob/main/CHANGELOG.md).

## License

Version `0.2.0` uses the [Apache License 2.0](https://github.com/iamthek/bettersky-cesium/blob/main/LICENSE), allowing personal and commercial use, modification and redistribution under its terms. Preserve the license, [NOTICE](https://github.com/iamthek/bettersky-cesium/blob/main/NOTICE) and applicable [third-party notices](https://github.com/iamthek/bettersky-cesium/blob/main/THIRD_PARTY_NOTICES.md) when distributing the SDK. Third-party materials retain their own licenses.

Questions: [iamthek@qq.com](mailto:iamthek@qq.com).

## Support the Project

If this project helped you, please, kind stranger, buy me a coffee 🙏☕ Just a tired developer running on caffeine here — your support keeps the project alive and improving.

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="Alipay" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="WeChat Pay" width="200" height="300">
</p>
