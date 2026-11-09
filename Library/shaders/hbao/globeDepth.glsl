
float readDepth(sampler2D depthTexture, vec2 texCoords) {
  // PostProcessStage receives the native scene depth-stencil texture, including terrain.
  // Keep log depth intact for eye-space reconstruction; this is not packed RGBA depth.
  return texture(depthTexture, texCoords).r;
}
