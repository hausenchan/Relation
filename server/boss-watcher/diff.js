const db = require('./db');

const BASELINE_MAX_DAYS = 3;

function diffSnapshots(today, baseline) {
  if (!baseline) baseline = getLatestSnapshotDateBefore(today);

  const todayRows = db.prepare(
    'SELECT position_id, boss_company_id, candidates_json FROM boss_watch_snapshot WHERE snapshot_date = ?'
  ).all(today);

  if (!baseline) return [];

  const stale = isStaleBaseline(baseline, today);

  const yesterdayRows = db.prepare(
    'SELECT position_id, boss_company_id, candidates_json FROM boss_watch_snapshot WHERE snapshot_date = ?'
  ).all(baseline);

  const yesterdayMap = buildCandidateMap(yesterdayRows);
  const todayMap = buildCandidateMap(todayRows);

  const events = [];

  for (const [key, candidate] of todayMap.entries()) {
    if (!yesterdayMap.has(key)) {
      events.push(makeEvent('new', candidate));
    } else {
      const prev = yesterdayMap.get(key);
      if (prev.status !== candidate.status) {
        events.push(makeEvent('status_change', candidate, prev));
      }
    }
  }

  // 基线超过 BASELINE_MAX_DAYS，跳过 gone：
  // 中间漏抓多日时，候选人池里的"消失"无法区分是真消失还是没抓到，全标 gone 会刷屏
  if (!stale) {
    for (const [key, candidate] of yesterdayMap.entries()) {
      if (!todayMap.has(key)) {
        events.push(makeEvent('gone', candidate));
      }
    }
  }

  return events;
}

function isStaleBaseline(baseline, today) {
  const diff = (new Date(today) - new Date(baseline)) / 86400000;
  return diff > BASELINE_MAX_DAYS;
}

function buildCandidateMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const candidates = JSON.parse(row.candidates_json || '[]');
    for (const c of candidates) {
      const key = `${c.geek_id}_${row.position_id}_${row.boss_company_id}`;
      map.set(key, { ...c, position_id: row.position_id, boss_company_id: row.boss_company_id });
    }
  }
  return map;
}

function makeEvent(type, candidate, prev) {
  const target = db.prepare('SELECT company_name FROM boss_watch_target WHERE boss_company_id = ?')
    .get(candidate.boss_company_id);
  const position = db.prepare('SELECT title FROM boss_watch_position WHERE boss_position_id = ?')
    .get(candidate.position_id);

  return {
    event_type: type,
    boss_company_id: candidate.boss_company_id,
    company_name: target?.company_name || candidate.company || '',
    position_id: candidate.position_id,
    position_title: position?.title || '',
    candidate_name: candidate.name || '',
    candidate_title: candidate.title || '',
    candidate_city: candidate.city || '',
    candidate_status: candidate.status || '',
    detail_json: JSON.stringify({
      geek_id: candidate.geek_id,
      prev_status: prev?.status || null,
      new_status: candidate.status || null
    })
  };
}

function saveEvents(events) {
  if (events.length === 0) return;
  const insert = db.prepare(`
    INSERT INTO boss_watch_event (event_type, boss_company_id, company_name, position_id, position_title,
      candidate_name, candidate_title, candidate_city, candidate_status, detail_json, created_at)
    VALUES (@event_type, @boss_company_id, @company_name, @position_id, @position_title,
      @candidate_name, @candidate_title, @candidate_city, @candidate_status, @detail_json, datetime('now','localtime'))
  `);
  const tx = db.transaction((items) => { for (const item of items) insert.run(item); });
  tx(events);
}

function runDiff(today) {
  if (!today) today = new Date().toISOString().slice(0, 10);
  const baseline = getLatestSnapshotDateBefore(today);
  const events = diffSnapshots(today, baseline);
  saveEvents(events);
  return events;
}

function getLatestSnapshotDateBefore(dateStr) {
  const row = db.prepare(
    'SELECT MAX(snapshot_date) as d FROM boss_watch_snapshot WHERE snapshot_date < ?'
  ).get(dateStr);
  return row?.d || null;
}

module.exports = { diffSnapshots, runDiff, saveEvents, getLatestSnapshotDateBefore, isStaleBaseline, BASELINE_MAX_DAYS };
