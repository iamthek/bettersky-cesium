# Changelog

## 1.0.0 - 2026-10-27

- **Breaking:** Keep only the named `BetterSky` export; remove the default export and the `defaultOptions` static getter.
- **Breaking:** Replace configuration shortcuts with `betterSkyInstance.update()` and use complete normalized snapshots from `BetterSky.getDefaultOptions()` and `betterSkyInstance.getOptions()`.
- **Breaking:** Use object-form HBAO with `enabled`; add top-level `rain`, `snow` and `nightGlowIntensity` options, and remove the public internal Pass.
- **Breaking:** Replace the resource getters and `assetsReady` with `loadAssets()`, `getAssetState()` and state-bearing `subscribeAssets()` callbacks; explicit failures now reject.
- Add `BetterSky.preloadAssets()` with shared downloads, eight-file preloading, an idle-progress timeout, failed-resource retries and independent download caching.
- Share downloaded asset bytes across concurrent preloads, runtime loading and instance recreation; invalidate failed decoding results while retaining successful downloads.
- Add bilingual 0.2.0 to 1.0.0 migration guidance and standardize examples on `betterSkyInstance`.
- Exclude disabled SMAA from resource snapshots and keep existing asset subscriptions connected when SMAA is enabled later.
- Skip render-pipeline rebuilds when rain or snow switches are unchanged.
- Update the demo to report post-process stage registration and explicit resource loading separately, including loading failures and retries.

## 0.2.0 - 2026-10-20

- Open the source under Apache-2.0, remove bundle obfuscation while retaining JS/GLSL minification, and update package metadata and license notices.
- Refresh the English and Chinese documentation, add a demo screenshot, and prepare the public repository and GitHub Pages demo.
- Separate the demo and SDK build outputs, generate documented public types from the SDK entry, and update the development build tools.
- Add configuration snapshots, shared option validation, explicit constructor-only settings, observable asset loading and failed-resource retries; improve instance state isolation and cleanup.
- Document the verified Cesium dependency combinations and the upstream missing-export issue affecting an unlocked Cesium 1.142.0 installation.

## 0.1.0 - 2026-10-19

- First npm release with volumetric clouds, atmosphere, cloud shadows, volumetric light, HBAO and SMAA.
- Provide an ESM SDK, TypeScript declarations and nine runtime assets for integration with an existing Cesium Viewer.
- Distributed under the proprietary trial license included with that version.
