/**
 * @description HDR后场景效果合并
 */
import { 

    PixelDatatype,
    defined,
    PostProcessStageSampleMode,
    PostProcessStageComposite,
    Matrix4,
    ClearCommand,
    Color,
    Pass,
    Framebuffer,
    VertexArray,
    BufferUsage,
    ShaderProgram,
    RenderState,
    DrawCommand,
    ComputeCommand,
    Geometry,
    GeometryAttributes,
    ComponentDatatype,
    GeometryAttribute,
    Texture,
    Appearance,
    Sampler,
    WebGLConstants,
    Cartesian4,
    PixelFormat,
    Cartesian3,
    TextureMinificationFilter,
    TextureMagnificationFilter,
    Cartographic,
    Ellipsoid,
    SceneTransforms,
    createGuid,
    PassState,
    PrimitiveType,
    Transforms,
    Simon1994PlanetaryPositions,
    Matrix3,
    Resource,
    buildModuleUrl,
    Cartesian2,
    destroyObject,
    BoundingRectangle,
 } from "cesium";
import * as Cesium from "cesium";
const CesiumMath = Cesium.Math;
const defaultValue = (a, b) => a ?? b;
defaultValue.EMPTY_OBJECT = Object.freeze({});
import RenderPass from "../PostProcessStage.js";
import { installFramebufferCallbacks } from "../viewportQuadCommand.js";
import CascadedShadowMaps, { defaultsPass } from "./CascadedShadowMaps.js";
import { METER_TO_LENGTH_UNIT } from "./AtmosphereConstants.js";
export const cloudsMaterialVS = `
#version 300 es\n\
#define LOG_DEPTH\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME CloudsMaterial\n\
#define PI 3.141592653589793\n\
#define TRANSMITTANCE_TEXTURE_WIDTH 256\n\
#define TRANSMITTANCE_TEXTURE_HEIGHT 64\n\
#define SCATTERING_TEXTURE_R_SIZE 32\n\
#define SCATTERING_TEXTURE_MU_SIZE 128\n\
#define SCATTERING_TEXTURE_MU_S_SIZE 32\n\
#define SCATTERING_TEXTURE_NU_SIZE 8\n\
#define IRRADIANCE_TEXTURE_WIDTH 64\n\
#define IRRADIANCE_TEXTURE_HEIGHT 16\n\
#define METER_TO_LENGTH_UNIT 0.0010000\n\
#define SUN_SPECTRAL_RADIANCE_TO_LUMINANCE vec3(1.225627882677,0.872716095900,0.829309018764)\n\
#define SKY_SPECTRAL_RADIANCE_TO_LUMINANCE vec3(1.434369573713,0.889577441604,0.814781750602)\n\
#define PHOTOMETRIC 1\n\
#define LOCAL_WEATHER_CHANNELS rgba\n\
#define SHAPE_DETAIL 1\n\
#define TURBULENCE 1\n\
#define SHADOW_LENGTH 1\n\
#define HAZE 1\n\
#define MULTI_SCATTERING_OCTAVES 8\n\
#define ACCURATE_SUN_SKY_IRRADIANCE 1\n\
#define SHADOW_CASCADE_COUNT 3\n\
#define SHADOW_SAMPLE_COUNT 8\n\
#define SCATTER_ANISOTROPY_1 0.7000000\n\
#define SCATTER_ANISOTROPY_2 -0.2000000\n\
#define SCATTER_ANISOTROPY_MIX 0.5000000\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
#define DEPTH_PACKING 3200\n\
#define PERSPECTIVE_CAMERA 1\n\
#define POWDER 1\n\
#define GROUND_IRRADIANCE 1\n\
precision highp float;\n\
precision highp sampler3D;\n\
uniform vec3 u_solar_irradiance;\n\
uniform float u_sun_angular_radius;\n\
uniform float u_bottom_radius;\n\
uniform float u_top_radius;\n\
uniform vec3 u_rayleigh_scattering;\n\
uniform vec3 u_mie_scattering;\n\
uniform float u_mie_phase_function_g;\n\
uniform float u_mu_s_min;\n\
uniform sampler2D u_transmittance_texture;\n\
uniform sampler3D u_scattering_texture;\n\
uniform sampler3D u_single_mie_scattering_texture;\n\
uniform sampler2D u_irradiance_texture;\n\
uniform sampler2D depthTexture;\n\
\n\
// Based on the following work and adapted to Three.js.\n\
\n\
// This file includes runtime functions only. Please refer to Bruneton's source\n\
// code for the whole picture. It has detailed comments.\n\
// https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/functions.glsl\n\
\n\
/**\n\
* Copyright (c) 2017 Eric Bruneton\n\
* All rights reserved.\n\
*\n\
* Redistribution and use in source and binary forms, with or without\n\
* modification, are permitted provided that the following conditions\n\
* are met:\n\
* 1. Redistributions of source code must retain the above copyright\n\
*    notice, this list of conditions and the following disclaimer.\n\
* 2. Redistributions in binary form must reproduce the above copyright\n\
*    notice, this list of conditions and the following disclaimer in the\n\
*    documentation and/or other materials provided with the distribution.\n\
* 3. Neither the name of the copyright holders nor the names of its\n\
*    contributors may be used to endorse or promote products derived from\n\
*    this software without specific prior written permission.\n\
*\n\
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\n\
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n\
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n\
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE\n\
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n\
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n\
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n\
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n\
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n\
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF\n\
* THE POSSIBILITY OF SUCH DAMAGE.\n\
*\n\
* Precomputed Atmospheric Scattering\n\
* Copyright (c) 2008 INRIA\n\
* All rights reserved.\n\
*\n\
* Redistribution and use in source and binary forms, with or without\n\
* modification, are permitted provided that the following conditions\n\
* are met:\n\
* 1. Redistributions of source code must retain the above copyright\n\
*    notice, this list of conditions and the following disclaimer.\n\
* 2. Redistributions in binary form must reproduce the above copyright\n\
*    notice, this list of conditions and the following disclaimer in the\n\
*    documentation and/or other materials provided with the distribution.\n\
* 3. Neither the name of the copyright holders nor the names of its\n\
*    contributors may be used to endorse or promote products derived from\n\
*    this software without specific prior written permission.\n\
*\n\
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\n\
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n\
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n\
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE\n\
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n\
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n\
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n\
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n\
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n\
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF\n\
* THE POSSIBILITY OF SUCH DAMAGE.\n\
*/\n\
\n\
float ClampCosine(float mu) {\n\
    return clamp(mu, float(-1.0), float(1.0));\n\
}\n\
float ClampDistance(float d) {\n\
    return max(d, 0.0);\n\
}\n\
float ClampRadius(float r) {\n\
    return clamp(r, u_bottom_radius, u_top_radius);\n\
}\n\
float SafeSqrt(float a) {\n\
    return sqrt(max(a, 0.0));\n\
}\n\
float DistanceToTopAtmosphereBoundary(float r, float mu) {\n\
    float discriminant = r * r * (mu * mu - 1.0) + u_top_radius * u_top_radius;\n\
    return ClampDistance(-r * mu + SafeSqrt(discriminant));\n\
}\n\
bool RayIntersectsGround(float r, float mu) {\n\
    return mu < 0.0 && r * r * (mu * mu - 1.0) + u_bottom_radius * u_bottom_radius >= 0.0;\n\
}\n\
float GetTextureCoordFromUnitRange(float x, int texture_size) {\n\
    return 0.5 / float(texture_size) + x * (1.0 - 1.0 / float(texture_size));\n\
}\n\
vec2 GetTransmittanceTextureUvFromRMu(float r, float mu) {\n\
    float H = sqrt(u_top_radius * u_top_radius - u_bottom_radius * u_bottom_radius);\n\
    float rho = SafeSqrt(r * r - u_bottom_radius * u_bottom_radius);\n\
    float d = DistanceToTopAtmosphereBoundary(r, mu);\n\
    float d_min = u_top_radius - r;\n\
    float d_max = rho + H;\n\
    float x_mu = (d - d_min) / (d_max - d_min);\n\
    float x_r = rho / H;\n\
    return vec2(\n\
    GetTextureCoordFromUnitRange(x_mu, TRANSMITTANCE_TEXTURE_WIDTH), GetTextureCoordFromUnitRange(x_r, TRANSMITTANCE_TEXTURE_HEIGHT)\n\
    );\n\
}\n\
vec3 GetTransmittanceToTopAtmosphereBoundary(\n\
const sampler2D u_transmittance_texture, float r, float mu\n\
) {\n\
    vec2 uv = GetTransmittanceTextureUvFromRMu(r, mu);\n\
    return vec3(texture(u_transmittance_texture, uv));\n\
}\n\
vec3 GetTransmittance(\n\
const sampler2D u_transmittance_texture, float r, float mu, float d, bool ray_r_mu_intersects_ground\n\
) {\n\
    float r_d = ClampRadius(sqrt(d * d + 2.0 * r * mu * d + r * r));\n\
    float mu_d = ClampCosine((r * mu + d) / r_d);\n\
    if (ray_r_mu_intersects_ground) {\n\
        return min(\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r_d, -mu_d) /\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, -mu), vec3(1.0)\n\
        );\n\
    }\n\
    else {\n\
        return min(\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, mu) /\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r_d, mu_d), vec3(1.0)\n\
        );\n\
    }\n\
\n\
}\n\
vec3 GetTransmittanceToSun(const sampler2D u_transmittance_texture, float r, float mu_s) {\n\
    float sin_theta_h = u_bottom_radius / r;\n\
    float cos_theta_h = -sqrt(max(1.0 - sin_theta_h * sin_theta_h, 0.0));\n\
    return GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, mu_s) *\n\
    smoothstep(\n\
    -sin_theta_h * u_sun_angular_radius, sin_theta_h * u_sun_angular_radius, mu_s - cos_theta_h\n\
    );\n\
}\n\
float RayleighPhaseFunction(float nu) {\n\
    float k = 3.0 / (16.0 * PI);\n\
    return k * (1.0 + nu * nu);\n\
}\n\
float MiePhaseFunction(float g, float nu) {\n\
    float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);\n\
    return k * (1.0 + nu * nu) / pow(1.0 + g * g - 2.0 * g * nu, 1.5);\n\
}\n\
vec4 GetScatteringTextureUvwzFromRMuMuSNu(\n\
float r, float mu, float mu_s, float nu, bool ray_r_mu_intersects_ground\n\
) {\n\
    float H = sqrt(u_top_radius * u_top_radius - u_bottom_radius * u_bottom_radius);\n\
    float rho = SafeSqrt(r * r - u_bottom_radius * u_bottom_radius);\n\
    float u_r = GetTextureCoordFromUnitRange(rho / H, SCATTERING_TEXTURE_R_SIZE);\n\
    float r_mu = r * mu;\n\
    float discriminant = r_mu * r_mu - r * r + u_bottom_radius * u_bottom_radius;\n\
    float u_mu;\n\
    if (ray_r_mu_intersects_ground) {\n\
        float d = -r_mu - SafeSqrt(discriminant);\n\
        float d_min = r - u_bottom_radius;\n\
        float d_max = rho;\n\
        u_mu = 0.5 -\n\
        0.5 *\n\
        GetTextureCoordFromUnitRange(\n\
        d_max == d_min\n\
        ? 0.0\n\
        : (d - d_min) / (d_max - d_min), SCATTERING_TEXTURE_MU_SIZE / 2\n\
        );\n\
    }\n\
    else {\n\
        float d = -r_mu + SafeSqrt(discriminant + H * H);\n\
        float d_min = u_top_radius - r;\n\
        float d_max = rho + H;\n\
        u_mu = 0.5 +\n\
        0.5 *\n\
        GetTextureCoordFromUnitRange((d - d_min) / (d_max - d_min), SCATTERING_TEXTURE_MU_SIZE / 2);\n\
    }\n\
    float d = DistanceToTopAtmosphereBoundary(u_bottom_radius, mu_s);\n\
    float d_min = u_top_radius - u_bottom_radius;\n\
    float d_max = H;\n\
    float a = (d - d_min) / (d_max - d_min);\n\
    float D = DistanceToTopAtmosphereBoundary(u_bottom_radius, u_mu_s_min);\n\
    float A = (D - d_min) / (d_max - d_min);\n\
    float u_mu_s = GetTextureCoordFromUnitRange(\n\
    max(1.0 - a / A, 0.0) / (1.0 + a), SCATTERING_TEXTURE_MU_S_SIZE\n\
    );\n\
    float u_nu = (nu + 1.0) / 2.0;\n\
    return vec4(u_nu, u_mu_s, u_mu, u_r);\n\
}\n\
vec2 GetIrradianceTextureUvFromRMuS(float r, float mu_s) {\n\
    float x_r = (r - u_bottom_radius) / (u_top_radius - u_bottom_radius);\n\
    float x_mu_s = mu_s * 0.5 + 0.5;\n\
    return vec2(\n\
    GetTextureCoordFromUnitRange(x_mu_s, IRRADIANCE_TEXTURE_WIDTH), GetTextureCoordFromUnitRange(x_r, IRRADIANCE_TEXTURE_HEIGHT)\n\
    );\n\
}\n\
vec3 GetIrradiance(const sampler2D u_irradiance_texture, float r, float mu_s) {\n\
    vec2 uv = GetIrradianceTextureUvFromRMuS(r, mu_s);\n\
    return vec3(texture(u_irradiance_texture, uv));\n\
}\n\
vec3 GetExtrapolatedSingleMieScattering(const vec4 scattering) {\n\
    if (scattering.r <= 0.0) {\n\
        return vec3(0.0);\n\
    }\n\
    return scattering.rgb *\n\
    scattering.a /\n\
    scattering.r *\n\
    (u_rayleigh_scattering.r / u_mie_scattering.r) *\n\
    (u_mie_scattering / u_rayleigh_scattering);\n\
}\n\
vec3 GetCombinedScattering(\n\
const sampler3D u_scattering_texture, const sampler3D u_single_mie_scattering_texture, float r, float mu, float mu_s, float nu, bool ray_r_mu_intersects_ground, out vec3 single_mie_scattering\n\
) {\n\
    vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(r, mu, mu_s, nu, ray_r_mu_intersects_ground);\n\
    float tex_coord_x = uvwz.x * float(SCATTERING_TEXTURE_NU_SIZE - 1);\n\
    float tex_x = floor(tex_coord_x);\n\
    float lerp = tex_coord_x - tex_x;\n\
    vec3 uvw0 = vec3((tex_x + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE), uvwz.z, uvwz.w);\n\
    vec3 uvw1 = vec3((tex_x + 1.0 + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE), uvwz.z, uvwz.w);\n\
    vec4 combined_scattering = texture(u_scattering_texture, uvw0) * (1.0 - lerp) + texture(u_scattering_texture, uvw1) * lerp;\n\
    vec3 scattering = vec3(combined_scattering);\n\
    single_mie_scattering = GetExtrapolatedSingleMieScattering(combined_scattering);\n\
    return scattering;\n\
}\n\
vec3 GetSkyRadiance(\n\
const sampler2D u_transmittance_texture, const sampler3D u_scattering_texture, const sampler3D u_single_mie_scattering_texture, vec3 camera, const vec3 view_ray, float shadow_length, const vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    float r = length(camera);\n\
    float rmu = dot(camera, view_ray);\n\
    float distance_to_top_atmosphere_boundary = -rmu - SafeSqrt(rmu * rmu - r * r + u_top_radius * u_top_radius);\n\
    if (distance_to_top_atmosphere_boundary > 0.0) {\n\
        camera = camera + view_ray * distance_to_top_atmosphere_boundary;\n\
        r = u_top_radius;\n\
        rmu += distance_to_top_atmosphere_boundary;\n\
    }\n\
    else if (r > u_top_radius) {\n\
        transmittance = vec3(1.0);\n\
        return vec3(0.0);\n\
    }\n\
    float mu = rmu / r;\n\
    float mu_s = dot(camera, sun_direction) / r;\n\
    float nu = dot(view_ray, sun_direction);\n\
    bool ray_r_mu_intersects_ground = RayIntersectsGround(r, mu);\n\
    transmittance = ray_r_mu_intersects_ground\n\
    ? vec3(0.0)\n\
    : GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, mu);\n\
    vec3 single_mie_scattering;\n\
    vec3 scattering;\n\
    if (shadow_length == 0.0) {\n\
        scattering = GetCombinedScattering(\n\
        u_scattering_texture, u_single_mie_scattering_texture, r, mu, mu_s, nu, ray_r_mu_intersects_ground, single_mie_scattering\n\
        );\n\
    }\n\
    else {\n\
        float d = shadow_length;\n\
        float r_p = ClampRadius(sqrt(d * d + 2.0 * r * mu * d + r * r));\n\
        float mu_p = (r * mu + d) / r_p;\n\
        float mu_s_p = (r * mu_s + d * nu) / r_p;\n\
        scattering = GetCombinedScattering(\n\
        u_scattering_texture, u_single_mie_scattering_texture, r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground, single_mie_scattering\n\
        );\n\
        vec3 shadow_transmittance = GetTransmittance(\n\
        u_transmittance_texture, r, mu, shadow_length, ray_r_mu_intersects_ground\n\
        );\n\
        scattering = scattering * shadow_transmittance;\n\
        single_mie_scattering = single_mie_scattering * shadow_transmittance;\n\
    }\n\
    return scattering * RayleighPhaseFunction(nu) +\n\
    single_mie_scattering * MiePhaseFunction(u_mie_phase_function_g, nu);\n\
}\n\
vec3 GetSkyRadianceToPoint(\n\
const sampler2D u_transmittance_texture, const sampler3D u_scattering_texture, const sampler3D u_single_mie_scattering_texture, vec3 camera, const vec3 point, float shadow_length, const vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    vec3 view_ray = normalize(point - camera);\n\
    float r = length(camera);\n\
    float rmu = dot(camera, view_ray);\n\
    float distance_to_top_atmosphere_boundary = -rmu - sqrt(rmu * rmu - r * r + u_top_radius * u_top_radius);\n\
    if (distance_to_top_atmosphere_boundary > 0.0) {\n\
        camera = camera + view_ray * distance_to_top_atmosphere_boundary;\n\
        r = u_top_radius;\n\
        rmu += distance_to_top_atmosphere_boundary;\n\
    }\n\
    float mu = rmu / r;\n\
    float mu_s = dot(camera, sun_direction) / r;\n\
    float nu = dot(view_ray, sun_direction);\n\
    float d = length(point - camera);\n\
    bool ray_r_mu_intersects_ground = RayIntersectsGround(r, mu);\n\
    \n\
    // Hack to avoid rendering artifacts near the horizon, due to finite\n\
    \n\
    // atmosphere texture resolution and finite floating point precision.\n\
    // See: https://github.com/ebruneton/precomputed_atmospheric_scattering/pull/32\n\
    if (!ray_r_mu_intersects_ground) {\n\
        float mu_horiz = -SafeSqrt(1.0 - u_bottom_radius / r * (u_bottom_radius / r));\n\
        mu = max(mu, mu_horiz + 0.004);\n\
    }\n\
    transmittance = GetTransmittance(u_transmittance_texture, r, mu, d, ray_r_mu_intersects_ground);\n\
    vec3 single_mie_scattering;\n\
    vec3 scattering = GetCombinedScattering(\n\
    u_scattering_texture, u_single_mie_scattering_texture, r, mu, mu_s, nu, ray_r_mu_intersects_ground, single_mie_scattering\n\
    );\n\
    d = max(d - shadow_length, 0.0);\n\
    float r_p = ClampRadius(sqrt(d * d + 2.0 * r * mu * d + r * r));\n\
    float mu_p = (r * mu + d) / r_p;\n\
    float mu_s_p = (r * mu_s + d * nu) / r_p;\n\
    vec3 single_mie_scattering_p;\n\
    vec3 scattering_p = GetCombinedScattering(\n\
    u_scattering_texture, u_single_mie_scattering_texture, r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground, single_mie_scattering_p\n\
    );\n\
    vec3 shadow_transmittance = transmittance;\n\
    if (shadow_length > 0.0) {\n\
        shadow_transmittance = GetTransmittance(\n\
        u_transmittance_texture, r, mu, d, ray_r_mu_intersects_ground\n\
        );\n\
    }\n\
    scattering = scattering - shadow_transmittance * scattering_p;\n\
    single_mie_scattering = single_mie_scattering - shadow_transmittance * single_mie_scattering_p;\n\
    single_mie_scattering = GetExtrapolatedSingleMieScattering(\n\
    vec4(scattering, single_mie_scattering.r)\n\
    );\n\
    single_mie_scattering = single_mie_scattering * smoothstep(float(0.0), float(0.01), mu_s);\n\
    return scattering * RayleighPhaseFunction(nu) +\n\
    single_mie_scattering * MiePhaseFunction(u_mie_phase_function_g, nu);\n\
}\n\
vec3 GetSunAndSkyIrradiance(\n\
const sampler2D u_transmittance_texture, const sampler2D u_irradiance_texture, const vec3 point, const vec3 sun_direction, out vec3 sky_irradiance\n\
) {\n\
    float r = length(point);\n\
    float mu_s = dot(point, sun_direction) / r;\n\
    // 5.30
    // sky_irradiance = GetIrradiance(u_irradiance_texture, r, mu_s);\n\
    sky_irradiance = GetIrradiance(u_irradiance_texture, r, mu_s) * 2.0 * PI;\n\
    return u_solar_irradiance * GetTransmittanceToSun(u_transmittance_texture, r, mu_s);\n\
}\n\
vec3 GetSunAndSkyIrradiance(\n\
const sampler2D u_transmittance_texture, const sampler2D u_irradiance_texture, const vec3 point, const vec3 normal, const vec3 sun_direction, out vec3 sky_irradiance\n\
) {\n\
    float r = length(point);\n\
    float mu_s = dot(point, sun_direction) / r;\n\
    sky_irradiance = GetIrradiance(u_irradiance_texture, r, mu_s) * (1.0 + dot(normal, point) / r) * 0.5;\n\
    return u_solar_irradiance *\n\
    GetTransmittanceToSun(u_transmittance_texture, r, mu_s) *\n\
    max(dot(normal, sun_direction), 0.0);\n\
}\n\
vec3 GetSolarRadiance() {\n\
    vec3 radiance = u_solar_irradiance / (PI * u_sun_angular_radius * u_sun_angular_radius);\n\
    #ifdef PHOTOMETRIC\n\
        radiance *= SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return radiance;\n\
}\n\
vec3 GetSkyRadiance(\n\
vec3 camera, vec3 view_ray, float shadow_length, vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    vec3 radiance = GetSkyRadiance(\n\
    u_transmittance_texture, u_scattering_texture, u_single_mie_scattering_texture, camera, view_ray, shadow_length, sun_direction, transmittance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        radiance *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return radiance;\n\
}\n\
vec3 GetSkyRadianceToPoint(\n\
vec3 camera, vec3 point, float shadow_length, vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    vec3 inscatter = GetSkyRadianceToPoint(\n\
    u_transmittance_texture, u_scattering_texture, u_single_mie_scattering_texture, camera, point, shadow_length, sun_direction, transmittance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        inscatter *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return inscatter;\n\
}\n\
vec3 GetSunAndSkyIrradiance(vec3 point, vec3 sun_direction, out vec3 sky_irradiance) {\n\
    vec3 sun_irradiance = GetSunAndSkyIrradiance(\n\
    u_transmittance_texture, u_irradiance_texture, point, sun_direction, sky_irradiance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        sun_irradiance *= SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
        sky_irradiance *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return sun_irradiance;\n\
}\n\
vec3 GetSunAndSkyIrradiance(vec3 point, vec3 normal, vec3 sun_direction, out vec3 sky_irradiance) {\n\
    vec3 sun_irradiance = GetSunAndSkyIrradiance(\n\
    u_transmittance_texture, u_irradiance_texture, point, normal, sun_direction, sky_irradiance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        sun_irradiance *= SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
        sky_irradiance *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return sun_irradiance;\n\
}\n\
struct GroundIrradiance {\n\
    vec3 sun;\n\
    vec3 sky;\n\
};\n\
struct CloudsIrradiance {\n\
    vec3 minSun;\n\
    vec3 minSky;\n\
    vec3 maxSun;\n\
    vec3 maxSky;\n\
};\n\
struct DensityProfile {\n\
    vec4 expTerms;\n\
    vec4 exponents;\n\
    vec4 linearTerms;\n\
    vec4 constantTerms;\n\
};\n\
uniform mat4 inverseProjectionMatrix;\n\
uniform mat4 inverseViewMatrix;\n\
uniform vec2 targetUvScale;\n\
uniform vec3 cameraPosition;\n\
uniform vec3 ellipsoidCenter;\n\
uniform mat4 inverseEllipsoidMatrix;\n\
uniform vec3 altitudeCorrection;\n\
\n\
// Atmosphere\n\
\n\
uniform float bottomRadius;\n\
uniform vec3 sunDirection;\n\
\n\
// Cloud layers\n\
\n\
uniform float minHeight;\n\
uniform float maxHeight;\n\
layout(location = 0) in vec3 position;\n\
out vec2 vUv;\n\
out vec3 vCameraPosition;\n\
out vec3 vCameraDirection; // Direction to the center of screen\n\
\n\
out vec3 vRayDirection; // Direction to the texel\n\
\n\
out vec3 vEllipsoidCenter;\n\
out GroundIrradiance vGroundIrradiance;\n\
out CloudsIrradiance vCloudsIrradiance;\n\
void sampleSunSkyIrradiance(const vec3 positionECEF) {\n\
    vGroundIrradiance.sun = GetSunAndSkyIrradiance(\n\
    positionECEF * METER_TO_LENGTH_UNIT, sunDirection, vGroundIrradiance.sky\n\
    );\n\
    vec3 surfaceNormal = normalize(positionECEF);\n\
    vec2 radii = (bottomRadius + vec2(minHeight, maxHeight)) * METER_TO_LENGTH_UNIT;\n\
    vCloudsIrradiance.minSun = GetSunAndSkyIrradiance(\n\
    surfaceNormal * radii.x, sunDirection, vCloudsIrradiance.minSky\n\
    );\n\
    vCloudsIrradiance.maxSun = GetSunAndSkyIrradiance(\n\
    surfaceNormal * radii.y, sunDirection, vCloudsIrradiance.maxSky\n\
    );\n\
}\n\
void main() {\n\
    vUv = position.xy * 0.5 + 0.5;\n\
    vec2 rayClip = vUv * targetUvScale * 2.0 - 1.0;\n\
    vec4 viewPosition = inverseProjectionMatrix * vec4(rayClip, position.z, 1.0);\n\
    vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);\n\
    mat3 rotation = mat3(inverseEllipsoidMatrix);\n\
    vCameraPosition = rotation * cameraPosition;\n\
    vCameraDirection = rotation * normalize((inverseViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);\n\
    vRayDirection = rotation * worldDirection.xyz;\n\
    vEllipsoidCenter = ellipsoidCenter + altitudeCorrection;\n\
    sampleSunSkyIrradiance(vCameraPosition - vEllipsoidCenter);\n\
    gl_Position = vec4(position.xy, 1.0, 1.0);\n\
}\n\
`;
export const cloudLayerDensityGLSL = `
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
            float scale = length(vec2(1.8, 0.35));
            coord = vec3(position.x * 1.8 - position.y * 0.35, position.y * 1.8 + position.x * 0.35, position.z * scale) + vec3(0.37, 0.11, 0.53);
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
`;
export const cloudsMaterialFS = `
#version 300 es\n\
#define LOG_DEPTH\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME CloudsMaterial\n\
#define PI 3.141592653589793\n\
#define TRANSMITTANCE_TEXTURE_WIDTH 256\n\
#define TRANSMITTANCE_TEXTURE_HEIGHT 64\n\
#define SCATTERING_TEXTURE_R_SIZE 32\n\
#define SCATTERING_TEXTURE_MU_SIZE 128\n\
#define SCATTERING_TEXTURE_MU_S_SIZE 32\n\
#define SCATTERING_TEXTURE_NU_SIZE 8\n\
#define IRRADIANCE_TEXTURE_WIDTH 64\n\
#define IRRADIANCE_TEXTURE_HEIGHT 16\n\
#define METER_TO_LENGTH_UNIT 0.0010000\n\
#define SUN_SPECTRAL_RADIANCE_TO_LUMINANCE vec3(1.225627882677,0.872716095900,0.829309018764)\n\
#define SKY_SPECTRAL_RADIANCE_TO_LUMINANCE vec3(1.434369573713,0.889577441604,0.814781750602)\n\
#define PHOTOMETRIC 1\n\
#define LOCAL_WEATHER_CHANNELS rgba\n\
#define SHAPE_DETAIL 1\n\
#define TURBULENCE 1\n\
#define SHADOW_LENGTH 1\n\
#define HAZE 1\n\
#define MULTI_SCATTERING_OCTAVES 8\n\
#define ACCURATE_SUN_SKY_IRRADIANCE 1\n\
#define SHADOW_CASCADE_COUNT 3\n\
#define SHADOW_SAMPLE_COUNT 8\n\
#define SCATTER_ANISOTROPY_1 0.7000000\n\
#define SCATTER_ANISOTROPY_2 -0.2000000\n\
#define SCATTER_ANISOTROPY_MIX 0.5000000\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
#define DEPTH_PACKING 3200\n\
#define PERSPECTIVE_CAMERA 1\n\
#define POWDER 1\n\
#define GROUND_IRRADIANCE 1\n\
// #define DEBUG_SHOW_CASCADES 1\n\
precision highp float;\n\
precision highp sampler3D;\n\
precision highp sampler2DArray;\n\
#define PI 3.141592653589793\n\
#define PI2 6.283185307179586\n\
#define PI_HALF 1.5707963267948966\n\
#define RECIPROCAL_PI 0.3183098861837907\n\
#define RECIPROCAL_PI2 0.15915494309189535\n\
#define EPSILON 1e-6\n\
#ifndef saturate\n\
    #define saturate( a ) clamp( a, 0.0, 1.0 )\n\
#endif\n\
#define whiteComplement( a ) ( 1.0 - saturate( a ) )\n\
float pow2( const in float x ) {\n\
    return x*x;\n\
}\n\
vec3 pow2( const in vec3 x ) {\n\
    return x*x;\n\
}\n\
float pow3( const in float x ) {\n\
    return x*x*x;\n\
}\n\
float pow4( const in float x ) {\n\
    float x2 = x*x;\n\
    return x2*x2;\n\
}\n\
float max3( const in vec3 v ) {\n\
    return max( max( v.x, v.y ), v.z );\n\
}\n\
float average( const in vec3 v ) {\n\
    return dot( v, vec3( 0.3333333 ) );\n\
}\n\
highp float rand( const in vec2 uv ) {\n\
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;\n\
    highp float dt = dot( uv.xy, vec2( a, b ) ), sn = mod( dt, PI );\n\
    return fract( sin( sn ) * c );\n\
}\n\
#ifdef HIGH_PRECISION\n\
    float precisionSafeLength( vec3 v ) {\n\
        return length( v );\n\
    }\n\
#else\n\
    float precisionSafeLength( vec3 v ) {\n\
        float maxComponent = max3( abs( v ) );\n\
        return length( v / maxComponent ) * maxComponent;\n\
    }\n\
#endif\n\
struct IncidentLight {\n\
    vec3 color;\n\
    vec3 direction;\n\
    bool visible;\n\
};\n\
struct ReflectedLight {\n\
    vec3 directDiffuse;\n\
    vec3 directSpecular;\n\
    vec3 indirectDiffuse;\n\
    vec3 indirectSpecular;\n\
};\n\
#ifdef USE_ALPHAHASH\n\
    varying vec3 vPosition;\n\
#endif\n\
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {\n\
    return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );\n\
}\n\
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {\n\
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );\n\
}\n\
mat3 transposeMat3( const in mat3 m ) {\n\
    mat3 tmp;\n\
    tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );\n\
    tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );\n\
    tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );\n\
    return tmp;\n\
}\n\
bool isPerspectiveMatrix( mat4 m ) {\n\
    return m[ 2 ][ 3 ] == - 1.0;\n\
}\n\
vec2 equirectUv( in vec3 dir ) {\n\
    float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;\n\
    float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;\n\
    return vec2( u, v );\n\
}\n\
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {\n\
    return RECIPROCAL_PI * diffuseColor;\n\
}\n\
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {\n\
    float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n\
    return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n\
}\n\
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {\n\
    float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n\
    return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n\
}\n\
// validated\n\
vec3 packNormalToRGB( const in vec3 normal ) {\n\
    return normalize( normal ) * 0.5 + 0.5;\n\
}\n\
vec3 unpackRGBToNormal( const in vec3 rgb ) {\n\
    return 2.0 * rgb.xyz - 1.0;\n\
}\n\
const float PackUpscale = 256. / 255.;\n\
const float UnpackDownscale = 255. / 256.;\n\
const float ShiftRight8 = 1. / 256.;\n\
const float Inv255 = 1. / 255.;\n\
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );\n\
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );\n\
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );\n\
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );\n\
vec4 packDepthToRGBA( const in float v ) {\n\
    if( v <= 0.0 )\n\
    return vec4( 0., 0., 0., 0. );\n\
    if( v >= 1.0 )\n\
    return vec4( 1., 1., 1., 1. );\n\
    float vuf;\n\
    float af = modf( v * PackFactors.a, vuf );\n\
    float bf = modf( vuf * ShiftRight8, vuf );\n\
    float gf = modf( vuf * ShiftRight8, vuf );\n\
    return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );\n\
}\n\
vec3 packDepthToRGB( const in float v ) {\n\
    if( v <= 0.0 )\n\
    return vec3( 0., 0., 0. );\n\
    if( v >= 1.0 )\n\
    return vec3( 1., 1., 1. );\n\
    float vuf;\n\
    float bf = modf( v * PackFactors.b, vuf );\n\
    float gf = modf( vuf * ShiftRight8, vuf );\n\
    return vec3( vuf * Inv255, gf * PackUpscale, bf );\n\
}\n\
vec2 packDepthToRG( const in float v ) {\n\
    if( v <= 0.0 )\n\
    return vec2( 0., 0. );\n\
    if( v >= 1.0 )\n\
    return vec2( 1., 1. );\n\
    float vuf;\n\
    float gf = modf( v * 256., vuf );\n\
    return vec2( vuf * Inv255, gf );\n\
}\n\
float unpackRGBAToDepth( const in vec4 v ) {\n\
    return dot( v, UnpackFactors4 );\n\
}\n\
float unpackRGBToDepth( const in vec3 v ) {\n\
    return dot( v, UnpackFactors3 );\n\
}\n\
float unpackRGToDepth( const in vec2 v ) {\n\
    return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;\n\
}\n\
vec4 pack2HalfToRGBA( const in vec2 v ) {\n\
    vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );\n\
    return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );\n\
}\n\
vec2 unpackRGBATo2Half( const in vec4 v ) {\n\
    return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );\n\
}\n\
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {\n\
    return ( viewZ + near ) / ( near - far );\n\
}\n\
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {\n\
    return depth * ( near - far ) - near;\n\
}\n\
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {\n\
    return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );\n\
}\n\
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {\n\
    return ( near * far ) / ( ( far - near ) * depth - far );\n\
}\n\
// cSpell:words logdepthbuf\n\
\n\
float reverseLogDepth(const float depth, const float near, const float far) {\n\
    #ifdef USE_LOGDEPTHBUF\n\
        float d = pow(2.0, depth * log2(far + 1.0)) - 1.0;\n\
        float a = far / (far - near);\n\
        float b = far * near / (near - far);\n\
        return a + b / d;\n\
    #else // USE_LOGDEPTHBUF\n\
        return depth;\n\
    #endif // USE_LOGDEPTHBUF\n\
}\n\
float linearizeDepth(const float depth, const float near, const float far) {\n\
    float ndc = depth * 2.0 - 1.0;\n\
    return 2.0 * near * far / (far + near - ndc * (far - near));\n\
}\n\
#if !defined(saturate)\n\
    #define saturate(a) clamp(a, 0.0, 1.0)\n\
#endif // !defined(saturate)\n\
float remap(const float x, const float min1, const float max1, const float min2, const float max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
vec2 remap(const vec2 x, const vec2 min1, const vec2 max1, const vec2 min2, const vec2 max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
vec3 remap(const vec3 x, const vec3 min1, const vec3 max1, const vec3 min2, const vec3 max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
vec4 remap(const vec4 x, const vec4 min1, const vec4 max1, const vec4 min2, const vec4 max2) {\n\
    return min2 + (x - min1) / (max1 - min1) * (max2 - min2);\n\
}\n\
float remapClamped(\n\
const float x, const float min1, const float max1, const float min2, const float max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
vec2 remapClamped(\n\
const vec2 x, const vec2 min1, const vec2 max1, const vec2 min2, const vec2 max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
vec3 remapClamped(\n\
const vec3 x, const vec3 min1, const vec3 max1, const vec3 min2, const vec3 max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
vec4 remapClamped(\n\
const vec4 x, const vec4 min1, const vec4 max1, const vec4 min2, const vec4 max2\n\
) {\n\
    return clamp(min2 + (x - min1) / (max1 - min1) * (max2 - min2), min2, max2);\n\
}\n\
// Implicitly remap to 0 and 1\n\
float remap(const float x, const float min1, const float max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
vec2 remap(const vec2 x, const vec2 min1, const vec2 max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
vec3 remap(const vec3 x, const vec3 min1, const vec3 max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
vec4 remap(const vec4 x, const vec4 min1, const vec4 max1) {\n\
    return (x - min1) / (max1 - min1);\n\
}\n\
float remapClamped(const float x, const float min1, const float max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
vec2 remapClamped(const vec2 x, const vec2 min1, const vec2 max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
vec3 remapClamped(const vec3 x, const vec3 min1, const vec3 max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
vec4 remapClamped(const vec4 x, const vec4 min1, const vec4 max1) {\n\
    return saturate((x - min1) / (max1 - min1));\n\
}\n\
// A fifth-order polynomial approximation of Turbo color map.\n\
// See: https://observablehq.com/@mbostock/turbo\n\
// prettier-ignore\n\
vec3 turbo(const float x) {\n\
    float r = 0.1357 + x * (4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375))));\n\
    float g = 0.0914 + x * (2.1856 + x * (4.8052 - x * (14.0195 - x * (4.2109 + x * 2.7747))));\n\
    float b = 0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * (88.5066 - x * 26.8183))));\n\
    return vec3(r, g, b);\n\
}\n\
float checker(const vec2 uv, const vec2 repeats) {\n\
    vec2 c = floor(repeats * uv);\n\
    float result = mod(c.x + c.y, 2.0);\n\
    return sign(result);\n\
}\n\
float checker(const vec2 uv, const float repeats) {\n\
    return checker(uv, vec2(repeats));\n\
}\n\
float raySphereFirstIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const float radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    float c = dot(a, a) - radius * radius;\n\
    float discriminant = b * b - 4.0 * c;\n\
    return discriminant < 0.0\n\
    ? -1.0\n\
    : (-b - sqrt(discriminant)) * 0.5;\n\
}\n\
float raySphereFirstIntersection(const vec3 origin, const vec3 direction, const float radius) {\n\
    return raySphereFirstIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
vec4 raySphereFirstIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const vec4 radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    vec4 c = dot(a, a) - radius * radius;\n\
    vec4 discriminant = b * b - 4.0 * c;\n\
    vec4 mask = step(discriminant, vec4(0.0));\n\
    return mix((-b - sqrt(max(vec4(0.0), discriminant))) * 0.5, vec4(-1.0), mask);\n\
}\n\
vec4 raySphereFirstIntersection(const vec3 origin, const vec3 direction, const vec4 radius) {\n\
    return raySphereFirstIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
float raySphereSecondIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const float radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    float c = dot(a, a) - radius * radius;\n\
    float discriminant = b * b - 4.0 * c;\n\
    return discriminant < 0.0\n\
    ? -1.0\n\
    : (-b + sqrt(discriminant)) * 0.5;\n\
}\n\
float raySphereSecondIntersection(const vec3 origin, const vec3 direction, const float radius) {\n\
    return raySphereSecondIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
vec4 raySphereSecondIntersection(\n\
const vec3 origin, const vec3 direction, const vec3 center, const vec4 radius\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    vec4 c = dot(a, a) - radius * radius;\n\
    vec4 discriminant = b * b - 4.0 * c;\n\
    vec4 mask = step(discriminant, vec4(0.0));\n\
    return mix((-b + sqrt(max(vec4(0.0), discriminant))) * 0.5, vec4(-1.0), mask);\n\
}\n\
vec4 raySphereSecondIntersection(const vec3 origin, const vec3 direction, const vec4 radius) {\n\
    return raySphereSecondIntersection(origin, direction, vec3(0.0), radius);\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const vec3 center, const float radius, out float intersection1, out float intersection2\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    float c = dot(a, a) - radius * radius;\n\
    float discriminant = b * b - 4.0 * c;\n\
    if (discriminant < 0.0) {\n\
        intersection1 = -1.0;\n\
        intersection2 = -1.0;\n\
        return;\n\
    }\n\
    else {\n\
        float Q = sqrt(discriminant);\n\
        intersection1 = (-b - Q) * 0.5;\n\
        intersection2 = (-b + Q) * 0.5;\n\
    }\n\
\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const float radius, out float intersection1, out float intersection2\n\
) {\n\
    raySphereIntersections(origin, direction, vec3(0.0), radius, intersection1, intersection2);\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const vec3 center, const vec4 radius, out vec4 intersection1, out vec4 intersection2\n\
) {\n\
    vec3 a = origin - center;\n\
    float b = 2.0 * dot(direction, a);\n\
    vec4 c = dot(a, a) - radius * radius;\n\
    vec4 discriminant = b * b - 4.0 * c;\n\
    vec4 mask = step(discriminant, vec4(0.0));\n\
    vec4 Q = sqrt(max(vec4(0.0), discriminant));\n\
    intersection1 = mix((-b - Q) * 0.5, vec4(-1.0), mask);\n\
    intersection2 = mix((-b + Q) * 0.5, vec4(-1.0), mask);\n\
}\n\
void raySphereIntersections(\n\
const vec3 origin, const vec3 direction, const vec4 radius, out vec4 intersection1, out vec4 intersection2\n\
) {\n\
    raySphereIntersections(origin, direction, vec3(0.0), radius, intersection1, intersection2);\n\
}\n\
// Reference: https://github.com/mrdoob/three.js/blob/r171/examples/jsm/csm/CSMShader.js\n\
\n\
#ifndef SHADOW_CASCADE_COUNT\n\
    #error "SHADOW_CASCADE_COUNT macro must be defined."\n\
#endif // SHADOW_CASCADE_COUNT\n\
\n\
int getCascadeIndex(\n\
const mat4 viewMatrix, const vec3 worldPosition, const vec2 intervals[SHADOW_CASCADE_COUNT], const float near, const float far\n\
) {\n\
    vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);\n\
    float depth = viewZToOrthographicDepth(viewPosition.z, near, far);\n\
    vec2 interval;\n\
    #if 0 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[0];\n\
        if (depth >= interval.x && depth < interval.y) {\n\
            return 0;\n\
        }\n\
    #endif // 0 < SHADOW_CASCADE_COUNT\n\
    \n\
    #if 1 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[1];\n\
        if (depth >= interval.x && depth < interval.y) {\n\
            return 1;\n\
        }\n\
    #endif // 1 < SHADOW_CASCADE_COUNT\n\
    \n\
    #if 2 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[2];\n\
        if (depth >= interval.x && depth < interval.y) {\n\
            return 2;\n\
        }\n\
    #endif // 2 < SHADOW_CASCADE_COUNT\n\
    \n\
    #if 3 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[3];\n\
        if (depth >= interval.x && depth < interval.y) {\n\
            return 3;\n\
        }\n\
    #endif // 3 < SHADOW_CASCADE_COUNT\n\
    return SHADOW_CASCADE_COUNT - 1;\n\
}\n\
int getFadedCascadeIndex(\n\
const mat4 viewMatrix, const vec3 worldPosition, const vec2 intervals[SHADOW_CASCADE_COUNT], const float near, const float far, const float jitter\n\
) {\n\
    vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);\n\
    float depth = viewZToOrthographicDepth(viewPosition.z, near, far);\n\
    vec2 interval;\n\
    float intervalCenter;\n\
    float closestEdge;\n\
    float margin;\n\
    int nextIndex = -1;\n\
    int prevIndex = -1;\n\
    float alpha;\n\
    #if 0 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[0];\n\
        intervalCenter = (interval.x + interval.y) * 0.5;\n\
        closestEdge = depth < intervalCenter ? interval.x : interval.y;\n\
        margin = closestEdge * closestEdge * 0.5;\n\
        interval += margin * vec2(-0.5, 0.5);\n\
        #if 0 < SHADOW_CASCADE_COUNT - 1\n\
            if (depth >= interval.x && depth < interval.y) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 0;\n\
                alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);\n\
            }\n\
        #else // 0 < SHADOW_CASCADE_COUNT - 1\n\
            // Don't fade out the last cascade.\n\
            if (depth >= interval.x) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 0;\n\
                alpha = saturate((depth - interval.x) / margin);\n\
            }\n\
        #endif // 0 < SHADOW_CASCADE_COUNT - 1\n\
    #endif // 0 < SHADOW_CASCADE_COUNT\n\
    \n\
    #if 1 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[1];\n\
        intervalCenter = (interval.x + interval.y) * 0.5;\n\
        closestEdge = depth < intervalCenter ? interval.x : interval.y;\n\
        margin = closestEdge * closestEdge * 0.5;\n\
        interval += margin * vec2(-0.5, 0.5);\n\
        #if 1 < SHADOW_CASCADE_COUNT - 1\n\
            if (depth >= interval.x && depth < interval.y) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 1;\n\
                alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);\n\
            }\n\
        #else // 1 < SHADOW_CASCADE_COUNT - 1\n\
            // Don't fade out the last cascade.\n\
            if (depth >= interval.x) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 1;\n\
                alpha = saturate((depth - interval.x) / margin);\n\
            }\n\
        #endif // 1 < SHADOW_CASCADE_COUNT - 1\n\
    #endif // 1 < SHADOW_CASCADE_COUNT\n\
    \n\
    #if 2 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[2];\n\
        intervalCenter = (interval.x + interval.y) * 0.5;\n\
        closestEdge = depth < intervalCenter ? interval.x : interval.y;\n\
        margin = closestEdge * closestEdge * 0.5;\n\
        interval += margin * vec2(-0.5, 0.5);\n\
        #if 2 < SHADOW_CASCADE_COUNT - 1\n\
            if (depth >= interval.x && depth < interval.y) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 2;\n\
                alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);\n\
            }\n\
        #else // 2 < SHADOW_CASCADE_COUNT - 1\n\
            // Don't fade out the last cascade.\n\
            if (depth >= interval.x) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 2;\n\
                alpha = saturate((depth - interval.x) / margin);\n\
            }\n\
        #endif // 2 < SHADOW_CASCADE_COUNT - 1\n\
    #endif // 2 < SHADOW_CASCADE_COUNT\n\
    \n\
    #if 3 < SHADOW_CASCADE_COUNT\n\
        interval = intervals[3];\n\
        intervalCenter = (interval.x + interval.y) * 0.5;\n\
        closestEdge = depth < intervalCenter ? interval.x : interval.y;\n\
        margin = closestEdge * closestEdge * 0.5;\n\
        interval += margin * vec2(-0.5, 0.5);\n\
        #if 3 < SHADOW_CASCADE_COUNT - 1\n\
            if (depth >= interval.x && depth < interval.y) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 3;\n\
                alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);\n\
            }\n\
        #else // 3 < SHADOW_CASCADE_COUNT - 1\n\
            // Don't fade out the last cascade.\n\
            if (depth >= interval.x) {\n\
                prevIndex = nextIndex;\n\
                nextIndex = 3;\n\
                alpha = saturate((depth - interval.x) / margin);\n\
            }\n\
        #endif // 3 < SHADOW_CASCADE_COUNT - 1\n\
    #endif // 3 < SHADOW_CASCADE_COUNT\n\
    return jitter <= alpha\n\
    ? nextIndex\n\
    : prevIndex;\n\
}\n\
// Reference: https://advances.realtimerendering.com/s2014/index.html#_NEXT_GENERATION_POST\n\
\n\
float interleavedGradientNoise(const vec2 coord) {\n\
    const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);\n\
    return fract(magic.z * fract(dot(coord, magic.xy)));\n\
}\n\
// Reference: https://www.gamedev.net/tutorials/programming/graphics/contact-hardening-soft-shadows-made-fast-r4906/\n\
\n\
vec2 vogelDisk(const int index, const int sampleCount, const float phi) {\n\
    const float goldenAngle = 2.39996322972865332;\n\
    float r = sqrt(float(index) + 0.5) / sqrt(float(sampleCount));\n\
    float theta = float(index) * goldenAngle + phi;\n\
    return r * vec2(cos(theta), sin(theta));\n\
}\n\
uniform vec3 u_solar_irradiance;\n\
uniform float u_sun_angular_radius;\n\
uniform float u_bottom_radius;\n\
uniform float u_top_radius;\n\
uniform vec3 u_rayleigh_scattering;\n\
uniform vec3 u_mie_scattering;\n\
uniform float u_mie_phase_function_g;\n\
uniform float u_mu_s_min;\n\
uniform sampler2D u_transmittance_texture;\n\
uniform sampler3D u_scattering_texture;\n\
uniform sampler3D u_single_mie_scattering_texture;\n\
uniform sampler2D u_irradiance_texture;\n\
\n\
// Based on the following work and adapted to Three.js.\n\
\n\
// This file includes runtime functions only. Please refer to Bruneton's source\n\
// code for the whole picture. It has detailed comments.\n\
// https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/functions.glsl\n\
\n\
/**\n\
* Copyright (c) 2017 Eric Bruneton\n\
* All rights reserved.\n\
*\n\
* Redistribution and use in source and binary forms, with or without\n\
* modification, are permitted provided that the following conditions\n\
* are met:\n\
* 1. Redistributions of source code must retain the above copyright\n\
*    notice, this list of conditions and the following disclaimer.\n\
* 2. Redistributions in binary form must reproduce the above copyright\n\
*    notice, this list of conditions and the following disclaimer in the\n\
*    documentation and/or other materials provided with the distribution.\n\
* 3. Neither the name of the copyright holders nor the names of its\n\
*    contributors may be used to endorse or promote products derived from\n\
*    this software without specific prior written permission.\n\
*\n\
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\n\
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n\
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n\
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE\n\
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n\
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n\
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n\
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n\
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n\
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF\n\
* THE POSSIBILITY OF SUCH DAMAGE.\n\
*\n\
* Precomputed Atmospheric Scattering\n\
* Copyright (c) 2008 INRIA\n\
* All rights reserved.\n\
*\n\
* Redistribution and use in source and binary forms, with or without\n\
* modification, are permitted provided that the following conditions\n\
* are met:\n\
* 1. Redistributions of source code must retain the above copyright\n\
*    notice, this list of conditions and the following disclaimer.\n\
* 2. Redistributions in binary form must reproduce the above copyright\n\
*    notice, this list of conditions and the following disclaimer in the\n\
*    documentation and/or other materials provided with the distribution.\n\
* 3. Neither the name of the copyright holders nor the names of its\n\
*    contributors may be used to endorse or promote products derived from\n\
*    this software without specific prior written permission.\n\
*\n\
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\n\
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n\
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n\
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE\n\
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR\n\
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF\n\
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS\n\
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN\n\
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)\n\
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF\n\
* THE POSSIBILITY OF SUCH DAMAGE.\n\
*/\n\
\n\
float ClampCosine(float mu) {\n\
    return clamp(mu, float(-1.0), float(1.0));\n\
}\n\
float ClampDistance(float d) {\n\
    return max(d, 0.0);\n\
}\n\
float ClampRadius(float r) {\n\
    return clamp(r, u_bottom_radius, u_top_radius);\n\
}\n\
float SafeSqrt(float a) {\n\
    return sqrt(max(a, 0.0));\n\
}\n\
float DistanceToTopAtmosphereBoundary(float r, float mu) {\n\
    float discriminant = r * r * (mu * mu - 1.0) + u_top_radius * u_top_radius;\n\
    return ClampDistance(-r * mu + SafeSqrt(discriminant));\n\
}\n\
bool RayIntersectsGround(float r, float mu) {\n\
    return mu < 0.0 && r * r * (mu * mu - 1.0) + u_bottom_radius * u_bottom_radius >= 0.0;\n\
}\n\
float GetTextureCoordFromUnitRange(float x, int texture_size) {\n\
    return 0.5 / float(texture_size) + x * (1.0 - 1.0 / float(texture_size));\n\
}\n\
vec2 GetTransmittanceTextureUvFromRMu(float r, float mu) {\n\
    float H = sqrt(u_top_radius * u_top_radius - u_bottom_radius * u_bottom_radius);\n\
    float rho = SafeSqrt(r * r - u_bottom_radius * u_bottom_radius);\n\
    float d = DistanceToTopAtmosphereBoundary(r, mu);\n\
    float d_min = u_top_radius - r;\n\
    float d_max = rho + H;\n\
    float x_mu = (d - d_min) / (d_max - d_min);\n\
    float x_r = rho / H;\n\
    return vec2(\n\
    GetTextureCoordFromUnitRange(x_mu, TRANSMITTANCE_TEXTURE_WIDTH), GetTextureCoordFromUnitRange(x_r, TRANSMITTANCE_TEXTURE_HEIGHT)\n\
    );\n\
}\n\
vec3 GetTransmittanceToTopAtmosphereBoundary(\n\
const sampler2D u_transmittance_texture, float r, float mu\n\
) {\n\
    vec2 uv = GetTransmittanceTextureUvFromRMu(r, mu);\n\
    return vec3(texture(u_transmittance_texture, uv));\n\
}\n\
vec3 GetTransmittance(\n\
const sampler2D u_transmittance_texture, float r, float mu, float d, bool ray_r_mu_intersects_ground\n\
) {\n\
    float r_d = ClampRadius(sqrt(d * d + 2.0 * r * mu * d + r * r));\n\
    float mu_d = ClampCosine((r * mu + d) / r_d);\n\
    if (ray_r_mu_intersects_ground) {\n\
        return min(\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r_d, -mu_d) /\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, -mu), vec3(1.0)\n\
        );\n\
    }\n\
    else {\n\
        return min(\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, mu) /\n\
        GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r_d, mu_d), vec3(1.0)\n\
        );\n\
    }\n\
\n\
}\n\
vec3 GetTransmittanceToSun(const sampler2D u_transmittance_texture, float r, float mu_s) {\n\
    float sin_theta_h = u_bottom_radius / r;\n\
    float cos_theta_h = -sqrt(max(1.0 - sin_theta_h * sin_theta_h, 0.0));\n\
    return GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, mu_s) *\n\
    smoothstep(\n\
    -sin_theta_h * u_sun_angular_radius, sin_theta_h * u_sun_angular_radius, mu_s - cos_theta_h\n\
    );\n\
}\n\
float RayleighPhaseFunction(float nu) {\n\
    float k = 3.0 / (16.0 * PI);\n\
    return k * (1.0 + nu * nu);\n\
}\n\
float MiePhaseFunction(float g, float nu) {\n\
    float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);\n\
    return k * (1.0 + nu * nu) / pow(1.0 + g * g - 2.0 * g * nu, 1.5);\n\
}\n\
vec4 GetScatteringTextureUvwzFromRMuMuSNu(\n\
float r, float mu, float mu_s, float nu, bool ray_r_mu_intersects_ground\n\
) {\n\
    float H = sqrt(u_top_radius * u_top_radius - u_bottom_radius * u_bottom_radius);\n\
    float rho = SafeSqrt(r * r - u_bottom_radius * u_bottom_radius);\n\
    float u_r = GetTextureCoordFromUnitRange(rho / H, SCATTERING_TEXTURE_R_SIZE);\n\
    float r_mu = r * mu;\n\
    float discriminant = r_mu * r_mu - r * r + u_bottom_radius * u_bottom_radius;\n\
    float u_mu;\n\
    if (ray_r_mu_intersects_ground) {\n\
        float d = -r_mu - SafeSqrt(discriminant);\n\
        float d_min = r - u_bottom_radius;\n\
        float d_max = rho;\n\
        u_mu = 0.5 -\n\
        0.5 *\n\
        GetTextureCoordFromUnitRange(\n\
        d_max == d_min\n\
        ? 0.0\n\
        : (d - d_min) / (d_max - d_min), SCATTERING_TEXTURE_MU_SIZE / 2\n\
        );\n\
    }\n\
    else {\n\
        float d = -r_mu + SafeSqrt(discriminant + H * H);\n\
        float d_min = u_top_radius - r;\n\
        float d_max = rho + H;\n\
        u_mu = 0.5 +\n\
        0.5 *\n\
        GetTextureCoordFromUnitRange((d - d_min) / (d_max - d_min), SCATTERING_TEXTURE_MU_SIZE / 2);\n\
    }\n\
    float d = DistanceToTopAtmosphereBoundary(u_bottom_radius, mu_s);\n\
    float d_min = u_top_radius - u_bottom_radius;\n\
    float d_max = H;\n\
    float a = (d - d_min) / (d_max - d_min);\n\
    float D = DistanceToTopAtmosphereBoundary(u_bottom_radius, u_mu_s_min);\n\
    float A = (D - d_min) / (d_max - d_min);\n\
    float u_mu_s = GetTextureCoordFromUnitRange(\n\
    max(1.0 - a / A, 0.0) / (1.0 + a), SCATTERING_TEXTURE_MU_S_SIZE\n\
    );\n\
    float u_nu = (nu + 1.0) / 2.0;\n\
    return vec4(u_nu, u_mu_s, u_mu, u_r);\n\
}\n\
vec2 GetIrradianceTextureUvFromRMuS(float r, float mu_s) {\n\
    float x_r = (r - u_bottom_radius) / (u_top_radius - u_bottom_radius);\n\
    float x_mu_s = mu_s * 0.5 + 0.5;\n\
    return vec2(\n\
    GetTextureCoordFromUnitRange(x_mu_s, IRRADIANCE_TEXTURE_WIDTH), GetTextureCoordFromUnitRange(x_r, IRRADIANCE_TEXTURE_HEIGHT)\n\
    );\n\
}\n\
vec3 GetIrradiance(const sampler2D u_irradiance_texture, float r, float mu_s) {\n\
    vec2 uv = GetIrradianceTextureUvFromRMuS(r, mu_s);\n\
    return vec3(texture(u_irradiance_texture, uv));\n\
}\n\
vec3 GetExtrapolatedSingleMieScattering(const vec4 scattering) {\n\
    if (scattering.r <= 0.0) {\n\
        return vec3(0.0);\n\
    }\n\
    return scattering.rgb *\n\
    scattering.a /\n\
    scattering.r *\n\
    (u_rayleigh_scattering.r / u_mie_scattering.r) *\n\
    (u_mie_scattering / u_rayleigh_scattering);\n\
}\n\
vec3 GetCombinedScattering(\n\
const sampler3D u_scattering_texture, const sampler3D u_single_mie_scattering_texture, float r, float mu, float mu_s, float nu, bool ray_r_mu_intersects_ground, out vec3 single_mie_scattering\n\
) {\n\
    vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(r, mu, mu_s, nu, ray_r_mu_intersects_ground);\n\
    float tex_coord_x = uvwz.x * float(SCATTERING_TEXTURE_NU_SIZE - 1);\n\
    float tex_x = floor(tex_coord_x);\n\
    float lerp = tex_coord_x - tex_x;\n\
    vec3 uvw0 = vec3((tex_x + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE), uvwz.z, uvwz.w);\n\
    vec3 uvw1 = vec3((tex_x + 1.0 + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE), uvwz.z, uvwz.w);\n\
    vec4 combined_scattering = texture(u_scattering_texture, uvw0) * (1.0 - lerp) + texture(u_scattering_texture, uvw1) * lerp;\n\
    vec3 scattering = vec3(combined_scattering);\n\
    single_mie_scattering = GetExtrapolatedSingleMieScattering(combined_scattering);\n\
    return scattering;\n\
}\n\
vec3 GetSkyRadiance(\n\
const sampler2D u_transmittance_texture, const sampler3D u_scattering_texture, const sampler3D u_single_mie_scattering_texture, vec3 camera, const vec3 view_ray, float shadow_length, const vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    float r = length(camera);\n\
    float rmu = dot(camera, view_ray);\n\
    float distance_to_top_atmosphere_boundary = -rmu - SafeSqrt(rmu * rmu - r * r + u_top_radius * u_top_radius);\n\
    if (distance_to_top_atmosphere_boundary > 0.0) {\n\
        camera = camera + view_ray * distance_to_top_atmosphere_boundary;\n\
        r = u_top_radius;\n\
        rmu += distance_to_top_atmosphere_boundary;\n\
    }\n\
    else if (r > u_top_radius) {\n\
        transmittance = vec3(1.0);\n\
        return vec3(0.0);\n\
    }\n\
    float mu = rmu / r;\n\
    float mu_s = dot(camera, sun_direction) / r;\n\
    float nu = dot(view_ray, sun_direction);\n\
    bool ray_r_mu_intersects_ground = RayIntersectsGround(r, mu);\n\
    transmittance = ray_r_mu_intersects_ground\n\
    ? vec3(0.0)\n\
    : GetTransmittanceToTopAtmosphereBoundary(u_transmittance_texture, r, mu);\n\
    vec3 single_mie_scattering;\n\
    vec3 scattering;\n\
    if (shadow_length == 0.0) {\n\
        scattering = GetCombinedScattering(\n\
        u_scattering_texture, u_single_mie_scattering_texture, r, mu, mu_s, nu, ray_r_mu_intersects_ground, single_mie_scattering\n\
        );\n\
    }\n\
    else {\n\
        float d = shadow_length;\n\
        float r_p = ClampRadius(sqrt(d * d + 2.0 * r * mu * d + r * r));\n\
        float mu_p = (r * mu + d) / r_p;\n\
        float mu_s_p = (r * mu_s + d * nu) / r_p;\n\
        scattering = GetCombinedScattering(\n\
        u_scattering_texture, u_single_mie_scattering_texture, r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground, single_mie_scattering\n\
        );\n\
        vec3 shadow_transmittance = GetTransmittance(\n\
        u_transmittance_texture, r, mu, shadow_length, ray_r_mu_intersects_ground\n\
        );\n\
        scattering = scattering * shadow_transmittance;\n\
        single_mie_scattering = single_mie_scattering * shadow_transmittance;\n\
    }\n\
    return scattering * RayleighPhaseFunction(nu) +\n\
    single_mie_scattering * MiePhaseFunction(u_mie_phase_function_g, nu);\n\
}\n\
vec3 GetSkyRadianceToPoint(\n\
const sampler2D u_transmittance_texture, const sampler3D u_scattering_texture, const sampler3D u_single_mie_scattering_texture, vec3 camera, const vec3 point, float shadow_length, const vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    vec3 view_ray = normalize(point - camera);\n\
    float r = length(camera);\n\
    float rmu = dot(camera, view_ray);\n\
    float distance_to_top_atmosphere_boundary = -rmu - sqrt(rmu * rmu - r * r + u_top_radius * u_top_radius);\n\
    if (distance_to_top_atmosphere_boundary > 0.0) {\n\
        camera = camera + view_ray * distance_to_top_atmosphere_boundary;\n\
        r = u_top_radius;\n\
        rmu += distance_to_top_atmosphere_boundary;\n\
    }\n\
    float mu = rmu / r;\n\
    float mu_s = dot(camera, sun_direction) / r;\n\
    float nu = dot(view_ray, sun_direction);\n\
    float d = length(point - camera);\n\
    bool ray_r_mu_intersects_ground = RayIntersectsGround(r, mu);\n\
    \n\
    // Hack to avoid rendering artifacts near the horizon, due to finite\n\
    \n\
    // atmosphere texture resolution and finite floating point precision.\n\
    // See: https://github.com/ebruneton/precomputed_atmospheric_scattering/pull/32\n\
    if (!ray_r_mu_intersects_ground) {\n\
        float mu_horiz = -SafeSqrt(1.0 - u_bottom_radius / r * (u_bottom_radius / r));\n\
        mu = max(mu, mu_horiz + 0.004);\n\
    }\n\
    transmittance = GetTransmittance(u_transmittance_texture, r, mu, d, ray_r_mu_intersects_ground);\n\
    vec3 single_mie_scattering;\n\
    vec3 scattering = GetCombinedScattering(\n\
    u_scattering_texture, u_single_mie_scattering_texture, r, mu, mu_s, nu, ray_r_mu_intersects_ground, single_mie_scattering\n\
    );\n\
    d = max(d - shadow_length, 0.0);\n\
    float r_p = ClampRadius(sqrt(d * d + 2.0 * r * mu * d + r * r));\n\
    float mu_p = (r * mu + d) / r_p;\n\
    float mu_s_p = (r * mu_s + d * nu) / r_p;\n\
    vec3 single_mie_scattering_p;\n\
    vec3 scattering_p = GetCombinedScattering(\n\
    u_scattering_texture, u_single_mie_scattering_texture, r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground, single_mie_scattering_p\n\
    );\n\
    vec3 shadow_transmittance = transmittance;\n\
    if (shadow_length > 0.0) {\n\
        shadow_transmittance = GetTransmittance(\n\
        u_transmittance_texture, r, mu, d, ray_r_mu_intersects_ground\n\
        );\n\
    }\n\
    scattering = scattering - shadow_transmittance * scattering_p;\n\
    single_mie_scattering = single_mie_scattering - shadow_transmittance * single_mie_scattering_p;\n\
    single_mie_scattering = GetExtrapolatedSingleMieScattering(\n\
    vec4(scattering, single_mie_scattering.r)\n\
    );\n\
    single_mie_scattering = single_mie_scattering * smoothstep(float(0.0), float(0.01), mu_s);\n\
    return scattering * RayleighPhaseFunction(nu) +\n\
    single_mie_scattering * MiePhaseFunction(u_mie_phase_function_g, nu);\n\
}\n\
vec3 GetSunAndSkyIrradiance(\n\
const sampler2D u_transmittance_texture, const sampler2D u_irradiance_texture, const vec3 point, const vec3 sun_direction, out vec3 sky_irradiance\n\
) {\n\
    float r = length(point);\n\
    float mu_s = dot(point, sun_direction) / r;\n\
    // 5.30
    // sky_irradiance = GetIrradiance(u_irradiance_texture, r, mu_s);\n\
    sky_irradiance = GetIrradiance(u_irradiance_texture, r, mu_s) * 2.0 * PI;\n\
    return u_solar_irradiance * GetTransmittanceToSun(u_transmittance_texture, r, mu_s);\n\
}\n\
vec3 GetSunAndSkyIrradiance(\n\
const sampler2D u_transmittance_texture, const sampler2D u_irradiance_texture, const vec3 point, const vec3 normal, const vec3 sun_direction, out vec3 sky_irradiance\n\
) {\n\
    float r = length(point);\n\
    float mu_s = dot(point, sun_direction) / r;\n\
    sky_irradiance = GetIrradiance(u_irradiance_texture, r, mu_s) * (1.0 + dot(normal, point) / r) * 0.5;\n\
    return u_solar_irradiance *\n\
    GetTransmittanceToSun(u_transmittance_texture, r, mu_s) *\n\
    max(dot(normal, sun_direction), 0.0);\n\
}\n\
vec3 GetSolarRadiance() {\n\
    vec3 radiance = u_solar_irradiance / (PI * u_sun_angular_radius * u_sun_angular_radius);\n\
    #ifdef PHOTOMETRIC\n\
        radiance *= SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return radiance;\n\
}\n\
vec3 GetSkyRadiance(\n\
vec3 camera, vec3 view_ray, float shadow_length, vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    vec3 radiance = GetSkyRadiance(\n\
    u_transmittance_texture, u_scattering_texture, u_single_mie_scattering_texture, camera, view_ray, shadow_length, sun_direction, transmittance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        radiance *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return radiance;\n\
}\n\
vec3 GetSkyRadianceToPoint(\n\
vec3 camera, vec3 point, float shadow_length, vec3 sun_direction, out vec3 transmittance\n\
) {\n\
    vec3 inscatter = GetSkyRadianceToPoint(\n\
    u_transmittance_texture, u_scattering_texture, u_single_mie_scattering_texture, camera, point, shadow_length, sun_direction, transmittance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        inscatter *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return inscatter;\n\
}\n\
vec3 GetSunAndSkyIrradiance(vec3 point, vec3 sun_direction, out vec3 sky_irradiance) {\n\
    vec3 sun_irradiance = GetSunAndSkyIrradiance(\n\
    u_transmittance_texture, u_irradiance_texture, point, sun_direction, sky_irradiance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        sun_irradiance *= SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
        sky_irradiance *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return sun_irradiance;\n\
}\n\
vec3 GetSunAndSkyIrradiance(vec3 point, vec3 normal, vec3 sun_direction, out vec3 sky_irradiance) {\n\
    vec3 sun_irradiance = GetSunAndSkyIrradiance(\n\
    u_transmittance_texture, u_irradiance_texture, point, normal, sun_direction, sky_irradiance\n\
    );\n\
    #ifdef PHOTOMETRIC\n\
        sun_irradiance *= SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
        sky_irradiance *= SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;\n\
    #endif // PHOTOMETRIC\n\
    return sun_irradiance;\n\
}\n\
struct GroundIrradiance {\n\
    vec3 sun;\n\
    vec3 sky;\n\
};\n\
struct CloudsIrradiance {\n\
    vec3 minSun;\n\
    vec3 minSky;\n\
    vec3 maxSun;\n\
    vec3 maxSky;\n\
};\n\
struct DensityProfile {\n\
    vec4 expTerms;\n\
    vec4 exponents;\n\
    vec4 linearTerms;\n\
    vec4 constantTerms;\n\
};\n\
uniform vec2 resolution;\n\
uniform int frame;\n\
uniform sampler3D stbnTexture;\n\
\n\
// Atmosphere\n\
\n\
uniform float bottomRadius;\n\
uniform mat4 ellipsoidMatrix;\n\
uniform mat4 inverseEllipsoidMatrix;\n\
uniform vec3 sunDirection;\n\
\n\
// Participating medium\n\
\n\
uniform float scatteringCoefficient;\n\
uniform float absorptionCoefficient;\n\
uniform vec3 albedo;\n\
\n\
// Primary raymarch\n\
\n\
uniform float minDensity;\n\
uniform float minExtinction;\n\
uniform float minTransmittance;\n\
\n\
// Shape and weather\n\
\n\
uniform sampler2D localWeatherTexture;\n\
uniform vec2 localWeatherRepeat;\n\
uniform vec2 localWeatherOffset;\n\
uniform float coverage;\n\
uniform sampler3D shapeTexture;\n\
uniform vec3 shapeRepeat;\n\
uniform vec3 shapeOffset;\n\
#ifdef SHAPE_DETAIL\n\
    uniform sampler3D shapeDetailTexture;\n\
    uniform vec3 shapeDetailRepeat;\n\
    uniform vec3 shapeDetailOffset;\n\
#endif // SHAPE_DETAIL\n\
\n\
#ifdef TURBULENCE\n\
    uniform sampler2D turbulenceTexture;\n\
    uniform vec2 turbulenceRepeat;\n\
    uniform float turbulenceDisplacement;\n\
#endif // TURBULENCE\n\
\n\
// Haze\n\
#ifdef HAZE\n\
    uniform float hazeDensityScale;
    uniform bool hazeCloudAttached;
    uniform float hazeViewDistance;
    uniform float hazeVolumeLength;
    uniform float hazeDirectLightScale;
uniform vec3 hazeSunColor;\n\
    uniform float hazeExponent;\n\
    uniform float hazeAnisotropy;
    uniform int hazeSampleCount;
    uniform int hazeShadowSampleCount;
    uniform float hazeScatteringCoefficient;\n\
    uniform float hazeAbsorptionCoefficient;\n\
#endif // HAZE\n\
\n\
// Cloud layers\n\
uniform vec4 minLayerHeights;\n\
uniform vec4 maxLayerHeights;\n\
uniform vec3 minIntervalHeights;\n\
uniform vec3 maxIntervalHeights;\n\
uniform vec4 densityScales;\n\
uniform vec4 shapeAmounts;\n\
uniform vec4 shapeDetailAmounts;\n\
uniform vec4 weatherExponents;\n\
uniform vec4 shapeAlteringBiases;\n\
uniform vec4 coverageFilterWidths;\n\
uniform float minHeight;\n\
uniform float maxHeight;\n\
uniform float shadowTopHeight;\n\
uniform float shadowBottomHeight;\n\
uniform vec4 shadowLayerMask;\n\
uniform DensityProfile densityProfile;\n\
float getSTBN() {\n\
    ivec3 size = textureSize(stbnTexture, 0);\n\
    vec3 scale = 1.0 / vec3(size);\n\
    return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;\n\
}\n\
// Straightforward spherical mapping\n\
vec2 getSphericalUv(const vec3 position) {\n\
    vec2 st = normalize(position.yx);\n\
    float phi = atan(st.x, st.y);\n\
    float theta = asin(normalize(position).z);\n\
    return vec2(phi * RECIPROCAL_PI2 + 0.5, theta * RECIPROCAL_PI + 0.5);\n\
}\n\
vec2 getCubeSphereUv(const vec3 position) {\n\
    // Cube-sphere relaxation by: http://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html\n\
    // TODO: Tile and fix seams.\n\
    // Possible improvements:\n\
    // https://iquilezles.org/articles/texturerepetition/\n\
    // https://gamedev.stackexchange.com/questions/184388/fragment-shader-map-dot-texture-repeatedly-over-the-sphere\n\
    // https://github.com/mmikk/hextile-demo\n\
    \n\
    vec3 n = normalize(position);\n\
    vec3 f = abs(n);\n\
    vec3 c = n / max(f.x, max(f.y, f.z));\n\
    vec2 m;\n\
    if (all(greaterThan(f.yy, f.xz))) {\n\
        m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz;\n\
    }\n\
    else if (all(greaterThan(f.xx, f.yz))) {\n\
        m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z);\n\
    }\n\
    else {\n\
        m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y);\n\
    }\n\
    vec2 m2 = m * m;\n\
    float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;\n\
    float q2 = q * q;\n\
    vec2 uv;\n\
    uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2)) * (m.x > 0.0 ? 1.0 : -1.0);\n\
    uv.y = sqrt(6.0 / (3.0 - uv.x * uv.x)) * m.y;\n\
    return uv * 0.5 + 0.5;\n\
}\n\
vec2 getGlobeUv(const vec3 position) {\n\
    return getCubeSphereUv(position);\n\
}\n\
float getMipLevel(const vec2 uv) {\n\
    const float mipLevelScale = 0.1;\n\
    vec2 coord = uv * resolution;\n\
    vec2 ddx = dFdx(coord);\n\
    vec2 ddy = dFdy(coord);\n\
    float deltaMaxSqr = max(dot(ddx, ddx), dot(ddy, ddy)) * mipLevelScale;\n\
    return max(0.0, 0.5 * log2(max(1.0, deltaMaxSqr)));\n\
}\n\
bool insideLayerIntervals(const float height) {\n\
    bvec3 gt = greaterThan(vec3(height), minIntervalHeights);\n\
    bvec3 lt = lessThan(vec3(height), maxIntervalHeights);\n\
    return any(bvec3(gt.x && lt.x, gt.y && lt.y, gt.z && lt.z));\n\
}\n\
${cloudLayerDensityGLSL}
struct WeatherSample {\n\
    vec4 heightFraction; // Normalized height of each layer\n\
    \n\
    vec4 density;\n\
};\n\
vec4 shapeAlteringFunction(const vec4 heightFraction, const vec4 bias) {\n\
    // Apply a semi-circle transform to round the clouds towards the top.\n\
    vec4 biased = pow(heightFraction, bias);\n\
    vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);\n\
    return 1.0 - x * x;\n\
}\n\
WeatherSample sampleWeather(const vec2 uv, const float height, const float mipLevel) {\n\
    WeatherSample weather;\n\
    weather.heightFraction = remapClamped(vec4(height), minLayerHeights, maxLayerHeights);\n\
    vec4 localWeather = pow(\n\
    textureLod(\n\
    localWeatherTexture, uv * localWeatherRepeat + localWeatherOffset, mipLevel\n\
    ).LOCAL_WEATHER_CHANNELS, weatherExponents\n\
    );\n\
    #ifdef SHADOW\n\
        localWeather *= shadowLayerMask;\n\
    #endif // SHADOW\n\
    \n\
    vec4 heightScale = shapeAlteringFunction(weather.heightFraction, cloudHeightBias(shapeAlteringBiases));\n\
    \n\
    // Modulation to control weather by coverage parameter.\n\
    \n\
    // Reference: https://github.com/Prograda/Skybolt/blob/master/Assets/Core/Shaders/Clouds.h#L63\n\
    vec4 factor = 1.0 - coverage * heightScale;\n\
    weather.density = remapClamped(\n\
    mix(localWeather, vec4(1.0), coverageFilterWidths), factor, factor + coverageFilterWidths\n\
    );\n\
    return weather;\n\
}\n\
vec4 getLayerDensity(const vec4 heightFraction) {\n\
    // prettier-ignore\n\
    return densityProfile.expTerms * exp(densityProfile.exponents * heightFraction) +\n\
    densityProfile.linearTerms * heightFraction +\n\
    densityProfile.constantTerms;\n\
}\n\
struct MediaSample {\n\
    float density;\n\
    vec4 weight;\n\
    float scattering;\n\
    float extinction;\n\
};\n\
in vec3 vCameraPosition;\n\
in vec3 vEllipsoidCenter;\n\
uniform float shapeTexelsPerMeterPerPixel;\n\
MediaSample sampleMedia(\n\
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter, inout ivec3 sampleCount\n\
) {\n\
    vec4 density = weather.density;\n\
    \n\
    // TODO: Define in physical length.\n\
    \n\
    vec3 surfaceNormal = normalize(position);\n\
    float localWeatherSpeed = length(localWeatherOffset);\n\
    vec3 evolution = -surfaceNormal * localWeatherSpeed * 2e4;\n\
    vec3 turbulence = vec3(0.0);\n\
    #ifdef TURBULENCE\n\
        vec2 turbulenceUv = uv * localWeatherRepeat * turbulenceRepeat;\n\
        turbulence = turbulenceDisplacement *\n\
        (texture(turbulenceTexture, turbulenceUv).rgb * 2.0 - 1.0) *\n\
        dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));\n\
    #endif // TURBULENCE\n\
    \n\
    vec3 shapePosition = (position + evolution + turbulence) * shapeRepeat + shapeOffset;\n\
    float cameraDistance = length(position - (vCameraPosition - vEllipsoidCenter));\n\
    float shapeLod = log2(max(1.0, cameraDistance * shapeTexelsPerMeterPerPixel));\n\
    int shapeSamples;\n\
    vec4 shape = sampleCloudLayerShape(shapePosition, density, shapeLod, shapeSamples);\n\
    density = remapClamped(density, (vec4(1.0) - shape) * shapeAmounts, vec4(1.0));\n\
    #ifdef DEBUG_SHOW_SAMPLE_COUNT\n\
        sampleCount.y += shapeSamples;\n\
    #endif // DEBUG_SHOW_SAMPLE_COUNT\n\
    \n\
    #ifdef SHAPE_DETAIL\n\
        // Fade detail continuously; stochastic LOD toggles also changed density.\n\
        // Fade erosion that is smaller than a raymarch pixel, not just weather-map detail.\n\
        float detailFootprint = cameraDistance * shapeTexelsPerMeterPerPixel *\n\
            (shapeDetailRepeat.x / max(shapeRepeat.x, 1e-7)) *\n\
            (float(textureSize(shapeDetailTexture, 0).x) / float(textureSize(shapeTexture, 0).x));\n\
        float detailWeight = (1.0 - smoothstep(0.0, 1.5, mipLevel)) *\n\
            (1.0 - smoothstep(0.5, 2.0, detailFootprint));\n\
        if (detailWeight > 0.0) {\n\
            vec3 detailPosition = (position + turbulence) * shapeDetailRepeat + shapeDetailOffset;\n\
            float detailLod = cloudLodRange.y > cloudLodRange.x ? log2(max(1.0, detailFootprint)) : 0.0;\n\
            float detail = textureLod(shapeDetailTexture, detailPosition, detailLod).r;\n\
            // Fluffy at the top and whippy at the bottom.\n\
            \n\
            vec4 modifier = mix(\n\
            vec4(pow(detail, 6.0)), vec4(1.0 - detail), remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4))\n\
            );\n\
            modifier = mix(vec4(0.0), modifier, shapeDetailAmounts);\n\
            vec4 detailedDensity = remapClamped(density * 2.0, vec4(modifier * 0.5), vec4(1.0));\n\
            density = mix(density, detailedDensity, detailWeight);\n\
            #ifdef DEBUG_SHOW_SAMPLE_COUNT\n\
                ++sampleCount.z;\n\
            #endif // DEBUG_SHOW_SAMPLE_COUNT\n\
        }\n\
    #endif // SHAPE_DETAIL\n\
    // Nicely decrease the density at the bottom.\n\
    density = saturate(density * densityScales * getLayerDensity(weather.heightFraction));\n\
    MediaSample media;\n\
    float densitySum = density.x + density.y + density.z + density.w;\n\
    media.density = densitySum;\n\
    media.weight = density / max(densitySum, 1e-7);\n\
    media.scattering = densitySum * scatteringCoefficient;\n\
    media.extinction = densitySum * absorptionCoefficient + media.scattering;\n\
    return media;\n\
}\n\
MediaSample sampleMedia(\n\
const WeatherSample weather, const vec3 position, const vec2 uv, const float mipLevel, const float jitter\n\
) {\n\
    ivec3 sampleCount = ivec3(0);\n\
    return sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);\n\
}\n\
#if !defined(RECIPROCAL_PI4)\n\
    #define RECIPROCAL_PI4 (0.07957747154594767)\n\
#endif // !defined(RECIPROCAL_PI4)\n\
uniform sampler2D depthBuffer;\n\
uniform mat4 viewMatrix;\n\
uniform mat4 reprojectionMatrix;\n\
uniform vec3 previousCameraPosition;\n\
uniform float cameraNear;\n\
uniform float cameraFar;\n\
uniform float cameraHeight;\n\
uniform vec2 temporalJitter;\n\
uniform vec2 targetUvScale;\n\
uniform float mipLevelScale;\n\
\n\
// Scattering\n\
\n\
const vec2 scatterAnisotropy = vec2(SCATTER_ANISOTROPY_1, SCATTER_ANISOTROPY_2);\n\
const float scatterAnisotropyMix = SCATTER_ANISOTROPY_MIX;\n\
uniform float skyIrradianceScale;\n\
uniform float groundIrradianceScale;\n\
uniform float powderScale;\n\
uniform float powderExponent;\n\
\n\
// Primary raymarch\n\
\n\
uniform int maxIterationCount;\n\
uniform float minStepSize;\n\
uniform float maxStepSize;\n\
uniform float maxRayDistance;\n\
uniform float perspectiveStepScale;\n\
\n\
// Secondary raymarch\n\
\n\
uniform int maxIterationCountToSun;\n\
uniform int maxIterationCountToGround;\n\
uniform float minSecondaryStepSize;\n\
uniform float secondaryStepScale;\n\
\n\
// Beer shadow map\n\
\n\
uniform sampler2DArray shadowBuffer;\n\
uniform vec2 shadowTexelSize;\n\
uniform vec2 shadowIntervals[SHADOW_CASCADE_COUNT];\n\
uniform mat4 shadowMatrices[SHADOW_CASCADE_COUNT];\n\
uniform float shadowFar;\n\
uniform float maxShadowFilterRadius;\n\
\n\
// Shadow length\n\
\n\
#ifdef SHADOW_LENGTH\n\
    uniform int maxShadowLengthIterationCount;\n\
    uniform float minShadowLengthStepSize;\n\
    uniform float maxShadowLengthRayDistance;\n\
#endif // SHADOW_LENGTH\n\
\n\
in vec2 vUv;\n\
in vec3 vCameraDirection; // Direction to the center of screen\n\
\n\
in vec3 vRayDirection; // Direction to the texel\n\
\n\
in GroundIrradiance vGroundIrradiance;\n\
in CloudsIrradiance vCloudsIrradiance;\n\
layout(location = 0) out vec4 outputColor;\n\
layout(location = 1) out vec4 outputDepthVelocity;\n\
#ifdef SHADOW_LENGTH\n\
    layout(location = 2) out float outputShadowLength;\n\
#endif // SHADOW_LENGTH\n\
\n\
float readDepth(const vec2 uv) {\n\
    // #if DEPTH_PACKING == 3201\n\
    //     return unpackRGBAToDepth(texture(depthBuffer, uv));\n\
    // #else // DEPTH_PACKING == 3201\n\
    //     return texture(depthBuffer, uv).r;\n\
    // #endif // DEPTH_PACKING == 3201\n\
    return czm_unpackDepth(texture(depthBuffer, uv));\n\
}\n\
// float getViewZ(const float depth) {\n\
//     #ifdef PERSPECTIVE_CAMERA\n\
//         return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);\n\
//     #else // PERSPECTIVE_CAMERA\n\
//         return orthographicDepthToViewZ(depth, cameraNear, cameraFar);\n\
//     #endif // PERSPECTIVE_CAMERA\n\
// }\n\
float getViewZ(const in float depth) {\n\
    // float near = czm_depthRange.near;\n\
    // float far = czm_depthRange.far;\n\
    // return (2.0 * depth - near - far) / (far - near);\n\
    float near = czm_currentFrustum.x;\n\
    float far = czm_currentFrustum.y;\n\
    return ( near * far ) / ( ( far - near ) * depth - far );\n\
}   \n\
vec3 ECEFToWorld(const vec3 positionECEF) {\n\
    return mat3(ellipsoidMatrix) * (positionECEF + vEllipsoidCenter);\n\
}\n\
vec2 getShadowUv(const vec3 worldPosition, const int cascadeIndex) {\n\
    vec4 clip = shadowMatrices[cascadeIndex] * vec4(worldPosition, 1.0);\n\
    clip /= clip.w;\n\
    return clip.xy * 0.5 + 0.5;\n\
}\n\
float getDistanceToShadowTop(const vec3 rayPosition) {\n\
    // Distance to the top of the shadows along the sun direction, which matches\n\
    // the ray origin of BSM.\n\
    return raySphereSecondIntersection(\n\
    rayPosition, sunDirection, vec3(0.0), bottomRadius + shadowTopHeight\n\
    );\n\
}\n\
#ifdef DEBUG_SHOW_CASCADES\n\
    const vec3 cascadeColors[4] = vec3[4](\n\
    vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(1.0, 1.0, 0.0)\n\
    );\n\
    vec3 getCascadeColor(const vec3 rayPosition) {\n\
        vec3 worldPosition = ECEFToWorld(rayPosition);\n\
        int cascadeIndex = getCascadeIndex(\n\
        viewMatrix, worldPosition, shadowIntervals, cameraNear, shadowFar\n\
        );\n\
        vec2 uv = getShadowUv(worldPosition, cascadeIndex);\n\
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {\n\
            return vec3(1.0);\n\
        }\n\
        return cascadeColors[cascadeIndex];\n\
    }\n\
    vec3 getFadedCascadeColor(const vec3 rayPosition, const float jitter) {\n\
        vec3 worldPosition = ECEFToWorld(rayPosition);\n\
        int cascadeIndex = getFadedCascadeIndex(\n\
        viewMatrix, worldPosition, shadowIntervals, cameraNear, shadowFar, jitter\n\
        );\n\
        return cascadeIndex >= 0\n\
        ? cascadeColors[cascadeIndex]\n\
        : vec3(1.0);\n\
    }\n\
#endif // DEBUG_SHOW_CASCADES\n\
float readShadowOpticalDepth(\n\
const vec2 uv, const float distanceToTop, const float distanceOffset, const int cascadeIndex\n\
) {\n\
    // r: frontDepth, g: meanExtinction, b: maxOpticalDepth, a: maxOpticalDepthTail\n\
    // Also see the discussion here: https://x.com/shotamatsuda/status/1885322308908442106\n\
    vec4 shadow = texture(shadowBuffer, vec3(uv, float(cascadeIndex)));\n\
    float distanceToFront = max(0.0, distanceToTop - distanceOffset - shadow.r);\n\
    return min(shadow.b + shadow.a, shadow.g * distanceToFront);\n\
}\n\
float sampleShadowOpticalDepthPCF(\n\
const vec3 worldPosition, const float distanceToTop, const float distanceOffset, const float radius, const int cascadeIndex\n\
) {\n\
    vec2 uv = getShadowUv(worldPosition, cascadeIndex);\n\
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {\n\
        return 0.0;\n\
    }\n\
    if (radius < 0.1) {\n\
        return readShadowOpticalDepth(uv, distanceToTop, distanceOffset, cascadeIndex);\n\
    }\n\
    float sum = 0.0;\n\
    vec2 offset;\n\
    #if 0 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        0, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 0 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 1 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        1, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 1 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 2 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        2, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 2 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 3 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        3, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 3 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 4 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        4, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 4 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 5 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        5, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 5 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 6 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        6, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 6 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 7 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        7, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 7 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 8 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        8, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 8 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 9 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        9, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 9 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 10 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        10, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 10 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 11 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        11, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 11 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 12 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        12, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 12 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 13 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        13, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 13 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 14 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        14, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 14 < SHADOW_SAMPLE_COUNT\n\
    \n\
    #if 15 < SHADOW_SAMPLE_COUNT\n\
        offset = vogelDisk(\n\
        15, SHADOW_SAMPLE_COUNT, interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2\n\
        );\n\
        sum += readShadowOpticalDepth(\n\
        uv + offset * radius * shadowTexelSize, distanceToTop, distanceOffset, cascadeIndex\n\
        );\n\
    #endif // 15 < SHADOW_SAMPLE_COUNT\n\
    \n\
    return sum / float(SHADOW_SAMPLE_COUNT);\n\
}\n\
float sampleShadowOpticalDepth(\n\
const vec3 rayPosition, const float distanceOffset, const float radius, const float jitter\n\
) {\n\
    float distanceToTop = getDistanceToShadowTop(rayPosition);\n\
    if (distanceToTop <= 0.0) {\n\
        return 0.0;\n\
    }\n\
    vec3 worldPosition = ECEFToWorld(rayPosition);\n\
    int cascadeIndex = getFadedCascadeIndex(\n\
    viewMatrix, worldPosition, shadowIntervals, cameraNear, shadowFar, jitter\n\
    );\n\
    float mappedDepth = cascadeIndex >= 0
        ? sampleShadowOpticalDepthPCF(worldPosition, distanceToTop, distanceOffset, radius, cascadeIndex)
        : 0.0;
    if (distanceOffset <= 0.0) return mappedDepth;
    float viewDistance = -(viewMatrix * vec4(worldPosition, 1.0)).z;
    float blend = smoothstep(shadowFar * 0.9, shadowFar, viewDistance);
    if (cascadeIndex < 0) blend = 1.0;
    if (blend <= 0.0) return mappedDepth;
    // Distant cloud self-shadowing must not depend on the local ground-shadow map's reach.
    float span = max(0.0, distanceToTop - distanceOffset);
    float approximation = 0.0;
    for (int i = 0; i < 2; ++i) {
        vec3 position = rayPosition + sunDirection * (distanceOffset + span * (float(i) + 0.5) * 0.5);
        vec2 uv = getGlobeUv(position);
        float height = length(position) - bottomRadius;
        float cameraDistance = length(position - (vCameraPosition - vEllipsoidCenter));
        float lod = max(2.0, log2(max(1.0, cameraDistance * shapeTexelsPerMeterPerPixel)));
        WeatherSample weather = sampleWeather(uv, height, lod);
        MediaSample media = sampleMedia(weather, position, uv, lod, 0.5);
        approximation += media.extinction * span * 0.5;
    }
    return mix(mappedDepth, approximation, blend);
}\n\
float hazeCascadeTransmittance(const vec3 worldPosition, const float distanceToTop, const int cascadeIndex) {
    vec2 uv = getShadowUv(worldPosition, cascadeIndex);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
    if (hazeShadowSampleCount <= 1) return exp(-readShadowOpticalDepth(uv, distanceToTop, 0.0, cascadeIndex));
    vec4 shadow = texture(shadowBuffer, vec3(uv, float(cascadeIndex)));
    float behindCloud = max(0.0, distanceToTop - shadow.r);
    vec3 projectionRow = vec3(shadowMatrices[cascadeIndex][0][0], shadowMatrices[cascadeIndex][1][0], shadowMatrices[cascadeIndex][2][0]);
    float metresPerTexel = shadowTexelSize.x / max(0.5 * length(projectionRow), 1e-7);
    float radius = clamp(tan(u_sun_angular_radius) * behindCloud / metresPerTexel, 0.35, 2.0);
    float sum = 0.0;
    int count = clamp(hazeShadowSampleCount, 1, 4);
    for (int i = 0; i < 4; ++i) {
        if (i >= count) break;
        vec2 offset = i == 0 ? vec2(-0.707, -0.707) : (i == 1 ? vec2(0.707, 0.707) : (i == 2 ? vec2(-0.707, 0.707) : vec2(0.707, -0.707)));
        sum += exp(-readShadowOpticalDepth(clamp(uv + offset * radius * shadowTexelSize, vec2(0.0), vec2(1.0)), distanceToTop, 0.0, cascadeIndex));
    }
    return sum / float(count);
}
float sampleHazeSunlight(const vec3 position) {
    float distanceToTop = getDistanceToShadowTop(position);
    if (distanceToTop <= 0.0) return 1.0;
    vec3 worldPosition = ECEFToWorld(position);
    int cascadeIndex = getCascadeIndex(viewMatrix, worldPosition, shadowIntervals, cameraNear, shadowFar);
    if (cascadeIndex < 0) return 1.0;
    float sunlight = hazeCascadeTransmittance(worldPosition, distanceToTop, cascadeIndex);
    float depth = (-(viewMatrix * vec4(worldPosition, 1.0)).z - cameraNear) / max(shadowFar - cameraNear, 1.0);
    vec2 interval = shadowIntervals[cascadeIndex];
    float margin = max((interval.y - interval.x) * 0.1, 1e-5);
    float blend = smoothstep(interval.y - margin, interval.y, depth);
    if (blend > 0.0) {
        float nextSunlight = 1.0;
        if (cascadeIndex + 1 < SHADOW_CASCADE_COUNT) nextSunlight = hazeCascadeTransmittance(worldPosition, distanceToTop, cascadeIndex + 1);
        sunlight = mix(sunlight, nextSunlight, blend);
    }
    return sunlight;
}
#ifdef DEBUG_SHOW_SHADOW_MAP\n\
    vec4 getCascadedShadowMaps(vec2 uv) {\n\
        vec4 coord = vec4(vUv, vUv - 0.5) * 2.0;\n\
        vec4 shadow = vec4(0.0);\n\
        if (uv.y > 0.5) {\n\
            if (uv.x < 0.5) {\n\
                shadow = texture(shadowBuffer, vec3(coord.xw, 0.0));\n\
            }\n\
            else {\n\
                #if SHADOW_CASCADE_COUNT > 1\n\
                    shadow = texture(shadowBuffer, vec3(coord.zw, 1.0));\n\
                #endif // SHADOW_CASCADE_COUNT > 1\n\
            }\n\
    \n\
        }\n\
        else {\n\
            if (uv.x < 0.5) {\n\
                #if SHADOW_CASCADE_COUNT > 2\n\
                    shadow = texture(shadowBuffer, vec3(coord.xy, 2.0));\n\
                #endif // SHADOW_CASCADE_COUNT > 2\n\
            }\n\
            else {\n\
                #if SHADOW_CASCADE_COUNT > 3\n\
                    shadow = texture(shadowBuffer, vec3(coord.zy, 3.0));\n\
                #endif // SHADOW_CASCADE_COUNT > 3\n\
            }\n\
    \n\
        }\n\
        #if !defined(DEBUG_SHOW_SHADOW_MAP_TYPE)\n\
            #define DEBUG_SHOW_SHADOW_MAP_TYPE (0)\n\
        #endif // !defined(DEBUG_SHOW_SHADOW_MAP_TYPE\n\
        const float frontDepthScale = 1e-5;\n\
        const float meanExtinctionScale = 10.0;\n\
        const float maxOpticalDepthScale = 0.01;\n\
        vec3 color;\n\
        #if DEBUG_SHOW_SHADOW_MAP_TYPE == 1\n\
            color = vec3(shadow.r * frontDepthScale);\n\
            #elif DEBUG_SHOW_SHADOW_MAP_TYPE == 2\n\
            color = vec3(shadow.g * meanExtinctionScale);\n\
            #elif DEBUG_SHOW_SHADOW_MAP_TYPE == 3\n\
            color = vec3((shadow.b + shadow.a) * maxOpticalDepthScale);\n\
        #else // DEBUG_SHOW_SHADOW_MAP_TYPE\n\
            color = (shadow.rgb + vec3(0.0, 0.0, shadow.a)) *\n\
            vec3(frontDepthScale, meanExtinctionScale, maxOpticalDepthScale);\n\
        #endif // DEBUG_SHOW_SHADOW_MAP_TYPE\n\
        return vec4(color, 1.0);\n\
    }\n\
#endif // DEBUG_SHOW_SHADOW_MAP\n\
vec2 henyeyGreenstein(const vec2 g, const float cosTheta) {\n\
    vec2 g2 = g * g;\n\
    // prettier-ignore\n\
    \n\
    return RECIPROCAL_PI4 *\n\
    ((1.0 - g2) / max(vec2(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5))));\n\
}\n\
#ifdef ACCURATE_PHASE_FUNCTION\n\
    float draine(float u, float g, float a) {\n\
        float g2 = g * g;\n\
        // prettier-ignore\n\
        \n\
        return (1.0 - g2) *\n\
        (1.0 + a * u * u) /\n\
        (4.0 * (1.0 + a * (1.0 + 2.0 * g2) / 3.0) * PI * pow(1.0 + g2 - 2.0 * g * u, 1.5));\n\
    }\n\
    // Numerically-fitted large particles (d = 10) phase function It won't be\n\
    // plausible without a more precise multiple scattering.\n\
    // Reference: https://research.nvidia.com/labs/rtr/approximate-mie/\n\
    float phaseFunction(const float cosTheta, const float attenuation) {\n\
        const float gHG = 0.988176691700256; // exp(-0.0990567/(d-1.67154))\n\
        \n\
        const float gD = 0.5556712547839497; // exp(-2.20679/(d+3.91029) - 0.428934)\n\
        \n\
        const float alpha = 21.995520856274638; // exp(3.62489 - 8.29288/(d+5.52825))\n\
        \n\
        const float weight = 0.4819554318404214; // exp(-0.599085/(d-0.641583)-0.665888)\n\
        \n\
        return mix(\n\
        henyeyGreenstein(vec2(gHG) * attenuation, cosTheta).x, draine(cosTheta, gD * attenuation, alpha), weight\n\
        );\n\
    }\n\
#else // ACCURATE_PHASE_FUNCTION\n\
    float phaseFunction(const float cosTheta, const float attenuation) {\n\
        const vec2 g = scatterAnisotropy;\n\
        const vec2 weights = vec2(1.0 - scatterAnisotropyMix, scatterAnisotropyMix);\n\
        // A similar approximation is described in the Frostbite's paper, where phase\n\
        \n\
        // angle is attenuated instead of anisotropy.\n\
        return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);\n\
    }\n\
#endif // ACCURATE_PHASE_FUNCTION\n\
float phaseFunction(const float cosTheta) {\n\
    return phaseFunction(cosTheta, 1.0);\n\
}\n\
float marchOpticalDepth(\n\
const vec3 rayOrigin, const vec3 rayDirection, const int maxIterationCount, const float mipLevel, const float jitter, out float rayDistance\n\
) {\n\
    // Keep the lighting sample count deterministic: random LOD counts shimmer at distance.\n\
    int iterationCount = max(1, maxIterationCount);\n\
    float stepSize = minSecondaryStepSize / float(iterationCount);\n\
    float nextDistance = stepSize * 0.5;\n\
    float opticalDepth = 0.0;\n\
    float cameraDistance = length(rayOrigin - (vCameraPosition - vEllipsoidCenter));
    float quality = cloudDistanceLod(cameraDistance) * smoothstep(0.5, 2.0, cameraDistance * shapeTexelsPerMeterPerPixel);
    float previousStep = 0.0;
    for (int i = 0; i < iterationCount; ++i) {\n\
        rayDistance = nextDistance;\n\
        // Transfer the omitted sample's interval to its fixed neighbour without shortening the light ray.
        float weight = stepSize;
        if (i % 2 == 0 && i + 1 < iterationCount) weight *= 1.0 - quality;
        if (i % 2 == 1) weight += previousStep * quality;
        if (weight > 0.0) {
            vec3 position = rayDistance * rayDirection + rayOrigin;
            vec2 uv = getGlobeUv(position);
            float height = length(position) - bottomRadius;
            WeatherSample weather = sampleWeather(uv, height, mipLevel);
            MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);
            opticalDepth += media.extinction * weight;
        }
        nextDistance += stepSize;\n\
        previousStep = stepSize;
        stepSize *= secondaryStepScale;\n\
    }\n\
    return opticalDepth;\n\
}\n\
float marchOpticalDepth(\n\
const vec3 rayOrigin, const vec3 rayDirection, const int maxIterationCount, const float mipLevel, const float jitter\n\
) {\n\
    float rayDistance;\n\
    return marchOpticalDepth(\n\
    rayOrigin, rayDirection, maxIterationCount, mipLevel, jitter, rayDistance\n\
    );\n\
}\n\
float approximateMultipleScattering(const float opticalDepth, const float cosTheta) {\n\
    // Multiple scattering approximation\n\
    // See: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf\n\
    // a: attenuation, b: contribution, c: phase attenuation\n\
    vec3 coeffs = vec3(1.0); // [a, b, c]\n\
    \n\
    const vec3 attenuation = vec3(0.5, 0.5, 0.5); // Should satisfy a <= b\n\
    \n\
    float scattering = 0.0;\n\
    float beerLambert;\n\
    #if 0 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 0 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 1 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 1 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 2 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 2 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 3 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 3 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 4 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 4 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 5 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 5 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 6 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 6 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 7 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 7 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 8 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 8 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 9 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 9 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 10 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 10 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    #if 11 < MULTI_SCATTERING_OCTAVES\n\
        beerLambert = exp(-opticalDepth * coeffs.y);\n\
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);\n\
        coeffs *= attenuation;\n\
    #endif // 11 < MULTI_SCATTERING_OCTAVES\n\
    \n\
    return scattering;\n\
}\n\
// TODO: Construct spherical harmonics of degree 2 using 2 sample points\n\
// positioned near the horizon occlusion points on the sun direction plane.\n\
vec3 getGroundSunSkyIrradiance(\n\
const vec3 position, const vec3 surfaceNormal, const float height, out vec3 skyIrradiance\n\
) {\n\
    #ifdef ACCURATE_SUN_SKY_IRRADIANCE\n\
        // 5.30
        // return GetSunAndSkyIrradiance(\n\
        // (position - surfaceNormal * height) * METER_TO_LENGTH_UNIT, sunDirection, skyIrradiance\n\
        // );\n\
        return GetSunAndSkyIrradiance(\n\
        (position - surfaceNormal * height) * METER_TO_LENGTH_UNIT, surfaceNormal, sunDirection, skyIrradiance\n\
        );\n\
    #else // ACCURATE_SUN_SKY_IRRADIANCE\n\
        skyIrradiance = vGroundIrradiance.sky;\n\
        return vGroundIrradiance.sun;\n\
    #endif // ACCURATE_SUN_SKY_IRRADIANCE\n\
}\n\
vec3 getCloudsSunSkyIrradiance(const vec3 position, const float height, out vec3 skyIrradiance) {\n\
    #ifdef ACCURATE_SUN_SKY_IRRADIANCE\n\
        return GetSunAndSkyIrradiance(position * METER_TO_LENGTH_UNIT, sunDirection, skyIrradiance);\n\
    #else // ACCURATE_SUN_SKY_IRRADIANCE\n\
        float alpha = remapClamped(height, minHeight, maxHeight);\n\
        skyIrradiance = mix(vCloudsIrradiance.minSky, vCloudsIrradiance.maxSky, alpha);\n\
        return mix(vCloudsIrradiance.minSun, vCloudsIrradiance.maxSun, alpha);\n\
    #endif // ACCURATE_SUN_SKY_IRRADIANCE\n\
}\n\
#ifdef GROUND_IRRADIANCE\n\
    vec3 approximateIrradianceFromGround(\n\
    const vec3 position, const vec3 surfaceNormal, const float height, const float mipLevel, const float jitter\n\
    ) {\n\
        float opticalDepthToGround = marchOpticalDepth(\n\
        position, -surfaceNormal, maxIterationCountToGround, mipLevel, jitter\n\
        );\n\
        vec3 skyIrradiance;\n\
        vec3 sunIrradiance = getGroundSunSkyIrradiance(position, surfaceNormal, height, skyIrradiance);\n\
        const float groundAlbedo = 0.3;\n\
        // 5.30
        // vec3 groundIrradiance = skyIrradiance + (1.0 - coverage) * sunIrradiance * RECIPROCAL_PI2;\n\
        vec3 groundIrradiance = skyIrradiance + (1.0 - coverage) * sunIrradiance;\n\
        vec3 bouncedLight = groundAlbedo * RECIPROCAL_PI * groundIrradiance;\n\
        vec3 bouncedIrradiance = bouncedLight * exp(-opticalDepthToGround);\n\
        return albedo * bouncedIrradiance * RECIPROCAL_PI4 * groundIrradianceScale;\n\
    }\n\
#endif // GROUND_IRRADIANCE\n\
struct CloudRayIntervals {
    vec2 segment0;
    vec2 segment1;
    vec2 segment2;
    vec2 segment3;
    vec2 segment4;
    vec2 segment5;
    int count;
    float length;
};
// ANGLE/D3D11 cannot dynamically write an array embedded in a local structure.
vec2 cloudIntervalAt(const CloudRayIntervals intervals, const int index) {
    if (index == 0) return intervals.segment0;
    if (index == 1) return intervals.segment1;
    if (index == 2) return intervals.segment2;
    if (index == 3) return intervals.segment3;
    if (index == 4) return intervals.segment4;
    return intervals.segment5;
}
void setCloudInterval(inout CloudRayIntervals intervals, const int index, const vec2 value) {
    if (index == 0) intervals.segment0 = value;
    else if (index == 1) intervals.segment1 = value;
    else if (index == 2) intervals.segment2 = value;
    else if (index == 3) intervals.segment3 = value;
    else if (index == 4) intervals.segment4 = value;
    else intervals.segment5 = value;
}
bool cloudSphereHits(const vec3 origin, const vec3 direction, const float radius, out vec2 hits) {
    float radialLength = length(origin);
    float projection = dot(origin, direction);
    // Factoring the radius difference avoids subtracting two Earth-sized squared radii.
    float discriminant = projection * projection - (radialLength - radius) * (radialLength + radius);
    if (discriminant < 0.0) return false;
    float root = sqrt(max(0.0, discriminant));
    hits = vec2(-projection - root, -projection + root);
    return true;
}
void appendCloudInterval(inout CloudRayIntervals intervals, const vec2 segment, const vec2 bounds) {
    vec2 clipped = vec2(max(segment.x, bounds.x), min(segment.y, bounds.y));
    if (clipped.y > clipped.x && intervals.count < 6) {
        setCloudInterval(intervals, intervals.count, clipped);
        ++intervals.count;
    }
}
CloudRayIntervals getCloudRayIntervals(const vec3 origin, const vec3 direction, const vec2 bounds) {
    CloudRayIntervals intervals;
    intervals.count = 0;
    intervals.length = 0.0;
    for (int i = 0; i < 6; ++i) setCloudInterval(intervals, i, vec2(0.0));
    for (int layer = 0; layer < 3; ++layer) {
        if (densityScales[layer] <= 0.0 || maxLayerHeights[layer] <= minLayerHeights[layer]) continue;
        vec2 outerHits, innerHits;
        if (!cloudSphereHits(origin, direction, bottomRadius + maxLayerHeights[layer], outerHits)) continue;
        if (cloudSphereHits(origin, direction, bottomRadius + minLayerHeights[layer], innerHits)) {
            appendCloudInterval(intervals, vec2(outerHits.x, innerHits.x), bounds);
            appendCloudInterval(intervals, vec2(innerHits.y, outerHits.y), bounds);
        } else {
            appendCloudInterval(intervals, outerHits, bounds);
        }
    }
    for (int i = 1; i < 6; ++i) {
        if (i >= intervals.count) break;
        vec2 entry = cloudIntervalAt(intervals, i);
        int target = i;
        for (int j = i - 1; j >= 0; --j) {
            vec2 previous = cloudIntervalAt(intervals, j);
            if (previous.x <= entry.x) break;
            setCloudInterval(intervals, j + 1, previous);
            target = j;
        }
        setCloudInterval(intervals, target, entry);
    }
    int mergedCount = 0;
    for (int i = 0; i < 6; ++i) {
        if (i >= intervals.count) break;
        vec2 entry = cloudIntervalAt(intervals, i);
        if (mergedCount > 0) {
            vec2 previous = cloudIntervalAt(intervals, mergedCount - 1);
            if (entry.x <= previous.y) {
                setCloudInterval(intervals, mergedCount - 1, vec2(previous.x, max(previous.y, entry.y)));
                continue;
            }
        }
        setCloudInterval(intervals, mergedCount, entry);
        ++mergedCount;
    }
    intervals.count = mergedCount;
    for (int i = 0; i < 6; ++i) {
        if (i >= mergedCount) break;
        vec2 segment = cloudIntervalAt(intervals, i);
        intervals.length += segment.y - segment.x;
    }
    return intervals;
}
vec4 marchClouds(\n\
const vec3 rayOrigin, const vec3 rayDirection, const vec2 rayNearFar, const float cosTheta, const float jitter, const float rayStartTexelsPerPixel, out float frontDepth, out ivec3 sampleCount, out vec4 traceStats\n\
) {\n\
    vec3 radianceIntegral = vec3(0.0);\n\
    sampleCount = ivec3(0);
    float transmittanceIntegral = 1.0;\n\
    float weightedDistanceSum = 0.0;\n\
    float transmittanceSum = 0.0;\n\
    CloudRayIntervals intervals = getCloudRayIntervals(rayOrigin - rayNearFar.x * rayDirection, rayDirection, rayNearFar);
    traceStats = vec4(rayNearFar.x, intervals.length, 0.0, 0.0);
    if (intervals.count == 0) {
        frontDepth = -1.0;
        return vec4(0.0);
    }
    int segmentIndex = 0;
    float cellStart = intervals.segment0.x;
    float remainingLength = intervals.length;
    for (int i = 0; i < maxIterationCount; ++i) {\n\
        if (segmentIndex >= intervals.count) break;
        vec2 segment = cloudIntervalAt(intervals, segmentIndex);
        float quality = cloudDistanceLod(cellStart) * smoothstep(0.5, 2.0, cellStart * shapeTexelsPerMeterPerPixel);
        float desiredStep = min(maxStepSize, minStepSize + (perspectiveStepScale - 1.0) * cellStart) * mix(1.0, 2.0, quality);
        // Reserve four samples in later intervals instead of spending the whole budget on the first shell.
        int available = max(1, maxIterationCount - i - 4 * (intervals.count - segmentIndex - 1));
        float budgetStep = (segment.y - cellStart) / float(available);
        if (cloudLodRange.y > cloudLodRange.x && cellStart < cloudLodRange.x) budgetStep = 0.0;
        float stepSize = min(max(desiredStep, budgetStep), (segment.y - segment.x) * 0.25);
        float cellEnd = min(segment.y, cellStart + stepSize);
        if (cellEnd <= cellStart) cellEnd = segment.y;
        stepSize = cellEnd - cellStart;
        if (budgetStep > desiredStep && quality == 0.0) traceStats.w = 1.0;
        float rayDistance = cellStart - rayNearFar.x + stepSize * jitter;
        remainingLength = max(0.0, remainingLength - stepSize);
        traceStats.xyz = vec3(cellEnd, remainingLength, float(i + 1));
        cellStart = cellEnd;
        if (cellEnd >= segment.y) {
            ++segmentIndex;
            if (segmentIndex < intervals.count) cellStart = cloudIntervalAt(intervals, segmentIndex).x;
        }
        vec3 position = rayDistance * rayDirection + rayOrigin;\n\
        float height = length(position) - bottomRadius;\n\
        float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));\n\
        // Sample rough weather.\n\
        vec2 uv = getGlobeUv(position);\n\
        WeatherSample weather = sampleWeather(uv, height, mipLevel);\n\
        #ifdef DEBUG_SHOW_SAMPLE_COUNT\n\
            ++sampleCount.x;\n\
        #endif // DEBUG_SHOW_SAMPLE_COUNT\n\
        \n\
        if (!any(greaterThan(weather.density, vec4(minDensity)))) {\n\
            continue;\n\
        }\n\
        // Sample detailed participating media.\n\
        MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);\n\
        if (media.extinction > minExtinction) {\n\
            vec3 skyIrradiance;\n\
            vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);\n\
            vec3 surfaceNormal = normalize(position);\n\
            \n\
            // March optical depth to the sun for finer details, which BSM lacks.\n\
            \n\
            float sunRayDistance = 0.0;\n\
            float opticalDepth = marchOpticalDepth(\n\
            position, sunDirection, maxIterationCountToSun, mipLevel, jitter, sunRayDistance\n\
            );\n\
            if (height < shadowTopHeight) {\n\
                // Obtain the optical depth from BSM at the ray position.\n\
                opticalDepth += sampleShadowOpticalDepth(\n\
                position, // Take account of only positions further than the marched ray\n\
                // distance.\n\
                sunRayDistance, // Apply PCF only when the sun is close to the horizon.\n\
                maxShadowFilterRadius * remapClamped(dot(sunDirection, surfaceNormal), 0.1, 0.0), jitter\n\
                );\n\
            }\n\
            float scattering = approximateMultipleScattering(opticalDepth, cosTheta);\n\
            vec3 radiance = albedo * sunIrradiance * scattering;\n\
            #ifdef GROUND_IRRADIANCE\n\
                // Fudge factor for the irradiance from ground.\n\
                if (height < shadowTopHeight && mipLevel < 0.5) {\n\
                    radiance += approximateIrradianceFromGround(\n\
                    position, surfaceNormal, height, mipLevel, jitter\n\
                    );\n\
                }\n\
            #endif // GROUND_IRRADIANCE\n\
            // Crude approximation of sky gradient. Better than none in the shadows.\n\
            // 5.30
            // float skyGradient = dot(0.5 + weather.heightFraction, media.weight);\n\
            float skyGradient = dot(weather.heightFraction * 0.5 + 0.5, media.weight);\n\
            radiance += albedo * skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyIrradianceScale;\n\
            \n\
            // Finally multiply by extinction (redundant but kept for clarity).\n\
            \n\
            radiance *= media.extinction;\n\
            #ifdef POWDER\n\
                radiance *= 1.0 - powderScale * exp(-media.extinction * powderExponent);\n\
            #endif // POWDER\n\
            \n\
            #ifdef DEBUG_SHOW_CASCADES\n\
                if (height < shadowTopHeight) {\n\
                    radiance = 1e-3 * getFadedCascadeColor(position, jitter);\n\
                }\n\
            #endif // DEBUG_SHOW_CASCADES\n\
            // Energy-conserving analytical integration of scattered light\n\
            // See 5.6.3 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf\n\
            float transmittance = exp(-media.extinction * stepSize);\n\
            float clampedExtinction = max(media.extinction, 1e-7);\n\
            vec3 scatteringIntegral = (radiance - radiance * transmittance) / clampedExtinction;\n\
            radianceIntegral += transmittanceIntegral * scatteringIntegral;\n\
            transmittanceIntegral *= transmittance;\n\
            \n\
            // Aerial perspective affecting clouds\n\
            \n\
            // See 5.9.1 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf\n\
            weightedDistanceSum += rayDistance * transmittanceIntegral;\n\
            transmittanceSum += transmittanceIntegral;\n\
        }\n\
        if (transmittanceIntegral <= minTransmittance) {\n\
            traceStats.y = 0.0;
            break; // Early termination\n\
        }\n\
    }\n\
    if (segmentIndex >= intervals.count) traceStats.y = 0.0;
    // The final product of 5.9.1 and we'll evaluate this in aerial perspective.\n\
    frontDepth = transmittanceSum > 0.0 ? weightedDistanceSum / transmittanceSum : -1.0;\n\
    return vec4(radianceIntegral, remapClamped(transmittanceIntegral, 1.0, minTransmittance));\n\
}\n\
#ifdef SHADOW_LENGTH\n\
    float marchShadowLength(\n\
    const vec3 rayOrigin, const vec3 rayDirection, const vec2 rayNearFar, const float jitter\n\
    ) {\n\
        float shadowLength = 0.0;\n\
        float maxRayDistance = rayNearFar.y - rayNearFar.x;\n\
        float stepSize = minShadowLengthStepSize;\n\
        float rayDistance = stepSize * jitter;\n\
        // 5.31
        // const float attenuationFactor = 1.0 - 1e-3;\n\
        const float attenuationFactor = 1.0 - 5e-4;\n\
        float attenuation = 1.0;\n\
        \n\
        // TODO: This march is closed, and sample resolution can be much lower.\n\
        \n\
        // Refining the termination by binary search will make it much more efficient.\n\
        for (int i = 0; i < maxShadowLengthIterationCount; ++i) {\n\
            if (rayDistance > maxRayDistance) {\n\
                break; // Termination\n\
            }\n\
            vec3 position = rayDistance * rayDirection + rayOrigin;\n\
            float opticalDepth = sampleShadowOpticalDepth(position, 0.0, 0.0, jitter);\n\
            shadowLength += (1.0 - exp(-opticalDepth)) * stepSize * attenuation;\n\
            \n\
            // Hack to prevent over-integration of shadow length. The shadow should be\n\
            \n\
            // attenuated by the inscatter as the ray travels further.\n\
            attenuation *= attenuationFactor;\n\
            if (attenuation < 1e-5) {\n\
                break;\n\
            }\n\
            stepSize *= 1.01; // Keep the shadow ray long enough after refining cloud steps.\n\
            rayDistance += stepSize;\n\
        }\n\
        return shadowLength;\n\
    }\n\
#endif // SHADOW_LENGTH\n\
\n\
#ifdef HAZE\n\
    CloudRayIntervals getLocalHazeIntervals(const vec3 origin, const vec3 direction, const float distance) {
        CloudRayIntervals intervals;
        intervals.count = 0;
        intervals.length = 0.0;
        for (int i = 0; i < 6; ++i) setCloudInterval(intervals, i, vec2(0.0));
        bool firstActive = densityScales.x > 0.0 && shadowLayerMask.x > 0.0 && maxLayerHeights.x > minLayerHeights.x;
        bool secondActive = densityScales.y > 0.0 && shadowLayerMask.y > 0.0 && maxLayerHeights.y > minLayerHeights.y;
        if (!firstActive && !secondActive) return intervals;
        float heightScale = 1.0 / max(hazeExponent, 1e-7);
        for (int region = 0; region < 3; ++region) {
            float lower = 0.0;
            float upper = heightScale * 2.0;
            if (region > 0) {
                int layer = region - 1;
                if (densityScales[layer] <= 0.0 || shadowLayerMask[layer] <= 0.0 || maxLayerHeights[layer] <= minLayerHeights[layer]) continue;
                upper = minLayerHeights[layer];
                lower = max(0.0, upper - heightScale * 2.0);
            }
            if (upper <= lower) continue;
            vec2 outerHits, innerHits;
            if (!cloudSphereHits(origin, direction, bottomRadius + upper, outerHits)) continue;
            if (cloudSphereHits(origin, direction, bottomRadius + lower, innerHits)) {
                appendCloudInterval(intervals, vec2(outerHits.x, innerHits.x), vec2(0.0, distance));
                appendCloudInterval(intervals, vec2(innerHits.y, outerHits.y), vec2(0.0, distance));
            } else {
                appendCloudInterval(intervals, outerHits, vec2(0.0, distance));
            }
        }
        for (int i = 1; i < 6; ++i) {
            if (i >= intervals.count) break;
            vec2 entry = cloudIntervalAt(intervals, i);
            int target = i;
            for (int j = i - 1; j >= 0; --j) {
                vec2 previous = cloudIntervalAt(intervals, j);
                if (previous.x <= entry.x) break;
                setCloudInterval(intervals, j + 1, previous);
                target = j;
            }
            setCloudInterval(intervals, target, entry);
        }
        int mergedCount = 0;
        for (int i = 0; i < 6; ++i) {
            if (i >= intervals.count) break;
            vec2 entry = cloudIntervalAt(intervals, i);
            if (mergedCount > 0) {
                vec2 previous = cloudIntervalAt(intervals, mergedCount - 1);
                if (entry.x <= previous.y) {
                    setCloudInterval(intervals, mergedCount - 1, vec2(previous.x, max(previous.y, entry.y)));
                    continue;
                }
            }
            setCloudInterval(intervals, mergedCount, entry);
            ++mergedCount;
        }
        int count = 0;
        for (int i = 0; i < 6; ++i) {
            if (i >= mergedCount || intervals.length >= hazeVolumeLength) break;
            vec2 entry = cloudIntervalAt(intervals, i);
            entry.y = min(entry.y, entry.x + hazeVolumeLength - intervals.length);
            setCloudInterval(intervals, count, entry);
            intervals.length += entry.y - entry.x;
            ++count;
        }
        intervals.count = count;
        return intervals;
    }
    float localHazeDensity(const vec3 position) {
        float height = max(length(position) - bottomRadius, 0.0);
        bool insideCloudShell = false;
        for (int layer = 0; layer < 3; ++layer) {
            insideCloudShell = insideCloudShell || (densityScales[layer] > 0.0 && height >= minLayerHeights[layer] && height <= maxLayerHeights[layer]);
        }
        float heightScale = 1.0 / max(hazeExponent, 1e-7);
        vec2 uv = getGlobeUv(position);
        vec4 weather = pow(textureLod(localWeatherTexture, uv * localWeatherRepeat + localWeatherOffset, 2.0).LOCAL_WEATHER_CHANNELS, weatherExponents);
        float weight = 0.0;
        for (int layer = 0; layer < 2; ++layer) {
            if (densityScales[layer] <= 0.0 || shadowLayerMask[layer] <= 0.0 || maxLayerHeights[layer] <= minLayerHeights[layer]) continue;
            // The broad weather gate retains sunlit shape gaps instead of masking them with cloud density.
            float gate = smoothstep(max(0.0, 1.0 - coverage - 0.6), max(0.1, 1.0 - coverage - 0.1), weather[layer]);
            float ground = exp(-height * hazeExponent) * (1.0 - smoothstep(heightScale * 1.5, heightScale * 2.0, height));
            float belowBase = minLayerHeights[layer] - height;
            float attached = 0.0;
            if (belowBase > 0.0 && belowBase < heightScale * 2.0) {
                attached = exp(-belowBase * hazeExponent) * smoothstep(0.0, heightScale * 0.15, belowBase) *
                    (1.0 - smoothstep(heightScale * 1.5, heightScale * 2.0, belowBase));
            }
            weight = max(weight, max(ground, attached) * gate);
        }
        if (weight > 0.0 && insideCloudShell) {
            float cameraDistance = length(position - (vCameraPosition - vEllipsoidCenter));
            float lod = log2(max(1.0, cameraDistance * shapeTexelsPerMeterPerPixel));
            WeatherSample cloudWeather = sampleWeather(uv, height, lod);
            if (any(greaterThan(cloudWeather.density, vec4(minDensity)))) {
                // A geometric shell also contains clear air; only actual cloud media suppresses the extra haze.
                MediaSample cloud = sampleMedia(cloudWeather, position, uv, lod, 0.5);
                weight *= 1.0 - smoothstep(0.0, max(minExtinction, 1e-7), cloud.extinction);
            }
        }
        return weight;
    }
    vec4 approximateHaze(\n\
    const vec3 rayOrigin, const vec3 rayDirection, const float maxRayDistance, const float cosTheta, out float hazeDepth\n\
    ) {\n\
        hazeDepth = -1.0;
        float modulation = remapClamped(coverage, 0.2, 0.4);\n\
        if (cameraHeight < 0.0 || modulation <= 0.0 || hazeDensityScale <= 0.0 || maxRayDistance <= 0.0) {\n\
            return vec4(0.0);\n\
        }\n\
        float distance = clamp(maxRayDistance, 0.0, maxShadowLengthRayDistance);
        vec3 skyLight = vGroundIrradiance.sky * RECIPROCAL_PI4 * skyIrradianceScale;
        float hazePhase = henyeyGreenstein(vec2(hazeAnisotropy), cosTheta).x;
        vec3 sunLight = vGroundIrradiance.sun * hazePhase * hazeSunColor * hazeDirectLightScale;
        bool hasSunlight = dot(max(sunLight, vec3(0.0)), vec3(1.0)) > 1e-7;
        vec3 inscatter = vec3(0.0);
        float transmission = 1.0;
        int samples = clamp(hazeSampleCount, 1, 32);
        if (hazeCloudAttached) {
            float cameraOffset = length(rayOrigin - (vCameraPosition - vEllipsoidCenter));
            distance = min(maxRayDistance, max(0.0, hazeViewDistance - cameraOffset));
            CloudRayIntervals intervals = getLocalHazeIntervals(rayOrigin, rayDirection, distance);
            if (intervals.count == 0) return vec4(0.0);
            int segmentIndex = 0;
            int segmentSample = 0;
            int segmentBudget = 1;
            float completedLength = 0.0;
            float depthSum = 0.0;
            float depthWeight = 0.0;
            vec2 segment = intervals.segment0;
            for (int i = 0; i < 32; ++i) {
                if (i >= samples || segmentIndex >= intervals.count) break;
                if (segmentSample == 0) {
                    segment = cloudIntervalAt(intervals, segmentIndex);
                    int available = max(1, samples - i - (intervals.count - segmentIndex - 1));
                    segmentBudget = clamp(int(float(samples - i) * (segment.y - segment.x) / max(intervals.length - completedLength, 1.0)), 1, available);
                }
                float t0 = float(segmentSample) / float(segmentBudget);
                float t1 = float(segmentSample + 1) / float(segmentBudget);
                float start = mix(segment.x, segment.y, t0 * t0);
                float end = mix(segment.x, segment.y, t1 * t1);
                float rayDistance = (start + end) * 0.5;
                float volumeDistance = completedLength + rayDistance - segment.x;
                ++segmentSample;
                if (segmentSample >= segmentBudget) {
                    completedLength += segment.y - segment.x;
                    ++segmentIndex;
                    segmentSample = 0;
                }
                vec3 position = rayOrigin + rayDirection * rayDistance;
                float viewFalloff = 1.0 - smoothstep(hazeViewDistance * 0.75, hazeViewDistance, cameraOffset + rayDistance);
                float volumeFalloff = 1.0 - smoothstep(hazeVolumeLength * 0.8, hazeVolumeLength, volumeDistance);
                float density = modulation * hazeDensityScale * localHazeDensity(position) * viewFalloff * volumeFalloff;
                float opacity = 1.0 - exp(-density * (end - start));
                if (opacity <= 0.0) continue;
                float sunlight = hasSunlight ? sampleHazeSunlight(position) : 1.0;
                float contribution = transmission * opacity;
                // Cloud-shadow leakage must not become a uniform direct-light fog floor.
                float directVisibility = smoothstep(0.1, 0.9, sunlight);
                inscatter += contribution * (skyLight * 0.02 + sunLight * directVisibility);
                depthSum += contribution * rayDistance;
                depthWeight += contribution;
                transmission *= 1.0 - opacity;
                if (transmission < 0.01) break;
            }
            if (depthWeight > 0.0) hazeDepth = depthSum / depthWeight;
            inscatter *= hazeScatteringCoefficient / max(hazeAbsorptionCoefficient + hazeScatteringCoefficient, 1e-7);
            return vec4(inscatter, 1.0 - transmission);
        }
        for (int i = 0; i < 32; ++i) {
            if (i >= samples) break;
            float t0 = float(i) / float(samples);
            float t1 = float(i + 1) / float(samples);
            // Anchor the grid and density falloff to the light range, not each foreground depth.
            float start = maxShadowLengthRayDistance * t0 * t0;
            if (start >= distance) break;
            float end = min(distance, maxShadowLengthRayDistance * t1 * t1);
            vec3 position = rayOrigin + rayDirection * (start + end) * 0.5;
            float height = max(length(position) - bottomRadius, 0.0);
            float falloff = 1.0 - smoothstep(maxShadowLengthRayDistance * 0.5, maxShadowLengthRayDistance, (start + end) * 0.5);
            float density = modulation * hazeDensityScale * exp(-height * hazeExponent) * falloff;
            float opacity = 1.0 - exp(-density * (end - start));
            if (opacity <= 0.0) continue;
            float sunlight = hasSunlight ? sampleHazeSunlight(position) : 1.0;
            inscatter += transmission * opacity * (skyLight * 0.1 + sunLight * sunlight);
            transmission *= 1.0 - opacity;
            if (transmission < 0.01) break;
        }
        inscatter *= hazeScatteringCoefficient / max(hazeAbsorptionCoefficient + hazeScatteringCoefficient, 1e-7);
        return vec4(inscatter, 1.0 - transmission);
        // end
        // Analytical optical depth where density exponentially decreases with height.\n\
        // Based on: https://iquilezles.org/articles/fog/\n\
        // float angle = max(dot(normalize(rayOrigin), rayDirection), 1e-5);\n\
        // float exponent = angle * hazeExponent;\n\
        // // Derive the optical depths separately for with and without shadow length.\n\
        // \n\
        // float expTerm = 1.0 - exp(-maxRayDistance * exponent);\n\
        // float shadowExpTerm = 1.0 - exp(-min(maxRayDistance, shadowLength) * exponent);\n\
        // float linearTerm = density / hazeExponent / angle;\n\
        // float opticalDepth = expTerm * linearTerm;\n\
        // float effectiveOpticalDepth = max((expTerm - shadowExpTerm) * linearTerm, 0.0);\n\
        // vec3 skyIrradiance = vGroundIrradiance.sky;\n\
        // vec3 sunIrradiance = vGroundIrradiance.sun;\n\
        // vec3 irradiance = sunIrradiance * phaseFunction(cosTheta);\n\
        // irradiance += skyIrradiance * RECIPROCAL_PI4 * skyIrradianceScale;\n\
        // vec3 inscatter = albedo * irradiance * saturate(1.0 - exp(-effectiveOpticalDepth));\n\
        // \n\
        // // Inscatter is attenuated by shadow length, but transmittance is not.\n\
        // \n\
        // return vec4(inscatter, saturate(1.0 - exp(-opticalDepth)));\n\
    }\n\
#endif // HAZE\n\
void applyAerialPerspective(\n\
const vec3 cameraPosition, const vec3 frontPosition, const float shadowLength, inout vec4 color\n\
) {\n\
    vec3 transmittance;\n\
    vec3 inscatter = GetSkyRadianceToPoint(\n\
    cameraPosition * METER_TO_LENGTH_UNIT, frontPosition * METER_TO_LENGTH_UNIT, shadowLength * METER_TO_LENGTH_UNIT, sunDirection, transmittance\n\
    );\n\
    // 6.2
    // float clampedAlpha = max(color.a, 1e-7);\n\
    // color.rgb = mix(vec3(0.0), color.rgb * transmittance / clampedAlpha + inscatter, color.a);\n\
    color.rgb = color.rgb * transmittance + inscatter * color.a;\n\
}\n\
bool rayIntersectsGround(const vec3 cameraPosition, const vec3 rayDirection) {\n\
    float r = length(cameraPosition);\n\
    float mu = dot(cameraPosition, rayDirection) / r;\n\
    return mu < 0.0 && r * r * (mu * mu - 1.0) + bottomRadius * bottomRadius >= 0.0;\n\
}\n\
struct IntersectionResult {\n\
    bool ground;\n\
    vec4 first;\n\
    vec4 second;\n\
};\n\
IntersectionResult getIntersections(const vec3 cameraPosition, const vec3 rayDirection) {\n\
    IntersectionResult intersections;\n\
    intersections.ground = rayIntersectsGround(cameraPosition, rayDirection);\n\
    raySphereIntersections(\n\
    cameraPosition, rayDirection, bottomRadius + vec4(0.0, minHeight, maxHeight, shadowTopHeight), intersections.first, intersections.second\n\
    );\n\
    return intersections;\n\
}\n\
vec2 getRayNearFar(const IntersectionResult intersections) {\n\
    vec2 nearFar;\n\
    if (cameraHeight < minHeight) {\n\
        // View below the clouds\n\
        if (intersections.ground) {\n\
            nearFar = vec2(-1.0); // No clouds to the ground\n\
        }\n\
        else {\n\
            nearFar = vec2(intersections.second.y, intersections.second.z);\n\
        }\n\
\n\
    }\n\
    else if (cameraHeight < maxHeight) {\n\
        // View inside the total cloud layer\n\
        if (intersections.ground) {\n\
            nearFar = vec2(cameraNear, intersections.first.y);\n\
        }\n\
        else {\n\
            nearFar = vec2(cameraNear, intersections.second.z);\n\
        }\n\
\n\
    }\n\
    else {\n\
        // View above the clouds\n\
        nearFar = vec2(intersections.first.z, intersections.second.z);\n\
        if (intersections.ground) {\n\
            // Clamp the ray at the min height.\n\
            nearFar.y = intersections.first.y;\n\
        }\n\
\n\
    }\n\
    nearFar.y = min(nearFar.y, maxRayDistance);\n\
    return nearFar;\n\
}\n\
#ifdef SHADOW_LENGTH\n\
    vec2 getShadowRayNearFar(const IntersectionResult intersections) {\n\
        vec2 nearFar;\n\
        if (cameraHeight < shadowTopHeight) {\n\
            if (intersections.ground) {\n\
                nearFar = vec2(cameraNear, intersections.first.x);\n\
            }\n\
            else {\n\
                nearFar = vec2(cameraNear, intersections.second.w);\n\
            }\n\
    \n\
        }\n\
        else {\n\
            nearFar = vec2(intersections.first.w, intersections.second.w);\n\
            if (intersections.ground) {\n\
                // Clamp the ray at the ground.\n\
                nearFar.y = intersections.first.x;\n\
            }\n\
    \n\
        }\n\
        nearFar.y = min(nearFar.y, maxShadowLengthRayDistance);\n\
        return nearFar;\n\
    }\n\
#endif // SHADOW_LENGTH\n\
\n\
#ifdef HAZE\n\
    vec2 getHazeRayNearFar(const IntersectionResult intersections) {\n\
        vec2 nearFar;\n\
        if (cameraHeight < maxHeight) {\n\
            if (intersections.ground) {\n\
                nearFar = vec2(cameraNear, intersections.first.x);\n\
            }\n\
            else {\n\
                nearFar = vec2(cameraNear, intersections.second.z);\n\
            }\n\
    \n\
        }\n\
        else {\n\
            nearFar = vec2(cameraNear, intersections.second.z);\n\
            if (intersections.ground) {\n\
                // Clamp the ray at the ground.\n\
                nearFar.y = intersections.first.x;\n\
            }\n\
    \n\
        }\n\
        return nearFar;\n\
    }\n\
#endif // HAZE\n\
float getRayDistanceToScene(const vec3 rayDirection) {\n\
    float depth = readDepth(vUv * targetUvScale + temporalJitter);\n\
    if (depth < 1.0 - 1e-7) {\n\
        depth = czm_reverseLogDepth(depth);\n\
        float viewZ = getViewZ(depth);\n\
        return -viewZ / dot(rayDirection, vCameraDirection);\n\
    }\n\
    return -1.0;\n\
}\n\
void main() {\n\
    #ifdef DEBUG_SHOW_SHADOW_MAP\n\
        outputColor = getCascadedShadowMaps(vUv);\n\
        outputDepthVelocity = vec4(0.0);\n\
        #ifdef SHADOW_LENGTH\n\
            outputShadowLength = 0.0;\n\
        #endif // SHADOW_LENGTH\n\
        return;\n\
    #endif // DEBUG_SHOW_SHADOW_MAP\n\
    \n\
    vec3 cameraPosition = vCameraPosition - vEllipsoidCenter;\n\
    vec3 rayDirection = normalize(vRayDirection);\n\
    float cosTheta = dot(sunDirection, rayDirection);\n\
    IntersectionResult intersections = getIntersections(cameraPosition, rayDirection);\n\
    vec2 rayNearFar = getRayNearFar(intersections);\n\
    #ifdef SHADOW_LENGTH\n\
        vec2 shadowRayNearFar = getShadowRayNearFar(intersections);\n\
    #endif // SHADOW_LENGTH\n\
    #ifdef HAZE\n\
        vec2 hazeRayNearFar = getHazeRayNearFar(intersections);\n\
    #endif // HAZE\n\
    \n\
    float rayDistanceToScene = getRayDistanceToScene(rayDirection);\n\
    if (rayDistanceToScene >= 0.0) {\n\
        rayNearFar.y = min(rayNearFar.y, rayDistanceToScene);\n\
        #ifdef SHADOW_LENGTH\n\
            shadowRayNearFar.y = min(shadowRayNearFar.y, rayDistanceToScene);\n\
        #endif // SHADOW_LENGTH\n\
        #ifdef HAZE\n\
            hazeRayNearFar.y = min(hazeRayNearFar.y, rayDistanceToScene);\n\
        #endif // HAZE\n\
    }\n\
    bool intersectsGround = any(lessThan(rayNearFar, vec2(0.0)));\n\
    bool intersectsScene = rayNearFar.y < rayNearFar.x;\n\
    float stbn = getSTBN();\n\
    vec4 color = vec4(0.0);\n\
    float frontDepth = rayNearFar.y;\n\
    vec4 depthVelocity = vec4(0.0);\n\
    float shadowLength = 0.0;\n\
    if (!intersectsGround && !intersectsScene) {\n\
        vec3 rayOrigin = rayNearFar.x * rayDirection + cameraPosition;\n\
        vec2 globeUv = getGlobeUv(rayOrigin);\n\
        #ifdef DEBUG_SHOW_UV\n\
            outputColor = vec4(vec3(checker(globeUv, localWeatherRepeat + localWeatherOffset)), 1.0);\n\
            outputDepthVelocity = vec4(0.0);\n\
            #ifdef SHADOW_LENGTH\n\
                outputShadowLength = 0.0;\n\
            #endif // SHADOW_LENGTH\n\
            return;\n\
        #endif // DEBUG_SHOW_UV\n\
        \n\
        float mipLevel = getMipLevel(globeUv * localWeatherRepeat) * mipLevelScale;\n\
        mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));\n\
        float marchedFrontDepth;\n\
        ivec3 sampleCount = ivec3(0);\n\
        vec4 traceStats;
        color = marchClouds(\n\
        rayOrigin, rayDirection, rayNearFar, cosTheta, mix(stbn, 0.5, smoothstep(25000.0, 100000.0, rayNearFar.x)), pow(2.0, mipLevel), marchedFrontDepth, sampleCount, traceStats\n\
        );\n\
        #ifdef DEBUG_SHOW_SAMPLE_COUNT\n\
            outputColor = vec4(vec3(sampleCount) / vec3(2048.0, 8192.0, 2048.0), 1.0);\n\
            outputDepthVelocity = traceStats;\n\
            #ifdef SHADOW_LENGTH\n\
                outputShadowLength = 0.0;\n\
            #endif // SHADOW_LENGTH\n\
            return;\n\
        #endif // DEBUG_SHOW_SAMPLE_COUNT\n\
        \n\
        // Front depth will be -1.0 when no samples are accumulated.\n\
        if (marchedFrontDepth >= 0.0) {\n\
            frontDepth = rayNearFar.x + marchedFrontDepth;\n\
            #ifdef SHADOW_LENGTH\n\
                // Clamp the shadow length ray at the clouds.\n\
                shadowRayNearFar.y = mix(\n\
                shadowRayNearFar.y, min(frontDepth, shadowRayNearFar.y), color.a // Interpolate by the alpha for smoother edges.\n\
                );\n\
            #endif // SHADOW_LENGTH\n\
            \n\
            #ifdef HAZE\n\
                // Clamp the haze ray at the clouds.\n\
                hazeRayNearFar.y = mix(\n\
                hazeRayNearFar.y, min(frontDepth, hazeRayNearFar.y), color.a // Interpolate by the alpha for smoother edges.\n\
                );\n\
            #endif // HAZE\n\
        }\n\
        #ifdef SHADOW_LENGTH\n\
            if (all(greaterThanEqual(shadowRayNearFar, vec2(0.0)))) {\n\
                shadowLength = marchShadowLength(\n\
                shadowRayNearFar.x * rayDirection + cameraPosition, rayDirection, shadowRayNearFar, stbn\n\
                );\n\
            }\n\
        #endif // SHADOW_LENGTH\n\
        // Apply aerial perspective.\n\
        vec3 frontPosition = cameraPosition + frontDepth * rayDirection;\n\
        applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color);\n\
        \n\
        // Velocity for temporal resolution.\n\
        \n\
        vec3 frontPositionWorld = ECEFToWorld(frontPosition);\n\
        vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);\n\
        prevClip /= prevClip.w;\n\
        vec2 prevUv = prevClip.xy * 0.5 + 0.5;\n\
        vec2 velocity = (vUv * targetUvScale - prevUv) * resolution;\n\
        float previousDepth = length(frontPositionWorld - previousCameraPosition);\n\
        depthVelocity = vec4(frontDepth, velocity, previousDepth);\n\
    }\n\
    else {\n\
        #ifdef SHADOW_LENGTH\n\
            if (all(greaterThanEqual(shadowRayNearFar, vec2(0.0)))) {\n\
                shadowLength = marchShadowLength(\n\
                shadowRayNearFar.x * rayDirection + cameraPosition, rayDirection, shadowRayNearFar, stbn\n\
                );\n\
            }\n\
        #endif // SHADOW_LENGTH\n\
        // TODO: We can calculate velocity to reduce occlusion errors at the edges, // but suffers from floating-point precision errors on near objects.\n\
        \n\
        // if (intersectsScene) {\n\
        //   vec3 frontPosition = cameraPosition + rayNearFar.y * rayDirection;\n\
        //   vec3 frontPositionWorld = ECEFToWorld(frontPosition);\n\
        //   vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);\n\
        //   prevClip /= prevClip.w;\n\
        //   vec2 prevUv = prevClip.xy * 0.5 + 0.5;\n\
        //   vec2 velocity = (vUv - prevUv) * resolution;\n\
        //   depthVelocity = vec3(rayNearFar.y, velocity);\n\
        // }\n\
    }\n\
    #ifdef DEBUG_SHOW_FRONT_DEPTH\n\
        outputColor = vec4(turbo(frontDepth / maxRayDistance), 1.0);\n\
        outputDepthVelocity = vec4(0.0);\n\
        #ifdef SHADOW_LENGTH\n\
            outputShadowLength = 0.0;\n\
        #endif // SHADOW_LENGTH\n\
        return;\n\
    #endif // DEBUG_SHOW_FRONT_DEPTH\n\
    \n\
    #ifdef HAZE\n\
        float hazeDepth;
        float hazeNear = max(cameraNear, hazeRayNearFar.x);
        vec4 haze = approximateHaze(\n\
        hazeNear * rayDirection + cameraPosition, rayDirection, hazeRayNearFar.y - hazeNear, cosTheta, hazeDepth\n\
        );\n\
        if (hazeCloudAttached && hazeDepth >= 0.0 && color.a <= 0.0) {
            vec3 hazePositionWorld = ECEFToWorld(cameraPosition + (hazeNear + hazeDepth) * rayDirection);
            vec4 prevClip = reprojectionMatrix * vec4(hazePositionWorld, 1.0);
            if (prevClip.w > 0.0) {
                vec2 prevUv = prevClip.xy / prevClip.w * 0.5 + 0.5;
                vec2 velocity = (vUv * targetUvScale - prevUv) * resolution;
                depthVelocity = vec4(hazeNear + hazeDepth, velocity, length(hazePositionWorld - previousCameraPosition));
            }
        }
        // 6.2
        // color = color * (1.0 - haze.a) + haze;\n\
        // Haze radiance already contains its scattering integral (premultiplied).\n\
        color.rgb = color.rgb * (1.0 - haze.a) + haze.rgb;\n\
        color.a = color.a * (1.0 - haze.a) + haze.a;\n\
    #endif // HAZE\n\
    \n\
    outputColor = color;\n\
    outputDepthVelocity = depthVelocity;\n\
    #ifdef SHADOW_LENGTH\n\
        outputShadowLength = shadowLength * METER_TO_LENGTH_UNIT;\n\
    #endif // SHADOW_LENGTH\n\
}\n\
`;
export const cloudsResolveMaterialVS = `
#version 300 es\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME CloudsResolveMaterial\n\
#define TEMPORAL_UPSCALE 1\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
precision highp float;\n\
layout(location = 0) in vec3 position;\n\
out vec2 vUv;\n\
void main() {\n\
    vUv = position.xy * 0.5 + 0.5;\n\
    gl_Position = vec4(position.xy, 1.0, 1.0);\n\
}\n\
`;
export const cloudsResolveMaterialFS = `
#version 300 es\n\
#define SHADER_TYPE RawShaderMaterial\n\
#define SHADER_NAME CloudsResolveMaterial\n\
#define TEMPORAL_UPSCALE 1\n\
#define FRAMEBUFFER_PRECISION_HIGH 1\n\
#define SHADOW_LENGTH 1\n\
precision highp float;\n\
precision highp sampler2DArray;\n\
\n\
// A fifth-order polynomial approximation of Turbo color map.\n\
\n\
// See: https://observablehq.com/@mbostock/turbo\n\
// prettier-ignore\n\
vec3 turbo(const float x) {\n\
    float r = 0.1357 + x * (4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375))));\n\
    float g = 0.0914 + x * (2.1856 + x * (4.8052 - x * (14.0195 - x * (4.2109 + x * 2.7747))));\n\
    float b = 0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * (88.5066 - x * 26.8183))));\n\
    return vec3(r, g, b);\n\
}\n\
// Taken from https://gist.github.com/TheRealMJP/c83b8c0f46b63f3a88a5986f4fa982b1\n\
// TODO: Use 5-taps version: https://www.shadertoy.com/view/MtVGWz\n\
// Or even 4 taps (requires preprocessing in the input buffer):\n\
// https://www.shadertoy.com/view/4tyGDD\n\
\n\
/**\n\
* MIT License\n\
*\n\
* Copyright (c) 2019 MJP\n\
*\n\
* Permission is hereby granted, free of charge, to any person obtaining a copy\n\
* of this software and associated documentation files (the "Software"), to deal\n\
* in the Software without restriction, including without limitation the rights\n\
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n\
* copies of the Software, and to permit persons to whom the Software is\n\
* furnished to do so, subject to the following conditions:\n\
*\n\
* The above copyright notice and this permission notice shall be included in all\n\
* copies or substantial portions of the Software.\n\
*\n\
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n\
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n\
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n\
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n\
* SOFTWARE.\n\
*/\n\
\n\
vec4 textureCatmullRom(sampler2D tex, vec2 uv) {\n\
    vec2 texSize = vec2(textureSize(tex, 0));\n\
    \n\
    // We're going to sample a a 4x4 grid of texels surrounding the target UV\n\
    \n\
    // coordinate. We'll do this by rounding down the sample location to get the\n\
    // exact center of our "starting" texel. The starting texel will be at\n\
    // location [1, 1] in the grid, where [0, 0] is the top left corner.\n\
    vec2 samplePos = uv * texSize;\n\
    vec2 texPos1 = floor(samplePos - 0.5) + 0.5;\n\
    \n\
    // Compute the fractional offset from our starting texel to our original\n\
    \n\
    // sample location, which we'll feed into the Catmull-Rom spline function to\n\
    // get our filter weights.\n\
    vec2 f = samplePos - texPos1;\n\
    \n\
    // Compute the Catmull-Rom weights using the fractional offset that we\n\
    \n\
    // calculated earlier. These equations are pre-expanded based on our knowledge\n\
    // of where the texels will be located, which lets us avoid having to evaluate\n\
    // a piece-wise function.\n\
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));\n\
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);\n\
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));\n\
    vec2 w3 = f * f * (-0.5 + 0.5 * f);\n\
    \n\
    // Work out weighting factors and sampling offsets that will let us use\n\
    \n\
    // bilinear filtering to simultaneously evaluate the middle 2 samples from the\n\
    // 4x4 grid.\n\
    vec2 w12 = w1 + w2;\n\
    vec2 offset12 = w2 / (w1 + w2);\n\
    \n\
    // Compute the final UV coordinates we'll use for sampling the texture\n\
    \n\
    vec2 texPos0 = texPos1 - 1.0;\n\
    vec2 texPos3 = texPos1 + 2.0;\n\
    vec2 texPos12 = texPos1 + offset12;\n\
    texPos0 /= texSize;\n\
    texPos3 /= texSize;\n\
    texPos12 /= texSize;\n\
    vec4 result = vec4(0.0);\n\
    result += texture(tex, vec2(texPos0.x, texPos0.y)) * w0.x * w0.y;\n\
    result += texture(tex, vec2(texPos12.x, texPos0.y)) * w12.x * w0.y;\n\
    result += texture(tex, vec2(texPos3.x, texPos0.y)) * w3.x * w0.y;\n\
    result += texture(tex, vec2(texPos0.x, texPos12.y)) * w0.x * w12.y;\n\
    result += texture(tex, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;\n\
    result += texture(tex, vec2(texPos3.x, texPos12.y)) * w3.x * w12.y;\n\
    result += texture(tex, vec2(texPos0.x, texPos3.y)) * w0.x * w3.y;\n\
    result += texture(tex, vec2(texPos12.x, texPos3.y)) * w12.x * w3.y;\n\
    result += texture(tex, vec2(texPos3.x, texPos3.y)) * w3.x * w3.y;\n\
    return result;\n\
}\n\
vec4 textureCatmullRom(sampler2DArray tex, vec3 uv) {\n\
    vec2 texSize = vec2(textureSize(tex, 0));\n\
    vec2 samplePos = uv.xy * texSize;\n\
    vec2 texPos1 = floor(samplePos - 0.5) + 0.5;\n\
    vec2 f = samplePos - texPos1;\n\
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));\n\
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);\n\
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));\n\
    vec2 w3 = f * f * (-0.5 + 0.5 * f);\n\
    vec2 w12 = w1 + w2;\n\
    vec2 offset12 = w2 / (w1 + w2);\n\
    vec2 texPos0 = texPos1 - 1.0;\n\
    vec2 texPos3 = texPos1 + 2.0;\n\
    vec2 texPos12 = texPos1 + offset12;\n\
    texPos0 /= texSize;\n\
    texPos3 /= texSize;\n\
    texPos12 /= texSize;\n\
    vec4 result = vec4(0.0);\n\
    result += texture(tex, vec3(texPos0.x, texPos0.y, uv.z)) * w0.x * w0.y;\n\
    result += texture(tex, vec3(texPos12.x, texPos0.y, uv.z)) * w12.x * w0.y;\n\
    result += texture(tex, vec3(texPos3.x, texPos0.y, uv.z)) * w3.x * w0.y;\n\
    result += texture(tex, vec3(texPos0.x, texPos12.y, uv.z)) * w0.x * w12.y;\n\
    result += texture(tex, vec3(texPos12.x, texPos12.y, uv.z)) * w12.x * w12.y;\n\
    result += texture(tex, vec3(texPos3.x, texPos12.y, uv.z)) * w3.x * w12.y;\n\
    result += texture(tex, vec3(texPos0.x, texPos3.y, uv.z)) * w0.x * w3.y;\n\
    result += texture(tex, vec3(texPos12.x, texPos3.y, uv.z)) * w12.x * w3.y;\n\
    result += texture(tex, vec3(texPos3.x, texPos3.y, uv.z)) * w3.x * w3.y;\n\
    return result;\n\
}\n\
#ifdef VARIANCE_9_SAMPLES\n\
    #define VARIANCE_OFFSET_COUNT (8)\n\
    const ivec2 varianceOffsets[8] = ivec2[8](\n\
    ivec2(-1, -1), ivec2(-1, 1), ivec2(1, -1), ivec2(1, 1), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0)\n\
    );\n\
#else // VARIANCE_9_SAMPLES\n\
    #define VARIANCE_OFFSET_COUNT (4)\n\
    const ivec2 varianceOffsets[4] = ivec2[4](ivec2(1, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0));\n\
#endif // VARIANCE_9_SAMPLES\n\
\n\
// Reference: https://github.com/playdeadgames/temporal\n\
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {\n\
    // Opacity must be clipped too, otherwise old silhouettes survive RGB clipping.\n\
    vec4 pClip = 0.5 * (maxColor + minColor);\n\
    vec4 eClip = 0.5 * (maxColor - minColor) + 1e-7;\n\
    vec4 vClip = history - pClip;\n\
    vec4 aUnit = abs(vClip / eClip);\n\
    float maUnit = max(max(aUnit.x, aUnit.y), max(aUnit.z, aUnit.w));\n\
    if (maUnit > 1.0) {\n\
        return pClip + vClip / maUnit;\n\
    }\n\
    return history;\n\
}\n\
#ifdef VARIANCE_SAMPLER_ARRAY\n\
    #define VARIANCE_SAMPLER sampler2DArray\n\
    #define VARIANCE_SAMPLER_COORD ivec3\n\
#else // VARIANCE_SAMPLER_ARRAY\n\
    #define VARIANCE_SAMPLER sampler2D\n\
    #define VARIANCE_SAMPLER_COORD ivec2\n\
#endif // VARIANCE_SAMPLER_ARRAY\n\
// Variance clipping\n\
// Reference: https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf\n\
vec4 varianceClipping(\n\
const VARIANCE_SAMPLER inputBuffer, const VARIANCE_SAMPLER_COORD coord, const vec4 current, const vec4 history, const float gamma\n\
) {\n\
    vec4 moment1 = current;\n\
    vec4 moment2 = current * current;\n\
    vec4 neighbor;\n\
    #if 0 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[0]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 0 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 1 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[1]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 1 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 2 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[2]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 2 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 3 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[3]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 3 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 4 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[4]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 4 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 5 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[5]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 5 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 6 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[6]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 6 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 7 < VARIANCE_OFFSET_COUNT\n\
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[7]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 7 < VARIANCE_OFFSET_COUNT\n\
    \n\
    \n\
    const float N = float(VARIANCE_OFFSET_COUNT + 1);\n\
    vec4 mean = moment1 / N;\n\
    vec4 varianceGamma = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;\n\
    vec4 minColor = mean - varianceGamma;\n\
    vec4 maxColor = mean + varianceGamma;\n\
    return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);\n\
}\n\
vec4 varianceClipping(\n\
const VARIANCE_SAMPLER inputBuffer, const VARIANCE_SAMPLER_COORD coord, const vec4 current, const vec4 history\n\
) {\n\
    return varianceClipping(inputBuffer, coord, current, history, 1.0);\n\
}\n\
vec4 varianceClipping(\n\
const sampler2D inputBuffer, const vec2 coord, const vec4 current, const vec4 history, const float gamma\n\
) {\n\
    vec4 moment1 = current;\n\
    vec4 moment2 = current * current;\n\
    vec4 neighbor;\n\
    #if 0 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[0]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 0 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 1 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[1]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 1 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 2 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[2]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 2 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 3 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[3]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 3 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 4 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[4]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 4 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 5 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[5]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 5 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 6 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[6]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 6 < VARIANCE_OFFSET_COUNT\n\
    \n\
    #if 7 < VARIANCE_OFFSET_COUNT\n\
        neighbor = textureOffset(inputBuffer, coord, varianceOffsets[7]);\n\
        moment1 += neighbor;\n\
        moment2 += neighbor * neighbor;\n\
    #endif // 7 < VARIANCE_OFFSET_COUNT\n\
    \n\
    \n\
    const float N = float(VARIANCE_OFFSET_COUNT + 1);\n\
    vec4 mean = moment1 / N;\n\
    vec4 varianceGamma = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;\n\
    vec4 minColor = mean - varianceGamma;\n\
    vec4 maxColor = mean + varianceGamma;\n\
    return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);\n\
}\n\
vec4 varianceClipping(\n\
const sampler2D inputBuffer, const vec2 coord, const vec4 current, const vec4 history\n\
) {\n\
    return varianceClipping(inputBuffer, coord, current, history, 1.0);\n\
}\n\
uniform sampler2D colorBuffer;\n\
uniform sampler2D depthVelocityBuffer;\n\
uniform sampler2D colorHistoryBuffer;\n\
#ifdef SHADOW_LENGTH\n\
    uniform sampler2D shadowLengthBuffer;\n\
    uniform sampler2D shadowLengthHistoryBuffer;\n\
#endif // SHADOW_LENGTH\n\
\n\
uniform vec2 texelSize;\n\
uniform int frame;\n\
uniform float varianceGamma;\n\
uniform float temporalAlpha;\n\
uniform float currentFrameAlpha;\n\
uniform float spatialFilterStrength;\n\
uniform bool historyValid;
uniform bool cameraMoving;\n\
uniform int historyFrames;\n\
uniform sampler2D depthHistoryBuffer;
uniform sampler2D sceneDepthBuffer;\n\
uniform vec2 previousJitterOffset;\n\
uniform vec2 targetUvScale;\n\
uniform vec2 jitterOffset;\n\
in vec2 vUv;\n\
layout(location = 0) out vec4 outputColor;\n\
#ifdef SHADOW_LENGTH\n\
    layout(location = 1) out float outputShadowLength;\n\
#endif // SHADOW_LENGTH\n\
\n\
const ivec2 neighborOffsets[9] = ivec2[9](\n\
ivec2(-1, -1), ivec2(-1, 0), ivec2(-1, 1), ivec2(0, -1), ivec2(0, 0), ivec2(0, 1), ivec2(1, -1), ivec2(1, 0), ivec2(1, 1)\n\
);\n\
const ivec4[4] bayerIndices = ivec4[4](\n\
ivec4(0, 12, 3, 15), ivec4(8, 4, 11, 7), ivec4(2, 14, 1, 13), ivec4(10, 6, 9, 5)\n\
);\n\
vec2 getUnjitteredUv(ivec2 coord) {\n\
    return (vec2(coord) + 0.5 - jitterOffset) * texelSize / targetUvScale;\n\
}\n\
vec4 getClosestFragment(const vec2 uv) {\n\
    ivec2 size = textureSize(depthVelocityBuffer, 0);\n\
    ivec2 coord = ivec2(uv * vec2(size));\n\
    vec4 result = vec4(0.0);\n\
    for (int i = 0; i < 9; ++i) {\n\
        ivec2 sampleCoord = clamp(coord + neighborOffsets[i], ivec2(0), size - 1);\n\
        vec4 neighbor = texelFetch(depthVelocityBuffer, sampleCoord, 0);\n\
        if (neighbor.r > 0.0 && neighbor.r < 1e7 &&\n\
            (result.r <= 0.0 || neighbor.r < result.r)) {\n\
            result = neighbor;\n\
        }\n\
    }\n\
    return result;\n\
}\n\
vec4 getClosestFragment(const ivec2 coord) {\n\
    return getClosestFragment((vec2(coord) + 0.5) / vec2(textureSize(depthVelocityBuffer, 0)));\n\
}\n\
vec4 reconstructCloud(const vec2 uv, out float centerDepth) {\n\
    ivec2 size = textureSize(colorBuffer, 0);\n\
    ivec2 coord = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);\n\
    vec4 center = texelFetch(colorBuffer, coord, 0);\n\
    centerDepth = texelFetch(depthVelocityBuffer, coord, 0).r;\n\
    if (!(centerDepth > 0.0 && centerDepth < 1e7)) return texture(colorBuffer, uv);\n\
    vec4 current = texture(colorBuffer, uv);\n\
    if (spatialFilterStrength <= 0.0 || center.a < 0.01) return current;\n\
    float distanceWeight = smoothstep(5000.0, 25000.0, centerDepth);\n\
    vec4 sum = current * 2.0;\n\
    float weightSum = 2.0;\n\
    for (int i = 0; i < 9; ++i) {\n\
        ivec2 offset = neighborOffsets[i];\n\
        if (all(equal(offset, ivec2(0)))) continue;\n\
        bool diagonal = offset.x != 0 && offset.y != 0;\n\
        if (diagonal && distanceWeight <= 0.0) continue;\n\
        ivec2 sampleCoord = clamp(coord + offset, ivec2(0), size - 1);\n\
        float depth = texelFetch(depthVelocityBuffer, sampleCoord, 0).r;\n\
        if (!(depth > 0.0 && depth < 1e7)) continue;\n\
        vec4 neighbor = texelFetch(colorBuffer, sampleCoord, 0);\n\
        float depthDelta = abs(depth - centerDepth) / max(centerDepth, 1.0);\n\
        float alphaDelta = abs(neighbor.a - center.a);\n\
        float weight = (1.0 - smoothstep(0.02, 0.1, depthDelta)) *\n\
            (1.0 - smoothstep(0.05, 0.2, alphaDelta));\n\
        weight *= diagonal ? 0.5 * distanceWeight : 1.0;\n\
        sum += neighbor * weight;\n\
        weightSum += weight;\n\
    }\n\
    float strength = mix(spatialFilterStrength, max(spatialFilterStrength, 0.9), distanceWeight) *\n\
        smoothstep(0.01, 0.1, center.a);\n\
    return mix(current, sum / weightSum, strength);\n\
}\n\
// Resolve terrain silhouettes with full-resolution depth, never interpolate sky across a ridge.
float terrainDistance(vec2 uv) {
    float depth = czm_unpackDepth(texture(sceneDepthBuffer, uv));
    if (depth >= 1.0 - 1e-7) return 1e10;
    vec4 eye = czm_windowToEyeCoordinates(uv / texelSize, depth);
    return length(eye.xyz / eye.w);
}
float getHistoryCloudDepth(vec2 uv) {
    ivec2 size = textureSize(depthHistoryBuffer, 0);
    vec2 historyUv = (uv - previousJitterOffset * texelSize) / targetUvScale;
    ivec2 coord = clamp(ivec2(historyUv * vec2(size)), ivec2(0), size - 1);
    return texelFetch(depthHistoryBuffer, coord, 0).r;
}
bool resolveTerrainBoundary(vec2 uv, inout vec4 color, inout float cloudDepth, out float targetDepth) {
    ivec2 size = textureSize(colorBuffer, 0);
    ivec2 center = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
    targetDepth = terrainDistance(vUv);
    vec4 sum = vec4(0.0);
    float total = 0.0;
    float nearestCloud = 1e10;
    bool boundary = false;
    for (int i = 0; i < 9; ++i) {
        ivec2 coord = clamp(center + neighborOffsets[i], ivec2(0), size - 1);
        vec2 sampleUv = (vec2(coord) + 0.5) / vec2(size) * targetUvScale + jitterOffset * texelSize;
        float sampleDepth = terrainDistance(sampleUv);
        float depth = texelFetch(depthVelocityBuffer, coord, 0).r;
        bool foregroundCloud = depth > 0.0 && depth < 1e7 && depth < min(sampleDepth, targetDepth);
        bool differentSurface = (sampleDepth > 1e9) != (targetDepth > 1e9);
        float delta = abs(sampleDepth - targetDepth) / max(targetDepth, 1.0);
        bool occluded = depth > targetDepth + max(20.0, targetDepth * 0.002);
        boundary = boundary || (!foregroundCloud && (differentSurface || occluded));
        float weight = foregroundCloud ? 1.0 : (1.0 - smoothstep(0.02, 0.05, delta));
        vec2 offset = (sampleUv - vUv) / (texelSize * 4.0);
        weight *= exp(-dot(offset, offset) * 2.0);
        if (occluded) weight = 0.0;
        sum += texelFetch(colorBuffer, coord, 0) * weight;
        total += weight;
        if (weight > 0.01 && depth > 0.0) nearestCloud = min(nearestCloud, depth);
    }
    if (boundary) {
        color = total > 1e-5 ? sum / total : vec4(0.0);
        cloudDepth = nearestCloud;
    }
    return boundary;
}
void temporalUpscale(\n\
const ivec2 coord, const bool currentFrame, out vec4 outputColor, out float outputShadowLength\n\
) {\n\
    vec2 unjitteredUv = getUnjitteredUv(coord);\n\
    float centerDepth;\n\
    vec4 currentColor = reconstructCloud(unjitteredUv, centerDepth);
    float targetDepth;
    bool terrainBoundary = resolveTerrainBoundary(unjitteredUv, currentColor, centerDepth, targetDepth);\n\
    outputColor = currentColor;\n\
    #ifdef SHADOW_LENGTH\n\
        vec4 currentShadowLength = vec4(texture(shadowLengthBuffer, unjitteredUv).rgb, 1.0);\n\
        outputShadowLength = currentShadowLength.r;\n\
    #endif // SHADOW_LENGTH\n\
    if (!historyValid) return;
    ivec2 lowSize = textureSize(depthVelocityBuffer, 0);
    ivec2 lowCoord = clamp(ivec2(unjitteredUv * vec2(lowSize)), ivec2(0), lowSize - 1);
    vec4 depthVelocity = texelFetch(depthVelocityBuffer, lowCoord, 0);
    float visibleDepthLimit = targetDepth - max(20.0, targetDepth * 0.002);
    // Missing a Bayer phase is not an occlusion if the historical cloud is still in front of terrain.
    if (!(centerDepth > 0.0 && centerDepth < 1e7) || !(depthVelocity.r > 0.0 && depthVelocity.r < 1e7)) {
        if (!cameraMoving) {
            float historyDepth = getHistoryCloudDepth(vUv);
            bool visibleHistory = historyDepth > 0.0 && historyDepth < min(1e7, visibleDepthLimit);
            if (!terrainBoundary || visibleHistory) {
                vec4 history = texture(colorHistoryBuffer, vUv);
                if (any(isnan(history)) || any(isinf(history))) return;
                float distanceWeight = visibleHistory ? smoothstep(20000.0, 60000.0, historyDepth) : 0.0;
                float distantAlpha = (currentFrame ? currentFrameAlpha : temporalAlpha) * 0.35;
                float alpha = mix(max(temporalAlpha, 0.08), distantAlpha, distanceWeight);
                alpha = max(alpha, 1.0 / float(historyFrames + 1));
                outputColor = mix(history, currentColor, alpha);
            }
        }
        return;
    }\n\
    \n\
    // Use the same cloud sample for color, motion and depth. Nearest-depth\n\
    // dilation can borrow another cloud's velocity during camera translation.\n\
    vec2 velocity = depthVelocity.gb * texelSize;\n\
    vec2 prevUv = vUv - velocity;\n\
    if (any(isnan(prevUv)) || any(isinf(prevUv)) ||\n\
        any(lessThan(prevUv, texelSize * 0.5)) ||\n\
        any(greaterThan(prevUv, vec2(1.0) - texelSize * 0.5))) return;\n\
    vec4 historyColor = texture(colorHistoryBuffer, prevUv);\n\
    if (any(isnan(historyColor)) || any(isinf(historyColor))) return;\n\
    float historyDepth = getHistoryCloudDepth(prevUv);\n\
    bool visibleHistory = historyDepth > 0.0 && historyDepth < min(1e7, visibleDepthLimit);\n\
    vec4 clippedColor = varianceClipping(colorBuffer, unjitteredUv, currentColor, historyColor, varianceGamma);\n\
    // Stationary distant silhouettes must survive missing Bayer phases, not be clipped to empty sky.\n\
    float stationaryHistoryWeight = cameraMoving || (terrainBoundary && !visibleHistory) ? 0.0 : smoothstep(20000.0, 60000.0, centerDepth);\n\
    clippedColor = mix(clippedColor, historyColor, stationaryHistoryWeight);\n\
    float alpha = currentFrame ? currentFrameAlpha : temporalAlpha;\n\
    // Distant subpixel clouds need longer accumulation; motion rejection below\n\
    // still replaces history quickly while the camera moves.\n\
    alpha *= mix(1.0, 0.35, smoothstep(5000.0, 25000.0, centerDepth));
    // Preserve accumulation at ridges; replacing it every frame exposes Bayer jitter.
    if (terrainBoundary) alpha = max(alpha, cameraMoving ? 0.4 : mix(0.12, temporalAlpha * 0.35, stationaryHistoryWeight));\n\
    alpha = max(alpha, 1.0 / float(historyFrames + 1));\n\
    // Opacity noise alone must not discard history while the camera is still.\n\
    float motionRejection = smoothstep(0.5, 8.0, length(depthVelocity.gb));\n\
    float depthDifference = abs(historyDepth - depthVelocity.a) / max(depthVelocity.a, 100.0);\n\
    float depthRejection = smoothstep(0.04, 0.15, depthDifference);\n\
    float opacityRejection = smoothstep(0.05, 0.25, abs(historyColor.a - currentColor.a));\n\
    alpha = max(alpha, depthRejection * opacityRejection * motionRejection);\n\
    // Retain valid reprojected samples while moving instead of exposing raw noise.\n\
    alpha = max(alpha, 0.12 * motionRejection);\n\
    if (currentColor.a < 0.01) alpha = max(alpha, motionRejection);\n\
    outputColor = mix(clippedColor, currentColor, alpha);\n\
    #ifdef DEBUG_SHOW_VELOCITY\n\
        outputColor.rgb = outputColor.rgb + vec3(abs(velocity), 0.0);\n\
    #endif // DEBUG_SHOW_VELOCITY\n\
    \n\
    #ifdef SHADOW_LENGTH\n\
        vec4 historyShadowLength = vec4(texture(shadowLengthHistoryBuffer, prevUv).r, 0.0, 0.0, 1.0);\n\
        vec4 clippedShadowLength = varianceClipping(\n\
        shadowLengthBuffer, unjitteredUv, currentShadowLength, historyShadowLength, varianceGamma\n\
        );\n\
        outputShadowLength = mix(clippedShadowLength.r, currentShadowLength.r, max(alpha, 0.25));\n\
    #endif // SHADOW_LENGTH\n\
}\n\
void temporalAntialiasing(const ivec2 coord, out vec4 outputColor, out float outputShadowLength) {\n\
    vec4 currentColor = texelFetch(colorBuffer, coord, 0);\n\
    #ifdef SHADOW_LENGTH\n\
        vec4 currentShadowLength = vec4(texelFetch(shadowLengthBuffer, coord, 0).rgb, 1.0);\n\
    #endif // SHADOW_LENGTH\n\
    \n\
    vec4 depthVelocity = getClosestFragment(coord);\n\
    vec2 velocity = depthVelocity.gb * texelSize;\n\
    vec2 prevUv = vUv - velocity;\n\
    if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {\n\
        outputColor = currentColor;\n\
        #ifdef SHADOW_LENGTH\n\
            outputShadowLength = currentShadowLength.r;\n\
        #endif // SHADOW_LENGTH\n\
        return; // Rejection\n\
    }\n\
    vec4 historyColor = texture(colorHistoryBuffer, prevUv);\n\
    vec4 clippedColor = varianceClipping(colorBuffer, coord, currentColor, historyColor);\n\
    outputColor = mix(clippedColor, currentColor, temporalAlpha);\n\
    #ifdef DEBUG_SHOW_VELOCITY\n\
        outputColor.rgb = outputColor.rgb + vec3(abs(velocity), 0.0);\n\
    #endif // DEBUG_SHOW_VELOCITY\n\
    \n\
    #ifdef SHADOW_LENGTH\n\
        vec4 historyShadowLength = vec4(texture(shadowLengthHistoryBuffer, prevUv).r, 0.0, 0.0, 1.0);\n\
        vec4 clippedShadowLength = varianceClipping(\n\
        shadowLengthBuffer, coord, currentShadowLength, historyShadowLength\n\
        );\n\
        outputShadowLength = mix(clippedShadowLength.r, currentShadowLength.r, temporalAlpha);\n\
    #endif // SHADOW_LENGTH\n\
}\n\
void main() {\n\
    ivec2 coord = ivec2(gl_FragCoord.xy);\n\
    #if !defined(SHADOW_LENGTH)\n\
        float outputShadowLength;\n\
    #endif // !defined(SHADOW_LENGTH)\n\
    \n\
    #ifdef TEMPORAL_UPSCALE\n\
        int bayerValue = bayerIndices[coord.x % 4][coord.y % 4];\n\
        bool currentFrame = bayerValue == frame % 16;\n\
        temporalUpscale(coord, currentFrame, outputColor, outputShadowLength);\n\
    #else // TEMPORAL_UPSCALE\n\
        temporalAntialiasing(coord, outputColor, outputShadowLength);\n\
    #endif // TEMPORAL_UPSCALE\n\
    \n\
    #if defined(SHADOW_LENGTH) && defined(DEBUG_SHOW_SHADOW_LENGTH)\n\
        outputColor = vec4(turbo(outputShadowLength * 0.05), 1.0);\n\
    #endif // defined(SHADOW_LENGTH) && defined(DEBUG_SHOW_SHADOW_LENGTH)\n\
}\n\
`;
let vector3Scratch = new Cartesian3;
let resolutionScratch = new Cartesian2;
const vectorScratch = ["x", "y", "z", "w"];
const entriesScratch = Array.from(
    { length: 8 },
    () => ({ value: 0, flag: 0 })
)
const intervalsScratch = Array.from(
    { length: 3 },
    () => ({ min: 0, max: 0 })
)
export default class CloudMaterialPass {

    constructor(scene, options = {}) {

        this.id = createGuid();
        this._show = options.show ?? true;
        this._scene = scene;
        this.pipeline = options.pipeline;
        this._showTAA = false;
        this.minHeight = 750;
        this.maxHeight = 8000;
        this.albedo = new Cartesian3();
        this.altitudes = new Cartesian4(750, 1000, 7500, 0);
        this.heights = new Cartesian4(650, 1200, 500, 0);
        this.minLayerHeights = new Cartesian4(750, 1000, 7500, 0);
        this.maxLayerHeights = new Cartesian4(1400, 2200, 8000, 0);
        this.minIntervalHeights = new Cartesian3(0, 2200, 0);
        this.maxIntervalHeights = new Cartesian3(750, 7500, 0);
        this.densityScales = new Cartesian4(0.2000, 0.2000, 0.0030, 0.2000);
        this.shapeAmounts = new Cartesian4(1, 1, 0.4000, 1);
        this.shapeDetailAmounts = new Cartesian4(0.35, 0.35, 0, 1);
        this.weatherExponents = new Cartesian4(1, 1, 1, 1);
        this.shapeAlteringBiases = new Cartesian4(0.3500, 0.3500, 0.3500, 0.3500);
        this.coverageFilterWidths = new Cartesian4(0.6000, 0.6000, 0.5000, 0.6000);
        this.shadowTopHeight = 2200;
        this.shadowBottomHeight = 750;
        this.shadowLayerMask = new Cartesian4(1, 1, 0, 0);
        this.expTerms = new Cartesian4(0, 0, 0, 0);
        this.exponents = new Cartesian4(0, 0, 0, 0);
        this.linearTerms = new Cartesian4(0.7500, 0.7500, 0.7500, 0.7500);
        this.constantTerms = new Cartesian4(0.2500, 0.2500, 0.2500, 0.2500);
        this.temporalUpscale = true;
        this.inverseProjectionMatrix = new Matrix4();
        this.reprojectionMatrix = new Matrix4();
        this.temporalJitter = new Cartesian2();
        this.mipLevelScale = 1
        this.shapeTexelsPerMeterPerPixel = 0;
        this.layerTypes = new Cartesian4(0, 0, 0, 0);
        this.lodRange = new Cartesian2(200000, 500000);
        this.targetUvScale = new Cartesian2(1, 1);
        this.previousProjectionMatrix = new Matrix4();
        this.previousViewMatrix = new Matrix4();
        this._varianceGamma = 1.5;
        this._jitterOffset = new Cartesian2();
        this._previousJitterOffset = new Cartesian2();
        this._temporalAlpha = 0.12;
        this._currentFrameAlpha = 0.35;
        this._motionAlpha = 0.9;
        this._activeTemporalAlpha = this._temporalAlpha;
        this._activeCurrentFrameAlpha = this._currentFrameAlpha;
        this._spatialFilterStrength = 0.35;
        this._historyValid = false;
        this._historyFrames = 0;
        this._previousCameraPosition = new Cartesian3();
        this._previousCameraDirection = new Cartesian3();
        this._previousCameraUp = new Cartesian3();
        this._previousSunDirection = new Cartesian3();
        this._previousFrustumProjection = new Matrix4();
        this._historyTextures = [];
        this._texelSize = new Cartesian2();
        // clouds
        this.inverseShadowMatrices = Array.from({ length: 4 }, () => new Matrix4())
        this.reprojectionMatrices = Array.from({ length: 4 }, () => new Matrix4())
        // Primary raymarch
        this.maxIterationCount = defaultsPass.clouds.maxIterationCount;
        this.minStepSize = defaultsPass.clouds.minStepSize;
        this.maxStepSize = defaultsPass.clouds.maxStepSize;
        this.minDensity = defaultsPass.clouds.minDensity;
        this.minExtinction = defaultsPass.clouds.minExtinction;
        this.minTransmittance = defaultsPass.clouds.minTransmittance;
        this.opticalDepthTailScale = 2;
        this.shadowCascadeCount = defaultsPass.shadow.cascadeCount;
        this.shadowMapSize = defaultsPass.shadow.mapSize;
        // 6.2
        this.hazeDensityScale = 0.0;
        this.hazeCloudAttached = false;
        this.hazeViewDistance = 20000;
        this.hazeVolumeLength = 3000;
        this.hazeDirectLightScale = 1;
        this.hazeSunColor = new Cartesian3(1, 1, 1);
        this.hazeExponent = 0.001;
        this.hazeAnisotropy = 0.6;
        this.hazeSampleCount = 24;
        this.hazeShadowSampleCount = 2;
        this.hazeScatteringCoefficient = 0.9;
        this.hazeAbsorptionCoefficient = 0.5;
        // 5.30
        // this.skyIrradianceScale = 2.5;
        // this.groundIrradianceScale = 3;
        this.skyIrradianceScale = 1;
        this.groundIrradianceScale = 1;
        this.powderScale = 0.8;
        this.powderExponent = 150;
        this.maxRayDistance = defaultsPass.clouds.maxRayDistance;
        this.perspectiveStepScale = defaultsPass.clouds.perspectiveStepScale;

        this.maxIterationCountToSun = defaultsPass.clouds.maxIterationCountToSun;
        this.maxIterationCountToGround = defaultsPass.clouds.maxIterationCountToGround;
        this.minSecondaryStepSize = defaultsPass.clouds.minSecondaryStepSize;
        this.secondaryStepScale = defaultsPass.clouds.secondaryStepScale;

        this.shadowTexelSize = new Cartesian2();
        this.shadowIntervals = Array.from({ length: 4 }, () => new Cartesian2())
        this.shadowMatrices = Array.from({ length: 4 }, () => new Matrix4())
        this.shadowFar = 100000.;
        this.maxShadowFilterRadius = 6;
        this.maxShadowLengthIterationCount = defaultsPass.clouds.maxShadowLengthIterationCount;
        this.minShadowLengthStepSize = defaultsPass.clouds.minShadowLengthStepSize;
        this.maxShadowLengthRayDistance = defaultsPass.clouds.maxShadowLengthRayDistance;
        this._cloudsUniform = {

            shadowBuffer: () => { return this.shadowBuffer },
            shadowTexelSize: () => { return this.shadowTexelSize.set(1 / this.shadowMapSize.x, 1 / this.shadowMapSize.y) },
            shadowIntervals: () => { return this.shadowIntervals },
            shadowMatrices: () => { return this.shadowMatrices },
            shadowFar: () => { return this.shadowFar },
            maxShadowFilterRadius: () => { return this.maxShadowFilterRadius },

            maxShadowLengthIterationCount: () => { return this.maxShadowLengthIterationCount },
            minShadowLengthStepSize: () => { return this.minShadowLengthStepSize },
            maxShadowLengthRayDistance: () => { return this.maxShadowLengthRayDistance },

            maxIterationCountToSun: () => { return this.maxIterationCountToSun },
            maxIterationCountToGround: () => { return this.maxIterationCountToGround },
            minSecondaryStepSize: () => { return this.minSecondaryStepSize },
            secondaryStepScale: () => { return this.secondaryStepScale },

            albedo: () => { return this.albedo },
            hazeDensityScale: () => { return this.hazeDensityScale },
            hazeCloudAttached: () => this.hazeCloudAttached,
            hazeViewDistance: () => this.hazeViewDistance,
            hazeVolumeLength: () => this.hazeVolumeLength,
            hazeDirectLightScale: () => this.hazeDirectLightScale,
            hazeSunColor: () => this.hazeSunColor,
            hazeExponent: () => { return this.hazeExponent },
            hazeAnisotropy: () => this.hazeAnisotropy,
            hazeSampleCount: () => this.hazeSampleCount,
            hazeShadowSampleCount: () => this.hazeShadowSampleCount,
            hazeScatteringCoefficient: () => { return this.hazeScatteringCoefficient },
            hazeAbsorptionCoefficient: () => { return this.hazeAbsorptionCoefficient },
            reprojectionMatrix: () => { return this.reprojectionMatrix },
            previousCameraPosition: () => this._previousCameraPosition,
            inverseProjectionMatrix: () => { return this.inverseProjectionMatrix },
            skyIrradianceScale: () => { return this.skyIrradianceScale },
            groundIrradianceScale: () => { return this.groundIrradianceScale },
            powderScale: () => { return this.powderScale },
            powderExponent: () => { return this.powderExponent },
            maxRayDistance: () => { return this.maxRayDistance },
            perspectiveStepScale: () => { return this.perspectiveStepScale },

            // Participating medium
            scatteringCoefficient: () => { return this.pipeline.scatteringCoefficient },
            absorptionCoefficient: () => { return this.pipeline.absorptionCoefficient },

            // Weather and shape
            coverage: () => { return this.pipeline.effectiveCloudCoverage },
            localWeatherTexture: () => { return this.pipeline.localWeatherTexture },
            localWeatherRepeat: () => { return this.pipeline.localWeatherRepeat },
            localWeatherOffset: () => { return this.pipeline.localWeatherOffset },
            shapeTexture: () => { return this.pipeline.shapeTexture },
            shapeRepeat: () => { return this.pipeline.shapeRepeat },
            shapeOffset: () => { return this.pipeline.shapeOffset },
            shapeDetailTexture: () => { return this.pipeline.shapeDetailTexture },
            shapeDetailRepeat: () => { return this.pipeline.shapeDetailRepeat },
            shapeDetailOffset: () => { return this.pipeline.shapeDetailOffset },
            cloudLayerTypes: () => this.layerTypes,
            cloudLodRange: () => this.lodRange,
            turbulenceTexture: () => { return this.pipeline.turbulenceTexture },
            turbulenceRepeat: () => { return this.pipeline.turbulenceRepeat },
            turbulenceDisplacement: () => { return this.pipeline.turbulenceDisplacement },

            minLayerHeights: () => { return this.minLayerHeights },
            maxLayerHeights: () => { return this.maxLayerHeights },
            minIntervalHeights: () => { return this.minIntervalHeights },
            maxIntervalHeights: () => { return this.maxIntervalHeights },
            densityScales: () => { return this.densityScales },
            shapeAmounts: () => { return this.shapeAmounts },
            shapeDetailAmounts: () => { return this.shapeDetailAmounts },
            weatherExponents: () => { return this.weatherExponents },
            shapeAlteringBiases: () => { return this.shapeAlteringBiases },
            coverageFilterWidths: () => { return this.coverageFilterWidths },
            minHeight: () => { return this.minHeight },
            maxHeight: () => { return this.maxHeight },
            shadowTopHeight: () => { return this.shadowTopHeight },
            shadowBottomHeight: () => { return this.shadowBottomHeight },
            shadowLayerMask: () => { return this.shadowLayerMask },
            bottomRadius: () => { return this.pipeline.atmosphere.bottomRadius },
            topRadius: () => { return this.pipeline.atmosphere.topRadius },
            ellipsoidCenter: () => { return this.pipeline._ellipsoidCenter },
            ellipsoidMatrix: () => { return this.pipeline.ellipsoidMatrix },
            inverseEllipsoidMatrix: () => { return this.pipeline._inverseEllipsoidMatrix },
            altitudeCorrection: () => { return this.pipeline.shadowMaterialPass._altitudeCorrection },
            sunDirection: () => { return this._scene.context.uniformState.sunDirectionWC },
            "densityProfile.expTerms": () => { return this.expTerms; },
            "densityProfile.exponents": () => { return this.exponents; },
            "densityProfile.linearTerms": () => { return this.linearTerms; },
            "densityProfile.constantTerms": () => { return this.constantTerms; },


            // shadow
            inverseShadowMatrices: () => { return this.inverseShadowMatrices },
            reprojectionMatrices: () => { return this.reprojectionMatrices },
            resolution: () => { return this.pipeline._resolution },
            frame: () => { return this.pipeline._frame },
            stbnTexture: () => { return this.pipeline.stbnTexture },

            // Primary raymarch
            maxIterationCount: () => { return this.maxIterationCount },
            minStepSize: () => { return this.minStepSize },
            maxStepSize: () => { return this.maxStepSize },
            minDensity: () => { return this.minDensity },
            minExtinction: () => { return this.minExtinction },
            minTransmittance: () => { return this.minTransmittance },
            opticalDepthTailScale: () => { return this.opticalDepthTailScale },

            projectionMatrix: () => { return this._scene.context.uniformState.projection },
            viewMatrix: () => { return this._scene.context.uniformState.view },
            // projectionMatrix: () => { return this.pipeline.shadowMaterialPass.camera2.projectionMatrix },
            // viewMatrix: () => { return this.pipeline.shadowMaterialPass.camera2.viewMatrix },
            // inverseProjectionMatrix: () => { return this._scene.context.uniformState.inverseProjection },
            inverseViewMatrix: () => { return this._scene.context.uniformState.inverseView },
            cameraPosition: () => { return this._scene.context.uniformState._cameraPosition },
            ellipsoidRadii: () => { return this.pipeline._ellipsoidRadii },
            u_solar_irradiance: () => { return this.pipeline.atmosphere.solarIrradiance },
            u_sun_angular_radius: () => { return this.pipeline.atmosphere.sunAngularRadius },
            u_bottom_radius: () => { return this.pipeline.atmosphere.bottomRadius * METER_TO_LENGTH_UNIT },
            u_top_radius: () => { return this.pipeline.atmosphere.topRadius * METER_TO_LENGTH_UNIT },
            u_rayleigh_scattering: () => { return this.pipeline.atmosphere.rayleighScattering },
            u_mie_scattering: () => { return this.pipeline.atmosphere.mieScattering },
            u_mie_phase_function_g: () => { return this.pipeline.atmosphere.miePhaseFunctionG },
            u_mu_s_min: () => { return this.pipeline.atmosphere.muSMin },
            u_irradiance_texture: () => { return this.pipeline._u_irradiance_texture },
            u_scattering_texture: () => { return this.pipeline._u_scattering_texture },
            u_single_mie_scattering_texture: () => { return this.pipeline._u_single_mie_scattering_texture },
            u_transmittance_texture: () => { return this.pipeline._u_transmittance_texture },
            depthBuffer: () => { return this.depthBuffer },
            cameraNear: () => { return this.pipeline.shadowMaterialPass.shadowNear },
            // cameraNear: () => { return this._scene.context.uniformState.currentFrustum.x },
            // cameraFar: () => { return this._scene.context.uniformState.currentFrustum.y },
            cameraHeight: () => { return this.pipeline.cameraHeight },
            temporalJitter: () => { return this.temporalJitter },
            targetUvScale: () => { return this.targetUvScale },
            mipLevelScale: () => { return this.mipLevelScale },
            shapeTexelsPerMeterPerPixel: () => this.shapeTexelsPerMeterPerPixel,
        }

        this.init();
    }

    init(isUpdate = false) {
        const context = this._scene.context;
        let defines = ``

        // 预处理gbuffer定义
        if (context.renderGBuffer) {
            if (context.renderGBufferTexture) {
                defines += `#define HAS_M3D_GUFFER_TEXTURE\n`;
            }
            if (context.renderGBufferTexture2) {
                defines += `#define HAS_M3D_GUFFER_TEXTURE2\n`;
            }
        }

        const gl = this._scene.context._gl;
        if (this._width !== this._scene.drawingBufferWidth ||
            this._height !== this._scene.drawingBufferHeight
        ) {
            this._releaseRenderTargets();
            this.invalidateHistory();
            this._width = this._scene.drawingBufferWidth;
            this._height = this._scene.drawingBufferHeight;

            this._defaultTexture = this._scene.defaultTexture;
            this._lowResWidth = Math.ceil(this._width / 4);
            this._lowResHeight = Math.ceil(this._height / 4);
            this._outputColor = new Texture({
                context: this._scene.context,
                width: this._lowResWidth,
                height: this._lowResHeight,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._depthVelocityBuffer = new Texture({
                context: this._scene.context,
                width: this._lowResWidth,
                height: this._lowResHeight,
                pixelFormat: PixelFormat.RGBA,
                // Cloud distances exceed the 65,504 m range of half-float storage.
                pixelDatatype: PixelDatatype.FLOAT,
                flipY: false,
            });
            // Ping-pong at cloud resolution; no extra full-resolution depth pass.
            this._depthVelocityHistoryBuffer = new Texture({
                context,
                width: this._lowResWidth,
                height: this._lowResHeight,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.FLOAT,
                flipY: false,
            });
            this._shadowLengthBuffer = new Texture({
                context: this._scene.context,
                width: this._lowResWidth,
                height: this._lowResHeight,
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });

            // Resolve
            this._cloudResolveBuffer = new Texture({
                context: this._scene.context,
                width: this._width,
                height: this._height,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._colorResolveHistoryBuffer = new Texture({
                context: this._scene.context,
                width: this._width,
                height: this._height,
                pixelFormat: PixelFormat.RGBA,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this._shadowResolveLengthBuffer = new Texture({
                context: this._scene.context,
                width: this._width,
                height: this._height,
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });

            this._shadowResolveLengthHistoryBuffer = new Texture({
                context: this._scene.context,
                width: this._width,
                height: this._height,
                pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.HALF_FLOAT,
                flipY: false,
            });
            this.targetUvScale.set(this._lowResWidth * 4 / this._width, this._lowResHeight * 4 / this._height)
            this._texelSize.set(1 / this._width, 1 / this._height)
        }

        if (!this._cloudDrawComomand) {
            const cloudsMaterialShader = new Cesium.ShaderSource({
                defines: ["LOG_DEPTH"],
                sources: [cloudsMaterialFS]
            });
            this._passState = new PassState(this._scene.context);
            this._cloudDrawComomand = this._scene.context.createViewportQuadCommand(cloudsMaterialShader, {
                uniformMap: this._cloudsUniform,
                primitiveType: PrimitiveType.TRIANGLES
            }, cloudsMaterialVS);
            const cloudsResolveMaterialShader = new Cesium.ShaderSource({
                defines: ["LOG_DEPTH"],
                sources: [cloudsResolveMaterialFS]
            });
            this._passState2 = new PassState(this._scene.context);
            this._cloudResolveDrawComomand = this._scene.context.createViewportQuadCommand(cloudsResolveMaterialShader, {
                uniformMap: {
                    frame: () => { return this.pipeline._frame },
                    varianceGamma: () => { return this._varianceGamma },
                    jitterOffset: () => { return this._jitterOffset },
                    temporalAlpha: () => this._activeTemporalAlpha,
                    currentFrameAlpha: () => this._activeCurrentFrameAlpha,
                    spatialFilterStrength: () => this._spatialFilterStrength,
                    historyValid: () => this._historyValid,
                    cameraMoving: () => this._cameraMoving ?? false,
                    historyFrames: () => this._historyFrames,
                    depthHistoryBuffer: () => this._depthVelocityHistoryBuffer,
                    sceneDepthBuffer: () => this.depthBuffer,
                    previousJitterOffset: () => this._previousJitterOffset,
                    targetUvScale: () => this.targetUvScale,
                    texelSize: () => { return this._texelSize },
                    colorBuffer: () => {
                        return this._outputColor;
                    },
                    depthVelocityBuffer: () => {
                        return this._depthVelocityBuffer;
                    },
                    shadowLengthBuffer: () => {
                        return this._shadowLengthBuffer;
                    },
                    colorHistoryBuffer: () => {
                        return this._colorResolveHistoryBuffer;
                    },
                    shadowLengthHistoryBuffer: () => {
                        return this._shadowResolveLengthHistoryBuffer;
                    },
                },
                primitiveType: PrimitiveType.TRIANGLES
            }, cloudsResolveMaterialVS);
        }
        if (!this._passState.framebuffer) {
            this._passState.viewport = new BoundingRectangle(0, 0, this._lowResWidth, this._lowResHeight);
            this._passState.framebuffer = new Framebuffer({
                context,
                colorTextures: [this._outputColor, this._depthVelocityBuffer, this._shadowLengthBuffer],
                destroyAttachments: false,
            });
            this._passState2.viewport = new BoundingRectangle(0, 0, this._width, this._height);
            this._passState2.framebuffer = new Framebuffer({
                context: this._scene.context,
                colorTextures: [this._cloudResolveBuffer, this._shadowResolveLengthBuffer],
                destroyAttachments: false,
            })
        }
    }

    invalidateHistory() {
        this._historyValid = false;
        this._historyFrames = 0;
        this.pipeline.shadowMaterialPass?.invalidateHistory();
    }

    _releaseRenderTargets() {
        for (const passState of [this._passState, this._passState2]) {
            if (passState && passState.framebuffer) {
                passState.framebuffer.destroy();
                passState.framebuffer = undefined;
            }
        }
        for (const key of [
            "_outputColor", "_depthVelocityBuffer", "_depthVelocityHistoryBuffer", "_shadowLengthBuffer",
            "_cloudResolveBuffer", "_colorResolveHistoryBuffer",
            "_shadowResolveLengthBuffer", "_shadowResolveLengthHistoryBuffer",
        ]) {
            if (this[key]) {
                this[key].destroy();
                this[key] = undefined;
            }
        }
    }

    execute(context, colorTexture, depthTexture, idTexture) {

        const gl = this._scene.context._gl;
        if (this._width !== this._scene.drawingBufferWidth ||
            this._height !== this._scene.drawingBufferHeight
        ) {
            this.init(true);
        }

        // render cloud
        let totalMinHeight = Infinity;
        let totalMaxHeight = 0;
        let shadowBottomHeight = Infinity;
        let shadowTopHeight = 0;
        for (let i = 0; i < 3; ++i) {
            const axis = vectorScratch[i]; // 当前坐标轴

            // 原逻辑保持不变
            const altitude = this.altitudes[axis];
            const height = this.heights[axis];
            const shadow = this.shadowLayerMask[axis];
            const maxHeight = altitude + height;

            // 原有条件判断完全不变
            if (height > 0) {
                if (altitude < totalMinHeight) {
                    totalMinHeight = altitude;
                }
                if (shadow === 1 && altitude < shadowBottomHeight) {
                    shadowBottomHeight = altitude;
                }
                if (maxHeight > totalMaxHeight) {
                    totalMaxHeight = maxHeight;
                }
                if (shadow === 1 && maxHeight > shadowTopHeight) {
                    shadowTopHeight = maxHeight;
                }
            }
            if (this.minLayerHeights[axis] !== altitude || this.maxLayerHeights[axis] !== maxHeight) {
                this.pipeline.shadowMaterialPass.invalidateHistory();
            }
            this.minLayerHeights[axis] = altitude;
            this.maxLayerHeights[axis] = maxHeight;
        }
        if (totalMinHeight !== Infinity) {
            this.minHeight = totalMinHeight
            this.maxHeight = totalMaxHeight
        } else {
            this.minHeight = 0
        }
        if (shadowBottomHeight !== Infinity) {
            this.shadowBottomHeight = shadowBottomHeight
            this.shadowTopHeight = shadowTopHeight
        } else {
            this.shadowBottomHeight = 0
        }
        this.packIntervalHeights();

        const camera = this._scene.camera;
        const projection = camera.frustum.projectionMatrix;
        const cameraMoving = this._historyValid && (
            Cartesian3.distance(camera.positionWC, this._previousCameraPosition) > 0.5 ||
            Cartesian3.dot(camera.directionWC, this._previousCameraDirection) < 0.99999999 ||
            Cartesian3.dot(camera.upWC, this._previousCameraUp) < 0.99999999
        );
        // During motion, use fresh samples for both Bayer classes. Restore the
        // quieter stationary blend as soon as the camera stops.
        this._cameraMoving = cameraMoving;
        this._activeTemporalAlpha = cameraMoving
            ? Math.max(this._temporalAlpha, this._motionAlpha) : this._temporalAlpha;
        this._activeCurrentFrameAlpha = cameraMoving
            ? Math.max(this._currentFrameAlpha, this._motionAlpha) : this._currentFrameAlpha;
        const pixelsPerRadian = Math.max(1, Math.abs(projection[5]) * this._lowResHeight * 0.5);
        this.shapeTexelsPerMeterPerPixel = this.pipeline.shapeRepeat.x *
            this.pipeline.shapeTexture.width / pixelsPerRadian;
        const sunDirection = context.uniformState.sunDirectionWC;
        if (this._historyValid && (
            this._previousSceneMode !== this._scene.mode ||
            !Matrix4.equalsEpsilon(projection, this._previousFrustumProjection, 1e-6) ||
            Cartesian3.distance(camera.positionWC, this._previousCameraPosition) >
                Math.max(1000, Math.abs(this.pipeline.cameraHeight) * 0.5) ||
            Cartesian3.dot(camera.directionWC, this._previousCameraDirection) < 0.94 ||
            Cartesian3.dot(camera.upWC, this._previousCameraUp) < 0.94 ||
            Cartesian3.dot(sunDirection, this._previousSunDirection) < 0.9998
        )) {
            this.invalidateHistory();
        }
        const textures = [this.pipeline.localWeatherTexture, this.pipeline.shapeTexture,
            this.pipeline.shapeDetailTexture, this.pipeline.stbnTexture,
            this.pipeline._u_irradiance_texture, this.pipeline._u_scattering_texture,
            this.pipeline._u_transmittance_texture];
        if (textures.some((texture, index) => texture !== this._historyTextures[index])) {
            this.invalidateHistory();
            this._historyTextures = textures;
        }
        if (!this._historyValid) {
            Cartesian3.clone(camera.positionWC, this._previousCameraPosition);
            Matrix4.clone(context.uniformState.projection, this.previousProjectionMatrix);
            Matrix4.clone(context.uniformState.view, this.previousViewMatrix);
        }

        // copyCameraSettings
        const previousProjectionMatrix =
            this.previousProjectionMatrix ?? this._scene.context.uniformState.projection
        const previousViewMatrix =
            this.previousViewMatrix ?? this._scene.context.uniformState.view

        if (this.temporalUpscale) {
            const frame = this.pipeline._frame % 16
            const resolution = this.pipeline._resolution
            const offset = bayerOffsets[frame]
            const dx = ((offset.x - 0.5) / resolution.x) * 4
            const dy = ((offset.y - 0.5) / resolution.y) * 4
            this.temporalJitter.set(dx, dy)
            this.mipLevelScale = 0.25
            this.inverseProjectionMatrix.copy(this._scene.context.uniformState.projection)
            this.inverseProjectionMatrix[8] += dx * 2
            this.inverseProjectionMatrix[9] += dy * 2
            Matrix4.inverse(this.inverseProjectionMatrix, this.inverseProjectionMatrix);

            // Jitter the previous projection matrix with the current jitter.
            this.reprojectionMatrix.copy(previousProjectionMatrix)
            this.reprojectionMatrix[8] += dx * 2
            this.reprojectionMatrix[9] += dy * 2
            Matrix4.multiply(this.reprojectionMatrix, previousViewMatrix, this.reprojectionMatrix);

            const dx2 = (offset.x - 0.5) * 4
            const dy2 = (offset.y - 0.5) * 4
            this._jitterOffset.set(dx2, dy2);
        } else {
            Cartesian3.clone(Cartesian3.ZERO, this.temporalJitter);
            this.mipLevelScale = 1
            this.inverseProjectionMatrix.copy(this._scene.context.uniformState.projection)
            this.reprojectionMatrix.copy(previousProjectionMatrix);
            Matrix4.multiply(this.reprojectionMatrix, previousViewMatrix, this.reprojectionMatrix);
        }
        const albedo = this.pipeline.scatteringCoefficient / (this.pipeline.absorptionCoefficient + this.pipeline.scatteringCoefficient);
        this.albedo.set(albedo, albedo, albedo);


        this.depthBuffer = depthTexture;
        this.shadowBuffer = this.pipeline.shadowMaterialPass._historyBuffer;

        // copyShadow
        const shadow = this.pipeline.shadowMaterialPass.shadowMaps;
        for (let i = 0; i < shadow.cascadeCount; ++i) {
            const cascade = shadow.cascades[i]
            this.shadowIntervals[i].copy(cascade.interval)
            this.shadowMatrices[i].copy(cascade.matrix.elements)
        }
        this.shadowFar = shadow.far;

        // render
        if (this._passState.framebuffer && !this._passState.framebuffer.onBindEvent) {
            this._passState.framebuffer.onBindEvent = (buffers) => {
                gl.framebufferTexture2D(gl.FRAMEBUFFER, buffers[1],
                    this._depthVelocityBuffer._target, this._depthVelocityBuffer._texture, 0);
            };
        }
        if (this._passState.framebuffer && !this._passState.framebuffer.onDrawEvent) {
            this._passState.framebuffer.onDrawEvent = (buffers) => {
                gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            }
        }
        installFramebufferCallbacks(this._passState.framebuffer);
        if (this._cloudDrawComomand)
            this._cloudDrawComomand.execute(this._scene.context, this._passState);

        if (this._passState2.framebuffer && !this._passState2.framebuffer.onBindEvent) {
            this._passState2.framebuffer.onBindEvent = (buffers) => {
                gl.framebufferTexture2D(gl.FRAMEBUFFER,
                    buffers[0],
                    this._cloudResolveBuffer._target,
                    this._cloudResolveBuffer._texture, 0);
                gl.framebufferTexture2D(gl.FRAMEBUFFER,
                    buffers[1],
                    this._shadowResolveLengthBuffer._target,
                    this._shadowResolveLengthBuffer._texture, 0);
            }
            this._passState2.framebuffer.onDrawEvent = (buffers) => {
                gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            }
        }
        installFramebufferCallbacks(this._passState2.framebuffer);
        if (this._cloudResolveDrawComomand)
            this._cloudResolveDrawComomand.execute(this._scene.context, this._passState2);


        this.previousProjectionMatrix.copy(this._scene.context.uniformState.projection);
        this.previousViewMatrix.copy(this._scene.context.uniformState.view);

        swapTextures(this._cloudResolveBuffer, this._colorResolveHistoryBuffer);
        swapTextures(this._depthVelocityBuffer, this._depthVelocityHistoryBuffer);
        Cartesian2.clone(this._jitterOffset, this._previousJitterOffset);
        swapTextures(this._shadowResolveLengthBuffer, this._shadowResolveLengthHistoryBuffer);
        Cartesian3.clone(camera.positionWC, this._previousCameraPosition);
        Cartesian3.clone(camera.directionWC, this._previousCameraDirection);
        Cartesian3.clone(camera.upWC, this._previousCameraUp);
        Cartesian3.clone(sunDirection, this._previousSunDirection);
        Matrix4.clone(projection, this._previousFrustumProjection);
        this._previousSceneMode = this._scene.mode;
        this._historyValid = true;
        this._historyFrames = Math.min(this._historyFrames + 1, 64);
    }

    // 修正后的区间计算
    packIntervalHeights() {
        // 步骤 1: 填充 entriesScratch
        for (let i = 0; i < 4; ++i) {
            const axis = vectorScratch[i]; // 当前坐标轴
            const altitude = this.altitudes[axis];
            const height = this.heights[axis];
            let entry = {};
            entry.value = altitude;
            entry.flag = 0; // 起点标记
            entriesScratch[i] = entry;
            entry = {};
            entry.value = altitude + height;
            entry.flag = 1; // 终点标记
            entriesScratch[i + 4] = entry;
        }

        // 步骤 2: 按值排序
        entriesScratch.sort(compareEntries);

        // 步骤 3: 合并区间
        let intervalIndex = 0;
        let balance = 0;
        for (let entryIndex = 0; entryIndex < entriesScratch.length; entryIndex++) {
            const { value, flag } = entriesScratch[entryIndex];

            if (balance === 0 && entryIndex > 0) {
                if (intervalIndex >= 3) break; // 最多记录3个区间
                const interval = intervalsScratch[intervalIndex++];
                interval.min = entriesScratch[entryIndex - 1].value;
                interval.max = value;
            }
            balance += flag === 0 ? 1 : -1;
        }

        // 步骤 4: 绑定结果到 this
        this.minIntervalHeights.set(
            intervalsScratch[0].min,
            intervalsScratch[1].min,
            intervalsScratch[2].min
        );
        this.maxIntervalHeights.set(
            intervalsScratch[0].max,
            intervalsScratch[1].max,
            intervalsScratch[2].max
        );
    }
    destroy() {
        this._releaseRenderTargets();
        for (const command of [this._cloudDrawComomand, this._cloudResolveDrawComomand]) {
            if (command && command.shaderProgram) command.shaderProgram.destroy();
        }
        this._cloudDrawComomand = undefined;
        this._cloudResolveDrawComomand = undefined;
        return destroyObject(this)
    }

    isDestroyed() {

        return false;
    }
}

function compareEntries(a, b) {
    return a.value !== b.value ? a.value - b.value : a.flag - b.flag
}
// prettier-ignore
export const bayerIndices = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
];

export const bayerOffsets = /*#__PURE__*/ (() => {
    const offsets = new Array(16);

    // 预创建临时变量减少内存分配
    const tmp = new Cartesian2();

    // 使用反向映射优化查找效率
    const indexMap = new Map();
    bayerIndices.forEach((value, index) => {
        indexMap.set(value, index);
    });

    for (let order = 0; order < 16; order++) {
        const i = indexMap.get(order);
        Cartesian2.fromElements(
            ((i % 4) + 0.5) / 4,
            (Math.floor(i / 4) + 0.5) / 4,
            tmp
        );
        offsets[order] = Cartesian2.clone(tmp);
    }

    return offsets;
})();


/**
 * 交换缓冲区 - 纹理
 * @param {*} texA 
 * @param {*} texB 
 */
function swapTextures(texA, texB) {
    const texAux = texA._texture;
    texA._texture = texB._texture;
    texB._texture = texAux;
};
