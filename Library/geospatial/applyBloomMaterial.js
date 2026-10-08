import { 
    PixelDatatype, PostProcessStageComposite, PostProcessStageSampleMode
 } from "cesium";
import RenderPass from "../PostProcessStage.js";
const vs = `
#version 300 es\n\
in vec3 position;\n\
out vec2 vUv;\n\
void main() {\n\
    vUv = position.xy*0.5+0.5;\n\
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
#define SHADER_NAME EffectMaterial\n\
#define THREE_REVISION 174\n\
#define DEPTH_PACKING 3200\n\
#define ENCODE_OUTPUT 1\n\
#define PERSPECTIVE_CAMERA 1\n\
#define UV vUv\n\
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
#define DEPTH_PACKING 3200\n\
\n\
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
vec3 packNormalToRGB( const in vec3 normal ) {\n\
    return normalize( normal ) * 0.5 + 0.5;\n\
}\n\
vec3 unpackRGBToNormal( const in vec3 rgb ) {\n\
    return 2.0 * rgb.xyz - 1.0;\n\
}\n\
const float PackUpscale = 256. / 255.;\n\
const float UnpackDownscale = 255. / 256.;\n\
const float ShiftRight8 = 1. / 256.;\n\
const float Inv255 = 1. / 255.;\n\
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );\n\
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );\n\
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );\n\
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );\n\
vec4 packDepthToRGBA( const in float v ) {\n\
    if( v <= 0.0 )\n\
    return vec4( 0., 0., 0., 0. );\n\
    if( v >= 1.0 )\n\
    return vec4( 1., 1., 1., 1. );\n\
    float vuf;\n\
    float af = modf( v * PackFactors.a, vuf );\n\
    float bf = modf( vuf * ShiftRight8, vuf );\n\
    float gf = modf( vuf * ShiftRight8, vuf );\n\
    return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );\n\
}\n\
vec3 packDepthToRGB( const in float v ) {\n\
    if( v <= 0.0 )\n\
    return vec3( 0., 0., 0. );\n\
    if( v >= 1.0 )\n\
    return vec3( 1., 1., 1. );\n\
    float vuf;\n\
    float bf = modf( v * PackFactors.b, vuf );\n\
    float gf = modf( vuf * ShiftRight8, vuf );\n\
    return vec3( vuf * Inv255, gf * PackUpscale, bf );\n\
}\n\
vec2 packDepthToRG( const in float v ) {\n\
    if( v <= 0.0 )\n\
    return vec2( 0., 0. );\n\
    if( v >= 1.0 )\n\
    return vec2( 1., 1. );\n\
    float vuf;\n\
    float gf = modf( v * 256., vuf );\n\
    return vec2( vuf * Inv255, gf );\n\
}\n\
float unpackRGBAToDepth( const in vec4 v ) {\n\
    return dot( v, UnpackFactors4 );\n\
}\n\
float unpackRGBToDepth( const in vec3 v ) {\n\
    return dot( v, UnpackFactors3 );\n\
}\n\
float unpackRGToDepth( const in vec2 v ) {\n\
    return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;\n\
}\n\
vec4 pack2HalfToRGBA( const in vec2 v ) {\n\
    vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );\n\
    return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );\n\
}\n\
vec2 unpackRGBATo2Half( const in vec4 v ) {\n\
    return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );\n\
}\n\
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {\n\
    return ( viewZ + near ) / ( near - far );\n\
}\n\
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {\n\
    return depth * ( near - far ) - near;\n\
}\n\
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {\n\
    return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );\n\
}\n\
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {\n\
    return ( near * far ) / ( ( far - near ) * depth - far );\n\
}\n\
#ifdef DITHERING\n\
    vec3 dithering( vec3 color ) {\n\
        float grid_position = rand( gl_FragCoord.xy );\n\
        vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );\n\
        dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );\n\
        return color + dither_shift_RGB;\n\
    }\n\
#endif\n\
#define packFloatToRGBA(v) packDepthToRGBA(v)\n\
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)\n\
uniform sampler2D inputBuffer;\n\
#if DEPTH_PACKING == 3201\n\
    uniform lowp sampler2D depthBuffer;\n\
    #elif defined(GL_FRAGMENT_PRECISION_HIGH)\n\
    uniform highp sampler2D depthBuffer;\n\
#else\n\
    uniform mediump sampler2D depthBuffer;\n\
#endif\n\
uniform vec2 resolution;\n\
uniform vec2 texelSize;\n\
uniform float cameraNear;\n\
uniform float cameraFar;\n\
uniform float aspect;\n\
uniform float time;\n\
varying vec2 vUv;\n\
vec4 sRGBToLinear(const in vec4 value) {\n\
    return vec4(mix(pow(value.rgb*0.9478672986+vec3(0.0521327014), vec3(2.4)), value.rgb*0.0773993808, vec3(lessThanEqual(value.rgb, vec3(0.04045)))), value.a);\n\
}\n\
float readDepth(const in vec2 uv) {\n\
    #if DEPTH_PACKING == 3201\n\
        return unpackRGBAToDepth(texture2D(depthBuffer, uv));\n\
    #else\n\
        return texture2D(depthBuffer, uv).r;\n\
    #endif\n\
}\n\
float getViewZ(const in float depth) {\n\
    #ifdef PERSPECTIVE_CAMERA\n\
        return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);\n\
    #else\n\
        return orthographicDepthToViewZ(depth, cameraNear, cameraFar);\n\
    #endif\n\
}\n\
vec3 RGBToHCV(const in vec3 RGB) {\n\
    vec4 P = mix(vec4(RGB.bg, -1.0, 2.0/3.0), vec4(RGB.gb, 0.0, -1.0/3.0), step(RGB.b, RGB.g));\n\
    vec4 Q = mix(vec4(P.xyw, RGB.r), vec4(RGB.r, P.yzx), step(P.x, RGB.r));\n\
    float C = Q.x-min(Q.w, Q.y);\n\
    float H = abs((Q.w-Q.y)/(6.0*C+EPSILON)+Q.z);\n\
    return vec3(H, C, Q.x);\n\
}\n\
vec3 RGBToHSL(const in vec3 RGB) {\n\
    vec3 HCV = RGBToHCV(RGB);\n\
    float L = HCV.z-HCV.y*0.5;\n\
    float S = HCV.y/(1.0-abs(L*2.0-1.0)+EPSILON);\n\
    return vec3(HCV.x, S, L);\n\
}\n\
vec3 HueToRGB(const in float H) {\n\
    float R = abs(H*6.0-3.0)-1.0;\n\
    float G = 2.0-abs(H*6.0-2.0);\n\
    float B = 2.0-abs(H*6.0-4.0);\n\
    return clamp(vec3(R, G, B), 0.0, 1.0);\n\
}\n\
vec3 HSLToRGB(const in vec3 HSL) {\n\
    vec3 RGB = HueToRGB(HSL.x);\n\
    float C = (1.0-abs(2.0*HSL.z-1.0))*HSL.y;\n\
    return(RGB-0.5)*C+HSL.z;\n\
}\n\
uniform float e0BlendOpacity;\n\
uniform sampler2D e0BloomBuffer;\n\
uniform sampler2D e0FeaturesBuffer;\n\
uniform float e0Intensity;\n\
void e0MainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {\n\
    vec3 bloom = texture(e0BloomBuffer, uv).rgb;\n\
    vec3 features = texture(e0FeaturesBuffer, uv).rgb;\n\
    outputColor = vec4(inputColor.rgb + (bloom + features) * e0Intensity, inputColor.a);\n\
    // outputColor = vec4(inputColor.rgb + (bloom) * e0Intensity, inputColor.a);\n\
}\n\
vec4 blend23(const in vec4 x, const in vec4 y, const in float opacity) {\n\
    return mix(x, y, opacity);\n\
}\n\
void main() {\n\
    vec4 color0 = texture2D(inputBuffer, UV);\n\
    vec4 color1 = vec4(0.0);\n\
    e0MainImage(color0, UV, color1);\n\
    color0 = blend23(color0, color1, e0BlendOpacity);\n\
    color0.a = clamp(color0.a, 0.0, 1.0);\n\
    out_FragColor = color0;\n\
    #ifdef ENCODE_OUTPUT\n\
        out_FragColor = linearToOutputTexel( out_FragColor );\n\
    #endif\n\
    #ifdef DITHERING\n\
        out_FragColor.rgb = dithering( out_FragColor.rgb );\n\
    #endif\n\
}\n\
`;
export function applyBloomMaterial(inputBuffer, e0FeaturesBuffer, that) {
    const applyBloomMaterial = new RenderPass({
        name: `czm_applyBloomMaterial`,
        fragmentShader: fs,
        vertexShader: vs,
        uniforms: {
            inputBuffer: () => {
                return that._aerialPerspectiveOutputColor;
            },
            e0BloomBuffer: inputBuffer.name,
            e0FeaturesBuffer: e0FeaturesBuffer.name,
            e0BlendOpacity: () => {
                return that._bloomBlendOpacity;
            },
            e0Intensity: () => {
                return that._bloomIntensity;
            },
        },
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        sampleMode: PostProcessStageSampleMode.LINEAR
    })
    const applyBloomMaterialComposite = new PostProcessStageComposite({
        name: applyBloomMaterial.name + "_" + e0FeaturesBuffer.name + "_" + inputBuffer.name,
        inputPreviousStageTexture: false,
        stages: [e0FeaturesBuffer, inputBuffer, applyBloomMaterial]
    });

    return applyBloomMaterialComposite;
}

export default {};