# Changelog

## 0.1.0 - 2026-10-19

- Publish version 0.1.0 with fixed build, pack, verify and publish scripts, public ESM declarations, nine verified runtime assets and complete notices.
- Add page-wide instance and scene/capability guards, constructor rollback, disposal checks and official-Cesium snow shader support.
- Replace Cesium namespace imports with explicit named imports and reject namespace/default imports in both build stages, targeting Cesium 1.142.0 without component overrides.
- Retain sponsorship content and payment images; use iamthek@qq.com and the npm package page for public contact metadata.
- Fix the README asset-copy workflow for vite-plugin-static-copy 4.1.1 and validate copied paths, bytes and hashes after each consumer build.
- The release/ candidate passed 34 automated tests, all eight npm/pnpm dependency combinations, eleven browser scenarios and publication dry-run. Previous candidates and acceptance reports are superseded; disposable test workspaces and servers have been cleaned.
- The owner completed npm authentication and publication. The official registry artifact matches the accepted tarball byte-for-byte, and latest points to 0.1.0.
- Post-publication npm/pnpm installation, type checks, production builds and browser smoke tests passed; all 18 runtime asset responses succeeded. The owner verified the npm page, and disposable test services and workspaces were cleaned.
- Repair repository publication tooling to retain processing receipts, prevent duplicate uploads and support verification-only confirmation; nine offline regression tests passed. The published SDK artifact is unchanged.
