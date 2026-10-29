# Antigravity-CN

Antigravity macOS 桌面版的社区中文化源码。此仓库不是 Google 官方项目，也不提供修改后的应用程序或官方界面包。

## 版本状态

| 版本 | 状态 |
| --- | --- |
| 2.26.0 | 原始 UI SHA-256 已列入审核指纹；组件源码、动态界面、权限卡片方案曾在本机验证。 |
| 2.28.0 | 已完成本机 UI 候选扫描和词条补译；当前文件指纹仍未批准，不可构建或注入。 |

目前没有找到并验证 Antigravity 官方 UI 语言包接口。它与 VS Code 的相似性本身不能证明支持 VS Code 的 UI language-pack 扩展，因此本项目不把社区扩展冒充官方方案。现有方案只在本机内存中拦截精确匹配的 UI 响应，不改写应用安装目录或签名文件。

构建器要求版本号和原始 UI SHA-256 同时出现在 `src/dictionaries/source-fingerprints.json`。未审核的版本或文件指纹不能生成可运行构建；动态注入时也再次校验指纹。2.28.0 的扫描与补译结果只是候选，尚未在该版本应用中启用或验收；2.26.0 的历史验收不代表后续版本、远程内容、系统原生菜单或未来文案全部中文。

## 源码结构

- src/component：从官方本机 UI 包提取展示文案，并按语法树位置生成本地中文组件包；保留功能属性及占位符。
- src/dictionaries：离线翻译结果、人工校订术语及按版本维护的原始 UI SHA-256 审核清单。
- src/dom：基于上游 MIT 项目的动态界面词库，保护用户消息、代码、输入框值和编辑器内容。
- src/permission：权限卡片的固定文案原位翻译；保留命令正文、选项值、草稿和选择状态。
- src/runtime：仅连接本机官方 Antigravity 调试端口，按版本及哈希校验后注入；没有自动重启、刷新或导航应用页面。
- scripts：安全捕获本机官方 UI 包、检查更新指纹、预览候选差异、构建和回滚运行模块的工具。
- third_party/upstream：已固定的上游 MIT 源码与原始许可证。
- tests：无需启动 Antigravity 的权限翻译测试。

## 本机构建

需要 macOS、Node.js 22 或更新版本。应用运行时可使用只读捕获工具；它只请求本机官方 `main.js`，不重启、不刷新、不导航，也不会点击任何权限按钮。更新后，已运行的监视器会发现版本不匹配并停止注入；执行 `check-update` 会重新读取当前版本和 UI 指纹，但不把官方源码保存到磁盘：

~~~sh
npm ci
npm run capture
npm run check-update
npm run build -- inputs/2.27.0/main.js 2.27.0 --preview
npm run preview -- 2.27.0
npm test
~~~

`capture` 和 `check-update` 都要求 Antigravity 已运行且有 UI 窗口，并验证本机调试端口属于官方应用；它们不会启动应用。`check-update` 返回 `ready` 表示本机版本和完整文件指纹都有已审核的运行构建；`unknown-fingerprint` 或 `approved-source-needs-build` 都不是“更新已适配”。候选预览只写入 `build/previews/`，其中没有运行监视器，运行时也拒绝 `previewOnly` 清单。

新版本维护流程：先捕获官方源并运行 `check-update`；以 `--preview` 构建候选，检查 `source-translations.json`、`unmapped.json`、`coverage.json`、`source-exclusions.json` 及实际 UI 结构。处理新词条或结构变化并补充针对性测试后，才将已审核的版本和 SHA-256 加入 `source-fingerprints.json` 并执行正式构建。正式构建如果遇到未知字符串或结构保护失败会停止；不要把新版本指纹加进去来绕过审查。候选源、预览差异、构建包均留在 git 忽略的本机目录，不会提交。

运行模块为 `build/版本号/monitor.mjs` 和 `build/版本号/monitor-permission.mjs`。仅在对应版本完成验收后启用。可运行 `npm run rollback -- 2.26.0` 向本项目登记的监视器发送 SIGTERM；它只会停止已校验 PID 与入口路径的项目进程，不修改官方应用。当前窗口里已渲染的中文要在用户自然关闭并重新打开应用后才会清除；项目不会擅自刷新页面或丢弃草稿。

## 公开边界

仓库只发布汉化项目自身源码、词库、测试和上游许可允许再分发的源码。官方 main.js、修改后的 main.zh-CN.js、app.asar、应用备份、浏览器缓存、用户会话、命令正文及凭据均不上传。提交前请检查本地改动；不要使用全量目录复制来替代白名单。

上游来源与版本固定信息见 [来源说明](docs/PROVENANCE.md)。如需重新翻译新版本的候选文案，可选用 src/component/translate-local.swift 调用本机 macOS Translation 框架，再人工校订；不要把用户内容作为翻译输入。
