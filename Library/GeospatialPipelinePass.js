/**
 * @description HDR后场景效果合并
 */

import { 
    PixelDatatype,
    defined,
    PostProcessStageSampleMode,
    PostProcessStageComposite,
    Matrix4,
    ClearCommand,
    Color,
    Pass,
    Framebuffer,
    VertexArray,
    BufferUsage,
    ShaderProgram,
    RenderState,
    DrawCommand,
    ComputeCommand,
    Geometry,
    GeometryAttributes,
    ComponentDatatype,
    GeometryAttribute,
    Texture,
    Appearance,
    Sampler,
    WebGLConstants,
    Cartesian4,
    PixelFormat,
    Cartesian3,
    TextureMinificationFilter,
    TextureMagnificationFilter,
    Cartographic,
    Ellipsoid,
    SceneTransforms,
    createGuid,
    PassState,
    PrimitiveType,
    Transforms,
    Simon1994PlanetaryPositions,
    Matrix3,
    Resource,
    buildModuleUrl,
    Cartesian2,
    destroyObject,
    TextureWrap,
    BoundingRectangle,
    ShaderSource,
    JulianDate
 } from "cesium";
import * as Cesium from "cesium";
const defaultValue = (a, b) => a ?? b; // 官方 Cesium 不导出 defaultValue
defaultValue.EMPTY_OBJECT = Object.freeze({});
import Texture3D from "./Texture3D.js";
import { AerialPerspectiveEffectFS, AerialPerspectiveEffectVS } from "./geospatial/AerialPerspectiveEffect.js";
import { parseInt8Array, parseUint8Array } from "./geospatial/typedArrayParsers.js";
import { createData3DTextureLoaderClass } from "./geospatial/PrecomputedDataLoader.js";
import ShadowMaterialPass from "./geospatial/ShadowMaterialPass.js";
import CloudMaterialPass from "./geospatial/CloudsMaterialPass.js";
import FocusedCloudShadowPass from "./geospatial/FocusedCloudShadowPass.js";
import VolumetricLightPass, { volumetricLightCompositeGLSL } from "./geospatial/VolumetricLightPass.js";
import { downsampleThresholdMaterial, downsampleThresholdMaterialFS, downsampleThresholdMaterialVS } from "./geospatial/downsampleThresholdMaterial.js";
import { downsamplingMaterial } from "./geospatial/downsamplingMaterial.js";
import { upsamplingMaterial } from "./geospatial/upsamplingMaterial.js";
import { kawaseBlurMaterial } from "./geospatial/kawaseBlurMaterial.js";
import { copysamplingMaterial } from "./geospatial/copysamplingMaterial.js";
import { lensFlareFeaturesMaterial } from "./geospatial/lensFlareFeaturesMaterial.js";
import { applyBloomMaterial } from "./geospatial/applyBloomMaterial.js";
import AtmosphereParameters from "./geospatial/AtmosphereParameters.js";
import PrecomputedTexturesLoader from "./geospatial/PrecomputedTexturesLoader.js";
import RenderPass from "./PostProcessStage.js";
import geospatialPipelineDefaultDefines from "./shaders/postprocess/geospatialPipelineDefaults.glsl?raw";
import geospatialPipelineFragmentShader from "./shaders/postprocess/geospatialPipeline.frag.glsl?raw";

import {
    CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
    CLOUD_SHAPE_TEXTURE_SIZE,
    IRRADIANCE_TEXTURE_HEIGHT,
    IRRADIANCE_TEXTURE_WIDTH,
    METER_TO_LENGTH_UNIT,
    SCATTERING_TEXTURE_MU_S_SIZE,
    SCATTERING_TEXTURE_MU_SIZE,
    SCATTERING_TEXTURE_NU_SIZE,
    SCATTERING_TEXTURE_R_SIZE,
    STBN_TEXTURE_DEPTH,
    STBN_TEXTURE_HEIGHT,
    STBN_TEXTURE_WIDTH,
    TRANSMITTANCE_TEXTURE_HEIGHT,
    TRANSMITTANCE_TEXTURE_WIDTH
} from './geospatial/AtmosphereConstants.js';
import { 
    LinearFilter,
    NoColorSpace,
    NearestFilter,
    RedFormat,
    RepeatWrapping,
 } from "three";
Cartesian2.prototype.set = function (x, y) {
    this.x = x; this.y = y;
    return this;
}
Cartesian2.prototype.copy = function (src) {
    this.x = src.x; this.y = src.y;
    return this;
}
Cartesian3.prototype.set = function (x, y, z) {
    this.x = x; this.y = y; this.z = z;
    return this;
}
Cartesian3.prototype.copy = function (src) {
    this.x = src.x; this.y = src.y; this.z = src.z;
    return this;
}
Cartesian3.prototype.dot = function (right) {
    return this.x * right.x + this.y * right.y + this.z * right.z;
};
Cartesian3.prototype.toArray = function (right) {
    return [this.x, this.y, this.z];
};
Cartesian3.prototype.applyMatrix4 = function (matrix4) {
    const x = this.x, y = this.y, z = this.z;
    const e = matrix4;

    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;

    return this;
};
Cartesian4.prototype.set = function (x, y, z, w) {
    this.x = x; this.y = y; this.z = z, this.w = w;
    return this;
}
Cartesian4.prototype.copy = function (src) {
    this.x = src.x; this.y = src.y; this.z = src.z, this.w = src.w;
    return this;
}
Cartesian4.prototype.dot = function (right) {
    return this.x * right.x + this.y * right.y + this.z * right.z + this.w * right.w;
};
Cartesian4.prototype.toArray = function () {
    return [this.x, this.y, this.z, this.w];
};
Matrix4.prototype.copy = function (matrix) {
    if (!defined(matrix)) {
        return undefined;
    }
    const result = this;
    result[0] = matrix[0];
    result[1] = matrix[1];
    result[2] = matrix[2];
    result[3] = matrix[3];
    result[4] = matrix[4];
    result[5] = matrix[5];
    result[6] = matrix[6];
    result[7] = matrix[7];
    result[8] = matrix[8];
    result[9] = matrix[9];
    result[10] = matrix[10];
    result[11] = matrix[11];
    result[12] = matrix[12];
    result[13] = matrix[13];
    result[14] = matrix[14];
    result[15] = matrix[15];
    return result;
};


// 缓存向量，避免频繁创建对象
const vectorScratch = new Cartesian3();
const vectorScratch2 = new Cartesian3();
const vector2Scratch = new Cartesian2();
const vector3Scratch = new Cartesian3();
function saturate(x) {
    return Math.min(Math.max(x, 0), 1)
}
function remap(value, inMin, inMax, outMin, outMax) {
    return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

// 复用临时变量
const normalScratch = new Cartesian3();
const scaledNormalScratch = new Cartesian3();
/**
 * 计算密贴球的球心位置
 * @param {Cartesian3} surfacePosition - 椭球表面上的某个位置
 * @param {number} radius - 沿地表法线方向向内偏移的距离
 * @param {Cartesian3} [result] - 用于接收输出的对象（可选）
 * @returns {Cartesian3} 球心位置
 */
export function getOsculatingSphereCenter(
    surfacePosition,
    radius,
    result = new Cartesian3()
) {
    const ellipsoid = Ellipsoid.WGS84;

    // 获取表面法线（单位向量）
    const normal = ellipsoid.geodeticSurfaceNormal(surfacePosition, normalScratch);

    // 法线方向乘以 -radius，表示向地心方向偏移
    const scaledNormal = Cartesian3.multiplyByScalar(normal, -radius, scaledNormalScratch);

    // 球心 = 表面点 + 偏移量
    return Cartesian3.add(surfacePosition, scaledNormal, result);
}

/**
 * 计算海拔修正偏移
 * @param {Cartesian3} cameraPosition - 相机位置
 * @param {number} bottomRadius - 球体半径（例如大气层内球）
 * @param {Ellipsoid} ellipsoid - 使用的椭球体，默认 WGS84
 * @param {Cartesian3} result - 用于接收输出的对象
 * @param {boolean} clipToSurface - 是否限制只能在地表上修正（默认 true）
 * @returns {Cartesian3} 偏移后的位置
 */
export function getAltitudeCorrectionOffset(
    cameraPosition,
    bottomRadius,
    ellipsoid = Ellipsoid.WGS84,
    result = new Cartesian3(),
    clipToSurface = true
) {
    // 将相机投影到地表
    const surfacePosition = ellipsoid.scaleToGeodeticSurface(cameraPosition, vectorScratch);

    if (!surfacePosition) {
        // 如果相机在地心或椭球内不合法位置，返回零向量
        return Cartesian3.clone(Cartesian3.ZERO, result);
    }

    // 判断使用哪个点计算球心（如果不 clip 或 相机低于地表，就用 surface）
    const useSurface =
        !clipToSurface ||
            Cartesian3.magnitudeSquared(surfacePosition) < Cartesian3.magnitudeSquared(cameraPosition)
            ? surfacePosition
            : cameraPosition;
    return getOsculatingSphereCenter(useSurface, bottomRadius, result);
}

// 默认配置（注意：JS 中没有 satisfies 检查，这里仅保留默认值对象）
export const aerialPerspectiveEffectOptionsDefaults = {
    // blendFunction: BlendFunction.NORMAL,
    octEncodedNormal: false,
    reconstructNormal: false,
    ellipsoid: Ellipsoid.WGS84,
    correctAltitude: true,
    correctGeometricError: true,
    photometric: true,
    sunIrradiance: false,
    skyIrradiance: false,
    transmittance: true,
    inscatter: true,
    irradianceScale: 1,
    sky: false,
    sun: true,
    moon: true,
    moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
    lunarRadianceScale: 1
}

let scratchIcrfToFixed = new Matrix3();
let scratchPoint3 = new Cartesian3();
const transformMatrix = new Matrix3();
const scratchJulianDate = new JulianDate();
const scratchFieldColor = new Cartesian4(0, 0, 0, 0);
export default class GeospatialPipelinePass {

    constructor(scene, options, atmosphere = AtmosphereParameters.DEFAULT) {
        // 合并默认参数与传入的参数
        const {
            blendFunction,
            normalBuffer = null,
            octEncodedNormal,
            reconstructNormal,
            irradianceTexture = null,
            scatteringTexture = null,
            transmittanceTexture = null,
            ellipsoid = Ellipsoid.WGS84,
            correctAltitude,
            correctGeometricError,
            photometric,
            sunDirection,
            sunIrradiance,
            skyIrradiance,
            transmittance,
            inscatter,
            irradianceScale,
            sky,
            sun,
            moon,
            moonDirection,
            moonAngularRadius,
            lunarRadianceScale
        } = {
            ...aerialPerspectiveEffectOptionsDefaults,
            ...options
        }
        this._scene = scene;
        this._destroyed = false;
        // Track only textures allocated by this pass; uniforms may also reference host textures.
        this._ownedTextures = new Set();
        this.id = createGuid();
        this._showTAA = false;
        this._show = options.show ?? true;
        this._showSSR = options.showSSR ?? true;
        this._showFields = options.showFields ?? false;
        this._showTranslucent = options.showTranslucent ?? true;
        this._showGSMask = options.showGSMask ?? false;
        this._sunCull = options.sunCull ?? false;
        this._showDrakLight = options.showDrakLight ?? true;
        this._showRain = options.showRain ?? false;
        this._showSnow = options.showSnow ?? false;

        this._resolution = new Cartesian3(0, 0, 1);
        this._sunPosPC = new Cartesian2(0, 0);
        this._moonPosPC = new Cartesian2(0, 0);
        this._globeNormal = new Cartesian3(0, 0, 0);
        this._moonPositionWC = new Cartesian3(0, 0, 0)
        this._time = 0;
        this._dynamicPlanet = true;
        this._planetRadius = 6360000.0;
        this._defaultTexture3D = new Texture3D({
            context: this._scene.context,
            width: 1,
            height: 1,
            depth: 1,
            source: {
                width: 1,
                height: 1,
                depth: 1,
                arrayBufferView: new Uint8Array([255, 255, 255, 255])
            },
            flipY: false
        });
        this._ownedTextures.add(this._defaultTexture3D);
        this._u_irradiance_texture = this._scene.context.defaultTexture;
        this._u_scattering_texture = this._defaultTexture3D;
        this._u_single_mie_scattering_texture = this._defaultTexture3D;
        this._u_transmittance_texture = this._scene.context.defaultTexture;
        this.localWeatherTexture = this._scene.context.defaultTexture;
        this.cameraHeight = 0.;
        this.toneMappingExposure = 10;
        this.whitePoint = 1.;
        this.middleGrey = 0.6
        this.averageLuminance = 0.01;
        this._toneMappingMode = 7;
        // cloud and shadow
        this.coverage = 0.3;
        this.cloudAltitudeFadeRange = null;
        this.cloudVisibility = 1;
        this.effectiveCloudCoverage = this.coverage;
        this.turbulenceTexture = this._scene.context.defaultTexture;
        this.shapeTexture = this._defaultTexture3D;
        this.shapeDetailTexture = this._defaultTexture3D;
        this.stbnTexture = this._defaultTexture3D;
        this.localWeatherRepeat = new Cartesian2(100, 100);
        this.localWeatherOffset = new Cartesian2(0.0, 0.0);
        this.shapeRepeat = new Cartesian3(0.0003, 0.0003, 0.0003);
        this.shapeOffset = new Cartesian3(0.0, 0.0, 0.0);
        this.shapeDetailRepeat = new Cartesian3(0.006, 0.006, 0.006);
        this.shapeDetailOffset = new Cartesian3(0.0, 0.0, 0.0);
        this.turbulenceRepeat = new Cartesian2(20, 20);
        this.localWeatherVelocity = new Cartesian2(0.001, 0.0)
        this.shapeVelocity = new Cartesian3()
        this.shapeDetailVelocity = new Cartesian3()
        this.turbulenceDisplacement = 350;
        this.scatteringCoefficient = 1;
        this.absorptionCoefficient = 0;
        this._snowCoverParam = new Cartesian4(0.5, 100., 10, -999.); // 范围 厚度 密度
        this._weatherParam = new Cartesian4(10.0, 0.0, 0.01, 60.0); // 雨水流 下雨 雨量 雨速
        this._weatherParam2 = new Cartesian4(1.0, 0.02, 0, 0); // 屏幕雨 涟漪强度
        this._bottomRadius = atmosphere.bottomRadius;
        this._ellipsoidRadii = new Cartesian3();
        this._ellipsoidCenter = new Cartesian3();
        this._inverseEllipsoidMatrix = new Matrix4();
        this._altitudeCorrection = new Cartesian3();
        this._sunDirection = sunDirection?.clone() ?? new Cartesian3();
        this._irradianceScale = irradianceScale;
        this.aerialPerspectiveStrength = 1;
        this._idealSphereAlpha = 0;
        this._moonPositionWC = new Cartesian3();
        this._moonDirection = moonDirection?.clone() ?? new Cartesian3();
        this._moonAngularRadius = moonAngularRadius;
        this._lunarRadianceScale = lunarRadianceScale;
        this._ghostAmount = 0.002;
        this._haloAmount = 0.005;
        this._chromaticAberration = 10;
        this._thresholdLevel = 10;
        this._thresholdRange = 1;
        this._bloomBlendOpacity = 1;
        this._bloomIntensity = 0.008;
        // Composition and shadow
        this._overlayBuffer = null;
        this._shadowBuffer = null;
        this._shadowMapSize = new Cartesian3();
        this._shadowIntervals = [];
        this._shadowMatrices = [];
        this._inverseShadowMatrices = [];
        this._shadowFar = 0;
        this._shadowTopHeight = 0;
        this._shadowRadius = 3;
        this._frame = 0;
        this._shadowLengthBuffer = null;
        // Uniforms for atmosphere functions
        this._u_solar_irradiance = atmosphere.solarIrradiance;
        this._u_sun_angular_radius = atmosphere.sunAngularRadius;
        this._u_bottom_radius = atmosphere.bottomRadius * METER_TO_LENGTH_UNIT;
        this._u_top_radius = atmosphere.topRadius * METER_TO_LENGTH_UNIT;
        this._u_rayleigh_scattering = atmosphere.rayleighScattering;
        this._u_mie_scattering = atmosphere.mieScattering;
        this._u_mie_phase_function_g = atmosphere.miePhaseFunctionG;
        this._u_mu_s_min = atmosphere.muSMin;
        this._u_max_rayleigh_shadow_length = 10000 * METER_TO_LENGTH_UNIT;

        this._systemLight = defaultValue(options.systemLight, true);
        this._scene.context.uniformState.sunPositionWC2 = new Cartesian3(57848520396.59603, 134403446914.8757, -22823453895.737892);
        this._scene.context.uniformState.sunDirectionWC2 = new Cartesian3(0.39062193129550293, 0.9075588043864757, -0.15411529246496697);
        this._ellipsoidRadii = ellipsoid._radii;
        this._ellipsoidCenter = new Cartesian3();
        this._altitudeCorrection = new Cartesian3();
        this._inverseEllipsoidMatrix = new Matrix4();
        // strength roughnessFactor reflectionSpecularFalloffExponent
        this._ssrParam = new Cartesian4(1, 0.01, 2, 0.);
        this._customDarkParam = new Cartesian4(10, 0.1, 0, 0.);
        let shadowResolutionScratch = new Cartesian2();
        this.aerialPerspectiveUniforms = {
            // 官方 Cesium 无 GBuffer 法线/位置贴图：法线退化为默认贴图（地表光照近似），
            // 位置在着色器中由深度重建（czm_windowToEyeCoordinates），这里仅占位避免空引用。
            normalBuffer: () => {
                return this._scene.context.defaultTexture;
            },
            positionTexture: () => {
                return this._scene.context.defaultTexture;
            },
            projectionMatrix: () => { return this._scene.context.uniformState.projection },
            viewMatrix: () => { return this._scene.context.uniformState.view },
            inverseProjectionMatrix: () => { return this._scene.context.uniformState.inverseProjection },
            inverseViewMatrix: () => { return this._scene.context.uniformState.inverseView },
            cameraPosition: () => { return this._scene.context.uniformState._cameraPosition },
            bottomRadius: () => { return atmosphere.bottomRadius },
            ellipsoidRadii: () => { return this._ellipsoidRadii },
            ellipsoidCenter: () => { return this._ellipsoidCenter },
            inverseEllipsoidMatrix: () => { return this._inverseEllipsoidMatrix },
            altitudeCorrection: () => { return this._altitudeCorrection },
            sunDirection: () => {
                if (this._systemLight) {
                    return this._scene.context.uniformState.sunDirectionWC;
                }
                return this._scene.context.uniformState.sunDirectionWC2;
            },
            irradianceScale: () => { return this._irradianceScale },
            aerialPerspectiveStrength: () => this.aerialPerspectiveStrength,
            cloudVisibility: () => this.cloudVisibility,
            idealSphereAlpha: () => { return this._idealSphereAlpha },
            moonDirection: () => { return this._scene.context.uniformState.moonDirectionEC },
            moonAngularRadius: () => { return this._moonAngularRadius },
            lunarRadianceScale: () => { return this._lunarRadianceScale },
            // Composition and shadow
            shadowLengthBuffer: () => { return this.cloudMaterialPass._shadowResolveLengthHistoryBuffer },
            shadowBuffer: () => { return this.shadowMaterialPass._historyBuffer },
            shadowMapSize: () => { return shadowResolutionScratch.set(this.shadowMaterialPass.shadowMapSize.x, this.shadowMaterialPass.shadowMapSize.y) },
            shadowIntervals: () => { return this.cloudMaterialPass.shadowIntervals },
            shadowMatrices: () => { return this.cloudMaterialPass.shadowMatrices },
            inverseShadowMatrices: () => { return this.shadowMaterialPass.inverseShadowMatrices },
            reprojectionMatrices: () => { return this.shadowMaterialPass.reprojectionMatrices },
            shadowFar: () => { return this.cloudMaterialPass.shadowFar },
            maxShadowFilterRadius: () => { return this.cloudMaterialPass.maxShadowFilterRadius },
            shadowTopHeight: () => { return this.shadowMaterialPass.shadowTopHeight },
            shadowRadius: () => { return this._shadowRadius },
            stbnTexture: () => { return this.stbnTexture },
            frame: () => { return this._frame },
            // Uniforms for atmosphere functions
            u_solar_irradiance: () => { return atmosphere.solarIrradiance },
            u_sun_angular_radius: () => { return atmosphere.sunAngularRadius },
            u_bottom_radius: () => { return atmosphere.bottomRadius * METER_TO_LENGTH_UNIT },
            u_top_radius: () => { return atmosphere.topRadius * METER_TO_LENGTH_UNIT },
            u_rayleigh_scattering: () => { return atmosphere.rayleighScattering },
            u_mie_scattering: () => { return atmosphere.mieScattering },
            u_mie_phase_function_g: () => { return atmosphere.miePhaseFunctionG },
            u_mu_s_min: () => { return atmosphere.muSMin },
            u_max_rayleigh_shadow_length: () => { return this._u_max_rayleigh_shadow_length },
            u_irradiance_texture: () => { return this._u_irradiance_texture },
            u_scattering_texture: () => { return this._u_scattering_texture },
            u_single_mie_scattering_texture: () => { return this._u_single_mie_scattering_texture },
            u_transmittance_texture: () => { return this._u_transmittance_texture },
            u_customDarkParam: () => { return this._customDarkParam; },
            cameraNear: () => { return this.shadowMaterialPass.shadowNear },
            overlayBuffer: () => { return this.cloudMaterialPass._colorResolveHistoryBuffer },
            resolution: () => { return shadowResolutionScratch.set(this._resolution.x, this._resolution.y) },
            globeNormal: () => { return this._globeNormal },
            cameraHeight: () => { return this.cameraHeight },
            depthTexture: () => { return this._depthTexture },
            colorTexture: () => { return this._colorTexture },
            snowCoverParam: () => { return this._snowCoverParam },
            snowCoverMaskMap: () => { return this._snowCoverMaskMap; },
            weatherParam: () => { return this._weatherParam },
            weatherParam2: () => { return this._weatherParam2 },
        }
        // 直接赋值、删除装饰器语法
        this.octEncodedNormal = octEncodedNormal
        this.reconstructNormal = reconstructNormal
        this.ellipsoid = ellipsoid
        this.correctAltitude = correctAltitude
        this.correctGeometricError = correctGeometricError
        this.photometric = photometric
        this.sunIrradiance = sunIrradiance
        this.skyIrradiance = skyIrradiance
        this.transmittance = transmittance
        this.inscatter = inscatter
        this.sky = sky
        this.sun = sun
        this.moon = moon

        this.camera = this._scene.camera;
        this.atmosphere = atmosphere;

        // 内部属性
        this.ellipsoidMatrix = Matrix4.clone(Matrix4.IDENTITY)
        this.overlay = null
        this.shadow = null
        this.shadowLength = null
        this._isPrecomputed = false;
        this.time = Date.now();
        this.lastFrameTime = this.time;
        this.frameTime = 0;
        this.shadowMaterialPass = new ShadowMaterialPass(scene, {
            show: true,
            pipeline: this
        })
        this.cloudMaterialPass = new CloudMaterialPass(scene, {
            show: true,
            pipeline: this
        })
        // Standalone callers keep legacy haze until the public pipeline selects a mode.
        this.volumetricLightOptions = { mode: "legacy" };
        this.focusedCloudShadowPass = new FocusedCloudShadowPass(scene, { pipeline: this });
        this.volumetricLightPass = new VolumetricLightPass(scene, {
            pipeline: this,
            shadowPass: this.focusedCloudShadowPass,
        });
        Object.assign(this.aerialPerspectiveUniforms, this.volumetricLightPass.uniformMap);
        this.aerialPerspectiveUniforms.u_volumetricLightEnabled = () =>
            this.volumetricLightOptions.mode === "volumetric" && this.cloudVisibility > 0 &&
            this.volumetricLightPass.ready;
        this.init();
    }

    setVolumetricLightOptions(options) {
        const previousMode = this.volumetricLightOptions.mode;
        this.volumetricLightOptions = { ...this.volumetricLightOptions, ...options };
        this.volumetricLightPass.setOptions(this.volumetricLightOptions);
        if (this.volumetricLightOptions.mode !== "volumetric") {
            this.focusedCloudShadowPass.releaseResources();
        }
        if (previousMode !== this.volumetricLightOptions.mode) {
            this.cloudMaterialPass.invalidateHistory();
        }
    }

    set toneMappingMode(mode) {
        if (mode === this._toneMappingMode) return;
        this._toneMappingMode = mode;
        this.init(true);
    }
    set showSSR(mode) {
        this._showSSR = mode;
        this.init(true);
    }
    set showDrakLight(mode) {
        this._showDrakLight = mode;
        this.init(true);
        // 更新云
        this.cloudMaterialPass && this.cloudMaterialPass.init(true)
    }
    set showSnow(mode) {
        this._showSnow = mode;
        this.init(true);
    }
    set showRain(mode) {
        this._showRain = mode;
        this.init(true);
        // 更新云
        this.cloudMaterialPass && this.cloudMaterialPass.init(true)
    }

    set sunCull(mode) {
        this._sunCull = mode;
        this.init(true);
        // 更新云
        this.cloudMaterialPass && this.cloudMaterialPass.init(true)
    }

    init(isUpdate = false) {
        if (this._destroyed) return;

        let stageIndex;
        if (isUpdate && defined(this._stage)) {
            const pps = this._scene.postProcessStages;
            if (typeof pps.contains === "function" && pps.contains(this._stage)) {
                stageIndex = this._stage._index;
                pps.remove(this._stage); // remove() 内部会销毁该 stage
            } else if (!this._stage.isDestroyed()) {
                this._stage.destroy();
            }
            this._stage = undefined;
        }

        // 创建渲染程序
        if (defined(this._stage)) {
            return false;
        }
        // These resources are outside the composite and must be released on every rebuild.
        this._releaseThresholdResources();
        const context = this._scene.context;
        let defines = geospatialPipelineDefaultDefines.replace("__GS_MASK_DEFINE__", this._showGSMask ? "#define HAS_GS_MASK" : "");
        this._showSSR && (defines += `#define ENABLE_SSR\n`);
        this._showFields && (defines += `#define ENABLE_FIELDS\n`);
        this._sunCull && (defines += `#define SUNLIGHT_CULL\n`);
        this._showDrakLight && (defines += `#define DARKLIGHT\n`);
        this._showSnow && (defines += `#define ENABLE_SNOWEFFECT\n`);
        this._showRain && (defines += `#define ENABLE_THUNDERCLOUDS\n`);

        defines += '#define TRANSMITTANCE_TEXTURE_WIDTH ' + TRANSMITTANCE_TEXTURE_WIDTH.toFixed(0) + '\n';
        defines += '#define TRANSMITTANCE_TEXTURE_HEIGHT ' + TRANSMITTANCE_TEXTURE_HEIGHT.toFixed(0) + '\n';
        defines += '#define SCATTERING_TEXTURE_R_SIZE ' + SCATTERING_TEXTURE_R_SIZE.toFixed(0) + '\n';
        defines += '#define SCATTERING_TEXTURE_MU_SIZE ' + SCATTERING_TEXTURE_MU_SIZE.toFixed(0) + '\n';
        defines += '#define SCATTERING_TEXTURE_MU_S_SIZE ' + SCATTERING_TEXTURE_MU_S_SIZE.toFixed(0) + '\n';
        defines += '#define SCATTERING_TEXTURE_NU_SIZE ' + SCATTERING_TEXTURE_NU_SIZE.toFixed(0) + '\n';
        defines += '#define IRRADIANCE_TEXTURE_WIDTH ' + IRRADIANCE_TEXTURE_WIDTH.toFixed(0) + '\n';
        defines += '#define IRRADIANCE_TEXTURE_HEIGHT ' + IRRADIANCE_TEXTURE_HEIGHT.toFixed(0) + '\n';
        defines += '#define METER_TO_LENGTH_UNIT ' + METER_TO_LENGTH_UNIT.toFixed(7) + '\n';
        defines += '#define SUN_SPECTRAL_RADIANCE_TO_LUMINANCE ' + `vec3(${this.atmosphere.sunRadianceToRelativeLuminance.toArray().map(v => v.toFixed(12)).join(',')})` + '\n';
        defines += '#define SKY_SPECTRAL_RADIANCE_TO_LUMINANCE ' + `vec3(${this.atmosphere.skyRadianceToRelativeLuminance.toArray().map(v => v.toFixed(12)).join(',')})` + '\n';

        // 预处理gbuffer定义
        if (context.renderGBuffer) {
            if (context.renderGBufferTexture) {
                defines += `#define HAS_M3D_GUFFER_TEXTURE\n`;
            }
            if (context.renderGBufferTexture2) {
                defines += `#define HAS_M3D_GUFFER_TEXTURE2\n`;
            }
        }


        if (this._width !== this._scene.drawingBufferWidth ||
            this._height !== this._scene.drawingBufferHeight
        ) {
            this._width = this._scene.drawingBufferWidth;
            this._height = this._scene.drawingBufferHeight;

            this._releaseAerialRenderTarget();
            if (!this._passState) {
                this._passState = new PassState(this._scene.context);
            }
            this._aerialPerspectiveOutputColor = new Texture({
                context: this._scene.context,
                width: this._width,
                height: this._height,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._passState.viewport = new BoundingRectangle(0, 0, this._width, this._height);
            this._passState.framebuffer = new Framebuffer({
                context: this._scene.context,
                colorTextures: [this._aerialPerspectiveOutputColor],
                destroyAttachments: false,
            })
        }
        if (!this._snowCoverMaskMap && this._showSnow) {
            this._snowCoverMaskMap = this._scene.context.defaultTexture;
            Resource.createIfNeeded(buildModuleUrl("BetterSkyAssets/snowCoverMask.png")).fetchImage().then(image => {
                if (this._destroyed) return;
                this._snowCoverMaskMap = new Texture({
                    context: this._scene.context,
                    source: image,
                    width: image.width,
                    height: image.height,
                    sampler: new Sampler({
                        wrapS: WebGLConstants.REPEAT,
                        wrapT: WebGLConstants.REPEAT,
                        minificationFilter: WebGLConstants.LINEAR,
                        magnificationFilter: WebGLConstants.LINEAR,
                    })
                })
                this._ownedTextures.add(this._snowCoverMaskMap);
            }).catch(error => {
                if (!this._destroyed) console.error(error);
            });
        }
        const gl = this._scene.context._gl;
        if (this._aerialPerspectiveComoman) {
            this._aerialPerspectiveComoman.shaderProgram = this._aerialPerspectiveComoman.shaderProgram?.destroy();
        }
        const AerialPerspectiveEffectShader = new ShaderSource({
            defines: ["LOG_DEPTH"],
            sources: [defines + "\n" + AerialPerspectiveEffectFS.replace("/*__VOLUMETRIC_LIGHT_COMPOSITE__*/", volumetricLightCompositeGLSL)]
        });
        this._aerialPerspectiveComoman = this._scene.context.createViewportQuadCommand(AerialPerspectiveEffectShader, {
            uniformMap: this.aerialPerspectiveUniforms,
            primitiveType: PrimitiveType.TRIANGLES
        }, defines + "\n" + AerialPerspectiveEffectVS);

        // 降采样
        let textureScale = 1;
        let width = this._width;
        let height = this._height;
        let preDownSamples;
        this._iterations = 8;
        this._downSamplesMap = [];
        for (let i = 0; i <= this._iterations; i++) {
            textureScale /= 2;
            let downSamples;
            let resolution = new Cartesian2(1 / width, 1 / height);
            if (i == 0) {
                const downsampleThresholdMaterialShader = new ShaderSource({
                    defines: ["LOG_DEPTH"],
                    sources: [downsampleThresholdMaterialFS]
                });
                this._downsampleThresholdPassState = new PassState(this._scene.context);
                this._downsampleThresholdBuffer = new Texture({
                    context: this._scene.context,
                    width: width * textureScale,
                    height: height * textureScale,
                    pixelFormat: PixelFormat.RGBA,
                    pixelDatatype: PixelDatatype.HALF_FLOAT,
                    flipY: false,
                });
                this._downsampleThresholdPassState.viewport = new BoundingRectangle(0, 0, width * textureScale, height * textureScale);
                this._downsampleThresholdPassState.framebuffer = new Framebuffer({
                    context: this._scene.context,
                    colorTextures: [this._downsampleThresholdBuffer],
                    destroyAttachments: false,
                })
                this.downsampleThresholdDrawComomand = this._scene.context.createViewportQuadCommand(downsampleThresholdMaterialShader, {
                    uniformMap: {
                        inputBuffer: () => {
                            return that._aerialPerspectiveOutputColor;
                        },
                        texelSize: () => {
                            return resolution
                        },
                        thresholdLevel: () => {
                            return that._thresholdLevel;
                        },
                        thresholdRange: () => {
                            return that._thresholdRange;
                        },
                    },
                    primitiveType: PrimitiveType.TRIANGLES
                }, downsampleThresholdMaterialVS);
            } else {
                if (i == 1) {
                    downSamples = downsamplingMaterial(i, this._downsampleThresholdBuffer, textureScale, resolution, false);
                    preDownSamples = downSamples;
                } else {
                    downSamples = downsamplingMaterial(i, this._downSamplesMap[this._downSamplesMap.length - 1], textureScale, resolution, true);
                }
            }
            if (downSamples)
                this._downSamplesMap.push(downSamples);
            width = Math.max(width / 2, 1);
            height = Math.max(height / 2, 1);
        }

        // 升采样
        this._upSamplesMap = [];
        let _Samples = this._downSamplesMap[this._iterations - 1];
        for (let n = this._iterations - 2; n >= 0; n--) {
            textureScale *= 2;
            const downSamples = this._downSamplesMap[n];
            let resolution = new Cartesian2(1 / width, 1 / height);
            const upSamples = upsamplingMaterial(n, _Samples, downSamples, textureScale, resolution);
            this._upSamplesMap.push(upSamples);
            _Samples = upSamples;
            width = Math.max(width * 2, 1);
            height = Math.max(height * 2, 1);
        }
        // hdr镜头光
        const wx = 1 / this._width * .5;
        const hy = 1 / this._height * .5;
        const texSize = new Cartesian4(wx, hy, wx * .5, hy * .5);
        const kawaseBlur = kawaseBlurMaterial(0, this._downsampleThresholdBuffer, 1 / 4, texSize, 0, 1, false);
        const kawaseBlur2 = kawaseBlurMaterial(1, kawaseBlur, 1 / 4, texSize, 1, 1, true);
        const kawaseBlur3 = kawaseBlurMaterial(2, kawaseBlur2, 1 / 4, texSize, 1, 1, true);
        const copysampling = copysamplingMaterial(0, kawaseBlur3, 0.5, 1);
        const lensFlareFeatures = lensFlareFeaturesMaterial(0, copysampling, 0.5, new Cartesian2(wx, hy), this);
        const applyBloomStage = applyBloomMaterial(
            this._upSamplesMap[this._upSamplesMap.length - 1], lensFlareFeatures, this);
        this._renderAtmospherePass = new RenderPass({
            name: "czm_geospatialPipelinePass",
            fragmentShader: defines + geospatialPipelineFragmentShader.replace("__TONE_MAPPING_MODE__", () => this._toneMappingMode),
            uniforms: {
                inputBuffer: applyBloomStage.name,
                cameraHeight: () => { return this.cameraHeight },
                toneMappingExposure: () => { return this.toneMappingExposure },
                WhitePoint: () => { return this.whitePoint },
                MiddleGrey: () => { return this.middleGrey },
                AverageLuminance: () => { return this.averageLuminance },
                sunPositionWC: () => {
                    if (this._systemLight) {
                        return this._scene.context.uniformState.sunPositionWC;
                    }
                    return this._scene.context.uniformState.sunPositionWC2;
                },
                u_accumulation: () => {
                    return this._scene.context.defaultTexture;
                },
                u_revealage: () => {
                    return this._scene.context.defaultTexture;
                },
                ssrParam: () => {
                    return this._ssrParam;
                },
                czm_positionTexture: () => {
                    return this._scene.context.defaultTexture;
                },
                czm_normalTexture: () => {
                    return this._scene.context.defaultTexture;
                },
                czm_reflectivityTexture: () => {
                    return this._scene.context.defaultTexture;
                },
                u_color1: () => {
                    return scratchFieldColor;
                },
                u_color2: () => {
                    return scratchFieldColor;
                },
                u_transparency: () => {
                    return 0.0;
                },
                viewsheSpotsTexture: () => {
                    return this._scene.context.defaultTexture;
                },
            },
            // pixelDatatype: PixelDatatype.HALF_FLOAT,
            sampleMode: PostProcessStageSampleMode.LINEAR
        });

        this._stage = new PostProcessStageComposite({
            name: "czm_geospatialPipelinePass_composite",
            inputPreviousStageTexture: false,
            stages: [
                applyBloomStage,
                this._renderAtmospherePass
            ]
        });
        this._stage.enabled = this._show;

        if (isUpdate) {
            // 重建后重新加入官方后处理集合
            const pps = this._scene.postProcessStages;
            if (typeof pps.contains === "function" && !pps.contains(this._stage)) {
                pps.add(this._stage);
                // 官方集合没有插入 API；重建后保留原位置，SMAA 必须仍在天空合成之后。
                if (defined(stageIndex)) {
                    pps._stages[stageIndex] = pps._stages.pop();
                    this._stage._index = stageIndex;
                }
            }
        }
        // 重写执行渲染函数
        const that = this;
        const renderEffect = preDownSamples;
        const originalExecute = renderEffect.execute;
        renderEffect.execute = function (context, colorTexture, depthTexture, idTexture) {

            that._depthTexture = depthTexture;
            that._colorTexture = colorTexture;
            // Fully faded clouds contribute neither color nor shadows; avoid their ray-marching cost.
            if (that.cloudVisibility > 0) {
                that.shadowMaterialPass.execute(context, colorTexture, depthTexture, idTexture);
                that.cloudMaterialPass.execute(context, colorTexture, depthTexture, idTexture);
                if (that.volumetricLightOptions.mode === "volumetric") {
                    that.focusedCloudShadowPass.execute(context, that.volumetricLightOptions);
                    that.volumetricLightPass.execute(context, colorTexture, depthTexture, idTexture);
                }
            }
            that._aerialPerspectiveComoman.execute(context, that._passState);
            that.downsampleThresholdDrawComomand.execute(context, that._downsampleThresholdPassState);
            return originalExecute.call(renderEffect, context, colorTexture, depthTexture, idTexture);
        }
    }

    update(context, useLogDepth) {

        if (this._stage && this._stage.enabled) {
            if (this._width !== this._scene.drawingBufferWidth ||
                this._height !== this._scene.drawingBufferHeight
            ) {
                this.init(true);
            }

            // 接管 Cesium 内置天空/大气，避免与自定义管线叠加
            if (!this._originalSceneSettings) {
                const scene = this._scene;
                this._originalSceneSettings = [
                    [scene.skyAtmosphere, "show"], [scene.skyBox, "show"],
                    [scene.sun, "show"], [scene.fog, "enabled"],
                    [scene.globe, "showGroundAtmosphere"], [scene.globe, "enableLighting"],
                    [scene.globe, "tileCacheSize"], [scene.globe, "maximumScreenSpaceError"],
                ].filter(([target]) => target).map(([target, key]) => [target, key, target[key]]);
                this._scene.globe.showGroundAtmosphere = false;
                if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
                if (this._scene.fog) { this._scene.fog.enabled = false; }
                if (this._scene.skyBox) { this._scene.skyBox.show = false; }
                this._scene.globe.enableLighting = true;
                if (this._scene.sun) { this._scene.sun.show = false; }
                this._scene.globe.tileCacheSize = 2E3;
                this._scene.globe.maximumScreenSpaceError = 2;
            }

            if (!this._isPrecomputed) {
                this.precomputed();
                this._isPrecomputed = true;
            }

            const now = performance.now();
            this._time = now / 1000.;
            this._resolution.x = this._scene.drawingBufferWidth;
            this._resolution.y = this._scene.drawingBufferHeight;
            ++this._frame;

            // planetRadius
            if (this._dynamicPlanet) {
                const cartographic =
                    Ellipsoid.WGS84.cartesianToCartographic(this._scene.camera.position);
                let position = this._scene.globe.ellipsoid.cartographicToCartesian(
                    new Cartographic(cartographic.latitude, cartographic.longitude, 0));
                position = Cartesian3.magnitude(position);
                this._planetRadius = position;
            }

            // console.log(this._scene.context.uniformState.sunPositionWC)
            // console.log(this._scene.context.uniformState.sunDirectionWC)
            // sunPosPC
            // SceneTransforms.worldToDrawingBufferCoordinates(
            //     this._scene,
            //     this._scene.context.uniformState.sunPositionWC,
            //     this._sunPosPC);

            // globeNormal
            const surfacePosition = Ellipsoid.WGS84.scaleToGeodeticSurface(this._scene.camera.position);
            if (surfacePosition) {
                Cartesian3.normalize(surfacePosition, this._globeNormal);
            }

            // moonPosition
            let icrfToFixed = scratchIcrfToFixed;
            let date = (this._scene.frameState && this._scene.frameState.time)
                ? this._scene.frameState.time
                : JulianDate.now(scratchJulianDate);
            if (!defined(Transforms.computeIcrfToFixedMatrix(date, icrfToFixed))) {
                Transforms.computeTemeToPseudoFixedMatrix(date, icrfToFixed);
            }
            const moonPosition = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
                date,
                scratchPoint3
            );
            Matrix3.multiplyByVector(
                icrfToFixed,
                moonPosition,
                this._moonPositionWC
            );
            // moonPosPC
            // SceneTransforms.worldToDrawingBufferCoordinates(
            //     this._scene,
            //     this._moonPositionWC,
            //     this._moonPosPC);


            // copySettings
            // preRender 早于官方 Cesium 的 UniformState 更新，首帧必须直接读取相机。
            const projectionMatrix = this._scene.camera.frustum.projectionMatrix;
            const cameraPosition = this._scene.camera.positionWC;
            Matrix4.inverse(this.ellipsoidMatrix, this._inverseEllipsoidMatrix);

            // 将相机位置从世界坐标转换为 ellipsoid local 坐标系
            const cameraPositionTransformed = Matrix4.multiplyByPoint(
                this._inverseEllipsoidMatrix,
                cameraPosition,
                vectorScratch
            );

            // 相减以获得相对于地球中心的向量
            const cameraPositionECEF = Cartesian3.subtract(
                cameraPositionTransformed,
                this._ellipsoidCenter,
                vectorScratch2
            );
            this.cameraPositionECEF = cameraPositionECEF;
            try {
                // 计算摄像机高度与理想球面差值，用于在实际法线与理想法线间插值以避免光照伪影
                const cartographic = Ellipsoid.WGS84.cartesianToCartographic(cameraPosition);
                const cameraHeight = cartographic.height;
                this.cameraHeight = cameraHeight;
                const fadeRange = this.cloudAltitudeFadeRange;
                const fade = fadeRange ? Math.min(1, Math.max(0,
                    (cameraHeight - fadeRange[0]) / (fadeRange[1] - fadeRange[0]))) : 0;
                const visibility = 1 - fade * fade * (3 - 2 * fade);
                // Reset only when crossing the fully hidden boundary, not on every zoom frame.
                if ((visibility === 0) !== (this.cloudVisibility === 0)) {
                    this.cloudMaterialPass.invalidateHistory();
                }
                this.cloudVisibility = visibility;
                this.effectiveCloudCoverage = this.coverage * visibility;
                const projectedScale = new Cartesian3(
                    0,
                    this.ellipsoid.maximumRadius,
                    -cameraHeight
                ).applyMatrix4(projectionMatrix);
                // 计算插值因子，确保过渡平滑
                this._idealSphereAlpha = saturate(
                    remap(projectedScale.y, 41.5, 13.8, 0, 1)
                )
            } catch (error) {
                console.log(error);
                return // 当无法投影到椭球表面时直接中断
            }

            const altitudeCorrection = this._altitudeCorrection;
            if (this.correctAltitude) {
                getAltitudeCorrectionOffset(
                    cameraPositionECEF,
                    this.atmosphere.bottomRadius,
                    this.ellipsoid,
                    altitudeCorrection
                )
            } else {
                Cartesian3.clone(Cartesian3.ZERO, altitudeCorrection);
            }

            this.time = Date.now();
            this.frameTime = this.time - this.lastFrameTime;
            if (this.frameTime > 100) this.frameTime = 100;
            this.lastFrameTime = this.time;
            const deltaTime = this.frameTime / 1000.;
            // 修改后的代码逻辑
            Cartesian2.add(
                this.localWeatherOffset,
                Cartesian2.multiplyByScalar(
                    Cesium.Cartesian2.clone(this.localWeatherVelocity, vector2Scratch),
                    deltaTime,
                    vector2Scratch
                ),
                this.localWeatherOffset
            );

            Cartesian3.add(
                this.shapeOffset,
                Cartesian3.multiplyByScalar(
                    Cartesian3.clone(this.shapeVelocity, vector3Scratch),
                    deltaTime,
                    vector3Scratch
                ),
                this.shapeOffset
            );

            Cartesian3.add(
                this.shapeDetailOffset,
                Cartesian3.multiplyByScalar(
                    Cartesian3.clone(this.shapeDetailVelocity, vector3Scratch),
                    deltaTime,
                    vector3Scratch
                ),
                this.shapeDetailOffset
            );

            this.shadowMaterialPass.update(context, useLogDepth);

            this._stage.update(context, useLogDepth);
        }
    }

    precomputed() {
        if (this._destroyed || this._isPrecomputed) return;
        this._isPrecomputed = true;
        // Fetches can finish after disposal; guard before allocating any GPU texture.
        Resource.createIfNeeded(buildModuleUrl("BetterSkyAssets/GeospatialAssets/local_weather.png")).fetchImage().then(image => {
            if (this._destroyed) return;
            this.localWeatherTexture = new Texture({
                context: this._scene.context,
                source: image,
                width: image.width,
                height: image.height,
                sampler: new Sampler({
                    wrapS: WebGLConstants.REPEAT,
                    wrapT: WebGLConstants.REPEAT,
                    minificationFilter: WebGLConstants.LINEAR_MIPMAP_LINEAR,
                    magnificationFilter: WebGLConstants.LINEAR,
                })
            });
            this._ownedTextures.add(this.localWeatherTexture);
            this.localWeatherTexture.generateMipmap();
        }).catch(error => {
            if (!this._destroyed) console.error(error);
        });
        Resource.createIfNeeded(buildModuleUrl("BetterSkyAssets/GeospatialAssets/turbulence.png")).fetchImage().then(image => {
            if (this._destroyed) return;
            this.turbulenceTexture = new Texture({
                context: this._scene.context,
                source: image,
                width: image.width,
                height: image.height,
                sampler: new Sampler({
                    wrapS: WebGLConstants.REPEAT,
                    wrapT: WebGLConstants.REPEAT,
                    minificationFilter: WebGLConstants.LINEAR_MIPMAP_LINEAR,
                    magnificationFilter: WebGLConstants.LINEAR,
                })
            })
            this._ownedTextures.add(this.turbulenceTexture);
            this.turbulenceTexture.generateMipmap();
        }).catch(error => {
            if (!this._destroyed) console.error(error);
        });
        const Loader = createData3DTextureLoaderClass(parseUint8Array, {
            width: CLOUD_SHAPE_TEXTURE_SIZE,
            height: CLOUD_SHAPE_TEXTURE_SIZE,
            depth: CLOUD_SHAPE_TEXTURE_SIZE,
            format: RedFormat,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            wrapS: RepeatWrapping,
            wrapT: RepeatWrapping,
            wrapR: RepeatWrapping,
            colorSpace: NoColorSpace
        })
        const loader = new Loader();
        (async () => {
            const texture = await loader.loadAsync(buildModuleUrl("BetterSkyAssets/GeospatialAssets/shape.bin"))
            if (this._destroyed) return;
            this.shapeTexture = new Texture3D({
                context: this._scene.context,
                width: CLOUD_SHAPE_TEXTURE_SIZE,
                height: CLOUD_SHAPE_TEXTURE_SIZE,
                depth: CLOUD_SHAPE_TEXTURE_SIZE,
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
                useTexStorage: true,
                levels: 8,
                flipY: false,
                sampler: new Sampler({
                    wrapS: TextureWrap.REPEAT,
                    wrapT: TextureWrap.REPEAT,
                    wrapR: TextureWrap.REPEAT,
                    minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
                    magnificationFilter: TextureMagnificationFilter.LINEAR,
                }),
                source: {
                    arrayBufferView: texture.image.data
                }
            });
            this._ownedTextures.add(this.shapeTexture);
            this.shapeTexture.generateMipmap();
        })().catch(error => {
            if (!this._destroyed) console.error(error);
        })
        const Loader2 = createData3DTextureLoaderClass(parseUint8Array, {
            width: CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
            height: CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
            depth: CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
            format: RedFormat,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            wrapS: RepeatWrapping,
            wrapT: RepeatWrapping,
            wrapR: RepeatWrapping,
            colorSpace: NoColorSpace
        })
        const loader2 = new Loader2();
        (async () => {
            const texture = await loader2.loadAsync(buildModuleUrl("BetterSkyAssets/GeospatialAssets/shape_detail.bin"))
            if (this._destroyed) return;
            this.shapeDetailTexture = new Texture3D({
                context: this._scene.context,
                width: CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
                height: CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
                depth: CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
                useTexStorage: true,
                levels: 1 + Math.floor(Math.log2(CLOUD_SHAPE_DETAIL_TEXTURE_SIZE)),
                flipY: false,
                sampler: new Sampler({
                    wrapS: TextureWrap.REPEAT,
                    wrapT: TextureWrap.REPEAT,
                    wrapR: TextureWrap.REPEAT,
                    minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
                    magnificationFilter: TextureMagnificationFilter.LINEAR,
                }),
                source: {
                    arrayBufferView: texture.image.data
                }
            });
            this._ownedTextures.add(this.shapeDetailTexture);
            this.shapeDetailTexture.generateMipmap();
        })().catch(error => {
            if (!this._destroyed) console.error(error);
        })
        const STBNLoader = createData3DTextureLoaderClass(parseUint8Array, {
            format: RedFormat,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            wrapS: RepeatWrapping,
            wrapT: RepeatWrapping,
            wrapR: RepeatWrapping,
            width: STBN_TEXTURE_WIDTH,
            height: STBN_TEXTURE_HEIGHT,
            depth: STBN_TEXTURE_DEPTH
        })
        const loader3 = new STBNLoader();
        (async () => {
            const texture = await loader3.loadAsync(buildModuleUrl("BetterSkyAssets/GeospatialAssets/stbn.bin"))
            if (this._destroyed) return;
            this.stbnTexture = new Texture3D({
                context: this._scene.context,
                width: STBN_TEXTURE_WIDTH,
                height: STBN_TEXTURE_HEIGHT,
                depth: STBN_TEXTURE_DEPTH,
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
                useTexStorage: true,
                flipY: false,
                sampler: new Sampler({
                    wrapS: TextureWrap.REPEAT,
                    wrapT: TextureWrap.REPEAT,
                    wrapR: TextureWrap.REPEAT,
                    minificationFilter: TextureMinificationFilter.NEAREST,
                    magnificationFilter: TextureMagnificationFilter.NEAREST,
                }),
                source: {
                    arrayBufferView: texture.image.data
                }
            });
            this._ownedTextures.add(this.stbnTexture);
        })().catch(error => {
            if (!this._destroyed) console.error(error);
        })
        new PrecomputedTexturesLoader().load(
            buildModuleUrl("BetterSkyAssets/GeospatialAssets/"),
            (result) => {
                if (this._destroyed) return;
                this._u_scattering_texture = new Texture3D({
                    context: this._scene.context,
                    width: result.scatteringTexture.image.width,
                    height: result.scatteringTexture.image.height,
                    depth: result.scatteringTexture.image.depth,
                    pixelFormat: PixelFormat.RGBA,
                    pixelDatatype: PixelDatatype.FLOAT,
                    useTexStorage: true,
                    flipY: false,
                    source: {
                        arrayBufferView: result.scatteringTexture.image.data
                    }
                });
                this._ownedTextures.add(this._u_scattering_texture);
                this._u_single_mie_scattering_texture = this._u_scattering_texture;
                this._u_irradiance_texture = new Texture({
                    context: this._scene.context,
                    width: result.irradianceTexture.image.width,
                    height: result.irradianceTexture.image.height,
                    pixelFormat: PixelFormat.RGBA,
                    pixelDatatype: PixelDatatype.FLOAT,
                    useTexStorage: true,
                    flipY: false,
                    source: {
                        arrayBufferView: result.irradianceTexture.image.data
                    }
                });
                this._ownedTextures.add(this._u_irradiance_texture);
                this._u_transmittance_texture = new Texture({
                    context: this._scene.context,
                    width: result.transmittanceTexture.image.width,
                    height: result.transmittanceTexture.image.height,
                    pixelFormat: PixelFormat.RGBA,
                    pixelDatatype: PixelDatatype.FLOAT,
                    useTexStorage: true,
                    flipY: false,
                    source: {
                        arrayBufferView: result.transmittanceTexture.image.data
                    }
                });
                this._ownedTextures.add(this._u_transmittance_texture);
            },
            undefined,
            error => {
                if (!this._destroyed) console.error(error);
            }
        );
    }

    get stage() {

        return this._stage;
    }

    get ready() {

        return this._stage.ready;
    }

    get name() {

        return this._stage.name;
    }

    get enabled() {

        return this._show;
    }

    set enabled(val) {
        if (val && !this._show && this.cloudMaterialPass) {
            this.cloudMaterialPass.invalidateHistory();
        }
        this._show = val;
        if (this._stage) { this._stage.enabled = this._show; }
        if (!val) this.restoreScene();
    }

    restoreScene() {
        if (!this._originalSceneSettings) return;
        for (const [target, key, value] of this._originalSceneSettings) target[key] = value;
        this._originalSceneSettings = undefined;
    }

    _isSupported(context) {

        return this._stage._isSupported(context);
    }

    _releaseAerialRenderTarget() {
        if (this._passState?.framebuffer) {
            this._passState.framebuffer.destroy();
            this._passState.framebuffer = undefined;
        }
        if (this._aerialPerspectiveOutputColor) {
            this._aerialPerspectiveOutputColor.destroy();
            this._aerialPerspectiveOutputColor = undefined;
        }
    }

    _releaseThresholdResources() {
        if (this._downsampleThresholdPassState?.framebuffer) {
            this._downsampleThresholdPassState.framebuffer.destroy();
            this._downsampleThresholdPassState.framebuffer = undefined;
        }
        if (this._downsampleThresholdBuffer) {
            this._downsampleThresholdBuffer.destroy();
            this._downsampleThresholdBuffer = undefined;
        }
        if (this.downsampleThresholdDrawComomand) {
            this.downsampleThresholdDrawComomand.shaderProgram = this.downsampleThresholdDrawComomand.shaderProgram?.destroy();
            this.downsampleThresholdDrawComomand = undefined;
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.restoreScene();
        if (this._stage) {
            const stages = this._scene.postProcessStages;
            if (typeof stages.contains === "function" && stages.contains(this._stage)) {
                stages.remove(this._stage);
            } else if (!this._stage.isDestroyed()) {
                this._stage.destroy();
            }
            this._stage = undefined;
        }
        if (this.volumetricLightPass && !this.volumetricLightPass.isDestroyed()) {
            this.volumetricLightPass.destroy();
        }
        if (this.focusedCloudShadowPass && !this.focusedCloudShadowPass.isDestroyed()) {
            this.focusedCloudShadowPass.destroy();
        }
        if (this.cloudMaterialPass && !this.cloudMaterialPass.isDestroyed()) {
            this.cloudMaterialPass.destroy();
        }
        if (this.shadowMaterialPass && !this.shadowMaterialPass.isDestroyed()) {
            this.shadowMaterialPass.destroy();
        }
        this._releaseAerialRenderTarget();
        this._releaseThresholdResources();
        if (this._aerialPerspectiveComoman) {
            // Each command owns one shader-cache reference; the viewport vertex array is shared.
            this._aerialPerspectiveComoman.shaderProgram = this._aerialPerspectiveComoman.shaderProgram?.destroy();
            this._aerialPerspectiveComoman = undefined;
        }
        for (const texture of this._ownedTextures) {
            if (!texture.isDestroyed()) texture.destroy();
        }
        this._ownedTextures.clear();
        this._downSamplesMap = undefined;
        this._upSamplesMap = undefined;
        return destroyObject(this)
    }

    isDestroyed() {

        return this._destroyed;
    }

    addGUI(datGui, viewer) {
        {
            const geospatialGui = datGui.addFolder('寒霜预处理大气');

            const toneMapping = geospatialGui.addFolder('PostProess');
            toneMapping.add({ bloomIntensity: 0.008 }, "bloomIntensity", 0.0001, 2, 0.0001).name("bloomIntensity").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline._bloomIntensity = value
            })
            toneMapping.add({ ghostAmount: 0.001 }, "ghostAmount", 0.001, 1, 0.001).name("ghostAmount").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline._ghostAmount = value
            })
            toneMapping.add({ haloAmount: 0.001 }, "haloAmount", 0.001, 1, 0.001).name("haloAmount").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline._haloAmount = value
            })
            toneMapping.add({ v: "AGX" }, "v", ["AGX", "ACES", "Neutral", "Uncharted2", "Reinhard2",
                "Linear", "Reinhard", "Cineon"
            ]).name("反射指数").onChange((value) => {
                switch (value) {
                    case "AGX": this.toneMappingMode = 7; break;
                    case "ACES": this.toneMappingMode = 9; break;
                    case "Neutral": this.toneMappingMode = 8; break;
                    case "Uncharted2": this.toneMappingMode = 4; break;
                    case "Reinhard2": this.toneMappingMode = 2; break;
                    case "Linear": this.toneMappingMode = 10; break;
                    case "Reinhard": this.toneMappingMode = 11; break;
                    case "Cineon": this.toneMappingMode = 12; break;
                }
            })
            toneMapping.add({ toneMappingExposure: 10 }, "toneMappingExposure", 0, 100, 1).name("toneMappingExposure").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.toneMappingExposure = value
            })
            toneMapping.add({ whitePoint: 10 }, "whitePoint", 0, 20, 0.1).name("whitePoint").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.whitePoint = value
            })
            toneMapping.add({ middleGrey: 10 }, "middleGrey", 0, 1, 0.01).name("middleGrey").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.middleGrey = value
            })
            toneMapping.add({ averageLuminance: 0.01 }, "averageLuminance", 0, 1, 0.01).name("averageLuminance").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.averageLuminance = value
            })
            toneMapping.add({ v: this._showDrakLight }, "v").name("夜光模拟").onChange((value) => {
                this.showDrakLight = value
            })
            toneMapping.add({ v: this._customDarkParam.x }, "v", 1, 20, 0.1).name("天空夜光").onChange((value) => {
                this._customDarkParam.x = value
            })
            toneMapping.add({ v: this._customDarkParam.y }, "v", 0.01, 1, 0.01).name("地面夜光").onChange((value) => {
                this._customDarkParam.y = value
            })
            toneMapping.add({ v: this._sunCull }, "v").name("法线遮蔽").onChange((value) => {
                this.sunCull = value
            })
            toneMapping.add({ v: this._showSSR }, "v").name("屏幕反射").onChange((value) => {
                this.showSSR = value
            })
            toneMapping.add({ v: this._ssrParam.x }, "v", 0.001, 10, 0.001).name("反射强度").onChange((value) => {
                this._ssrParam.x = value
            })
            toneMapping.add({ v: this._ssrParam.y }, "v", 0.001, 2, 0.001).name("粗糙强度").onChange((value) => {
                this._ssrParam.y = value
            })
            toneMapping.add({ v: this._ssrParam.z }, "v", 0.001, 10, 0.001).name("反射指数").onChange((value) => {
                this._ssrParam.z = value
            })
            const cloud = geospatialGui.addFolder('cloud');
            cloud.add({ coverage: 0.3 }, "coverage", 0, 1, 0.01).name("coverage").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.coverage = value
            })
            cloud.add({ animate: true }, "animate").name("animate").onChange(function (value) {
                if (value) {
                    viewer.postProcessStages.geospatialPipeline.localWeatherVelocity = new Cesium.Cartesian2(0.001, 0);
                } else {
                    viewer.postProcessStages.geospatialPipeline.localWeatherVelocity = new Cesium.Cartesian2(0.0, 0);
                }
            })

            const atmosphereGUI = geospatialGui.addFolder('atmosphere');

            // 太阳角半径
            atmosphereGUI.add(this.atmosphere, 'sunAngularRadius', 0.000001, 0.1, 0.000001)
                .name('Sun Angular Radius');

            // 太阳辐照度（向量）
            const solarIrradianceFolder = atmosphereGUI.addFolder('Solar Irradiance');
            solarIrradianceFolder.add(this.atmosphere.solarIrradiance, 'x', 0, 5, 0.01).name('Red');
            solarIrradianceFolder.add(this.atmosphere.solarIrradiance, 'y', 0, 5, 0.01).name('Green');
            solarIrradianceFolder.add(this.atmosphere.solarIrradiance, 'z', 0, 5, 0.01).name('Blue');
            solarIrradianceFolder.open();

            // 底部半径
            atmosphereGUI.add(this.atmosphere, 'bottomRadius', 0, 1e7, 1000).name('Bottom Radius');

            // 顶部半径
            atmosphereGUI.add(this.atmosphere, 'topRadius', 0, 1e7, 1000).name('Top Radius');

            // 瑞利散射系数（向量）
            const rayleighFolder = atmosphereGUI.addFolder('Rayleigh Scattering');
            rayleighFolder.add(this.atmosphere.rayleighScattering, 'x', 0, 0.1, 0.0001).name('Red');
            rayleighFolder.add(this.atmosphere.rayleighScattering, 'y', 0, 0.1, 0.0001).name('Green');
            rayleighFolder.add(this.atmosphere.rayleighScattering, 'z', 0, 0.1, 0.0001).name('Blue');
            rayleighFolder.open();

            // 米散射系数（向量）
            const mieFolder = atmosphereGUI.addFolder('Mie Scattering');
            mieFolder.add(this.atmosphere.mieScattering, 'x', 0, 0.01, 0.0001).name('Red');
            mieFolder.add(this.atmosphere.mieScattering, 'y', 0, 0.01, 0.0001).name('Green');
            mieFolder.add(this.atmosphere.mieScattering, 'z', 0, 0.01, 0.0001).name('Blue');
            mieFolder.open();

            // 米散射相位函数不对称因子
            atmosphereGUI.add(this.atmosphere, 'miePhaseFunctionG', -1, 1, 0.01).name('Mie Phase G');

            // 最小太阳天顶角余弦
            atmosphereGUI.add(this.atmosphere, 'muSMin', -1, 1, 0.01).name('Mu S Min');
            const rendering = geospatialGui.addFolder('rendering');
            rendering.add({ resolutionScale: 1 }, "resolutionScale", [0.5, 0.75, 1]).name("resolutionScale").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.resolutionScale = value
            })
            rendering.add({ temporalUpscale: false }, "temporalUpscale").name("temporalUpscale").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.temporalUpscale = value
            })
            rendering.add({ lightShafts: false }, "lightShafts").name("lightShafts").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.lightShafts = value
            })
            rendering.add({ shapeDetail: false }, "shapeDetail").name("shapeDetail").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeDetail = value
            })
            rendering.add({ turbulence: false }, "turbulence").name("turbulence").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.turbulence = value
            })
            rendering.add({ haze: false }, "haze").name("haze").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.haze = value
            })
            const scatteringGui = geospatialGui.addFolder('scattering');
            scatteringGui.add({ scatteringCoefficient: 0 }, "scatteringCoefficient", 0, 5).name("scatteringCoefficient").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.scatteringCoefficient = value;
            });
            scatteringGui.add({ absorptionCoefficient: 0 }, "absorptionCoefficient", 0, 5).name("absorptionCoefficient").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.absorptionCoefficient = value;
            });
            // scatteringGui.add({ scatterAnisotropy1: 0 }, "scatterAnisotropy1", 0, 1).name("scatterAnisotropy1").onChange(function (value) {
            //   effect.scatterAnisotropy1 = value;
            // });
            // scatteringGui.add({ scatterAnisotropy2: 0 }, "scatterAnisotropy2", -1, 0).name("scatterAnisotropy2").onChange(function (value) {
            //   effect.scatterAnisotropy2 = value;
            // });
            // scatteringGui.add({ scatterAnisotropyMix: 0 }, "scatterAnisotropyMix", 0, 1).name("scatterAnisotropyMix").onChange(function (value) {
            //   effect.scatterAnisotropyMix = value;
            // });
            scatteringGui.add({ skyIrradianceScale: 0 }, "skyIrradianceScale", 0, 5).name("skyIrradianceScale").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.skyIrradianceScale = value;
            });
            scatteringGui.add({ groundIrradianceScale: 0 }, "groundIrradianceScale", 0, 10).name("groundIrradianceScale").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.groundIrradianceScale = value;
            });
            scatteringGui.add({ powderScale: 0 }, "powderScale", 0, 1).name("powderScale").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.powderScale = value;
            });
            scatteringGui.add({ powderExponent: 0 }, "powderExponent", 1, 1000).name("powderExponent").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.powderExponent = value;
            });

            /* Weather and Shape Controls */
            const weatherShapeGui = geospatialGui.addFolder('weather and shape');
            weatherShapeGui.add({ localWeatherRepeat: 0 }, "localWeatherRepeat", 1, 200, 1).name("localWeatherRepeat").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.localWeatherRepeat.x = value;
            });
            // Vector controls need separate components
            const localWeatherOffset = { x: 0, y: 0 };
            weatherShapeGui.add(localWeatherOffset, "x", 0, 1).name("localWeatherOffset X").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.localWeatherOffset.x = value;
            });
            weatherShapeGui.add(localWeatherOffset, "y", 0, 1).name("localWeatherOffset Y").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.localWeatherOffset.y = value;
            });

            weatherShapeGui.add({ shapeRepeat: 0 }, "shapeRepeat", 1, 10).name("shapeRepeat (×1e4)").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeRepeat.x = value * 1e-4;
            });

            // Shape Offset vector
            const shapeOffset = { x: 0, y: 0, z: 0 };
            weatherShapeGui.add(shapeOffset, "x", 0, 1).name("shapeOffset X").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeOffset.x = value;
            });
            weatherShapeGui.add(shapeOffset, "y", 0, 1).name("shapeOffset Y").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeOffset.y = value;
            });
            weatherShapeGui.add(shapeOffset, "z", 0, 1).name("shapeOffset Z").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeOffset.z = value;
            });

            weatherShapeGui.add({ shapeDetailRepeat: 0 }, "shapeDetailRepeat", 1, 10).name("shapeDetailRepeat (×1e3)").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeDetailRepeat.x = value * 1e-3;
            });

            // Shape Detail Offset vector
            const shapeDetailOffset = { x: 0, y: 0, z: 0 };
            weatherShapeGui.add(shapeDetailOffset, "x", 0, 1).name("shapeDetailOffset X").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeDetailOffset.x = value;
            });
            weatherShapeGui.add(shapeDetailOffset, "y", 0, 1).name("shapeDetailOffset Y").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeDetailOffset.y = value;
            });
            weatherShapeGui.add(shapeDetailOffset, "z", 0, 1).name("shapeDetailOffset Z").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.shapeDetailOffset.z = value;
            });

            weatherShapeGui.add({ turbulenceRepeat: 0 }, "turbulenceRepeat", 1, 50, 1).name("turbulenceRepeat").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.turbulenceRepeat.x = value;
            });
            weatherShapeGui.add({ turbulenceDisplacement: 0 }, "turbulenceDisplacement", 1, 1000).name("turbulenceDisplacement").onChange(function (value) {
                viewer.postProcessStages.geospatialPipeline.turbulenceDisplacement = value;
            });


            /* Cascaded Shadow Maps Controls */
            const shadowGui = geospatialGui.addFolder('cascaded shadow maps');
            // shadowGui.add({ cascadeCount: 1 }, "cascadeCount", [1, 2, 3, 4]).name("cascadeCount").onChange(function (value) {
            //   effect.shadow.cascadeCount = value;
            // });
            // shadowGui.add({ mapSize: 256 }, "mapSize", [256, 512, 1024]).name("mapSize").onChange(function (value) {
            //   effect.shadow.mapSize.x = value;
            // });
            // shadowGui.add({ splitMode: 'practical' }, "splitMode", ['practical', 'uniform', 'logarithmic']).name("splitMode").onChange(function (value) {
            //   effect.shadow.splitMode = value;
            // });
            // shadowGui.add({ splitLambda: 0 }, "splitLambda", 0, 1).name("splitLambda").onChange(function (value) {
            //   effect.shadow.splitLambda = value;
            // });
            const advancedGui = geospatialGui.addFolder('advanced clouds');

            // 多级散射参数
            // advancedGui.add({ multiScatteringOctaves: 0 }, "multiScatteringOctaves", 1, 12, 1)
            //   .name("multiScatteringOctaves")
            //   .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.multiScatteringOctaves = value);

            // // 精确光照控制
            // advancedGui.add({ accurateSunSkyIrradiance: false }, "accurateSunSkyIrradiance")
            //   .name("accurateSunSkyIrradiance")
            //   .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.accurateSunSkyIrradiance = value);

            // advancedGui.add({ accuratePhaseFunction: false }, "accuratePhaseFunction")
            //   .name("accuratePhaseFunction")
            //   .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.accuratePhaseFunction = value);

            // 步进控制参数
            advancedGui.add({ maxIterationCount: 0 }, "maxIterationCount", 10, 1000, 1)
                .name("maxIterationCount")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxIterationCount = value);

            advancedGui.add({ minStepSize: 0 }, "minStepSize", 10, 200, 1)
                .name("minStepSize")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.minStepSize = value);

            advancedGui.add({ maxStepSize: 0 }, "maxStepSize", 200, 2000, 1)
                .name("maxStepSize")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxStepSize = value);

            // 射线参数
            advancedGui.add({ maxRayDistance: 0 }, "maxRayDistance", 1e4, 1e6)
                .name("maxRayDistance")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxRayDistance = value);

            advancedGui.add({ perspectiveStepScale: 0 }, "perspectiveStepScale", 1, 1.1)
                .name("perspectiveStepScale")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.perspectiveStepScale = value);

            // 对数参数处理
            advancedGui.add({ minDensity: 0 }, "minDensity", -7, -1)
                .name("minDensity (log10)")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.minDensity = Math.pow(10, value));

            advancedGui.add({ minExtinction: 0 }, "minExtinction", -7, -1)
                .name("minExtinction (log10)")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.minExtinction = Math.pow(10, value));

            advancedGui.add({ minTransmittance: 0 }, "minTransmittance", -7, -1)
                .name("minTransmittance (log10)")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.minTransmittance = Math.pow(10, value));

            // 太阳和地面迭代控制
            advancedGui.add({ maxIterationCountToSun: 0 }, "maxIterationCountToSun", 0, 10, 1)
                .name("maxIterationCountToSun")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxIterationCountToSun = value);

            advancedGui.add({ maxIterationCountToGround: 0 }, "maxIterationCountToGround", 0, 10, 1)
                .name("maxIterationCountToGround")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxIterationCountToGround = value);

            // 阴影长度参数
            advancedGui.add({ maxShadowLengthIterationCount: 0 }, "maxShadowLengthIterationCount", 10, 1000, 1)
                .name("maxShadowLengthIterationCount")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxShadowLengthIterationCount = value);

            advancedGui.add({ minShadowLengthStepSize: 0 }, "minShadowLengthStepSize", 50, 200, 1)
                .name("minShadowLengthStepSize")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.minShadowLengthStepSize = value);

            advancedGui.add({ maxShadowLengthRayDistance: 0 }, "maxShadowLengthRayDistance", 1e4, 1e6)
                .name("maxShadowLengthRayDistance")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.maxShadowLengthRayDistance = value);

            // 雾效参数
            advancedGui.add({ hazeDensityScale: 0 }, "hazeDensityScale", -6, -3)
                .name("hazeDensityScale (log10)")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.hazeDensityScale = Math.pow(10, value));

            advancedGui.add({ hazeExponent: 0 }, "hazeExponent", -3, -1)
                .name("hazeExponent (log10)")
                .onChange(value => viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.hazeExponent = Math.pow(10, value));
            /* Advanced Shadow Controls */
            const shadowAdvancedGui = geospatialGui.addFolder('advanced shadow');
            // 时间相关参数
            // shadowAdvancedGui.add({ temporalPass: false }, "temporalPass").name("temporalPass").onChange(value => {
            //   effect.shadow.temporalPass = value;
            // });
            // shadowAdvancedGui.add({ temporalJitter: false }, "temporalJitter").name("temporalJitter").onChange(value => {
            //   effect.shadow.temporalJitter = value;
            // });

            // 步进控制参数
            shadowAdvancedGui.add({ maxIterationCount: 50 }, "maxIterationCount", 10, 100, 1).name("maxIterationCount").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.maxIterationCount = value;
            });
            shadowAdvancedGui.add({ minStepSize: 0 }, "minStepSize", 10, 200, 1).name("minStepSize").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.minStepSize = value;
            });
            shadowAdvancedGui.add({ maxStepSize: 0 }, "maxStepSize", 200, 2000, 1).name("maxStepSize").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.maxStepSize = value;
            });

            // 对数参数处理
            shadowAdvancedGui.add({ minDensity: 0 }, "minDensity", -7, -1).name("minDensity (log10)").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.minDensity = Math.pow(10, value);
            });
            shadowAdvancedGui.add({ minExtinction: 0 }, "minExtinction", -7, -1).name("minExtinction (log10)").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.minExtinction = Math.pow(10, value);
            });
            shadowAdvancedGui.add({ minTransmittance: 0 }, "minTransmittance", -7, -1).name("minTransmittance (log10)").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.minTransmittance = Math.pow(10, value);
            });

            // 光深参数
            shadowAdvancedGui.add({ opticalDepthTailScale: 0 }, "opticalDepthTailScale", 0, 4).name("opticalDepthTailScale").onChange(value => {
                viewer.postProcessStages.geospatialPipeline.shadowMaterialPass.opticalDepthTailScale = value;
            });


            /* Cloud Layers Controls */
            const cloudLayersGui = geospatialGui.addFolder('cloud layers');

            // 生成云层控制函数
            const vector = ["x", "y", "z", "w"]
            function createCloudLayerControls(layerIndex) {
                const layerGui = cloudLayersGui.addFolder(`layer ${layerIndex}`);

                // 通道选择
                // layerGui.add({ channel: 'r' }, "channel", ['r', 'g', 'b', 'a']).name("channel").onChange(value => {
                //   effect.cloudLayers[layerIndex].channel = value;
                // });


                // 基础参数
                layerGui.add({ altitude: viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.altitudes[vector[layerIndex]] }, "altitude", 0, 10000, 1).name("altitude").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.altitudes[vector[layerIndex]] = value;
                });
                layerGui.add({ height: viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.heights[vector[layerIndex]] }, "height", 0, 15000, 1).name("height").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.heights[vector[layerIndex]] = value;
                });
                layerGui.add({ densityScale: viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.densityScales[vector[layerIndex]] }, "densityScale", 0, 1).name("densityScale").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.densityScales[vector[layerIndex]] = value;
                });

                // 形状参数
                layerGui.add({ shapeAmount: 0 }, "shapeAmount", 0, 1).name("shapeAmount").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.shapeAmounts[vector[layerIndex]] = value;
                });
                layerGui.add({ shapeDetailAmount: 0 }, "shapeDetailAmount", 0, 1).name("shapeDetailAmount").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.shapeDetailAmounts[vector[layerIndex]] = value;
                });

                // 天气参数
                layerGui.add({ weatherExponent: 0 }, "weatherExponent", 0, 3).name("weatherExponent").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.weatherExponents[vector[layerIndex]] = value;
                });

                // 高级参数
                layerGui.add({ shapeAlteringBias: 0 }, "shapeAlteringBias", 0, 1).name("shapeAlteringBias").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.shapeAlteringBiases[vector[layerIndex]] = value;
                });
                layerGui.add({ coverageFilterWidth: 0 }, "coverageFilterWidth", 0, 1).name("coverageFilterWidth").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.coverageFilterWidths[vector[layerIndex]] = value;
                });
                layerGui.add({ shadow: true }, "shadow").name("shadow").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.shadowLayerMask[vector[layerIndex]] = value ? 1 : 0;
                });

                // 密度剖面子文件夹
                const densityProfileGui = layerGui.addFolder('density profile');
                densityProfileGui.add({ expTerm: 0 }, "expTerm", 0, 1).name("expTerm").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.expTerms[vector[layerIndex]] = value;
                });
                densityProfileGui.add({ exponent: 0 }, "exponent", -10, 10).name("exponent").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.exponents[vector[layerIndex]] = value;
                });
                densityProfileGui.add({ linearTerm: 0 }, "linearTerm", -2, 2).name("linearTerm").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.linearTerms[vector[layerIndex]] = value;
                });
                densityProfileGui.add({ constantTerm: 0 }, "constantTerm", -2, 2).name("constantTerm").onChange(value => {
                    viewer.postProcessStages.geospatialPipeline.cloudMaterialPass.constantTerms[vector[layerIndex]] = value;
                });
                densityProfileGui.close();

                // 默认折叠非首层
                if (layerIndex > 0) {
                    layerGui.close();
                }
            }

            // 初始化四层云控制
            [0, 1, 2, 3].forEach(createCloudLayerControls);
        }
    }
}
