# EffectPipeline Usage Guide

**English** | [简体中文](EffectPipeline.README.zh-CN.md) · [Project overview](README.md)

This guide covers running the demo, adding EffectPipeline to an existing Cesium scene, configuring effects and managing its lifecycle.

## Requirements

| Dependency | Repository configuration |
| --- | --- |
| Node.js | 22 or newer |
| Package manager | pnpm 12.8.1 |
| Cesium | Lockfile version 1.142.0 |
| three | Lockfile version 0.160.1; runtime dependency for texture loaders and cascaded shadows |
| Demo tools | Vite 6.4.3 and vite-plugin-static-copy 2.3.2, as resolved in the lockfile |
| Browser / GPU | Modern browser with WebGL 2, 3D/array textures and floating-point render targets; native `Float16Array` and `structuredClone` are also required |

Use one EffectPipeline instance with one Viewer and a globe in 3D perspective mode. Renderer internals are version-sensitive; verify compatibility when changing Cesium versions.

## Run the demo

From the repository root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Optionally fill in `.env.local`:

```dotenv
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token
VITE_TIANDITU_TOKEN=your_tianditu_key
```

Leave a value empty to use its fallback: local NaturalEarthII imagery without a Tianditu key, or ellipsoid terrain without an Ion token. World terrain loads asynchronously; if it fails, the demo keeps ellipsoid terrain.

`.env.local` is ignored by Git. `VITE_` values are embedded in browser code, so use client-side service credentials only. Restart the dev server after changing them.

```bash
pnpm dev
```

Open the address printed by Vite, normally [http://localhost:3000/](http://localhost:3000/). Vite selects another port if 3000 is occupied. The demo includes parameter controls, help text, reset controls and a timeline; `window.viewer` and `window.fx` are available in its browser console.

```bash
pnpm build    # Write the demo to dist/
pnpm preview  # Preview dist/; use the printed URL
```

The demo adjusts `viewer.resolutionScale` to cap large drawing buffers at approximately four million pixels. Applications using the SDK manage their own overall render resolution.

## Add the SDK to another project

The repository currently provides the SDK as source modules. Copy `EffectPipeline.js`, the complete `Library/` directory and `static/EffectPipelineAssets/`, preserving relative paths.

Shader sources live in `Library/shaders/` and are imported as strings using Vite's `?raw` feature, for example `import shaderSource from './Library/shaders/geospatial/cloudsMaterial.frag.glsl?raw'` in a module at the project root. Vite projects require no additional GLSL plugin; include this directory when copying the SDK. Other bundlers need equivalent raw-text import support.

Install the versions used by this repository:

```bash
pnpm add cesium@1.142.0 three@0.160.1
```

### Deploy static assets

Set `CESIUM_BASE_URL` to the deployed Cesium asset root. The repository uses `/cesium/` with this layout:

```text
/cesium/
  Workers/
  Assets/
  ThirdParty/
  Widgets/
  EffectPipelineAssets/
    snowCoverMask.png
    ...other effect assets
    GeospatialAssets/
      *.exr
      *.bin
      *.png
```

Copy the first four directories from `node_modules/cesium/Build/Cesium/`, and copy the complete `static/EffectPipelineAssets/` folder alongside them. Keep `GeospatialAssets` spelled exactly as shown. It contains the atmosphere lookup tables, 3D noise and weather textures.

The repository's [Vite configuration](vite.config.js) already serves and copies these resources. For another Vite project, install `vite-plugin-static-copy` and merge the equivalent settings into its configuration:

```js
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium/"),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}",
          dest: "cesium",
        },
        {
          src: "static/EffectPipelineAssets",
          dest: "cesium",
        },
      ],
    }),
  ],
});
```

For a subdirectory deployment, adjust the asset URL and hosting paths together. Other bundlers must provide the equivalent asset layout and base URL.

### Attach to a Viewer

Import Cesium's widget stylesheet in the application entry. After creating your Viewer:

```js
import "cesium/Build/Cesium/Widgets/widgets.css";
import { EffectPipeline } from "./EffectPipeline.js";

const fx = new EffectPipeline(viewer, {
  time: undefined, // Preserve the application's current clock time.
});

fx.update({
  coverage: 0.45,
  volumetricLight: { quality: "balanced" },
});
```

`new EffectPipeline(viewer)` applies the complete built-in preset, including its fixed clock time. You can also pass `viewer.scene`; clock-setting options then have no effect.

Keep `requestRenderMode: false` for continuous cloud animation and temporal reconstruction. If your application enables explicit rendering, it must continue calling `scene.requestRender()` to supply frames and request a frame after parameter changes; the SDK does not schedule those requests.

## Configuration

`new EffectPipeline(viewerOrScene, options?)` merges options into the built-in defaults. Nested objects merge by field and arrays replace whole arrays. Supply only the fields you need to change.

`false`, `null` and `undefined` are preserved during merging; their meaning depends on the option. In particular, `time: undefined` preserves the Viewer clock, and the documented nullable cloud controls use `null` to disable their corresponding mode.

```js
const defaults = EffectPipeline.defaultOptions; // An independent copy.
const fx = new EffectPipeline(viewer, {
  time: undefined,
  coverage: 0.5,
  cloud: { denoise: { motionAlpha: 0.4 } },
  hbao: false,
});
```

These defaults come from the public entry point in [EffectPipeline.js](EffectPipeline.js), which overrides several lower-level pass defaults.

### General options

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Enable the pipeline; runtime changes also gate HBAO and SMAA. |
| `coverage` | number | `0.34` | Weather coverage in [0, 1], separate from layer density. |
| `localWeatherVelocity` | array / Cartesian2 | `[0.0003, 0.0001]` | Weather-map UV offset per second. Negative values reverse direction. |
| `toneMappingMode` | number | `9` | 2/3 Reinhard2; 4 Uncharted2; 7 AgX; 8 Neutral; 9 ACES; 10 Linear; 11 Reinhard; 12 Cineon. Changing the mode rebuilds sky stages. |
| `toneMappingExposure` | number | `2.8` | Brightness multiplier before tone mapping; not EV stops. |
| `irradianceScale` | number | `0.15` | Nonnegative ground irradiance gain. |
| `aerialPerspectiveStrength` | number | `0.15` | Ground atmospheric-perspective strength in [0, 1]. Zero removes this blend. |
| `darkParamY` | number | `0.5` | Night-sky glow modulation; generally subtle during daytime. |
| `bloomIntensity` | number | `0.002` | Bloom intensity. Zero removes this contribution, but is not a pass-disable switch. |
| `systemLight` | boolean | `true` | Keep true for consistent Cesium sun lighting. false switches only part of the pipeline to custom sun uniforms; see advanced notes. |
| `applySceneSettings` | boolean | `true` | Apply initial HDR, logarithmic depth, gamma and terrain depth testing. See scene behavior below. |
| `highDynamicRange` | boolean | `true` | Scene HDR setting, governed by applySceneSettings. |
| `logarithmicDepthBuffer` | boolean | `true` | Scene logarithmic depth, governed by applySceneSettings. |
| `gamma` | number | `2.2` | Scene display gamma, governed by applySceneSettings. |
| `hbao` | boolean / object | Object below | false disables AO; an object overrides the HBAO parameters below. |
| `smaa` | boolean | `true` | Final-image SMAA antialiasing. |
| `time` | string / null / undefined | `"2026-05-01T06:00Z"` | Set a Viewer's clock using ISO 8601; null or undefined preserves its time. Scene-only construction does not set a clock. |

### Cloud layers and visibility

Four-component layer values use `[layer1, layer2, layer3, reserved]`; keep the fourth component at zero. Cloud-base heights are relative to the rendering planet, not the terrain beneath each cloud. The first two layers cast cloud shadows by default; changing a layer's type does not change that shadow mask.

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `cloud.layerTypes` | array / null | `["cumulus", "altocumulus", "cirrus"]` | Exactly three layer types; each can be cumulus, altocumulus or cirrus. null uses the generic noise shape. |
| `cloud.altitudes` | array / Cartesian4 | `[4000, 6000, 10000, 0]` | Layer-base heights in meters relative to the rendering planet. |
| `cloud.heights` | array / Cartesian4 | `[1300, 1800, 650, 0]` | Layer thickness in meters; cloud top = altitude + height. |
| `cloud.densityScales` | array / Cartesian4 | `[0.12, 0.09, 0.0015, 0]` | Density multipliers; zero removes that layer's medium. |
| `cloud.shapeDetailAmounts` | array / Cartesian4 | `[0.18, 0.12, 0, 0]` | Four values in [0, 1]; higher values erode cloud detail more strongly. |
| `cloud.lodRange` | array / null | `[200000, 500000]` | Near/far distance thresholds in meters, 0 ≤ near < far. null disables distance LOD; it does not move the clouds. |
| `cloud.altitudeFadeRange` | array / null | `[30000, 90000]` | Camera ellipsoid-height fade range in meters, 0 ≤ start < end. null disables the fade. |
| `cloud.skyIrradianceScale` | number | `1.8` | Nonnegative sky fill-light gain on clouds and the extra haze medium. |
| `cloud.groundIrradianceScale` | number | `1.3` | Nonnegative ground-reflected fill-light gain on clouds, separate from irradianceScale. |

Distance LOD adjusts sampling/detail quality. Altitude fading changes cloud visibility, shadows and associated light together; at the end height it also skips cloud and shadow drawing. These are independent controls. Disabling distance LOD does not disable all footprint-based texture filtering.

### Volumetric light and legacy haze

`volumetricLight.mode` selects one of two mutually exclusive paths: `"volumetric"` (the default) uses an independent, low-resolution volumetric pass with its own temporal history; `"legacy"` uses the existing `cloud.haze*` integration; `"off"` disables both extra volumetric-light paths. The global `enabled` switch also controls volumetric rendering.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `volumetricLight.mode` | string | `"volumetric"` | `"volumetric"`, `"legacy"` or `"off"`. |
| `volumetricLight.density` | number | `0.000008` | Nonnegative finite extinction density in inverse meters; zero removes this medium. |
| `volumetricLight.intensity` | number | `2` | Nonnegative finite scattering-brightness multiplier; does not change density or extinction. |
| `volumetricLight.layerDepth` | number | `2400` | Positive finite depth in meters below shadow-casting cloud bases. |
| `volumetricLight.maxDistance` | number | `16000` | Positive finite integration distance in meters, also bounded by scene depth and the cloud front. |
| `volumetricLight.anisotropy` | number | `0.55` | Finite forward-scattering preference in [0, 0.9]; zero is isotropic. |
| `volumetricLight.quality` | string | `"balanced"` | `"low"`, `"balanced"` or `"high"`; selects the budgets below. |

| Quality | Resolution scale | Integration steps | Visibility map size |
| --- | --- | --- | --- |
| `low` | 0.25 | 24 | 512 × 512 |
| `balanced` | 0.5 | 48 | 1024 × 1024 |
| `high` | 0.5 | 64 | 2048 × 2048 |

Higher budgets increase GPU work; these settings do not imply a fixed frame time. Changes to these options clear the independent volumetric history, and quality changes recreate the corresponding resources.

Compatibility is decided for each constructor or `update()` call: an explicitly supplied `volumetricLight.mode` takes priority, even when the same call also contains old haze fields. Supplying any `cloud.haze*` field without a new mode automatically selects `"legacy"`. Other partial updates preserve the current mode; construction with no options uses `"volumetric"`. Existing haze values are retained when switching modes.

```js
fx.update({ volumetricLight: { mode: "volumetric", intensity: 2, quality: "balanced" } });
fx.update({ volumetricLight: { mode: "off" } });
fx.update({ cloud: { hazeDensityScale: 0.000008 } }); // Selects legacy.
fx.update({ volumetricLight: { mode: "legacy" } });  // Uses retained legacy values.
```

The demo's Godray section shows the controls for the selected path. `off` disables both groups while preserving their values; Restore defaults reads the complete built-in preset, including the default mode.

#### Legacy haze

The options below apply in `"legacy"` mode. Their algorithm and defaults remain available for existing callers.

Local haze occupies world-space regions below the first two active, shadow-casting cloud layers. The default disables the separate near-ground layer and limits the accumulated scattering path to 1.2 km. Cloud-base regions follow the cloud weather footprint projected along the sunlight direction, keeping low-angle shafts aligned with cloud gaps. Its distance controls bound the sampled medium rather than placing fog at the camera. The exponential mode instead uses a height-dependent density above the rendering planet.

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `cloud.hazeDensityScale` | number | `0.000008` | Nonnegative medium density; zero removes the extra haze contribution. |
| `cloud.hazeCloudAttached` | boolean | `true` | true integrates local world-space layers below cloud bases, with optional near-ground haze; false uses an exponential height medium. |
| `cloud.hazeGroundDensityScale` | number | `0` | Near-ground density multiplier in [0, 1], only in local mode. Zero keeps cloud-base shafts only; one restores the full near-ground layer. |
| `cloud.hazeViewDistance` | number | `16000` | Positive maximum viewing distance in meters for local layers. |
| `cloud.hazeVolumeLength` | number | `1200` | Positive total medium-path budget in meters for local layers; gaps do not consume this length. |
| `cloud.hazeDirectLightScale` | number | `8` | Nonnegative direct sunlight-scattering gain; separate from medium extinction. |
| `cloud.hazeQuality` | string | `"high"` | Integration-sample budget / shadow-filter taps: low = 16 / 1; balanced = 24 / 2; high = 32 / 4. |
| `cloud.hazeHeightFalloff` | number | `1200` | Positive height scale in meters: exponential falloff scale, or local-layer thickness control. |
| `cloud.hazeAnisotropy` | number | `0.55` | Forward-scattering preference in [0, 0.9]; zero is isotropic. |
| `cloud.maxShadowLengthRayDistance` | number | `6000` | Positive atmospheric shadow-length integration limit in meters; also bounds haze in exponential mode. |
| `cloud.hazeSunColor` | array | `[1, 0.78, 0.42]` | Three nonnegative linear RGB multipliers, not 0–255 sRGB values. |

Haze is also modulated by effective cloud coverage after altitude fading: its contribution is zero at coverage ≤ 0.2 and ramps up between 0.2 and 0.4. Local mode requires an active shadow-casting layer among the first two. Increasing haze density alone will not override these conditions.

The quality values are budgets, not fixed texture-read counts: early exits and cascade overlap affect the actual work.

### Cloud denoising

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `cloud.denoise.temporalAlpha` | number | `0.04` | Current-frame weight in [0, 1]; lower values favor history and stronger smoothing. |
| `cloud.denoise.currentFrameAlpha` | number | `0.08` | Current-frame weight in [0, 1] for the newly sampled Bayer phase. |
| `cloud.denoise.motionAlpha` | number | `0.25` | Raises the accumulation base weights during camera motion, in [0, 1]; the final blend remains adaptive. |
| `cloud.denoise.varianceGamma` | number | `2` | Positive variance-clipping multiplier; higher values accept a wider historical color range. |
| `cloud.denoise.spatialFilterStrength` | number | `0.8` | Depth/opacity-aware reconstruction strength in [0, 1]; higher values smooth more detail. |

These are base controls. The renderer further adapts blending to history age, distance, camera motion and terrain boundaries. Increasing history dependence can reduce noise while increasing lag; stronger spatial filtering can soften detail. SMAA handles final-image edges and does not replace this cloud reconstruction.

### HBAO

The default `hbao` value is an object containing the seven numeric options below; bilateral filtering defaults to enabled in the pass. `hbao: false` disables the effect. `hbao: true` uses the pass defaults at construction; an object overrides individual parameters.

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `hbao.intensity` | number | `100` | AO intensity exponent; higher values deepen contact shading. |
| `hbao.maxRadius` | number | `30` | Maximum sampling radius in view space, in meters. |
| `hbao.bias` | number | `0.1` | Angular bias in radians; larger values reduce self-occlusion. |
| `hbao.frustumLength` | number | `100000` | Maximum AO view-space depth in meters. |
| `hbao.blackPoint` | number | `0.05` | Input black point; keep below 1. |
| `hbao.whitePoint` | number | `0.9` | Output brightness scale for AO modulation. |
| `hbao.gamma` | number | `2.5` | Positive AO curve exponent, separate from scene gamma. |
| `hbao.denoise` | boolean | `true` | Bilateral filter, construction only; update() does not rebuild this option. |

The seven numeric fields support `update()`. `hbao.denoise` is a construction-time setting.

## Runtime API

Use `update()` for partial configuration changes:

```js
fx.update({
  coverage: 0.4,
  cloud: {
    layerTypes: ["cumulus", "altocumulus", "cirrus"],
    altitudes: [4000, 6000, 10000, 0],
    heights: [1300, 1800, 650, 0],
    densityScales: [0.12, 0.09, 0.0015, 0],
  },
});

fx.update({
  time: "2026-05-01T10:00:00Z",
  toneMappingExposure: 2.5,
});
```

Changing cloud shape, density, coverage, lighting or visibility parameters invalidates cloud history as needed. Volumetric-light options invalidate their separate history. Frequent large changes can repeatedly restart accumulation.

| API | Access / purpose |
| --- | --- |
| `EffectPipeline.defaultOptions` | Static getter; returns a fresh default configuration. |
| `fx.update(options)` | Apply supported fields from a partial configuration. |
| `fx.enabled` | Get/set the pipeline switch. |
| `fx.coverage` | Get/set weather coverage. |
| `fx.toneMappingExposure` | Get/set exposure multiplier. |
| `fx.toneMappingMode` | Setter; changing the mode rebuilds sky stages. |
| `fx.localWeatherVelocity` | Setter; array or Cartesian2. |
| `fx.setCloudAltitudes(value)` | Set four cloud-base components. |
| `fx.setCloudHeights(value)` | Set four thickness components. |
| `fx.setCloudDensityScales(value)` | Set four density components. |
| `fx.setCloudShapeDetailAmounts(value)` | Set four detail-erosion components in [0, 1]. |
| `fx.hbaoEnabled` / `fx.smaaEnabled` | Get/set optional effects. |
| `fx.hbaoIntensity` / `fx.hbaoMaxRadius` | Setters for AO strength/radius. |
| `fx.pass` | Getter for the underlying GeospatialPipelinePass; advanced access. |
| `fx.stage` | Getter for the current sky PostProcessStageComposite. Re-read after stage rebuilds. |
| `fx.dispose()` | Remove the frame listener and registered stages, and invoke pass cleanup. |

## Common adjustments

### Balance light without washing out the terrain

```js
fx.update({
  irradianceScale: 0.15,
  aerialPerspectiveStrength: 0.2,
  volumetricLight: { mode: "volumetric", intensity: 2 },
  cloud: {
    skyIrradianceScale: 1.8,
    groundIrradianceScale: 1.3,
  },
});
```

`irradianceScale` affects the ground; the two cloud irradiance controls affect cloud fill light. `volumetricLight.intensity` adjusts independent volumetric scattering. In legacy mode, `cloud.hazeDirectLightScale` and `cloud.hazeSunColor` retain their sunlight controls. Exposure changes the final tone-mapped image.

### Reduce rendering cost

```js
fx.update({
  volumetricLight: { mode: "volumetric", quality: "low" },
  cloud: {
    lodRange: [120000, 300000],
  },
  hbao: false,
});
```

This example starts distance-based simplification sooner, reduces the independent volumetric-light budget and disables AO. Evaluate the resulting detail and shading in your scene. Keep altitude fading enabled when the application includes high-altitude views.

### Control sun time and weather motion

```js
fx.update({ time: "2026-05-01T06:00:00Z" });
viewer.clock.shouldAnimate = false;
fx.localWeatherVelocity = [0, 0];
```

The Viewer clock controls celestial time. Weather offsets advance using elapsed wall time, so pausing the clock does not automatically stop them. The final line stops weather-map advection; advanced shape/detail velocities on the underlying pass are separate.

## Advanced pass access

The underlying pass exposes optional surface snow cover and rain/flash overlays:

```js
fx.pass.showSnow = true;
fx.pass.showRain = true;
```

These setters rebuild the affected stages. Snow uses `EffectPipelineAssets/snowCoverMask.png`; `showRain` enables flashes and screen rain streaks over scene surfaces. These are pass-level controls, not constructor options on EffectPipeline.

Keep `systemLight: true` for consistent sunlight across effects. With `false`, the atmosphere/composition path uses custom sun uniforms while the cloud and cloud-shadow passes still read Cesium's system sun. This is not a unified custom-light API.

## Scene behavior and lifecycle

The pipeline applies the following scene changes:

| When | Behavior |
| --- | --- |
| Construction with `applySceneSettings: true` | Set HDR, logarithmic depth and gamma; enable `globe.depthTestAgainstTerrain`. |
| Construction/update with a defined `time` and a Viewer | Set `viewer.clock.currentTime`. |
| First enabled frame | Snapshot and override built-in sky atmosphere, sky box, sun, fog, ground atmosphere and globe lighting. Set globe tile cache size to 2000 and maximum screen-space error to 2. |
| Disable or dispose | Restore the sky/globe fields captured in that enabled-frame snapshot. |
| `update()` | Apply supplied HDR/log-depth/gamma fields unless that particular call includes `applySceneSettings: false`. |

`applySceneSettings: false` does not opt out of sky/globe takeover. It also does not suppress setting `time`; use `time: undefined` to preserve the clock. If a later update should leave supplied scene settings unapplied, include `applySceneSettings: false` in that update too.

HDR, logarithmic depth, gamma, terrain depth testing and the clock are not restored automatically. Save and restore them yourself if your application needs that behavior.

```js
fx.enabled = false; // Temporarily disable.
fx.enabled = true;  // Resume; cloud history is refreshed.

// When leaving the scene:
fx.dispose();
viewer.destroy();
```

Call `dispose()` before `viewer.destroy()`; do not use the instance afterward. Disposal is not a complete rollback of every installed helper or GPU allocation. Asset requests are asynchronous and currently have no public cancellation or all-assets-ready promise, so avoid repeatedly constructing/disposing instances while initial resources are loading.

The implementation adds context helpers, uses selected Cesium renderer internals and extends some `Cartesian2/3/4` and `Matrix4` prototype methods. HBAO also has shared module state. Use one pipeline per Viewer and one active Viewer for this implementation; isolated concurrent instances are not supported.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing or incorrect sky/clouds at startup | Inspect failed requests under `/cesium/EffectPipelineAssets/GeospatialAssets/`, including EXR/BIN files. Verify `CESIUM_BASE_URL`, directory casing and WebGL support. Resources load asynchronously. |
| Clouds disappear when zooming out | Check `cloud.altitudeFadeRange`; the default reaches zero at 90 km camera ellipsoid height. Use `null` to disable this fade if needed. |
| Little or no volumetric light | Check `volumetricLight.mode`, coverage, the first two layers' density/thickness and sun/view direction. In volumetric mode, check `density`, `intensity`, `layerDepth` and `maxDistance`; in legacy mode, check `cloud.hazeDensityScale` and its local distance limits. |
| Motion trails or noisy distant clouds | Adjust denoising weights incrementally, keep footprint filtering/LOD in mind and avoid continuously resetting cloud parameters. |
| Missing cloud shadow from the third layer | The default shadow mask includes only the first two layers. |
| SMAA has no effect immediately after startup | Its lookup textures load asynchronously; the first rendered frame is not a readiness guarantee. |
| Sun is frozen but clouds keep moving | Pause weather motion separately from the Viewer clock. |
| Terrain or imagery is unavailable | Check the demo credentials; empty credentials intentionally select the local imagery/ellipsoid fallbacks. |

For feature explanations and rendering mechanisms, return to the [project overview](README.md).
