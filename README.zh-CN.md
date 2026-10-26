# BetterSky for Cesium

[English](https://github.com/iamthek/bettersky-cesium/blob/main/README.md) | **简体中文**

为 Cesium 加入体积云、体积光、镜头光晕、丁达尔效应等层次丰富的天空效果。BetterSky 以插件方式接入已有的官方原版 CesiumJS Viewer，将大气、光照和画面增强整合到一个 SDK 中。

[在线演示](https://iamthek.github.io/bettersky-cesium/) · [使用指南与 API](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.zh-CN.md) · [npm](https://www.npmjs.com/package/bettersky-cesium)

![BetterSky 在 Cesium 演示中的云、大气与光照效果](https://raw.githubusercontent.com/iamthek/bettersky-cesium/main/docs/images/demo.png)

## 项目亮点

- **分层天空**：支持三层云，可调整云型、高度、厚度、密度与天气移动。
- **大气与光照**：提供大气透视、昼夜天空、动态云影和体积日光。
- **画面增强**：集成泛光、镜头光晕、色调映射、HBAO 环境光遮蔽与 SMAA 抗锯齿。
- **注重渲染性能**：结合低分辨率云体采样、时域重建、远景细节分级与高空淡出，减少渲染工作量。
- **插件式接入**：适配已有的官方原版 Cesium Viewer，提供内置预设、局部更新、运行时开关与带参数说明的 TypeScript 类型声明。

## 快速开始

使用浏览器项目、Cesium `>=1.142.0`、WebGL 2，以及所需的浮点纹理能力、`Float16Array` 和 `structuredClone`。场景须为包含地球的三维透视场景，同页只允许一个活动实例。完整要求见[使用指南](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.zh-CN.md#环境要求)。

### 1. 安装

在接入项目中使用 npm 或 pnpm，任选一条命令。示例使用已验证的 Cesium `1.146.0` 组合：

```bash
npm install bettersky-cesium@1.0.0 cesium@1.146.0
```

```bash
pnpm add bettersky-cesium@1.0.0 cesium@1.146.0
```

已有兼容的 Cesium 版本时，只安装 `bettersky-cesium@1.0.0`，保留项目已验证的锁文件。Cesium 与业务共用，three（`>=0.160.1`）自动安装。[兼容性说明](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.zh-CN.md#兼容性与部署)列出了一个需要避开的 Cesium 依赖组合。

从 0.2.0 升级时，统一使用 `BetterSky` 具名导出，把配置快捷入口改为 `betterSkyInstance.update()`，并把资源等待改为 `betterSkyInstance.loadAssets()`。完整变更见 [1.0 迁移表](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.zh-CN.md#从-020-迁移)。

### 2. 准备资源

BetterSky 复用业务的 `CESIUM_BASE_URL`。以 `/cesium/` 为例，在 Vite 项目的 `public/` 中准备以下文件：

| 来源 | 目标 |
| --- | --- |
| `node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}` | `public/cesium/`，保留这四个目录 |
| `node_modules/bettersky-cesium/dist/assets/` 内的内容 | `public/cesium/BetterSkyAssets/`，保留内部目录 |

已经配置 Cesium 资源时，只需在同一根目录中追加 `BetterSkyAssets/`。指南提供[自动复制与子路径部署配置](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.zh-CN.md#资源与部署)。

### 3. 接入已有 Viewer

创建 Viewer 前设置资源地址，再接入 BetterSky：

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

window.CESIUM_BASE_URL = '/cesium/'

// 在这里创建业务自己的 Cesium Viewer。
const betterSkyInstance = new BetterSky(viewer, { time: null })

// 只更新需要修改的参数。
betterSkyInstance.update({ coverage: 0.5 })

// 离开场景时，先释放 BetterSky，再销毁 Viewer。
// betterSkyInstance.dispose()
```

`time: null` 保留业务时间。动态云需要 Viewer 持续渲染。完整参数、资源加载、失败重试和销毁说明见[使用指南](https://github.com/iamthek/bettersky-cesium/blob/main/BetterSky.README.zh-CN.md)，版本变化见[更新记录](https://github.com/iamthek/bettersky-cesium/blob/main/CHANGELOG.md)。

## 许可

`1.0.0` 使用 [Apache License 2.0](https://github.com/iamthek/bettersky-cesium/blob/main/LICENSE)，允许按许可条款用于个人与商业项目、修改和再分发。分发 SDK 时保留许可、[NOTICE](https://github.com/iamthek/bettersky-cesium/blob/main/NOTICE) 与适用的[第三方声明](https://github.com/iamthek/bettersky-cesium/blob/main/THIRD_PARTY_NOTICES.md)。第三方材料继续遵循各自许可。

联系：[iamthek@qq.com](mailto:iamthek@qq.com)。

## 赞助支持

如果这个项目帮到了你，可以请我喝杯咖啡🙏☕ ，你的支持是项目持续维护和改进的动力。

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="支付宝" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="微信支付" width="200" height="300">
</p>
