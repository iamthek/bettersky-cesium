import { 
    PixelDatatype, PostProcessStageComposite, PostProcessStageSampleMode
 } from "cesium";
import RenderPass from "../PostProcessStage.js";
const vs = `
#version 300 es\n\
\n\
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
#define SHADER_NAME LensFlareFeaturesMaterial\n\
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
out vec2 vUv;\n\
out vec2 vAspectRatio;\n\
void main() {\n\
    vUv = position.xy * 0.5 + 0.5;\n\
    vAspectRatio = vec2(texelSize.x / texelSize.y, 1.0);\n\
    gl_Position = vec4(position.xy, 1.0, 1.0);\n\
}\n\
`;
const fs = `
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
#define SHADER_NAME LensFlareFeaturesMaterial\n\
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
#define SQRT_2 (0.7071067811865476)\n\
\n\
uniform sampler2D inputBuffer;\n\
uniform vec2 texelSize;\n\
uniform float ghostAmount;\n\
uniform float haloAmount;\n\
uniform float chromaticAberration;\n\
in vec2 vUv;\n\
in vec2 vAspectRatio;\n\
vec3 sampleGhost(const vec2 direction, const vec3 color, const float offset) {\n\
    vec2 suv = clamp(1.0 - vUv + direction * offset, 0.0, 1.0);\n\
    vec3 result = texture(inputBuffer, suv).rgb * color;\n\
    \n\
    // Falloff at the perimeter.\n\
    \n\
    float d = clamp(length(0.5 - suv) / (0.5 * SQRT_2), 0.0, 1.0);\n\
    result *= pow(1.0 - d, 3.0);\n\
    return result;\n\
}\n\
vec4 sampleGhosts(float amount) {\n\
    vec3 color = vec3(0.0);\n\
    vec2 direction = vUv - 0.5;\n\
    color += sampleGhost(direction, vec3(0.8, 0.8, 1.0), -5.0);\n\
    color += sampleGhost(direction, vec3(1.0, 0.8, 0.4), -1.5);\n\
    color += sampleGhost(direction, vec3(0.9, 1.0, 0.8), -0.4);\n\
    color += sampleGhost(direction, vec3(1.0, 0.8, 0.4), -0.2);\n\
    color += sampleGhost(direction, vec3(0.9, 0.7, 0.7), -0.1);\n\
    color += sampleGhost(direction, vec3(0.5, 1.0, 0.4), 0.7);\n\
    color += sampleGhost(direction, vec3(0.5, 0.5, 0.5), 1.0);\n\
    color += sampleGhost(direction, vec3(1.0, 1.0, 0.6), 2.5);\n\
    color += sampleGhost(direction, vec3(0.5, 0.8, 1.0), 10.0);\n\
    return vec4(color * amount, 1.0);\n\
}\n\
// Reference: https://john-chapman.github.io/2017/11/05/pseudo-lens-flare.html\n\
float cubicRingMask(const float x, const float radius, const float thickness) {\n\
    float v = min(abs(x - radius) / thickness, 1.0);\n\
    return 1.0 - v * v * (3.0 - 2.0 * v);\n\
}\n\
vec3 sampleHalo(const float radius) {\n\
    vec2 direction = normalize((vUv - 0.5) / vAspectRatio) * vAspectRatio;\n\
    vec3 offset = vec3(texelSize.x * chromaticAberration) * vec3(-1.0, 0.0, 1.0);\n\
    vec2 suv = fract(1.0 - vUv + direction * radius);\n\
    vec3 result = vec3(\n\
    texture(inputBuffer, suv + direction * offset.r).r, texture(inputBuffer, suv + direction * offset.g).g, texture(inputBuffer, suv + direction * offset.b).b\n\
    );\n\
    \n\
    // Falloff at the center and perimeter.\n\
    \n\
    vec2 wuv = (vUv - vec2(0.5, 0.0)) / vAspectRatio + vec2(0.5, 0.0);\n\
    float d = saturate(distance(wuv, vec2(0.5)));\n\
    result *= cubicRingMask(d, 0.45, 0.25);\n\
    return result;\n\
}\n\
vec4 sampleHalos(const float amount) {\n\
    vec3 color = vec3(0.0);\n\
    color += sampleHalo(0.3);\n\
    return vec4(color, 1.0) * amount;\n\
}\n\
void main() {\n\
    out_FragColor += sampleGhosts(ghostAmount);\n\
    out_FragColor += sampleHalos(haloAmount);\n\
}\n\
`;

export function lensFlareFeaturesMaterial(index, inputBuffer, textureScale, texelSize, that) {
    const lensFlareFeaturesMaterial = new RenderPass({
        name: `czm_lensFlareFeaturesMaterial` + index,
        fragmentShader: fs,
        vertexShader: vs,
        uniforms: {
            inputBuffer: inputBuffer.name,
            texelSize: () => {
                return texelSize
            },
            ghostAmount: () => {
                return that._ghostAmount
            },
            haloAmount: () => {
                return that._haloAmount
            },
            chromaticAberration: () => {
                return that._chromaticAberration
            },
        },
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        textureScale: textureScale,
        sampleMode: PostProcessStageSampleMode.LINEAR
    })
    const lensFlareFeaturesMaterialComposite = new PostProcessStageComposite({
        name: lensFlareFeaturesMaterial.name + "_" + inputBuffer.name,
        inputPreviousStageTexture: false,
        stages: [inputBuffer, lensFlareFeaturesMaterial]
    });

    return lensFlareFeaturesMaterialComposite;
}

export default {};