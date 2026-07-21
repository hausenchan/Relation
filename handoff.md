# 开发交接

最后更新：2026-07-21

## 当前任务

状态：本轮开发与验证已完成

目标：统一目标、周报和经营周会的历史版本及多人自动更新能力，修复大周报保存、块内
多行粘贴和单字符删除，并建立项目 Agent 上下文文档。

## 已完成

- [x] 新增共享块编辑器的同块多行粘贴、单字符删除和行首合并回归用例。
- [x] 新增块 ID 级三方合并工具及测试。
- [x] 目标、周报、经营周会接入协作基线、冲突合并、轮询和历史入口。
- [x] 后端新增统一 `content_revisions` 历史版本能力。
- [x] 周报及相关正文升级 MySQL `LONGTEXT`，明确大内容错误。
- [x] 新增 `AGENTS.md`、`agent.md` 和本交接文件。

## 待完成

- 无代码或验证遗留项。
- Git 提交与远端状态以 `git log`、`git status` 和 Gitee `main` 为准。

## 已验证

- 前端全量测试：13 个测试套件、63 条测试全部通过。
- 后端全量测试：33 条测试全部通过。
- 目标/周报集成测试：大正文、409 冲突、加密历史和恢复通过。
- 经营周会集成测试：准备内容隔离、会议可见/编辑权限通过。
- 隔离生产构建：通过，输出到 `/tmp/relation-document-capabilities-final-build`。
- 临时 SQLite 空库：schema 初始化、服务启动和鉴权响应通过。
- 浏览器：周报、目标、经营周会的多行粘贴、单字符删除、撤销、快捷保存、
  自动保存和历史入口通过。
- 浏览器：周报立即点击“完成”可等待保存并成功关闭；恢复旧版本后生成新版本。
- 浏览器：双标签经营周会协作更新在 5 秒轮询内自动同步。
- `node --check server/index.js` 与 `git diff --check`：通过。

## 工作区提醒

- 存在其他会话的未提交修改；不要纳入本任务：`client/build/*`、
  `client/src/pages/Documents.js`、`data.db`、`data-local.db*`、`dataAnalysis/`、
  `documentFolderPermissions*`、`server/lib/wolaiMcpImport.test.js` 等。
- 本任务提交信息必须为：`优化agent.md文档和文档相关能力`。
