# 支小日报 SelectDB 运行配置说明

最后更新：2026-07-31

## 目标

本文给运维和数据侧配置 Relation 支小业务日报的 SelectDB 输入层。配置完成后，业务日报的支小范围
`business_line:ZHIXIAO` 会走：

```text
Mid-Max SelectDB -> JSON 快照 -> 兼容物化 -> 现有 HTML 生成器 -> Relation 展示产物
```

配置未完成时，生成任务必须以明确 blocker 失败，不回退造数，也不要求本地浏览器导出的 8 份 XLS。

## 必需环境变量

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

可选变量：

- `MIDMAX_SELECTDB_QUERY_TIMEOUT_MS`：单次查询超时，默认 `30000`。
- `MIDMAX_SELECTDB_POOL_SIZE`：连接池大小，默认 `2`。
- `MIDMAX_SELECTDB_MAX_RANGE_DAYS`：单次查询最大日期范围，默认 `62`。
- `MIDMAX_SELECTDB_MAX_ROWS`：单个数据集最大返回行数，默认 `50000`。
- `ZHIXIAO_SELECTDB_MATERIALIZER_COMMAND`：覆盖物化脚本执行命令。
- `ZHIXIAO_SELECTDB_MATERIALIZER_TIMEOUT_MS`：物化超时，默认跟生成队列一致。
- `ZHIXIAO_REPORT_PYTHONPATH`：旧 HTML 生成器需要额外 Python 依赖时配置。
- `ZHIXIAO_REPORT_GENERATOR_TIMEOUT_MS`：旧 HTML 生成器超时，默认 `300000`。

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

## Runtime Status 判定

支小范围 runtime status 会在 SelectDB 模式下返回：

- `local_runtime.source_mode=selectdb`。
- `selectdb_runtime.datasets[]`：每个数据集 SQL 模板状态。
- `selectdb_runtime.missing_env_keys`：缺失的 SelectDB 环境变量名，不包含密码值。
- `selectdb_runtime.materializer`：物化脚本文件名、命令和存在性。
- `blockers[]`：阻断生成的错误码和说明。

常见 blocker：

| code | 含义 | 处理 |
| --- | --- | --- |
| `MIDMAX_SELECTDB_NOT_CONFIGURED` | SelectDB 连接环境变量缺失 | 补齐 `MIDMAX_SELECTDB_*` |
| `MIDMAX_SELECTDB_TEMPLATES_MISSING` | 一个或多个 `.sql` 模板缺失 | 在模板目录部署同名文件 |
| `MIDMAX_SELECTDB_TEMPLATE_INVALID` | 模板不是受控只读 SQL | 修正为白名单 SELECT/WITH 模板 |
| `ZHIXIAO_SELECTDB_MATERIALIZER_NOT_CONFIGURED` | 物化脚本不存在 | 部署脚本或修正路径 |
| `ZHIXIAO_GENERATOR_NOT_FOUND` | 旧 HTML 生成器不存在 | 部署 `generate_multi3_report_project.py` |

SelectDB 模式下，本地 8 份 XLS 是否存在不作为 blocker；它们会由快照物化脚本生成或覆盖到
`ZHIXIAO_REPORT_SOURCE_DIR`。

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

## 回滚

如需临时回到本地 XLS 方式：

```bash
ZHIXIAO_REPORT_SOURCE_MODE=local_xls
```

回滚后 runtime status 会重新检查 `ZHIXIAO_REPORT_SOURCE_DIR` 下的 8 份旧报表文件。
