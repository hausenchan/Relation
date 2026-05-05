const db = require('./db');
const auth = require('./auth');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function getTargetCompanyIds() {
  return db.prepare('SELECT boss_company_id FROM boss_watch_target WHERE enabled = 1').all()
    .map(r => r.boss_company_id);
}

async function fetchCandidatesForPosition(positionId, cookie) {
  const candidates = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `https://www.zhipin.com/wapi/zprelation/friend/geekRecommendList?jobId=${positionId}&page=${page}&pageSize=30`, {
        headers: { 'Cookie': cookie, 'User-Agent': UA }
      }
    );
    const data = await res.json();
    if (data.code !== 0) break;

    const list = data.zpData?.result || data.zpData?.list || [];
    if (list.length === 0) { hasMore = false; break; }

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

    if (list.length < 30) hasMore = false;
    else page++;

    await sleep(1500 + Math.random() * 1500);
  }

  return candidates;
}

async function fetchAndFilter() {
  const cookie = auth.getCookie();
  if (!cookie) throw new Error('Boss 账号未登录');

  const targetIds = getTargetCompanyIds();
  if (targetIds.length === 0) return { total: 0, matched: 0, positions: [] };

  const positions = db.prepare('SELECT * FROM boss_watch_position WHERE active = 1').all();
  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const pos of positions) {
    const allCandidates = await fetchCandidatesForPosition(pos.boss_position_id, cookie);

    const matched = allCandidates.filter(c => targetIds.includes(c.boss_company_id));

    if (matched.length > 0) {
      for (const companyId of [...new Set(matched.map(c => c.boss_company_id))]) {
        const companyCandidates = matched.filter(c => c.boss_company_id === companyId);
        db.prepare(`
          INSERT INTO boss_watch_snapshot (snapshot_date, position_id, boss_company_id, candidates_json, created_at)
          VALUES (?, ?, ?, ?, datetime('now','localtime'))
        `).run(today, pos.boss_position_id, companyId, JSON.stringify(companyCandidates));
      }
    }

    results.push({ position: pos.title, total: allCandidates.length, matched: matched.length });
    await sleep(2000 + Math.random() * 2000);
  }

  return { total: results.reduce((s, r) => s + r.total, 0), matched: results.reduce((s, r) => s + r.matched, 0), positions: results };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchCandidatesForPosition, fetchAndFilter, getTargetCompanyIds };
