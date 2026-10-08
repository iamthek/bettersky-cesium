// 叉积双边过滤pass
export const crossBilateralFilter = `
#define SAMPLES (8.0)

#ifndef OUTPUT_TYPE
#define OUTPUT_TYPE (0)
#endif

uniform sampler2D colorTexture2;
uniform sampler2D depthTexture;
uniform float textureScale;
uniform float frustumLength;
uniform float normalExponent;
uniform float depthExponent;

in vec2 v_textureCoordinates;

const float sigma = float(SAMPLES) * 0.5 + 0.5;
const float falloff = 1.0 / (2.0 * sigma * sigma);

float computeWeight(
  const vec3 normal,
  const float depth,
  const vec3 normal0,
  const float depth0
) {
  // Weights are described here: http://sci.utah.edu/~duong/papers/hoang-mssao-cgi-2011-paper.pdf
  float normalWeight = pow(
    clamp(dot(normal0, normal), 0.0, 1.0),
    normalExponent
  );
  float depthWeight = pow(1.0 / (1.0 + abs(depth0 - depth)), depthExponent);
  return normalWeight * depthWeight;
}

void addWeight(
  const vec2 uv,
  const vec2 d,
  const vec2 dd,
  const vec3 normal0,
  const float depth0,
  inout float ao,
  inout float weight
) {
  vec4 aon = texture(colorTexture2, uv + d);
  vec3 normal = unpackNormal(aon.yzw);
  // It will be much faster if we were able to write linear depths in the
  // generate phase.
  float depth = readPosition(depthTexture, uv + dd).z;
  float w = computeWeight(normal, depth, normal0, depth0);
  ao = aon.x * w + ao;
  weight += w;
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 center = texture(colorTexture2, uv);
  float depth0 = readPosition(depthTexture, uv).z;

  if (-depth0 > frustumLength) {
    #if OUTPUT_TYPE == 4 // Weight
    out_FragColor = vec4(vec3(0.0), center.yzw);
    #else
    out_FragColor = vec4(vec3(1.0), center.yzw);
    #endif // OUTPUT_TYPE
    return;
  }

  vec3 normal0 = unpackNormal(center.yzw);

  #if OUTPUT_TYPE == 4 // Weight
  float prevWeight = center.x;
  #endif

  vec2 pixelSize = 1.0 / czm_viewport.zw;
  #if DIRECTION == 0
  vec2 delta = vec2(pixelSize.x, 0.0) / textureScale;
  vec2 depthDelta = vec2(pixelSize.x, 0.0) * czm_pixelRatio;
  #else
  vec2 delta = vec2(0.0, pixelSize.y) / textureScale;
  vec2 depthDelta = vec2(0.0, pixelSize.y) * czm_pixelRatio;
  #endif // DIRECTION

  float ao = center.x;
  float weight = 1.0;
  float r = 1.0;

  for (; r <= SAMPLES / 2.0; r += 1.0) {
    vec2 d = r * delta;
    vec2 dd = r * depthDelta;
    addWeight(uv, d, dd, normal0, depth0, ao, weight);
    addWeight(uv, -d, -dd, normal0, depth0, ao, weight);
  }
  for (r += 0.5; r <= SAMPLES; r += 2.0) {
    vec2 d = r * delta;
    vec2 dd = r * depthDelta;
    addWeight(uv, d, dd, normal0, depth0, ao, weight);
    addWeight(uv, -d, -dd, normal0, depth0, ao, weight);
  }

  #if OUTPUT_TYPE == 4 // Weight
  #if DIRECTION == 0
  out_FragColor = vec4(weight * 0.05, center.yzw);
  #else
  out_FragColor = vec4(prevWeight + weight * 0.05, center.yzw);
  #endif // DIRECTION
  #else
  out_FragColor = vec4(ao / weight, center.yzw);
  #endif // OUTPUT_TYPE
}
`;

// 读取深度
export const depth = `
float readDepth(sampler2D depthTexture, vec2 texCoords) {
    return czm_reverseLogDepth(texture(depthTexture, texCoords).r);
}
`;

// globe深度
export const globeDepth = `
// uniform sampler2D globeDepthTexture;

float readDepth(sampler2D depthTexture, vec2 texCoords) {
  // The depth texture doesn't include the terrain depth if
  // globe.depthTestAgainstTerrain is false, but terrain depth should be taken
  // into account to compute ambient occlusion. Automatic uniform
  // czm_globeDepthTexture always includes the terrain depth.
  // Assume that the terrain is always higher than ellipsoid.

  return czm_reverseLogDepth(czm_unpackDepth(texture(depthTexture, texCoords)));
  // return czm_reverseLogDepth(
  //   min(
  //     texture(depthTexture, texCoords).r,
  //     czm_unpackDepth(texture(czm_globeDepthTexture, texCoords))
  //   )
  // );
}
`;

// 辅助函数
export const highPassRandom = `
// Based on https://github.com/pmndrs/drei/blob/master/src/core/softShadows.tsx

vec3 computeRandom3D(const vec2 uv) {
  return vec3(
    fract(sin(dot(uv, vec2(12.75613, 38.12123))) * 13234.76575),
    fract(sin(dot(uv, vec2(19.45531, 58.46547))) * 43678.23431),
    fract(sin(dot(uv, vec2(23.67817, 78.23121))) * 93567.23423)
  );
}

vec3 computeLowPassRandom3D(const vec2 uv) {
  vec3 result = vec3(0.0);
  result += computeRandom3D(uv + vec2(-1.0, -1.0));
  result += computeRandom3D(uv + vec2(-1.0, 0.0));
  result += computeRandom3D(uv + vec2(-1.0, 1.0));
  result += computeRandom3D(uv + vec2(0.0, -1.0));
  result += computeRandom3D(uv + vec2(0.0, 0.0));
  result += computeRandom3D(uv + vec2(0.0, 1.0));
  result += computeRandom3D(uv + vec2(1.0, -1.0));
  result += computeRandom3D(uv + vec2(1.0, 0.0));
  result += computeRandom3D(uv + vec2(1.0, 1.0));
  result *= 0.111111111; // 1.0 / 9.0
  return result;
}

vec3 computeHighPassRandom3D(const vec2 uv) {
  return computeRandom3D(uv) - computeLowPassRandom3D(uv) + 0.5;
}
`;

// 法线压缩
export const packing = `
vec3 packNormal(const vec3 normal) {
    return normalize(normal) * 0.5 + 0.5;
}
  
vec3 unpackNormal(const vec3 normal) {
return normal * 2.0 - 1.0;
}
`;

// 重建法线
export const reconstructNormal = `
vec3 getMinDiff(const vec3 position, const vec3 right, const vec3 left) {
    vec3 v1 = right - position;
    vec3 v2 = position - left;
    return dot(v1, v1) < dot(v2, v2)
      ? v1
      : v2;
  }
  
  // Based on https://wickedengine.net/2019/09/22/improved-normal-reconstruction-from-depth/
  vec3 reconstructNormalNaive(
    const sampler2D depthTexture,
    const vec2 uv,
    const vec3 position,
    const float depth,
    const vec2 pixelSize,
    out vec3 dPdx,
    out vec3 dPdy
  ) {
    vec2 ddx = vec2(pixelSize.x, 0.0);
    vec2 ddy = vec2(0.0, pixelSize.y);
  
    vec3 up = readPosition(depthTexture, uv + ddy);
    vec3 down = readPosition(depthTexture, uv - ddy);
    vec3 right = readPosition(depthTexture, uv + ddx);
    vec3 left = readPosition(depthTexture, uv - ddx);
  
    dPdx = getMinDiff(position, right, left);
    dPdy = getMinDiff(position, up, down);
  
    return normalize(cross(dPdy, dPdx));
  }
  
  vec3 readMinDiff(
    const sampler2D depthTexture,
    const vec2 uv,
    const vec3 position,
    const float depth,
    const vec4 depths,
    const vec2 delta
  ) {
    vec2 e = abs(depths.xy * depths.zw / (2.0 * depths.zw - depths.xy) - depth);
    return e.x > e.y
      ? readPosition(depthTexture, uv + delta) - position
      : position - readPosition(depthTexture, uv - delta);
  }
  
  // Based on https://atyuwen.github.io/posts/normal-reconstruction/
  vec3 reconstructNormalAccurate(
    const sampler2D depthTexture,
    const vec2 uv,
    const vec3 position,
    const float depth,
    const vec2 pixelSize,
    out vec3 dPdx,
    out vec3 dPdy
  ) {
    vec2 ddx = vec2(pixelSize.x, 0.0);
    vec2 ddy = vec2(0.0, pixelSize.y);
  
    vec4 H = vec4(
      readDepth(depthTexture, uv - ddx),
      readDepth(depthTexture, uv + ddx),
      readDepth(depthTexture, ddx * -2.0 + uv),
      readDepth(depthTexture, ddx * 2.0 + uv)
    );
    vec4 V = vec4(
      readDepth(depthTexture, uv - ddy),
      readDepth(depthTexture, uv + ddy),
      readDepth(depthTexture, ddy * -2.0 + uv),
      readDepth(depthTexture, ddy * 2.0 + uv)
    );
  
    dPdx = readMinDiff(depthTexture, uv, position, depth, H, ddx);
    dPdy = readMinDiff(depthTexture, uv, position, depth, V, ddy);
  
    return normalize(cross(dPdy, dPdx));
  }
  
  vec3 reconstructNormal(
    const sampler2D depthTexture,
    const vec2 uv,
    const vec3 position,
    const float depth,
    const vec2 pixelSize,
    out vec3 dPdx,
    out vec3 dPdy
  ) {
    #ifdef USE_ACCURATE_NORMAL
    return reconstructNormalAccurate(
      depthTexture,
      uv,
      position,
      depth,
      pixelSize,
      dPdx,
      dPdy
    );
    #else
    return reconstructNormalNaive(
      depthTexture,
      uv,
      position,
      depth,
      pixelSize,
      dPdx,
      dPdy
    );
    #endif
  }  
`;

// 重建世界坐标
export const reconstructPosition = `
vec3 reconstructPosition(const vec2 uv, const float depth) {
    vec2 xy = vec2(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0);
    vec4 position = czm_inverseProjection * vec4(xy, depth, 1.0);
    position = position / position.w;
    return position.xyz;
  }
  
  vec3 readPosition(const sampler2D depthTexture, const vec2 uv) {
    return reconstructPosition(uv, readDepth(depthTexture, uv));
  }  
`;

// 颜色图
export const turboColorMap = `
// Derived from https://gist.github.com/mikhailov-work/0d177465a8151eb6ede1768d51d476c7

const vec4 kRedVec4 = vec4(0.13572138, 4.6153926, -42.66032258, 132.13108234);
const vec4 kGreenVec4 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
const vec4 kBlueVec4 = vec4(0.1066733, 12.64194608, -60.58204836, 110.36276771);
const vec2 kRedVec2 = vec2(-152.94239396, 59.28637943);
const vec2 kGreenVec2 = vec2(4.27729857, 2.82956604);
const vec2 kBlueVec2 = vec2(-89.90310912, 27.34824973);

vec3 getTurboColormap(const float v) {
  float x = clamp(v, 0.0, 1.0);
  float x2 = x * x;
  vec4 v4 = vec4(1.0, x, x2, x2 * x);
  vec2 v2 = v4.zw * v4.z;
  return vec3(
    dot(v4, kRedVec4) + dot(v2, kRedVec2),
    dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
    dot(v4, kBlueVec4) + dot(v2, kBlueVec2)
  );
}
`;

// const vogelDisk = `
// // Derived from https://www.gamedev.net/tutorials/programming/graphics/contact-hardening-soft-shadows-made-fast-r4906/

// float getInterleavedGradientNoise(const vec2 uv) {
//   vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
//   return fract(magic.z * fract(dot(uv, magic.xy)));
// }

// vec3 getVogelDisk(const float index, const float count, const float phi) {
//   float goldenAngle = 2.4;
//   float theta = index * goldenAngle + phi;
//   float r = sqrt(index + 0.5) / sqrt(count);
//   return vec3(cos(theta), sin(theta), r);
// }
// `;

export default {};