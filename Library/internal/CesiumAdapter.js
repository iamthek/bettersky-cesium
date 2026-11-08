import { Matrix4, PixelDatatype, RenderState, WebGLConstants } from "cesium";

// Cesium's renderer internals are intentionally confined to this compatibility boundary.
// Every interception below affects a supplied instance, never an engine/global prototype.
export function getWebGLContext(context) { return context._gl; }
export function getAnisotropicExtension(context) { return context._textureFilterAnisotropic; }
export function getCameraPosition(scene) { return scene.context.uniformState._cameraPosition; }
export function usesLogDepthOptimization(scene) { return scene.postProcessStages._logDepthOptimization; }
export function getStageIndex(stage) { return stage._index; }

export function restoreStageOrder(collection, stage, index) {
    // Official PostProcessStageCollection has no insert operation.
    if (index != null && Array.isArray(collection._stages)) {
        collection._stages[index] = collection._stages.pop();
        stage._index = index;
    }
}

export function moveStageToEnd(collection, stage) {
    const stages = collection._stages;
    if (!Array.isArray(stages)) return;
    const index = stages.indexOf(stage);
    if (index < 0 || index === stages.length - 1) return;
    stages.splice(index, 1);
    stages.push(stage);
    for (let i = 0; i < stages.length; ++i) {
        if (stages[i]) stages[i]._index = i;
    }
    collection._textureCacheDirty = true;
}

/** Native postprocessing has no insertion API. Keep the SDK's HDR-to-display
 * chain ahead of host display-space effects without removing/destroying stages.
 */
export function moveStagesToFront(collection, stages) {
    const current = collection._stages;
    if (!Array.isArray(current)) return;
    const front = [];
    for (const stage of stages) {
        if (stage && current.includes(stage) && !front.includes(stage)) front.push(stage);
    }
    if (!front.length || front.every((stage, index) => current[index] === stage)) return;
    const moved = new Set(front);
    const rest = [];
    for (let i = 0; i < current.length; ++i) if (!moved.has(current[i])) rest.push(current[i]);
    current.splice(0, current.length, ...front, ...rest);
    for (let i = 0; i < current.length; ++i) if (current[i]) current[i]._index = i;
    collection._textureCacheDirty = true;
}

export function bindFramebuffer(framebuffer) { framebuffer._bind(); }
export function unbindFramebuffer(framebuffer) { framebuffer._unBind(); }

export function toWebGL2PixelDatatype(pixelDatatype) {
    // HALF_FLOAT uses the WebGL 1 OES constant in Cesium; 3D/array uploads require WebGL 2.
    return pixelDatatype === PixelDatatype.HALF_FLOAT ? WebGLConstants.HALF_FLOAT : pixelDatatype;
}

const samplerContexts = new WeakMap();
export function adaptArraySamplerProgram(program, context) {
    const gl = getWebGLContext(context);
    if (!samplerContexts.has(gl)) {
        samplerContexts.set(gl, new Proxy(gl, {
            get(target, key) {
                if (key === "getActiveUniform") {
                    return (shader, index) => {
                        const info = target.getActiveUniform(shader, index);
                        return info && info.type === target.SAMPLER_2D_ARRAY
                            ? { name: info.name, size: info.size, type: target.SAMPLER_2D }
                            : info;
                    };
                }
                const value = Reflect.get(target, key, target);
                return typeof value === "function" ? value.bind(target) : value;
            },
        }));
    }
    program._gl = samplerContexts.get(gl);
}

export function installFramebufferCallbacks(framebuffer) {
    if (framebuffer._betterSkyCallbacksInstalled) return;
    const originalBind = framebuffer._bind;
    framebuffer._bind = function () {
        originalBind.call(this);
        const buffers = this._getActiveColorAttachments();
        if (this.onBindEvent) this.onBindEvent(buffers);
        if (this.onDrawEvent) this.onDrawEvent(buffers);
    };
    framebuffer._betterSkyCallbacksInstalled = true;
}

export function getFramebufferDepthTexture(framebuffer) {
    return framebuffer?.depthStencilTexture ?? framebuffer?.depthTexture;
}

export function resolveSceneDepthTexture(scene, framebuffer, context) {
    if (!framebuffer) return undefined;
    const { globeDepth, sceneFramebuffer } = scene._view;
    // A multisampled render framebuffer owns renderbuffers, not sampleable
    // textures. Resolve through its owner before the next frustum clears it.
    if (framebuffer === globeDepth?.framebuffer) {
        globeDepth.prepareColorTextures(context);
        return globeDepth.depthStencilTexture;
    }
    if (framebuffer === sceneFramebuffer?.framebuffer) {
        sceneFramebuffer.prepareColorTextures(context);
        return sceneFramebuffer.depthStencilTexture;
    }
    return getFramebufferDepthTexture(framebuffer);
}

export function getAuxiliaryShaderProgram(context, original, key, fragmentShaderSource, vertexShaderSource) {
    const cached = context.shaderCache.getDerivedShaderProgram(original, key);
    if (cached) return cached;
    return context.shaderCache.createDerivedShaderProgram(original, key, {
        vertexShaderSource: typeof vertexShaderSource === "function" ? vertexShaderSource() : vertexShaderSource ?? original.vertexShaderSource,
        fragmentShaderSource: typeof fragmentShaderSource === "function" ? fragmentShaderSource() : fragmentShaderSource,
        attributeLocations: original._attributeLocations,
    });
}

/** Gaussian metadata retained by the official Cesium tile loader. Legacy SPZ2
 * assets omit the field and are deliberately handled by the caller's setting.
 */
export function getGaussianSourceColorSpace(command) {
    const tileset = command.owner?._tileset;
    const spaces = new Set();
    for (const tile of tileset?._selectedTiles ?? []) {
        const json = tile.content?._loader?.gltfJson;
        for (const mesh of json?.meshes ?? []) {
            for (const primitive of mesh.primitives ?? []) {
                const space = primitive.extensions?.KHR_gaussian_splatting?.colorSpace;
                if (space !== undefined) spaces.add(space);
            }
        }
    }
    if (spaces.size > 1) throw new Error("[BetterSky] Gaussian primitives in one native draw declare different color spaces.");
    const declared = spaces.values().next().value;
    if (declared === undefined) return undefined;
    if (declared === "srgb_rec709_display") return "srgb";
    if (declared === "lin_rec709_display") return "linear";
    throw new Error(`[BetterSky] Unsupported Gaussian color space: ${declared}`);
}

const sceneDrawObservers = new WeakMap();

function isColorRender(scene) {
    const passes = (scene.frameState ?? scene._frameState)?.passes;
    return passes?.render === true && !passes.pick && !passes.pickVoxel && !passes.depth && !passes.offscreen;
}

function isSceneColorTarget(scene, command, passState) {
    const view = scene._view;
    if (!view) return false;
    const environment = scene._environmentState;
    const target = command?._framebuffer ?? command?.framebuffer ?? passState?.framebuffer;
    if (environment?.useGlobeDepthFramebuffer) return target === view.globeDepth?.framebuffer;
    if (environment?.usePostProcess) return target === view.sceneFramebuffer?.framebuffer;
    return target === environment?.originalFramebuffer;
}

function restoreNativeDrawState(context, command, passState) {
    const gl = context._gl;
    if (!gl) return;
    const state = passState ?? context._defaultPassState;
    const candidate = command.framebuffer ?? state?.framebuffer;
    const framebuffer = candidate?.isDestroyed?.() ? undefined : candidate;
    const renderState = command.renderState ?? context._defaultRenderState;
    if (framebuffer) framebuffer._bind();
    else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    context.glDrawBuffers?.(framebuffer ? framebuffer._getActiveColorAttachments() : [gl.BACK]);
    if (renderState) RenderState.apply(gl, renderState, state);
    context._currentFramebuffer = framebuffer;
    context._currentRenderState = renderState;
    context._currentPassState = state;
    if (context.uniformState) context.uniformState.model = command.modelMatrix ?? Matrix4.IDENTITY;
}

/**
 * Observes the actual derived commands while their native frustum uniforms are current.
 * Subscribers share one instance interception; their auxiliary work never observes itself.
 */
export function installSceneDrawObserver(scene, callbacks) {
    let observer = sceneDrawObservers.get(scene);
    if (!observer) {
        const context = scene.context;
        const stages = scene.postProcessStages;
        if (typeof context?.draw !== "function" || typeof context.clear !== "function" || typeof stages?.execute !== "function") {
            throw new Error("[BetterSky] This Cesium renderer does not expose the scene draw boundary required for model color preservation.");
        }
        observer = { scene, context, stages, subscribers: new Set(), hooks: [], depthHook: undefined, suspended: 0 };
        const notify = (name, args) => {
            if (observer.suspended || !isColorRender(scene)) return;
            const currentFramebuffer = context._currentFramebuffer;
            // Cesium may have resized/destroyed its previous target immediately
            // before a clear; that cached object must never be rebound.
            const framebuffer = currentFramebuffer?.isDestroyed?.() ? undefined : currentFramebuffer;
            const renderState = context._currentRenderState;
            const passState = context._currentPassState;
            const model = context.uniformState?.model && Matrix4.clone(context.uniformState.model);
            ++observer.suspended;
            try {
                let replacement;
                for (const subscriber of Array.from(observer.subscribers)) {
                    const value = subscriber[name]?.(...args);
                    if (name === "beforeDraw" && value) {
                        const command = value.command ?? args[0];
                        const bindings = args[3];
                        replacement = {
                            command,
                            passState: value.passState ?? args[2],
                            shaderProgram: value.shaderProgram ?? (value.command ? command.shaderProgram : bindings.shaderProgram),
                            uniformMap: value.uniformMap ?? (value.command ? command.uniformMap : bindings.uniformMap),
                        };
                        args = [command, args[1], replacement.passState, {
                            shaderProgram: replacement.shaderProgram, uniformMap: replacement.uniformMap,
                        }];
                    }
                }
                return replacement;
            } finally {
                try {
                    // Native MSAA resolves and OIT also use direct GL operations.
                    // Returning with an auxiliary depth-write/blend/FBO state can
                    // corrupt their work even when the next Context draw is correct.
                    const gl = context._gl;
                    if (gl && (context._currentFramebuffer !== currentFramebuffer ||
                        context._currentRenderState !== renderState || context._currentPassState !== passState ||
                        currentFramebuffer?.isDestroyed?.())) {
                        const restoredFramebuffer = framebuffer?.isDestroyed?.() ? undefined : framebuffer;
                        if (restoredFramebuffer) restoredFramebuffer._bind();
                        else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                        context.glDrawBuffers?.(restoredFramebuffer ? restoredFramebuffer._getActiveColorAttachments() : [gl.BACK]);
                        if (renderState) RenderState.apply(gl, renderState, passState);
                        context._currentFramebuffer = restoredFramebuffer;
                        context._currentRenderState = renderState;
                        context._currentPassState = passState;
                        if (model) context.uniformState.model = model;
                    }
                } finally { --observer.suspended; }
            }
        };
        const intercept = (target, key, createWrapper) => {
            const descriptor = Object.getOwnPropertyDescriptor(target, key);
            const original = target[key];
            const wrapper = createWrapper(original);
            target[key] = wrapper;
            return { target, key, descriptor, original, wrapper };
        };
        const restore = hook => {
            if (hook.target[hook.key] !== hook.wrapper) return;
            if (hook.descriptor) Object.defineProperty(hook.target, hook.key, hook.descriptor);
            else delete hook.target[hook.key];
        };
        observer.restore = restore;
        try {
            observer.hooks.push(intercept(context, "draw", original => function (command, passState, shaderProgram, uniformMap) {
                const observed = !observer.suspended && isColorRender(scene) && isSceneColorTarget(scene, command, passState);
                const actual = { shaderProgram: shaderProgram ?? command.shaderProgram, uniformMap: uniformMap ?? command.uniformMap };
                const replacement = observed ? notify("beforeDraw", [command, context, passState, actual]) : undefined;
                const target = command.framebuffer ?? passState?.framebuffer;
                const redirected = replacement && (replacement.command.framebuffer ?? replacement.passState?.framebuffer) !== target;
                try {
                    const result = replacement
                        ? original.call(this, replacement.command, replacement.passState, replacement.shaderProgram, replacement.uniformMap)
                        : original.apply(this, arguments);
                    if (observed) {
                        notify("onDraw", [command, context, passState, replacement ? {
                            shaderProgram: replacement.shaderProgram, uniformMap: replacement.uniformMap,
                        } : actual]);
                    }
                    return result;
                } finally {
                    // A redirected color draw replaces the original draw, but
                    // native OIT/raw resolves must resume in its expected state.
                    if (redirected) restoreNativeDrawState(context, command, passState);
                }
            }));
            observer.hooks.push(intercept(context, "clear", original => function (command, passState) {
                const observed = !observer.suspended && isSceneColorTarget(scene, command, passState);
                if (observed) notify("beforeClear", [command, context, passState]);
                const result = original.apply(this, arguments);
                if (observed) notify("onClear", [command, context, passState]);
                return result;
            }));
            observer.hooks.push(intercept(stages, "execute", original => function (renderContext, colorTexture, depthTexture, idTexture) {
                const args = [renderContext, colorTexture, depthTexture, idTexture];
                notify("beforePostProcess", args);
                const tonemapping = this._tonemapping;
                const enabled = tonemapping?.enabled;
                const skip = isColorRender(scene) && Array.from(observer.subscribers).some(subscriber => subscriber.skipNativeTonemapping?.());
                try {
                    if (skip && tonemapping) tonemapping.enabled = false;
                    const result = original.apply(this, arguments);
                    notify("afterPostProcess", args);
                    return result;
                } finally {
                    if (skip && tonemapping) tonemapping.enabled = enabled;
                }
            }));
            observer.refresh = () => {
                const globeDepth = scene._view?.globeDepth;
                if (observer.depthHook?.target === globeDepth) return;
                if (observer.depthHook) restore(observer.depthHook);
                observer.depthHook = undefined;
                if (typeof globeDepth?.executeCopyDepth !== "function") return;
                observer.depthHook = intercept(globeDepth, "executeCopyDepth", original => function (renderContext, passState) {
                    const result = original.apply(this, arguments);
                    if (!observer.suspended && isSceneColorTarget(scene, undefined, passState)) {
                        notify("onGlobeDepthCopy", [this, renderContext, passState]);
                    }
                    return result;
                });
            };
            observer.removePreRender = scene.preRender?.addEventListener?.(observer.refresh);
            observer.refresh();
            sceneDrawObservers.set(scene, observer);
        } catch (error) {
            observer.removePreRender?.();
            if (observer.depthHook) restore(observer.depthHook);
            for (const hook of observer.hooks) restore(hook);
            throw error;
        }
    }
    observer.subscribers.add(callbacks);
    let destroyed = false;
    return {
        refresh() { if (!destroyed) observer.refresh(); },
        suspend(callback) {
            ++observer.suspended;
            try { return callback(); }
            finally { --observer.suspended; }
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            observer.subscribers.delete(callbacks);
            if (observer.subscribers.size) return;
            observer.removePreRender?.();
            if (observer.depthHook) observer.restore(observer.depthHook);
            for (const hook of observer.hooks) observer.restore(hook);
            sceneDrawObservers.delete(scene);
        },
    };
}
