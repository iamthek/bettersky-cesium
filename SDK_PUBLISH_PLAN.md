# BetterSky4Cesium SDK：兼容 npm 与 pnpm

> 状态：待实施。本文记录已确认的首版方案，不代表 SDK 已完成改造或发布。

## 目标与默认范围

发布一份标准 ESM 包，同时支持 npm、pnpm 安装，无需维护两套发布产物。包名暂定 `better-sky4cesium`，首版 `0.1.0`，正式发布前确认名称可用性。

首版支持 Cesium `1.142.0`、同页单 Viewer；资源随包分发，由接入项目配置复制。

首版面向使用构建工具的浏览器项目，不增加 HTML 直接引入脚本的版本或专用 Vite 自动部署插件。

发布后，接入项目可以任选一种方式安装：

```bash
npm install --save-exact better-sky4cesium@0.1.0 cesium@1.142.0
```

```bash
pnpm add -E better-sky4cesium@0.1.0 cesium@1.142.0
```

`three` 作为 SDK 的运行依赖自动安装。接入项目不必使用与 SDK 仓库相同的包管理器。

## 包结构与依赖

- 使用现有 Vite 6 构建 SDK 至 `dist/`，demo 独立输出至 `dist-demo/`。
- 提供 `build:sdk`、`build:demo`；现有开发和预览命令继续服务 demo。
- 移除阻止发布的 `private: true`，补齐版本号、`exports`、`types`、发布文件白名单、MIT 许可和仓库信息。
- 保留 JavaScript 实现，提供公开 API 的 `.d.ts`；发布内容限定为 SDK 产物、资源及必要文档。
- Cesium 声明为 `peerDependencies`，固定 `1.142.0`，与宿主共享；SDK 仓库开发时使用同一版本。
- three 作为普通运行依赖固定为 `0.160.1`。Cesium 和 three 均设置为构建外部依赖，不打入 SDK 产物。
- 仓库继续使用 pnpm 和现有锁文件；所有运行依赖明确声明，不依赖依赖提升或 `.pnpm` 内部目录结构。
- `prepack` 负责构建；使用方安装时无需运行 SDK 构建或资源复制脚本。

## API、资源与运行边界

- 保留 `EffectPipeline` 具名及默认导出、现有配置和方法。
- 增加仅用于初始化的 `assetsBaseUrl`，统一解析自定义资源；支持网站子路径和 HTTPS 地址，省略时保留现有 Cesium 资源路径行为。
- 将全部 17 个资源放入 `dist/assets/`，保持目录结构；提供基于 `vite-plugin-static-copy` 的接入示例，资源定位兼容 pnpm。
- Cesium 自身的资源目录和基础 URL 继续由接入项目配置，SDK 不通过修改全局 `CESIUM_BASE_URL` 配置自身资源。
- 限制同页一个活动实例，第二实例在改变场景前报错，销毁后允许重建。
- 修复影响单实例生命周期的异步加载后销毁、SMAA 重复加载及实例拥有的阴影和纹理资源释放问题。
- 明确并检查必要的浏览器能力，包括 WebGL 2、所需浮点纹理能力、`Float16Array` 和 `structuredClone`。
- 保留当前场景设置行为，说明时钟、HDR 等影响及销毁恢复范围。
- 保留第三方声明，核实并补齐资源来源及必要授权说明，随 npm 包分发。
- 更新中英文文档，英文默认，并列提供 npm、pnpm 安装命令；项目首页介绍能力，使用文档说明安装、资源部署和 API。

将 SDK 资源部署到指定目录后，接入方式如下：

```js
import { EffectPipeline } from 'better-sky4cesium'

const effects = new EffectPipeline(viewer, {
  assetsBaseUrl: '/better-sky4cesium/',
  time: undefined, // 保留业务场景的时间
})

effects.update({ coverage: 0.5 })

// 页面卸载时，先释放效果，再销毁 Viewer。
effects.dispose()
```

## 验收与发布

1. 构建 SDK 后检查打包清单，确认 SDK、类型和资源齐全，环境变量文件、demo 及开发工具数据未被打包。
2. 使用 `npm pack` 或 `pnpm pack` 生成实际 `.tgz`，分别在独立 npm 项目和 pnpm 项目中安装，验证导入、类型、依赖解析与资源复制；pnpm 使用默认依赖布局。
3. 验收项目使用 Vite、TypeScript 和 Cesium `1.142.0`，通过实际压缩包接入，不使用源码别名或工作区链接代替安装验证。
4. 使用 `@browser` 检查渲染、参数更新、开关、根路径及子路径部署，并检查资源请求及控制台错误。
5. 验证资源加载期间销毁、重复销毁、销毁后重建和第二实例限制。
6. 完成中英文安装、资源部署、API、兼容范围及生命周期说明。
7. 验收通过并完成 npm 账号认证后，由拥有包发布权限的账号完成首次发布：

```bash
pnpm publish --access public --registry=https://registry.npmjs.org
```

也可以使用 npm 发布同一份包：

```bash
npm publish --access public --registry=https://registry.npmjs.org
```

发布后分别通过 npm 和 pnpm 从官方仓库安装 `0.1.0`，完成最终接入验证。

## 官方参考

- [Vite 6 库模式](https://v6.vite.dev/guide/build#library-mode)
- [npm package.json 配置](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [npm 公共包发布指南](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)
- [pnpm add](https://pnpm.io/cli/add)
- [pnpm pack](https://pnpm.io/cli/pack)
- [pnpm publish](https://pnpm.io/cli/publish)
