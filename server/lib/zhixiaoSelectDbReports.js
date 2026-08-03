const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('node:child_process');

const {
  ZHIXIAO_LEGACY_REPORT_DATASETS,
  createMidmaxSelectDbConnector,
  getMidmaxSelectDbRuntimeStatus,
} = require('./midmaxSelectDbConnector');

const ZHIXIAO_SELECTDB_DATASET_CODES = ZHIXIAO_LEGACY_REPORT_DATASETS.map(dataset => dataset.dataset_code);
const MIDMAX_SELECTDB_ENV_KEYS = [
  'MIDMAX_SELECTDB_HOST',
  'MIDMAX_SELECTDB_PORT',
  'MIDMAX_SELECTDB_DATABASE',
  'MIDMAX_SELECTDB_USER',
  'MIDMAX_SELECTDB_PASSWORD',
];

const ZHIXIAO_GENERATOR_SELECTDB_HELPERS = [
  {
    key: 'app_income_source',
    filename: 'query_selectdb_app_income.mjs',
    csv_prefix: 'selectdb_app_income_',
    source_table: 'mdtech_ads_zfb_summary_app_report',
  },
  {
    key: 'dashboard_source',
    filename: 'query_selectdb_overview.mjs',
    csv_prefix: 'selectdb_overview_',
    source_table: 'mdtech_ads_zfb_summary_overview_report',
  },
  {
    key: 'task_order_source',
    filename: 'query_selectdb_task_orders.mjs',
    csv_prefix: 'selectdb_task_orders_',
    source_table: 'mdtech_ads_zfb_summary_task_report',
  },
  {
    key: 'adslot_source',
    filename: 'query_selectdb_adslot.mjs',
    csv_prefix: 'selectdb_adslot_',
    source_table: 'mdtech_ads_zfb_summary_adposid_report',
  },
  {
    key: 'delivery_link_source',
    filename: 'query_selectdb_delivery_link.mjs',
    csv_prefix: 'selectdb_delivery_link_',
    source_table: 'mdtech_dot_event_common_v2',
  },
  {
    key: 'media_source',
    filename: 'query_selectdb_media_proportion.mjs',
    csv_prefix: 'selectdb_media_proportion_',
    source_table: 'mdtech_ads_zfb_summary_cid_proportion_report',
  },
  {
    key: 'media_total_source',
    filename: 'query_selectdb_media_total.mjs',
    csv_prefix: 'selectdb_media_total_',
    source_table: 'mdtech_ads_zfb_summary_cid_report',
  },
  {
    key: 'media_task_source',
    filename: 'query_selectdb_media_task.mjs',
    csv_prefix: 'selectdb_media_task_',
    source_table: 'mdtech_ads_zfb_summary_cid_task_app_report',
  },
];

const ZHIXIAO_GENERATOR_SELECTDB_RETAINED_FILES = [
  {
    key: 'old_orders',
    filenames: ['旧后台订单.xlsx', '旧后台订单.xls'],
  },
  {
    key: 'denghuo_adslot',
    filenames: ['广告位维度汇总-灯火投放.xls', '广告位维度汇总-灯火投放.xlsx'],
  },
  {
    key: 'traffic_funnel',
    filenames: ['支小用户漏斗.xlsx', '支小用户漏斗.xls'],
  },
];

function isZhixiaoSelectDbMode(env = process.env) {
  return ['selectdb', 'selectdb_compat', 'selectdb-compatible'].includes(
    String(env.ZHIXIAO_REPORT_SOURCE_MODE || '').trim().toLowerCase(),
  );
}

function isZhixiaoGeneratorSelectDbMode(env = process.env) {
  return ['generator_selectdb', 'generator-selectdb', 'selectdb_generator', 'skill_selectdb'].includes(
    String(env.ZHIXIAO_REPORT_SOURCE_MODE || '').trim().toLowerCase(),
  );
}

function getZhixiaoReportSourceMode(env = process.env) {
  if (isZhixiaoGeneratorSelectDbMode(env)) return 'generator_selectdb';
  if (isZhixiaoSelectDbMode(env)) return 'selectdb';
  return 'local_xls';
}

function getZhixiaoSelectDbSnapshotDir(env = process.env) {
  return env.ZHIXIAO_SELECTDB_SNAPSHOT_DIR
    || path.join(process.cwd(), 'tmp', 'zhixiao-selectdb-snapshots');
}

function getZhixiaoGeneratorSelectDbMcpConfigPath(env = process.env, projectDir = process.cwd()) {
  return String(
    env.ZHIXIAO_SELECTDB_MCP_CONFIG_PATH
      || env.SELECTDB_QUERY_MCP_CONFIG_PATH
      || '',
  ).trim() || path.join(projectDir, '.mcp.json');
}

function getMissingGeneratorSelectDbEnvKeys(env = process.env) {
  return MIDMAX_SELECTDB_ENV_KEYS.filter(key => !String(env[key] || '').trim());
}

function getZhixiaoSelectDbMaterializerPath(env = process.env) {
  const configured = String(env.ZHIXIAO_SELECTDB_MATERIALIZER_PATH || '').trim();
  if (configured) return configured;
  return path.join(
    process.cwd(),
    'DaAgent',
    'Distillation',
    'scripts',
    'materialize_zhixiao_selectdb_snapshots.py',
  );
}

function getZhixiaoSelectDbMaterializerCommand(env = process.env) {
  const configured = String(env.ZHIXIAO_SELECTDB_MATERIALIZER_COMMAND || '').trim();
  if (configured) return configured;
  const scriptPath = getZhixiaoSelectDbMaterializerPath(env);
  if (!scriptPath) return '';
  if (/\.py$/i.test(scriptPath)) return env.PYTHON || 'python3';
  return process.execPath;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function assertDateOnly(value, fieldName) {
  const text = String(value || '').trim();
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${fieldName} 必须为 YYYY-MM-DD`);
  }
  return text;
}

function getZhixiaoSelectDbRuntimeStatus({ env = process.env } = {}) {
  const sourceMode = getZhixiaoReportSourceMode(env);
  const selectdb = getMidmaxSelectDbRuntimeStatus({
    requiredDatasetCodes: ZHIXIAO_SELECTDB_DATASET_CODES,
    env,
  });
  const materializerPath = getZhixiaoSelectDbMaterializerPath(env);
  const materializerExists = Boolean(materializerPath && fs.existsSync(materializerPath));
  const blockers = [...selectdb.blockers];
  if (sourceMode === 'selectdb' && !materializerExists) {
    blockers.push({
      code: 'ZHIXIAO_SELECTDB_MATERIALIZER_NOT_CONFIGURED',
      message: '支小 SelectDB 兼容物化脚本未配置，无法把快照转换为当前 HTML 生成器可读取的数据源',
    });
  }
  return {
    source_mode: sourceMode,
    enabled: sourceMode === 'selectdb' && blockers.length === 0,
    selectdb,
    required_datasets: ZHIXIAO_LEGACY_REPORT_DATASETS.map(dataset => ({
      dataset_code: dataset.dataset_code,
      title: dataset.title,
      legacy_filename: dataset.legacy_filename,
      grain: dataset.grain,
    })),
    snapshot_dir_configured: Boolean(env.ZHIXIAO_SELECTDB_SNAPSHOT_DIR),
    snapshot_dir: getZhixiaoSelectDbSnapshotDir(env),
    materializer: {
      configured: Boolean(materializerPath),
      exists: materializerExists,
      filename: materializerPath ? path.basename(materializerPath) : null,
      command: getZhixiaoSelectDbMaterializerCommand(env) ? path.basename(getZhixiaoSelectDbMaterializerCommand(env)) : null,
    },
    blockers,
  };
}

function getZhixiaoGeneratorSelectDbRuntimeStatus({
  env = process.env,
  projectDir = process.cwd(),
} = {}) {
  const sourceMode = getZhixiaoReportSourceMode(env);
  const workDir = path.join(projectDir, 'work');
  const helpers = ZHIXIAO_GENERATOR_SELECTDB_HELPERS.map(helper => {
    const helperPath = path.join(workDir, helper.filename);
    return {
      key: helper.key,
      filename: helper.filename,
      exists: fs.existsSync(helperPath),
      csv_prefix: helper.csv_prefix,
      source_table: helper.source_table,
    };
  });
  const missingHelpers = helpers.filter(helper => !helper.exists);
  const mcpConfigPath = getZhixiaoGeneratorSelectDbMcpConfigPath(env, projectDir);
  const mcpConfigExists = Boolean(mcpConfigPath && fs.existsSync(mcpConfigPath));
  const missingEnvKeys = getMissingGeneratorSelectDbEnvKeys(env);
  const credentialsConfigured = missingEnvKeys.length === 0 || mcpConfigExists;
  const retained_sources = ZHIXIAO_GENERATOR_SELECTDB_RETAINED_FILES.map(item => {
    const matched = item.filenames.find(filename => fs.existsSync(path.join(projectDir, filename))) || '';
    return {
      key: item.key,
      filenames: item.filenames,
      exists: Boolean(matched),
      filename: matched || null,
    };
  });
  const blockers = [];
  if (missingHelpers.length > 0) {
    blockers.push({
      code: 'ZHIXIAO_SELECTDB_HELPERS_MISSING',
      message: `支小新版 SelectDB helper 缺失 ${missingHelpers.length} 个：${missingHelpers.map(item => item.filename).join('、')}`,
    });
  }
  if (!credentialsConfigured) {
    blockers.push({
      code: 'SELECTDB_QUERY_MCP_NOT_CONFIGURED',
      message: `支小 SelectDB 查询配置缺失：请配置 ${missingEnvKeys.join('、')}，或提供 SELECTDB_QUERY_MCP_CONFIG_PATH`,
    });
  } else if ((env.ZHIXIAO_SELECTDB_MCP_CONFIG_PATH || env.SELECTDB_QUERY_MCP_CONFIG_PATH) && !mcpConfigExists) {
    blockers.push({
      code: 'SELECTDB_QUERY_MCP_CONFIG_NOT_FOUND',
      message: '支小 SelectDB MCP 配置文件不存在，请检查 SELECTDB_QUERY_MCP_CONFIG_PATH',
    });
  }
  return {
    source_mode: sourceMode,
    enabled: sourceMode === 'generator_selectdb' && blockers.length === 0,
    project_dir_configured: Boolean(env.ZHIXIAO_REPORT_PROJECT_DIR),
    work_dir: {
      exists: fs.existsSync(workDir),
      dirname: path.basename(workDir),
    },
    helpers,
    helper_count: helpers.length,
    ready_helper_count: helpers.filter(helper => helper.exists).length,
    missing_helpers: missingHelpers.map(helper => helper.filename),
    mcp_config: {
      configured: Boolean(env.ZHIXIAO_SELECTDB_MCP_CONFIG_PATH || env.SELECTDB_QUERY_MCP_CONFIG_PATH),
      exists: mcpConfigExists,
      filename: mcpConfigPath ? path.basename(mcpConfigPath) : null,
    },
    credentials_configured: credentialsConfigured,
    missing_env_keys: mcpConfigExists ? [] : missingEnvKeys,
    retained_sources,
    blockers,
  };
}

async function collectZhixiaoSelectDbSnapshots({
  reportDate,
  env = process.env,
  connector,
  connectorFactory = createMidmaxSelectDbConnector,
} = {}) {
  const targetDate = assertDateOnly(reportDate, '支小日报日期');
  const status = getZhixiaoSelectDbRuntimeStatus({ env });
  if (!status.enabled) {
    const first = status.blockers[0] || {
      code: 'ZHIXIAO_SELECTDB_NOT_READY',
      message: '支小 SelectDB 数据源未就绪',
    };
    const error = new Error(first.message);
    error.code = first.code;
    throw error;
  }
  const activeConnector = connector || connectorFactory({ env });
  const shouldCloseConnector = !connector && typeof activeConnector.close === 'function';
  const snapshotDir = path.join(getZhixiaoSelectDbSnapshotDir(env), targetDate);
  try {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const datasets = [];
    for (const dataset of ZHIXIAO_LEGACY_REPORT_DATASETS) {
      const result = await activeConnector.queryDataset(dataset.dataset_code, {
        startDate: targetDate,
        endDate: targetDate,
      });
      const payload = {
        ...result,
        legacy_filename: dataset.legacy_filename,
        captured_at: new Date().toISOString(),
      };
      payload.content_hash = sha256(JSON.stringify(payload.rows || []));
      const filename = `${dataset.dataset_code}.json`;
      const filePath = path.join(snapshotDir, filename);
      fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      datasets.push({
        dataset_code: dataset.dataset_code,
        title: dataset.title,
        legacy_filename: dataset.legacy_filename,
        row_count: payload.row_count,
        content_hash: payload.content_hash,
        filename,
      });
    }
    const manifest = {
      source_type: 'midmax_selectdb',
      report_date: targetDate,
      snapshot_id: `zhixiao_selectdb_${targetDate}_${sha256(JSON.stringify(datasets)).slice(0, 12)}`,
      dataset_count: datasets.length,
      datasets,
      snapshot_dir: path.basename(snapshotDir),
      created_at: new Date().toISOString(),
    };
    const manifestPath = path.join(snapshotDir, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return {
      ...manifest,
      snapshot_dir: snapshotDir,
      manifest_path: manifestPath,
    };
  } finally {
    if (shouldCloseConnector) {
      await activeConnector.close();
    }
  }
}

function runZhixiaoSelectDbMaterializer({ manifestPath, sourceDir, env = process.env, timeoutMs = 300000 } = {}) {
  const scriptPath = getZhixiaoSelectDbMaterializerPath(env);
  const command = getZhixiaoSelectDbMaterializerCommand(env);
  if (!scriptPath || !fs.existsSync(scriptPath) || !command) {
    const error = new Error('支小 SelectDB 兼容物化脚本未配置');
    error.code = 'ZHIXIAO_SELECTDB_MATERIALIZER_NOT_CONFIGURED';
    throw error;
  }
  const args = [
    scriptPath,
    '--manifest',
    manifestPath,
    '--output-dir',
    sourceDir,
  ];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
    env,
  });
  const output = {
    command: path.basename(command),
    script_filename: path.basename(scriptPath),
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || '').slice(0, 4000),
    stderr: String(result.stderr || '').slice(0, 4000),
  };
  if (result.error || result.status !== 0) {
    const error = new Error(`支小 SelectDB 快照物化失败：${output.stderr || output.stdout || result.error?.message || '未知错误'}`);
    error.code = result.error?.code === 'ETIMEDOUT'
      ? 'ZHIXIAO_SELECTDB_MATERIALIZER_TIMEOUT'
      : 'ZHIXIAO_SELECTDB_MATERIALIZER_FAILED';
    error.details = output;
    throw error;
  }
  return output;
}

function appendZhixiaoSelectDbCompletionArtifacts(completion, { snapshot, materialized } = {}) {
  if (!snapshot) return completion;
  return {
    ...completion,
    source: {
      ...(completion.source || {}),
      type: 'midmax_selectdb_snapshot',
      snapshot_id: snapshot.snapshot_id,
      dataset_count: snapshot.dataset_count,
      datasets: (snapshot.datasets || []).map(item => ({
        dataset_code: item.dataset_code,
        title: item.title,
        row_count: item.row_count,
        legacy_filename: item.legacy_filename,
      })),
    },
    normalized: {
      ...(completion.normalized || {}),
      source_v2: 'zhixiao-selectdb-compat-v1',
      snapshot_id: snapshot.snapshot_id,
    },
    reportModel: {
      ...(completion.reportModel || {}),
      source_v2: {
        type: 'zhixiao-selectdb-compat-v1',
        snapshot_id: snapshot.snapshot_id,
        dataset_count: snapshot.dataset_count,
      },
    },
    artifacts: [
      ...(completion.artifacts || []),
      {
        artifactType: 'source_json',
        content: JSON.stringify({
          type: 'midmax_selectdb_snapshot',
          snapshot_id: snapshot.snapshot_id,
          report_date: snapshot.report_date,
          datasets: snapshot.datasets || [],
        }, null, 2),
        contentType: 'application/json; charset=utf-8',
      },
      {
        artifactType: 'execution_manifest',
        content: JSON.stringify({
          source_mode: 'midmax_selectdb',
          snapshot_id: snapshot.snapshot_id,
          materializer: materialized || null,
        }, null, 2),
        contentType: 'application/json; charset=utf-8',
      },
    ],
  };
}

function listRecentFilesByPrefix(dir, prefixes) {
  if (!dir || !fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      return {
        filename: entry.name,
        size: stat.size,
        modified_at: stat.mtime.toISOString(),
      };
    });
  return entries
    .filter(entry => prefixes.some(prefix => entry.filename.startsWith(prefix)))
    .sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
}

function collectZhixiaoGeneratorSelectDbOutputs({
  projectDir = process.cwd(),
  env = process.env,
} = {}) {
  const outputDir = env.ZHIXIAO_SELECTDB_OUTPUT_DIR || path.join(projectDir, 'outputs');
  const csvFiles = listRecentFilesByPrefix(
    outputDir,
    ZHIXIAO_GENERATOR_SELECTDB_HELPERS.map(helper => helper.csv_prefix),
  );
  const generatorLogPath = String(env.ZHIXIAO_REPORT_GENERATOR_LOG_PATH || '').trim();
  const logExists = Boolean(generatorLogPath && fs.existsSync(generatorLogPath));
  return {
    source_type: 'zhixiao_generator_selectdb',
    output_dir: {
      exists: fs.existsSync(outputDir),
      dirname: path.basename(outputDir),
    },
    csv_files: csvFiles.slice(0, 50),
    csv_count: csvFiles.length,
    expected_csv_prefixes: ZHIXIAO_GENERATOR_SELECTDB_HELPERS.map(helper => helper.csv_prefix),
    generator_log: {
      configured: Boolean(generatorLogPath),
      exists: logExists,
      filename: logExists ? path.basename(generatorLogPath) : (generatorLogPath ? path.basename(generatorLogPath) : null),
      size: logExists ? fs.statSync(generatorLogPath).size : 0,
      modified_at: logExists ? fs.statSync(generatorLogPath).mtime.toISOString() : null,
    },
  };
}

function appendZhixiaoGeneratorSelectDbCompletionArtifacts(completion, {
  runtime,
  outputs,
  generation,
} = {}) {
  return {
    ...completion,
    source: {
      ...(completion.source || {}),
      type: 'zhixiao_generator_selectdb',
      csv_count: outputs?.csv_count || 0,
      helpers: (runtime?.helpers || []).map(helper => ({
        key: helper.key,
        filename: helper.filename,
        exists: helper.exists,
        csv_prefix: helper.csv_prefix,
      })),
      outputs: outputs ? {
        csv_files: outputs.csv_files,
        generator_log: outputs.generator_log,
      } : null,
    },
    normalized: {
      ...(completion.normalized || {}),
      source_v2: 'zhixiao-generator-selectdb-v1',
    },
    reportModel: {
      ...(completion.reportModel || {}),
      source_v2: {
        type: 'zhixiao-generator-selectdb-v1',
        csv_count: outputs?.csv_count || 0,
      },
    },
    artifacts: [
      ...(completion.artifacts || []),
      {
        artifactType: 'source_json',
        content: JSON.stringify({
          type: 'zhixiao_generator_selectdb',
          outputs,
          helpers: runtime?.helpers || [],
        }, null, 2),
        contentType: 'application/json; charset=utf-8',
      },
      {
        artifactType: 'execution_manifest',
        content: JSON.stringify({
          source_mode: 'generator_selectdb',
          generator: generation ? {
            compile: generation.compile,
            generated: generation.generated,
            html_modified_at: generation.html_modified_at,
          } : null,
          runtime: runtime ? {
            ready_helper_count: runtime.ready_helper_count,
            helper_count: runtime.helper_count,
            mcp_config: runtime.mcp_config,
            credentials_configured: runtime.credentials_configured,
          } : null,
        }, null, 2),
        contentType: 'application/json; charset=utf-8',
      },
    ],
  };
}

module.exports = {
  ZHIXIAO_GENERATOR_SELECTDB_HELPERS,
  ZHIXIAO_GENERATOR_SELECTDB_RETAINED_FILES,
  ZHIXIAO_SELECTDB_DATASET_CODES,
  appendZhixiaoGeneratorSelectDbCompletionArtifacts,
  appendZhixiaoSelectDbCompletionArtifacts,
  collectZhixiaoGeneratorSelectDbOutputs,
  collectZhixiaoSelectDbSnapshots,
  getZhixiaoGeneratorSelectDbRuntimeStatus,
  getZhixiaoReportSourceMode,
  getZhixiaoSelectDbRuntimeStatus,
  isZhixiaoGeneratorSelectDbMode,
  isZhixiaoSelectDbMode,
  runZhixiaoSelectDbMaterializer,
};
