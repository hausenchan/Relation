import {
  buildSpreadsheetCollaborationHint,
  getSpreadsheetConflictHintForDocument,
  trackSpreadsheetDocumentDraft,
} from './spreadsheetDocumentDraft';

test('tracks a local spreadsheet draft before React effects run', () => {
  const dirtyDocumentIds = new Set();
  const activeEditorSnapshotRef = {
    current: { doc: { id: 3, content: 'REMOTE' }, selectedBlockId: 'kept' },
  };
  const localDocument = { id: 3, document_kind: 'spreadsheet', content: 'LOCAL' };

  const result = trackSpreadsheetDocumentDraft({
    dirtyDocumentIds,
    activeEditorSnapshotRef,
    docId: 3,
    document: localDocument,
    editorTitle: 'Sheet',
    editorBlocks: [],
    canEdit: true,
    selectedSpreadsheetCell: { sheetId: 'sheet_1', rowIndex: 17, columnIndex: 8 },
  });

  expect(result.dirty).toBe(true);
  expect(dirtyDocumentIds.has(3)).toBe(true);
  expect(activeEditorSnapshotRef.current.doc).toBe(localDocument);
  expect(activeEditorSnapshotRef.current.selectedBlockId).toBe('kept');
  expect(activeEditorSnapshotRef.current.selectedSpreadsheetCell).toEqual({
    sheetId: 'sheet_1',
    rowIndex: 17,
    columnIndex: 8,
  });
});

test('marks a local workbook callback dirty before a saved signature is available', () => {
  const dirtyDocumentIds = new Set();
  const activeEditorSnapshotRef = { current: null };

  const result = trackSpreadsheetDocumentDraft({
    dirtyDocumentIds,
    activeEditorSnapshotRef,
    docId: 3,
    document: { id: 3, content: 'SAME' },
    editorTitle: 'Sheet',
    editorBlocks: [],
    canEdit: true,
    selectedSpreadsheetCell: null,
  });

  expect(result.dirty).toBe(true);
  expect(dirtyDocumentIds.has(3)).toBe(true);
  expect(activeEditorSnapshotRef.current.doc.content).toBe('SAME');
});

test('describes same-cell conflicts and concurrent workbook updates explicitly', () => {
  expect(buildSpreadsheetCollaborationHint({
    updatedByName: '超级管理员',
    hasLocalDirty: true,
    hadConflicts: true,
  })).toBe('检测到超级管理员修改了相同表格位置，已保留你的本地内容并合并其他更新');

  expect(buildSpreadsheetCollaborationHint({
    updatedByName: '超级管理员',
    hasLocalDirty: true,
  })).toBe('检测到超级管理员同时更新表格，已保留你的本地内容并合并其他更新');

  expect(buildSpreadsheetCollaborationHint({ updatedByName: '超级管理员' }))
    .toBe('已同步超级管理员的最新表格修改');
});

test('shows a spreadsheet conflict notice only for its owning document', () => {
  const notice = { docId: 3, text: '检测到相同表格位置冲突' };

  expect(getSpreadsheetConflictHintForDocument(notice, 3)).toBe(notice.text);
  expect(getSpreadsheetConflictHintForDocument(notice, '3')).toBe(notice.text);
  expect(getSpreadsheetConflictHintForDocument(notice, 2)).toBe('');
  expect(getSpreadsheetConflictHintForDocument(null, 3)).toBe('');
});
