import { 
    PixelDatatype, PostProcessStageComposite, PostProcessStageSampleMode
 } from "cesium";
import RenderPass from "../PostProcessStage.js";
const vs = `
#version 300 es

#define attribute in
#define varying out
#define texture2D texture
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;
#define HIGH_PRECISION
#define SHADER_TYPE ShaderMaterial
#define SHADER_NAME UpsamplingMaterial
#define FRAMEBUFFER_PRECISION_HIGH 1
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
#ifdef USE_INSTANCING
    attribute mat4 instanceMatrix;
#endif
#ifdef USE_INSTANCING_COLOR
    attribute vec3 instanceColor;
#endif
#ifdef USE_INSTANCING_MORPH
    uniform sampler2D morphTexture;
#endif
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
#ifdef USE_UV1
    attribute vec2 uv1;
#endif
#ifdef USE_UV2
    attribute vec2 uv2;
#endif
#ifdef USE_UV3
    attribute vec2 uv3;
#endif
#ifdef USE_TANGENT
    attribute vec4 tangent;
#endif
#if defined( USE_COLOR_ALPHA )
    attribute vec4 color;
    #elif defined( USE_COLOR )
    attribute vec3 color;
#endif
#ifdef USE_SKINNING
    attribute vec4 skinIndex;
    attribute vec4 skinWeight;
#endif

uniform vec2 texelSize;
varying vec2 vUv;
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
varying vec2 vUv3;
varying vec2 vUv4;
varying vec2 vUv5;
varying vec2 vUv6;
varying vec2 vUv7;
void main() {
    vUv = position.xy*0.5+0.5;
    vUv0 = vUv+texelSize*vec2(-1.0, 1.0);
    vUv1 = vUv+texelSize*vec2(0.0, 1.0);
    vUv2 = vUv+texelSize*vec2(1.0, 1.0);
    vUv3 = vUv+texelSize*vec2(-1.0, 0.0);
    vUv4 = vUv+texelSize*vec2(1.0, 0.0);
    vUv5 = vUv+texelSize*vec2(-1.0, -1.0);
    vUv6 = vUv+texelSize*vec2(0.0, -1.0);
    vUv7 = vUv+texelSize*vec2(1.0, -1.0);
    gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const fs = `
#version 300 es
#define varying in
#define texture2D texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLodEXT textureLod
#define texture2DProjLodEXT textureProjLod
#define textureCubeLodEXT textureLod
#define texture2DGradEXT textureGrad
#define texture2DProjGradEXT textureProjGrad
#define textureCubeGradEXT textureGrad
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;
#define HIGH_PRECISION
#define SHADER_TYPE ShaderMaterial
#define SHADER_NAME UpsamplingMaterial
#define FRAMEBUFFER_PRECISION_HIGH 1
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
vec4 LinearTransferOETF( in vec4 value ) {
    return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
    return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
    return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec4 linearToOutputTexel( vec4 value ) {
    return LinearTransferOETF( vec4( value.rgb * mat3( 1.0000, -0.0000, -0.0000, -0.0000, 1.0000, 0.0000, 0.0000, 0.0000, 1.0000 ), value.a ) );
}
float luminance( const in vec3 rgb ) {
    const vec3 weights = vec3( 0.2126, 0.7152, 0.0722 );
    return dot( weights, rgb );
}
uniform sampler2D inputBuffer;
uniform sampler2D supportBuffer;
uniform float radius;
varying vec2 vUv;
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
varying vec2 vUv3;
varying vec2 vUv4;
varying vec2 vUv5;
varying vec2 vUv6;
varying vec2 vUv7;
void main() {
    vec4 c = vec4(0.0);
    c += texture2D(inputBuffer, vUv0)*0.0625;
    c += texture2D(inputBuffer, vUv1)*0.125;
    c += texture2D(inputBuffer, vUv2)*0.0625;
    c += texture2D(inputBuffer, vUv3)*0.125;
    c += texture2D(inputBuffer, vUv)*0.25;
    c += texture2D(inputBuffer, vUv4)*0.125;
    c += texture2D(inputBuffer, vUv5)*0.0625;
    c += texture2D(inputBuffer, vUv6)*0.125;
    c += texture2D(inputBuffer, vUv7)*0.0625;
    vec4 baseColor = texture2D(supportBuffer, vUv);
    out_FragColor = mix(baseColor, c, radius);
    out_FragColor = linearToOutputTexel( out_FragColor );
}
`;

export function upsamplingMaterial(index, inputBuffer, supportBuffer, textureScale, texelSize, radius) {
    const upsamplingMaterial = new RenderPass({
        name: `czm_upsamplingMaterial` + index,
        fragmentShader: fs,
        vertexShader: vs,
        uniforms: {
            inputBuffer: inputBuffer.name,
            supportBuffer: supportBuffer.name,
            texelSize: () => {
                return texelSize
            },
            radius: () => {
                return 0.85;
            }
        },
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        textureScale: textureScale,
        sampleMode: PostProcessStageSampleMode.LINEAR
    })

    const upsamplingMaterialComposite = new PostProcessStageComposite({
        name: upsamplingMaterial.name + "_" + inputBuffer.name + "_" + supportBuffer.name,
        inputPreviousStageTexture: false,
        stages: [inputBuffer, upsamplingMaterial]
    });


    return upsamplingMaterialComposite;
}
export default {};