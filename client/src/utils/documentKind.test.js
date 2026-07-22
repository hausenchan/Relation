import { getDocumentKind, isSpreadsheetDocument } from './documentKind';

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
});
