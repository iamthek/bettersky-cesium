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
#define SHADER_NAME KawaseBlurMaterial\n\
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
uniform vec4 texelSize;\n\
uniform float kernel;\n\
uniform float scale;\n\
varying vec2 vUv0;\n\
varying vec2 vUv1;\n\
varying vec2 vUv2;\n\
varying vec2 vUv3;\n\
void main() {\n\
    vec2 uv = position.xy*0.5+0.5;\n\
    vec2 dUv = (texelSize.xy*vec2(kernel)+texelSize.zw)*scale;\n\
    vUv0 = vec2(uv.x-dUv.x, uv.y+dUv.y);\n\
    vUv1 = vec2(uv.x+dUv.x, uv.y+dUv.y);\n\
    vUv2 = vec2(uv.x+dUv.x, uv.y-dUv.y);\n\
    vUv3 = vec2(uv.x-dUv.x, uv.y-dUv.y);\n\
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
#define SHADER_NAME KawaseBlurMaterial\n\
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
uniform sampler2D inputBuffer;\n\
varying vec2 vUv0;\n\
varying vec2 vUv1;\n\
varying vec2 vUv2;\n\
varying vec2 vUv3;\n\
void main() {\n\
    vec4 sum = texture2D(inputBuffer, vUv0);\n\
    sum += texture2D(inputBuffer, vUv1);\n\
    sum += texture2D(inputBuffer, vUv2);\n\
    sum += texture2D(inputBuffer, vUv3);\n\
    out_FragColor = sum*0.25;\n\
    out_FragColor = linearToOutputTexel( out_FragColor );\n\
}\n\
`;

export function kawaseBlurMaterial(index, inputBuffer, textureScale, texelSize, kernel, scale, isComposite) {
    const uniforms = {
        texelSize: () => {
            return texelSize
        },
        kernel: () => {
            return kernel
        },
        scale: () => {
            return scale
        },
    };
    if (index === 0) {
        uniforms.inputBuffer = function () {
            return inputBuffer;
        }
    } else {
        uniforms.inputBuffer = inputBuffer.name;
    }
    const kawaseBlurMaterial = new RenderPass({
        name: `czm_kawaseBlurMaterial` + index,
        fragmentShader: fs,
        vertexShader: vs,
        uniforms: uniforms,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        textureScale: textureScale,
        sampleMode: PostProcessStageSampleMode.LINEAR
    })
    if (!isComposite) {
        return kawaseBlurMaterial;
    }
    const kawaseBlurMaterialComposite = new PostProcessStageComposite({
        name: kawaseBlurMaterial.name + "_" + inputBuffer.name,
        inputPreviousStageTexture: false,
        stages: [inputBuffer, kawaseBlurMaterial]
    });

    return kawaseBlurMaterialComposite;
}

export default {};