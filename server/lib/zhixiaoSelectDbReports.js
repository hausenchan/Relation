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

function isZhixiaoSelectDbMode(env = process.env) {
  return ['selectdb', 'selectdb_compat', 'selectdb-compatible'].includes(
    String(env.ZHIXIAO_REPORT_SOURCE_MODE || '').trim().toLowerCase(),
  );
}

function getZhixiaoSelectDbSnapshotDir(env = process.env) {
  return env.ZHIXIAO_SELECTDB_SNAPSHOT_DIR
    || path.join(process.cwd(), 'tmp', 'zhixiao-selectdb-snapshots');
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
  const sourceMode = isZhixiaoSelectDbMode(env) ? 'selectdb' : 'local_xls';
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

module.exports = {
  ZHIXIAO_SELECTDB_DATASET_CODES,
  appendZhixiaoSelectDbCompletionArtifacts,
  collectZhixiaoSelectDbSnapshots,
  getZhixiaoSelectDbRuntimeStatus,
  isZhixiaoSelectDbMode,
  runZhixiaoSelectDbMaterializer,
};
