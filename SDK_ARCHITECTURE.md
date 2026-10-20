# SDK 架构与开发边界

本轮按现有 SDK 默认画面与生命周期契约整理内部职责。默认色调映射仍为 ACES（9）、覆盖度 0.34、曝光倍率 2.8；原有云、大气、体积光、HBAO、SMAA、时间与场景设置的默认值保持不变。单页一个活动实例、三维地球透视场景的限制继续生效。

## 目录与入口

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | 唯一公开类型与 SDK 构建入口，显式约束可发布的接口及 JSDoc。 |
| `BetterSky.js` | 兼容的 JavaScript 运行入口，负责实例、参数命令和效果编排。 |
| `src/options.js` | 默认预设、克隆、归一化与参数校验。 |
| `Library/` | 渲染实现与 GLSL，内部实现不进入包的公开导出路径。 |
| `Library/internal/` | 资源管理、场景状态记录、局部数学类型及 Cesium 适配。 |
| `demo/` | 演示 HTML、脚本与环境变量示例，统一通过公开 SDK 入口接入。 |
| `scripts/sdk/` | SDK 编译、声明生成、组装、打包、验收和发布。 |
| `dist/` / `.sdk-package/` | SDK 构建及组装输出。 |
| `dist-demo/` | 演示站点构建输出，可供 GitHub Pages 托管。 |

根 `vite.config.js` 只配置 demo。`index.html` 位于 `demo/`，不会作为 SDK 入口。SDK 由 `build:sdk` 显式调用 Vite 的库构建 API；Vite 8 使用 Rolldown/Oxc，Cesium 与 three 保持 external。

## 配置更新

构造器、`update()`、便捷属性和云参数方法共用归一化与校验。向量输入接受数组或 Cesium 数学对象，配置快照统一保存为独立数组。未知字段、非有限数、明确的非法枚举或范围在写入场景前拒绝。

`getOptions()` 返回当前已接受配置的独立副本；改动副本不会影响 SDK。HBAO 关闭后保存原参数，重新开启时恢复。`hbao.denoise` 只在构造时决定后处理结构，运行时更改会明确抛错，重复相同值保持幂等。公开更新类型 `BetterSkyUpdateOptions` 不暴露这个构造期字段。

`applySceneSettings` 继续按每次命令判断：本次明确为 `false` 才跳过本次 HDR、gamma、对数深度写入。快照记录实际场景值，不记录未生效的候选值。直接修改高级 `pass` 不会自动同步快照，普通接入优先使用公开入口。销毁后修改参数统一抛错。

## 资源状态

- `assetStatus`：`idle`、`loading`、`ready`、`error` 或 `disposed`。
- `assetErrors`：冻结的错误快照，每项含 `id`、`url`、`required` 和原始 `error`。
- `assetsReady`：读取时按需启动天空 Pass 的六项必需任务，即使效果初始关闭也会加载；Promise 在成功、失败或销毁时结算，失败通过错误快照判断。
- `retryAssets()`：显式重试已失败任务，不重复加载成功任务，也不逐帧自动重试。
- `subscribeAssets(listener)`：订阅状态变化，返回取消订阅函数；订阅方异常不改变资源结果。

六项必需任务是天气图、湍流图、基础形状噪声、细节噪声、STBN 和大气 LUT。雪纹理为按需可选任务，不阻塞 `assetsReady`，但错误仍可观察。因此必需任务结算时，按需任务可能仍在加载或失败。SMAA 查找纹理使用独立的同类资源管理器，不属于公开天空资源 Promise 的等待范围。

构造及常规首帧加载时机保持原样；只有显式读取 `assetsReady` 才会提前启动所需资源。请求仍不主动中止，销毁后迟到回调跳过 GPU 创建。大气 LUT 的 GPU 纹理在全部上传成功后才发布，部分失败会释放本次临时分配并保留 fallback。

## 宿主与渲染器边界

数学便捷操作放在内部专用类型中，不修改 Cesium 的共享原型。HBAO 的阶段与相机缓存属于实例。`CesiumAdapter` 集中处理当前用到的渲染器私有接口；它不使这些接口变为官方稳定 API，升级 Cesium 仍须验证。

`SceneStateLease` 集中记录天空、雾、地球光照与地形参数的原值和 SDK 写入值，默认继续按旧策略恢复。正常销毁仍保留既有的时间、HDR、gamma、对数深度等入口设置；失败构造保留回滚保障。内部资源销毁逐项尝试，最后汇总错误，避免一项释放失败跳过其余释放。

## 类型、构建与版本验证

TypeScript CLI 从 `src/index.ts` 严格编译声明，保留注释且关闭 declaration map；内部 JavaScript 是显式的不透明边界，由运行测试约束。只发布生成的 `dist/index.d.ts`，不发布实现路径。Oxc TypeScript AST 检查类型、成员和具名参数的说明，不再限制声明必须单行。

本轮工具版本：Vite 8.3.4、vite-plugin-static-copy 4.1.1、javascript-obfuscator 5.9.0、TypeScript 7.0.2、oxc-parser 0.155.0；开发建议 Node 24（Vite 要求 Node 20.19+ 或 22.12+）。运行依赖和 SDK 支持范围未因工具升级而改写。

SDK 的 Cesium 支持下限保持为 `>=1.142.0`，其与 engine 26.0.0 / widgets 16.0.0 的组合已验证。Vite 8 会验证 Cesium 模块的全部再导出；已确认干净安装 `cesium@1.142.0` 自动解析 engine 26.4.0 / widgets 16.3.0 时，上游旧入口有缺失导出，连仅导入 `Cartesian2` 的最小项目也失败。1.146.0 + engine 26.4.0 / widgets 16.3.0 的干净安装也通过。此项作为使用文档中的上游依赖组合提示，不据此提高 SDK 支持下限，也不要求用户配置 overrides。接入项目应保留完整锁文件；发布验收继续真实记录各组合结果，不通过 overrides 或测试替身把失败改成通过。

演示部署说明见 [`demo/README.md`](demo/README.md)，发布与验收要求见 [`SDK_PUBLISH_PLAN.md`](SDK_PUBLISH_PLAN.md)。本轮只生成本地可审查改动，不执行 npm 发布或 GitHub Pages 部署。
