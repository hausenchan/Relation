# YYZ 业务调优交接

最后更新：2026-08-03

本文件只记录愉悦赚业务增长、数据分析、运营策略、实验和 Skill 蒸馏的当前进度。Relation 组织中台
页面、API、权限、数据库、连接器和部署等功能开发进度统一记录在仓库根目录 `handoff.md`。

## 支小 HTML 日报 SelectDB 输入层（2026-07-31）

### 已完成

- 已支持同事新版 `zhixiao-ai` 的 `generator_selectdb` 集成路线：服务器端 Agent 中台生成按钮不依赖 Codex
  MCP 会话，而是后端检查新版生成器 helper 和 SelectDB 查询配置，运行生成器，再把 HTML 导入 Relation。
- 新增本地/开发用 `YYZ/shared/tools/selectdb-query-mcp/server.mjs`，作为只读 SelectDB MCP 工具；真实凭据只放
  环境变量或未跟踪配置文件，不提交到仓库。
- `generator_selectdb` 模式会把生成器输出的 `outputs/selectdb_*` CSV 摘要、helper 状态、编译和运行摘要写入
  `source_json` 与 `execution_manifest`，方便日报详情追踪来源。
- 根据 `DaAgent/Distillation/MIDMAX_SELECTDB_DISTILLATION_ARCHITECTURE.md` 的方向，将支小同款
  `支小数据new.html` 的数据输入层设计落成首版工程骨架：SelectDB 只读连接、白名单数据集、不可变
  JSON 快照、兼容物化、旧 HTML 生成器和 Relation 展示产物分层。
- 新增 `YYZ/shared/data-contracts/midmax-selectdb/datasets.yaml` 和
  `zhixiao-html-report-compat.md`，明确 8 个支小 SelectDB 兼容数据集与旧 XLS 的对应关系、SQL 模板要求、
  运行开关和快照产物格式。
- 新增 `YYZ/shared/data-contracts/midmax-selectdb/sql/examples/`，提供 8 份按旧 XLS 表头别名输出的 SQL
  样例，供数据侧替换真实审核视图后部署。
- Relation 业务日报支小范围支持 `ZHIXIAO_REPORT_SOURCE_MODE=selectdb` 运行模式；未配置真实 SelectDB
  环境、SQL 模板或物化脚本时以明确 blocker 失败，不回退造数。
- 新增零第三方依赖的默认物化脚本 `DaAgent/Distillation/scripts/materialize_zhixiao_selectdb_snapshots.py`，
  用于把快照 rows 写成旧生成器可读取的工作簿输入；SQL 模板需负责把字段别名对齐旧 XLS 表头。
- 快照采集已补充假 connector 回归：覆盖 8 个数据集的采集顺序、manifest 与 dataset JSON 落盘、旧报表
  文件名映射、内容 hash，以及默认连接器生命周期关闭。
- 存储层已补充 SelectDB 链路回归：mock 采集 8 个数据集、运行兼容物化脚本、导入去本地密码门的
  `zhixiao_html_report`，并验证 `source_json` 和 `execution_manifest` 产物可读取。
- Relation 展示版支小 HTML 现在会额外移除 `zfb666` 密码常量；原始本地 HTML 保持不变。
- 支小 SelectDB 回归继续补齐失败路径：采集失败时默认连接器也会关闭；产物 helper 明确保留 HTML 产物
  并追加 SelectDB 来源与执行摘要。
- SelectDB runtime status 已补充缺模板、非法模板、缺物化脚本、就绪状态和密码不外泄回归；SelectDB 输入
  就绪时不依赖本地 XLS 是否存在。
- 新增 `YYZ/shared/data-contracts/midmax-selectdb/zhixiao-selectdb-ops.md`，作为运维配置说明，覆盖环境变量、
  SQL 模板部署、blocker 排查、上线校验和回滚。

### 待办

- 数据侧盘点 SelectDB 物理表和字段，补齐 8 个数据集的生产 SQL 模板；模板文件由运维部署到
  `MIDMAX_SELECTDB_TEMPLATE_DIR`，不提交真实表结构和生产样例。
- 补齐 SQL 模板，跑通默认物化脚本后对比同日浏览器 XLS 版核心指标；旧 HTML 生成器仍需满足既有
  pandas/soffice 运行条件。
- 中期把兼容物化改造成 `source-v2 -> report_model -> HTML`，彻底摆脱旧 XLS 中间形态。

## Relation 业务日报训练台账 MVP（2026-07-30）

### 已完成

- Relation 已新增 YYZ 业务日报列表、详情、编辑、修订审核、同日多次生成、七阶段执行记录、机器原稿、
  安全 HTML、软删除和恢复，具体组织中台实现见`../handoff.md`与
  `../doc/Agent中台-业务日报训练与蒸馏PRD.md`。
- 日报入口已按 YYZ 项目总览、业务线和媒体从总到分组织；业务线首期覆盖支小、H5/百度JS、CPA及
  子类、淘小、微小、宝箱/签到，媒体首期覆盖媒体大盘和爱奇艺极速版，后续媒体目录再动态补齐。
- 日报数据只写线上 MySQL；生产推荐独立`relation_ai_distill`逻辑库，未配置时为 Relation MySQL 中
  独立`ai_business_daily_*`表族，不读取本地`data.db`或`data-local.db`。
- 当前生成任务对未发布 Skill、未配置 Mid-Max 和`source-v2`执行器未就绪提供明确失败状态，不使用
  现有旧生成器输出全 0 报告。

### YYZ 待办

- 将当前候选版`yyz-dashboard-analysis`升级为可发布版本：统一`source-v2/normalized-v2`，修复旧脚本
  与真实`source.json`不兼容，缺失值改为`null + status + reason`，补齐分页采集、财务事实源和对账门禁。
- 以至少 3 个真实历史完整日期建立脱敏黄金评测集，通过后发布到 Relation AI 训练台，再接通业务日报
  的真实生成执行器。
- 真实执行器接通后继续完成数字纠错、自动重算、错误分类、准确度评分和训练候选闭环。

### 验证

- `npm run skill:check:yyz-dashboard-analysis`通过，权威源码与`.codex`运行时镜像一致。
- 未读取或改动 Mid-Max 生产数据，未连接生产/共享 MySQL 建表。

## zhixiao-ai 本机安装与试跑（2026-07-30）

### 已完成

- 将候选 `YYZ/intelligence/data-intelligence/skills/zhixiao-ai` 安装到 `/Users/chenhaozan/.codex/skills/zhixiao-ai`，并修正 active `SKILL.md`、`move_latest_download.py` 中的 Windows 旧路径为本机路径。
- 本机支小报表归档目录为 `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表`，生成项目为 `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis`，隔离 Python 依赖目录为 `/Users/chenhaozan/Documents/AI/Gcad/adOpt/.codex-tmp/pydeps`。
- 已通过 Chrome 登录态导出 8 份支小 XLS 并归档；生成 `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/支小数据new.html`，最新数据日期为 `2026-07-30`。
- Relation 业务日报已接入支小本地 HTML 展示：创建`business_line:ZHIXIAO`范围日报时读取本机
  `支小数据new.html`，导入入库版本移除`zfb666`本地密码门，详情页独立“支小业务”Tab 展示；原始本地
  HTML 仍保持旧密码门，Relation 访问改由菜单权限和`business_daily_report`敏感模块权限控制。
- Relation 支小范围“生成日报”按钮已接入本机生成器链路：点击后会检查 8 份固定源报表，运行
  `generate_multi3_report_project.py`编译检查和生成，再导入新 HTML；支小 runtime status 不再显示
  `yyz-dashboard-analysis`未发布或 Mid-Max 只读源未配置的黄色阻断。

### 验证

- `move_latest_download.py --help` 通过；`quick_validate.py /Users/chenhaozan/.codex/skills/zhixiao-ai` 通过。
- bundled Python 加 `PYTHONPATH=/Users/chenhaozan/Documents/AI/Gcad/adOpt/.codex-tmp/pydeps` 可导入 `pandas/xlrd/openpyxl/yaml`。
- `generate_multi3_report_project.py` 编译和运行通过；HTML 包含 `APP_INCOME_DETAIL_DATA`、`APP_DELIVERY_DETAIL_DATA`、`AD_DETAIL_DATA`、`MEDIA_DETAIL_DATA`、`ORDER_DETAIL_DATA`、`zfb_pass_multi_2026-07-30` 和 `zfb666`。
- Relation 接入验证：`node --test server/lib/businessDailyReports.test.js`通过 8/8，`node --check server/index.js`
  与`server/lib/businessDailyReports.js`通过，`BUILD_PATH=/tmp/relation-business-daily-zhixiao-build npm run build`
  和同路径`npm run performance:budget`通过。
- 按钮执行器接入验证：`node --check server/index.js`通过，`node --test server/lib/businessDailyReports.test.js`
  通过 8/8，`BUILD_PATH=/tmp/relation-business-daily-zhixiao-runner-build npm run build`和同路径
  `npm run performance:budget`通过。

### 风险与待办

- 当前生成脚本仍是旧版主体逻辑，投放成本仍读取 `投放成本.xlsx`，尚未真正接入 `E/gcad` 指南中的灯火返点后 CSV、`支小媒体数据.xls` 与 `支小媒体应用任务维度.xls` 的新版媒体汇总逻辑。
- 2026-07-30 的 `支小应用收入.xls` 中收入为 0，生成结果显示 `总收入=0`、`总毛利=-7816.77`；需按线上报表口径确认是否为当日数据尚未回补或筛选窗口问题。
- 尚未在隔离 MySQL 中通过 HTTP 创建支小业务日报并做浏览器页面验收；下一步需确认“支小业务”Tab
  无密码输入且交互脚本正常运行。
- 当前 Web 按钮只负责基于已有本机源报表运行生成器并导入 HTML，尚未自动操作 Chrome 导出 Mid-Max
  XLS；源文件缺失时会明确失败，仍需人工或 Codex Chrome 自动化先完成导出。

## 当前任务

状态：已通过授权浏览器读取 Mid-Max 线上报表并完成首份 `2026-07-25` YYZ 项目级临时分析报告；
经营罗盘与多张诊断报表存在重大口径差异，数据质量门禁未通过，尚未执行生产策略或自动放量。

目标：以 Mid-Max 线上经营、业务线和用户行为数据为事实基础，结合 Relation 文档中的需求与策略，
建立“数据诊断 -> 增长策略 -> 实验验证 -> 复盘 -> Skill 蒸馏 -> 组织 Agent 中台发布”的持续闭环。

## 已完成

- 新建 `YYZ/AGENTS.md`，定义 YYZ 增长总调度员。
- 固化愉悦赚 SDK、H5 + 回调、媒体流量、上游预算、媒体结算和用户奖励的商业模式。
- 固化收入、成本、毛利、毛利率、DAU、申请 UV、完成 UV、订单和广告行为漏斗的基础口径。
- 记录 Part 1 大盘、Part 2 具体业务线、Part 3 用户行为三层报表框架。
- 定义数据、预算、媒体、产品、用户、实验风控和 Skill 蒸馏角色。
- 定义 YYZ 诊断流程、增长策略框架、输出格式和组织 Agent 中台发布流程。
- 将 YYZ 业务进度与根目录 Relation 功能开发进度拆分为两个 handoff。
- 新建 `docs/YYZ增长组织与多Agent协同PRD.md`，定义十个 Agent、目标目录、组织支持请求、Codex
  对话设计、协同协议和分阶段落地方案。
- 将原有 CamelCase 空目录迁移为小写短横线的能力域结构，并移除旧空目录。
- 建立预算供给、媒体供给、商业化运营、数据智能、竞品情报、增长策略、媒体增长、预算产品接入和
  YYZ 核心产品九个领域 `AGENTS.md`。
- 建立核心指标契约、数据契约约束、`DomainTaskRequest v1`、`OrgSupportRequest v1`、组织服务目录
  和生产配置分级审批策略。
- 明确 Agent 数量由九个调整为十个：一个 YYZ 总调度加九个领域 Agent。
- 首个核心闭环媒体确定为爱奇艺极速版；首份项目报告选择 2026-07-25，支小作为优先下钻业务线。
- 将 `yyz-dashboard-analysis` `0.1.0` 权威源码迁入数据智能领域，增加版本清单、镜像同步和漂移检查；
  `.codex` 运行镜像保持可发现且与源码树校验值一致。
- 将 Skill 本地输入和报告统一迁到 `YYZ/outputs/yyz-dashboard-analysis/`，并用合成数据完成报告烟测。
- 将项目级报告框架扩展到支小、H5/百度 JS、CPA 三个子类、淘小、微小及宝箱/签到；明确宝箱和签到
  是纳入项目毛利的用户运营成本枚举，不参与真实预算收入、毛利率和 ROI 排名。
- 通过 Mid-Max 线上报表采集 `2026-07-25`、`2026-07-24` 及可用近 7 日诊断口径数据，生成首份项目级
  报告：`YYZ/outputs/yyz-dashboard-analysis/2026-07-25/report.html`。
- 同步生成 `source.json`、`normalized.json` 和 `decision.md`，完成 JSON 语法、关键数字、成本桥接和
  HTML 锚点校验；输出目录受 `.gitignore` 保护，不提交线上经营快照。
- 首份报告确认目标日大盘收入 127,189.46 元、成本 50,691.16 元、毛利 76,498.30 元；估算毛利
  日环比减少约 4,598 元，爱奇艺极速版约贡献 74.5% 的媒体侧缺口，支小是业务线侧第一拖累。
- 识别 P0 数据问题：经营罗盘与 YYZ 综合明细同日毛利相差 7,191.43 元；H5、CPA 和用户行为口径
  也未对齐，支小应用收入报表在目标窗口无数据，媒体 x 业务线仅抽取前 100/206 行。
- 完成`../doc/Agent中台-业务日报训练与蒸馏PRD.md`的 YYZ 接入设计：机器原稿、人工修订、结构化纠错、
  错误分类、质量评分和同日期 Skill 版本回放形成训练闭环；删除日报只做可恢复软删除。

## 当前数据与工具状态

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| Mid-Max 大盘报表 | 已完成 7 月 25 日线上取数 | `dashboard-business-compass` 暂作为管理财务事实源 |
| 具体业务线报表 | 已读取主要汇总和部分明细 | 支小应用收入无数据，H5/CPA 与大盘口径待对账 |
| 用户行为报表 | 已完成目标日与 D-1 取数 | 用于诊断，不替代财务事实；UV 口径待对齐 |
| Relation 文档 | 待建立 YYZ 需求/策略文档清单 | 通过线上 API 或授权 Agent 工具读取 |
| Gitee 项目 | 待建立 YYZ 相关项目与代码边界 | 默认只读，用于核对埋点、回调和配置实现 |
| 浏览器/MCP | 已验证授权浏览器线上取数 | 后续仍需稳定只读 API 和字段文档 |
| 领域 Agent 目录 | 已建立 | 十个 Agent 中根总调度和九个领域 Agent 已有目录级指令 |
| 任务协议 | YYZ v1 已建立 | 组织中台暂无统一协议，后续做字段映射 |
| 生产配置权限 | MVP 已定义 | Agent 只读和出草案，生产变更由人工审批和执行 |
| `yyz-dashboard-analysis` | 权威源码和 Codex 镜像已同步 | `0.2.0` 项目级框架已固化，历史业务准确率待评测 |

不得使用本地 `data.db`、`data-local.db` 代替线上经营数据。当前没有在本文件中记录或验证任何生产
账号、Token、Cookie、密码或个人敏感数据。

## 下一步

1. P0 对齐经营罗盘、综合报表、H5 和 CPA 的收入确认、媒体成本、补数及日期归因，形成字段级桥接表。
2. P0 补齐爱奇艺极速版的小时、入口/CID、端、版本、媒体单价和预算组合变化，定位约 14% 的流量下滑。
3. P0 下钻支小应用、广告位、灯火 eCPM、广告展示深度、回调和核减，解释收入/任务 UV 下降约 3.90%。
4. P0 核查 CPA-API 单订单收入、成本、结算和核减，并确认爱奇艺 x 微小 3,603 申请 UV、0 完成 UV。
5. 补采 2026-07-18、近 30 日和 2026-04-01..2026-06-30 历史窗口，再确定异常阈值和放量幅度。
6. 对宝箱和签到设计 5%-10% 随机对照，以增量项目毛利覆盖运营成本作为成功条件。
7. 使用历史日期回放评测 `yyz-dashboard-analysis`，记录取数、口径、归因和数字忠实度准确率。
8. 设计 Relation Skill 不可变包发布 API，接收版本、来源提交号、树校验值、评测结果和发布人。
9. 配合 Relation 业务日报模块输出稳定`report_model.json`、HTML 和训练差异，首期只接已发布 Skill 版本。

## 当前实验

暂无正在运行的正式实验。启动实验后使用下表持续更新：

| 实验 ID | 假设 | 范围 | 核心指标 | 止损条件 | 状态 | 结果/复盘 |
| --- | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | 未开始 | - |

## Skill 进度

| Skill Code | 阶段 | 当前准确率 | 最近评测 | 下一步 |
| --- | --- | ---: | --- | --- |
| `yyz-dashboard-analysis` | Codex 候选 `0.2.0` | 待评测 | 同步测试和合成报告烟测通过 | 使用授权历史数据回放，再设计 Relation 发布 |

## 阻塞与风险

- Mid-Max 稳定只读 API、字段文档和生产授权尚未在 YYZ 目录中落档。
- Part 1 至 Part 3 可能存在更新时间、去重和财务归因差异，正式策略前必须先对账。
- 当前商业案例中的 CPM、广告次数、媒体单价、金币汇率和用户分成只是解释示例，不能作为实时配置。
- Skill 未建立固定评测集前，不得把单次分析表现当作稳定准确率。
- 当前报告未采集 30 日、4-6 月历史、配置、发布和结算变更证据，因果结论均保持为待验证假设。
- 当前 Skill 的旧 HTML 生成器与首份项目级`source.json`结构不兼容，真实日报接入前必须完成可复跑改造。
- 本地报告无法通过当前浏览器的 `file://` 访问策略执行截图验收；已完成结构、锚点和响应式 CSS 静态校验。
- Relation 尚无统一 Agent 任务协议和 Skill 包发布 API，当前只完成 YYZ v1 契约。

## 交接更新规则

每次 YYZ 任务结束时只更新发生变化的部分：

1. 当前任务状态与下一个明确动作。
2. 使用的数据窗口、统计截止时间和数据质量限制。
3. 已执行策略、实验状态、结果和止损情况。
4. Skill 版本、评测结果、准确率和发布状态。
5. 新增阻塞、风险和所需授权。

稳定不变的商业模式、指标定义和工作方法应更新 `YYZ/AGENTS.md`，不要长期堆在本文件中。
