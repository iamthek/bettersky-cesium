import { BoundingRectangle, Cartesian2, ClearCommand, Color, Framebuffer, PassState,
    PixelDatatype, PixelFormat, RenderState, Sampler, Texture,
    TextureMagnificationFilter, TextureMinificationFilter } from 'cesium';
import { getSceneDepthFrustums } from './CesiumAdapter.js';
import sceneDepthShader from '../shaders/postprocess/sceneDepth.glsl?raw';

export { sceneDepthShader };

// Cesium clears native depth between ordinary frustums. Reuse its existing
// per-frustum picking copies instead of mistaking the far scene for empty sky.
export default class SceneDepth {
    constructor(scene) {
        this.scene = scene;
        this.linear = false;
        this._nearFar = new Cartesian2();
    }

    prepare(context, nativeDepth) {
        const scene = this.scene;
        if (scene.frameState?.useLogDepth ?? scene.logarithmicDepthBuffer) {
            this.linear = false;
            if (this._texture) this._releaseTarget();
            this._frame = undefined;
            return nativeDepth;
        }
        const frustums = getSceneDepthFrustums(scene);
        this.linear = frustums.length > 1;
        if (!this.linear) return nativeDepth;
        const { width, height } = nativeDepth;
        const frame = scene.frameState.frameNumber;
        if (this._frame === frame && this._texture?.width === width && this._texture?.height === height) return this._texture;
        if (this._texture?.width !== width || this._texture?.height !== height) {
            this._releaseTarget();
            this._texture = new Texture({ context, width, height, pixelFormat: PixelFormat.RED,
                pixelDatatype: PixelDatatype.FLOAT, flipY: false,
                sampler: new Sampler({ minificationFilter: TextureMinificationFilter.NEAREST,
                    magnificationFilter: TextureMagnificationFilter.NEAREST }) });
            this._passState = new PassState(context);
            this._passState.viewport = new BoundingRectangle(0, 0, width, height);
            this._passState.framebuffer = new Framebuffer({ context, colorTextures: [this._texture], destroyAttachments: false });
        }
        if (!this._command) {
            this._command = context.createViewportQuadCommand(`
                uniform sampler2D packedDepth;
                uniform vec2 frustumNearFar;
                in vec2 v_textureCoordinates;
                void main() {
                    float d = czm_unpackDepth(texture(packedDepth, v_textureCoordinates));
                    if (d <= 0.0 || d >= 1.0) discard;
                    float near = frustumNearFar.x;
                    float far = frustumNearFar.y;
                    out_FragColor = vec4(near * far / (far - d * (far - near)), 0.0, 0.0, 1.0);
                }`, {
                renderState: RenderState.fromCache({ depthTest: { enabled: false }, depthMask: false }),
                uniformMap: { packedDepth: () => this._source, frustumNearFar: () => this._nearFar },
            });
        }
        new ClearCommand({ color: Color.TRANSPARENT }).execute(context, this._passState);
        // Far-to-near overwrites preserve the nearest valid surface without float blending.
        for (let i = frustums.length - 1; i >= 0; i--) {
            const frustum = frustums[i];
            this._source = frustum.texture;
            this._nearFar.x = frustum.near;
            this._nearFar.y = frustum.far;
            this._command.execute(context, this._passState);
        }
        this._frame = frame;
        return this._texture;
    }

    _releaseTarget() {
        this._passState?.framebuffer?.destroy();
        this._texture?.destroy();
        this._passState = undefined;
        this._texture = undefined;
        this._frame = undefined;
    }

    destroy() {
        this._releaseTarget();
        this._command?.shaderProgram?.destroy();
        this._command = undefined;
    }
}
