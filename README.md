# BetterSky for Cesium

**English** | [简体中文](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/README.zh-CN.md)

An atmosphere, volumetric cloud and lighting SDK for CesiumJS. Add layered clouds, moving cloud shadows, sunlight shafts and image effects to an existing 3D globe through a single `BetterSky` instance.

[User guide & API](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/BetterSky.README.md) · [npm](https://www.npmjs.com/package/bettersky-cesium)

## Highlights

- **Layered skies** — Three cloud layers with configurable cloud types, altitude, thickness, density and weather motion.
- **Atmosphere and lighting** — Atmospheric perspective, day/night skies, cloud shadows and volumetric sunlight.
- **Image quality** — Bloom, lens flare, tone mapping, HBAO ambient occlusion and SMAA antialiasing.
- **Performance-conscious rendering** — Low-resolution cloud sampling and temporal reconstruction, distance-based detail reduction and high-altitude fading reduce rendering work. Actual performance depends on the GPU, resolution, view and enabled effects.
- **Application integration** — Built-in defaults, partial updates, runtime switches and TypeScript declarations for an existing Cesium Viewer.

## Quick start

Use an ESM browser application with Cesium `>=1.142.0`, WebGL 2, the required floating-point texture/render-target support, `Float16Array` and `structuredClone`. The scene must contain a globe and use a 3D perspective camera. See the guide for full requirements and upgrade considerations.

### 1. Install

Run either command in your application:

```bash
npm install bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

```bash
pnpm add bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

Cesium is shared with the application; three (`>=0.160.1`) is installed as a runtime dependency. Keep your application's verified lockfile.

### 2. Prepare assets

BetterSky uses the application's `CESIUM_BASE_URL`. For `/cesium/` in a Vite application, copy these directories into `public/`:

| Source | Destination |
| --- | --- |
| `node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}` | `public/cesium/` — keep all four directories |
| Contents of `node_modules/bettersky-cesium/dist/assets/` | `public/cesium/BetterSkyAssets/` — preserve nested directories |

Keep your existing Cesium asset setup if already configured. Set the base URL before creating the Viewer, as in the next step. [Automatic copying and subpath deployment](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/BetterSky.README.md) are covered in the guide.

### 3. Attach to your Viewer

In the client entry, before creating your application's `viewer`:

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

window.CESIUM_BASE_URL = '/cesium/'

// Create your application's Cesium Viewer here, then attach BetterSky.
const effects = new BetterSky(viewer, { time: undefined })
```

`time: undefined` preserves the application's clock. Keep the Viewer rendering continuously for animated clouds. When leaving the scene, call `effects.dispose()` before destroying the Viewer. Continue with the guide for configuration, resource loading and lifecycle details.

### Run the repository demo

Use Node.js 24 and pnpm 12.8.1. From a clone of this repository:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite, usually [http://localhost:3000/](http://localhost:3000/). Service keys are optional; without them, the demo uses local imagery and ellipsoid terrain.

## Documentation

- [User guide & API reference](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/BetterSky.README.md): complete setup, options, methods and usage notes, with differences between the current source and npm `0.1.0` identified.
- [Demo setup and deployment](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/demo/README.md): optional service keys and GitHub Pages configuration.
- [Changelog](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/CHANGELOG.md).

## License

[Proprietary trial license](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/LICENSE). All individuals and organizations may currently try the SDK at no charge, including commercial projects and production deployments, without individual approval. The SDK and applications using it may remain closed source. There is no fixed charging date. The licensor may end the free trial for specified versions or uses with at least 30 calendar days' published notice; continued affected use then requires separate authorization, which may be paid. Lawful trial use is not charged retroactively, and existing separate authorizations retain their agreed terms.

Permitted application distributions must include the license and [third-party notices](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/THIRD_PARTY_NOTICES.md), and inform recipients of the trial and future authorization conditions. Third-party materials retain their original terms; see the full license for distribution restrictions. For licensing questions, contact [iamthek@qq.com](mailto:iamthek@qq.com).

## Support the Project

If this project helped you, please, kind stranger, buy me a coffee 🙏☕ Just a tired developer running on caffeine here — your support keeps the project alive and improving.

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="Alipay" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="WeChat Pay" width="200" height="300">
</p>
