# BetterSky4Cesium

[English](README.md) | **简体中文**

**EffectPipeline** 是 BetterSky4Cesium SDK 的天空渲染管线，作为 CesiumJS 插件，为三维地球场景提供多层体积云、大气散射、云影、体积光和画面增强，并通过统一参数控制这些效果。插件资源直接使用宿主的 `CESIUM_BASE_URL`，放在其下的 `EffectPipelineAssets/` 目录。

[使用说明](EffectPipeline.README.zh-CN.md) · [示例源码](demo-official.js)

**npm SDK 接入规划：**[npm/pnpm 快速开始](START.zh-CN.md)。打包混淆与随包资源部署尚未实施或完成发布验收，目标交付方式见 [SDK 发布方案](SDK_PUBLISH_PLAN.md)；当前源码和示例的使用流程仍见使用说明。

## 核心亮点

- **天空与地表联动。** 云、太阳光、大气透视和地面云影共享场景、深度与光照信息。
- **三层独立云形。** 可组合积云、高积云和卷云，分别控制云底高度、厚度、密度和细节侵蚀。
- **局部光束独立控制开销。** 独立体积光 pass 在云底下方的稀薄介质中积分，结合聚焦云影、独立时域历史和地形感知合成。
- **兼顾近景地形与远处地平线。** 通过时域重建、地形边缘感知和连续细节过滤，改善噪点、拖影与远景闪烁。
- **渲染成本可调。** 距离 LOD、有界光照积分、可选 HBAO/SMAA 和相机高度淡出提供画质调节手段。
- **统一配置入口。** `EffectPipeline` 提供内置预设、局部参数更新和运行时开关；示例页面配有参数面板、逐项说明和时间轴。

## 能实现什么功能

| 功能 | 效果说明 |
| --- | --- |
| 体积云 | 沿球形云层进行光线步进，结合三维云形与细节纹理、天气图移动、云体自阴影及天空/地面补光。 |
| 大气与天体光照 | 使用预计算散射和透射率查找表，表现天空颜色、大气透视、日光、月亮及程序生成的夜间星点。 |
| 体积光 | 在最低有效投影云层的云底下方，用薄层介质表现太阳光束；介质密度向下边界平滑淡出，聚焦云影的日光可见性塑造穿过云隙的光照。 |
| 地面云影 | 使用级联云影贴图，将随天气移动的云影投射到场景表面；默认由前两层云投射阴影。 |
| 泛光与镜头光晕 | HDR 亮部提取、降采样/升采样链、模糊、镜头鬼影与光环。 |
| 色调映射 | 支持 ACES、AgX、Neutral、Linear、Reinhard、Reinhard2、Uncharted2 和 Cineon，并提供曝光及独立地表光照调节。 |
| HBAO | 基于深度的环境光遮蔽，结合双边滤波增强地形及几何接触处的阴影；可选，默认开启。 |
| SMAA | 在天空合成后执行三道形态学抗锯齿处理；可选，默认开启。 |
| 底层扩展效果 | 可通过底层 pass 开启表面积雪覆盖和雨条纹/闪光叠加，默认关闭。 |

默认开启独立体积光 `volumetric` 模式。互斥的 `legacy` 和 `off` 模式分别保留现有 `cloud.haze*` 局部/指数高度介质，或关闭两条额外体积光路径；原有 haze 参数通过 legacy 模式保持兼容。

## 做了哪些渲染优化

| 优化方向 | 实现机制与作用 |
| --- | --- |
| 云体采样成本 | 云体以 `ceil(width / 4) × ceil(height / 4)` 计算，通过 16 相位 Bayer 序列重建至全分辨率，主云体采样像素数约为绘制缓冲的 1/16。 |
| 云层内有效采样 | 对有效球形云层的射线交段排序、合并，跳过云层间空隙；自适应调整步长，并在透射率足够低时提前结束。 |
| 远景云细节 | 根据屏幕像素覆盖范围选择纹理 mip，连续淡出细节，并采用确定性的次级光照采样，减少无法分辨的细节与帧间跳变。 |
| 云体时域稳定性 | 使用运动重投影、方差裁剪、深度/透明度检查及相机运动感知混合，平衡静止降噪与运动拖影；相机、投影、光照或云参数发生重要变化时清除历史。 |
| 地形轮廓与距离精度 | 云重建在地形边缘参考全分辨率场景深度；云深度/速度缓冲使用 32 位浮点，避免半精度距离存储的 65,504 上限。 |
| 云影稳定与柔化 | 结合阴影像素覆盖范围过滤和时域积累；地表着色采用固定采样方向的透射率 PCF、级联混合及最低补光，缓和阴影交界的过黑与跳动。 |
| 独立体积光采样 | balanced 使用半分辨率目标和 48 步积分；low 使用四分之一分辨率和 24 步，high 使用半分辨率和 64 步。采用独立的逐像素、逐帧抖动，与云的 16 相位 Bayer 重建分别运行。 |
| 局部介质范围 | 介质跟随最低有效投影云层的云底，密度向下边界淡出，不由天气图中的云隙决定是否存在。在默认 16 km 观察范围内积分全部有效球形层交段，并由地形和地球裁剪，在距离边界附近平滑淡出。 |
| 聚焦光照可见性 | 独立云影贴图在 low/balanced/high 下分别使用 512/1024/2048 的边长；投影对齐世界空间纹素，过滤范围跟随太阳半影。它与地面云影共享云密度实现，并独立管理投影和资源。 |
| 体积光历史与边缘 | 独立历史按散射辐亮度质心重投影，排除不兼容的地形、云体和光照样本；结合全分辨率地形深度与云前沿深度，重建云前/云后的雾积分，再与云合成。 |
| 高空场景 | 默认在相机椭球高度 30–90 km 之间联动淡出云、云影与相关光束；完全淡出后跳过云体和云影绘制。 |
| 大气与泛光 | 大气散射数据来自预计算纹理；泛光先处理逐级缩小的图像金字塔，再完成合成。 |
| 示例大窗口 | 示例通过 `viewer.resolutionScale` 将绘制缓冲限制在约 400 万像素。这属于示例层策略，与 SDK 的云体采样策略分别生效。 |

1/16 指云体采样分辨率比例，不代表整体帧率提升倍数。实际性能取决于 GPU、绘制缓冲大小、观察视角及开启的效果。

## 管线如何协作

```text
Cesium 场景颜色 + 深度
  → HBAO（可选）
  → 大气 + 体积云 + 云影 + 体积光
  → 泛光 / 镜头光晕 + 色调映射
  → SMAA（可选）
```

SDK 将渲染阶段接入 `scene.postProcessStages`，通过 `scene.preRender` 更新光照、天气移动及离屏处理。

## 接入范围

当前实现面向包含地球和三维透视相机的单 Cesium Viewer，使用 WebGL 2、浮点渲染目标及 Cesium 渲染器内部接口。仓库锁定 Cesium **1.142.0** 与 three **0.160.1**，更换 Cesium 版本需要验证兼容性。

SSR 和 SSS 不属于 EffectPipeline 当前支持的功能。安装、静态资源、公开参数、场景影响及生命周期管理见[使用说明](EffectPipeline.README.zh-CN.md)。

## 源码导览

- [EffectPipeline.js](EffectPipeline.js)：公开 API、默认值、参数校验与更新。
- [GeospatialPipelinePass.js](Library/GeospatialPipelinePass.js)：场景接入、大气与效果合成。
- [CloudsMaterialPass.js](Library/geospatial/CloudsMaterialPass.js)：云体/光照积分与时域重建。
- [VolumetricLightPass.js](Library/geospatial/VolumetricLightPass.js) 和 [FocusedCloudShadowPass.js](Library/geospatial/FocusedCloudShadowPass.js)：独立局部体积光、时域历史与聚焦日光可见性。
- [体积光着色器](Library/shaders/geospatial/volumetricLight.frag.glsl)、[时域重建](Library/shaders/geospatial/volumetricLightResolve.frag.glsl)与[合成](Library/shaders/geospatial/volumetricLightComposite.glsl)：介质积分、质心重投影及云/地形边缘处理。
- [ShadowMaterialPass.js](Library/geospatial/ShadowMaterialPass.js) 和 [AerialPerspectiveEffect.js](Library/geospatial/AerialPerspectiveEffect.js)：云影生成与应用。

## 许可

[专有试用许可](LICENSE)。目前所有个人和组织均可零费用试用，包括商业项目和生产上线，无须逐一申请；SDK 和接入项目均可闭源。暂未设定收费日期。权利人可提前至少 30 个日历日公布通知，结束指定版本或用途的免费试用；此后继续相应用途须取得单独授权，授权可以收费。此前合法试用不追溯收费，已有单独授权继续按原约定执行。

第三方材料继续适用原许可，见[第三方代码及许可条件](THIRD_PARTY_NOTICES.md)。
