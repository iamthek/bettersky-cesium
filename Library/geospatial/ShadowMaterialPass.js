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
    BoundingRectangle,
    CullFace,
    JulianDate
 } from "cesium";
import * as Cesium from "cesium";
const CesiumMath = Cesium.Math;
const defaultValue = (a, b) => a ?? b;
defaultValue.EMPTY_OBJECT = Object.freeze({});
import Texture3D from "../Texture3D.js";
import { installFramebufferCallbacks } from "../viewportQuadCommand.js";
import CascadedShadowMaps, { defaultsPass } from "./CascadedShadowMaps.js";
import { bayerOffsets, cloudLayerDensityGLSL, cloudsMaterialFS, cloudsMaterialVS } from "./CloudsMaterialPass.js";
import { getAltitudeCorrectionOffset } from "../GeospatialPipelinePass.js";
const shadowMaterialVS = `
#version 300 es\n\
#define LOG_DEPTH\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME ShadowMaterial\n\
#define SHADOW 1\n\
#define TEMPORAL_PASS 0\n\
#define TEMPORAL_JITTER 0\n\
#define LOCAL_WEATHER_CHANNELS rgba\n\
#define CASCADE_COUNT 3\n\
#define SHAPE_DETAIL 1\n\
#define TURBULENCE 1\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
precision highp float;\n\
uniform vec3 ellipsoidCenter;\n\
uniform vec3 altitudeCorrection;\n\
in vec3 position;\n\
out vec2 vUv;\n\
out vec3 vEllipsoidCenter;\n\
void main() {\n\
    vUv = position.xy * 0.5 + 0.5;\n\
    vEllipsoidCenter = ellipsoidCenter + altitudeCorrection;\n\
    gl_Position = vec4(position.xy, 1.0, 1.0);\n\
}\n\
`;
const shadowMaterialFS = `
#version 300 es\n\
#define LOG_DEPTH\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME ShadowMaterial\n\
#define SHADOW 1\n\
#define TEMPORAL_PASS 1\n\
#define TEMPORAL_JITTER 0\n\
#define LOCAL_WEATHER_CHANNELS rgba\n\
#define CASCADE_COUNT 3\n\
#define SHAPE_DETAIL 1\n\
#define TURBULENCE 1\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
precision highp float;\n\
precision highp sampler3D;\n\
#define PI 3.141592653589793\n\
#define PI2 6.283185307179586\n\
#define PI_HALF 1.5707963267948966\n\
#define RECIPROCAL_PI 0.3183098861837907\n\
#define RECIPROCAL_PI2 0.15915494309189535\n\
#define EPSILON 1e-6\n\
#ifndef saturate\n\
    #define saturate( a ) clamp( a, 0.0, 1.0 )\n\
#endif\n\
#define whiteComplement( a ) ( 1.0 - saturate( a ) )\n\
float pow2( const in float x ) {\n\
    return x*x;\n\
}\n\
vec3 pow2( const in vec3 x ) {\n\
    return x*x;\n\
}\n\
float pow3( const in float x ) {\n\
    return x*x*x;\n\
}\n\
float pow4( const in float x ) {\n\
    float x2 = x*x;\n\
    return x2*x2;\n\
}\n\
float max3( const in vec3 v ) {\n\
    return max( max( v.x, v.y ), v.z );\n\
}\n\
float average( const in vec3 v ) {\n\
    return dot( v, vec3( 0.3333333 ) );\n\
}\n\
highp float rand( const in vec2 uv ) {\n\
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;\n\
    highp float dt = dot( uv.xy, vec2( a, b ) ), sn = mod( dt, PI );\n\
    return fract( sin( sn ) * c );\n\
}\n\
#ifdef HIGH_PRECISION\n\
    float precisionSafeLength( vec3 v ) {\n\
        return length( v );\n\
    }\n\
#else\n\
    float precisionSafeLength( vec3 v ) {\n\
        float maxComponent = max3( abs( v ) );\n\
        return length( v / maxComponent ) * maxComponent;\n\
    }\n\
#endif\n\
struct IncidentLight {\n\
    vec3 color;\n\
    vec3 direction;\n\
    bool visible;\n\
};\n\
struct ReflectedLight {\n\
    vec3 directDiffuse;\n\
    vec3 directSpecular;\n\
    vec3 indirectDiffuse;\n\
    vec3 indirectSpecular;\n\
};\n\
#ifdef USE_ALPHAHASH\n\
    in vec3 vPosition;\n\
#endif\n\
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {\n\
    return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );\n\
}\n\
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {\n\
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );\n\
}\n\
mat3 transposeMat3( const in mat3 m ) {\n\
    mat3 tmp;\n\
    tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );\n\
    tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );\n\
    tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );\n\
    return tmp;\n\
}\n\
bool isPerspectiveMatrix( mat4 m ) {\n\
    return m[ 2 ][ 3 ] == - 1.0;\n\
}\n\
vec2 equirectUv( in vec3 dir ) {\n\
    float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;\n\
    float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;\n\
    return vec2( u, v );\n\
}\n\
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {\n\
    return RECIPROCAL_PI * diffuseColor;\n\
}\n\
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {\n\
    float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n\
    return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n\
}\n\
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {\n\
    float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n\
    return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n\
}\n\
// validated\n\
\n\
#if !defined(saturate)\n\
    #define saturate(a) clamp(a, 0.0, 1.0)\n\
#endif // !defined(saturate)\n\
\n\
float remap(const float x, const float min1, const float max1, const float min2, const float max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
vec2 remap(const vec2 x, const vec2 min1, const vec2 max1, const vec2 min2, const vec2 max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
vec3 remap(const vec3 x, const vec3 min1, const vec3 max1, const vec3 min2, const vec3 max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
vec4 remap(const vec4 x, const vec4 min1, const vec4 max1, const vec4 min2, const vec4 max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
float remapClamped(\n\
const float x, const float min1, const float max1, const float min2, const float max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
vec2 remapClamped(\n\
const vec2 x, const vec2 min1, const vec2 max1, const vec2 min2, const vec2 max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
vec3 remapClamped(\n\
const vec3 x, const vec3 min1, const vec3 max1, const vec3 min2, const vec3 max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
vec4 remapClamped(\n\
const vec4 x, const vec4 min1, const vec4 max1, const vec4 min2, const vec4 max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
// Implicitly remap to 0 and 1\n\
float remap(const float x, const float min1, const float max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
vec2 remap(const vec2 x, const vec2 min1, const vec2 max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
vec3 remap(const vec3 x, const vec3 min1, const vec3 max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
vec4 remap(const vec4 x, const vec4 min1, const vec4 max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
float remapClamped(const float x, const float min1, const float max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
vec2 remapClamped(const vec2 x, const vec2 min1, const vec2 max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
vec3 remapClamped(const vec3 x, const vec3 min1, const vec3 max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
vec4 remapClamped(const vec4 x, const vec4 min1, const vec4 max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
float raySphereFirstIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const float radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    float c = dot(a, a) - radius * radius;\n\
    float discriminant = b * b - 4.0 * c;\n\
    return discriminant < 0.0\n\
    ? -1.0\n\
    : (-b - sqrt(discriminant)) * 0.5;\n\
}\n\
float raySphereFirstIntersection(const vec3 origin, const vec3 direction, const float radius) {\n\
    return raySphereFirstIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
vec4 raySphereFirstIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const vec4 radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    vec4 c = dot(a, a) - radius * radius;\n\
    vec4 discriminant = b * b - 4.0 * c;\n\
    vec4 mask = step(discriminant, vec4(0.0));\n\
    return mix((-b - sqrt(max(vec4(0.0), discriminant))) * 0.5, vec4(-1.0), mask);\n\
}\n\
vec4 raySphereFirstIntersection(const vec3 origin, const vec3 direction, const vec4 radius) {\n\
    return raySphereFirstIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
float raySphereSecondIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const float radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    float c = dot(a, a) - radius * radius;\n\
    float discriminant = b * b - 4.0 * c;\n\
    return discriminant < 0.0\n\
    ? -1.0\n\
    : (-b + sqrt(discriminant)) * 0.5;\n\
}\n\
float raySphereSecondIntersection(const vec3 origin, const vec3 direction, const float radius) {\n\
    return raySphereSecondIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
vec4 raySphereSecondIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const vec4 radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    vec4 c = dot(a, a) - radius * radius;\n\
    vec4 discriminant = b * b - 4.0 * c;\n\
    vec4 mask = step(discriminant, vec4(0.0));\n\
    return mix((-b + sqrt(max(vec4(0.0), discriminant))) * 0.5, vec4(-1.0), mask);\n\
}\n\
vec4 raySphereSecondIntersection(const vec3 origin, const vec3 direction, const vec4 radius) {\n\
    return raySphereSecondIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const vec3 center, const float radius, out float intersection1, out float intersection2\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    float c = dot(a, a) - radius * radius;\n\
    float discriminant = b * b - 4.0 * c;\n\
    if (discriminant < 0.0) {\n\
        intersection1 = -1.0;\n\
        intersection2 = -1.0;\n\
        return;\n\
    }\n\
    else {\n\
        float Q = sqrt(discriminant);\n\
        intersection1 = (-b - Q) * 0.5;\n\
        intersection2 = (-b + Q) * 0.5;\n\
    }\n\
\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const float radius, out float intersection1, out float intersection2\n\
) {\n\
    raySphereIntersections(origin, direction, vec3(0.0), radius, intersection1, intersection2);\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const vec3 center, const vec4 radius, out vec4 intersection1, out vec4 intersection2\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    vec4 c = dot(a, a) - radius * radius;\n\
    vec4 discriminant = b * b - 4.0 * c;\n\
    vec4 mask = step(discriminant, vec4(0.0));\n\
    vec4 Q = sqrt(max(vec4(0.0), discriminant));\n\
    intersection1 = mix((-b - Q) * 0.5, vec4(-1.0), mask);\n\
    intersection2 = mix((-b + Q) * 0.5, vec4(-1.0), mask);\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const vec4 radius, out vec4 intersection1, out vec4 intersection2\n\
) {\n\
    raySphereIntersections(origin, direction, vec3(0.0), radius, intersection1, intersection2);\n\
}\n\
struct GroundIrradiance {\n\
    vec3 sun;\n\
    vec3 sky;\n\
};\n\
struct CloudsIrradiance {\n\
    vec3 minSun;\n\
    vec3 minSky;\n\
    vec3 maxSun;\n\
    vec3 maxSky;\n\
};\n\
struct DensityProfile {\n\
    vec4 expTerms;\n\
    vec4 exponents;\n\
    vec4 linearTerms;\n\
    vec4 constantTerms;\n\
};\n\
uniform vec2 resolution;\n\
uniform int frame;\n\
uniform sampler3D stbnTexture;\n\
\n\
// Atmosphere\n\
\n\
uniform float bottomRadius;\n\
uniform mat4 ellipsoidMatrix;\n\
uniform mat4 inverseEllipsoidMatrix;\n\
uniform vec3 sunDirection;\n\
\n\
// Participating medium\n\
\n\
uniform float scatteringCoefficient;\n\
uniform float absorptionCoefficient;\n\
uniform vec3 albedo;\n\
\n\
// Primary raymarch\n\
\n\
uniform float minDensity;\n\
uniform float minExtinction;\n\
uniform float minTransmittance;\n\
\n\
// Shape and weather\n\
\n\
uniform sampler2D localWeatherTexture;\n\
uniform vec2 localWeatherRepeat;\n\
uniform vec2 localWeatherOffset;\n\
uniform float coverage;\n\
uniform sampler3D shapeTexture;\n\
uniform vec3 shapeRepeat;\n\
uniform vec3 shapeOffset;\n\
#ifdef SHAPE_DETAIL\n\
    uniform sampler3D shapeDetailTexture;\n\
    uniform vec3 shapeDetailRepeat;\n\
    uniform vec3 shapeDetailOffset;\n\
#endif // SHAPE_DETAIL\n\
\n\
#ifdef TURBULENCE\n\
    uniform sampler2D turbulenceTexture;\n\
    uniform vec2 turbulenceRepeat;\n\
    uniform float turbulenceDisplacement;\n\
#endif // TURBULENCE\n\
\n\
// Haze\n\
#ifdef HAZE\n\
    uniform float hazeDensityScale;\n\
    uniform float hazeExponent;\n\
#endif // HAZE\n\
\n\
// Cloud layers\n\
uniform vec4 minLayerHeights;\n\
uniform vec4 maxLayerHeights;\n\
uniform vec3 minIntervalHeights;\n\
uniform vec3 maxIntervalHeights;\n\
uniform vec4 densityScales;\n\
uniform vec4 shapeAmounts;\n\
uniform vec4 shapeDetailAmounts;\n\
uniform vec4 weatherExponents;\n\
uniform vec4 shapeAlteringBiases;\n\
uniform vec4 coverageFilterWidths;\n\
uniform float minHeight;\n\
uniform float maxHeight;\n\
uniform float shadowTopHeight;\n\
uniform float shadowBottomHeight;\n\
uniform vec4 shadowLayerMask;\n\
uniform DensityProfile densityProfile;\n\
\n\
// Implements Structured Volume Sampling in fragment shader:\n\
\n\
// https://github.com/huwb/volsample\n\
// Implementation reference:\n\
// https://www.shadertoy.com/view/ttVfDc\n\
\n\
void getIcosahedralVertices(const vec3 direction, out vec3 v1, out vec3 v2, out vec3 v3) {\n\
    // Normalization scalers to fit dodecahedron to unit sphere.\n\
    const float a = 0.85065080835204; // phi / sqrt(2 + phi)\n\
    \n\
    const float b = 0.5257311121191336; // 1 / sqrt(2 + phi)\n\
    \n\
    \n\
    // Derive the vertices of icosahedron where triangle intersects the direction.\n\
    // See: https://www.ppsloan.org/publications/AmbientDice.pdf\n\
    const float kT = 0.6180339887498948; // 1 / phi\n\
    \n\
    const float kT2 = 0.38196601125010515; // 1 / phi^2\n\
    \n\
    vec3 absD = abs(direction);\n\
    float selector1 = dot(absD, vec3(1.0, kT2, -kT));\n\
    float selector2 = dot(absD, vec3(-kT, 1.0, kT2));\n\
    float selector3 = dot(absD, vec3(kT2, -kT, 1.0));\n\
    v1 = selector1 > 0.0 ? vec3(a, b, 0.0) : vec3(-b, 0.0, a);\n\
    v2 = selector2 > 0.0 ? vec3(0.0, a, b) : vec3(a, -b, 0.0);\n\
    v3 = selector3 > 0.0 ? vec3(b, 0.0, a) : vec3(0.0, a, -b);\n\
    vec3 octantSign = sign(direction);\n\
    v1 *= octantSign;\n\
    v2 *= octantSign;\n\
    v3 *= octantSign;\n\
}\n\
void swapIfBigger(inout vec4 a, inout vec4 b) {\n\
    if (a.w > b.w) {\n\
        vec4 t = a;\n\
        a = b;\n\
        b = t;\n\
    }\n\
\n\
}\n\
void sortVertices(inout vec3 a, inout vec3 b, inout vec3 c) {\n\
    const vec3 base = vec3(0.5, 0.5, 1.0);\n\
    vec4 aw = vec4(a, dot(a, base));\n\
    vec4 bw = vec4(b, dot(b, base));\n\
    vec4 cw = vec4(c, dot(c, base));\n\
    swapIfBigger(aw, bw);\n\
    swapIfBigger(bw, cw);\n\
    swapIfBigger(aw, bw);\n\
    a = aw.xyz;\n\
    b = bw.xyz;\n\
    c = cw.xyz;\n\
}\n\
vec3 getPentagonalWeights(const vec3 direction, const vec3 v1, const vec3 v2, const vec3 v3) {\n\
    float d1 = dot(v1, direction);\n\
    float d2 = dot(v2, direction);\n\
    float d3 = dot(v3, direction);\n\
    vec3 w = exp(vec3(d1, d2, d3) * 40.0);\n\
    return w / (w.x + w.y + w.z);\n\
}\n\
vec3 getStructureNormal(\n\
const vec3 direction, const float jitter, out vec3 a, out vec3 b, out vec3 c, out vec3 weights\n\
) {\n\
    getIcosahedralVertices(direction, a, b, c);\n\
    sortVertices(a, b, c);\n\
    weights = getPentagonalWeights(direction, a, b, c);\n\
    return jitter < weights.x\n\
    ? a\n\
    : jitter < weights.x + weights.y\n\
    ? b\n\
    : c;\n\
}\n\
vec3 getStructureNormal(const vec3 direction, const float jitter) {\n\
    vec3 a, b, c, weights;\n\
    return getStructureNormal(direction, jitter, a, b, c, weights);\n\
}\n\
// Reference: https://github.com/huwb/volsample/blob/master/src/unity/Assets/Shaders/RayMarchCore.cginc\n\
void intersectStructuredPlanes(\n\
const vec3 normal, const vec3 rayOrigin, const vec3 rayDirection, const float samplePeriod, out float stepOffset, out float stepSize\n\
) {\n\
    float NoD = dot(rayDirection, normal);\n\
    stepSize = samplePeriod / abs(NoD);\n\
    \n\
    // Skips leftover bit to get from rayOrigin to first strata plane.\n\
    \n\
    stepOffset = -mod(dot(rayOrigin, normal), samplePeriod) / NoD;\n\
    \n\
    // mod() gives different results depending on if the arg is negative or\n\
    \n\
    // positive. This line makes it consistent, and ensures the first sample is in\n\
    // front of the viewer.\n\
    if (stepOffset < 0.0) {\n\
        stepOffset += stepSize;\n\
    }\n\
\n\
}\n\
float getSTBN() {\n\
    ivec3 size = textureSize(stbnTexture, 0);\n\
    vec3 scale = 1.0 / vec3(size);\n\
    return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;\n\
}\n\
// Straightforward spherical mapping\n\
vec2 getSphericalUv(const vec3 position) {\n\
    vec2 st = normalize(position.yx);\n\
    float phi = atan(st.x, st.y);\n\
    float theta = asin(normalize(position).z);\n\
    return vec2(phi * RECIPROCAL_PI2 + 0.5, theta * RECIPROCAL_PI + 0.5);\n\
}\n\
vec2 getCubeSphereUv(const vec3 position) {\n\
    // Cube-sphere relaxation by: http://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html\n\
    // TODO: Tile and fix seams.\n\
    // Possible improvements:\n\
    // https://iquilezles.org/articles/texturerepetition/\n\
    // https://gamedev.stackexchange.com/questions/184388/fragment-shader-map-dot-texture-repeatedly-over-the-sphere\n\
    // https://github.com/mmikk/hextile-demo\n\
    \n\
    vec3 n = normalize(position);\n\
    vec3 f = abs(n);\n\
    vec3 c = n / max(f.x, max(f.y, f.z));\n\
    vec2 m;\n\
    if (all(greaterThan(f.yy, f.xz))) {\n\
        m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz;\n\
    }\n\
    else if (all(greaterThan(f.xx, f.yz))) {\n\
        m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z);\n\
    }\n\
    else {\n\
        m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y);\n\
    }\n\
    vec2 m2 = m * m;\n\
    float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;\n\
    float q2 = q * q;\n\
    vec2 uv;\n\
    uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2)) * (m.x > 0.0 ? 1.0 : -1.0);\n\
    uv.y = sqrt(6.0 / (3.0 - uv.x * uv.x)) * m.y;\n\
    return uv * 0.5 + 0.5;\n\
}\n\
vec2 getGlobeUv(const vec3 position) {\n\
    return getCubeSphereUv(position);\n\
}\n\
float getMipLevel(const vec2 uv) {\n\
    const float mipLevelScale = 0.1;\n\
    vec2 coord = uv * resolution;\n\
    vec2 ddx = dFdx(coord);\n\
    vec2 ddy = dFdy(coord);\n\
    float deltaMaxSqr = max(dot(ddx, ddx), dot(ddy, ddy)) * mipLevelScale;\n\
    return max(0.0, 0.5 * log2(max(1.0, deltaMaxSqr)));\n\
}\n\
bool insideLayerIntervals(const float height) {\n\
    bvec3 gt = greaterThan(vec3(height), minIntervalHeights);\n\
    bvec3 lt = lessThan(vec3(height), maxIntervalHeights);\n\
    return any(bvec3(gt.x && lt.x, gt.y && lt.y, gt.z && lt.z));\n\
}\n\
${cloudLayerDensityGLSL}
struct WeatherSample {\n\
    vec4 heightFraction; // Normalized height of each layer\n\
    \n\
    vec4 density;\n\
};\n\
vec4 shapeAlteringFunction(const vec4 heightFraction, const vec4 bias) {\n\
    // Apply a semi-circle transform to round the clouds towards the top.\n\
    vec4 biased = pow(heightFraction, bias);\n\
    vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);\n\
    return 1.0 - x * x;\n\
}\n\
WeatherSample sampleWeather(const vec2 uv, const float height, const float mipLevel) {\n\
    WeatherSample weather;\n\
    weather.heightFraction = remapClamped(vec4(height), minLayerHeights, maxLayerHeights);\n\
    vec4 localWeather = pow(\n\
    textureLod(\n\
    localWeatherTexture, uv * localWeatherRepeat + localWeatherOffset, mipLevel\n\
    ).LOCAL_WEATHER_CHANNELS, weatherExponents\n\
    );\n\
    #ifdef SHADOW\n\
        localWeather *= shadowLayerMask;\n\
    #endif // SHADOW\n\
    \n\
    vec4 heightScale = shapeAlteringFunction(weather.heightFraction, cloudHeightBias(shapeAlteringBiases));\n\
    \n\
    // Modulation to control weather by coverage parameter.\n\
    \n\
    // Reference: https://github.com/Prograda/Skybolt/blob/master/Assets/Core/Shaders/Clouds.h#L63\n\
    vec4 factor = 1.0 - coverage * heightScale;\n\
    weather.density = remapClamped(\n\
    mix(localWeather, vec4(1.0), coverageFilterWidths), factor, factor + coverageFilterWidths\n\
    );\n\
    return weather;\n\
}\n\
vec4 getLayerDensity(const vec4 heightFraction) {\n\
    // prettier-ignore\n\
    return densityProfile.expTerms * exp(densityProfile.exponents * heightFraction) +\n\
    densityProfile.linearTerms * heightFraction +\n\
    densityProfile.constantTerms;\n\
}\n\
struct MediaSample {\n\
    float density;\n\
    vec4 weight;\n\
    float scattering;\n\
    float extinction;\n\
};\n\
// Set per cascade before raymarching; derivatives inside the march would be divergent.\n\
float shadowTexelsPerPixel;\n\
MediaSample sampleMedia(\n\
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter, inout ivec3 sampleCount\n\
) {\n\
    vec4 density = weather.density;\n\
    \n\
    // TODO: Define in physical length.\n\
    \n\
    vec3 surfaceNormal = normalize(position);\n\
    float localWeatherSpeed = length(localWeatherOffset);\n\
    vec3 evolution = -surfaceNormal * localWeatherSpeed * 2e4;\n\
    vec3 turbulence = vec3(0.0);\n\
    #ifdef TURBULENCE\n\
        vec2 turbulenceUv = uv * localWeatherRepeat * turbulenceRepeat;\n\
        turbulence = turbulenceDisplacement *\n\
        (texture(turbulenceTexture, turbulenceUv).rgb * 2.0 - 1.0) *\n\
        dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));\n\
    #endif // TURBULENCE\n\
    \n\
    vec3 shapePosition = (position + evolution + turbulence) * shapeRepeat + shapeOffset;\n\
    int shapeSamples;\n\
    vec4 shape = sampleCloudLayerShape(shapePosition, density, log2(max(1.0, shadowTexelsPerPixel)), shapeSamples);\n\
    density = remapClamped(density, (vec4(1.0) - shape) * shapeAmounts, vec4(1.0));\n\
    #ifdef DEBUG_SHOW_SAMPLE_COUNT\n\
        sampleCount.y += shapeSamples;\n\
    #endif // DEBUG_SHOW_SAMPLE_COUNT\n\
    \n\
    #ifdef SHAPE_DETAIL\n\
        // Match the cloud density's continuous detail fade across shadow LODs.\n\
        float detailFootprint = shadowTexelsPerPixel *\n\
            (shapeDetailRepeat.x / max(shapeRepeat.x, 1e-7)) *\n\
            (float(textureSize(shapeDetailTexture, 0).x) / float(textureSize(shapeTexture, 0).x));\n\
        float detailWeight = (1.0 - smoothstep(0.0, 1.5, mipLevel)) *\n\
            (1.0 - smoothstep(0.5, 2.0, detailFootprint));\n\
        if (detailWeight > 0.0) {\n\
            vec3 detailPosition = (position + turbulence) * shapeDetailRepeat + shapeDetailOffset;\n\
            float detailLod = cloudLodRange.y > cloudLodRange.x ? log2(max(1.0, detailFootprint)) : 0.0;\n\
            float detail = textureLod(shapeDetailTexture, detailPosition, detailLod).r;\n\
            // Fluffy at the top and whippy at the bottom.\n\
            \n\
            vec4 modifier = mix(\n\
            vec4(pow(detail, 6.0)), vec4(1.0 - detail), remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4))\n\
            );\n\
            modifier = mix(vec4(0.0), modifier, shapeDetailAmounts);\n\
            vec4 detailedDensity = remapClamped(density * 2.0, vec4(modifier * 0.5), vec4(1.0));\n\
            density = mix(density, detailedDensity, detailWeight);\n\
            #ifdef DEBUG_SHOW_SAMPLE_COUNT\n\
                ++sampleCount.z;\n\
            #endif // DEBUG_SHOW_SAMPLE_COUNT\n\
        }\n\
    #endif // SHAPE_DETAIL\n\
    // Nicely decrease the density at the bottom.\n\
    density = saturate(density * densityScales * getLayerDensity(weather.heightFraction));\n\
    MediaSample media;\n\
    float densitySum = density.x + density.y + density.z + density.w;\n\
    media.density = densitySum;\n\
    media.weight = density / max(densitySum, 1e-7);\n\
    media.scattering = densitySum * scatteringCoefficient;\n\
    media.extinction = densitySum * absorptionCoefficient + media.scattering;\n\
    return media;\n\
}\n\
MediaSample sampleMedia(\n\
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter\n\
) {\n\
    ivec3 sampleCount = ivec3(0);\n\
    return sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);\n\
}\n\
uniform mat4 inverseShadowMatrices[CASCADE_COUNT];\n\
uniform mat4 reprojectionMatrices[CASCADE_COUNT];\n\
\n\
// Primary raymarch\n\
\n\
uniform int maxIterationCount;\n\
uniform float minStepSize;\n\
uniform float maxStepSize;\n\
uniform float opticalDepthTailScale;\n\
in vec2 vUv;\n\
in vec3 vEllipsoidCenter;\n\
layout(location = 0) out vec4 outputColor[CASCADE_COUNT];\n\
\n\
// Redundant notation for prettier.\n\
\n\
#if CASCADE_COUNT == 1\n\
    layout(location = 1) out vec3 outputDepthVelocity[CASCADE_COUNT];\n\
    #elif CASCADE_COUNT == 2\n\
    layout(location = 2) out vec3 outputDepthVelocity[CASCADE_COUNT];\n\
    #elif CASCADE_COUNT == 3\n\
    layout(location = 3) out vec3 outputDepthVelocity[CASCADE_COUNT];\n\
    #elif CASCADE_COUNT == 4\n\
    layout(location = 4) out vec3 outputDepthVelocity[CASCADE_COUNT];\n\
#endif // CASCADE_COUNT\n\
\n\
vec4 marchClouds(\n\
const vec3 rayOrigin, const vec3 rayDirection, const float maxRayDistance, const float jitter, const float mipLevel\n\
) {\n\
    // Setup structured volume sampling (SVS).\n\
    // While SVS introduces spatial aliasing, it is indeed temporally stable, // which is important for lower-resolution shadow maps where a flickering\n\
    // single pixel can be highly noticeable.\n\
    vec3 normal = getStructureNormal(rayDirection, jitter);\n\
    float rayDistance;\n\
    float stepSize;\n\
    intersectStructuredPlanes(\n\
    normal, rayOrigin, rayDirection, clamp(maxRayDistance / float(maxIterationCount), minStepSize, maxStepSize), rayDistance, stepSize\n\
    );\n\
    #if TEMPORAL_JITTER\n\
        rayDistance -= stepSize * jitter;\n\
    #endif // TEMPORAL_JITTER\n\
    \n\
    float extinctionSum = 0.0;\n\
    float maxOpticalDepth = 0.0;\n\
    float maxOpticalDepthTail = 0.0;\n\
    float transmittanceIntegral = 1.0;\n\
    float weightedDistanceSum = 0.0;\n\
    float transmittanceSum = 0.0;\n\
    int sampleCount = 0;\n\
    for (int i = 0; i < maxIterationCount; ++i) {\n\
        if (rayDistance > maxRayDistance) {\n\
            break; // Termination\n\
        }\n\
        vec3 position = rayDistance * rayDirection + rayOrigin;\n\
        float height = length(position) - bottomRadius;\n\
        #if !defined(DEBUG_MARCH_INTERVALS)\n\
            if (insideLayerIntervals(height)) {\n\
                rayDistance += stepSize;\n\
                continue;\n\
            }\n\
        #endif // !defined(DEBUG_MARCH_INTERVALS)\n\
        // Sample rough weather.\n\
        vec2 uv = getGlobeUv(position);\n\
        WeatherSample weather = sampleWeather(uv, height, mipLevel);\n\
        if (any(greaterThan(weather.density, vec4(minDensity)))) {\n\
            // Sample detailed participating media.\n\
            // Note this assumes an homogeneous medium.\n\
            MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);\n\
            if (media.extinction > minExtinction) {\n\
                extinctionSum += media.extinction;\n\
                maxOpticalDepth += media.extinction * stepSize;\n\
                transmittanceIntegral *= exp(-media.extinction * stepSize);\n\
                weightedDistanceSum += rayDistance * transmittanceIntegral;\n\
                transmittanceSum += transmittanceIntegral;\n\
                ++sampleCount;\n\
            }\n\
\n\
        }\n\
        if (transmittanceIntegral <= minTransmittance) {\n\
            // A large amount of optical depth accumulates in the tail, beyond the\n\
            // point of minimum transmittance. The expected optical depth seems to\n\
            // decrease exponentially with the number of samples taken before reaching\n\
            // the minimum transmittance.\n\
            // See the discussion here: https://x.com/shotamatsuda/status/1886259549931520437\n\
            maxOpticalDepthTail = min(\n\
            opticalDepthTailScale * stepSize * exp(float(1 - sampleCount)), stepSize * 0.5 // Excessive optical depth only introduces aliasing.\n\
            );\n\
            break; // Early termination\n\
        }\n\
        rayDistance += stepSize;\n\
    }\n\
    if (sampleCount == 0) {\n\
        return vec4(maxRayDistance, 0.0, 0.0, 0.0);\n\
    }\n\
    float frontDepth = min(weightedDistanceSum / transmittanceSum, maxRayDistance);\n\
    float meanExtinction = extinctionSum / float(sampleCount);\n\
    return vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail);\n\
}\n\
void getRayNearFar(\n\
const vec3 sunPosition, const vec3 rayDirection, out float rayNear, out float rayFar\n\
) {\n\
    vec4 firstIntersections = raySphereFirstIntersection(\n\
    sunPosition, rayDirection, vec3(0.0), bottomRadius + vec4(shadowTopHeight, shadowBottomHeight, 0.0, 0.0)\n\
    );\n\
    rayNear = max(0.0, firstIntersections.x);\n\
    rayFar = firstIntersections.y;\n\
    if (rayFar < 0.0) {\n\
        rayFar = 1e6;\n\
    }\n\
\n\
}\n\
void cascade(\n\
const int cascadeIndex, const float mipLevel, out vec4 outputColor, out vec3 outputDepthVelocity\n\
) {\n\
    vec2 clip = vUv * 2.0 - 1.0;\n\
    vec4 point = inverseShadowMatrices[cascadeIndex] * vec4(clip.xy, -1.0, 1.0);\n\
    point /= point.w;\n\
    vec3 sunPosition = mat3(inverseEllipsoidMatrix) * point.xyz - vEllipsoidCenter;\n\
    \n\
    // The sun direction is in ECEF. Since the view matrix is constructed with the\n\
    \n\
    // ellipsoid matrix already applied, there's no need to apply the inverse\n\
    // matrix here.\n\
    vec3 rayDirection = normalize(-sunDirection);\n\
    float rayNear;\n\
    float rayFar;\n\
    getRayNearFar(sunPosition, rayDirection, rayNear, rayFar);\n\
    vec3 rayOrigin = rayNear * rayDirection + sunPosition;\n\
    // Prefilter noise to the shadow texel footprint so moving subpixel detail cannot pop.\n\
    vec3 shapeDx = dFdx(rayOrigin * shapeRepeat);\n\
    vec3 shapeDy = dFdy(rayOrigin * shapeRepeat);\n\
    shadowTexelsPerPixel = max(length(shapeDx), length(shapeDy)) * float(textureSize(shapeTexture, 0).x);\n\
    // Keep structured sample planes and detail LOD stable between frames.\n\
    float stbn = 0.5;\n\
    vec4 color = marchClouds(rayOrigin, rayDirection, rayFar - rayNear, stbn, mipLevel);\n\
    outputColor = color;\n\
    \n\
    // Velocity for temporal resolution.\n\
    \n\
    #ifdef TEMPORAL_PASS\n\
        vec3 frontPosition = color.x * rayDirection + rayOrigin;\n\
        vec3 frontPositionWorld = mat3(ellipsoidMatrix) * (frontPosition + vEllipsoidCenter);\n\
        vec4 prevClip = reprojectionMatrices[cascadeIndex] * vec4(frontPositionWorld, 1.0);\n\
        prevClip /= prevClip.w;\n\
        vec2 prevUv = prevClip.xy * 0.5 + 0.5;\n\
        vec2 velocity = (vUv - prevUv) * resolution;\n\
        outputDepthVelocity = vec3(color.x, velocity);\n\
    #else // TEMPORAL_PASS\n\
        outputDepthVelocity = vec3(0.0);\n\
    #endif // TEMPORAL_PASS\n\
}\n\
// TODO: Calculate from the main camera frustum perhaps?\n\
const float mipLevels[4] = float[4](0.0, 0.5, 1.0, 2.0);\n\
void main() {\n\
    #if 0 < CASCADE_COUNT\n\
        cascade(0, mipLevels[0], outputColor[0], outputDepthVelocity[0]);\n\
    #endif // 0 < CASCADE_COUNT\n\
    \n\
    #if 1 < CASCADE_COUNT\n\
        cascade(1, mipLevels[1], outputColor[1], outputDepthVelocity[1]);\n\
    #endif // 1 < CASCADE_COUNT\n\
    \n\
    #if 2 < CASCADE_COUNT\n\
        cascade(2, mipLevels[2], outputColor[2], outputDepthVelocity[2]);\n\
    #endif // 2 < CASCADE_COUNT\n\
    \n\
    #if 3 < CASCADE_COUNT\n\
        cascade(3, mipLevels[3], outputColor[3], outputDepthVelocity[3]);\n\
    #endif // 3 < CASCADE_COUNT\n\
}\n\
`;
const shadowResolveMaterialVS = `
#version 300 es\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME ShadowResolveMaterial\n\
#define CASCADE_COUNT 3\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
precision highp float;\n\
layout(location = 0) in vec3 position;\n\
out vec2 vUv;\n\
void main() {\n\
    vUv = position.xy * 0.5 + 0.5;\n\
    gl_Position = vec4(position.xy, 1.0, 1.0);\n\
}\n\
`;
const shadowResolveMaterialFS = `
#version 300 es\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME ShadowResolveMaterial\n\
#define CASCADE_COUNT 3\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
precision highp float;\n\
precision highp sampler2DArray;\n\
#define VARIANCE_9_SAMPLES (1)\n\
#define VARIANCE_SAMPLER_ARRAY (1)\n\
\n\
#ifdef VARIANCE_9_SAMPLES\n\
    #define VARIANCE_OFFSET_COUNT (8)\n\
    const ivec2 varianceOffsets[8] = ivec2[8](\n\
    ivec2(-1, -1), ivec2(-1, 1), ivec2(1, -1), ivec2(1, 1), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0)\n\
    );\n\
#else // VARIANCE_9_SAMPLES\n\
    #define VARIANCE_OFFSET_COUNT (4)\n\
    const ivec2 varianceOffsets[4] = ivec2[4](ivec2(1, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0));\n\
#endif // VARIANCE_9_SAMPLES\n\
\n\
// Reference: https://github.com/playdeadgames/temporal\n\
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {\n\
    vec3 pClip = 0.5 * (maxColor.rgb + minColor.rgb);\n\
    vec3 eClip = 0.5 * (maxColor.rgb - minColor.rgb) + 1e-7;\n\
    vec4 vClip = history - vec4(pClip, current.a);\n\
    vec3 vUnit = vClip.xyz / eClip;\n\
    vec3 aUnit = abs(vUnit);\n\
    float maUnit = max(aUnit.x, max(aUnit.y, aUnit.z));\n\
    if (maUnit > 1.0) {\n\
        return vec4(pClip, current.a) + vClip / maUnit;\n\
    }\n\
    return history;\n\
}\n\
#ifdef VARIANCE_SAMPLER_ARRAY\n\
    #define VARIANCE_SAMPLER sampler2DArray\n\
    #define VARIANCE_SAMPLER_COORD ivec3\n\
#else // VARIANCE_SAMPLER_ARRAY\n\
    #define VARIANCE_SAMPLER sampler2D\n\
    #define VARIANCE_SAMPLER_COORD ivec2\n\
#endif // VARIANCE_SAMPLER_ARRAY\n\
// Variance clipping\n\
// Reference: https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf\n\
vec4 varianceClipping(\n\
const VARIANCE_SAMPLER inputBuffer, const VARIANCE_SAMPLER_COORD coord, const vec4 current, const vec4 history, const float gamma\n\
) {\n\
    vec4 moment1 = current;\n\
    vec4 moment2 = current * current;\n\
    vec4 neighbor;\n\
    #if 0 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[0]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 0 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 1 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[1]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 1 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 2 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[2]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 2 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 3 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[3]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 3 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 4 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[4]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 4 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 5 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[5]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 5 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 6 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[6]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 6 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 7 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[7]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 7 < VARIANCE_OFFSET_COUNT\n\
    \n\
    \n\
    const float N = float(VARIANCE_OFFSET_COUNT + 1);\n\
    vec4 mean = moment1 / N;\n\
    vec4 varianceGamma = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;\n\
    vec4 minColor = mean - varianceGamma;\n\
    vec4 maxColor = mean + varianceGamma;\n\
    return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);\n\
}\n\
vec4 varianceClipping(\n\
const VARIANCE_SAMPLER inputBuffer, const VARIANCE_SAMPLER_COORD coord, const vec4 current, const vec4 history\n\
) {\n\
    return varianceClipping(inputBuffer, coord, current, history, 1.0);\n\
}\n\
vec4 varianceClipping(\n\
const sampler2D inputBuffer, const vec2 coord, const vec4 current, const vec4 history, const float gamma\n\
) {\n\
    vec4 moment1 = current;\n\
    vec4 moment2 = current * current;\n\
    vec4 neighbor;\n\
    #if 0 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[0]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 0 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 1 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[1]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 1 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 2 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[2]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 2 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 3 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[3]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 3 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 4 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[4]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 4 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 5 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[5]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 5 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 6 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[6]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 6 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 7 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[7]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 7 < VARIANCE_OFFSET_COUNT\n\
    \n\
    \n\
    const float N = float(VARIANCE_OFFSET_COUNT + 1);\n\
    vec4 mean = moment1 / N;\n\
    vec4 varianceGamma = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;\n\
    vec4 minColor = mean - varianceGamma;\n\
    vec4 maxColor = mean + varianceGamma;\n\
    return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);\n\
}\n\
vec4 varianceClipping(\n\
const sampler2D inputBuffer, const vec2 coord, const vec4 current, const vec4 history\n\
) {\n\
    return varianceClipping(inputBuffer, coord, current, history, 1.0);\n\
}\n\
uniform sampler2DArray inputBuffer;\n\
uniform sampler2DArray historyBuffer;\n\
uniform vec2 texelSize;\n\
uniform float varianceGamma;\n\
uniform float temporalAlpha;\n\
uniform bool historyValid;\n\
in vec2 vUv;\n\
layout(location = 0) out vec4 outputColor[CASCADE_COUNT];\n\
const ivec2 neighborOffsets[9] = ivec2[9](\n\
ivec2(-1, -1), ivec2(-1, 0), ivec2(-1, 1), ivec2(0, -1), ivec2(0, 0), ivec2(0, 1), ivec2(1, -1), ivec2(1, 0), ivec2(1, 1)\n\
);\n\
vec4 getClosestFragment(const ivec3 coord) {\n\
    vec4 result = vec4(1e7, 0.0, 0.0, 0.0);\n\
    vec4 neighbor;\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[0]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[1]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[2]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[3]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[4]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[5]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[6]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[7]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    neighbor = texelFetchOffset(\n\
    inputBuffer, coord + ivec3(0, 0, CASCADE_COUNT), 0, neighborOffsets[8]\n\
    );\n\
    if (neighbor.r < result.r) {\n\
        result = neighbor;\n\
    }\n\
    return result;\n\
}\n\
void cascade(const int cascadeIndex, out vec4 outputColor) {\n\
    ivec3 coord = ivec3(gl_FragCoord.xy, cascadeIndex);\n\
    vec4 current = texelFetch(inputBuffer, coord, 0);\n\
    if (!historyValid) {
        outputColor = current;
        return;
    }
    vec4 depthVelocity = getClosestFragment(coord);\n\
    vec2 velocity = depthVelocity.gb * texelSize;\n\
    vec2 prevUv = vUv - velocity;\n\
    if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {\n\
        outputColor = current;\n\
        return; // Rejection\n\
    }\n\
    vec4 history = texture(historyBuffer, vec3(prevUv, float(cascadeIndex)));\n\
    vec4 clippedHistory = varianceClipping(inputBuffer, coord, current, history, varianceGamma);\n\
    outputColor = mix(clippedHistory, current, temporalAlpha);\n\
}\n\
void main() {\n\
    #if 0 < CASCADE_COUNT\n\
        cascade(0, outputColor[0]);\n\
    #endif // 0 < CASCADE_COUNT\n\
    \n\
    #if 1 < CASCADE_COUNT\n\
        cascade(1, outputColor[1]);\n\
    #endif // 1 < CASCADE_COUNT\n\
    \n\
    #if 2 < CASCADE_COUNT\n\
        cascade(2, outputColor[2]);\n\
    #endif // 2 < CASCADE_COUNT\n\
    \n\
    #if 3 < CASCADE_COUNT\n\
        cascade(3, outputColor[3]);\n\
    #endif // 3 < CASCADE_COUNT\n\
}\n\
`;

let lastRoll, lastPitch, lastHeading;
let lastTime = new JulianDate(), lastPosition = new Cartesian3();
let vector3Scratch = new Cartesian3;
let resolutionScratch = new Cartesian2;
export default class ShadowMaterialPass {

    constructor(scene, options = {}) {

        this.id = createGuid();
        this._show = options.show ?? true;
        this._scene = scene;
        this.pipeline = options.pipeline;
        this._showTAA = false;
        this.minHeight = 0;
        this.maxHeight = 0;
        this.minLayerHeights = new Cartesian4(750, 1000, 7500, 0);
        this.maxLayerHeights = new Cartesian4(1400, 2200, 8000, 0);
        this.minIntervalHeights = new Cartesian3(0, 2200, 0);
        this.maxIntervalHeights = new Cartesian3(750, 7500, 0);
        this.densityScales = new Cartesian4(0.2000, 0.2000, 0.0030, 0.2000);
        this.shapeAmounts = new Cartesian4(1, 1, 0.4000, 1);
        this.shapeDetailAmounts = new Cartesian4(1, 1, 0, 1);
        this.weatherExponents = new Cartesian4(1, 1, 1, 1);
        this.shapeAlteringBiases = new Cartesian4(0.3500, 0.3500, 0.3500, 0.3500);
        this.coverageFilterWidths = new Cartesian4(0.6000, 0.6000, 0.5000, 0.6000);
        this.shadowTopHeight = 2200;
        this.shadowBottomHeight = 750;
        this.shadowLayerMask = new Cartesian4(1, 1, 0, 0);
        this.expTerms = new Cartesian4(0, 0, 0, 0);
        this.exponents = new Cartesian4(0, 0, 0, 0);
        this.linearTerms = new Cartesian4(0.7500, 0.7500, 0.7500, 0.7500);
        this.constantTerms = new Cartesian4(0.2500, 0.2500, 0.2500, 0.2500);
        this._varianceGamma = 1;
        this._jitterOffset = new Cartesian2();
        this._temporalAlpha = 0.01;
        this._historyValid = false;
        this._texelSize = new Cartesian2();
        this._altitudeCorrection = new Cartesian3();
        this.shadowNear = 1;
        // shadow
        this.inverseShadowMatrices = Array.from({ length: 4 }, () => new Matrix4())
        this.reprojectionMatrices = Array.from({ length: 4 }, () => new Matrix4())
        // Primary raymarch
        this.maxIterationCount = defaultsPass.shadow.maxIterationCount;
        this.minStepSize = defaultsPass.shadow.minStepSize;
        this.maxStepSize = defaultsPass.shadow.maxStepSize;
        this.minDensity = defaultsPass.shadow.minDensity;
        this.minExtinction = defaultsPass.shadow.minExtinction;
        this.minTransmittance = defaultsPass.shadow.minTransmittance;
        this.opticalDepthTailScale = 2;
        this.shadowCascadeCount = defaultsPass.shadow.cascadeCount;
        this.shadowMapSize = defaultsPass.shadow.mapSize;
        this.shadowMaps = new CascadedShadowMaps({
            cascadeCount: this.shadowCascadeCount,
            mapSize: this.shadowMapSize,
            splitLambda: 0.6
        })
        this._shadowUniform = {
            // Participating medium
            scatteringCoefficient: () => { return this.pipeline.scatteringCoefficient },
            absorptionCoefficient: () => { return this.pipeline.absorptionCoefficient },

            // Weather and shape
            coverage: () => { return this.pipeline.effectiveCloudCoverage },
            localWeatherTexture: () => { return this.pipeline.localWeatherTexture },
            localWeatherRepeat: () => { return this.pipeline.localWeatherRepeat },
            localWeatherOffset: () => { return this.pipeline.localWeatherOffset },
            shapeTexture: () => { return this.pipeline.shapeTexture },
            shapeRepeat: () => { return this.pipeline.shapeRepeat },
            shapeOffset: () => { return this.pipeline.shapeOffset },
            shapeDetailTexture: () => { return this.pipeline.shapeDetailTexture },
            shapeDetailRepeat: () => { return this.pipeline.shapeDetailRepeat },
            shapeDetailOffset: () => { return this.pipeline.shapeDetailOffset },
            cloudLayerTypes: () => this.pipeline.cloudMaterialPass.layerTypes,
            cloudLodRange: () => this.pipeline.cloudMaterialPass.lodRange,
            turbulenceTexture: () => { return this.pipeline.turbulenceTexture },
            turbulenceRepeat: () => { return this.pipeline.turbulenceRepeat },
            turbulenceDisplacement: () => { return this.pipeline.turbulenceDisplacement },

            minLayerHeights: () => { return this.pipeline.cloudMaterialPass.minLayerHeights },
            maxLayerHeights: () => { return this.pipeline.cloudMaterialPass.maxLayerHeights },
            minIntervalHeights: () => { return this.pipeline.cloudMaterialPass.minIntervalHeights },
            maxIntervalHeights: () => { return this.pipeline.cloudMaterialPass.maxIntervalHeights },
            densityScales: () => { return this.pipeline.cloudMaterialPass.densityScales },
            shapeAmounts: () => { return this.pipeline.cloudMaterialPass.shapeAmounts },
            shapeDetailAmounts: () => { return this.pipeline.cloudMaterialPass.shapeDetailAmounts },
            weatherExponents: () => { return this.pipeline.cloudMaterialPass.weatherExponents },
            shapeAlteringBiases: () => { return this.pipeline.cloudMaterialPass.shapeAlteringBiases },
            coverageFilterWidths: () => { return this.pipeline.cloudMaterialPass.coverageFilterWidths },
            minHeight: () => { return this.pipeline.cloudMaterialPass.minHeight },
            maxHeight: () => { return this.pipeline.cloudMaterialPass.maxHeight },
            shadowTopHeight: () => { return this.pipeline.cloudMaterialPass.shadowTopHeight },
            shadowBottomHeight: () => { return this.pipeline.cloudMaterialPass.shadowBottomHeight },
            shadowLayerMask: () => { return this.pipeline.cloudMaterialPass.shadowLayerMask },
            bottomRadius: () => { return this.pipeline.atmosphere.bottomRadius },
            topRadius: () => { return this.pipeline.atmosphere.topRadius },
            ellipsoidCenter: () => { return this.pipeline._ellipsoidCenter },
            ellipsoidMatrix: () => { return this.pipeline.ellipsoidMatrix },
            inverseEllipsoidMatrix: () => { return this.pipeline._inverseEllipsoidMatrix },
            altitudeCorrection: () => { return this._altitudeCorrection },
            sunDirection: () => { return this._scene.context.uniformState.sunDirectionWC },
            "densityProfile.expTerms": () => { return this.pipeline.cloudMaterialPass.expTerms; },
            "densityProfile.exponents": () => { return this.pipeline.cloudMaterialPass.exponents; },
            "densityProfile.linearTerms": () => { return this.pipeline.cloudMaterialPass.linearTerms; },
            "densityProfile.constantTerms": () => { return this.pipeline.cloudMaterialPass.constantTerms; },


            // shadow
            inverseShadowMatrices: () => { return this.inverseShadowMatrices },
            reprojectionMatrices: () => { return this.reprojectionMatrices },
            resolution: () => { return resolutionScratch.set(this.shadowMapSize.x, this.shadowMapSize.y) },
            frame: () => { return this.pipeline._frame },
            stbnTexture: () => { return this.pipeline.stbnTexture },

            // Primary raymarch
            maxIterationCount: () => { return this.maxIterationCount },
            minStepSize: () => { return this.minStepSize },
            maxStepSize: () => { return this.maxStepSize },
            minDensity: () => { return this.minDensity },
            minExtinction: () => { return this.minExtinction },
            minTransmittance: () => { return this.minTransmittance },
            opticalDepthTailScale: () => { return this.opticalDepthTailScale },
        }
        this.init();
    }

    init(isUpdate = false) {
        const context = this._scene.context;
        let defines = ``

        // 预处理gbuffer定义
        if (context.renderGBuffer) {
            if (context.renderGBufferTexture) {
                defines += `#define HAS_M3D_GUFFER_TEXTURE\n`;
            }
            if (context.renderGBufferTexture2) {
                defines += `#define HAS_M3D_GUFFER_TEXTURE2\n`;
            }
        }

        const gl = this._scene.context._gl;
        if (this._width !== this._scene.drawingBufferWidth ||
            this._height !== this._scene.drawingBufferHeight
        ) {
            this.invalidateHistory();
            this._width = this._scene.drawingBufferWidth;
            this._height = this._scene.drawingBufferHeight;

            this._shadowLevel = new Texture({
                context: this._scene.context,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowLevel2 = new Texture({
                context: this._scene.context,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowLevel3 = new Texture({
                context: this._scene.context,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowVecLevel1 = new Texture({
                context: this._scene.context,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowVecLevel2 = new Texture({
                context: this._scene.context,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowVecLevel3 = new Texture({
                context: this._scene.context,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowBuffer = new Texture3D({
                context: this._scene.context,
                textureType: gl.TEXTURE_2D_ARRAY,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                depth: 6,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                useTexStorage: true,
                flipY: false,
            });
            this._currentBuffer = new Texture3D({
                context: this._scene.context,
                textureType: gl.TEXTURE_2D_ARRAY,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                depth: 3,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                useTexStorage: true,
                flipY: false,
            });
            this._historyBuffer = new Texture3D({
                context: this._scene.context,
                textureType: gl.TEXTURE_2D_ARRAY,
                width: this.shadowMapSize.x,
                height: this.shadowMapSize.y,
                depth: 3,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                useTexStorage: true,
                flipY: false,
            });
            this._texelSize.set(1 / this.shadowMapSize.x, 1 / this.shadowMapSize.y)
        }

        if (!this._shadowDrawComomand) {
            const renderState = new RenderState({
                cull: {
                    enabled: true,
                    face: CullFace.BACK,
                },
                colorMask: {
                    red: true,
                    green: true,
                    blue: true,
                    alpha: true
                },
            })
            this._passState = new PassState(this._scene.context);
            this._shadowDrawComomand = this._scene.context.createViewportQuadCommand(shadowMaterialFS, {
                renderState: renderState,
                uniformMap: this._shadowUniform,
                primitiveType: PrimitiveType.TRIANGLES
            }, shadowMaterialVS);
            this._passState.viewport = new BoundingRectangle(0, 0, this.shadowMapSize.x, this.shadowMapSize.y);
            this._passState.framebuffer = new Framebuffer({
                context: this._scene.context,
                colorTextures: [this._shadowLevel, this._shadowLevel2, this._shadowLevel3,
                this._shadowVecLevel1, this._shadowVecLevel2, this._shadowVecLevel3
                ],
            });
            // 2
            this._passState2 = new PassState(this._scene.context);
            this._passState2.viewport = new BoundingRectangle(0, 0, this.shadowMapSize.x, this.shadowMapSize.y);
            this._passState2.framebuffer = new Framebuffer({
                context: this._scene.context,
                colorTextures: [this._shadowLevel, this._shadowLevel2, this._shadowLevel3],
            });

            this._shadowResolveDrawComomand = this._scene.context.createViewportQuadCommand(shadowResolveMaterialFS, {
                renderState: renderState,
                uniformMap: {
                    frame: () => { return this.pipeline._frame },
                    varianceGamma: () => { return this._varianceGamma },
                    jitterOffset: () => { return this._jitterOffset },
                    temporalAlpha: () => { return this._temporalAlpha },
                    historyValid: () => this._historyValid,
                    texelSize: () => { return this._texelSize },
                    inputBuffer: () => { return this._shadowBuffer },
                    historyBuffer: () => { return this._historyBuffer },
                },
                primitiveType: PrimitiveType.TRIANGLES
            }, shadowResolveMaterialVS);
        }
    }


    invalidateHistory() {
        this._historyValid = false;
    }

    execute(context, colorTexture, depthTexture, idTexture) {

        const shadowMaps = this.shadowMaps;
        if (!this.csmCamera) {
            this.csmCamera = {};
            this.csmCamera.near = this.shadowNear;
            this.csmCamera.viewMatrix = new Matrix4();
            this.csmCamera.projectionMatrix = new Matrix4();
            this.csmCamera.inverseViewMatrix = new Matrix4();
            this.csmCamera.inverseProjectionMatrix = new Matrix4();
        }
        this.csmCamera.far = CesiumMath.clamp(this._scene.context.uniformState.currentFrustum.y, 100000, 200000);
        if (this._scene.camera.positionCartographic.height > 100000)
            this.csmCamera.far = 10;
        Matrix4.computeView(
            this._scene.camera.position,
            this._scene.camera.direction,
            this._scene.camera.up,
            this._scene.camera.right,
            this.csmCamera.viewMatrix);
        Matrix4.computePerspectiveFieldOfView(
            this._scene.camera.frustum.fov,
            this._scene.camera.frustum._aspectRatio,
            this.csmCamera.near, this.csmCamera.far,
            this.csmCamera.projectionMatrix);
        this.csmCamera.matrixWorld = { elements: Matrix4.inverse(this.csmCamera.viewMatrix, this.csmCamera.inverseViewMatrix) };
        this.csmCamera.projectionMatrixInverse = { elements: Matrix4.inverse(this.csmCamera.projectionMatrix, this.csmCamera.inverseProjectionMatrix) };


        const sunDirection = this._scene.context.uniformState.sunDirectionWC;
        // TODO: Position the sun on the top atmosphere sphere.
        // Increase light's distance to the target when the sun is at the horizon.
        const ellipsoid = Ellipsoid.WGS84;
        // 获取表面法线（单位向量）
        const surfaceNormal = ellipsoid.geodeticSurfaceNormal(this.pipeline.cameraPositionECEF, vector3Scratch);
        const zenithAngle = Cartesian3.dot(sunDirection, surfaceNormal)
        const distance = CesiumMath.lerp(1e6, 1e3, zenithAngle)
        shadowMaps.update(
            this.csmCamera,
            vector3Scratch.copy(sunDirection).applyMatrix4(this.pipeline.ellipsoidMatrix),
            distance
        )
        if (
            shadowMaps.cascadeCount !== this.shadowCascadeCount ||
            !shadowMaps.mapSize.equals(this.shadowMapSize)
        ) {
            const { width, height } = shadowMaps.mapSize
            const depth = shadowMaps.cascadeCount
            this.shadowMapSize.set(width, height)
            this.shadowCascadeCount = depth
        }

        for (let i = 0; i < this.shadowCascadeCount; ++i) {
            const cascade = this.shadowMaps.cascades[i]
            this.inverseShadowMatrices[i].copy(cascade.inverseMatrix.elements)
        }

        const frame = this.pipeline._frame % 16;
        const offset = bayerOffsets[frame]
        const dx2 = (offset.x - 0.5) * 4
        const dy2 = (offset.y - 0.5) * 4
        this._jitterOffset.set(dx2, dy2);

        const altitudeCorrection = this._altitudeCorrection;
        if (this.pipeline.correctAltitude) {
            getAltitudeCorrectionOffset(
                this.pipeline.cameraPositionECEF,
                this.pipeline.atmosphere.bottomRadius,
                this.pipeline.ellipsoid,
                altitudeCorrection,
                false
            )
        } else {
            Cartesian3.clone(Cartesian3.ZERO, altitudeCorrection);
        }
        const gl = this._scene.context._gl;
        if (this._passState.framebuffer && !this._passState.framebuffer.onBindEvent) {
            this._passState.framebuffer.onBindEvent = (buffers) => {
                for (let layer = 0; layer < 6; ++layer) {
                    gl.framebufferTextureLayer(
                        gl.FRAMEBUFFER,
                        buffers[layer],
                        this._shadowBuffer._texture,
                        0,
                        layer
                    )
                }
            }
            this._passState.framebuffer.onDrawEvent = (buffers) => {
                gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            }
        }

        installFramebufferCallbacks(this._passState.framebuffer);
        if (this._shadowDrawComomand)
            this._shadowDrawComomand.execute(this._scene.context, this._passState);

        // resolve
        if (this._passState2.framebuffer && !this._passState2.framebuffer.onBindEvent) {
            this._passState2.framebuffer.onBindEvent = (buffers) => {
                for (let layer = 0; layer < 3; ++layer) {
                    gl.framebufferTextureLayer(
                        gl.FRAMEBUFFER,
                        buffers[layer],
                        this._currentBuffer._texture,
                        0,
                        layer
                    )
                }
            }
            this._passState2.framebuffer.onDrawEvent = (buffers) => {
                gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            }
        }

        installFramebufferCallbacks(this._passState2.framebuffer);
        if (this._shadowResolveDrawComomand)
            this._shadowResolveDrawComomand.execute(this._scene.context, this._passState2);


        for (let i = 0; i < this.shadowCascadeCount; ++i) {
            const cascade = shadowMaps.cascades[i]
            this.reprojectionMatrices[i].copy(cascade.matrix.elements)
        }
        swapTextures(this._currentBuffer, this._historyBuffer);
        this._historyValid = true;
    }

    update(context, useLogDepth) {

    }


    destroy() {

        return destroyObject(this)
    }

    isDestroyed() {

        return false;
    }
}

/**
 * 交换缓冲区 - 纹理
 * @param {*} texA 
 * @param {*} texB 
 */
function swapTextures(texA, texB) {
    const texAux = texA._texture;
    texA._texture = texB._texture;
    texB._texture = texAux;
};
