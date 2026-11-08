import {
    BoundingRectangle, Cartesian2, Cartesian3, ClearCommand, Color, DepthFunction,
    DrawCommand, FramebufferManager, Matrix4, Pass, PassState, PixelDatatype,
    PixelFormat, RenderState, ShaderSource,
} from "cesium";
import {
    getAuxiliaryShaderProgram, getGaussianSourceColorSpace, installSceneDrawObserver,
    resolveSceneDepthTexture,
} from "./internal/CesiumAdapter.js";
import { depthReconstructionGLSL } from "./internal/SceneDepth.js";

const seedShader = `uniform sampler2D nativeDepth;
in vec2 v_textureCoordinates;
void main() {
    gl_FragDepth = texture(nativeDepth, v_textureCoordinates).r;
    out_FragColor = vec4(0.0);
}`;

// Nearer opaque geometry paints over farther frustums in the native scene.
// Apply that same visibility to the independent Gaussian color layer without
// rerendering any mesh or terrain material, and without sampling our own output.
const clipShader = `${depthReconstructionGLSL}
uniform sampler2D nativeDepth;
uniform sampler2D gaussianDepth;
uniform mat4 sourceInverseProjection;
uniform vec2 sourceFrustum;
uniform bool sourcePacked;
uniform bool sourceLogarithmic;
in vec2 v_textureCoordinates;
void main() {
    vec2 uv = v_textureCoordinates;
    vec4 value = texture(nativeDepth, uv);
    float depth = sourcePacked ? czm_unpackDepth(value) : value.r;
    if (!(depth >= 0.0 && depth < 1.0 - 1e-7) || (sourcePacked && depth == 0.0)) discard;
    float model = texture(gaussianDepth, uv).r;
    if (!(model > 0.0)) discard;
    float distance;
    if (sourceLogarithmic) {
        float eyeDepth = exp2(depth * log2(sourceFrustum.y - sourceFrustum.x + 1.0)) - 1.0 + sourceFrustum.x;
        if (!betterSkyDepthInFrustum(eyeDepth, sourceFrustum)) discard;
        vec3 ray = betterSkyProjectionRay(sourceInverseProjection, uv);
        distance = eyeDepth / max(-ray.z, 1e-8);
    } else {
        vec3 eye = betterSkyProjectionPosition(sourceInverseProjection, uv, depth * 2.0 - 1.0);
        if (!betterSkyDepthInFrustum(-eye.z, sourceFrustum)) discard;
        distance = length(eye);
    }
    if (!betterSkyValidDistance(distance)) discard;
    if (distance + max(0.05, model * 1e-5) >= model) discard;
    out_FragColor = vec4(0.0);
}`;

const defaults = Object.freeze({ colorSpace: "auto", exposureOffset: -0.5, daylightResponse: true });

/** Captures official Gaussian colors exactly once in their source color space.
 * The native command is redirected, never mutated. A cheap second draw supplies
 * only proxy depth; opaque geometry remains in Cesium's ordinary HDR framebuffer.
 */
export default class GaussianSplatPass {
    constructor(scene, { show = true, options = {}, onError } = {}) {
        this.scene = scene;
        this.options = { ...defaults, ...options };
        this._enabled = show;
        this._onError = onError;
        this._commands = new WeakMap();
        this._targets = [];
        this._frame = -1;
        this._inverseProjection = new Matrix4();
        this._sourceFrustum = new Cartesian2();
        this._passState = new PassState(scene.context);
        this._clear = new ClearCommand({ color: Color.TRANSPARENT, depth: 1, stencil: 0 });
        this._observer = installSceneDrawObserver(scene, {
            beforeDraw: (command, context, state, actual) => this._guard(() => this._redirect(command, context, state, actual)),
            onDraw: (command, context, state, actual) => this._guard(() => this._afterDraw(command, context, state, actual)),
            beforeClear: (command, context) => this._guard(() => {
                if (this.enabled && command.depth !== undefined) this._clipPending(context);
            }),
            onClear: (command, context) => this._guard(() => this._nativeClear(command, context)),
            onGlobeDepthCopy: (globeDepth, context) => this._guard(() => {
                if (!this.hasSplats) return;
                this._rememberFrustum(context);
                this._clip(context, context.uniformState.globeDepthTexture, true);
            }),
            beforePostProcess: context => this._guard(() => this._clipPending(context)),
        });
    }

    get enabled() { return this._enabled && !this._destroyed && !this._failed; }
    set enabled(value) { this._enabled = !!value; }
    get hasSplats() {
        // A deferred failure must leave this frame's already redirected color
        // available until the final atmosphere composite has consumed it.
        return !this._destroyed && this._frame === this.scene.frameState.frameNumber && this._hasSplats &&
            (this.enabled || this._failedFrame === this._frame);
    }
    get colorTexture() { return this.hasSplats ? this._layer.getColorTexture(0) : undefined; }
    get coverageTexture() { return this.colorTexture; }
    get depthTexture() { return this.hasSplats ? this._proxy.getColorTexture(0) : undefined; }
    get colorSpace() { return this._frameColorSpace ?? (this.options.colorSpace === "linear" ? "linear" : "srgb"); }
    get byteLength() { return this._targets.length ? this._width * this._height * 20 : 0; }
    get daylightFactor() {
        if (!this.options.daylightResponse) return 1;
        if (this._daylightFactor !== undefined) return this._daylightFactor;
        const position = this.scene.camera?.positionWC;
        const sun = this.scene.context.uniformState.sunDirectionWC;
        if (!position || !sun) return 1;
        const elevation = Cartesian3.dot(position, sun) / Math.max(Cartesian3.magnitude(position), 1);
        const t = Math.min(1, Math.max(0, (elevation + 0.1) / 0.75));
        return 0.04 + 0.96 * t * t * (3 - 2 * t);
    }
    set daylightFactor(value) {
        this._daylightFactor = Number.isFinite(value) ? Math.max(0, value) : undefined;
    }
    get exposureMultiplier() { return 2 ** this.options.exposureOffset * this.daylightFactor; }

    update(options = {}) { this.options = { ...this.options, ...options }; }
    updateFrame() {
        this.flushPendingFailure();
        if (!this.enabled) return;
        this._observer.refresh();
        this._beginFrame();
    }

    flushPendingFailure() {
        if (!this._pendingError || this._failedFrame === this.scene.frameState.frameNumber) return;
        const error = this._pendingError;
        this._pendingError = undefined;
        this._hasSplats = false;
        this._releaseTargets();
        this._releaseCommands();
        if (this._onError) this._onError(error);
        else console.error("[BetterSky] Gaussian rendering stopped:", error);
    }

    _beginFrame() {
        const frame = this.scene.frameState.frameNumber;
        if (this._frame === frame) return;
        this._frame = frame;
        this._hasSplats = false;
        this._frameColorSpace = undefined;
        this._targetsCleared = false;
        this._needsSeed = true;
        this._opaqueDirty = false;
        this._opaqueFramebuffer = undefined;
    }

    _guard(callback) {
        if (!this.enabled) return;
        try { return callback(); }
        catch (error) {
            this._failed = true;
            this._failedFrame = this.scene.frameState.frameNumber;
            this._pendingError = error;
        }
    }

    _ensure(context) {
        this._beginFrame();
        const width = this.scene.drawingBufferWidth, height = this.scene.drawingBufferHeight;
        if (!this._layer || this._width !== width || this._height !== height) {
            this._releaseTargets();
            this._width = width;
            this._height = height;
            const target = (datatype, format) => {
                const manager = new FramebufferManager({ depthStencil: true, supportsDepthTexture: true });
                this._targets.push(manager);
                // Gaussian kernels already carry analytic soft coverage; neither
                // the encoded color layer nor R32F proxy needs an MSAA renderbuffer.
                manager.update(context, width, height, 1, datatype, format);
                return manager;
            };
            this._layer = target(PixelDatatype.HALF_FLOAT, PixelFormat.RGBA);
            this._proxy = target(PixelDatatype.FLOAT, PixelFormat.RED);
            this._passState.viewport = new BoundingRectangle(0, 0, width, height);
            this._targetsCleared = false;
            this._needsSeed = true;
        }
        if (!this._targetsCleared) {
            for (const target of this._targets) this._clearTarget(context, target);
            this._targetsCleared = true;
        }
    }

    _clearTarget(context, target) {
        this._clear.framebuffer = target.framebuffer;
        this._clear.execute(context, this._passState);
    }

    _nativeClear(command, context) {
        if (!this.enabled) return;
        this._beginFrame();
        if (command.color !== undefined && this._hasSplats) {
            for (const target of this._targets) this._clearTarget(context, target);
            this._hasSplats = false;
            this._frameColorSpace = undefined;
        }
        if (command.depth !== undefined) this._needsSeed = true;
    }

    _rememberFrustum(context) {
        Matrix4.clone(context.uniformState.inverseProjection, this._inverseProjection);
        Cartesian2.clone(context.uniformState.currentFrustum, this._sourceFrustum);
        this._sourceLogarithmic = !!(this.scene.frameState.useLogDepth ?? this.scene.logarithmicDepthBuffer);
    }

    _clipPending(context) {
        if (!this.hasSplats || !this._opaqueDirty) return;
        const depth = resolveSceneDepthTexture(this.scene, this._opaqueFramebuffer, context);
        this._clip(context, depth, false);
        this._opaqueDirty = false;
    }

    _clip(context, texture, packed) {
        if (!texture || !this.hasSplats) return;
        if (!this._clipCommand) this._clipCommand = context.createViewportQuadCommand(clipShader, {
            uniformMap: {
                nativeDepth: () => this._sourceDepth,
                gaussianDepth: () => this._proxy.getColorTexture(0),
                sourceInverseProjection: () => this._inverseProjection,
                sourceFrustum: () => this._sourceFrustum,
                sourcePacked: () => this._sourcePacked,
                sourceLogarithmic: () => this._sourceLogarithmic,
            },
            renderState: RenderState.fromCache({ depthTest: { enabled: false }, depthMask: false }),
        });
        this._sourceDepth = texture;
        this._sourcePacked = packed;
        this._clipCommand.framebuffer = this._layer.framebuffer;
        this._clipCommand.execute(context, this._passState);
    }

    _seed(context, texture) {
        if (!texture) throw new Error("[BetterSky] Gaussian layers require the native scene depth texture.");
        if (!this._seedCommand) this._seedCommand = context.createViewportQuadCommand(seedShader, {
            uniformMap: { nativeDepth: () => this._sourceDepth },
            renderState: RenderState.fromCache({
                colorMask: { red: false, green: false, blue: false, alpha: false },
                depthTest: { enabled: true, func: DepthFunction.ALWAYS }, depthMask: true,
            }),
        });
        this._sourceDepth = texture;
        for (const target of this._targets) {
            this._seedCommand.framebuffer = target.framebuffer;
            this._seedCommand.execute(context, this._passState);
        }
        this._needsSeed = false;
    }

    _redirect(command, context, state, actual) {
        if (command.pass !== Pass.GAUSSIAN_SPLATS) return;
        this._ensure(context);
        const colorSpace = this.options.colorSpace === "auto"
            ? getGaussianSourceColorSpace(command) ?? "srgb" : this.options.colorSpace;
        if (this._frameColorSpace && this._frameColorSpace !== colorSpace) {
            throw new Error("[BetterSky] One Gaussian color layer cannot mix different source color spaces.");
        }
        this._frameColorSpace = colorSpace;
        if (this._needsSeed) {
            const source = command.framebuffer ?? state?.framebuffer;
            const depth = resolveSceneDepthTexture(this.scene, source, context);
            if (this._opaqueDirty) this._clip(context, depth, false);
            this._opaqueDirty = false;
            this._seed(context, depth);
        }
        let cached = this._commands.get(command);
        if (!cached) { cached = {}; this._commands.set(command, cached); }
        // Proxy compilation and its draw happen before color redirection. A
        // first-use failure therefore leaves the current native color draw intact.
        const proxy = this._prepareProxy(command, context, actual, cached);
        proxy.execute(context, state);
        const color = DrawCommand.shallowClone(command, cached.color);
        cached.color = color;
        color.shaderProgram = actual.shaderProgram;
        color.uniformMap = actual.uniformMap;
        color.framebuffer = this._layer.framebuffer;
        if (command.renderState.colorMask?.alpha === false) {
            const renderState = RenderState.getState(command.renderState);
            renderState.colorMask.alpha = true;
            color.renderState = RenderState.fromCache(renderState);
        }
        this._hasSplats = true;
        return { command: color };
    }

    _afterDraw(command, context, state, actual) {
        if (!this.enabled) return;
        this._beginFrame();
        if (command.pass !== Pass.GAUSSIAN_SPLATS) {
            if (command.renderState?.depthMask !== false &&
                [Pass.CESIUM_3D_TILE, Pass.OPAQUE].includes(command.pass)) {
                this._opaqueFramebuffer = command.framebuffer ?? state?.framebuffer;
                this._opaqueDirty = true;
                this._rememberFrustum(context);
            }
            return;
        }
    }

    _prepareProxy(command, context, actual, cached) {
        const original = actual.shaderProgram;
        const shader = getAuxiliaryShaderProgram(context, original, "bs_gaussian_proxy_v3", () => {
            const source = original.fragmentShaderSource.clone();
            source.sources = source.sources.map(s => ShaderSource.replaceMain(s, "bs_gaussian_native_main"));
            source.sources.push(`${depthReconstructionGLSL}
            in float bsGaussianEyeDepth;
            void main() {
                bs_gaussian_native_main();
                if (out_FragColor.a < 1.0 / 255.0) discard;
                // Native log-depth only changes fragment depth, not the vertex
                // projection. Preserve clip W directly to avoid interpreting
                // linear gl_FragCoord.z as logarithmic or losing far-depth precision.
                vec2 ndc = (gl_FragCoord.xy - czm_viewport.xy) / czm_viewport.zw * 2.0 - 1.0;
                vec3 ray = betterSkyProjectionRay(czm_inverseProjection, ndc * 0.5 + 0.5);
                float distance = bsGaussianEyeDepth / max(-ray.z, 1e-8);
                if (!betterSkyValidDistance(distance) ||
                    !betterSkyDepthInFrustum(bsGaussianEyeDepth, czm_currentFrustum)) discard;
                #if defined(LOG_DEPTH_READ_ONLY) && !defined(LOG_DEPTH)
                gl_FragDepth = log2(max(bsGaussianEyeDepth - czm_currentFrustum.x + 1.0, 1.0)) * czm_oneOverLog2FarDepthFromNearPlusOne;
                #endif
                out_FragColor = vec4(distance, 0.0, 0.0, 1.0);
            }`);
            return source;
        }, () => {
            const source = original.vertexShaderSource.clone();
            source.sources = source.sources.map(s => ShaderSource.replaceMain(s, "bs_gaussian_native_vertex"));
            source.sources.push(`out float bsGaussianEyeDepth;
            void main() { bs_gaussian_native_vertex(); bsGaussianEyeDepth = gl_Position.w; }`);
            return source;
        });
        void shader.vertexAttributes;
        const proxy = DrawCommand.shallowClone(command, cached.proxy);
        cached.proxy = proxy;
        const renderState = RenderState.getState(command.renderState);
        renderState.blending.enabled = false;
        renderState.depthMask = true;
        renderState.colorMask = { red: true, green: true, blue: true, alpha: true };
        proxy.shaderProgram = shader;
        proxy.uniformMap = actual.uniformMap;
        proxy.renderState = RenderState.fromCache(renderState);
        proxy.framebuffer = this._proxy.framebuffer;
        return proxy;
    }

    _releaseTargets() {
        for (const target of this._targets) target.destroy();
        this._targets.length = 0;
        this._layer = this._proxy = undefined;
        this._clear.framebuffer = undefined;
    }
    _releaseCommands() {
        for (const command of [this._seedCommand, this._clipCommand]) command?.shaderProgram?.destroy();
        this._seedCommand = this._clipCommand = undefined;
    }
    isDestroyed() { return !!this._destroyed; }
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._observer.destroy();
        this._releaseTargets();
        this._releaseCommands();
    }
}
