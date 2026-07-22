const PRESENCE_COLORS = [
  '#1677ff',
  '#389e0d',
  '#d4380d',
  '#7a3eb1',
  '#c41d7f',
  '#006d75',
  '#ad6800',
  '#1d39c4',
];

const MAX_SESSION_ID_LENGTH = 128;
const MAX_SHEET_ID_LENGTH = 128;
const MAX_ROWS = 100000;
const MAX_COLUMNS = 2000;

function collaborationValidationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeDocumentId(value) {
  const documentId = Number(value);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw collaborationValidationError('文档 ID 不合法');
  }
  return documentId;
}

function normalizePresenceSessionId(value) {
  const sessionId = String(value || '').trim();
  if (
    !sessionId
    || sessionId.length > MAX_SESSION_ID_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(sessionId)
  ) {
    throw collaborationValidationError('协作会话 ID 不合法');
  }
  return sessionId;
}

function normalizeSelectionIndex(value, max, label) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= max) {
    throw collaborationValidationError(`${label}不合法`);
  }
  return index;
}

function normalizeSpreadsheetSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw collaborationValidationError('表格选区格式不合法');
  }
  const startRow = normalizeSelectionIndex(value.startRow, MAX_ROWS, '选区起始行');
  const endRow = normalizeSelectionIndex(value.endRow, MAX_ROWS, '选区结束行');
  const startColumn = normalizeSelectionIndex(value.startColumn, MAX_COLUMNS, '选区起始列');
  const endColumn = normalizeSelectionIndex(value.endColumn, MAX_COLUMNS, '选区结束列');
  return {
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startColumn: Math.min(startColumn, endColumn),
    endColumn: Math.max(startColumn, endColumn),
  };
}

function normalizePresencePayload(value = {}) {
  const sessionId = normalizePresenceSessionId(value.session_id);
  const sheetId = String(value.sheet_id || '').trim();
  if (!sheetId || sheetId.length > MAX_SHEET_ID_LENGTH) {
    throw collaborationValidationError('协作工作表 ID 不合法');
  }
  return {
    sessionId,
    sheetId,
    selection: normalizeSpreadsheetSelection(value.selection),
  };
}

function presenceColor(userId, sessionId) {
  const seed = `${userId}:${sessionId}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

function createDocumentCollaborationHub({
  now = () => Date.now(),
  staleAfterMs = 20000,
  maxPresencePerDocument = 50,
} = {}) {
  const presenceByDocument = new Map();
  const listenersByDocument = new Map();

  const getPresenceMap = (documentId, create = false) => {
    const normalizedId = normalizeDocumentId(documentId);
    if (!presenceByDocument.has(normalizedId) && create) {
      presenceByDocument.set(normalizedId, new Map());
    }
    return presenceByDocument.get(normalizedId) || null;
  };

  const publish = (documentId, event) => {
    const normalizedId = normalizeDocumentId(documentId);
    const listeners = listenersByDocument.get(normalizedId);
    if (!listeners?.size) return;
    [...listeners].forEach(listener => {
      try {
        listener(event);
      } catch {
        listeners.delete(listener);
      }
    });
    if (!listeners.size) listenersByDocument.delete(normalizedId);
  };

  const prunePresence = (documentId) => {
    const normalizedId = normalizeDocumentId(documentId);
    const presenceMap = getPresenceMap(normalizedId);
    if (!presenceMap) return false;
    const cutoff = now() - staleAfterMs;
    let changed = false;
    presenceMap.forEach((entry, key) => {
      if (entry.lastSeenMs >= cutoff) return;
      presenceMap.delete(key);
      changed = true;
    });
    if (!presenceMap.size) presenceByDocument.delete(normalizedId);
    return changed;
  };

  const listPresence = (documentId) => {
    const normalizedId = normalizeDocumentId(documentId);
    prunePresence(normalizedId);
    const presenceMap = getPresenceMap(normalizedId);
    if (!presenceMap) return [];
    return [...presenceMap.values()]
      .sort((left, right) => left.userName.localeCompare(right.userName, 'zh-CN') || left.sessionId.localeCompare(right.sessionId))
      .map(entry => ({
        session_id: entry.sessionId,
        user_id: entry.userId,
        user_name: entry.userName,
        color: entry.color,
        sheet_id: entry.sheetId,
        selection: { ...entry.selection },
        last_seen_at: new Date(entry.lastSeenMs).toISOString(),
      }));
  };

  const publishPresence = (documentId) => {
    const normalizedId = normalizeDocumentId(documentId);
    publish(normalizedId, {
      type: 'presence',
      document_id: normalizedId,
      collaborators: listPresence(normalizedId),
    });
  };

  const updatePresence = (documentId, user, value) => {
    const normalizedId = normalizeDocumentId(documentId);
    const userId = Number(user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw collaborationValidationError('协作用户不合法', 401);
    }
    const payload = normalizePresencePayload(value);
    prunePresence(normalizedId);
    const presenceMap = getPresenceMap(normalizedId, true);
    const presenceKey = `${userId}:${payload.sessionId}`;
    if (!presenceMap.has(presenceKey) && presenceMap.size >= maxPresencePerDocument) {
      throw collaborationValidationError('当前文档在线协作者过多，请稍后重试', 429);
    }
    presenceMap.set(presenceKey, {
      sessionId: payload.sessionId,
      userId,
      userName: String(user.display_name || user.name || user.username || `用户${userId}`).trim().slice(0, 80),
      color: presenceColor(userId, payload.sessionId),
      sheetId: payload.sheetId,
      selection: payload.selection,
      lastSeenMs: now(),
    });
    publishPresence(normalizedId);
    return listPresence(normalizedId);
  };

  const removePresence = (documentId, userId, sessionIdValue) => {
    const normalizedId = normalizeDocumentId(documentId);
    const normalizedUserId = Number(userId);
    const sessionId = normalizePresenceSessionId(sessionIdValue);
    const presenceMap = getPresenceMap(normalizedId);
    if (!presenceMap) return false;
    const removed = presenceMap.delete(`${normalizedUserId}:${sessionId}`);
    if (!presenceMap.size) presenceByDocument.delete(normalizedId);
    if (removed) publishPresence(normalizedId);
    return removed;
  };

  const subscribe = (documentId, listener) => {
    const normalizedId = normalizeDocumentId(documentId);
    if (typeof listener !== 'function') throw collaborationValidationError('协作订阅回调不合法');
    if (!listenersByDocument.has(normalizedId)) listenersByDocument.set(normalizedId, new Set());
    listenersByDocument.get(normalizedId).add(listener);
    return () => {
      const listeners = listenersByDocument.get(normalizedId);
      listeners?.delete(listener);
      if (!listeners?.size) listenersByDocument.delete(normalizedId);
    };
  };

  const publishDocumentUpdated = (documentId, value = {}) => {
    const normalizedId = normalizeDocumentId(documentId);
    publish(normalizedId, {
      type: 'document_updated',
      document_id: normalizedId,
      updated_at: value.updated_at || null,
      updated_by: value.updated_by || null,
      updated_by_name: value.updated_by_name || null,
      action_type: value.action_type || 'content_update',
    });
  };

  return {
    listPresence,
    prunePresence,
    publishDocumentUpdated,
    publishPresence,
    removePresence,
    subscribe,
    updatePresence,
  };
}

module.exports = {
  createDocumentCollaborationHub,
  normalizePresencePayload,
  normalizePresenceSessionId,
  normalizeSpreadsheetSelection,
};
