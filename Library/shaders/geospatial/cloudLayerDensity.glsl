
uniform vec4 cloudLayerTypes;
uniform vec2 cloudLodRange;
float cloudDistanceLod(const float distance) {
    if (cloudLodRange.y <= cloudLodRange.x) return 0.0;
    return smoothstep(cloudLodRange.x, cloudLodRange.y, distance);
}
vec4 cloudHeightBias(const vec4 bias) {
    vec4 result = bias;
    for (int i = 0; i < 3; ++i) {
        int type = int(cloudLayerTypes[i]);
        float scale = type == 1 ? 1.35 : (type == 2 ? 2.25 : (type == 3 ? 1.6 : 1.0));
        if (type > 0) {
            float value = clamp(bias[i] * scale, 0.01, 1.0);
            if (i == 0) result.x = value;
            else if (i == 1) result.y = value;
            else result.z = value;
        }
    }
    return result;
}
vec4 sampleCloudLayerShape(const vec3 position, const vec4 weatherDensity, const float lod, out int samples) {
    samples = 0;
    if (all(equal(cloudLayerTypes.xyz, vec3(0.0)))) {
        samples = 1;
        return vec4(textureLod(shapeTexture, position, lod).r);
    }
    vec4 result = vec4(1.0);
    for (int i = 0; i < 3; ++i) {
        if (weatherDensity[i] <= 0.0 || densityScales[i] <= 0.0) continue;
        int type = int(cloudLayerTypes[i]);
        vec3 coord = position;
        float lodBias = 0.0;
        if (type == 1) {
            coord *= vec3(0.8, 0.8, 1.05);
            lodBias = log2(1.05);
        } else if (type == 2) {
            // ECEF Z is not local altitude; unequal axis scales stretch the cloud horizontally.
            // Slightly larger altocumulus cells reduce the fine, granular appearance.
            float scale = length(vec2(1.5, 0.3));
            coord = vec3(position.x * 1.5 - position.y * 0.3, position.y * 1.5 + position.x * 0.3, position.z * scale) + vec3(0.37, 0.11, 0.53);
            lodBias = log2(scale);
        } else if (type == 3) {
            coord = vec3(position.x * 0.08 + position.y * 0.12, position.y * 2.5 - position.x * 0.4, position.z * 0.35) + vec3(0.19, 0.61, 0.43);
            lodBias = log2(2.55);
        }
        float filteredLod = max(0.0, lod + lodBias);
        float noise = textureLod(shapeTexture, coord, filteredLod).r;
        if (type == 3) {
            float ridge = 1.0 - abs(noise * 2.0 - 1.0);
            float width = clamp(0.06 + lod * 0.02, 0.06, 0.2);
            float fibre = smoothstep(0.68 - width, 0.68 + width, ridge);
            // Removing unresolved fibres must not remove the mip-averaged cloud mass.
            noise = mix(noise, fibre, 0.75 * (1.0 - smoothstep(1.0, 5.0, filteredLod)));
        }
        if (i == 0) result.x = noise;
        else if (i == 1) result.y = noise;
        else result.z = noise;
        ++samples;
    }
    return result;
}

// Inverse of getCubeSphereUv on the current cube face. All density consumers
// use this same field so weather motion, inner detail and shadows stay aligned.
vec3 cloudPositionFromUv(vec2 uv, vec3 reference) {
    vec2 p = uv * 2.0 - 1.0;
    vec3 n = normalize(reference);
    vec3 f = abs(n);
    vec3 cube;
    if (all(greaterThan(f.yy, f.xz))) cube = n.y > 0.0 ? vec3(-p.x, 1.0, p.y) : vec3(p.x, -1.0, p.y);
    else if (all(greaterThan(f.xx, f.yz))) cube = n.x > 0.0 ? vec3(1.0, p.x, p.y) : vec3(-1.0, -p.x, p.y);
    else cube = n.z > 0.0 ? vec3(p, 1.0) : vec3(p.x, -p.y, -1.0);
    vec3 q = cube * cube;
    vec3 sphere = cube * sqrt(max(vec3(0.0), 1.0 - (q.yzx + q.zxy) * 0.5 + q.yzx * q.zxy / 3.0));
    return normalize(sphere) * length(reference);
}
vec3 cloudWeatherPosition(vec3 position, vec2 offset) {
    vec2 uv = getGlobeUv(position) + offset / max(localWeatherRepeat, vec2(1e-6));
    return cloudPositionFromUv(uv, position);
}
vec4 cloudErodeDensity(vec4 density, vec4 modifier, vec4 amount) {
    vec4 threshold = clamp(modifier * amount * 0.35, 0.0, 0.95);
    return clamp((density - threshold) / (1.0 - threshold), 0.0, 1.0);
}
struct WeatherSample {
    vec4 heightFraction; // Normalized height of each layer

    vec4 density;
};
vec4 shapeAlteringFunction(const vec4 heightFraction, const vec4 bias) {
    vec4 biased = pow(heightFraction, bias);
    vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
    vec4 result = 1.0 - x * x;
    for (int i = 0; i < 3; ++i) {
        float h = heightFraction[i];
        // A short, smooth base and a longer rounded top give cumulus a flat
        // underside without creating a hard density boundary at the shell.
        if (int(cloudLayerTypes[i]) == 1) {
            result[i] = smoothstep(0.0, 0.10, h) * (1.0 - smoothstep(0.55, 1.0, h));
        }
    }
    return result;
}
WeatherSample sampleWeatherAtOffset(const vec2 uv, const float height, const float mipLevel, const vec2 weatherOffset) {
    WeatherSample weather;
    weather.heightFraction = remapClamped(vec4(height), minLayerHeights, maxLayerHeights);
    vec4 localWeather = pow(
    textureLod(
    localWeatherTexture, uv * localWeatherRepeat + weatherOffset, mipLevel
    ).LOCAL_WEATHER_CHANNELS, weatherExponents
    );
    #ifdef SHADOW
        localWeather *= shadowLayerMask;
    #endif // SHADOW

    vec4 heightScale = shapeAlteringFunction(weather.heightFraction, cloudHeightBias(shapeAlteringBiases));

    // Modulation to control weather by coverage parameter.

    // Reference: https://github.com/Prograda/Skybolt/blob/master/Assets/Core/Shaders/Clouds.h#L63
    vec4 factor = 1.0 - coverage * heightScale;
    weather.density = remapClamped(
    mix(localWeather, vec4(1.0), coverageFilterWidths), factor, factor + coverageFilterWidths
    );
    return weather;
}
WeatherSample sampleWeather(const vec2 uv, const float height, const float mipLevel) {
    return sampleWeatherAtOffset(uv, height, mipLevel, localWeatherOffset);
}
vec4 getLayerDensity(const vec4 heightFraction) {
    // prettier-ignore
    return densityProfile.expTerms * exp(densityProfile.exponents * heightFraction) +
    densityProfile.linearTerms * heightFraction +
    densityProfile.constantTerms;
}
struct MediaSample {
    float density;
    vec4 weight;
    float scattering;
    float extinction;
};
#ifdef BS_CLOUD_SHADOW
float shadowTexelsPerPixel;
#else
in vec3 vCameraPosition;
in vec3 vEllipsoidCenter;
uniform float shapeTexelsPerMeterPerPixel;
#endif
MediaSample sampleMediaAtOffsets(
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter,
inout ivec3 sampleCount, const vec2 weatherOffset, const vec3 noiseOffset, const vec3 detailOffset
) {
    vec4 density = weather.density;

    // Weather and the noise inside it move through the same coordinate field.
    // Radial motion based on length(offset) made wind deform clouds vertically.
    vec3 advectedPosition = cloudWeatherPosition(position, weatherOffset);
    vec3 turbulence = vec3(0.0);
    #ifdef TURBULENCE
        vec2 turbulenceUv = (uv * localWeatherRepeat + weatherOffset) * turbulenceRepeat;
        turbulence = turbulenceDisplacement *
        (texture(turbulenceTexture, turbulenceUv).rgb * 2.0 - 1.0) *
        dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));
    #endif // TURBULENCE

    vec3 shapePosition = (advectedPosition + turbulence) * shapeRepeat + noiseOffset;
    #ifdef BS_CLOUD_SHADOW
        float shapeFootprint = shadowTexelsPerPixel;
    #else
        float cameraDistance = length(position - (vCameraPosition - vEllipsoidCenter));
        float shapeFootprint = cameraDistance * shapeTexelsPerMeterPerPixel;
    #endif
    float shapeLod = log2(max(1.0, shapeFootprint));
    int shapeSamples;
    vec4 shape = sampleCloudLayerShape(shapePosition, density, shapeLod, shapeSamples);
    density = remapClamped(density, (vec4(1.0) - shape) * shapeAmounts, vec4(1.0));
    #ifdef DEBUG_SHOW_SAMPLE_COUNT
        sampleCount.y += shapeSamples;
    #endif // DEBUG_SHOW_SAMPLE_COUNT

    #ifdef SHAPE_DETAIL
        // Fade detail continuously; stochastic LOD toggles also changed density.
        // Fade erosion that is smaller than a raymarch pixel, not just weather-map detail.
        float detailFootprint = shapeFootprint *
            (shapeDetailRepeat.x / max(shapeRepeat.x, 1e-7)) *
            (float(textureSize(shapeDetailTexture, 0).x) / float(textureSize(shapeTexture, 0).x));
        float detailWeight = (1.0 - smoothstep(0.0, 1.5, mipLevel)) *
            (1.0 - smoothstep(0.5, 2.0, detailFootprint));
        {
            vec3 detailPosition = (advectedPosition + turbulence) * shapeDetailRepeat + detailOffset;
            float detailLod = cloudLodRange.y > cloudLodRange.x ? log2(max(1.0, detailFootprint)) : 0.0;
            float detail = detailWeight > 0.0 ? textureLod(shapeDetailTexture, detailPosition, detailLod).r : 0.5;
            // Fluffy at the top and whippy at the bottom.

            vec4 modifier = mix(
            vec4(pow(detail, 6.0)), vec4(1.0 - detail), remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4))
            );
            vec4 meanModifier = mix(vec4(0.015625), vec4(0.5),
                remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4)));
            // Keep mean erosion when detail becomes subpixel; LOD changes only
            // its variation, rather than doubling/removing the whole cloud mass.
            modifier = mix(meanModifier, modifier, detailWeight);
            density = cloudErodeDensity(density, modifier, shapeDetailAmounts);
            #ifdef DEBUG_SHOW_SAMPLE_COUNT
                ++sampleCount.z;
            #endif // DEBUG_SHOW_SAMPLE_COUNT
        }
    #endif // SHAPE_DETAIL
    // Nicely decrease the density at the bottom.
    density = saturate(density * densityScales * getLayerDensity(weather.heightFraction));
    MediaSample media;
    float densitySum = density.x + density.y + density.z + density.w;
    media.density = densitySum;
    media.weight = density / max(densitySum, 1e-7);
    media.scattering = densitySum * scatteringCoefficient;
    media.extinction = densitySum * absorptionCoefficient + media.scattering;
    return media;
}
MediaSample sampleMedia(
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter, inout ivec3 sampleCount
) {
    return sampleMediaAtOffsets(weather, position, uv, mipLevel, jitter, sampleCount,
        localWeatherOffset, shapeOffset, shapeDetailOffset);
}
MediaSample sampleMedia(
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter
) {
    ivec3 sampleCount = ivec3(0);
    return sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);
}
