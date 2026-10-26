# SDK 架构与开发说明

本文介绍 BetterSky `1.0.0` 的代码如何分工，方便维护和排查问题。安装与参数说明见[使用指南](BetterSky.README.zh-CN.md)，发布步骤见[发布流程](SDK_PUBLISH_PLAN.md)。

默认画面仍使用 ACES（9）、云覆盖度 0.34、曝光倍率 2.8；各效果默认值见使用指南。运行边界是同页一个活动实例，以及包含 Globe 的三维透视场景。

## 从哪里开始看

| 路径 | 负责什么 |
| --- | --- |
| `src/index.ts` | SDK 构建入口，定义公开 API、类型和编辑器参数说明。 |
| `BetterSky.js` | 创建实例、接收参数更新、协调各个效果和销毁。 |
| `src/options.js` | 默认参数、复制配置、统一向量格式、检查参数。 |
| `Library/` | 云、大气、光照、后处理与 GLSL 实现。 |
| `Library/internal/` | 资源加载状态、场景设置记录、内部数学类型和 Cesium 适配。 |
| `demo/` | 演示页面、控制面板和服务凭据示例，通过公开 SDK 入口接入。 |
| `scripts/sdk/` | SDK 构建、打包、验证和发布脚本。 |
| `dist/`、`.sdk-package/` | SDK 构建结果、准备打包的目录。 |
| `dist-demo/` | 演示网站的构建结果。 |

根目录 `vite.config.js` 负责 Demo，SDK 构建由 `build:sdk` 单独调用 Vite 库模式。两者使用不同输出目录。Cesium 和 three 都由使用方的依赖系统提供，不合并进 SDK bundle。

## 参数如何更新

构造器、`update()`、便捷属性和云参数方法共用参数检查和应用逻辑。未知字段、非法枚举、范围错误和非有限数会在应用前报错。嵌套对象按字段合并，数组整体替换。

`getOptions()` 返回当前配置的独立副本，修改副本不会改变效果；向量统一为数组。HBAO 关闭时保留参数，重开后恢复。`hbao.denoise` 只在构造时决定后处理结构，运行时改值会报错，重复相同值不会报错；`BetterSkyUpdateOptions` 不包含这个字段。

`applySceneSettings` 是持久配置：关闭期间只记录 HDR、gamma 和对数深度；重新设为 true 时应用已接受配置中的这些字段，保持开启期间则只应用当次显式提供的字段。配置快照保存已接受值，宿主实时值仍从场景读取。公开 API 不暴露内部 Pass。销毁后不能继续修改参数。

## 如何判断资源加载结果

| API | 用法 |
| --- | --- |
| `getAssetState()` | 无副作用地返回当前配置范围的冻结 `{ status, errors }`；错误项包含 `id`、`url`、`required` 和原始 `error`。 |
| `loadAssets()` | 启动并等待天空资源，以及已开启的 SMAA、雪纹理；目标失败或等待中销毁时拒绝。 |
| `retryAssets()` | 启动当前范围中尚未请求的任务、重试失败项，并保留已经成功加载的资源。 |
| `subscribeAssets(listener)` | 订阅变化并返回取消订阅函数；回调不接收参数，应在回调中读取状态。 |

`loadAssets()` 成功表示本次配置范围内的资源均已就绪；失败以 `AggregateError` 拒绝，等待期间销毁则以 `AbortError` 拒绝。订阅回调接收同一结构的只读状态。失败不会每帧自动重试。

天空资源是天气图、湍流图、基础形状噪声、细节噪声、STBN 和大气 LUT；大气任务会加载三张 EXR。`snow: true` 时雪纹理、`smaa: true` 时查找纹理属于加载范围，关闭时不启动也不阻塞。Cesium 的 `stage.ready` 与上述资源就绪分别判断。

通常由启用后的首帧开始后台加载；显式调用 `loadAssets()` 可以提前启动。销毁不会主动中止共享原始下载，但显式等待会以 `AbortError` 拒绝，迟到的回调会跳过 GPU 创建。大气 LUT 全部上传成功后才一起替换备用纹理；部分失败会释放本次临时纹理。

## 如何保护宿主场景

内部数学操作使用专用类型，不修改 Cesium 共享数学原型。HBAO 的阶段和相机缓存属于各自实例。`CesiumAdapter` 集中处理 SDK 使用到的 Cesium 渲染器内部接口，升级 Cesium 后仍须验证。

`SceneStateLease` 记录天空、雾、地球光照和地形参数。关闭或销毁时按原策略恢复这些设置；正常销毁不会自动还原时钟、HDR、gamma、对数深度和地形深度测试。构造失败时会回滚当次入口设置。销毁逐项尝试释放资源，个别失败不会跳过后续清理。

## 源码与 npm 包有什么区别

源码在 [GitHub](https://github.com/iamthek/bettersky-cesium) 公开，`1.0.0` 采用 Apache License 2.0；第三方材料保留各自许可。仓库保留已有素材与 Git 历史，npm 只包含运行所需文件。

SDK 构建保留 JavaScript 和 GLSL 的压缩，移除混淆步骤，不生成 sourcemap 或 declaration map。TypeScript 从 `src/index.ts` 生成带注释的 `dist/index.d.ts`，Oxc AST 检查公开接口及参数说明。

npm 包根只放英文 `README.md`，中文入口链接到 GitHub，避免 npm 选择错误的默认语言。详细指南、架构、发布流程、Demo 和效果截图保留在仓库；README 通过公开 URL 展示截图。运行资源只收集清单中的九个文件。

仓库根的 `private: true` 防止误发整个工程；`build:sdk` 生成独立的可发布目录，不影响最终 npm 包的公开访问。

## 升级依赖时注意什么

支持下限仍为 Cesium `>=1.142.0`、three `>=0.160.1`。Cesium 1.142.0 + engine 26.0.0 / widgets 16.0.0 是可用锁定基线；1.146.0 + engine 26.4.0 / widgets 16.3.0 是已验证的干净安装组合。

已知 Cesium 1.142.0 配合 engine 26.4.0 / widgets 16.3.0 会遇到上游缺失导出，最小 Cesium 导入也可能失败。保留完整锁文件，不用 overrides 或测试替身掩盖不兼容结果。新项目示例采用已验证的 1.146.0，不表示它是当前最新版本。
