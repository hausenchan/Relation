-- IAA 广告业务 AI 蒸馏 / Skill / Eval MySQL 初始化脚本
-- 版本: v1.0
-- 日期: 2026-07-03
-- 适用: MySQL 8.0+

CREATE DATABASE IF NOT EXISTS relation_ai_distill
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE relation_ai_distill;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ai_data_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_code VARCHAR(64) NOT NULL COMMENT '来源编码',
  source_name VARCHAR(128) NOT NULL COMMENT '来源名称',
  source_type VARCHAR(32) NOT NULL COMMENT 'org_center/selecteddb/manual/external_doc',
  source_origin VARCHAR(64) NOT NULL COMMENT 'internal/external',
  access_method VARCHAR(32) NOT NULL COMMENT 'db/api/web/file/manual',
  endpoint VARCHAR(255) DEFAULT NULL COMMENT '数据源地址、域名或连接标识',
  db_name VARCHAR(128) DEFAULT NULL COMMENT '源数据库名称',
  owner_id BIGINT UNSIGNED DEFAULT NULL COMMENT '负责人ID',
  owner_name VARCHAR(64) DEFAULT NULL COMMENT '负责人名称',
  sync_frequency VARCHAR(32) DEFAULT NULL COMMENT 'hourly/daily/manual',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/paused/disabled',
  reliability_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '来源可信度',
  freshness_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '新鲜度分数',
  config_json JSON DEFAULT NULL COMMENT '来源配置',
  auth_config_json JSON DEFAULT NULL COMMENT '鉴权配置引用',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_data_sources_code (source_code),
  KEY idx_ai_data_sources_type_status (source_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI数据来源配置';

CREATE TABLE IF NOT EXISTS ai_source_sync_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '来源ID',
  job_type VARCHAR(32) NOT NULL COMMENT 'full/incremental/manual/replay',
  trigger_mode VARCHAR(32) NOT NULL DEFAULT 'system' COMMENT 'system/manual/hook',
  window_start DATETIME(3) DEFAULT NULL COMMENT '同步开始时间窗',
  window_end DATETIME(3) DEFAULT NULL COMMENT '同步结束时间窗',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/running/success/failed/partial',
  raw_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '原始记录数',
  normalized_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '标准化记录数',
  error_message TEXT DEFAULT NULL COMMENT '错误信息',
  run_log_json JSON DEFAULT NULL COMMENT '执行日志',
  started_at DATETIME(3) DEFAULT NULL,
  finished_at DATETIME(3) DEFAULT NULL,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_source_sync_jobs_source_status (source_id, status, created_at),
  CONSTRAINT fk_ai_source_sync_jobs_source_id
    FOREIGN KEY (source_id) REFERENCES ai_data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='来源同步任务';

CREATE TABLE IF NOT EXISTS ai_external_field_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '来源ID',
  source_field VARCHAR(128) NOT NULL COMMENT '原字段',
  target_field VARCHAR(128) NOT NULL COMMENT '目标标准字段',
  target_table VARCHAR(128) NOT NULL COMMENT '目标表',
  transform_rule_json JSON DEFAULT NULL COMMENT '转换规则',
  is_required TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否必填',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/inactive',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_external_field_mapping (source_id, source_field, target_field),
  CONSTRAINT fk_ai_external_field_mappings_source_id
    FOREIGN KEY (source_id) REFERENCES ai_data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='外部字段映射规则';

CREATE TABLE IF NOT EXISTS ai_raw_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '来源ID',
  sync_job_id BIGINT UNSIGNED DEFAULT NULL COMMENT '同步任务ID',
  source_record_key VARCHAR(255) NOT NULL COMMENT '源记录唯一键',
  raw_type VARCHAR(32) NOT NULL COMMENT 'document/api_row/report_row/web_row/file_row',
  content_type VARCHAR(64) DEFAULT NULL COMMENT 'application/json/text/plain/text/html',
  title VARCHAR(255) DEFAULT NULL COMMENT '标题',
  raw_text LONGTEXT DEFAULT NULL COMMENT '原始文本',
  raw_payload_json JSON DEFAULT NULL COMMENT '原始结构化内容',
  payload_hash CHAR(64) DEFAULT NULL COMMENT '内容哈希',
  happened_at DATETIME(3) DEFAULT NULL COMMENT '源数据业务时间',
  captured_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '采集时间',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_raw_records_source_record (source_id, source_record_key),
  KEY idx_ai_raw_records_sync_job (sync_job_id),
  KEY idx_ai_raw_records_happened_at (happened_at),
  CONSTRAINT fk_ai_raw_records_source_id
    FOREIGN KEY (source_id) REFERENCES ai_data_sources(id),
  CONSTRAINT fk_ai_raw_records_sync_job_id
    FOREIGN KEY (sync_job_id) REFERENCES ai_source_sync_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='原始快照记录';

CREATE TABLE IF NOT EXISTS ai_source_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '来源ID',
  raw_record_id BIGINT UNSIGNED DEFAULT NULL COMMENT '原始记录ID',
  item_type VARCHAR(32) NOT NULL COMMENT 'document/research/meeting/case/report/metric_snapshot',
  item_key VARCHAR(255) NOT NULL COMMENT '标准化来源项唯一键',
  source_module VARCHAR(64) DEFAULT NULL COMMENT '文档中心/公司研究/策略管理等',
  title VARCHAR(255) NOT NULL COMMENT '标题',
  summary TEXT DEFAULT NULL COMMENT '摘要',
  author_id BIGINT UNSIGNED DEFAULT NULL COMMENT '作者ID',
  author_name VARCHAR(64) DEFAULT NULL COMMENT '作者',
  owner_id BIGINT UNSIGNED DEFAULT NULL COMMENT '负责人ID',
  owner_name VARCHAR(64) DEFAULT NULL COMMENT '负责人',
  visibility_scope_json JSON DEFAULT NULL COMMENT '可见范围',
  tags_json JSON DEFAULT NULL COMMENT '标签',
  source_url VARCHAR(512) DEFAULT NULL COMMENT '源链接或页内地址',
  happened_at DATETIME(3) DEFAULT NULL COMMENT '业务时间',
  published_at DATETIME(3) DEFAULT NULL COMMENT '发布时间',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/archived/deleted',
  extra_json JSON DEFAULT NULL COMMENT '补充信息',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_source_items_item_key (item_key),
  KEY idx_ai_source_items_type_status (item_type, status),
  KEY idx_ai_source_items_source_module (source_module),
  CONSTRAINT fk_ai_source_items_source_id
    FOREIGN KEY (source_id) REFERENCES ai_data_sources(id),
  CONSTRAINT fk_ai_source_items_raw_record_id
    FOREIGN KEY (raw_record_id) REFERENCES ai_raw_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='标准化来源项';

CREATE TABLE IF NOT EXISTS ai_source_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_item_id BIGINT UNSIGNED NOT NULL COMMENT '来源项ID',
  chunk_index INT UNSIGNED NOT NULL COMMENT '分片序号',
  chunk_type VARCHAR(32) NOT NULL DEFAULT 'text' COMMENT 'text/table/list/code',
  heading_path VARCHAR(512) DEFAULT NULL COMMENT '标题路径',
  content LONGTEXT NOT NULL COMMENT '分片正文',
  token_estimate INT UNSIGNED DEFAULT NULL COMMENT '估算token数',
  char_count INT UNSIGNED DEFAULT NULL COMMENT '字符数',
  start_offset INT UNSIGNED DEFAULT NULL COMMENT '起始位置',
  end_offset INT UNSIGNED DEFAULT NULL COMMENT '结束位置',
  chunk_hash CHAR(64) DEFAULT NULL COMMENT 'chunk内容哈希',
  meta_json JSON DEFAULT NULL COMMENT '额外信息',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_source_chunks_item_index (source_item_id, chunk_index),
  KEY idx_ai_source_chunks_hash (chunk_hash),
  CONSTRAINT fk_ai_source_chunks_source_item_id
    FOREIGN KEY (source_item_id) REFERENCES ai_source_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='来源文本分片';

CREATE TABLE IF NOT EXISTS ai_metric_dictionary (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  metric_code VARCHAR(64) NOT NULL COMMENT '指标编码',
  metric_name VARCHAR(128) NOT NULL COMMENT '指标名称',
  metric_category VARCHAR(64) DEFAULT NULL COMMENT '收入/流量/预算/质量',
  metric_definition TEXT DEFAULT NULL COMMENT '指标定义',
  formula_text TEXT DEFAULT NULL COMMENT '计算口径',
  unit VARCHAR(32) DEFAULT NULL COMMENT '单位',
  grain VARCHAR(32) DEFAULT NULL COMMENT 'hour/day/week',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/inactive',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_metric_dictionary_code (metric_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指标字典';

CREATE TABLE IF NOT EXISTS ai_dimension_dictionary (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  dimension_code VARCHAR(64) NOT NULL COMMENT '维度编码',
  dimension_name VARCHAR(128) NOT NULL COMMENT '维度名称',
  dimension_group VARCHAR(64) DEFAULT NULL COMMENT '主体/产品/媒体/渠道/业务线',
  definition TEXT DEFAULT NULL COMMENT '维度定义',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/inactive',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_dimension_dictionary_code (dimension_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='维度字典';

CREATE TABLE IF NOT EXISTS ai_fact_metric_values (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '来源ID',
  raw_record_id BIGINT UNSIGNED DEFAULT NULL COMMENT '原始记录ID',
  granularity VARCHAR(16) NOT NULL COMMENT 'hour/day/week',
  window_start DATETIME(3) NOT NULL COMMENT '时间窗开始',
  window_end DATETIME(3) NOT NULL COMMENT '时间窗结束',
  business_side VARCHAR(32) DEFAULT NULL COMMENT 'budget/traffic/shared',
  budget_side VARCHAR(32) DEFAULT NULL COMMENT 'b_end/c_end',
  business_line VARCHAR(64) DEFAULT NULL COMMENT '支小/微小/抖小/百度JS/百度搜索',
  subject_key VARCHAR(128) DEFAULT NULL COMMENT '主体标识',
  subject_name VARCHAR(128) DEFAULT NULL COMMENT '主体名称',
  product_key VARCHAR(128) DEFAULT NULL COMMENT '产品标识',
  product_name VARCHAR(128) DEFAULT NULL COMMENT '产品名称',
  media_key VARCHAR(128) DEFAULT NULL COMMENT '媒体标识',
  media_name VARCHAR(128) DEFAULT NULL COMMENT '媒体名称',
  channel_key VARCHAR(128) DEFAULT NULL COMMENT '渠道标识',
  channel_name VARCHAR(128) DEFAULT NULL COMMENT '渠道名称',
  experiment_key VARCHAR(128) DEFAULT NULL COMMENT '实验或策略标识',
  metric_code VARCHAR(64) NOT NULL COMMENT '指标编码',
  metric_name VARCHAR(128) DEFAULT NULL COMMENT '指标名称',
  metric_value DECIMAL(20,6) NOT NULL DEFAULT 0.000000 COMMENT '指标值',
  unit VARCHAR(32) DEFAULT NULL COMMENT '单位',
  currency_code VARCHAR(16) DEFAULT NULL COMMENT '币种',
  sample_count BIGINT UNSIGNED DEFAULT NULL COMMENT '样本量',
  extra_dimensions_json JSON DEFAULT NULL COMMENT '额外维度',
  quality_flag VARCHAR(32) DEFAULT NULL COMMENT 'normal/suspect/invalid',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_fact_metric_unique (
    source_id,
    granularity,
    window_start,
    window_end,
    metric_code,
    subject_key,
    product_key,
    media_key,
    channel_key,
    experiment_key
  ),
  KEY idx_ai_fact_metric_lookup (metric_code, window_start, business_line),
  KEY idx_ai_fact_metric_subject_product (subject_name, product_name, window_start),
  CONSTRAINT fk_ai_fact_metric_values_source_id
    FOREIGN KEY (source_id) REFERENCES ai_data_sources(id),
  CONSTRAINT fk_ai_fact_metric_values_raw_record_id
    FOREIGN KEY (raw_record_id) REFERENCES ai_raw_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='标准化经营事实指标';

CREATE TABLE IF NOT EXISTS ai_strategy_change_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '来源ID',
  raw_record_id BIGINT UNSIGNED DEFAULT NULL COMMENT '原始记录ID',
  change_key VARCHAR(255) NOT NULL COMMENT '变更唯一键',
  change_type VARCHAR(64) NOT NULL COMMENT 'budget_change/strategy_change/experiment_release/manual_adjustment',
  business_line VARCHAR(64) DEFAULT NULL COMMENT '业务线',
  subject_name VARCHAR(128) DEFAULT NULL COMMENT '主体',
  product_name VARCHAR(128) DEFAULT NULL COMMENT '产品',
  target_name VARCHAR(128) DEFAULT NULL COMMENT '目标对象',
  before_payload_json JSON DEFAULT NULL COMMENT '变更前',
  after_payload_json JSON DEFAULT NULL COMMENT '变更后',
  change_reason TEXT DEFAULT NULL COMMENT '变更原因',
  operator_id BIGINT UNSIGNED DEFAULT NULL COMMENT '操作人ID',
  operator_name VARCHAR(64) DEFAULT NULL COMMENT '操作人',
  happened_at DATETIME(3) NOT NULL COMMENT '变更时间',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_strategy_change_logs_key (change_key),
  KEY idx_ai_strategy_change_logs_lookup (change_type, happened_at, business_line),
  CONSTRAINT fk_ai_strategy_change_logs_source_id
    FOREIGN KEY (source_id) REFERENCES ai_data_sources(id),
  CONSTRAINT fk_ai_strategy_change_logs_raw_record_id
    FOREIGN KEY (raw_record_id) REFERENCES ai_raw_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='策略与实验变更日志';

CREATE TABLE IF NOT EXISTS ai_knowledge_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  asset_code VARCHAR(64) NOT NULL COMMENT '资产编码',
  asset_type VARCHAR(32) NOT NULL COMMENT 'rule/case/pattern/playbook/few_shot/glossary',
  title VARCHAR(255) NOT NULL COMMENT '标题',
  summary TEXT DEFAULT NULL COMMENT '摘要',
  current_version_id BIGINT UNSIGNED DEFAULT NULL COMMENT '当前版本ID',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft/reviewing/published/archived',
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',
  validation_status VARCHAR(32) NOT NULL DEFAULT 'unverified' COMMENT 'unverified/verified/deprecated',
  confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '置信度',
  freshness_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '新鲜度',
  reliability_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '可信度',
  effective_scope_json JSON DEFAULT NULL COMMENT '适用范围',
  tags_json JSON DEFAULT NULL COMMENT '标签',
  owner_id BIGINT UNSIGNED DEFAULT NULL COMMENT '负责人ID',
  owner_name VARCHAR(64) DEFAULT NULL COMMENT '负责人',
  reviewer_id BIGINT UNSIGNED DEFAULT NULL COMMENT '审核人ID',
  reviewer_name VARCHAR(64) DEFAULT NULL COMMENT '审核人',
  published_at DATETIME(3) DEFAULT NULL COMMENT '发布时间',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_knowledge_assets_code (asset_code),
  KEY idx_ai_knowledge_assets_type_status (asset_type, status, review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='知识资产主表';

CREATE TABLE IF NOT EXISTS ai_knowledge_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  asset_id BIGINT UNSIGNED NOT NULL COMMENT '资产ID',
  version_no INT UNSIGNED NOT NULL COMMENT '版本号',
  source_summary_json JSON DEFAULT NULL COMMENT '来源摘要',
  structured_payload_json JSON DEFAULT NULL COMMENT '结构化资产内容',
  content LONGTEXT DEFAULT NULL COMMENT '正文内容',
  derivation_note TEXT DEFAULT NULL COMMENT '蒸馏说明',
  review_comment TEXT DEFAULT NULL COMMENT '审核意见',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft/reviewing/published/archived',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_knowledge_versions_asset_version (asset_id, version_no),
  KEY idx_ai_knowledge_versions_status (status),
  CONSTRAINT fk_ai_knowledge_versions_asset_id
    FOREIGN KEY (asset_id) REFERENCES ai_knowledge_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='知识资产版本表';

CREATE TABLE IF NOT EXISTS ai_knowledge_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  asset_id BIGINT UNSIGNED NOT NULL COMMENT '资产ID',
  asset_version_id BIGINT UNSIGNED DEFAULT NULL COMMENT '资产版本ID',
  link_type VARCHAR(32) NOT NULL COMMENT 'source_item/source_chunk/raw_record/fact_metric/strategy_change',
  linked_id BIGINT UNSIGNED NOT NULL COMMENT '关联对象ID',
  relation_type VARCHAR(32) NOT NULL DEFAULT 'evidence' COMMENT 'evidence/reference/conflict/support',
  weight_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '权重',
  note TEXT DEFAULT NULL COMMENT '说明',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_knowledge_links_unique (asset_id, asset_version_id, link_type, linked_id, relation_type),
  KEY idx_ai_knowledge_links_lookup (link_type, linked_id),
  CONSTRAINT fk_ai_knowledge_links_asset_id
    FOREIGN KEY (asset_id) REFERENCES ai_knowledge_assets(id),
  CONSTRAINT fk_ai_knowledge_links_asset_version_id
    FOREIGN KEY (asset_version_id) REFERENCES ai_knowledge_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='知识资产证据关联';

CREATE TABLE IF NOT EXISTS ai_skill_defs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  skill_code VARCHAR(64) NOT NULL COMMENT 'Skill编码',
  skill_name VARCHAR(128) NOT NULL COMMENT 'Skill名称',
  scenario VARCHAR(128) NOT NULL COMMENT '业务场景',
  job_to_be_done VARCHAR(255) DEFAULT NULL COMMENT '要解决的问题',
  owner_id BIGINT UNSIGNED DEFAULT NULL COMMENT '负责人ID',
  owner_name VARCHAR(64) DEFAULT NULL COMMENT '负责人',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft/testing/published/offline',
  current_version_id BIGINT UNSIGNED DEFAULT NULL COMMENT '当前版本ID',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_skill_defs_code (skill_code),
  KEY idx_ai_skill_defs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Skill定义主表';

CREATE TABLE IF NOT EXISTS ai_skill_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  skill_id BIGINT UNSIGNED NOT NULL COMMENT 'Skill主表ID',
  version_no INT UNSIGNED NOT NULL COMMENT '版本号',
  model_name VARCHAR(128) DEFAULT NULL COMMENT '使用模型',
  prompt_template LONGTEXT DEFAULT NULL COMMENT '提示词模板',
  input_schema_json JSON DEFAULT NULL COMMENT '输入结构',
  output_schema_json JSON DEFAULT NULL COMMENT '输出结构',
  workflow_json JSON DEFAULT NULL COMMENT '工作流定义',
  tool_whitelist_json JSON DEFAULT NULL COMMENT '工具白名单',
  hook_policy_json JSON DEFAULT NULL COMMENT 'Hook策略',
  approval_policy_json JSON DEFAULT NULL COMMENT '审批策略',
  eval_spec_json JSON DEFAULT NULL COMMENT '评测规范',
  change_note TEXT DEFAULT NULL COMMENT '版本说明',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft/testing/published/offline',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_skill_versions_skill_version (skill_id, version_no),
  KEY idx_ai_skill_versions_status (status),
  CONSTRAINT fk_ai_skill_versions_skill_id
    FOREIGN KEY (skill_id) REFERENCES ai_skill_defs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Skill版本表';

CREATE TABLE IF NOT EXISTS ai_skill_asset_bindings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  skill_version_id BIGINT UNSIGNED NOT NULL COMMENT 'Skill版本ID',
  asset_id BIGINT UNSIGNED NOT NULL COMMENT '资产ID',
  asset_version_id BIGINT UNSIGNED DEFAULT NULL COMMENT '资产版本ID',
  binding_type VARCHAR(32) NOT NULL DEFAULT 'required' COMMENT 'required/optional/few_shot/reference',
  priority_no INT UNSIGNED NOT NULL DEFAULT 100 COMMENT '优先级',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_skill_asset_bindings_unique (skill_version_id, asset_id, asset_version_id, binding_type),
  KEY idx_ai_skill_asset_bindings_asset (asset_id),
  CONSTRAINT fk_ai_skill_asset_bindings_skill_version_id
    FOREIGN KEY (skill_version_id) REFERENCES ai_skill_versions(id),
  CONSTRAINT fk_ai_skill_asset_bindings_asset_id
    FOREIGN KEY (asset_id) REFERENCES ai_knowledge_assets(id),
  CONSTRAINT fk_ai_skill_asset_bindings_asset_version_id
    FOREIGN KEY (asset_version_id) REFERENCES ai_knowledge_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Skill与知识资产绑定';

CREATE TABLE IF NOT EXISTS ai_skill_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  run_no VARCHAR(64) NOT NULL COMMENT '运行编号',
  skill_id BIGINT UNSIGNED NOT NULL COMMENT 'Skill主表ID',
  skill_version_id BIGINT UNSIGNED NOT NULL COMMENT 'Skill版本ID',
  operator_id BIGINT UNSIGNED DEFAULT NULL COMMENT '操作人ID',
  operator_name VARCHAR(64) DEFAULT NULL COMMENT '操作人',
  run_source VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'manual/hook/api/eval',
  input_payload_json JSON DEFAULT NULL COMMENT '输入参数',
  output_payload_json JSON DEFAULT NULL COMMENT '输出结果',
  evidence_json JSON DEFAULT NULL COMMENT '证据摘要',
  run_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/running/success/failed/cancelled',
  approval_status VARCHAR(32) NOT NULL DEFAULT 'not_required' COMMENT 'not_required/pending/approved/rejected',
  token_in INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '输入token',
  token_out INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '输出token',
  cost_amount DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT '成本',
  duration_ms INT UNSIGNED DEFAULT NULL COMMENT '耗时',
  error_message TEXT DEFAULT NULL COMMENT '错误信息',
  started_at DATETIME(3) DEFAULT NULL COMMENT '开始时间',
  finished_at DATETIME(3) DEFAULT NULL COMMENT '结束时间',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_skill_runs_run_no (run_no),
  KEY idx_ai_skill_runs_lookup (skill_id, skill_version_id, run_status, created_at),
  CONSTRAINT fk_ai_skill_runs_skill_id
    FOREIGN KEY (skill_id) REFERENCES ai_skill_defs(id),
  CONSTRAINT fk_ai_skill_runs_skill_version_id
    FOREIGN KEY (skill_version_id) REFERENCES ai_skill_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Skill运行记录';

CREATE TABLE IF NOT EXISTS ai_eval_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  case_code VARCHAR(64) NOT NULL COMMENT '用例编码',
  skill_id BIGINT UNSIGNED NOT NULL COMMENT 'Skill主表ID',
  title VARCHAR(255) NOT NULL COMMENT '用例标题',
  case_type VARCHAR(32) NOT NULL DEFAULT 'regression' COMMENT 'regression/golden/adversarial/manual',
  priority_level VARCHAR(16) NOT NULL DEFAULT 'P2' COMMENT 'P0/P1/P2/P3',
  input_payload_json JSON NOT NULL COMMENT '输入样本',
  expected_output_json JSON DEFAULT NULL COMMENT '期望输出',
  score_rule_json JSON DEFAULT NULL COMMENT '评分规则',
  tags_json JSON DEFAULT NULL COMMENT '标签',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/inactive',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_eval_cases_code (case_code),
  KEY idx_ai_eval_cases_skill_status (skill_id, status),
  CONSTRAINT fk_ai_eval_cases_skill_id
    FOREIGN KEY (skill_id) REFERENCES ai_skill_defs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评测样本';

CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  eval_no VARCHAR(64) NOT NULL COMMENT '评测编号',
  case_id BIGINT UNSIGNED NOT NULL COMMENT '用例ID',
  skill_version_id BIGINT UNSIGNED NOT NULL COMMENT 'Skill版本ID',
  skill_run_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联运行ID',
  actual_output_json JSON DEFAULT NULL COMMENT '实际输出',
  score_json JSON DEFAULT NULL COMMENT '评分结果',
  pass_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否通过',
  summary TEXT DEFAULT NULL COMMENT '评测总结',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_eval_runs_no (eval_no),
  KEY idx_ai_eval_runs_case_version (case_id, skill_version_id, created_at),
  CONSTRAINT fk_ai_eval_runs_case_id
    FOREIGN KEY (case_id) REFERENCES ai_eval_cases(id),
  CONSTRAINT fk_ai_eval_runs_skill_version_id
    FOREIGN KEY (skill_version_id) REFERENCES ai_skill_versions(id),
  CONSTRAINT fk_ai_eval_runs_skill_run_id
    FOREIGN KEY (skill_run_id) REFERENCES ai_skill_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评测运行结果';

CREATE TABLE IF NOT EXISTS ai_feedback_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  feedback_no VARCHAR(64) NOT NULL COMMENT '反馈编号',
  skill_run_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'Skill运行ID',
  asset_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联资产ID',
  feedback_type VARCHAR(32) NOT NULL COMMENT 'run_feedback/asset_feedback/eval_feedback',
  rating SMALLINT DEFAULT NULL COMMENT '评分',
  feedback_text TEXT DEFAULT NULL COMMENT '反馈内容',
  correction_payload_json JSON DEFAULT NULL COMMENT '纠正内容',
  status VARCHAR(32) NOT NULL DEFAULT 'open' COMMENT 'open/processing/closed',
  reporter_id BIGINT UNSIGNED DEFAULT NULL COMMENT '反馈人ID',
  reporter_name VARCHAR(64) DEFAULT NULL COMMENT '反馈人',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_feedback_records_no (feedback_no),
  KEY idx_ai_feedback_records_status (feedback_type, status, created_at),
  CONSTRAINT fk_ai_feedback_records_skill_run_id
    FOREIGN KEY (skill_run_id) REFERENCES ai_skill_runs(id),
  CONSTRAINT fk_ai_feedback_records_asset_id
    FOREIGN KEY (asset_id) REFERENCES ai_knowledge_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人工反馈记录';

