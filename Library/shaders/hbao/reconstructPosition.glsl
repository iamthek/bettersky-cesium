
vec3 reconstructPosition(const vec2 uv, const float distance) {
    return betterSkyEyePosition(uv, distance);
  }
  
  vec3 readPosition(const sampler2D depthTexture, const vec2 uv) {
    return reconstructPosition(uv, readDepth(depthTexture, uv));
  }  
