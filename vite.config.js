import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const fromRepo = path => normalizePath(fileURLToPath(new URL(path, import.meta.url)));

/**
 * 生成演示站点的 Vite 配置。
 *
 * 各 Demo 目录共用同一套 Cesium 资源拷贝规则，只把入口目录和开发端口参数化；
 * 默认导出仍对应主 Demo，demo2 由 vite.demo2.config.js 复用本函数。
 */
export function createDemoConfig({ demoRoot = './demo/', port = 3000 } = {}) {
  // This configuration serves only the demo; the SDK has its own explicit build entry.
  return defineConfig({
    root: fromRepo(demoRoot),
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
          { src: fromRepo('./LICENSE'), dest: '.', rename: { stripBase: true } },
          { src: fromRepo('./NOTICE'), dest: '.', rename: { stripBase: true } },
          { src: fromRepo('./THIRD_PARTY_NOTICES.md'), dest: '.', rename: { stripBase: true } },
          { src: fromRepo('./node_modules/cesium/LICENSE.md'), dest: 'cesium', rename: { stripBase: true } },
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
      port,
      open: false,
      // The demo imports the typed SDK facade from its parent directory.
      fs: { allow: [repoRoot] },
    },
  });
}

export default createDemoConfig();
