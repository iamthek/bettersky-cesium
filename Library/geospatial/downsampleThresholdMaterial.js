import downsampleThresholdMaterialVertexShaderSource from "../shaders/geospatial/downsampleThresholdMaterial.vert.glsl?raw";
import downsampleThresholdMaterialFragmentShaderSource from "../shaders/geospatial/downsampleThresholdMaterial.frag.glsl?raw";
import { 
    PixelDatatype, PostProcessStageComposite, PostProcessStageSampleMode
 } from "cesium";
import RenderPass from "../PostProcessStage.js";

export const downsampleThresholdMaterialVS = downsampleThresholdMaterialVertexShaderSource;

export const downsampleThresholdMaterialFS = downsampleThresholdMaterialFragmentShaderSource;

export function downsampleThresholdMaterial(textureScale, texelSize, that) {
    const downsampleThresholdMaterial = new RenderPass({
        name: `czm_downsampleThresholdMaterial`,
        fragmentShader: downsampleThresholdMaterialFS,
        vertexShader: downsampleThresholdMaterialVS,
        uniforms: {
            inputBuffer: () => {
                return that._aerialPerspectiveOutputColor;
            },
            texelSize: () => {
                return texelSize
            },
            thresholdLevel: () => {
                return that._thresholdLevel * (that.preExposure ?? 1);
            },
            thresholdRange: () => {
                return that._thresholdRange * (that.preExposure ?? 1);
            },
            bloomRadianceLimit: () => 64 * (that.preExposure ?? 1),
        },
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        textureScale: textureScale,
        sampleMode: PostProcessStageSampleMode.LINEAR
    })



    return downsampleThresholdMaterial;
}
export default {};
