/**
 * EffectPipeline —— 体积云 / 大气散射 / 体积光（丁达尔）/ 镜头光晕 天空渲染管线。
 *
 * BetterSky4Cesium SDK 的天空渲染入口，在 Cesium（ESM）中一行开启后处理效果：
 *
 *   import { EffectPipeline } from "./EffectPipeline.js";
 *   const fx = new EffectPipeline(viewer);          // 使用内置默认预设
 *   // 或覆盖参数：
 *   const fx = new EffectPipeline(viewer, { coverage: 0.35, toneMappingExposure: 6 });
 *
 * 依赖与前置条件：
 *   1. 官方 Cesium（建议 1.140+，已验证 1.142 导出所需的渲染器内部类）。
 *   2. three（资源加载器 EXRLoader / CSM 阴影使用，工程内执行 `npm i three`）。
 *   3. 设置 window.CESIUM_BASE_URL 指向包含 EffectPipelineAssets/GeospatialAssets/ 的静态目录
 *      （大气 LUT *.exr、3D 噪声 *.bin、天气图 *.png）。
 *
 * 设计：零侵入官方内核——不 patch Scene.prototype；仅用官方导出 API + 运行时配置，
 * 以及在传入的 scene.context 实例上安装两个支持自定义顶点着色器的视口命令方法。
 */
import * as Cesium from "cesium";
import GeospatialPipelinePass from "./Library/GeospatialPipelinePass.js";
import HBAOEffectPass from "./Library/HBAOEffectPass.js";
import SMAAStage from "./Library/SMAAStage.js";
import { installViewportCommands } from "./Library/viewportQuadCommand.js";

const { Cartesian2, Cartesian4, JulianDate, defined } = Cesium;
const CLOUD_LAYER_TYPES = ["cumulus", "altocumulus", "cirrus"];
const HAZE_QUALITY_SAMPLES = Object.freeze({
  low: [16, 1],
  balanced: [24, 2],
  high: [32, 4],
});

/** 内置默认预设（与 demo-official.js 使用的默认效果一致）。 */
const DEFAULT_OPTIONS = {
  /** 是否在初始化后启用天空效果；false 保留配置但暂停效果渲染。 */
  enabled: true,
  /** 云量覆盖度 [0,1]；越大云区越广，≤0.1 基本无云，独立于云体密度。 */
  coverage: 0.34,
  /** 天气纹理移动速度 [x,y]（纹理坐标/秒）；绝对值越大移动越快，0 停止，负值反向。 */
  localWeatherVelocity: [0.0003, 0.0001],
  /** HDR 色调映射曲线：7=AgX、8=Neutral、9=ACES、10=Linear、11=Reinhard、12=Cineon。 */
  toneMappingMode: 9,
  /** 色调映射前的亮度倍率（无量纲，建议 ≥0）；越大越亮，单位不是曝光档位 EV。 */
  toneMappingExposure: 2.8,
  /** 地表光照增益（非负倍率）；越大地表越亮，独立于云体补光，仍受色调映射影响。 */
  irradianceScale: 0.15,
  /** 地表大气透视混合强度 [0,1]；越大远景雾感越强，0 关闭此混合，不改变天空和云的散射。 */
  aerialPerspectiveStrength: 0.25,
  /** 夜间天空辉光的调制系数（无量纲，建议 [0,1]）；作用于 _customDarkParam.y，白天通常不明显。 */
  darkParamY: 0.5,
  /** 太阳泛光/光晕强度（无量纲，建议 ≥0）；越大亮部扩散越明显，0 关闭此强度。 */
  bloomIntensity: 0.002,
  /** 云层形态、照明、穿云光介质与降噪配置；初始化时可只覆盖其中的部分字段。 */
  cloud: {
    /** 按相机椭球高度淡出云量 [开始高度,消失高度]（米，0 ≤ 开始 < 消失）；null 禁用。 */
    altitudeFadeRange: [30000, 90000],
    /** 三层云型依次为积云/高积云/卷云；支持 cumulus、altocumulus、cirrus，null 恢复原有云形。 */
    layerTypes: ["cumulus", "altocumulus", "cirrus"],
    /** 按距相机距离降低采样细节 [近距离阈值,远距离阈值]（米，0 ≤ 近 < 远）；null 关闭 LOD。 */
    lodRange: [200000, 500000],
    /** 云底高度 [第一层,第二层,第三层,预留]（米），接受数组或 Cartesian4；以渲染行星高度为基准。 */
    altitudes: [4000, 6000, 10000, 0],
    /** 云层厚度 [第一层,第二层,第三层,预留]（米），接受数组或 Cartesian4；云顶 = 云底 + 厚度。 */
    heights: [1300, 1800, 650, 0],
    /** 云密度倍率 [第一层,第二层,第三层,预留]（无量纲，建议 ≥0），接受数组或 Cartesian4；0 关闭对应层介质。 */
    densityScales: [0.12, 0.09, 0.0015, 0],
    /** 云形细节侵蚀 [第一层,第二层,第三层,预留]（各分量 [0,1]），接受数组或 Cartesian4；越大边缘越破碎。 */
    shapeDetailAmounts: [0.18, 0.12, 0, 0],
    /** 天空辐照度对云体的补光倍率（非负）；越大云暗面越亮，0 移除这一补光项。 */
    skyIrradianceScale: 1.8,
    /** 地面反射辐照度对云体的补光倍率（非负）；越大云下部越亮，独立于地表增益 irradianceScale。 */
    groundIrradianceScale: 1.3,
    /** 穿云光 haze 介质密度缩放（非负）；越大散射和消光越强，0 关闭额外穿云光，建议小于 0.0001。 */
    hazeDensityScale: 0.12 * 0.0001,
    /** true 在近地及参与云影投射的云底附近积分世界固定薄层；false 使用行星表面以上的指数高度雾。 */
    hazeCloudAttached: true,
    /** 局部薄层模式的最大观察距离（正有限米数）；只限制候选薄层的可见距离，空路不产生介质。 */
    hazeViewDistance: 20000,
    /** 局部薄层模式沿视线累计的散射区间长度上限（正有限米数）；按近到远累积，空路不计入长度。 */
    hazeVolumeLength: 3000,
    /** haze 太阳直射散射增益（非负倍率）；0 移除此直射项，不改变介质消光、云体照明或天空补光。 */
    hazeDirectLightScale: 2,
    /** haze 积分预算：low=16 点/每点 1 次云影读取，balanced=24/2，high=32/4；越高越细腻但更耗 GPU。 */
    hazeQuality: "balanced",
    /** haze 垂直密度衰减尺度（正有限米数）；传统模式在此高度降至 1/e，局部模式用于限制薄层厚度。 */
    hazeHeightFalloff: 1000,
    /** haze 前向散射偏好 g [0,0.9]；0 为各向同性，越大越集中于朝太阳的观察方向。 */
    hazeAnisotropy: 0.6,
    /** 大气阴影长度积分上限（正有限米数）；传统模式同时限制 haze 光路，局部模式改用上方两个距离参数。 */
    maxShadowLengthRayDistance: 6000,
    /** haze 日光的线性 RGB 倍率 [r,g,b]（非负，可大于 1）；不是 0–255 的 sRGB 值，不改变云本身的颜色。 */
    hazeSunColor: [1, 0.78, 0.42],
    /** 云的时域积累与空间重建配置；平衡静止时的稳定性、运动拖影和细节保留。 */
    denoise: {
      /** 普通时域积累的当前帧权重 [0,1]；越小越依赖历史、降噪越强，但可能拖影。 */
      temporalAlpha: 0.04,
      /** 时域升采样中本帧采样相位的当前帧权重 [0,1]；越大新采样越快生效，但更易暴露噪声。 */
      currentFrameAlpha: 0.08,
      /** 相机运动时的当前帧权重下限 [0,1]；越大拖影越少但噪声越明显，0 保持普通降噪权重。 */
      motionAlpha: 0.25,
      /** 历史颜色方差裁剪的标准差倍率（正有限数）；越大保留历史越宽松，越小越严格排除旧色。 */
      varianceGamma: 2,
      /** 深度/透明度感知的邻域重建混合强度 [0,1]；越大越平滑但细节更少，0 关闭此邻域平滑。 */
      spatialFilterStrength: 0.8,
    },
  },
  /**
   * 太阳光来源：
   *   true  —— 跟随 Cesium 实际太阳（由 viewer.clock 时间决定，推荐）。
   *   false —— 使用 pass 内置的自定义太阳方向（需自行写入 uniformState.sunDirectionWC2）。
   * 此开关只决定光源方向的来源，不调节光照强度。
   */
  systemLight: true,
  /** 初始化时是否统一设置 HDR、对数深度、gamma 和地形深度测试；false 由调用方自行配置场景。 */
  applySceneSettings: true,
  /** 场景 HDR 开关；true 保留更宽的亮度范围供色调映射使用，初始化时受 applySceneSettings 控制。 */
  highDynamicRange: true,
  /** 场景对数深度缓冲开关；改善远近同框时的深度精度，初始化时受 applySceneSettings 控制。 */
  logarithmicDepthBuffer: true,
  /** 场景显示 Gamma（正数）；一般增大会提亮中间调，初始化时受 applySceneSettings 控制。 */
  gamma: 2.2,
  /**
   * HBAO 屏幕空间环境光遮蔽（增强建筑/地形接触阴影与立体感，纯深度实现）。
   * false 关闭；true 用底层默认参数；或传对象覆盖部分参数：
   * { intensity, maxRadius, bias, frustumLength, blackPoint, whitePoint, gamma, denoise }
   */
  hbao: {
    /** AO 强度指数（建议 ≥0）；越大接触遮蔽越暗，0 不产生 AO 对比。 */
    intensity: 100,
    /** 视空间遮蔽邻域的最大半径（米）；越大影响范围越广，过大可能产生暗边或跨物体污染。 */
    maxRadius: 30,
    /** 遮蔽切线的角度偏移（弧度）；增大可减少自遮蔽伪影，但会弱化细小接触阴影。 */
    bias: 0.1,
    /** AO 处理的相机视空间深度上限（米）；超过此距离的远景跳过遮蔽计算。 */
    frustumLength: 100000,
    /** AO 调制颜色曲线的输入黑点（建议 [0,1)）；越大暗部截断越多，不能设为 1。 */
    blackPoint: 0.05,
    /** AO 调制颜色曲线的输出亮度倍率（建议 [0,1]）；越大被遮蔽部分越亮，0 为黑色。 */
    whitePoint: 0.9,
    /** AO 调制曲线的幂指数（正数）；越大中间亮度越暗，独立于场景 gamma 和降噪 varianceGamma。 */
    gamma: 2.5,
  },
  /**
   * SMAA 亚像素形态学抗锯齿（比 FXAA 更锐利、无明显模糊，纯屏幕空间）。
   * 作用于天空效果合成后的最终图像。false 关闭；true 启用，不替代云体时域降噪。
   */
  smaa: true,
  /**
   * Viewer 时钟时间（ISO8601 字符串，Z 表示 UTC）；systemLight=true 时用于决定太阳角度。
   * 显式传 undefined 或 null 可保留用户时钟；仅传 Scene 时不会设置时钟。
   */
  time: "2026-05-01T06:00Z",
};

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isPlainObject(override)) return out;
  for (const key of Object.keys(override)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error("[EffectPipeline] 非法配置字段。");
    }
    const ov = override[key];
    if (isPlainObject(ov) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], ov);
    } else {
      out[key] = Array.isArray(ov) ? ov.slice() : ov;
    }
  }
  return out;
}

function toCartesian2(v) {
  if (v instanceof Cartesian2) return v;
  if (Array.isArray(v)) return new Cartesian2(v[0], v[1]);
  return v;
}

function toCartesian4(v) {
  if (v instanceof Cartesian4) return v;
  if (Array.isArray(v)) return new Cartesian4(v[0], v[1], v[2], v[3]);
  return v;
}

function validateCloudOptions(options) {
  if ("aerialPerspectiveStrength" in options && (!Number.isFinite(options.aerialPerspectiveStrength) || options.aerialPerspectiveStrength < 0 || options.aerialPerspectiveStrength > 1)) {
    throw new Error("[EffectPipeline] aerialPerspectiveStrength 必须在 0..1 范围内。");
  }
  if ("irradianceScale" in options && (!Number.isFinite(options.irradianceScale) || options.irradianceScale < 0)) {
    throw new Error("[EffectPipeline] irradianceScale 必须是非负有限数字。");
  }
  const cloud = options.cloud;
  if (!isPlainObject(cloud)) return;
  if ("hazeCloudAttached" in cloud && typeof cloud.hazeCloudAttached !== "boolean") {
    throw new Error("[EffectPipeline] cloud.hazeCloudAttached 必须是布尔值。");
  }
  for (const key of ["hazeViewDistance", "hazeVolumeLength"]) {
    if (key in cloud && (!Number.isFinite(cloud[key]) || cloud[key] <= 0)) {
      throw new Error(`[EffectPipeline] cloud.${key} 必须是正的有限距离（米）。`);
    }
  }
  if ("layerTypes" in cloud && cloud.layerTypes !== null) {
    if (!Array.isArray(cloud.layerTypes) || cloud.layerTypes.length !== 3 || !cloud.layerTypes.every(type => CLOUD_LAYER_TYPES.includes(type))) {
      throw new Error("[EffectPipeline] cloud.layerTypes 必须是三个 cumulus/altocumulus/cirrus 云型，或 null。");
    }
  }
  if ("lodRange" in cloud && cloud.lodRange !== null) {
    const range = cloud.lodRange;
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] < 0 || range[1] <= range[0]) {
      throw new Error("[EffectPipeline] cloud.lodRange 必须为 [非负近景距离, 更大的远景距离]（米），或 null。");
    }
  }
  if ("hazeQuality" in cloud && !Object.keys(HAZE_QUALITY_SAMPLES).includes(cloud.hazeQuality)) {
    throw new Error("[EffectPipeline] cloud.hazeQuality 必须是 low、balanced 或 high。");
  }
  if ("hazeHeightFalloff" in cloud && (!Number.isFinite(cloud.hazeHeightFalloff) || cloud.hazeHeightFalloff <= 0)) {
    throw new Error("[EffectPipeline] cloud.hazeHeightFalloff 必须是正的有限高度（米）。");
  }
  if ("hazeAnisotropy" in cloud && (!Number.isFinite(cloud.hazeAnisotropy) || cloud.hazeAnisotropy < 0 || cloud.hazeAnisotropy > 0.9)) {
    throw new Error("[EffectPipeline] cloud.hazeAnisotropy 必须在 0..0.9 范围内。");
  }
  if ("altitudeFadeRange" in cloud && cloud.altitudeFadeRange !== null) {
    const range = cloud.altitudeFadeRange;
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] < 0 || range[1] <= range[0]) {
      throw new Error("[EffectPipeline] cloud.altitudeFadeRange 必须为 [非负开始高度, 更大的结束高度]，或 null。");
    }
  }
  if ("maxShadowLengthRayDistance" in cloud && (!Number.isFinite(cloud.maxShadowLengthRayDistance) || cloud.maxShadowLengthRayDistance <= 0)) {
    throw new Error("[EffectPipeline] cloud.maxShadowLengthRayDistance 必须大于 0。");
  }
  if ("hazeSunColor" in cloud && (!Array.isArray(cloud.hazeSunColor) || cloud.hazeSunColor.length !== 3 || cloud.hazeSunColor.some(value => !Number.isFinite(value) || value < 0))) {
    throw new Error("[EffectPipeline] cloud.hazeSunColor 必须是三个非负有限数字。");
  }
  for (const key of ["skyIrradianceScale", "groundIrradianceScale", "hazeDensityScale", "hazeDirectLightScale"]) {
    if (key in cloud && (!Number.isFinite(cloud[key]) || cloud[key] < 0)) {
      throw new Error(`[EffectPipeline] cloud.${key} 必须是非负有限数字。`);
    }
  }
  if ("shapeDetailAmounts" in cloud) {
    const value = cloud.shapeDetailAmounts;
    const components = value instanceof Cartesian4 ? [value.x, value.y, value.z, value.w] : value;
    if (!Array.isArray(components) || components.length !== 4) {
      throw new Error("[EffectPipeline] cloud.shapeDetailAmounts 必须是含四个 0..1 有限数字的 Array 或 Cartesian4。");
    }
    for (let i = 0; i < 4; i++) {
      if (!Number.isFinite(components[i]) || components[i] < 0 || components[i] > 1) {
        throw new Error(`[EffectPipeline] cloud.shapeDetailAmounts[${i}] 必须是 0..1 的有限数字。`);
      }
    }
  }
  if ("denoise" in cloud) {
    if (!isPlainObject(cloud.denoise)) {
      throw new Error("[EffectPipeline] cloud.denoise 必须是降噪参数对象。");
    }
    for (const key of Object.keys(DEFAULT_OPTIONS.cloud.denoise)) {
      if (!(key in cloud.denoise)) continue;
      const value = cloud.denoise[key];
      if (!Number.isFinite(value) || (key === "varianceGamma" ? value <= 0 : value < 0 || value > 1)) {
        throw new Error(`[EffectPipeline] cloud.denoise.${key} 必须是${key === "varianceGamma" ? "大于 0" : " 0..1"}的有限数字。`);
      }
    }
  }
}

function getUseLogDepth(scene) {
  const fs = scene.frameState || scene._frameState;
  if (fs && typeof fs.useLogDepth === "boolean") return fs.useLogDepth;
  return !!scene.logarithmicDepthBuffer;
}

export class EffectPipeline {
  /** 内置默认预设的独立副本，可用于读取默认值或生成自定义预设。 */
  static get defaultOptions() {
    return structuredClone(DEFAULT_OPTIONS);
  }

  /**
   * @param {Cesium.Viewer|Cesium.Scene} viewerOrScene Cesium Viewer 或 Scene
   * @param {object} [options] 覆盖默认预设的配置（深合并）
   */
  constructor(viewerOrScene, options = {}) {
    validateCloudOptions(options);
    if (!defined(viewerOrScene)) {
      throw new Error("[EffectPipeline] 需要传入 Cesium Viewer 或 Scene。");
    }
    const scene = defined(viewerOrScene.scene) ? viewerOrScene.scene : viewerOrScene;
    if (!defined(scene) || !defined(scene.context)) {
      throw new Error("[EffectPipeline] 无法获取 scene.context，请确认传入的是 Viewer/Scene。");
    }
    this._viewer = defined(viewerOrScene.scene) ? viewerOrScene : undefined;
    this._scene = scene;
    this._options = deepMerge(EffectPipeline.defaultOptions, options);

    // 1) 在 context 上安装支持自定义顶点着色器的视口命令
    installViewportCommands(scene.context);

    // 2) 必要的场景设置
    if (this._options.applySceneSettings) {
      if (defined(this._options.highDynamicRange)) scene.highDynamicRange = !!this._options.highDynamicRange;
      if (defined(this._options.logarithmicDepthBuffer)) scene.logarithmicDepthBuffer = !!this._options.logarithmicDepthBuffer;
      if (defined(this._options.gamma)) scene.gamma = this._options.gamma;
      scene.globe.depthTestAgainstTerrain = true;
    }
    if (defined(this._options.time) && defined(this._viewer) && defined(this._viewer.clock)) {
      this._viewer.clock.currentTime = JulianDate.fromIso8601(this._options.time);
    }

    // 3) HBAO 环境光遮蔽（可选，先于天空效果加入，在地表几何上叠加柔和接触阴影）
    const hbaoEnabled = !!this._options.hbao;
    const hbaoOpts = isPlainObject(this._options.hbao) ? this._options.hbao : {};
    this._hbao = new HBAOEffectPass(scene, { show: hbaoEnabled, ...hbaoOpts });
    scene.postProcessStages.add(this._hbao.stage);

    // 4) 创建天空管线 Pass（关闭依赖 GBuffer 的 SSR / fields；太阳跟随系统光）
    this._geo = new GeospatialPipelinePass(scene, {
      systemLight: this._options.systemLight,
      showSSR: false,
      showFields: false,
      show: this._options.enabled,
    });

    // 5) 加入官方后处理集合
    scene.postProcessStages.add(this._geo.stage);

    // 6) SMAA 抗锯齿（可选，链尾——对天空效果合成后的最终图像抗锯齿）
    this._smaa = undefined;
    if (this._options.smaa) {
      this._smaa = new SMAAStage(scene, { show: true });
      scene.postProcessStages.add(this._smaa.stage);
    }

    // 7) 应用预设参数
    this._applyPreset(this._options);

    // 8) 每帧驱动：在渲染前计算行星半径/太阳月亮/风偏移并更新离屏 Pass
    this._removePreRender = scene.preRender.addEventListener(() => {
      try {
        const useLog = getUseLogDepth(scene);
        if (this._hbao) this._hbao.update(scene.context, useLog);
        if (this._geo) this._geo.update(scene.context, useLog);
        if (this._smaa) this._smaa.update(scene.context, useLog);
      } catch (e) {
        // 单帧异常不应中断渲染循环
        console.error("[EffectPipeline] update error:", e);
      }
    });

    this._disposed = false;
  }

  /** 应用一组预设参数到底层 Pass。 */
  _applyPreset(opt) {
    const geo = this._geo;
    let cloudHistoryChanged = false;
    if (defined(opt.systemLight)) geo._systemLight = !!opt.systemLight;
    if (defined(opt.coverage)) {
      geo.coverage = opt.coverage;
      cloudHistoryChanged = true;
    }
    if (defined(opt.localWeatherVelocity)) geo.localWeatherVelocity = toCartesian2(opt.localWeatherVelocity);
    if (defined(opt.bloomIntensity)) geo._bloomIntensity = opt.bloomIntensity;
    if (defined(opt.toneMappingExposure)) geo.toneMappingExposure = opt.toneMappingExposure;
    if (defined(opt.irradianceScale)) geo._irradianceScale = opt.irradianceScale;
    if (defined(opt.aerialPerspectiveStrength)) geo.aerialPerspectiveStrength = opt.aerialPerspectiveStrength;
    if (defined(opt.darkParamY)) geo._customDarkParam.y = opt.darkParamY;
    // toneMappingMode 的 setter 会触发管线重建，放在最后
    if (defined(opt.cloud)) {
      const c = opt.cloud;
      if ("hazeCloudAttached" in c) {
        geo.cloudMaterialPass.hazeCloudAttached = c.hazeCloudAttached;
        cloudHistoryChanged = true;
      }
      if ("altitudeFadeRange" in c) {
        geo.cloudAltitudeFadeRange = c.altitudeFadeRange?.slice() ?? null;
        cloudHistoryChanged = true;
      }
      if ("layerTypes" in c) {
        const types = c.layerTypes?.map(type => CLOUD_LAYER_TYPES.indexOf(type) + 1) ?? [0, 0, 0];
        geo.cloudMaterialPass.layerTypes = new Cartesian4(types[0], types[1], types[2], 0);
        cloudHistoryChanged = true;
      }
      if ("lodRange" in c) {
        geo.cloudMaterialPass.lodRange = toCartesian2(c.lodRange ?? [0, 0]);
        cloudHistoryChanged = true;
      }
      if (defined(c.hazeQuality)) {
        const [samples, shadowSamples] = HAZE_QUALITY_SAMPLES[c.hazeQuality];
        geo.cloudMaterialPass.hazeSampleCount = samples;
        geo.cloudMaterialPass.hazeShadowSampleCount = shadowSamples;
        cloudHistoryChanged = true;
      }
      if (defined(c.hazeHeightFalloff)) {
        geo.cloudMaterialPass.hazeExponent = 1 / c.hazeHeightFalloff;
        cloudHistoryChanged = true;
      }
      if (defined(c.hazeAnisotropy)) {
        geo.cloudMaterialPass.hazeAnisotropy = c.hazeAnisotropy;
        cloudHistoryChanged = true;
      }
      if (defined(c.altitudes)) {
        geo.cloudMaterialPass.altitudes = toCartesian4(c.altitudes);
        cloudHistoryChanged = true;
      }
      if (defined(c.heights)) {
        geo.cloudMaterialPass.heights = toCartesian4(c.heights);
        cloudHistoryChanged = true;
      }
      if (defined(c.densityScales)) {
        geo.cloudMaterialPass.densityScales = toCartesian4(c.densityScales);
        cloudHistoryChanged = true;
      }
      if (defined(c.shapeDetailAmounts)) {
        geo.cloudMaterialPass.shapeDetailAmounts = toCartesian4(c.shapeDetailAmounts);
        cloudHistoryChanged = true;
      }
      if (defined(c.denoise)) {
        for (const key of Object.keys(DEFAULT_OPTIONS.cloud.denoise)) {
          if (defined(c.denoise[key])) geo.cloudMaterialPass[`_${key}`] = c.denoise[key];
        }
      }
      if (defined(c.hazeSunColor)) {
        Cesium.Cartesian3.fromArray(c.hazeSunColor, 0, geo.cloudMaterialPass.hazeSunColor);
        cloudHistoryChanged = true;
      }
      for (const key of ["skyIrradianceScale", "groundIrradianceScale", "hazeDensityScale", "maxShadowLengthRayDistance", "hazeViewDistance", "hazeVolumeLength", "hazeDirectLightScale"]) {
        if (defined(c[key])) {
          geo.cloudMaterialPass[key] = c[key];
          cloudHistoryChanged = true;
        }
      }
    }
    if (cloudHistoryChanged) geo.cloudMaterialPass.invalidateHistory();
    if (defined(opt.toneMappingMode)) geo.toneMappingMode = opt.toneMappingMode;
    if (defined(opt.hbao)) {
      if (isPlainObject(opt.hbao)) {
        for (const key of ["intensity", "maxRadius", "bias", "frustumLength", "blackPoint", "whitePoint", "gamma"]) {
          if (defined(opt.hbao[key])) this._hbao[`_${key}`] = opt.hbao[key];
        }
      }
      this.hbaoEnabled = !!opt.hbao;
    }
    if (defined(opt.smaa)) this.smaaEnabled = !!opt.smaa;
    if (defined(opt.enabled)) this.enabled = opt.enabled;
  }

  /** 底层 GeospatialPipelinePass 实例（高级用法） */
  get pass() {
    return this._geo;
  }

  /** 官方后处理 Composite（已加入 scene.postProcessStages） */
  get stage() {
    return this._geo ? this._geo.stage : undefined;
  }

  /** 是否启用效果 */
  get enabled() {
    return this._geo ? this._geo.enabled : false;
  }
  set enabled(v) {
    if (this._geo) this._geo.enabled = v;
    if (this._hbao) this._hbao.enabled = !!v && !!this._options.hbao;
    if (this._smaa) this._smaa.enabled = !!v && !!this._options.smaa;
  }

  /** 云量覆盖度 [0,1] */
  get coverage() {
    return this._geo ? this._geo.coverage : 0;
  }
  set coverage(v) {
    if (this._geo) {
      this._geo.coverage = v;
      this._geo.cloudMaterialPass.invalidateHistory();
    }
  }

  /** 曝光 */
  get toneMappingExposure() {
    return this._geo ? this._geo.toneMappingExposure : 0;
  }
  set toneMappingExposure(v) {
    if (this._geo) this._geo.toneMappingExposure = v;
  }

  /** 色调映射模式（设置会触发管线重建） */
  set toneMappingMode(v) {
    if (this._geo) this._geo.toneMappingMode = v;
  }

  /** 风/天气速度，接受 [x,y] 或 Cartesian2 */
  set localWeatherVelocity(v) {
    if (this._geo) this._geo.localWeatherVelocity = toCartesian2(v);
  }

  /** 三层云底高度及预留分量，接受数组或 Cartesian4。 */
  setCloudAltitudes(v) {
    if (this._geo) {
      this._geo.cloudMaterialPass.altitudes = toCartesian4(v);
      this._geo.cloudMaterialPass.invalidateHistory();
    }
  }

  /** 云层厚度，接受数组或 Cartesian4 */
  setCloudHeights(v) {
    if (this._geo) {
      this._geo.cloudMaterialPass.heights = toCartesian4(v);
      this._geo.cloudMaterialPass.invalidateHistory();
    }
  }

  /** 云密度/散射/消光，接受数组或 Cartesian4 */
  setCloudDensityScales(v) {
    if (this._geo) {
      this._geo.cloudMaterialPass.densityScales = toCartesian4(v);
      this._geo.cloudMaterialPass.invalidateHistory();
    }
  }

  setCloudShapeDetailAmounts(v) {
    if (this._geo) this.update({ cloud: { shapeDetailAmounts: v } });
  }

  /** HBAO 是否启用（运行时开关） */
  get hbaoEnabled() {
    return this._hbao ? this._hbao.enabled : false;
  }
  set hbaoEnabled(v) {
    this._options.hbao = v ? (this._options.hbao || true) : false;
    if (this._hbao) this._hbao.enabled = !!v && this.enabled;
  }

  /** HBAO 强度（越大遮蔽越深） */
  set hbaoIntensity(v) {
    if (this._hbao) this._hbao._intensity = v;
  }

  /** HBAO 最大视空间采样半径（米）。 */
  set hbaoMaxRadius(v) {
    if (this._hbao) this._hbao._maxRadius = v;
  }

  /** SMAA 抗锯齿是否启用（运行时开关） */
  get smaaEnabled() {
    return this._smaa ? this._smaa.enabled : false;
  }
  set smaaEnabled(v) {
    this._options.smaa = !!v;
    if (v && !this._smaa) {
      this._smaa = new SMAAStage(this._scene, { show: true });
      this._scene.postProcessStages.add(this._smaa.stage);
    }
    if (this._smaa) this._smaa.enabled = !!v && this.enabled;
  }

  /** 批量更新参数（同构造时 options，部分字段即可） */
  update(options = {}) {
    validateCloudOptions(options);
    this._options = deepMerge(this._options, options);
    if (options.applySceneSettings !== false) {
      if (defined(options.highDynamicRange)) this._scene.highDynamicRange = !!options.highDynamicRange;
      if (defined(options.logarithmicDepthBuffer)) {
        this._scene.logarithmicDepthBuffer = !!options.logarithmicDepthBuffer;
      }
      if (defined(options.gamma)) this._scene.gamma = options.gamma;
    }
    if (defined(options.time) && defined(this._viewer) && defined(this._viewer.clock)) {
      this._viewer.clock.currentTime = JulianDate.fromIso8601(options.time);
    }
    this._applyPreset(options);
  }

  /** 释放：移除每帧驱动、从后处理集合移除并销毁。 */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (defined(this._removePreRender)) {
      this._removePreRender();
      this._removePreRender = undefined;
    }
    const pps = this._scene.postProcessStages;
    if (this._geo) this._geo.restoreScene();
    const removeStage = (pass) => {
      if (!defined(pass)) return;
      const stage = pass.stage;
      if (defined(stage) && defined(pps) && typeof pps.contains === "function" && pps.contains(stage)) {
        pps.remove(stage); // remove() 内部会 destroy
      }
      // 集合只销毁 stage；包装器还持有 SMAA 等离屏资源。
      if (typeof pass.isDestroyed === "function" && !pass.isDestroyed()) {
        pass.destroy();
      }
    };
    removeStage(this._geo);
    removeStage(this._hbao);
    removeStage(this._smaa);
    this._geo = undefined;
    this._hbao = undefined;
    this._smaa = undefined;
  }
}

export default EffectPipeline;
