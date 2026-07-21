# 开发交接

最后更新：2026-07-21

## 当前任务

状态：媒体管理列表字段体验优化已完成，准备随本次提交交付到 `gitee/main`。

目标：媒体管理列表不再默认平铺所有长字段，改为核心列默认展示、扩展列可配置、预算标签
折叠、表格密度可切换，并优化移动端卡片信息层级。

## 媒体管理列表体验优化（2026-07-21）

### 已完成

- 默认列表仅展示核心字段：CID、媒体、重要程度、类目、YYZ版本、展示样式、预算、对接进度、
  负责人、更新时间和上线时间。
- 增加“列设置”，支持用户勾选域名、版本号、最新支持功能、任务配置要求、特殊入口信息等
  扩展字段；配置保存到 `localStorage`。
- 增加标准/紧凑两种表格密度，配置保存到 `localStorage`。
- 预算字段在列表中最多展示 2 个标签，超出显示 `+N`，鼠标悬停可查看完整预算。
- 表格横向宽度按当前可见列自动计算，不再固定为全字段超宽表格。
- 移动端卡片改为媒体名 + 对接进度优先，补充 CID、类目、负责人、YYZ版本、展示样式、预算
  摘要和更新时间。
- 长字段仍在详情抽屉完整展示，不改变媒体详情、文档编辑、共享、历史等既有链路。

### 已验证

- `git diff --check` 通过。
- `node --check client/src/pages/MediaManagement.js` 通过。

### 环境限制

- 当前执行环境没有可用 `npm`、`yarn`、`pnpm`，且仓库没有 `node_modules`；内置 Node 运行时
  也不包含 React/AntD 构建依赖，因此本轮无法执行 `npm run build` 或前端组件测试。

### 本轮任务文件

- `client/src/pages/MediaManagement.js`
- `handoff.md`

## 媒体关联文档归档优化（2026-07-21）

### 已完成

- 媒体模块启动时确保 `产运 / 落地 / YYZ / 媒体对接` 文件夹路径存在并复用已有同名目录。
- 已有媒体关联文档幂等迁移到目标目录，编号重算为
  `D{序号}-DOMESTIC-OPS-IMP-{年份}`，同时更新为国内项目、产运、落地元数据。
- 新建媒体直接使用目标目录和 `DOMESTIC-OPS-IMP` 文档属性，不再创建 `GEN-ALL-MEDIA` 文档。
- 媒体关联文档的 `icon_key` 统一为空，因此收藏后在文档中心显示普通文档默认图标，不再显示
  播放箭头。
- 媒体身份和标题保护改为依据 `media_assets.document_id` 关系，兼容旧 `doc_type=MEDIA` 数据；
  类型迁移为 `IMP` 后仍不能从文档中心绕过媒体管理改名。
- 正文、附件、共享、收藏、历史记录及文档 ID 均原位保留。

### 已验证

- 真实 MySQL 旧数据验证：`D000470-GEN-ALL-MEDIA-2026` 成功迁移为
  `D000470-DOMESTIC-OPS-IMP-2026`，完整目录路径和 `icon_key=NULL` 均正确。
- MySQL 迁移扫描 1 条、更新 1 条耗时 `21ms`，服务总启动耗时 `2.53s`。
- 媒体目标测试 8 条通过；后端全量 45 条、前端全量 70 条全部通过。
- `node --check server/index.js`、`node --check server/lib/mediaManagement.js` 通过。
- 隔离生产构建通过，输出到 `/tmp/relation-media-document-placement-build`。

### 本轮任务文件

- `AGENTS.md`
- `handoff.md`
- `server/index.js`
- `server/lib/mediaManagement.js`
- `server/lib/mediaManagement.test.js`
- `server/lib/mediaManagementRouter.test.js`
- `资产管理模块PRD.md`

## 上一轮：生产启动故障（2026-07-21）

### 根因

- `7b6545f` 将文档默认共享迁移版本从 1 提升到 2，并首次为目标、周报补默认共享。
- 旧实现发生在 `app.listen()` 之前，并按每条文档、目标、周报逐条查询、插入、更新。
  生产 MySQL 数据量下会产生数万次同步数据库往返，进程长期无法监听 `3001`。
- 因进程是阻塞而不是立即抛错，所以没有“服务器启动”日志；Kubernetes 只看到
  readiness/liveness `connection refused`，随后杀掉新 Pod，旧 Pod 继续承载流量。

### 修复

- 新增 `server/lib/defaultShareMigration.js`，用固定数量的 MySQL
  `INSERT ... SELECT ... WHERE NOT EXISTS` 和集合更新完成三类历史数据迁移。
- 默认共享迁移增加开始、结束、耗时、统计和失败降级日志；非核心回填失败不再阻止服务监听。
- 服务进程启动与监听成功均输出阶段日志及总启动耗时，后续可直接判断卡在哪一段。
- 修正新建 `goals` 表缺失 `default_shares_initialized`、却误加到 `tasks` 表的 schema 问题。
- `AGENTS.md` 已改为 MySQL 单一数据库基准，不再要求新代码兼容 SQLite。

### 验证

- 隔离 MySQL 9.7 测试库：5,000 份文档、5,000 个目标、5,000 份周报首次迁移成功；
  新增 20,000 条文档共享和 40,000 条内容共享，待迁移记录均为 0。
- 上述 1.5 万条历史记录首次迁移耗时 `450ms`，服务总启动耗时 `2.991s`。
- 再次启动迁移耗时 `67ms`，服务总启动耗时 `2.506s`，重复执行不新增共享。
- `node --check server/index.js` 通过。
- 默认共享迁移单测 3 条通过；共享、历史两组后端集成测试及差异单测共 8 条通过。

### 交付

- 已随提交 `1ae5997 修复服务启动迁移阻塞` 推送到 `gitee/main`。
- 部署观察日志顺序：`process started` -> `legacy default-share migration finished` ->
  `server listening`，并确认新 Pod 探针健康。

## 上一轮：共享与页面编辑记录

### 已完成

- [x] 文档默认共享初始化改为版本化迁移，旧文档补齐缺失的默认 CXO；用户明确移除并保存后不再自动补回。
- [x] 文档、目标和周报默认共享人按陈锦标、陈豪赞、林璐韵、贺敏顺序显示为已选标签。
- [x] 目标和周报编辑弹窗内嵌完整共享编辑器，支持默认人员、项目组、部门、小组和个人。
- [x] 目标和周报新建时随主记录一次保存共享范围；编辑、关闭和自动保存时正确等待共享保存完成。
- [x] 通用历史抽屉新增“版本记录 / 页面编辑记录”，显示编辑人、时间、字段及修改前后值。
- [x] 服务端为目标、周报、经营周会准备、会议提纲和会议结论生成可读差异，且不返回原始历史快照。
- [x] 三个模块均可恢复旧版本；恢复会生成新版本，并立即同步列表和当前编辑器。
- [x] 周报恢复按钮服从服务端 `can_restore`，避免只读共享用户误看到恢复操作。

### 交付

- 已随提交 `7b6545f 优化共享与页面编辑记录` 推送到 `gitee/main`，无代码或测试遗留项。

### 已验证

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

## 共享与页面编辑记录任务文件

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

## 产品资产权限优化（2026-07-21）

状态：开发和验证已完成；本节随提交“优化产品资产入口用户可见权限”交付到 `gitee/main`。

已完成：

- 产品资产路由从模块权限门调整为菜单入口门：拥有 `/product-assets` 菜单入口的登录用户可以进入页面。
- 产品资产列表和详情取消负责人、创建人、小组、跨团队范围裁剪，改为拥有产品资产菜单入口即可查看全部产品资产内容。
- 产品资产、导入、核减新增/编辑/删除等写接口补充 `/product-assets` 菜单校验和 `canWrite` 校验，`readonly/guest` 只能查看。
- 产品资产页面按写权限隐藏新增、CSV 导入、编辑、删除、新增核减和新增关联策略等按钮，只保留详情查看。

已验证：

- `node --check server/index.js` 通过。
- 前端全量测试：15 个测试套件、70 条测试全部通过。
- 隔离生产构建通过，输出到 `/tmp/relation-product-assets-permission-build`。
- 后端 `node --test server/lib/*.test.js`：45 条中 42 条通过；3 条监听本地端口的既有集成测试因沙箱禁止 `127.0.0.1` 监听报 `EPERM`，无业务断言失败。

本轮任务文件：

- `client/src/App.js`
- `client/src/pages/ProductAssets.js`
- `server/index.js`
- `handoff.md`
