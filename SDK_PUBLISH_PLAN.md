# BetterSky for Cesium SDK：兼容 npm 与 pnpm

> 本地 SDK 架构整理（2026-10-20，尚未发布）：公开入口与类型统一为 `src/index.ts`，TypeScript CLI 生成带注释声明；配置入口、资源状态、场景记录和 Cesium 适配已分离。旧 GUI 已删除，demo 集中到 `demo/`，独立输出 `dist-demo/` 并提供 Pages 工作流。开发工具更新到 Vite 8.3.4 / Rolldown / Oxc，现有 SDK 默认值与运行依赖锁定基线保持不变。详见 [架构与开发边界](SDK_ARCHITECTURE.md)。最低 Cesium 的无锁浮动组件组合存在已复现的上游缺失导出，不能将历史验收结果直接作为本轮新包的发布依据。

> 执行状态（2026-10-19）：用户已完成 npm 认证与正式发布，官方 registry 的 `bettersky-cesium@0.1.0` 及 `latest` 已可用，线上包 SHA-256 与验收包完全一致。npm 异步处理期间，旧脚本约 18 秒的确认窗口曾误报失败；现已修正为有界等待、处理中回执与防重复上传，并通过 9 项离线回归测试。SDK 包内容未改变、未重复上传。发布后的官方 npm/pnpm 安装、类型、构建及两个浏览器冒烟场景全部通过，18 项资源响应正常，测试服务与独立临时目录均已清理；npm 网页已由用户手动确认正常。

- 本轮已发布包：`D:/CodexDocuments/SDK-Releases/bettersky-cesium/0.1.0/release/bettersky-cesium-0.1.0.tgz`。此前其他目录中的候选包与验收记录均已过期，禁止继续上传或尝试覆盖 `0.1.0`。
- SHA-256：`6ff94e4fca47e81c7151955a8462ba0b00c879567f8062c3138c069933dd9038`。同目录保留逐文件清单、哈希文件、`bettersky-cesium-0.1.0-acceptance.json`、`browser-review.json`、历史发布预检记录及 `bettersky-cesium-0.1.0-publication.json` 正式发布确认回执。
- 已通过：34 项自动测试；npm/pnpm × Cesium 1.142.0/1.146.0 × three 0.160.1/0.186.1 共 8 组安装、严格类型与生产构建；11 个浏览器场景及 99 项资源响应。所有组合均自然解析 engine 26.4.0/widgets 16.3.0，没有其 overrides；4 组默认接入项目完全没有 overrides，另外 4 组仅在验收中覆盖 three 下限。9 个资源的复制位置、内容及哈希全部匹配。
- 三轮交替性能复核：当前源码基线平均约 2.06 ms/帧，混淆包约 2.14 ms/帧；这是本机测试场景结果，不宣称性能提升或与旧 HEAD 像素完全一致。雪法线着色器修复会影响启用积雪时的法线/覆盖判断；默认积雪关闭，云与大气算法及默认参数没有因此调整。
- 发布前完整验收及发布后冒烟测试的服务与独立临时目录均已清理。下载曾遇到 npm TLS/连接错误，失败记录已单独归档；最终完整轮次采用进程级 Node 24.19.0/npm 11.19.0/pnpm 12.8.1、官方 registry 直连及 npm 单连接下载，无安装失败，TLS 与包完整性检查保持开启，全局设置未修改。发布后的 `bettersky-cesium-0.1.0-registry-smoke.json` 和 `post-publication-review.json` 已归档，状态均为通过，不覆盖发布前的验收证据。
- 发布收尾已删除项目内的 `.sdk-package/` 组装中间目录，保留 `dist/` 最终 SDK 产物、固定脚本与回归测试源文件；正式压缩包及必要报告仅保存在上述仓库外交付目录。下一版本通过 `build:sdk` 重新生成组装目录。
- npm 页面经用户手动验证正常；registry 当前选择的默认 README 为中文版 `README.zh-CN.md`，两份文档均随包提供公共语言切换链接。这与最初英文默认展示目标存在文档元数据差异，已单独记录，不能通过覆盖已发布的 `0.1.0` 修正。
- 后续版本的本地构建已补充公开声明的中文 JSDoc：各配置字段说明含义、单位、范围、默认值和必要的联动规则，构造器、方法及 setter 逐个说明参数。构建和包校验检查注释完整性，并将声明原字节复制到最终产物；此项属于下一版本变更，不改变上述已发布 `0.1.0` 的包和验收记录。
- 公开声明同时补齐已有的色调映射模式 `2` / `4`、构造期 `hbao.denoise` 和 Pass 的 `showSnow` / `showRain` setter。仅扩充类型与说明：SDK 默认色调模式仍为 `9`，HBAO 降噪仍为 `true`，雨雪仍为 `false`；不增加顶层雨雪配置、不改变运行实现。历史模式 `3` 虽有 GLSL 分支，但当前未绑定所需的亮度纹理，不列为已支持选项，文档已纠正。

## 目标与默认范围

发布一份经过编译、压缩和混淆的标准 ESM 包到 npm registry，同时支持 npm、pnpm 安装。pnpm 使用同一个 registry，不需要再向一个独立的“pnpm 平台”发布。包名使用 `bettersky-cesium`，首版目标版本 `0.1.0`，正式发布前确认 npm 名称可用性。

首版支持 Cesium `>=1.142.0`、three `>=0.160.1` 及同页单 Viewer；场景须具有 `globe`、处于 `SceneMode.SCENE3D` 并使用 `PerspectiveFrustum`。版本下限不是精确版本限制。资源随包分发，由接入项目配置复制。后续版本纳入支持范围，但每次升级仍须验证渲染器内部接口；不能宣称已验证所有未来版本。

SDK 定位为 CesiumJS 的效果插件，直接复用宿主的 `CESIUM_BASE_URL`，不新增资源基址参数。接入项目只需将包内效果资源复制到 Cesium 静态资源根目录下的 `BetterSkyAssets/`。

首版面向使用构建工具的浏览器项目，不增加 HTML 直接引入脚本的版本或专用 Vite 自动部署插件。

发布并验收后，接入项目可以任选一种方式安装（当前不代表该版本已可用）：

```bash
npm install bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

```bash
pnpm add bettersky-cesium@0.1.0 "cesium@>=1.142.0"
```

`three`（`>=0.160.1`）作为 SDK 的运行依赖自动安装。接入项目不必使用与 SDK 仓库相同的包管理器，可以在支持范围内锁定已经验证的依赖版本。

交付要求：不分发原始实现、未混淆副本、sourcemap 或无关项目文件；必要静态资源与 SDK 放在同一个版本的 npm 包中上传；npm 包页面直接展示包含 npm/pnpm 安装和资源复制步骤的 Quick Start。

## 许可与收费策略

- 本项目采用 [BetterSky for Cesium Proprietary Trial License](LICENSE)，属于专有软件试用许可（Proprietary/EULA），不宣称采用 OSI 开源许可。SDK 和使用它的业务项目均不要求开源。
- 目前所有个人和组织均可零费用试用，包含学习、研究、开发评估、商业项目和生产上线，无须逐一申请或事先取得商业授权。允许在试用期内将 SDK 运行产物和必要资源作为应用组成部分交付，同时附带试用许可和第三方声明，并告知接收者试用与未来授权条件；不允许单独转售或发布 SDK 包/源码。
- 当前没有固定试用结束日期，也没有承诺具体的收费时间或价格。未来若结束指定版本或用途的免费试用，须通过项目或 npm 包的官方文档/发布渠道公布有日期的通知，写明影响范围、结束日期和授权渠道，至少保留 30 个日历日过渡期；已提供许可通知联系方式的用户还应收到相应通知。
- 过渡期内按原条件免费；结束后，继续受影响的使用或分发须另获授权，否则停止相应用途。公告不自动产生付款义务，此前合法试用不追溯收费；仅公布价格而未履行上述通知流程不结束试用。
- 可对未来新授权、续期、新版本、更新或支持收费，也可单独授予零费用授权。书面授权应明确主体、版本、项目/应用范围、部署与交付权限、期限和费用；已有单独授权按原约定执行，不因试用转收费而被追溯改价。历史 MIT 副本的既有权利和第三方许可不因本次变更而撤回。
- 当前不增加激活、联网校验、远程禁用或收费代码。首版由书面授权管理使用范围，付款与授权流程在 npm 之外处理。

## 包结构与依赖

- 使用 Vite 8.3.4 / Rolldown 库模式，通过 `build:sdk` 构建 SDK 至 `dist/`；`build` / `build:demo` 将 demo 输出至 `dist-demo/`，两个输出已隔离。
- 编译、组装、打包、验收与发布均固化为仓库脚本，通过根 `package.json` 的固定命令调用，具体职责见下表；开发、demo 构建和预览使用独立入口。SDK 构建禁用默认 `public/` 整目录复制，只收集入口的依赖闭包与已核实的静态资源。
- 仓库根 `package.json` 保持 `private: true`。`build:sdk` 生成独立的 `.sdk-package/` 发布目录，只在该目录生成可发布的精简 `package.json`，包含版本号、`type: module`、`exports`、`types`、文件白名单和公开可用的联系方式。禁止直接发布仓库根目录；在根目录调用固定发布脚本时，也只能上传明确指定的已验收 `.tgz`。`private` 字段不等于 npm 私有包的访问权限。
- `package.json` 使用 `"license": "SEE LICENSE IN LICENSE"`，包内仅附上自有 `LICENSE` 和合并后的 `THIRD_PARTY_NOTICES.md`；后者列出确认复用的代码、权利人、使用条件及必要许可全文，不维护单独的 `licenses/` 副本目录。许可文本留在包根，不放入 `dist/assets/`。源码仓库保持私有，npm 仅分发运行产物；当前免费使用范围和未来转收费条件以许可正文为准。
- 保留仓库内部 JavaScript 实现，包内只提供编译混淆后的实现及公开 API 的 `.d.ts`；类型声明保留公开使用说明的 JSDoc，不暴露内部实现和私有路径，也不生成 declaration map。JS/GLSL 的压缩与混淆不处理声明注释。
- Cesium 声明为 `peerDependencies`，范围为 `>=1.142.0`，与宿主共享；仓库锁文件保留 1.142.0 作为可复现开发基线，不将开发基线误写为唯一支持版本。
- three 作为普通运行依赖，范围为 `>=0.160.1`；仓库锁文件保留 0.160.1 作为可复现开发基线。Cesium 和 three 均设置为构建外部依赖，不打入 SDK 产物。
- 仓库继续使用 pnpm 和现有锁文件；所有运行依赖明确声明，不依赖依赖提升或 `.pnpm` 内部目录结构。
- 采用显式“构建 → 混淆 → 组装 → 校验 → 打包”流程；发布目录不携带仓库的构建脚本、开发依赖或 `prepack` / `prepare` / `postinstall` 生命周期。使用方安装时无需构建 SDK 或运行自动复制脚本；打包与发布不重新生成已经验收的文件。

### 固定脚本与版本迭代

以下为当前脚本契约，脚本使用 Node.js ESM，保存在 `scripts/sdk/`，兼容 Windows，避免依赖平台专用的 shell 复制、删除和环境变量语法。脚本及其配置仅用于仓库开发，不进入 npm 发布包。

| 固定命令 | 脚本入口与职责 |
| --- | --- |
| `build:sdk` | `scripts/sdk/build.mjs`：先检查公开类型及参数 JSDoc，再完成 SDK 编译、GLSL 处理、压缩混淆、TypeScript 公开声明生成与 JSDoc 校验、资源与许可收集、`.sdk-package/` 组装及目录校验；任一步失败即以非零状态退出。 |
| `pack:sdk` | `scripts/sdk/pack.mjs`：校验已经组装的发布目录，执行 dry-run 和实际打包，检查真实 `.tgz` 条目及内容，并输出包路径、版本和 SHA-256；支持 `--output-dir` 指定正式交付目录，不重新构建。 |
| `verify:sdk` | `scripts/sdk/verify.mjs`：通过 `--tarball` 接收准确的压缩包，在仓库外的隔离目录执行安装、类型、宿主构建及可自动化的运行验收，记录依赖解析与性能结果；支持 `--work-dir` 和 `--report-dir`，默认使用独立临时目录，并按清理规则收尾。需要人工浏览器检查的项目保留待确认状态，补齐实际证据后才能标记验收通过。 |
| `publish:sdk` | `scripts/sdk/publish.mjs`：通过 `--tarball` 和 `--report` 指定已验收包及报告，校验包名、版本、文件哈希与通过状态，核对 registry 中版本是否已存在、账号权限及认证，然后向固定的官方 registry 上传该包一次；支持 `--dry-run` 包级预检和 `--verify-only` 只读补核查。npm 已接收但尚不可见时保存 `processing` 回执，后续调用只核查、不再上传；真实失败仍以非零状态退出。发布阶段不构建、不打包、不自动升级版本。 |
| `build:demo` | 使用现有 Vite 配置的 demo 构建入口，输出至 `dist-demo/`，与 SDK 产物隔离；demo 的开发和预览命令也指向对应入口和目录。 |

- SDK 版本号统一维护在仓库根 `package.json` 的 `version` 字段。构建脚本读取该版本，生成发布目录元数据；压缩包名称、验收报告和发布校验使用同一版本，不在各脚本中硬编码 `0.1.0`。每次迭代先更新版本、变更说明及 README 安装示例，再执行固定流程，禁止覆盖已发布的版本。
- `verify:sdk` 的报告绑定被测 `.tgz` 的完整哈希，明确列出自动检查、人工检查、实际依赖版本与结果；任何必需项未完成或失败都不能用于发布。`publish:sdk` 上传前重新计算哈希，报告与包不一致即退出；重新构建或重新打包后必须重新验收。
- 发布脚本内部统一使用一种已验证的发布客户端，固定 `https://registry.npmjs.org` 和 `--access public`，不依次调用 npm 与 pnpm 重复上传。认证使用现有登录状态或运行环境提供的凭据，不写进脚本、报告或发布包；上传发生超时或返回不明确时先查询 registry 状态，再决定后续操作。
- `--dry-run` 只验证包级发布流程，不证明真实写入权限或 2FA 已满足。npm 返回成功但提示正在处理时，不因短时间内查询不到版本就重复上传；使用同一组 `--tarball`、`--report` 参数加 `--verify-only` 补核查。只有 registry 中的包字节与验收哈希一致，才写入 `published` 确认回执；未确认的失败回执须先核查，独立确认服务器拒绝上传后才能人工移除回执重试。
- 构建和打包仅清理各自拥有的输出目录；验收脚本按下文隔离与清理要求处理测试资源。正式交付目录中的 `.tgz`、哈希及必要报告保留供发布与追溯使用，测试结束时不删除。

后续版本统一按以下顺序执行，参数中的目录和包名替换为本次实际值；正式发布命令由用户在交互终端完成 npm 一次性验证。本轮 `0.1.0` 已发布，不再重复执行上传命令：

```bash
pnpm run build:sdk
pnpm run pack:sdk --output-dir "<正式交付目录>"
pnpm run verify:sdk --tarball "<正式交付目录>/<包名>-<版本>.tgz" --report-dir "<正式交付目录>" --serve
# 浏览器检查完成并归档证据后，在验收终端输入 finish，等待服务停止和临时目录清理。
node scripts/sdk/verify.mjs --finalize --report "<验收报告路径>" --evidence "<浏览器核查记录路径>"
pnpm run publish:sdk --tarball "<正式交付目录>/<包名>-<版本>.tgz" --report "<验收报告路径>" --dry-run
pnpm run publish:sdk --tarball "<正式交付目录>/<包名>-<版本>.tgz" --report "<验收报告路径>"
```

### 发布包白名单

目标 `.tgz` 解压后的包根目录如下；`dist/assets/` 直接对应效果资源根，不再额外嵌套一层 `BetterSkyAssets/`：

```text
package/
  package.json
  README.md                 # 仓库英文 README，npm 页面默认展示
  README.zh-CN.md            # 仓库中文 README
  LICENSE
  THIRD_PARTY_NOTICES.md
  dist/
    index.js                # 编译、压缩、混淆后的 ESM
    index.d.ts              # 公开 API 类型，保留字段及参数 JSDoc
    assets/
      ...已核实的运行时资源
      GeospatialAssets/
        *.exr
        *.bin
        *.png
```

- `files` 明确列出 `dist/index.js`、`dist/index.d.ts`、`dist/assets/`、两份 README、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`，不使用仓库根 `*` 或宽泛的 `dist/**` 代替产物清单。`dist/assets/` 只放运行时资源，不含许可文本。`package.json` 等 npm 默认收录文件也必须审查，不能只依赖白名单字段。
- `exports["."]` 的 `types` 指向 `./dist/index.d.ts`、`import` 指向 `./dist/index.js`；顶层 `types` 保持一致。仅提供 ESM；保留 `BetterSky` 具名与默认导出，不公开内部模块入口。资源复制示例直接使用文件系统路径，不依赖未导出的 `package.json` 子路径。
- 资源目录另设逐文件清单，包含路径、用途、来源/许可与内容哈希；根据运行依赖审查 `static/BetterSkyAssets/`，保留所支持效果需要的文件与目录层级。当前目录有 17 个文件，但数量不是永久白名单，未确认用途或分发权的文件不得进入发布目录。
- 明确排除 `BetterSky.js`、`src/`、`demo/`、`Library/`、原始 `.glsl` / `.vert` / `.frag` 文件、未混淆 JS、内部类型、所有 `.map` / `.d.ts.map`、源码归档、demo/HTML/截图、`static/` 原目录、`public/`、`.env*`（含示例）、token、配置/锁文件、构建脚本、测试、`.git/`、`.codegraph/`、编辑器/代理数据、`SDK_PUBLISH_PLAN.md`、`BetterSky.README.md` 及 `BetterSky.README.zh-CN.md`。两份 BetterSky 文档是仓库内部的原理与 API 参考，不随包分发。
- 从空的 `.sdk-package/` 组装，完成后校验实际压缩包的每一个条目；出现白名单之外的文件就中止。Cesium/three 本体通过依赖安装，不把仓库 `node_modules/` 或 Cesium 的整套构建文件复制进 SDK 包。
- 不要把仓库中的原理说明文档发布出去，不要发布与使用该sdk插件不相关的文件

### 公开声明与参数注释

- 唯一公开类型维护入口为 [`src/index.ts`](src/index.ts)，由 `scripts/sdk/declarations.mjs` 调用 TypeScript CLI 生成声明。使用标准 `/** ... */` JSDoc，使 JavaScript/TypeScript 使用方在支持 TypeScript 语言服务的编辑器中，悬停配置项或调用方法时能直接查看说明。
- 每个公开类型、接口、类及成员都必须有非空说明；配置项写清用途、已核实的单位、范围、默认值、数组分量顺序及 `null` / `undefined` 语义。有运行时硬校验的范围与建议取值要明确区分，不把建议范围表述为所有入口都会校验。
- 构造器、方法及 setter 的每个具名参数都必须有非空 `@param`，说明参数含义和必要限制；有特殊行为时注明深合并、数组整体替换、模式联动、管线重建、销毁顺序等使用约束。默认值随实现一起维护，不记录未经验证的单位或承诺。
- 构建先严格编译公开类型，保留 JSDoc，再将生成的同一份 UTF-8 字节写入 `dist/index.d.ts` 并组装到 `.sdk-package/dist/index.d.ts`；声明不经过 JS 混淆或去注释处理。Oxc TypeScript AST 检查注释，支持多行、嵌套和泛型类型。
- 目录与实际 `.tgz` 校验比较生成声明与 TypeScript 维护源的公开 AST 和全部 JSDoc，不在打包或发布时重新编译；构建产物复制及压缩包字节仍按哈希验收。删除字段 JSDoc 或任一参数说明即失败。使用 `node --test tests/sdk-package.test.mjs tests/sdk-declarations.test.mjs` 回归该门禁。重新生成的包必须重新验收；已发布版本的声明不会随本地文件修改而更新。

## 编译、混淆与源码保护

1. 以 `src/index.ts` 为公开入口（内部继续使用 `BetterSky.js`），打包全部运行依赖闭包；Cesium、three 及各自子路径保持 external。关闭 `preserveModules`，首版收敛为 `dist/index.js`，不按源码目录逐文件输出。
   Cesium 依赖只使用实际所需的显式具名导入，不物化、枚举或动态访问整个 Cesium 命名空间。构建前后的 AST 检查均拒绝 Cesium namespace/default 导入及整包再导出，控制 Cesium 依赖闭包；Vite 8 会验证全部再导出，不能依赖具名导入绕过上游缺失导出，组合兼容性按实际安装验证。
2. 将 `?raw` 引用的 GLSL 在构建时内联入 JS。压缩前先清点运行时 `replace` / `indexOf` 等着色器组装操作，保护 `/*__CLOUD_LAYER_DENSITY__*/`、体积光插入标记及所有精确匹配片段（包括空白）；例如 `FocusedCloudShadowPass.js` 依赖函数签名和完整语句定位、切片及替换，这些内容不能按普通注释或空白删除。首版仅压缩已确认不参与组装的部分，保留必要换行、预处理指令、uniform/attribute 名与第三方通知，不对 GLSL 直接套用 JavaScript 混淆器。针对组装操作校验预期匹配次数、切片边界及生成结果，匹配缺失、次数异常或应替换的标记残留均中止验收，不能仅凭 JS 构建成功判定通过。接入项目无需再配置 SDK 的 `?raw` loader。
3. 在 bundle 生成后使用 `javascript-obfuscator` 的本地构建步骤混淆内部标识符与选定字符串；实施时固定并记录经验证的版本、配置与非零 seed。不把源码上传到在线混淆服务。
4. 首版采用保守配置：`sourceMap: false`、`renameGlobals: false`、`renameProperties: false`；关闭控制流平坦化、死代码注入、调试阻断和 `selfDefending`。保留导出、公开方法/配置字段、Cesium/three 属性、资源路径及 GLSL 接口，不引入 `eval` 或 `new Function`。避免影响宿主的再次打包与每帧渲染性能，具体强度以实测为准。
5. Vite、混淆器和声明生成环节全程禁用 sourcemap / declaration map；不生成 hidden map 或内部留存副本。检查构建目录、发布目录和实际 `.tgz`，拒绝 `.map`、内联 map、`sourceMappingURL` / `sourceURL` 调试注释、映射数据中的 `sourcesContent` 和本地绝对源码路径。仅在打包前删 `.map` 不算满足要求。
6. 混淆结果保留必要版权/许可通知，并附上合并声明；只发布最终混淆文件，未混淆中间文件不得留在交付目录。通过公开 API、GLSL 编译、宿主二次压缩和实际浏览器运行验证后才允许打包发布。

“不要泄露源代码”的可验收含义是：不分发原始实现文件、原始着色器文件、未混淆 bundle、源码映射、内部调试资料或凭据。浏览器仍会获得并执行 JavaScript 与 GLSL，静态纹理也可下载；混淆提高阅读和逆向成本，不能保证算法或运行时代码不可还原。若要求客户端完全不可见，当前浏览器 SDK 架构无法满足。

## API、资源与运行边界

- 保留 `BetterSky` 具名及默认导出、现有配置和方法。
- 直接保留现有 `buildModuleUrl('BetterSkyAssets/...')` 资源定位，统一依赖宿主配置的 `CESIUM_BASE_URL`；效果资源放在该根目录下的 `BetterSkyAssets/`，不新增资源基址参数或另一套路径解析逻辑。
- 将核实后的运行所需资源从 `static/BetterSkyAssets/` 放入 `dist/assets/`，保持资源根内的相对目录结构。JS 与资源随同一个 `.tgz`、同一个版本上传 npm；不另设未经确认的 CDN 上传步骤，不在安装时下载外部默认纹理。
- README 提供经验证的 `vite-plugin-static-copy@4.1.1` 配置，使用 `dist/assets/**/*` 与 `rename: { stripBase: 4 }` 保留资源相对目录，将全部内容复制至构建输出中的 `cesium/BetterSkyAssets/`；手动复制时可放到 `public/cesium/BetterSkyAssets/`。这里以宿主 `CESIUM_BASE_URL='/cesium/'` 为例；已有其他 Cesium 资源根目录时，将 `BetterSkyAssets/` 放到那个根目录下即可。不得硬编码 `.pnpm` 存储路径或依赖提升。
- Cesium 官方资源与插件效果资源共用宿主的 `CESIUM_BASE_URL`；SDK 不覆盖该配置，构建 SDK 时也不能把 demo 的 `/cesium/` 固化进库产物。
- 限制同页一个活动实例，第二实例在改变场景前报错，销毁后允许重建。
- 首版仅支持具有 `scene.globe` 的 `SceneMode.SCENE3D` 场景及 `PerspectiveFrustum` 透视相机；在修改宿主场景、注册回调或创建 GPU 资源前检查，拒绝二维、Columbus View、正交相机和无 Globe 场景。宿主切换到不支持的模式前须先 `dispose()`；每帧入口也应检测场景与相机条件，遇到不支持的状态时停止效果渲染并一次性报告明确错误，避免继续执行透视矩阵计算。恢复受支持的场景后须销毁并重建实例，不承诺模式自动切换兼容。
- 在混淆包中保留并验证源码的单实例生命周期保障：幂等销毁，SMAA 避免重复并发加载，释放实例拥有的阴影、纹理和帧缓冲，销毁后迟到的回调跳过 GPU 资源创建。请求不主动中止；新增 `assetsReady` 等待天空 Pass 六项必需资源，雪为按需可选、SMAA 单独管理，不宣称等待全部可选资源。移除共享数学原型扩展，HBAO 状态改为实例字段；不得把 context 辅助方法或宿主设置宣称为完全回滚。
- 明确并检查必要的浏览器能力，包括 WebGL 2、所需浮点纹理能力、`Float16Array` 和 `structuredClone`。
- 保留当前场景设置行为，说明时钟、HDR 等影响及销毁恢复范围。
- 保留源码内的原始通知，发布包附上 [第三方代码及许可](THIRD_PARTY_NOTICES.md) 中合并的必要声明。该清单只列已确认的复用关系，不列推测来源。MIT/BSD/Apache 代码按原条款用于闭源商业产品，不要求公开整个 SDK 或业务项目源码；本项目的收费条款不改变这些第三方材料的原有许可。
- Cesium/three 作为外部依赖时由依赖包携带各自的完整许可，不在本 SDK 重复附上整份依赖 SDK 的许可合集；本地直接复用的 Cesium 后处理代码和 three.js loader/CSM 代码仍在合并声明中保留其适用通知。若另行复制依赖的构建产物或资源，则随该次分发保留对应通知。
- 中英文 README 合并项目简介、亮点、安装使用和许可，英文默认，并列提供 npm、pnpm 安装命令；原理、详细 API 和源码开发流程放在不发布的 `BetterSky.README.md` 及中文版。

包发布并验收后，直接使用现有初始化方式：

```js
import { BetterSky } from 'bettersky-cesium'

const effects = new BetterSky(viewer, {
  time: undefined, // 保留业务场景的时间
})

effects.update({ coverage: 0.5 })

// 页面卸载时，先释放效果，再销毁 Viewer。
effects.dispose()
```

### 资源复制契约

| 安装后的来源 | 使用项目中的目标 | 浏览器访问前缀 |
| --- | --- | --- |
| `node_modules/bettersky-cesium/dist/assets/` 的全部内容 | `public/cesium/BetterSkyAssets/` | `/cesium/BetterSkyAssets/` |
| `node_modules/cesium/Build/Cesium/Workers/` | `public/cesium/Workers/` | `/cesium/Workers/` |
| Cesium 同级的 `Assets/`、`ThirdParty/`、`Widgets/` | `public/cesium/` 下对应同名目录 | `/cesium/` |

宿主配置 `CESIUM_BASE_URL='/cesium/'` 后，示例请求为 `/cesium/BetterSkyAssets/GeospatialAssets/local_weather.png`。插件无需额外 URL 配置。不要把磁盘路径 `node_modules/...` 当作浏览器 URL。

README 以提示形式说明：按许可规则，对外分发 SDK 或其运行产物时应保留 `LICENSE` 与 `THIRD_PARTY_NOTICES.md` 随副本分发，不规定具体复制位置。

部署到 `/app/` 时，宿主将 `CESIUM_BASE_URL` 配成 `/app/cesium/`，插件资源自动位于 `/app/cesium/BetterSkyAssets/`；接入项目的构建 `base` 和实际服务目录同步设置。完整命令和配置见 [README 使用说明](README.md#usage) / [中文使用说明](README.zh-CN.md#使用)。升级 SDK 后同步替换 `BetterSkyAssets/` 内资源并刷新缓存，不能混用不同版本的 JS 与纹理。

## README 与文档交付

- README 保留项目简介、项目亮点、如何使用、许可和原有赞助支持；使用部分包含兼容要求、npm/pnpm 安装、资源复制、`CESIUM_BASE_URL` 配置、最小接入与销毁示例。联系方式使用 `iamthek@qq.com`，包元数据和 README 不展示作者 GitHub 主页；原有赞助文字与支付图片必须保留。
- 组装脚本直接复制仓库的两份 README 到包根，验收核对包内文档与当前源文件一致；发布包不得保留错误的“已验证”或过期草案状态。
- 两份 README 提供 TypeScript 参数提示入口和部分配置示例，引导使用随包 `dist/index.d.ts` 的字段/方法说明；这些是公开使用文档，不包含内部实现。新增参数时同时维护声明、默认值说明及相关 README 示例。
- npm 页面展示发布元数据中选中的 README，须核实默认语言而不能仅凭包根存在 `README.md` 就断言默认英文。本轮 npm 11.19.0 按文件匹配顺序选中了中文 README；英文版本可通过公共语言链接或安装后的包内 `README.md` 查看。两份文档均完整提供 npm 和 pnpm 两种接入用法。
- 检查 npm 页面上的语言切换、许可和支持链接；公开页面不得指向私有仓库或不存在的源码文件。若 npm 不能正确解析包内相对链接，发布前改成已验证可访问的公开文档地址，并保持本地包内文档可读；不能为此开放源码仓库。
- 渲染原理、实现细节、源码导览、完整 API 和仓库开发流程保留在 `BetterSky.README.md` / 中文版，明确不进入发布白名单。发布 README 不链接这些内部文档、源码、demo 或发布计划，避免无效私有链接和多余文件进入包。

## 验收与发布

以下步骤为每次版本发布的固定执行顺序，实际通过状态以本轮重新生成的压缩包及验收报告为准；旧候选包与旧哈希均不再作为发布依据。正式交付目录保留本轮压缩包、逐文件清单、验收报告和浏览器核查记录。

- 验收统一使用仓库外的临时目录或指定专用目录，例如 `%TEMP%/bettersky-sdk-acceptance/<run-id>/`；每轮建立独立子目录，npm/pnpm 测试项目、依赖与锁文件、压缩包解压内容、复制的纹理、测试构建产物、测试专用缓存及截图/日志均放在该目录内，不写入源码仓库，不修改仓库的依赖、锁文件或配置。发布后的安装冒烟验证遵循相同规则。
- 验收结束后，无论成功或失败，先将必要的验收结果、实际依赖版本、性能数据及被测 `.tgz` 的哈希归档；通过验收后，将待发布包保存在正式交付位置，发布继续使用该份包，不依赖即将清理的测试目录，也不重新打包。
- 使用 `finally` 或等效清理流程停止本轮启动的测试服务、关闭测试页面，并删除本轮专用目录中的测试项目、`node_modules`、解压文件、资源副本、测试构建产物、测试专用缓存和过程截图/日志。删除前核对解析后的绝对路径，确保目标仅限本轮专用目录；不得删除指定父目录中的其他内容、共享缓存或既有项目资源。清理后检查仓库状态，确认验收未留下测试文件或意外改动；失败时将必要诊断摘要纳入归档后再清理。

1. 按实际分发内容核对第三方许可条件及自有代码授权范围，确认合并声明完整；资源清单逐文件核实用途和分发权。
2. 编译混淆并组装 `.sdk-package/`，按上述白名单检查文件、文本内容及资源哈希；无 sourcemap、原始实现、未混淆副本、环境变量、demo 或开发数据，必要通知齐全。检查公开声明各成员 JSDoc、所有方法参数 `@param`、声明与维护源的公开 AST/JSDoc 一致性及两处声明输出的字节一致性，确保单位、默认值和联动规则与实现一致。校验压缩前后所有着色器组装操作的匹配次数、切片边界和生成结果，覆盖云密度、云阴影及体积光路径，防止替换静默失效。
3. 在 `.sdk-package/` 中用 `npm pack --dry-run --json` 预审，再用 `npm pack` 或 `pnpm pack` 生成实际 `.tgz`。将包复制到验收专用目录后解压，逐项复核文件、包元数据、README、资源字节和映射痕迹，记录 SHA-256；dry-run 不能代替实际包验收。
4. 同一份 `.tgz` 分别安装到独立 npm 项目和默认依赖布局的 pnpm 项目，以 Vite、TypeScript 和最低/当前最新版本的 Cesium、three 交叉组合验证导出、类型、外部依赖解析与文档命令。发布验收时重新核实最新版本，并记录实际版本与结果。所有组合均按 Cesium 自身依赖规则安装 engine/widgets，不使用其 overrides，也不手工另装指定内部组件来制造通过结果。默认接入组只声明 SDK 和 Cesium，让 SDK 自动安装 three，项目中没有任何 overrides；另设最低 three 版本的兼容组，只有该测试组使用 three 的版本覆盖，以验证 SDK 真正加载了最低版本。以安装后的 SDK 入口为解析起点，记录并断言 three 路径、版本及宿主最终解析结果，同时记录 Cesium 自动解析的内部组件版本，确认 Cesium 与宿主共享同一份依赖。对照源码仅用于单独标注的性能基线；实际安装验收不得使用源码别名或工作区链接，也不得改写待发布包的依赖声明来替代矩阵控制。
5. 使用 `@browser` 验证混淆包的渲染、参数更新、开关和所有必要纹理；检查根路径、`/app/` 子路径和自定义 Cesium 资源根目录均只需配置宿主的 `CESIUM_BASE_URL`，以及宿主生产构建后二次压缩的运行情况。确认 JS/GLSL 无编译错误、资源非 404/HTML 回退，控制台无新增错误，并对照混淆前后的加载耗时、包大小和同场景帧耗时。
6. 验证资源加载期间销毁、重复销毁、销毁后重建和第二实例限制；同时验证初始化时拒绝二维、Columbus View、正交相机和无 Globe 场景，且拒绝前未改变场景或分配 GPU 资源。验证运行中切换到不支持模式时停止效果渲染并明确报错，以及恢复三维透视场景后销毁重建的流程。以计划中的生命周期和场景边界修复实际完成为准，不因文档写入即视为通过。
7. 核实中英文 Quick Start 与真实产物一致，源码链接不进入包 README；许可条件沿用现有正文。确认包名、版本、账号权限和认证可用，最终签出待发布 `.tgz` 的哈希。任一步失败均不得发布。
8. 由拥有发布权限的账号通过固定的 `publish:sdk` 脚本上传已验收的同一份 `.tgz`，只发布一次。日常迭代使用上文的固定脚本命令；下面两种命令仅说明脚本底层发布动作，实施时选定一种客户端，不能改成仓库根无参数 publish：

```bash
pnpm publish ./bettersky-cesium-0.1.0.tgz --access public --registry=https://registry.npmjs.org
```

或使用 npm（二选一，不依次执行）：

```bash
npm publish ./bettersky-cesium-0.1.0.tgz --access public --registry=https://registry.npmjs.org
```

9. 发布后分别通过 npm 和 pnpm 从官方仓库安装准确版本，重做资源复制与接入冒烟验证；检查 npm 页面确实展示 Quick Start，发布内容与已验收文件一致。文档修订涉及包 README 时随新版本发布，不承诺直接修改本地 README 就会更新 npm 页面。

## 官方参考

- [Vite 库模式](https://vite.dev/guide/build#library-mode)
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
