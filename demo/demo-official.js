/**
 * demo-official.js —— BetterSky for Cesium SDK 的接入示例。
 *
 * 本示例直接 import 官方 cesium，
 * 通过一行 `new BetterSky(viewer)` 叠加 体积云 / 大气散射 / 体积光 / 镜头光晕。
 *
 * 运行：pnpm dev，打开 Vite 输出的根地址。
 * Vite 提供 npm 模块，官方与天空效果资源均相对于 Vite base 从 cesium/ 加载。
 */
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { BetterSky } from "../src/index.ts";

// 控件只转换参数形状，默认值统一由管线内置预设提供。
const DEFAULT_OPTIONS = BetterSky.defaultOptions;
const CONTROL_DEFAULTS = {
  enabled: DEFAULT_OPTIONS.enabled,
  systemLight: DEFAULT_OPTIONS.systemLight,
  hbaoEnabled: !!DEFAULT_OPTIONS.hbao,
  smaaEnabled: DEFAULT_OPTIONS.smaa,
  coverage: DEFAULT_OPTIONS.coverage,
  weatherX: DEFAULT_OPTIONS.localWeatherVelocity[0],
  weatherY: DEFAULT_OPTIONS.localWeatherVelocity[1],
  toneMappingMode: String(DEFAULT_OPTIONS.toneMappingMode),
  toneMappingExposure: DEFAULT_OPTIONS.toneMappingExposure,
  irradianceScale: DEFAULT_OPTIONS.irradianceScale,
  aerialPerspectiveStrength: DEFAULT_OPTIONS.aerialPerspectiveStrength,
  darkParamY: DEFAULT_OPTIONS.darkParamY,
  bloomIntensity: DEFAULT_OPTIONS.bloomIntensity,
  volumetricLightMode: DEFAULT_OPTIONS.volumetricLight.mode,
  volumetricDensity: DEFAULT_OPTIONS.volumetricLight.density,
  volumetricIntensity: DEFAULT_OPTIONS.volumetricLight.intensity,
  volumetricLayerDepth: DEFAULT_OPTIONS.volumetricLight.layerDepth,
  volumetricMaxDistance: DEFAULT_OPTIONS.volumetricLight.maxDistance,
  volumetricAnisotropy: DEFAULT_OPTIONS.volumetricLight.anisotropy,
  volumetricQuality: DEFAULT_OPTIONS.volumetricLight.quality,
  sunShaftsIntensity: Number((DEFAULT_OPTIONS.cloud.hazeDensityScale / 0.0001).toFixed(4)),
  altitude0: DEFAULT_OPTIONS.cloud.altitudes[0],
  altitude1: DEFAULT_OPTIONS.cloud.altitudes[1],
  altitude2: DEFAULT_OPTIONS.cloud.altitudes[2],
  altitude3: DEFAULT_OPTIONS.cloud.altitudes[3],
  height0: DEFAULT_OPTIONS.cloud.heights[0],
  height1: DEFAULT_OPTIONS.cloud.heights[1],
  height2: DEFAULT_OPTIONS.cloud.heights[2],
  height3: DEFAULT_OPTIONS.cloud.heights[3],
  density0: DEFAULT_OPTIONS.cloud.densityScales[0],
  density1: DEFAULT_OPTIONS.cloud.densityScales[1],
  density2: DEFAULT_OPTIONS.cloud.densityScales[2],
  density3: DEFAULT_OPTIONS.cloud.densityScales[3],
  layerTypesEnabled: DEFAULT_OPTIONS.cloud.layerTypes !== null,
  layerType0: DEFAULT_OPTIONS.cloud.layerTypes[0],
  layerType1: DEFAULT_OPTIONS.cloud.layerTypes[1],
  layerType2: DEFAULT_OPTIONS.cloud.layerTypes[2],
  detail0: DEFAULT_OPTIONS.cloud.shapeDetailAmounts[0],
  detail1: DEFAULT_OPTIONS.cloud.shapeDetailAmounts[1],
  detail2: DEFAULT_OPTIONS.cloud.shapeDetailAmounts[2],
  detail3: DEFAULT_OPTIONS.cloud.shapeDetailAmounts[3],
  skyIrradianceScale: DEFAULT_OPTIONS.cloud.skyIrradianceScale,
  groundIrradianceScale: DEFAULT_OPTIONS.cloud.groundIrradianceScale,
  hazeCloudAttached: DEFAULT_OPTIONS.cloud.hazeCloudAttached,
  hazeGroundDensityScale: DEFAULT_OPTIONS.cloud.hazeGroundDensityScale,
  hazeViewDistance: DEFAULT_OPTIONS.cloud.hazeViewDistance,
  hazeVolumeLength: DEFAULT_OPTIONS.cloud.hazeVolumeLength,
  hazeDirectLightScale: DEFAULT_OPTIONS.cloud.hazeDirectLightScale,
  hazeHeightFalloff: DEFAULT_OPTIONS.cloud.hazeHeightFalloff,
  hazeAnisotropy: DEFAULT_OPTIONS.cloud.hazeAnisotropy,
  hazeQuality: DEFAULT_OPTIONS.cloud.hazeQuality,
  hazeSunR: DEFAULT_OPTIONS.cloud.hazeSunColor[0],
  hazeSunG: DEFAULT_OPTIONS.cloud.hazeSunColor[1],
  hazeSunB: DEFAULT_OPTIONS.cloud.hazeSunColor[2],
  maxShadowLengthRayDistance: DEFAULT_OPTIONS.cloud.maxShadowLengthRayDistance,
  lodEnabled: DEFAULT_OPTIONS.cloud.lodRange !== null,
  lodNear: DEFAULT_OPTIONS.cloud.lodRange[0],
  lodFar: DEFAULT_OPTIONS.cloud.lodRange[1],
  altitudeFadeEnabled: DEFAULT_OPTIONS.cloud.altitudeFadeRange !== null,
  altitudeFadeStart: DEFAULT_OPTIONS.cloud.altitudeFadeRange[0],
  altitudeFadeEnd: DEFAULT_OPTIONS.cloud.altitudeFadeRange[1],
  denoiseTemporalAlpha: DEFAULT_OPTIONS.cloud.denoise.temporalAlpha,
  denoiseCurrentFrameAlpha: DEFAULT_OPTIONS.cloud.denoise.currentFrameAlpha,
  denoiseMotionAlpha: DEFAULT_OPTIONS.cloud.denoise.motionAlpha,
  denoiseVarianceGamma: DEFAULT_OPTIONS.cloud.denoise.varianceGamma,
  denoiseSpatialFilterStrength: DEFAULT_OPTIONS.cloud.denoise.spatialFilterStrength,
  hbaoIntensity: DEFAULT_OPTIONS.hbao.intensity,
  hbaoMaxRadius: DEFAULT_OPTIONS.hbao.maxRadius,
  hbaoBias: DEFAULT_OPTIONS.hbao.bias,
  hbaoFrustumLength: DEFAULT_OPTIONS.hbao.frustumLength,
  hbaoBlackPoint: DEFAULT_OPTIONS.hbao.blackPoint,
  hbaoWhitePoint: DEFAULT_OPTIONS.hbao.whitePoint,
  hbaoGamma: DEFAULT_OPTIONS.hbao.gamma,
  highDynamicRange: DEFAULT_OPTIONS.highDynamicRange,
  logarithmicDepthBuffer: DEFAULT_OPTIONS.logarithmicDepthBuffer,
  gamma: DEFAULT_OPTIONS.gamma,
  time: DEFAULT_OPTIONS.time.slice(0, 16),
};

function buildPipelineOptions(values) {
  return {
    time: `${values.time}Z`,
    enabled: values.enabled,
    systemLight: values.systemLight,
    coverage: values.coverage,
    localWeatherVelocity: [values.weatherX, values.weatherY],
    toneMappingMode: Number(values.toneMappingMode),
    toneMappingExposure: values.toneMappingExposure,
    irradianceScale: values.irradianceScale,
    aerialPerspectiveStrength: values.aerialPerspectiveStrength,
    darkParamY: values.darkParamY,
    highDynamicRange: values.highDynamicRange,
    logarithmicDepthBuffer: values.logarithmicDepthBuffer,
    gamma: values.gamma,
    bloomIntensity: values.bloomIntensity,
    volumetricLight: {
      mode: values.volumetricLightMode,
      density: values.volumetricDensity,
      intensity: values.volumetricIntensity,
      layerDepth: values.volumetricLayerDepth,
      maxDistance: values.volumetricMaxDistance,
      anisotropy: values.volumetricAnisotropy,
      quality: values.volumetricQuality,
    },
    cloud: {
      layerTypes: values.layerTypesEnabled ? [values.layerType0, values.layerType1, values.layerType2] : null,
      lodRange: values.lodEnabled ? [values.lodNear, values.lodFar] : null,
      altitudeFadeRange: values.altitudeFadeEnabled ? [values.altitudeFadeStart, values.altitudeFadeEnd] : null,
      altitudes: [0, 1, 2, 3].map((index) => values[`altitude${index}`]),
      heights: [0, 1, 2, 3].map((index) => values[`height${index}`]),
      densityScales: [0, 1, 2, 3].map((index) => values[`density${index}`]),
      shapeDetailAmounts: [0, 1, 2, 3].map((index) => values[`detail${index}`]),
      skyIrradianceScale: values.skyIrradianceScale,
      groundIrradianceScale: values.groundIrradianceScale,
      hazeDensityScale: values.sunShaftsIntensity * 0.0001,
      hazeCloudAttached: values.hazeCloudAttached,
      hazeGroundDensityScale: values.hazeGroundDensityScale,
      hazeViewDistance: values.hazeViewDistance,
      hazeVolumeLength: values.hazeVolumeLength,
      hazeDirectLightScale: values.hazeDirectLightScale,
      hazeHeightFalloff: values.hazeHeightFalloff,
      hazeAnisotropy: values.hazeAnisotropy,
      hazeQuality: values.hazeQuality,
      hazeSunColor: [values.hazeSunR, values.hazeSunG, values.hazeSunB],
      maxShadowLengthRayDistance: values.maxShadowLengthRayDistance,
      denoise: {
        temporalAlpha: values.denoiseTemporalAlpha,
        currentFrameAlpha: values.denoiseCurrentFrameAlpha,
        motionAlpha: values.denoiseMotionAlpha,
        varianceGamma: values.denoiseVarianceGamma,
        spatialFilterStrength: values.denoiseSpatialFilterStrength,
      },
    },
    hbao: values.hbaoEnabled ? {
      intensity: values.hbaoIntensity,
      maxRadius: values.hbaoMaxRadius,
      bias: values.hbaoBias,
      frustumLength: values.hbaoFrustumLength,
      blackPoint: values.hbaoBlackPoint,
      whitePoint: values.hbaoWhitePoint,
      gamma: values.hbaoGamma,
    } : false,
    smaa: values.smaaEnabled,
  };
}

function updateTimelineRange(viewer, time) {
  const clock = viewer.clock;
  clock.startTime = Cesium.JulianDate.fromIso8601(`${time.slice(0, 10)}T00:00:00Z`);
  clock.stopTime = Cesium.JulianDate.addDays(clock.startTime, 1, new Cesium.JulianDate());
  viewer.timeline.zoomTo(clock.startTime, clock.stopTime);
}

function createEffectControlPanel(viewer, fx) {
  const panel = document.getElementById("effectPanel");
  const controlsRoot = document.getElementById("effectControls");
  // 首页没有控制面板，渲染预设由 BetterSky 内置默认值提供。
  if (!panel || !controlsRoot) return;
  const footer = panel.querySelector(".effect-panel__footer");
  const toggleButton = document.getElementById("toggleEffectPanel");
  const resetButton = document.getElementById("resetEffectControls");
  const state = { ...CONTROL_DEFAULTS };
  const controls = new Map();
  let activeHelp = null;

  const closeHelp = (returnFocus = false) => {
    if (!activeHelp) return;
    const { helpButton, helpCard } = activeHelp;
    activeHelp = null;
    helpCard.hidden = true;
    helpButton.setAttribute("aria-expanded", "false");
    if (returnFocus) helpButton.focus({ preventScroll: true });
  };

  document.addEventListener("click", (event) => {
    if (activeHelp && !activeHelp.helpCard.contains(event.target) && !activeHelp.helpButton.contains(event.target)) {
      closeHelp();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !activeHelp) return;
    event.preventDefault();
    event.stopPropagation();
    closeHelp(true);
  });

  const createSection = (title, open = false) => {
    const details = document.createElement("details");
    details.className = "effect-section";
    details.open = open;
    const summary = document.createElement("summary");
    summary.textContent = title;
    details.append(summary);
    const content = document.createElement("div");
    content.className = "effect-section__content";
    details.append(content);
    details.addEventListener("toggle", () => {
      if (!details.open && activeHelp && details.contains(activeHelp.wrapper)) closeHelp();
    });
    controlsRoot.append(details);
    return content;
  };

  const createControl = (section, key, labelText, help, defaultValue = CONTROL_DEFAULTS[key]) => {
    const id = `effect-control-${key}`;
    const wrapper = document.createElement("div");
    wrapper.className = "effect-control";
    wrapper.dataset.key = key;
    const heading = document.createElement("div");
    heading.className = "effect-control__heading";
    const label = document.createElement("label");
    label.className = "effect-control__label";
    label.id = `${id}-label`;
    label.htmlFor = id;
    label.textContent = labelText;
    const helpButton = document.createElement("button");
    helpButton.type = "button";
    helpButton.className = "effect-help-button";
    helpButton.id = `${id}-help-button`;
    helpButton.textContent = "?";
    helpButton.dataset.helpFor = key;
    helpButton.setAttribute("aria-label", `${labelText}参数说明`);
    helpButton.setAttribute("aria-expanded", "false");
    helpButton.setAttribute("aria-controls", `${id}-help`);
    heading.append(label, helpButton);
    const body = document.createElement("div");
    body.className = "effect-control__body";
    const error = document.createElement("p");
    error.id = `${id}-error`;
    error.className = "effect-control__error";
    error.hidden = true;
    error.setAttribute("role", "status");
    error.setAttribute("aria-live", "polite");
    const helpCard = document.createElement("div");
    helpCard.id = `${id}-help`;
    helpCard.className = "effect-help-card";
    helpCard.dataset.helpFor = key;
    helpCard.hidden = true;
    helpCard.setAttribute("role", "note");
    wrapper.append(heading, body, error, helpCard);
    section.append(wrapper);

    const control = {
      id, key, wrapper, heading, label, body, error, helpButton, helpCard,
      inputs: [],
      setError(message) {
        error.textContent = message;
        error.hidden = !message;
        for (const input of control.inputs) input.setAttribute("aria-invalid", String(!!message));
      },
      setDisabled(disabled) {
        wrapper.classList.toggle("is-disabled", disabled);
        for (const input of control.inputs) input.disabled = disabled;
      },
      refreshHelp() {
        const description = typeof help === "function" ? help() : help;
        const initial = typeof defaultValue === "boolean" ? (defaultValue ? "开启" : "关闭") : String(defaultValue);
        helpCard.textContent = `${description}\n\n默认值（本示例）：${initial}。`;
      },
    };
    helpButton.addEventListener("click", (event) => {
      if (activeHelp === control) {
        closeHelp(event.detail === 0);
        return;
      }
      closeHelp();
      control.refreshHelp();
      activeHelp = control;
      helpCard.hidden = false;
      helpButton.setAttribute("aria-expanded", "true");
    });
    control.refreshHelp();
    controls.set(key, control);
    return control;
  };

  const bindInput = (control, input, suffix = "") => {
    input.id = `${control.id}${suffix}`;
    input.name = `${control.key}${suffix}`;
    input.dataset.key = control.key;
    input.setAttribute("aria-describedby", `${control.helpCard.id} ${control.error.id}`);
    control.inputs.push(input);
  };

  const addToggle = (section, key, labelText, onChange, help) => {
    const control = createControl(section, key, labelText, help);
    control.wrapper.classList.add("effect-control--toggle");
    control.body.hidden = true;
    const input = document.createElement("input");
    input.type = "checkbox";
    bindInput(control, input);
    control.heading.insertBefore(input, control.helpButton);
    control.setValue = (value, commit = true) => {
      input.checked = !!value;
      if (commit) onChange(input.checked);
    };
    input.addEventListener("change", () => control.setValue(input.checked));
    control.setValue(state[key], false);
  };

  const addRange = (section, key, labelText, min, max, step, onChange, help, slider = true) => {
    const control = createControl(section, key, labelText, help);
    const inputs = document.createElement("div");
    inputs.className = slider ? "effect-control__inputs" : "effect-control__body";
    const range = slider ? document.createElement("input") : null;
    if (range) {
      range.type = "range";
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      bindInput(control, range);
      inputs.append(range);
    }
    const number = document.createElement("input");
    number.type = "number";
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    bindInput(control, number, slider ? "-number" : "");
    if (slider) {
      const numberLabel = document.createElement("label");
      numberLabel.className = "effect-sr-only";
      numberLabel.htmlFor = number.id;
      numberLabel.textContent = `${labelText}数值`;
      inputs.append(numberLabel);
    }
    inputs.append(number);
    control.body.append(inputs);
    control.readValue = () => {
      if (!number.value.trim() || number.validity.badInput) return null;
      const value = Number(number.value);
      if (!Number.isFinite(value) || value < min || value > max || number.validity.stepMismatch) return null;
      return value;
    };
    control.validate = () => {
      const value = control.readValue();
      control.setError(value === null ? `请输入 ${min}–${max} 内的有效数值（步长 ${step}）；空白或无效值不会提交。` : "");
      return value;
    };
    control.setValue = (rawValue, commit = true, preserveInput = false) => {
      if (!preserveInput) number.value = String(rawValue);
      const value = control.validate();
      if (value === null) return;
      if (range) range.value = String(value);
      if (commit) onChange(value);
    };
    range?.addEventListener("input", () => control.setValue(range.value));
    number.addEventListener("input", () => {
      control.setValue(number.value, true, true);
      control.onInput?.();
    });
    number.addEventListener("change", () => {
      control.setValue(number.value);
      control.onInput?.();
    });
    control.setValue(state[key], false);
  };

  const addSelect = (section, key, labelText, options, onChange, help) => {
    const control = createControl(section, key, labelText, help);
    const select = document.createElement("select");
    bindInput(control, select);
    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    control.body.append(select);
    control.setValue = (value, commit = true) => {
      select.value = String(value);
      if (commit) onChange(select.value);
    };
    select.addEventListener("change", () => control.setValue(select.value));
    control.setValue(state[key], false);
  };

  const addDateTime = (section, key, labelText, onChange, help) => {
    const control = createControl(section, key, labelText, help);
    const input = document.createElement("input");
    input.type = "datetime-local";
    input.step = "60";
    bindInput(control, input);
    control.body.append(input);
    control.setValue = (value, commit = true) => {
      input.value = value;
      const valid = !!input.value && input.validity.valid;
      control.setError(valid ? "" : "请输入有效的 UTC 日期和时间；空白不会提交。");
      if (valid && commit) onChange(input.value);
    };
    input.addEventListener("change", () => control.setValue(input.value));
    control.setValue(state[key], false);
    return input;
  };

  const addReadOnly = (section, key, labelText, initialValue, help) => {
    const control = createControl(section, key, labelText, help, `${initialValue} m`);
    const output = document.createElement("output");
    bindInput(control, output);
    control.body.append(output);
    control.setValue = (value) => { output.value = `${value} m`; };
    control.setValue(initialValue);
  };

  const commitValue = (key, apply) => (value) => {
    if (state[key] === value) return;
    state[key] = value;
    apply(value);
  };
  const updateCloud = (key, value) => fx.update({ cloud: { [key]: value } });
  const updateVolumetricLight = (key, value) => fx.update({
    volumetricLight: { mode: state.volumetricLightMode, [key]: value },
  });
  const layerVector = (prefix) => [0, 1, 2, 3].map((index) => state[`${prefix}${index}`]);
  const updateHbao = () => fx.update({ hbao: buildPipelineOptions(state).hbao });
  const refreshCloudTops = () => {
    for (let index = 0; index < 3; index++) {
      controls.get(`cloudTop${index}`).setValue(state[`altitude${index}`] + state[`height${index}`]);
    }
  };
  const refreshDependencies = () => {
    const setDependency = (key, enabled) => {
      const control = controls.get(key);
      const disabled = !enabled;
      if (control.inputs.some((input) => input.disabled !== disabled)) control.setValue(state[key], false);
      control.setDisabled(disabled);
      if (disabled) control.setError("");
    };
    for (let index = 0; index < 3; index++) setDependency(`layerType${index}`, state.layerTypesEnabled);
    for (const key of ["lodNear", "lodFar"]) setDependency(key, state.lodEnabled);
    for (const key of ["altitudeFadeStart", "altitudeFadeEnd"]) setDependency(key, state.altitudeFadeEnabled);
    const volumetricEnabled = state.volumetricLightMode === "volumetric";
    const legacyEnabled = state.volumetricLightMode === "legacy";
    for (const key of ["volumetricDensity", "volumetricIntensity", "volumetricLayerDepth", "volumetricMaxDistance", "volumetricAnisotropy", "volumetricQuality"]) {
      setDependency(key, volumetricEnabled);
      controls.get(key).wrapper.hidden = legacyEnabled;
    }
    for (const key of ["sunShaftsIntensity", "hazeCloudAttached", "hazeGroundDensityScale", "hazeViewDistance", "hazeVolumeLength", "hazeDirectLightScale", "hazeHeightFalloff", "hazeAnisotropy", "hazeQuality", "hazeSunR", "hazeSunG", "hazeSunB", "maxShadowLengthRayDistance"]) {
      const requiresLocalLayer = ["hazeGroundDensityScale", "hazeViewDistance", "hazeVolumeLength"].includes(key);
      setDependency(key, legacyEnabled && (!requiresLocalLayer || state.hazeCloudAttached));
      controls.get(key).wrapper.hidden = volumetricEnabled;
    }
    if (activeHelp?.wrapper.hidden) closeHelp();
    for (const key of ["hbaoIntensity", "hbaoMaxRadius", "hbaoBias", "hbaoFrustumLength", "hbaoBlackPoint", "hbaoWhitePoint", "hbaoGamma"]) {
      setDependency(key, state.hbaoEnabled);
    }
    activeHelp?.refreshHelp();
  };
  const updateLayerTypes = () => {
    updateCloud("layerTypes", state.layerTypesEnabled ? [state.layerType0, state.layerType1, state.layerType2] : null);
    refreshDependencies();
  };
  const validatePair = (firstKey, lastKey, labelText) => {
    const first = controls.get(firstKey);
    const last = controls.get(lastKey);
    const start = first.validate();
    const end = last.validate();
    if (start === null || end === null) return null;
    if (start >= end) {
      const message = `${labelText}必须完整且递增：起点要小于终点；尚未提交。`;
      first.setError(message);
      last.setError(message);
      return null;
    }
    return [start, end];
  };
  const commitCloudRange = (enabledKey, firstKey, lastKey, apiKey, labelText) => {
    const pair = validatePair(firstKey, lastKey, labelText);
    if (!pair || !state[enabledKey]) return;
    if (state[firstKey] === pair[0] && state[lastKey] === pair[1]) return;
    state[firstKey] = pair[0];
    state[lastKey] = pair[1];
    updateCloud(apiKey, pair);
  };

  const weather = createSection("基础天气", true);
  addToggle(weather, "enabled", "天空效果总开关", commitValue("enabled", (value) => fx.update({ enabled: value })),
    "API：enabled。开启/关闭整条天空效果，不是删除 Viewer 或地形。\n单位：布尔值；开时渲染云、大气和光晕，关时保留参数便于再次启用。\nHBAO/SMAA 有独立开关；关闭可减少天空后处理成本，重新开启需等待历史采样稳定。");
  addToggle(weather, "systemLight", "跟随系统太阳", commitValue("systemLight", (value) => fx.update({ systemLight: value })),
    "API：systemLight。开启时使用 Cesium 时钟决定的太阳方向；关闭时使用管线自定义方向。\n单位：布尔值；不是日光亮度调节。关闭后本示例不提供自定义太阳编辑，改变时间可能不再改变效果光源。\n观察 Godray 应同时检查太阳角度和云影；切换后需要重新积累稳定画面。");
  addRange(weather, "coverage", "云量覆盖度", 0, 1, 0.01, commitValue("coverage", (value) => fx.update({ coverage: value })),
    "API：coverage。控制天气场的云量覆盖，不是云密度或曝光。\n单位：0–1；调大云区更广，调小留出更多晴空。haze 的覆盖率调制在 0.2–0.4 线性夹取，0.34 对应 0.7，不是已饱和。\n云量还受高度淡出影响；更多云可能增加有效采样工作，调节会清除云历史。");
  for (const axis of ["X", "Y"]) {
    const key = `weather${axis}`;
    addRange(weather, key, `风速 ${axis}`, -0.005, 0.005, 0.00001,
      commitValue(key, () => fx.update({ localWeatherVelocity: [state.weatherX, state.weatherY] })),
      `API：localWeatherVelocity[${axis === "X" ? 0 : 1}]。天气纹理坐标的 ${axis} 分量速度，不是地理东西/南北风。\n单位：纹理坐标/秒，不能当作 m/s；绝对值调大移动更快，调小更慢，0 停止该方向，负值反向。\n两轴一起组成风向；速度不改变云量或采样预算，过快运动可能放大时域噪声和拖影。`);
  }

  const cloud = createSection("三层云", true);
  addToggle(cloud, "layerTypesEnabled", "启用分层云型", commitValue("layerTypesEnabled", updateLayerTypes),
    "API：cloud.layerTypes。开启时使用三个独立云型，关闭提交 null，回退原有云形。\n单位：布尔开关；不自动改变任何云底、厚度、密度或细节。关闭时保留最后选择并禁用三个下拉项，帮助仍可查看。\n重新开启恢复原选择；切换云形会清除云历史，不会让第三层自动投影云影。");
  for (let index = 0; index < 3; index++) {
    const layer = index + 1;
    const shadowNote = index === 2 ? "第三层目前不投影云影，不能靠它制造投影 Godray。" : "前两层参与云影；还需有效太阳方向和介质交会才有光束。";
    const typeKey = `layerType${index}`;
    addSelect(cloud, typeKey, `第 ${layer} 层云型`, [
      ["cumulus", "积云 · cumulus"],
      ["altocumulus", "高积云 · altocumulus"],
      ["cirrus", "卷云 · cirrus"],
    ], commitValue(typeKey, updateLayerTypes),
    `API：cloud.layerTypes[${index}]。选择该层形态，不是自动设置高度的天气预设。\n枚举（无单位）：cumulus 为蓬松积云团；altocumulus 为较小、分散的高积云块；cirrus 为纤细卷云。没有数值大小顺序。\n分层云型关闭时不生效但保留选择；切换会清历史，细碎形态更需降噪。${shadowNote}`);
    const altitudeKey = `altitude${index}`;
    addRange(cloud, altitudeKey, `第 ${layer} 层云底`, 0, 20000, 1, commitValue(altitudeKey, () => {
      updateCloud("altitudes", layerVector("altitude"));
      refreshCloudTops();
    }),
    `API：cloud.altitudes[${index}]。该层云底，不是云顶，参照渲染行星的高度基准，不是距当地山面的高度。\n单位：米；调大抬高整层，调小降低；云顶始终等于云底加厚度。四分量数组的预留 w 保持原值。\n高度变化影响视线、云影和局部散射薄层的交会，并清除云历史。${shadowNote}`);
    const heightKey = `height${index}`;
    addRange(cloud, heightKey, `第 ${layer} 层厚度`, 0, 10000, 1, commitValue(heightKey, () => {
      updateCloud("heights", layerVector("height"));
      refreshCloudTops();
    }),
    `API：cloud.heights[${index}]。云底到云顶的垂直厚度。\n单位：米；调大云顶升高、有效云路可能变长，调小变薄，0 为零厚层；不会移动云底。预留 w 不变。\n厚度与密度共同决定不透明度，厚云可能增加积分工作；改变会清历史，不保证光束增强。`);
    const densityKey = `density${index}`;
    addRange(cloud, densityKey, `第 ${layer} 层密度缩放`, 0, index === 2 ? 0.05 : 1, index === 2 ? 0.0001 : 0.001,
      commitValue(densityKey, () => updateCloud("densityScales", layerVector("density"))),
      `API：cloud.densityScales[${index}]。该层消光/散射的密度倍率，不是覆盖率或曝光。\n单位：无量纲缩放；调大云更厚重、透光减少，调小更透明，0 关闭该层介质；第三层使用更细步长。预留 w 不变。\n与厚度、照明和云影联动，过密可能使亮部裁白或内部过暗；改变会清历史。${shadowNote}`);
    const detailKey = `detail${index}`;
    addRange(cloud, detailKey, `第 ${layer} 层细节侵蚀`, 0, 1, 0.01,
      commitValue(detailKey, () => updateCloud("shapeDetailAmounts", layerVector("detail"))),
      `API：cloud.shapeDetailAmounts[${index}]。高频形状侵蚀的混合量。\n单位：0–1；调大增加边缘破碎和细纹，调小保留更平滑的云团轮廓，0 不加此细节。预留 w 不变。\n不是亮度；细节过多易在远处变成亚像素闪烁，与 LOD/时域降噪共同调整，改变会清历史。`);
    addReadOnly(cloud, `cloudTop${index}`, `第 ${layer} 层云顶（只读）`, state[altitudeKey] + state[heightKey],
      `API：cloud.altitudes[${index}] + cloud.heights[${index}]（派生值，无独立 setter）。\n单位：米；云底或厚度调大时云顶升高，调小时降低。此项只校核三层几何，不向管线提交参数，也不增加 GPU 工作。\n临时无效的云底/厚度输入不会参与计算；第三层同样按云底加厚度计算，不能把 altitude2 当云顶。`);
  }

  const lighting = createSection("云照明");
  addRange(lighting, "skyIrradianceScale", "天空对云补光", 0, 5, 0.01,
    commitValue("skyIrradianceScale", (value) => updateCloud("skyIrradianceScale", value)),
    "API：cloud.skyIrradianceScale。天空辐照度对云体的补光倍率。\n单位：无量纲；调大暗面更亮，调小降低天空补光，0 移除此补光。不改变地表增益或全局曝光。\n过高会抹平云层明暗，对 Godray 直射增益不是替代；不增加采样预算，调节会清云历史。");
  addRange(lighting, "groundIrradianceScale", "地面反射对云补光", 0, 5, 0.01,
    commitValue("groundIrradianceScale", (value) => updateCloud("groundIrradianceScale", value)),
    "API：cloud.groundIrradianceScale。地面反射辐照度对云体的补光倍率。\n单位：无量纲；调大云下部更亮，调小补光更弱，0 移除此补光。不等于地表光照增益 irradianceScale。\n受大气和地面反射估计影响，过高会冲淡暗部；不增加采样预算，调节会清云历史。");

  const godray = createSection("Godray", true);
  addSelect(godray, "volumetricLightMode", "体积光模式", [
    ["volumetric", "独立体积光 · volumetric"], ["legacy", "旧 haze · legacy"], ["off", "关闭 · off"],
  ], commitValue("volumetricLightMode", () => {
    fx.update({ volumetricLight: buildPipelineOptions(state).volumetricLight });
    refreshDependencies();
  }),
  "API：volumetricLight.mode。volumetric 使用独立低分辨率体积光及其历史，legacy 使用现有 cloud.haze* 算法，off 关闭两条额外体积光路径。\n两条路径互斥；切换保留各自参数并重新积累历史。关闭时两组数值禁用，仍可切换模式。仅提交旧 cloud.haze* 且未显式传新 mode 的 API 调用自动选择 legacy。");
  addRange(godray, "volumetricDensity", "体积光介质密度", 0, 0.0001, 0.000001,
    commitValue("volumetricDensity", (value) => updateVolumetricLight("density", value)),
    "API：volumetricLight.density。独立体积光介质的消光密度。\n单位：米的倒数，非负有限值；调大同时增加散射和消光，调小更透明，0 不产生此介质。\n仅 volumetric 模式生效；不改变云体密度，改变会清除独立体积光历史。");
  addRange(godray, "volumetricIntensity", "体积光散射亮度", 0, 10, 0.1,
    commitValue("volumetricIntensity", (value) => updateVolumetricLight("intensity", value)),
    "API：volumetricLight.intensity。散射亮度的非负倍率。\n单位：无量纲；调大增强散射亮部，调小减弱，0 移除散射亮度但保留介质消光。\n仅 volumetric 模式生效；不改变介质密度、云体照明或全局曝光，改变会清除独立体积光历史。");
  addRange(godray, "volumetricLayerDepth", "云底体积层厚度", 1, 20000, 1,
    commitValue("volumetricLayerDepth", (value) => updateVolumetricLight("layerDepth", value)),
    "API：volumetricLight.layerDepth。参与投影的云底向下延伸的体积层厚度。\n单位：正有限米数；调大增加垂直介质范围，调小使光束层更薄，不移动云层本身。\n仅 volumetric 模式生效；实际视线还受场景深度和云前缘约束，改变会清除独立体积光历史。");
  addRange(godray, "volumetricMaxDistance", "体积光最大积分距离", 1, 100000, 1,
    commitValue("volumetricMaxDistance", (value) => updateVolumetricLight("maxDistance", value)),
    "API：volumetricLight.maxDistance。沿相机视线积分体积光的最大距离。\n单位：正有限米数；调大允许更远介质参与，调小更早停止，还受场景深度限制。\n仅 volumetric 模式生效；同时决定聚焦云影接收范围，不改变地表大范围云影或主云追踪距离，改变会清除独立体积光历史。");
  addRange(godray, "volumetricAnisotropy", "体积光散射方向性", 0, 0.9, 0.01,
    commitValue("volumetricAnisotropy", (value) => updateVolumetricLight("anisotropy", value)),
    "API：volumetricLight.anisotropy。散射相位的前向偏好 g。\n单位：无量纲，0–0.9；0 为各向同性，调大更集中于朝太阳的观察方向。\n仅 volumetric 模式生效；需结合太阳夹角、密度和亮度检查，改变会清除独立体积光历史。");
  addSelect(godray, "volumetricQuality", "体积光质量", [
    ["low", "低 · low"], ["balanced", "平衡 · balanced"], ["high", "高 · high"],
  ], commitValue("volumetricQuality", (value) => updateVolumetricLight("quality", value)),
  "API：volumetricLight.quality。分辨率比例 / 积分步数 / 可见性图尺寸：low = 0.25 / 24 / 512；balanced = 0.5 / 48 / 1024；high = 0.5 / 64 / 2048。\n仅 volumetric 模式生效；更高预算增加 GPU 工作，不保证在任意场景达到固定耗时。切换会重建对应资源并清除独立体积光历史。");
  addRange(godray, "sunShaftsIntensity", "穿云光介质强度", 0, 1, 0.01,
    commitValue("sunShaftsIntensity", (value) => updateCloud("hazeDensityScale", value * 0.0001)),
    `API：cloud.hazeDensityScale = sunShaftsIntensity × 0.0001。控制 haze 介质密度，不是云密度或曝光。\n单位：面板为缩放量；项目默认 ${CONTROL_DEFAULTS.sunShaftsIntensity} 对应 ${DEFAULT_OPTIONS.cloud.hazeDensityScale}。调大散射和消光都更强，调小更透明，0 关闭额外穿云光。\n需要有效太阳、云影、介质和视线交会；过大易形成灰幕。覆盖率及高度淡出会联动，改变会清历史。`);
  addToggle(godray, "hazeCloudAttached", "世界固定局部薄层", commitValue("hazeCloudAttached", (value) => {
    updateCloud("hazeCloudAttached", value);
    refreshDependencies();
  }), () =>
    `API：cloud.hazeCloudAttached，项目默认 ${DEFAULT_OPTIONS.cloud.hazeCloudAttached}。\n单位：布尔值；开启时在参与投影云层的云底附近有限、世界固定薄层积分，近地层由 cloud.hazeGroundDensityScale 独立控制；关闭回到传统行星表面以上的指数高度雾。\n当前${state.hazeCloudAttached ? `开启：${state.hazeViewDistance} m 是观察上限，累计候选散射区间上限为 ${state.hazeVolumeLength} m，近地薄雾强度为 ${state.hazeGroundDensityScale}，空路不铺雾也不计入体积长度` : "关闭：HAZE 与 SHADOW_LENGTH 都受旧大气阴影长度限制，近地强度与新两距离暂不生效"}。\n不是随真实山地高度的雾，也未实现太阳方向的地形阴影；仍受场景深度和云前缘遮挡。切换清历史，光束不保证在任意镜头出现。`);
  addRange(godray, "hazeGroundDensityScale", "近地薄雾强度", 0, 1, 0.05,
    commitValue("hazeGroundDensityScale", (value) => updateCloud("hazeGroundDensityScale", value)), () =>
    `API：cloud.hazeGroundDensityScale，项目默认 ${DEFAULT_OPTIONS.cloud.hazeGroundDensityScale}。\n单位：0–1 密度倍率；仅世界固定局部薄层模式生效，当前${state.hazeCloudAttached ? "生效" : "不生效，值保留"}。0 关闭近地雾，仅保留云底薄层；1 恢复原有近地层。调大增加近地散射和消光，不改变云底薄层密度。\n不影响传统指数高度雾，也不随真实山地抬升；修改清历史。`);
  addRange(godray, "hazeDirectLightScale", "haze 日光直射增益", 0, 8, 0.1,
    commitValue("hazeDirectLightScale", (value) => updateCloud("hazeDirectLightScale", value)),
    `API：cloud.hazeDirectLightScale，项目默认 ${DEFAULT_OPTIONS.cloud.hazeDirectLightScale}。\n单位：非负无量纲倍率；调大只增强 haze 的太阳直射散射，调小降低直射亮部，0 移除该项。\n不增加消光、天空补光、云体照明或全局曝光，不制造不存在的云影；过大易在朝太阳方向裁白，不增加采样预算但调节清历史。`);
  addRange(godray, "hazeViewDistance", "局部光束最大观察距离", 1, 100000, 1,
    commitValue("hazeViewDistance", (value) => updateCloud("hazeViewDistance", value)), () =>
    `API：cloud.hazeViewDistance，项目默认 ${DEFAULT_OPTIONS.cloud.hazeViewDistance}。\n单位：正有限米数；仅局部模式使用，当前${state.hazeCloudAttached ? "生效" : "不生效，值保留"}。调大可看到更远的候选薄层，调小更早退出，观察末端平滑淡出。\n观察距离不表示从相机起连续铺雾；空空间不增加介质。实际贡献仍受场景深度、云前缘及体积总长度限制，远处可能更难稳定；改变清历史。`);
  addRange(godray, "hazeVolumeLength", "累计局部散射区间上限", 1, 20000, 1,
    commitValue("hazeVolumeLength", (value) => updateCloud("hazeVolumeLength", value)), () =>
    `API：cloud.hazeVolumeLength，项目默认 ${DEFAULT_OPTIONS.cloud.hazeVolumeLength}。\n单位：正有限米数；仅局部模式使用，当前${state.hazeCloudAttached ? "生效" : "不生效，值保留"}。按近到远累积候选散射区间，调大可积分更多介质路程，调小减少积分长度；空路不算。\n累计区间上限不是距相机的硬裁剪，也不是主云追踪距离；实际长度同时受观察上限和深度限制。总样本仍由质量档决定，长区间可能稀释采样、增强灰雾或拖影；改变清历史。`);
  addRange(godray, "hazeHeightFalloff", "haze 高度/薄层密度尺度", 1, 10000, 1,
    commitValue("hazeHeightFalloff", (value) => updateCloud("hazeHeightFalloff", value)), () =>
    `API：cloud.hazeHeightFalloff。\n单位：正有限米数；当前${state.hazeCloudAttached ? "局部模式：控制世界固定薄层的密度衰减尺度，约两倍尺度外平滑归零，参与投影云层的薄层位于云底下方" : "传统模式：控制渲染行星表面以上的指数衰减，高度到一个尺度时密度为 1/e"}。\n调大垂直分布更厚、远离高度基准处仍有更多介质；调小更集中，不是实际山地上方的雾高。与累计区间上限联动，过大易铺雾，改变清历史。`);
  addRange(godray, "hazeAnisotropy", "haze 散射方向性", 0, 0.9, 0.01,
    commitValue("hazeAnisotropy", (value) => updateCloud("hazeAnisotropy", value)),
    "API：cloud.hazeAnisotropy。散射相位的前向偏好，不是光束宽度。\n单位：无量纲 g，0–0.9；调大更集中于朝太阳的前向散射，调小角度分布更均匀，0 为各向同性。\n必须与太阳夹角、直射增益和介质密度共同看；高值可能让正对太阳过曝、其它方向很弱，不增加样本预算但调节清历史。");
  addSelect(godray, "hazeQuality", "haze 积分质量", [
    ["low", "低 · low"], ["balanced", "平衡 · balanced"], ["high", "高 · high"],
  ], commitValue("hazeQuality", (value) => updateCloud("hazeQuality", value)),
  "API：cloud.hazeQuality。选择积分预算，不是亮度档。\n枚举（无单位）：low = 16 积分点 × 1 次云影读取；balanced = 24 × 2；high = 32 × 4。局部模式是整条视线的总预算，不是每层分别乘一次。\n提高可改善阴影过渡和噪声但增加 GPU 工作，降低更快但易欠采样；不会凭空增加光束，切换清历史。");
  for (const [channel, component] of [["R", 0], ["G", 1], ["B", 2]]) {
    const key = `hazeSun${channel}`;
    addRange(godray, key, `日光线性 RGB · ${channel}`, 0, 10, 0.01,
      commitValue(key, () => updateCloud("hazeSunColor", [state.hazeSunR, state.hazeSunG, state.hazeSunB])),
      `API：cloud.hazeSunColor[${component}]。haze 日光的线性 RGB ${channel} 分量，不是 CSS sRGB 字节或取色器值。\n单位：非负线性系数，1 保持该通道，允许大于 1；调大增强该通道，调小减弱，0 移除该通道。项目默认 RGB 为 [${DEFAULT_OPTIONS.cloud.hazeSunColor.join(", ")}]，不做隐式色彩转换。\n三通道共同决定色调，与直射增益/曝光联动；不改变云色或样本预算，过大可能裁白，调节清历史。`, false);
  }
  addRange(godray, "maxShadowLengthRayDistance", "大气阴影长度上限", 1, 200000, 1,
    commitValue("maxShadowLengthRayDistance", (value) => updateCloud("maxShadowLengthRayDistance", value)), () =>
    `API：cloud.maxShadowLengthRayDistance，保留旧字段，项目默认 ${DEFAULT_OPTIONS.cloud.maxShadowLengthRayDistance} m。\n单位：正有限米数；当前${state.hazeCloudAttached ? "局部模式：只限制旧 SHADOW_LENGTH 大气阴影长度路径，HAZE 使用新观察距离/累计区间长度" : "传统模式：同时限制 HAZE 和 SHADOW_LENGTH 的光路"}。\n调大允许更长的大气阴影积分，调小更近处截断；不是主云 LOD 距离，也不扩展云影级联。较大范围可能增加工作或降低阴影稳定性，调节清历史。`);

  const stability = createSection("云距离与稳定性");
  addToggle(stability, "lodEnabled", "启用云距离 LOD", commitValue("lodEnabled", () => {
    updateCloud("lodRange", state.lodEnabled ? [state.lodNear, state.lodFar] : null);
    refreshDependencies();
  }),
    "API：cloud.lodRange。开启使用近/远采样阈值，关闭提交 null。\n单位：布尔开关；LOD 只降采样成本，不按距离删云或直接降低透明度。关闭后距离控件禁用但保留最后合法数对。\n重新开启恢复数对；关闭可能显著增加远云采样成本，切换会清历史。与相机高度淡出是不同机制。");
  const updateLodRange = () => commitCloudRange("lodEnabled", "lodNear", "lodFar", "lodRange", "LOD 距离");
  addRange(stability, "lodNear", "LOD 近距离阈值", 0, 1000000, 1000, updateLodRange,
    "API：cloud.lodRange[0]。近距高细节采样档的阈值。\n单位：米；调大把高细节保留到更远，调小更早降采样；必须小于远距离，数对完整且递增才一起提交。\n只有 LOD 开启时生效，不删云；较大值更费 GPU，过小可能放大欠采样和闪烁，与降噪联动，修改清历史。");
  addRange(stability, "lodFar", "LOD 远距离阈值", 0, 1000000, 1000, updateLodRange,
    "API：cloud.lodRange[1]。进入更粗远距采样档的阈值。\n单位：米；调大保留中档到更远，调小更早进入粗档；必须大于近距离，两项原子提交。\n不是主云最大可见距离或 haze 观察距离；大值增加采样成本，小值可能让远云更难稳定，修改清历史。");
  for (const key of ["lodNear", "lodFar"]) {
    controls.get(key).onInput = () => validatePair("lodNear", "lodFar", "LOD 距离");
  }
  addToggle(stability, "altitudeFadeEnabled", "启用相机高度淡出", commitValue("altitudeFadeEnabled", () => {
    updateCloud("altitudeFadeRange", state.altitudeFadeEnabled ? [state.altitudeFadeStart, state.altitudeFadeEnd] : null);
    refreshDependencies();
  }),
    "API：cloud.altitudeFadeRange。开启按相机椭球高度降低云量，关闭提交 null。\n单位：布尔开关；不是移动云底，也不是随实际地形计算高度。关闭时保留起止数对并禁用子项，帮助仍可查看。\n淡出联动云体、云影及光束，降低高空亚像素闪烁；重新开启恢复最后合法范围，切换清历史。");
  const updateAltitudeFade = () => commitCloudRange("altitudeFadeEnabled", "altitudeFadeStart", "altitudeFadeEnd", "altitudeFadeRange", "高度淡出范围");
  addRange(stability, "altitudeFadeStart", "相机高度淡出起点", 0, 200000, 1000, updateAltitudeFade,
    "API：cloud.altitudeFadeRange[0]。相机椭球高度到此开始减少云量。\n单位：米；调大更高才开始淡出，调小较低就开始；必须小于终点，数对完整递增才提交。\n不是第一层云底；较大值保留更多高空云和云影但可能闪烁，关闭淡出时保留此值，修改清历史。");
  addRange(stability, "altitudeFadeEnd", "相机高度淡出终点", 0, 200000, 1000, updateAltitudeFade,
    "API：cloud.altitudeFadeRange[1]。相机椭球高度到此完成云量淡出。\n单位：米；调大将淡出延续到更高，调小更早完成；必须大于起点，两项原子提交。\n不是第三层云顶；云影和光束随有效覆盖率联动，大值可能留下高空亚像素噪声，关闭淡出时保留此值，修改清历史。");
  for (const key of ["altitudeFadeStart", "altitudeFadeEnd"]) {
    controls.get(key).onInput = () => validatePair("altitudeFadeStart", "altitudeFadeEnd", "高度淡出范围");
  }
  addRange(stability, "denoiseTemporalAlpha", "普通时域当前帧权重", 0, 1, 0.01,
    commitValue("denoiseTemporalAlpha", (value) => updateCloud("denoise", { temporalAlpha: value })),
    "API：cloud.denoise.temporalAlpha。普通时域混合的当前帧权重，也用于非本帧采样相位。\n单位：0–1；调小更依赖历史、静止时更稳定但可能拖影，调大更快跟随当前帧但暴露噪声。\n实际权重还受暖启动、距离、深度和运动拒绝保护；不是曝光，不改变主云积分预算。");
  addRange(stability, "denoiseCurrentFrameAlpha", "本帧采样相位权重", 0, 1, 0.01,
    commitValue("denoiseCurrentFrameAlpha", (value) => updateCloud("denoise", { currentFrameAlpha: value })),
    "API：cloud.denoise.currentFrameAlpha。时域升采样中本帧 Bayer 相位的当前帧权重。\n单位：0–1；调小加强历史积累、抑制闪烁但可能拖影，调大让新采样更快生效但更容易看到原始噪声。\n与 temporalAlpha/运动权重及距离保护共同作用，不改变采样相位数量或图像亮度。");
  addRange(stability, "denoiseMotionAlpha", "相机运动当前帧权重", 0, 1, 0.01,
    commitValue("denoiseMotionAlpha", (value) => updateCloud("denoise", { motionAlpha: value })),
    "API：cloud.denoise.motionAlpha。相机移动时的当前帧混合权重。\n单位：0–1；调大减少旧历史拖影但更容易暴露采样噪声，调小保留更多有效历史；0 使用普通降噪权重。\n还受重投影、深度/运动拒绝约束，不是风速或快门；应分别检查移动中和停止后的稳定性。");
  addRange(stability, "denoiseVarianceGamma", "历史方差裁剪宽度", 0.1, 5, 0.1,
    commitValue("denoiseVarianceGamma", (value) => updateCloud("denoise", { varianceGamma: value })),
    "API：cloud.denoise.varianceGamma。邻域标准差裁剪区间的倍率。\n单位：正无量纲值；调大放宽历史颜色保留、可能更稳但易残影，调小更严格排除旧色但可能让云闪烁或收缩。\n不是场景/HBAO Gamma；与当前帧权重、运动和地形边界保护联动，不增加主云积分样本。");
  addRange(stability, "denoiseSpatialFilterStrength", "空间重建滤波强度", 0, 1, 0.01,
    commitValue("denoiseSpatialFilterStrength", (value) => updateCloud("denoise", { spatialFilterStrength: value })),
    "API：cloud.denoise.spatialFilterStrength。深度/透明度感知的邻域重建混合量。\n单位：0–1；调大更平滑但会损失细节，调小更锐利但更易噪声，0 关闭此邻域平滑。\n远云仍有距离相关保护，不能简单当最终滤波百分比；开启需邻域纹理读取，与时域参数配合检查细节和拖影。");

  const color = createSection("色调地表");
  addSelect(color, "toneMappingMode", "色调映射", [
    ["7", "AgX"],
    ["8", "Neutral"],
    ["9", "ACES"],
    ["10", "Linear"],
    ["11", "Reinhard"],
    ["12", "Cineon"],
  ], commitValue("toneMappingMode", (value) => fx.update({ toneMappingMode: Number(value) })),
  "API：toneMappingMode。选择 HDR 到显示亮度的映射曲线。\n枚举（无单位）：7 AgX 压缩高光并控制高亮色彩；8 Neutral 较中性的高光压缩；9 ACES 电影式对比；10 Linear 线性映射，强光易裁白；11 Reinhard 渐进压缩亮度；12 Cineon 胶片式曲线。没有调大/调小的统一含义。\n与曝光、Gamma 联动，不增加真实光束；切换会重建相关管线，应避免连续反复切换。");
  addRange(color, "toneMappingExposure", "曝光", 0, 20, 0.1,
    commitValue("toneMappingExposure", (value) => fx.update({ toneMappingExposure: value })),
    "API：toneMappingExposure。色调映射前的亮度倍率，不是以 EV 为单位的快门设置。\n单位：无量纲；调大全局效果更亮，调小更暗，0 会压掉该映射输入亮度。\n与色调曲线和 HDR 联动，过大可能裁白天空/云/地表；不增加散射或云影，不应拿曝光伪造 Godray，不改变采样预算。");
  addRange(color, "irradianceScale", "地表光照增益", 0, 2, 0.01,
    commitValue("irradianceScale", (value) => fx.update({ irradianceScale: value })),
    "API：irradianceScale。独立控制地表光照增益，不改变云体补光。\n单位：非负无量纲倍率；调大地表更亮，调小更暗。官方 Cesium 已完成底图光照，示例用 0.15 避免与曝光叠加泛白。\n与地表原始材质及色调映射联动，不增加样本预算；别通过抬高此值增强天空光束。");
  addRange(color, "aerialPerspectiveStrength", "地表大气透视", 0, 1, 0.01,
    commitValue("aerialPerspectiveStrength", (value) => fx.update({ aerialPerspectiveStrength: value })),
    "API：aerialPerspectiveStrength。地表合成时的大气透视混合强度。\n单位：0–1；调大远景更受大气衰减/散射影响，调小保留更多原始地表对比，0 关闭这项混合。\n不改变天空/云的散射，也不是 Godray 密度；过大可能让底图发白，采样预算不随强度增加。");
  addRange(color, "darkParamY", "夜间辉光", 0, 1, 0.01,
    commitValue("darkParamY", (value) => fx.update({ darkParamY: value })),
    "API：darkParamY。夜间天空辉光的调制分量。\n单位：0–1 无量纲；调大增加此夜间辉光，调小减弱；白天可能不明显。\n依赖太阳高度和时间，不是地表照明或 Godray 日光直射增益；过高可能冲淡夜空暗部，不改变积分预算。");
  addRange(color, "bloomIntensity", "太阳泛光强度", 0, 2, 0.001,
    commitValue("bloomIntensity", (value) => fx.update({ bloomIntensity: value })),
    "API：bloomIntensity。太阳泛光/光晕效果强度。\n单位：无量纲；调大亮部扩散更明显，调小更弱，0 关闭此强度。示例保留 0.002。\n与曝光和色调映射联动；泛光不是真实体积散射，不能代替 Godray。强度不扩展积分预算，但过高会糊掉明暗层次。");

  const hbao = createSection("SMAA / HBAO");
  addToggle(hbao, "smaaEnabled", "SMAA 抗锯齿", commitValue("smaaEnabled", (value) => fx.update({ smaa: value })),
    "API：smaa。最终图像的亚像素形态学抗锯齿开关。\n单位：布尔值；开启降低屏幕边缘锯齿，关闭保留原始边缘。不是云的时域降噪，不能消除云体积分噪声或拖影。\n开启增加屏幕空间后处理工作；首次启用需准备相关资源，与分辨率和 HDR 结果联动。");
  addToggle(hbao, "hbaoEnabled", "HBAO 环境光遮蔽", commitValue("hbaoEnabled", () => {
    updateHbao();
    refreshDependencies();
  }),
    "API：hbao。开启时提交完整的本地七参数对象，关闭提交 false。\n单位：布尔开关；开启增强建筑/地形接触阴影，关闭减少该屏幕空间后处理。禁用时数值保留，重新开启恢复完整参数。\n依赖场景深度，不能产生太阳方向地形阴影或替代云影；开启增加 AO/滤波工作，帮助按钮始终可用。");
  addRange(hbao, "hbaoIntensity", "HBAO 强度", 0, 300, 1, commitValue("hbaoIntensity", updateHbao),
    "API：hbao.intensity。AO 输出的强度指数。\n单位：非负无量纲；调大接触遮蔽更暗，调小更弱，0 不产生该 AO 对比。\n与半径、黑白点和 HBAO Gamma 联动；过高易产生脏暗边缘，不改变方向/步数预算，关闭 HBAO 时保留。");
  addRange(hbao, "hbaoMaxRadius", "HBAO 最大半径", 1, 100, 1, commitValue("hbaoMaxRadius", updateHbao),
    "API：hbao.maxRadius。视空间中参与遮蔽评估的最大邻域半径。\n单位：米；调大阴影影响范围更宽，调小只保留较近接触遮蔽。不是屏幕像素半径。\n透视投影决定实际屏幕覆盖，过大易光晕/跨物体污染；固定采样预算可能不足，关闭 HBAO 时保留。");
  addRange(hbao, "hbaoBias", "HBAO 角度偏移", 0, 0.5, 0.01, commitValue("hbaoBias", updateHbao),
    "API：hbao.bias。遮蔽切线计算的角度偏移，以 tan(bias) 加到切线上。\n单位：弧度；调大减少自遮蔽/暗痤疮但弱化接触阴影，调小保留细小遮蔽但可能噪声更明显。\n不是高度或深度米数，不改变采样预算；与半径、深度精度联动，关闭 HBAO 时保留。");
  addRange(hbao, "hbaoFrustumLength", "HBAO 视锥长度", 1000, 1000000, 1000, commitValue("hbaoFrustumLength", updateHbao),
    "API：hbao.frustumLength。相机视空间深度的 AO 处理上限。\n单位：米；调大更远地表也参与，调小更早停止处理远景；不是云或 haze 的追踪距离。\n远景深度精度较差，过大可能噪声/污染，更多像素参与会增加工作；关闭 HBAO 时保留。");
  addRange(hbao, "hbaoBlackPoint", "HBAO 黑点", 0, 0.99, 0.01, commitValue("hbaoBlackPoint", updateHbao),
    "API：hbao.blackPoint。AO 调制颜色曲线的输入黑点。\n单位：归一化颜色分量；调大截掉更多暗部、阴影更深，调小保留暗部层次。面板上限 0.99，避免黑点为 1 时曲线分母为零。\n与白点倍率和 HBAO Gamma 联动，不是 LOD 式范围端点，不改变采样成本；关闭 HBAO 时保留。");
  addRange(hbao, "hbaoWhitePoint", "HBAO 白点倍率", 0, 1, 0.01, commitValue("hbaoWhitePoint", updateHbao),
    "API：hbao.whitePoint。AO 调制颜色曲线的输出倍率。\n单位：0–1；调大让被遮蔽部分保留更多亮度，调小让其更暗，0 使该调制色为黑。\n与黑点/Gamma 及 AO 强度一起看，不是远距离阈值或全局曝光；不改变采样成本，关闭 HBAO 时保留。");
  addRange(hbao, "hbaoGamma", "HBAO Gamma", 0.1, 5, 0.1, commitValue("hbaoGamma", updateHbao),
    "API：hbao.gamma。AO 调制曲线的幂指数。\n单位：正无量纲；调大使归一化中间亮度更暗，调小使中间亮度更亮。\n不等于场景 gamma 或历史 varianceGamma；过高丢失暗部层次，与黑/白点联动，不改变采样预算，关闭 HBAO 时保留。");

  const scene = createSection("场景时间");
  addToggle(scene, "highDynamicRange", "高动态范围 HDR", commitValue("highDynamicRange", (value) => fx.update({ highDynamicRange: value })),
    "API：highDynamicRange。Cesium 场景的 HDR 开关。\n单位：布尔值；开启保留更宽亮度范围供色调映射，关闭更易在强光处裁剪。不是曝光增益。\n与材质、色调映射及 framebuffer 格式联动，可能改变显存和渲染成本；应统一验证天空与地表输出。");
  addToggle(scene, "logarithmicDepthBuffer", "对数深度缓冲", commitValue("logarithmicDepthBuffer", (value) => fx.update({ logarithmicDepthBuffer: value })),
    "API：logarithmicDepthBuffer。场景对数深度缓冲开关。\n单位：布尔值；开启改善远近同框的深度精度，关闭回到普通深度分布，远景可能更易 z-fighting。\n云遮挡和 HBAO 都依赖深度，不是距离淡出；切换可能改变深度 shader/资源，需检查地形边界和近处几何。");
  addRange(scene, "gamma", "场景 Gamma", 0.1, 5, 0.1,
    commitValue("gamma", (value) => fx.update({ gamma: value })),
    "API：gamma。Cesium 场景的显示 Gamma 校正参数。\n单位：正无量纲；一般调大使校正后的中间调更亮，调小更暗，具体结果还受 HDR 与色调曲线影响。\n不是 HBAO Gamma、降噪裁剪或线性日光 RGB；不增加散射或采样预算，过度调节会掩盖真实明暗。");
  const timeInput = addDateTime(scene, "time", "UTC 时间", (value) => {
    state.time = value;
    viewer.clock.shouldAnimate = false;
    fx.update({ time: `${value}Z` });
    updateTimelineRange(viewer, value);
  },
  "API：time（ISO8601，提交时追加 Z），同步 viewer.clock 和时间轴。\n单位：UTC 日期/分钟；虽然输入类型叫 datetime-local，本示例明确把显示值当 UTC，不做本地时区转换。提前/推后时间改变太阳方位与高度，不是光束亮度滑块。\n编辑时暂停时钟动画，时间轴继续反向同步输入；系统太阳关闭时光源可能不跟随。太阳和云影变化后需等待时域画面稳定。");

  const syncTimeInput = (clock) => {
    if (document.activeElement === timeInput) return;
    const value = Cesium.JulianDate.toIso8601(clock.currentTime).slice(0, 16);
    state.time = value;
    if (timeInput.value !== value) controls.get("time").setValue(value, false);
  };
  refreshDependencies();
  viewer.clock.onTick.addEventListener(syncTimeInput);
  syncTimeInput(viewer.clock);

  toggleButton.addEventListener("click", () => {
    closeHelp();
    const collapsed = panel.classList.toggle("is-collapsed");
    controlsRoot.hidden = collapsed;
    footer.hidden = collapsed;
    toggleButton.textContent = collapsed ? "展开" : "收起";
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
  });

  resetButton.addEventListener("click", () => {
    closeHelp();
    Object.assign(state, CONTROL_DEFAULTS);
    for (const [key, value] of Object.entries(CONTROL_DEFAULTS)) {
      controls.get(key)?.setValue(value, false);
    }
    refreshCloudTops();
    refreshDependencies();
    viewer.clock.shouldAnimate = false;
    fx.update(buildPipelineOptions(state));
    updateTimelineRange(viewer, state.time);
    syncTimeInput(viewer.clock);
  });
}

window.onload = async () => {
  // Vite 环境变量来自本地 .env.local，未配置时不请求 Ion 服务。
  const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() || "";
  const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN?.trim() || "";
  Cesium.Ion.defaultAccessToken = ionToken;

  const viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: true,
    baseLayerPicker: false,
    baseLayer: false,
    geocoder: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    homeButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: false,
  });

  const imageryProvider = tiandituToken
    ? new Cesium.WebMapTileServiceImageryProvider({
      url: `https://t1.tianditu.gov.cn/img_w/wmts?tk=${encodeURIComponent(tiandituToken)}`,
      layer: "img",
      style: "default",
      format: "tiles",
      tileMatrixSetID: "w",
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: 18,
      credit: "天地图",
    })
    : await Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
      );
  viewer.imageryLayers.addImageryProvider(imageryProvider);
  if (!tiandituToken) {
    console.warn("[demo-official] 未配置 VITE_TIANDITU_TOKEN，使用 Cesium 本地底图。");
  }

  // 在大窗口限制实际绘制像素；普通大小的窗口继续使用原生分辨率。
  const maxRenderPixels = 4_000_000;
  const updateResolutionScale = () => {
    // 与 Cesium 的实际像素比保持一致，避免高 DPI 下重复降低分辨率。
    const pixelRatio = viewer.useBrowserRecommendedResolution ? 1 : window.devicePixelRatio;
    const pixelWidth = viewer.canvas.clientWidth * pixelRatio;
    const pixelHeight = viewer.canvas.clientHeight * pixelRatio;
    if (!pixelWidth || !pixelHeight) return;
    const scale = Math.min(1, Math.sqrt(maxRenderPixels / (pixelWidth * pixelHeight)));
    if (Math.abs(viewer.resolutionScale - scale) > 0.01) {
      viewer.resolutionScale = scale;
      viewer.resize();
    }
  };
  updateResolutionScale();
  window.addEventListener("resize", updateResolutionScale);

  // 先使用椭球；在线地形异步加载，避免外部服务阻塞天空效果初始化。
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  if (ionToken) {
    Cesium.createWorldTerrainAsync().then((terrainProvider) => {
      if (!viewer.isDestroyed()) viewer.terrainProvider = terrainProvider;
    }).catch((error) => {
      console.warn("[demo-official] 地形加载失败，继续使用椭球地形：", error);
    });
  } else {
    console.warn("[demo-official] 未配置 VITE_CESIUM_ION_TOKEN，使用椭球地形。");
  }

  // 初始相机：成都上空近景，便于观察体积云与地平线大气雾
  viewer.scene.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(104.07, 30.4, 9000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-20),
      roll: 0,
    },
  });

  // ====== 一行开启天空效果 ======
  const fx = new BetterSky(viewer);

  updateTimelineRange(viewer, CONTROL_DEFAULTS.time);
  createEffectControlPanel(viewer, fx);

  // 运行时也可切换：fx.hbaoEnabled = false; fx.smaaEnabled = false; fx.hbaoIntensity = 150;

  // 暴露到全局，便于在控制台调试（如 fx.coverage = 0.4）
  window.viewer = viewer;
  window.fx = fx;

  // 校验：天空管线 Composite 已加入官方后处理集合
  const pps = viewer.scene.postProcessStages;
  const ok = pps.contains(fx.stage);
  console.log("[demo-official] 天空效果已启用：", ok, fx.stage && fx.stage.name);
  if (!ok) {
    console.error("[demo-official] 未能加入后处理集合，请检查控制台报错。");
  }
};
