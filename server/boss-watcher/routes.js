const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const db = require('./db');
const auth = require('./auth');
const dingtalk = require('./dingtalk');
const { syncPositions, getPositions } = require('./sync-positions');
const { executeJob, getJob, getLatestJob, getRunningJob, applyCron } = require('./scheduler');
const { encryptRow } = require('../lib/cryptoDao');
const crawlerConfig = require('./crawler-config');

function logAccess(userId, eventId, action, extra) {
  if (!userId) return;
  try {
    db.prepare('INSERT INTO boss_watch_access_log (user_id, event_id, action, extra) VALUES (?, ?, ?, ?)')
      .run(userId, eventId || null, action, extra ? JSON.stringify(extra) : null);
  } catch (err) {
    console.error('[boss-watcher] access log failed:', err.message);
  }
}

// 目标公司 CRUD
router.get('/targets', (req, res) => {
  const rows = db.prepare('SELECT * FROM boss_watch_target ORDER BY created_at DESC').all();
  res.json(rows);
});

// Boss 公司搜索代理（用于添加目标公司时按名搜 ID）
const COMPANY_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
router.get('/companies/search', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  if (!keyword) return res.json([]);
  const cookie = auth.getCookie();
  if (!cookie) return res.status(400).json({ error: 'Boss 账号未配置' });

  try {
    const url = `https://www.zhipin.com/wapi/zpgeek/search/joblist.json?query=${encodeURIComponent(keyword)}&page=1&pageSize=30&scene=1`;
    const r = await fetch(url, { headers: { Cookie: cookie, 'User-Agent': COMPANY_UA } });
    const data = await r.json();
    if (data.code !== 0) {
      return res.status(502).json({ error: `Boss 接口返回 ${data.code}: ${data.message || ''}` });
    }
    const list = data.zpData?.jobList || data.zpData?.list || [];
    const seen = new Map();
    for (const item of list) {
      const id = item.encryptBrandId || item.brandComId || item.encBrandId || item.companyId || item.encryptCompanyId;
      const name = item.brandName || item.companyName || item.brandFullName;
      if (!id || !name) continue;
      if (!seen.has(id)) {
        seen.set(id, {
          boss_company_id: String(id),
          company_name: String(name),
          industry: item.brandIndustry || item.industryName || '',
          scale: item.brandScaleName || item.scaleName || ''
        });
      }
    }
    res.json([...seen.values()].slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: '搜索失败：' + err.message });
  }
});

router.post('/targets', (req, res) => {
  const { boss_company_id, company_name, keyword_memo } = req.body;
  if (!boss_company_id || !company_name) {
    return res.status(400).json({ error: '公司ID和名称必填' });
  }
  try {
    db.prepare(`
      INSERT INTO boss_watch_target (boss_company_id, company_name, keyword_memo)
      VALUES (?, ?, ?)
    `).run(boss_company_id, company_name, keyword_memo || '');
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '该公司已存在' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/targets/:id', (req, res) => {
  const { company_name, keyword_memo, enabled } = req.body;
  db.prepare(`
    UPDATE boss_watch_target SET company_name = COALESCE(?, company_name),
      keyword_memo = COALESCE(?, keyword_memo),
      enabled = COALESCE(?, enabled),
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(company_name, keyword_memo, enabled, req.params.id);
  res.json({ success: true });
});

router.delete('/targets/:id', (req, res) => {
  db.prepare('DELETE FROM boss_watch_target WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 岗位列表
router.get('/positions', (req, res) => {
  res.json(getPositions());
});

router.post('/positions/sync', async (req, res) => {
  try {
    const positions = await syncPositions();
    res.json({ success: true, count: positions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 事件列表
router.get('/events', (req, res) => {
  const { boss_company_id, position_id, event_type, handle_status, include_ignored, page = 1, pageSize = 50 } = req.query;
  let sql = `
    SELECT e.*, u.display_name AS handled_by_name
    FROM boss_watch_event e
    LEFT JOIN users u ON u.id = e.handled_by
    WHERE 1=1
  `;
  const params = [];
  if (boss_company_id) { sql += ' AND e.boss_company_id = ?'; params.push(boss_company_id); }
  if (position_id) { sql += ' AND e.position_id = ?'; params.push(position_id); }
  if (event_type) { sql += ' AND e.event_type = ?'; params.push(event_type); }
  if (handle_status) { sql += ' AND e.handle_status = ?'; params.push(handle_status); }
  else if (include_ignored !== '1') { sql += " AND COALESCE(e.handle_status,'new') != 'ignored'"; }
  sql += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const rows = db.prepare(sql).all(...params);

  let countSql = 'SELECT COUNT(*) as total FROM boss_watch_event WHERE 1=1';
  const countParams = [];
  if (boss_company_id) { countSql += ' AND boss_company_id = ?'; countParams.push(boss_company_id); }
  if (position_id) { countSql += ' AND position_id = ?'; countParams.push(position_id); }
  if (event_type) { countSql += ' AND event_type = ?'; countParams.push(event_type); }
  if (handle_status) { countSql += ' AND handle_status = ?'; countParams.push(handle_status); }
  else if (include_ignored !== '1') { countSql += " AND COALESCE(handle_status,'new') != 'ignored'"; }
  const { total } = db.prepare(countSql).get(...countParams);

  res.json({ data: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

// 同一候选人合并视图：按 geek_id 取最新事件 + 同人计数
router.get('/events/grouped', (req, res) => {
  const { boss_company_id, position_id, event_type, handle_status, include_ignored } = req.query;

  // SQLite 无窗口函数前提下，先查筛选后的所有事件取 geek_id，再用聚合
  let sql = `
    SELECT e.id, e.event_type, e.boss_company_id, e.company_name, e.position_id, e.position_title,
           e.candidate_name, e.candidate_title, e.candidate_city, e.candidate_status,
           e.detail_json, e.handle_status, e.handled_by, e.handled_at, e.person_id, e.created_at,
           u.display_name AS handled_by_name
    FROM boss_watch_event e
    LEFT JOIN users u ON u.id = e.handled_by
    WHERE 1=1
  `;
  const params = [];
  if (boss_company_id) { sql += ' AND e.boss_company_id = ?'; params.push(boss_company_id); }
  if (position_id) { sql += ' AND e.position_id = ?'; params.push(position_id); }
  if (event_type) { sql += ' AND e.event_type = ?'; params.push(event_type); }
  if (handle_status) { sql += ' AND e.handle_status = ?'; params.push(handle_status); }
  else if (include_ignored !== '1') { sql += " AND COALESCE(e.handle_status,'new') != 'ignored'"; }
  sql += ' ORDER BY e.created_at DESC LIMIT 2000';

  const rows = db.prepare(sql).all(...params);
  const groups = new Map();
  for (const r of rows) {
    let geekId = '';
    try { geekId = JSON.parse(r.detail_json || '{}').geek_id || ''; } catch {}
    const key = geekId || `_${r.id}`;
    if (!groups.has(key)) {
      groups.set(key, { geek_id: geekId, latest: r, total: 0, counts: { new: 0, gone: 0, status_change: 0 } });
    }
    const g = groups.get(key);
    g.total++;
    g.counts[r.event_type] = (g.counts[r.event_type] || 0) + 1;
  }
  res.json({ data: [...groups.values()], total: groups.size });
});


router.patch('/events/:id/status', (req, res) => {
  const { handle_status } = req.body;
  const allowed = ['new', 'viewed', 'followed', 'ignored'];
  if (!allowed.includes(handle_status)) {
    return res.status(400).json({ error: '非法状态' });
  }
  const result = db.prepare(`
    UPDATE boss_watch_event
    SET handle_status = ?, handled_by = ?, handled_at = datetime('now','localtime')
    WHERE id = ?
  `).run(handle_status, req.user.id, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '事件不存在' });
  logAccess(req.user.id, Number(req.params.id), 'status_change', { handle_status });
  res.json({ success: true });
});

// 同一候选人历史事件
router.get('/events/:id/related', (req, res) => {
  const event = db.prepare('SELECT detail_json FROM boss_watch_event WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: '事件不存在' });
  let geekId = '';
  try { geekId = JSON.parse(event.detail_json || '{}').geek_id || ''; } catch {}
  logAccess(req.user.id, Number(req.params.id), 'view_detail');
  if (!geekId) return res.json({ geek_id: '', events: [] });

  const rows = db.prepare(`
    SELECT id, event_type, position_title, candidate_status, company_name, candidate_city, detail_json, created_at, handle_status
    FROM boss_watch_event
    WHERE detail_json LIKE ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(`%"geek_id":"${geekId}"%`);
  res.json({ geek_id: geekId, events: rows });
});

// 一键入库到 persons（人才库）
router.post('/events/:id/import-to-persons', (req, res) => {
  const evt = db.prepare('SELECT * FROM boss_watch_event WHERE id = ?').get(req.params.id);
  if (!evt) return res.status(404).json({ error: '事件不存在' });
  if (evt.person_id) {
    return res.status(409).json({ error: '该候选人已入库', person_id: evt.person_id });
  }
  if (!evt.candidate_name) {
    return res.status(400).json({ error: '候选人姓名为空，无法入库' });
  }

  // 聚合同 geek_id 的历史事件，写成 notes
  let historyNote = '';
  try {
    const geekId = JSON.parse(evt.detail_json || '{}').geek_id || '';
    if (geekId) {
      const related = db.prepare(`
        SELECT event_type, position_title, candidate_status, created_at
        FROM boss_watch_event
        WHERE detail_json LIKE ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(`%"geek_id":"${geekId}"%`);
      if (related.length > 0) {
        historyNote = '\n\n招聘雷达事件记录：\n' + related.map(r =>
          `- ${r.created_at} ${r.event_type} @ ${r.position_title} (${r.candidate_status || '-'})`
        ).join('\n');
      }
    }
  } catch {}

  const notesText = `来源：招聘雷达 event#${evt.id}\n关联岗位：${evt.position_title}\n关联公司：${evt.company_name}\n抓取时间：${evt.created_at}${historyNote}`;

  const enc = encryptRow('persons', {
    name: evt.candidate_name,
    company: evt.company_name,
    position: evt.candidate_title,
    current_company: evt.company_name,
    current_position: evt.candidate_title,
    notes: notesText,
    source: '招聘雷达',
  });

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO persons (name, person_category, relation_types, city, company, position,
        notes, talent_type, current_company, current_position, recruit_status, intent_level,
        source, weight, created_by)
      VALUES (?, 'talent', 'talent_external', ?, ?, ?, ?, 'external', ?, ?, 'potential', 'low', ?, 'medium', ?)
    `).run(
      enc.name, evt.candidate_city || '', enc.company, enc.position,
      enc.notes, enc.current_company, enc.current_position, enc.source, req.user.id
    );
    const personId = result.lastInsertRowid;
    db.prepare(`
      UPDATE boss_watch_event
      SET person_id = ?, handle_status = 'followed', handled_by = ?, handled_at = datetime('now','localtime')
      WHERE id = ?
    `).run(personId, req.user.id, evt.id);
    return personId;
  });

  try {
    const personId = tx();
    logAccess(req.user.id, evt.id, 'import_to_persons', { person_id: personId });
    res.json({ success: true, person_id: personId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Boss 账号状态
router.get('/boss-status', async (req, res) => {
  const status = await auth.getStatus();
  res.json(status);
});

router.post('/boss-cookie', (req, res) => {
  const { cookie } = req.body;
  if (!cookie) return res.status(400).json({ error: 'cookie 必填' });
  auth.saveSession(cookie);
  res.json({ success: true });
});

router.delete('/boss-cookie', (req, res) => {
  auth.clearSession();
  res.json({ success: true });
});

// 钉钉配置
router.get('/dingtalk-status', (req, res) => {
  res.json(dingtalk.getConfigStatus());
});

router.post('/dingtalk-config', (req, res) => {
  const { appKey, appSecret, agentId, receivers, baseUrl } = req.body;
  if (!appKey || !appSecret || !agentId) {
    return res.status(400).json({ error: 'appKey/appSecret/agentId 必填' });
  }
  if (!receivers || typeof receivers !== 'object') {
    return res.status(400).json({ error: 'receivers 必填' });
  }
  const roles = ['ceo', 'coo', 'cto', 'cmo'];
  const filtered = {};
  for (const r of roles) {
    if (receivers[r]) filtered[r] = String(receivers[r]).trim();
  }
  if (Object.keys(filtered).length === 0) {
    return res.status(400).json({ error: '至少填写一位老板的 userId' });
  }
  dingtalk.saveConfig({ appKey, appSecret, agentId, receivers: filtered, baseUrl: (baseUrl || '').trim() });
  res.json({ success: true });
});

// 手动触发抓取（异步）。date 仅用于重跑 diff，不重新抓 Boss
router.post('/trigger', (req, res) => {
  try {
    const { date } = req.body || {};
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
    }
    const { jobId, alreadyRunning } = executeJob('manual', date ? { date } : {});
    res.json({ success: true, jobId, alreadyRunning, diffOnly: !!date });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/latest', (req, res) => {
  const running = getRunningJob();
  const latest = getLatestJob();
  res.json({ running: running || null, latest: latest || null });
});

router.get('/jobs/:id', (req, res) => {
  const job = getJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: '任务不存在' });
  res.json(job);
});

// 统计概览
router.get('/stats', (req, res) => {
  const latest = getLatestJob();
  const running = getRunningJob();
  const today = new Date().toISOString().slice(0, 10);
  const { today_events } = db.prepare(
    "SELECT COUNT(*) as today_events FROM boss_watch_event WHERE substr(created_at,1,10) = ?"
  ).get(today);
  const { total_events } = db.prepare('SELECT COUNT(*) as total_events FROM boss_watch_event').get();
  const { target_count } = db.prepare('SELECT COUNT(*) as target_count FROM boss_watch_target WHERE enabled = 1').get();
  const { position_count } = db.prepare('SELECT COUNT(*) as position_count FROM boss_watch_position WHERE active = 1').get();
  res.json({
    latestJob: latest || null,
    runningJob: running || null,
    todayEvents: today_events,
    totalEvents: total_events,
    targetCount: target_count,
    positionCount: position_count
  });
});

// 钉钉测试推送
router.post('/dingtalk-test', async (req, res) => {
  try {
    const config = dingtalk.loadConfig();
    const receivers = dingtalk.getReceivers(config);
    const { role } = req.body || {};
    const targets = role
      ? (receivers[role] ? [[role, receivers[role]]] : [])
      : Object.entries(receivers);
    if (targets.length === 0) {
      return res.status(400).json({ error: '没有可用的接收人' });
    }
    const ROLE_LABEL = { ceo: 'CEO', coo: 'COO', cto: 'CTO', cmo: 'CMO' };
    const results = [];
    for (const [r, userId] of targets) {
      try {
        await dingtalk.sendWorkNotice(
          userId,
          `招聘雷达 - 测试推送 (${ROLE_LABEL[r]})`,
          `## 招聘雷达测试推送\n\n这是发给 **${ROLE_LABEL[r]}** 的测试消息，收到即表示配置生效。\n\n*发送时间: ${new Date().toLocaleString('zh-CN')}*`
        );
        results.push({ role: r, success: true });
      } catch (err) {
        results.push({ role: r, success: false, error: err.message });
      }
    }
    res.json({ success: results.every(r => r.success), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 分发规则预览：把现有岗位按规则分桶展示
router.get('/dispatch-preview', (req, res) => {
  const { classifyPosition } = require('./dispatch-rules');
  const positions = db.prepare('SELECT boss_position_id, title FROM boss_watch_position WHERE active = 1').all();
  const buckets = { ceo: [], coo: [], cto: [], cmo: [] };
  for (const p of positions) {
    const role = classifyPosition(p.title);
    buckets[role].push(p);
  }
  res.json(buckets);
});

// CSV 导出（UTF-8 BOM，Excel 可直接打开）
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get('/events/export', (req, res) => {
  const { from, to, boss_company_id, position_id, event_type, handle_status, include_ignored } = req.query;
  let sql = `
    SELECT e.id, e.event_type, e.boss_company_id, e.company_name, e.position_id, e.position_title,
           e.candidate_name, e.candidate_title, e.candidate_city, e.candidate_status,
           e.detail_json, e.handle_status, e.handled_at, e.person_id, e.created_at,
           u.display_name AS handled_by_name
    FROM boss_watch_event e
    LEFT JOIN users u ON u.id = e.handled_by
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND substr(e.created_at,1,10) >= ?'; params.push(from); }
  if (to) { sql += ' AND substr(e.created_at,1,10) <= ?'; params.push(to); }
  if (boss_company_id) { sql += ' AND e.boss_company_id = ?'; params.push(boss_company_id); }
  if (position_id) { sql += ' AND e.position_id = ?'; params.push(position_id); }
  if (event_type) { sql += ' AND e.event_type = ?'; params.push(event_type); }
  if (handle_status) { sql += ' AND e.handle_status = ?'; params.push(handle_status); }
  else if (include_ignored !== '1') { sql += " AND COALESCE(e.handle_status,'new') != 'ignored'"; }
  sql += ' ORDER BY e.created_at DESC LIMIT 10000';

  const rows = db.prepare(sql).all(...params);
  const headers = ['id', '时间', '类型', '公司', '岗位', '候选人', '职位', '城市', '活跃状态', '处理状态', '处理人', '处理时间', '已入库人才ID', '前置状态', '新状态', 'geek_id'];
  const lines = [headers.join(',')];
  const TYPE_LABEL = { new: '新出现', gone: '已消失', status_change: '状态变化' };
  const HANDLE_LABEL = { new: '未处理', viewed: '已查看', followed: '已跟进', ignored: '已忽略' };
  for (const r of rows) {
    let prev = '', next = '', geek = '';
    try {
      const d = JSON.parse(r.detail_json || '{}');
      prev = d.prev_status || ''; next = d.new_status || ''; geek = d.geek_id || '';
    } catch {}
    lines.push([
      r.id, r.created_at, TYPE_LABEL[r.event_type] || r.event_type,
      r.company_name, r.position_title, r.candidate_name, r.candidate_title,
      r.candidate_city, r.candidate_status,
      HANDLE_LABEL[r.handle_status || 'new'] || r.handle_status,
      r.handled_by_name || '', r.handled_at || '',
      r.person_id || '', prev, next, geek
    ].map(csvEscape).join(','));
  }
  const csv = '﻿' + lines.join('\r\n');
  const filename = `招聘雷达_${(from || '').replace(/-/g, '') || 'all'}_${(to || '').replace(/-/g, '') || 'now'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  logAccess(req.user.id, null, 'export_csv', { count: rows.length, from, to });
  res.send(csv);
});

// 审计日志查询
router.get('/access-log', (req, res) => {
  const { event_id, user_id, action, page = 1, pageSize = 100 } = req.query;
  let sql = `
    SELECT al.*, u.display_name AS user_name
    FROM boss_watch_access_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1
  `;
  const params = [];
  if (event_id) { sql += ' AND al.event_id = ?'; params.push(event_id); }
  if (user_id) { sql += ' AND al.user_id = ?'; params.push(user_id); }
  if (action) { sql += ' AND al.action = ?'; params.push(action); }
  sql += ' ORDER BY al.id DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows });
});

// 抓取参数配置
router.get('/crawler-config', (req, res) => {
  res.json(crawlerConfig.load());
});

router.put('/crawler-config', (req, res) => {
  const { cronMorning, cronAfternoon, pageSize, maxPagesPerJob, concurrency, cityWhitelist } = req.body || {};
  for (const expr of [cronMorning, cronAfternoon]) {
    if (expr && !cron.validate(expr)) {
      return res.status(400).json({ error: `非法 cron 表达式：${expr}` });
    }
  }
  const next = crawlerConfig.save({
    cronMorning, cronAfternoon, pageSize, maxPagesPerJob, concurrency,
    cityWhitelist: Array.isArray(cityWhitelist) ? cityWhitelist
      : typeof cityWhitelist === 'string' ? cityWhitelist.split(/[,，\s]+/).filter(Boolean)
      : []
  });
  applyCron();
  res.json(next);
});

module.exports = router;
