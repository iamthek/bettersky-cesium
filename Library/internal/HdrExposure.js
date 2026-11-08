/** Keep the unattenuated solar disk below RGBA16F headroom, including bloom. */
export function getHdrPreExposure(solar, conversion, angularRadius, intensity = 1) {
    const solidAngle = Math.PI * angularRadius * angularRadius;
    const peak = Math.max(solar.x * conversion.x, solar.y * conversion.y,
        solar.z * conversion.z) * Math.max(0, intensity) * 8 / solidAngle;
    return Number.isFinite(peak) && peak > 4096 ? 4096 / peak : 1;
}
