const db = require('./db');
const auth = require('./auth');
const crawlerConfig = require('./crawler-config');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function getTargetCompanyIds() {
  return db.prepare('SELECT boss_company_id FROM boss_watch_target WHERE enabled = 1').all()
    .map(r => r.boss_company_id);
}

async function fetchCandidatesForPosition(positionId, cookie, opts = {}) {
  const pageSize = opts.pageSize || 30;
  const maxPages = opts.maxPages || 10;
  const candidates = [];
  let page = 1;

  while (page <= maxPages) {
    const res = await fetch(
      `https://www.zhipin.com/wapi/zprelation/friend/geekRecommendList?jobId=${positionId}&page=${page}&pageSize=${pageSize}`, {
        headers: { 'Cookie': cookie, 'User-Agent': UA }
      }
    );
    const data = await res.json();
    if (data.code !== 0) break;

    const list = data.zpData?.result || data.zpData?.list || [];
    if (list.length === 0) break;

    for (const item of list) {
      candidates.push({
        geek_id: String(item.encryptGeekId || item.geekId || item.uid || ''),
        name: item.geekName || item.name || '',
        company: item.company || item.companyName || '',
        title: item.jobTitle || item.expectPosition || item.geekWorkDesc || '',
        city: item.cityName || item.city || '',
        status: item.activeTimeDesc || item.activeText || '',
        boss_company_id: item.encryptCompanyId || item.companyId || ''
      });
    }

    if (list.length < pageSize) break;
    page++;
    await sleep(1500 + Math.random() * 1500);
  }

  return candidates;
}

function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(
      v => { active--; resolve(v); next(); },
      e => { active--; reject(e); next(); }
    );
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

async function fetchAndFilter() {
  const cookie = auth.getCookie();
  if (!cookie) throw new Error('Boss 账号未登录');

  const cfg = crawlerConfig.load();
  const targetIds = getTargetCompanyIds();
  if (targetIds.length === 0) return { total: 0, matched: 0, positions: [] };

  const positions = db.prepare('SELECT * FROM boss_watch_position WHERE active = 1').all();
  const today = new Date().toISOString().slice(0, 10);
  const cityWhitelist = (cfg.cityWhitelist || []).filter(Boolean);
  const limit = pLimit(cfg.concurrency || 2);

  const tasks = positions.map(pos => limit(async () => {
    const allCandidates = await fetchCandidatesForPosition(
      pos.boss_position_id, cookie,
      { pageSize: cfg.pageSize, maxPages: cfg.maxPagesPerJob }
    );

    const matched = allCandidates.filter(c => {
      if (!targetIds.includes(c.boss_company_id)) return false;
      if (cityWhitelist.length > 0 && c.city && !cityWhitelist.includes(c.city)) return false;
      return true;
    });

    if (matched.length > 0) {
      for (const companyId of [...new Set(matched.map(c => c.boss_company_id))]) {
        const companyCandidates = matched.filter(c => c.boss_company_id === companyId);
        db.prepare(`
          INSERT INTO boss_watch_snapshot (snapshot_date, position_id, boss_company_id, candidates_json, created_at)
          VALUES (?, ?, ?, ?, datetime('now','localtime'))
        `).run(today, pos.boss_position_id, companyId, JSON.stringify(companyCandidates));
      }
    }

    await sleep(1000 + Math.random() * 1500);
    return { position: pos.title, total: allCandidates.length, matched: matched.length };
  }));

  const results = await Promise.all(tasks);
  return {
    total: results.reduce((s, r) => s + r.total, 0),
    matched: results.reduce((s, r) => s + r.matched, 0),
    positions: results
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchCandidatesForPosition, fetchAndFilter, getTargetCompanyIds };
