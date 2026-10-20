import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function createHarness() {
  const images = [];
  const allocations = [];
  class Resource {
    constructor(options = {}) {
      Object.assign(this, options);
      this.destroyCount = 0;
      allocations.push(this);
    }
    isDestroyed() { return this.destroyCount > 0; }
    destroy() {
      assert.equal(this.destroyCount++, 0, 'resource destroyed twice');
      for (const texture of this.colorTextures || []) texture.destroy();
    }
    getColorTexture(index) { return this.colorTextures[index]; }
  }
  class FakeImage {
    constructor() { images.push(this); }
    set src(value) { this.source = value; }
  }
  class Vector {
    constructor() { this.x = 0; this.y = 0; }
  }
  class ShaderSource {
    constructor(options) { Object.assign(this, options); this.defines = []; }
  }
  class RenderPass extends Resource {
    execute() {}
    update() {}
  }
  const context = {
    drawingBufferWidth: 8,
    drawingBufferHeight: 8,
    webgl2: true,
    defaultTexture: { destroy() { assert.fail('host texture must survive'); } },
    createViewportQuadCommand(fragmentShader, options) {
      return { ...options, shaderProgram: new Resource(), execute() {} };
    },
  };
  const cesium = {
    destroyObject(object) { object.isDestroyed = () => true; },
    createGuid: () => 'smaa-test',
    Cartesian2: Vector,
    defined: value => value !== undefined && value !== null,
    PassState: class {},
    ClearCommand: class { execute() {} },
    Color: class {},
    Sampler: class { constructor(options) { Object.assign(this, options); } },
    WebGLConstants: {},
    BoundingRectangle: class {},
    Texture: Resource,
    RenderState: { fromCache: value => value },
    ShaderSource,
    Framebuffer: Resource,
  };
  const sandbox = vm.createContext({ Image: FakeImage });
  const modules = new Map();
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    let module;
    if (name === 'cesium') {
      module = new vm.SyntheticModule(Object.keys(cesium), function () {
        for (const [key, value] of Object.entries(cesium)) this.setExport(key, value);
      }, { context: sandbox });
    } else if (name.endsWith('?raw') || name.endsWith('/PostProcessStage.js')) {
      module = new vm.SyntheticModule(['default'], function () {
        this.setExport('default', name.endsWith('?raw') ? '' : RenderPass);
      }, { context: sandbox });
    } else {
      module = new vm.SourceTextModule(await readFile(new URL(name, import.meta.url), 'utf8'), {
        context: sandbox, identifier: name,
      });
    }
    modules.set(name, module);
    if (module instanceof vm.SourceTextModule) {
      await module.link(specifier => load(specifier === 'cesium' ? specifier
        : specifier.startsWith('./') ? '../Library/' + specifier.slice(2) : specifier));
    }
    return module;
  }
  const passModule = await load('../Library/SMAAEffectPass.js');
  await passModule.evaluate();
  const stageModule = await load('../Library/SMAAStage.js');
  await stageModule.evaluate();
  return { images, allocations, context, Pass: passModule.namespace.default, Stage: stageModule.namespace.default };
}

test('SMAA lookup images have one in-flight load and late callbacks cannot allocate textures', async () => {
  const { Pass, images, allocations, context } = await createHarness();
  const pass = new Pass({ context });
  pass.enabled = true;
  for (let frame = 0; frame < 20; frame++) pass.update(context);
  assert.equal(images.length, 2);
  const lateCallbacks = images.map(image => image.onload);
  pass.destroy();
  const allocatedBeforeLateLoads = allocations.length;
  for (const image of images) {
    assert.equal(image.onload, null);
    assert.equal(image.onerror, null);
  }
  for (const callback of lateCallbacks) callback();
  assert.equal(allocations.length, allocatedBeforeLateLoads);
  assert(allocations.every(resource => resource.destroyCount === 1));
});

test('SMAA releases loaded lookup textures, resize targets and commands without destroying host input', async () => {
  const { Pass, images, allocations, context } = await createHarness();
  const pass = new Pass({ context });
  pass.enabled = true;
  pass.setInputTexture(context.defaultTexture);
  pass.update(context);
  for (const image of images) image.onload();
  pass.update(context);
  assert.equal(images.length, 2);
  context.drawingBufferWidth = 16;
  pass.update(context);
  pass.destroy();
  assert(allocations.every(resource => resource.destroyCount === 1));
});

test('failed lookup images do not retry once per frame', async () => {
  const { Pass, images, context } = await createHarness();
  const pass = new Pass({ context });
  pass.enabled = true;
  pass.update(context);
  for (const image of images) image.onerror();
  for (let frame = 0; frame < 20; frame++) pass.update(context);
  assert.equal(images.length, 2);
  pass.destroy();
});

test('SMAA wrapper destruction is idempotent with or without prior collection removal', async () => {
  for (const collectionRemovedStage of [false, true]) {
    const { Stage, allocations, context } = await createHarness();
    const wrapper = new Stage({ context });
    wrapper.update(context);
    if (collectionRemovedStage) wrapper.stage.destroy();
    wrapper.destroy();
    wrapper.destroy();
    assert.equal(wrapper.isDestroyed(), true);
    assert(allocations.every(resource => resource.destroyCount === 1));
  }
});

test('SMAA lookup errors are observable and retry preserves the successful lookup texture', async () => {
  const { Pass, images, context } = await createHarness();
  const pass = new Pass({ context });
  pass.enabled = true;
  pass.update(context);
  images[0].onload();
  images[1].onerror();
  await pass.assetsReady;
  assert.equal(pass.assetStatus, 'error');
  assert.equal(pass.assetErrors.length, 1);
  assert.equal(pass.assetErrors[0].id, 'smaa-area');
  const search = pass._searchTexture;
  const retry = pass.retryAssets();
  assert.equal(images.length, 3);
  assert.equal(pass._searchTexture, search);
  images[2].onload();
  await retry;
  assert.equal(pass.assetStatus, 'ready');
  assert.equal(pass.assetErrors.length, 0);
  pass.destroy();
});

test('SMAA disposal settles lookup readiness even when image events never arrive', async () => {
  const { Stage, context } = await createHarness();
  const wrapper = new Stage({ context });
  wrapper.update(context);
  const ready = wrapper.assetsReady;
  wrapper.destroy();
  await ready;
  await wrapper.assetsReady;
  assert.equal(wrapper.assetStatus, 'disposed');
});
