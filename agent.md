# Relation 项目 Agent 上下文文档

生成时间：2026-07-20  
当前分支：`main`  
当前远端：`origin git@gitee.com:mdtec/relation.git`  
当前 HEAD：`9472ccd 优化AI建议`  
用途：给后续开发 Agent 快速建立项目上下文，减少重复读取和 token 消耗。

## 1. 项目定位

Relation 是一个面向商务、经营、项目、资产和文档协作的内部经营管理系统。

核心形态：

- 前端：React 18 + Ant Design 5 单页应用。
- 后端：Node.js + Express 5 单体服务。
- 数据库：默认 SQLite，已支持 MySQL 兼容运行和 SQLite 到 MySQL 迁移。
- 移动端：包含 Android 原生 WebView 容器。
- 附件存储：本地上传目录 + 阿里云 OSS 可选持久化。
- AI 能力：Agent 中台、AI 训练台、AI 建议、Wolai/TAPD/文件导入、统一蒸馏库脚本。

## 2. 关键目录和文件

- `client/src/App.js`：全局布局、菜单、路由、权限入口、顶部工作区标签。
- `client/src/api/index.js`：前端 API 封装，所有页面优先走这里。
- `client/src/pages/`：页面模块。
- `client/src/components/`：通用组件，包括文档正文编辑器、附件、提醒、互动记录等。
- `client/src/utils/`：文档块、剪贴板、权限、周会、周报等纯逻辑工具和测试。
- `server/index.js`：后端主服务，包含表初始化、迁移、认证、权限、业务 API。
- `server/lib/database.js`：SQLite/MySQL 方言兼容封装。
- `server/lib/ossStorage.js`：OSS 读写和历史本地文件兼容。
- `server/lib/cryptoDao.js`、`server/lib/encryptedFields.js`：字段加密接入。
- `server/lib/wolaiMcpImport.js`、`server/lib/wolaiUrlImport.js`：Wolai 导入。
- `server/lib/documentFileImport.js`：文档文件导入。
- `server/lib/aiTrainingRuntime.js`：AI 训练台运行时。
- `server/boss-watcher/`：招聘雷达/候选人监控相关后端模块。
- `scripts/`：迁移、采集、导入、Chrome/Wolai 工具脚本。
- `DaAgent/Distillation/`：统一蒸馏库和训练资产构建脚本。
- `android/`：Android WebView 应用。
- `.codex/skills/tapd-relation-doc-import/`：TAPD 需求导入 Relation 文档的 Codex skill。

## 3. 运行和部署

本地安装：

```bash
npm run install:all
```

本地开发：

```bash
npm run dev
```

单独后端：

```bash
npm run server
```

单独前端：

```bash
npm run client
```

前端构建：

```bash
cd client
npm run build
```

生产启动：

```bash
NODE_ENV=production PORT=3001 node server/index.js
```

部署参考：`DEPLOY.md`。

## 4. 常用脚本

- `npm run ai-suggestions:sync`：同步 AI 建议种子。
- `npm run wolai:import`：运行 Wolai 文档导入器。
- `npm run wolai:collect`：采集 Wolai Chrome 内容。
- `npm run wolai:chrome`：启动 Wolai 调试 Chrome。
- `npm run mobile-task:collect`：手机任务中心采集。
- `npm run mobile-task:validate`：验证手机采集配置。
- `npm run db:migrate:mysql -- --sqlite data.db --reset`：SQLite 导入 MySQL。`--reset` 会清空目标库，谨慎使用。

## 5. 环境变量

基础：

- `NODE_ENV`
- `PORT`，默认 `3001`
- `JWT_SECRET`，未配置时后端有默认值，仅开发可接受

数据库：

- `DB_CLIENT=mysql` 或 `DB_DIALECT=mysql`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_CHARSET`
- `MYSQL_TIMEZONE`
- `RELATION_MYSQL_*` 同类变量也被部分脚本支持

OSS：

- `ALIYUN_OSS_BUCKET`
- `ALIYUN_OSS_ENDPOINT`
- `ALIYUN_OSS_ACCESS_KEY_ID`
- `ALIYUN_OSS_ACCESS_KEY_SECRET`
- `ALIYUN_OSS_SECURE`
- `ALIYUN_OSS_LEGACY_UPLOADS_PREFIX`

网络抓包：

- `NETWORK_CAPTURE_PORT`，默认 `8888`

AI 训练/模型：

- `AI_TRAINING_LLM_API_KEY`
- `AI_API_KEY`
- `LLM_API_KEY`
- `OPENAI_API_KEY`
- `AI_MODEL`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`

Wolai：

- `WOLAI_MCP_TOKEN`
- `WOLAI_MCP_ENDPOINT`
- `WOLAI_API_BASE`
- `WOLAI_MCP_IMPORT_DEBUG`
- `WOLAI_ROWS_MAX_PAGES`
- `WOLAI_MCP_ALLOW_INCOMPLETE_DATABASE`
- `WOLAI_MCP_IMAGE_FETCH_TIMEOUT_MS`
- `WOLAI_MCP_IMAGE_IMPORT_LIMIT`
- `WOLAI_CHROME_PROFILE_DIR`
- `WOLAI_AUTO_CHROME_HEADLESS`
- `WOLAI_AUTO_CHROME_XVFB`

## 6. 功能总览

### 6.1 全局框架

- JWT 登录、登出、改密、当前用户信息。
- 菜单权限和模块权限控制。
- 敏感模块成员控制。
- 顶部工作区标签页：打开、关闭、关闭其他、关闭右侧、拖拽排序。
- 移动端侧边菜单、遮罩返回键处理、弹窗/抽屉返回键关闭。
- 通知铃铛、提醒、待审批/待跟进计数。
- 操作日志审计。

### 6.2 工作台

- 汇总任务、提醒、跟进、统计信息。
- 今日任务、任务状态、完成流程。
- 高管/商务相关统计入口。

### 6.3 Agent 中台和 AI 训练台

- Agent 经营台。
- 预算机会/研究机会汇总、列表、详情、审查、通知规则。
- AI 训练台总览、会话、消息、反馈、动作。
- 训练案例候选、案例审核、技能草稿、技能版本复制、编辑、评估、发布、回滚。
- 运行状态和评估统计。
- AI 建议快照、同步脚本和种子数据。
- 支持本地事实明细回答、个人模型 Key、OpenAI 兼容配置、公司 AI 网关配置。

### 6.4 目标计划

- 目标管理：目标 CRUD、详情、富文本/表格内容、权限。
- 周报管理：富文本编辑、自动保存、写作者配置、周报删除。
- 经营周会：模板、参与人、年度汇总、会议创建、章节准备、提交、议程生成、议程编辑、结论/决议文档化保存。

### 6.5 业务流转

- 商机：列表、详情、创建、编辑、删除、简单选择接口。
- 策略：策略 CRUD、简单选择、执行日志、策略复盘。
- 需求：需求列表、详情、创建、编辑、删除。
- 待跟进任务：列表、计数、观察列表、观察计数、状态更新。
- 我的任务/任务看板：任务 CRUD、计数、看板聚合。

### 6.6 资产管理

- 主体管理：公司主体 CRUD、简单选择、附件上传/下载/删除。
- 产品资产：产品资产 CRUD、详情、导入预览/导入、降本记录 CRUD。
- 文档中心：见 6.10。
- 预算管理：预算 CRUD。

### 6.7 商务协作

- 公司研究：公司 CRUD、详情、摘要、重复检查。
- 公司实体：实体 CRUD。
- 公司人员：人员 CRUD、转人脉。
- 公司产品：产品 CRUD、任务中心通知。
- 人脉管理：列表、地图、详情、重复检查、导入预览/导入、批量更新、分配、附件。
- 互动记录：互动 CRUD。
- 提醒事项：提醒 CRUD、完成。
- 竞品动态和公司动态。

### 6.8 团队管理

- 客户答谢：礼品库、答谢计划、申请、审核、记录。
- 出差申请：出差 CRUD、提交、审批、完成、费用、报告、统计。
- 出差协同：出差行程、日程、协同权限。
- 费用统计。

### 6.9 常用工具

- 网络抓包：启动、停止、清空、记录列表、详情、HAR 导出。
- 手机采集：采集应用配置、采集记录、汇总、复核、手动入库。

### 6.10 文档中心

文档中心是高频迭代模块，关键能力包括：

- 文件夹目录树、目录模板、目录层级展示、目录右键菜单、目录收起状态记忆。
- 文档列表、全局搜索、收藏、置顶、共享、批量追加共享人、按文件夹批量添加共享人。
- 文档标签页、右键关闭、关闭其他、关闭右侧、内容串页修复。
- 文档属性：领域、项目组、部门、文档类型、编号、版本、宽度、标题编号、小字号、标题目录。
- 编辑器块能力：段落、标题、列表、数字列表、折叠列表、折叠标题、引用、代码块、待办、分割线、附件块、图片/媒体、数据表格、目录块。
- 多块选择、全选复制、批量删除、批量转换样式、块柄显示、块菜单。
- 富文本：加粗、斜体、下划线、删除线、颜色、背景色、链接、图片粘贴、截图粘贴、光标保持、中文输入法处理。
- 表格块：普通表格、富表格、单元格选择、拖选、复制、粘贴、插入、删除、合并单元格、批量删除、按键处理。
- 自动保存、离开保存、快捷键保存、撤销、多人编辑自动同步、实时同步降频。
- 页面编辑记录、版本记录、恢复历史版本、编辑记录时间显示。
- 行内评论、选中文本评论、块评论。
- 附件：上传进度、预览、下载、复制链接、重命名、替换、删除，支持 OSS。
- 导入：通用文件导入、Wolai URL 导入、Wolai MCP 导入、TAPD 需求导入、嵌入数据表格导入。
- Wolai 兼容：标题、样式、折叠列表、图片、附件、表格、私有表格、多级内容、媒体层级。
- 移动端：文档列表/编辑区适配、Android WebView 适配、菜单和空白页修复。

主要文件：

- `client/src/pages/Documents.js`
- `client/src/components/DocumentBodyEditor.js`
- `client/src/utils/documentBodyBlocks.js`
- `client/src/utils/documentBlockHierarchy.js`
- `client/src/utils/documentBlockKeyboard.js`
- `client/src/utils/documentClipboard.js`
- `client/src/utils/documentBulkShare.js`
- `server/lib/documentFileImport.js`
- `server/lib/wolaiMcpImport.js`
- `server/lib/wolaiUrlImport.js`

### 6.11 系统管理

- 用户管理、账户状态、重置密码。
- 小组管理、项目组管理。
- 菜单权限管理。
- 跨团队权限。
- 系统通用配置，含 AI 模型配置和测试。
- 操作日志。
- 敏感模块成员管理。

### 6.12 高管模块

- 经营概览。
- 高级人才。
- 竞品动态。
- 招聘雷达与雷达配置。
- 重点客户。
- 战略月会。
- 经营周会。
- 高管报告。

### 6.13 Android 应用

- Android WebView 容器。
- 登录页、商务移动界面、底部/顶部 shell、路由监听。
- 移动端样式注入和菜单权限适配。
- 目标是用原生壳承载同一套 Web 应用。

## 7. 数据和权限

- 后端除登录接口外，`/api` 基本都需要 JWT 鉴权。
- `canWrite` 控制写权限。
- `adminOnly`、`systemAdminOnly` 控制系统管理。
- `requireExecutive` 控制高管模块。
- `requireOperationalMeetingAccess` 控制经营周会。
- `requireTripCollaborationAccess` 控制出差协同。
- 前端菜单使用 `canAccessMenu`、`canAccessModule`、`canAccessSensitiveModule` 控制入口显示。
- 用户支持多部门、多小组、多项目组。
- 文档中心有文档可见性、共享范围、默认共享、文件夹共享、收藏和置顶逻辑。

## 8. 数据库和存储

- 默认数据库是 SQLite：`server/data.db` 或项目根历史 `data.db`、`relation.db`。
- MySQL 兼容由 `server/lib/database.js` 提供，脚本 `scripts/migrate-sqlite-to-mysql.js` 可迁移。
- OSS 可选；未配置时使用本地上传目录。
- 历史本地 `server/uploads` 文件可迁移到 OSS 的 `uploads/` 前缀，系统有兼容读取。
- 字段级加密说明见 `server/lib/README.md`。

## 9. 开发规范

- 默认在 `main` 上工作，当前远端为 Gitee。
- 拉取代码使用：

```bash
git pull --ff-only origin main
```

- 推送代码使用：

```bash
git push origin main
```

- 提交信息使用中文，格式简洁，例如：`修复文档中心表格选择`、`优化经营周会准备自动保存`。
- 修改前先看 `git status --short --branch`，不要覆盖用户未提交改动。
- 搜索优先用 `rg` 和 `rg --files`。
- 手工修改文件优先用 `apply_patch`。
- 不做无关重构；优先沿用现有页面、API、工具函数和权限模式。
- 前后端字段名优先兼容已有数据库列，新增字段要考虑 SQLite/MySQL 两种运行模式。
- 涉及时间显示时注意 SQLite `CURRENT_TIMESTAMP` 是 UTC，前端要明确按 UTC 或本地时间解析。
- 涉及文档中心时，先确认是否影响块选择、自动保存、实时同步、粘贴、表格、移动端。
- 涉及权限时，同时检查前端菜单入口、页面守卫、后端 API 中间件。
- 涉及附件时，同时检查本地文件、OSS、下载/预览、历史路径兼容。
- 不要提交本地数据库、密钥、`node_modules`、临时文件。

## 10. 验证规范

最小静态检查：

```bash
git diff --check
node --check server/index.js
node --check client/src/pages/Documents.js
```

前端构建：

```bash
cd client
npm run build
```

测试文件较多时优先运行相关测试：

```bash
cd client
npm test -- --watchAll=false
```

后端纯逻辑测试可直接运行对应文件或项目已有测试命令；当前仓库没有统一 `npm test` 根脚本，先检查目标模块测试文件。

文档中心相关建议检查：

- `client/src/components/DocumentBodyEditor.test.js`
- `client/src/utils/documentBodyBlocks.test.js`
- `client/src/utils/documentBlockHierarchy.test.js`
- `client/src/utils/documentBlockKeyboard.test.js`
- `client/src/utils/documentClipboard.test.js`
- `client/src/utils/documentBulkShare.test.js`
- `client/src/utils/documentDefaultShares.test.js`

经营周会相关建议检查：

- `client/src/utils/operationalMeetingAccess.test.js`
- `client/src/utils/operationalMeetingPreparation.test.js`
- `server/lib/operationalMeetingPolicy.test.js`
- `server/lib/operationalMeetingPreparation.test.js`
- `server/lib/operationalMeetingIntegration.test.js`

AI 训练台相关建议检查：

- `server/lib/aiTrainingRuntime.test.js`
- `server/lib/aiTrainingConnectors.test.js`
- `server/lib/aiTrainingEventStream.test.js`

## 11. 高风险区域

- `server/index.js` 体量大，包含 schema、迁移、API、权限和业务逻辑；改动前用 `rg` 定位，不要全局扫读。
- 文档中心块编辑器复杂，任何键盘/粘贴/选区改动都可能影响表格、富文本、多块选择、自动保存。
- MySQL 兼容要求 SQL 不应只按 SQLite 语法思考。
- OSS 和本地附件路径需要双兼容。
- Android WebView 依赖注入 CSS/JS，Web 前端 DOM 结构变化可能影响移动壳。
- 字段加密会影响搜索、排序、WHERE 查询。
- 网络抓包端口和手机代理依赖服务端端口、防火墙和安全组。

## 12. 重要 PRD 和方案文档

- `prd.md`
- `总体设计方案.md`
- `系统需求与权限设计PRD.md`
- `文档中心模块PRD.md`
- `文档中心-数据表格嵌入功能PRD.md`
- `文档中心-TAPD需求导入PRD.md`
- `经营周会模块PRD.md`
- `AI训练台PRD.md`
- `AI训练台前端开发稿.md`
- `AI训练台后端API设计.md`
- `统一蒸馏库设计方案.md`
- `selectedDB接入统一蒸馏库技术方案.md`
- `Wolai文档迁移SOP.md`
- `Chrome自动采集Wolai脚本设计方案.md`
- `出差协同模块PRD.md`
- `手机端任务中心采集入库PRD.md`
- `Android版PRD.md`
- `DEPLOY.md`
- `PRODUCTION_RELEASE_MYSQL.md`

## 13. Commit 记录

当前分支共 280 个 commit。以下记录由 `git log --date=short --pretty=format:'- %h %ad %s'` 生成，截至 `9472ccd`。

- 9472ccd 2026-07-20 优化AI建议
- d0098b3 2026-07-20 文档块能力统一升级
- 5eaf3f7 2026-07-20 周会优化，编辑权限
- 69adbe6 2026-07-19 移除经营周会冗余提示
- 7c6b360 2026-07-19 修复经营周会多块复制
- ceeca16 2026-07-19 支持文档多块全选复制
- c6a30eb 2026-07-19 修复周会准备提交状态回退
- c0f798c 2026-07-19 经营周会细节优化2
- 6d71645 2026-07-19 优化周报细节
- cdb6312 2026-07-18 优化文档共享逻辑
- f743b8c 2026-07-18 优化周会模块
- 65d466d 2026-07-18 优化周报富文本编辑与自动保存
- 1748186 2026-07-18 优化周会准备自动保存和提交状态
- 02c951a 2026-07-18 feat: 经营周会提纲结论支持文档化自动保存
- ba9004f 2026-07-18 蒸馏优化
- f0db6d1 2026-07-18 周会优化
- 1badb68 2026-07-18 修复首页外部字体阻塞导致空白
- 4d7f638 2026-07-18 优化周会准备模板和粘贴格式
- b5bb51f 2026-07-18 优化蒸馏模块，打通chatgpt api调用和skill路由
- 8be4cc5 2026-07-18 周会优化
- 68364fa 2026-07-18 周会模块优化
- 6da16fc 2026-07-18 优化Wolai导入富文本颜色和列表样式
- 2d84fe1 2026-07-17 支持文档图标恢复默认
- c71adf9 2026-07-17 支持按文件夹批量添加文档共享人
- 78e6e28 2026-07-17 优化导入，兼容引入文档场景
- 47a5554 2026-07-17 优化周会模块
- 0d9ba7d 2026-07-17 修复文档块尾Delete合并行为
- 67848cc 2026-07-17 修复文档列表复制粘贴格式
- 39564e6 2026-07-17 修复文档行首Delete误删
- 10312a0 2026-07-17 优化文档折叠列表嵌套
- 00c9e82 2026-07-17 修复 Wolai 数据表格导入漏行校验
- 3638ecb 2026-07-17 优化周会模块
- 700ff45 2026-07-17 修复文档文字样式选区偏移
- 7f4dc26 2026-07-17 Improve document folder creation feedback
- 01f7b4f 2026-07-17 修复文档标签切换内容串页
- f4ee1db 2026-07-17 修复文档富文本样式保存
- 88129a8 2026-07-17 修复经营周会密钥异常导致保存失败
- 4a92303 2026-07-17 支持文档批量追加共享人
- 2847b93 2026-07-17 修复共享文档保存失效
- dce3784 2026-07-17 支小增长AI调优MVP
- 5115498 2026-07-17 增加经营周会模块
- 9fd7a71 2026-07-17 完善文档中心权限与图标导入
- bd7cebb 2026-07-17 优化文档目录标签与文件夹管理
- edb0b64 2026-07-16 优化 Wolai 折叠列表媒体层级
- c3f0d16 2026-07-16 修复 Wolai 导入列表层级与标签关闭性能
- af1451c 2026-07-15 增强富文本粘贴图片嵌入处理
- c0d874e 2026-07-15 修复文档中心粘贴图片转存
- 7016a28 2026-07-15 优化文档中心富文本图片粘贴
- 8c79073 2026-07-15 修复 Wolai 私有表格导入显示
- 073b53d 2026-07-15 修复文档数据表格嵌入交互与 Wolai 导入
- c3c5e7d 2026-07-15 新增 TAPD 导入 Relation 文档技能
- 09fdd17 2026-07-15 修复数据表格编辑按键误删
- 57ba0d9 2026-07-15 新增文档中心 TAPD 需求导入 PRD
- c051007 2026-07-15 修复 Wolai 数据表格嵌入导入
- 083eb8a 2026-07-15 完善文档中心数据表格嵌入功能
- aa6e354 2026-07-15 优化文档中心目录树样式
- ba96536 2026-07-15 优化 Wolai MCP 折叠与样式导入
- ce07759 2026-07-15 支持文档中心嵌入数据表格导入
- a52b0c2 2026-07-14 优化文档目录同步启动性能
- 94ac6e7 2026-07-14 修复文档创建导入目录归属
- c3cc3e1 2026-07-14 支持文档列表宽度拖拽调整
- 6f4b13c 2026-07-14 修复文档中心搜索报错
- 2b8871b 2026-07-14 支持用户多部门多小组多项目组
- 6fba462 2026-07-14 优化 Wolai 导入图片布局和视频预览
- 9a65747 2026-07-14 修复大文档保存请求过大问题
- 79bd497 2026-07-14 优化 MySQL 模式接口响应性能
- 8e0e6e0 2026-07-14 修复 Wolai MCP 表格和折叠列表导入
- d1ab936 2026-07-13 fix: 过滤 Wolai 题头封面图导入
- 864a180 2026-07-13 fix: 完善 Wolai MCP 图片内嵌导入
- 7fc9199 2026-07-13 fix: 文档中心列表仅展示收藏文档
- 381b59b 2026-07-13 fix: 修复 Wolai MCP 图片导入显示
- e777290 2026-07-13 补充网络抓包端口部署配置
- a937e3f 2026-07-13 优化网络抓包连通性诊断
- 86ba55c 2026-07-13 修复文档目录迁移 MySQL 删除兼容
- 109efb8 2026-07-13 优化文档中心目录结构和权限
- cc8a211 2026-07-13 优化 Wolai MCP 导入图片和附件展示
- f9469ab 2026-07-13 feat: 兼容历史上传文件从 OSS 读取
- 005e83f 2026-07-13 chore: 更新生产环境 MySQL 与 OSS 配置说明
- 81850d7 2026-07-11 feat: 支持 MySQL 运行兼容与任务指派修复
- 13802a7 2026-07-10 feat: 支持附件上传至 OSS
- 131bc7d 2026-07-10 修复文档中心空白页问题
- 8ab94ef 2026-07-10 优化文档中心目录空间层级展示
- c29912b 2026-07-10 修复 Wolai MCP 导入多级内容不完整
- 02bc50f 2026-07-10 fix company research access inheritance
- 50e229f 2026-07-07 修复 Wolai MCP 导入缺失子级内容
- 0c011cf 2026-07-07 修复 Wolai MCP 导入标题和样式错位
- 0e608c5 2026-07-07 优化 Wolai MCP 导入原文格式解析
- e5f9bc4 2026-07-07 feat: 迁移模型设置到系统通用配置
- 4206023 2026-07-07 修复 Wolai MCP 导入错误提示入正文
- 4cc61d4 2026-07-07 修复 Wolai MCP 导入误用搜索结果
- 8d3885a 2026-07-07 支持AI训练台本地事实明细回答
- bfe6e56 2026-07-07 支持通过 Wolai MCP 导入文档
- f574b97 2026-07-07 fix: 解析本地文件导入为文档内容
- 8538684 2026-07-07 fix: 接入公司 AI 网关默认配置
- 471150b 2026-07-07 fix: 为 Wolai 导入增加 xvfb 浏览器兜底
- 7f08d6b 2026-07-07 fix: 增强 Wolai 导入 Chromium 启动兼容性
- 49b9622 2026-07-07 优化出差协同日程卡片适配
- 68d0155 2026-07-07 支持文档标签页右键关闭菜单
- ea91f04 2026-07-07 优化顶部标签右键关闭选项
- 43bd416 2026-07-07 支持顶部标签右键关闭菜单
- a8d7b33 2026-07-07 fix: 优化AI模型连接失败提示
- 6520aa5 2026-07-07 feat: 支持文档中心通用导入
- 9171640 2026-07-07 feat: 支持AI训练台个人模型Key配置
- f941e93 2026-07-07 fix: 在镜像中提供 Wolai 导入浏览器
- f9dcfa1 2026-07-07 fix: 自动渲染采集 Wolai URL 内容
- 8976d62 2026-07-07 feat: 优化AI训练台模型运行体验
- 04619a4 2026-07-07 feat: 支持从 URL 更新导入 Wolai 文档
- 8f548a9 2026-07-07 fix: 优化 Wolai URL 导入采集
- 105afd2 2026-07-07 fix: 修复AI训练台新建会话报错
- 28b94d4 2026-07-07 chore: 调整文档中心和 Agent 菜单
- a3e5df3 2026-07-07 feat: 接通AI训练台Skill会话与发布链路
- d782783 2026-07-07 fix: 补齐 AI 训练运行时模块
- 63f65da 2026-07-07 feat: 支持从 Wolai URL 导入文档
- 03a75d0 2026-07-07 feat: 新增AI训练台与蒸馏方案
- 2dc93b3 2026-07-06 fix: 修复首页白屏问题
- 2f8fe52 2026-07-06 feat: 新增AI建议快照与Agent中台
- fd744ff 2026-07-06 fix: 优化文档中心粘贴和表格编辑
- cfa42f7 2026-07-06 feat: 增加出差协同模块
- 08522f3 2026-07-03 优化文档列表辅助线对齐
- 843aa67 2026-07-02 放开文档页面设置共享编辑权限
- 5ac7f7a 2026-07-01 精简文档共享人员名称展示
- 8adf9b5 2026-07-01 调整文档中心目录分组顺序
- 8353c3f 2026-07-01 放开文档共享范围追加权限
- 453b019 2026-06-30 精简工作台顶部统计方块
- 9c32705 2026-06-30 优化公司管理分页展示体验
- 89d6be2 2026-06-30 优化文档实时同步体验并降低轮询开销
- 5a922e0 2026-06-29 修复文档表格块导致的页面白屏
- 5e3d2ce 2026-06-29 修复文档收藏打开空白与共享文档置顶异常
- 5612465 2026-06-29 修复文档置顶字段迁移启动报错
- 781c3e3 2026-06-29 支持文档中心文档置顶
- 32ec394 2026-06-29 支持人脉资料附件
- 3b4a1c0 2026-06-29 支持文档中心全局搜索
- 30012e3 2026-06-29 统一文档中心表格首行交互逻辑
- c758b10 2026-06-29 修复文档中心表格首行删除异常
- bff874f 2026-06-29 支持文档中心表格合并单元格
- d5372df 2026-06-29 fix: truncate company list columns
- 600f1c6 2026-06-29 支持公司业务备注富文本
- 15f00b8 2026-06-26 优化列表块选中背景样式
- 534f72c 2026-06-26 修正折叠列表 wolai 图标样式
- 39da322 2026-06-26 校准折叠列表箭头和字号
- 3292847 2026-06-26 优化折叠列表 wolai 风格细节
- 60f81de 2026-06-26 优化数字和折叠列表样式细节
- d8de831 2026-06-26 微调文档列表行距细节
- 4f89164 2026-06-26 调整文档列表字号与图标大小
- d819e5e 2026-06-26 优化文档中心列表样式贴近 wolai
- f6e7819 2026-06-26 支持人脉备注富文本
- 40b55cd 2026-06-26 优化文档中心多人编辑自动同步
- 5bd8746 2026-06-26 优化文档表格单元格删除体验
- ccb598e 2026-06-26 优化刷新后左侧菜单状态保持
- 77eb39f 2026-06-26 优化文档中心目录收起状态记忆
- 61bcde8 2026-06-26 优化文档中心标签去重
- b2da6f8 2026-06-26 优化文档中心列表头部固定
- d8fb36b 2026-06-26 优化文档中心表格批量删除
- 3a6d78b 2026-06-26 优化文档中心头部标签布局
- 80ca70a 2026-06-26 fix: extend document list depth to 10 levels
- f62eddd 2026-06-26 fix: support deleting selected document block
- ea22f84 2026-06-24 调整手机采集到常用工具菜单
- 0a7bf1c 2026-06-24 优化文档中心表格块选择复制体验
- 65cab2c 2026-06-24 修复工作台任务描述跨列显示
- ee8e94d 2026-06-24 优化工作台任务描述单行显示
- 59ce5a9 2026-06-24 优化文档中心空行添加按钮显示
- 89c1af9 2026-06-24 调整工作台任务状态列位置
- 35fb7d7 2026-06-24 Improve document table copy and insertion
- e4d56e1 2026-06-23 Update permissions PRD
- cf1d66d 2026-06-23 Allow commercial leaders to view operation team goals
- fffe470 2026-06-23 Add rich table editing to goals and weekly reports
- e58ac9c 2026-06-22 修复文档表格竖向单元格拖选
- 01a1d46 2026-06-22 修复文档表格单元格单击误弹菜单
- 7768d82 2026-06-19 Add user account recovery status
- dfdc129 2026-06-18 Show document attachment upload progress
- 0a7d1de 2026-06-18 Restrict document visibility to owners
- 913f8a4 2026-06-18 Expand document attachment file types
- c7d303a 2026-06-18 Fix document attachment migration order
- 39000cc 2026-06-18 Add document attachment blocks
- 1dd0688 2026-06-18 Protect executive self-assigned tasks
- 9b34532 2026-06-17 简化产品名称列展示
- d7563af 2026-06-17 调整产品主体标签展示位置
- 92eb88d 2026-06-17 优化公司研究全部产品搜索
- 553e604 2026-06-17 修正工作台今日任务统计口径
- 65a6d02 2026-06-17 优化公司研究产品主体标签展示
- b3009ec 2026-06-16 优化文档中心共享用户编辑权限
- f99706b 2026-06-16 fix: merge document blocks at line start
- 612444c 2026-06-16 修复文档中心快捷撤销需按两次的问题
- f90e005 2026-06-16 fix: sync document editor after undo
- 137b093 2026-06-16 fix: split document rich text blocks on enter
- c3efd4b 2026-06-16 fix: show subject on company product cards
- 0268930 2026-06-16 fix: preserve document rich text cursor during input
- 1c8ed22 2026-06-16 feat: add workspace tabs to app header
- de6e298 2026-06-16 Add network capture tool
- 02174f3 2026-06-16 Restore executive route guard helper
- cc58d4b 2026-06-16 Remove executive menu from sidebar
- 31585e9 2026-06-15 完善文档中心富文本工具栏和右键菜单体验
- 006a817 2026-06-15 优化文档中心行内工具栏和评论功能
- d41a4cf 2026-06-15 优化文档中心列表默认输入体验
- 3a310a4 2026-06-15 优化文档中心中文输入法回车体验
- 83ffe33 2026-06-12 补充公司研究产品列表联系方式和域名
- 1e6eae2 2026-06-11 修复文档表格菜单外部点击关闭
- 8456f47 2026-06-11 优化文档中心表格操作菜单
- 69e1bf9 2026-06-11 优化文档中心截图粘贴展示
- ebecabe 2026-06-11 增强文档中心普通表格编辑能力
- a141364 2026-06-05 支持文档标题目录按钮切换
- af186f3 2026-06-05 调整文档标题目录对齐
- edafcd0 2026-06-05 修复文档中心目录按钮点击
- 832a14a 2026-06-05 修复安卓端登录页加载中断
- 8ca02b1 2026-06-05 启用文档目录右键菜单
- 54ea571 2026-06-05 调整文档中心块控制栏布局
- 7e90f9d 2026-06-05 优化安卓端登录与页面展示
- b08bf6e 2026-06-05 修复文档中心块样式菜单交互
- 0a69ac2 2026-06-05 修复文档编辑记录时间显示
- 341ff6e 2026-06-05 修复安卓端打开空白页问题
- 64f15e9 2026-06-05 优化安卓端移动界面体验
- b9ca8b7 2026-06-05 优化文档中心多块样式转换
- d931900 2026-06-04 修复文档中心块菜单显示样式
- 945388b 2026-06-04 移除文档中心编辑页保存按钮
- d8afa3c 2026-06-04 恢复文档中心保存按钮
- d666497 2026-06-04 移除文档中心保存按钮
- 7eec7b8 2026-06-04 修复文档中心块控制按钮显示
- 33eb84b 2026-06-04 优化文档中心添加按钮对齐
- e041e24 2026-06-04 完善文档中心自动保存
- 7aca752 2026-06-04 优化文档中心代码块复制体验
- 6d36869 2026-06-04 修复文档中心最后编辑时间显示
- 5df188b 2026-06-04 统一商机列表人员列字体样式
- 27001e8 2026-06-04 统一商机列表操作按钮样式
- 2838505 2026-06-04 统一商机策略需求统计卡片样式
- 989200b 2026-06-04 增加公司主体地址字段
- 7ac43f2 2026-06-04 增加主体社保人数和软著数量字段
- a698a9d 2026-06-04 增加公司主体成立日期字段
- c0de061 2026-06-04 调整主体联系电话列为普通滚动列
- 9e356b4 2026-06-04 显示公司研究主体联系电话列
- a999eb5 2026-06-04 完善公司研究主体字段和管理列表
- 603c7ba 2026-06-04 统一商机列表任务表格风格
- e2c9773 2026-06-04 统一商机策略需求列表样式
- 30cd997 2026-06-04 调整公司研究产品列表操作
- 4ddb940 2026-06-04 优化今日完成鼓励图标
- 6a4809b 2026-06-04 调整工作台任务统计图标
- 9c2236b 2026-06-04 修复工作台内容宽度铺满
- 94bb07b 2026-06-04 移除工作台任务预估工时字段
- bdcedb2 2026-06-04 Fix dashboard content width
- 0e86ada 2026-06-04 完善任务预估信息前端展示
- 82b8a91 2026-06-04 补充任务预估信息字段
- bb3ea90 2026-06-04 修复工作台Web端横向溢出
- 3609c9d 2026-06-04 调整工作台统计卡一行展示
- e20e9ec 2026-06-04 新增工作台今日已完成统计卡
- 42c61a9 2026-06-04 新增工作台本月任务统计卡
- 5cbe58c 2026-06-04 调整工作台任务统计卡样式
- 82294b5 2026-06-04 优化工作台任务展示与完成流程
- 411429e 2026-06-04 修复文档中心多选批量转换
- 7955139 2026-06-04 优化文档中心多选块柄显示
- 92b97cb 2026-06-04 修复文档中心多块列表转换
- 44124cc 2026-06-03 优化文档中心编辑区多块选择
- da7a7ef 2026-06-03 优化文档中心选中文本评论功能
- dd537ae 2026-06-03 修复公司研究产品列表默认排序
- 86ca412 2026-06-03 调整文档属性编辑入口为右键菜单
- b3c52bd 2026-06-03 支持修改文档中心文档类型
- 7b07749 2026-06-03 Merge pull request #1 from hausenchan/codex/document-block-multi-select
- 0e1a235 2026-06-03 优化文档中心多块选择操作
- dc97b20 2026-06-03 支持文档中心离开自动保存和快捷键保存
- 9c7a39d 2026-06-03 按权限控制安卓端人脉标签
- 2b587ae 2026-06-03 修复切换用户后停留菜单权限页问题
- dd72e69 2026-06-03 优化安卓端微信风格界面
- ee02723 2026-06-03 支持文档中心多块批量操作
- 1a9f922 2026-06-03 优化文档中心块批量选择和列表展示
- f5d461a 2026-06-03 修复安卓端商机页路由
- 0756235 2026-06-03 设置文档中心默认满屏宽度
- ee9d49b 2026-06-03 修复安卓端登录和商机页空白
- a9aaa28 2026-06-03 修复文档中心块菜单显示问题
- b7a216b 2026-06-03 适配文档中心手机端体验
- 84cb0db 2026-06-03 完善安卓端菜单功能
- 9d8457a 2026-06-03 修复工作台手机端新建任务无响应
- 0a03ff5 2026-06-02 完善文档中心块操作菜单
- 17ab52b 2026-06-02 开发安卓端商务移动应用
- 4c741c2 2026-06-02 新增公司研究产品视图
- 61e89ac 2026-06-02 移除文档中心重复复制链接入口
- 23811c6 2026-06-02 修复文档中心折叠菜单留白过大
- c19e5ab 2026-06-02 新增Android端规划与构建忽略配置
- 4e0ec73 2026-06-02 修复商机跟进任务权限校验
- 86eb609 2026-06-01 统一人脉商务字段多选交互
- cf91888 2026-06-01 新增人脉商务字段筛选
- 51ea558 2026-05-31 修复添加人脉缺少商务字段
- 1672ce9 2026-05-30 fix: 优化登录重定向与文档分享链接体验
