# 支小 HTML 日报 SelectDB 兼容数据契约

最后更新：2026-08-03

## 目标

将当前依赖浏览器导出 8 份 XLS 的 `支小数据new.html` 生成链路，升级为：

```text
Mid-Max SelectDB
-> 白名单 dataset_code 查询
-> 不可变 JSON 快照
-> 兼容物化脚本
-> 现有 HTML 生成器
-> Relation zhixiao_html_report 产物
```

一期保持 HTML 交互效果不变，包括收入汇总、应用汇总、媒体汇总、小程序详情、搜索、导出和本地密码门
移除逻辑。SelectDB 只替换数据输入层，不把模型或前端暴露给任意 SQL。

当前 Relation 支持两种 SelectDB 接入模式：

- `ZHIXIAO_REPORT_SOURCE_MODE=selectdb`：Relation 后端查询 8 个受控 dataset SQL 模板，保存 JSON 快照后
  物化为旧生成器输入。
- `ZHIXIAO_REPORT_SOURCE_MODE=generator_selectdb`：新版 `zhixiao-ai` 生成器自行运行
  `work/query_selectdb_*.mjs` helper 查询 SelectDB，Relation 负责运行生成器、导入 HTML、保存 CSV 和执行摘要。

## 必需数据集

| dataset_code | 对应旧报表 | 主要粒度 | 说明 |
| --- | --- | --- | --- |
| `zhixiao_dashboard_summary_daily` | `支小大盘汇总.xls` | 日期 | 总 UV、订单、收入、成本等大盘字段 |
| `zhixiao_new_order_daily` | `新后台订单.xls` | 日期 x 订单/备注 | 订单数、任务成本、备注、媒体和应用归因 |
| `zhixiao_app_income_daily` | `支小应用收入.xls` | 日期 x 小程序 | 小程序收入、访问 UV、灯火投放 UV、点击和曝光 |
| `zhixiao_adslot_summary_daily` | `广告位维度汇总.xls` | 日期 x 小程序 x 广告位 | 请求、填充、曝光、点击、CTR、eCPM |
| `zhixiao_media_total_daily` | `支小媒体数据.xls` | 日期 x 媒体 | 媒体访问、申请、完成、预估收入和媒体成本 |
| `zhixiao_media_task_app_daily` | `支小媒体应用任务维度.xls` | 日期 x 媒体 x 应用 x 任务 | 媒体、应用、任务维度订单和收入补充 |
| `zhixiao_app_media_share_daily` | `应用媒体数据占比 .xls` | 日期 x 应用 x 媒体 | 小程序详情里的媒体拆分 |
| `zhixiao_denghuo_adslot_daily` | `广告位维度汇总-灯火投放.xls` | 日期 x 小程序 x 广告位 | 固定 `channel=bb` 的灯火投放广告位口径 |

## SQL 模板要求

每个数据集在服务器配置目录提供一个同名 `.sql` 文件，例如：

```text
${MIDMAX_SELECTDB_TEMPLATE_DIR}/zhixiao_app_income_daily.sql
```

模板只允许使用以下参数：

- `:start_date`
- `:end_date`
- `:limit`

模板必须以 `SELECT` 或 `WITH` 开头，禁止多语句、DDL、DML、导出文件、系统库访问和未审核参数。

## 运行开关

完整运维配置见 `zhixiao-selectdb-ops.md`。核心开关如下：

启用支小 SelectDB 输入层：

```text
ZHIXIAO_REPORT_SOURCE_MODE=selectdb
MIDMAX_SELECTDB_HOST=...
MIDMAX_SELECTDB_PORT=...
MIDMAX_SELECTDB_DATABASE=...
MIDMAX_SELECTDB_USER=...
MIDMAX_SELECTDB_PASSWORD=...
MIDMAX_SELECTDB_TEMPLATE_DIR=/app/config/midmax-selectdb-sql
```

默认物化脚本为 `DaAgent/Distillation/scripts/materialize_zhixiao_selectdb_snapshots.py`，也可以用
`ZHIXIAO_SELECTDB_MATERIALIZER_PATH` 覆盖。它负责把 JSON 快照物化为当前
`generate_multi3_report_project.py` 能读取的兼容源文件；SQL 模板必须把字段别名对齐旧报表表头。等报告
生成器完成 `source-v2 -> report_model` 改造后，可以删除这层兼容物化。

## 快照产物

生成日报时会为每个数据集保存 JSON 快照，并生成 `manifest.json`：

```json
{
  "source_type": "midmax_selectdb",
  "report_date": "2026-07-31",
  "snapshot_id": "zhixiao_selectdb_2026-07-31_xxxxxxxxxxxx",
  "datasets": [
    {
      "dataset_code": "zhixiao_app_income_daily",
      "row_count": 0,
      "content_hash": "sha256..."
    }
  ]
}
```

日报完成后，Relation 的 `source_json` 和 `execution_manifest` 产物会记录 `snapshot_id`、数据集行数和
物化脚本执行摘要；`zhixiao_html_report` 仍然是移除本地密码门后的可交互 HTML。
