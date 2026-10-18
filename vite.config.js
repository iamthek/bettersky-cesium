import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  define: {
    // 官方资源与 BetterSkyAssets 均通过 buildModuleUrl 从此根目录加载。
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  plugins: [
    // 保留官方资源的目录层级；开发时提供 /cesium/，构建时复制到 dist/cesium/。
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}',
          dest: 'cesium',
        },
        {
          // 整体复制效果资源目录，保留根目录文件与各效果的子目录。
          src: 'static/BetterSkyAssets',
          dest: 'cesium',
        },
      ],
    }),
  ],
  server: {
    port: 3000,
    open: false,
  },
});
