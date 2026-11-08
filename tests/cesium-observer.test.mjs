import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as Cesium from "cesium";
import {
    getAuxiliaryShaderProgram,
    getFramebufferDepthTexture,
    getGaussianSourceColorSpace,
    installSceneDrawObserver,
    moveStageToEnd,
    moveStagesToFront,
    resolveSceneDepthTexture,
} from "../Library/internal/CesiumAdapter.js";

test("draw transformations chain real shader bindings and redirect exactly one native draw", () => {
    const h = createScene();
    const source = Object.freeze({ shaderProgram: { native: true }, uniformMap: { native: true }, result: 19 });
    const lightShader = { lighting: true }, lightUniforms = { lighting: true }, colorTarget = {};
    let layerCommand, observed;
    const lighting = installSceneDrawObserver(h.scene, {
        beforeDraw(command, context, state, actual) {
            assert.equal(command, source);
            assert.equal(actual.shaderProgram, source.shaderProgram);
            return { shaderProgram: lightShader, uniformMap: lightUniforms };
        },
    });
    const layer = installSceneDrawObserver(h.scene, {
        beforeDraw(command, context, state, actual) {
            assert.equal(actual.shaderProgram, lightShader);
            assert.equal(actual.uniformMap, lightUniforms);
            layerCommand = { ...command, framebuffer: colorTarget, shaderProgram: actual.shaderProgram, uniformMap: actual.uniformMap };
            return { command: layerCommand };
        },
        onDraw(...args) { observed = args; },
    });
    assert.equal(h.context.draw(source, h.passState), 19);
    assert.deepEqual(h.events, [["native-draw", h.context, layerCommand, h.passState, lightShader, lightUniforms]]);
    assert.deepEqual(observed, [source, h.context, h.passState, { shaderProgram: lightShader, uniformMap: lightUniforms }]);
    assert.equal(source.framebuffer, undefined);
    layer.destroy();lighting.destroy();
});

test("native tone mapping is skipped only during a requesting SDK frame and restored even on failure", () => {
    const h = createScene();
    const tone = { enabled: true };
    h.stages._tonemapping = tone;
    let shouldSkip = true, fail = false, inside;
    h.stages.execute = function () { inside = tone.enabled; if (fail) throw new Error("post failed"); return 31; };
    const observer = installSceneDrawObserver(h.scene, { skipNativeTonemapping: () => shouldSkip });
    assert.equal(h.stages.execute(h.context), 31);
    assert.equal(inside, false);
    assert.equal(tone.enabled, true);
    shouldSkip = false;
    h.stages.execute(h.context);
    assert.equal(inside, true);
    shouldSkip = true;fail = true;
    assert.throws(() => h.stages.execute(h.context), /post failed/);
    assert.equal(tone.enabled, true);
    observer.destroy();
});

test("official Gaussian tile metadata distinguishes source transfer functions and rejects mixed spaces", () => {
    const command = value => ({ owner: { _tileset: { _selectedTiles: value.map(colorSpace => ({ content: { _loader: { gltfJson: {
        meshes: [{ primitives: [{ extensions: { KHR_gaussian_splatting: { colorSpace } } }] }],
    } } } })) } } });
    assert.equal(getGaussianSourceColorSpace({}), undefined);
    assert.equal(getGaussianSourceColorSpace(command([undefined])), undefined);
    assert.equal(getGaussianSourceColorSpace(command(["srgb_rec709_display"])), "srgb");
    assert.equal(getGaussianSourceColorSpace(command(["lin_rec709_display"])), "linear");
    assert.throws(() => getGaussianSourceColorSpace(command(["unknown"])), /Unsupported Gaussian color space/);
    assert.throws(() => getGaussianSourceColorSpace(command(["lin_rec709_display", "srgb_rec709_display"])), /different color spaces/);
});

function createScene() {
    const events = [];
    const main = { depthStencilTexture: { name: "scene-depth" } };
    const sceneFramebuffer = { framebuffer: {} };
    const listeners = new Set();
    const context = Object.create({
        draw(command, passState, shader, uniforms) {
            events.push(["native-draw", this, command, passState, shader, uniforms]);
            return command.result;
        },
        clear(command, passState) {
            events.push(["native-clear", this, command, passState]);
            return command.result;
        },
    });
    function createGlobeDepth() {
        return {
            framebuffer: main,
            executeCopyDepth(renderContext, passState) {
                events.push(["native-copy-depth", this, renderContext, passState]);
                renderContext.uniformState.globeDepthTexture = { packed: true };
                return 41;
            },
        };
    }
    context.uniformState = {};
    const stages = {
        execute(...args) {
            events.push(["native-post-process", this, ...args]);
            return 53;
        },
    };
    const scene = {
        context,
        frameState: { passes: { render: true } },
        postProcessStages: stages,
        _view: { globeDepth: createGlobeDepth(), sceneFramebuffer },
        _environmentState: { useGlobeDepthFramebuffer: true, usePostProcess: true },
        preRender: {
            addEventListener(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        },
    };
    return { scene, context, stages, main, events, listeners, createGlobeDepth, passState: { framebuffer: main } };
}

test("scene observers preserve native commands, this, arguments, return values and clear ordering", () => {
    const h = createScene();
    const originalDraw = h.context.draw;
    const originalClear = h.context.clear;
    const originalCopy = h.scene._view.globeDepth.executeCopyDepth;
    const originalExecute = h.stages.execute;
    const command = Object.freeze({ shaderProgram: {}, uniformMap: {}, result: 17 });
    const shaderOverride = {};
    const uniformsOverride = {};
    const callbacks = [];
    const observer = installSceneDrawObserver(h.scene, {
        onDraw(...args) { callbacks.push(["draw", ...args]); },
        beforeClear() { h.events.push(["before-clear"]); },
        onClear() { h.events.push(["after-clear"]); },
        onGlobeDepthCopy(...args) { callbacks.push(["copy", ...args]); },
        beforePostProcess(...args) { h.events.push(["before-post-process", ...args]); },
        afterPostProcess(...args) { h.events.push(["after-post-process", ...args]); },
    });
    assert.equal(h.context.draw(command, h.passState, shaderOverride, uniformsOverride), 17);
    assert.deepEqual(h.events.shift(), ["native-draw", h.context, command, h.passState, shaderOverride, uniformsOverride]);
    assert.deepEqual(callbacks.shift(), ["draw", command, h.context, h.passState, { shaderProgram: shaderOverride, uniformMap: uniformsOverride }]);
    assert.equal(h.context.clear(command, h.passState), 17);
    assert.deepEqual(h.events.splice(0), [["before-clear"], ["native-clear", h.context, command, h.passState], ["after-clear"]]);
    assert.equal(h.scene._view.globeDepth.executeCopyDepth(h.context, h.passState), 41);
    assert.deepEqual(callbacks.shift(), ["copy", h.scene._view.globeDepth, h.context, h.passState]);
    assert.equal(h.context.uniformState.globeDepthTexture.packed, true);
    const textures = [{ color: true }, { depth: true }, { id: true }];
    assert.equal(h.stages.execute(h.context, ...textures), 53);
    assert.deepEqual(h.events.slice(-3), [
        ["before-post-process", h.context, ...textures],
        ["native-post-process", h.stages, h.context, ...textures],
        ["after-post-process", h.context, ...textures],
    ]);
    observer.destroy();
    observer.destroy();
    assert.equal(h.context.draw, originalDraw);
    assert.equal(h.context.clear, originalClear);
    assert.equal(Object.hasOwn(h.context, "draw"), false);
    assert.equal(h.scene._view.globeDepth.executeCopyDepth, originalCopy);
    assert.equal(h.stages.execute, originalExecute);
    assert.equal(h.listeners.size, 0);
});

test("auxiliary work cannot recursively observe itself and a failed callback releases the guard", () => {
    const h = createScene();
    const command = { shaderProgram: {}, uniformMap: {} };
    let draws = 0;
    let clears = 0;
    let fail = true;
    const observer = installSceneDrawObserver(h.scene, {
        onDraw() {
            ++draws;
            h.context.draw(command, h.passState);
            h.context.clear(command, h.passState);
            if (fail) throw new Error("auxiliary draw failed");
        },
        onClear() { ++clears; },
    });
    assert.throws(() => h.context.draw(command, h.passState), /auxiliary draw failed/);
    fail = false;
    h.context.draw(command, h.passState);
    assert.equal(draws, 2);
    assert.equal(clears, 0);
    observer.suspend(() => h.context.draw(command, h.passState));
    assert.equal(draws, 2);
    assert.throws(() => observer.suspend(() => { throw new Error("failed suspended task"); }));
    h.context.clear(command, h.passState);
    assert.equal(clears, 1);
    observer.destroy();
});

test("only normal scene color targets are observed, independently for each scene", () => {
    const h = createScene();
    const other = createScene();
    const observed = [];
    const observer = installSceneDrawObserver(h.scene, { onDraw(command) { observed.push(command); } });
    const command = { shaderProgram: {}, uniformMap: {} };
    other.context.draw(command, other.passState);
    for (const flag of ["pick", "pickVoxel", "depth", "offscreen"]) {
        h.scene.frameState.passes[flag] = true;
        h.context.draw(command, h.passState);
        delete h.scene.frameState.passes[flag];
    }
    h.scene.frameState.passes.render = false;
    h.context.draw(command, h.passState);
    h.scene.frameState.passes.render = true;
    h.context.draw(command, { framebuffer: { idOrShadowTarget: true } });
    h.context.draw({ ...command, framebuffer: {} }, h.passState);
    assert.deepEqual(observed, []);
    h.context.draw(command, h.passState);
    h.scene._environmentState.useGlobeDepthFramebuffer = false;
    h.context.draw(command, { framebuffer: h.scene._view.sceneFramebuffer.framebuffer });
    assert.equal(observed.length, 2);
    observer.destroy();
});

test("subscriptions share interceptions, follow replacement globe buffers and preserve later host replacements", () => {
    const h = createScene();
    let first = 0;
    let second = 0;
    let copies = 0;
    const firstObserver = installSceneDrawObserver(h.scene, { onDraw() { ++first; } });
    const wrappedDraw = h.context.draw;
    const secondObserver = installSceneDrawObserver(h.scene, { onDraw() { ++second; }, onGlobeDepthCopy() { ++copies; } });
    assert.equal(h.context.draw, wrappedDraw);
    assert.equal(h.listeners.size, 1);
    const command = { shaderProgram: {}, uniformMap: {} };
    h.context.draw(command, h.passState);
    assert.equal(first, 1);
    assert.equal(second, 1);
    firstObserver.destroy();
    h.context.draw(command, h.passState);
    assert.equal(first, 1);
    assert.equal(second, 2);
    const oldGlobe = h.scene._view.globeDepth;
    const oldWrappedCopy = oldGlobe.executeCopyDepth;
    h.scene._view.globeDepth = h.createGlobeDepth();
    for (const listener of h.listeners) listener();
    assert.notEqual(oldGlobe.executeCopyDepth, oldWrappedCopy);
    oldGlobe.executeCopyDepth(h.context, h.passState);
    assert.equal(copies, 0);
    h.scene._view.globeDepth.executeCopyDepth(h.context, h.passState);
    assert.equal(copies, 1);
    const hostDraw = () => "host replacement";
    h.context.draw = hostDraw;
    secondObserver.destroy();
    assert.equal(h.context.draw, hostDraw);
    assert.equal(h.listeners.size, 0);
    assert.equal(getFramebufferDepthTexture(h.main), h.main.depthStencilTexture);
    assert.equal(getFramebufferDepthTexture({ depthTexture: 7 }), 7);
});

test("a failed installation rolls back any instance interceptions already installed", () => {
    const h = createScene();
    const nativeDraw = h.context.draw;
    Object.defineProperty(h.context, "clear", { value: h.context.clear, writable: false });
    assert.throws(() => installSceneDrawObserver(h.scene, {}), TypeError);
    assert.equal(h.context.draw, nativeDraw);
    assert.equal(Object.hasOwn(h.context, "draw"), false);
});

test("auxiliary shader derivation is cached under its native base without replacing vertex bindings", () => {
    const base = { vertexShaderSource: {}, _attributeLocations: { position: 0 } };
    const fragment = {};
    let cached;
    let creates = 0;
    let sourceBuilds = 0;
    const context = {
        shaderCache: {
            getDerivedShaderProgram(original, key) { assert.equal(original, base); assert.equal(key, "coverage"); return cached; },
            createDerivedShaderProgram(original, key, options) {
                ++creates;
                assert.equal(original, base);
                assert.equal(key, "coverage");
                assert.equal(options.vertexShaderSource, base.vertexShaderSource);
                assert.equal(options.attributeLocations, base._attributeLocations);
                assert.equal(options.fragmentShaderSource, fragment);
                cached = { derived: true };
                return cached;
            },
        },
    };
    assert.equal(getAuxiliaryShaderProgram(context, base, "coverage", () => { ++sourceBuilds; return fragment; }), cached);
    assert.equal(getAuxiliaryShaderProgram(context, base, "coverage", () => { assert.fail("cached shaders must not rebuild source"); }), cached);
    assert.equal(creates, 1);
    assert.equal(sourceBuilds, 1);
});

test("moving the final compositor after a newly added stage updates indices without destroying stages", () => {
    const first = { _index: 0 };
    const compositor = { _index: 2 };
    const smaa = { _index: 3 };
    const collection = { _stages: [first, undefined, compositor, smaa], remove() { assert.fail("reordering must not destroy a stage"); } };
    moveStageToEnd(collection, compositor);
    assert.deepEqual(collection._stages, [first, undefined, smaa, compositor]);
    assert.deepEqual([first._index, smaa._index, compositor._index], [0, 2, 3]);
    assert.equal(collection._textureCacheDirty, true);
    collection._textureCacheDirty = false;
    moveStageToEnd(collection, compositor);
    moveStageToEnd(collection, {});
    assert.equal(collection._textureCacheDirty, false);
});

test("multisampled scene depth is resolved through the owning framebuffer before being sampled", () => {
    const h = createScene();
    const resolves = [];
    const globe = h.scene._view.globeDepth;
    const framebuffer = h.scene._view.sceneFramebuffer;
    globe.prepareColorTextures = context => { assert.equal(context, h.context); resolves.push("globe"); };
    globe.depthStencilTexture = { name: "resolved-globe-depth" };
    framebuffer.prepareColorTextures = context => { assert.equal(context, h.context); resolves.push("scene"); };
    framebuffer.depthStencilTexture = { name: "resolved-scene-depth" };
    assert.equal(resolveSceneDepthTexture(h.scene, globe.framebuffer, h.context), globe.depthStencilTexture);
    assert.equal(resolveSceneDepthTexture(h.scene, framebuffer.framebuffer, h.context), framebuffer.depthStencilTexture);
    const ownDepth = { own: true };
    assert.equal(resolveSceneDepthTexture(h.scene, { depthTexture: ownDepth }, h.context), ownDepth);
    assert.equal(resolveSceneDepthTexture(h.scene, undefined, h.context), undefined);
    assert.deepEqual(resolves, ["globe", "scene"]);
});

async function createStateRestorationHarness() {
    const sandbox = vm.createContext({});
    const source = await readFile(new URL("../Library/internal/CesiumAdapter.js", import.meta.url), "utf8");
    const module = new vm.SourceTextModule(source, { context: sandbox });
    await module.link(() => {
        const values = { ...Cesium, RenderState: { apply(gl, renderState, passState) { gl.renderState = renderState; gl.passState = passState; } } };
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context: sandbox });
    });
    await module.evaluate();
    const h = createScene();
    const gl = { FRAMEBUFFER: "FRAMEBUFFER", BACK: "BACK", bindFramebuffer(target, framebuffer) { this.framebuffer = framebuffer; } };
    h.context._gl = gl;
    h.context.glDrawBuffers = buffers => { gl.drawBuffers = Array.from(buffers); };
    h.main._bind = () => { gl.framebuffer = h.main; };
    h.main._getActiveColorAttachments = () => ["COLOR_ATTACHMENT0"];
    h.context._currentFramebuffer = h.main;
    h.context._currentRenderState = { depthMask: false, blending: { enabled: true } };
    h.context._currentPassState = h.passState;
    h.context.uniformState.model = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
    return { ...h, gl, install: module.namespace.installSceneDrawObserver };
}

test("auxiliary depth draws return native framebuffer, depth/blend state and model uniforms before raw native work resumes", async () => {
    const h = await createStateRestorationHarness();
    const nativeRenderState = h.context._currentRenderState;
    const nativePassState = h.context._currentPassState;
    let callbacks = 0;
    let fail = true;
    const observer = h.install(h.scene, {
        onDraw() {
            ++callbacks;
            h.context._currentFramebuffer = { auxiliary: true };
            h.context._currentRenderState = { depthMask: true, blending: { enabled: false } };
            h.context._currentPassState = { auxiliary: true };
            h.context.uniformState.model = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(1, 2, 3));
            h.gl.framebuffer = "auxiliary";
            h.gl.renderState = h.context._currentRenderState;
            if (fail) throw new Error("proxy failed");
        },
    });
    const command = { shaderProgram: {}, uniformMap: {} };
    assert.throws(() => h.context.draw(command, h.passState), /proxy failed/);
    assert.equal(h.gl.framebuffer, h.main);
    assert.equal(h.context._currentFramebuffer, h.main);
    assert.equal(h.gl.renderState, nativeRenderState);
    assert.equal(h.context._currentRenderState, nativeRenderState);
    assert.equal(h.gl.passState, nativePassState);
    assert.equal(h.context._currentPassState, nativePassState);
    assert.deepEqual(h.gl.drawBuffers, ["COLOR_ATTACHMENT0"]);
    assert(Cesium.Matrix4.equals(h.context.uniformState.model, Cesium.Matrix4.IDENTITY));
    fail = false;
    h.context.draw(command, h.passState);
    assert.equal(callbacks, 2, "the recursion guard is released after failure");
    assert.equal(h.gl.renderState.depthMask, false);
    assert.equal(h.gl.renderState.blending.enabled, true);
    observer.destroy();
});

test("a destroyed target cached before resize is replaced by the default framebuffer during callback restoration", async () => {
    const h = await createStateRestorationHarness();
    h.context._currentFramebuffer = { isDestroyed: () => true, _bind() { assert.fail("destroyed framebuffer rebound"); } };
    const observer = h.install(h.scene, { onClear() {} });
    h.context.clear({}, h.passState);
    assert.equal(h.context._currentFramebuffer, undefined);
    assert.equal(h.gl.framebuffer, null);
    assert.deepEqual(h.gl.drawBuffers, ["BACK"]);
    observer.destroy();
});

test("HDR SDK stages move ahead of host display effects without destroying or reordering host stages", () => {
    const hostA = {}, hostB = {}, ao = {}, sky = {}, smaa = {};
    const stages = [hostA, ao, undefined, hostB, sky, smaa];
    const collection = { _stages: stages, _textureCacheDirty: false };
    moveStagesToFront(collection, [ao, sky, smaa, sky, {}]);
    assert.equal(collection._stages, stages, "the collection retains its stage-array identity");
    assert.deepEqual(stages, [ao, sky, smaa, hostA, undefined, hostB]);
    for (let i = 0; i < stages.length; ++i) if (stages[i]) assert.equal(stages[i]._index, i);
    assert.equal(collection._textureCacheDirty, true);
    collection._textureCacheDirty = false;
    moveStagesToFront(collection, [ao, sky, smaa]);
    assert.equal(collection._textureCacheDirty, false, "an unchanged prefix does not rebuild framebuffer caches");
});
