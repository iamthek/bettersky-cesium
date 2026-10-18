# BetterSky Rendering and API Reference

**English** | [简体中文](BetterSky.README.zh-CN.md) · [Project overview](README.md)

This repository-only reference covers rendering principles, the demo and source integration, configuration and lifecycle management. It is not included in the npm package.

For the planned npm/pnpm package, see [Usage](README.md#usage). This CesiumJS plugin uses the host's existing `CESIUM_BASE_URL`; copy the bundled assets from `node_modules` into `BetterSkyAssets/` under that Cesium asset root. SDK packaging and these examples are pending release verification. The source-copy instructions below describe the current repository workflow, rather than the future npm package contents.

## Requirements

| Dependency | Repository configuration |
| --- | --- |
| Node.js | 22 or newer |
| Package manager | pnpm 12.8.1 |
| Cesium | Supported range `>=1.142.0`; reproducible repository lockfile baseline 1.142.0 |
| three | Supported range `>=0.160.1`; reproducible repository lockfile baseline 0.160.1; runtime dependency for texture loaders and cascaded shadows |
| Demo tools | Vite 6.4.3 and vite-plugin-static-copy 2.3.2, as resolved in the lockfile |
| Browser / GPU | Modern browser with WebGL 2, 3D/array textures and floating-point render targets; native `Float16Array` and `structuredClone` are also required |

Use one active BetterSky instance per page with one Viewer and a globe in 3D perspective mode. The supported ranges include later dependency versions, while the lockfile preserves the development baseline. Renderer internals are version-sensitive: test dependency upgrades before deployment, and extend the minimum/current-latest matrix when new versions are released. A version range does not mean every future release has already been verified.

### Compatibility regression matrix

The current-latest versions below were checked against the npm registry on 2026-10-18. The four endpoint combinations cover the minimum and current-latest versions independently; they do not cover every intermediate or future release. SDK packaging and installation verification remain pending separately.

| Cesium | three | Source browser API and lifecycle regression (2026-10-18) |
| --- | --- | --- |
| 1.142.0 | 0.160.1 | Passed |
| 1.142.0 | 0.186.1 | Passed |
| 1.146.0 | 0.160.1 | Passed |
| 1.146.0 | 0.186.1 | Passed |

The same source regression run passed 24 automated tests. The browser checks covered parameter updates, switches, resize and teardown/recreation, including disposal during asset loading; they do not replace packaged-SDK release verification.

SSR and SSS are outside the supported BetterSky feature set.

## Rendering capabilities

| Capability | What it adds |
| --- | --- |
| Volumetric clouds | Ray-marched cloud layers around the globe, procedural 3D shape/detail textures, weather-map advection, self-shadowing and sky/ground fill light. |
| Atmosphere and celestial lighting | Precomputed scattering and transmittance lookups for sky color, atmospheric perspective, sunlight, moon rendering and procedural night stars. |
| Volumetric light | Sunlight shafts in a thin medium below the lowest active shadow-casting cloud base. Density fades toward the lower boundary, while focused cloud-shadow visibility shapes light through cloud gaps. |
| Ground cloud shadows | Cascaded cloud shadow maps project moving cloud cover onto scene surfaces. The first two cloud layers cast shadows by default. |
| Bloom and lens flare | HDR bright-region extraction, a downsample/upsample chain, blur, ghosts and halos. |
| Tone mapping | ACES, AgX, Neutral, Linear, Reinhard, Reinhard2, Uncharted2 and Cineon curves, with exposure and separate ground-light controls. |
| HBAO | Depth-based ambient occlusion with bilateral filtering for terrain and geometry contact shading. Optional and enabled by default. |
| SMAA | Three-pass morphological antialiasing applied after sky composition. Optional and enabled by default. |
| Pass-level extensions | Optional surface snow cover and rain/flash overlays through the underlying pass; disabled by default. |

See [Volumetric light and legacy haze](#volumetric-light-and-legacy-haze) for the default independent light path and its mutually exclusive `legacy` and `off` modes.

## Rendering optimizations

| Area | Implementation and purpose |
| --- | --- |
| Cloud sampling cost | Clouds render at `ceil(width / 4) × ceil(height / 4)`, then reconstruct at full resolution using a 16-phase Bayer sequence. This reduces the number of primary cloud pixels to approximately 1/16 of the drawing buffer. |
| Work inside cloud layers | Rays intersect, sort and merge active spherical cloud-layer intervals. Marching skips gaps between layers, adapts step sizes and stops when transmittance becomes sufficiently low. |
| Distant cloud detail | Screen-footprint mip selection, continuous detail fading and deterministic secondary-light sampling reduce unresolved detail and frame-to-frame changes. |
| Cloud temporal stability | Motion reprojection, variance clipping, depth/opacity checks and camera-dependent blending balance stationary noise reduction against moving-camera ghosting. Major camera, projection, lighting and cloud-configuration changes invalidate history. |
| Terrain silhouettes and distance precision | Cloud reconstruction consults full-resolution scene depth at terrain boundaries. Cloud depth/velocity buffers use 32-bit floats to avoid the 65,504 limit of half-float distance storage. |
| Stable, softer cloud shadows | Shadow-footprint filtering and temporal accumulation stabilize the maps. Ground shading uses fixed-pattern PCF that averages transmitted light, plus cascade blending and a fill-light floor to soften mixed shadow edges. |
| Independent volumetric light | A separate sampling budget, focused cloud-shadow map and temporal history handle local shafts. Full-resolution terrain and cloud-front depths guide reconstruction; see [Independent volumetric light](#independent-volumetric-light) for medium coverage, quality budgets and edge handling. |
| High-altitude views | Clouds, their shadows and associated light fade together between 30 km and 90 km camera ellipsoid height by default. Fully faded views skip cloud and shadow draw calls. |
| Atmosphere and bloom | Precomputed atmosphere textures supply scattering data; bloom processes a progressively smaller image pyramid before composition. |

The 1/16 figure describes cloud sampling resolution, not an overall frame-rate multiplier. Actual performance depends on the GPU, drawing-buffer size, view and enabled effects. The demo's separate drawing-buffer cap is described in [Run the demo](#run-the-demo); measured volumetric-light costs are in [Performance and validation reference](#performance-and-validation-reference).

## How the pipeline fits together

```text
Cesium scene color + depth
  → HBAO (optional)
  → atmosphere + volumetric clouds + cloud shadows + volumetric light
  → bloom / lens flare + tone mapping
  → SMAA (optional)
```

The SDK registers stages in `scene.postProcessStages` and updates lighting, weather motion and offscreen passes through `scene.preRender`.

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

## Add the SDK source to another project

The repository currently provides the SDK as source modules. Copy `BetterSky.js`, the complete `Library/` directory and `static/BetterSkyAssets/`, preserving relative paths.

Shader sources live in `Library/shaders/` and are imported as strings using Vite's `?raw` feature, for example `import shaderSource from './Library/shaders/geospatial/cloudsMaterial.frag.glsl?raw'` in a module at the project root. Vite projects require no additional GLSL plugin; include this directory when copying the SDK. Other bundlers need equivalent raw-text import support.

Install dependencies within the supported ranges:

```bash
pnpm add "cesium@>=1.142.0" "three@>=0.160.1"
```

The repository lockfile uses Cesium 1.142.0 and three 0.160.1 to reproduce its development baseline. These exact versions are optional for source integration; applications may pin any verified versions within the supported ranges.

### Deploy static assets

Set `CESIUM_BASE_URL` to the deployed Cesium asset root. The repository uses `/cesium/` with this layout:

```text
/cesium/
  Workers/
  Assets/
  ThirdParty/
  Widgets/
  BetterSkyAssets/
    snowCoverMask.png
    ...other effect assets
    GeospatialAssets/
      *.exr
      *.bin
      *.png
```

Copy the first four directories from `node_modules/cesium/Build/Cesium/`, and copy the complete `static/BetterSkyAssets/` folder alongside them. Keep `GeospatialAssets` spelled exactly as shown. It contains the atmosphere lookup tables, 3D noise and weather textures.

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
          src: "static/BetterSkyAssets",
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
import { BetterSky } from "./BetterSky.js";

const fx = new BetterSky(viewer, {
  time: undefined, // Preserve the application's current clock time.
});

fx.update({
  coverage: 0.45,
  volumetricLight: { quality: "balanced" },
});
```

`new BetterSky(viewer)` applies the complete built-in preset, including its fixed clock time. You can also pass `viewer.scene`; clock-setting options then have no effect.

Keep `requestRenderMode: false` for continuous cloud animation and temporal reconstruction. If your application enables explicit rendering, it must continue calling `scene.requestRender()` to supply frames and request a frame after parameter changes; the SDK does not schedule those requests.

## Configuration

`new BetterSky(viewerOrScene, options?)` merges options into the built-in defaults. Nested objects merge by field and arrays replace whole arrays. Supply only the fields you need to change.

`false`, `null` and `undefined` are preserved during merging; their meaning depends on the option. In particular, `time: undefined` preserves the Viewer clock, and the documented nullable cloud controls use `null` to disable their corresponding mode.

```js
const defaults = BetterSky.defaultOptions; // An independent copy.
const fx = new BetterSky(viewer, {
  time: undefined,
  coverage: 0.5,
  cloud: { denoise: { motionAlpha: 0.4 } },
  hbao: false,
});
```

These defaults come from the public entry point in [BetterSky.js](BetterSky.js), which overrides several lower-level pass defaults.

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
| `cloud.skyIrradianceScale` | number | `1.8` | Nonnegative sky fill-light gain on clouds and legacy haze; independent volumetric light uses direct sunlight. |
| `cloud.groundIrradianceScale` | number | `1.3` | Nonnegative ground-reflected fill-light gain on clouds, separate from irradianceScale. |

Distance LOD adjusts sampling/detail quality. Altitude fading changes cloud visibility, shadows and associated light together; at the end height it also skips cloud and shadow drawing. These are independent controls. Disabling distance LOD does not disable all footprint-based texture filtering.

### Volumetric light and legacy haze

`volumetricLight.mode` selects one of two mutually exclusive paths: `"volumetric"` (the default) uses an independent, low-resolution volumetric pass with its own temporal history; `"legacy"` uses the existing `cloud.haze*` integration; `"off"` disables both extra volumetric-light paths. The global `enabled` switch also controls volumetric rendering.

#### Independent volumetric light

The medium occupies a world-space height envelope below the lowest active, shadow-casting cloud base. Its bottom is clamped to the rendering planet's surface, rather than following local terrain. With the default 4000 m cloud base and 2400 m layer depth, the envelope spans heights of 1600–4000 m. The lower part becomes progressively thinner, and density fades near the maximum viewing distance. This mode adds no separate near-ground fog layer. Weather-map holes do not remove the medium: air remains in cloud gaps, while actual cloud transmittance determines the sunlit and shadowed regions.

Integration covers all valid medium intervals within `maxDistance`, clipped by terrain depth and the planet; the legacy 1200 m accumulated-path limit does not apply. A separate focused cloud-shadow map covers this local range, leaving the large ground-shadow cascades unchanged. World-texel alignment and filtering based on the sun's angular radius help preserve cloud-gap boundaries. Scattering before and after the cloud front is recorded separately, so translucent clouds can reveal light behind them while opaque clouds and terrain occlude it.

The pass stores its own scattering-centroid depth and history. Depth/luminance-aware reconstruction and history rejection handle terrain edges, cloud silhouettes and changing illumination. It does not use the clouds' 16-phase Bayer reconstruction or add a uniform brightness floor to direct sunlight. Shafts follow the actual clouds and solar direction; no beam is generated for a particular clock time.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `volumetricLight.mode` | string | `"volumetric"` | `"volumetric"`, `"legacy"` or `"off"`. |
| `volumetricLight.density` | number | `0.000008` | Nonnegative finite extinction density in inverse meters; zero removes this medium. |
| `volumetricLight.intensity` | number | `2` | Nonnegative finite scattering-brightness multiplier; does not change density or extinction. |
| `volumetricLight.layerDepth` | number | `2400` | Positive finite depth in meters below the lowest active, shadow-casting cloud base. |
| `volumetricLight.maxDistance` | number | `16000` | Positive finite viewing/integration limit in meters, clipped by scene depth and the planet; also determines the focused shadow's receiver range. |
| `volumetricLight.anisotropy` | number | `0.55` | Finite forward-scattering preference in [0, 0.9]; zero is isotropic. |
| `volumetricLight.quality` | string | `"balanced"` | `"low"`, `"balanced"` or `"high"`; selects the budgets below. |

| Quality | Width/height scale | Integration steps per pixel | Focused shadow map |
| --- | --- | --- | --- |
| `low` | 0.25 | 24 | 512 × 512 |
| `balanced` | 0.5 | 48 | 1024 × 1024 |
| `high` | 0.5 | 64 | 2048 × 2048 |

The scale applies to each drawing-buffer dimension, rounded up: `balanced` uses `ceil(width / 2) × ceil(height / 2)`. Higher budgets increase GPU work; these settings do not imply a fixed frame time. Changing a volumetric-light value clears its independent history; quality changes recreate the corresponding targets. Switching to `legacy` or `off` releases the new path's offscreen textures and framebuffers; returning to `volumetric` allocates them as needed.

`density: 0` removes the medium. `intensity: 0` removes its added scattered light but retains extinction; use `mode: "off"` to disable both extra volumetric-light paths. Atmospheric scattering, cloud lighting and lens flare remain separate effects.

#### Modes and existing callers

Compatibility is decided for each constructor or `update()` call: an explicitly supplied `volumetricLight.mode` takes priority, even when the same call also contains old haze fields. Supplying any `cloud.haze*` field without a new mode automatically selects `"legacy"`. Other partial updates preserve the current mode; construction with no options uses `"volumetric"`. Existing haze values are retained when switching modes.

```js
fx.update({ volumetricLight: { mode: "volumetric", intensity: 2, quality: "balanced" } });
fx.update({ volumetricLight: { mode: "off" } });
fx.update({ cloud: { hazeDensityScale: 0.000008 } }); // Selects legacy.
fx.update({ volumetricLight: { mode: "legacy" } });  // Uses retained legacy values.
```

The demo's Godray section shows the controls for the selected path. `off` disables both groups while preserving their values; Restore defaults reads the complete built-in preset, including the default mode.

#### Performance and validation reference

A local check on 2026-10-18 used an RTX 3080 through ANGLE/Direct3D11, a 1920 × 1080 drawing buffer and `balanced` defaults. The demo date was 2026-05-01; each view faced the sun with camera and weather fixed. `EXT_disjoint_timer_query_webgl2` measured 64 adjacent frame pairs with alternating order and a fixed cloud phase. The baseline retained allocated targets while skipping the new passes and their composite; the disjoint flag was false.

| Demo UTC | Median added GPU time | P95 added GPU time |
| --- | --- | --- |
| 10:30 | 1.621 ms | 1.989 ms |
| 23:00 | 1.467 ms | 2.279 ms |

The new textures allocated 58,155,008 bytes (55.46 MiB): 47.46 MiB for scattering/depth/history and 8 MiB for the focused shadow. This is allocation accounting, not an independent measurement of driver-level VRAM growth. These scene/device-specific results are not a frame-time guarantee; conventional on/off batch differences fluctuated, so paired GPU timings were used instead of background FPS.

The implementation check covered seven WebGL2 MRT/readback cases: full-interval integration, zero direct light under zero solar visibility, opaque and translucent foreground clouds, terrain clipping, distance fade and cloud-visibility fade. Mode/quality changes, odd viewport dimensions, camera movement, layer crossings and weather changes were also checked. Five enable/disable cycles matched 50 texture creations/deletions and 20 framebuffer creations/deletions. This checks the new path's resource lifecycle, not long-term memory use across every scene.

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

`cloud.denoise` controls cloud reconstruction, including haze rendered through the legacy path. The independent volumetric-light pass uses its own depth/luminance rejection and adaptive history weights; these cloud controls do not tune that history.

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
| `BetterSky.defaultOptions` | Static getter; returns a fresh default configuration. |
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
| `fx.dispose()` | Idempotently remove the frame listener and registered stages, restore captured sky/globe fields and clean up instance-owned pass resources. |

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

These setters rebuild the affected stages. Snow uses `BetterSkyAssets/snowCoverMask.png`; `showRain` enables flashes and screen rain streaks over scene surfaces. These are pass-level controls, not constructor options on BetterSky.

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

Call `dispose()` before `viewer.destroy()`; do not use the instance afterward. Disposal is idempotent and cleans up the instance-owned effect textures, framebuffers, shadow resources and shader-cache references through its passes. Host default textures and shared viewport geometry remain under host/shared ownership.

It is safe to dispose while initial assets are loading, then create a replacement after disposal returns. Requests are not actively aborted and there is no public all-assets-ready promise. Late completion callbacks check the destroyed state and skip GPU resource creation. SMAA prevents duplicate concurrent lookup loads per stage, and its callbacks also respect disposal.

Disposal does not remove the installed context helpers, added sun fields on `context.uniformState` or `Cartesian2/3/4` and `Matrix4` prototype extensions. The implementation uses selected Cesium renderer internals, and HBAO also has shared module state. Use one pipeline per Viewer and one active Viewer per page; isolated concurrent instances are not supported.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing or incorrect sky/clouds at startup | Inspect failed requests under `/cesium/BetterSkyAssets/GeospatialAssets/`, including EXR/BIN files. Verify `CESIUM_BASE_URL`, directory casing and WebGL support. Resources load asynchronously. |
| Clouds disappear when zooming out | Check `cloud.altitudeFadeRange`; the default reaches zero at 90 km camera ellipsoid height. Use `null` to disable this fade if needed. |
| Little or no volumetric light | Check `volumetricLight.mode`, active shadow-casting layers and sun/view direction. Look toward the sun or a cloud gap; other directions naturally scatter less light. In volumetric mode, check `density`, `intensity`, `layerDepth` and `maxDistance`; weather holes do not turn off its medium. In legacy mode, check `cloud.hazeDensityScale`, coverage gating and local distance limits. |
| Broad haze instead of distinct shafts | Check that clouds create actual light/shadow gaps. Reduce `density`, `layerDepth` or `maxDistance` to limit the affected air; adjust `intensity` separately for brightness. Raising global exposure/Bloom also brightens other effects and does not restore missing shadow boundaries. |
| Bright rings or ghosts around the sun | These belong to lens flare, not the cloud-gap volumetric shafts. Switching volumetric light off does not disable lens flare. |
| Motion trails or noisy distant clouds | Adjust denoising weights incrementally, keep footprint filtering/LOD in mind and avoid continuously resetting cloud parameters. |
| Missing cloud shadow from the third layer | The default shadow mask includes only the first two layers. |
| SMAA has no effect immediately after startup | Its lookup textures load asynchronously; the first rendered frame is not a readiness guarantee. |
| Sun is frozen but clouds keep moving | Pause weather motion separately from the Viewer clock. |
| Terrain or imagery is unavailable | Check the demo credentials; empty credentials intentionally select the local imagery/ellipsoid fallbacks. |

## Explore the implementation

- [BetterSky.js](BetterSky.js): public API, defaults, validation and updates.
- [GeospatialPipelinePass.js](Library/GeospatialPipelinePass.js): scene integration, atmosphere and composition.
- [CloudsMaterialPass.js](Library/geospatial/CloudsMaterialPass.js): cloud/light integration and temporal reconstruction.
- [VolumetricLightPass.js](Library/geospatial/VolumetricLightPass.js) and [FocusedCloudShadowPass.js](Library/geospatial/FocusedCloudShadowPass.js): independent local volumetric light, temporal history and focused sunlight visibility.
- [Volumetric-light shaders](Library/shaders/geospatial/volumetricLight.frag.glsl), [temporal resolve](Library/shaders/geospatial/volumetricLightResolve.frag.glsl) and [composition](Library/shaders/geospatial/volumetricLightComposite.glsl): medium integration, centroid reprojection and cloud/terrain edge handling.
- [ShadowMaterialPass.js](Library/geospatial/ShadowMaterialPass.js) and [AerialPerspectiveEffect.js](Library/geospatial/AerialPerspectiveEffect.js): cloud shadow generation and application.
