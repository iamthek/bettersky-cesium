import { 
    PixelDatatype, PostProcessStageComposite, PostProcessStageSampleMode
 } from "cesium";
import RenderPass from "../PostProcessStage.js";

export const downsampleThresholdMaterialVS = `
#version 300 es\n\
#define attribute in\n\
#define varying out\n\
#define texture2D texture\n\
precision highp float;\n\
precision highp int;\n\
precision highp sampler2D;\n\
precision highp samplerCube;\n\
precision highp sampler3D;\n\
precision highp sampler2DArray;\n\
precision highp sampler2DShadow;\n\
precision highp samplerCubeShadow;\n\
precision highp sampler2DArrayShadow;\n\
precision highp isampler2D;\n\
precision highp isampler3D;\n\
precision highp isamplerCube;\n\
precision highp isampler2DArray;\n\
precision highp usampler2D;\n\
precision highp usampler3D;\n\
precision highp usamplerCube;\n\
precision highp usampler2DArray;\n\
#define HIGH_PRECISION\n\
#define SHADER_TYPE ShaderMaterial\n\
#define SHADER_NAME DownsampleThresholdMaterial\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
uniform mat4 modelMatrix;\n\
uniform mat4 modelViewMatrix;\n\
uniform mat4 projectionMatrix;\n\
uniform mat4 viewMatrix;\n\
uniform mat3 normalMatrix;\n\
uniform vec3 cameraPosition;\n\
uniform bool isOrthographic;\n\
#ifdef USE_INSTANCING\n\
    attribute mat4 instanceMatrix;\n\
#endif\n\
#ifdef USE_INSTANCING_COLOR\n\
    attribute vec3 instanceColor;\n\
#endif\n\
#ifdef USE_INSTANCING_MORPH\n\
    uniform sampler2D morphTexture;\n\
#endif\n\
attribute vec3 position;\n\
attribute vec3 normal;\n\
attribute vec2 uv;\n\
#ifdef USE_UV1\n\
    attribute vec2 uv1;\n\
#endif\n\
#ifdef USE_UV2\n\
    attribute vec2 uv2;\n\
#endif\n\
#ifdef USE_UV3\n\
    attribute vec2 uv3;\n\
#endif\n\
#ifdef USE_TANGENT\n\
    attribute vec4 tangent;\n\
#endif\n\
#if defined( USE_COLOR_ALPHA )\n\
    attribute vec4 color;\n\
    #elif defined( USE_COLOR )\n\
    attribute vec3 color;\n\
#endif\n\
#ifdef USE_SKINNING\n\
    attribute vec4 skinIndex;\n\
    attribute vec4 skinWeight;\n\
#endif\n\
\n\
uniform vec2 texelSize;\n\
out vec2 vCenterUv1;\n\
out vec2 vCenterUv2;\n\
out vec2 vCenterUv3;\n\
out vec2 vCenterUv4;\n\
out vec2 vRowUv1;\n\
out vec2 vRowUv2;\n\
out vec2 vRowUv3;\n\
out vec2 vRowUv4;\n\
out vec2 vRowUv5;\n\
out vec2 vRowUv6;\n\
out vec2 vRowUv7;\n\
out vec2 vRowUv8;\n\
out vec2 vRowUv9;\n\
void main() {\n\
    vec2 uv = position.xy * 0.5 + 0.5;\n\
    vCenterUv1 = uv + texelSize * vec2(-1.0, 1.0);\n\
    vCenterUv2 = uv + texelSize * vec2(1.0, 1.0);\n\
    vCenterUv3 = uv + texelSize * vec2(-1.0, -1.0);\n\
    vCenterUv4 = uv + texelSize * vec2(1.0, -1.0);\n\
    vRowUv1 = uv + texelSize * vec2(-2.0, 2.0);\n\
    vRowUv2 = uv + texelSize * vec2(0.0, 2.0);\n\
    vRowUv3 = uv + texelSize * vec2(2.0, 2.0);\n\
    vRowUv4 = uv + texelSize * vec2(-2.0, 0.0);\n\
    vRowUv5 = uv + texelSize;\n\
    vRowUv6 = uv + texelSize * vec2(2.0, 0.0);\n\
    vRowUv7 = uv + texelSize * vec2(-2.0, -2.0);\n\
    vRowUv8 = uv + texelSize * vec2(0.0, -2.0);\n\
    vRowUv9 = uv + texelSize * vec2(2.0, -2.0);\n\
    gl_Position = vec4(position.xy, 1.0, 1.0);\n\
}\n\
`;

export const downsampleThresholdMaterialFS = `
#version 300 es\n\
#define varying in\n\
#define texture2D texture\n\
#define textureCube texture\n\
#define texture2DProj textureProj\n\
#define texture2DLodEXT textureLod\n\
#define texture2DProjLodEXT textureProjLod\n\
#define textureCubeLodEXT textureLod\n\
#define texture2DGradEXT textureGrad\n\
#define texture2DProjGradEXT textureProjGrad\n\
#define textureCubeGradEXT textureGrad\n\
precision highp float;\n\
precision highp int;\n\
precision highp sampler2D;\n\
precision highp samplerCube;\n\
precision highp sampler3D;\n\
precision highp sampler2DArray;\n\
precision highp sampler2DShadow;\n\
precision highp samplerCubeShadow;\n\
precision highp sampler2DArrayShadow;\n\
precision highp isampler2D;\n\
precision highp isampler3D;\n\
precision highp isamplerCube;\n\
precision highp isampler2DArray;\n\
precision highp usampler2D;\n\
precision highp usampler3D;\n\
precision highp usamplerCube;\n\
precision highp usampler2DArray;\n\
#define HIGH_PRECISION\n\
#define SHADER_TYPE ShaderMaterial\n\
#define SHADER_NAME DownsampleThresholdMaterial\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
uniform mat4 viewMatrix;\n\
uniform vec3 cameraPosition;\n\
uniform bool isOrthographic;\n\
vec4 LinearTransferOETF( in vec4 value ) {\n\
    return value;\n\
}\n\
vec4 sRGBTransferEOTF( in vec4 value ) {\n\
    return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );\n\
}\n\
vec4 sRGBTransferOETF( in vec4 value ) {\n\
    return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );\n\
}\n\
vec4 linearToOutputTexel( vec4 value ) {\n\
    return LinearTransferOETF( vec4( value.rgb * mat3( 1.0000, -0.0000, -0.0000, -0.0000, 1.0000, 0.0000, 0.0000, 0.0000, 1.0000 ), value.a ) );\n\
}\n\
float luminance( const in vec3 rgb ) {\n\
    const vec3 weights = vec3( 0.2126, 0.7152, 0.0722 );\n\
    return dot( weights, rgb );\n\
}\n\
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
    varying vec3 vPosition;\n\
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
uniform sampler2D inputBuffer;\n\
uniform float thresholdLevel;\n\
uniform float thresholdRange;\n\
in vec2 vCenterUv1;\n\
in vec2 vCenterUv2;\n\
in vec2 vCenterUv3;\n\
in vec2 vCenterUv4;\n\
in vec2 vRowUv1;\n\
in vec2 vRowUv2;\n\
in vec2 vRowUv3;\n\
in vec2 vRowUv4;\n\
in vec2 vRowUv5;\n\
in vec2 vRowUv6;\n\
in vec2 vRowUv7;\n\
in vec2 vRowUv8;\n\
in vec2 vRowUv9;\n\
float clampToBorder(const vec2 uv) {\n\
    return float(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0);\n\
}\n\
// Reference: https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom\n\
void main() {\n\
    vec3 color = 0.125 * texture(inputBuffer, vec2(vRowUv5)).rgb;\n\
    vec4 weight = 0.03125 *\n\
    vec4(\n\
    clampToBorder(vRowUv1), clampToBorder(vRowUv3), clampToBorder(vRowUv7), clampToBorder(vRowUv9)\n\
    );\n\
    color += weight.x * texture(inputBuffer, vec2(vRowUv1)).rgb;\n\
    color += weight.y * texture(inputBuffer, vec2(vRowUv3)).rgb;\n\
    color += weight.z * texture(inputBuffer, vec2(vRowUv7)).rgb;\n\
    color += weight.w * texture(inputBuffer, vec2(vRowUv9)).rgb;\n\
    weight = 0.0625 *\n\
    vec4(\n\
    clampToBorder(vRowUv2), clampToBorder(vRowUv4), clampToBorder(vRowUv6), clampToBorder(vRowUv8)\n\
    );\n\
    color += weight.x * texture(inputBuffer, vec2(vRowUv2)).rgb;\n\
    color += weight.y * texture(inputBuffer, vec2(vRowUv4)).rgb;\n\
    color += weight.z * texture(inputBuffer, vec2(vRowUv6)).rgb;\n\
    color += weight.w * texture(inputBuffer, vec2(vRowUv8)).rgb;\n\
    weight = 0.125 *\n\
    vec4(\n\
    clampToBorder(vRowUv2), clampToBorder(vRowUv4), clampToBorder(vRowUv6), clampToBorder(vRowUv8)\n\
    );\n\
    color += weight.x * texture(inputBuffer, vec2(vCenterUv1)).rgb;\n\
    color += weight.y * texture(inputBuffer, vec2(vCenterUv2)).rgb;\n\
    color += weight.z * texture(inputBuffer, vec2(vCenterUv3)).rgb;\n\
    color += weight.w * texture(inputBuffer, vec2(vCenterUv4)).rgb;\n\
    \n\
    // WORKAROUND: Avoid screen flashes if the input buffer contains NaN texels.\n\
    \n\
    // See: https://github.com/takram-design-engineering/three-geospatial/issues/7\n\
    if (any(isnan(color))) {\n\
        out_FragColor = vec4(vec3(0.0), 1.0);\n\
        return;\n\
    }\n\
    float l = luminance(color);\n\
    float scale = saturate(smoothstep(thresholdLevel, thresholdLevel + thresholdRange, l));\n\
    out_FragColor = vec4(color * scale, 1.0);\n\
}\n\
`;

export function downsampleThresholdMaterial(textureScale, texelSize, that) {
    const downsampleThresholdMaterial = new RenderPass({
        name: `czm_downsampleThresholdMaterial`,
        fragmentShader: downsampleThresholdMaterialFS,
        vertexShader: downsampleThresholdMaterialVS,
        uniforms: {
            inputBuffer: () => {
                return that._aerialPerspectiveOutputColor;
            },
            texelSize: () => {
                return texelSize
            },
            thresholdLevel: () => {
                return that._thresholdLevel;
            },
            thresholdRange: () => {
                return that._thresholdRange;
            },
        },
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        textureScale: textureScale,
        sampleMode: PostProcessStageSampleMode.LINEAR
    })



    return downsampleThresholdMaterial;
}
export default {};