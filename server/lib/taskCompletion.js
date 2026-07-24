const TASK_COMPLETION_REPAIR_MIGRATION_KEY = 'task-completion-transition-repair-v1';
const TASK_COMPLETION_TABLES = Object.freeze(['tasks', 'follow_up_tasks']);

function resolveTaskLifecycleTimestamps({
  currentStatus,
  requestedStatus,
  startedAt = null,
  doneAt = null,
  now,
}) {
  const hasRequestedStatus = requestedStatus !== undefined && requestedStatus !== null;
  const nextStatus = hasRequestedStatus ? requestedStatus : currentStatus;
  const statusChanged = hasRequestedStatus && nextStatus !== currentStatus;
  const nextStartedAt = statusChanged && nextStatus === 'in_progress'
    ? (startedAt || now)
    : startedAt;

  let nextDoneAt = doneAt;
  if (statusChanged) {
    nextDoneAt = nextStatus === 'done' ? now : null;
  }

  return {
    status: nextStatus,
    startedAt: nextStartedAt,
    doneAt: nextDoneAt,
  };
}

function parseAuditStatus(value) {
  const match = String(value || '').match(/(?:^|[；;])\s*status\s*:\s*([^；;]+)/i);
  return match ? match[1].trim() : null;
}

function normalizeComparableDateTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }
  return String(value).trim().replace('T', ' ').replace(/\.\d{3}Z$/, '').slice(0, 19);
}

function parseOperationBodyStatus(detailsJson) {
  try {
    const parsed = JSON.parse(String(detailsJson || ''));
    return parsed?.body?.status === undefined ? null : String(parsed.body.status);
  } catch {
    return null;
  }
}

function dateTimeDistanceSeconds(left, right) {
  const leftTime = Date.parse(`${normalizeComparableDateTime(left).replace(' ', 'T')}Z`);
  const rightTime = Date.parse(`${normalizeComparableDateTime(right).replace(' ', 'T')}Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / 1000;
}

function buildLatestCompletionTransitions(logRows = []) {
  const transitions = new Map();
  logRows.forEach(row => {
    const table = String(row?.target_table || '');
    const businessId = String(row?.business_id || '');
    if (!TASK_COMPLETION_TABLES.includes(table) || !/^\d+$/.test(businessId)) return;
    const beforeStatus = parseAuditStatus(row.status_before);
    const afterStatus = parseAuditStatus(row.status_after);
    if (afterStatus !== 'done' || beforeStatus === 'done') return;

    const completedAt = normalizeComparableDateTime(row.created_at);
    if (!completedAt) return;
    const key = `${table}:${businessId}`;
    const existing = transitions.get(key);
    if (!existing || completedAt > existing.completedAt
        || (completedAt === existing.completedAt && Number(row.id || 0) > existing.logId)) {
      transitions.set(key, {
        table,
        id: Number(businessId),
        completedAt,
        logId: Number(row.id || 0),
      });
    }
  });
  return transitions;
}

function buildCompletionRewriteEvidence(logRows = []) {
  const evidence = new Map();
  logRows.forEach(row => {
    const table = String(row?.target_table || '');
    const businessId = String(row?.business_id || '');
    if (!TASK_COMPLETION_TABLES.includes(table) || !/^\d+$/.test(businessId)) return;
    if (parseAuditStatus(row.status_before) || parseAuditStatus(row.status_after)) return;
    if (parseOperationBodyStatus(row.details_json) !== 'done') return;
    const editedAt = normalizeComparableDateTime(row.created_at);
    if (!editedAt) return;
    const key = `${table}:${businessId}`;
    const rows = evidence.get(key) || [];
    rows.push({ editedAt, logId: Number(row.id || 0) });
    evidence.set(key, rows);
  });
  return evidence;
}

function buildTaskCompletionRepairs({ logRows = [], completedRowsByTable = {} } = {}) {
  const transitions = buildLatestCompletionTransitions(logRows);
  const rewriteEvidence = buildCompletionRewriteEvidence(logRows);
  const repairs = [];
  TASK_COMPLETION_TABLES.forEach(table => {
    (completedRowsByTable[table] || []).forEach(row => {
      const id = Number(row?.id);
      const currentDoneAt = normalizeComparableDateTime(row?.done_at);
      const evidence = transitions.get(`${table}:${id}`);
      if (!Number.isInteger(id) || !currentDoneAt || !evidence) return;
      if (currentDoneAt <= evidence.completedAt) return;
      const matchingEdit = (rewriteEvidence.get(`${table}:${id}`) || [])
        .find(item => dateTimeDistanceSeconds(item.editedAt, currentDoneAt) <= 5);
      if (!matchingEdit) return;
      repairs.push({
        table,
        id,
        currentDoneAt,
        completedAt: evidence.completedAt,
        evidenceLogId: evidence.logId,
        rewriteLogId: matchingEdit.logId,
      });
    });
  });
  return repairs;
}

function getTableColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
  } catch {
    return new Set();
  }
}

function hasColumns(db, table, columns) {
  const available = getTableColumns(db, table);
  return columns.every(column => available.has(column));
}

function applyTaskCompletionRepairMigration({ db, isMysql = false, logger = console.log } = {}) {
  if (!db || !isMysql) return { skipped: true, reason: 'mysql-only', corrections: {} };
  db.exec(`
    CREATE TABLE IF NOT EXISTS relation_migrations (
      migration_key TEXT PRIMARY KEY,
      details_json TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const applied = db.prepare('SELECT migration_key FROM relation_migrations WHERE migration_key = ?')
    .get(TASK_COMPLETION_REPAIR_MIGRATION_KEY);
  if (applied) return { skipped: true, reason: 'already-applied', corrections: {} };

  const migrate = db.transaction(() => {
    const corrections = Object.fromEntries(TASK_COMPLETION_TABLES.map(table => [table, 0]));
    const canReadEvidence = hasColumns(db, 'operation_logs', [
      'id',
      'business_type',
      'business_id',
      'target_table',
      'status_before',
      'status_after',
      'success',
      'details_json',
      'created_at',
    ]);
    const logRows = canReadEvidence ? db.prepare(`
      SELECT id, business_id, target_table, status_before, status_after, details_json, created_at
      FROM operation_logs
      WHERE success = 1
        AND business_type IN ('商务任务', '待跟进任务')
      ORDER BY created_at ASC, id ASC
    `).all() : [];
    const completedRowsByTable = {};
    TASK_COMPLETION_TABLES.forEach(table => {
      completedRowsByTable[table] = hasColumns(db, table, ['id', 'status', 'done_at'])
        ? db.prepare(`SELECT id, done_at FROM ${table} WHERE status = 'done' AND done_at IS NOT NULL`).all()
        : [];
    });

    const repairs = buildTaskCompletionRepairs({ logRows, completedRowsByTable });
    repairs.forEach(repair => {
      const result = db.prepare(`
        UPDATE ${repair.table}
        SET done_at = ?
        WHERE id = ? AND status = 'done' AND done_at = ?
      `).run(repair.completedAt, repair.id, repair.currentDoneAt);
      corrections[repair.table] += Number(result?.changes || 0);
    });

    const details = {
      ...corrections,
      evidence_transitions: buildLatestCompletionTransitions(logRows).size,
      rewrite_evidence: buildCompletionRewriteEvidence(logRows).size,
    };
    db.prepare(`
      INSERT INTO relation_migrations (migration_key, details_json)
      VALUES (?, ?)
    `).run(TASK_COMPLETION_REPAIR_MIGRATION_KEY, JSON.stringify(details));
    return details;
  });

  const corrections = migrate();
  logger(`[startup] task completion repair migration applied ${JSON.stringify(corrections)}`);
  return { skipped: false, corrections };
}

module.exports = {
  TASK_COMPLETION_REPAIR_MIGRATION_KEY,
  applyTaskCompletionRepairMigration,
  buildCompletionRewriteEvidence,
  buildLatestCompletionTransitions,
  buildTaskCompletionRepairs,
  parseAuditStatus,
  resolveTaskLifecycleTimestamps,
};
