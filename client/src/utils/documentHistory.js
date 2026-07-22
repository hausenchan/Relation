export async function loadFreshDocumentHistoryDetail({
  documentId,
  savePendingChanges,
  loadDocument,
}) {
  const normalizedId = Number(documentId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
  if (typeof savePendingChanges === 'function') await savePendingChanges();
  if (typeof loadDocument !== 'function') return null;
  const detail = await loadDocument(normalizedId);
  return Number(detail?.id) === normalizedId ? detail : null;
}
