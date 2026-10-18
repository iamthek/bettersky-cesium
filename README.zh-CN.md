# BetterSky for Cesium

[English](README.md) | **简体中文**

BetterSky for Cesium 是 CesiumJS 视觉效果插件，通过 **BetterSky** 为已有三维地球场景增加体积云、大气、云影、体积光和画面增强。

## 项目亮点

- 多层体积云，可调节云形、高度、覆盖度和运动。
- 大气散射、动态云影与太阳光束联动。
- 提供泛光、镜头光晕、色调映射及可选 HBAO/SMAA。
- 通过统一 API 使用内置预设、局部更新参数并切换效果。

## 使用

> npm SDK 打包与发布验收尚未完成。下方版本暂定，安装命令不代表 `0.1.0` 已可使用。

使用 Cesium **1.142.0** 和浏览器构建工具，同页保留一个活动的 BetterSky/Viewer。浏览器/GPU 需支持 WebGL 2、三维/数组纹理、所需浮点渲染目标，并具有原生 `Float16Array` 和 `structuredClone`。

### 安装

正式发布后，在使用项目目录中任选 npm 或 pnpm：

```bash
npm install --save-exact bettersky-cesium@0.1.0 cesium@1.142.0
```

```bash
pnpm add -E bettersky-cesium@0.1.0 cesium@1.142.0
```

两种命令安装同一个包。Cesium 与应用共享，three 作为运行依赖自动安装。

### 复制资源

插件直接使用宿主的 **`CESIUM_BASE_URL`**。将 `node_modules/bettersky-cesium/dist/assets/` 的全部内容复制到 **Cesium 资源根目录下的 `BetterSkyAssets/`**。以 Vite 项目配置 `CESIUM_BASE_URL='/cesium/'` 为例：

| 来源 | 目标 |
| --- | --- |
| `node_modules/bettersky-cesium/dist/assets/` 内的全部内容 | `public/cesium/BetterSkyAssets/` |
| SDK 的 `LICENSE` 和 `THIRD_PARTY_NOTICES.md` | `public/cesium/BetterSkyAssets/` |
| Cesium 的 `Workers/`、`Assets/`、`ThirdParty/`、`Widgets/` | 沿用项目在 `public/cesium/` 下已有的副本 |

例如，在使用项目目录中通过 Node.js 22 或更高版本执行：

```bash
node --input-type=module -e "import { cpSync } from 'node:fs'; cpSync('node_modules/bettersky-cesium/dist/assets', 'public/cesium/BetterSkyAssets', { recursive: true }); for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) cpSync('node_modules/bettersky-cesium/' + file, 'public/cesium/BetterSkyAssets/' + file);"
```

`snowCoverMask.png` 和 `GeospatialAssets/` 应直接位于 `BetterSkyAssets/` 内，不要多嵌套一层 `assets/`。npm 和 pnpm 均使用上述路径，无需访问 `.pnpm/`。CI 构建前也应复制资源；升级时只替换 `BetterSkyAssets/` 并刷新缓存，确保 JavaScript 和资源属于同一版本。

沿用项目已有的 Cesium 资源配置。尚未配置时，以下 Vite 示例与上述复制路径对应：

```js
import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
})
```

部署到 `/app/` 时，同步设置应用基础路径及 `CESIUM_BASE_URL='/app/cesium/'`，插件资源自动从 `/app/cesium/BetterSkyAssets/` 加载。若项目已将 Cesium 资源部署在其他位置，把 `BetterSkyAssets/` 放到其 `Workers/` 目录旁边即可，无需额外的插件资源 URL。

### 接入 Viewer

应用在客户端创建好 Cesium `viewer` 后：

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

const effects = new BetterSky(viewer, {
  time: undefined, // 保留业务当前的时钟时间。
})

effects.update({ coverage: 0.5 })
effects.enabled = false
effects.enabled = true
```

云动画需要持续渲染。管线会应用 HDR、gamma、对数深度等场景设置，销毁不会恢复所有设置。页面或组件卸载时，先释放效果，再销毁 Viewer：

```js
effects.dispose()
viewer.destroy()
```

效果未显示时，先检查 `CESIUM_BASE_URL + 'BetterSkyAssets/'` 下的资源请求、浏览器控制台及 WebGL 能力；请求应返回真实文件，不能是 HTML 回退页。

## 许可

[专有试用许可](LICENSE)。目前所有个人和组织均可零费用试用，包括商业项目和生产上线，无须逐一申请。SDK 和接入项目均可闭源。暂未设定收费日期；权利人可提前至少 30 个日历日公布通知，结束指定版本或用途的免费试用，此后继续相应用途须另获授权，授权可以收费。此前合法试用不追溯收费，已有单独授权继续按原约定执行。

允许的应用交付需附带许可和[第三方声明](THIRD_PARTY_NOTICES.md)，并告知接收者试用与未来授权条件。第三方材料继续适用各自原条款，分发限制以完整许可正文为准。

## 赞助支持

如果这个项目帮到了你，可以请我喝杯咖啡🙏☕ 牛马打工不易，你的支持是项目持续维护和改进的动力。

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="支付宝" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="微信支付" width="200" height="300">
</p>
