# BetterSky SDK 维护与发布流程

本文说明如何准备、验证和发布一个 npm 版本。日常使用见[使用指南](BetterSky.README.zh-CN.md)，代码分工见[架构说明](SDK_ARCHITECTURE.md)。

本文以 `0.2.0` 为例。是否已经发布，以 npm registry 的实际结果为准；本地改好文档或生成压缩包都不等于已发布。已发布版本不能覆盖修改。

## 发布的是什么

源码仓库是 [iamthek/bettersky-cesium](https://github.com/iamthek/bettersky-cesium)，默认分支为 `main`。Demo 位于 [GitHub Pages](https://iamthek.github.io/bettersky-cesium/)。源码与 Demo 发布相互独立，npm 只发布 SDK 的运行文件。

`0.2.0` 采用 Apache License 2.0。构建保留 JavaScript 和 GLSL 压缩，移除代码混淆，不生成 sourcemap 或 declaration map。源码、已有素材和 Git 历史留在仓库，不需要为了精简 npm 包而删除。

仓库根 `package.json` 保持 `private: true`，用于防止误发整个工程。`build:sdk` 会生成独立的 `.sdk-package/` 及精简元数据；发布脚本上传经过验证的准确 `.tgz`，不直接发布仓库根目录。

npm 和 pnpm 使用同一份 npm registry 包，不需要分开上传。

## 固定命令

| 命令 | 负责什么 |
| --- | --- |
| `pnpm run build:sdk` | 构建 SDK、压缩 JS/GLSL、生成带注释的公开类型、收集资源与许可，组装并检查 `.sdk-package/`。 |
| `pnpm run pack:sdk --output-dir "<交付目录>"` | 检查已经组装的文件，执行打包预审和真实打包，输出包、文件清单和 SHA-256；不重新构建。 |
| `pnpm run verify:sdk --tarball "<包路径>" --report-dir "<交付目录>" --serve` | 在仓库外建立 npm/pnpm 接入项目，验证依赖、类型、资源复制和构建，并启动供浏览器核查的页面。 |
| `pnpm run publish:sdk --tarball "<包路径>" --report "<报告路径>"` | 核对包与验收报告、认证和版本状态后，向官方 npm registry 上传该包；不重新构建或打包。 |
| `pnpm run build:demo` / `pnpm run build:pages` | 构建 Demo 至 `dist-demo/`，不会覆盖 SDK 的 `dist/`。 |

`verify:sdk` 还支持 `--work-dir` 指定仓库外的测试目录。`publish:sdk` 支持 `--dry-run` 预审和 `--verify-only` 只读核实发布结果。

## 每次发版怎么做

1. 在根 `package.json` 更新版本，同步更新双语 README、指南与 CHANGELOG。核对默认参数、公开类型、截图和文档链接。
2. 用仓库规定的 Node.js 和 pnpm 安装锁定依赖，运行与改动有关的测试，再构建和打包。
3. 对同一份 `.tgz` 完成自动检查和浏览器检查。记录实际依赖版本与结果，不沿用旧版本的验收结论。
4. 将浏览器证据合并进验收报告，确认没有必需项失败或待确认，再运行发布预审和正式上传。
5. 从 registry 检查该版本及压缩包字节，完成 npm/pnpm 安装冒烟。确认后再将 CHANGELOG 中的版本改为已发布状态。

使用仓库外的交付目录保存包和报告，按脚本输出替换下面的占位路径：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run build:sdk
pnpm run pack:sdk --output-dir "<交付目录>"
pnpm run verify:sdk --tarball "<交付目录>/bettersky-cesium-0.2.0.tgz" --report-dir "<交付目录>" --serve
```

使用 `@browser` 检查验收页面，保存浏览器核查记录；需要登录时由维护者手动处理。完成后，在验收终端输入 `finish`，等待测试服务停止和临时目录清理，再汇总证据：

```bash
pnpm run verify:sdk --finalize --report "<验收报告路径>" --evidence "<浏览器核查记录路径>"
pnpm run publish:sdk --tarball "<交付目录>/bettersky-cesium-0.2.0.tgz" --report "<验收报告路径>" --dry-run
pnpm run publish:sdk --tarball "<交付目录>/bettersky-cesium-0.2.0.tgz" --report "<验收报告路径>"
```

认证和一次性验证由有权限的维护者完成，不把凭据写入脚本、文档、报告或包。预审成功不代表真实上传权限或 2FA 已经满足。

npm 可能已经接收上传，但版本暂时还查不到。脚本会保存处理中回执；此时用同一包和报告核查，避免重复上传：

```bash
pnpm run publish:sdk --tarball "<交付目录>/bettersky-cesium-0.2.0.tgz" --report "<验收报告路径>" --verify-only
```

发布报告绑定准确包哈希。重新构建或重新打包后，应重新验证；不能把旧报告用于新包。

## npm 包应包含哪些文件

```text
package/
  package.json
  README.md
  LICENSE
  NOTICE
  THIRD_PARTY_NOTICES.md
  dist/
    index.js
    index.d.ts
    assets/
      snowCoverMask.png
      GeospatialAssets/
        local_weather.png
        turbulence.png
        shape.bin
        shape_detail.bin
        stbn.bin
        irradiance.exr
        scattering.exr
        transmittance.exr
```

包内只保留英文 README，中文链接回 GitHub。效果截图、详细文档、Demo、原始实现文件、开发依赖和其他素材不进入包；英文 README 使用公开 URL 显示仓库截图。构建和打包脚本按白名单逐项检查。

九个运行资源与 JS 同版本发布。接入项目将 `dist/assets/` 内容复制到宿主 `CESIUM_BASE_URL` 下的 `BetterSkyAssets/`，不嵌套额外的 `assets/`。升级时一并替换并刷新缓存。完整 Vite 配置见[资源与部署](BetterSky.README.zh-CN.md#资源与部署)。

## 哪些结果需要确认

- **接口与类型**：具名和默认导出、参数注释、默认值、单位、配置快照、构造期字段限制及销毁后行为与实现一致。
- **资源与包内容**：真实 `.tgz` 符合白名单，九项资源路径和字节正确，无映射文件、内联映射、凭据或开发目录，许可通知完整。
- **接入与依赖**：npm/pnpm 分别安装真实包，类型检查、生产构建和资源复制通过；按报告记录 Cesium、engine/widgets 和 three 的实际版本。
- **浏览器画面**：初始化、参数更新、开关、窗口缩放、销毁重建正常；根路径、子路径及自定义资源根均能加载真实文件，控制台无新增错误。
- **生命周期**：第二活动实例被拒绝；加载期间销毁和重复销毁安全；不支持的场景被拒绝，切换到 2D / Columbus View 前先销毁效果。

支持下限保持 Cesium `>=1.142.0`。已有锁定的 1.142.0 + engine 26.0.0 / widgets 16.0.0 可用；新项目示例采用干净安装已验证的 1.146.0 + engine 26.4.0 / widgets 16.3.0。1.142.0 + engine 26.4.0 / widgets 16.3.0 存在上游缺失导出，不用 overrides、改包或测试替身把失败标成通过。每次升级需重新记录结果，不宣称验证了所有未来版本。

`assetsReady` 只等待六项必需天空任务，成功、失败、销毁均 resolve；通过 `assetErrors` 判断失败，调用 `retryAssets()` 显式重试。雪纹理为可选任务，SMAA 单独管理，不能据此声称所有资源均已加载。

## 验收文件如何收尾

测试项目、依赖、资源副本、缓存和服务都放在本次专用的仓库外目录。完成或失败后先保存必要结果，停止本次服务，再清理本次测试目录；正式交付的包、清单、哈希和报告继续保留。

清理前检查解析后的绝对路径，确保只处理本次测试目录。最后查看仓库状态，确认没有留下测试文件或意外改动。GitHub Pages 的配置和部署方法见 [Demo 说明](demo/README.md)。
