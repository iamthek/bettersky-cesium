# EffectPipeline 迁移到其他项目指南

本文说明如何将本仓库的 EffectPipeline 源码复制到已有项目，接入 Cesium Viewer，并配置资源部署与生命周期。完整参数说明见 [EffectPipeline 使用说明](EffectPipeline.README.zh-CN.md)，可运行的参考实现见 [demo-official.js](demo-official.js)。

当前 SDK 以 ES Module 源码提供。迁移需要同时复制入口、库代码和静态资源；只复制 `EffectPipeline.js` 无法运行。

## 1. 确认目标项目满足要求

| 项目 | 要求与说明 |
| --- | --- |
| Cesium | 本仓库锁文件使用 **1.142.0**。管线依赖渲染器内部接口，首次迁移建议使用此版本；其他版本需要单独验证。 |
| three | 本仓库锁文件使用 **0.160.1**，是纹理加载器和级联阴影等模块的运行时依赖。 |
| 构建工具 | 需要解析 ES Module，以及将 `*.glsl?raw` 导入为原文字符串。Vite 可直接处理本仓库的着色器导入。 |
| 浏览器与 GPU | 需要 WebGL 2、三维/数组纹理和浮点渲染目标；当前源码还使用原生 `Float16Array` 与 `structuredClone`。 |
| 场景 | 面向包含 `scene.globe` 的三维透视场景，使用单活动 Viewer、单管线实例。 |

先确认目标项目原有 Cesium 场景可以正常显示，再接入效果。业务与 SDK 应使用同一份 Cesium 模块，避免同时加载 npm Cesium 与另一份 CDN/全局 Cesium。

仓库开发环境要求 Node.js 22 或更高版本；这是运行仓库工具链的要求。目标项目的 Node.js、包管理器和构建工具配置应结合其现有依赖确认。

## 2. 复制文件，保留内部相对路径

建议将源码集中放到目标项目的 `src/lib/effectPipeline/`，将资源保留在项目根目录的 `static/` 下：

```text
目标项目/
├─ src/
│  └─ lib/
│     └─ effectPipeline/
│        ├─ EffectPipeline.js        ← 本仓库 EffectPipeline.js
│        ├─ Library/                 ← 本仓库完整 Library/ 目录
│        │  ├─ geospatial/
│        │  ├─ shaders/              ← 包含 GLSL 源文件
│        │  └─ ...其余库文件
│        └─ LICENSE                  ← 本仓库 LICENSE
├─ static/
│  └─ EffectPipelineAssets/           ← 本仓库完整同名目录
│     ├─ GeospatialAssets/
│     └─ ...其余效果资源
└─ vite.config.js                    ← 合并下文资源配置
```

复制清单：

- [EffectPipeline.js](EffectPipeline.js)：公开入口、默认预设、参数更新与销毁。
- [Library/](Library/)：完整复制，包括着色器、纹理处理、离屏渲染及 Cesium 兼容辅助代码。
- [static/EffectPipelineAssets/](static/EffectPipelineAssets/)：完整复制，保留文件名、子目录和大小写。
- [LICENSE](LICENSE)：将本仓库的许可与版权声明随复制的源码保留。

可以改变 `effectPipeline/` 在目标项目中的位置，但必须保持 `EffectPipeline.js` 与 `Library/` 的相邻关系，以及 `Library/` 内部结构。静态资源的源目录可以调整，复制配置中的 `src` 必须同步修改。

无需复制 `node_modules/`、仓库锁文件、`.codegraph/`、示例 HTML、`demo-official.js` 或 `.env.local`。示例的参数面板、天地图/Ion 配置和分辨率限制属于示例业务代码，SDK 不会自动提供这些行为。目标项目继续使用自己的底图、地形和凭据配置。

不要因为暂时关闭 HBAO 或 SMAA 就删掉对应模块；入口仍然会导入它们。首次迁移应保留完整库和资源目录，避免遗漏间接依赖。

## 3. 安装依赖

在目标项目中安装运行时依赖。以下使用 npm 举例，也可使用目标项目已有的包管理器：

```bash
npm install --save-exact cesium@1.142.0 three@0.160.1
```

若项目已经安装 Cesium，先检查现有版本和其他功能的兼容需求，再决定是否统一版本。确认业务创建 Viewer 时使用的 `cesium`，与复制代码的 `import ... from "cesium"` 解析到同一份依赖。

采用下文 Vite 静态复制方案时，还需要 `vite-plugin-static-copy`。本仓库锁文件组合为 Vite **6.4.3** 与插件 **2.3.2**；目标项目也使用 Vite 6 时，可安装对应插件：

```bash
npm install --save-dev --save-exact vite-plugin-static-copy@2.3.2
```

其他 Vite 版本应选用与其兼容的插件版本。Vite 与复制插件属于开发依赖，运行时仍需部署下一节列出的资源。

## 4. 配置着色器与静态资源

### Vite 配置

`Library/shaders/` 中的 GLSL 通过 `?raw` 导入为字符串。迁入 Vite 项目时保留现有导入，不需要额外 GLSL 插件，也不要改为 `?url`。

将下面配置合并到目标项目现有的 `vite.config.js` 或 `vite.config.ts`。保留已有的框架插件、别名、代理及其他配置；将 `define` 字段和复制插件追加到相应位置。

```js
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// 根路径部署用 "/"；部署到 /map/ 时改为 "/map/"。
const appBase = "/";

export default defineConfig({
  base: appBase,
  define: {
    // 官方 Cesium 资源与效果资源共用此根目录。
    CESIUM_BASE_URL: JSON.stringify(`${appBase}cesium/`),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}",
          dest: "cesium",
        },
        {
          src: "static/EffectPipelineAssets",
          dest: "cesium",
        },
      ],
    }),
  ],
});
```

该配置与仓库的 [vite.config.js](vite.config.js) 使用相同的资源复制方式，并将应用部署路径与资源基础路径统一管理。复制插件在开发时提供资源，构建时将目录复制到输出目录。

### 部署后的目录与 URL

根路径部署时，构建产物应包含以下目录；默认输出目录为 `dist/`：

```text
dist/
└─ cesium/
   ├─ Workers/
   ├─ Assets/
   ├─ ThirdParty/
   ├─ Widgets/
   └─ EffectPipelineAssets/
      ├─ snowCoverMask.png
      ├─ ...其他效果资源
      └─ GeospatialAssets/
         ├─ local_weather.png
         ├─ ...EXR / BIN / PNG 资源
         └─ ...其余文件
```

源码通过 Cesium 的 `buildModuleUrl("EffectPipelineAssets/...")` 请求效果资源，所以 `EffectPipelineAssets/` 必须位于 `CESIUM_BASE_URL` 指向的目录下，与 `Workers/`、`Assets/` 等目录并列。构造参数中没有独立的效果资源根路径配置。

| 部署方式 | `base` / `appBase` | `CESIUM_BASE_URL` | 天气纹理请求示例 |
| --- | --- | --- | --- |
| 站点根路径 | `/` | `/cesium/` | `/cesium/EffectPipelineAssets/GeospatialAssets/local_weather.png` |
| `/map/` 子路径 | `/map/` | `/map/cesium/` | `/map/cesium/EffectPipelineAssets/GeospatialAssets/local_weather.png` |

子路径部署时，服务端应将输出目录挂载到 `/map/`，使 `dist/cesium/` 对应 `/map/cesium/`。只修改 Vite 的 `base` 不会自动修改写死的 `CESIUM_BASE_URL`，两者要保持一致。

如果目标项目已经通过插件、`public/` 目录或部署脚本提供 Cesium 官方资源，可以复用该方案，只补充效果资源目录，避免重复复制。文件应原样提供；服务器的 SPA 回退规则不应将缺失的 `.bin`、`.exr` 或 Worker 请求返回为 HTML 页面。

### 其他构建工具

非 Vite 项目需自行完成以下三项适配：

1. 让现有 `*.glsl?raw` 导入得到着色器原文字符串，或者有针对性地调整导入与加载规则。
2. 在开发服务和生产产物中提供上面的静态目录结构。
3. 在 Cesium 首次解析资源路径前，配置同一份 Cesium 使用的基础 URL，例如通过构建工具定义 `CESIUM_BASE_URL`，或在客户端初始化时调用 `Cesium.buildModuleUrl.setBaseUrl("/cesium/")`。

SSR 项目应在客户端挂载后加载并初始化管线，避免在服务端创建 Viewer 或执行渲染代码。

## 5. 接入已有 Viewer

入口路径按照第二节的目录示例填写。已有 Viewer 时，只需引入管线并创建实例：

```js
import "cesium/Build/Cesium/Widgets/widgets.css";
import { EffectPipeline } from "./lib/effectPipeline/EffectPipeline.js";

// viewer 是业务已创建且尚未销毁的 Cesium.Viewer。
// 云动画和时域重建需要持续获得渲染帧。
viewer.scene.requestRenderMode = false;

const fx = new EffectPipeline(viewer, {
  time: undefined, // 保留业务当前时钟，不使用内置预设时间。
});
```

上述导入路径假设调用文件位于 `src/`；其他位置需相应调整。如果应用入口已经引入控件 CSS，无需再次引入。

也可以传入 `viewer.scene`，但此时管线拿不到 Viewer 时钟，`time` 参数不会设置 `viewer.clock.currentTime`。`new EffectPipeline(viewer)` 会应用完整默认预设，其中包含固定时间；要保留业务时间，应明确传入 `time: undefined`。

SDK 会自动注册后处理阶段和 `scene.preRender` 监听，无需再次调用 `scene.postProcessStages.add(fx.stage)`，也无需手动逐帧调用 `fx.pass.update()`。公开的 `fx.update()` 用于修改配置。

若业务必须保留 `requestRenderMode: true`，需要自行持续调度 `scene.requestRender()`，并在参数变化后请求渲染；SDK 不会自动调度这些请求。

初次观察效果时，将相机放在近地高度。默认云、云影与相关光束会在相机椭球高度 30–90 km 之间淡出；在全球视角看不到云，不一定是迁移失败。需要高空观察云时可按业务要求设置 `cloud.altitudeFadeRange: null`。

## 6. 修改参数与管理生命周期

### 参数更新

```js
fx.update({
  coverage: 0.45,
  cloud: { hazeQuality: "balanced" },
});

fx.enabled = false; // 暂时关闭。
fx.enabled = true;  // 重新开启。
```

构造和更新都允许只传需要修改的字段。嵌套对象逐字段合并，数组整项替换；可通过 `EffectPipeline.defaultOptions` 获取默认配置的独立副本。全部参数及取值范围见 [使用说明中的参数配置](EffectPipeline.README.zh-CN.md#参数配置)。

保持 `systemLight: true` 可让效果沿用 Cesium 系统太阳光。天气移动使用实际经过时间，暂停 `viewer.clock` 不会自动停止云的所有移动。

### 场景设置影响

迁移到已有业务场景时，需要留意以下行为：

| 设置 | 接入与退出行为 |
| --- | --- |
| HDR、对数深度、gamma、地形深度测试 | 构造时默认应用预设；关闭或销毁不会自动恢复这些字段。 |
| Viewer 时钟 | 有效 `time` 会设置当前时间，销毁时不恢复；`time: undefined` 可保留原时间。 |
| 内置天空、大气、太阳、雾与部分 globe 设置 | 第一个启用帧会保存并接管这些字段；关闭或销毁时恢复保存值。包括地球光照、瓦片缓存和屏幕空间误差。 |

构造时可用 `applySceneSettings: false` 跳过 HDR、对数深度、gamma 与地形深度测试设置，但它不会阻止天空/地球接管或有效 `time` 的应用。调用 `update()` 时若传入 HDR 等字段，又希望跳过场景设置，需要在该次更新中同时传入 `applySceneSettings: false`。

需要退出后恢复完整业务场景时，在创建管线前自行保存不会自动恢复的字段，并在销毁后恢复。效果运行期间如果业务也修改了被接管的天空或 globe 字段，关闭管线会恢复快照值，应协调双方的设置时机。

### 销毁顺序

```js
// 路由离开、组件卸载或业务销毁场景时，先销毁管线。
fx.dispose();

// 仅当业务也要销毁此 Viewer 时执行。
viewer.destroy();
```

若 Viewer 由公共地图容器管理，使用方只清理自己的 EffectPipeline，Viewer 的销毁由容器负责。销毁后不再调用该管线实例；同一个 Viewer 不应重复挂载多个管线。

资源异步加载，目前没有公开的全部资源就绪 Promise 或请求取消接口。首次加载期间应避免反复创建/销毁。`dispose()` 会移除逐帧监听和注册阶段并清理 pass，但不会完整撤销所有 context 辅助方法、原型扩展或 GPU 分配；当前实现还有模块级共享状态，不支持隔离的并发实例。

## 7. 在目标项目中验证

源码能被导入或编译，不等于资源与 GPU 渲染已正常工作。迁移后，在实际浏览器中按下面的清单验证：

- [ ] 原有底图、地形或模型正常显示，Viewer 容器尺寸有效。
- [ ] Console 无模块、GLSL、纹理、Framebuffer 或 `[EffectPipeline] update error` 错误。
- [ ] Network 中效果资源、Cesium Worker 等请求成功，返回实际文件内容；缓存命中可以返回 304。
- [ ] 持续渲染并等待异步资源加载后，近地视角能看到天空和云；旋转、缩放相机时画面正常。
- [ ] `fx.update()` 修改云量后效果变化，总开关关闭/开启后场景正常恢复。
- [ ] 使用 HBAO/SMAA 时，它们工作正常；如果切换色调映射，也检查切换后的画面。
- [ ] 调整窗口或容器尺寸后，画面与效果尺寸正常同步。
- [ ] 退出场景时先 `dispose()` 再销毁 Viewer，没有遗留逐帧更新报错。
- [ ] 在最终部署地址验证一次，尤其是子路径部署，确认资源 URL 正确。

这些操作需要结合目标项目进行视觉与运行时检查；本指南不代表已经验证了目标项目。

## 8. 常见迁移问题

| 现象 | 优先检查 |
| --- | --- |
| 找不到 `Library/...` 或 GLSL 模块 | 是否复制完整 `Library/`，是否保持相对路径，构建工具是否支持 `?raw`。 |
| 找不到 `three` | 是否安装运行时依赖，目标项目的模块解析是否正常。 |
| 图片、EXR、BIN 或 Worker 404 | `CESIUM_BASE_URL`、部署挂载路径、复制目标及大小写。目录名是 `GeospatialAssets`。 |
| 请求为 200，但纹理解码失败 | 检查响应是否被 SPA 回退为 HTML，资源是否完整，是否从同一份源码版本复制。 |
| `Float16Array` 未定义 | 检查浏览器是否提供该全局类型；当前大气纹理加载路径需要将半精度数据转换为浮点数据。 |
| 不支持纹理类型或浮点渲染目标 | 检查 WebGL 2 与 GPU 能力，构建通过不会补齐缺失的运行时能力。 |
| 云不动或效果只在操作相机时刷新 | 是否开启显式渲染模式，却没有持续请求新帧。 |
| 全球视角看不到云 | 是否触发默认的相机高度淡出；回到近地视角检查。 |
| 出现 `Unrecognized uniform type: 36289` 等渲染错误 | 是否混用了其他版本或旧代码；保留完整 `Library/viewportQuadCommand.js` 等兼容模块，并核对 Cesium 版本。 |
| 接入后业务天空、雾、光照或时间变化 | 检查场景接管行为、`applySceneSettings` 与 `time`，按上文协调保存/恢复。 |
| 切换页面后报错或重复效果 | 是否重复创建实例，是否在 Viewer 销毁前调用 `dispose()`。 |

升级或重新同步源码时，将 `EffectPipeline.js`、`Library/` 和 `EffectPipelineAssets/` 作为一组更新，再重新执行迁移验证。避免将不同版本的 JS、着色器和纹理资源混用。
