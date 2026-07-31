const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const DEFAULT_POOL_SIZE = 2;
const DEFAULT_MAX_RANGE_DAYS = 62;
const DEFAULT_MAX_ROWS = 50000;

const MIDMAX_SELECTDB_ENV_KEYS = [
  'MIDMAX_SELECTDB_HOST',
  'MIDMAX_SELECTDB_PORT',
  'MIDMAX_SELECTDB_DATABASE',
  'MIDMAX_SELECTDB_USER',
  'MIDMAX_SELECTDB_PASSWORD',
];

const YZ_DATASETS = [
  {
    dataset_code: 'yyz_project_daily',
    title: 'YYZ项目日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis'],
  },
  {
    dataset_code: 'yyz_business_line_daily',
    title: 'YYZ业务线日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis'],
  },
  {
    dataset_code: 'yyz_media_daily',
    title: 'YYZ媒体日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis'],
  },
  {
    dataset_code: 'yyz_media_business_line_daily',
    title: 'YYZ媒体业务线组合日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis'],
  },
  {
    dataset_code: 'yyz_user_funnel_daily',
    title: 'YYZ用户漏斗日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis'],
  },
  {
    dataset_code: 'yyz_ad_funnel_daily',
    title: 'YYZ广告漏斗日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis', 'zhixiao-html-report'],
  },
  {
    dataset_code: 'yyz_task_daily',
    title: 'YYZ任务日事实',
    grain: 'day',
    required_for: ['yyz-dashboard-analysis', 'zhixiao-html-report'],
  },
];

const ZHIXIAO_LEGACY_REPORT_DATASETS = [
  {
    dataset_code: 'zhixiao_dashboard_summary_daily',
    title: '支小大盘汇总',
    legacy_filename: '支小大盘汇总.xls',
    grain: 'day',
  },
  {
    dataset_code: 'zhixiao_new_order_daily',
    title: '新后台订单',
    legacy_filename: '新后台订单.xls',
    grain: 'day',
  },
  {
    dataset_code: 'zhixiao_app_income_daily',
    title: '支小应用收入',
    legacy_filename: '支小应用收入.xls',
    grain: 'day_app',
  },
  {
    dataset_code: 'zhixiao_adslot_summary_daily',
    title: '广告位维度汇总',
    legacy_filename: '广告位维度汇总.xls',
    grain: 'day_app_adslot',
  },
  {
    dataset_code: 'zhixiao_media_total_daily',
    title: '支小媒体数据',
    legacy_filename: '支小媒体数据.xls',
    grain: 'day_media',
  },
  {
    dataset_code: 'zhixiao_media_task_app_daily',
    title: '支小媒体应用任务维度',
    legacy_filename: '支小媒体应用任务维度.xls',
    grain: 'day_media_app_task',
  },
  {
    dataset_code: 'zhixiao_app_media_share_daily',
    title: '应用媒体数据占比',
    legacy_filename: '应用媒体数据占比 .xls',
    grain: 'day_app_media',
  },
  {
    dataset_code: 'zhixiao_denghuo_adslot_daily',
    title: '广告位维度汇总-灯火投放',
    legacy_filename: '广告位维度汇总-灯火投放.xls',
    grain: 'day_app_adslot',
    filters: { channel: 'bb' },
  },
];

const MIDMAX_DATASETS = Object.freeze([
  ...YZ_DATASETS,
  ...ZHIXIAO_LEGACY_REPORT_DATASETS.map(dataset => ({
    ...dataset,
    required_for: ['zhixiao-html-report'],
  })),
]);

const MIDMAX_DATASET_MAP = new Map(MIDMAX_DATASETS.map(dataset => [dataset.dataset_code, dataset]));

function isDateOnly(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function dateRangeDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86400000) + 1;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getConfiguredTemplateDir(env = process.env) {
  return env.MIDMAX_SELECTDB_TEMPLATE_DIR
    || path.join(process.cwd(), 'YYZ', 'shared', 'data-contracts', 'midmax-selectdb', 'sql');
}

function getDatasetTemplatePath(datasetCode, env = process.env) {
  return path.join(getConfiguredTemplateDir(env), `${datasetCode}.sql`);
}

function getMissingEnvKeys(env = process.env) {
  return MIDMAX_SELECTDB_ENV_KEYS.filter(key => !String(env[key] || '').trim());
}

function getConnectorConfig(env = process.env) {
  return {
    host: env.MIDMAX_SELECTDB_HOST,
    port: Number(env.MIDMAX_SELECTDB_PORT || 3306),
    database: env.MIDMAX_SELECTDB_DATABASE,
    user: env.MIDMAX_SELECTDB_USER,
    password: env.MIDMAX_SELECTDB_PASSWORD,
    sslMode: env.MIDMAX_SELECTDB_SSL_MODE || '',
    queryTimeoutMs: Math.max(1000, Number(env.MIDMAX_SELECTDB_QUERY_TIMEOUT_MS || DEFAULT_QUERY_TIMEOUT_MS)),
    poolSize: Math.max(1, Number(env.MIDMAX_SELECTDB_POOL_SIZE || DEFAULT_POOL_SIZE)),
    maxRangeDays: Math.max(1, Number(env.MIDMAX_SELECTDB_MAX_RANGE_DAYS || DEFAULT_MAX_RANGE_DAYS)),
    maxRows: Math.max(1, Number(env.MIDMAX_SELECTDB_MAX_ROWS || DEFAULT_MAX_ROWS)),
  };
}

function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

function validateSqlTemplate(sql) {
  const text = stripSqlComments(sql).trim();
  if (!/^(select|with)\b/i.test(text)) {
    throw new Error('SelectDB 数据集模板必须以 SELECT 或 WITH 开头');
  }
  if (/;/.test(text.replace(/;\s*$/, ''))) {
    throw new Error('SelectDB 数据集模板禁止多语句');
  }
  const forbidden = /\b(insert|update|delete|replace|drop|alter|truncate|create|grant|revoke|call|load|outfile|infile)\b/i;
  if (forbidden.test(text)) {
    throw new Error('SelectDB 数据集模板只能读取数据，禁止 DDL/DML 或导出语句');
  }
  const placeholders = [...text.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)].map(match => match[1]);
  const unsupported = placeholders.filter(name => !['start_date', 'end_date', 'limit'].includes(name));
  if (unsupported.length > 0) {
    throw new Error(`SelectDB 数据集模板包含未审核参数：${[...new Set(unsupported)].join('、')}`);
  }
  return text.replace(/;\s*$/, '');
}

function compileSqlTemplate(sql, params) {
  const orderedParams = [];
  const compiledSql = validateSqlTemplate(sql).replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`SelectDB 数据集模板缺少参数：${name}`);
    }
    orderedParams.push(params[name]);
    return '?';
  });
  return { sql: compiledSql, params: orderedParams };
}

function readDatasetTemplate(datasetCode, env = process.env) {
  const templatePath = getDatasetTemplatePath(datasetCode, env);
  if (!fs.existsSync(templatePath)) {
    const error = new Error(`SelectDB 数据集 SQL 模板不存在：${datasetCode}`);
    error.code = 'MIDMAX_SELECTDB_TEMPLATE_NOT_FOUND';
    throw error;
  }
  const sql = fs.readFileSync(templatePath, 'utf8');
  validateSqlTemplate(sql);
  return {
    templatePath,
    sql,
    templateHash: sha256(sql),
  };
}

function getDatasetStatus(datasetCode, env = process.env) {
  const dataset = MIDMAX_DATASET_MAP.get(datasetCode);
  if (!dataset) {
    return {
      dataset_code: datasetCode,
      exists: false,
      template_exists: false,
      status: 'unknown_dataset',
    };
  }
  const templatePath = getDatasetTemplatePath(datasetCode, env);
  let templateHash = null;
  let errorMessage = null;
  const templateExists = fs.existsSync(templatePath);
  if (templateExists) {
    try {
      const sql = fs.readFileSync(templatePath, 'utf8');
      validateSqlTemplate(sql);
      templateHash = sha256(sql);
    } catch (error) {
      errorMessage = error.message;
    }
  }
  return {
    dataset_code: datasetCode,
    title: dataset.title,
    grain: dataset.grain,
    legacy_filename: dataset.legacy_filename || null,
    template_exists: templateExists,
    template_hash: templateHash,
    status: errorMessage ? 'invalid_template' : (templateExists ? 'ready' : 'template_missing'),
    error_message: errorMessage,
  };
}

function getMidmaxSelectDbRuntimeStatus({ requiredDatasetCodes = [], env = process.env } = {}) {
  const missingEnvKeys = getMissingEnvKeys(env);
  const required = requiredDatasetCodes.length > 0 ? requiredDatasetCodes : [];
  const datasets = required.map(datasetCode => getDatasetStatus(datasetCode, env));
  const blockers = [];
  if (missingEnvKeys.length > 0) {
    blockers.push({
      code: 'MIDMAX_SELECTDB_NOT_CONFIGURED',
      message: `Mid-Max SelectDB 只读连接缺少环境变量：${missingEnvKeys.join('、')}`,
    });
  }
  const missingTemplates = datasets.filter(dataset => dataset.status === 'template_missing');
  if (missingTemplates.length > 0) {
    blockers.push({
      code: 'MIDMAX_SELECTDB_TEMPLATES_MISSING',
      message: `SelectDB 数据集 SQL 模板缺失 ${missingTemplates.length} 份：${missingTemplates.map(item => item.dataset_code).join('、')}`,
    });
  }
  const invalidTemplates = datasets.filter(dataset => dataset.status === 'invalid_template');
  if (invalidTemplates.length > 0) {
    blockers.push({
      code: 'MIDMAX_SELECTDB_TEMPLATE_INVALID',
      message: `SelectDB 数据集 SQL 模板校验失败：${invalidTemplates.map(item => item.dataset_code).join('、')}`,
    });
  }
  return {
    enabled: blockers.length === 0,
    source_type: 'midmax_selectdb',
    access_method: 'db',
    template_dir_configured: Boolean(env.MIDMAX_SELECTDB_TEMPLATE_DIR),
    template_dir: getConfiguredTemplateDir(env),
    credentials_configured: missingEnvKeys.length === 0,
    missing_env_keys: missingEnvKeys,
    required_dataset_count: required.length,
    datasets,
    blockers,
  };
}

class MidmaxSelectDbConnector {
  constructor({ env = process.env, mysqlFactory = mysql.createPool } = {}) {
    this.env = env;
    this.mysqlFactory = mysqlFactory;
    this.pool = null;
  }

  status(requiredDatasetCodes = []) {
    return getMidmaxSelectDbRuntimeStatus({
      requiredDatasetCodes,
      env: this.env,
    });
  }

  getPool() {
    if (this.pool) return this.pool;
    const missing = getMissingEnvKeys(this.env);
    if (missing.length > 0) {
      const error = new Error(`Mid-Max SelectDB 只读连接缺少环境变量：${missing.join('、')}`);
      error.code = 'MIDMAX_SELECTDB_NOT_CONFIGURED';
      throw error;
    }
    const config = getConnectorConfig(this.env);
    const ssl = String(config.sslMode || '').toLowerCase() === 'disabled' || !config.sslMode
      ? undefined
      : {};
    this.pool = this.mysqlFactory({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      waitForConnections: true,
      connectionLimit: config.poolSize,
      queueLimit: config.poolSize * 4,
      connectTimeout: config.queryTimeoutMs,
      timezone: '+08:00',
      ssl,
      multipleStatements: false,
      namedPlaceholders: false,
    });
    return this.pool;
  }

  async queryDataset(datasetCode, { startDate, endDate, limit } = {}) {
    const dataset = MIDMAX_DATASET_MAP.get(datasetCode);
    if (!dataset) {
      const error = new Error(`不支持的 Mid-Max SelectDB 数据集：${datasetCode}`);
      error.code = 'MIDMAX_SELECTDB_DATASET_NOT_ALLOWED';
      throw error;
    }
    if (!isDateOnly(startDate) || !isDateOnly(endDate) || startDate > endDate) {
      const error = new Error('SelectDB 数据集查询日期必须为合法的 YYYY-MM-DD 范围');
      error.code = 'MIDMAX_SELECTDB_INVALID_DATE_RANGE';
      throw error;
    }
    const config = getConnectorConfig(this.env);
    if (dateRangeDays(startDate, endDate) > config.maxRangeDays) {
      const error = new Error(`SelectDB 数据集查询范围不能超过 ${config.maxRangeDays} 天`);
      error.code = 'MIDMAX_SELECTDB_DATE_RANGE_TOO_LARGE';
      throw error;
    }
    const rowLimit = Math.min(Math.max(1, Number(limit || config.maxRows)), config.maxRows);
    const template = readDatasetTemplate(datasetCode, this.env);
    const compiled = compileSqlTemplate(template.sql, {
      start_date: startDate,
      end_date: endDate,
      limit: rowLimit,
    });
    const startedAt = Date.now();
    const [rows, fields] = await this.getPool().query({
      sql: compiled.sql,
      values: compiled.params,
      timeout: config.queryTimeoutMs,
      rowsAsArray: false,
    });
    return {
      dataset_code: datasetCode,
      title: dataset.title,
      grain: dataset.grain,
      window_start: startDate,
      window_end: endDate,
      query_template_version: template.templateHash.slice(0, 16),
      row_count: Array.isArray(rows) ? rows.length : 0,
      columns: (fields || []).map(field => field.name),
      rows: Array.isArray(rows) ? rows : [],
      elapsed_ms: Date.now() - startedAt,
    };
  }

  async close() {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }
}

function createMidmaxSelectDbConnector(options = {}) {
  return new MidmaxSelectDbConnector(options);
}

module.exports = {
  MIDMAX_DATASETS,
  MIDMAX_DATASET_MAP,
  ZHIXIAO_LEGACY_REPORT_DATASETS,
  compileSqlTemplate,
  createMidmaxSelectDbConnector,
  getDatasetStatus,
  getMidmaxSelectDbRuntimeStatus,
  validateSqlTemplate,
};
