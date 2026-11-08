import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Matrix4, OrthographicOffCenterFrustum, PerspectiveOffCenterFrustum } from "cesium";

const reconstruction = await readFile(new URL("../Library/shaders/geospatial/depthReconstruction.glsl", import.meta.url), "utf8");
const normal = await readFile(new URL("../Library/shaders/hbao/reconstructNormal.glsl", import.meta.url), "utf8");
const ao = await readFile(new URL("../Library/shaders/hbao/ambientOcclusionGenerate.frag.glsl", import.meta.url), "utf8");

function body(source, name) {
    const start = source.indexOf("{", source.indexOf(name + "("));
    let end = start + 1, depth = 1;
    for (; depth; end++) {
        if (source[end] === "{") depth++;
        if (source[end] === "}") depth--;
    }
    return source.slice(start + 1, end - 1).replace(/\b(?:float|vec[234]|bool) (\w+)\s*=/g, "let $1 =");
}
const f32 = Math.fround;
const finite = Number.isFinite;
const finiteVector = value => value.every(finite);
const divide = (vector, divisor) => vector.slice(0, 3).map(value => f32(value / divisor));
const subtract = (a, b) => a.map((value, index) => f32(value - b[index]));
const scale = (a, b) => a.map(value => f32(value * b));
const length = vector => Math.hypot(...vector);
function multiply(matrix, vector) {
    return [0, 1, 2, 3].map(row => {
        let value = 0;
        for (let column = 0; column < 4; column++) value = f32(value + f32(matrix[column * 4 + row] * vector[column]));
        return value;
    });
}

// Execute the production GLSL functions with float32 matrix arithmetic. The
// assertions below use independent camera geometry, not a second ray formula.
const project = new Function("inverseProjection", "uv", "clipDepth", "multiply", "f32", "betterSkyFinite4", "betterSkyFinite3", "abs", "divide",
    body(reconstruction, "betterSkyProjectionPosition")
        .replace("inverseProjection * vec4(uv * 2.0 - 1.0, clipDepth, 1.0)", "multiply(inverseProjection, [f32(f32(uv[0] * 2) - 1), f32(f32(uv[1] * 2) - 1), clipDepth, 1])")
        .replaceAll("eye.w", "eye[3]").replace("eye.xyz / eye[3]", "divide(eye, eye[3])")
        .replaceAll("vec3(0.0)", "[0, 0, 0]"));
const position = (inverse, uv, z) => project(inverse, uv, z, multiply, f32, finiteVector, finiteVector, Math.abs, divide);
const perspective = new Function("inverseProjection", "abs",
    body(reconstruction, "betterSkyPerspectiveProjection").replace("inverseProjection[2][3]", "inverseProjection[11]"));
const isPerspective = inverse => perspective(inverse, Math.abs);
const rayFunction = new Function("inverseProjection", "uv", "betterSkyProjectionPosition", "betterSkyPerspectiveProjection", "length", "betterSkyFinite", "subtract", "divide",
    body(reconstruction, "betterSkyProjectionRay")
        .replace("middle - near", "subtract(middle, near)")
        .replace("direction / magnitude", "divide(direction, magnitude)")
        .replaceAll("vec3(0.0, 0.0, -1.0)", "[0, 0, -1]"));
const ray = (inverse, uv) => rayFunction(inverse, uv, position, isPerspective, length, finite, subtract, divide);
const originFunction = new Function("inverseProjection", "uv", "betterSkyPerspectiveProjection", "betterSkyProjectionPosition", "betterSkyProjectionRay", "abs", "subtract", "scale",
    body(reconstruction, "betterSkyProjectionOrigin")
        .replace("near - direction * (near.z / direction.z)", "subtract(near, scale(direction, near[2] / direction[2]))")
        .replaceAll("direction.z", "direction[2]").replaceAll("vec3(0.0)", "[0, 0, 0]"));
const origin = (inverse, uv) => originFunction(inverse, uv, isPerspective, position, ray, Math.abs, subtract, scale);
const inFrustumFunction = new Function("eyeDepth", "frustum", "betterSkyFinite", "max",
    body(reconstruction, "betterSkyDepthInFrustum").replaceAll("frustum.x", "frustum[0]").replaceAll("frustum.y", "frustum[1]"));
const inFrustum = (value, frustum) => inFrustumFunction(value, frustum, finite, Math.max);
const inverse = frustum => Array.from(Matrix4.inverse(frustum.projectionMatrix, new Matrix4()), f32);
const close = (a, b, epsilon = 1e-5) => assert(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test("startup far-plane float32 cancellation cannot turn perspective rays into NaNs", () => {
    const camera = new PerspectiveOffCenterFrustum({ left: -0.08, right: 0.12, bottom: -0.05, top: 0.07,
        near: 0.1, far: 8667758.4025 });
    const matrix = inverse(camera);
    assert.equal(multiply(matrix, [0, 0, 1, 1])[3], 0, "fixture must reproduce the original GPU divide-by-zero");
    for (const uv of [[0, 0], [0.5, 0.5], [1, 1], [0.2, 0.8]]) {
        const direction = ray(matrix, uv);
        assert(finiteVector(direction));
        close(length(direction), 1);
        assert(direction[2] < 0);
        // Intersect the ray with the near plane and compare to the actual
        // off-centre frustum rectangle, including its non-zero centre.
        const t = -camera.near / direction[2];
        close(direction[0] * t, camera.left + uv[0] * (camera.right - camera.left));
        close(direction[1] * t, camera.bottom + uv[1] * (camera.top - camera.bottom));
    }
    assert.deepEqual(origin(matrix, [0.8, 0.2]), [0, 0, 0]);
});

test("orthographic reconstruction preserves per-pixel origins and parallel finite rays", () => {
    const camera = new OrthographicOffCenterFrustum({ left: -40, right: 60, bottom: -20, top: 30, near: 1, far: 10000 });
    const matrix = inverse(camera);
    for (const uv of [[0, 0], [0.5, 0.5], [1, 1]]) {
        assert.deepEqual(ray(matrix, uv), [0, 0, -1]);
        const point = origin(matrix, uv);
        close(point[0], camera.left + uv[0] * (camera.right - camera.left));
        close(point[1], camera.bottom + uv[1] * (camera.top - camera.bottom));
        close(point[2], 0);
    }
});

test("linear and logarithmic depth decode to the same per-frustum ray distance", () => {
    for (const [near, far, eyeDepth] of [[0.1, 8667758.4, 9000], [1, 1000, 37], [1000, 1e6, 20000]]) {
        const camera = new PerspectiveOffCenterFrustum({ left: -near, right: near, bottom: -near, top: near, near, far });
        const matrix = inverse(camera);
        const logDepth = Math.log2(eyeDepth - near + 1) / Math.log2(far - near + 1);
        const decodedLog = 2 ** (logDepth * Math.log2(far - near + 1)) - 1 + near;
        close(decodedLog, eyeDepth, eyeDepth * 1e-6);
        assert(inFrustum(decodedLog, [near, far]));
        // The non-logarithmic fixture uses a moderate far/near range where
        // conventional float32 depth still carries the requested precision.
        if (far / near > 1e5) continue;
        const p = camera.projectionMatrix;
        const clipZ = (p[10] * -eyeDepth + p[14]) / eyeDepth;
        const decoded = position(matrix, [0.75, 0.25], clipZ);
        close(-decoded[2], eyeDepth, eyeDepth * 1e-4);
        assert(inFrustum(-decoded[2], [near, far]));
    }
    for (const value of [NaN, Infinity, -Infinity, 0, -1, 0.05, 9e6]) assert(!inFrustum(value, [0.1, 8667758.4]));
    assert(inFrustum(0.1, [0.1, 8667758.4]));
    assert(!inFrustum(10, [1000, 1e6]), "a generous far tolerance must not accept pre-near-plane values");
});

test("degenerate HBAO tangents and discontinuous normal neighbours remain finite", () => {
    const tangent = new Function("v", "bias", "length", "max", "tan", "clamp",
        body(ao, "getBiasedTangent").replaceAll("v.z", "v[2]").replaceAll("v.xy", "v.slice(0, 2)"));
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    for (const v of [[0, 0, 0], [0, 0, 1], [1e-20, 1e-20, -1]]) {
        assert(finite(tangent(v, 0.1, length, Math.max, Math.tan, clamp)));
    }
    const continuousFunction = new Function("center", "neighbor", "betterSkyValidDistance", "abs", "max", body(normal, "normalSampleIsContinuous"));
    const continuous = (center, value) => continuousFunction(center, value, value => value > 0 && finite(value), Math.abs, Math.max);
    const error = new Function("center", "inner", "outer", "normalSampleIsContinuous", "abs", "max", "betterSkyFinite", body(normal, "normalExtrapolationError"));
    for (const [inner, outer] of [[0, 0], [NaN, Infinity], [1000, 1000], [500, 1000], [1000, 0]]) {
        assert(finite(error(1000, inner, outer, continuous, Math.abs, Math.max, finite)));
    }
    assert(!continuous(1000, 0));
    assert(!continuous(1000, 500));
    assert(continuous(1000, 1001));
});
