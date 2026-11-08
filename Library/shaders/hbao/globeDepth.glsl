
float readDepth(sampler2D depthTexture, vec2 texCoords) {
  // The retained terrain is independent of Cesium's later globe-depth updates.
  float distance = betterSkySceneDistance(depthTexture, texCoords);
  return betterSkyValidDistance(distance) ? distance : 0.0;
}
