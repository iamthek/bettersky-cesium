bool normalSampleIsContinuous(float center, float neighbor) {
    return betterSkyValidDistance(neighbor) &&
      abs(neighbor - center) < max(1.0, center * 0.02);
}
vec3 normalDifference(
    const sampler2D depthTexture, const vec2 uv, const vec2 delta,
    const vec3 position, const float depth, const float neighborDepth,
    const bool positive
) {
    if (!normalSampleIsContinuous(depth, neighborDepth)) return vec3(0.0);
    vec3 difference = readPosition(depthTexture, uv + delta) - position;
    return betterSkyFinite3(difference) ? (positive ? difference : -difference) : vec3(0.0);
}
vec3 normalFromDifferences(vec3 dPdx, vec3 dPdy, vec3 position) {
    vec3 normal = cross(dPdx, dPdy);
    float magnitude = length(normal);
    if (betterSkyFinite(magnitude) && magnitude > 1e-10) return normal / magnitude;
    float distance = length(position);
    return betterSkyFinite(distance) && distance > 1e-10 ? -position / distance : vec3(0.0, 0.0, 1.0);
}
vec3 getMinDiff(vec3 positive, vec3 negative) {
    if (dot(positive, positive) <= 1e-16) return negative;
    if (dot(negative, negative) <= 1e-16) return positive;
    return dot(positive, positive) < dot(negative, negative) ? positive : negative;
}

// Based on https://wickedengine.net/2019/09/22/improved-normal-reconstruction-from-depth/
vec3 reconstructNormalNaive(
    const sampler2D depthTexture, const vec2 uv, const vec3 position,
    const float depth, const vec2 pixelSize, out vec3 dPdx, out vec3 dPdy
) {
    vec2 ddx = vec2(pixelSize.x, 0.0);
    vec2 ddy = vec2(0.0, pixelSize.y);
    dPdx = getMinDiff(
      normalDifference(depthTexture, uv, ddx, position, depth, readDepth(depthTexture, uv + ddx), true),
      normalDifference(depthTexture, uv, -ddx, position, depth, readDepth(depthTexture, uv - ddx), false)
    );
    dPdy = getMinDiff(
      normalDifference(depthTexture, uv, ddy, position, depth, readDepth(depthTexture, uv + ddy), true),
      normalDifference(depthTexture, uv, -ddy, position, depth, readDepth(depthTexture, uv - ddy), false)
    );
    return normalFromDifferences(dPdx, dPdy, position);
}
float normalExtrapolationError(float center, float inner, float outer) {
    if (!normalSampleIsContinuous(center, inner)) return 1e30;
    if (!normalSampleIsContinuous(center, outer)) return 1e20;
    float denominator = 2.0 * outer - inner;
    if (abs(denominator) < max(1e-7, center * 1e-7)) return 1e20;
    float error = abs(inner * outer / denominator - center);
    return betterSkyFinite(error) ? error : 1e20;
}
vec3 readMinDiff(
    const sampler2D depthTexture, const vec2 uv, const vec3 position,
    const float depth, const vec4 depths, const vec2 delta
) {
    float negativeError = normalExtrapolationError(depth, depths.x, depths.z);
    float positiveError = normalExtrapolationError(depth, depths.y, depths.w);
    bool positive = positiveError < negativeError;
    return normalDifference(depthTexture, uv, positive ? delta : -delta,
      position, depth, positive ? depths.y : depths.x, positive);
}

// Based on https://atyuwen.github.io/posts/normal-reconstruction/
vec3 reconstructNormalAccurate(
    const sampler2D depthTexture, const vec2 uv, const vec3 position,
    const float depth, const vec2 pixelSize, out vec3 dPdx, out vec3 dPdy
) {
    vec2 ddx = vec2(pixelSize.x, 0.0);
    vec2 ddy = vec2(0.0, pixelSize.y);
    vec4 H = vec4(readDepth(depthTexture, uv - ddx), readDepth(depthTexture, uv + ddx),
      readDepth(depthTexture, uv - ddx * 2.0), readDepth(depthTexture, uv + ddx * 2.0));
    vec4 V = vec4(readDepth(depthTexture, uv - ddy), readDepth(depthTexture, uv + ddy),
      readDepth(depthTexture, uv - ddy * 2.0), readDepth(depthTexture, uv + ddy * 2.0));
    dPdx = readMinDiff(depthTexture, uv, position, depth, H, ddx);
    dPdy = readMinDiff(depthTexture, uv, position, depth, V, ddy);
    return normalFromDifferences(dPdx, dPdy, position);
}
vec3 reconstructNormal(
    const sampler2D depthTexture, const vec2 uv, const vec3 position,
    const float depth, const vec2 pixelSize, out vec3 dPdx, out vec3 dPdy
) {
    #ifdef USE_ACCURATE_NORMAL
    return reconstructNormalAccurate(depthTexture, uv, position, depth, pixelSize, dPdx, dPdy);
    #else
    return reconstructNormalNaive(depthTexture, uv, position, depth, pixelSize, dPdx, dPdy);
    #endif
}
