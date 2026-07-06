const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAiSuggestionFeed } = require('./aiSuggestions');

const DEFAULT_SEED_DIR = path.join(__dirname, '../seeds/ai_suggestions');
const FEED_SCHEMA_VERSION = 1;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createSnapshotKey(payload) {
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSuggestionItem(item, index = 0) {
  const title = String(item?.title || '').trim();
  const type = String(item?.type || '').trim();
  const idSeed = item?.id || `${type}:${title}:${index}`;
  return {
    ...item,
    id: String(idSeed),
    type,
    title,
    business_side: String(item?.business_side || '').trim(),
    budget_side: String(item?.budget_side || '').trim(),
    business_line: String(item?.business_line || '').trim(),
    priority: String(item?.priority || 'medium').trim(),
    status: String(item?.status || 'pending_review').trim(),
    confidence: Number.isFinite(Number(item?.confidence)) ? Math.round(Number(item.confidence)) : 0,
    owner_role: String(item?.owner_role || '').trim(),
    summary: String(item?.summary || '').trim(),
    recommendation: String(item?.recommendation || '').trim(),
    expected_impact: String(item?.expected_impact || '').trim(),
    window_label: String(item?.window_label || '').trim(),
    related_product_name: String(item?.related_product_name || '').trim(),
    related_subject_name: String(item?.related_subject_name || '').trim(),
    scope_tags: safeArray(item?.scope_tags).map(value => String(value || '').trim()).filter(Boolean),
    evidence_sources: safeArray(item?.evidence_sources).map(value => String(value || '').trim()).filter(Boolean),
    evidence_highlights: safeArray(item?.evidence_highlights).map(value => String(value || '').trim()).filter(Boolean),
    actions: safeArray(item?.actions).map(value => String(value || '').trim()).filter(Boolean),
  };
}

function normalizeFeed(feed, options = {}) {
  const businessLine = String(options.businessLine || feed?.meta?.business_line || feed?.suggestions?.[0]?.business_line || 'zhixiao').trim();
  const suggestions = safeArray(feed?.suggestions).map(normalizeSuggestionItem);
  const metaBase = {
    schema_version: FEED_SCHEMA_VERSION,
    generated_at: feed?.meta?.generated_at || new Date().toISOString(),
    distillation_generated_at: feed?.meta?.distillation_generated_at || null,
    business_line: businessLine,
    business_line_label: String(feed?.meta?.business_line_label || suggestions[0]?.business_line || businessLine).trim(),
    window_start: feed?.meta?.window_start || null,
    window_end: feed?.meta?.window_end || null,
    window_label: feed?.meta?.window_label || '',
    eval_total_cases: Number.isFinite(Number(feed?.meta?.eval_total_cases)) ? Number(feed.meta.eval_total_cases) : null,
    eval_pass_count: Number.isFinite(Number(feed?.meta?.eval_pass_count)) ? Number(feed.meta.eval_pass_count) : null,
    eval_pass_rate: feed?.meta?.eval_pass_rate || null,
    suggestion_count: suggestions.length,
  };
  const snapshotKey = createSnapshotKey({
    schema_version: metaBase.schema_version,
    business_line: metaBase.business_line,
    distillation_generated_at: metaBase.distillation_generated_at,
    window_start: metaBase.window_start,
    window_end: metaBase.window_end,
    suggestions,
  });
  return {
    meta: {
      ...metaBase,
      snapshot_key: snapshotKey,
    },
    suggestions,
  };
}

function ensureAiSuggestionTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_suggestion_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_line TEXT NOT NULL,
      business_line_label TEXT DEFAULT NULL,
      snapshot_key TEXT NOT NULL UNIQUE,
      source_kind TEXT NOT NULL DEFAULT 'seed',
      source_label TEXT DEFAULT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      training_window_start TEXT DEFAULT NULL,
      training_window_end TEXT DEFAULT NULL,
      training_window_label TEXT DEFAULT NULL,
      distillation_generated_at TEXT DEFAULT NULL,
      eval_total_cases INTEGER DEFAULT NULL,
      eval_pass_count INTEGER DEFAULT NULL,
      eval_pass_rate TEXT DEFAULT NULL,
      suggestion_count INTEGER NOT NULL DEFAULT 0,
      seed_path TEXT DEFAULT NULL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_current INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ai_suggestion_snapshots_line_current
      ON ai_suggestion_snapshots(business_line, is_current, imported_at DESC);

    CREATE TABLE IF NOT EXISTS ai_suggestion_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      suggestion_code TEXT NOT NULL,
      suggestion_type TEXT DEFAULT NULL,
      title TEXT NOT NULL,
      business_side TEXT DEFAULT NULL,
      budget_side TEXT DEFAULT NULL,
      business_line TEXT DEFAULT NULL,
      priority TEXT DEFAULT NULL,
      status TEXT DEFAULT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      owner_role TEXT DEFAULT NULL,
      summary TEXT DEFAULT NULL,
      recommendation TEXT DEFAULT NULL,
      expected_impact TEXT DEFAULT NULL,
      window_label TEXT DEFAULT NULL,
      related_product_name TEXT DEFAULT NULL,
      related_subject_name TEXT DEFAULT NULL,
      scope_tags_json TEXT DEFAULT NULL,
      evidence_sources_json TEXT DEFAULT NULL,
      evidence_highlights_json TEXT DEFAULT NULL,
      actions_json TEXT DEFAULT NULL,
      payload_json TEXT DEFAULT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (snapshot_id) REFERENCES ai_suggestion_snapshots(id) ON DELETE CASCADE,
      UNIQUE(snapshot_id, suggestion_code)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_suggestion_items_snapshot_sort
      ON ai_suggestion_items(snapshot_id, sort_order, id);
  `);
}

function writeSeedFile(filePath, feed) {
  const normalized = normalizeFeed(feed);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function readSeedFile(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeFeed(payload);
  } catch {
    return null;
  }
}

function listSeedFiles(seedDir = DEFAULT_SEED_DIR) {
  if (!fs.existsSync(seedDir)) return [];
  return fs.readdirSync(seedDir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => path.join(seedDir, name));
}

function upsertAiSuggestionFeed(db, feed, options = {}) {
  const normalized = normalizeFeed(feed, options);
  const sourceKind = String(options.sourceKind || 'seed');
  const sourceLabel = options.sourceLabel || null;
  const seedPath = options.seedPath || null;

  const transaction = db.transaction(() => {
    db.prepare('UPDATE ai_suggestion_snapshots SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE business_line = ?')
      .run(normalized.meta.business_line);

    let snapshot = db.prepare('SELECT id FROM ai_suggestion_snapshots WHERE snapshot_key = ?').get(normalized.meta.snapshot_key);
    if (!snapshot) {
      const result = db.prepare(`
        INSERT INTO ai_suggestion_snapshots (
          business_line, business_line_label, snapshot_key, source_kind, source_label, schema_version,
          training_window_start, training_window_end, training_window_label, distillation_generated_at,
          eval_total_cases, eval_pass_count, eval_pass_rate, suggestion_count, seed_path, is_current
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        normalized.meta.business_line,
        normalized.meta.business_line_label,
        normalized.meta.snapshot_key,
        sourceKind,
        sourceLabel,
        normalized.meta.schema_version,
        normalized.meta.window_start,
        normalized.meta.window_end,
        normalized.meta.window_label,
        normalized.meta.distillation_generated_at,
        normalized.meta.eval_total_cases,
        normalized.meta.eval_pass_count,
        normalized.meta.eval_pass_rate,
        normalized.meta.suggestion_count,
        seedPath,
      );
      snapshot = { id: result.lastInsertRowid };
    } else {
      db.prepare(`
        UPDATE ai_suggestion_snapshots
        SET
          business_line = ?,
          business_line_label = ?,
          source_kind = ?,
          source_label = ?,
          schema_version = ?,
          training_window_start = ?,
          training_window_end = ?,
          training_window_label = ?,
          distillation_generated_at = ?,
          eval_total_cases = ?,
          eval_pass_count = ?,
          eval_pass_rate = ?,
          suggestion_count = ?,
          seed_path = ?,
          is_current = 1,
          imported_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        normalized.meta.business_line,
        normalized.meta.business_line_label,
        sourceKind,
        sourceLabel,
        normalized.meta.schema_version,
        normalized.meta.window_start,
        normalized.meta.window_end,
        normalized.meta.window_label,
        normalized.meta.distillation_generated_at,
        normalized.meta.eval_total_cases,
        normalized.meta.eval_pass_count,
        normalized.meta.eval_pass_rate,
        normalized.meta.suggestion_count,
        seedPath,
        snapshot.id,
      );
    }

    db.prepare('DELETE FROM ai_suggestion_items WHERE snapshot_id = ?').run(snapshot.id);
    const insertItem = db.prepare(`
      INSERT INTO ai_suggestion_items (
        snapshot_id, suggestion_code, suggestion_type, title, business_side, budget_side, business_line,
        priority, status, confidence, owner_role, summary, recommendation, expected_impact, window_label,
        related_product_name, related_subject_name, scope_tags_json, evidence_sources_json,
        evidence_highlights_json, actions_json, payload_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    normalized.suggestions.forEach((item, index) => {
      insertItem.run(
        snapshot.id,
        item.id,
        item.type,
        item.title,
        item.business_side || null,
        item.budget_side || null,
        item.business_line || null,
        item.priority || null,
        item.status || null,
        item.confidence || 0,
        item.owner_role || null,
        item.summary || null,
        item.recommendation || null,
        item.expected_impact || null,
        item.window_label || null,
        item.related_product_name || null,
        item.related_subject_name || null,
        JSON.stringify(item.scope_tags || []),
        JSON.stringify(item.evidence_sources || []),
        JSON.stringify(item.evidence_highlights || []),
        JSON.stringify(item.actions || []),
        JSON.stringify(item),
        index,
      );
    });

    return snapshot.id;
  });

  const snapshotId = transaction();
  return {
    snapshot_id: snapshotId,
    snapshot_key: normalized.meta.snapshot_key,
    suggestion_count: normalized.suggestions.length,
    feed: normalized,
  };
}

function getCurrentAiSuggestionFeed(db, businessLine = 'zhixiao') {
  const snapshot = db.prepare(`
    SELECT *
    FROM ai_suggestion_snapshots
    WHERE business_line = ?
    ORDER BY is_current DESC, imported_at DESC, id DESC
    LIMIT 1
  `).get(businessLine);
  if (!snapshot) return null;

  const items = db.prepare(`
    SELECT *
    FROM ai_suggestion_items
    WHERE snapshot_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(snapshot.id).map(row => ({
    ...JSON.parse(row.payload_json || '{}'),
    id: row.suggestion_code,
    type: row.suggestion_type,
    title: row.title,
    business_side: row.business_side,
    budget_side: row.budget_side,
    business_line: row.business_line,
    priority: row.priority,
    status: row.status,
    confidence: Number(row.confidence) || 0,
    owner_role: row.owner_role,
    summary: row.summary,
    recommendation: row.recommendation,
    expected_impact: row.expected_impact,
    window_label: row.window_label,
    related_product_name: row.related_product_name,
    related_subject_name: row.related_subject_name,
    scope_tags: JSON.parse(row.scope_tags_json || '[]'),
    evidence_sources: JSON.parse(row.evidence_sources_json || '[]'),
    evidence_highlights: JSON.parse(row.evidence_highlights_json || '[]'),
    actions: JSON.parse(row.actions_json || '[]'),
  }));

  return normalizeFeed({
    meta: {
      schema_version: snapshot.schema_version,
      generated_at: snapshot.updated_at || snapshot.imported_at,
      distillation_generated_at: snapshot.distillation_generated_at,
      business_line: snapshot.business_line,
      business_line_label: snapshot.business_line_label,
      window_start: snapshot.training_window_start,
      window_end: snapshot.training_window_end,
      window_label: snapshot.training_window_label,
      eval_total_cases: snapshot.eval_total_cases,
      eval_pass_count: snapshot.eval_pass_count,
      eval_pass_rate: snapshot.eval_pass_rate,
      suggestion_count: snapshot.suggestion_count,
      snapshot_key: snapshot.snapshot_key,
    },
    suggestions: items,
  }, { businessLine: snapshot.business_line });
}

function syncBundledAiSuggestionSeeds(db, options = {}) {
  const seedFiles = options.seedFiles || listSeedFiles(options.seedDir || DEFAULT_SEED_DIR);
  const results = [];
  seedFiles.forEach(filePath => {
    const feed = readSeedFile(filePath);
    if (!feed) return;
    results.push(upsertAiSuggestionFeed(db, feed, {
      sourceKind: 'seed',
      sourceLabel: options.sourceLabel || 'bundled_seed',
      seedPath: filePath,
    }));
  });
  return results;
}

function syncDistillationAiSuggestionFeed(db, options = {}) {
  const businessLine = options.businessLine || 'zhixiao';
  const feed = getAiSuggestionFeed({ businessLine });
  if (!feed || feed.meta?.unavailable) return null;

  let normalized = normalizeFeed(feed, { businessLine });
  if (options.seedFilePath) {
    normalized = writeSeedFile(options.seedFilePath, normalized);
  }
  return upsertAiSuggestionFeed(db, normalized, {
    businessLine,
    sourceKind: options.sourceKind || 'distillation',
    sourceLabel: options.sourceLabel || 'distillation_runtime',
    seedPath: options.seedFilePath || null,
  });
}

module.exports = {
  DEFAULT_SEED_DIR,
  FEED_SCHEMA_VERSION,
  ensureAiSuggestionTables,
  getCurrentAiSuggestionFeed,
  listSeedFiles,
  normalizeFeed,
  readSeedFile,
  syncBundledAiSuggestionSeeds,
  syncDistillationAiSuggestionFeed,
  upsertAiSuggestionFeed,
  writeSeedFile,
};
