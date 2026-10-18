# EffectPipeline 使用说明

[English](EffectPipeline.README.md) | **简体中文** · [项目介绍](README.zh-CN.md)

本文介绍如何运行示例、接入已有 Cesium 场景、配置效果及管理生命周期。

## 环境要求

| 依赖 | 仓库配置 |
| --- | --- |
| Node.js | 22 或更高版本 |
| 包管理器 | pnpm 12.8.1 |
| Cesium | 锁文件版本 1.142.0 |
| three | 锁文件版本 0.160.1；纹理加载器与级联阴影的运行时依赖 |
| 示例工具 | 锁文件中的 Vite 6.4.3、vite-plugin-static-copy 2.3.2 |
| 浏览器 / GPU | 支持 WebGL 2、三维/数组纹理、浮点渲染目标的现代浏览器，同时需要原生 `Float16Array` 和 `structuredClone` |

使用一个 EffectPipeline 实例管理一个包含地球的 Viewer，目标场景为三维透视模式。渲染器内部接口对版本敏感，更换 Cesium 版本需要验证兼容性。

## 运行示例

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

按需填写 `.env.local`：

```dotenv
VITE_CESIUM_ION_TOKEN=你的_Cesium_Ion_token
VITE_TIANDITU_TOKEN=你的_天地图_key
```

留空会使用相应的回退配置：没有天地图 key 时使用本地 NaturalEarthII 底图，没有 Ion token 时使用椭球地形。全球地形异步加载，失败后继续使用椭球地形。

`.env.local` 已被 Git 忽略。`VITE_` 变量会写入浏览器代码，仅填写客户端服务凭据；修改后需重启开发服务。

```bash
pnpm dev
```

打开 Vite 输出的地址，通常为 [http://localhost:3000/](http://localhost:3000/)。3000 端口被占用时会选择其他端口。示例包含参数控件、帮助说明、重置按钮及时间轴；可以在浏览器控制台访问 `window.viewer` 和 `window.fx`。

```bash
pnpm build    # 将示例构建到 dist/
pnpm preview  # 预览 dist/，以终端输出地址为准
```

示例会调整 `viewer.resolutionScale`，将大窗口的绘制缓冲限制在约 400 万像素。自行接入 SDK 的应用需要管理自己的整体渲染分辨率。

## 接入其他项目

当前仓库以源码模块形式提供 SDK。复制 `EffectPipeline.js`、完整 `Library/` 目录及 `static/EffectPipelineAssets/`，保留相对路径。

着色器源码位于 `Library/shaders/`，通过 Vite 的 `?raw` 导入为字符串，例如从项目根目录的模块中使用 `import shaderSource from './Library/shaders/geospatial/cloudsMaterial.frag.glsl?raw'`。接入 Vite 项目无需额外 GLSL 插件；复制库时必须包含该目录。其他构建工具需要提供等效的原文字符串导入支持。

安装与仓库一致的依赖版本：

```bash
pnpm add cesium@1.142.0 three@0.160.1
```

### 部署静态资源

将 `CESIUM_BASE_URL` 指向部署后的 Cesium 资源根目录。仓库使用 `/cesium/`，结构如下：

```text
/cesium/
  Workers/
  Assets/
  ThirdParty/
  Widgets/
  EffectPipelineAssets/
    snowCoverMask.png
    ...其他效果资源
    GeospatialAssets/
      *.exr
      *.bin
      *.png
```

前四个目录来自 `node_modules/cesium/Build/Cesium/`；将完整 `static/EffectPipelineAssets/` 复制到它们旁边。`GeospatialAssets` 的拼写及大小写必须一致，里面包含大气查找表、三维噪声和天气纹理。

本仓库的 [Vite 配置](vite.config.js) 已完成资源服务与复制。其他 Vite 项目需安装 `vite-plugin-static-copy`，并将等效设置合并到已有配置：

```js
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium/"),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}",
          dest: "cesium",
        },
        {
          src: "static/EffectPipelineAssets",
          dest: "cesium",
        },
      ],
    }),
  ],
});
```

部署到子路径时，需要同步调整资源 URL 与服务端目录。其他打包工具也应提供等效的资源目录和基础 URL。

### 接入 Viewer

在应用入口引入 Cesium 控件样式。创建 Viewer 后接入：

```js
import "cesium/Build/Cesium/Widgets/widgets.css";
import { EffectPipeline } from "./EffectPipeline.js";

const fx = new EffectPipeline(viewer, {
  time: undefined, // 保留业务当前的时钟时间。
});

fx.update({
  coverage: 0.45,
  volumetricLight: { quality: "balanced" },
});
```

`new EffectPipeline(viewer)` 会应用完整内置预设，包括预设的固定时钟时间。也可传入 `viewer.scene`，此时时钟设置无效。

建议保持 `requestRenderMode: false`，让云动画和时域重建持续获得新帧。若应用采用显式渲染模式，需要自行持续调用 `scene.requestRender()`，并在参数变化后请求一帧；SDK 不会调度这些请求。

## 参数配置

`new EffectPipeline(viewerOrScene, options?)` 将参数合并到内置默认值。嵌套对象逐字段合并，数组整项替换，只需传入想修改的字段。

合并时会保留显式传入的 `false`、`null` 和 `undefined`，具体含义取决于参数。例如 `time: undefined` 保留 Viewer 时钟；下文支持空值的云参数通过 `null` 关闭对应模式。

```js
const defaults = EffectPipeline.defaultOptions; // 独立的默认配置副本。
const fx = new EffectPipeline(viewer, {
  time: undefined,
  coverage: 0.5,
  cloud: { denoise: { motionAlpha: 0.4 } },
  hbao: false,
});
```

下列默认值来自公开入口 [EffectPipeline.js](EffectPipeline.js)，会覆盖部分底层 pass 的默认配置。

### 通用参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 启用管线；运行时切换同时控制 HBAO 和 SMAA。 |
| `coverage` | number | `0.34` | 天气覆盖度 [0, 1]，与云层密度分别控制。 |
| `localWeatherVelocity` | array / Cartesian2 | `[0.0003, 0.0001]` | 天气图 UV 每秒偏移量；负值反向。 |
| `toneMappingMode` | number | `9` | 2/3 Reinhard2；4 Uncharted2；7 AgX；8 Neutral；9 ACES；10 Linear；11 Reinhard；12 Cineon。切换会重建天空渲染阶段。 |
| `toneMappingExposure` | number | `2.8` | 色调映射前的亮度倍率，不是 EV 档位。 |
| `irradianceScale` | number | `0.15` | 非负地表辐照度增益。 |
| `aerialPerspectiveStrength` | number | `0.15` | 地表大气透视混合强度 [0, 1]；0 关闭此混合。 |
| `darkParamY` | number | `0.5` | 夜间天空辉光调制，白天通常不明显。 |
| `bloomIntensity` | number | `0.002` | 泛光强度；0 移除此贡献，但不是关闭渲染阶段的开关。 |
| `systemLight` | boolean | `true` | 建议保持 true 以统一使用 Cesium 太阳；false 仅切换部分管线的自定义太阳 uniform，详见高级说明。 |
| `applySceneSettings` | boolean | `true` | 初始化时设置 HDR、对数深度、gamma 和地形深度测试，详见下方场景行为。 |
| `highDynamicRange` | boolean | `true` | 场景 HDR，受 applySceneSettings 控制。 |
| `logarithmicDepthBuffer` | boolean | `true` | 场景对数深度，受 applySceneSettings 控制。 |
| `gamma` | number | `2.2` | 场景显示 gamma，受 applySceneSettings 控制。 |
| `hbao` | boolean / object | 下方参数对象 | false 关闭 AO；对象覆盖下方 HBAO 参数。 |
| `smaa` | boolean | `true` | 最终画面的 SMAA 抗锯齿。 |
| `time` | string / null / undefined | `"2026-05-01T06:00Z"` | 通过 ISO 8601 设置 Viewer 时钟；null 或 undefined 保留当前时间。只传 Scene 时不设置时钟。 |

### 云层与可见性

四分量云参数采用 `[第一层, 第二层, 第三层, 预留]`，第四项保持为 0。云底以渲染行星表面为基准，不是相对各处地形的离地高度。默认只有前两层投射云影，更改云型不会改变该阴影掩码。

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cloud.layerTypes` | array / null | `["cumulus", "altocumulus", "cirrus"]` | 必须为三个云型，每项可选 cumulus、altocumulus、cirrus；null 使用通用噪声云形。 |
| `cloud.altitudes` | array / Cartesian4 | `[4000, 6000, 10000, 0]` | 相对渲染行星的云底高度，单位米。 |
| `cloud.heights` | array / Cartesian4 | `[1300, 1800, 650, 0]` | 云层厚度，单位米；云顶 = 云底 + 厚度。 |
| `cloud.densityScales` | array / Cartesian4 | `[0.12, 0.09, 0.0015, 0]` | 云层密度倍率；0 移除对应层介质。 |
| `cloud.shapeDetailAmounts` | array / Cartesian4 | `[0.18, 0.12, 0, 0]` | 四个 [0, 1] 数值；越大细节侵蚀越强。 |
| `cloud.lodRange` | array / null | `[200000, 500000]` | 距相机的近/远阈值，单位米，0 ≤ 近 < 远；null 禁用距离 LOD，不改变云的位置。 |
| `cloud.altitudeFadeRange` | array / null | `[30000, 90000]` | 相机椭球高度淡出范围，单位米，0 ≤ 开始 < 结束；null 禁用。 |
| `cloud.skyIrradianceScale` | number | `1.8` | 非负天空补光增益，作用于云体及额外 haze 介质。 |
| `cloud.groundIrradianceScale` | number | `1.3` | 非负的云体地面反射补光增益，与 irradianceScale 分别控制。 |

距离 LOD 调整采样与细节质量；相机高度淡出则联动改变云、云影及相关光束的可见性，到结束高度后还会跳过云体和云影绘制。两者分别生效，关闭距离 LOD 也不会关闭所有基于像素覆盖范围的纹理过滤。

### 体积光与旧 haze

`volumetricLight.mode` 选择两条互斥路径之一：默认 `"volumetric"` 使用独立的低分辨率体积光 pass 及其时域历史；`"legacy"` 使用现有 `cloud.haze*` 积分；`"off"` 关闭两条额外体积光路径。全局 `enabled` 开关也会控制体积光渲染。

| 参数 | 类型 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `volumetricLight.mode` | string | `"volumetric"` | 支持 `"volumetric"`、`"legacy"` 或 `"off"`。 |
| `volumetricLight.density` | number | `0.000008` | 非负有限消光密度，单位为米的倒数；0 移除此介质。 |
| `volumetricLight.intensity` | number | `2` | 非负有限散射亮度倍率；不改变密度或消光。 |
| `volumetricLight.layerDepth` | number | `2400` | 参与投影的云底向下延伸的体积层厚度，正有限米数。 |
| `volumetricLight.maxDistance` | number | `16000` | 最大积分距离，正有限米数；还受场景深度与云前缘限制。 |
| `volumetricLight.anisotropy` | number | `0.55` | 有限前向散射偏好 [0, 0.9]；0 为各向同性。 |
| `volumetricLight.quality` | string | `"balanced"` | 支持 `"low"`、`"balanced"` 或 `"high"`，对应下表预算。 |

| 质量 | 分辨率比例 | 积分步数 | 可见性图尺寸 |
| --- | --- | --- | --- |
| `low` | 0.25 | 24 | 512 × 512 |
| `balanced` | 0.5 | 48 | 1024 × 1024 |
| `high` | 0.5 | 64 | 2048 × 2048 |

更高预算会增加 GPU 工作，这些设置不代表固定帧耗时。修改这些参数会清除独立体积光历史，切换质量会重建对应资源。

兼容判断以每次构造或 `update()` 调用为准：显式传入的 `volumetricLight.mode` 优先，即使同一次调用也包含旧 haze 字段；仅传任意 `cloud.haze*` 字段且没有新 mode 时，自动选择 `"legacy"`。其他局部更新保留当前模式；无参数初始化默认使用 `"volumetric"`。模式切换保留已有 haze 参数值。

```js
fx.update({ volumetricLight: { mode: "volumetric", intensity: 2, quality: "balanced" } });
fx.update({ volumetricLight: { mode: "off" } });
fx.update({ cloud: { hazeDensityScale: 0.000008 } }); // 自动选择 legacy。
fx.update({ volumetricLight: { mode: "legacy" } });  // 使用保留的旧参数。
```

示例 Godray 区域显示当前路径的控制项；`off` 禁用两组数值但保留它们的值。恢复默认值会读取完整内置预设，包括默认体积光模式。

#### 旧 haze

以下参数在 `"legacy"` 模式生效，原有算法及默认值继续兼容旧调用。

局部 haze 分布在前两层有效投影云层云底下方的世界空间区域。默认关闭独立的近地薄雾层，并把累计散射光路限制为 1.2 km。云底区域沿太阳方向投影到云层天气纹理，使低太阳角度的光束仍与云隙对齐。距离参数限制实际采样的介质范围，不会把雾放在相机周围。指数模式则使用随渲染行星表面高度衰减的介质密度。

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

质量档位表示预算，不是固定纹理读取次数；提前退出及级联重叠会影响实际开销。

### 云体降噪

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cloud.denoise.temporalAlpha` | number | `0.04` | 当前帧权重 [0, 1]；越小越依赖历史，降噪更强。 |
| `cloud.denoise.currentFrameAlpha` | number | `0.08` | 新采样 Bayer 相位的当前帧权重 [0, 1]。 |
| `cloud.denoise.motionAlpha` | number | `0.25` | 相机运动时用于提高积累基值，范围 [0, 1]；最终混合权重仍会自适应调整。 |
| `cloud.denoise.varianceGamma` | number | `2` | 正有限方差裁剪倍率；越大允许保留的历史颜色范围越宽。 |
| `cloud.denoise.spatialFilterStrength` | number | `0.8` | 深度/透明度感知重建强度 [0, 1]；越大越平滑，也会损失更多细节。 |

这些是基础控制值，渲染器还会根据历史帧数量、距离、相机运动和地形边界调整混合。增强历史依赖可以减少噪点，但可能增加滞后；增强空间过滤会柔化细节。SMAA 负责最终画面的边缘，不能替代云体时域重建。

### HBAO

默认 `hbao` 是包含下方七个数值参数的对象，底层 pass 默认启用双边滤波。`hbao: false` 关闭效果，`hbao: true` 在构造时采用底层默认参数，传对象则覆盖指定字段。

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `hbao.intensity` | number | `100` | AO 强度指数；越大接触遮蔽越深。 |
| `hbao.maxRadius` | number | `30` | 视空间最大采样半径，单位米。 |
| `hbao.bias` | number | `0.1` | 角度偏移，单位弧度；增大可减少自遮蔽。 |
| `hbao.frustumLength` | number | `100000` | AO 处理的最大视空间深度，单位米。 |
| `hbao.blackPoint` | number | `0.05` | 输入黑点，应小于 1。 |
| `hbao.whitePoint` | number | `0.9` | AO 调制输出亮度倍率。 |
| `hbao.gamma` | number | `2.5` | 正的 AO 曲线幂指数，与场景 gamma 分开。 |
| `hbao.denoise` | boolean | `true` | 双边滤波，仅构造时生效；update() 不会重建此配置。 |

七个数值字段支持 `update()`；`hbao.denoise` 仅构造时生效。

## 运行时 API

通过 `update()` 局部更新配置：

```js
fx.update({
  coverage: 0.4,
  cloud: {
    layerTypes: ["cumulus", "altocumulus", "cirrus"],
    altitudes: [4000, 6000, 10000, 0],
    heights: [1300, 1800, 650, 0],
    densityScales: [0.12, 0.09, 0.0015, 0],
  },
});

fx.update({
  time: "2026-05-01T10:00:00Z",
  toneMappingExposure: 2.5,
});
```

改变云形、密度、覆盖度、云照明或可见性参数时，会按需清除云历史。体积光参数会清除其独立历史。频繁大幅修改可能让时域积累反复重新开始。

| API | 读写方式 / 用途 |
| --- | --- |
| `EffectPipeline.defaultOptions` | 静态 getter，返回新的默认配置副本。 |
| `fx.update(options)` | 应用局部配置中支持的字段。 |
| `fx.enabled` | 读取/设置管线总开关。 |
| `fx.coverage` | 读取/设置天气覆盖度。 |
| `fx.toneMappingExposure` | 读取/设置曝光倍率。 |
| `fx.toneMappingMode` | 仅 setter，切换模式会重建天空渲染阶段。 |
| `fx.localWeatherVelocity` | 仅 setter，接受数组或 Cartesian2。 |
| `fx.setCloudAltitudes(value)` | 设置四分量云底高度。 |
| `fx.setCloudHeights(value)` | 设置四分量云层厚度。 |
| `fx.setCloudDensityScales(value)` | 设置四分量云密度。 |
| `fx.setCloudShapeDetailAmounts(value)` | 设置四个 [0, 1] 范围内的细节侵蚀量。 |
| `fx.hbaoEnabled` / `fx.smaaEnabled` | 读取/设置可选效果。 |
| `fx.hbaoIntensity` / `fx.hbaoMaxRadius` | 仅 setter，设置 AO 强度/半径。 |
| `fx.pass` | getter，获取底层 GeospatialPipelinePass，供高级操作。 |
| `fx.stage` | getter，获取当前天空 PostProcessStageComposite；阶段重建后需重新读取。 |
| `fx.dispose()` | 移除逐帧监听和注册的阶段，并调用 pass 清理。 |

## 常用调整

### 分别调整云光照与地表亮度

```js
fx.update({
  irradianceScale: 0.15,
  aerialPerspectiveStrength: 0.2,
  volumetricLight: { mode: "volumetric", intensity: 2 },
  cloud: {
    skyIrradianceScale: 1.8,
    groundIrradianceScale: 1.3,
  },
});
```

`irradianceScale` 影响地表；两个云体辐照度参数影响云的补光。`volumetricLight.intensity` 调整独立体积光散射；legacy 模式仍通过 `cloud.hazeDirectLightScale` 和 `cloud.hazeSunColor` 控制 haze 日光。曝光改变最终色调映射后的画面。

### 降低渲染开销

```js
fx.update({
  volumetricLight: { mode: "volumetric", quality: "low" },
  cloud: {
    lodRange: [120000, 300000],
  },
  hbao: false,
});
```

此示例让距离简化更早开始，降低独立体积光预算并关闭 AO。应在实际场景中观察细节和明暗变化；包含高空视角的应用可保留相机高度淡出。

### 控制太阳时间与天气移动

```js
fx.update({ time: "2026-05-01T06:00:00Z" });
viewer.clock.shouldAnimate = false;
fx.localWeatherVelocity = [0, 0];
```

Viewer 时钟控制天体时间，天气偏移使用真实经过时间，因此暂停时钟不会自动停止天气移动。最后一行停止天气图偏移；底层 pass 的云形/细节移动速度是另外的高级参数。

## 高级 pass 操作

底层 pass 提供可选的表面积雪覆盖和雨条纹/闪光叠加：

```js
fx.pass.showSnow = true;
fx.pass.showRain = true;
```

这些 setter 会重建相关阶段。积雪使用 `EffectPipelineAssets/snowCoverMask.png`；`showRain` 在场景表面叠加闪光和屏幕雨条纹。它们属于底层 pass 控制，不是 EffectPipeline 的构造参数。

建议保持 `systemLight: true`，让效果使用一致的太阳光源。设为 `false` 后，大气/合成路径会使用自定义太阳 uniform，但云体与云影仍读取 Cesium 系统太阳；这不是统一的自定义光源 API。

## 场景行为与生命周期

管线会应用以下场景设置：

| 时机 | 行为 |
| --- | --- |
| 构造时 `applySceneSettings: true` | 设置 HDR、对数深度与 gamma，并开启 `globe.depthTestAgainstTerrain`。 |
| 构造/更新时传入有效 `time`，且持有 Viewer | 设置 `viewer.clock.currentTime`。 |
| 第一个启用帧 | 快照并接管内置大气、天空盒、太阳、雾、地表大气和地球光照；将地球瓦片缓存设为 2000，最大屏幕空间误差设为 2。 |
| 关闭或销毁 | 恢复上述启用帧快照中记录的天空/地球字段。 |
| `update()` | 应用本次提供的 HDR/对数深度/gamma，除非本次同时传入 `applySceneSettings: false`。 |

`applySceneSettings: false` 不会取消天空/地球接管，也不会阻止设置 `time`；保留时钟需用 `time: undefined`。后续更新若希望跳过本次提供的场景设置，还需在该次更新中传入 `applySceneSettings: false`。

HDR、对数深度、gamma、地形深度测试和时钟不会自动恢复。应用需要时应自行保存和恢复这些值。

```js
fx.enabled = false; // 暂时关闭。
fx.enabled = true;  // 重新开启，云历史会刷新。

// 离开场景时：
fx.dispose();
viewer.destroy();
```

在 `viewer.destroy()` 之前调用 `dispose()`，之后不再使用该实例。销毁不会完整撤销所有辅助方法或 GPU 分配。资源请求是异步的，目前没有公开的取消接口或全部资源就绪 Promise，首次资源加载期间应避免反复创建/销毁实例。

实现会添加 context 辅助方法、使用部分 Cesium 渲染器内部接口，并扩展部分 `Cartesian2/3/4` 与 `Matrix4` 原型方法。HBAO 还有模块级共享状态。当前实现应使用单活动 Viewer、单管线，不支持隔离的并发实例。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| 启动时天空或云缺失、显示异常 | 检查 `/cesium/EffectPipelineAssets/GeospatialAssets/` 下 EXR/BIN 等资源请求、`CESIUM_BASE_URL`、目录大小写及 WebGL 能力；资源异步加载。 |
| 拉远后云消失 | 检查 `cloud.altitudeFadeRange`，默认在相机椭球高度 90 km 时完全淡出；需要时可设为 `null`。 |
| 穿云光很弱或看不到 | 检查 `volumetricLight.mode`、覆盖度、前两层密度/厚度及太阳与观察方向。volumetric 模式检查 `density`、`intensity`、`layerDepth` 和 `maxDistance`；legacy 模式检查 `cloud.hazeDensityScale` 及局部距离范围。 |
| 运动拖影或远景云噪点 | 小幅调整降噪权重，结合像素覆盖范围过滤/LOD，并避免持续重设云参数。 |
| 第三层没有地面云影 | 默认阴影掩码只包含前两层。 |
| 启动后 SMAA 没有立即生效 | 查找纹理异步加载，首个渲染帧不代表资源已经就绪。 |
| 太阳时间暂停但云还在移动 | 天气移动需要与 Viewer 时钟分别控制。 |
| 地形或影像不可用 | 检查示例凭据；凭据留空时会按设计使用本地底图/椭球地形。 |

功能与渲染机制介绍见[项目介绍](README.zh-CN.md)。
