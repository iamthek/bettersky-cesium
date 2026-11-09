
float readDepth(sampler2D depthTexture, vec2 texCoords) {
    return texture(depthTexture, texCoords).r;
}
