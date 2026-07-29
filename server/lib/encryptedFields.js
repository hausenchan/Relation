// 字段加密配置 —— 与 data.db 现有 schema 对齐
//
// fields:        需要 AES-GCM 加密的列
// indexed:       明文 → HMAC 后单独存到 ${col}_idx 列，用于等值查询（如手机号查重）
//                目前留空；如需启用，在 server/index.js 启动时给对应表 ALTER TABLE 加 _idx 列
//
// 排序/筛选/外键字段一律不加密（importance / status / category / *_id / *_at 等）

module.exports = {
  persons: {
    fields: [
      'name',
      'company', 'position',
      'phone', 'email', 'wechat',
      'address',
      'notes', 'tags',
      'current_company', 'current_position', 'target_position',
      'skills', 'education', 'expected_salary',
      'source',
      'heart', 'brain', 'mouth', 'hand',
      'resources', 'demands', 'success_traits',
    ],
    indexed: [],
  },

  interactions: {
    fields: ['description', 'outcome', 'follow_result', 'next_action',
             'opportunity_title', 'opportunity_note', 'gift_name'],
    indexed: [],
  },

  companies: {
    fields: ['name', 'business', 'business_model', 'revenue_scale',
             'website', 'tags', 'notes'],
    indexed: [],
  },

  company_dynamics: {
    fields: ['title', 'content', 'source', 'impact'],
    indexed: [],
  },

  // 通过 server/index.js 启动时建表创建
  competitor_research: {
    fields: ['*text*'], // 占位：等表确认后再填具体列
    indexed: [],
    skip: true,         // 当前迁移先跳过
  },

  company_personnel: {
    fields: ['*text*'],
    indexed: [],
    skip: true,
  },

  company_products: {
    fields: ['*text*'],
    indexed: [],
    skip: true,
  },

  leads: {
    fields: ['title', 'source', 'contact_person', 'contact_company',
             'contact_info', 'description', 'follow_result'],
    indexed: [],
  },

  product_assets: {
    fields: ['group_name', 'app_name', 'company_entity', 'appid', 'app_identifier', 'remark'],
    indexed: [],
  },

  media_assets: {
    fields: [
      'media_name', 'endpoint_description', 'domain_name', 'version_number', 'latest_features', 'uv_scale',
      'sdk_ui_appid', 'task_config_requirements', 'special_entry_info', 'other_notes',
    ],
    indexed: [],
  },

  company_subjects: {
    fields: [
      'group_name', 'company_entity', 'legal_person', 'legal_person_phone', 'email', 'remark', 'identity_key',
      'api_domain', 'analytics_domain', 'cdn_domain', 'short_drama_domain',
    ],
    indexed: [],
  },

  product_asset_release_tasks: {
    fields: ['error_message', 'log_text'],
    indexed: [],
  },

  product_asset_release_records: {
    fields: ['api_domain', 'analytics_domain', 'cdn_domain', 'short_drama_domain', 'release_link', 'release_note', 'upload_summary'],
    indexed: [],
  },

  product_asset_reductions: {
    fields: ['upstream', 'reason_analysis', 'impact_scope'],
    indexed: [],
  },

  tasks: {
    fields: ['title', 'description', 'result'],
    indexed: [],
  },

  follow_up_tasks: {
    fields: ['title', 'opportunity_title', 'opportunity_note', 'done_note'],
    indexed: [],
  },

  goals: {
    fields: ['title', 'description', 'result'],
    indexed: [],
  },

  ai_training_sessions: {
    fields: ['title', 'summary'],
    indexed: [],
  },

  ai_training_messages: {
    fields: ['content_text', 'content_markdown', 'structured_json', 'evidence_json', 'actions_json'],
    indexed: [],
  },

  ai_training_message_feedback: {
    fields: ['note_text'],
    indexed: [],
  },

  ai_training_case_candidates: {
    fields: ['title', 'prompt_excerpt', 'response_excerpt', 'method_summary', 'result_summary', 'review_note'],
    indexed: [],
  },

  ai_training_cases: {
    fields: ['title', 'summary', 'prompt_text', 'followup_text', 'response_text', 'reusable_method_text', 'business_result_text'],
    indexed: [],
  },

  // 周报、经营周报：高敏，重点保护
  weekly_reports: {
    fields: ['completed', 'next_week_plan', 'risks'],
    indexed: [],
  },

  content_revisions: {
    fields: ['snapshot_json'],
    indexed: [],
  },

  executive_reports: {
    fields: [
      'weekly_results', 'key_judgment', 'decision_needed', 'next_week_actions',
      'key_issues', 'decisions',
      'strategic_direction', 'key_focus', 'monthly_summary',
    ],
    indexed: [],
  },

  business_trips: {
    fields: ['destinations', 'purpose', 'related_persons', 'approve_note'],
    indexed: [],
  },

  trip_expenses: {
    fields: ['description'],
    indexed: [],
  },

  expense_reports: {
    fields: ['approve_note'],
    indexed: [],
  },

  reminders: {
    fields: ['title', 'note'],
    indexed: [],
  },

  gifts: {
    fields: ['name', 'description', 'notes'],
    indexed: [],
  },

  gift_plans: {
    fields: ['title', 'occasion', 'description'],
    indexed: [],
  },

  gift_requests: {
    fields: ['*text*'],
    indexed: [],
    skip: true,
  },

  gift_records: {
    fields: ['*text*'],
    indexed: [],
    skip: true,
  },

  user_ai_model_settings: {
    fields: ['api_key'],
    indexed: [],
  },

  system_ai_model_settings: {
    fields: ['api_key'],
    indexed: [],
  },
};
