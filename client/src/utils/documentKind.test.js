import { getDocumentKind, isSpreadsheetDocument, shouldHandleDocumentUndoShortcut } from './documentKind';

describe('document kind', () => {
  test('treats empty and legacy documents as rich text', () => {
    expect(getDocumentKind()).toBe('rich_text');
    expect(isSpreadsheetDocument(null)).toBe(false);
    expect(isSpreadsheetDocument({})).toBe(false);
  });

  test('recognizes spreadsheet documents only from document_kind', () => {
    expect(isSpreadsheetDocument({ document_kind: 'spreadsheet' })).toBe(true);
    expect(isSpreadsheetDocument({ doc_type: 'spreadsheet' })).toBe(false);
  });

  test('keeps the rich-text undo shortcut away from spreadsheet workbooks', () => {
    expect(shouldHandleDocumentUndoShortcut({ id: 1, document_kind: 'rich_text' })).toBe(true);
    expect(shouldHandleDocumentUndoShortcut({ id: 2, document_kind: 'spreadsheet' })).toBe(false);
    expect(shouldHandleDocumentUndoShortcut({ document_kind: 'rich_text' })).toBe(false);
  });
});
