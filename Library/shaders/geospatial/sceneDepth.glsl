#ifndef BETTERSKY_SCENE_DEPTH
#define BETTERSKY_SCENE_DEPTH
/*__DEPTH_RECONSTRUCTION__*/
// R: native scene metres, G: terrain metres, B: model proxy metres, A: coverage.
uniform sampler2D u_betterSkyDepth;
uniform bool u_betterSkyDepthAvailable;
uniform bool u_betterSkySceneDistanceAvailable;
uniform bool u_betterSkyTerrainDistanceAvailable;
uniform bool u_betterSkyBackgroundDepth;
uniform bool u_betterSkyModelDepthAvailable;

// Captured distances are metres along the camera ray, independent of Cesium's
// current frustum and of the source texture's native/packed depth encoding.
vec3 betterSkyEyeRay(vec2 uv) {
    return betterSkyProjectionRay(czm_inverseProjection, uv);
}
vec3 betterSkyEyeOrigin(vec2 uv) {
    return betterSkyProjectionOrigin(czm_inverseProjection, uv);
}
vec3 betterSkyEyePosition(vec2 uv, float distance) {
    return betterSkyEyeOrigin(uv) + betterSkyEyeRay(uv) * distance;
}

float betterSkyNativeDistance(sampler2D nativeDepth, vec2 uv) {
    float depth = texture(nativeDepth, uv).r;
    if (!(depth >= 0.0 && depth < 1.0 - 1e-7)) return 0.0;
    vec4 eye = czm_windowToEyeCoordinates(czm_viewport.xy + uv * czm_viewport.zw, depth);
    if (!betterSkyFinite4(eye) || abs(eye.w) < 1e-20) return 0.0;
    float eyeDepth = -eye.z / eye.w;
    vec3 direction = betterSkyEyeRay(uv);
    if (!betterSkyDepthInFrustum(eyeDepth, czm_currentFrustum) || direction.z >= -1e-8) return 0.0;
    float distance = eyeDepth / -direction.z;
    return betterSkyValidDistance(distance) ? distance : 0.0;
}

float betterSkySceneDistance(sampler2D nativeDepth, vec2 uv) {
    vec4 depths = texture(u_betterSkyDepth, uv);
    float terrain = u_betterSkyTerrainDistanceAvailable && betterSkyValidDistance(depths.g)
        ? depths.g : 0.0;
    // Model colour is restored after effects. Trace its uncovered background to
    // terrain/sky rather than clipping the whole soft Gaussian footprint.
    if (u_betterSkyBackgroundDepth) return terrain;
    // A captured empty frame is authoritative. Native attachments can still
    // contain the previous view when Cesium drew no opaque geometry.
    float scene = u_betterSkySceneDistanceAvailable ? depths.r
        : (u_betterSkyDepthAvailable ? 0.0 : betterSkyNativeDistance(nativeDepth, uv));
    float surface = betterSkyValidDistance(scene) ? scene : terrain;
    // Gaussian radiance has its own front-medium integral. Its proxy must not
    // shorten the uncovered background ray or turn transparent tails into walls.
    return surface;
}

vec3 betterSkyScenePosition(sampler2D nativeDepth, vec2 uv) {
    return betterSkyEyePosition(uv, betterSkySceneDistance(nativeDepth, uv));
}
#endif
