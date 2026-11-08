#ifndef BETTERSKY_DEPTH_RECONSTRUCTION
#define BETTERSKY_DEPTH_RECONSTRUCTION
bool betterSkyFinite(float value) {
    return !isnan(value) && !isinf(value);
}
bool betterSkyFinite3(vec3 value) {
    return !any(isnan(value)) && !any(isinf(value));
}
bool betterSkyFinite4(vec4 value) {
    return !any(isnan(value)) && !any(isinf(value));
}
bool betterSkyValidDistance(float distance) {
    return distance > 0.0 && betterSkyFinite(distance);
}
vec3 betterSkyProjectionPosition(mat4 inverseProjection, vec2 uv, float clipDepth) {
    vec4 eye = inverseProjection * vec4(uv * 2.0 - 1.0, clipDepth, 1.0);
    if (!betterSkyFinite4(eye) || abs(eye.w) < 1e-20) return vec3(0.0);
    vec3 position = eye.xyz / eye.w;
    return betterSkyFinite3(position) ? position : vec3(0.0);
}
bool betterSkyPerspectiveProjection(mat4 inverseProjection) {
    // The inverse perspective matrix has a z-dependent homogeneous divisor;
    // an orthographic inverse has a constant one (including off-centre views).
    return abs(inverseProjection[2][3]) > 1e-20;
}
vec3 betterSkyProjectionRay(mat4 inverseProjection, vec2 uv) {
    // Reconstruct at finite clip planes. At z=1 a large far/near ratio rounds
    // the perspective divisor to zero in float32 before the first terrain tile.
    vec3 middle = betterSkyProjectionPosition(inverseProjection, uv, 0.0);
    vec3 direction = middle;
    if (!betterSkyPerspectiveProjection(inverseProjection)) {
        vec3 near = betterSkyProjectionPosition(inverseProjection, uv, -1.0);
        direction = middle - near;
    }
    float magnitude = length(direction);
    return betterSkyFinite(magnitude) && magnitude > 1e-20
        ? direction / magnitude : vec3(0.0, 0.0, -1.0);
}
vec3 betterSkyProjectionOrigin(mat4 inverseProjection, vec2 uv) {
    if (betterSkyPerspectiveProjection(inverseProjection)) return vec3(0.0);
    vec3 near = betterSkyProjectionPosition(inverseProjection, uv, -1.0);
    vec3 direction = betterSkyProjectionRay(inverseProjection, uv);
    return abs(direction.z) > 1e-8 ? near - direction * (near.z / direction.z) : vec3(0.0);
}
bool betterSkyDepthInFrustum(float eyeDepth, vec2 frustum) {
    // Float depth decoding can differ slightly at a frustum boundary; reject
    // invalid projections rather than treating them as astronomical geometry.
    float nearTolerance = max(1e-4, frustum.x * 1e-4);
    float farTolerance = max(0.01, frustum.y * 1e-5);
    return betterSkyFinite(eyeDepth) && eyeDepth > 0.0 &&
        betterSkyFinite(frustum.x) && betterSkyFinite(frustum.y) &&
        frustum.x >= 0.0 && frustum.y > frustum.x &&
        eyeDepth >= max(0.0, frustum.x - nearTolerance) && eyeDepth <= frustum.y + farTolerance;
}
#endif
