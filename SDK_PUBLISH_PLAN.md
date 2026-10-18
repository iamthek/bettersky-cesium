# BetterSky4Cesium SDK：兼容 npm 与 pnpm

> 状态：待实施。2026-10-18 本轮仅更新发布方案和接入文档；不修改代码、依赖、构建配置和许可，不运行构建、打包或发布。下文的 SDK 发布命令、包目录和类型声明均为目标设计，尚未验收；资源定位沿用现有 `CESIUM_BASE_URL`。

## 目标与默认范围

发布一份经过编译、压缩和混淆的标准 ESM 包到 npm registry，同时支持 npm、pnpm 安装。pnpm 使用同一个 registry，不需要再向一个独立的“pnpm 平台”发布。包名暂定 `better-sky4cesium`，首版 `0.1.0`，正式发布前确认名称可用性。

首版支持 Cesium `1.142.0`、同页单 Viewer；资源随包分发，由接入项目配置复制。

SDK 定位为 CesiumJS 的效果插件，直接复用宿主的 `CESIUM_BASE_URL`，不新增资源基址参数。接入项目只需将包内效果资源复制到 Cesium 静态资源根目录下的 `EffectPipelineAssets/`。

首版面向使用构建工具的浏览器项目，不增加 HTML 直接引入脚本的版本或专用 Vite 自动部署插件。

发布并验收后，接入项目可以任选一种方式安装（当前不代表该版本已可用）：

```bash
npm install --save-exact better-sky4cesium@0.1.0 cesium@1.142.0
```

```bash
pnpm add -E better-sky4cesium@0.1.0 cesium@1.142.0
```

`three` 作为 SDK 的运行依赖自动安装。接入项目不必使用与 SDK 仓库相同的包管理器。

交付要求：不分发原始实现、未混淆副本、sourcemap 或无关项目文件；必要静态资源与 SDK 放在同一个版本的 npm 包中上传；npm 包页面直接展示包含 npm/pnpm 安装和资源复制步骤的 Quick Start。

## 许可与收费策略

- 本项目采用 [BetterSky4Cesium Proprietary Trial License](LICENSE)，属于专有软件试用许可（Proprietary/EULA），不宣称采用 OSI 开源许可。SDK 和使用它的业务项目均不要求开源。
- 目前所有个人和组织均可零费用试用，包含学习、研究、开发评估、商业项目和生产上线，无须逐一申请或事先取得商业授权。允许在试用期内将 SDK 运行产物和必要资源作为应用组成部分交付，同时附带试用许可和第三方声明，并告知接收者试用与未来授权条件；不允许单独转售或发布 SDK 包/源码。
- 当前没有固定试用结束日期，也没有承诺具体的收费时间或价格。未来若结束指定版本或用途的免费试用，须通过项目或 npm 包的官方文档/发布渠道公布有日期的通知，写明影响范围、结束日期和授权渠道，至少保留 30 个日历日过渡期；已提供许可通知联系方式的用户还应收到相应通知。
- 过渡期内按原条件免费；结束后，继续受影响的使用或分发须另获授权，否则停止相应用途。公告不自动产生付款义务，此前合法试用不追溯收费；仅公布价格而未履行上述通知流程不结束试用。
- 可对未来新授权、续期、新版本、更新或支持收费，也可单独授予零费用授权。书面授权应明确主体、版本、项目/应用范围、部署与交付权限、期限和费用；已有单独授权按原约定执行，不因试用转收费而被追溯改价。历史 MIT 副本的既有权利和第三方许可不因本次变更而撤回。
- 当前不增加激活、联网校验、远程禁用或收费代码。首版由书面授权管理使用范围，付款与授权流程在 npm 之外处理。

## 包结构与依赖

- 使用现有 Vite 6 库模式构建 SDK 至 `dist/`，demo 独立输出至 `dist-demo/`。当前 `pnpm build` 仍构建 demo 到 `dist/`；实施时先隔离两个输出并清理旧产物，防止 demo 混入 SDK。
- 计划提供 `build:sdk`、`build:demo` 和组装发布目录的命令；开发和预览命令继续服务 demo。SDK 构建禁用默认 `public/` 整目录复制，只收集入口的依赖闭包与已核实的静态资源。
- 仓库根 `package.json` 保持 `private: true`。未来生成独立的 `.sdk-package/` 发布目录，只在该目录生成可发布的精简 `package.json`，补齐版本号、`type: module`、`exports`、`types`、文件白名单和公开可用的联系方式。禁止在仓库根执行发布。`private` 字段不等于 npm 私有包的访问权限。
- `package.json` 使用 `"license": "SEE LICENSE IN LICENSE"`，包内仅附上自有 `LICENSE` 和合并后的 `THIRD_PARTY_NOTICES.md`；后者列出确认复用的代码、权利人、使用条件及必要许可全文，不维护单独的 `licenses/` 副本目录。源码仓库保持私有，npm 仅分发运行产物；当前免费使用范围和未来转收费条件以许可正文为准。
- 保留仓库内部 JavaScript 实现，包内只提供编译混淆后的实现及公开 API 的 `.d.ts`；类型声明不暴露内部实现和私有路径，也不生成 declaration map。
- Cesium 声明为 `peerDependencies`，固定 `1.142.0`，与宿主共享；SDK 仓库开发时使用同一版本。
- three 作为普通运行依赖固定为 `0.160.1`。Cesium 和 three 均设置为构建外部依赖，不打入 SDK 产物。
- 仓库继续使用 pnpm 和现有锁文件；所有运行依赖明确声明，不依赖依赖提升或 `.pnpm` 内部目录结构。
- 采用显式“构建 → 混淆 → 组装 → 校验 → 打包”流程；发布目录不携带仓库的构建脚本、开发依赖或 `prepack` / `prepare` / `postinstall` 生命周期。使用方安装时无需构建 SDK 或运行自动复制脚本；打包与发布不重新生成已经验收的文件。

### 发布包白名单

目标 `.tgz` 解压后的包根目录如下；`dist/assets/` 直接对应效果资源根，不再额外嵌套一层 `EffectPipelineAssets/`：

```text
package/
  package.json
  README.md                 # 仓库英文 README，npm 页面默认展示
  README.zh-CN.md            # 仓库中文 README
  LICENSE
  THIRD_PARTY_NOTICES.md
  dist/
    index.js                # 编译、压缩、混淆后的 ESM
    index.d.ts              # 公开 API 类型
    assets/
      snowCoverMask.png
      ...已核实的运行时资源
      GeospatialAssets/
        *.exr
        *.bin
        *.png
```

- `files` 明确列出 `dist/index.js`、`dist/index.d.ts`、`dist/assets/`、两份 README、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`，不使用仓库根 `*` 或宽泛的 `dist/**` 代替产物清单。`package.json` 等 npm 默认收录文件也必须审查，不能只依赖白名单字段。
- `exports["."]` 的 `types` 指向 `./dist/index.d.ts`、`import` 指向 `./dist/index.js`；顶层 `types` 保持一致。仅提供 ESM；保留 `EffectPipeline` 具名与默认导出，不公开内部模块入口。资源复制示例直接使用文件系统路径，不依赖未导出的 `package.json` 子路径。
- 资源目录另设逐文件清单，包含路径、用途、来源/许可与内容哈希；根据运行依赖审查 `static/EffectPipelineAssets/`，保留所支持效果需要的文件与目录层级。当前目录有 17 个文件，但数量不是永久白名单，未确认用途或分发权的文件不得进入发布目录。
- 明确排除 `EffectPipeline.js`、`Library/`、原始 `.glsl` / `.vert` / `.frag` 文件、未混淆 JS、内部类型、所有 `.map` / `.d.ts.map`、源码归档、demo/HTML/截图、`static/` 原目录、`public/`、`.env*`（含示例）、token、配置/锁文件、构建脚本、测试、`.git/`、`.codegraph/`、编辑器/代理数据、`SDK_PUBLISH_PLAN.md`、`EffectPipeline.README.md` 及 `EffectPipeline.README.zh-CN.md`。两份 EffectPipeline 文档是仓库内部的原理与 API 参考，不随包分发。
- 从空的 `.sdk-package/` 组装，完成后校验实际压缩包的每一个条目；出现白名单之外的文件就中止。Cesium/three 本体通过依赖安装，不把仓库 `node_modules/` 或 Cesium 的整套构建文件复制进 SDK 包。
- 不要把仓库中的原理说明文档发布出去，不要发布与使用该sdk插件不相关的文件

## 编译、混淆与源码保护

1. 以 `EffectPipeline.js` 为入口，打包全部运行依赖闭包；Cesium、three 及各自子路径保持 external。关闭 `preserveModules`，首版收敛为 `dist/index.js`，不按源码目录逐文件输出。
2. 将 `?raw` 引用的 GLSL 在构建时内联入 JS。按着色器语法压缩普通注释和空白，保留必要换行、预处理指令、uniform/attribute 名与第三方通知，不对 GLSL 直接套用 JavaScript 混淆器。接入项目无需再配置 SDK 的 `?raw` loader。
3. 在 bundle 生成后使用 `javascript-obfuscator` 的本地构建步骤混淆内部标识符与选定字符串；实施时固定并记录经验证的版本、配置与非零 seed。不把源码上传到在线混淆服务。
4. 首版采用保守配置：`sourceMap: false`、`renameGlobals: false`、`renameProperties: false`；关闭控制流平坦化、死代码注入、调试阻断和 `selfDefending`。保留导出、公开方法/配置字段、Cesium/three 属性、资源路径及 GLSL 接口，不引入 `eval` 或 `new Function`。避免影响宿主的再次打包与每帧渲染性能，具体强度以实测为准。
5. Vite、混淆器和声明生成环节全程禁用 sourcemap / declaration map；不生成 hidden map 或内部留存副本。检查构建目录、发布目录和实际 `.tgz`，拒绝 `.map`、内联 map、`sourceMappingURL` / `sourceURL` 调试注释、映射数据中的 `sourcesContent` 和本地绝对源码路径。仅在打包前删 `.map` 不算满足要求。
6. 混淆结果保留必要版权/许可通知，并附上合并声明；只发布最终混淆文件，未混淆中间文件不得留在交付目录。通过公开 API、GLSL 编译、宿主二次压缩和实际浏览器运行验证后才允许打包发布。

“不要泄露源代码”的可验收含义是：不分发原始实现文件、原始着色器文件、未混淆 bundle、源码映射、内部调试资料或凭据。浏览器仍会获得并执行 JavaScript 与 GLSL，静态纹理也可下载；混淆提高阅读和逆向成本，不能保证算法或运行时代码不可还原。若要求客户端完全不可见，当前浏览器 SDK 架构无法满足。

## API、资源与运行边界

- 保留 `EffectPipeline` 具名及默认导出、现有配置和方法。
- 直接保留现有 `buildModuleUrl('EffectPipelineAssets/...')` 资源定位，统一依赖宿主配置的 `CESIUM_BASE_URL`；效果资源放在该根目录下的 `EffectPipelineAssets/`，不新增资源基址参数或另一套路径解析逻辑。
- 将核实后的运行所需资源从 `static/EffectPipelineAssets/` 放入 `dist/assets/`，保持资源根内的相对目录结构。JS 与资源随同一个 `.tgz`、同一个版本上传 npm；不另设未经确认的 CDN 上传步骤，不在安装时下载外部默认纹理。
- README 提供从 `node_modules/better-sky4cesium/dist/assets/` 复制全部内容到 `public/cesium/EffectPipelineAssets/` 的路径表和 Node.js 命令。这里以宿主 `CESIUM_BASE_URL='/cesium/'` 为例；已有其他 Cesium 资源根目录时，将 `EffectPipelineAssets/` 放到那个根目录下即可。不得硬编码 `.pnpm` 存储路径或依赖提升。
- Cesium 官方资源与插件效果资源共用宿主的 `CESIUM_BASE_URL`；SDK 不覆盖该配置，构建 SDK 时也不能把 demo 的 `/cesium/` 固化进库产物。
- 限制同页一个活动实例，第二实例在改变场景前报错，销毁后允许重建。
- 修复影响单实例生命周期的异步加载后销毁、SMAA 重复加载及实例拥有的阴影和纹理资源释放问题。
- 明确并检查必要的浏览器能力，包括 WebGL 2、所需浮点纹理能力、`Float16Array` 和 `structuredClone`。
- 保留当前场景设置行为，说明时钟、HDR 等影响及销毁恢复范围。
- 保留源码内的原始通知，发布包附上 [第三方代码及许可](THIRD_PARTY_NOTICES.md) 中合并的必要声明。该清单只列已确认的复用关系，不列推测来源。MIT/BSD/Apache 代码按原条款用于闭源商业产品，不要求公开整个 SDK 或业务项目源码；本项目的收费条款不改变这些第三方材料的原有许可。
- Cesium/three 作为外部依赖时由依赖包携带各自的完整许可，不在本 SDK 重复附上整份依赖 SDK 的许可合集；本地直接复用的 Cesium 后处理代码和 three.js loader/CSM 代码仍在合并声明中保留其适用通知。若另行复制依赖的构建产物或资源，则随该次分发保留对应通知。
- 中英文 README 合并项目简介、亮点、安装使用和许可，英文默认，并列提供 npm、pnpm 安装命令；原理、详细 API 和源码开发流程放在不发布的 `EffectPipeline.README.md` 及中文版。

包发布并验收后，直接使用现有初始化方式：

```js
import { EffectPipeline } from 'better-sky4cesium'

const effects = new EffectPipeline(viewer, {
  time: undefined, // 保留业务场景的时间
})

effects.update({ coverage: 0.5 })

// 页面卸载时，先释放效果，再销毁 Viewer。
effects.dispose()
```

### 资源复制契约

| 安装后的来源 | 使用项目中的目标 | 浏览器访问前缀 |
| --- | --- | --- |
| `node_modules/better-sky4cesium/dist/assets/` 的全部内容 | `public/cesium/EffectPipelineAssets/` | `/cesium/EffectPipelineAssets/` |
| `node_modules/cesium/Build/Cesium/Workers/` | `public/cesium/Workers/` | `/cesium/Workers/` |
| Cesium 同级的 `Assets/`、`ThirdParty/`、`Widgets/` | `public/cesium/` 下对应同名目录 | `/cesium/` |

宿主配置 `CESIUM_BASE_URL='/cesium/'` 后，示例请求为 `/cesium/EffectPipelineAssets/snowCoverMask.png` 和 `/cesium/EffectPipelineAssets/GeospatialAssets/local_weather.png`。插件无需额外 URL 配置。不要把磁盘路径 `node_modules/...` 当作浏览器 URL。

部署到 `/app/` 时，宿主将 `CESIUM_BASE_URL` 配成 `/app/cesium/`，插件资源自动位于 `/app/cesium/EffectPipelineAssets/`；接入项目的构建 `base` 和实际服务目录同步设置。完整命令和配置见 [README 使用说明](README.md#usage) / [中文使用说明](README.zh-CN.md#使用)。升级 SDK 后同步替换 `EffectPipelineAssets/` 内资源并刷新缓存，不能混用不同版本的 JS 与纹理。

## README 与文档交付

- 将原有 START 内容合并进 [README.md](README.md) 和 [README.zh-CN.md](README.zh-CN.md)，移除两份 START，不再维护单独的快速开始文档。README 只保留项目简介、项目亮点、如何使用与许可；使用部分包含兼容要求、npm/pnpm 安装、资源复制、`CESIUM_BASE_URL` 配置、最小接入与销毁示例。
- 后续组装发布目录时，直接复制仓库的两份 README 到包根，不再通过 START 生成 README。完成实施和验收后再更新待实施标记；发布包不得保留错误的“已验证”或过期草案状态。
- npm 页面直接展示发布包根 `README.md`，其中完整提供 npm 和 pnpm 两种接入用法；中文版本随包交付，安装后可在 `node_modules/better-sky4cesium/README.zh-CN.md` 查看。
- 检查 npm 页面上的语言切换、许可和支持链接；公开页面不得指向私有仓库或不存在的源码文件。若 npm 不能正确解析包内相对链接，发布前改成已验证可访问的公开文档地址，并保持本地包内文档可读；不能为此开放源码仓库。
- 渲染原理、实现细节、源码导览、完整 API 和仓库开发流程保留在 `EffectPipeline.README.md` / 中文版，明确不进入发布白名单。发布 README 不链接这些内部文档、源码、demo 或发布计划，避免无效私有链接和多余文件进入包。

## 验收与发布

以下步骤仅在后续获准实施构建和发布时执行，本轮不执行。

1. 按实际分发内容核对第三方许可条件及自有代码授权范围，确认合并声明完整；资源清单逐文件核实用途和分发权。
2. 编译混淆并组装 `.sdk-package/`，按上述白名单检查文件、文本内容及资源哈希；无 sourcemap、原始实现、未混淆副本、环境变量、demo 或开发数据，必要通知齐全。
3. 在 `.sdk-package/` 中用 `npm pack --dry-run --json` 预审，再用 `npm pack` 或 `pnpm pack` 生成实际 `.tgz`。解压逐项复核文件、包元数据、README、资源字节和映射痕迹，记录 SHA-256；dry-run 不能代替实际包验收。
4. 同一份 `.tgz` 分别安装到独立 npm 项目和默认依赖布局的 pnpm 项目，以 Vite、TypeScript、Cesium `1.142.0` 验证导出、类型、外部依赖解析与文档命令。不得用源码别名或工作区链接代替安装验证。
5. 使用 `@browser` 验证混淆包的渲染、参数更新、开关和所有必要纹理；检查根路径、`/app/` 子路径和自定义 Cesium 资源根目录均只需配置宿主的 `CESIUM_BASE_URL`，以及宿主生产构建后二次压缩的运行情况。确认 JS/GLSL 无编译错误、资源非 404/HTML 回退，控制台无新增错误，并对照混淆前后的加载耗时、包大小和同场景帧耗时。
6. 验证资源加载期间销毁、重复销毁、销毁后重建和第二实例限制；以计划中的生命周期修复实际完成为准，不因文档写入即视为通过。
7. 核实中英文 Quick Start 与真实产物一致，源码链接不进入包 README；许可条件沿用现有正文。确认包名、版本、账号权限和认证可用，最终签出待发布 `.tgz` 的哈希。任一步失败均不得发布。
8. 由拥有发布权限的账号，选择下面一种命令上传已验收的同一份 `.tgz`，只发布一次。示例在压缩包所在目录执行，不能改成仓库根无参数 publish：

```bash
pnpm publish ./better-sky4cesium-0.1.0.tgz --access public --registry=https://registry.npmjs.org
```

或使用 npm（二选一，不依次执行）：

```bash
npm publish ./better-sky4cesium-0.1.0.tgz --access public --registry=https://registry.npmjs.org
```

9. 发布后分别通过 npm 和 pnpm 从官方仓库安装准确版本，重做资源复制与接入冒烟验证；检查 npm 页面确实展示 Quick Start，发布内容与已验收文件一致。文档修订涉及包 README 时随新版本发布，不承诺直接修改本地 README 就会更新 npm 页面。

## 官方参考

- [Vite 6 库模式](https://v6.vite.dev/guide/build#library-mode)
- [npm package.json 配置](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [npm 包页面与 README](https://docs.npmjs.com/about-package-readme-files/)
- [javascript-obfuscator 配置](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [vite-plugin-static-copy](https://github.com/sapphi-red/vite-plugin-static-copy)
- [npm 公共包发布指南](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)
- [npm 内容的许可权归属](https://docs.npmjs.com/policies/open-source-terms/#your-content)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [pnpm add](https://pnpm.io/cli/add)
- [pnpm pack](https://pnpm.io/cli/pack)
- [pnpm publish](https://pnpm.io/cli/publish)
