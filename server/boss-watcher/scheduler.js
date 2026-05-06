const cron = require('node-cron');
const { fetchAndFilter } = require('./fetch-candidates');
const { runDiff } = require('./diff');
const { sendEventNotice, sendWorkNotice, loadConfig, getReceivers } = require('./dingtalk');
const auth = require('./auth');
const db = require('./db');

let tasks = [];

function createJob(triggerType) {
  const info = db.prepare(`
    INSERT INTO boss_watch_job_log (status, trigger_type, started_at)
    VALUES ('running', ?, datetime('now','localtime'))
  `).run(triggerType);
  return info.lastInsertRowid;
}

function updateJob(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sql = `UPDATE boss_watch_job_log SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map(k => fields[k]), id);
}

function getRunningJob() {
  return db.prepare("SELECT * FROM boss_watch_job_log WHERE status = 'running' ORDER BY id DESC LIMIT 1").get();
}

function getJob(id) {
  return db.prepare('SELECT * FROM boss_watch_job_log WHERE id = ?').get(id);
}

function getLatestJob() {
  return db.prepare('SELECT * FROM boss_watch_job_log ORDER BY id DESC LIMIT 1').get();
}

async function notifyCookieExpired() {
  const config = loadConfig();
  const receivers = getReceivers(config || {});
  const userId = receivers.ceo;
  if (!userId) return;
  try {
    await sendWorkNotice(
      userId,
      '招聘雷达 - Boss 账号失效',
      '## ⚠️ Boss Cookie 已失效\n\n' +
      '本次抓取已跳过，请尽快在管理后台重新配置 Boss Cookie。\n\n' +
      `*检测时间: ${new Date().toLocaleString('zh-CN')}*`
    );
  } catch (err) {
    console.error('[boss-watcher] Cookie 失效告警推送失败:', err.message);
  }
}

async function runJob(jobId, options = {}) {
  const startTime = Date.now();
  const { date: overrideDate } = options;
  const diffOnly = !!overrideDate;
  console.log(`[boss-watcher] 开始${diffOnly ? '补跑 diff' : '抓取'} job#${jobId}${overrideDate ? ' date=' + overrideDate : ''} ${new Date().toLocaleString()}`);

  try {
    if (!diffOnly) {
      updateJob(jobId, { progress: '正在校验 Boss 账号' });
      const cookie = auth.getCookie();
      if (!cookie || !(await auth.isSessionValid(cookie))) {
        await notifyCookieExpired();
        updateJob(jobId, {
          status: 'skipped',
          finished_at: new Date().toLocaleString('sv-SE').replace('T', ' '),
          error: 'Boss Cookie 失效或未配置',
          progress: '已跳过（Cookie 失效）'
        });
        console.warn(`[boss-watcher] job#${jobId} 已跳过：Cookie 失效`);
        return;
      }

      updateJob(jobId, { progress: '正在拉取候选人' });
      const result = await fetchAndFilter();
      updateJob(jobId, {
        total_count: result.total,
        matched_count: result.matched,
        progress: '正在比对差异'
      });
      console.log(`[boss-watcher] 抓取完成: 总${result.total}人, 匹配${result.matched}人`);
    } else {
      updateJob(jobId, { progress: `仅重跑 diff (${overrideDate})` });
    }

    const diffDate = overrideDate || new Date().toISOString().slice(0, 10);
    const events = runDiff(diffDate);
    updateJob(jobId, { event_count: events.length, progress: events.length > 0 ? '正在推送钉钉' : '完成' });
    console.log(`[boss-watcher] Diff 完成: ${events.length}条变动`);

    if (events.length > 0) {
      try {
        await sendEventNotice(events);
        db.prepare('UPDATE boss_watch_event SET pushed = 1 WHERE pushed = 0').run();
        console.log(`[boss-watcher] 钉钉推送完成`);
      } catch (err) {
        console.error(`[boss-watcher] 钉钉推送失败:`, err.message);
        updateJob(jobId, { error: `钉钉推送失败: ${err.message}` });
      }
    }

    updateJob(jobId, {
      status: 'success',
      finished_at: new Date().toLocaleString('sv-SE').replace('T', ' '),
      progress: '完成'
    });
  } catch (err) {
    console.error(`[boss-watcher] 抓取失败:`, err.message);
    updateJob(jobId, {
      status: 'failed',
      finished_at: new Date().toLocaleString('sv-SE').replace('T', ' '),
      error: err.message,
      progress: '失败'
    });
  }

  console.log(`[boss-watcher] 任务耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

function executeJob(triggerType = 'manual', options = {}) {
  const running = getRunningJob();
  if (running) {
    return { jobId: running.id, alreadyRunning: true };
  }
  const jobId = createJob(triggerType);
  setImmediate(() => runJob(jobId, options));
  return { jobId, alreadyRunning: false };
}

function start() {
  db.prepare(`
    UPDATE boss_watch_job_log
    SET status = 'failed', error = COALESCE(NULLIF(error, ''), '进程重启前未结束'),
        finished_at = datetime('now','localtime')
    WHERE status = 'running'
  `).run();
  const morning = cron.schedule('0 9 * * *', () => executeJob('cron'), { timezone: 'Asia/Shanghai' });
  const afternoon = cron.schedule('0 14 * * *', () => executeJob('cron'), { timezone: 'Asia/Shanghai' });
  tasks = [morning, afternoon];
  console.log('[boss-watcher] 调度器已启动 (9:00, 14:00)');
}

function stop() {
  tasks.forEach(t => t.stop());
  tasks = [];
  console.log('[boss-watcher] 调度器已停止');
}

function cleanOldData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  db.prepare('DELETE FROM boss_watch_snapshot WHERE snapshot_date < ?').run(cutoffStr);
  db.prepare('DELETE FROM boss_watch_event WHERE created_at < ?').run(cutoffStr);
  db.prepare('DELETE FROM boss_watch_job_log WHERE started_at < ?').run(cutoffStr);
}

cron.schedule('30 3 * * *', () => cleanOldData(), { timezone: 'Asia/Shanghai' });

module.exports = { start, stop, executeJob, getRunningJob, getJob, getLatestJob };
