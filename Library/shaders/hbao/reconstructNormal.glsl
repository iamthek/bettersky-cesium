
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
  
    return normalize(cross(dPdx, dPdy));
  }
  
  vec3 readMinDiff(
    const sampler2D depthTexture,
    const vec2 uv,
    const vec3 position,
    const float depth,
    const vec4 depths,
    const vec2 delta
  ) {
    // Perspective-correct extrapolation of eye-space depth selects the side
    // belonging to this surface, independently of the depth-buffer encoding.
    vec2 denominator = 2.0 * depths.zw - depths.xy;
    denominator = mix(vec2(-1e-6), denominator, greaterThan(abs(denominator), vec2(1e-6)));
    vec2 e = abs(depths.xy * depths.zw / denominator - position.z);
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
      readPosition(depthTexture, uv - ddx).z,
      readPosition(depthTexture, uv + ddx).z,
      readPosition(depthTexture, ddx * -2.0 + uv).z,
      readPosition(depthTexture, ddx * 2.0 + uv).z
    );
    vec4 V = vec4(
      readPosition(depthTexture, uv - ddy).z,
      readPosition(depthTexture, uv + ddy).z,
      readPosition(depthTexture, ddy * -2.0 + uv).z,
      readPosition(depthTexture, ddy * 2.0 + uv).z
    );
  
    dPdx = readMinDiff(depthTexture, uv, position, depth, H, ddx);
    dPdy = readMinDiff(depthTexture, uv, position, depth, V, ddy);
  
    return normalize(cross(dPdx, dPdy));
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
