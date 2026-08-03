# 支小日报 SelectDB 运行配置说明

最后更新：2026-08-03

## 目标

本文给运维和数据侧配置 Relation 支小业务日报的 SelectDB 输入层。当前支持两种模式：

1. `selectdb`：Relation 后端采集 8 个 SelectDB dataset JSON 快照，物化为旧生成器输入。
2. `generator_selectdb`：新版 `zhixiao-ai` 生成器自行调用 `work/query_selectdb_*.mjs` helper 查询 SelectDB，
   Relation 后端只检查运行条件、执行生成器并导入 HTML。

`selectdb` 模式链路：

```text
Mid-Max SelectDB -> JSON 快照 -> 兼容物化 -> 现有 HTML 生成器 -> Relation 展示产物
```

`generator_selectdb` 模式链路：

```text
新版 zhixiao-ai 生成器 -> query_selectdb_*.mjs -> SelectDB -> CSV/log -> 支小数据new.html -> Relation 展示产物
```

配置未完成时，生成任务必须以明确 blocker 失败，不回退造数，也不要求本地浏览器导出的 8 份 XLS。

## 必需环境变量

### 快照物化模式

```bash
ZHIXIAO_REPORT_SOURCE_MODE=selectdb

MIDMAX_SELECTDB_HOST=<selectdb-host>
MIDMAX_SELECTDB_PORT=3306
MIDMAX_SELECTDB_DATABASE=<database>
MIDMAX_SELECTDB_USER=<readonly-user>
MIDMAX_SELECTDB_PASSWORD=<readonly-password>
MIDMAX_SELECTDB_TEMPLATE_DIR=/app/config/midmax-selectdb-sql

ZHIXIAO_SELECTDB_SNAPSHOT_DIR=/app/data/zhixiao-selectdb-snapshots
ZHIXIAO_SELECTDB_MATERIALIZER_PATH=/app/DaAgent/Distillation/scripts/materialize_zhixiao_selectdb_snapshots.py

ZHIXIAO_REPORT_PROJECT_DIR=/app/dataAnalysis
ZHIXIAO_REPORT_SOURCE_DIR=/app/data/zhixiao-legacy-source
ZHIXIAO_REPORT_GENERATOR_PATH=/app/dataAnalysis/generate_multi3_report_project.py
ZHIXIAO_REPORT_HTML_PATH=/app/dataAnalysis/支小数据new.html
ZHIXIAO_REPORT_PYTHON=python3
```

### 新版生成器直连模式

```bash
ZHIXIAO_REPORT_SOURCE_MODE=generator_selectdb

MIDMAX_SELECTDB_HOST=<selectdb-host>
MIDMAX_SELECTDB_PORT=9030
MIDMAX_SELECTDB_DATABASE=<database>
MIDMAX_SELECTDB_USER=<readonly-user>
MIDMAX_SELECTDB_PASSWORD=<readonly-password>

ZHIXIAO_REPORT_PROJECT_DIR=/app/dataAnalysis
ZHIXIAO_REPORT_GENERATOR_PATH=/app/dataAnalysis/generate_multi3_report_project.py
ZHIXIAO_REPORT_HTML_PATH=/app/dataAnalysis/支小数据new.html
ZHIXIAO_REPORT_PYTHON=python3
```

如果本地 Codex skill helper 仍读取 MCP 配置文件，可额外配置：

```bash
SELECTDB_QUERY_MCP_CONFIG_PATH=/app/config/selectdb-query-mcp/.mcp.json
```

该配置文件只能放在服务器密钥或未跟踪配置目录中，不得提交真实账号密码。仓库内只提供示例：
`YYZ/shared/tools/selectdb-query-mcp/.mcp.example.json`。

可选变量：

- `MIDMAX_SELECTDB_QUERY_TIMEOUT_MS`：单次查询超时，默认 `30000`。
- `MIDMAX_SELECTDB_POOL_SIZE`：连接池大小，默认 `2`。
- `MIDMAX_SELECTDB_MAX_RANGE_DAYS`：单次查询最大日期范围，默认 `62`。
- `MIDMAX_SELECTDB_MAX_ROWS`：单个数据集最大返回行数，默认 `50000`。
- `ZHIXIAO_SELECTDB_MATERIALIZER_COMMAND`：覆盖物化脚本执行命令。
- `ZHIXIAO_SELECTDB_MATERIALIZER_TIMEOUT_MS`：物化超时，默认跟生成队列一致。
- `ZHIXIAO_REPORT_PYTHONPATH`：旧 HTML 生成器需要额外 Python 依赖时配置。
- `ZHIXIAO_REPORT_GENERATOR_TIMEOUT_MS`：旧 HTML 生成器超时，默认 `300000`。
- `ZHIXIAO_REPORT_GENERATOR_LOG_PATH`：新版生成器输出 JSON 日志时配置，Relation 会写入执行摘要。
- `ZHIXIAO_SELECTDB_OUTPUT_DIR`：新版生成器 SelectDB CSV 输出目录，默认
  `ZHIXIAO_REPORT_PROJECT_DIR/outputs`。

## SQL 模板部署

`MIDMAX_SELECTDB_TEMPLATE_DIR` 下必须提供 8 个 `.sql` 文件，文件名与 dataset code 完全一致：

```text
zhixiao_dashboard_summary_daily.sql
zhixiao_new_order_daily.sql
zhixiao_app_income_daily.sql
zhixiao_adslot_summary_daily.sql
zhixiao_media_total_daily.sql
zhixiao_media_task_app_daily.sql
zhixiao_app_media_share_daily.sql
zhixiao_denghuo_adslot_daily.sql
```

可以参考 `YYZ/shared/data-contracts/midmax-selectdb/sql/examples/*.sql.example`，但生产模板必须由数据侧把
占位视图名替换为已审核的 SelectDB 表或视图。模板需满足：

- 只能是 `SELECT` 或 `WITH`。
- 只能使用 `:start_date`、`:end_date`、`:limit` 三个参数。
- 禁止多语句、DDL、DML、导入导出文件和未审核参数。
- 字段别名必须对齐旧 XLS 表头，物化脚本不会猜测字段含义。
- 不提交真实物理表清单、生产样例行、账号密码或 Token。

`generator_selectdb` 模式不要求 `MIDMAX_SELECTDB_TEMPLATE_DIR` 的 8 份 `.sql` 模板，但要求
`ZHIXIAO_REPORT_PROJECT_DIR/work/` 下存在新版 skill 声明的 8 个 helper：

```text
query_selectdb_app_income.mjs
query_selectdb_overview.mjs
query_selectdb_task_orders.mjs
query_selectdb_adslot.mjs
query_selectdb_delivery_link.mjs
query_selectdb_media_proportion.mjs
query_selectdb_media_total.mjs
query_selectdb_media_task.mjs
```

这些 helper 必须只使用只读 SelectDB 查询，并把 CSV 输出到 `outputs/selectdb_*` 文件。

## SelectDB Query MCP

仓库提供一个本地/开发用只读 MCP 工具：

```bash
node YYZ/shared/tools/selectdb-query-mcp/server.mjs --check-config
node YYZ/shared/tools/selectdb-query-mcp/server.mjs
```

它只暴露 `selectdb_query` 工具，禁止非 `SELECT/WITH`、多语句、DDL、DML、`outfile/infile` 等操作。
生产业务日报按钮不依赖 Codex MCP 会话；服务器端优先用环境变量让新版生成器 helper 直连只读 SelectDB。

## Runtime Status 判定

支小范围 runtime status 会在 SelectDB 模式下返回：

- `local_runtime.source_mode=selectdb`。
- `selectdb_runtime.datasets[]`：每个数据集 SQL 模板状态。
- `selectdb_runtime.missing_env_keys`：缺失的 SelectDB 环境变量名，不包含密码值。
- `selectdb_runtime.materializer`：物化脚本文件名、命令和存在性。
- `generator_selectdb_runtime.helpers[]`：新版生成器 helper 文件状态。
- `generator_selectdb_runtime.mcp_config`：MCP 配置文件是否配置和存在，不返回密码。
- `generator_selectdb_runtime.missing_env_keys`：缺失的 SelectDB 环境变量名，不包含密码值。
- `blockers[]`：阻断生成的错误码和说明。

常见 blocker：

| code | 含义 | 处理 |
| --- | --- | --- |
| `MIDMAX_SELECTDB_NOT_CONFIGURED` | SelectDB 连接环境变量缺失 | 补齐 `MIDMAX_SELECTDB_*` |
| `MIDMAX_SELECTDB_TEMPLATES_MISSING` | 一个或多个 `.sql` 模板缺失 | 在模板目录部署同名文件 |
| `MIDMAX_SELECTDB_TEMPLATE_INVALID` | 模板不是受控只读 SQL | 修正为白名单 SELECT/WITH 模板 |
| `ZHIXIAO_SELECTDB_MATERIALIZER_NOT_CONFIGURED` | 物化脚本不存在 | 部署脚本或修正路径 |
| `ZHIXIAO_SELECTDB_HELPERS_MISSING` | 新版生成器 helper 缺失 | 部署 `work/query_selectdb_*.mjs` |
| `SELECTDB_QUERY_MCP_NOT_CONFIGURED` | 新版 helper 查询配置缺失 | 配置 `MIDMAX_SELECTDB_*` 或未跟踪 MCP 配置 |
| `SELECTDB_QUERY_MCP_CONFIG_NOT_FOUND` | 指定的 MCP 配置文件不存在 | 修正 `SELECTDB_QUERY_MCP_CONFIG_PATH` |
| `ZHIXIAO_GENERATOR_NOT_FOUND` | 旧 HTML 生成器不存在 | 部署 `generate_multi3_report_project.py` |

SelectDB 模式下，本地 8 份 XLS 是否存在不作为 blocker；它们会由快照物化脚本生成或覆盖到
`ZHIXIAO_REPORT_SOURCE_DIR`。

`generator_selectdb` 模式下，本地已迁移的 7 份旧 XLS 不作为 blocker；仍需按新版生成器要求准备
`旧后台订单.xlsx`、`广告位维度汇总-灯火投放.xls`、`支小用户漏斗.xlsx` 等少量保留源表。runtime status
会展示这些文件的存在状态，生成器是否硬性依赖以脚本实际逻辑为准。

## 上线校验

1. 确认 SelectDB 账号只有必要表或视图的 `SELECT` 权限。
2. 部署 8 个 SQL 模板，并通过 runtime status 确认所有数据集为 `ready`。
3. 确认 `ZHIXIAO_SELECTDB_SNAPSHOT_DIR` 和 `ZHIXIAO_REPORT_SOURCE_DIR` 可写。
4. 确认物化脚本和旧 HTML 生成器在服务容器内可执行。
5. 在隔离日期点击支小业务“生成日报”，检查执行步骤：
   - collecting: `source=midmax_selectdb`
   - validating_source: 无缺失模板
   - normalizing: 有 `snapshot_id` 和 `dataset_count=8`
   - rendering: `artifact_type=zhixiao_html_report`
6. 打开 Relation 详情页，确认支小业务 Tab 无本地密码输入框；`source_json` 与 `execution_manifest` 可读取。

`generator_selectdb` 模式额外检查：

1. `work/query_selectdb_*.mjs` 共 8 个 helper 均存在。
2. `MIDMAX_SELECTDB_*` 环境变量或未跟踪 MCP 配置已在服务器上生效。
3. 点击支小业务“生成日报”后，执行步骤：
   - collecting: `source=generator_selectdb`
   - validating_source: `ready_helper_count=8`
   - normalizing: `csv_count` 大于 0，或按生成器日志说明对应日期无数据
   - rendering: `artifact_type=zhixiao_html_report`
4. `source_json` 包含 `type=zhixiao_generator_selectdb`、CSV 文件摘要和 helper 状态。
5. `execution_manifest` 包含生成器编译、运行和 HTML 更新时间摘要。

## 回滚

如需临时回到本地 XLS 方式：

```bash
ZHIXIAO_REPORT_SOURCE_MODE=local_xls
```

回滚后 runtime status 会重新检查 `ZHIXIAO_REPORT_SOURCE_DIR` 下的 8 份旧报表文件。
