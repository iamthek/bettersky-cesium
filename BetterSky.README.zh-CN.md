# BetterSky 使用指南与 API 参考

[English](BetterSky.README.md) | **简体中文** · [项目介绍](README.zh-CN.md)

本文说明 SDK 的接入、配置与使用注意事项。

[使用方式](#使用方式) · [参数说明](#参数说明) · [注意事项](#注意事项)

## 使用方式

### 适用版本

本文说明 BetterSky `0.2.0`。先按下面步骤完成安装和资源配置，需要调整效果时再查参数表。版本变化见[更新记录](CHANGELOG.md)。

### 环境要求

| 项目 | 要求 |
| --- | --- |
| 应用 | 使用 ESM 构建工具的浏览器项目；在客户端创建实例 |
| Cesium | `>=1.142.0`，与业务共用一份依赖 |
| three | `>=0.160.1`，npm 包自动安装的运行时依赖 |
| 场景 | 包含 `globe`，使用 `SceneMode.SCENE3D` 与 `PerspectiveFrustum` |
| 浏览器 / GPU | WebGL 2、三维及数组纹理、浮点和半浮点纹理及对应渲染目标、线性过滤；支持 `Float16Array` 和 `structuredClone` |
| 包安装环境 | npm 包声明 Node.js `>=22.0.0`；具体构建工具还需满足其 Node.js 要求 |
| 仓库 Demo / 开发 | Node.js `>=22.12.0`，建议 Node.js 24；pnpm 12.8.1 |

同页只允许一个活动的 BetterSky 实例。请先销毁旧实例，再创建替代实例。

### 安装

在接入项目中任选一条命令。新项目示例使用已验证的 Cesium 1.146.0 组合；已有项目可以保留其他兼容且验证过的版本：

```bash
npm install bettersky-cesium@0.2.0 cesium@1.146.0
```

```bash
pnpm add bettersky-cesium@0.2.0 cesium@1.146.0
```

包提供具名与默认导出及 `dist/index.d.ts`，无需单独安装类型包。随包声明提供中文字段注释，可在编辑器中查看含义、单位、默认值和约束。

### 资源与部署

SDK 复用宿主的 `CESIUM_BASE_URL`。将 `node_modules/bettersky-cesium/dist/assets/` 内的内容部署到该根目录下的 `BetterSkyAssets/`，与 Cesium 的 `Workers/` 同级：

```text
/cesium/
  Workers/
  Assets/
  ThirdParty/
  Widgets/
  BetterSkyAssets/
    snowCoverMask.png
    GeospatialAssets/
      *.exr
      *.bin
      *.png
```

手动复制时，Vite 项目可放入 `public/cesium/`；`dist/assets/` 的内容对应 `public/cesium/BetterSkyAssets/`，不要再嵌套一层 `assets/`。

推荐用 `vite-plugin-static-copy` 同步开发和生产构建资源：

```bash
npm install -D vite-plugin-static-copy@4.1.1
```

将下面配置合并到接入项目的 Vite 配置；已有 Cesium 资源部署时，仅追加 BetterSky 的复制项：

```js
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const base = '/' // 子路径部署时改为 '/app/'。

export default defineConfig({
  base,
  define: { CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`) },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}/**/*',
          dest: 'cesium',
          rename: { stripBase: 4 },
        },
        {
          src: 'node_modules/bettersky-cesium/dist/assets/**/*',
          dest: 'cesium/BetterSkyAssets',
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
})
```

`stripBase: 4` 去掉来源路径的前四段，保留 `Workers/`、`Assets/`、`GeospatialAssets/` 等内部结构。npm 与 pnpm 使用同样的路径，不访问 `.pnpm/`。开发时由插件提供资源，构建时复制至输出目录。

部署到 `/app/` 时，应用 `base`、服务端挂载路径和 `CESIUM_BASE_URL='/app/cesium/'` 必须一致；效果资源从 `/app/cesium/BetterSkyAssets/` 加载。使用其他服务器或 CDN 时，将 `BetterSkyAssets/` 放在已有 Cesium 资源根目录，跨域请求需允许应用访问。其他构建工具提供等效复制和基址配置即可。

### 初始化与更新

应用已经创建 `viewer` 后，在客户端接入：

```js
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { BetterSky } from 'bettersky-cesium'

const effects = new BetterSky(viewer, {
  time: undefined, // 保留业务时间。
  coverage: 0.5,
  cloud: { densityScales: [0.12, 0.09, 0.0015, 0] },
})

effects.update({ cloud: { heights: [1300, 1800, 650, 0] } })
effects.enabled = false
effects.enabled = true
```

`new BetterSky(viewerOrScene, options?)` 接受 Viewer 或 Scene。传入 Scene 时不设置 Viewer 时钟。实例自动注册渲染阶段与逐帧更新，不需要再次添加 `effects.stage` 或手动调用底层更新。

构造参数合并默认值，`update()` 合并已有配置；嵌套对象逐字段合并，数组整体替换。未传字段保持原值；除 `time` 外会把显式 `undefined` 当作省略，`null` 仅用于明确支持它的字段。非法字段和值会在参数校验阶段拒绝。

### 配置快照与资源加载

`BetterSky.defaultOptions` 返回独立的默认预设副本；`effects.getOptions()` 返回独立的已接受配置快照，修改快照不会改变实例。向量在快照中统一为数组，高级 Pass 的直接修改不会同步到快照。

```js
const current = effects.getOptions()
console.log(current.coverage)

const unsubscribe = effects.subscribeAssets(() => {
  if (effects.assetStatus === 'error') console.error(effects.assetErrors)
})

await effects.assetsReady
if (effects.assetStatus !== 'disposed') {
  const errors = effects.assetErrors.filter(item => item.required)
  if (errors.length > 0) console.error('天空资源加载失败', errors)
}

// 在界面上的重试操作中调用；完成后仍需检查 assetErrors。
// await effects.retryAssets()

// 离开页面时取消监听。
unsubscribe()
```

读取 `assetsReady` 会启动并等待六项必需的天空资源任务，即使 `enabled: false`。成功、失败或销毁都会正常结算；加载失败不会使 Promise reject，应检查 `assetErrors`。它不等待可选雪纹理或 SMAA 查找纹理。Promise 结束时，雪纹理可能仍在加载；SMAA 不计入这些状态。它与 Cesium 阶段的就绪状态分别判断。

`assetStatus` 可为 `idle`、`loading`、`ready`、`error`、`disposed`。可选资源失败也可能显示 `error`；每个错误包含 `id`、`url`、`required` 和原始 `error`。`retryAssets()` 显式重试已失败资源，不重新加载成功项；失败不会每帧自动重试。`subscribeAssets(listener)` 返回取消订阅函数，回调不接收参数，在回调内读取状态。

### 运行时 API

| API | 读写方式 / 用途 |
| --- | --- |
| `BetterSky.defaultOptions` | 静态 getter，返回新的默认配置副本。 |
| `effects.update(options)` | 与便捷 setter 共用校验和应用通路；未知字段或不合法值在提交前拒绝。 |
| `effects.getOptions()` | 返回当前已接受配置的独立快照；HBAO 关闭时保留其内部参数供重开恢复。 |
| `effects.assetStatus` / `effects.assetErrors` | 天空资源的状态与只读错误快照。 |
| `effects.assetsReady` | 读取会按需启动并等待六项必需资源；失败或销毁也结算，不包含 SMAA 和可选雪任务。 |
| `effects.retryAssets()` / `effects.subscribeAssets(listener)` | 显式重试失败资源；订阅变化并获得取消订阅函数。 |
| `effects.enabled` | 读取/设置管线总开关。 |
| `effects.coverage` | 读取/设置天气覆盖度。 |
| `effects.toneMappingExposure` | 读取/设置曝光倍率。 |
| `effects.toneMappingMode` | 仅 setter，切换模式会重建天空渲染阶段。 |
| `effects.localWeatherVelocity` | 仅 setter，接受数组或 Cartesian2。 |
| `effects.setCloudAltitudes(value)` | 设置四分量云底高度。 |
| `effects.setCloudHeights(value)` | 设置四分量云层厚度。 |
| `effects.setCloudDensityScales(value)` | 设置四分量云密度。 |
| `effects.setCloudShapeDetailAmounts(value)` | 设置四个 [0, 1] 范围内的细节侵蚀量。 |
| `effects.hbaoEnabled` / `effects.smaaEnabled` | 读取/设置可选效果。 |
| `effects.hbaoIntensity` / `effects.hbaoMaxRadius` | 仅 setter，设置 AO 强度/半径。 |
| `effects.pass` | getter，获取底层 GeospatialPipelinePass，供高级操作。 |
| `effects.stage` | getter，获取当前天空 PostProcessStageComposite；阶段重建后需重新读取。 |
| `effects.dispose()` | 幂等移除逐帧监听和注册的阶段，恢复快照中的天空/地球字段，并清理实例拥有的 pass 资源。 |

### 常用配置

分别调整地表与云体补光，避免只提高全局曝光：

```js
effects.update({
  irradianceScale: 0.15,
  aerialPerspectiveStrength: 0.2,
  volumetricLight: { mode: 'volumetric', intensity: 2 },
  cloud: { skyIrradianceScale: 1.8, groundIrradianceScale: 1.3 },
})
```

降低体积光质量、提前简化远景云并关闭 AO：

```js
effects.update({
  volumetricLight: { mode: 'volumetric', quality: 'low' },
  cloud: { lodRange: [120000, 300000] },
  hbao: false,
})
```

分别控制太阳时间和天气移动：

```js
effects.update({ time: '2026-05-01T06:00:00Z' })
viewer.clock.shouldAnimate = false
effects.localWeatherVelocity = [0, 0]
```

暂停 Viewer 时钟不会暂停天气图移动；天气速度单位为 UV/秒，不是米/秒。底层云形或细节的其他运动也不受此天气图开关统一控制。

### 高级 Pass 控制

通常优先使用 `update()`。`effects.pass` 提供以下公开高级成员，直接修改不会同步配置快照，也不保证执行顶层参数校验：

| 成员 | 读写方式与用途 |
| --- | --- |
| `stage`、`ready`、`name` | 只读阶段引用、阶段就绪状态和名称；`ready` 不表示所有异步资源就绪。 |
| `enabled` | 读写天空 Pass 开关；需要联动 HBAO / SMAA 时使用 `effects.enabled`。 |
| `coverage`、`toneMappingExposure` | 读写覆盖度 / 曝光；优先使用顶层同名入口以保持配置与云历史一致。 |
| `toneMappingMode` | 仅写，支持上方色调模式；赋值会重建阶段。 |
| `localWeatherVelocity` | 读写 `Cartesian2`，单位 UV/秒。 |
| `aerialPerspectiveStrength` | 读写大气透视强度，`[0, 1]`。 |
| `cloudAltitudeFadeRange` | 读写高度范围或 `null`，单位与 `cloud.altitudeFadeRange` 一致。 |
| `setVolumetricLightOptions(options)` | 局部更新体积光，接受 `BetterSkyVolumetricLightOptions`，优先使用顶层 `update()`。 |
| `showSnow`、`showRain` | 仅写 boolean，默认均为 `false`；开启积雪或雨条纹 / 闪光，会重建相关阶段。 |
| `isDestroyed()` | 返回是否已销毁。 |

```js
effects.pass.showSnow = true
effects.pass.showRain = true
```

雨雪不属于构造 / `update()` 的顶层参数，这两个 setter 也不能用来读取当前开关状态。积雪依赖 `BetterSkyAssets/snowCoverMask.png`。

### 销毁

```js
effects.dispose()
viewer.destroy() // 仅在应用也需要销毁 Viewer 时调用。
```

先销毁效果，再销毁宿主 Viewer。`dispose()` 可重复调用；也支持加载期间销毁，请求不会主动中止，迟到回调会跳过 GPU 创建。资源状态与配置快照仍可读取，销毁后禁止更新参数或重试加载。

## 参数说明

下列默认值对应 0.2.0 的 `BetterSky.defaultOptions`。数值均须有限，`NaN` 与无穷大无效。除 `hbao.denoise` 仅构造时设置外，下列配置均支持 `update()`；场景和时间参数按各自规则生效。

### 通用参数

| 参数 | 类型 | 默认值 | 含义与范围 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 效果总开关，联动已配置的 HBAO、SMAA 和体积光；关闭后保留资源。 |
| `coverage` | number | `0.34` | 整体天气覆盖度 `[0, 1]`，与各层密度分别控制。 |
| `localWeatherVelocity` | 二维向量 | `[0.0003, 0.0001]` | 天气图 UV 每秒偏移量，负值反向，`[0, 0]` 停止天气图移动。 |
| `toneMappingMode` | number | `9` | `2` Reinhard2、`4` Uncharted2、`7` AgX、`8` Neutral、`9` ACES、`10` Linear、`11` Reinhard、`12` Cineon；切换会重建天空阶段。模式 `3` 不支持。 |
| `toneMappingExposure` | number | `2.8` | 非负亮度倍率，越大越亮；单位不是 EV。 |
| `irradianceScale` | number | `0.15` | 非负地表辐照度增益，与云体补光分别控制。 |
| `aerialPerspectiveStrength` | number | `0.15` | 地表大气透视混合强度 `[0, 1]`；`0` 关闭此混合。 |
| `darkParamY` | number | `0.5` | 夜间天空辉光调制系数；允许有限数，建议 `[0, 1]`。 |
| `bloomIntensity` | number | `0.002` | 非负泛光强度，`0` 移除此强度贡献，不释放对应阶段。 |
| `systemLight` | boolean | `true` | 跟随 Cesium 太阳方向；建议保持 `true`，详见注意事项。 |
| `applySceneSettings` | boolean | `true` | 控制本次调用是否应用场景设置，详见场景设置与销毁。 |
| `highDynamicRange` | boolean | `true` | 场景 HDR，受本次 `applySceneSettings` 控制。 |
| `logarithmicDepthBuffer` | boolean | `true` | 场景对数深度，受本次 `applySceneSettings` 控制。 |
| `gamma` | number | `2.2` | 正数，场景显示 Gamma，与 HBAO 的 Gamma 分别控制。 |
| `hbao` | boolean / object | 下方 HBAO 参数对象 | `false` 关闭；`true` 启用；对象覆盖指定数值并启用。重开会恢复保存的数值。 |
| `smaa` | boolean | `true` | 最终画面的 SMAA 抗锯齿。 |
| `time` | string / null / undefined | `"2026-05-01T06:00Z"` | 有效 ISO 8601 时间；`Z` 表示 UTC。构造时省略会采用预设时间，显式 `null` / `undefined` 保留业务时钟；`update()` 省略也保留时钟。只传 Scene 时无效。 |

### 云层与可见性

二维向量接受 `[x, y]` 或 Cesium `Cartesian2`；四维向量接受 `[第一层, 第二层, 第三层, 预留]` 或 `Cartesian4`，第四项约定保持 `0`。云底相对渲染行星表面，不是相对各处地形的离地高度。默认前两层投射云影，云型选择不改变投影层。

| 参数 | 类型 | 默认值 | 含义与范围 |
| --- | --- | --- | --- |
| `cloud.layerTypes` | 三项数组 / null | `["cumulus", "altocumulus", "cirrus"]` | 每项可选 `cumulus` 积云、`altocumulus` 高积云、`cirrus` 卷云；`null` 使用通用云形。 |
| `cloud.altitudes` | 四维向量 | `[4000, 6000, 10000, 0]` | 云底高度，单位米，各分量为有限数。 |
| `cloud.heights` | 四维向量 | `[1300, 1800, 650, 0]` | 非负云层厚度，单位米；云顶 = 云底 + 厚度。 |
| `cloud.densityScales` | 四维向量 | `[0.12, 0.09, 0.0015, 0]` | 非负云密度倍率；`0` 移除对应层介质。 |
| `cloud.shapeDetailAmounts` | 四维向量 | `[0.18, 0.12, 0, 0]` | 各分量 `[0, 1]`，越大云边缘越破碎。 |
| `cloud.lodRange` | 两项数组 / null | `[200000, 500000]` | 距相机的细节近、远阈值，单位米，`0 ≤ near < far`；`null` 关闭距离细节分级。 |
| `cloud.altitudeFadeRange` | 两项数组 / null | `[30000, 90000]` | 相机椭球高度淡出范围，单位米，`0 ≤ start < end`；联动云、云影及相关光束，`null` 关闭淡出。 |
| `cloud.skyIrradianceScale` | number | `1.8` | 非负天空补光倍率，影响云体及 legacy haze。 |
| `cloud.groundIrradianceScale` | number | `1.3` | 非负云体地面反射补光倍率，与 `irradianceScale` 分别控制。 |

距离细节分级不移动云层，也不关闭相机高度淡出。默认在相机高度达到 90 km 时云完全淡出；需要高空仍显示云时可调整范围或传 `null`。

### 体积光

`volumetricLight.mode` 可选 `volumetric`（默认独立体积光）、`legacy`（旧 haze 参数）或 `off`（关闭这两种额外体积光）。大气、云体光照、泛光与镜头光晕仍分别控制。

| 参数 | 类型 | 默认值 | 含义与范围 |
| --- | --- | --- | --- |
| `volumetricLight.mode` | string | `"volumetric"` | `"volumetric"`、`"legacy"` 或 `"off"`。 |
| `volumetricLight.density` | number | `0.000008` | 非负消光密度，单位为米的倒数；`0` 移除此介质。 |
| `volumetricLight.intensity` | number | `2` | 非负散射亮度倍率；`0` 移除散射亮度，仍保留介质消光。 |
| `volumetricLight.layerDepth` | number | `2400` | 最低有效投影云层云底向下的体积层厚度，正数，单位米；底部最低到渲染行星表面。 |
| `volumetricLight.maxDistance` | number | `16000` | 最大观察距离，正数，单位米，受地形与行星遮挡限制。 |
| `volumetricLight.anisotropy` | number | `0.55` | 前向散射偏好 `[0, 0.9]`；`0` 为各向同性，越大越集中于朝太阳的视角。 |
| `volumetricLight.quality` | string | `"balanced"` | `"low"`、`"balanced"` 或 `"high"`；质量越高，GPU 与显存开销通常越大。 |

体积层默认位于 1600–4000 m 的行星高度范围，不跟随地形起伏。`layerDepth` 和 `maxDistance` 控制受影响的空气范围，`density` 控制浓度，`intensity` 控制亮度。需要完全关闭额外体积光时使用 `mode: "off"`。切换质量会重新分配相关资源；切至 `legacy` / `off` 会释放独立体积光的离屏资源。

显式传入的 `volumetricLight.mode` 在本次构造或更新中优先。若同次调用含任意 `cloud.haze*` 字段且未指定 mode，会自动选择 `legacy`；其他局部更新保留当前模式，切换模式保留原有 haze 参数。

```js
effects.update({ volumetricLight: { mode: 'volumetric', quality: 'low' } })
effects.update({ volumetricLight: { mode: 'off' } })
effects.update({ cloud: { hazeDensityScale: 0.000008 } }) // 切换至 legacy。
```

### Legacy haze

以下字段在 `legacy` 模式控制旧 haze；`cloud.maxShadowLengthRayDistance` 同时用于大气阴影长度限制。新接入优先使用 `volumetricLight`。

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cloud.hazeDensityScale` | number | `0.000008` | 非负介质密度；0 移除额外 haze 贡献。 |
| `cloud.hazeCloudAttached` | boolean | `true` | true 在云底下方的世界空间局部薄层积分，可独立开启近地雾；false 使用指数高度雾。 |
| `cloud.hazeGroundDensityScale` | number | `0` | 局部模式近地密度倍率 [0, 1]；0 仅保留云底光束，1 恢复完整近地层。 |
| `cloud.hazeViewDistance` | number | `16000` | 局部薄层的最大观察距离，正有限米数。 |
| `cloud.hazeVolumeLength` | number | `1200` | 局部薄层累计介质光路上限，正有限米数；空隙不计入长度。 |
| `cloud.hazeDirectLightScale` | number | `8` | 非负太阳直射散射增益，与介质消光分别控制。 |
| `cloud.hazeQuality` | string | `"high"` | 积分样本预算 / 云影滤波采样数：low = 16 / 1；balanced = 24 / 2；high = 32 / 4。 |
| `cloud.hazeHeightFalloff` | number | `1200` | 正有限高度尺度，单位米：用于指数高度衰减或局部薄层厚度控制。 |
| `cloud.hazeAnisotropy` | number | `0.55` | 前向散射偏好 [0, 0.9]；0 为各向同性。 |
| `cloud.maxShadowLengthRayDistance` | number | `6000` | 大气阴影长度积分上限，正有限米数；指数模式下同时限制 haze 光路。 |
| `cloud.hazeSunColor` | array | `[1, 0.78, 0.42]` | 三个非负线性 RGB 倍率，不是 0–255 的 sRGB 值。 |

Haze 还受相机高度淡出后的有效云覆盖度调制：覆盖度 ≤ 0.2 时贡献为零，0.2–0.4 之间逐步增强。局部模式要求前两层中至少有一层有效且参与云影投射，单纯增加 haze 密度不能绕过这些条件。


### 云体降噪

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cloud.denoise.temporalAlpha` | number | `0.04` | 当前帧权重 [0, 1]；越小越依赖历史，降噪更强。 |
| `cloud.denoise.currentFrameAlpha` | number | `0.08` | 新采样像素的当前帧权重 [0, 1]；越大新细节越快生效，也更易显露噪声。 |
| `cloud.denoise.motionAlpha` | number | `0.25` | 相机运动时用于提高积累基值，范围 [0, 1]；最终混合权重仍会自适应调整。 |
| `cloud.denoise.varianceGamma` | number | `2` | 正有限方差裁剪倍率；越大允许保留的历史颜色范围越宽。 |
| `cloud.denoise.spatialFilterStrength` | number | `0.8` | 深度/透明度感知重建强度 [0, 1]；越大越平滑，也会损失更多细节。 |

增强历史依赖可以减少噪点，但可能增加拖影；增强空间过滤会柔化细节。SMAA 负责最终画面的边缘，不替代云体降噪。

`cloud.denoise` 作用于云体与 legacy haze，不调节独立体积光的降噪。

### HBAO

默认开启，使用下表数值和 `denoise: true`。构造时 `hbao: true` 使用默认值，对象局部覆盖；运行时 `false` 关闭并保留数值，`true` 重开，对象局部更新并启用。

| 参数 | 类型 | 默认值 | 含义与范围 |
| --- | --- | --- | --- |
| `hbao.intensity` | number | `100` | 非负遮蔽强度指数，越大接触阴影越深。 |
| `hbao.maxRadius` | number | `30` | 非负采样半径，单位米，过大可能出现暗边。 |
| `hbao.bias` | number | `0.1` | 有限角度偏移，单位弧度；增大可减轻自遮蔽。 |
| `hbao.frustumLength` | number | `100000` | 正数，最大处理深度，单位米。 |
| `hbao.blackPoint` | number | `0.05` | 输入黑点，`[0, 1)`。 |
| `hbao.whitePoint` | number | `0.9` | 非负输出亮度倍率。 |
| `hbao.gamma` | number | `2.5` | 正数，AO 曲线幂指数，与场景 `gamma` 分别控制。 |
| `hbao.denoise` | boolean | `true` | 双边滤波开关，仅构造时配置；运行时更改需销毁并重建。 |

`BetterSkyUpdateOptions` 从类型上排除 `hbao.denoise`；JavaScript 运行时也会拒绝更改它，重复当前值不会报错。

### TypeScript 类型

`BetterSkyOptions` 用于构造参数；`BetterSkyUpdateOptions` 用于局部更新。其他公开类型包括 `BetterSkyVector2`、`BetterSkyVector4`、`BetterSkyQuality`、`BetterSkyCloudType`、`BetterSkyToneMappingMode`，以及云、降噪、体积光、HBAO 的 Options 接口和 `BetterSkyPass`。包还提供 `BetterSkyAssetStatus`、`BetterSkyAssetError` 与 `BetterSkyConstructor`。以所安装包附带的声明为准。

```ts
import { BetterSky, type BetterSkyOptions } from 'bettersky-cesium'

const options: BetterSkyOptions = {
  time: undefined,
  cloud: { altitudes: [4000, 6000, 10000, 0] },
}
const sky = new BetterSky(viewer, options)
```

## 注意事项

### 场景设置与销毁

| 时机 | 对宿主的影响 |
| --- | --- |
| 构造且 `applySceneSettings: true` | 设置 HDR、对数深度、Gamma，并启用地形深度测试。 |
| 构造 / 更新且提供有效 `time` | 修改 Viewer 时钟；仅传 Scene 不生效。 |
| 首次启用的帧 | 暂时接管内置天空、大气、太阳、雾及部分地球设置；设置瓦片缓存为 2000、最大屏幕空间误差为 2。 |
| 关闭 / 销毁 | 恢复启用时记录的天空与地球设置。 |
| `update()` | 除非本次显式带 `applySceneSettings: false`，否则应用本次提供的 HDR、对数深度与 Gamma。 |

`applySceneSettings: false` 不阻止天空接管，也不阻止修改时间。构造时设置为 `false` 不会自动约束后续更新；需要保持业务场景设置时，每次相关更新都应显式传入。

时钟、HDR、Gamma、对数深度及地形深度测试不会在关闭 / 销毁时自动还原，业务若需要恢复，应自行保存原值。销毁会释放实例拥有的渲染资源，但不移除已安装的上下文辅助方法；不要继续使用缓存的 Pass 或阶段引用。

### 持续渲染与性能

建议使用 `requestRenderMode: false`。采用显式渲染模式时，业务必须持续请求新帧以驱动云动画与画面稳定；SDK 不会调度 `scene.requestRender()`。

先控制业务绘制缓冲大小，再按场景降低 `volumetricLight.quality`、关闭不需要的 HBAO / SMAA，或提前设置 `cloud.lodRange`。保留适合业务的高度淡出范围。关闭总开关仅暂停效果，释放资源需要 `dispose()`。

曝光和云补光调整亮度；密度、层厚与距离会同时改变体积感。频繁重建实例、切换色调模式或大幅更新云 / 光照参数会影响画面稳定性与开销。云体降噪参数在平滑、细节与运动拖影之间取舍，不控制独立体积光的历史。

### 兼容性与部署

依赖范围表示支持下限，不代表每个更新的依赖组合都已测试。以下 Cesium 组合已经核对：

| Cesium | engine / widgets | 结果 |
| --- | --- | --- |
| `1.142.0` | `26.0.0` / `16.0.0` | 已验证可用的锁定基线。 |
| `1.142.0` | `26.4.0` / `16.3.0` | 上游缺失导出，干净安装后即使只导入 `Cartesian2` 也可能构建失败。 |
| `1.146.0` | `26.4.0` / `16.3.0` | 已验证可用的干净安装组合，本文示例采用此版本。 |

保留并提交完整锁文件。即使 Cesium 顶层版本相同，无锁安装也可能解析到不同的内部组件。不要为了掩盖上述不兼容组合，手动添加 engine/widgets 或设置 overrides；这一问题也不意味着提高 BetterSky 的 Cesium 支持下限。

SDK 使用 Cesium 渲染器内部接口。升级 Cesium 或 three 后，应验证初始化、参数更新、尺寸变化和销毁重建。示例只是已验证的版本，不代表当前最新版本。

仅在受支持的三维透视场景使用，切换到 2D / Columbus View 前先销毁效果；SSR 页面应在客户端挂载后初始化。屏幕空间反射与次表面散射不属于当前支持功能。保持 `systemLight: true`；`false` 仅让部分效果采用业务写入 `scene.context.uniformState.sunDirectionWC2` 的自定义太阳方向，云和云影仍跟随 Cesium 太阳。该开关不提供统一的业务光照 API。

资源请求应返回实际文件，不能被单页应用的 HTML 回退覆盖。0.2.0 采用 Apache License 2.0，第三方材料遵循各自许可。升级时同步更新 JS 与 `BetterSkyAssets/` 并刷新旧缓存。对外分发 SDK 运行产物时附带 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，遵循完整许可条款。

### 常见问题

| 现象 | 检查项 |
| --- | --- |
| 天空或云不显示 | 检查控制台、WebGL 能力，以及 `CESIUM_BASE_URL` 下的 EXR / BIN / PNG 请求、目录大小写和响应内容。 |
| 拉远后云消失 | 检查 `cloud.altitudeFadeRange`；默认相机高度到 90 km 时完全淡出。 |
| 体积光很弱 | 检查 mode、有效投影云层、太阳与视角，以及 density / intensity / layerDepth / maxDistance。面向太阳和云隙更易看到光束。 |
| Legacy haze 不出现 | 有效覆盖度 ≤ 0.2 时无贡献；局部模式还需前两层中至少有一个有效投影云层。 |
| 光束变成大范围雾感 | 降低密度、层厚或距离，单独调整亮度；检查云是否形成明暗间隙。 |
| 太阳附近的光环仍存在 | 镜头光晕与体积光分别控制，关闭体积光不关闭镜头光晕。 |
| 第三层不投射云影 | 默认只有前两层参与投影，更改云型不改变该设置。 |
| 初次启用时 SMAA 尚未生效 | 查找纹理异步加载，首帧和 `assetsReady` 都不能代表 SMAA 就绪。 |
| 暂停时间后云仍移动 | 单独设置 `localWeatherVelocity: [0, 0]`，其他底层运动控制分别处理。 |
| 调用资源状态或快照 API 报错 | 确认所安装的 SDK 版本。销毁后仍可读取快照与资源状态，但不能更新参数或重试加载。 |
| Demo 底图或地形不符合预期 | 未配置服务凭据时使用本地 NaturalEarthII 底图和椭球地形，详见 [Demo 说明](demo/README.md)。 |
