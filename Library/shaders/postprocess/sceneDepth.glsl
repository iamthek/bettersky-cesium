// Native depth is used unchanged in the logarithmic/single-frustum path.
// Multiple ordinary frustums are merged into positive eye-space Z (zero = sky).
uniform bool betterSkyLinearDepth;

bool betterSkyHasDepth(float depth) {
    return betterSkyLinearDepth ? depth > 0.0 : depth < 1.0;
}

vec4 betterSkyEyePosition(vec2 uv, float depth) {
    if (!betterSkyLinearDepth) {
        return czm_windowToEyeCoordinates(uv * czm_viewport.zw + czm_viewport.xy, depth);
    }
    vec3 ray = (czm_inverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0)).xyz;
    return vec4(ray * (-depth / ray.z), 1.0);
}
