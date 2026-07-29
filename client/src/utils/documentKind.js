export function getDocumentKind(value) {
  return String(value || '').trim() === 'spreadsheet' ? 'spreadsheet' : 'rich_text';
}

export function isSpreadsheetDocument(document) {
  return getDocumentKind(document?.document_kind) === 'spreadsheet';
}

export function shouldHandleDocumentUndoShortcut(document) {
  return Boolean(document?.id) && !isSpreadsheetDocument(document);
}
