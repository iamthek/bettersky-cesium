# BetterSky for Cesium

[English](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/README.md) | **简体中文**

面向 CesiumJS 的大气、体积云与光照效果 SDK。通过一个 `BetterSky` 实例，为已有三维地球场景添加分层云、动态云影、穿云光及画面增强效果。

[使用指南与 API](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/BetterSky.README.zh-CN.md) · [npm](https://www.npmjs.com/package/bettersky-cesium)

## 项目亮点

- **分层天空**：支持三层云，可配置云型、高度、厚度、密度与天气移动。
- **大气与光照**：提供大气透视、昼夜天空、动态云影和体积日光。
- **画面增强**：集成泛光、镜头光晕、色调映射、HBAO 环境光遮蔽与 SMAA 抗锯齿。
- **注重渲染性能**：结合低分辨率云体采样、时域重建、远景细节分级与高空淡出，减少渲染工作量。实际性能取决于 GPU、分辨率、观察视角及开启的效果。
- **便于业务接入**：为已有 Cesium Viewer 提供内置预设、局部更新、运行时开关与 TypeScript 类型声明。

## 快速开始

适用于使用 ESM 构建工具的浏览器项目，要求 Cesium `>=1.142.0`、WebGL 2、所需浮点纹理与渲染目标能力，以及 `Float16Array` 和 `structuredClone`。场景需包含地球并使用三维透视相机。完整要求与升级注意事项见使用指南。

### 1. 安装

在接入项目中任选一条命令：

```bash
npm install bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

```bash
pnpm add bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

Cesium 与业务项目共享，three（`>=0.160.1`）作为运行时依赖自动安装。请保留项目已经验证的锁文件。

### 2. 准备资源

BetterSky 沿用业务项目的 `CESIUM_BASE_URL`。以 Vite 项目中的 `/cesium/` 为例，将资源复制到 `public/`：

| 来源 | 目标位置 |
| --- | --- |
| `node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}` | `public/cesium/`，保留这四个目录 |
| `node_modules/bettersky-cesium/dist/assets/` 内的内容 | `public/cesium/BetterSkyAssets/`，保留内部目录结构 |

已有 Cesium 资源配置时继续沿用。在创建 Viewer 前设置资源基址，见下一步。[自动复制资源与子路径部署](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/BetterSky.README.zh-CN.md)见使用指南。

### 3. 接入已有 Viewer

在客户端入口、创建业务 `viewer` 之前引入：

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

window.CESIUM_BASE_URL = '/cesium/'

// 在此创建业务的 Cesium Viewer，再接入 BetterSky。
const effects = new BetterSky(viewer, { time: undefined })
```

`time: undefined` 保留业务时钟。保持 Viewer 持续渲染以驱动云动画；离开场景时，先调用 `effects.dispose()`，再销毁 Viewer。配置、资源加载和生命周期的详细说明见使用指南。

### 运行仓库 Demo

使用 Node.js 24 和 pnpm 12.8.1，在克隆后的仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 Vite 输出的地址，通常为 [http://localhost:3000/](http://localhost:3000/)。服务凭据可留空，此时使用本地底图和椭球地形。

## 文档入口

- [使用指南与 API 参考](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/BetterSky.README.zh-CN.md)：完整接入、参数、方法与注意事项，并标注当前源码和 npm `0.1.0` 的差异。
- [Demo 配置与部署](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/demo/README.md)：可选服务凭据和 GitHub Pages 配置。
- [更新记录](https://github.com/iamthek/BetterSky4Cesium/blob/sdk-publish/CHANGELOG.md)。

## 许可

[专有试用许可](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/LICENSE)。目前所有个人和组织均可零费用试用，包括商业项目和生产上线，无须逐一申请。SDK 和接入项目均可闭源。暂未设定收费日期；权利人可提前至少 30 个日历日公布通知，结束指定版本或用途的免费试用，此后继续相应用途须另获授权，授权可以收费。此前合法试用不追溯收费，已有单独授权继续按原约定执行。

允许的应用交付需附带许可和[第三方声明](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/THIRD_PARTY_NOTICES.md)，并告知接收者试用与未来授权条件。第三方材料继续适用各自原条款，分发限制以完整许可正文为准。许可问题请联系 [iamthek@qq.com](mailto:iamthek@qq.com)。

## 赞助支持

如果这个项目帮到了你，可以请我喝杯咖啡🙏☕ ，你的支持是项目持续维护和改进的动力。

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="支付宝" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="微信支付" width="200" height="300">
</p>
