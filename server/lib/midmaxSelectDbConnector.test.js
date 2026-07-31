const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  compileSqlTemplate,
  getMidmaxSelectDbRuntimeStatus,
  validateSqlTemplate,
} = require('./midmaxSelectDbConnector');
const {
  ZHIXIAO_SELECTDB_DATASET_CODES,
  appendZhixiaoSelectDbCompletionArtifacts,
  collectZhixiaoSelectDbSnapshots,
  getZhixiaoSelectDbRuntimeStatus,
} = require('./zhixiaoSelectDbReports');

function writeReadyZhixiaoSelectDbTemplates(templateDir) {
  for (const datasetCode of ZHIXIAO_SELECTDB_DATASET_CODES) {
    fs.writeFileSync(
      path.join(templateDir, `${datasetCode}.sql`),
      'SELECT :start_date AS start_date, :end_date AS end_date LIMIT :limit\n',
      'utf8',
    );
  }
}

function buildReadyZhixiaoSelectDbEnv({ templateDir, snapshotDir, materializerPath }) {
  return {
    MIDMAX_SELECTDB_HOST: 'selectdb.internal',
    MIDMAX_SELECTDB_PORT: '3306',
    MIDMAX_SELECTDB_DATABASE: 'midmax',
    MIDMAX_SELECTDB_USER: 'readonly',
    MIDMAX_SELECTDB_PASSWORD: 'secret',
    MIDMAX_SELECTDB_TEMPLATE_DIR: templateDir,
    ZHIXIAO_REPORT_SOURCE_MODE: 'selectdb',
    ZHIXIAO_SELECTDB_SNAPSHOT_DIR: snapshotDir,
    ZHIXIAO_SELECTDB_MATERIALIZER_PATH: materializerPath,
  };
}

test('SelectDB SQL templates only allow audited read queries and named parameters', () => {
  const compiled = compileSqlTemplate(`
    SELECT stat_date, revenue
    FROM audited_yyz_daily
    WHERE stat_date >= :start_date
      AND stat_date <= :end_date
    LIMIT :limit
  `, {
    start_date: '2026-07-30',
    end_date: '2026-07-30',
    limit: 100,
  });

  assert.match(compiled.sql, /WHERE stat_date >= \?/);
  assert.deepEqual(compiled.params, ['2026-07-30', '2026-07-30', 100]);
  assert.throws(
    () => validateSqlTemplate('DELETE FROM audited_yyz_daily WHERE stat_date = :start_date'),
    /SELECT 或 WITH/,
  );
  assert.throws(
    () => validateSqlTemplate('SELECT * FROM a; SELECT * FROM b'),
    /禁止多语句/,
  );
  assert.throws(
    () => validateSqlTemplate('SELECT * FROM a WHERE owner_id = :user_input'),
    /未审核参数/,
  );
});

test('SelectDB runtime status reports missing configuration without exposing secrets', () => {
  const status = getMidmaxSelectDbRuntimeStatus({
    requiredDatasetCodes: ['zhixiao_app_income_daily'],
    env: { MIDMAX_SELECTDB_PASSWORD: 'super-secret-value' },
  });

  assert.equal(status.enabled, false);
  assert.equal(status.credentials_configured, false);
  assert.equal(status.missing_env_keys.includes('MIDMAX_SELECTDB_PASSWORD'), false);
  assert.doesNotMatch(JSON.stringify(status), /super-secret-value/);
  assert.equal(status.datasets[0].dataset_code, 'zhixiao_app_income_daily');
  assert.equal(status.datasets[0].status, 'template_missing');
});

test('Zhixiao SelectDB mode requires all templates and a compatibility materializer', () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-templates-'));
  const env = {
    MIDMAX_SELECTDB_HOST: 'selectdb.internal',
    MIDMAX_SELECTDB_PORT: '3306',
    MIDMAX_SELECTDB_DATABASE: 'midmax',
    MIDMAX_SELECTDB_USER: 'readonly',
    MIDMAX_SELECTDB_PASSWORD: 'secret',
    MIDMAX_SELECTDB_TEMPLATE_DIR: templateDir,
    ZHIXIAO_REPORT_SOURCE_MODE: 'selectdb',
    ZHIXIAO_SELECTDB_MATERIALIZER_PATH: path.join(templateDir, 'missing-materializer.py'),
  };

  writeReadyZhixiaoSelectDbTemplates(templateDir);

  const status = getZhixiaoSelectDbRuntimeStatus({ env });
  assert.equal(status.source_mode, 'selectdb');
  assert.equal(status.selectdb.credentials_configured, true);
  assert.equal(status.selectdb.datasets.every(item => item.status === 'ready'), true);
  assert.equal(status.enabled, false);
  assert.equal(status.blockers[0].code, 'ZHIXIAO_SELECTDB_MATERIALIZER_NOT_CONFIGURED');
});

test('Zhixiao SelectDB runtime status reports missing and invalid templates by blocker code', () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-templates-'));
  const materializerPath = path.join(templateDir, 'materializer.py');
  fs.writeFileSync(materializerPath, '# test materializer\n', 'utf8');
  fs.writeFileSync(
    path.join(templateDir, 'zhixiao_dashboard_summary_daily.sql'),
    'DELETE FROM forbidden_table WHERE stat_date = :start_date\n',
    'utf8',
  );
  const env = buildReadyZhixiaoSelectDbEnv({
    templateDir,
    snapshotDir: fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-snapshots-')),
    materializerPath,
  });

  const status = getZhixiaoSelectDbRuntimeStatus({ env });
  assert.equal(status.enabled, false);
  assert.equal(status.source_mode, 'selectdb');
  assert.equal(status.selectdb.credentials_configured, true);
  assert.equal(status.selectdb.datasets[0].status, 'invalid_template');
  assert.equal(status.selectdb.datasets[1].status, 'template_missing');
  assert.deepEqual(
    status.blockers.map(item => item.code),
    ['MIDMAX_SELECTDB_TEMPLATES_MISSING', 'MIDMAX_SELECTDB_TEMPLATE_INVALID'],
  );
  assert.doesNotMatch(JSON.stringify(status), /secret/);
});

test('Zhixiao SelectDB runtime status ignores local XLS readiness when SelectDB inputs are ready', () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-templates-'));
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-snapshots-'));
  const materializerPath = path.join(templateDir, 'materializer.py');
  fs.writeFileSync(materializerPath, '# test materializer\n', 'utf8');
  writeReadyZhixiaoSelectDbTemplates(templateDir);

  const status = getZhixiaoSelectDbRuntimeStatus({
    env: buildReadyZhixiaoSelectDbEnv({
      templateDir,
      snapshotDir,
      materializerPath,
    }),
  });

  assert.equal(status.enabled, true);
  assert.equal(status.source_mode, 'selectdb');
  assert.equal(status.selectdb.datasets.every(item => item.status === 'ready'), true);
  assert.equal(status.selectdb.required_dataset_count, ZHIXIAO_SELECTDB_DATASET_CODES.length);
  assert.deepEqual(status.blockers, []);
});

test('Zhixiao SelectDB mode discovers the bundled default materializer', () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-templates-'));
  const env = {
    MIDMAX_SELECTDB_HOST: 'selectdb.internal',
    MIDMAX_SELECTDB_PORT: '3306',
    MIDMAX_SELECTDB_DATABASE: 'midmax',
    MIDMAX_SELECTDB_USER: 'readonly',
    MIDMAX_SELECTDB_PASSWORD: 'secret',
    MIDMAX_SELECTDB_TEMPLATE_DIR: templateDir,
    ZHIXIAO_REPORT_SOURCE_MODE: 'selectdb',
  };

  writeReadyZhixiaoSelectDbTemplates(templateDir);

  const status = getZhixiaoSelectDbRuntimeStatus({ env });
  assert.equal(status.materializer.exists, true);
  assert.equal(status.materializer.filename, 'materialize_zhixiao_selectdb_snapshots.py');
  assert.equal(status.enabled, true);
});

test('Zhixiao SelectDB snapshot collection writes immutable dataset payloads and closes owned connector', async () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-templates-'));
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-snapshots-'));
  const materializerPath = path.join(templateDir, 'materializer.py');
  fs.writeFileSync(materializerPath, '# test materializer\n', 'utf8');
  writeReadyZhixiaoSelectDbTemplates(templateDir);
  const queries = [];
  let closed = false;
  const env = buildReadyZhixiaoSelectDbEnv({
    templateDir,
    snapshotDir: snapshotRoot,
    materializerPath,
  });

  const manifest = await collectZhixiaoSelectDbSnapshots({
    reportDate: '2026-07-31',
    env,
    connectorFactory: () => ({
      async queryDataset(datasetCode, { startDate, endDate }) {
        queries.push({ datasetCode, startDate, endDate });
        return {
          dataset_code: datasetCode,
          title: datasetCode,
          grain: 'day',
          window_start: startDate,
          window_end: endDate,
          row_count: 1,
          columns: ['日期', '指标'],
          rows: [{ 日期: startDate, 指标: datasetCode }],
          elapsed_ms: 1,
        };
      },
      async close() {
        closed = true;
      },
    }),
  });

  assert.equal(closed, true);
  assert.equal(queries.length, ZHIXIAO_SELECTDB_DATASET_CODES.length);
  assert.deepEqual(
    queries.map(item => item.datasetCode),
    ZHIXIAO_SELECTDB_DATASET_CODES,
  );
  assert.ok(manifest.snapshot_id.startsWith('zhixiao_selectdb_2026-07-31_'));
  assert.equal(manifest.dataset_count, ZHIXIAO_SELECTDB_DATASET_CODES.length);
  assert.equal(path.dirname(manifest.manifest_path), path.join(snapshotRoot, '2026-07-31'));
  const persistedManifest = JSON.parse(fs.readFileSync(manifest.manifest_path, 'utf8'));
  assert.equal(persistedManifest.source_type, 'midmax_selectdb');
  assert.equal(persistedManifest.datasets[0].legacy_filename, '支小大盘汇总.xls');
  const firstDatasetPath = path.join(manifest.snapshot_dir, persistedManifest.datasets[0].filename);
  const firstDataset = JSON.parse(fs.readFileSync(firstDatasetPath, 'utf8'));
  assert.equal(firstDataset.legacy_filename, '支小大盘汇总.xls');
  assert.equal(firstDataset.rows[0].日期, '2026-07-31');
  assert.match(firstDataset.content_hash, /^[a-f0-9]{64}$/);
});

test('Zhixiao SelectDB snapshot collection closes owned connector after query failure', async () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-templates-'));
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-selectdb-snapshots-'));
  const materializerPath = path.join(templateDir, 'materializer.py');
  fs.writeFileSync(materializerPath, '# test materializer\n', 'utf8');
  writeReadyZhixiaoSelectDbTemplates(templateDir);
  let closed = false;
  const env = buildReadyZhixiaoSelectDbEnv({
    templateDir,
    snapshotDir: snapshotRoot,
    materializerPath,
  });

  await assert.rejects(
    () => collectZhixiaoSelectDbSnapshots({
      reportDate: '2026-07-31',
      env,
      connectorFactory: () => ({
        async queryDataset() {
          const error = new Error('selectdb unavailable');
          error.code = 'ECONNRESET';
          throw error;
        },
        async close() {
          closed = true;
        },
      }),
    }),
    /selectdb unavailable/,
  );
  assert.equal(closed, true);
});

test('Zhixiao SelectDB completion helper appends source and execution artifacts without dropping HTML artifact', () => {
  const completion = appendZhixiaoSelectDbCompletionArtifacts({
    source: { type: 'local_zhixiao_html', latest_date: '2026-07-31' },
    normalized: { type: 'zhixiao_html_artifact', password_gate_removed: true },
    reportModel: { narrative: { summary: 'ok' } },
    artifacts: [{
      artifactType: 'zhixiao_html_report',
      content: '<html><body>支小应用数据</body></html>',
      contentType: 'text/html; charset=utf-8',
    }],
  }, {
    snapshot: {
      snapshot_id: 'zhixiao_selectdb_2026-07-31_abc',
      report_date: '2026-07-31',
      dataset_count: 1,
      datasets: [{
        dataset_code: 'zhixiao_app_income_daily',
        title: '支小应用收入',
        row_count: 3,
        legacy_filename: '支小应用收入.xls',
      }],
    },
    materialized: {
      status: 0,
      stdout: '{"ok":true}',
    },
  });

  assert.equal(completion.source.type, 'midmax_selectdb_snapshot');
  assert.equal(completion.normalized.source_v2, 'zhixiao-selectdb-compat-v1');
  assert.equal(completion.reportModel.source_v2.dataset_count, 1);
  assert.deepEqual(
    completion.artifacts.map(item => item.artifactType),
    ['zhixiao_html_report', 'source_json', 'execution_manifest'],
  );
  assert.equal(JSON.parse(completion.artifacts[1].content).datasets[0].row_count, 3);
  assert.equal(JSON.parse(completion.artifacts[2].content).materializer.status, 0);
});
