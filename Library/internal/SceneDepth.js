import {
    BoundingRectangle, Cartesian2, ClearCommand, Color, Framebuffer, Matrix4,
    Pass, PassState, PixelDatatype, PixelFormat, RenderState, Sampler, ShaderSource,
    Texture, TextureMagnificationFilter, TextureMinificationFilter,
} from "cesium";
import { installSceneDrawObserver, resolveSceneDepthTexture } from "./CesiumAdapter.js";
import { runCleanup } from "./cleanup.js";
import sceneDepthSource from "../shaders/geospatial/sceneDepth.glsl?raw";
import depthReconstructionGLSL from "../shaders/geospatial/depthReconstruction.glsl?raw";

const sceneDepthGLSL = sceneDepthSource.replace("/*__DEPTH_RECONSTRUCTION__*/", depthReconstructionGLSL);
export { sceneDepthGLSL, depthReconstructionGLSL };
export function withSceneDepth(shader) {
    return shader.replace("/*__SCENE_DEPTH__*/", sceneDepthGLSL);
}

export function sceneDepthUniformMap(getDepth, context) {
    return {
        u_betterSkyDepth: () => getDepth()?.texture ?? context.defaultTexture,
        u_betterSkyDepthAvailable: () => !!getDepth()?.texture,
        u_betterSkySceneDistanceAvailable: () => !!getDepth()?._sceneAvailable,
        u_betterSkyTerrainDistanceAvailable: () => !!getDepth()?._terrainAvailable,
        u_betterSkyBackgroundDepth: () => !!getDepth()?.backgroundOnly,
        u_betterSkyModelDepthAvailable: () => !!getDepth()?.modelColorPass?.depthTexture &&
            !!getDepth()?.modelColorPass?.coverageTexture,
    };
}

// The original framebuffer may contain log depth or perspective depth. Decode
// with the projection saved when that frustum actually rendered, not the next
// frustum's automatic uniforms (Cesium updates them before clearing old depth).
const captureShader = `
${depthReconstructionGLSL}
uniform sampler2D sourceDepth;
uniform sampler2D previousDistance;
uniform mat4 sourceInverseProjection;
uniform vec2 sourceFrustum;
uniform bool packedDepth;
uniform bool logarithmicDepth;
in vec2 v_textureCoordinates;
void main() {
    vec2 uv = v_textureCoordinates;
    vec4 sampleDepth = texture(sourceDepth, uv);
    float depth = packedDepth ? czm_unpackDepth(sampleDepth) : sampleDepth.r;
    float distance = 0.0;
    // czm_packDepth(1.0) wraps to zero; zero packed depth denotes empty sky.
    if (depth >= 0.0 && depth < 1.0 - 1e-7 && (!packedDepth || depth > 0.0)) {
        float near = sourceFrustum.x;
        float far = sourceFrustum.y;
        float eyeDepth = logarithmicDepth
            ? exp2(depth * log2(far - near + 1.0)) - 1.0 + near
            : -betterSkyProjectionPosition(sourceInverseProjection, uv, depth * 2.0 - 1.0).z;
        vec3 direction = betterSkyProjectionRay(sourceInverseProjection, uv);
        if (betterSkyDepthInFrustum(eyeDepth, sourceFrustum) && direction.z < -1e-8) {
            distance = eyeDepth / -direction.z;
            if (!betterSkyValidDistance(distance)) distance = 0.0;
        }
    }
    float previous = texture(previousDistance, uv).r;
    if (betterSkyValidDistance(previous) && (distance <= 0.0 || previous < distance)) distance = previous;
    out_FragColor = vec4(distance, 0.0, 0.0, 1.0);
}`;

// Keep the atmosphere/cloud shader below WebGL 2's guaranteed 16 sampler
// units: all depth channels share one texture in every effect pass.
const combineShader = `
${depthReconstructionGLSL}
uniform sampler2D sceneDistance;
uniform sampler2D terrainDistance;
uniform sampler2D modelDistance;
uniform sampler2D modelCoverage;
uniform bool sceneAvailable;
uniform bool terrainAvailable;
uniform bool modelAvailable;
in vec2 v_textureCoordinates;
void main() {
    vec2 uv = v_textureCoordinates;
    float scene = sceneAvailable ? texture(sceneDistance, uv).r : 0.0;
    float terrain = terrainAvailable ? texture(terrainDistance, uv).r : 0.0;
    float model = modelAvailable ? texture(modelDistance, uv).r : 0.0;
    float coverage = modelAvailable ? texture(modelCoverage, uv).a : 0.0;
    out_FragColor = vec4(
        betterSkyValidDistance(scene) ? scene : 0.0,
        betterSkyValidDistance(terrain) ? terrain : 0.0,
        betterSkyValidDistance(model) ? model : 0.0,
        betterSkyFinite(coverage) ? clamp(coverage, 0.0, 1.0) : 0.0
    );
}`;

/** Per-frame, full-resolution depths owned by one BetterSky pipeline. */
export default class SceneDepth {
    constructor(scene) {
        this.scene = scene;
        this.generation = 0;
        this._backgroundOnly = false;
        this._inverseProjection = new Matrix4();
        this._frustum = new Cartesian2();
        this._lastInverseProjection = new Matrix4();
        this._lastFrustum = new Cartesian2();
        this._clear = new ClearCommand({ color: Color.TRANSPARENT });
        this._callbacks = {
            onDraw: (command, context, passState) => this._observeDraw(command, context, passState),
            beforeClear: (command, context, passState) => this._beforeClear(command, context, passState),
            onGlobeDepthCopy: (globeDepth, context, passState) => this.captureTerrain(globeDepth, context, passState),
            beforePostProcess: (context, color, depth) => {
                // An empty native frustum can retain an earlier depth attachment.
                // Only decode a scene buffer whose actual draw projection was
                // observed this frame; captured terrain remains the fallback.
                if (this._lastFramebuffer) this.captureScene(context, depth, true);
                this._combine(context);
                this._frameActive = false;
            },
        };
        this.uniformMap = sceneDepthUniformMap(() => this, scene.context);
    }

    get sceneTexture() { return this._sceneTargets?.[this._sceneIndex]?.texture; }
    get terrainTexture() { return this._terrainTargets?.[this._terrainIndex]?.texture; }
    get texture() { return this._combined?.texture; }
    get byteLength() { return this._sceneTargets ? this._width * this._height * 32 : 0; }
    get backgroundOnly() { return this._backgroundOnly; }
    set backgroundOnly(value) {
        if (this._backgroundOnly === !!value) return;
        this._backgroundOnly = !!value;
        this.invalidateHistory();
    }

    beginFrame(useLogDepth) {
        if (this._destroyed) return;
        const scene = this.scene;
        this._observer ??= installSceneDrawObserver(scene, this._callbacks);
        const state = [scene.drawingBufferWidth, scene.drawingBufferHeight, !!useLogDepth,
            !!scene.globe?.depthTestAgainstTerrain, scene.globe?.terrainProvider ?? scene.terrainProvider];
        if (state.some((value, index) => value !== this._state?.[index])) {
            this.generation++;
            this._state = state;
        }
        this._logarithmicDepth = !!useLogDepth;
        this._sceneAvailable = false;
        this._terrainAvailable = false;
        this._lastFramebuffer = undefined;
        this._frameActive = true;
        if (this._sceneTargets && (this._width !== state[0] || this._height !== state[1])) this._releaseTargets();
        if (this._sceneTargets) this._clearTargets();
    }

    _target(context, pixelFormat = PixelFormat.RED) {
        const texture = new Texture({
            context, width: this._width, height: this._height, pixelFormat,
            pixelDatatype: PixelDatatype.FLOAT, flipY: false,
            sampler: new Sampler({ minificationFilter: TextureMinificationFilter.NEAREST,
                magnificationFilter: TextureMagnificationFilter.NEAREST }),
        });
        try {
            const state = new PassState(context);
            state.viewport = new BoundingRectangle(0, 0, this._width, this._height);
            state.framebuffer = new Framebuffer({ context, colorTextures: [texture], destroyAttachments: false });
            return { texture, state };
        } catch (error) { texture.destroy(); throw error; }
    }

    _ensureResources(context) {
        if (!this._sceneTargets) {
            this._width = this.scene.drawingBufferWidth;
            this._height = this.scene.drawingBufferHeight;
            this._sceneTargets = [];
            this._terrainTargets = [];
            try {
                for (let index = 0; index < 2; index++) {
                    this._sceneTargets.push(this._target(context));
                    this._terrainTargets.push(this._target(context));
                }
                this._combined = this._target(context, PixelFormat.RGBA);
                this._clearTargets();
            } catch (error) { this._releaseTargets(); throw error; }
        }
        if (!this._captureCommand) {
            this._captureCommand = context.createViewportQuadCommand(new ShaderSource({ sources: [captureShader] }), {
                owner: this,
                renderState: RenderState.fromCache({ depthTest: { enabled: false }, depthMask: false }),
                uniformMap: {
                    sourceDepth: () => this._sourceDepth,
                    previousDistance: () => this._previousDistance,
                    sourceInverseProjection: () => this._inverseProjection,
                    sourceFrustum: () => this._frustum,
                    packedDepth: () => this._packedDepth,
                    logarithmicDepth: () => this._logarithmicDepth,
                },
            });
        }
        if (!this._combineCommand) {
            const fallback = context.defaultTexture;
            this._combineCommand = context.createViewportQuadCommand(new ShaderSource({ sources: [combineShader] }), {
                owner: this,
                renderState: RenderState.fromCache({ depthTest: { enabled: false }, depthMask: false }),
                uniformMap: {
                    sceneDistance: () => this.sceneTexture ?? fallback,
                    terrainDistance: () => this.terrainTexture ?? fallback,
                    modelDistance: () => this.modelColorPass?.depthTexture ?? fallback,
                    modelCoverage: () => this.modelColorPass?.coverageTexture ?? fallback,
                    sceneAvailable: () => !!this._sceneAvailable,
                    terrainAvailable: () => !!this._terrainAvailable,
                    modelAvailable: () => !!this.modelColorPass?.depthTexture && !!this.modelColorPass?.coverageTexture,
                },
            });
        }
    }

    _clearTargets() {
        this._observer.suspend(() => {
            for (const target of [...this._sceneTargets, ...this._terrainTargets]) {
                this._clear.execute(this.scene.context, target.state);
            }
        });
        this._sceneIndex = 0;
        this._terrainIndex = 0;
    }

    _rememberFrustum(context) {
        const frustum = context.uniformState.currentFrustum;
        const inverse = context.uniformState.inverseProjection;
        if (!Number.isFinite(frustum.x) || !Number.isFinite(frustum.y) ||
            frustum.x < 0 || frustum.y <= frustum.x) return false;
        for (let index = 0; index < 16; index++) {
            if (!Number.isFinite(inverse[index])) return false;
        }
        Matrix4.clone(inverse, this._lastInverseProjection);
        this._lastFrustum.x = frustum.x;
        this._lastFrustum.y = frustum.y;
        return true;
    }

    _observeDraw(command, context, passState) {
        if (!this._frameActive || command.renderState?.depthMask === false ||
            ![Pass.CESIUM_3D_TILE, Pass.OPAQUE, Pass.TRANSLUCENT].includes(command.pass)) return;
        const framebuffer = command.framebuffer ?? passState?.framebuffer;
        if (!framebuffer) return;
        this._lastFramebuffer = this._rememberFrustum(context) ? framebuffer : undefined;
    }

    _beforeClear(command, context, passState) {
        if (!this._frameActive || command.depth === undefined) return;
        const framebuffer = command.framebuffer ?? passState?.framebuffer;
        if (framebuffer !== this._lastFramebuffer || !framebuffer) return;
        this.captureScene(context, resolveSceneDepthTexture(this.scene, framebuffer, context), true);
        this._lastFramebuffer = undefined;
    }

    _capture(context, texture, terrain, savedFrustum) {
        if (!this._frameActive || !texture) return;
        if (!savedFrustum && !this._rememberFrustum(context)) return;
        this._ensureResources(context);
        Matrix4.clone(this._lastInverseProjection, this._inverseProjection);
        Cartesian2.clone(this._lastFrustum, this._frustum);
        this._sourceDepth = texture;
        this._packedDepth = terrain;
        const targets = terrain ? this._terrainTargets : this._sceneTargets;
        const previousIndex = terrain ? this._terrainIndex : this._sceneIndex;
        this._previousDistance = targets[previousIndex].texture;
        const index = 1 - previousIndex;
        this._observer.suspend(() => this._captureCommand.execute(context, targets[index].state));
        if (terrain) { this._terrainIndex = index; this._terrainAvailable = true; }
        else { this._sceneIndex = index; this._sceneAvailable = true; }
    }

    captureTerrain(globeDepth, context) {
        this._capture(context, context.uniformState.globeDepthTexture, true, false);
    }

    captureScene(context, depth, savedFrustum = false) {
        this._capture(context, depth, false, savedFrustum || !!this._lastFramebuffer);
    }

    _combine(context) {
        if (!this._frameActive) return;
        this._ensureResources(context);
        this._observer.suspend(() => this._combineCommand.execute(context, this._combined.state));
    }

    invalidateHistory() { this.generation++; }

    _releaseTargets() {
        const targets = [...(this._sceneTargets ?? []), ...(this._terrainTargets ?? []), ...(this._combined ? [this._combined] : [])];
        this._sceneTargets = undefined;
        this._terrainTargets = undefined;
        this._combined = undefined;
        this._sceneAvailable = false;
        this._terrainAvailable = false;
        runCleanup(targets.flatMap(target => [
            () => target.state.framebuffer.destroy(),
            () => target.texture.destroy(),
        ]), "Scene depth target cleanup failed");
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        const capture = this._captureCommand;
        const combine = this._combineCommand;
        this._captureCommand = undefined;
        this._combineCommand = undefined;
        runCleanup([
            () => this._observer?.destroy(),
            () => this._releaseTargets(),
            () => capture?.shaderProgram?.destroy(),
            () => combine?.shaderProgram?.destroy(),
        ], "Scene depth cleanup failed");
    }
}
