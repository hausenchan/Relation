# Wolai 到统一蒸馏库字段映射表

> 版本：v1.0  
> 日期：2026-07-03  
> 适用范围：Wolai 文档迁移、原始入库、标准化入库

---

## 1. 文档目的

本文件用于明确 Wolai 文档迁移时，原始字段、采集字段与统一蒸馏库落表字段之间的映射关系。

设计原则：

1. 先保留原始信息，再做标准化
2. 不强依赖 Wolai 内部私有字段
3. 即使部分字段暂时采不到，也要预留映射口径
4. 文档类来源优先落 `ai_raw_records`、`ai_source_items`、`ai_source_chunks`

---

## 2. 落表总览

Wolai 文档迁移，主要涉及以下表：

### 2.1 接入与批次

- `ai_data_sources`
- `ai_source_sync_jobs`

### 2.2 原始层

- `ai_raw_records`

### 2.3 标准化层

- `ai_source_items`
- `ai_source_chunks`

### 2.4 后续可关联

- `ai_knowledge_assets`
- `ai_knowledge_links`

---

## 3. 来源配置映射

### 3.1 `ai_data_sources`

| Wolai / 迁移侧字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| 固定值 `wolai` | 来源编码 | `ai_data_sources` | `source_code` | `wolai_main` |
| Wolai 空间名 | 来源名称 | `ai_data_sources` | `source_name` | `商业化策略空间` |
| 固定值 `external_doc` 或 `org_doc` | 来源类型 | `ai_data_sources` | `source_type` | `external_doc` |
| 固定值 `external` | 来源来源域 | `ai_data_sources` | `source_origin` | `external` |
| `export` / `web` | 接入方式 | `ai_data_sources` | `access_method` | `web` |
| Wolai 域名 / 入口地址 | 入口地址 | `ai_data_sources` | `endpoint` | `https://www.wolai.com/` |
| 负责人ID | 负责人ID | `ai_data_sources` | `owner_id` | `12` |
| 负责人姓名 | 负责人姓名 | `ai_data_sources` | `owner_name` | `张三` |
| 同步频率 | 同步频率 | `ai_data_sources` | `sync_frequency` | `manual` |
| 配置JSON | 来源配置 | `ai_data_sources` | `config_json` | `{...}` |

---

## 4. 迁移批次映射

### 4.1 `ai_source_sync_jobs`

| 迁移批次字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| `batch_no` | 批次编号 | `ai_source_sync_jobs` | 可写入 `run_log_json.batch_no` | `wolai_20260703_01` |
| 导入方式 | 全量 / 增量 | `ai_source_sync_jobs` | `job_type` | `full` |
| 触发方式 | 手动 / 定时 | `ai_source_sync_jobs` | `trigger_mode` | `manual` |
| 开始时间 | 采集开始时间 | `ai_source_sync_jobs` | `started_at` | `2026-07-03 10:00:00` |
| 结束时间 | 采集结束时间 | `ai_source_sync_jobs` | `finished_at` | `2026-07-03 10:30:00` |
| 原始文档数 | 原始记录数 | `ai_source_sync_jobs` | `raw_count` | `256` |
| 标准化成功数 | 标准化数量 | `ai_source_sync_jobs` | `normalized_count` | `248` |
| 执行状态 | 状态 | `ai_source_sync_jobs` | `status` | `success` |
| 错误信息 | 失败信息 | `ai_source_sync_jobs` | `error_message` | `部分附件下载失败` |
| 批次元数据 | 批次详情 | `ai_source_sync_jobs` | `run_log_json` | `{ "workspace": "...", "folder": "..." }` |

---

## 5. 原始层映射

### 5.1 `ai_raw_records`

这是 Wolai 文档迁移最关键的一层。

| Wolai / 采集字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| 页面唯一标识 | 文档唯一键 | `ai_raw_records` | `source_record_key` | `wolai_page_123456` |
| 固定值 `document` | 原始类型 | `ai_raw_records` | `raw_type` | `document` |
| 采集格式 | 内容类型 | `ai_raw_records` | `content_type` | `text/html` |
| 页面标题 | 标题 | `ai_raw_records` | `title` | `预算诊断 SOP` |
| 正文纯文本 | 原始文本 | `ai_raw_records` | `raw_text` | `...` |
| 原始HTML / 导出JSON | 原始结构化快照 | `ai_raw_records` | `raw_payload_json` | `{ "html": "...", "blocks": [...] }` |
| 内容哈希 | 去重辅助 | `ai_raw_records` | `payload_hash` | `sha256...` |
| 页面更新时间 | 业务时间 | `ai_raw_records` | `happened_at` | `2026-06-28 18:00:00` |
| 实际采集时间 | 采集时间 | `ai_raw_records` | `captured_at` | `2026-07-03 10:05:00` |

### 5.2 建议写入 `raw_payload_json` 的结构

建议至少包含：

```json
{
  "source_system": "wolai",
  "workspace_name": "商业化策略空间",
  "folder_path": "策略/SOP/预算",
  "page_url": "https://...",
  "page_title": "预算诊断 SOP",
  "author_name": "张三",
  "created_at": "2026-04-03 10:00:00",
  "updated_at": "2026-06-28 18:00:00",
  "tags": ["预算", "诊断"],
  "html": "<div>...</div>",
  "attachments": [
    {
      "name": "预算口径.xlsx",
      "url": "https://...",
      "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  ],
  "images": [
    {
      "url": "https://...",
      "alt": ""
    }
  ]
}
```

---

## 6. 标准化来源项映射

### 6.1 `ai_source_items`

每篇 Wolai 文档通常对应 1 条 `ai_source_items`。

| Wolai / 标准化字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| 页面唯一标识 | 标准来源项唯一键 | `ai_source_items` | `item_key` | `wolai:page:123456` |
| 固定值 `document` / `case` / `meeting` | 文档类型 | `ai_source_items` | `item_type` | `document` |
| 固定值 `wolai` | 来源模块 | `ai_source_items` | `source_module` | `wolai` |
| 页面标题 | 标题 | `ai_source_items` | `title` | `预算诊断 SOP` |
| 自动摘要 | 摘要 | `ai_source_items` | `summary` | `用于预算异常诊断...` |
| 作者ID | 作者ID | `ai_source_items` | `author_id` | `NULL` |
| 作者姓名 | 作者姓名 | `ai_source_items` | `author_name` | `张三` |
| 负责人ID | 负责人ID | `ai_source_items` | `owner_id` | `12` |
| 负责人姓名 | 负责人姓名 | `ai_source_items` | `owner_name` | `张三` |
| 共享范围 | 可见范围 | `ai_source_items` | `visibility_scope_json` | `{ "workspace": "...", "members": [...] }` |
| 标签列表 | 标签 | `ai_source_items` | `tags_json` | `["预算","诊断"]` |
| 原始URL | 来源URL | `ai_source_items` | `source_url` | `https://...` |
| 更新时间 | 业务时间 | `ai_source_items` | `happened_at` | `2026-06-28 18:00:00` |
| 发布时间或创建时间 | 发布时间 | `ai_source_items` | `published_at` | `2026-04-03 10:00:00` |
| 状态 | 状态 | `ai_source_items` | `status` | `active` |
| 额外元数据 | 扩展信息 | `ai_source_items` | `extra_json` | `{ "workspace_name": "...", "folder_path": "..." }` |

### 6.2 `extra_json` 建议内容

```json
{
  "source_system": "wolai",
  "workspace_name": "商业化策略空间",
  "folder_path": "策略/SOP/预算",
  "doc_type_guess": "sop",
  "attachment_count": 2,
  "image_count": 3,
  "table_count": 1
}
```

---

## 7. 文本分片映射

### 7.1 `ai_source_chunks`

每篇文档标准化后，按标题、段落、表格等拆成多条 chunk。

| Wolai / 标准化字段 | 说明 | 目标表 | 目标字段 | 示例 |
|---|---|---|---|---|
| 所属页面 | 来源项ID | `ai_source_chunks` | `source_item_id` | `123` |
| 分片序号 | 序号 | `ai_source_chunks` | `chunk_index` | `1` |
| 分片类型 | text/table/list | `ai_source_chunks` | `chunk_type` | `table` |
| 标题路径 | 层级路径 | `ai_source_chunks` | `heading_path` | `一级标题 > 二级标题` |
| 分片正文 | 内容 | `ai_source_chunks` | `content` | `...` |
| token估算 | token数 | `ai_source_chunks` | `token_estimate` | `320` |
| 字符数 | 字符数 | `ai_source_chunks` | `char_count` | `580` |
| 起始偏移 | 位置 | `ai_source_chunks` | `start_offset` | `0` |
| 结束偏移 | 位置 | `ai_source_chunks` | `end_offset` | `580` |
| chunk哈希 | 去重 | `ai_source_chunks` | `chunk_hash` | `sha256...` |
| 表格 / 图片 / 附件信息 | 附加信息 | `ai_source_chunks` | `meta_json` | `{...}` |

### 7.2 `chunk_type` 建议口径

- `text`
- `heading`
- `list`
- `table`
- `quote`
- `image_caption`
- `attachment_note`

### 7.3 `meta_json` 建议内容

```json
{
  "source_system": "wolai",
  "block_type": "table",
  "table_json": {
    "headers": ["指标", "定义"],
    "rows": [
      ["CTR", "点击率"],
      ["eCPM", "千次展示收益"]
    ]
  },
  "images": [],
  "attachments": []
}
```

---

## 8. 后续蒸馏关联映射

Wolai 文档本身不直接落 `ai_knowledge_assets`，而是先进入原始层与标准化层，再由蒸馏流程产出知识资产。

### 8.1 典型关联关系

| 来源 | 产出 | 关联表 |
|---|---|---|
| Wolai SOP 文档 | 规则卡片 | `ai_knowledge_links` |
| Wolai 复盘文档 | 案例卡片 | `ai_knowledge_links` |
| Wolai 指标说明 | 术语 / 指标定义 | `ai_knowledge_links` |
| Wolai 会议纪要 | 候选经验规则 | `ai_knowledge_links` |

### 8.2 关联建议

- 若来源是整篇文档，则关联 `source_item`
- 若来源是某个具体段落或表格，则关联 `source_chunk`

---

## 9. 采集不到时的兜底映射

如果某些 Wolai 字段暂时采不到，建议如下处理：

| 字段 | 处理方式 |
|---|---|
| author_id | 允许为空 |
| owner_id | 可先写迁移负责人 |
| visibility_scope_json | 先写空间级范围 |
| tags_json | 允许为空数组 |
| html结构 | 至少保留纯文本 |
| 附件详情 | 先留附件URL列表 |

---

## 10. 推荐唯一键规则

建议使用以下规则保证幂等导入：

### 10.1 页面级唯一键

`item_key = wolai:{workspace_id_or_name}:{page_id_or_slug}`

### 10.2 原始记录唯一键

`source_record_key = wolai:{workspace_id_or_name}:{page_id_or_slug}:{updated_at}`

这样可以：

- 区分同一页面不同版本
- 支持增量同步
- 支持后续回放

---

## 11. 迁移建议补充字段

除正式表字段外，建议迁移过程中额外保留以下内部字段：

- `migrate_batch_no`
- `migrate_operator`
- `capture_mode`
- `capture_status`
- `parse_status`
- `attachment_download_status`
- `quality_check_status`

这些字段可先放在：

- `run_log_json`
- `raw_payload_json`
- `extra_json`

---

## 12. 关联文档

- [统一蒸馏库设计方案.md](/Users/chenhaozan/Documents/AI/Relation/统一蒸馏库设计方案.md)
- [Wolai文档迁移SOP.md](/Users/chenhaozan/Documents/AI/Relation/Wolai文档迁移SOP.md)
- [Chrome自动采集Wolai脚本设计方案.md](/Users/chenhaozan/Documents/AI/Relation/Chrome自动采集Wolai脚本设计方案.md)
- [sql/ai_distill_mysql.sql](/Users/chenhaozan/Documents/AI/Relation/sql/ai_distill_mysql.sql)
