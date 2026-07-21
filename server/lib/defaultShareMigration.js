const ALLOWED_CONTENT_ENTITY_TABLES = Object.freeze({
  goal: 'goals',
  weekly_report: 'weekly_reports',
});

function normalizeDefaultUserIds(defaultShares = []) {
  return [...new Set((Array.isArray(defaultShares) ? defaultShares : [])
    .filter(share => share?.target_type === 'user')
    .map(share => Number(share?.target_id))
    .filter(Number.isInteger)
    .filter(id => id > 0))];
}

function initializeLegacyDefaultSharesBulk({
  db,
  defaultShares,
  documentVersion,
  contentVersion,
  contentEntityTables,
}) {
  const userIds = normalizeDefaultUserIds(defaultShares);
  const stats = {
    documentSharesAdded: 0,
    documentsInitialized: 0,
    contentSharesAdded: 0,
    contentEntitiesInitialized: 0,
  };
  if (!userIds.length) return stats;

  const migrate = db.transaction(() => {
    const insertDocumentShare = db.prepare(`
      INSERT INTO document_shares (
        document_id, target_type, target_id, target_key, created_by
      )
      SELECT document_row.id, 'user', ?, NULL, NULL
      FROM documents document_row
      WHERE COALESCE(document_row.default_shares_initialized, 0) < ?
        AND NOT EXISTS (
          SELECT 1
          FROM document_shares existing
          WHERE existing.document_id = document_row.id
            AND existing.target_type = 'user'
            AND existing.target_id = ?
        )
    `);
    userIds.forEach(userId => {
      stats.documentSharesAdded += Number(
        insertDocumentShare.run(userId, documentVersion, userId).changes || 0,
      );
    });
    stats.documentsInitialized = Number(db.prepare(`
      UPDATE documents
      SET default_shares_initialized = ?
      WHERE COALESCE(default_shares_initialized, 0) < ?
    `).run(documentVersion, documentVersion).changes || 0);

    Object.entries(contentEntityTables || {}).forEach(([entityType, table]) => {
      if (ALLOWED_CONTENT_ENTITY_TABLES[entityType] !== table) {
        throw new Error(`Unsupported default-share migration target: ${entityType}:${table}`);
      }
      const insertContentShare = db.prepare(`
        INSERT INTO content_shares (
          entity_type, entity_id, target_type, target_id, target_key, created_by
        )
        SELECT ?, entity_row.id, 'user', ?, NULL, NULL
        FROM ${table} entity_row
        WHERE COALESCE(entity_row.default_shares_initialized, 0) < ?
          AND NOT EXISTS (
            SELECT 1
            FROM content_shares existing
            WHERE existing.entity_type = ?
              AND existing.entity_id = entity_row.id
              AND existing.target_type = 'user'
              AND existing.target_id = ?
          )
      `);
      userIds.forEach(userId => {
        stats.contentSharesAdded += Number(insertContentShare.run(
          entityType,
          userId,
          contentVersion,
          entityType,
          userId,
        ).changes || 0);
      });
      stats.contentEntitiesInitialized += Number(db.prepare(`
        UPDATE ${table}
        SET default_shares_initialized = ?
        WHERE COALESCE(default_shares_initialized, 0) < ?
      `).run(contentVersion, contentVersion).changes || 0);
    });

    return stats;
  });

  return migrate();
}

module.exports = {
  initializeLegacyDefaultSharesBulk,
  normalizeDefaultUserIds,
};
