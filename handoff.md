# 开发交接

最后更新：2026-07-21

## 当前任务

状态：已完成

目标：目标管理和周报管理复用文档中心共享逻辑，支持项目组、部门、小组、个人共享；
文档默认共享人按陈锦标、陈豪赞、林璐韵、贺敏的顺序默认选中，并允许移除后保持。

## 已完成

- [x] 新增通用 `content_shares`，目标和周报统一支持四类共享对象。
- [x] 列表、详情、历史版本、实时协作和保存接口统一应用共享可见性与编辑权限。
- [x] 共享协作者可编辑并继续授权，但不能删除记录；目标管理字段和历史恢复仍受原管理权限限制。
- [x] 文档默认人员优先按四个指定姓名匹配，角色仅作回退，显示顺序固定。
- [x] 旧文档一次性补默认共享；手动移除并保存后不会在重启时重新回填。
- [x] 新建文档、目标和周报默认共享四人，也可在保存前或共享弹窗中移除。
- [x] 删除目标、周报、用户、小组或项目组时同步清理相关共享记录。
- [x] 更新 `AGENTS.md` 的共享功能地图、权限边界和高风险耦合说明。

## 待完成

- 无代码、测试或提交遗留项。
- 本轮提交信息：`优化目标周报共享逻辑`，目标远端：Gitee `main`。

## 已验证

- 前端全量测试：14 个测试套件、66 条测试全部通过。
- 后端全量测试：35 条测试全部通过。
- 共享集成测试：个人、部门、小组、项目组可见和编辑，未共享隔离，继续授权、删除限制、
  目标管理字段及历史恢复权限均通过。
- 浏览器：文档、目标、周报共享弹窗均展示四类共享对象，四位默认人员按指定顺序选中。
- 浏览器：文档移除默认人员、保存并重新打开后保持移除状态。
- 隔离生产构建：通过，输出到 `/tmp/relation-content-sharing-final-build`。
- `node --check server/index.js`、`git diff --check`：通过。

## 工作区提醒

- 存在其他会话的未提交修改；不要纳入本任务：`client/build/*`、`data.db`、
  `documentFolderPermissions*`、`server/lib/wolaiMcpImport.test.js`、`data-local.db*`、
  `.codex/skills/yyz-dashboard-analysis/`、`dataAnalysis/` 和若干业务 Markdown。
- `client/src/pages/Documents.js` 同时含其他会话的文件夹权限与 Wolai 引用改动；本任务只暂存
  新建文档默认共享表单的精确 hunk。

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
