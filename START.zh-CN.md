# BetterSky4Cesium SDK — 快速开始

[English](START.md) | **简体中文**

> 这是待实施的 npm SDK 接入说明，更新于 2026-10-18。SDK 打包、混淆及下列命令尚未完成发布验证；包名和版本暂定。本文不代表 `better-sky4cesium@0.1.0` 已可安装。后续实施并验收后，本说明将作为发布包的中文 README。

EffectPipeline 是 CesiumJS 插件，为已有场景增加体积云、大气、云影、体积光和可选 HBAO/SMAA，直接使用宿主已有的 `CESIUM_BASE_URL`。目标发布包包含编译混淆后的 ESM、公开 TypeScript 类型声明及必要静态资源。

## 1. 环境要求与安装

- 使用构建工具的浏览器应用，下文以 Vite 为例。在客户端容器挂载后创建 Viewer 和 EffectPipeline。
- Cesium **1.142.0**，同页一个活动的 EffectPipeline/Viewer，场景包含地球并使用三维透视相机。
- 浏览器/GPU 支持 WebGL 2、三维/数组纹理及所需浮点渲染目标，且具有原生 `Float16Array` 和 `structuredClone`。
- 下方复制命令使用 Node.js **22 或更高版本**；Vite 版本需兼容你的具体 Node 版本。使用项目可以选择 npm 或 pnpm。

正式版本可用后，在使用项目自己的 `package.json` 所在目录中，**任选一条**安装命令：

```bash
npm install --save-exact better-sky4cesium@0.1.0 cesium@1.142.0
```

```bash
pnpm add -E better-sky4cesium@0.1.0 cesium@1.142.0
```

两种命令安装同一个 npm registry 包。Cesium 是与应用共享的 peer dependency，three 作为 SDK 运行依赖自动安装。安装 SDK 时不执行构建、资源下载或复制；SDK 着色器导入将在发布前完成打包，接入项目无需为它配置 GLSL 原文加载器。

## 2. 从 node_modules 复制静态资源

将 `node_modules/better-sky4cesium/dist/assets/` 的全部内容复制到 **Cesium 资源根目录下的 `EffectPipelineAssets/`**。例如 Vite 项目配置 `CESIUM_BASE_URL='/cesium/'` 时，目标就是 `public/cesium/EffectPipelineAssets/`。

安装后，在使用项目目录中运行以下命令，同时复制 Cesium 官方资源目录和 SDK 许可声明；可在 PowerShell 和常见 Unix shell 中通过 Node.js 执行：

```bash
node --input-type=module -e "import { cpSync, mkdirSync } from 'node:fs'; mkdirSync('public/cesium/EffectPipelineAssets', { recursive: true }); cpSync('node_modules/better-sky4cesium/dist/assets', 'public/cesium/EffectPipelineAssets', { recursive: true }); for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) { cpSync('node_modules/cesium/Build/Cesium/' + dir, 'public/cesium/' + dir, { recursive: true }); } for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) { cpSync('node_modules/better-sky4cesium/' + file, 'public/cesium/EffectPipelineAssets/' + file); }"
```

复制后结构如下。只保留一层 `EffectPipelineAssets/`，不要额外嵌套 `assets/`：

```text
public/
  cesium/
    Workers/
    Assets/
    ThirdParty/
    Widgets/
    EffectPipelineAssets/
      LICENSE
      THIRD_PARTY_NOTICES.md
      snowCoverMask.png
      ...包内其他效果资源
      GeospatialAssets/
        local_weather.png
        ...包内 .exr、.bin 和 .png 文件
```

Vite 按应用的基础路径提供 `public/` 内容，并把它复制进应用构建产物；其他构建工具需提供等效的静态服务。交付应用时保留 SDK 的许可与声明，同时保留本次分发的 Cesium/three 文件所适用的许可通知。

npm 和 pnpm 都使用 `node_modules/` 下的直接依赖路径；文件系统会处理 pnpm 链接。不要硬编码 `.pnpm/` 目录，也不需要从源码仓库获取资源。在 workspace 中，应在实际使用 SDK 的应用目录安装依赖并执行复制。

CI 中也要在构建前执行复制。该命令合并并覆盖文件，不会删除旧版本的残留文件。升级时仅替换 `EffectPipelineAssets/` 并刷新旧缓存，确保 JavaScript 与纹理属于同一版本；保留 Cesium 的其他目录，不要在 `EffectPipelineAssets/` 中存放业务自己的文件。

### 可选：由 Vite 自动复制

此方式与手动维护 `public/` 副本二选一。按使用项目现有的包管理器安装插件，下例针对 Vite 6：

```bash
npm install --save-dev vite-plugin-static-copy@2.3.2
```

```bash
pnpm add -D vite-plugin-static-copy@2.3.2
```

将以下复制目标合并进现有 Vite 配置，并使用下一节相同的 `base` 与 `define`。采用自动复制前，移除手动维护的同路径资源副本，避免重复输出。

```js
import { viteStaticCopy } from 'vite-plugin-static-copy'

// 加入 vite.config.js 现有的 plugins 数组：
viteStaticCopy({
  targets: [
    {
      src: 'node_modules/better-sky4cesium/dist/assets/*',
      dest: 'cesium/EffectPipelineAssets',
    },
    {
      src: 'node_modules/better-sky4cesium/{LICENSE,THIRD_PARTY_NOTICES.md}',
      dest: 'cesium/EffectPipelineAssets',
    },
    {
      src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}',
      dest: 'cesium',
    },
  ],
})
```

插件在开发时提供资源访问，在构建时复制资源；SDK 目标覆盖包内所有根目录资源项，包括整个 `GeospatialAssets/`。浏览器 URL 与手动复制方式一致。其他 Vite 版本应选择相兼容的插件版本。

## 3. 配置 URL 并接入 Viewer

沿用宿主已有的 `CESIUM_BASE_URL`。如果尚未配置，下面的 Vite 示例与上面的复制路径对应：

```js
import { defineConfig } from 'vite'

const base = '/' // 部署在 https://example.com/app/ 时改为 '/app/'。

export default defineConfig({
  base,
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`),
  },
  // 保留项目原有插件；选择自动复制时加入复制插件。
})
```

应用创建好 Cesium `viewer` 后，接入 SDK：

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { EffectPipeline } from 'better-sky4cesium'

const effects = new EffectPipeline(viewer, {
  time: undefined, // 保留业务当前的时钟时间。
})

effects.update({ coverage: 0.5 })
effects.enabled = false
effects.enabled = true

// 页面/组件卸载时，先释放效果，再销毁 Viewer：
// effects.dispose()
// viewer.destroy()
```

包也将提供 `EffectPipeline` 默认导出。插件不需要额外的资源 URL 参数，直接通过 Cesium 的 `buildModuleUrl('EffectPipelineAssets/...')` 使用宿主的 `CESIUM_BASE_URL`。

当 `CESIUM_BASE_URL='/cesium/'` 时，天气纹理地址为 `/cesium/EffectPipelineAssets/GeospatialAssets/local_weather.png`。部署到 `/app/` 时，宿主配置 `CESIUM_BASE_URL='/app/cesium/'`，插件资源路径自动跟随；同时保持应用基础路径与服务器挂载路径一致。浏览器 URL 中不应出现 `node_modules/` 或本地目录名 `public/`。

如果项目已将 Cesium 资源部署在其他位置，只需把 `EffectPipelineAssets/` 放到其 `Workers/`、`Assets/`、`ThirdParty/`、`Widgets/` 旁边，继续使用原来的 Cesium 基础 URL。若使用 HTTPS 资源域名，该服务需提供适当的 CORS 响应头。

`new EffectPipeline(viewer)` 会应用完整默认预设，包括固定的时钟时间；`time: undefined` 保留当前时间。管线还可能修改 HDR、对数深度和 gamma；销毁不保证恢复所有场景设置。云动画和时域重建需要持续渲染；若启用 Cesium 显式渲染模式，业务需持续请求新帧。

## 4. 检查接入结果

- 确认 SDK 和 Cesium 资源请求返回真实文件，不能是 404 或 HTML 回退页；保留文件名大小写和 `GeospatialAssets/` 层级。
- 云或大气缺失时，检查网络失败、浏览器控制台和 WebGL 能力；仅成功导入 ESM 不代表纹理已加载完成。
- 安装后找不到纹理时，检查复制步骤；安装 npm 包不会自动让 `node_modules/` 成为公开静态目录。
- 子路径部署失败时，统一应用 `base`、`CESIUM_BASE_URL` 与服务器挂载路径。
- 同页保留一个活动实例，在 Viewer 销毁前释放该实例；首版不支持在其活动期间再创建第二个实例。

目标包仅包含混淆后的运行 JavaScript 和公开声明，不提供原始实现文件或 sourcemap。浏览器获得的 JavaScript、GLSL 与纹理仍可在运行时检查；混淆不能保证无法逆向。

## 许可

[专有试用许可](LICENSE)。目前所有个人和组织均可零费用试用，包括商业项目和生产上线，无须逐一申请。SDK 和使用它的业务项目均可闭源。暂未设定收费日期；权利人可提前至少 30 个日历日公布通知，结束指定版本或用途的免费试用，此后继续相应用途须另获授权，授权可以收费。此前合法试用不追溯收费，已有单独授权继续按原约定执行。

允许的应用交付需附带许可和[第三方声明](THIRD_PARTY_NOTICES.md)，并告知接收者试用与未来授权条件。第三方材料继续适用各自原条款；分发限制以完整许可正文为准。
