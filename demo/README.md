# BetterSky 演示站点

此目录统一存放演示页面 `index.html`、控制面板脚本 `demo-official.js` 和环境变量示例。SDK 入口是仓库的 `src/index.ts`，演示目录不进入 SDK 发布包。

在仓库根目录使用 Node 24 和 package.json 指定的 pnpm：

```bash
pnpm install --frozen-lockfile
cp demo/.env.example .env.local
pnpm dev
```

`.env.local` 放在仓库根目录，以兼容已有开发配置。两个客户端服务凭据均可留空，此时使用本地 NaturalEarthII 底图和椭球地形。`VITE_` 变量会进入浏览器代码，不放入服务端秘密。

```bash
pnpm run build:demo
pnpm preview
```

输出统一为根目录 `dist-demo/`。`pnpm build` 保留演示构建含义，SDK 使用 `pnpm run build:sdk`，两种输出相互隔离。

## GitHub Pages

`.github/workflows/demo-pages.yml` 已提供官方 Pages 工作流。仓库的 **Settings → Pages → Source** 选择 **GitHub Actions** 后，默认分支推送或手动运行工作流会构建并部署 `dist-demo/`。本地修改不会自行发布。

工作流通过 Pages 配置返回的 `base_path` 设置演示基础路径，Cesium 和 BetterSky 资源使用同一个对应的 `cesium/` 根目录，也适用于项目站点或自定义域名。

本地可显式验证项目子路径：

```bash
pnpm run build:pages --base /BetterSky4Cesium/
pnpm preview --base /BetterSky4Cesium/
```

资源、脚本和样式均由 Vite 按基础路径生成，不在 HTML 中硬编码仓库名。SDK 安装到其他项目时仍沿用宿主自己的 `CESIUM_BASE_URL`。
