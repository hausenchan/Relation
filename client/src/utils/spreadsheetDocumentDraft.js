export function trackSpreadsheetDocumentDraft({
  dirtyDocumentIds,
  activeEditorSnapshotRef,
  docId,
  document,
  editorTitle,
  editorBlocks,
  canEdit,
  selectedSpreadsheetCell,
}) {
  dirtyDocumentIds.add(docId);

  const snapshot = {
    ...(activeEditorSnapshotRef.current || {}),
    doc: document,
    editorTitle,
    editorBlocks,
    canEdit,
    selectedSpreadsheetCell,
  };
  activeEditorSnapshotRef.current = snapshot;
  return { dirty: true, snapshot };
}

export function buildSpreadsheetCollaborationHint({
  updatedByName,
  hasLocalDirty = false,
  hadConflicts = false,
}) {
  const collaborator = updatedByName || '协作者';
  if (hadConflicts) {
    return `检测到${collaborator}修改了相同表格位置，已保留你的本地内容并合并其他更新`;
  }
  if (hasLocalDirty) {
    return `检测到${collaborator}同时更新表格，已保留你的本地内容并合并其他更新`;
  }
  return `已同步${collaborator}的最新表格修改`;
}

export function getSpreadsheetConflictHintForDocument(notice, docId) {
  if (!notice?.text || String(notice.docId) !== String(docId)) return '';
  return notice.text;
}
