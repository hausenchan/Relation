const db = require('./db');
const auth = require('./auth');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function syncPositions() {
  const cookie = auth.getCookie();
  if (!cookie) throw new Error('Boss 账号未登录');

  const positions = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`https://www.zhipin.com/wapi/zpjob/job/data/list?page=${page}&pageSize=20`, {
      headers: { 'Cookie': cookie, 'User-Agent': UA }
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(`拉取岗位失败: ${data.message || data.code}`);

    const list = data.zpData?.list || data.zpData?.jobList || [];
    if (list.length === 0) { hasMore = false; break; }

    for (const job of list) {
      positions.push({
        boss_position_id: String(job.encryptJobId || job.jobId || job.encId),
        title: job.jobName || job.positionName || '',
        city: job.cityName || job.city || '',
        active: job.jobStatus === 1 || job.status === 1 ? 1 : 0
      });
    }

    if (list.length < 20) hasMore = false;
    else page++;

    await sleep(1000 + Math.random() * 1000);
  }

  const upsert = db.prepare(`
    INSERT INTO boss_watch_position (boss_position_id, title, city, active, synced_at)
    VALUES (@boss_position_id, @title, @city, @active, datetime('now','localtime'))
    ON CONFLICT(boss_position_id) DO UPDATE SET
      title = excluded.title,
      city = excluded.city,
      active = excluded.active,
      synced_at = datetime('now','localtime')
  `);

  const tx = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });
  tx(positions);

  return positions;
}

function getPositions() {
  return db.prepare('SELECT * FROM boss_watch_position WHERE active = 1 ORDER BY synced_at DESC').all();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { syncPositions, getPositions };
