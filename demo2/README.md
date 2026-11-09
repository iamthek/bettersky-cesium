# BetterSky 演示站点（demo2）

[在线演示](https://iamthek.github.io/bettersky-cesium/) · [项目主页](https://github.com/iamthek/bettersky-cesium) · [使用指南](../BetterSky.README.zh-CN.md)

这里存放本地三维模型版演示页面 `index.html` 和控制面板脚本 `demo-official.js`。SDK 参数和控制面板设置与 `demo/` 保持一致，额外的模型面板用于加载本地 3D Tiles：`Cesium3DTileset.fromUrl` 直接请求

- `http://127.0.0.1:8080/Chengdubaimo/tileset.json`
- `http://127.0.0.1:8080/cyy-new-gauss/tileset.json`

Demo 使用公开 SDK 入口 `src/index.ts`；此目录不进入 npm 包。主演示入口 `demo/` 与 `pnpm dev` 保持不变。

## 本地运行

先用任意静态服务器把两个 tileset 目录发布到 `http://127.0.0.1:8080/`（需要返回 `Access-Control-Allow-Origin`，否则浏览器会拦截跨域请求），然后在仓库根目录使用 Node.js 24 和 `package.json` 指定的 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm dev:demo2
```

打开 Vite 输出的地址，通常是 [http://localhost:3001/](http://localhost:3001/)。模型面板会显示两个本地模型，加载完成后点击按钮即可切换对应模型的显示与隐藏（只改 `tileset.show`，不重新请求瓦片）；`cyy-new-gauss` 使用高斯泼溅扩展，需要支持 `KHR_gaussian_splatting` 的 Cesium 版本（当前锁定版本已支持）。

不配置服务凭据也可以运行，默认使用本地 NaturalEarthII 底图和椭球地形。主演示 `demo/` 仍通过 `pnpm dev` 在 3000 端口启动。

Demo 会调用 `betterSkyInstance.loadAssets()` 等待当前配置所需资源，并在控制台分别报告后处理阶段注册和资源加载结果。资源就绪不代表首帧已经渲染；加载失败时可查看 `betterSkyInstance.getAssetState()`，修复资源地址或网络问题后调用 `betterSkyInstance.retryAssets()` 重试。

需要在线服务时，将 `demo/.env.pages` 复制为仓库根目录的 `.env.local`，再按需填写：

| 变量 | 用途 |
| --- | --- |
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion 服务及地形。 |
| `VITE_TIANDITU_TOKEN` | 天地图底图。 |

两项都可以留空。`VITE_` 变量会进入浏览器代码，只填写允许在客户端使用的服务凭据。`.env.local` 不提交到 Git。

## 构建与预览

demo2 仅用于本地联调，不提供构建和预览脚本。构建与部署仍针对主演示 `demo/`：`pnpm run build:demo` 输出到 `dist-demo/`，`pnpm run build:pages` 用于 GitHub Pages；构建 SDK 使用 `pnpm run build:sdk`，输出目录为 `dist/`。

## 关于线上部署

demo2 依赖本机 `http://127.0.0.1:8080` 的模型服务，只用于本地联调；线上 Pages 部署的仍是主演示 `demo/`（输出 `dist-demo/`），部署方式见 [demo/README.md](../demo/README.md)。

本地模型的地址集中在 `demo-official.js` 的 `MODEL_ASSETS`，需要换端口或路径时只改这一处即可。

## 调整依赖后检查

保留仓库锁文件，按已验证组合安装。不要只看 Cesium 的顶层版本：1.142.0 + engine 26.0.0 / widgets 16.0.0 的锁定组合可用，但 1.142.0 配合 26.4.0 / 16.3.0 存在上游缺失导出。新项目示例使用已验证的 Cesium 1.146.0，完整说明见[兼容性与部署](../BetterSky.README.zh-CN.md#兼容性与部署)。
