// Run through Vite in a WebGL2 browser:
// await (await import('/@fs/<absolute-project-root>/scripts/verify-rendering-webgl.js')).verifyRenderingWebGL()
// Uses the production GLSL with Cesium's actual builtins, in an isolated context.
import { Cartesian4, Matrix4, PerspectiveFrustum, ShaderSource } from 'cesium';
import depthSource from '../Library/shaders/hbao/depth.glsl?raw';
import positionSource from '../Library/shaders/hbao/reconstructPosition.glsl?raw';
import normalSource from '../Library/shaders/hbao/reconstructNormal.glsl?raw';
import colorSource from '../Library/shaders/postprocess/geospatialPipeline.frag.glsl?raw';
import sceneDepthSource from '../Library/shaders/postprocess/sceneDepth.glsl?raw';

export function verifyRenderingWebGL() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets required');
  const results = [];
  const resources = [];
  const keep = (value, destroy) => { resources.push(() => destroy.call(gl, value)); return value; };
  function close(actual, expected, tolerance, label) {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
      throw new Error(`${label}: got ${actual}, expected ${expected} ± ${tolerance}`);
    }
  }
  function shader(type, source) {
    const value = keep(gl.createShader(type), gl.deleteShader);
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
    return value;
  }
  const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
    out vec2 v_textureCoordinates;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      v_textureCoordinates = p;
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`);
  function program(source, logDepth = false) {
    const combined = new ShaderSource({ sources: [source], defines: logDepth ? ['LOG_DEPTH'] : [] })
      .createCombinedFragmentShader({ webgl2: true, floatingPointTexture: true, textureFloatLinear: true });
    const value = keep(gl.createProgram(), gl.deleteProgram);
    gl.attachShader(value, vertex);
    gl.attachShader(value, shader(gl.FRAGMENT_SHADER, combined));
    gl.linkProgram(value);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value));
    return value;
  }
  function texture(width, height, data = null) {
    const value = keep(gl.createTexture(), gl.deleteTexture);
    gl.bindTexture(gl.TEXTURE_2D, value);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    return value;
  }
  function target(width, height) {
    const value = keep(gl.createFramebuffer(), gl.deleteFramebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, value);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture(width, height), 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer');
    gl.viewport(0, 0, width, height);
  }
  function uniforms(value, frustum, width = 1, height = 1, gamma = 2.2) {
    gl.useProgram(value);
    const set = (name, method, ...args) => gl[method](gl.getUniformLocation(value, name), ...args);
    set('czm_inverseProjection', 'uniformMatrix4fv', false, Matrix4.toArray(Matrix4.inverse(frustum.projectionMatrix, new Matrix4())));
    set('czm_viewportTransformation', 'uniformMatrix4fv', false, [width / 2, 0, 0, 0, 0, height / 2, 0, 0, 0, 0, 0.5, 0, width / 2, height / 2, 0.5, 1]);
    set('czm_viewport', 'uniform4f', 0, 0, width, height);
    set('czm_currentFrustum', 'uniform2f', frustum.near, frustum.far);
    set('czm_log2FarDepthFromNearPlusOne', 'uniform1f', Math.log2(frustum.far - frustum.near + 1));
    set('czm_gamma', 'uniform1f', gamma);
    return set;
  }
  function bind(set, name, value, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, value);
    set(name, 'uniform1i', unit);
  }
  function pixel(x = 0, y = 0) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const result = new Float32Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, result);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`);
    return result;
  }
  function project(frustum, point, logDepth) {
    const clip = Matrix4.multiplyByVector(frustum.projectionMatrix, new Cartesian4(...point, 1), new Cartesian4());
    return {
      uv: [clip.x / clip.w * 0.5 + 0.5, clip.y / clip.w * 0.5 + 0.5],
      depth: logDepth ? Math.log2(-point[2] - frustum.near + 1) / Math.log2(frustum.far - frustum.near + 1) : clip.z / clip.w * 0.5 + 0.5,
    };
  }
  try {
    gl.bindVertexArray(keep(gl.createVertexArray(), gl.deleteVertexArray));
    for (const depthMode of ['perspective', 'logarithmic', 'linear']) {
      const logDepth = depthMode === 'logarithmic';
      const linearDepth = depthMode === 'linear';
      const positionProgram = program(`${sceneDepthSource}\n${depthSource}\n${positionSource}
        uniform vec2 testUv; uniform float testDepth;
        void main() { out_FragColor = vec4(reconstructPosition(testUv, testDepth), 1.0); }`, logDepth);
      for (const aspectRatio of [16 / 9, 9 / 16, 1]) {
        const frustum = new PerspectiveFrustum({ fov: 1, aspectRatio, near: 1, far: 1e7 });
        target(1, 1);
        const set = uniforms(positionProgram, frustum);
        set('betterSkyLinearDepth', 'uniform1i', Number(linearDepth));
        for (const point of [[0, 0, -2], [1, -2, -20], [100, 50, -1000]]) {
          const projected = project(frustum, point, logDepth);
          set('testUv', 'uniform2fv', projected.uv);
          set('testDepth', 'uniform1f', linearDepth ? -point[2] : projected.depth);
          const actual = pixel();
          point.forEach((expected, i) => close(actual[i], expected, Math.max(0.002, Math.abs(expected) * 0.0005), 'eye position'));
          results.push(`position:${depthMode}:${aspectRatio}:${point[2]}`);
        }
      }
      // Analytic tilted plane: verify actual sampled-depth normal reconstruction,
      // including perspective correction and the orientation of the UV axes.
      const size = 32;
      const frustum = new PerspectiveFrustum({ fov: 1, aspectRatio: 16 / 9, near: 1, far: 1e7 });
      const normal = [0.2, -0.3, 1];
      const pixels = new Float32Array(size * size * 4);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const ray = [((x + 0.5) / size * 2 - 1) / frustum.projectionMatrix[0], ((y + 0.5) / size * 2 - 1) / frustum.projectionMatrix[5], -1];
        const distance = -100 / normal.reduce((sum, n, i) => sum + n * ray[i], 0);
        pixels[(y * size + x) * 4] = linearDepth ? distance : project(frustum, ray.map(n => n * distance), logDepth).depth;
      }
      const input = texture(size, size, pixels);
      const normalProgram = program(`${sceneDepthSource}\n${depthSource}\n${positionSource}\n${normalSource}
        uniform sampler2D depthTexture; in vec2 v_textureCoordinates;
        void main() {
          vec3 p = readPosition(depthTexture, v_textureCoordinates); vec3 dx; vec3 dy;
          out_FragColor = vec4(reconstructNormalAccurate(depthTexture, v_textureCoordinates, p,
            readDepth(depthTexture, v_textureCoordinates), vec2(1.0 / 32.0), dx, dy), 1.0);
        }`, logDepth);
      target(size, size);
      const set = uniforms(normalProgram, frustum, size, size);
      set('betterSkyLinearDepth', 'uniform1i', Number(linearDepth));
      bind(set, 'depthTexture', input, 0);
      const actual = pixel(16, 16);
      normal.forEach((n, i) => close(actual[i], n / Math.hypot(...normal), 0.002, 'tilted plane normal'));
      results.push(`normal:${depthMode}`);
    }
    const frustum = new PerspectiveFrustum({ fov: 1, aspectRatio: 1, near: 1, far: 1000 });
    const noRadiance = texture(1, 1, new Float32Array([0, 0, 0, 1]));
    for (const mode of [2, 4, 7, 8, 9, 10, 11, 12]) {
      const colorProgram = program(colorSource.replace('__TONE_MAPPING_MODE__', String(mode)));
      for (const gamma of [1, 2.2]) for (const exposure of [0, 1, 2.8]) {
        for (const gray of [0, 0.01, 0.18, 0.75, 1]) {
          const base = texture(1, 1, new Float32Array([gray ** gamma, gray ** gamma, gray ** gamma, 1]));
          target(1, 1);
          const set = uniforms(colorProgram, frustum, 1, 1, gamma);
          set('toneMappingExposure', 'uniform1f', exposure);
          bind(set, 'inputBuffer', noRadiance, 0);
          bind(set, 'sceneBaseBuffer', base, 1);
          const actual = pixel();
          for (let i = 0; i < 3; i++) close(actual[i], gray, 0.00001, 'native color without SDK radiance');
          results.push(`color:${mode}:${gamma}:${exposure}:${gray}`);
        }
      }
    }
    // Depthless foreground must survive against a bright sky; partial coverage
    // must reveal that sky continuously, rather than producing an opaque black quad.
    const composite = program(colorSource.replace('__TONE_MAPPING_MODE__', '9'));
    const sky = texture(1, 1, new Float32Array([0.3, 0.6, 1, 1]));
    const foreground = [0.1, 0.25, 0.5];
    let skyLinear;
    for (const coverage of [0, 0.01, 0.5, 1]) {
      const base = texture(1, 1, new Float32Array([...foreground.map(n => n * coverage), -coverage]));
      target(1, 1);
      const set = uniforms(composite, frustum, 1, 1, 1);
      set('toneMappingExposure', 'uniform1f', 2.8);
      bind(set, 'inputBuffer', sky, 0);
      bind(set, 'sceneBaseBuffer', base, 1);
      const actual = pixel();
      if (coverage === 0) skyLinear = actual;
      for (let i = 0; i < 3; i++) {
        close(actual[i], foreground[i] * coverage + skyLinear[i] * (1 - coverage), 0.008, 'depthless foreground over sky');
      }
      results.push(`skyCoverage:${coverage}`);
    }
    return { passed: results.length, checks: ['production depth reconstruction', 'production plane normals',
      'all tone-map modes preserve native colors and black', 'depthless foreground coverage over sky'] };
  } finally {
    resources.reverse().forEach(destroy => destroy());
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
