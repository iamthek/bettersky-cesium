
vec3 reconstructPosition(const vec2 uv, const float depth) {
    vec4 position = betterSkyEyePosition(uv, depth);
    position = position / position.w;
    return position.xyz;
  }
  
  vec3 readPosition(const sampler2D depthTexture, const vec2 uv) {
    return reconstructPosition(uv, readDepth(depthTexture, uv));
  }  
