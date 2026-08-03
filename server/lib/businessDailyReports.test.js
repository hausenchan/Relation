const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BetterSqliteDatabase = require('better-sqlite3');

const {
  BusinessDailyReportError,
  applyNarrativePatch,
  assertReportDate,
  createBusinessDailyReportStore,
  ensureBusinessDailyReportTables,
  normalizeZhixiaoReportHtmlForArtifact,
  renderRevisionHtml,
  resolveBusinessDailyReportScope,
  sanitizeReportHtml,
} = require('./businessDailyReports');
const {
  ZHIXIAO_SELECTDB_DATASET_CODES,
  appendZhixiaoSelectDbCompletionArtifacts,
  collectZhixiaoSelectDbSnapshots,
  runZhixiaoSelectDbMaterializer,
} = require('./zhixiaoSelectDbReports');

function createReadyZhixiaoSelectDbTestEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-zhixiao-selectdb-flow-'));
  const templateDir = path.join(root, 'templates');
  const snapshotDir = path.join(root, 'snapshots');
  const sourceDir = path.join(root, 'legacy-source');
  fs.mkdirSync(templateDir, { recursive: true });
  for (const datasetCode of ZHIXIAO_SELECTDB_DATASET_CODES) {
    fs.writeFileSync(
      path.join(templateDir, `${datasetCode}.sql`),
      'SELECT :start_date AS start_date, :end_date AS end_date LIMIT :limit\n',
      'utf8',
    );
  }
  return {
    root,
    sourceDir,
    env: {
      MIDMAX_SELECTDB_HOST: 'selectdb.internal',
      MIDMAX_SELECTDB_PORT: '3306',
      MIDMAX_SELECTDB_DATABASE: 'midmax',
      MIDMAX_SELECTDB_USER: 'readonly',
      MIDMAX_SELECTDB_PASSWORD: 'secret',
      MIDMAX_SELECTDB_TEMPLATE_DIR: templateDir,
      ZHIXIAO_REPORT_SOURCE_MODE: 'selectdb',
      ZHIXIAO_SELECTDB_SNAPSHOT_DIR: snapshotDir,
      ZHIXIAO_SELECTDB_MATERIALIZER_PATH: path.join(
        process.cwd(),
        'DaAgent',
        'Distillation',
        'scripts',
        'materialize_zhixiao_selectdb_snapshots.py',
      ),
    },
  };
}

test('assertReportDate accepts complete dates and rejects invalid or future dates', () => {
  const now = new Date('2026-07-30T08:00:00+08:00');
  assert.equal(assertReportDate('2026-07-25', now), '2026-07-25');
  assert.throws(
    () => assertReportDate('2026-02-30', now),
    error => error instanceof BusinessDailyReportError && error.code === 'INVALID_REPORT_DATE',
  );
  assert.throws(
    () => assertReportDate('2026-07-31', now),
    error => error instanceof BusinessDailyReportError && error.code === 'FUTURE_REPORT_DATE',
  );
});

test('report scope catalog resolves project, business line and media leaves', () => {
  assert.equal(resolveBusinessDailyReportScope().scope_name, 'YYZ项目总览');
  assert.deepEqual(
    resolveBusinessDailyReportScope('business_line', 'cpa_api').path_labels,
    ['YYZ项目组', '业务线', 'CPA', 'CPA-API'],
  );
  assert.equal(resolveBusinessDailyReportScope('media', 'IQIYI_LITE').scope_name, '爱奇艺极速版');
  assert.throws(
    () => resolveBusinessDailyReportScope('business_line', 'UNKNOWN'),
    error => error.code === 'INVALID_REPORT_SCOPE',
  );
});

test('scope migration backfills old generation numbers before adding the unique index', () => {
  const db = new BetterSqliteDatabase(':memory:');
  db.exec(`
    CREATE TABLE ai_business_daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_code TEXT NOT NULL,
      report_date TEXT NOT NULL,
      generation_no INTEGER NOT NULL,
      status TEXT NOT NULL,
      skill_version_id INTEGER,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_code, report_date, generation_no)
    );
    INSERT INTO ai_business_daily_reports (
      business_code, report_date, generation_no, status
    ) VALUES
      ('YYZ', '2026-07-25', 1, 'completed'),
      ('YYZ', '2026-07-25', 2, 'completed');
  `);
  ensureBusinessDailyReportTables(db);
  const generations = db.prepare(`
    SELECT scope_generation_no
    FROM ai_business_daily_reports
    ORDER BY generation_no
  `).all().map(row => row.scope_generation_no);
  assert.deepEqual(generations, [1, 2]);
  db.close();
});

test('applyNarrativePatch preserves machine metrics and ignores unsupported fields', () => {
  const original = {
    metrics: { revenue: 8000, cost: 3000, profit: 5000 },
    narrative: { summary: '机器摘要', risks: '机器风险' },
  };
  const revised = applyNarrativePatch(original, {
    summary: '人工摘要',
    metrics: { revenue: 1 },
    unknown: 'ignored',
  });

  assert.deepEqual(revised.metrics, original.metrics);
  assert.equal(revised.narrative.summary, '人工摘要');
  assert.equal(revised.narrative.risks, '机器风险');
  assert.equal(revised.narrative.unknown, undefined);
  assert.equal(original.narrative.summary, '机器摘要');
});

test('sanitizeReportHtml removes active content and external navigation', () => {
  const sanitized = sanitizeReportHtml(`
    <html><body onload="steal()">
      <script>alert(1)</script>
      <iframe src="https://example.com"></iframe>
      <a href="javascript:alert(2)" onclick="steal()">bad</a>
      <a href=https://example.com>external</a>
      <a href="#section">ok</a>
      <img src="https://example.com/a.png">
      <img src="data:image/png;base64,AA==">
    </body></html>
  `);

  assert.doesNotMatch(sanitized, /script|iframe|onload|onclick|javascript|example\.com/i);
  assert.match(sanitized, /href="#section"/);
  assert.match(sanitized, /src="data:image\/png;base64,AA=="/);
});

test('renderRevisionHtml escapes narrative text and keeps sanitized machine body', () => {
  const html = renderRevisionHtml({
    report: { title: 'YYZ日报', report_date: '2026-07-25' },
    reportModel: { narrative: { summary: '<b>可信摘要</b>', actions: ['动作A', '动作B'] } },
    originalHtml: '<html><head><style>.metric{color:red}</style></head><body><div class="metric">毛利 5000</div><script>bad()</script></body></html>',
  });

  assert.match(html, /&lt;b&gt;可信摘要&lt;\/b&gt;/);
  assert.match(html, /动作A/);
  assert.match(html, /毛利 5000/);
  assert.doesNotMatch(html, /bad\(\)/);
});

test('normalizeZhixiaoReportHtmlForArtifact removes local password gate and keeps report data', () => {
  const html = normalizeZhixiaoReportHtmlForArtifact(`
    <!doctype html>
    <html lang="zh-CN">
    <head><title>支小应用数据</title><style>body.locked .app{display:none}</style></head>
    <body class="locked report">
      <div class="password-mask">
        <div class="pwd-box"><input id="pwdInput"><button onclick="submitPwd()">进入</button></div>
      </div>
      <nav class="side-nav"><a href="#income">收入汇总</a></nav>
      <main class="app"><h1>支小应用数据</h1><div id="app-summary">应用汇总</div></main>
      <script>
        const PASS_KEY = "zfb_pass_multi_2026-07-30";
        const PASSWORD = "zfb666";
        window.APP_INCOME_DETAIL_DATA = {"2026-07-30":[]};
        window.AD_DETAIL_DATA = {};
        window.MEDIA_DETAIL_DATA = {};
        window.ORDER_DETAIL_DATA = {};
        function checkPwd(){ if (localStorage.getItem(PASS_KEY) === "ok") document.body.classList.remove("locked"); }
        function submitPwd(){ localStorage.setItem(PASS_KEY, "ok"); }
        checkPwd();
      </script>
    </body>
    </html>
  `);

  assert.doesNotMatch(html, /password-mask|pwdInput|class="locked report"|checkPwd\(\);/);
  assert.match(html, /<body class="report">/);
  assert.match(html, /APP_INCOME_DETAIL_DATA/);
  assert.match(html, /AD_DETAIL_DATA/);
  assert.match(html, /zfb_pass_multi_2026-07-30/);
});

test('normalizeZhixiaoReportHtmlForArtifact accepts password-free Zhixiao HTML', () => {
  const html = normalizeZhixiaoReportHtmlForArtifact(`
    <!doctype html>
    <html lang="zh-CN">
    <head><title>支小应用数据</title></head>
    <body>
      <main class="app"><h1>支小应用数据</h1><div id="app-summary">应用汇总</div></main>
      <script>
        window.APP_INCOME_DETAIL_DATA = {"2026-08-02":[]};
        window.AD_DETAIL_DATA = {};
        window.MEDIA_DETAIL_DATA = {};
        window.ORDER_DETAIL_DATA = {};
      </script>
    </body>
    </html>
  `);

  assert.match(html, /<title>支小应用数据<\/title>/);
  assert.match(html, /APP_INCOME_DETAIL_DATA/);
  assert.doesNotMatch(html, /password-mask|class="locked"/);
});

test('store preserves generation history, revisions and recoverable deletion', () => {
  const db = new BetterSqliteDatabase(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      display_name TEXT,
      username TEXT
    );
    INSERT INTO users (id, display_name, username) VALUES (1, '分析员', 'analyst');
  `);
  const store = createBusinessDailyReportStore({ db, identityDb: db });

  const failed = store.createReport({ reportDate: '2026-07-25', userId: 1 });
  assert.equal(failed.generation_no, 1);
  assert.equal(store.findActiveReport({ reportDate: '2026-07-25', userId: 1 }).id, failed.id);
  assert.throws(
    () => store.softDelete(failed.id, { userId: 1, reason: 'still running' }),
    error => error.code === 'REPORT_ACTIVE',
  );
  store.completeStage(failed.id, 'queued');
  store.startStage(failed.id, 'collecting');
  store.failReport(failed.id, 'collecting', {
    errorCode: 'SOURCE_NOT_READY',
    errorMessage: '数据源未就绪',
  });
  assert.equal(store.getReport(failed.id).status, 'failed');
  assert.equal(store.listRuns(failed.id).find(item => item.stage_code === 'normalizing').stage_status, 'skipped');
  assert.throws(
    () => store.softDelete(failed.id, { userId: 1, reason: '' }),
    error => error.code === 'DELETE_REASON_REQUIRED',
  );
  assert.ok(store.softDelete(failed.id, { userId: 1, reason: '训练清理' }).deleted_at);
  assert.equal(store.listReports().total, 0);
  assert.equal(store.listReports({ deleted: true }).total, 1);
  assert.equal(store.restore(failed.id).deleted_at, null);

  const completed = store.createReport({ reportDate: '2026-07-25', userId: 1 });
  assert.equal(completed.generation_no, 2);
  store.completeReport(completed.id, {
    source: { status: 'complete' },
    normalized: { metrics: { revenue: 8000, cost: 3000, profit: 5000 } },
    reportModel: {
      metrics: { revenue: 8000, cost: 3000, profit: 5000 },
      narrative: { summary: '机器摘要' },
    },
    reportHtml: '<html><body><h1>YYZ日报</h1></body></html>',
    artifacts: [{
      artifactType: 'zhixiao_html_report',
      content: '<html><body><h1>支小应用数据</h1></body></html>',
      contentType: 'text/html; charset=utf-8',
    }],
  });
  assert.match(store.getArtifact(completed.id, 'zhixiao_html_report').content_text, /支小应用数据/);
  const revision = store.createRevision(completed.id, {
    userId: 1,
    narrative: { summary: '人工摘要' },
    changeSummary: '修正经营判断',
  });
  assert.equal(revision.revision_no, 1);
  assert.equal(revision.report_model.metrics.profit, 5000);
  assert.equal(revision.report_model.narrative.summary, '人工摘要');
  assert.throws(
    () => store.createRevision(completed.id, {
      userId: 1,
      narrative: { summary: '重复草稿' },
      changeSummary: '重复',
    }),
    error => error.code === 'REVISION_DRAFT_EXISTS',
  );
  assert.throws(
    () => store.updateRevision(completed.id, revision.id, {
      userId: 1,
      narrative: { summary: '并发覆盖' },
      baseRevisionNo: revision.base_revision_no,
      lockVersion: revision.lock_version + 1,
    }),
    error => error.code === 'REVISION_CONFLICT',
  );

  const scoped = store.createReport({
    reportDate: '2026-07-25',
    userId: 1,
    skillCode: 'zhixiao-ai',
    scopeType: 'business_line',
    scopeCode: 'ZHIXIAO',
  });
  assert.equal(scoped.generation_no, 3);
  assert.equal(scoped.scope_generation_no, 1);
  assert.equal(scoped.scope_name, '支小业务');
  assert.equal(scoped.skill_code, 'zhixiao-ai');
  assert.equal(store.listReports({ scopeType: 'business_line', scopeCode: 'ZHIXIAO' }).total, 1);
  assert.equal(store.listReports({ scopeType: 'project', scopeCode: 'YYZ' }).total, 2);
  store.failReport(scoped.id, 'queued', {
    errorCode: 'TEST_COMPLETE',
    errorMessage: '测试结束',
  });

  const interrupted = store.createReport({ reportDate: '2026-07-24', userId: 1 });
  assert.equal(store.recoverInterruptedReports(), 1);
  assert.equal(store.getReport(interrupted.id).error_code, 'GENERATION_INTERRUPTED');

  db.close();
});

test('store persists Zhixiao SelectDB report artifacts after snapshot and materialization flow', async () => {
  const db = new BetterSqliteDatabase(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      display_name TEXT,
      username TEXT
    );
    INSERT INTO users (id, display_name, username) VALUES (1, '分析员', 'analyst');
  `);
  const store = createBusinessDailyReportStore({ db, identityDb: db });
  const { env, sourceDir } = createReadyZhixiaoSelectDbTestEnv();
  const snapshot = await collectZhixiaoSelectDbSnapshots({
    reportDate: '2026-07-31',
    env,
    connector: {
      async queryDataset(datasetCode, { startDate, endDate }) {
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
    },
  });
  const materialized = runZhixiaoSelectDbMaterializer({
    manifestPath: snapshot.manifest_path,
    sourceDir,
    env,
  });
  assert.equal(materialized.status, 0);
  assert.equal(JSON.parse(materialized.stdout).written_count, ZHIXIAO_SELECTDB_DATASET_CODES.length);

  const report = store.createReport({
    reportDate: '2026-07-31',
    userId: 1,
    skillCode: 'zhixiao-ai',
    scopeType: 'business_line',
    scopeCode: 'ZHIXIAO',
  });
  const rawHtml = `
    <!doctype html>
    <html><head><title>支小应用数据</title></head><body class="locked report">
      <div class="password-mask"><input id="pwdInput"></div>
      <nav class="side-nav"><a href="#income">收入汇总</a></nav>
      <main class="app"><h1>支小应用数据</h1></main>
      <script>
        const PASS_KEY = "zfb_pass_multi_2026-07-31";
        const PASSWORD = "zfb666";
        window.APP_INCOME_DETAIL_DATA = {"2026-07-31":[]};
      </script>
    </body></html>
  `;
  const artifactHtml = normalizeZhixiaoReportHtmlForArtifact(rawHtml);
  const completion = appendZhixiaoSelectDbCompletionArtifacts({
    source: {
      type: 'local_zhixiao_html',
      latest_date: '2026-07-31',
    },
    normalized: {
      type: 'zhixiao_html_artifact',
      password_gate_removed: true,
      latest_date: '2026-07-31',
    },
    reportModel: {
      business_code: 'YYZ',
      scope_type: report.scope_type,
      scope_code: report.scope_code,
      scope_name: report.scope_name,
      report_date: report.report_date,
      latest_source_date: '2026-07-31',
      narrative: {
        summary: '已导入支小业务 HTML 日报。',
      },
    },
    reportHtml: artifactHtml,
    artifacts: [{
      artifactType: 'zhixiao_html_report',
      content: artifactHtml,
      contentType: 'text/html; charset=utf-8',
    }],
    decisionMarkdown: '# 支小业务日报导入',
    qualityStatus: 'passed',
  }, {
    snapshot,
    materialized,
  });
  store.completeReport(report.id, completion);

  const completed = store.getReport(report.id);
  assert.equal(completed.status, 'completed');
  const reportModel = JSON.parse(store.getArtifact(report.id, 'report_model_json').content_text);
  assert.equal(reportModel.source_v2.type, 'zhixiao-selectdb-compat-v1');
  assert.equal(store.listArtifacts(report.id).some(item => item.artifact_type === 'zhixiao_html_report'), true);
  const zhixiaoHtml = store.getArtifact(report.id, 'zhixiao_html_report').content_text;
  assert.match(zhixiaoHtml, /支小应用数据/);
  assert.doesNotMatch(zhixiaoHtml, /password-mask|pwdInput|zfb666/);
  const sourceJson = JSON.parse(store.getArtifact(report.id, 'source_json').content_text);
  assert.equal(sourceJson.type, 'midmax_selectdb_snapshot');
  assert.equal(sourceJson.datasets.length, ZHIXIAO_SELECTDB_DATASET_CODES.length);
  const executionManifest = JSON.parse(store.getArtifact(report.id, 'execution_manifest').content_text);
  assert.equal(executionManifest.source_mode, 'midmax_selectdb');
  assert.equal(executionManifest.materializer.status, 0);

  db.close();
});
