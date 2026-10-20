import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const fromRepo = path => normalizePath(fileURLToPath(new URL(path, import.meta.url)));

// This configuration serves only the demo; the SDK has its own explicit build entry.
export default defineConfig({
  root: fromRepo('./demo/'),
  envDir: repoRoot,
  base: process.env.VITE_DEMO_BASE || '/',
  publicDir: false,
  build: {
    outDir: fromRepo('./dist-demo/'),
    emptyOutDir: true,
    sourcemap: false,
  },
  plugins: [
    {
      name: 'demo-cesium-base',
      config(config) {
        // Read the merged base so CLI --base and GitHub Pages subpaths stay aligned.
        const base = (config.base || '/').replace(/\/?$/, '/');
        return { define: { CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`) } };
      },
    },
    viteStaticCopy({
      targets: [
        {
          src: fromRepo('./node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}/**/*'),
          dest: 'cesium',
          rename: { stripBase: 4 },
        },
        {
          src: fromRepo('./static/BetterSkyAssets/**/*'),
          dest: 'cesium/BetterSkyAssets',
          rename: { stripBase: 2 },
        },
      ],
    }),
  ],
  server: {
    port: 3000,
    open: false,
    // The demo imports the typed SDK facade from its parent directory.
    fs: { allow: [repoRoot] },
  },
});
