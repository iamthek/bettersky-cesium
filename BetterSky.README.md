# BetterSky Usage Guide and API Reference

**English** | [简体中文](BetterSky.README.zh-CN.md) · [Project overview](README.md)

This guide covers SDK integration, configuration, and usage notes.

[Usage](#usage) · [Parameters](#parameters) · [Notes](#notes)

## Usage

### Version scope

The installation examples use the published npm release `0.1.0`; the parameter tables describe the current repository's public entry point. The current source has not been republished. A repository `package.json` that still says `0.1.0` does not mean the npm package contains all current changes.

| Capability | npm `0.1.0` | Current repository |
| --- | --- | --- |
| Initialization, partial updates, effect toggles, disposal, and the configuration groups below | Basic integration is available | Retained, with the current parameter validation rules |
| `getOptions()` configuration snapshot | Unavailable | Available |
| `assetStatus`, `assetErrors`, `assetsReady`, `retryAssets()`, `subscribeAssets()` | Unavailable | Available |
| Tone mapping modes `2` / `4` and Pass rain/snow controls | Available at runtime; older declarations are incomplete | Declarations now cover them |
| `hbao.denoise` and the update-specific type | Older declarations omit this field and `BetterSkyUpdateOptions` | Explicitly declared as a constructor-only option; excluded from the update type |

Use examples marked "current repository" in this checkout, or wait for a release that includes those capabilities. Do not call the new methods on `0.1.0`.

### Requirements

| Item | Requirement |
| --- | --- |
| Application | A browser project using an ESM build tool; create instances on the client |
| Cesium | `>=1.142.0`, sharing the application's Cesium dependency |
| three | `>=0.160.1`, installed automatically as an npm runtime dependency |
| Scene | Has a `globe`, uses `SceneMode.SCENE3D` and `PerspectiveFrustum` |
| Browser / GPU | WebGL 2, 3D and array textures, floating-point and half-float textures with corresponding render targets and linear filtering; support for `Float16Array` and `structuredClone` |
| Package installation | The npm package declares Node.js `>=22.0.0`; also meet your build tool's Node.js requirements |
| Repository demo / development | Node.js `>=22.12.0`, preferably Node.js 24; pnpm 12.8.1 |

Only one BetterSky instance may be active per page. Dispose of the old instance before creating a replacement.

### Installation

Run either command in your application:

```bash
npm install bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

```bash
pnpm add bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

The package provides named and default exports and `dist/index.d.ts`; no separate type package is needed. The current repository's declarations also include Chinese field documentation for editor hints covering meanings, units, defaults, and constraints.

### Assets and deployment

The SDK uses the host application's `CESIUM_BASE_URL`. Deploy the contents of `node_modules/bettersky-cesium/dist/assets/` into `BetterSkyAssets/` under that root, alongside Cesium's `Workers/`:

```text
/cesium/
  Workers/
  Assets/
  ThirdParty/
  Widgets/
  BetterSkyAssets/
    snowCoverMask.png
    GeospatialAssets/
      *.exr
      *.bin
      *.png
```

For manual copying in Vite, use `public/cesium/`. The contents of `dist/assets/` belong in `public/cesium/BetterSkyAssets/`; do not add another nested `assets/` directory.

Use `vite-plugin-static-copy` to serve the same assets during development and copy them during production builds:

```bash
npm install -D vite-plugin-static-copy@4.1.1
```

Merge the following into your application's Vite configuration. If Cesium assets are already deployed, add only the BetterSky copy target:

```js
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const base = '/' // Use '/app/' when deploying under that subpath.

export default defineConfig({
  base,
  define: { CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`) },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}/**/*',
          dest: 'cesium',
          rename: { stripBase: 4 },
        },
        {
          src: 'node_modules/bettersky-cesium/dist/assets/**/*',
          dest: 'cesium/BetterSkyAssets',
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
})
```

`stripBase: 4` removes the first four source path segments while preserving internal directories such as `Workers/`, `Assets/`, and `GeospatialAssets/`. npm and pnpm use the same paths; do not access `.pnpm/`. The plugin serves assets during development and copies them into the output directory during builds.

For deployment under `/app/`, keep the application `base`, server mount path, and `CESIUM_BASE_URL='/app/cesium/'` aligned. Effect assets then load from `/app/cesium/BetterSkyAssets/`. On another server or CDN, place `BetterSkyAssets/` under the existing Cesium asset root and allow the application's cross-origin requests. Other build tools can use equivalent asset copying and base URL configuration.

### Initialization and updates

After your application creates `viewer`, initialize the SDK on the client:

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

const effects = new BetterSky(viewer, {
  time: undefined, // Preserve the application's time.
  coverage: 0.5,
  cloud: { densityScales: [0.12, 0.09, 0.0015, 0] },
})

effects.update({ cloud: { heights: [1300, 1800, 650, 0] } })
effects.enabled = false
effects.enabled = true
```

`new BetterSky(viewerOrScene, options?)` accepts a Viewer or Scene. Passing a Scene does not set a Viewer clock. The instance registers its render stages and per-frame updates automatically; do not add `effects.stage` again or manually call lower-level updates.

Constructor options merge with the defaults; `update()` merges with the accepted configuration. Nested objects merge by field, and arrays are replaced as a whole. Omitted fields keep their values. In the current repository, explicit `undefined` is treated as omission except for `time`; use `null` only for fields that explicitly support it. Invalid fields or values are rejected during parameter validation.

In this repository, use `import { BetterSky } from './src/index.ts'` relative to the repository root to try unreleased capabilities. The repository demo already uses this entry point.

### Configuration snapshots and asset loading (current repository)

`BetterSky.defaultOptions` returns an independent copy of the default preset. `effects.getOptions()` returns an independent snapshot of the accepted configuration; changing the snapshot does not change the instance. Vectors are normalized to arrays in snapshots. Direct changes through the advanced Pass API are not reflected in the snapshot.

```js
const current = effects.getOptions()
console.log(current.coverage)

const unsubscribe = effects.subscribeAssets(() => {
  if (effects.assetStatus === 'error') console.error(effects.assetErrors)
})

await effects.assetsReady
if (effects.assetStatus !== 'disposed') {
  const errors = effects.assetErrors.filter(item => item.required)
  if (errors.length > 0) console.error('Sky assets failed to load', errors)
}

// Call from a UI retry action; check assetErrors again afterward.
// await effects.retryAssets()

// Unsubscribe when leaving the page.
unsubscribe()
```

Reading `assetsReady` starts and waits for the six required sky asset tasks, even with `enabled: false`. It resolves after success, failure, or disposal. Loading failures do not reject the Promise; inspect `assetErrors`. It does not wait for the optional snow texture or SMAA lookup textures; SMAA textures are not tracked by these asset states.

`assetStatus` is one of `idle`, `loading`, `ready`, `error`, or `disposed`. An optional asset failure may also produce `error`. Each error contains `id`, `url`, `required`, and the original `error`. `retryAssets()` explicitly retries failed assets without reloading successful ones; failures are not retried automatically each frame. `subscribeAssets(listener)` returns an unsubscribe function. Its callback receives no arguments; read the state inside the callback.

### Runtime API

| API | Access / purpose |
| --- | --- |
| `BetterSky.defaultOptions` | Static getter returning a fresh copy of the default options. |
| `effects.update(options)` | Shares validation and application logic with convenience setters; rejects unknown fields or invalid values before committing changes. |
| `effects.getOptions()` (current repository) | Returns an independent snapshot of accepted options; retains HBAO's internal values while disabled so they can be restored. |
| `effects.assetStatus` / `effects.assetErrors` (current repository) | Sky asset state and a read-only error snapshot. |
| `effects.assetsReady` (current repository) | Reading it starts the six required asset tasks as needed and waits for them; also resolves on failure or disposal. Excludes SMAA and the optional snow task. |
| `effects.retryAssets()` / `effects.subscribeAssets(listener)` (current repository) | Explicitly retry failed assets; subscribe to changes and receive an unsubscribe function. |
| `effects.enabled` | Read/write master pipeline switch. |
| `effects.coverage` | Read/write weather coverage. |
| `effects.toneMappingExposure` | Read/write exposure multiplier. |
| `effects.toneMappingMode` | Setter only; changing modes rebuilds the sky render stage. |
| `effects.localWeatherVelocity` | Setter only; accepts an array or Cartesian2. |
| `effects.setCloudAltitudes(value)` | Sets four-component cloud base altitudes. |
| `effects.setCloudHeights(value)` | Sets four-component cloud thicknesses. |
| `effects.setCloudDensityScales(value)` | Sets four-component cloud density multipliers. |
| `effects.setCloudShapeDetailAmounts(value)` | Sets four detail erosion amounts in [0, 1]. |
| `effects.hbaoEnabled` / `effects.smaaEnabled` | Read/write optional effect switches. |
| `effects.hbaoIntensity` / `effects.hbaoMaxRadius` | Setters only; set AO intensity/radius. |
| `effects.pass` | Getter exposing the underlying GeospatialPipelinePass for advanced operations. |
| `effects.stage` | Getter exposing the current sky PostProcessStageComposite; read it again after a stage rebuild. |
| `effects.dispose()` | Idempotently removes per-frame listeners and registered stages, restores captured sky/globe settings, and releases Pass resources owned by the instance. |

### Common configurations

Adjust surface and cloud fill lighting separately instead of relying only on global exposure:

```js
effects.update({
  irradianceScale: 0.15,
  aerialPerspectiveStrength: 0.2,
  volumetricLight: { mode: 'volumetric', intensity: 2 },
  cloud: { skyIrradianceScale: 1.8, groundIrradianceScale: 1.3 },
})
```

Reduce volumetric light quality, simplify distant clouds earlier, and disable AO:

```js
effects.update({
  volumetricLight: { mode: 'volumetric', quality: 'low' },
  cloud: { lodRange: [120000, 300000] },
  hbao: false,
})
```

Control sun time and weather movement separately:

```js
effects.update({ time: '2026-05-01T06:00:00Z' })
viewer.clock.shouldAnimate = false
effects.localWeatherVelocity = [0, 0]
```

Pausing the Viewer clock does not stop weather map movement. Weather velocity is measured in UV/second, not meters/second. Other lower-level cloud shape or detail motion is not controlled by this weather map setting.

### Advanced Pass controls

Prefer `update()` for normal use. `effects.pass` exposes the following advanced members. Direct changes do not update the configuration snapshot and may bypass top-level parameter validation:

| Member | Access / purpose |
| --- | --- |
| `stage`, `ready`, `name` | Read-only stage reference, stage readiness, and name; `ready` does not mean all asynchronous assets are ready. |
| `enabled` | Read/write sky Pass switch; use `effects.enabled` to coordinate HBAO / SMAA as well. |
| `coverage`, `toneMappingExposure` | Read/write coverage/exposure; prefer the top-level APIs to keep configuration and cloud history consistent. |
| `toneMappingMode` | Write only; supports the tone mapping modes above and rebuilds the stage on assignment. |
| `localWeatherVelocity` | Read/write `Cartesian2`, in UV/second. |
| `aerialPerspectiveStrength` | Read/write aerial perspective strength, `[0, 1]`. |
| `cloudAltitudeFadeRange` | Read/write altitude range or `null`, with the same units as `cloud.altitudeFadeRange`. |
| `setVolumetricLightOptions(options)` | Partially updates volumetric light using `BetterSkyVolumetricLightOptions`; prefer top-level `update()`. |
| `showSnow`, `showRain` | Write-only booleans, both defaulting to `false`; enable surface snow or rain streaks/flashes, rebuilding the affected stages. |
| `isDestroyed()` | Returns whether the Pass has been destroyed. |

```js
effects.pass.showSnow = true
effects.pass.showRain = true
```

Rain and snow are not top-level constructor or `update()` options. These setters cannot read the current toggle state. Snow requires `BetterSkyAssets/snowCoverMask.png`.

### Disposal

```js
effects.dispose()
viewer.destroy() // Only if the application also needs to destroy the Viewer.
```

Dispose of the effects before destroying the host Viewer. Calling `dispose()` repeatedly is safe. The current repository also supports disposal while assets are loading: requests are not actively aborted, and late callbacks skip GPU creation. Asset state and configuration snapshots remain readable after disposal; parameter updates and loading retries are prohibited.

## Parameters

The defaults below match `BetterSky.defaultOptions` in the current repository. All numeric values must be finite; `NaN` and infinity are invalid. All options below support `update()` except the constructor-only `hbao.denoise`. Scene and time options follow their own application rules.

### General options

| Parameter | Type | Default | Meaning / range |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master switch coordinating configured HBAO, SMAA, and volumetric light; retains resources when disabled. |
| `coverage` | number | `0.34` | Overall weather coverage `[0, 1]`, controlled separately from per-layer density. |
| `localWeatherVelocity` | 2D vector | `[0.0003, 0.0001]` | Weather map UV offset per second. Negative values reverse direction; `[0, 0]` stops weather map movement. |
| `toneMappingMode` | number | `9` | `2` Reinhard2, `4` Uncharted2, `7` AgX, `8` Neutral, `9` ACES, `10` Linear, `11` Reinhard, `12` Cineon. Changes rebuild the sky stage. Mode `3` is unsupported. |
| `toneMappingExposure` | number | `2.8` | Nonnegative brightness multiplier; higher values are brighter. Not measured in EV. |
| `irradianceScale` | number | `0.15` | Nonnegative surface irradiance multiplier, separate from cloud fill lighting. |
| `aerialPerspectiveStrength` | number | `0.15` | Surface aerial perspective blend strength `[0, 1]`; `0` disables this blend. |
| `darkParamY` | number | `0.5` | Night sky glow modulation. Any finite number is accepted; `[0, 1]` is recommended. |
| `bloomIntensity` | number | `0.002` | Nonnegative bloom intensity; `0` removes its intensity contribution without releasing the stage. |
| `systemLight` | boolean | `true` | Follows Cesium's sun direction; keeping `true` is recommended. See [Notes](#notes). |
| `applySceneSettings` | boolean | `true` | Controls whether scene settings apply in the current call. See [Scene settings and disposal](#scene-settings-and-disposal). |
| `highDynamicRange` | boolean | `true` | Scene HDR, governed by `applySceneSettings` in the current call. |
| `logarithmicDepthBuffer` | boolean | `true` | Scene logarithmic depth, governed by `applySceneSettings` in the current call. |
| `gamma` | number | `2.2` | Positive scene display gamma, separate from HBAO gamma. |
| `hbao` | boolean / object | HBAO options below | `false` disables; `true` enables; an object overrides specified values and enables HBAO. Re-enabling restores saved values. |
| `smaa` | boolean | `true` | SMAA anti-aliasing for the final image. |
| `time` | string / null / undefined | `"2026-05-01T06:00Z"` | Valid ISO 8601 time; `Z` means UTC. Omitting it during construction uses the preset time; explicit `null` / `undefined` preserves the application clock. Omitting it in `update()` also preserves the clock. Has no effect when only a Scene is provided. |

### Cloud layers and visibility

2D vectors accept `[x, y]` or Cesium `Cartesian2`. 4D vectors accept `[layer 1, layer 2, layer 3, reserved]` or `Cartesian4`; keep the fourth component at `0` by convention. Cloud base altitude is relative to the rendered planet surface, not the terrain height at each location. By default, the first two layers cast cloud shadows; choosing a cloud type does not change which layers cast shadows.

| Parameter | Type | Default | Meaning / range |
| --- | --- | --- | --- |
| `cloud.layerTypes` | Three-element array / null | `["cumulus", "altocumulus", "cirrus"]` | Each element is `cumulus`, `altocumulus`, or `cirrus`; `null` uses generic cloud shapes. |
| `cloud.altitudes` | 4D vector | `[4000, 6000, 10000, 0]` | Cloud base altitudes in meters; each component must be finite. |
| `cloud.heights` | 4D vector | `[1300, 1800, 650, 0]` | Nonnegative cloud thicknesses in meters; cloud top = base altitude + thickness. |
| `cloud.densityScales` | 4D vector | `[0.12, 0.09, 0.0015, 0]` | Nonnegative cloud density multipliers; `0` removes the medium in that layer. |
| `cloud.shapeDetailAmounts` | 4D vector | `[0.18, 0.12, 0, 0]` | Each component is `[0, 1]`; higher values produce more eroded cloud edges. |
| `cloud.lodRange` | Two-element array / null | `[200000, 500000]` | Near/far camera distance thresholds for detail, in meters, with `0 ≤ near < far`; `null` disables distance-based LOD. |
| `cloud.altitudeFadeRange` | Two-element array / null | `[30000, 90000]` | Fade range based on camera ellipsoid height, in meters, with `0 ≤ start < end`; affects clouds, cloud shadows, and related light shafts. `null` disables fading. |
| `cloud.skyIrradianceScale` | number | `1.8` | Nonnegative sky fill multiplier affecting clouds and legacy haze. |
| `cloud.groundIrradianceScale` | number | `1.3` | Nonnegative ground-reflected fill multiplier for clouds, separate from `irradianceScale`. |

Distance-based LOD does not move the clouds or disable camera altitude fading. By default, clouds fade out completely at a camera altitude of 90 km. Adjust the range or pass `null` if clouds should remain visible at higher altitudes.

### Volumetric light

`volumetricLight.mode` is `volumetric` (the default standalone volumetric light), `legacy` (the older haze options), or `off` (disables both additional volumetric light paths). Atmosphere, cloud lighting, bloom, and lens flare remain independently controlled.

| Parameter | Type | Default | Meaning / range |
| --- | --- | --- | --- |
| `volumetricLight.mode` | string | `"volumetric"` | `"volumetric"`, `"legacy"`, or `"off"`. |
| `volumetricLight.density` | number | `0.000008` | Nonnegative extinction density, in inverse meters; `0` removes this medium. |
| `volumetricLight.intensity` | number | `2` | Nonnegative scattering brightness multiplier; `0` removes scattered brightness while retaining medium extinction. |
| `volumetricLight.layerDepth` | number | `2400` | Positive volumetric layer thickness below the lowest active shadow-casting cloud base, in meters; the bottom is clamped to the rendered planet surface. |
| `volumetricLight.maxDistance` | number | `16000` | Positive maximum viewing distance in meters, limited by terrain and planet occlusion. |
| `volumetricLight.anisotropy` | number | `0.55` | Forward scattering preference `[0, 0.9]`; `0` is isotropic. Higher values concentrate scattering toward views facing the sun. |
| `volumetricLight.quality` | string | `"balanced"` | `"low"`, `"balanced"`, or `"high"`; higher quality generally costs more GPU time and memory. |

The default volumetric layer spans planet altitudes of 1600–4000 m and does not follow terrain elevation. `layerDepth` and `maxDistance` control the affected air volume, `density` controls its concentration, and `intensity` controls brightness. Use `mode: "off"` to disable additional volumetric light entirely. Quality changes reallocate related resources; switching to `legacy` / `off` releases the standalone volumetric light's offscreen resources.

An explicit `volumetricLight.mode` takes priority in the current constructor or update call. If that call contains any `cloud.haze*` field without an explicit mode, it selects `legacy` automatically. Other partial updates retain the current mode, and mode changes preserve existing haze options.

```js
effects.update({ volumetricLight: { mode: 'volumetric', quality: 'low' } })
effects.update({ volumetricLight: { mode: 'off' } })
effects.update({ cloud: { hazeDensityScale: 0.000008 } }) // Switches to legacy.
```

### Legacy haze

These fields control the older haze path in `legacy` mode. `cloud.maxShadowLengthRayDistance` also limits atmospheric shadow length. Prefer `volumetricLight` for new integrations.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `cloud.hazeDensityScale` | number | `0.000008` | Nonnegative medium density; 0 removes additional haze contributions. |
| `cloud.hazeCloudAttached` | boolean | `true` | true integrates a local world-space layer below cloud bases, with optional ground fog; false uses exponential height fog. |
| `cloud.hazeGroundDensityScale` | number | `0` | Ground density multiplier [0, 1] in local mode; 0 retains only cloud-base shafts, and 1 restores the full near-ground layer. |
| `cloud.hazeViewDistance` | number | `16000` | Maximum viewing distance for the local layer, in positive finite meters. |
| `cloud.hazeVolumeLength` | number | `1200` | Maximum accumulated medium path length through the local layer, in positive finite meters; gaps do not count toward the length. |
| `cloud.hazeDirectLightScale` | number | `8` | Nonnegative direct sunlight scattering gain, separate from medium extinction. |
| `cloud.hazeQuality` | string | `"high"` | Integration sample budget / cloud shadow filter samples: low = 16 / 1; balanced = 24 / 2; high = 32 / 4. |
| `cloud.hazeHeightFalloff` | number | `1200` | Positive finite height scale in meters for exponential height decay or local layer thickness. |
| `cloud.hazeAnisotropy` | number | `0.55` | Forward scattering preference [0, 0.9]; 0 is isotropic. |
| `cloud.maxShadowLengthRayDistance` | number | `6000` | Maximum atmospheric shadow integration length, in positive finite meters; also limits the haze path in exponential mode. |
| `cloud.hazeSunColor` | array | `[1, 0.78, 0.42]` | Three nonnegative linear RGB multipliers, not 0–255 sRGB values. |

Haze is also modulated by effective cloud coverage after camera altitude fading: its contribution is zero at coverage ≤ 0.2 and increases gradually between 0.2–0.4. Local mode also requires at least one of the first two layers to be active and cast cloud shadows. Increasing haze density alone cannot bypass these conditions.

### Cloud denoising

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `cloud.denoise.temporalAlpha` | number | `0.04` | Current-frame weight [0, 1]; lower values rely more on history and reduce noise more strongly. |
| `cloud.denoise.currentFrameAlpha` | number | `0.08` | Current-frame weight [0, 1] for newly sampled pixels; higher values reveal new detail sooner but can expose more noise. |
| `cloud.denoise.motionAlpha` | number | `0.25` | Raises the accumulation baseline during camera motion, in [0, 1]; the final blend weight still adapts. |
| `cloud.denoise.varianceGamma` | number | `2` | Positive finite variance clipping multiplier; higher values allow a wider range of historical colors. |
| `cloud.denoise.spatialFilterStrength` | number | `0.8` | Depth/transparency-aware reconstruction strength [0, 1]; higher values smooth more but lose more detail. |

Greater reliance on history reduces noise but can increase ghosting; stronger spatial filtering softens detail. SMAA handles final-image edges and does not replace cloud denoising.

`cloud.denoise` applies to clouds and legacy haze. It does not adjust denoising for standalone volumetric light.

### HBAO

Enabled by default with the values below and `denoise: true`. During construction, `hbao: true` uses the defaults, and an object overrides individual values. At runtime, `false` disables HBAO while retaining values, `true` re-enables it, and an object partially updates values and enables it.

| Parameter | Type | Default | Meaning / range |
| --- | --- | --- | --- |
| `hbao.intensity` | number | `100` | Nonnegative occlusion intensity exponent; higher values deepen contact shadows. |
| `hbao.maxRadius` | number | `30` | Nonnegative sample radius in meters; large values may cause dark halos. |
| `hbao.bias` | number | `0.1` | Finite angular bias in radians; increasing it can reduce self-occlusion. |
| `hbao.frustumLength` | number | `100000` | Positive maximum processing depth in meters. |
| `hbao.blackPoint` | number | `0.05` | Input black point, `[0, 1)`. |
| `hbao.whitePoint` | number | `0.9` | Nonnegative output brightness multiplier. |
| `hbao.gamma` | number | `2.5` | Positive AO curve exponent, separate from scene `gamma`. |
| `hbao.denoise` | boolean | `true` | Bilateral filtering switch, configurable only during construction; dispose and recreate to change it. |

The current `BetterSkyUpdateOptions` type excludes `hbao.denoise`. JavaScript runtime validation also rejects changing it; supplying its current value does not throw.

### TypeScript types

Use `BetterSkyOptions` for constructor options and the current repository's `BetterSkyUpdateOptions` for partial updates. Other public types include `BetterSkyVector2`, `BetterSkyVector4`, `BetterSkyQuality`, `BetterSkyCloudType`, `BetterSkyToneMappingMode`, the Options interfaces for clouds, denoising, volumetric light, and HBAO, and `BetterSkyPass`. The current repository also provides `BetterSkyAssetStatus`, `BetterSkyAssetError`, and `BetterSkyConstructor`. Refer to the declarations bundled with the version you installed.

```ts
import { BetterSky, type BetterSkyOptions } from 'bettersky-cesium'

const options: BetterSkyOptions = {
  time: undefined,
  cloud: { altitudes: [4000, 6000, 10000, 0] },
}
const sky = new BetterSky(viewer, options)
```

## Notes

### Scene settings and disposal

| When | Effect on the host |
| --- | --- |
| Construction with `applySceneSettings: true` | Sets HDR, logarithmic depth, and gamma, and enables terrain depth testing. |
| Construction / update with a valid `time` | Changes the Viewer clock; has no effect when only a Scene is provided. |
| First enabled frame | Temporarily takes over the built-in sky, atmosphere, sun, fog, and some globe settings; sets the tile cache to 2000 and maximum screen-space error to 2. |
| Disable / dispose | Restores the sky and globe settings captured when enabled. |
| `update()` | Applies HDR, logarithmic depth, and gamma supplied in that call, unless the call explicitly includes `applySceneSettings: false`. |

`applySceneSettings: false` does not prevent sky takeover or time changes. Setting it to `false` during construction does not automatically constrain later updates; pass it explicitly in each relevant update to preserve application scene settings.

Clock, HDR, gamma, logarithmic depth, and terrain depth testing are not automatically restored on disable / disposal. Save and restore their original values in the application if needed. The current repository releases rendering resources owned by the instance but leaves installed context helper methods in place. Do not continue using cached Pass or stage references.

### Continuous rendering and performance

Use `requestRenderMode: false` where possible. With explicit rendering, the application must continuously request new frames for cloud animation and image stabilization. The SDK does not schedule `scene.requestRender()`.

First control the application's drawing buffer size. Then, as needed for the scene, reduce `volumetricLight.quality`, disable unused HBAO / SMAA, or set earlier `cloud.lodRange` thresholds. Keep an altitude fade range appropriate to the application. Disabling the master switch only pauses effects; use `dispose()` to release resources.

Exposure and cloud fill lighting adjust brightness; density, layer thickness, and distance also change the apparent volume. Frequent instance recreation, tone mapping changes, or large cloud/lighting updates can affect stability and cost. Cloud denoising trades smoothness against detail and motion ghosting; it does not control standalone volumetric light history.

### Compatibility and deployment

Dependency ranges specify minimum supported versions, not verification of every later release. The SDK uses Cesium renderer internals. After upgrading Cesium, its engine / widgets, or three, verify initialization, parameter updates, resizing, and disposal/recreation. Retain the complete lockfile. For dependency errors such as missing exports, check the complete dependency combination first; this SDK does not require manually installing Cesium's internal components.

Use only supported 3D perspective scenes. Dispose of the effects before switching to 2D / Columbus View. On SSR pages, initialize after client mounting. Screen-space reflections and subsurface scattering are not currently supported. Keep `systemLight: true`; `false` makes only some effects use a custom sun direction supplied through `scene.context.uniformState.sunDirectionWC2`, while clouds and cloud shadows still follow Cesium's sun. This is not a unified custom-light API.

Asset requests must return the actual files, not the application's HTML fallback. Upgrade JS and `BetterSkyAssets/` together and invalidate old caches. Include [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when distributing SDK runtime builds, and follow the complete license terms.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| Sky or clouds are invisible | Check the console, WebGL capabilities, and EXR / BIN / PNG requests under `CESIUM_BASE_URL`, including directory casing and response content. |
| Clouds disappear when zooming out | Check `cloud.altitudeFadeRange`; clouds fade out completely at a camera altitude of 90 km by default. |
| Volumetric light is weak | Check mode, active shadow-casting cloud layers, sun/view direction, and density / intensity / layerDepth / maxDistance. Shafts are easier to see facing the sun through cloud gaps. |
| Legacy haze is invisible | Effective coverage ≤ 0.2 gives no contribution. Local mode also requires at least one active shadow-casting layer among the first two layers. |
| Light shafts look like widespread fog | Reduce density, layer thickness, or distance, and adjust brightness separately. Check whether the clouds leave gaps between lit and shadowed areas. |
| A halo remains near the sun | Lens flare and volumetric light are controlled separately; disabling volumetric light does not disable lens flare. |
| The third layer does not cast cloud shadows | Only the first two layers cast shadows by default; changing cloud types does not change this. |
| SMAA is not active immediately after enabling | Lookup textures load asynchronously. Neither the first frame nor `assetsReady` indicates SMAA readiness. |
| Clouds still move after pausing time | Set `localWeatherVelocity: [0, 0]` separately; handle other lower-level motion controls independently. |
| Asset state or snapshot API calls fail | Check whether the installed package is the older npm `0.1.0`; these APIs were added in the current repository. |
| Demo basemap or terrain differs from expectations | Without service credentials, the demo uses the local NaturalEarthII basemap and ellipsoid terrain. See the [demo guide](demo/README.md). |
