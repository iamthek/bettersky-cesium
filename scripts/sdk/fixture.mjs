// This fixture is generated only inside the isolated acceptance workspace.
export function browserAcceptance() {
  const resultNode = document.getElementById("result");
  const errors = [];
  const expectedErrors = [];
  let allowExpectedError = false;
  const originalError = console.error;
  console.error = (...values) => {
    const message = values.map(String).join(" ");
    (allowExpectedError ? expectedErrors : errors).push(message);
    originalError(...values);
  };
  window.addEventListener("error", event => errors.push(event.message));
  window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));

  return async function run(Cesium, BetterSky, defaultExport, caseId, base, checkSnow) {
    const start = performance.now();
    let startupMs;
    const checks = [];
    let viewer;
    let effects;
    const check = (name, condition) => {
      checks.push({ name, passed: !!condition });
      if (!condition) throw new Error("Acceptance failed: " + name);
    };
    // Drive actual Viewer frames explicitly: background-tab rAF may be paused
    // by the browser, which would otherwise stall acceptance indefinitely.
    const frames = async count => {
      for (let index = 0; index < count; index++) {
        viewer.resize();
        viewer.render();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };
    const options = { time: undefined, coverage: 0.8, smaa: true, volumetricLight: { quality: "low" } };
    const makeViewer = (extra = {}) => new Cesium.Viewer("viewer", {
      baseLayer: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false,
      useDefaultRenderLoop: false,
      ...extra,
    });
    function attach() {
      effects = new BetterSky(viewer, options);
      return effects;
    }
    async function ready() {
      // The public promise covers required sky assets, not SMAA or optional snow.
      // Keep rendering to exercise GPU upload and stage execution as well.
      let settled = false;
      let rejected = false;
      let rejection;
      effects.assetsReady.then(() => { settled = true; }, error => { rejected = true; rejection = error; settled = true; });
      const deadline = performance.now() + 90000;
      while (performance.now() < deadline) {
        await frames(4);
        if (rejected) throw new Error("assetsReady rejected: " + rejection);
        if (errors.length) throw new Error(errors.join("\n"));
        if (settled && effects.assetStatus === "error") throw new Error("Required sky assets failed: " + JSON.stringify(effects.assetErrors));
        const pass = effects.pass;
        if (settled && effects.assetStatus === "ready" && pass && pass._u_scattering_texture !== pass._defaultTexture3D &&
          pass._u_irradiance_texture !== viewer.scene.context.defaultTexture &&
          pass._u_transmittance_texture !== viewer.scene.context.defaultTexture &&
          pass.shapeTexture !== pass._defaultTexture3D &&
          pass.shapeDetailTexture !== pass._defaultTexture3D &&
          pass.stbnTexture !== pass._defaultTexture3D &&
          pass.localWeatherTexture !== viewer.scene.context.defaultTexture &&
          pass.turbulenceTexture !== viewer.scene.context.defaultTexture) return;
      }
      throw new Error("Runtime assets did not become ready within 90 seconds");
    }
    const publishResult = async result => {
      resultNode.textContent = JSON.stringify(result, null, 2);
      const response = await fetch(base + "__acceptance/result", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!response.ok) throw new Error("Cannot save acceptance result: HTTP " + response.status);
    };
    try {
      check("named and default exports agree", BetterSky === defaultExport);
      viewer = makeViewer({ globe: false });
      let missingGlobeRejected = false;
      try { new BetterSky(viewer, options); } catch { missingGlobeRejected = true; }
      check("globe-free initialization rejected", missingGlobeRejected && viewer.scene.postProcessStages.length === 0);
      viewer.destroy();
      viewer = makeViewer();
      viewer.scene.renderError.addEventListener((scene, error) => errors.push(String(error)));
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#607357");
      viewer.resolutionScale = 0.5;
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2026-06-21T04:00:00Z");
      viewer.scene.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(104.07, 30.4, 9000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-20), roll: 0 },
      });
      const initialTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
      const stagesBefore = viewer.scene.postProcessStages.length;
      attach();
      check("business clock preserved", Cesium.JulianDate.equals(initialTime, viewer.clock.currentTime));
      const stageCount = viewer.scene.postProcessStages.length;
      const snapshot = effects.getOptions();
      const acceptedOptions = JSON.stringify(snapshot);
      snapshot.coverage = 0.123;
      snapshot.cloud.altitudes[0] += 123;
      snapshot.volumetricLight.intensity = 7;
      check("getOptions returns independent nested snapshots", JSON.stringify(effects.getOptions()) === acceptedOptions && effects.getOptions() !== effects.getOptions());
      check("asset status starts idle", effects.assetStatus === "idle" && effects.assetErrors.length === 0);
      const assetStates = [];
      const unsubscribeAssets = effects.subscribeAssets(() => assetStates.push(effects.assetStatus));
      check("subscribeAssets returns an unsubscribe function", typeof unsubscribeAssets === "function");
      let rejected = false;
      try { new BetterSky(viewer, options); } catch (error) { rejected = /active|instance|实例/i.test(error.message); }
      check("second instance rejected without changing stages", rejected && viewer.scene.postProcessStages.length === stageCount);
      await ready();
      check("assetsReady settles with successful required sky assets", effects.assetStatus === "ready" && effects.assetErrors.length === 0);
      check("asset subscription observes loading and ready", assetStates.includes("loading") && assetStates.includes("ready"));
      const retryResult = await effects.retryAssets();
      check("retryAssets settles successfully with no failed assets", retryResult === undefined && effects.assetStatus === "ready" && effects.assetErrors.length === 0);
      unsubscribeAssets();
      const notificationsBeforeUnsubscribedRetry = assetStates.length;
      await effects.retryAssets();
      check("asset subscription can be removed", assetStates.length === notificationsBeforeUnsubscribedRetry);
      await frames(12);
      startupMs = performance.now() - start;
      check("real GPU stages ready", !!effects.stage && effects.stage.ready);
      effects.update({ coverage: 0.5, volumetricLight: { intensity: 1.5 } });
      if (checkSnow) effects.pass.showSnow = true;
      await frames(6);
      check("parameter update", Math.abs(effects.pass.coverage - 0.5) < 0.00001);
      effects.enabled = false;
      check("disable", effects.enabled === false);
      effects.enabled = true;
      effects.hbaoEnabled = true;
      effects.smaaEnabled = false;
      effects.smaaEnabled = true;
      await frames(6);
      const host = document.getElementById("viewer");
      host.style.width = "580px";
      host.style.height = "330px";
      viewer.resize();
      await frames(6);
      check("resize", viewer.scene.drawingBufferWidth > 0);
      const intervals = [];
      for (let index = 0; index < 30; index++) {
        const frameStart = performance.now();
        viewer.render();
        viewer.scene.context._gl.finish();
        intervals.push(performance.now() - frameStart);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      effects.dispose();
      effects.dispose();
      check("idempotent disposal removes stages", viewer.scene.postProcessStages.length === stagesBefore);
      await effects.assetsReady;
      check("disposed resource getters settle safely", effects.assetStatus === "disposed" && effects.assetErrors.length === 0);
      rejected = false;
      try { effects.retryAssets(); } catch { rejected = true; }
      check("retryAssets rejects disposed mutations", rejected);
      attach();
      const pendingPass = effects.pass;
      const pendingAssets = effects.assetsReady;
      effects.dispose();
      effects.dispose();
      await pendingAssets;
      check("disposal during asset loading", viewer.scene.postProcessStages.length === stagesBefore);
      check("assetsReady settles without rejection after disposal", effects.assetStatus === "disposed");
      await frames(8);
      attach();
      await ready();
      check("late callbacks do not recreate GPU resources", pendingPass.isDestroyed() && pendingPass._ownedTextures.size === 0);
      check("recreate after disposal", !!effects.stage);
      allowExpectedError = true;
      viewer.scene.camera.switchToOrthographicFrustum();
      await frames(4);
      check("unsupported runtime camera stops effects", effects.enabled === false);
      check("runtime camera reports once", expectedErrors.length === 1);
      effects.dispose();
      effects = undefined;
      allowExpectedError = false;
      const beforeRejected = viewer.scene.postProcessStages.length;
      rejected = false;
      try { new BetterSky(viewer, options); } catch { rejected = true; }
      check("orthographic initialization rejected", rejected && viewer.scene.postProcessStages.length === beforeRejected);
      viewer.scene.camera.switchToPerspectiveFrustum();
      viewer.scene.mode = Cesium.SceneMode.SCENE2D;
      rejected = false;
      try { new BetterSky(viewer, options); } catch { rejected = true; }
      check("2D initialization rejected", rejected);
      viewer.scene.mode = Cesium.SceneMode.COLUMBUS_VIEW;
      rejected = false;
      try { new BetterSky(viewer, options); } catch { rejected = true; }
      check("Columbus initialization rejected", rejected);
      viewer.scene.mode = Cesium.SceneMode.SCENE3D;
      attach();
      await ready();
      check("rebuild after restoring perspective 3D", !!effects.stage);
      effects.enabled = false;
      await frames(2);
      viewer.render();
      const beforePixels = viewer.scene.context.readPixels();
      effects.enabled = true;
      effects.update({ coverage: 0.95 });
      await frames(24);
      viewer.render();
      const afterPixels = viewer.scene.context.readPixels();
      let changedChannels = 0;
      for (let index = 0; index < beforePixels.length; index++) if (Math.abs(beforePixels[index] - afterPixels[index]) > 2) changedChannels++;
      check("effects change actual rendered pixels", changedChannels > beforePixels.length * 0.01);
      const resources = performance.getEntriesByType("resource")
        .filter(entry => entry.name.includes("/BetterSkyAssets/"))
        .map(entry => ({ url: entry.name, duration: entry.duration, bytes: entry.transferSize }));
      check("runtime resources requested", resources.length >= 8);
      check("no unexpected console or runtime errors", errors.length === 0);
      const result = {
        caseId, status: "passed", checks, errors, expectedErrors, resources,
        capabilities: { webgl2: viewer.scene.context.webgl2, float16Array: typeof Float16Array },
        metrics: { startupMs, frameMs: intervals.reduce((a, b) => a + b, 0) / intervals.length, frameSamples: intervals, changedChannels },
      };
      await publishResult(result);
      document.getElementById("status").textContent = "PASSED — render remains visible for inspection";
    } catch (error) {
      await publishResult({ caseId, status: "failed", checks, errors, failure: String(error), stack: error.stack });
      document.getElementById("status").textContent = "FAILED";
    }
    document.getElementById("dispose").onclick = () => {
      effects?.dispose();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      document.getElementById("status").textContent += " — disposed";
    };
  };
}
