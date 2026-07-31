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
  getZhixiaoSelectDbRuntimeStatus,
} = require('./zhixiaoSelectDbReports');

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

  for (const datasetCode of [
    'zhixiao_dashboard_summary_daily',
    'zhixiao_new_order_daily',
    'zhixiao_app_income_daily',
    'zhixiao_adslot_summary_daily',
    'zhixiao_media_total_daily',
    'zhixiao_media_task_app_daily',
    'zhixiao_app_media_share_daily',
    'zhixiao_denghuo_adslot_daily',
  ]) {
    fs.writeFileSync(
      path.join(templateDir, `${datasetCode}.sql`),
      'SELECT :start_date AS start_date, :end_date AS end_date LIMIT :limit\n',
      'utf8',
    );
  }

  const status = getZhixiaoSelectDbRuntimeStatus({ env });
  assert.equal(status.source_mode, 'selectdb');
  assert.equal(status.selectdb.credentials_configured, true);
  assert.equal(status.selectdb.datasets.every(item => item.status === 'ready'), true);
  assert.equal(status.enabled, false);
  assert.equal(status.blockers[0].code, 'ZHIXIAO_SELECTDB_MATERIALIZER_NOT_CONFIGURED');
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

  for (const datasetCode of [
    'zhixiao_dashboard_summary_daily',
    'zhixiao_new_order_daily',
    'zhixiao_app_income_daily',
    'zhixiao_adslot_summary_daily',
    'zhixiao_media_total_daily',
    'zhixiao_media_task_app_daily',
    'zhixiao_app_media_share_daily',
    'zhixiao_denghuo_adslot_daily',
  ]) {
    fs.writeFileSync(
      path.join(templateDir, `${datasetCode}.sql`),
      'SELECT :start_date AS start_date, :end_date AS end_date LIMIT :limit\n',
      'utf8',
    );
  }

  const status = getZhixiaoSelectDbRuntimeStatus({ env });
  assert.equal(status.materializer.exists, true);
  assert.equal(status.materializer.filename, 'materialize_zhixiao_selectdb_snapshots.py');
  assert.equal(status.enabled, true);
});
