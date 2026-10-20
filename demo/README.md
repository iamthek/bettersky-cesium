# BetterSky 演示站点

[在线演示](https://iamthek.github.io/bettersky-cesium/) · [项目主页](https://github.com/iamthek/bettersky-cesium) · [使用指南](../BetterSky.README.zh-CN.md)

这里存放演示页面 `index.html`、控制面板脚本 `demo-official.js` 和服务凭据示例。Demo 使用公开 SDK 入口 `src/index.ts`；此目录不进入 npm 包。

## 本地运行

在仓库根目录使用 Node.js 24 和 `package.json` 指定的 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 Vite 输出的地址，通常是 [http://localhost:3000/](http://localhost:3000/)。不配置服务凭据也可以运行，默认使用本地 NaturalEarthII 底图和椭球地形。

需要在线服务时，将 `demo/.env.example` 复制为仓库根目录的 `.env.local`，再按需填写：

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

目标地址为 [https://iamthek.github.io/bettersky-cesium/](https://iamthek.github.io/bettersky-cesium/)。工作流从 Pages 配置读取基础路径，Cesium 与 BetterSky 资源共用该路径下的 `cesium/` 目录；本地修改不会自动发布到线上。

本地可按项目站点路径构建和预览：

```bash
pnpm run build:pages --base /bettersky-cesium/
pnpm preview --base /bettersky-cesium/
```

脚本、样式和资源地址均按基础路径生成。SDK 安装到其他项目时，仍使用那个项目自己的 `CESIUM_BASE_URL`，不固定为 Demo 的地址。

## 调整依赖后检查

保留仓库锁文件，按已验证组合安装。不要只看 Cesium 的顶层版本：1.142.0 + engine 26.0.0 / widgets 16.0.0 的锁定组合可用，但 1.142.0 配合 26.4.0 / 16.3.0 存在上游缺失导出。新项目示例使用已验证的 Cesium 1.146.0，完整说明见[兼容性与部署](../BetterSky.README.zh-CN.md#兼容性与部署)。
