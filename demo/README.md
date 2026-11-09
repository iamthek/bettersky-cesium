# BetterSky 演示站点

[在线演示](https://iamthek.github.io/bettersky-cesium/) · [项目主页](https://github.com/iamthek/bettersky-cesium) · [使用指南](../BetterSky.README.zh-CN.md)

这里存放演示页面 `index.html`、控制面板脚本 `demo-official.js` 和 GitHub Pages 使用的公开服务配置 `.env.pages`。Demo 使用公开 SDK 入口 `src/index.ts`；此目录不进入 npm 包。

SDK 默认参数直接读取 `BetterSky.getDefaultOptions()`，与本地调试入口 `demo2/` 的参数和控制面板设置保持一致。`demo/` 用于 GitHub Pages，不加载本地三维模型；`demo2/` 额外提供本地 3D Tiles 模型加载与切换，仅用于本地调试。

## 本地运行

在仓库根目录使用 Node.js 24 和 `package.json` 指定的 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 Vite 输出的地址，通常是 [http://localhost:3000/](http://localhost:3000/)。不配置服务凭据也可以运行，默认使用本地 NaturalEarthII 底图和椭球地形。

Demo 先显示加载界面，调用 `BetterSky.preloadAssets()` 预下载天空与云层资源；下载成功后才创建 Cesium Viewer 和 BetterSky 实例。随后等待 `betterSkyInstance.loadAssets()` 完成纹理解码与上传，并在下一帧渲染后显示场景和控制面板。下载或初始化失败时保留提示并提供重试按钮；重新下载会复用成功缓存，仅重试失败文件。

加载界面不会消除网络超时。若资源下载持续停滞，请检查网络或代理后重试。此启动流程仅用于 `demo/`，修改和部署 Demo 不会改变已经发布的 npm 包。

需要在线服务时，将 `demo/.env.pages` 复制为仓库根目录的 `.env.local`，再按需填写：

| 变量 | 用途 |
| --- | --- |
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion 服务及地形。 |
| `VITE_TIANDITU_TOKEN` | 天地图底图。 |

两项都可以留空。`VITE_` 变量会进入浏览器代码，只填写允许在客户端使用的服务凭据。`.env.local` 不提交到 Git。

## 构建与预览

```bash
pnpm run build:demo
pnpm preview
```

输出目录是根目录的 `dist-demo/`。`pnpm build` 也构建 Demo；构建 SDK 使用 `pnpm run build:sdk`，输出目录为 `dist/`。

## 部署到 GitHub Pages

仓库提供 `.github/workflows/demo-pages.yml`。在 GitHub 仓库的 **Settings → Pages → Source** 中选择 **GitHub Actions**，向默认分支 `main` 推送，或手动运行工作流，即可构建并部署 Demo。

`build:pages` 使用 Vite 的 `pages` 模式，从 `demo/` 目录读取已提交的 `.env.pages`，将其中的 Cesium Ion 和天地图 key 注入浏览器代码。这些 key 应允许在线演示的域名访问；修改后需重新构建并部署。日常本地开发仍读取仓库根目录的 `.env.local`。

目标地址为 [https://iamthek.github.io/bettersky-cesium/](https://iamthek.github.io/bettersky-cesium/)。工作流从 Pages 配置读取基础路径，Cesium 与 BetterSky 资源共用该路径下的 `cesium/` 目录；本地修改不会自动发布到线上。

本地可按项目站点路径构建和预览：

```bash
pnpm run build:pages --base /bettersky-cesium/
pnpm preview --base /bettersky-cesium/
```

脚本、样式和资源地址均按基础路径生成。SDK 安装到其他项目时，仍使用那个项目自己的 `CESIUM_BASE_URL`，不固定为 Demo 的地址。

## 调整依赖后检查

保留仓库锁文件，按已验证组合安装。不要只看 Cesium 的顶层版本：1.142.0 + engine 26.0.0 / widgets 16.0.0 的锁定组合可用，但 1.142.0 配合 26.4.0 / 16.3.0 存在上游缺失导出。新项目示例使用已验证的 Cesium 1.146.0，完整说明见[兼容性与部署](../BetterSky.README.zh-CN.md#兼容性与部署)。
