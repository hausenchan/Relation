# 开发交接

最后更新：2026-07-21

## 当前任务

状态：已完成，尚未提交（本轮用户未要求提交）

目标：修正文档默认共享人的选中状态；在目标管理和周报管理编辑页直接提供完整共享范围；
目标、周报和经营周会复用文档中心的版本记录、页面编辑记录及历史恢复能力。

## 已完成

- [x] 文档默认共享初始化改为版本化迁移，旧文档补齐缺失的默认 CXO；用户明确移除并保存后不再自动补回。
- [x] 文档、目标和周报默认共享人按陈锦标、陈豪赞、林璐韵、贺敏顺序显示为已选标签。
- [x] 目标和周报编辑弹窗内嵌完整共享编辑器，支持默认人员、项目组、部门、小组和个人。
- [x] 目标和周报新建时随主记录一次保存共享范围；编辑、关闭和自动保存时正确等待共享保存完成。
- [x] 通用历史抽屉新增“版本记录 / 页面编辑记录”，显示编辑人、时间、字段及修改前后值。
- [x] 服务端为目标、周报、经营周会准备、会议提纲和会议结论生成可读差异，且不返回原始历史快照。
- [x] 三个模块均可恢复旧版本；恢复会生成新版本，并立即同步列表和当前编辑器。
- [x] 周报恢复按钮服从服务端 `can_restore`，避免只读共享用户误看到恢复操作。

## 待完成

- 无代码或测试遗留项。
- 本轮尚未提交；提交时只纳入下方列出的任务文件，避免夹带其他会话改动。

## 已验证

- 前端全量测试：14 个测试套件、67 条测试全部通过。
- 后端全量测试：38 条测试全部通过。
- 浏览器：文档新建并保存后页头显示“共 4 人”，共享弹窗四位默认人员均为已选状态。
- 浏览器：目标和周报新建页均直接显示四类共享对象及四位默认人员，保存后共享关系落库。
- 浏览器：目标和周报二次编辑产生可读页面编辑记录，恢复旧版本后列表与编辑器同步更新。
- 浏览器：经营周会准备、会议提纲、会议结论三个 scope 均产生可读历史并成功恢复。
- 浏览器移动端：目标共享区域与历史抽屉在 390 x 844 视口无重叠、截断或不可达控件。
- 隔离生产构建：通过，输出到 `/tmp/relation-sharing-history-final-build`。
- `node --check server/index.js`、`git diff --check`：收尾时通过。

## 工作区提醒

- 存在其他会话的未提交修改；不要纳入本任务：`client/build/*`、`data.db`、
  `documentFolderPermissions*`、`server/lib/wolaiMcpImport.test.js`、`data-local.db*`、
  `.codex/skills/yyz-dashboard-analysis/`、`dataAnalysis/` 和若干业务 Markdown。
- `client/src/pages/Documents.js` 当前差异属于其他会话的文件夹权限与 Wolai 引用改动，本轮不要暂存。
- 文档默认共享人的本轮修复位于 `server/index.js` 的版本化迁移和共享初始化逻辑。

## 本轮任务文件

- `AGENTS.md`
- `handoff.md`
- `client/src/components/ContentHistoryDrawer.js`
- `client/src/pages/Goals.js`
- `client/src/pages/OperationalMeeting.js`
- `client/src/pages/WeeklyReports.js`
- `client/src/utils/contentShares.js`
- `client/src/utils/contentShares.test.js`
- `server/index.js`
- `server/lib/contentRevisionDiff.js`
- `server/lib/contentRevisionDiff.test.js`
- `server/lib/contentSharingIntegration.test.js`
- `server/lib/documentCapabilitiesIntegration.test.js`

## 资产管理-媒体管理（2026-07-21）

状态：开发和自动化验证已完成；本节随提交“增加资产管理-媒体管理”交付到 `gitee/main`。

已完成：

- 新增 `/media-management` 菜单、路由、菜单权限配置和前后端 API。
- 新增 `media_assets` SQLite/MySQL 兼容表，CID 以文本保存 1-8 位数字并保留前导零。
- 完整支持媒体字段、枚举、预算多选、负责人、日期和长文本校验；敏感自由文本走统一 AES-GCM 字段加密。
- 列表展示全部字段，支持全字段及关联文档正文搜索、所有单选字段筛选、预算多选筛选、列宽拖动和移动端列表。
- 双击记录打开约 2/3 屏宽详情，上半部分展示媒体信息，下半部分嵌入完整文档中心编辑器。
- 每条媒体自动关联真实文档，复用块编辑、目录、附件、共享、版本记录、页面编辑记录和历史恢复。
- 媒体可见和编辑权限沿用关联文档；负责人自动加入共享；访客还需 `product_assets` 模块读权限。
- 媒体名称是关联文档标题的唯一来源；文档编辑或历史恢复不会造成标题分叉，删除关联文档会同步移除媒体记录。
- 更新 `资产管理模块PRD.md` 和 `系统需求与权限设计PRD.md`。

已验证：

- 媒体后端单元/无网络路由集成测试：7 条全部通过（含 SQLite 建表与 MySQL 字段翻译）。
- 暂存区独立代码树前端全量测试：14 个测试套件、67 条测试全部通过。
- 暂存区独立代码树后端全量测试：38 条中 35 条通过；其余 3 条原有监听端口集成测试因沙箱禁止 `127.0.0.1` 监听而报 `EPERM`，无业务断言失败。
- `node --check server/index.js`、媒体模块语法检查和 `git diff --check` 通过。
- 隔离生产构建通过，输出到 `/tmp/relation-media-management-final-build`。

环境限制：

- 当前执行沙箱禁止监听本地端口，因此无法启动前后端进行浏览器截图回归；生产构建和无网络路由集成测试已覆盖本轮可执行的核心链路。

本轮任务文件：

- `client/src/App.js`
- `client/src/api/index.js`
- `client/src/pages/Documents.js`（仅嵌入模式及媒体标题只读相关增量）
- `client/src/pages/MediaManagement.js`
- `client/src/pages/MenuPerms.js`
- `client/src/utils/mediaManagement.js`
- `client/src/utils/mediaManagement.test.js`
- `server/index.js`（仅媒体模块接入、文档标题保护和删除联动增量）
- `server/lib/encryptedFields.js`
- `server/lib/mediaManagement.js`
- `server/lib/mediaManagement.test.js`
- `server/lib/mediaManagementRouter.test.js`
- `资产管理模块PRD.md`
- `系统需求与权限设计PRD.md`
