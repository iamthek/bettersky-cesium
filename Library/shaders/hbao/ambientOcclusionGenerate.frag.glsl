
#ifndef NUM_DIRECTIONS
#define NUM_DIRECTIONS (16)
#endif

#ifndef NUM_STEPS
#define NUM_STEPS (12)
#endif

#ifndef OUTPUT_TYPE
#define OUTPUT_TYPE (0)
#endif

uniform sampler2D depthTexture;
uniform float textureScale;
uniform float intensity;
uniform float bias;
uniform float maxRadius;
uniform float frustumLength;
uniform vec2 focalLength;
uniform bool bsActive;

in vec2 v_textureCoordinates;

vec2 rotateDirection(const vec2 dir, const vec2 cosSin) {
  return vec2(
    dir.x * cosSin.x - dir.y * cosSin.y,
    dir.x * cosSin.y + dir.y * cosSin.x
  );
}

vec2 getStepSize(const vec3 position) {
  vec2 uvMaxRadius = focalLength * maxRadius / max(-position.z, 1e-7);
  return 0.5 * uvMaxRadius / (float(NUM_STEPS) + 1.0);
}

vec2 getSnappedUV(const vec2 uv) {
  return round(uv * czm_viewport.zw) / czm_viewport.zw;
}

float getBiasedTangent(const vec3 v, const float bias) {
  return clamp(v.z / max(length(v.xy), 1e-7) + tan(bias), -1e6, 1e6);
}

float getSinFromTan(const float x) {
  return x * inversesqrt(x * x + 1.0);
}

// Based on:
// https://github.com/nvpro-samples/gl_ssao/blob/master/hbao.frag.glsl
// https://github.com/scanberg/hbao/blob/master/resources/shaders/hbao_full_frag.glsl
float computeOcclusion(
  vec3 position,
  vec3 dPdx,
  vec3 dPdy,
  vec2 deltaUV,
  float randomStep
) {
  if (!betterSkyFinite3(dPdx) || !betterSkyFinite3(dPdy) || dot(deltaUV, deltaUV) < 1e-20) return 0.0;
  // Offset the first coord with some noise.
  vec2 uv = v_textureCoordinates + getSnappedUV(randomStep * deltaUV);
  deltaUV = getSnappedUV(deltaUV);

  // Calculate the tangent vector.
  vec3 T = dPdx * deltaUV.x + dPdy * deltaUV.y;
  if (dot(T, T) < 1e-16) return 0.0;

  // Get the angle of the tangent vector from the viewspace axis.
  float tanT = getBiasedTangent(T, bias);
  float sinT = getSinFromTan(tanT);

  // Sample to find the maximum angle.
  float ao = 0.0;
  float prevSinH = sinT;
  for (int i = 0; i < NUM_STEPS; ++i) {
    uv += deltaUV;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;

    float sampleDepth = readDepth(depthTexture, uv);
    if (!betterSkyValidDistance(sampleDepth)) continue;
    vec3 samplePosition = reconstructPosition(uv, sampleDepth);
    vec3 view = samplePosition - position;
    float len = length(view);
    if (!betterSkyFinite(len) || len <= 1e-7 || len >= maxRadius) continue;

    float tanH = clamp(view.z / max(length(view.xy), 1e-7), -1e6, 1e6);
    float sinH = getSinFromTan(tanH);
    if (len < maxRadius && sinH > prevSinH) {
      float falloff = 1.0 - len / maxRadius * (len / maxRadius);
      ao += (sinH - prevSinH) * falloff;
      prevSinH = sinH;
    }
  }

  return ao;
}

void main() {
  vec2 uv = v_textureCoordinates;
  float depth = readDepth(depthTexture, uv);
  if (!bsActive || !betterSkyValidDistance(depth)) {
    // Empty sky has no surface normal or horizon to integrate. Keeping its
    // occlusion neutral also prevents invalid neighbours contaminating edges.
    out_FragColor = vec4(1.0, packNormal(vec3(0.0, 0.0, 1.0)));
    return;
  }
  vec3 position = reconstructPosition(uv, depth);
  if (!betterSkyFinite3(position) || -position.z <= 1e-7) {
    out_FragColor = vec4(1.0, packNormal(vec3(0.0, 0.0, 1.0)));
    return;
  }

  #if OUTPUT_TYPE != 1
  if (-position.z > frustumLength) {
    out_FragColor = vec4(1.0, packNormal(vec3(0.0, 0.0, 1.0)));
    return;
  }
  #endif

  // Should we take czm_pixelRatio into account?
  vec2 pixelSize = textureScale / czm_viewport.zw;
  vec3 dPdx;
  vec3 dPdy;
  vec3 normal = reconstructNormal(
    depthTexture,
    uv,
    position,
    depth,
    pixelSize,
    dPdx,
    dPdy
  );
  if (!betterSkyFinite3(normal) || dot(dPdx, dPdx) <= 1e-16 || dot(dPdy, dPdy) <= 1e-16) {
    out_FragColor = vec4(1.0, packNormal(vec3(0.0, 0.0, 1.0)));
    return;
  }

  // XY for direction and Z for jitter of the first step.
  vec3 random = computeHighPassRandom3D(uv);
  vec2 rotation = 2.0 * random.xy - 1.0;
  rotation = length(rotation) > 1e-7 ? normalize(rotation) : vec2(1.0, 0.0);

  float ao = 0.0;

  vec2 stepSize = getStepSize(position);
  float alpha = czm_twoPi / float(NUM_DIRECTIONS);
  for (
    int directionIndex = 0;
    directionIndex < NUM_DIRECTIONS;
    ++directionIndex
  ) {
    // Compute normalized random direction.
    float theta = alpha * float(directionIndex);
    vec2 direction = rotateDirection(
      vec2(cos(theta), sin(theta)),
      rotation
    );

    ao += computeOcclusion(
      position,
      dPdx,
      dPdy,
      direction * stepSize,
      random.z
    );
  }

  ao /= float(NUM_DIRECTIONS * NUM_STEPS);
  ao = 1.0 - 1.0 / czm_twoPi * clamp(ao, 0.0, 1.0);
  ao = pow(ao, intensity);
  if (!betterSkyFinite(ao)) ao = 1.0;

  // Reuse normal in bilateral filter and read depth in it again.
  out_FragColor = vec4(ao, packNormal(normal));
}
