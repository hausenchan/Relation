-- Distillation 报表入库模板 SQL
-- 用途：
-- 1. 承接 parse_manifest_to_distill.js 生成的 payload
-- 2. 将报表文件元数据先写入统一蒸馏库的接入层、原始层、标准化层
-- 3. 不负责真正解析 xls 内容，xls 解析建议由后续 parser 脚本完成

-- 推荐配合文件：
-- 1. DaAgent/Distillation/output/midmax_zhixiao_distill_payload.json
-- 2. sql/ai_distill_mysql.sql

USE relation_ai_distill;

-- Step 1: 确保来源存在
INSERT INTO ai_data_sources (
  source_code,
  source_name,
  source_type,
  source_origin,
  access_method,
  endpoint,
  sync_frequency,
  status,
  config_json,
  created_at,
  updated_at
) VALUES (
  :source_code,
  :source_name,
  'external_doc',
  'external',
  'file',
  :endpoint,
  'manual',
  'active',
  CAST(:config_json AS JSON),
  NOW(3),
  NOW(3)
)
ON DUPLICATE KEY UPDATE
  source_name = VALUES(source_name),
  endpoint = VALUES(endpoint),
  sync_frequency = VALUES(sync_frequency),
  status = VALUES(status),
  config_json = VALUES(config_json),
  updated_at = NOW(3);

-- Step 2: 新建同步任务
INSERT INTO ai_source_sync_jobs (
  source_id,
  job_type,
  trigger_mode,
  status,
  raw_count,
  normalized_count,
  run_log_json,
  started_at,
  finished_at,
  created_at,
  updated_at
)
SELECT
  s.id,
  'manual_file_import',
  'manual',
  'pending_import',
  :raw_count,
  0,
  CAST(:run_log_json AS JSON),
  NOW(3),
  NOW(3),
  NOW(3),
  NOW(3)
FROM ai_data_sources s
WHERE s.source_code = :source_code;

-- Step 3: 查询 source_id 和 sync_job_id
-- 建议由应用层在执行后拿到：
-- 1. source_id
-- 2. 当前批次最新 sync_job_id

-- Step 4: 插入 ai_raw_records
INSERT INTO ai_raw_records (
  source_id,
  sync_job_id,
  source_record_key,
  raw_type,
  content_type,
  title,
  raw_text,
  raw_payload_json,
  payload_hash,
  happened_at,
  captured_at,
  created_at,
  updated_at
) VALUES (
  :source_id,
  :sync_job_id,
  :source_record_key,
  'file_rowset',
  :content_type,
  :title,
  NULL,
  CAST(:raw_payload_json AS JSON),
  :payload_hash,
  :happened_at,
  NOW(3),
  NOW(3),
  NOW(3)
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  raw_payload_json = VALUES(raw_payload_json),
  payload_hash = VALUES(payload_hash),
  happened_at = VALUES(happened_at),
  captured_at = NOW(3),
  updated_at = NOW(3);

-- Step 5: 插入 ai_source_items
INSERT INTO ai_source_items (
  source_id,
  raw_record_id,
  item_type,
  item_key,
  source_module,
  title,
  summary,
  source_url,
  happened_at,
  published_at,
  status,
  tags_json,
  extra_json,
  created_at,
  updated_at
) VALUES (
  :source_id,
  :raw_record_id,
  'report',
  :item_key,
  :source_module,
  :title,
  :summary,
  :source_url,
  :happened_at,
  :published_at,
  'active',
  CAST(:tags_json AS JSON),
  CAST(:extra_json AS JSON),
  NOW(3),
  NOW(3)
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  summary = VALUES(summary),
  source_url = VALUES(source_url),
  happened_at = VALUES(happened_at),
  published_at = VALUES(published_at),
  tags_json = VALUES(tags_json),
  extra_json = VALUES(extra_json),
  updated_at = NOW(3);

-- Step 6: 更新同步任务状态
UPDATE ai_source_sync_jobs
SET
  status = 'raw_imported',
  normalized_count = :normalized_count,
  finished_at = NOW(3),
  updated_at = NOW(3)
WHERE id = :sync_job_id;

-- 说明：
-- 1. :payload_hash 建议对文件路径 + 文件大小 + 文件修改时间做 sha256
-- 2. :raw_record_id 需要应用层先按 source_record_key 回查
-- 3. 真正的 xls -> 行数据 / source_chunks 解析，建议在后续 parser 中执行
