import type { Cartesian2, Cartesian4, PostProcessStageComposite, Scene, Viewer } from 'cesium';

export type BetterSkyVector2 = [number, number] | Cartesian2;
export type BetterSkyVector4 = [number, number, number, number] | Cartesian4;
export type BetterSkyQuality = 'low' | 'balanced' | 'high';
export type BetterSkyCloudType = 'cumulus' | 'altocumulus' | 'cirrus';
/** 7 AgX, 8 Neutral, 9 ACES, 10 Linear, 11 Reinhard, 12 Cineon. */
export type BetterSkyToneMappingMode = 7 | 8 | 9 | 10 | 11 | 12;

export interface BetterSkyVolumetricLightOptions {
  mode?: 'volumetric' | 'legacy' | 'off';
  /** Nonnegative extinction density, in inverse metres. */
  density?: number;
  intensity?: number;
  /** Positive distance in metres. */
  layerDepth?: number;
  maxDistance?: number;
  /** Forward scattering factor in [0, 0.9]. */
  anisotropy?: number;
  quality?: BetterSkyQuality;
}

export interface BetterSkyCloudDenoiseOptions {
  temporalAlpha?: number;
  currentFrameAlpha?: number;
  motionAlpha?: number;
  varianceGamma?: number;
  spatialFilterStrength?: number;
}

export interface BetterSkyCloudOptions {
  /** Camera ellipsoid heights [start, end], in metres; null disables fading. */
  altitudeFadeRange?: [number, number] | null;
  layerTypes?: [BetterSkyCloudType, BetterSkyCloudType, BetterSkyCloudType] | null;
  /** Camera distances [near, far], in metres; null disables LOD. */
  lodRange?: [number, number] | null;
  altitudes?: BetterSkyVector4;
  heights?: BetterSkyVector4;
  densityScales?: BetterSkyVector4;
  shapeDetailAmounts?: BetterSkyVector4;
  skyIrradianceScale?: number;
  groundIrradianceScale?: number;
  hazeDensityScale?: number;
  hazeCloudAttached?: boolean;
  hazeGroundDensityScale?: number;
  hazeViewDistance?: number;
  hazeVolumeLength?: number;
  hazeDirectLightScale?: number;
  hazeQuality?: BetterSkyQuality;
  hazeHeightFalloff?: number;
  hazeAnisotropy?: number;
  maxShadowLengthRayDistance?: number;
  hazeSunColor?: [number, number, number];
  denoise?: BetterSkyCloudDenoiseOptions;
}

export interface BetterSkyHbaoOptions {
  intensity?: number;
  maxRadius?: number;
  bias?: number;
  frustumLength?: number;
  blackPoint?: number;
  whitePoint?: number;
  gamma?: number;
}

export interface BetterSkyOptions {
  enabled?: boolean;
  coverage?: number;
  localWeatherVelocity?: BetterSkyVector2;
  toneMappingMode?: BetterSkyToneMappingMode;
  toneMappingExposure?: number;
  irradianceScale?: number;
  aerialPerspectiveStrength?: number;
  darkParamY?: number;
  bloomIntensity?: number;
  volumetricLight?: BetterSkyVolumetricLightOptions;
  cloud?: BetterSkyCloudOptions;
  systemLight?: boolean;
  applySceneSettings?: boolean;
  highDynamicRange?: boolean;
  logarithmicDepthBuffer?: boolean;
  gamma?: number;
  hbao?: boolean | BetterSkyHbaoOptions;
  smaa?: boolean;
  /** ISO 8601 time. null/undefined preserves the host Viewer clock. */
  time?: string | null;
}

/** Supported advanced pass controls; internal GPU implementation is intentionally opaque. */
export interface BetterSkyPass {
  readonly stage: PostProcessStageComposite | undefined;
  readonly ready: boolean;
  readonly name: string;
  enabled: boolean;
  coverage: number;
  toneMappingExposure: number;
  set toneMappingMode(value: BetterSkyToneMappingMode);
  localWeatherVelocity: Cartesian2;
  aerialPerspectiveStrength: number;
  cloudAltitudeFadeRange: [number, number] | null;
  setVolumetricLightOptions(options: BetterSkyVolumetricLightOptions): void;
  isDestroyed(): boolean;
}

/** One active instance per page. Requires a 3D Globe scene with a perspective camera. */
export declare class BetterSky {
  static readonly defaultOptions: BetterSkyOptions;
  constructor(viewerOrScene: Viewer | Scene, options?: BetterSkyOptions);
  readonly pass: BetterSkyPass | undefined;
  readonly stage: PostProcessStageComposite | undefined;
  enabled: boolean;
  coverage: number;
  toneMappingExposure: number;
  set toneMappingMode(value: BetterSkyToneMappingMode);
  set localWeatherVelocity(value: BetterSkyVector2);
  hbaoEnabled: boolean;
  set hbaoIntensity(value: number);
  set hbaoMaxRadius(value: number);
  smaaEnabled: boolean;
  setCloudAltitudes(value: BetterSkyVector4): void;
  setCloudHeights(value: BetterSkyVector4): void;
  setCloudDensityScales(value: BetterSkyVector4): void;
  setCloudShapeDetailAmounts(value: BetterSkyVector4): void;
  update(options?: BetterSkyOptions): void;
  /** Safe to call repeatedly; call before destroying the host Viewer. */
  dispose(): void;
}

export default BetterSky;
