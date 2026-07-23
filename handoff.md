# 开发交接

最后更新：2026-07-23

## 当前任务

状态：全系统编辑时间统一修复已完成，待提交推送 `gitee/main`。

目标：修复媒体管理、文档中心及其他模块中显式 ISO 时间比 MySQL `CURRENT_TIMESTAMP` 少 8 小时的
混合写入问题，统一业务时区，并安全校正有审计证据的历史错误时间。

## 经营周会 AI 会前提纲 v2（2026-07-23）

### 已完成

- “生成提纲 / 重新生成提纲”改为使用完整经营分析提示词，模型返回受控语义 JSON；服务端校验
  4 项会议目标、5-8 项决策议题、120-150 分钟议程和 5-8 项会前问题后，再转换为
  `relation_document_blocks_v1`。
- 输出只保留“经营周会会前提纲”主标题、固定开场语、六段正文和固定结束语；不生成顶部眉题、
  副标题、材料来源、数据口径、会议重点、敏感数据说明、数据说明、封面或导读。
- 六段标题、业务模块、决策议题和段内标签使用 `heading1` 至 `heading4`；所有分点使用真实
  `bullet/numbered` 块，可直接在会议页签的 `DocumentBodyEditor` 中继续编辑。
- 生成接口不再采信浏览器提交的 `sections`，按选中会议 ID 读取已提交准备块；必填准备未全部提交
  返回 `409 PREPARATION_INCOMPLETE`；模型返回前及生成结果保存时均复核 `source_hash`，准备内容变化
  返回 `409 PREPARATION_CHANGED`。
- 重新生成前提示覆盖，先保存当前未保存提纲；模型不可用时不以规则兜底覆盖已有提纲。
- 输入和输出继续执行敏感信息扫描，会议提纲保存接口也独立拒绝毛利、利润和毛利率类内容。
- 旧六字段提纲继续由前端兼容转换，新生成记录使用提示词版本
  `operational-meeting-agenda-v2`，无需数据库迁移。

### 已验证

- `node --test server/lib/operationalMeetingAgenda.test.js` 通过，8/8；包含历史折叠正文和旧
  `questions[]` 准备格式兼容。
- `node --test server/lib/operationalMeetingIntegration.test.js` 通过，1/1；覆盖权限、必填准备门禁、
  服务端会议数据源、原生列表块和敏感提纲保存阻断。
- `node --check server/lib/operationalMeetingAgenda.js`、`node --check server/index.js` 通过。
- 前端全量测试通过，23 个套件、122 条测试全部通过。
- 后端全量测试通过，100 条通过，3 条显式 MySQL 环境测试按开关跳过。
- `BUILD_PATH=/tmp/relation-operational-agenda-build npm run build` 通过；首屏 JS 335.81KB gzip，
  最大异步 chunk 430.88KB gzip，仍满足性能预算。
- `BUILD_PATH=/tmp/relation-operational-agenda-build npm run performance:frontend` 通过；门禁口径下
  首屏 JS 327.9KB gzip、75 个异步 chunk、最大异步 chunk 420.8KB gzip。

## 全系统业务时间统一（2026-07-23）

### 根因

- MySQL `CURRENT_TIMESTAMP` 使用服务器本地时间，但 `server/lib/database.js` 将
  `new Date().toISOString()` 去掉 `Z` 后原样写入 `DATETIME`，把 UTC 钟面误当北京时间存储。
- 同一张表中因此混有正确的本地时间和少 8 小时的 UTC 时间：媒体新增记录通常正确，编辑记录、
  文档自动保存、目标、周报和经营周会等显式更新时间会显示为凌晨。
- 文档中心还单独把所有无时区数据库值当 UTC 解析，导致默认时间与显式时间的展示规则继续分裂。

### 已完成

- 新增 `server/lib/businessTime.js`：统一解析 `MYSQL_TIMEZONE`，默认 `+08:00`；`Date` 和带
  `Z`/偏移的 ISO 时间先转换为业务本地时间再写入 MySQL，无时区值保持原业务钟面。
- `mysql2SyncWorker` 建立连接后显式执行 `SET time_zone`，保证 `NOW()`、
  `CURRENT_TIMESTAMP` 和显式参数不再受 MySQL 主机全局时区影响。
- 修复在线表格 `nextDocumentUpdatedAt` 的单调递增计算：无时区 MySQL 时间按配置时区还原为绝对
  时间，避免统一写入层后再次多加 8 小时。
- 新增一次性迁移 `business-time-explicit-utc-to-local-v1`，记录在 `relation_migrations`；仅当
  编辑记录、内容版本或操作日志与业务记录相差 7-9 小时时，才校正媒体、文档、目标、周报、
  经营周会、任务、待跟进任务和手机采集时间，正确记录保持不变，重复启动不重复执行。
- 新增 `client/src/utils/businessTime.js`，统一处理无时区数据库时间和带时区实时事件；媒体管理、
  文档中心、操作日志、系统设置、主体管理、网络抓包、Agent、AI 训练台和手机采集已切换到共享
  格式化工具。文档中心移除“所有无时区时间都是 UTC”的旧兼容分支。
- 全仓检查其余时间展示：目标、周报、经营周会、预算、任务、待跟进、策略、公司、人脉等页面
  的完整时间展示均切换到共享工具；绝对 ISO 事件统一转换到 `Asia/Shanghai`。

### 已验证

- 修复前隔离 MySQL 探针：同一次操作 `CURRENT_TIMESTAMP=2026-07-23 12:14:52`，显式 ISO 参数
  存成 `2026-07-23 04:14:52`；修复后 MySQL session=`+08:00`，两者均为
  `2026-07-23 12:20:41`。
- 时间迁移隔离 MySQL 测试通过：构造 `02:29` 错值与 `10:29` 审计证据后，相关业务记录均校正；
  无偏差媒体记录保持不变，第二次执行返回 `already-applied`。
- 真实隔离 MySQL 3/3 通过：业务时间迁移、在线表格导入导出/协作权限、出差统计接口。
- 前端全量测试 23 个套件、120 条通过；后端全量测试 85 条通过、3 条按环境开关跳过；业务时间
  目标测试 6/6 通过。
- `BUILD_PATH=/tmp/relation-business-time-build-final npm run build` 通过；性能门禁实测首屏 JS
  `327.9KB gzip`、75 个异步 chunk、最大异步 chunk `419.9KB gzip`，继续满足既定预算。

## 全系统性能门禁（2026-07-22）

### 已完成

- `client/src/App.js` 将 43 个一级页面改为 `React.lazy` 路由懒加载，路由切换统一使用轻量加载态；
  首屏不再同步打包全部业务页面。
- 页面首次完成路由权限校验、异步 chunk 加载并提交渲染后，写入
  `data-relation-route-ready` / `data-relation-route-ready-ms`；首次加载超过 `1000ms` 时输出
  `[page:slow]`，SPA 后续导航不混入页面生命周期累计耗时。
- 新增前端构建体积门禁：首屏 JavaScript gzip `<=400KB`、单个异步 chunk gzip `<=500KB`、
  首屏仅一个 JS 入口且至少 10 个异步 chunk；命令为
  `BUILD_PATH=/tmp/relation-build npm run performance:frontend`。
- 新增 API 性能审计，覆盖 49 个主要只读接口，每个接口先预热再采样，任一 `5xx` 或 p95 超过
  `300ms` 即失败；命令为 `npm run performance:api`。
- 所有服务端响应增加 `Server-Timing` 和 `X-Response-Time`，超过
  `RELATION_API_RESPONSE_BUDGET_MS`（默认 `300ms`）记录 `[http:slow]`，不记录请求正文。
- 生产静态资源按内容哈希长期缓存：`static/*` 使用一年 immutable，`index.html` 禁止缓存；新增
  `RELATION_CLIENT_BUILD_DIR` 支持从 `/tmp` 挂载隔离构建。
- 修复 `/api/trips/stats/summary` 在 MySQL 使用 SQLite `julianday`、对密文
  `related_persons` 做 SQL `LIKE` 导致的稳定 `500`：改为按权限读取目标人员、解密关联人员并在
  内存计算最近出差日期。新增真实隔离 MySQL/HTTP 回归测试。

### 已验证

- 隔离 MySQL `relation_test`、独立生产服务 `3103`：49/49 个主要 API 通过 p95 `300ms` 门禁；
  最慢 `/users?limit=100` 为 `19.8ms`，`/stats` 为 `18.5ms`，
  `/trips/stats/summary` 为 `15.3ms`。
- 生产构建体积门禁通过：首屏 JS `323.6KB gzip`，75 个异步 chunk，最大异步 chunk
  `419.9KB gzip`；优化前首屏约 `1.33MB gzip`。
- 浏览器直达登录页及 44 个登录后静态路由：登录页约 `96.5ms`，登录后页面最慢约 `128ms`，
  均低于 `1000ms`；累积 44 个工作区标签后的文档中心压力复测为 `877.7ms`。该指标来自页面内
  路由可用标记，不包含浏览器控制通道的外部遥测等待。
- `index.html` 返回 `no-store, no-cache`；带哈希主包返回
  `public, max-age=31536000, immutable`；API 计时头实测正常。
- 性能单元测试 7/7、出差统计隔离 MySQL 集成测试 1/1、前端全量测试 22 个套件 117 条、
  后端全量测试 80 条通过（另 2 条显式 MySQL 测试按环境开关跳过）；生产构建和所有
  `node --check` 通过。

### 边界

- `300ms` / `1s` 是隔离 MySQL、预热服务、当前测试数据和生产构建下的工程门禁，不是对生产
  网络、冷启动、客户端硬件、第三方服务或无限数据量的绝对保证；上线后仍需持续观察慢请求日志
  和真实用户页面指标。

## 文档中心附件上传 413 修复（2026-07-22）

### 已完成

- 将服务端单文件上传默认上限从 100MB 提升到 500MB，支持通过
  `RELATION_UPLOAD_FILE_SIZE_LIMIT` 或 `RELATION_MAX_UPLOAD_FILE_SIZE` 覆盖，便于上传较大的
  APK/AAB/IPA 安装包。
- `multer` 文件超限统一返回 `413 UPLOAD_FILE_TOO_LARGE`，附带当前限制，文档中心附件块上传
  失败时显示明确中文提示，不再只展示 Axios 的 `Request failed with status code 413`。
- Wolai MCP 远程图片抓取限制从通用附件上传上限中解耦，默认继续按 100MB 兜底，避免放大服务端
  远程下载风险。
- 文档中心附件新增分片上传兜底：超过 8MB 的附件按 768KB 顺序分片上传，再由服务端校验总大小、
  合并并写入原附件表，避免 25MB APK 因代理单请求体限制直接返回 413。
- 分片临时目录按文档、用户和上传 ID 隔离，合并成功或异常失败后自动清理。


### 已验证

- `node --check server/index.js` 通过。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand src/utils/documentHistory.test.js src/utils/documentKind.test.js` 通过。
- `node --test server/lib/wolaiMcpImport.test.js server/lib/wolaiMcpImportFoldState.test.js` 通过，6/6。
- `cd client && BUILD_PATH=/tmp/relation-document-attachment-upload-build npm run build` 通过。
- `cd client && BUILD_PATH=/tmp/relation-document-attachment-chunk-build npm run build` 通过。

### 本轮任务文件

- `server/index.js`
- `client/src/pages/Documents.js`
- `handoff.md`

## 响应变慢排查与修复（2026-07-22）

### 已完成

- 排查 2026-07-21 提交后全系统响应变慢，定位到操作日志中间件会对所有写请求的 `req.body`
  递归清洗并 JSON 序列化；文档/在线表格自动保存携带大 `content` 工作簿时，会在 Node 主线程
  遍历大量 `blocks/cells`，导致写请求和同进程其他响应变慢。
- 修复 `server/index.js` 的日志清洗逻辑：对 `content`、`content_json`、历史快照、workbook、
  blocks、cells、html、markdown、payload 和二进制文件字段只记录摘要，不再深度遍历正文。
- 同步处理 2026-07-21 媒体文档归档改动的启动扫描风险：`media_assets.document_id` 补充显式索引，
  降低启动归档检查和媒体文档关联查询成本。

### 已验证

- `node --check server/index.js` 通过。
- `node --test server/lib/mediaManagement.test.js` 通过，7/7。
- `git diff --check -- server/index.js server/lib/mediaManagement.js server/lib/mediaManagement.test.js` 通过。

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

## 文档中心在线表格文档（2026-07-22）

### 已完成

- 新增 `文档中心-在线表格文档PRD.md`，明确在线表格是独立文档形态，不是普通文档内嵌表格块。
- 更新 `文档中心模块PRD.md`，新建文档入口默认普通文档，并支持选择在线表格。
- 更新 `AGENTS.md`，固化 `document_kind=rich_text/spreadsheet` 与 `doc_type` 业务分类的边界。
- 服务端 `documents` 表新增 `document_kind`，旧数据默认 `rich_text`，并在加列后创建索引，兼容旧库增量启动。
- 新建文档接口支持 `document_kind=spreadsheet`，自动初始化
  `relation_spreadsheet_workbook_v1` 工作簿和 `工作表1`。
- 文档列表接口和序列化结果返回 `document_kind`，旧值统一规范为 `rich_text`。
- 文档中心前端新增新建下拉：主按钮仍默认普通文档，菜单可选普通文档或在线表格。
- 新建弹窗新增“文件形态”；编辑文档属性时只读展示，不允许直接切换普通文档/在线表格。
- 列表、Tab 和详情页对在线表格显示表格图标或“在线表格”标签。
- 在线表格详情页复用文档中心头部治理信息，正文区域切换为表格工作区骨架：菜单栏、工具栏、
  公式栏、网格和底部 Sheet 标签。
- 保存、标签关闭、标题自动保存和多人轮询同步对在线表格做分支保护，避免把 workbook 内容
  覆盖为普通文档 blocks。
- 在线表格支持点击单元格选中、直接编辑当前单元格，公式栏同步显示并可编辑当前单元格内容。
- 单元格内容写入 `relation_spreadsheet_workbook_v1.sheets[].cells`，并生成 `content_text` 供搜索、
  摘要和保存校验使用。
- 底部 Sheet 标签支持新增、切换、双击重命名、右键重命名和右键删除；至少保留一个工作表。
- 在线表格内容签名已加入自动保存依赖，单元格或工作表改动会进入现有自动保存链路。
- 在线表格支持从 Excel/石墨等外部表格复制 TSV 文本后，从当前单元格开始批量粘贴。
- 在线表格支持复制当前单元格，写入纯文本和 HTML table fallback。
- 工具栏支持插入行、删除行、插入列、删除列，并按 A1 坐标迁移现有单元格。
- 工具栏支持当前单元格加粗、填充浅黄色、清空内容和清除格式。
- 在线表格工作簿纯逻辑已抽到 `client/src/utils/spreadsheetWorkbook.js`，页面不再内嵌公式、
  排序筛选和行列迁移实现；网格交互抽到 `client/src/components/SpreadsheetDocumentEditor.js`。
- 支持鼠标拖拽多单元格选区、Shift 扩选、方向键移动、Delete 清空、双击编辑；复制选区输出
  TSV 和 HTML table，粘贴矩阵从当前单元格开始展开。
- 支持公式原文和计算值分离，覆盖单元格/区域及跨 Sheet 引用、四则运算、比较和常用统计函数；
  循环引用、除零、非法名称、非法引用和类型错误显示明确错误码。
- 支持按当前列对选区或已用区域升序/降序排序；文本首行自动作为标题保留；支持筛选为当前值、
  多列筛选条件叠加和清除筛选。
- 支持冻结至当前行/列、同时冻结和取消冻结，冻结上限为前 100 行、50 列；支持选区合并与
  取消合并，非左上角存在内容时二次确认。
- 支持拖拽调整列宽和行高，支持 75%/100%/125%/150% 缩放。
- 网格改为行列双向虚拟渲染，工作簿行列数量不再受原 28 行、14 列显示上限约束。
- 新增在线表格 Excel 文件接口：可编辑用户可导入 `.xlsx/.xlsm`，可见用户可导出 `.xlsx`；
  服务端沿用 JSZip，不新增前端 Excel 依赖，导入临时文件解析后立即清理。
- Excel 导入导出保留多 Sheet、普通/共享公式、基础加粗与填充色、行高列宽、冻结和合并区域；
  `.xlsm` 不保留 VBA 宏。导入限制为 10 万行、2000 列、30 万个非空单元格和解压后 200MB；
  单个公式最多展开 10 万个单元格，并限制公式长度和递归深度。
- Excel 导出前强制完成当前文档保存，避免下载到上一次已保存版本；导入后进入现有自动保存链路。
- 联调修复普通键盘编辑错误提示“已粘贴单元格”：单值输入和单值粘贴保留输入框原生行为，
  只有多行/多列矩阵进入区域粘贴与成功提示。
- 在线表格新增独立工作簿撤销/重做栈；公式栏、单元格内编辑按一次提交记录，排序、合并、
  行列增删和 Sheet 管理等离散操作也进入历史，支持 `Cmd/Ctrl+Z`、`Shift+Cmd/Ctrl+Z` 和 `Ctrl+Y`。
- 工作表名称统一限制为空值、31 字符、Excel 非法字符、首尾单引号和不区分大小写重复；
  新建 Sheet 自动选取未占用编号，前端重命名和服务端保存边界同时拒绝非法名称。
- 重命名工作表会在同一事务内迁移全部跨 Sheet 公式，兼容中文、空格、单引号、范围引用和
  多公式，并跳过字符串字面量及相似名称；撤销/重做同时恢复名称和公式。
- Sheet 切换不再占用撤销步骤；仅修改名称大小写以及旧工作簿中的原始字符串公式也会迁移。
  在线表格历史恢复复用同一服务端名称校验，非法旧快照不能重新写回数据库。
- 公式错误在算术与聚合函数中原样传播，自引用 `=E2+1` 和区域循环引用均显示 `#CYCLE!`，
  不再被错误转换为 `#VALUE!`。
- 行列插入/删除改为带 Sheet 上下文迁移整个工作簿公式，兼容绝对引用和跨 Sheet 区域引用；
  不再误改公式字符串、`Sheet1` 名称或 `Sheet10` 相似名称。名为 `TRUE/FALSE` 的 Sheet 可被
  正常引用，比较和字符串拼接也会保留上游公式错误码。
- 工作簿撤销/重做改用序列化快照，最多保留最近 30 步并限制约 24MB 历史容量；超大工作簿
  至少保留最近一步，小表仍支持多步撤销，避免 80 份完整对象放大浏览器内存。

### 已验证

- `node --check server/index.js` 通过。
- `git diff --check` 通过。
- `cd client && BUILD_PATH=/tmp/relation-spreadsheet-doc-kind-build npm run build` 通过。
- `cd client && BUILD_PATH=/tmp/relation-spreadsheet-editable-mvp-build npm run build` 通过。
- `cd client && BUILD_PATH=/tmp/relation-spreadsheet-grid-tools-build npm run build` 通过。
- 在线表格工作簿前端单元测试 9 条通过，覆盖坐标、公式、跨 Sheet、错误、排序、筛选、合并和行列迁移。
- 在线表格组件虚拟化测试 1 条通过：10 万行、500 列工作簿只渲染视口附近单元格并显示公式结果。
- Excel 工作簿服务端往返测试 1 条通过，覆盖多 Sheet、公式、样式、行高列宽、冻结和合并。
- READY-TEST-5：公式栏与单元格内编辑撤销/重做回归通过。
- READY-TEST-6：工作表命名、重命名公式迁移、迁移撤销/重做、循环引用错误传播回归通过；
  前端目标 20 条、服务端 Excel 目标 2 条全部通过。
- READY-TEST-8：Sheet 切换不占撤销步骤、大小写重命名、旧字符串公式迁移及非法历史恢复保护
  回归通过；前后端全量测试再次通过。
- READY-TEST-9：行列结构变化的跨工作簿公式迁移、绝对引用、字符串与相似 Sheet 名隔离、
  `TRUE/FALSE` Sheet 引用及比较/拼接错误传播回归通过。
- READY-TEST-10：工作簿历史改为带条数和容量上限的序列化快照，连续 35 次提交后仅保留最近
  30 步撤销的行为回归通过。
- READY-TEST-11：Chrome 真实页面完成公式栏循环引用、撤销/重做、跨 Sheet 重命名公式迁移、
  切换 Sheet 后撤销及移动端布局回归；测试数据清理并经 API/MySQL 持久化结果确认。
- READY-TEST-12：使用 `doc=2` 真实旧历史记录 31 验证重复 Sheet 名快照恢复返回 `400`；
  拒绝前后文档 `updated_at` 和完整 `content` 保持一致。
- 隔离 MySQL 与真实 HTTP 权限矩阵通过：未登录导入/导出 `401`；管理员导入/导出 `200`；
  被共享的 `readonly` 用户读取/导出 `200`、导入 `403`，导出文件回读保留 Sheet 和公式原文。
- 服务端重复 Sheet 名负向保存返回 `400 工作表名称不能重复`，原工作簿保持不变。
- 已知重复 Sheet 名的旧页面快照恢复返回
  `400 历史版本无法恢复：工作表名称不能重复`；接口调用前后当前文档更新时间、Sheet 名和完整
  工作簿 JSON 均未变化。
- Chrome 桌面页实测 `=E2+1` 显示 `#CYCLE!`，`Cmd+Z` 清空、`Shift+Cmd+Z` 恢复；源 Sheet
  从“保存测试”改为“源 数据”后，公式迁移为 `='源 数据'!A1` 且结果保持 `FIRST`，切换 Sheet
  后一次撤销直接恢复名称和公式，重做再次迁移。
- READY-TEST-13：共享 `readonly` 账号打开在线表格后，Excel 导入、行列增删、格式、排序筛选、
  冻结、清空和新增 Sheet 均不可操作，公式栏保持只读且双击单元格不进入编辑态；Excel 导出仍可用。
- READY-TEST-13：管理员在 `doc=3` 写入 `L19=AUTOSAVE_REFRESH_READY13` 后等待自动保存并刷新，
  单元格值仍存在；测试值随后清空并再次刷新确认已持久化还原。
- READY-TEST-13：通过服务端模拟另一位协作者向 `doc=3` 的 `M20` 写入唯一标记，当前页面未刷新即
  在 5 秒轮询窗口内显示远端值；服务端恢复原工作簿后，页面同样自动移除该值，测试数据已清理。
- READY-TEST-14：新增真实 MySQL 权限接口测试，每次运行创建随机临时库和临时服务，通过实际
  multipart `.xlsx` 与二进制下载覆盖未登录导入/导出 `401`、管理员导入/导出 `200`、共享
  `readonly` 用户读取/导出 `200` 和导入 `403`；导出回读继续保留 Sheet 名与公式原文。
- READY-TEST-14：权限测试清理阶段会终止临时服务并删除临时 MySQL 库；退出流程同时覆盖
  `SIGTERM` 超时后的 `SIGKILL` 兜底，测试无需 `--test-force-exit` 即可自然结束。
- READY-TEST-15：Excel 导入/导出图标按钮增加明确可访问名称；隐藏文件输入在只读状态同步禁用，
  `change` 回调再次检查 `canEdit`，组件测试覆盖可编辑用户导入/导出回调和只读用户导入拦截、
  公式栏只读、双击单元格不进入编辑态及导出仍可用。
- READY-TEST-15：修复 Sheet 重名校验抛 rejected Promise 导致开发环境整页运行时错误层；重命名
  弹窗改为手动控制关闭，重复名称时在输入框下显示“工作表名称不能重复”、保留弹窗和原工作簿，
  不再抛异常。组件回归和 `doc=2` 真实页面复现路径均通过，弹窗已取消且未写入测试数据。
- READY-TEST-16：移除 Sheet 重命名输入框先行静默截断的 `maxLength=31`，超长名称现在完整进入
  统一校验并明确显示“工作表名称不能超过 31 个字符”。组件测试连续覆盖空值、32 字符、Excel
  非法字符、首尾单引号、重复名称，以及报错后改成合法名称可正常保存和关闭弹窗。
- READY-TEST-16：`doc=2` 真实页面输入 32 字符后保留完整输入并显示明确错误，弹窗仍可操作、
  页面无运行时错误层且原 Sheet 名不变；测试弹窗已取消，没有写入测试数据。
- READY-TEST-17：修复在线表格轮询发现远端更新时无条件替换工作簿、清除本地 dirty 导致未保存
  单元格静默丢失的问题；新增基于稳定 Sheet ID 和单元格键的 workbook 三方合并，不同位置自动
  合并，同一位置冲突保留本地，Sheet 删除与另一端修改冲突时保留已修改版本并提示用户。
- READY-TEST-17：远端完整 workbook 加入协作基线；本地 dirty 合并后不再被清除，保存签名改用
  远端原始版本，现有防抖自动保存会使用远端新 `updated_at` 提交合并结果。工具函数测试覆盖
  不同单元格、同一单元格和 Sheet 删除/修改冲突。
- READY-TEST-17：修复虚拟网格 scroll state updater 延迟读取已清空 `event.currentTarget` 导致的
  `Cannot read properties of null (reading 'scrollTop')` 整页错误层；滚动偏移在事件回调内同步捕获，
  组件测试覆盖滚动后立即卸载。
- READY-TEST-18：修正三方合并中“本地清空单元格、远端修改同一单元格”错误保留远端值的语义；
  本地清空现在与普通本地输入一致，作为有效本地修改优先。Sheet 级删除/修改冲突单独保留修改侧，
  避免整表数据丢失。测试覆盖本地删单元格、远端改同单元格，以及双向 Sheet 删除/修改冲突。
- READY-TEST-18：`doc=3` 真实双写验证中远端修改 `A1`、本地同步前清空 `A1`，页面保持为空且
  API 最终不存在 `A1`；随后恢复原工作簿，页面重新显示 `FIRST`，测试标记已清理且无错误层。
- READY-TEST-19：修复快速连续新增 Sheet 时裸 `Date.now()` 可能生成重复 ID、normalize 虽修正
  第二个 ID 但 `activeSheetId` 仍错误指向前一个 Sheet 的问题；新增 ID 现在基于 `workbookRef`
  当前 Sheet 集合显式去重，新增按钮补充“新增工作表”可访问名称。
- READY-TEST-19：组件测试固定 `Date.now()` 连续触发两次新增，验证名称依次为工作表2/3、三个
  Sheet ID 全部唯一，新增 ID 分别带基础值和递增后缀，活动 Sheet 正确指向最后新增项。
- READY-TEST-20：服务端工作簿校验新增 Sheet ID 非空、同一工作簿内唯一以及 `activeSheetId`
  必须指向现有 Sheet；重启后的真实 `3001` 与独立 QA 均验证三种非法结构返回 `400`，请求前后
  `doc=2` 内容 SHA-256、原始 content 和 `updated_at` 完全不变。
- READY-TEST-20：同单元格冲突提示接入在线表格工作区 Alert，并增加 8 秒 warning toast 兜底；
  `409 DOCUMENT_CONFLICT` 直接消费响应中的 `latest` 快照，不再因轮询锁跳过合并提示，合并后的
  表格自动保存成功不再立即清空提示。组件测试覆盖提示在合并工作簿更新后继续可见。
- READY-TEST-21：本地工作簿回调改为同步标记 dirty 并更新活动编辑器快照，避免 React effect
  尚未执行时手动保存或远端轮询误判本地没有修改；提示文案按同格冲突、一般并发和纯远端同步
  分别生成。
- READY-TEST-21：冲突提示改为绑定文档 ID 的独立状态，并由 `Documents` 表格工作区稳定层直接
  渲染 Alert；网格 workbook 重建、合并后的自动保存和文档选择状态刷新不再清除提示，其他文档
  也不会误显示该提示。
- READY-TEST-21：真实 `doc=3` 联调取得外部管理员 PUT `200` 与页面本地 PUT `409` 的连续证据；
  同一 `I18` 冲突后页面及 API 均保留本地值，完整“修改了相同表格位置”提示立即出现，并在同一
  页面动作内等待 4.5 秒后仍可见。所有联调标记及临时状态码日志均已清理。
- READY-TEST-22：服务端新增在线表格检索文本生成器，按 Sheet 顺序和单元格行列顺序提取名称、
  坐标及原值并限制为 20,000 字；新建在线表格省略 `content_text` 时直接从工作簿生成。
- READY-TEST-22：`PUT /api/documents/:id` 与 `PUT /api/documents/:id/content` 在提交新工作簿但省略
  `content_text` 时不再回退旧索引；页面历史恢复也会从目标工作簿重建，避免已删除单元格继续残留
  在搜索、摘要和 AI 输入中。普通文档及显式提交当前表格计算文本的行为不变。
- READY-TEST-23：新增 `POST /api/documents/:id/spreadsheet/operations`，首期支持原子批量
  `set_cell`；每个操作使用稳定 Sheet ID、A1 坐标和 `before/after` 快照。旧文档基线修改不同单元格
  可直接合并，同格已变化时返回带冲突位置和当前快照的 `409 SPREADSHEET_OPERATION_CONFLICT`。
- READY-TEST-23：operation API 支持最终状态幂等重试；当前单元格已等于 `after` 时返回成功且不
  重复更新时间。单批限制 500 项、单格快照 16KB、坐标 10 万行 x 2000 列；操作正文从系统操作
  日志中摘要化。成功保存同步维护工作簿、检索文本、摘要和页面编辑记录。
- READY-TEST-24：前端自动保存新增工作簿差异规划。标题和结构未变、差异不超过 500 个单元格时
  调用 operation API；标题、Sheet、行列、列宽行高、冻结、筛选、合并等结构变化和超限批次继续走
  原 `PUT /documents/:id/content`，撤销、公式、导入导出和关闭前保存的既有行为保持兼容。
- READY-TEST-24：operation 成功后只校验本批目标快照已经应用，并接受服务端响应中合并的其他远端
  单元格，把响应工作簿和 `updated_at` 更新为页面及轮询基线；operation 同格 `409` 复用现有三方
  合并、本地优先和绑定文档的 10 秒冲突提示。
- READY-TEST-25：operation API 扩展 `set_sheet_property` 与 `set_workbook_property`，支持名称、
  行列数量、行高列宽、合并、筛选、冻结、活动 Sheet、样式和定义名称，并可与 `set_cell` 组成一个
  原子批次。任一属性前置值冲突时整批不落库，冲突结果明确返回操作类型、Sheet 与属性。
- READY-TEST-25：前端在标题未变且 Sheet ID/顺序稳定时，把受支持的结构差异与单元格差异一并规划
  为最多 500 项 operation；Sheet 增删/重排、未知字段、16KB 单元格快照、256KB 属性快照或批次超限
  继续回退完整文档保存。Sheet 重命名由服务端同步迁移当前工作簿的跨 Sheet 公式，兼容并发新增公式。
- READY-TEST-25：修复仅样式或结构变化不生成页面编辑记录的问题。服务端不再只依据
  `content_text` 判定记录；工作簿实际变化但检索文本不变时，仍生成 `spreadsheet_operations`、
  “表格格式或结构已更新”摘要和可恢复快照。隔离 MySQL 回归覆盖公式文字不变、仅加粗的单元格。
- READY-TEST-26：修复 operation 自动保存后改动历史继续使用旧 `selectedDoc.edit_records` 的问题。
  打开历史现在先等待当前保存完成，再主动 GET 最新文档详情；刷新失败不会打开过期历史。历史按钮
  在请求期间显示 loading，避免重复触发。
- READY-TEST-27：新增在线表格 SSE 与 presence。服务端以内存 Hub 管理浏览器标签级会话，20 秒
  无心跳失效；可见用户通过带认证的 SSE 接收 presence 和 `document_updated`，每 10 秒复查权限，
  5 秒轮询继续兜底。presence 心跳与退出不写数据库、页面历史或操作日志。
- READY-TEST-27：表格组件回传完整拖拽选区并展示最多 3 个协作者头像；当前 Sheet 的远端选区
  使用协作者颜色描边和浅色背景。只读共享用户可上报选区但 operation 仍为 `403`；工作簿初始
  Sheet ID 与旧默认选择不一致时，以组件真实活动 Sheet 和完整选区为准。
- READY-TEST-28：operation API 新增 `add_sheet`、`delete_sheet` 和 `reorder_sheets`。新增携带完整
  Sheet 快照、目标位置与相邻稳定 ID；删除以完整旧 Sheet 为前置值；重排只调整目标 ID 集合在当前
  工作簿中的顺序投影，因此不同 Sheet 并发新增和旧基线重排可以合并，远端新增项不会被覆盖。
- READY-TEST-28：删除目标 Sheet 已被远端修改、相邻锚点失效或参与重排的 Sheet 集合发生远端结构
  变化时，整批返回 `409 SPREADSHEET_OPERATION_CONFLICT` 且不部分落库。结构快照沿用 256KB 单项
  限制，未知字段、快照或 500 项批次超限继续回退文档级保存。
- READY-TEST-28：Sheet 标签右键菜单增加“向左移动 / 向右移动”，移动与新增、删除共同进入工作簿
  撤销/重做栈及 operation 自动保存；结构操作生成 `spreadsheet_operations` 页面编辑记录和可恢复
  快照，删除历史显示“删除：工作表名”。
- READY-TEST-29：`add_sheet.after` 新增完整可写快照校验。服务端为精简 Sheet 补齐行高列宽、合并、
  筛选和冻结默认值；未知字段、非规范/越界坐标、超出声明行列或单格超过 16KB 均返回 `400`，
  工作簿原文与 `updated_at` 不变，不能利用 256KB 结构快照绕过单元格边界。
- READY-TEST-29：并发默认重名三方合并后，如果同一原子批次已计划把当前占名 Sheet 改为唯一
  名称，新增操作允许使用即将释放的名称；后续改名一旦前置值冲突仍整批回滚，避免客户端在
  “新增同名 -> 远端改唯一名”的合法重试中反复 `409`。
- 浏览器测试新增 Sheet、公式和重命名均通过撤销清理；自动保存后 API 回读 `doc=3` 仅保留
  Sheet“保存测试”及 `A1=FIRST`、`B1=SECOND_DURING_SAVE`。桌面和 390 x 844 移动端截图
  无控件重叠、截断或不可达操作；控制台仅有既有 Ant Design 弃用警告，无业务异常。
- READY-TEST-13 收尾再次运行前端全量测试，18 个测试套件、92 条测试全部通过。
- READY-TEST-13 收尾再次运行后端全量测试，51 条全部通过，包含共享、权限和本地监听集成测试。
- READY-TEST-14 服务端全量测试增加至 52 条并全部通过，其中在线表格权限测试在隔离 MySQL
  临时库执行；前端全量仍为 18 个测试套件、92 条全部通过。
- READY-TEST-15 前端全量测试 18 个测试套件、95 条全部通过；服务端全量仍为 52 条全部通过。
- `node --check server/lib/spreadsheetWorkbookFile.js`、`node --check server/index.js` 通过。
- READY-TEST-10 后隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready10-build`。
- READY-TEST-13 隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready13-build`。
- READY-TEST-14 隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready14-build`。
- READY-TEST-15 隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready15-build`。
- READY-TEST-16 前端全量测试仍为 18 个测试套件、95 条全部通过；隔离生产构建通过，输出到
  `/tmp/relation-spreadsheet-ready16-build`。服务端代码未变，沿用同一快照最近一次 52/52 全量结果。
- READY-TEST-17 前端全量测试 18 个测试套件、98 条全部通过；服务端全量 52 条全部通过；隔离
  生产构建通过，输出到 `/tmp/relation-spreadsheet-ready17-build`。
- READY-TEST-18 前端全量测试 18 个测试套件、98 条全部通过；服务端全量 52 条全部通过；隔离
  生产构建通过，输出到 `/tmp/relation-spreadsheet-ready18-build`。
- READY-TEST-19 前端全量测试 18 个测试套件、99 条全部通过；服务端全量 53 条全部通过；隔离
  生产构建通过，输出到 `/tmp/relation-spreadsheet-ready19-build`。
- READY-TEST-20 前端全量测试 18 个测试套件、100 条全部通过；服务端全量 55 条全部通过，其中
  在线表格权限测试使用随机隔离 MySQL 库；隔离生产构建通过，输出到
  `/tmp/relation-spreadsheet-ready20-build`。
- READY-TEST-21 前端全量测试 19 个测试套件、104 条全部通过；服务端全量 55 条全部通过，其中
  在线表格权限接口测试使用随机隔离 MySQL 库；`node --check server/index.js` 通过，隔离生产构建
  通过并输出到 `/tmp/relation-spreadsheet-ready21-build`。
- READY-TEST-22 前端全量测试 19 个测试套件、104 条全部通过；服务端全量 57 条全部通过，其中
  隔离 MySQL 真实 HTTP 回归覆盖内容接口、完整更新接口、搜索与历史恢复；隔离生产构建通过并输出
  到 `/tmp/relation-spreadsheet-ready22-build`。
- READY-TEST-23 前端全量测试 19 个测试套件、104 条全部通过；服务端全量 61 条全部通过。隔离
  MySQL 真实 HTTP 回归覆盖匿名 `401`、管理员 operation 成功、旧基线不同单元格合并、同格冲突
  原子拒绝、重复请求幂等和共享只读用户 `403`；隔离生产构建输出到
  `/tmp/relation-spreadsheet-ready23-build`。
- READY-TEST-22/23 独立 QA 验收通过：内容接口、完整更新、新建和历史恢复均不会残留旧
  `content_text`；operation API 的 401/403、不同格旧基线合并、同格 409 原子拒绝、幂等重试、
  清空索引、参数边界和操作日志脱敏全部通过，测试文档、用户及 marker 均已清理。
- READY-TEST-24 前端全量测试 20 个套件、107 条全部通过；后端全量 61 条全部通过；隔离生产构建
  输出到 `/tmp/relation-spreadsheet-ready24-build`。真实 `doc=3` 页面验证单元格写入与清空产生
  `spreadsheet_operations`，Sheet 重命名与恢复产生 `content_update`；最终 Sheet 名、A1、C2、
  工作簿、`content_text` 和搜索结果均已恢复，无 R24 marker。
- READY-TEST-25 前端全量测试 20 个套件、110 条全部通过；后端全量 64 条全部通过；隔离生产构建
  输出到 `/tmp/relation-spreadsheet-ready25-build`。真实临时文档依次验证仅样式加粗、冻结和 A 列宽
  均持久化并生成可恢复 `spreadsheet_operations`；Sheet 从 `R25源数据` 重命名为 `R25重命名`
  后，跨 Sheet 公式同步变为 `=R25重命名!A1` 且页面计算值仍为 15；新增 Sheet 回退
  `content_update`。浏览器无业务异常，临时文档 `doc=9` 已删除并确认返回 `404`。
- READY-TEST-26 前端全量测试 21 个套件、112 条全部通过；隔离生产构建输出到
  `/tmp/relation-spreadsheet-ready26-build`。真实临时文档先完成 A1 加粗 operation，服务端生成
  `spreadsheet_operations` 后不刷新页面直接打开改动历史，页签立即显示 1 条，摘要与恢复按钮均
  可见；临时 `doc=11` 已删除并确认返回 `404`。
- READY-TEST-27 前端全量测试 22 个套件、115 条全部通过；后端全量 67 条全部通过，其中真实
  MySQL/HTTP 回归覆盖匿名 SSE `401`、管理员 connected/presence、operation 更新广播、只读共享
  presence `200` 与 operation `403`，并确认 presence 操作日志为 0。隔离生产构建输出到
  `/tmp/relation-spreadsheet-ready27-build`。
- READY-TEST-27 真实双会话验证中，外部共享用户的 B2:C3 选区在管理员页面显示 1 个头像和 4 个
  高亮单元格；远端 E5 operation 后约 1 秒内出现在页面，快于 5 秒轮询。桌面与 390 x 844 移动端
  截图无菜单、公式栏、Sheet 或内容遮挡。临时 `doc=12`、用户 4、presence 和误生成的测试日志均
  已清理，文档回读 `404`，修复后连续 9 秒观察 presence 操作日志保持 0。
- READY-TEST-27 独立 QA 验收通过：双会话头像、B2:C3 四格高亮、128ms 远端 operation 同步、
  只读 SSE/presence 与 operation `403`、20 秒失效、坐标边界、匿名 `401` 和 presence 日志为 0
  均符合预期；QA 临时文档、用户、共享和 marker 已清理。
- READY-TEST-28 前端全量测试 22 个套件、117 条全部通过；后端全量 71 条全部通过，其中隔离
  MySQL/HTTP 回归覆盖结构批次、派生文本、可恢复历史、目标 Sheet 远端修改后的删除 `409` 和整批
  原子拒绝。隔离生产构建输出到 `/tmp/relation-spreadsheet-ready28-build`。
- READY-TEST-28 真实页面验证连续新增工作表2/3、右键移动、撤销/重做和删除均持久化为
  `spreadsheet_operations`；不刷新页面打开历史立即显示 5 条，删除记录摘要正确且恢复按钮可见。
  旧基线连续新增“并发远端/并发本地”均返回 `200`，第二次 `merged_remote_update=true`；旧基线重排
  原有 Sheet 后两个并发新增 Sheet 仍完整保留。桌面与 390 x 844 移动端无重叠，临时 `doc=13` 已
  删除并回读 `404`，页面无 runtime overlay，仅有既有 Ant Design 弃用警告。
- READY-TEST-28 独立 QA 验收通过：连续新增、右键移动、撤销/重做、删除后即时历史与恢复、270KB
  Sheet 回退 `content_update`、旧基线并发新增、带远端新增的顺序投影重排、修改后删除 `409`
  原子拒绝、重复名称与 256KB 上限均符合预期；临时 `doc=14`、搜索和 marker 已清理。
- READY-TEST-29 服务端目标测试 14 条、后端全量 74 条全部通过；隔离 MySQL/HTTP 回归额外验证
  越界 `add_sheet` 返回 `400` 且 content/`updated_at` 完全不变，精简合法 Sheet 规范化后可成功
  保存。前端代码未变，沿用 READY-TEST-28 的 22 个套件 117 条和生产构建结果。
- READY-TEST-29 最新 `3001` 真实烟测中，精简 Sheet 与同批释放名称的新增返回 `200`，最终名称为
  “工作表1 / 工作表2 / 工作表2 (2)”且默认结构字段完整；越界 `A100001` 返回 `400`，前后 content
  和 `updated_at` 完全相同。临时 `doc=15` 已删除并回读 `404`。
- READY-TEST-29 独立 QA 验收通过，无 P0-P3 缺陷：未知字段、小写坐标、全局越界、超出 Sheet
  声明尺寸和 17KB 单格均返回 `400`，且 content、`updated_at`、编辑记录逐次保持不变；精简
  Sheet 自动补齐结构字段并生成可恢复的 `spreadsheet_operations` 历史。
- READY-TEST-29 同批“新增占用名称 + 原 Sheet 改名释放”返回 `200` 且名称唯一；改名 `before`
  过期时整批返回精确 `409 SPREADSHEET_OPERATION_CONFLICT`，拟新增 Sheet 未部分落库；只读共享
  用户读取 `200`、operation `403`，非法、冲突和越权请求均不生成历史。
- QA 使用全新 marker 复核 `set_cell after=null`，响应、立即回读和延迟回读的工作簿及
  `content_text` 均同步清除，排除首轮复用夹具 marker 造成的假阳性。临时 `doc=16/17`、只读账号、
  共享和搜索 marker 已全部清理，两个文档均回读 `404`、搜索命中均为 0。
- 最终完成审计基于当前未提交工作树重新执行：后端在隔离 MySQL `127.0.0.1:3307` 上全量
  `74/74` 通过，包含真实权限和 HTTP 联调；前端全量 22 个套件、117 条通过，隔离生产构建成功
  输出到 `/tmp/relation-spreadsheet-final-audit-build`。该审计未修改测试数据；本次提交只纳入在线
  表格源码、测试和文档，不包含本地数据库、构建产物或其他任务改动。
- READY-TEST-21 联调结束后精确移除 `doc=3` 中遗留的两个 `LOCAL_WINS_R20_QA3` 单元格；API
  最终递归扫描 `R20/R21/LOCAL_WINS/REMOTE_LOST` 匹配数为 0，未残留本轮测试数据。
- READY-TEST-20 真实联调已取得外部管理员 `PUT /api/documents/3/content = 200` 和浏览器旧基线
  保存命中 `409 DOCUMENT_CONFLICT` 的双端证据；用于取证的服务端/前端临时日志均已删除并重启
  干净 `3001`。该检查点尚未稳定完成提示留存，已由 READY-TEST-21 的连续页面动作回归补齐。

### 后续阶段

- 第四期单元格、属性与 Sheet 增删重排 operation、前置值原子校验、远端不同位置合并、前端自动
  保存、在线成员/选区和 SSE 实时通知均已完成；5 秒轮询保留为断线兜底，超限批次继续复用文档级
  保存。READY-TEST-29 已完成独立回归并随本次提交交付；后续再评估批量协同性能和独立表格存储。
- 当前公式是安全的轻量计算器，不是完整 Excel 函数引擎；数组公式、数据透视表、图表、条件格式、
  复杂排序筛选和全函数集继续评估 Univer 等成熟引擎。
- 后续根据工作簿体积和 operation 数量评估是否从 `documents.content` 迁移到独立
  `document_spreadsheets` 表。
- 当前联调使用隔离 MySQL `127.0.0.1:3307/relation_test`、前端 `3000`、后端 `3001`；测试数据
  包含 `doc=1` 公式往返样本和 `doc=2` QA 基础功能样本。联调后端必须确认 `3001` 仅有一个
  最新进程，避免请求落到旧进程。
- 前端开发服务对直接 HTTP 深链 `/documents?doc=2` 返回 404，但已打开的 SPA 路由可用；
  新开测试会话从 `http://localhost:3000` 进入文档中心再打开 QA 文档。
- Chrome 自动化在文件选择器调用 `DOM.setFileInputFiles` 时返回浏览器级 `Not allowed`，因此真实
  UI 选择本地 Excel 文件仍需 QA 手工补一次；同一文件的服务端导入、导出、回读及权限矩阵已通过。

### 本轮任务文件

- `AGENTS.md`
- `handoff.md`
- `文档中心模块PRD.md`
- `文档中心-在线表格文档PRD.md`
- `server/index.js`
- `server/lib/spreadsheetWorkbookFile.js`
- `server/lib/spreadsheetWorkbookFile.test.js`
- `server/lib/spreadsheetDocumentPermissionsIntegration.test.js`
- `server/lib/spreadsheetOperations.js`
- `server/lib/spreadsheetOperations.test.js`
- `server/lib/documentCollaboration.js`
- `server/lib/documentCollaboration.test.js`
- `client/src/api/index.js`
- `client/src/components/SpreadsheetDocumentEditor.js`
- `client/src/components/SpreadsheetDocumentEditor.test.js`
- `client/src/pages/Documents.js`
- `client/src/utils/documentHistory.js`
- `client/src/utils/documentHistory.test.js`
- `client/src/utils/documentKind.js`
- `client/src/utils/documentKind.test.js`
- `client/src/utils/spreadsheetDocumentDraft.js`
- `client/src/utils/spreadsheetDocumentDraft.test.js`
- `client/src/utils/spreadsheetWorkbook.js`
- `client/src/utils/spreadsheetWorkbook.test.js`
- `client/src/utils/spreadsheetOperations.js`
- `client/src/utils/spreadsheetOperations.test.js`
- `client/src/utils/spreadsheetPresence.js`
- `client/src/utils/spreadsheetPresence.test.js`

## 上一轮：媒体管理列表体验优化

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
- 新增 `media_assets` SQLite/MySQL 兼容表，CID 以文本保存 1-20 位数字并保留前导零。
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

## 媒体管理删除权限（2026-07-23）

状态：开发和验证完成，待提交并推送。

- 媒体删除仅允许 CXO，或 `role=leader` 且在 `teams.leader_id` 中实际负责“流量商务”商务小组的用户。
- 普通管理员、媒体创建人、共享协作者、预算商务组长和其他部门组长的列表中不渲染删除入口；
  直接调用删除接口统一返回 `403`。
- 服务端列表与详情的 `can_delete` 和 DELETE 接口复用同一策略，前端仅按服务端授权展示入口。

已验证：

- 媒体权限目标测试 12/12、前端媒体工具测试 4/4 通过。
- 前端全量 23 个套件、122 条测试通过；后端 89 条已执行测试通过，3 条隔离 MySQL 测试按环境
  开关跳过。
- 隔离生产构建和前端性能门禁通过：首屏 327.9KB gzip，最大异步 chunk 420.8KB gzip。
- 生产构建页面使用 `can_delete=0` 假数据回归：编辑入口正常，删除入口数量为 0，控制台无错误。
