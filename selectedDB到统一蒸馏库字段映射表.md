# selectedDB 到统一蒸馏库字段映射表

> 版本：v1.0  
> 日期：2026-07-06  
> 适用范围：`selectedDB` 历史经营数据接入、原始快照入库、标准化事实入库

---

## 1. 文档目的

本文件用于明确 `selectedDB` 中的核心业务字段，如何映射到统一蒸馏库表结构中。

设计原则：

1. 先保留原始字段全集
2. 再做标准化映射
3. 同义字段统一成标准指标与维度
4. 一期只映射蒸馏和 Skill 真正需要的字段

---

## 2. 落表总览

`selectedDB` 接入后，主要涉及以下表：

### 2.1 来源与同步

- `ai_data_sources`
- `ai_source_sync_jobs`
- `ai_external_field_mappings`

### 2.2 原始层

- `ai_raw_records`

### 2.3 标准化事实层

- `ai_fact_metric_values`
- `ai_strategy_change_logs`

### 2.4 可选承接

- `ai_source_items`
- `ai_source_chunks`

---

## 3. 来源配置映射

### 3.1 `ai_data_sources`

| selectedDB / 接入侧字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| 固定值 `selecteddb_midmax` | 来源编码 | `ai_data_sources` | `source_code` | `selecteddb_midmax` |
| 固定值 `mid-max.selectedDB` | 来源名称 | `ai_data_sources` | `source_name` | `mid-max.selectedDB` |
| 固定值 `selecteddb` | 来源类型 | `ai_data_sources` | `source_type` | `selecteddb` |
| 固定值 `external` | 来源域 | `ai_data_sources` | `source_origin` | `external` |
| `db` / `api` / `web` | 接入方式 | `ai_data_sources` | `access_method` | `db` |
| 连接域名或别名 | 入口地址 | `ai_data_sources` | `endpoint` | `mid-max.midongtech.com` |
| 源库名 | 源数据库名 | `ai_data_sources` | `db_name` | `selectedDB` |
| 负责人姓名 | 负责人 | `ai_data_sources` | `owner_name` | `商业化数据负责人` |
| 同步频率 | 同步频率 | `ai_data_sources` | `sync_frequency` | `hourly` |
| 配置 JSON | 来源配置 | `ai_data_sources` | `config_json` | `{ "timezone": "Asia/Shanghai" }` |

---

## 4. 同步批次映射

### 4.1 `ai_source_sync_jobs`

| selectedDB / 调度字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| `job_id` | 同步任务唯一键 | `ai_source_sync_jobs` | 可写入 `run_log_json.job_id` | `selecteddb_20260706_01` |
| `job_type` | 全量 / 增量 | `ai_source_sync_jobs` | `job_type` | `incremental` |
| `trigger_mode` | 手动 / 定时 | `ai_source_sync_jobs` | `trigger_mode` | `system` |
| `window_start` | 同步开始时间窗 | `ai_source_sync_jobs` | `window_start` | `2026-07-05 00:00:00` |
| `window_end` | 同步结束时间窗 | `ai_source_sync_jobs` | `window_end` | `2026-07-06 00:00:00` |
| `status` | 执行状态 | `ai_source_sync_jobs` | `status` | `success` |
| `extract_count` | 抽取行数 | `ai_source_sync_jobs` | `raw_count` | `124580` |
| `normalized_count` | 标准化行数 | `ai_source_sync_jobs` | `normalized_count` | `119201` |
| `error_message` | 错误信息 | `ai_source_sync_jobs` | `error_message` | `NULL` |
| `job_meta_json` | 批次详情 | `ai_source_sync_jobs` | `run_log_json` | `{ "table": "report_income_day" }` |

---

## 5. 原始层映射

### 5.1 `ai_raw_records`

`selectedDB` 每条被抽取的原始记录，建议先完整落 1 条 `ai_raw_records`。

| selectedDB 字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| 组合唯一键 | 原始记录唯一键 | `ai_raw_records` | `source_record_key` | `report_income_day:2026-07-05:支小:主体A:产品B:revenue` |
| 固定值 `report_row` / `db_row` | 原始类型 | `ai_raw_records` | `raw_type` | `db_row` |
| 固定值 `application/json` | 内容类型 | `ai_raw_records` | `content_type` | `application/json` |
| 报表名 / 表名 | 标题 | `ai_raw_records` | `title` | `支小业务收入汇总` |
| 行记录序列化 | 原始文本 | `ai_raw_records` | `raw_text` | `{...}` |
| 原字段全集 | 原始结构化内容 | `ai_raw_records` | `raw_payload_json` | `{ "stat_date": "...", "income": 123 }` |
| 行哈希 | 去重辅助 | `ai_raw_records` | `payload_hash` | `sha256...` |
| `stat_date` 或 `updated_at` | 业务时间 | `ai_raw_records` | `happened_at` | `2026-07-05 00:00:00` |
| 抽取时间 | 采集时间 | `ai_raw_records` | `captured_at` | `2026-07-06 10:05:00` |

### 5.2 `raw_payload_json` 建议内容

```json
{
  "source_system": "selectedDB",
  "source_table": "report_income_day",
  "business_line": "支小",
  "granularity": "day",
  "stat_date": "2026-07-05",
  "subject_id": "s_101",
  "subject_name": "主体A",
  "product_id": "p_201",
  "product_name": "产品B",
  "media_id": "m_301",
  "media_name": "穿山甲",
  "channel_id": "c_401",
  "channel_name": "开屏",
  "metric_name": "收入",
  "metric_value": 1234.56,
  "updated_at": "2026-07-06 09:58:00",
  "source_row_json": {
    "stat_date": "2026-07-05",
    "income": 1234.56
  }
}
```

---

## 6. 标准化经营事实映射

### 6.1 `ai_fact_metric_values`

这是一期最关键的落表。

| selectedDB / 报表字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| `hour` / `day` / `week` | 统计粒度 | `ai_fact_metric_values` | `granularity` | `day` |
| `stat_date` / `stat_hour_start` | 时间窗开始 | `ai_fact_metric_values` | `window_start` | `2026-07-05 00:00:00` |
| `stat_date_end` / `stat_hour_end` | 时间窗结束 | `ai_fact_metric_values` | `window_end` | `2026-07-05 23:59:59` |
| `business_side` | 预算侧 / 流量侧 | `ai_fact_metric_values` | `business_side` | `budget` |
| `budget_side` | B端 / C端 | `ai_fact_metric_values` | `budget_side` | `c_end` |
| `business_line` / `line_name` | 业务线 | `ai_fact_metric_values` | `business_line` | `支小` |
| `subject_id` | 主体标识 | `ai_fact_metric_values` | `subject_key` | `s_101` |
| `subject_name` | 主体名称 | `ai_fact_metric_values` | `subject_name` | `主体A` |
| `product_id` / `app_id` | 产品标识 | `ai_fact_metric_values` | `product_key` | `p_201` |
| `product_name` / `app_name` | 产品名称 | `ai_fact_metric_values` | `product_name` | `产品B` |
| `media_id` | 媒体标识 | `ai_fact_metric_values` | `media_key` | `m_301` |
| `media_name` | 媒体名称 | `ai_fact_metric_values` | `media_name` | `穿山甲` |
| `channel_id` / `entry_id` | 渠道标识 | `ai_fact_metric_values` | `channel_key` | `c_401` |
| `channel_name` / `entry_name` | 渠道名称 | `ai_fact_metric_values` | `channel_name` | `开屏` |
| `experiment_id` / `strategy_version` | 实验或策略标识 | `ai_fact_metric_values` | `experiment_key` | `exp_20260705_a` |
| 标准化后的指标编码 | 指标编码 | `ai_fact_metric_values` | `metric_code` | `revenue` |
| 原始指标名称 | 指标名称 | `ai_fact_metric_values` | `metric_name` | `收入` |
| `income` / `request_cnt` / `show_cnt` 等 | 指标值 | `ai_fact_metric_values` | `metric_value` | `1234.560000` |
| 单位字段 | 单位 | `ai_fact_metric_values` | `unit` | `yuan` |
| 币种字段 | 币种 | `ai_fact_metric_values` | `currency_code` | `CNY` |
| 样本量字段 | 样本量 | `ai_fact_metric_values` | `sample_count` | `1200` |
| 扩展维度 | 额外维度 | `ai_fact_metric_values` | `extra_dimensions_json` | `{ "ad_type": "信息流" }` |
| 质量标记 | 质量标记 | `ai_fact_metric_values` | `quality_flag` | `normal` |

### 6.2 指标编码统一建议

| 原始指标名 | 建议 `metric_code` | 说明 |
|---|---|---|
| 收入 / 业务收入 | `revenue` | 金额类 |
| 请求量 / 请求数 | `request_count` | 请求类 |
| 填充量 / 填充数 | `fill_count` | 填充类 |
| 展示量 / 广告曝光 | `impression_count` | 展示类 |
| 点击量 | `click_count` | 点击类 |
| CTR / 点击率 | `ctr_percent` | 百分比 |
| eCPM | `ecpm` | 千次展示收益 |
| 完成订单数 | `completed_order_count` | 订单类 |

---

## 7. 策略变更日志映射

### 7.1 `ai_strategy_change_logs`

| selectedDB / 策略字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| `change_id` | 变更唯一键 | `ai_strategy_change_logs` | `change_key` | `chg_20260705_001` |
| `change_type` | 变更类型 | `ai_strategy_change_logs` | `change_type` | `strategy_change` |
| `business_line` | 业务线 | `ai_strategy_change_logs` | `business_line` | `支小` |
| `subject_name` | 主体 | `ai_strategy_change_logs` | `subject_name` | `主体A` |
| `product_name` | 产品 | `ai_strategy_change_logs` | `product_name` | `产品B` |
| `operator_name` | 操作人 | `ai_strategy_change_logs` | `operator_name` | `张三` |
| `before_json` | 变更前 | `ai_strategy_change_logs` | `before_payload_json` | `{...}` |
| `after_json` | 变更后 | `ai_strategy_change_logs` | `after_payload_json` | `{...}` |
| `changed_at` | 变更时间 | `ai_strategy_change_logs` | `happened_at` | `2026-07-05 14:20:00` |
| `reason` | 变更原因 | `ai_strategy_change_logs` | `change_reason` | `收入下滑应急调整` |

---

## 8. 维度字典映射

### 8.1 `ai_dimension_dictionary`

建议从 `selectedDB` 主数据或稳定维表中抽取：

| selectedDB 维度字段 | 说明 | 目标字段 | 示例 |
|---|---|---|---|
| 主体维度编码 | 维度编码 | `dimension_code` | `subject_name` |
| 主体维度名称 | 维度名称 | `dimension_name` | `主体` |
| 维度分组 | 维度分组 | `dimension_group` | `主体` |

常见建议字典项：

- `business_line`
- `subject_name`
- `product_name`
- `media_name`
- `channel_name`
- `experiment_key`

---

## 9. 指标字典映射

### 9.1 `ai_metric_dictionary`

建议从 `selectedDB` 报表口径表、指标定义表或你们现有报表口径文档中抽取：

| selectedDB / 口径字段 | 说明 | 目标字段 | 示例 |
|---|---|---|---|
| 指标编码 | 指标编码 | `metric_code` | `revenue` |
| 指标名称 | 指标名称 | `metric_name` | `收入` |
| 指标分类 | 分类 | `metric_category` | `收入` |
| 指标定义 | 定义 | `metric_definition` | `业务实际确认收入` |
| 公式说明 | 公式 | `formula_text` | `sum(income)` |
| 单位 | 单位 | `unit` | `yuan` |
| 粒度 | 粒度 | `grain` | `day` |

---

## 10. 建议的唯一键口径

### 10.1 原始层唯一键

```text
source_record_key =
  source_table + ':' + stat_date + ':' + granularity + ':' + business_line + ':' + subject_key + ':' + product_key + ':' + media_key + ':' + metric_code
```

### 10.2 事实层唯一键

直接复用现有唯一索引口径：

- `source_id`
- `granularity`
- `window_start`
- `window_end`
- `metric_code`
- `subject_key`
- `product_key`
- `media_key`
- `channel_key`
- `experiment_key`

---

## 11. 字段缺失与兼容策略

### 11.1 维度缺失

如果某张报表没有渠道或实验维度：

- 标准字段可置空
- 缺失不阻塞入库

### 11.2 指标名不统一

例如：

- `广告曝光`
- `展示量`
- `总展示`

应统一映射到同一 `metric_code`，同时保留原始 `metric_name` 以便追溯。

### 11.3 某些报表只有横表

如果源报表是：

```text
日期 | 收入 | 请求量 | 点击量
```

则需拆成 3 条长表事实：

1. `metric_code=revenue`
2. `metric_code=request_count`
3. `metric_code=click_count`

---

## 12. 一期首批推荐映射范围

建议先做下面 4 类：

1. 收入类报表
2. 投放/任务类报表
3. 媒体类报表
4. 策略/实验类变更日志

不建议一开始就做：

1. 所有历史备份表
2. 所有临时报表
3. 所有前端展示辅助字段

---

## 13. 建议配套文件

- [`selectedDB接入统一蒸馏库技术方案.md`](/Users/chenhaozan/Documents/AI/Relation/selectedDB接入统一蒸馏库技术方案.md)
- [`统一蒸馏库设计方案.md`](/Users/chenhaozan/Documents/AI/Relation/统一蒸馏库设计方案.md)
- [`sql/ai_distill_mysql.sql`](/Users/chenhaozan/Documents/AI/Relation/sql/ai_distill_mysql.sql)
