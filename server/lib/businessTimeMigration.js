const BUSINESS_TIME_MIGRATION_KEY = 'business-time-explicit-utc-to-local-v1';
const MIN_EVIDENCE_OFFSET_MINUTES = 7 * 60;
const MAX_EVIDENCE_OFFSET_MINUTES = 9 * 60;

function getTableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
}

function hasColumns(db, table, columns) {
  const available = getTableColumns(db, table);
  return columns.every(column => available.has(column));
}

function runCorrection(db, name, sql, corrections) {
  const result = db.prepare(sql).run();
  corrections[name] = Number(result?.changes || 0);
}

function applyBusinessTimeMigration({ db, isMysql = false, logger = console.log } = {}) {
  if (!db || !isMysql) return { skipped: true, reason: 'mysql-only', corrections: {} };
  db.exec(`
    CREATE TABLE IF NOT EXISTS relation_migrations (
      migration_key TEXT PRIMARY KEY,
      details_json TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const applied = db.prepare('SELECT migration_key FROM relation_migrations WHERE migration_key = ?')
    .get(BUSINESS_TIME_MIGRATION_KEY);
  if (applied) return { skipped: true, reason: 'already-applied', corrections: {} };

  const corrections = {};
  const migrate = db.transaction(() => {
    if (hasColumns(db, 'documents', ['id', 'updated_at'])
        && hasColumns(db, 'document_edit_records', ['document_id', 'edited_at', 'created_at'])) {
      runCorrection(db, 'documents', `
        UPDATE documents target
        INNER JOIN (
          SELECT document_id AS target_id, MAX(COALESCE(edited_at, created_at)) AS evidence_at
          FROM document_edit_records
          GROUP BY document_id
        ) evidence ON evidence.target_id = target.id
        SET target.updated_at = evidence.evidence_at
        WHERE TIMESTAMPDIFF(MINUTE, target.updated_at, evidence.evidence_at)
          BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
      `, corrections);
    }

    if (hasColumns(db, 'media_assets', ['id', 'updated_at'])
        && hasColumns(db, 'operation_logs', ['business_id', 'target_table', 'success', 'created_at'])) {
      runCorrection(db, 'media_assets', `
        UPDATE media_assets target
        INNER JOIN (
          SELECT CAST(business_id AS UNSIGNED) AS target_id, MAX(created_at) AS evidence_at
          FROM operation_logs
          WHERE target_table = 'media_assets' AND success = 1
            AND business_id REGEXP '^[0-9]+$'
          GROUP BY CAST(business_id AS UNSIGNED)
        ) evidence ON evidence.target_id = target.id
        SET target.updated_at = evidence.evidence_at
        WHERE TIMESTAMPDIFF(MINUTE, target.updated_at, evidence.evidence_at)
          BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
      `, corrections);
    }

    if (hasColumns(db, 'operation_logs', ['business_id', 'target_table', 'status_after', 'success', 'created_at'])) {
      [
        { table: 'tasks', field: 'started_at', status: 'in_progress' },
        { table: 'tasks', field: 'done_at', status: 'done' },
        { table: 'follow_up_tasks', field: 'started_at', status: 'in_progress' },
        { table: 'follow_up_tasks', field: 'done_at', status: 'done' },
      ].forEach(target => {
        if (!hasColumns(db, target.table, ['id', target.field])) return;
        runCorrection(db, `${target.table}.${target.field}`, `
          UPDATE ${target.table} target
          INNER JOIN (
            SELECT CAST(business_id AS UNSIGNED) AS target_id, MAX(created_at) AS evidence_at
            FROM operation_logs
            WHERE target_table = '${target.table}' AND status_after = '${target.status}'
              AND success = 1 AND business_id REGEXP '^[0-9]+$'
            GROUP BY CAST(business_id AS UNSIGNED)
          ) evidence ON evidence.target_id = target.id
          SET target.${target.field} = evidence.evidence_at
          WHERE TIMESTAMPDIFF(MINUTE, target.${target.field}, evidence.evidence_at)
            BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
        `, corrections);
      });
    }

    if (hasColumns(db, 'content_revisions', ['entity_type', 'entity_id', 'scope_key', 'created_at'])) {
      const revisionTargets = [
        { name: 'goals', table: 'goals', entityType: 'goal', id: 'target.id', scope: "'main'" },
        { name: 'weekly_reports', table: 'weekly_reports', entityType: 'weekly_report', id: 'target.id', scope: "'main'" },
        { name: 'operational_meetings', table: 'operational_meetings', entityType: 'operational_meeting', id: 'target.id', scope: null },
        { name: 'operational_meeting_agendas', table: 'operational_meeting_agendas', entityType: 'operational_meeting', id: 'target.meeting_id', scope: "'agenda'" },
        { name: 'operational_meeting_decisions', table: 'operational_meeting_decisions', entityType: 'operational_meeting', id: 'target.meeting_id', scope: "'decision'" },
      ];
      revisionTargets.forEach(target => {
        if (!hasColumns(db, target.table, ['updated_at', ...(target.id.includes('meeting_id') ? ['meeting_id'] : ['id'])])) return;
        const scopeFilter = target.scope ? `AND scope_key = ${target.scope}` : '';
        runCorrection(db, target.name, `
          UPDATE ${target.table} target
          INNER JOIN (
            SELECT entity_id, MAX(created_at) AS evidence_at
            FROM content_revisions
            WHERE entity_type = '${target.entityType}' ${scopeFilter}
            GROUP BY entity_id
          ) evidence ON evidence.entity_id = ${target.id}
          SET target.updated_at = evidence.evidence_at
          WHERE TIMESTAMPDIFF(MINUTE, target.updated_at, evidence.evidence_at)
            BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
        `, corrections);
      });

      if (hasColumns(db, 'operational_meeting_sections', ['id', 'updated_at'])) {
        runCorrection(db, 'operational_meeting_sections', `
          UPDATE operational_meeting_sections target
          INNER JOIN (
            SELECT CAST(SUBSTRING(scope_key, 9) AS UNSIGNED) AS target_id,
              MAX(created_at) AS evidence_at
            FROM content_revisions
            WHERE entity_type = 'operational_meeting'
              AND scope_key REGEXP '^section:[0-9]+$'
            GROUP BY CAST(SUBSTRING(scope_key, 9) AS UNSIGNED)
          ) evidence ON evidence.target_id = target.id
          SET target.updated_at = evidence.evidence_at
          WHERE TIMESTAMPDIFF(MINUTE, target.updated_at, evidence.evidence_at)
            BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
        `, corrections);
      }
    }

    if (hasColumns(db, 'document_change_logs', ['changed_at', 'created_at'])) {
      runCorrection(db, 'document_change_logs', `
        UPDATE document_change_logs
        SET changed_at = created_at
        WHERE TIMESTAMPDIFF(MINUTE, changed_at, created_at)
          BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
      `, corrections);
    }

    if (hasColumns(db, 'mobile_task_records', ['collected_at', 'created_at'])) {
      runCorrection(db, 'mobile_task_records.collected_at', `
        UPDATE mobile_task_records
        SET collected_at = created_at
        WHERE TIMESTAMPDIFF(MINUTE, collected_at, created_at)
          BETWEEN ${MIN_EVIDENCE_OFFSET_MINUTES} AND ${MAX_EVIDENCE_OFFSET_MINUTES}
      `, corrections);
    }

    db.prepare(`
      INSERT INTO relation_migrations (migration_key, details_json)
      VALUES (?, ?)
    `).run(BUSINESS_TIME_MIGRATION_KEY, JSON.stringify(corrections));
  });
  migrate();
  logger(`[startup] business time migration applied ${JSON.stringify(corrections)}`);
  return { skipped: false, corrections };
}

module.exports = {
  BUSINESS_TIME_MIGRATION_KEY,
  MAX_EVIDENCE_OFFSET_MINUTES,
  MIN_EVIDENCE_OFFSET_MINUTES,
  applyBusinessTimeMigration,
};
