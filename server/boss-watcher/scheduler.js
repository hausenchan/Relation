const cron = require('node-cron');
const { fetchAndFilter } = require('./fetch-candidates');
const { runDiff } = require('./diff');
const { sendEventNotice } = require('./dingtalk');
const db = require('./db');

let tasks = [];

async function executeJob() {
  const startTime = Date.now();
  console.log(`[boss-watcher] 开始抓取 ${new Date().toLocaleString()}`);

  try {
    const result = await fetchAndFilter();
    console.log(`[boss-watcher] 抓取完成: 总${result.total}人, 匹配${result.matched}人`);

    const today = new Date().toISOString().slice(0, 10);
    const events = runDiff(today);
    console.log(`[boss-watcher] Diff 完成: ${events.length}条变动`);

    if (events.length > 0) {
      try {
        await sendEventNotice(events);
        db.prepare('UPDATE boss_watch_event SET pushed = 1 WHERE pushed = 0').run();
        console.log(`[boss-watcher] 钉钉推送完成`);
      } catch (err) {
        console.error(`[boss-watcher] 钉钉推送失败:`, err.message);
      }
    }
  } catch (err) {
    console.error(`[boss-watcher] 抓取失败:`, err.message);
  }

  console.log(`[boss-watcher] 任务耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

function start() {
  const morning = cron.schedule('0 9 * * *', () => executeJob(), { timezone: 'Asia/Shanghai' });
  const afternoon = cron.schedule('0 14 * * *', () => executeJob(), { timezone: 'Asia/Shanghai' });
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
}

cron.schedule('30 3 * * *', () => cleanOldData(), { timezone: 'Asia/Shanghai' });

module.exports = { start, stop, executeJob };
