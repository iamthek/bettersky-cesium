# BetterSky4Cesium

**English** | [简体中文](README.zh-CN.md)

**EffectPipeline** is the sky rendering pipeline in BetterSky4Cesium, a visual effects SDK for Cesium. It brings layered volumetric clouds, atmospheric scattering, cloud shadows, volumetric light and image enhancement into one configurable pipeline for 3D globe scenes.

[Usage guide](EffectPipeline.README.md) · [Demo source](demo-official.js)

## Highlights

- **A connected sky and landscape.** Clouds, sunlight, atmospheric perspective and ground cloud shadows share the same scene, depth and lighting information.
- **Three independently shaped cloud layers.** Combine cumulus, altocumulus and cirrus, with separate altitude, thickness, density and erosion controls.
- **Stability from nearby terrain to distant horizons.** Temporal reconstruction, terrain-aware cloud edges and continuous detail filtering address noise, ghosting and distant shimmer.
- **A controllable rendering budget.** Distance LOD, bounded light integration, optional HBAO/SMAA and altitude-based fading provide practical quality controls.
- **One configuration API.** Built-in presets, partial updates and runtime switches are available through `EffectPipeline`. The demo exposes parameters, inline explanations and a timeline.

## What it renders

| Capability | What it adds |
| --- | --- |
| Volumetric clouds | Ray-marched cloud layers around the globe, procedural 3D shape/detail textures, weather-map advection, self-shadowing and sky/ground fill light. |
| Atmosphere and celestial lighting | Precomputed scattering and transmittance lookups for sky color, atmospheric perspective, sunlight, moon rendering and procedural night stars. |
| Volumetric light | Sunlight scattered through a participating medium, with cloud-shadow sampling. Supports local layers near the ground and cloud bases, or an exponential height medium. |
| Ground cloud shadows | Cascaded cloud shadow maps project moving cloud cover onto scene surfaces. The first two cloud layers cast shadows by default. |
| Bloom and lens flare | HDR bright-region extraction, a downsample/upsample chain, blur, ghosts and halos. |
| Tone mapping | ACES, AgX, Neutral, Linear, Reinhard, Reinhard2, Uncharted2 and Cineon curves, with exposure and separate ground-light controls. |
| HBAO | Depth-based ambient occlusion with bilateral filtering for terrain and geometry contact shading. Optional and enabled by default. |
| SMAA | Three-pass morphological antialiasing applied after sky composition. Optional and enabled by default. |
| Pass-level extensions | Optional surface snow cover and rain/flash overlays through the underlying pass; disabled by default. |

## Rendering optimizations

| Area | Implementation and purpose |
| --- | --- |
| Cloud sampling cost | Clouds render at `ceil(width / 4) × ceil(height / 4)`, then reconstruct at full resolution using a 16-phase Bayer sequence. This reduces the number of primary cloud pixels to approximately 1/16 of the drawing buffer. |
| Work inside cloud layers | Rays intersect, sort and merge active spherical cloud-layer intervals. Marching skips gaps between layers, adapts step sizes and stops when transmittance becomes sufficiently low. |
| Distant cloud detail | Screen-footprint mip selection, continuous detail fading and deterministic secondary-light sampling reduce unresolved detail and frame-to-frame changes. |
| Temporal stability | Motion reprojection, variance clipping, depth/opacity checks and camera-dependent blending balance stationary noise reduction against moving-camera ghosting. Major camera, projection, lighting and cloud-configuration changes invalidate history. |
| Terrain silhouettes and distance precision | Cloud reconstruction consults full-resolution scene depth at terrain boundaries. Cloud depth/velocity buffers use 32-bit floats to avoid the 65,504 limit of half-float distance storage. |
| Stable, softer cloud shadows | Shadow-footprint filtering and temporal accumulation stabilize the maps. Ground shading uses fixed-pattern PCF that averages transmitted light, plus cascade blending and a fill-light floor to soften mixed shadow edges. |
| Bounded volumetric light | Local haze integrates only relevant world-space intervals. View distance, accumulated medium length and three sample budgets control its cost. |
| High-altitude views | Clouds, their shadows and associated light fade together between 30 km and 90 km camera ellipsoid height by default. Fully faded views skip cloud and shadow draw calls. |
| Atmosphere and bloom | Precomputed atmosphere textures supply scattering data; bloom processes a progressively smaller image pyramid before composition. |
| Large demo windows | The demo caps the drawing buffer at approximately four million pixels through `viewer.resolutionScale`. This is a demo policy, separate from the SDK's cloud sampling strategy. |

The 1/16 figure describes cloud sampling resolution, not an overall frame-rate multiplier. Actual performance depends on the GPU, drawing-buffer size, view and enabled effects.

## How the pipeline fits together

```text
Cesium scene color + depth
  → HBAO (optional)
  → atmosphere + volumetric clouds + cloud shadows + volumetric light
  → bloom / lens flare + tone mapping
  → SMAA (optional)
```

The SDK registers stages in `scene.postProcessStages` and updates lighting, weather motion and offscreen passes through `scene.preRender`.

## Integration scope

The current implementation targets a single Cesium Viewer with a globe and a 3D perspective camera. It uses WebGL 2 features, floating-point render targets and Cesium renderer internals. The repository locks Cesium to **1.142.0** and three to **0.160.1**; other Cesium versions need compatibility verification.

SSR and SSS are outside the supported EffectPipeline feature set. For installation, static assets, all public options, scene side effects and lifecycle handling, see the [usage guide](EffectPipeline.README.md).

## Explore the implementation

- [EffectPipeline.js](EffectPipeline.js): public API, defaults, validation and updates.
- [GeospatialPipelinePass.js](Library/GeospatialPipelinePass.js): scene integration, atmosphere and composition.
- [CloudsMaterialPass.js](Library/geospatial/CloudsMaterialPass.js): cloud/light integration and temporal reconstruction.
- [ShadowMaterialPass.js](Library/geospatial/ShadowMaterialPass.js) and [AerialPerspectiveEffect.js](Library/geospatial/AerialPerspectiveEffect.js): cloud shadow generation and application.

## License

[MIT](LICENSE).
