import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as Cesium from "cesium";
import * as adapter from "../Library/internal/CesiumAdapter.js";

async function createHarness() {
    const draws = [], clears = [], targets = new Set(), programs = new Set(), errors = [];
    let programId = 0;
    const shaderCache = new WeakMap();
    function program(options = {}) {
        const result = {
            id: ++programId,
            vertexShaderSource: new Cesium.ShaderSource({ sources: ["void main(){ gl_Position=vec4(0.0); }"] }),
            fragmentShaderSource: new Cesium.ShaderSource({ sources: ["void main(){ out_FragColor=vec4(0.25); }"] }),
            _attributeLocations: { position: 0 }, ...options,
            destroy() { assert(programs.delete(this), "a private shader is released once"); },
        };
        programs.add(result);
        return result;
    }
    class Manager {
        constructor(options) { this.options = options; this.framebuffer = { manager: this }; targets.add(this); }
        update(context, width, height, samples, datatype, format) {
            Object.assign(this, { width, height, samples, datatype, format });
            this.texture = { manager: this, width, height };
        }
        getColorTexture() { assert(targets.has(this)); return this.texture; }
        destroy() { assert(targets.delete(this)); }
    }
    const renderState = { getState: state => structuredClone(state), fromCache: state => structuredClone(state) };
    const main = { depthStencilTexture: { nativeDepth: true } };
    const context = {
        defaultTexture: {},
        uniformState: { currentFrustum: new Cesium.Cartesian2(1, 1000), inverseProjection: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY), globeDepthTexture: { packed: true } },
        shaderCache: {
            getDerivedShaderProgram(base, key) { return shaderCache.get(base)?.get(key); },
            createDerivedShaderProgram(base, key, options) {
                let map = shaderCache.get(base);
                if (!map) { map = new Map(); shaderCache.set(base, map); }
                const result = { id: ++programId, base, ...options };
                map.set(key, result);
                return result;
            },
        },
        draw(command, state, shader, uniforms) {
            draws.push({ command, state, framebuffer: command.framebuffer ?? state?.framebuffer,
                shader: shader ?? command.shaderProgram, uniforms: uniforms ?? command.uniformMap,
                renderState: structuredClone(command.renderState), vertexArray: command.vertexArray,
                instanceCount: command.instanceCount, count: command.count });
            return command;
        },
        clear(command, state) { clears.push({ framebuffer: command.framebuffer ?? state?.framebuffer, color: command.color, depth: command.depth }); },
        createViewportQuadCommand(fragment, options) {
            return new Cesium.DrawCommand({ shaderProgram: program({ fragment }), uniformMap: options.uniformMap, renderState: options.renderState });
        },
    };
    const listeners = new Set();
    const globeDepth = { framebuffer: main, depthStencilTexture: main.depthStencilTexture,
        prepareColorTextures() {}, executeCopyDepth() {} };
    const scene = {
        context, drawingBufferWidth: 640, drawingBufferHeight: 480, logarithmicDepthBuffer: true,
        frameState: { frameNumber: 1, useLogDepth: true, passes: { render: true } },
        _view: { globeDepth }, postProcessStages: { execute() {} },
        _environmentState: { useGlobeDepthFramebuffer: true },
        preRender: { addEventListener(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    };
    const sandbox = vm.createContext({ console: { error: error => errors.push(error) } });
    const depthReconstructionGLSL = await readFile(new URL("../Library/shaders/geospatial/depthReconstruction.glsl", import.meta.url), "utf8");
    const entry = new vm.SourceTextModule(await readFile(new URL("../Library/GaussianSplatPass.js", import.meta.url), "utf8"), { context: sandbox });
    await entry.link(specifier => {
        const values = specifier === "cesium" ? { ...Cesium, FramebufferManager: Manager, RenderState: renderState }
            : specifier.endsWith("CesiumAdapter.js") ? adapter
                : specifier.endsWith("SceneDepth.js") ? { depthReconstructionGLSL } : undefined;
        assert(values, `unexpected import ${specifier}`);
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context: sandbox });
    });
    await entry.evaluate();
    const nativeCommand = (pass = Cesium.Pass.GAUSSIAN_SPLATS) => new Cesium.DrawCommand({
        pass, shaderProgram: program(), uniformMap: { native: () => 23 },
        vertexArray: { native: true }, instanceCount: 8, count: 6,
        renderState: { colorMask: { red: true, green: true, blue: true, alpha: false },
            depthTest: { enabled: true }, depthMask: pass !== Cesium.Pass.GAUSSIAN_SPLATS,
            blending: { enabled: pass === Cesium.Pass.GAUSSIAN_SPLATS,
                functionSourceRgb: Cesium.BlendFunction.ONE,
                functionDestinationRgb: Cesium.BlendFunction.ONE_MINUS_SOURCE_ALPHA },
        },
    });
    return { GaussianSplatPass: entry.namespace.default, scene, context, main, state: { framebuffer: main },
        targets, programs, draws, clears, errors, listeners, nativeCommand, program,
        releasePrograms() { for (const p of Array.from(programs)) p.destroy(); } };
}

test("Gaussian color is redirected once, preserving native sorting/bindings and isolated proxy depth", async () => {
    const h = await createHarness();
    const pass = new h.GaussianSplatPass(h.scene, { options: { colorSpace: "srgb" } });
    const command = h.nativeCommand();
    const originalState = structuredClone(command.renderState);
    const shader = h.program(), uniforms = { actual: () => 44 };
    h.context.draw(command, h.state, shader, uniforms);
    assert.deepEqual(command.renderState, originalState);
    assert.equal(command.framebuffer, undefined);
    const splats = h.draws.filter(draw => draw.command.pass === Cesium.Pass.GAUSSIAN_SPLATS);
    assert.equal(splats.length, 2, "one native color draw plus one depth-only proxy, no color replay");
    const [proxy, color] = splats;
    assert.equal(color.shader, shader);
    assert.equal(proxy.shader.base, shader);
    assert.equal(color.uniforms, uniforms);
    assert.equal(proxy.uniforms, uniforms);
    assert.notEqual(color.framebuffer, h.main);
    assert.notEqual(proxy.framebuffer, color.framebuffer);
    assert.equal(color.renderState.depthMask, false);
    assert.equal(color.renderState.blending.enabled, true);
    assert.equal(color.renderState.colorMask.alpha, true, "the private layer collects coverage even if native alpha writes were masked");
    assert.equal(proxy.renderState.depthMask, true);
    assert.equal(proxy.renderState.blending.enabled, false);
    for (const draw of splats) {
        assert.equal(draw.vertexArray, command.vertexArray);
        assert.equal(draw.instanceCount, 8);
        assert.equal(draw.count, 6);
    }
    assert.match(proxy.shader.fragmentShaderSource.sources.join("\n"), /bsGaussianEyeDepth \/ max\(-ray\.z/);
    assert.match(proxy.shader.vertexShaderSource.sources.join("\n"), /bsGaussianEyeDepth = gl_Position\.w/);
    assert.equal(pass.colorTexture, pass.coverageTexture);
    assert.equal(pass.byteLength, 640 * 480 * 20);
    assert.equal(h.targets.size, 2);
    for (const target of h.targets) assert.equal(target.samples, 1);
    pass.destroy();
    assert.equal(h.targets.size, 0);
    h.releasePrograms();
});

test("ordinary geometry is never replayed and its native depth clips older Gaussian contributions", async () => {
    const h = await createHarness();
    const pass = new h.GaussianSplatPass(h.scene);
    h.context.draw(h.nativeCommand(Cesium.Pass.CESIUM_3D_TILE), h.state);
    assert.equal(h.draws.length, 1);
    assert.equal(h.targets.size, 0);
    h.context.draw(h.nativeCommand(), h.state);
    const previous = h.draws.length;
    h.context.draw(h.nativeCommand(Cesium.Pass.CESIUM_3D_TILE), h.state);
    h.context.clear({ depth: 1 }, h.state);
    assert.equal(h.draws.length, previous + 2, "one native mesh draw and one depth-mask fullscreen draw");
    const clip = h.draws.at(-1);
    assert.match(clip.shader.fragment, /nativeDepth/);
    assert.equal(clip.framebuffer.manager, pass.colorTexture.manager);
    assert.notEqual(clip.uniforms.gaussianDepth(), pass.colorTexture, "the color output is never sampled while attached");
    pass.destroy();h.releasePrograms();
});

test("hidden frames expose no stale layers; resize and dispose release all private resources", async () => {
    const h = await createHarness();
    const nativeDraw = h.context.draw;
    const pass = new h.GaussianSplatPass(h.scene, { show: false });
    const command = h.nativeCommand();
    h.context.draw(command, h.state);
    assert.equal(h.targets.size, 0);
    pass.enabled = true;
    h.context.draw(command, h.state);
    const old = new Set(h.targets);
    h.scene.frameState.frameNumber++;
    pass.updateFrame();
    assert.equal(pass.colorTexture, undefined);
    assert.equal(pass.depthTexture, undefined);
    h.context.draw(command, h.state);
    assert.equal(h.targets.size, 2);
    for (const target of old) assert(h.targets.has(target));
    h.scene.drawingBufferWidth = 800;
    h.context.draw(command, h.state);
    for (const target of old) assert(!h.targets.has(target));
    assert.equal(pass.byteLength, 800 * 480 * 20);
    pass.destroy();pass.destroy();
    assert.equal(h.targets.size, 0);
    assert.equal(h.listeners.size, 0);
    assert.equal(h.context.draw, nativeDraw);
    h.releasePrograms();
});

test("calibration preserves alpha and follows declared color space, exposure and daylight", async () => {
    const h = await createHarness();
    const pass = new h.GaussianSplatPass(h.scene);
    const command = h.nativeCommand();
    command.owner = { _tileset: { _selectedTiles: [{ content: { _loader: { gltfJson: {
        meshes: [{ primitives: [{ extensions: { KHR_gaussian_splatting: { colorSpace: "lin_rec709_display" } } }] }],
    } } } }] } };
    h.context.draw(command, h.state);
    assert.equal(pass.colorSpace, "linear");
    pass.daylightFactor = 0.1;
    assert(Math.abs(pass.exposureMultiplier - Math.SQRT1_2 * 0.1) < 1e-12);
    pass.update({ exposureOffset: 1, daylightResponse: false });
    assert.equal(pass.exposureMultiplier, 2);
    assert.equal(command.renderState.depthMask, false);
    pass.destroy();h.releasePrograms();
});

test("failed proxy creation stops retries without mutating the native command or leaking targets", async () => {
    const h = await createHarness();
    const errors = [];
    const pass = new h.GaussianSplatPass(h.scene, { onError: e => errors.push(e) });
    const command = h.nativeCommand();
    h.context.shaderCache.createDerivedShaderProgram = () => { throw new Error("proxy unavailable"); };
    assert.doesNotThrow(() => h.context.draw(command, h.state));
    assert.equal(pass.enabled, false);
    const nativeColors = h.draws.filter(draw => draw.command.pass === Cesium.Pass.GAUSSIAN_SPLATS);
    assert.equal(nativeColors.length, 1, "the failing frame still draws the original color once");
    assert.equal(nativeColors[0].framebuffer, h.main, "proxy preflight fails before color redirection");
    assert.equal(errors.length, 0, "failure ownership switches only at the next frame boundary");
    h.scene.frameState.frameNumber++;
    pass.updateFrame();
    assert.equal(h.targets.size, 0);
    assert.equal(errors.length, 1);
    const before = h.draws.length;
    h.context.draw(command, h.state);
    assert.equal(h.draws.length, before + 1, "later frames resume the ordinary native draw only");
    assert.equal(command.framebuffer, undefined);
    pass.destroy();h.releasePrograms();
});

test("a late auxiliary failure preserves already redirected colors until the frame is consumed", async () => {
    const h = await createHarness();
    const errors = [];
    const pass = new h.GaussianSplatPass(h.scene, { onError: error => errors.push(error) });
    h.context.draw(h.nativeCommand(), h.state);
    const color = pass.colorTexture;
    const depth = pass.depthTexture;
    assert(color && depth);
    h.context.shaderCache.createDerivedShaderProgram = () => { throw new Error("later variant failed"); };
    const next = h.nativeCommand();
    h.context.draw(next, h.state);
    assert.equal(h.draws.at(-1).framebuffer, h.main, "the failing draw retains its native target");
    assert.equal(pass.colorTexture, color, "the earlier color is still consumable this frame");
    assert.equal(pass.depthTexture, depth);
    assert.equal(h.targets.size, 2);
    assert.equal(errors.length, 0);
    pass.flushPendingFailure();
    assert.equal(pass.colorTexture, color, "same-frame flushing cannot release a live contribution");
    h.scene.frameState.frameNumber++;
    pass.flushPendingFailure();
    assert.equal(h.targets.size, 0);
    assert.equal(pass.colorTexture, undefined);
    assert.equal(errors.length, 1);
    pass.flushPendingFailure();
    assert.equal(errors.length, 1);
    pass.destroy();h.releasePrograms();
});
