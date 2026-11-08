import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = name => readFile(new URL(`../Library/shaders/geospatial/${name}`, import.meta.url), "utf8");
const [density, march, resolve] = await Promise.all([
    read("cloudLayerDensity.glsl"), read("cloudsMaterial.frag.glsl"), read("cloudsResolveMaterial.frag.glsl"),
]);

function functionBody(source, name) {
    const start = source.indexOf("{", source.indexOf(name + "("));
    assert(start >= 0, name);
    let depth = 1, end = start + 1;
    for (; depth; end++) {
        if (source[end] === "{") depth++;
        else if (source[end] === "}") depth--;
    }
    return source.slice(start + 1, end - 1);
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = (low, high, value) => {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
};
const mix = (a, b, weight) => a * (1 - weight) + b * weight;
const scalar = source => source.replace(/\b(?:float|vec[234]|int|WeatherSample|MediaSample)\s+(\w+)/g, "let $1")
    .replace(/\bfloat\(([^)]+)\)/g, "($1)");

// Run the actual shader's scalar channel equations. Their contracts are checked
// against independent Beer-law and identity references, not copied snapshots.
const erode = new Function("density", "modifier", "amount", "clamp",
    scalar(functionBody(density, "cloudErodeDensity")));
const centroid = new Function("extinction", "stepLength", "exp", "min",
    scalar(functionBody(march, "cloudCellCentroid")));
const rayLength = new Function("baseDistance", "growth", functionBody(march, "secondaryRayLength"));
const historyWeight = new Function("currentFrame", "distance", "pixelMotion", "depthRejection", "opacityRejection",
    "cameraMoving", "temporalAlpha", "currentFrameAlpha", "motionAlpha", "historyFrames", "mix", "smoothstep", "max",
    scalar(functionBody(resolve, "cloudHistoryWeight")));

test("zero cloud detail is an identity and erosion never invents additional density", () => {
    for (const value of [0, 0.001, 0.1, 0.25, 0.5, 0.99, 1]) {
        for (const modifier of [0, 0.02, 0.5, 1]) {
            assert.equal(erode(value, modifier, 0, clamp), value);
            for (const amount of [0.12, 0.35, 1]) {
                const actual = erode(value, modifier, amount, clamp);
                assert(actual >= 0 && actual <= value + 1e-12);
            }
        }
    }
});

test("solar optical-depth partitions cover one fixed interval, including the shadow-map tail start", () => {
    const body = scalar(functionBody(march, "marchOpticalDepth"))
        .replace("return opticalDepth;", "return { opticalDepth, rayDistance };");
    const integrate = new Function("rayOrigin", "rayDirection", "maxIterationCount", "mipLevel", "jitter",
        "minSecondaryStepSize", "secondaryStepScale", "max", "secondaryRayLength", "getGlobeUv", "length",
        "bottomRadius", "sampleWeather", "sampleMedia", "let rayDistance = 0;" + body);
    for (const count of [1, 2, 4, 8]) {
        const positions = [];
        const result = integrate(0, 1, count, 0, 0.5, 100, 2, Math.max, rayLength,
            position => position, Math.abs, 0, position => ({ position }),
            weather => { positions.push(weather.position); return { extinction: 0.02 }; });
        assert.equal(result.rayDistance, 150);
        assert(Math.abs(result.opticalDepth - 3) < 1e-12);
        assert.deepEqual(positions, Array.from({ length: count }, (_, i) => 150 * (i + 0.5) / count));
        // Joining an independent tail at 150m must integrate [0,400] once.
        const tail = 0.02 * (400 - result.rayDistance);
        assert(Math.abs(Math.exp(-result.opticalDepth - tail) - Math.exp(-8)) < 1e-12);
    }
});

test("Beer-weighted cloud depth is stable across cell partitions and optically thin edges", () => {
    for (const extinction of [1e-8, 1e-5, 0.001, 0.1, 5]) {
        const length = 100;
        const expected = extinction * length < 0.001
            ? length * (0.5 - extinction * length / 12)
            : 1 / extinction - length / Math.expm1(extinction * length);
        for (const count of [1, 2, 4, 32]) {
            let weight = 0, distanceSum = 0, transmission = 1;
            const step = length / count;
            for (let i = 0; i < count; i++) {
                const cellT = Math.exp(-extinction * step);
                const cellWeight = transmission * (1 - cellT);
                distanceSum += cellWeight * (i * step + centroid(extinction, step, Math.exp, Math.min));
                weight += cellWeight;
                transmission *= cellT;
            }
            assert(Number.isFinite(distanceSum / weight));
            assert(Math.abs(distanceSum / weight - expected) < 1e-4, `${extinction} / ${count}`);
        }
    }
});

test("distance weighting cannot undo motion floors; depth and opacity reject history independently", () => {
    const evaluate = ({ distance = 50000, pixels = 0, depth = 0, opacity = 0, camera = false } = {}) =>
        historyWeight(false, distance, pixels, depth, opacity, camera, 0.12, 0.35, 0.6, 64, mix, smoothstep, Math.max);
    for (const distance of [100, 5000, 25000, 100000]) {
        assert(evaluate({ distance, camera: true }) >= 0.6);
        assert(evaluate({ distance, pixels: 8 }) >= 0.6);
        assert.equal(evaluate({ distance, depth: 1 }), 1);
        assert.equal(evaluate({ distance, opacity: 1 }), 1);
    }
    assert.equal(evaluate({ depth: 0.8 }), 0.8);
    assert.equal(evaluate({ opacity: 0.9 }), 0.9);
    assert(evaluate() < 0.2, "valid still history continues to denoise");
});
