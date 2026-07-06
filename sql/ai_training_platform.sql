-- AI训练台 SQLite 表结构（适配当前 Relation 运行时）
-- 日期：2026-07-06
-- 说明：
-- 1. 当前项目运行时数据库为 SQLite / better-sqlite3，因此本文件优先使用 SQLite 语法。
-- 2. 涉及会话标题、消息内容、批注、案例正文等敏感文本，建议在应用层继续复用 encryptRow / decryptRow 做加密存储。
-- 3. 后续如迁移到 MySQL，可保持字段语义不变，仅调整自增、JSON、索引语法。

BEGIN;

-- 会话主表
CREATE TABLE IF NOT EXISTS ai_training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_code TEXT NOT NULL UNIQUE,
  title TEXT,
  summary TEXT,
  scene_code TEXT NOT NULL DEFAULT 'general_chat',
  scene_label TEXT,
  business_line TEXT,
  business_side TEXT,
  budget_side TEXT,
  role_scope TEXT,
  skill_id INTEGER,
  skill_version_id INTEGER,
  owner_user_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  last_message_at DATETIME,
  last_score REAL DEFAULT NULL,
  quality_score REAL DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active / archived / deleted
  visibility_scope TEXT NOT NULL DEFAULT 'private', -- private / team / role / public
  source_channel TEXT NOT NULL DEFAULT 'manual', -- manual / template / skill / imported
  pinned INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  context_snapshot_json TEXT,
  extra_json TEXT,
  archived_at DATETIME,
  archived_by INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_sessions_owner_status
  ON ai_training_sessions(owner_user_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_training_sessions_scene
  ON ai_training_sessions(scene_code, business_line, status);
CREATE INDEX IF NOT EXISTS idx_ai_training_sessions_skill
  ON ai_training_sessions(skill_id, skill_version_id);

-- 会话消息表
CREATE TABLE IF NOT EXISTS ai_training_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  parent_message_id INTEGER,
  message_role TEXT NOT NULL, -- user / assistant / system / hook / reviewer
  message_type TEXT NOT NULL DEFAULT 'text', -- text / structured / event / action_result
  content_text TEXT,
  content_markdown TEXT,
  structured_json TEXT,
  evidence_json TEXT,
  actions_json TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual', -- manual / skill / hook / system
  skill_id INTEGER,
  skill_version_id INTEGER,
  hook_id INTEGER,
  hook_run_id INTEGER,
  token_in INTEGER DEFAULT 0,
  token_out INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost_amount REAL DEFAULT 0,
  is_helpful INTEGER,
  is_selected_as_case INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_message_id) REFERENCES ai_training_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_training_messages_session
  ON ai_training_messages(session_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_ai_training_messages_role
  ON ai_training_messages(message_role, session_id);

-- 消息反馈表
CREATE TABLE IF NOT EXISTS ai_training_message_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  feedback_type TEXT NOT NULL, -- helpful / not_helpful / inaccurate / incomplete / reusable
  rating INTEGER DEFAULT NULL, -- 1 ~ 5
  note_text TEXT,
  adopted INTEGER NOT NULL DEFAULT 0,
  created_task_id INTEGER,
  created_case_candidate_id INTEGER,
  created_skill_draft_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id, feedback_type),
  FOREIGN KEY (session_id) REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ai_training_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_feedback_session
  ON ai_training_message_feedback(session_id, created_at DESC);

-- 会话上下文引用表
CREATE TABLE IF NOT EXISTS ai_training_context_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  message_id INTEGER,
  ref_type TEXT NOT NULL, -- document / document_block / report / case / skill / task / company / product / custom
  ref_id TEXT,
  ref_title TEXT,
  ref_path TEXT,
  ref_score REAL DEFAULT NULL,
  ref_source TEXT,
  snapshot_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ai_training_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_training_context_refs_session
  ON ai_training_context_refs(session_id, ref_type, created_at DESC);

-- 会话附件表
CREATE TABLE IF NOT EXISTS ai_training_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  message_id INTEGER,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_ext TEXT,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT,
  attachment_type TEXT NOT NULL DEFAULT 'upload', -- upload / export / generated
  created_by INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ai_training_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_training_attachments_session
  ON ai_training_attachments(session_id, created_at DESC);

-- 案例候选池
CREATE TABLE IF NOT EXISTS ai_training_case_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_code TEXT NOT NULL UNIQUE,
  session_id INTEGER NOT NULL,
  source_message_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  business_line TEXT,
  scene_code TEXT NOT NULL,
  role_scope TEXT,
  owner_user_id INTEGER NOT NULL,
  quality_score REAL DEFAULT NULL,
  prompt_excerpt TEXT,
  response_excerpt TEXT,
  method_summary TEXT,
  result_summary TEXT,
  tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review / approved / rejected / merged
  reviewer_id INTEGER,
  review_note TEXT,
  approved_case_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_message_id) REFERENCES ai_training_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_case_candidates_status
  ON ai_training_case_candidates(status, business_line, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_training_case_candidates_owner
  ON ai_training_case_candidates(owner_user_id, created_at DESC);

-- 正式案例库
CREATE TABLE IF NOT EXISTS ai_training_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  scene_code TEXT NOT NULL,
  scene_label TEXT,
  business_line TEXT,
  business_side TEXT,
  budget_side TEXT,
  role_scope TEXT,
  source_candidate_id INTEGER,
  source_session_id INTEGER,
  source_message_id INTEGER,
  contributor_user_id INTEGER NOT NULL,
  owner_user_id INTEGER,
  prompt_text TEXT,
  followup_text TEXT,
  response_text TEXT,
  reusable_method_text TEXT,
  business_result_text TEXT,
  quality_score REAL DEFAULT NULL,
  reuse_count INTEGER NOT NULL DEFAULT 0,
  adopted_count INTEGER NOT NULL DEFAULT 0,
  visibility_scope TEXT NOT NULL DEFAULT 'team',
  status TEXT NOT NULL DEFAULT 'published', -- draft / published / archived
  tags_json TEXT,
  extra_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_cases_scene
  ON ai_training_cases(scene_code, business_line, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_training_cases_contributor
  ON ai_training_cases(contributor_user_id, created_at DESC);

-- 案例标签表（便于统计与筛选）
CREATE TABLE IF NOT EXISTS ai_training_case_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(case_id, tag_name),
  FOREIGN KEY (case_id) REFERENCES ai_training_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_case_tags_name
  ON ai_training_case_tags(tag_name, case_id);

-- Skill 主表
CREATE TABLE IF NOT EXISTS ai_training_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  business_line TEXT,
  business_side TEXT,
  budget_side TEXT,
  scene_code TEXT NOT NULL,
  role_scope TEXT,
  owner_user_id INTEGER,
  maintainer_user_id INTEGER,
  latest_version_id INTEGER,
  publish_version_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft', -- draft / testing / pending_review / published / archived
  visibility_scope TEXT NOT NULL DEFAULT 'team',
  source_type TEXT NOT NULL DEFAULT 'case_based', -- case_based / manual / mixed
  source_summary TEXT,
  tags_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_skills_scene
  ON ai_training_skills(scene_code, business_line, status, updated_at DESC);

-- Skill 版本表
CREATE TABLE IF NOT EXISTS ai_training_skill_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version_no TEXT NOT NULL,
  version_label TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft / evaluating / pending_review / published / rolled_back / archived
  system_prompt TEXT,
  input_schema_json TEXT,
  output_schema_json TEXT,
  reasoning_steps_text TEXT,
  output_template_text TEXT,
  guardrails_text TEXT,
  hook_policy_json TEXT,
  example_summary TEXT,
  source_case_ids_json TEXT,
  eval_summary_json TEXT,
  notes_text TEXT,
  created_by INTEGER NOT NULL,
  published_by INTEGER,
  published_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(skill_id, version_no),
  FOREIGN KEY (skill_id) REFERENCES ai_training_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_skill_versions_skill
  ON ai_training_skill_versions(skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_training_skill_versions_status
  ON ai_training_skill_versions(status, updated_at DESC);

-- Skill 示例表
CREATE TABLE IF NOT EXISTS ai_training_skill_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_version_id INTEGER NOT NULL,
  source_case_id INTEGER,
  example_kind TEXT NOT NULL DEFAULT 'few_shot', -- few_shot / bad_case / benchmark
  input_text TEXT,
  expected_output_text TEXT,
  note_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_version_id) REFERENCES ai_training_skill_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_case_id) REFERENCES ai_training_cases(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_training_skill_examples_version
  ON ai_training_skill_examples(skill_version_id, sort_order, id);

-- Hook 定义表
CREATE TABLE IF NOT EXISTS ai_training_hooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hook_stage TEXT NOT NULL, -- pre / mid / post
  description TEXT,
  scene_code TEXT,
  business_line TEXT,
  role_scope TEXT,
  trigger_rule_json TEXT,
  action_config_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_hooks_stage
  ON ai_training_hooks(hook_stage, enabled, scene_code);

-- Skill 与 Hook 绑定表
CREATE TABLE IF NOT EXISTS ai_training_skill_hook_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_version_id INTEGER NOT NULL,
  hook_id INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(skill_version_id, hook_id),
  FOREIGN KEY (skill_version_id) REFERENCES ai_training_skill_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (hook_id) REFERENCES ai_training_hooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_skill_hook_bindings_version
  ON ai_training_skill_hook_bindings(skill_version_id, sort_order, id);

-- Hook 执行日志表
CREATE TABLE IF NOT EXISTS ai_training_hook_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  message_id INTEGER,
  hook_id INTEGER NOT NULL,
  hook_stage TEXT NOT NULL,
  run_status TEXT NOT NULL DEFAULT 'success', -- success / failed / skipped
  input_json TEXT,
  output_json TEXT,
  error_message TEXT,
  latency_ms INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ai_training_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (hook_id) REFERENCES ai_training_hooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_hook_runs_session
  ON ai_training_hook_runs(session_id, created_at DESC);

-- 评测集主表
CREATE TABLE IF NOT EXISTS ai_training_eval_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  business_line TEXT,
  scene_code TEXT NOT NULL,
  role_scope TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  case_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_eval_sets_scene
  ON ai_training_eval_sets(scene_code, business_line, status);

-- 评测题目表
CREATE TABLE IF NOT EXISTS ai_training_eval_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eval_set_id INTEGER NOT NULL,
  case_code TEXT NOT NULL,
  title TEXT NOT NULL,
  scene_code TEXT NOT NULL,
  input_text TEXT NOT NULL,
  expected_output_text TEXT,
  scoring_rubric_json TEXT,
  source_case_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(eval_set_id, case_code),
  FOREIGN KEY (eval_set_id) REFERENCES ai_training_eval_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (source_case_id) REFERENCES ai_training_cases(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_training_eval_cases_set
  ON ai_training_eval_cases(eval_set_id, enabled, sort_order, id);

-- 评测运行表
CREATE TABLE IF NOT EXISTS ai_training_eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_code TEXT NOT NULL UNIQUE,
  skill_id INTEGER NOT NULL,
  skill_version_id INTEGER NOT NULL,
  eval_set_id INTEGER NOT NULL,
  run_status TEXT NOT NULL DEFAULT 'running', -- running / completed / failed
  total_cases INTEGER NOT NULL DEFAULT 0,
  pass_cases INTEGER NOT NULL DEFAULT 0,
  avg_accuracy REAL DEFAULT NULL,
  avg_structure_score REAL DEFAULT NULL,
  avg_evidence_score REAL DEFAULT NULL,
  avg_actionability_score REAL DEFAULT NULL,
  summary_json TEXT,
  started_by INTEGER NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (skill_id) REFERENCES ai_training_skills(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_version_id) REFERENCES ai_training_skill_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (eval_set_id) REFERENCES ai_training_eval_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_eval_runs_skill
  ON ai_training_eval_runs(skill_version_id, started_at DESC);

-- 单题评测结果表
CREATE TABLE IF NOT EXISTS ai_training_eval_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eval_run_id INTEGER NOT NULL,
  eval_case_id INTEGER NOT NULL,
  actual_output_text TEXT,
  actual_output_json TEXT,
  accuracy_score REAL DEFAULT NULL,
  structure_score REAL DEFAULT NULL,
  evidence_score REAL DEFAULT NULL,
  actionability_score REAL DEFAULT NULL,
  passed INTEGER NOT NULL DEFAULT 0,
  reviewer_note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(eval_run_id, eval_case_id),
  FOREIGN KEY (eval_run_id) REFERENCES ai_training_eval_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (eval_case_id) REFERENCES ai_training_eval_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_training_eval_results_run
  ON ai_training_eval_results(eval_run_id, passed, id);

-- 人员训练统计快照表
CREATE TABLE IF NOT EXISTS ai_training_user_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  business_line TEXT,
  session_count INTEGER NOT NULL DEFAULT 0,
  high_quality_session_count INTEGER NOT NULL DEFAULT 0,
  avg_rating REAL DEFAULT NULL,
  case_candidate_count INTEGER NOT NULL DEFAULT 0,
  published_case_count INTEGER NOT NULL DEFAULT 0,
  skill_contribution_count INTEGER NOT NULL DEFAULT 0,
  reuse_count INTEGER NOT NULL DEFAULT 0,
  adopted_count INTEGER NOT NULL DEFAULT 0,
  score_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stat_date, user_id, business_line)
);

CREATE INDEX IF NOT EXISTS idx_ai_training_user_scores_user
  ON ai_training_user_scores(user_id, stat_date DESC);

-- Skill 使用统计快照表
CREATE TABLE IF NOT EXISTS ai_training_skill_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  skill_version_id INTEGER,
  business_line TEXT,
  call_count INTEGER NOT NULL DEFAULT 0,
  unique_user_count INTEGER NOT NULL DEFAULT 0,
  adopted_count INTEGER NOT NULL DEFAULT 0,
  generated_case_count INTEGER NOT NULL DEFAULT 0,
  generated_task_count INTEGER NOT NULL DEFAULT 0,
  avg_rating REAL DEFAULT NULL,
  score_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stat_date, skill_id, skill_version_id, business_line)
);

CREATE INDEX IF NOT EXISTS idx_ai_training_skill_usage_stats_skill
  ON ai_training_skill_usage_stats(skill_id, stat_date DESC);

COMMIT;
