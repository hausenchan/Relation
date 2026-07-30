const crypto = require('crypto');

const BUSINESS_DAILY_REPORT_MENU_KEY = '/agents/business-daily-reports';
const BUSINESS_DAILY_REPORT_MODULE_KEY = 'business_daily_report';
const BUSINESS_DAILY_REPORT_SKILL_CODE = 'yyz-dashboard-analysis';
const BUSINESS_DAILY_REPORT_BUSINESS_CODE = 'YYZ';

const BUSINESS_DAILY_REPORT_SCOPE_TREE = [
  {
    key: 'project:YYZ',
    scope_type: 'project',
    scope_code: 'YYZ',
    scope_name: 'YYZ项目总览',
    path_labels: ['YYZ项目组', '项目总览'],
    selectable: true,
  },
  {
    key: 'group:business_line',
    scope_name: '业务线分析',
    selectable: false,
    children: [
      {
        key: 'business_line:ZHIXIAO',
        scope_type: 'business_line',
        scope_code: 'ZHIXIAO',
        scope_name: '支小业务',
        path_labels: ['YYZ项目组', '业务线', '支小'],
        selectable: true,
      },
      {
        key: 'business_line:H5',
        scope_type: 'business_line',
        scope_code: 'H5',
        scope_name: 'H5业务',
        path_labels: ['YYZ项目组', '业务线', 'H5'],
        selectable: true,
        children: [
          {
            key: 'business_line:BAIDU_JS',
            scope_type: 'business_line',
            scope_code: 'BAIDU_JS',
            scope_name: '百度JS',
            path_labels: ['YYZ项目组', '业务线', 'H5', '百度JS'],
            selectable: true,
          },
        ],
      },
      {
        key: 'business_line:CPA',
        scope_type: 'business_line',
        scope_code: 'CPA',
        scope_name: 'CPA业务',
        path_labels: ['YYZ项目组', '业务线', 'CPA'],
        selectable: true,
        children: [
          {
            key: 'business_line:CPA_OTHER',
            scope_type: 'business_line',
            scope_code: 'CPA_OTHER',
            scope_name: 'CPA-其它',
            path_labels: ['YYZ项目组', '业务线', 'CPA', 'CPA-其它'],
            selectable: true,
          },
          {
            key: 'business_line:CPA_API',
            scope_type: 'business_line',
            scope_code: 'CPA_API',
            scope_name: 'CPA-API',
            path_labels: ['YYZ项目组', '业务线', 'CPA', 'CPA-API'],
            selectable: true,
          },
          {
            key: 'business_line:CPA_SINGLE_PACKAGE',
            scope_type: 'business_line',
            scope_code: 'CPA_SINGLE_PACKAGE',
            scope_name: '单包非OCPX',
            path_labels: ['YYZ项目组', '业务线', 'CPA', '单包非OCPX'],
            selectable: true,
          },
        ],
      },
      {
        key: 'business_line:TAOXIAO',
        scope_type: 'business_line',
        scope_code: 'TAOXIAO',
        scope_name: '淘小业务',
        path_labels: ['YYZ项目组', '业务线', '淘小'],
        selectable: true,
      },
      {
        key: 'business_line:WEIXIAO',
        scope_type: 'business_line',
        scope_code: 'WEIXIAO',
        scope_name: '微小业务',
        path_labels: ['YYZ项目组', '业务线', '微小'],
        selectable: true,
      },
      {
        key: 'business_line:USER_OPERATION_COST',
        scope_type: 'business_line',
        scope_code: 'USER_OPERATION_COST',
        scope_name: '宝箱/签到',
        path_labels: ['YYZ项目组', '业务线', '宝箱/签到'],
        selectable: true,
      },
    ],
  },
  {
    key: 'group:media',
    scope_name: '媒体分析',
    selectable: false,
    children: [
      {
        key: 'media:ALL',
        scope_type: 'media',
        scope_code: 'ALL',
        scope_name: '媒体大盘',
        path_labels: ['YYZ项目组', '媒体分析', '媒体大盘'],
        selectable: true,
      },
      {
        key: 'media:IQIYI_LITE',
        scope_type: 'media',
        scope_code: 'IQIYI_LITE',
        scope_name: '爱奇艺极速版',
        path_labels: ['YYZ项目组', '媒体分析', '爱奇艺极速版'],
        selectable: true,
      },
    ],
  },
];

function flattenScopeTree(nodes = BUSINESS_DAILY_REPORT_SCOPE_TREE) {
  return nodes.flatMap(node => [
    ...(node.selectable ? [node] : []),
    ...flattenScopeTree(node.children || []),
  ]);
}

const BUSINESS_DAILY_REPORT_SCOPES = flattenScopeTree();
const BUSINESS_DAILY_REPORT_SCOPE_MAP = new Map(
  BUSINESS_DAILY_REPORT_SCOPES.map(scope => [`${scope.scope_type}:${scope.scope_code}`, scope]),
);

function resolveBusinessDailyReportScope(scopeType = 'project', scopeCode = 'YYZ') {
  const type = String(scopeType || 'project').trim().toLowerCase();
  const code = String(scopeCode || (type === 'project' ? 'YYZ' : '')).trim().toUpperCase();
  const scope = BUSINESS_DAILY_REPORT_SCOPE_MAP.get(`${type}:${code}`);
  if (!scope) {
    throw new BusinessDailyReportError('不支持该日报分析范围', {
      code: 'INVALID_REPORT_SCOPE',
    });
  }
  return {
    scope_type: scope.scope_type,
    scope_code: scope.scope_code,
    scope_name: scope.scope_name,
    scope_key: scope.key,
    path_labels: [...scope.path_labels],
  };
}

const GENERATION_STAGES = [
  { code: 'queued', label: '进入队列' },
  { code: 'collecting', label: '采集报表数据' },
  { code: 'validating_source', label: '校验来源完整性' },
  { code: 'normalizing', label: '清洗并标准化' },
  { code: 'reconciling', label: '财务与维度对账' },
  { code: 'analyzing', label: '分析异常与机会' },
  { code: 'rendering', label: '生成日报产物' },
];

const ACTIVE_STATUSES = new Set(GENERATION_STAGES.map(stage => stage.code));
const REVISION_NARRATIVE_FIELDS = [
  'summary',
  'judgment',
  'causes',
  'risks',
  'strategies',
  'actions',
  'notes',
];

class BusinessDailyReportError extends Error {
  constructor(message, { code = 'BUSINESS_DAILY_REPORT_ERROR', status = 400 } = {}) {
    super(message);
    this.name = 'BusinessDailyReportError';
    this.code = code;
    this.status = status;
  }
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return fallback;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isDateOnly(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function getTodayDateOnly(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertReportDate(value, now = new Date()) {
  const reportDate = String(value || '').trim();
  if (!isDateOnly(reportDate)) {
    throw new BusinessDailyReportError('日报日期格式必须为 YYYY-MM-DD', {
      code: 'INVALID_REPORT_DATE',
    });
  }
  if (reportDate > getTodayDateOnly(now)) {
    throw new BusinessDailyReportError('不能生成未来日期的日报', {
      code: 'FUTURE_REPORT_DATE',
    });
  }
  return reportDate;
}

function clipText(value, maxLength = 2000) {
  const text = String(value ?? '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function isUniqueConstraintError(error) {
  return error?.code === 'ER_DUP_ENTRY'
    || error?.code === 'SQLITE_CONSTRAINT_UNIQUE'
    || /duplicate entry|unique constraint/i.test(String(error?.message || ''));
}

function normalizeNarrativeValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => clipText(item, 4000)).filter(Boolean).slice(0, 50);
  }
  return clipText(value, 20000);
}

function applyNarrativePatch(reportModel, narrativePatch) {
  const base = reportModel && typeof reportModel === 'object' && !Array.isArray(reportModel)
    ? JSON.parse(JSON.stringify(reportModel))
    : {};
  const current = base.narrative && typeof base.narrative === 'object' && !Array.isArray(base.narrative)
    ? base.narrative
    : {};
  const patch = narrativePatch && typeof narrativePatch === 'object' && !Array.isArray(narrativePatch)
    ? narrativePatch
    : {};
  base.narrative = { ...current };
  REVISION_NARRATIVE_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      base.narrative[field] = normalizeNarrativeValue(patch[field]);
    }
  });
  return base;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function narrativeHtml(value) {
  if (Array.isArray(value)) {
    if (!value.length) return '<p class="empty">暂无补充</p>';
    return `<ul>${value.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
  const text = String(value || '').trim();
  if (!text) return '<p class="empty">暂无补充</p>';
  return text.split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join('');
}

function sanitizeReportHtml(html) {
  let output = String(html || '');
  output = output.replace(/<!--[\s\S]*?-->/g, '');
  output = output.replace(/<(script|iframe|object|embed|form|base|link|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  output = output.replace(/<(script|iframe|object|embed|form|base|link|meta)\b[^>]*\/?>/gi, '');
  output = output.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  output = output.replace(/\s+(href|src|xlink:href)\s*=\s*(["'])([\s\S]*?)\2/gi, (match, attribute, quote, value) => {
    const normalized = String(value || '').trim();
    if (attribute.toLowerCase() === 'href' && normalized.startsWith('#')) {
      return ` href=${quote}${normalized}${quote}`;
    }
    if (attribute.toLowerCase() === 'src' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(normalized)) {
      return ` src=${quote}${normalized}${quote}`;
    }
    return '';
  });
  output = output.replace(/\s+(href|src|xlink:href)\s*=\s*(?!["'])([^\s>]+)/gi, (match, attribute, value) => {
    const normalized = String(value || '').trim();
    if (attribute.toLowerCase() === 'href' && normalized.startsWith('#')) return ` href=${normalized}`;
    if (attribute.toLowerCase() === 'src' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(normalized)) {
      return ` src=${normalized}`;
    }
    return '';
  });
  return output;
}

function removeClassToken(classValue, token) {
  return String(classValue || '')
    .split(/\s+/)
    .filter(item => item && item !== token)
    .join(' ');
}

function normalizeZhixiaoReportHtmlForArtifact(html) {
  const source = String(html || '');
  if (!/<title>\s*支小应用数据\s*<\/title>/i.test(source)
    || !/const\s+PASSWORD\s*=\s*["']zfb666["']/.test(source)
    || !/zfb_pass_multi_\d{4}-\d{2}-\d{2}/.test(source)) {
    throw new BusinessDailyReportError('支小 HTML 报告格式不符合预期', {
      code: 'INVALID_ZHIXIAO_HTML',
      status: 422,
    });
  }

  let output = source.replace(/<!--[\s\S]*?-->/g, '');
  output = output.replace(/<base\b[^>]*>/gi, '');
  output = output.replace(/<link\b[^>]*>/gi, '');
  output = output.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
  output = output.replace(/<iframe\b[^>]*\/?>/gi, '');
  output = output.replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, '');
  output = output.replace(/<object\b[^>]*\/?>/gi, '');
  output = output.replace(/<embed\b[^>]*\/?>/gi, '');
  output = output.replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, '');
  output = output.replace(/<div\b([^>]*\bclass=(["'])[^"']*\bpassword-mask\b[^"']*\2[^>]*)>[\s\S]*?<\/div>\s*(?=<nav\b[^>]*\bclass=(["'])[^"']*\bside-nav\b)/i, '');
  output = output.replace(/<body\b([^>]*)>/i, (match, attrs) => {
    const classMatch = String(attrs || '').match(/\bclass=(["'])([\s\S]*?)\1/i);
    const nextClass = removeClassToken(classMatch?.[2], 'locked');
    let nextAttrs = String(attrs || '').replace(/\s*\bclass=(["'])([\s\S]*?)\1/i, '');
    if (nextClass) nextAttrs += ` class="${nextClass}"`;
    return `<body${nextAttrs}>`;
  });
  output = output.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  output = output.replace(/\s+(href|src|xlink:href)\s*=\s*(["'])([\s\S]*?)\2/gi, (match, attribute, quote, value) => {
    const normalized = String(value || '').trim();
    if (attribute.toLowerCase() === 'href' && normalized.startsWith('#')) {
      return ` href=${quote}${normalized}${quote}`;
    }
    if (attribute.toLowerCase() === 'src' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(normalized)) {
      return ` src=${quote}${normalized}${quote}`;
    }
    return '';
  });
  output = output.replace(/\s+(href|src|xlink:href)\s*=\s*(?!["'])([^\s>]+)/gi, (match, attribute, value) => {
    const normalized = String(value || '').trim();
    if (attribute.toLowerCase() === 'href' && normalized.startsWith('#')) return ` href=${normalized}`;
    if (attribute.toLowerCase() === 'src' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(normalized)) {
      return ` src=${normalized}`;
    }
    return '';
  });
  output = output.replace(/checkPwd\(\);\s*/g, '');
  output = output.replace(/localStorage\.setItem\(PASS_KEY,\s*["']ok["']\);/g, '');

  if (/password-mask/i.test(output) || /class=(["'])[^"']*\blocked\b[^"']*\1/i.test(output)) {
    throw new BusinessDailyReportError('支小 HTML 密码门移除失败', {
      code: 'ZHIXIAO_PASSWORD_GATE_NOT_REMOVED',
      status: 422,
    });
  }
  return output;
}

function extractHtmlBody(html) {
  const match = String(html || '').match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return match ? match[1] : String(html || '');
}

function extractStyleTags(html) {
  return (String(html || '').match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi) || []).join('\n');
}

function renderRevisionHtml({ report, reportModel, originalHtml = '' }) {
  const narrative = reportModel?.narrative || {};
  const labels = {
    summary: '执行摘要',
    judgment: '经营判断',
    causes: '原因与证据',
    risks: '风险与数据限制',
    strategies: '增长策略',
    actions: '行动项',
    notes: '人工备注',
  };
  const sections = REVISION_NARRATIVE_FIELDS.map(field => `
    <section class="revision-section">
      <h2>${labels[field]}</h2>
      ${narrativeHtml(narrative[field])}
    </section>
  `).join('');
  const sanitizedOriginal = sanitizeReportHtml(originalHtml);
  const originalBody = extractHtmlBody(sanitizedOriginal);
  const originalStyles = extractStyleTags(sanitizedOriginal);
  const machineSection = originalBody.trim()
    ? `<section class="machine-report"><h2>机器报告数据与图表</h2>${originalBody}</section>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report?.title || '业务日报')}</title>
  ${originalStyles}
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #fff; color: #1f2937; font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(1120px, 100%); margin: 0 auto; }
    h1 { margin: 0; color: #111827; font-size: 24px; letter-spacing: 0; }
    .meta { margin: 4px 0 24px; color: #667085; }
    .revision-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .revision-section { padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }
    .revision-section h2, .machine-report > h2 { margin: 0 0 10px; color: #111827; font-size: 16px; letter-spacing: 0; }
    .revision-section p { margin: 0 0 8px; white-space: pre-wrap; }
    .revision-section ul { margin: 0; padding-left: 20px; }
    .empty { color: #98a2b3; }
    .machine-report { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    @media (max-width: 720px) { body { padding: 16px; } .revision-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header><h1>${escapeHtml(report?.title || '业务日报')}</h1><div class="meta">${escapeHtml(report?.report_date || '')} · 人工修订版</div></header>
    <div class="revision-grid">${sections}</div>
    ${machineSection}
  </main>
</body>
</html>`;
}

function ensureBusinessDailyReportTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_business_daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_code VARCHAR(32) NOT NULL,
      scope_type VARCHAR(32) NOT NULL DEFAULT 'project',
      scope_code VARCHAR(80) NOT NULL DEFAULT 'YYZ',
      scope_name VARCHAR(191) NOT NULL DEFAULT 'YYZ项目总览',
      report_date DATE NOT NULL,
      generation_no INTEGER NOT NULL,
      scope_generation_no INTEGER NOT NULL DEFAULT 1,
      title VARCHAR(191) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'queued',
      stage_code VARCHAR(40) NOT NULL DEFAULT 'queued',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      quality_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      review_status VARCHAR(32) NOT NULL DEFAULT 'unreviewed',
      skill_id INTEGER,
      skill_version_id INTEGER,
      skill_code VARCHAR(80) NOT NULL,
      skill_version_no VARCHAR(40),
      skill_tree_hash VARCHAR(64),
      metric_contract_version VARCHAR(40) NOT NULL DEFAULT 'source-v2',
      renderer_version VARCHAR(40) NOT NULL DEFAULT 'daily-report-v1',
      connector_version VARCHAR(40) NOT NULL DEFAULT 'midmax-connector-v1',
      source_hash VARCHAR(64),
      normalized_hash VARCHAR(64),
      current_revision_id INTEGER,
      created_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      deleted_at DATETIME,
      deleted_by INTEGER,
      delete_reason TEXT,
      error_code VARCHAR(80),
      error_message TEXT,
      UNIQUE(business_code, report_date, generation_no)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_reports_date
      ON ai_business_daily_reports(business_code, report_date, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_reports_status
      ON ai_business_daily_reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_reports_skill
      ON ai_business_daily_reports(skill_version_id, report_date);

    CREATE TABLE IF NOT EXISTS ai_business_daily_report_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      run_code VARCHAR(64) NOT NULL,
      stage_code VARCHAR(40) NOT NULL,
      stage_label VARCHAR(80) NOT NULL,
      stage_order INTEGER NOT NULL,
      stage_status VARCHAR(24) NOT NULL DEFAULT 'pending',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      input_summary_json TEXT,
      output_summary_json TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      error_code VARCHAR(80),
      error_message TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(report_id, run_code, stage_code),
      FOREIGN KEY (report_id) REFERENCES ai_business_daily_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_report_runs_report
      ON ai_business_daily_report_runs(report_id, stage_order);

    CREATE TABLE IF NOT EXISTS ai_business_daily_report_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      revision_id INTEGER,
      artifact_type VARCHAR(48) NOT NULL,
      storage_type VARCHAR(24) NOT NULL DEFAULT 'mysql_encrypted',
      storage_key VARCHAR(500),
      content_text TEXT,
      content_hash VARCHAR(64) NOT NULL,
      content_size INTEGER NOT NULL DEFAULT 0,
      content_type VARCHAR(120),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES ai_business_daily_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_report_artifacts_report
      ON ai_business_daily_report_artifacts(report_id, artifact_type, revision_id);

    CREATE TABLE IF NOT EXISTS ai_business_daily_report_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      revision_no INTEGER NOT NULL,
      base_revision_no INTEGER NOT NULL DEFAULT 0,
      lock_version INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      report_model_json TEXT NOT NULL,
      rendered_html_artifact_id INTEGER,
      change_summary TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      review_comment TEXT,
      UNIQUE(report_id, revision_no),
      FOREIGN KEY (report_id) REFERENCES ai_business_daily_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_report_revisions_report
      ON ai_business_daily_report_revisions(report_id, revision_no);

    CREATE TABLE IF NOT EXISTS ai_business_daily_report_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      revision_id INTEGER,
      section_code VARCHAR(80),
      field_path VARCHAR(255),
      annotation_type VARCHAR(40) NOT NULL,
      error_type VARCHAR(64),
      original_value_json TEXT,
      corrected_value_json TEXT,
      reason_text TEXT,
      evidence_refs_json TEXT,
      score DOUBLE,
      created_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES ai_business_daily_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_report_annotations_report
      ON ai_business_daily_report_annotations(report_id, revision_id, created_at);

    CREATE TABLE IF NOT EXISTS ai_business_daily_report_training_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      revision_id INTEGER,
      candidate_id INTEGER,
      case_id INTEGER,
      eval_case_id INTEGER,
      skill_version_id INTEGER,
      status VARCHAR(32) NOT NULL DEFAULT 'candidate',
      created_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(report_id, revision_id, status),
      FOREIGN KEY (report_id) REFERENCES ai_business_daily_reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_report_training_links_report
      ON ai_business_daily_report_training_links(report_id, revision_id);
  `);

  const reportColumns = new Set(
    db.prepare('PRAGMA table_info(ai_business_daily_reports)').all().map(column => column.name),
  );
  const missingColumns = [
    ['scope_type', "VARCHAR(32) NOT NULL DEFAULT 'project'"],
    ['scope_code', "VARCHAR(80) NOT NULL DEFAULT 'YYZ'"],
    ['scope_name', "VARCHAR(191) NOT NULL DEFAULT 'YYZ项目总览'"],
    ['scope_generation_no', 'INTEGER NOT NULL DEFAULT 1'],
  ];
  const scopeGenerationColumnWasMissing = !reportColumns.has('scope_generation_no');
  missingColumns.forEach(([column, definition]) => {
    if (!reportColumns.has(column)) {
      db.exec(`ALTER TABLE ai_business_daily_reports ADD COLUMN ${column} ${definition}`);
    }
  });
  if (scopeGenerationColumnWasMissing) {
    db.prepare(`
      UPDATE ai_business_daily_reports
      SET scope_generation_no = generation_no
    `).run();
  }
  db.prepare(`
    UPDATE ai_business_daily_reports
    SET scope_type = COALESCE(NULLIF(scope_type, ''), 'project'),
        scope_code = COALESCE(NULLIF(scope_code, ''), 'YYZ'),
        scope_name = COALESCE(NULLIF(scope_name, ''), 'YYZ项目总览'),
        scope_generation_no = CASE
          WHEN scope_generation_no IS NULL OR scope_generation_no < 1 THEN generation_no
          ELSE scope_generation_no
        END
  `).run();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_business_daily_reports_scope
      ON ai_business_daily_reports(business_code, scope_type, scope_code, report_date, deleted_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_business_daily_reports_scope_generation
      ON ai_business_daily_reports(business_code, scope_type, scope_code, report_date, scope_generation_no);
  `);
}

function serializeReport(row, decryptRow) {
  if (!row) return null;
  const decrypted = decryptRow ? decryptRow('ai_business_daily_reports', row) : row;
  const scopeKey = `${decrypted.scope_type || 'project'}:${decrypted.scope_code || 'YYZ'}`;
  const scopePathLabels = BUSINESS_DAILY_REPORT_SCOPE_MAP.get(scopeKey)?.path_labels
    || [decrypted.scope_name || 'YYZ项目总览'];
  return {
    ...decrypted,
    id: Number(decrypted.id),
    generation_no: Number(decrypted.generation_no || 0),
    scope_generation_no: Number(decrypted.scope_generation_no || decrypted.generation_no || 0),
    progress_percent: Number(decrypted.progress_percent || 0),
    skill_id: decrypted.skill_id ? Number(decrypted.skill_id) : null,
    skill_version_id: decrypted.skill_version_id ? Number(decrypted.skill_version_id) : null,
    current_revision_id: decrypted.current_revision_id ? Number(decrypted.current_revision_id) : null,
    current_revision_no: decrypted.current_revision_no === null || decrypted.current_revision_no === undefined
      ? null
      : Number(decrypted.current_revision_no),
    created_by: Number(decrypted.created_by),
    deleted_by: decrypted.deleted_by ? Number(decrypted.deleted_by) : null,
    scope_path_labels: scopePathLabels,
  };
}

function serializeRevision(row, decryptRow, { includeModel = false } = {}) {
  if (!row) return null;
  const decrypted = decryptRow ? decryptRow('ai_business_daily_report_revisions', row) : row;
  const serialized = {
    ...decrypted,
    id: Number(decrypted.id),
    report_id: Number(decrypted.report_id),
    revision_no: Number(decrypted.revision_no || 0),
    base_revision_no: Number(decrypted.base_revision_no || 0),
    lock_version: Number(decrypted.lock_version || 1),
    created_by: Number(decrypted.created_by),
    reviewed_by: decrypted.reviewed_by ? Number(decrypted.reviewed_by) : null,
    rendered_html_artifact_id: decrypted.rendered_html_artifact_id
      ? Number(decrypted.rendered_html_artifact_id)
      : null,
  };
  if (includeModel) serialized.report_model = parseJson(decrypted.report_model_json, {});
  delete serialized.report_model_json;
  return serialized;
}

function createBusinessDailyReportStore({ db, identityDb = db, encryptRow, decryptRow }) {
  if (!db) throw new Error('business daily report store requires db');
  ensureBusinessDailyReportTables(db);

  const getIdentityNames = userIds => {
    const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
    if (!ids.length || !identityDb) return new Map();
    const rows = identityDb.prepare(`
      SELECT id, display_name, username
      FROM users
      WHERE id IN (${ids.map(() => '?').join(',')})
    `).all(...ids);
    return new Map(rows.map(row => [Number(row.id), row.display_name || row.username || `用户${row.id}`]));
  };

  const attachReportIdentityNames = rows => {
    const source = Array.isArray(rows) ? rows : [rows];
    const names = getIdentityNames(source.flatMap(row => [row?.created_by, row?.deleted_by]));
    const hydrated = source.map(row => row ? {
      ...row,
      created_by_name: names.get(Number(row.created_by)) || null,
      deleted_by_name: names.get(Number(row.deleted_by)) || null,
    } : row);
    return Array.isArray(rows) ? hydrated : hydrated[0];
  };

  const attachRevisionIdentityNames = rows => {
    const source = Array.isArray(rows) ? rows : [rows];
    const names = getIdentityNames(source.flatMap(row => [row?.created_by, row?.reviewed_by]));
    const hydrated = source.map(row => row ? {
      ...row,
      created_by_name: names.get(Number(row.created_by)) || null,
      reviewed_by_name: names.get(Number(row.reviewed_by)) || null,
    } : row);
    return Array.isArray(rows) ? hydrated : hydrated[0];
  };

  const getReportRow = (reportId, { includeDeleted = true } = {}) => attachReportIdentityNames(db.prepare(`
    SELECT r.*,
      cr.revision_no AS current_revision_no,
      cr.status AS current_revision_status
    FROM ai_business_daily_reports r
    LEFT JOIN ai_business_daily_report_revisions cr ON cr.id = r.current_revision_id
    WHERE r.id = ?
      ${includeDeleted ? '' : 'AND r.deleted_at IS NULL'}
  `).get(Number(reportId)));

  const requireReport = (reportId, options) => {
    const row = getReportRow(reportId, options);
    if (!row) {
      throw new BusinessDailyReportError('日报不存在', {
        code: 'REPORT_NOT_FOUND',
        status: 404,
      });
    }
    return row;
  };

  const getRevisionRow = (reportId, revisionId) => attachRevisionIdentityNames(db.prepare(`
    SELECT rv.*
    FROM ai_business_daily_report_revisions rv
    WHERE rv.report_id = ? AND rv.id = ?
  `).get(Number(reportId), Number(revisionId)));

  const requireRevision = (reportId, revisionId) => {
    const row = getRevisionRow(reportId, revisionId);
    if (!row) {
      throw new BusinessDailyReportError('日报修订版本不存在', {
        code: 'REVISION_NOT_FOUND',
        status: 404,
      });
    }
    return row;
  };

  const putArtifact = ({ reportId, revisionId = null, artifactType, content, contentType }) => {
    const text = typeof content === 'string' ? content : stringifyJson(content);
    const encrypted = encryptRow
      ? encryptRow('ai_business_daily_report_artifacts', { content_text: text })
      : { content_text: text };
    const result = db.prepare(`
      INSERT INTO ai_business_daily_report_artifacts (
        report_id, revision_id, artifact_type, storage_type, content_text,
        content_hash, content_size, content_type
      ) VALUES (?, ?, ?, 'mysql_encrypted', ?, ?, ?, ?)
    `).run(
      Number(reportId),
      revisionId ? Number(revisionId) : null,
      artifactType,
      encrypted.content_text,
      sha256(text),
      Buffer.byteLength(text, 'utf8'),
      contentType || 'text/plain; charset=utf-8',
    );
    return Number(result.lastInsertRowid);
  };

  const getArtifactRow = ({ reportId, artifactType, revisionId = null, artifactId = null }) => {
    let row;
    if (artifactId) {
      row = db.prepare(`
        SELECT * FROM ai_business_daily_report_artifacts
        WHERE report_id = ? AND id = ?
      `).get(Number(reportId), Number(artifactId));
    } else if (revisionId) {
      row = db.prepare(`
        SELECT * FROM ai_business_daily_report_artifacts
        WHERE report_id = ? AND revision_id = ? AND artifact_type = ?
        ORDER BY id DESC LIMIT 1
      `).get(Number(reportId), Number(revisionId), artifactType);
    } else {
      row = db.prepare(`
        SELECT * FROM ai_business_daily_report_artifacts
        WHERE report_id = ? AND revision_id IS NULL AND artifact_type = ?
        ORDER BY id DESC LIMIT 1
      `).get(Number(reportId), artifactType);
    }
    return row && decryptRow ? decryptRow('ai_business_daily_report_artifacts', row) : row;
  };

  const getCurrentBaseRevisionNo = reportId => {
    const report = requireReport(reportId);
    if (!report.current_revision_id) return 0;
    const revision = getRevisionRow(reportId, report.current_revision_id);
    return revision ? Number(revision.revision_no || 0) : 0;
  };

  const getBaseReportModel = reportId => {
    const report = requireReport(reportId, { includeDeleted: false });
    if (report.current_revision_id) {
      const current = getRevisionRow(reportId, report.current_revision_id);
      if (current) {
        const decrypted = decryptRow
          ? decryptRow('ai_business_daily_report_revisions', current)
          : current;
        return parseJson(decrypted.report_model_json, null);
      }
    }
    const machineRevision = db.prepare(`
      SELECT * FROM ai_business_daily_report_revisions
      WHERE report_id = ? AND revision_no = 0
      LIMIT 1
    `).get(Number(reportId));
    if (machineRevision) {
      const decrypted = decryptRow
        ? decryptRow('ai_business_daily_report_revisions', machineRevision)
        : machineRevision;
      return parseJson(decrypted.report_model_json, null);
    }
    const artifact = getArtifactRow({ reportId, artifactType: 'report_model_json' });
    return parseJson(artifact?.content_text, null);
  };

  return {
    recoverInterruptedReports() {
      const rows = db.prepare(`
        SELECT id, stage_code
        FROM ai_business_daily_reports
        WHERE deleted_at IS NULL
          AND status IN (${[...ACTIVE_STATUSES].map(() => '?').join(',')})
        ORDER BY id ASC
      `).all(...ACTIVE_STATUSES);
      rows.forEach(row => this.failReport(row.id, row.stage_code || 'queued', {
        errorCode: 'GENERATION_INTERRUPTED',
        errorMessage: '服务重启前的日报任务未完成，请重新生成。',
      }));
      return rows.length;
    },

    findActiveReport({
      reportDate,
      userId,
      skillVersionId = null,
      scopeType = 'project',
      scopeCode = 'YYZ',
    }) {
      const normalizedDate = assertReportDate(reportDate);
      const scope = resolveBusinessDailyReportScope(scopeType, scopeCode);
      const statusPlaceholders = [...ACTIVE_STATUSES].map(() => '?').join(',');
      const row = db.prepare(`
        SELECT r.*,
          cr.revision_no AS current_revision_no,
          cr.status AS current_revision_status
        FROM ai_business_daily_reports r
        LEFT JOIN ai_business_daily_report_revisions cr ON cr.id = r.current_revision_id
        WHERE r.business_code = ?
          AND r.report_date = ?
          AND r.scope_type = ?
          AND r.scope_code = ?
          AND r.created_by = ?
          AND r.deleted_at IS NULL
          AND r.status IN (${statusPlaceholders})
          AND (
            r.skill_version_id = ?
            OR (r.skill_version_id IS NULL AND ? IS NULL)
          )
        ORDER BY r.id DESC
        LIMIT 1
      `).get(
        BUSINESS_DAILY_REPORT_BUSINESS_CODE,
        normalizedDate,
        scope.scope_type,
        scope.scope_code,
        Number(userId),
        ...ACTIVE_STATUSES,
        skillVersionId ? Number(skillVersionId) : null,
        skillVersionId ? Number(skillVersionId) : null,
      );
      return row ? serializeReport(attachReportIdentityNames(row), decryptRow) : null;
    },

    listReports({
      page = 1,
      pageSize = 20,
      status = '',
      reportDate = '',
      keyword = '',
      deleted = false,
      scopeType = 'project',
      scopeCode = 'YYZ',
    } = {}) {
      const normalizedPage = Math.max(1, Number(page) || 1);
      const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
      const where = [deleted ? 'r.deleted_at IS NOT NULL' : 'r.deleted_at IS NULL'];
      const params = [];
      const scope = resolveBusinessDailyReportScope(scopeType, scopeCode);
      where.push('r.scope_type = ?', 'r.scope_code = ?');
      params.push(scope.scope_type, scope.scope_code);
      if (status) {
        where.push('r.status = ?');
        params.push(String(status));
      }
      if (reportDate) {
        where.push('r.report_date = ?');
        params.push(assertReportDate(reportDate));
      }
      if (keyword) {
        where.push('(r.title LIKE ? OR r.skill_version_no LIKE ?)');
        const like = `%${clipText(keyword, 100)}%`;
        params.push(like, like);
      }
      const whereSql = where.join(' AND ');
      const total = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM ai_business_daily_reports r
        WHERE ${whereSql}
      `).get(...params)?.count || 0);
      const rows = db.prepare(`
        SELECT r.*,
          cr.revision_no AS current_revision_no,
          cr.status AS current_revision_status
        FROM ai_business_daily_reports r
        LEFT JOIN ai_business_daily_report_revisions cr ON cr.id = r.current_revision_id
        WHERE ${whereSql}
        ORDER BY r.report_date DESC, r.generation_no DESC, r.id DESC
        LIMIT ? OFFSET ?
      `).all(...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize);
      const items = attachReportIdentityNames(rows)
        .map(row => serializeReport(row, decryptRow));
      return {
        items,
        total,
        page: normalizedPage,
        page_size: normalizedPageSize,
      };
    },

    createReport({
      reportDate,
      userId,
      skill = null,
      skillCode = BUSINESS_DAILY_REPORT_SKILL_CODE,
      scopeType = 'project',
      scopeCode = 'YYZ',
    }) {
      const normalizedDate = assertReportDate(reportDate);
      const scope = resolveBusinessDailyReportScope(scopeType, scopeCode);
      const actorUserId = Number(userId);
      if (!actorUserId) throw new BusinessDailyReportError('缺少日报发起人');
      const create = db.transaction(() => {
        const generation = db.prepare(`
          SELECT COALESCE(MAX(generation_no), 0) AS generation_no
          FROM ai_business_daily_reports
          WHERE business_code = ? AND report_date = ?
        `).get(BUSINESS_DAILY_REPORT_BUSINESS_CODE, normalizedDate);
        const generationNo = Number(generation?.generation_no || 0) + 1;
        const scopeGeneration = db.prepare(`
          SELECT COALESCE(MAX(scope_generation_no), 0) AS generation_no
          FROM ai_business_daily_reports
          WHERE business_code = ? AND scope_type = ? AND scope_code = ? AND report_date = ?
        `).get(
          BUSINESS_DAILY_REPORT_BUSINESS_CODE,
          scope.scope_type,
          scope.scope_code,
          normalizedDate,
        );
        const scopeGenerationNo = Number(scopeGeneration?.generation_no || 0) + 1;
        const title = `${scope.scope_name}日报 · ${normalizedDate}`;
        const result = db.prepare(`
          INSERT INTO ai_business_daily_reports (
            business_code, scope_type, scope_code, scope_name, report_date,
            generation_no, scope_generation_no, title, status, stage_code,
            progress_percent, skill_id, skill_version_id, skill_code, skill_version_no,
            skill_tree_hash, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', 0, ?, ?, ?, ?, ?, ?)
        `).run(
          BUSINESS_DAILY_REPORT_BUSINESS_CODE,
          scope.scope_type,
          scope.scope_code,
          scope.scope_name,
          normalizedDate,
          generationNo,
          scopeGenerationNo,
          title,
          skill?.id || null,
          skill?.version_id || null,
          skillCode || BUSINESS_DAILY_REPORT_SKILL_CODE,
          skill?.version_no || null,
          skill?.tree_hash || null,
          actorUserId,
        );
        const reportId = Number(result.lastInsertRowid);
        const runCode = crypto.randomUUID();
        const insertStage = db.prepare(`
          INSERT INTO ai_business_daily_report_runs (
            report_id, run_code, stage_code, stage_label, stage_order, stage_status,
            progress_percent, input_summary_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        GENERATION_STAGES.forEach((stage, index) => insertStage.run(
          reportId,
          runCode,
          stage.code,
          stage.label,
          index,
          stage.code === 'queued' ? 'running' : 'pending',
          stage.code === 'queued' ? 1 : 0,
          stage.code === 'queued'
            ? stringifyJson({
              business_code: BUSINESS_DAILY_REPORT_BUSINESS_CODE,
              report_date: normalizedDate,
              scope_type: scope.scope_type,
              scope_code: scope.scope_code,
            })
            : null,
        ));
        return reportId;
      });
      let reportId = null;
      let lastError = null;
      for (let attempt = 0; attempt < 3 && !reportId; attempt += 1) {
        try {
          reportId = create();
        } catch (error) {
          lastError = error;
          if (!isUniqueConstraintError(error)) throw error;
        }
      }
      if (!reportId) throw lastError || new BusinessDailyReportError('创建日报版本失败');
      return serializeReport(requireReport(reportId), decryptRow);
    },

    getReport(reportId, options) {
      return serializeReport(requireReport(reportId, options), decryptRow);
    },

    listRuns(reportId) {
      requireReport(reportId);
      return db.prepare(`
        SELECT * FROM ai_business_daily_report_runs
        WHERE report_id = ?
        ORDER BY stage_order ASC, id ASC
      `).all(Number(reportId)).map(row => {
        const decrypted = decryptRow
          ? decryptRow('ai_business_daily_report_runs', row)
          : row;
        return {
          ...decrypted,
          id: Number(decrypted.id),
          report_id: Number(decrypted.report_id),
          stage_order: Number(decrypted.stage_order || 0),
          progress_percent: Number(decrypted.progress_percent || 0),
          input_summary: parseJson(decrypted.input_summary_json, null),
          output_summary: parseJson(decrypted.output_summary_json, null),
          input_summary_json: undefined,
          output_summary_json: undefined,
        };
      });
    },

    startStage(reportId, stageCode, { inputSummary = null } = {}) {
      const stage = GENERATION_STAGES.find(item => item.code === stageCode);
      if (!stage) throw new BusinessDailyReportError('未知的日报生成阶段');
      const encrypted = encryptRow ? encryptRow('ai_business_daily_report_runs', {
        input_summary_json: inputSummary ? stringifyJson(inputSummary) : null,
      }) : { input_summary_json: inputSummary ? stringifyJson(inputSummary) : null };
      db.prepare(`
        UPDATE ai_business_daily_report_runs
        SET stage_status = 'running', progress_percent = ?, input_summary_json = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE report_id = ? AND stage_code = ?
      `).run(
        Math.max(1, Math.round((GENERATION_STAGES.indexOf(stage) / GENERATION_STAGES.length) * 100)),
        encrypted.input_summary_json,
        Number(reportId),
        stageCode,
      );
      db.prepare(`
        UPDATE ai_business_daily_reports
        SET status = ?, stage_code = ?, progress_percent = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP), error_code = NULL, error_message = NULL
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        stageCode,
        stageCode,
        Math.max(1, Math.round((GENERATION_STAGES.indexOf(stage) / GENERATION_STAGES.length) * 100)),
        Number(reportId),
      );
    },

    completeStage(reportId, stageCode, { outputSummary = null } = {}) {
      const index = GENERATION_STAGES.findIndex(item => item.code === stageCode);
      if (index < 0) throw new BusinessDailyReportError('未知的日报生成阶段');
      const progress = Math.round(((index + 1) / GENERATION_STAGES.length) * 100);
      const encrypted = encryptRow ? encryptRow('ai_business_daily_report_runs', {
        output_summary_json: outputSummary ? stringifyJson(outputSummary) : null,
      }) : { output_summary_json: outputSummary ? stringifyJson(outputSummary) : null };
      db.prepare(`
        UPDATE ai_business_daily_report_runs
        SET stage_status = 'completed', progress_percent = ?, output_summary_json = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE report_id = ? AND stage_code = ?
      `).run(progress, encrypted.output_summary_json, Number(reportId), stageCode);
      db.prepare(`
        UPDATE ai_business_daily_reports
        SET progress_percent = ?
        WHERE id = ?
      `).run(progress, Number(reportId));
    },

    failReport(reportId, stageCode, { errorCode, errorMessage }) {
      const reportEncrypted = encryptRow ? encryptRow('ai_business_daily_reports', {
        error_message: clipText(errorMessage, 4000),
      }) : { error_message: clipText(errorMessage, 4000) };
      const runEncrypted = encryptRow ? encryptRow('ai_business_daily_report_runs', {
        error_message: clipText(errorMessage, 4000),
      }) : { error_message: clipText(errorMessage, 4000) };
      const failedStage = db.prepare(`
        SELECT stage_order
        FROM ai_business_daily_report_runs
        WHERE report_id = ? AND stage_code = ?
        LIMIT 1
      `).get(Number(reportId), stageCode);
      const fail = db.transaction(() => {
        db.prepare(`
          UPDATE ai_business_daily_report_runs
          SET stage_status = 'failed', error_code = ?, error_message = ?,
              started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE report_id = ? AND stage_code = ?
        `).run(errorCode, runEncrypted.error_message, Number(reportId), stageCode);
        db.prepare(`
          UPDATE ai_business_daily_report_runs
          SET stage_status = 'skipped', updated_at = CURRENT_TIMESTAMP
          WHERE report_id = ? AND stage_order > ? AND stage_status = 'pending'
        `).run(Number(reportId), Number(failedStage?.stage_order || 0));
        db.prepare(`
          UPDATE ai_business_daily_reports
          SET status = 'failed', stage_code = ?, quality_status = 'blocked',
              error_code = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(stageCode, errorCode, reportEncrypted.error_message, Number(reportId));
      });
      fail();
    },

    completeReport(reportId, {
      source = null,
      normalized = null,
      reportModel,
      reportHtml,
      decisionMarkdown = '',
      artifacts = [],
      qualityStatus = 'passed',
    }) {
      requireReport(reportId, { includeDeleted: false });
      const modelText = stringifyJson(reportModel || {});
      const html = sanitizeReportHtml(reportHtml || '');
      const complete = db.transaction(() => {
        if (source !== null) putArtifact({
          reportId,
          artifactType: 'source_json',
          content: source,
          contentType: 'application/json; charset=utf-8',
        });
        if (normalized !== null) putArtifact({
          reportId,
          artifactType: 'normalized_json',
          content: normalized,
          contentType: 'application/json; charset=utf-8',
        });
        putArtifact({
          reportId,
          artifactType: 'report_model_json',
          content: modelText,
          contentType: 'application/json; charset=utf-8',
        });
        const htmlArtifactId = putArtifact({
          reportId,
          artifactType: 'report_html',
          content: html,
          contentType: 'text/html; charset=utf-8',
        });
        if (decisionMarkdown) putArtifact({
          reportId,
          artifactType: 'decision_md',
          content: decisionMarkdown,
          contentType: 'text/markdown; charset=utf-8',
        });
        (Array.isArray(artifacts) ? artifacts : []).forEach(artifact => {
          if (!artifact?.artifactType) return;
          putArtifact({
            reportId,
            revisionId: artifact.revisionId || null,
            artifactType: artifact.artifactType,
            content: artifact.content,
            contentType: artifact.contentType || 'text/plain; charset=utf-8',
          });
        });
        const encryptedRevision = encryptRow ? encryptRow('ai_business_daily_report_revisions', {
          report_model_json: modelText,
          change_summary: '机器原稿',
        }) : { report_model_json: modelText, change_summary: '机器原稿' };
        const report = requireReport(reportId);
        db.prepare(`
          INSERT INTO ai_business_daily_report_revisions (
            report_id, revision_no, base_revision_no, status, report_model_json,
            rendered_html_artifact_id, change_summary, created_by, submitted_at, reviewed_at
          ) VALUES (?, 0, 0, 'machine', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          Number(reportId),
          encryptedRevision.report_model_json,
          htmlArtifactId,
          encryptedRevision.change_summary,
          report.created_by,
        );
        db.prepare(`
          UPDATE ai_business_daily_reports
          SET status = 'completed', stage_code = 'rendering', progress_percent = 100,
              quality_status = ?, source_hash = ?, normalized_hash = ?,
              completed_at = CURRENT_TIMESTAMP, error_code = NULL, error_message = NULL
          WHERE id = ?
        `).run(
          qualityStatus,
          source === null ? null : sha256(stringifyJson(source)),
          normalized === null ? null : sha256(stringifyJson(normalized)),
          Number(reportId),
        );
      });
      complete();
      return serializeReport(requireReport(reportId), decryptRow);
    },

    listArtifacts(reportId) {
      requireReport(reportId);
      return db.prepare(`
        SELECT id, report_id, revision_id, artifact_type, storage_type, content_hash,
          content_size, content_type, created_at
        FROM ai_business_daily_report_artifacts
        WHERE report_id = ?
        ORDER BY id ASC
      `).all(Number(reportId)).map(row => ({
        ...row,
        id: Number(row.id),
        report_id: Number(row.report_id),
        revision_id: row.revision_id ? Number(row.revision_id) : null,
        content_size: Number(row.content_size || 0),
      }));
    },

    getArtifact(reportId, artifactType, { revisionId = null } = {}) {
      requireReport(reportId);
      const row = getArtifactRow({ reportId, artifactType, revisionId });
      if (!row) {
        throw new BusinessDailyReportError('日报产物不存在', {
          code: 'ARTIFACT_NOT_FOUND',
          status: 404,
        });
      }
      return row;
    },

    getHtml(reportId, { revisionId = null, machine = false } = {}) {
      const report = requireReport(reportId);
      let artifact = null;
      if (machine) {
        artifact = getArtifactRow({ reportId, artifactType: 'report_html' });
      } else if (revisionId) {
        const revision = requireRevision(reportId, revisionId);
        if (revision.rendered_html_artifact_id) {
          artifact = getArtifactRow({ reportId, artifactId: revision.rendered_html_artifact_id });
        }
      } else if (report.current_revision_id) {
        const revision = requireRevision(reportId, report.current_revision_id);
        if (revision.rendered_html_artifact_id) {
          artifact = getArtifactRow({ reportId, artifactId: revision.rendered_html_artifact_id });
        }
      }
      if (!artifact) artifact = getArtifactRow({ reportId, artifactType: 'report_html' });
      if (!artifact?.content_text) {
        throw new BusinessDailyReportError('日报 HTML 尚未生成', {
          code: 'REPORT_HTML_NOT_READY',
          status: 409,
        });
      }
      return sanitizeReportHtml(artifact.content_text);
    },

    listRevisions(reportId, { includeModel = false } = {}) {
      requireReport(reportId);
      const rows = db.prepare(`
        SELECT rv.*
        FROM ai_business_daily_report_revisions rv
        WHERE rv.report_id = ?
        ORDER BY rv.revision_no DESC, rv.id DESC
      `).all(Number(reportId));
      return attachRevisionIdentityNames(rows)
        .map(row => serializeRevision(row, decryptRow, { includeModel }));
    },

    createRevision(reportId, { userId, narrative = {}, changeSummary = '' }) {
      const report = requireReport(reportId, { includeDeleted: false });
      if (report.status !== 'completed' && report.status !== 'partial') {
        throw new BusinessDailyReportError('日报生成完成后才能创建修订', {
          code: 'REPORT_NOT_EDITABLE',
          status: 409,
        });
      }
      const existingDraft = db.prepare(`
        SELECT id
        FROM ai_business_daily_report_revisions
        WHERE report_id = ? AND created_by = ? AND status = 'draft'
        ORDER BY id DESC
        LIMIT 1
      `).get(Number(reportId), Number(userId));
      if (existingDraft) {
        throw new BusinessDailyReportError('已有未提交的修订草稿，请继续编辑该版本', {
          code: 'REVISION_DRAFT_EXISTS',
          status: 409,
        });
      }
      const baseModel = getBaseReportModel(reportId);
      if (!baseModel) {
        throw new BusinessDailyReportError('日报缺少可编辑的报告模型', {
          code: 'REPORT_MODEL_NOT_READY',
          status: 409,
        });
      }
      const nextModel = applyNarrativePatch(baseModel, narrative);
      const reportModelText = stringifyJson(nextModel);
      const originalHtml = (() => {
        try {
          return this.getHtml(reportId, { machine: true });
        } catch {
          return '';
        }
      })();
      const create = db.transaction(() => {
        const maxRevision = db.prepare(`
          SELECT COALESCE(MAX(revision_no), 0) AS revision_no
          FROM ai_business_daily_report_revisions
          WHERE report_id = ?
        `).get(Number(reportId));
        const revisionNo = Number(maxRevision?.revision_no || 0) + 1;
        const baseRevisionNo = getCurrentBaseRevisionNo(reportId);
        const encrypted = encryptRow ? encryptRow('ai_business_daily_report_revisions', {
          report_model_json: reportModelText,
          change_summary: clipText(changeSummary || `人工修订 v${revisionNo}`, 1000),
        }) : {
          report_model_json: reportModelText,
          change_summary: clipText(changeSummary || `人工修订 v${revisionNo}`, 1000),
        };
        const result = db.prepare(`
          INSERT INTO ai_business_daily_report_revisions (
            report_id, revision_no, base_revision_no, lock_version, status,
            report_model_json, change_summary, created_by
          ) VALUES (?, ?, ?, 1, 'draft', ?, ?, ?)
        `).run(
          Number(reportId),
          revisionNo,
          baseRevisionNo,
          encrypted.report_model_json,
          encrypted.change_summary,
          Number(userId),
        );
        const revisionId = Number(result.lastInsertRowid);
        const renderedHtml = renderRevisionHtml({ report, reportModel: nextModel, originalHtml });
        const artifactId = putArtifact({
          reportId,
          revisionId,
          artifactType: 'report_html',
          content: renderedHtml,
          contentType: 'text/html; charset=utf-8',
        });
        db.prepare(`
          UPDATE ai_business_daily_report_revisions
          SET rendered_html_artifact_id = ?
          WHERE id = ?
        `).run(artifactId, revisionId);
        db.prepare(`
          UPDATE ai_business_daily_reports
          SET review_status = 'draft'
          WHERE id = ?
        `).run(Number(reportId));
        return revisionId;
      });
      return serializeRevision(requireRevision(reportId, create()), decryptRow, { includeModel: true });
    },

    updateRevision(reportId, revisionId, {
      userId,
      narrative = {},
      changeSummary = '',
      baseRevisionNo,
      lockVersion,
    }) {
      const report = requireReport(reportId, { includeDeleted: false });
      const revision = requireRevision(reportId, revisionId);
      if (revision.status !== 'draft') {
        throw new BusinessDailyReportError('只有草稿修订可以编辑', {
          code: 'REVISION_NOT_EDITABLE',
          status: 409,
        });
      }
      if (Number(revision.created_by) !== Number(userId)) {
        throw new BusinessDailyReportError('只能编辑自己创建的修订草稿', {
          code: 'REVISION_OWNER_REQUIRED',
          status: 403,
        });
      }
      if (Number(lockVersion) !== Number(revision.lock_version)) {
        throw new BusinessDailyReportError('修订内容已被更新，请刷新后合并修改', {
          code: 'REVISION_CONFLICT',
          status: 409,
        });
      }
      const currentBaseRevisionNo = getCurrentBaseRevisionNo(reportId);
      if (Number(baseRevisionNo) !== Number(revision.base_revision_no)
        || Number(revision.base_revision_no) !== currentBaseRevisionNo) {
        throw new BusinessDailyReportError('日报当前采用版本已变化，请基于最新版本重新修订', {
          code: 'REVISION_BASE_CONFLICT',
          status: 409,
        });
      }
      const decrypted = decryptRow
        ? decryptRow('ai_business_daily_report_revisions', revision)
        : revision;
      const nextModel = applyNarrativePatch(parseJson(decrypted.report_model_json, {}), narrative);
      const modelText = stringifyJson(nextModel);
      const originalHtml = (() => {
        try {
          return this.getHtml(reportId, { machine: true });
        } catch {
          return '';
        }
      })();
      const html = renderRevisionHtml({ report, reportModel: nextModel, originalHtml });
      const encrypted = encryptRow ? encryptRow('ai_business_daily_report_revisions', {
        report_model_json: modelText,
        change_summary: clipText(changeSummary || decrypted.change_summary || '', 1000),
      }) : {
        report_model_json: modelText,
        change_summary: clipText(changeSummary || decrypted.change_summary || '', 1000),
      };
      const update = db.transaction(() => {
        const artifactId = putArtifact({
          reportId,
          revisionId,
          artifactType: 'report_html',
          content: html,
          contentType: 'text/html; charset=utf-8',
        });
        const result = db.prepare(`
          UPDATE ai_business_daily_report_revisions
          SET report_model_json = ?, rendered_html_artifact_id = ?, change_summary = ?,
              lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND report_id = ? AND lock_version = ? AND status = 'draft'
        `).run(
          encrypted.report_model_json,
          artifactId,
          encrypted.change_summary,
          Number(revisionId),
          Number(reportId),
          Number(lockVersion),
        );
        if (!result.changes) {
          throw new BusinessDailyReportError('修订内容已被更新，请刷新后重试', {
            code: 'REVISION_CONFLICT',
            status: 409,
          });
        }
      });
      update();
      return serializeRevision(requireRevision(reportId, revisionId), decryptRow, { includeModel: true });
    },

    submitRevision(reportId, revisionId, userId) {
      requireReport(reportId, { includeDeleted: false });
      const revision = requireRevision(reportId, revisionId);
      if (revision.status !== 'draft') {
        throw new BusinessDailyReportError('只有草稿修订可以提交审核', {
          code: 'REVISION_NOT_SUBMITTABLE',
          status: 409,
        });
      }
      if (Number(revision.created_by) !== Number(userId)) {
        throw new BusinessDailyReportError('只能提交自己创建的修订草稿', {
          code: 'REVISION_OWNER_REQUIRED',
          status: 403,
        });
      }
      db.prepare(`
        UPDATE ai_business_daily_report_revisions
        SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND report_id = ?
      `).run(Number(revisionId), Number(reportId));
      db.prepare(`
        UPDATE ai_business_daily_reports SET review_status = 'submitted' WHERE id = ?
      `).run(Number(reportId));
      return serializeRevision(requireRevision(reportId, revisionId), decryptRow, { includeModel: true });
    },

    reviewRevision(reportId, revisionId, { userId, action, comment = '' }) {
      requireReport(reportId, { includeDeleted: false });
      const revision = requireRevision(reportId, revisionId);
      if (revision.status !== 'submitted') {
        throw new BusinessDailyReportError('只有待审核修订可以审核', {
          code: 'REVISION_NOT_REVIEWABLE',
          status: 409,
        });
      }
      const normalizedAction = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : '';
      if (!normalizedAction) throw new BusinessDailyReportError('审核动作必须为 approve 或 reject');
      const encrypted = encryptRow ? encryptRow('ai_business_daily_report_revisions', {
        review_comment: clipText(comment, 2000),
      }) : { review_comment: clipText(comment, 2000) };
      const review = db.transaction(() => {
        db.prepare(`
          UPDATE ai_business_daily_report_revisions
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_comment = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND report_id = ?
        `).run(normalizedAction, Number(userId), encrypted.review_comment, Number(revisionId), Number(reportId));
        db.prepare(`
          UPDATE ai_business_daily_reports
          SET current_revision_id = CASE WHEN ? = 'approved' THEN ? ELSE current_revision_id END,
              review_status = ?
          WHERE id = ?
        `).run(normalizedAction, Number(revisionId), normalizedAction, Number(reportId));
      });
      review();
      return serializeRevision(requireRevision(reportId, revisionId), decryptRow, { includeModel: true });
    },

    softDelete(reportId, { userId, reason = '' }) {
      const report = requireReport(reportId, { includeDeleted: false });
      if (ACTIVE_STATUSES.has(report.status)) {
        throw new BusinessDailyReportError('日报仍在生成中，请等待任务结束后再删除', {
          code: 'REPORT_ACTIVE',
          status: 409,
        });
      }
      if (!String(reason || '').trim()) {
        throw new BusinessDailyReportError('请填写删除原因', {
          code: 'DELETE_REASON_REQUIRED',
        });
      }
      const encrypted = encryptRow ? encryptRow('ai_business_daily_reports', {
        delete_reason: clipText(reason, 1000),
      }) : { delete_reason: clipText(reason, 1000) };
      db.prepare(`
        UPDATE ai_business_daily_reports
        SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, delete_reason = ?
        WHERE id = ? AND deleted_at IS NULL
      `).run(Number(userId), encrypted.delete_reason, Number(reportId));
      return serializeReport(requireReport(reportId), decryptRow);
    },

    restore(reportId) {
      const report = requireReport(reportId);
      if (!report.deleted_at) return serializeReport(report, decryptRow);
      db.prepare(`
        UPDATE ai_business_daily_reports
        SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
        WHERE id = ?
      `).run(Number(reportId));
      return serializeReport(requireReport(reportId), decryptRow);
    },
  };
}

module.exports = {
  ACTIVE_STATUSES,
  BUSINESS_DAILY_REPORT_BUSINESS_CODE,
  BUSINESS_DAILY_REPORT_MENU_KEY,
  BUSINESS_DAILY_REPORT_MODULE_KEY,
  BUSINESS_DAILY_REPORT_SCOPE_TREE,
  BUSINESS_DAILY_REPORT_SCOPES,
  BUSINESS_DAILY_REPORT_SKILL_CODE,
  BusinessDailyReportError,
  GENERATION_STAGES,
  REVISION_NARRATIVE_FIELDS,
  applyNarrativePatch,
  assertReportDate,
  createBusinessDailyReportStore,
  ensureBusinessDailyReportTables,
  normalizeZhixiaoReportHtmlForArtifact,
  renderRevisionHtml,
  resolveBusinessDailyReportScope,
  sanitizeReportHtml,
};
