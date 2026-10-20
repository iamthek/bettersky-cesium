# BetterSky for Cesium

[English](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/README.md) | **简体中文**

BetterSky for Cesium 是 CesiumJS 视觉效果插件，通过 **BetterSky** 为已有三维地球场景增加体积云、大气、云影、体积光和画面增强。

## 项目亮点

- 多层体积云，可调节云形、高度、覆盖度和运动。
- 大气散射、动态云影与太阳光束联动。
- 提供泛光、镜头光晕、色调映射及可选 HBAO/SMAA。
- 通过统一 API 使用内置预设、局部更新参数并切换效果。

## 使用

使用 Cesium **1.142.0 或更高版本**、three **0.160.1 或更高版本**和浏览器构建工具，同页保留一个活动的 BetterSky/Viewer。这些版本是支持下限，不代表已经测试所有未来版本；插件使用渲染器内部接口，升级依赖时应检查渲染与生命周期行为。浏览器/GPU 需支持 WebGL 2、三维/数组纹理、所需浮点渲染目标，并具有原生 `Float16Array` 和 `structuredClone`。

### 安装

在使用项目目录中任选 npm 或 pnpm：

```bash
npm install bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

```bash
pnpm add bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

两种命令安装同一个包。Cesium 与应用共享，three（`>=0.160.1`）作为运行依赖自动安装；应用可以在上述范围内锁定已经验证的版本。

engine 与 widgets 由 Cesium 自身声明并自动安装，SDK 不要求手动安装或通过 overrides 调整它们。请保留应用锁文件，并在升级后验证完整依赖组合。

> **兼容性提示**：SDK 支持 `cesium@1.142.0`，已验证其与 engine `26.0.0` / widgets `16.0.0` 的组合。Cesium 1.142 使用 `^` 声明内部依赖，重新安装时可能解析到更新的组件；其中 engine `26.4.0` / widgets `16.3.0` 组合在 Vite 8 下存在上游 `MISSING_EXPORT` 问题，不引入本 SDK 也能复现。遇到该错误时，可保留或恢复已验证的完整锁文件，或升级 Cesium（本轮干净安装验证通过 `1.146.0`）。这是特定上游依赖组合的提示，不改变 SDK 的 `>=1.142.0` 支持下限，也不要求使用 overrides。

### 复制资源

插件直接使用宿主的 **`CESIUM_BASE_URL`**。将 `node_modules/bettersky-cesium/dist/assets/` 的全部内容复制到 **Cesium 资源根目录下的 `BetterSkyAssets/`**。以 Vite 项目配置 `CESIUM_BASE_URL='/cesium/'` 为例：

| 来源 | 目标 |
| --- | --- |
| `node_modules/bettersky-cesium/dist/assets/` 内的全部内容 | `public/cesium/BetterSkyAssets/` |
| Cesium 的 `Workers/`、`Assets/`、`ThirdParty/`、`Widgets/` | 沿用项目在 `public/cesium/` 下已有的副本 |

> **提示**：依据许可规则，对外分发 SDK 或其运行产物时，请保留 `LICENSE` 与 `THIRD_PARTY_NOTICES.md` 随副本一并分发。

推荐用 `vite-plugin-static-copy` 在开发和构建时自动复制，无需手动维护 `public/` 下的副本：

```bash
npm install -D vite-plugin-static-copy@4.1.1
```

```js
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // 复制 assets 内的条目，保留 GeospatialAssets/ 子目录。
          src: 'node_modules/bettersky-cesium/dist/assets/**/*',
          dest: 'cesium/BetterSkyAssets',
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
})
```

`assets/**/*` 包含子目录资源；`rename: { stripBase: 4 }` 去掉 `node_modules/bettersky-cesium/dist/assets/` 前缀，同时保留 `GeospatialAssets/` 及其文件。npm 和 pnpm 均使用上述路径，无需访问 `.pnpm/`。CI 构建时也会自动复制；升级时只替换 `BetterSkyAssets/` 并刷新缓存，确保 JavaScript 和资源属于同一版本。

沿用项目已有的 Cesium 资源配置。若项目尚未配置 Cesium 资源，可在同一插件中一并复制：

```js
viteStaticCopy({
  targets: [
    {
      src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}',
      dest: 'cesium',
      rename: { stripBase: 4 },
    },
    // 上面的 BetterSky 资源目标
  ],
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

`dispose()` 可重复调用，也可在资源加载期间调用。请求不会主动取消，销毁后迟到的回调会跳过 GPU 资源创建；创建替代实例前应先销毁旧实例。

效果未显示时，先检查 `CESIUM_BASE_URL + 'BetterSkyAssets/'` 下的资源请求、浏览器控制台及 WebGL 能力；请求应返回真实文件，不能是 HTML 回退页。

### 参数提示与 TypeScript

SDK 随包提供 `dist/index.d.ts`，无需另装类型包。公开声明中的中文 JSDoc 解释各配置项的含义、单位、范围、默认值和联动规则，并为构造器、方法及 setter 提供参数说明。在 VS Code 等支持 TypeScript 语言服务的编辑器中，悬停配置项或查看函数签名即可阅读；JavaScript 项目也可使用这些提示。

```ts
import { BetterSky, type BetterSkyOptions } from 'bettersky-cesium'

const options: BetterSkyOptions = {
  time: undefined, // 显式保留宿主时间；构造时省略此字段会使用内置日期。
  coverage: 0.5, // 云量覆盖度 [0, 1]，与每层云密度分别控制。
  localWeatherVelocity: [0.0003, 0.0001], // 天气纹理 UV/秒，不是米/秒。
  cloud: {
    altitudes: [4000, 6000, 10000, 0], // 三层云底高度（米）及预留项，相对渲染行星表面。
  },
}

const effects = new BetterSky(viewer, options)
effects.update({ cloud: { heights: [1300, 1800, 650, 0] } }) // 局部更新；嵌套对象深合并，数组整体替换。
```

可读取 `BetterSky.defaultOptions` 获取完整默认预设的独立副本。旧 `cloud.haze*` 参数与独立体积光的模式联动、场景设置及销毁约束也在对应声明中说明。

类型声明覆盖以下已有控制，默认设置保持不变：

| 控制项 | 用法与默认值 |
| --- | --- |
| `toneMappingMode` | `2` Reinhard2、`4` Uncharted2、`7` AgX、`8` Neutral、`9` ACES、`10` Linear、`11` Reinhard、`12` Cineon；默认 `9`。历史模式 `3` 当前不支持。 |
| `hbao.denoise` | HBAO 双边滤波，默认 `true`；只在构造时可配置，`update()` 不改变此设置。 |
| `effects.pass.showSnow` / `showRain` | 底层 Pass 的设置入口，默认均为 `false`，显式赋值才开启；设置会重建相关阶段，不作为构造或 `update()` 参数，也不能通过这些访问器读取状态。 |

### 配置快照与资源状态

便捷属性与 `update()` 共用归一化、校验和应用通路。`effects.getOptions()` 返回当前已接受配置的独立副本；修改副本不会改变效果。未知字段、不合法数值以及销毁后修改参数会明确抛错。构造期选项 `hbao.denoise` 在运行期改变时也会抛错，需销毁后重建。

```ts
const options = effects.getOptions()
effects.coverage = 0.5

const unsubscribe = effects.subscribeAssets(() => {
  if (effects.assetStatus === 'error') console.error(effects.assetErrors)
})

await effects.assetsReady // 读取会按需启动并等待六项必需的天空资源，效果关闭时也可以等待。
const requiredErrors = effects.assetErrors.filter(error => error.required)
// 如需在业务的“重试”操作中恢复，可调用 await effects.retryAssets()。

unsubscribe()
```

`assetsReady` 在加载成功、失败或实例销毁时均会结算，需通过 `assetErrors` 判断结果。它不等待按需的雪纹理或 SMAA 查找纹理；可选资源仍可能处于加载或错误状态。失败资源不会逐帧自动重试，已成功资源也不会因显式重试而重复加载。

## 许可

[专有试用许可](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/LICENSE)。目前所有个人和组织均可零费用试用，包括商业项目和生产上线，无须逐一申请。SDK 和接入项目均可闭源。暂未设定收费日期；权利人可提前至少 30 个日历日公布通知，结束指定版本或用途的免费试用，此后继续相应用途须另获授权，授权可以收费。此前合法试用不追溯收费，已有单独授权继续按原约定执行。

允许的应用交付需附带许可和[第三方声明](https://cdn.jsdelivr.net/npm/bettersky-cesium@0.1.0/THIRD_PARTY_NOTICES.md)，并告知接收者试用与未来授权条件。第三方材料继续适用各自原条款，分发限制以完整许可正文为准。许可问题请联系 [iamthek@qq.com](mailto:iamthek@qq.com)。

## 赞助支持

如果这个项目帮到了你，可以请我喝杯咖啡🙏☕ ，你的支持是项目持续维护和改进的动力。

<p align="center">
  <img src="https://iamthek.github.io/buy_me_a_coffee_alipay.jpg" alt="支付宝" width="200" height="300">
  <img src="https://iamthek.github.io/buy_me_a_coffee_wechat.jpg" alt="微信支付" width="200" height="300">
</p>
