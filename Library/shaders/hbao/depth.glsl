
float readDepth(sampler2D depthTexture, vec2 texCoords) {
    float distance = betterSkySceneDistance(depthTexture, texCoords);
    return betterSkyValidDistance(distance) ? distance : 0.0;
}
