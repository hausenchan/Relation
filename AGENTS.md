# Relation 项目开发指南

本文件是仓库级长期上下文。开始任何开发任务前，先读本文件，再读根目录
`handoff.md`。长期稳定的产品约束写在这里，临时进度、未完成项和验证结果只写在
`handoff.md`。

## 1. 信息读取顺序

1. `AGENTS.md`：架构、功能地图、耦合点、开发与提交约束。
2. `handoff.md`：当前任务、未完成项、测试状态、工作区注意事项。
3. 与需求直接相关的 PRD：
   - 全局权限：`系统需求与权限设计PRD.md`
   - 文档中心：`文档中心模块PRD.md`
   - 目标：`目标模块PRD.md`
   - 经营周会：`经营周会模块PRD.md`
   - 其他模块：根目录对应的 `*PRD.md` 或设计方案。
4. 代码与测试是当前实现的最终依据。旧 PRD 可能落后，发现差异时同时更新文档。

不要在代码、测试、文档、提交信息或日志中写入生产 Token、密码、密钥或真实凭据。

## 2. 项目概览

- 产品：幂动增长中台，覆盖目标计划、业务流转、资产、商务协作、团队和公司经营。
- 前端：React 18、Create React App、Ant Design 5、React Router 6、Axios。
- 后端：Node.js、Express 5，主体接口集中在 `server/index.js`。
- 数据库：本地默认 SQLite；生产可通过 `DB_CLIENT=mysql` 使用 MySQL，统一适配在
  `server/lib/database.js`。
- 附件：本地 `server/uploads` 或阿里云 OSS，适配在 `server/lib/ossStorage.js`。
- 默认端口：前端 `3000`，后端 `3001`，网络抓包服务 `8888`。
- 主要入口：`client/src/App.js`、`client/src/api/index.js`、`server/index.js`。

常用命令：

```bash
npm run dev
npm run server
npm run client
cd client && CI=true npx react-scripts test --watchAll=false --runInBand
cd client && BUILD_PATH=/tmp/relation-build npm run build
node --test server/lib/*.test.js
node --check server/index.js
```

验证数据库初始化时必须使用临时库，不得改动仓库中的业务数据库：

```bash
RELATION_DB_PATH=/tmp/relation-test.db NODE_ENV=test PORT=3101 node server/index.js
```

## 3. 功能地图

### 3.1 工作台

- 路由：`/`，主要代码：`client/src/pages/Dashboard.js`。
- 统计概览、任务创建与状态流转、我执行/我指派/我关注/团队任务、提醒和最近互动。
- AI 建议只对 CEO、COO、CTO、CMO 展示；前后端权限必须同时限制。
- 普通任务、待跟进任务、关注和共享会汇聚到工作台，修改任务口径时需联查这些来源。

### 3.2 目标计划

- 目标管理 `/goals`：目标层级、负责人、部门/业务线/岗位、周期、进度、结果、筛选。
- 周报管理 `/weekly-reports`：周范围、本周完成、下周计划、风险问题、提交状态与权限。
- 经营周会 `/executive/operational`：周记录、准备/会议页签、准备人员、AI 提纲、会议结论、
  年度汇总。
- 三个模块的正文统一采用块编辑器，支持自动保存、手动保存、历史版本和多人更新。

### 3.3 业务流转与 Agent

- 商机/线索 `/leads`：来源、状态、负责人、优先级及后续策略。
- 策略 `/strategies`：变现/流量/链路策略，关联线索和需求。
- 需求 `/dev-tasks`：研发任务、状态、优先级、工时和来源。
- 主链路：`线索 -> 策略 -> 需求`，删除或改权限时必须检查上下游引用。
- Agent 中台 `/agents`、AI 训练台 `/agents/ai-training`：会话、消息、反馈、案例沉淀、
  连接器和模型配置。

### 3.4 资产与知识

- 主体管理 `/company-subjects`：公司主体及导入。
- 产品资产 `/product-assets`：产品资料、状态、核减和批量导入。
- 产品模版 `/product-templates`：产品模板入口与配置。
- 文档中心 `/documents`：文件夹树、多标签、块编辑、表格、图片/附件、共享、Wolai/TAPD
  导入、历史、多人更新、收藏和搜索。
- 网络抓包 `/network-capture`：采集与入库辅助能力。

### 3.5 商务协作

- 人脉 `/persons`：圈子、关系类型、人才字段、标签、附件上传/预览/下载、指派和导入。
- 互动 `/interactions`：拜访/通话/微信等记录，可衍生提醒和待跟进任务。
- 提醒 `/reminders`：日期、类型、完成状态。
- 公司研究 `/companies`：公司信息、主体、人员架构、产品矩阵和公司动向。
- 待跟进 `/follow-up-tasks`：由商机/互动产生并回流工作台。

### 3.6 团队协作

- 我的任务 `/my-tasks`、任务看板 `/task-board`。
- 客户答谢 `/gift-plans`、审核记录 `/gift-review`、礼品库 `/gifts`。
- 出差申请 `/trips`、出差协同 `/trip-collaboration`、费用统计 `/trip-stats`。
- 预算 `/budgets`。

### 3.7 公司经营

- 经营概览 `/executive`、高级人才 `/executive/talents`、竞品动态
  `/executive/dynamics`、重点客户 `/executive/customers`。
- 战略月会 `/executive/strategic`。
- 经营周会 `/executive/operational` 及详情路由 `/executive/operational/:meetingId`。
- 招聘雷达 `/executive/recruit-radar` 和配置页。

### 3.8 系统管理

- 用户、小组、项目组、通用配置、菜单权限、跨团队权限、敏感模块成员、操作日志、
  手机采集。
- 前端菜单隐藏不能替代后端鉴权。新增接口必须应用对应的认证、菜单、模块、读写和
  数据范围检查。

## 4. 权限与安全不变量

### 4.1 通用权限

- 身份来源同时考虑 `role` 与 `executive_role`；不要在新代码中另造一套角色判断。
- 非管理员先经过菜单授权，再按模块和数据范围授权。
- `readonly`、`guest` 不得通过直接调用 API 获得写权限。
- 小组、负责人、共享人、跨团队授权是不同维度，不能用前端过滤代替 SQL/API 过滤。
- 任何详情、历史、附件和导出接口都要复用与列表一致的数据可见性规则。

### 4.2 经营周会

- 两道入口门：经营周会菜单权限 + `operational_meeting` 敏感模块成员权限。
- 通过两道门的用户均可看到周会记录和会议页签。
- CXO 可查看、编辑所有准备人的内容并管理准备人员。
- 被指定准备人只可查看、编辑自己的准备内容，看不到 CXO 或其他人的准备内容。
- 未被指定为准备人的普通授权用户不显示准备页签和提交进度。
- 会议提纲、会议结论对通过两道门且具备写角色的用户可见、可编辑；
  `readonly/guest` 只读。
- AI 生成提纲只允许 CXO；输出不得披露业务毛利数据。
- 权限策略集中在 `server/lib/operationalMeetingPolicy.js`，不要在路由中复制角色分支。

### 4.3 加密边界

- 当前字段级 AES-GCM 配置在 `server/lib/encryptedFields.js`，密钥加载在
  `server/lib/crypto.js`。
- 当前服务端加密不等于端到端加密，拥有运行密钥的运维仍可能解密；不得在产品文案中
  声称已实现“运维不可见”。
- 状态、外键、排序/筛选字段不得随意加密；敏感正文和历史快照必须走统一加解密助手。
- 密钥文件、`.secrets`、数据库、附件和真实数据均不得提交 Git。

## 5. 文档编辑能力及耦合点

### 5.1 统一数据格式

- 非文档中心模块统一使用 `relation_document_blocks_v1`，工具位于
  `client/src/utils/documentBodyBlocks.js`。
- 可复用编辑器是 `client/src/components/DocumentBodyEditor.js`。
- 目标、周报、经营周会不得重新实现另一套 contenteditable、粘贴、撤销或多块复制逻辑。
- 文档中心的完整编辑器仍内嵌在 `client/src/pages/Documents.js`，与共享编辑器存在并行
  实现；改键盘或剪贴板行为时必须同时核对两边并补回归测试。

### 5.2 编辑行为不变量

- 块内普通多行文字/HTML 粘贴到当前块，保留换行和内联格式。
- 结构化列表、折叠列表等可按块导入，层级和缩进不得丢失。
- 块内 Backspace/Delete 默认只删除一个字符。
- 光标位于行首按 Backspace 时，当前行合并到上一行末尾；行尾 Delete 对称合并下一行。
- `Ctrl/Cmd+A` 支持编辑区全选；鼠标可跨块选中；`Ctrl/Cmd+C` 保留可再次粘贴的结构。
- `Ctrl/Cmd+Z` 使用编辑器历史回退；`Ctrl/Cmd+S` 保存并阻止浏览器默认行为。
- 键盘事件处理必须忽略输入框、表格单元格、弹窗和其他独立 contenteditable 区域。

### 5.3 保存、协作与历史

- 自动保存采用防抖；“完成”、提交、关闭、切换记录和恢复历史前必须等待当前保存完成。
- 大正文接口和 MySQL 字段须支持 `LONGTEXT`；Express JSON 上限由
  `RELATION_JSON_BODY_LIMIT` 控制。
- 目标、周报、经营周会保存携带 `base_updated_at`。服务端发现基线过期返回
  `409 CONTENT_CONFLICT` 和最新内容。
- 客户端按稳定块 ID 做三方合并：基线、本地草稿、远端最新。不同块自动合并；同块冲突
  保留本地并提示用户。
- 可见页面每 5 秒拉取一次更新，后台轮询错误保持静默，恢复可见时立即同步。
- 通用历史表为 `content_revisions`，键为 `entity_type + entity_id + scope_key`；快照加密、
  去重并限制大小。恢复历史前先保存当前草稿，恢复动作本身再生成新版本。
- 经营周会历史 scope：准备 `section:<id>`、会议提纲 `agenda`、会议结论 `decision`。

### 5.4 高风险耦合矩阵

| 修改位置 | 必须联查 |
| --- | --- |
| `DocumentBodyEditor.js` | 目标、周报、经营周会；粘贴、删除、多选、撤销和保存测试 |
| `documentBodyBlocks.js` | 历史数据兼容、Wolai 导入、签名、纯文本转换、AI 输入 |
| `Documents.js` 编辑行为 | 共享编辑器是否也需同步；文档表格/附件是否使用独立事件链 |
| `collaborativeDocument.js` | 稳定块 ID、删除冲突、顺序合并、三模块 409 重试 |
| `content_revisions` | `encryptedFields.js`、SQLite/MySQL schema、恢复权限、删除级联 |
| 目标/周报字段 | 权限 SQL、列表筛选、工作台汇总、加密字段、MySQL `LONGTEXT` |
| 经营周会参与人 | 两道门、准备可见性、提交统计、AI 输入、年度汇总 |
| `App.js` 菜单/路由 | `MenuPerms.js` 菜单树、后端菜单 key、工作区标签标题 |
| 附件路径 | 本地与 OSS 兼容、权限、预览、下载、删除、历史迁移 |

## 6. 数据库与 API 约束

- 所有 SQL 必须通过 `server/lib/database.js` 同时兼容 SQLite 与 MySQL。
- 使用参数化查询；禁止拼接用户输入。动态 SQL 仅允许受控列名/固定片段。
- 新表、列和索引要支持旧库增量启动；MySQL 大正文用现有 `ensureMysqlLongTextColumn`。
- 不得依赖 SQLite 隐式类型、秒级时间戳或仅 SQLite 支持的语法而不经过适配层。
- 协作字段使用同一请求产生的 ISO 时间戳，不能随后被 `CURRENT_TIMESTAMP` 覆盖。
- API 错误需有明确状态码：参数 `400`、无认证 `401`、无权限 `403`、不存在 `404`、
  冲突 `409`、正文过大 `413`、服务错误 `500`。
- 自动保存 API 应返回完整或足够更新基线的记录，至少包含 `id`、`updated_at`。
- 删除主数据时同步处理历史、共享、附件及关联记录，且先做权限检查。

## 7. 前端规范

- 沿用现有 Ant Design 组件、字号、间距和响应式 `Grid.useBreakpoint()`。
- 图标优先使用 `@ant-design/icons`，按钮文案保持明确。
- 不把页面区块层层套卡片；详情页编辑区域优先复用现有文档体验。
- 状态文案与实际业务状态一致，例如准备内容使用“未提交/已提交”，不混用“未填写”。
- 所有保存流程均展示 `dirty/saving/saved/error`，错误后可重试，不能静默丢内容。
- 前端权限只负责体验；服务端必须独立拒绝越权请求。

## 8. 开发流程

1. 运行 `git status --short --branch`，识别并保留其他会话/用户改动。
2. 读 `handoff.md` 和目标模块 PRD，搜索现有实现、API、权限和测试。
3. 先改共享层，再改调用页；避免复制实现。
4. 每个缺陷至少补一条能在修复前失败的回归测试。共享行为覆盖所有调用模块。
5. 先跑目标测试和 `node --check`，再跑前端全量测试、后端测试、隔离生产构建。
6. 涉及 schema 时用 `/tmp` 临时数据库启动服务；涉及 UI 时用浏览器走核心路径。
7. 完成后更新 `handoff.md`，列出验证结果和遗留风险。
8. 只精确暂存本任务文件，审查 `git diff --cached --check` 与
   `git diff --cached --stat` 后提交。

## 9. 测试矩阵

最低要求：

- 编辑器：单字符删除、行首合并、同块多行粘贴、结构化列表粘贴、多块复制、快捷键。
- 自动保存：小内容、大内容、连续输入、保存中再次输入、手动完成、网络失败重试。
- 协作：两端改不同块、同块冲突、远端删除、本地新增、隐藏/恢复页面。
- 历史：初始版本、重复内容去重、保存版本、权限隔离、恢复后再生成版本。
- 权限：管理员/CXO、普通指定人、非准备人、readonly/guest、无菜单、无敏感权限。
- 数据库：空库初始化、旧库增量、SQLite、涉及方言的 MySQL 路径。
- 构建：使用 `/tmp` 下的 `BUILD_PATH`，不要覆盖已跟踪的 `client/build`。

## 10. Git 与提交清单

- 主交付远端为 `gitee`，目标分支通常为 `main`；除非用户明确要求，不推 `origin`。
- 不提交：`data.db`、`data-local.db*`、真实附件、`.secrets`、临时日志、测试输出。
- `client/build` 是生成物，只有发布流程明确要求时才提交。
- 工作区可能有其他任务改动；禁止 `git reset --hard`、整目录暂存或回退陌生修改。
- 提交前清单：
  - 需求逐项完成，权限在前后端一致。
  - 自动保存不会在关闭/完成时丢失最后一次输入。
  - schema 同时兼容 SQLite/MySQL。
  - 目标测试、全量测试、构建和临时库启动通过。
  - `git diff --cached` 仅包含本任务文件，无凭据、数据库和构建产物。
  - Commit 文案严格使用用户指定文本。
  - 推送后用 `git ls-remote gitee refs/heads/main` 核对远端哈希。

近期关键提交（用于快速定位历史行为）：

| Commit | 内容 |
| --- | --- |
| `3682008` | 新增产品模版入口 |
| `9472ccd` | 优化工作台 AI 建议权限 |
| `d0098b3` | 文档块能力统一升级 |
| `5eaf3f7` | 周会会议内容编辑权限 |
| `7c6b360` | 经营周会多块复制 |
| `ceeca16` | 文档多块全选复制 |
| `c6a30eb` | 修复经营周会准备提交状态回退 |
| `c0f798c` | 经营周会普通授权用户可见性 |
| `65d466d` | 周报富文本与自动保存 |
| `02c951a` | 周会提纲/结论文档化自动保存 |

## 11. 当前架构债务

- `server/index.js` 和 `Documents.js` 体积很大。修改应保持局部，新增复杂能力优先抽到
  `server/lib`、`client/src/components` 或 `client/src/utils` 并加测试。
- 文档中心完整编辑器与 `DocumentBodyEditor` 仍有双实现，键盘/剪贴板行为容易漂移。
- 当前服务端字段加密尚未满足“持有服务器与密钥的运维不可见”的端到端安全目标。
- PRD 中部分安全等级与恢复方案属于规划，不得误判为已经上线。
