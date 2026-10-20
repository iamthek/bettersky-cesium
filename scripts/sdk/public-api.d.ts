import type { Cartesian2, Cartesian4, PostProcessStageComposite, Scene, Viewer } from 'cesium';

/** 二维参数：数组依次为 [x, y]，也可传入 Cesium Cartesian2；单位由具体配置项定义。 */
export type BetterSkyVector2 = [number, number] | Cartesian2;
/** 三层云参数：[第一层, 第二层, 第三层, 预留]，也可传入 Cartesian4；第四分量约定为 0，不作必须等于 0 的校验。 */
export type BetterSkyVector4 = [number, number, number, number] | Cartesian4;
/** 采样质量档位：low 开销较低，balanced 折中，high 细节较好；具体预算见对应配置项。 */
export type BetterSkyQuality = 'low' | 'balanced' | 'high';
/** 云型：cumulus 积云、altocumulus 高积云、cirrus 卷云；不改变云层高度或投影云层掩码。 */
export type BetterSkyCloudType = 'cumulus' | 'altocumulus' | 'cirrus';
/**
 * HDR 色调映射曲线：2=Reinhard2、4=Uncharted2、7=AgX、8=Neutral、9=ACES、10=Linear、11=Reinhard、12=Cineon。
 * 历史模式 3 的亮度纹理路径尚未接入，不作为当前 SDK 支持的选项；默认仍为 9（ACES）。
 */
export type BetterSkyToneMappingMode = 2 | 4 | 7 | 8 | 9 | 10 | 11 | 12;

/** 独立体积光配置；构造和 update() 均可只传需要覆盖的字段。 */
export interface BetterSkyVolumetricLightOptions {
  /**
   * volumetric 使用独立体积光，legacy 使用 cloud.haze*，off 关闭两条额外体积光路径。
   * 同次调用显式指定 mode 时优先于旧 haze 参数；大气、云体光照和镜头光晕仍分别控制。
   * @default 'volumetric'
   */
  mode?: 'volumetric' | 'legacy' | 'off';
  /**
   * 介质消光密度，单位为米的倒数，必须是非负有限数；越大散射与遮蔽越强，0 移除此介质。
   * @default 0.000008
   */
  density?: number;
  /**
   * 散射亮度倍率，必须是非负有限数；0 移除散射亮度，仍保留介质消光。
   * @default 2
   */
  intensity?: number;
  /**
   * 最低有效投影云层云底向下延伸的体积层厚度，必须是正有限米数；底部最低到渲染行星表面。
   * @default 2400
   */
  layerDepth?: number;
  /**
   * 沿视线的最大观察/积分距离，必须是正有限米数；受场景深度与行星裁剪，同时决定聚焦云影接收范围。
   * @default 16000
   */
  maxDistance?: number;
  /**
   * 前向散射偏好 g，有限数 [0, 0.9]；0 为各向同性，越大越集中于朝太阳的观察方向。
   * @default 0.55
   */
  anisotropy?: number;
  /**
   * 宽高分辨率比例/积分步数/聚焦云影图边长：low=0.25/24/512，balanced=0.5/48/1024，high=0.5/64/2048。
   * 档位越高通常越耗 GPU；切换档位会重建对应渲染目标。
   * @default 'balanced'
   */
  quality?: BetterSkyQuality;
}

/** 云体及 legacy haze 的时域积累与空间重建；不控制独立体积光的历史。 */
export interface BetterSkyCloudDenoiseOptions {
  /**
   * 普通时域积累的当前帧基础权重 [0, 1]；越小越依赖历史，降噪更强但可能拖影。
   * @default 0.04
   */
  temporalAlpha?: number;
  /**
   * 时域升采样中本帧 Bayer 采样相位的当前帧基础权重 [0, 1]；越大新采样越快生效，也更易显露噪声。
   * @default 0.08
   */
  currentFrameAlpha?: number;
  /**
   * 相机运动时用于提高当前帧积累基值的权重 [0, 1]；越大通常拖影越少，最终权重仍会自适应调整。
   * @default 0.25
   */
  motionAlpha?: number;
  /**
   * 历史颜色方差裁剪的标准差倍率，必须为正有限数；越大允许保留的历史颜色范围越宽。
   * @default 2
   */
  varianceGamma?: number;
  /**
   * 深度/透明度感知的邻域重建混合强度 [0, 1]；越大越平滑，也会损失细节，0 关闭此邻域平滑。
   * @default 0.8
   */
  spatialFilterStrength?: number;
}

/**
 * 云层形态、照明、可见性和降噪配置；四分量参数按三层云及预留分量排列。
 * 本次构造或 update() 含任意 haze* 字段且未显式指定 volumetricLight.mode 时，会自动选择 legacy 模式。
 */
export interface BetterSkyCloudOptions {
  /**
   * 按相机椭球高度淡出云量：[开始高度, 消失高度]，单位米，0 ≤ 开始 < 消失；null 禁用。
   * 同时影响云影和相关光束可见性；不是云层自身的高度范围。
   * @default [30000, 90000]
   */
  altitudeFadeRange?: [number, number] | null;
  /**
   * 三层云的云型，依次作用于第一、二、三层；null 使用通用噪声云形，不改变投影云层掩码。
   * @default ['cumulus', 'altocumulus', 'cirrus']
   */
  layerTypes?: [BetterSkyCloudType, BetterSkyCloudType, BetterSkyCloudType] | null;
  /**
   * 距相机的采样细节近/远阈值 [near, far]，单位米，0 ≤ near < far；null 关闭距离 LOD。
   * 调整采样细节，不改变云的位置，也不关闭相机高度淡出。
   * @default [200000, 500000]
   */
  lodRange?: [number, number] | null;
  /**
   * 云底高度 [第一层, 第二层, 第三层, 预留]，单位米；以渲染行星表面为基准，不是距各处地形的离地高度。
   * @default [4000, 6000, 10000, 0]
   */
  altitudes?: BetterSkyVector4;
  /**
   * 云层厚度 [第一层, 第二层, 第三层, 预留]，单位米；云顶高度 = 云底高度 + 厚度，第四项约定为 0。
   * @default [1300, 1800, 650, 0]
   */
  heights?: BetterSkyVector4;
  /**
   * 云密度倍率 [第一层, 第二层, 第三层, 预留]，建议非负；0 移除对应层介质，与 coverage 云量分别控制。
   * @default [0.12, 0.09, 0.0015, 0]
   */
  densityScales?: BetterSkyVector4;
  /**
   * 云形细节侵蚀 [第一层, 第二层, 第三层, 预留]，各分量为 [0, 1]；越大云边缘越破碎，第四项约定为 0。
   * @default [0.18, 0.12, 0, 0]
   */
  shapeDetailAmounts?: BetterSkyVector4;
  /**
   * 天空辐照度对云体及 legacy haze 的补光倍率，非负；越大暗面越亮，独立体积光使用太阳直射光。
   * @default 1.8
   */
  skyIrradianceScale?: number;
  /**
   * 地面反射辐照度对云体的补光倍率，非负；越大云下部越亮，与地表 irradianceScale 分别控制。
   * @default 1.3
   */
  groundIrradianceScale?: number;
  /**
   * legacy haze 介质密度缩放，非负，建议小于 0.0001；越大散射与消光越强，0 移除额外 haze 贡献。
   * @default 0.000008
   */
  hazeDensityScale?: number;
  /**
   * legacy haze 的分布方式：true 在有效投影云层云底附近积分世界空间薄层，false 使用指数高度雾。
   * @default true
   */
  hazeCloudAttached?: boolean;
  /**
   * legacy 局部薄层模式的近地雾密度倍率 [0, 1]；0 仅保留云底薄层，1 恢复完整近地层，不影响指数高度雾。
   * @default 0
   */
  hazeGroundDensityScale?: number;
  /**
   * legacy 局部薄层模式的最大观察距离，必须是正有限米数；只限制薄层可见距离，空路不产生介质。
   * @default 16000
   */
  hazeViewDistance?: number;
  /**
   * legacy 局部薄层模式沿视线累计散射区间的长度上限，必须是正有限米数；按近到远累积，空隙不计入。
   * @default 1200
   */
  hazeVolumeLength?: number;
  /**
   * legacy haze 太阳直射散射增益，非负；0 移除此直射项，不改变介质消光、云体照明或天空补光。
   * @default 8
   */
  hazeDirectLightScale?: number;
  /**
   * legacy haze 积分点数/每点云影采样预算：low=16/1，balanced=24/2，high=32/4；更高预算增加 GPU 开销。
   * @default 'high'
   */
  hazeQuality?: BetterSkyQuality;
  /**
   * legacy haze 垂直密度衰减尺度，必须是正有限米数；指数模式在此高度降至 1/e，局部模式用于薄层厚度控制。
   * @default 1200
   */
  hazeHeightFalloff?: number;
  /**
   * legacy haze 前向散射偏好 g，有限数 [0, 0.9]；0 为各向同性，越大越集中于朝太阳的观察方向。
   * @default 0.55
   */
  hazeAnisotropy?: number;
  /**
   * 大气阴影长度积分上限，必须是正有限米数；legacy 指数模式同时以此限制 haze 光路，局部模式使用其专用距离参数。
   * @default 6000
   */
  maxShadowLengthRayDistance?: number;
  /**
   * legacy haze 日光的三个非负线性 RGB 倍率 [r, g, b]，可大于 1；不是 0–255 的 sRGB 值，不改变云体颜色。
   * @default [1, 0.78, 0.42]
   */
  hazeSunColor?: [number, number, number];
  /** 云体及 legacy haze 的降噪配置，可只覆盖部分字段；默认值见 BetterSkyCloudDenoiseOptions。 */
  denoise?: BetterSkyCloudDenoiseOptions;
}

/** 屏幕空间环境光遮蔽（HBAO）参数，用于增强建筑与地形接触阴影；各数值字段支持 update()。 */
export interface BetterSkyHbaoOptions {
  /**
   * AO 强度指数，建议非负；越大接触遮蔽越深，0 不产生 AO 对比。
   * @default 100
   */
  intensity?: number;
  /**
   * 视空间遮蔽采样邻域的最大半径，单位米；越大影响范围越广，过大可能产生暗边。
   * @default 30
   */
  maxRadius?: number;
  /**
   * 遮蔽切线的角度偏移，单位弧度；增大可减少自遮蔽伪影，也会弱化细小接触阴影。
   * @default 0.1
   */
  bias?: number;
  /**
   * AO 处理的最大相机视空间深度，单位米；超过此深度的远景跳过遮蔽计算。
   * @default 100000
   */
  frustumLength?: number;
  /**
   * AO 调制曲线的输入黑点，建议 [0, 1)，不能设为 1；越大暗部截断越多。
   * @default 0.05
   */
  blackPoint?: number;
  /**
   * AO 调制曲线的输出亮度倍率，建议 [0, 1]；越大被遮蔽部分越亮，0 为黑色。
   * @default 0.9
   */
  whitePoint?: number;
  /**
   * AO 调制曲线的幂指数，正数；越大中间亮度越暗，与场景 gamma 和降噪 varianceGamma 分别控制。
   * @default 2.5
   */
  gamma?: number;
  /**
   * HBAO 双边滤波降噪开关；仅构造时生效，update() 不会重建该配置，与云体降噪分别控制。
   * @default true
   */
  denoise?: boolean;
}

/** BetterSky 公开配置；构造时深合并默认预设，update() 时深合并已有配置，嵌套对象可只传部分字段。 */
export interface BetterSkyOptions {
  /**
   * 是否启用天空效果；运行时切换同时控制已配置的 HBAO、SMAA 和体积光，false 保留配置并暂停效果渲染。
   * @default true
   */
  enabled?: boolean;
  /**
   * 天气云量覆盖度 [0, 1]，越大云区越广；与每层云密度分别控制，约 ≤0.1 时基本无云。
   * @default 0.34
   */
  coverage?: number;
  /**
   * 天气纹理 UV 每秒偏移量 [x, y]，也可传 Cartesian2；绝对值越大移动越快，0 停止，负值反向，不是米/秒。
   * @default [0.0003, 0.0001]
   */
  localWeatherVelocity?: BetterSkyVector2;
  /**
   * HDR 色调映射曲线，数值含义见 BetterSkyToneMappingMode；运行时切换会重建天空渲染阶段。
   * @default 9
   */
  toneMappingMode?: BetterSkyToneMappingMode;
  /**
   * 色调映射前的亮度倍率，建议非负；越大越亮，单位不是曝光档位 EV。
   * @default 2.8
   */
  toneMappingExposure?: number;
  /**
   * 地表辐照度增益，非负倍率；越大地表越亮，与云体补光分别控制，仍受色调映射影响。
   * @default 0.15
   */
  irradianceScale?: number;
  /**
   * 地表大气透视混合强度 [0, 1]；越大远景雾感越强，0 关闭此混合，不改变天空和云的散射。
   * @default 0.15
   */
  aerialPerspectiveStrength?: number;
  /**
   * 夜间天空辉光调制系数，无量纲，建议 [0, 1]；白天通常不明显。
   * @default 0.5
   */
  darkParamY?: number;
  /**
   * 太阳泛光/光晕强度，无量纲，建议非负；越大亮部扩散越明显，0 移除此强度贡献。
   * @default 0.002
   */
  bloomIntensity?: number;
  /** 体积光模式及散射配置；与 legacy haze 路径互斥，默认使用 BetterSkyVolumetricLightOptions 中的预设。 */
  volumetricLight?: BetterSkyVolumetricLightOptions;
  /** 云层、可见性、照明、legacy haze 和降噪配置；各字段默认值见 BetterSkyCloudOptions。 */
  cloud?: BetterSkyCloudOptions;
  /**
   * true 跟随 Cesium 实际太阳方向（由场景时间决定）；false 仅让部分路径使用高级自定义太阳方向，云体与云影仍跟随 Cesium 太阳。
   * 此开关不调节光照强度，建议保持 true。
   * @default true
   */
  systemLight?: boolean;
  /**
   * 构造时是否设置 HDR、对数深度、gamma 和地形深度测试；false 由宿主自行配置。
   * update() 仅以本次调用是否显式为 false 决定是否应用本次 HDR/对数深度/gamma 字段，不沿用先前的 false。
   * @default true
   */
  applySceneSettings?: boolean;
  /**
   * 场景 HDR 开关，true 保留更宽亮度范围供色调映射使用；受本次 applySceneSettings 控制。
   * @default true
   */
  highDynamicRange?: boolean;
  /**
   * 场景对数深度缓冲开关，用于改善远近同框时的深度精度；受本次 applySceneSettings 控制。
   * @default true
   */
  logarithmicDepthBuffer?: boolean;
  /**
   * 场景显示 Gamma，正数；通常增大会提亮中间调，与 HBAO gamma 分别控制，受本次 applySceneSettings 控制。
   * @default 2.2
   */
  gamma?: number;
  /**
   * HBAO 环境光遮蔽：false 关闭，true 在构造时使用底层默认参数，对象覆盖指定参数；数值默认值见 BetterSkyHbaoOptions。
   * 默认启用并使用该参数对象；update() 传 true 重新启用时保留已有数值。
   */
  hbao?: boolean | BetterSkyHbaoOptions;
  /**
   * 最终画面的 SMAA 抗锯齿开关；不替代云体时域降噪，可在运行时切换。
   * @default true
   */
  smaa?: boolean;
  /**
   * Viewer 时钟时间，ISO 8601 字符串，Z 表示 UTC；systemLight=true 时影响太阳角度。
   * 构造时省略此字段会使用默认时间；显式传 null/undefined 保留宿主时间；仅传 Scene 时不设置时钟。
   * update() 省略此字段也保留宿主时间。
   * @default '2026-05-01T06:00Z'
   */
  time?: string | null;
}

/** 高级 Pass 控制；直接修改不会同步 BetterSky 保存的配置，通常优先使用 BetterSky.update()。 */
export interface BetterSkyPass {
  /** 已加入 Cesium 后处理集合的天空合成阶段；销毁宿主实例后不要继续使用缓存的引用。 */
  readonly stage: PostProcessStageComposite | undefined;
  /** Cesium 后处理阶段的就绪状态，不表示全部异步效果资源已经加载完成。 */
  readonly ready: boolean;
  /** Cesium 后处理合成阶段的名称。 */
  readonly name: string;
  /** 天空 Pass 开关；需要联动 HBAO/SMAA 时使用 BetterSky.enabled。 */
  enabled: boolean;
  /** 云量覆盖度 [0, 1]；需要同步失效云历史时使用 BetterSky.coverage 或 update()。 */
  coverage: number;
  /** 色调映射前的亮度倍率，建议非负；不是 EV 档位。 */
  toneMappingExposure: number;
  /**
   * 设置 HDR 色调映射曲线，会重建天空渲染阶段。
   * @param value 色调映射模式：2=Reinhard2、4=Uncharted2、7=AgX、8=Neutral、9=ACES、10=Linear、11=Reinhard、12=Cineon。
   */
  set toneMappingMode(value: BetterSkyToneMappingMode);
  /**
   * 设置地表积雪效果，会重建相关后处理阶段；仅通过 Pass 显式开启，不属于 BetterSky 构造或 update() 配置。
   * @param value true 开启积雪，false 关闭；本访问器仅用于设置，不能用于读取当前状态。
   * @default false
   */
  set showSnow(value: boolean);
  /**
   * 设置雨效（场景闪光及屏幕雨条纹），会重建相关后处理和云阶段；仅通过 Pass 显式开启。
   * @param value true 开启雨效，false 关闭；本访问器仅用于设置，不能用于读取当前状态，不属于 BetterSky 构造或 update() 配置。
   * @default false
   */
  set showRain(value: boolean);
  /** 天气纹理 UV 每秒偏移量；x/y 的正负决定移动方向，均为 0 时停止天气图移动。 */
  localWeatherVelocity: Cartesian2;
  /** 地表大气透视混合强度 [0, 1]，0 关闭此混合，不改变天空和云的散射。 */
  aerialPerspectiveStrength: number;
  /** 相机椭球高度的云量淡出范围 [开始, 消失]，单位米，0 ≤ 开始 < 消失；null 禁用。 */
  cloudAltitudeFadeRange: [number, number] | null;
  /**
   * 局部更新独立体积光配置；变化会失效其历史，切换质量/模式可能重建或释放渲染目标。
   * 此高级入口不执行 BetterSky 构造/update() 的严格参数校验，调用方需保证参数合法。
   * @param options 需要覆盖的体积光字段；未提供字段保留 Pass 当前值，优先通过 BetterSky.update() 保持配置同步。
   */
  setVolumetricLightOptions(options: BetterSkyVolumetricLightOptions): void;
  /** 查询底层天空 Pass 是否已销毁，true 时不能继续使用该 Pass。 */
  isDestroyed(): boolean;
}

/**
 * 为 Cesium 三维地球场景添加天空效果，同页只允许一个活动实例，销毁后可重建。
 * 场景需要 globe、SceneMode.SCENE3D、PerspectiveFrustum，以及 WebGL 2 和所需浮点纹理能力。
 * 浏览器还需支持 Float16Array、structuredClone；切换至不支持的场景模式前先 dispose()。
 */
export declare class BetterSky {
  /** 内置默认预设的独立副本；修改返回对象不会修改内置默认值，可用于读取默认值或生成自定义预设。 */
  static readonly defaultOptions: BetterSkyOptions;
  /**
   * 创建天空效果，将后处理加入场景并注册每帧更新；效果资源异步加载，宿主需持续渲染以驱动云动画。
   * @param viewerOrScene 已创建的 Cesium Viewer 或 Scene；仅传 Scene 时不会设置 Viewer 时钟。
   * @param options 覆盖默认预设的部分配置，嵌套对象深合并、数组整体替换；省略时使用完整默认预设。
   * @throws 场景/浏览器能力不受支持、已有活动实例或受校验的配置不合法时抛出错误。
   */
  constructor(viewerOrScene: Viewer | Scene, options?: BetterSkyOptions);
  /** 底层天空 Pass 的受支持高级控制；dispose() 后为 undefined。 */
  readonly pass: BetterSkyPass | undefined;
  /** 已加入 scene.postProcessStages 的天空合成阶段；dispose() 后为 undefined。 */
  readonly stage: PostProcessStageComposite | undefined;
  /** 天空效果总开关，同时联动已配置的 HBAO/SMAA；false 暂停效果渲染但不释放资源。 */
  enabled: boolean;
  /** 云量覆盖度 [0, 1]，设置后使云历史失效；越大云区越广，与每层云密度分别控制。 */
  coverage: number;
  /** 色调映射前的亮度倍率，建议非负；越大越亮，不是 EV 档位。 */
  toneMappingExposure: number;
  /**
   * 设置 HDR 色调映射曲线，会重建天空渲染阶段。
   * @param value 色调映射模式：2=Reinhard2、4=Uncharted2、7=AgX、8=Neutral、9=ACES、10=Linear、11=Reinhard、12=Cineon。
   */
  set toneMappingMode(value: BetterSkyToneMappingMode);
  /**
   * 设置天气图移动速度。
   * @param value 天气纹理 UV 每秒偏移量 [x, y] 或 Cartesian2；0 停止，负值反向，不是米/秒。
   */
  set localWeatherVelocity(value: BetterSkyVector2);
  /** HBAO 运行时开关；只有 enabled=true 时实际渲染，关闭后保留当前遮蔽数值。 */
  hbaoEnabled: boolean;
  /**
   * 设置 HBAO 遮蔽强度。
   * @param value AO 强度指数，建议非负；越大接触遮蔽越深，0 不产生 AO 对比。
   */
  set hbaoIntensity(value: number);
  /**
   * 设置 HBAO 采样影响范围。
   * @param value 视空间最大采样半径，单位米；越大影响范围越广，过大可能产生暗边。
   */
  set hbaoMaxRadius(value: number);
  /** SMAA 运行时开关，首次启用时按需创建；只有 enabled=true 时实际渲染。 */
  smaaEnabled: boolean;
  /**
   * 设置云底高度并使云历史失效。
   * @param value [第一层, 第二层, 第三层, 预留] 或 Cartesian4，单位米，相对渲染行星表面；第四项约定为 0。
   */
  setCloudAltitudes(value: BetterSkyVector4): void;
  /**
   * 设置云层厚度并使云历史失效。
   * @param value [第一层, 第二层, 第三层, 预留] 或 Cartesian4，单位米；云顶 = 云底 + 厚度，第四项约定为 0。
   */
  setCloudHeights(value: BetterSkyVector4): void;
  /**
   * 设置各层云的密度倍率并使云历史失效。
   * @param value [第一层, 第二层, 第三层, 预留] 或 Cartesian4，建议非负，0 移除对应层介质；第四项约定为 0。
   */
  setCloudDensityScales(value: BetterSkyVector4): void;
  /**
   * 设置云形细节侵蚀并使云历史失效。
   * @param value [第一层, 第二层, 第三层, 预留] 或 Cartesian4，各分量 [0, 1]，越大边缘越破碎；第四项约定为 0。
   */
  setCloudShapeDetailAmounts(value: BetterSkyVector4): void;
  /**
   * 批量局部更新配置，嵌套对象深合并、数组整体替换；未提供字段保留已有值。
   * 部分便捷 setter（如 coverage、toneMappingExposure）仅写 Pass，不回写保存的配置；需要合并选项时统一使用本方法。
   * @param options 本次需要覆盖的字段，省略为不改参数；含 haze* 且未显式指定 mode 时切到 legacy，场景设置规则见 applySceneSettings。
   * @throws 实例已销毁、运行场景已不受支持或受校验的配置不合法时抛出错误。
   */
  update(options?: BetterSkyOptions): void;
  /**
   * 移除每帧回调、移除并销毁自有后处理和 GPU 资源；可重复调用，必须在销毁宿主 Viewer 前调用。
   * 请求不主动中止，销毁后迟到的资源回调跳过 GPU 创建；不承诺还原时钟、HDR、gamma、对数深度等全部宿主设置。
   */
  dispose(): void;
}

export default BetterSky;
