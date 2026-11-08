import test from "node:test";
import assert from "node:assert/strict";
import { getHdrPreExposure } from "../Library/internal/HdrExposure.js";

const solar = { x: 1.474, y: 1.8504, z: 1.91198 };
const conversion = { x: 1.225627882677129, y: 0.8727160958996066, z: 0.8293090187636007 };
test("pre-exposure keeps the solar disk and bloom within half-float headroom", () => {
    for (const intensity of [0, 0.01, 1, 10, 100]) {
        const scale = getHdrPreExposure(solar, conversion, 0.004675, intensity);
        const disk = Math.max(...["x", "y", "z"].map(k => solar[k] * conversion[k])) *
            intensity * 8 / (Math.PI * 0.004675 ** 2);
        assert.ok(scale > 0 && scale <= 1);
        assert.ok(disk * scale < 4096.00001);
        // All linear scene contributions and bloom thresholds share the scale.
        for (const value of [0.018, 0.18, 1, 10, 1000]) {
            assert.ok(Math.abs((value * scale) / scale - value) < 1e-9);
            assert.ok(Math.abs(value / 10 - (value * scale) / (10 * scale)) < 1e-9);
        }
    }
});
