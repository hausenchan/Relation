const express = require('express');
const router = express.Router();
const db = require('./db');
const auth = require('./auth');
const dingtalk = require('./dingtalk');
const { syncPositions, getPositions } = require('./sync-positions');
const { executeJob } = require('./scheduler');

// 目标公司 CRUD
router.get('/targets', (req, res) => {
  const rows = db.prepare('SELECT * FROM boss_watch_target ORDER BY created_at DESC').all();
  res.json(rows);
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
  const { boss_company_id, position_id, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM boss_watch_event WHERE 1=1';
  const params = [];
  if (boss_company_id) { sql += ' AND boss_company_id = ?'; params.push(boss_company_id); }
  if (position_id) { sql += ' AND position_id = ?'; params.push(position_id); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const rows = db.prepare(sql).all(...params);

  let countSql = 'SELECT COUNT(*) as total FROM boss_watch_event WHERE 1=1';
  const countParams = [];
  if (boss_company_id) { countSql += ' AND boss_company_id = ?'; countParams.push(boss_company_id); }
  if (position_id) { countSql += ' AND position_id = ?'; countParams.push(position_id); }
  const { total } = db.prepare(countSql).get(...countParams);

  res.json({ data: rows, total, page: Number(page), pageSize: Number(pageSize) });
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
  const { appKey, appSecret, agentId, receiverUserId } = req.body;
  if (!appKey || !appSecret || !agentId || !receiverUserId) {
    return res.status(400).json({ error: '所有字段必填' });
  }
  dingtalk.saveConfig({ appKey, appSecret, agentId, receiverUserId });
  res.json({ success: true });
});

// 手动触发抓取
router.post('/trigger', async (req, res) => {
  try {
    await executeJob();
    res.json({ success: true, message: '抓取任务已完成' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
