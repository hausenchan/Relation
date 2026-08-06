function normalizePositiveInteger(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function getDocumentFolderAncestorIds(folders = [], folderId) {
  const targetId = normalizePositiveInteger(folderId);
  if (!targetId) return [];
  const folderById = new Map(
    (Array.isArray(folders) ? folders : [])
      .map(folder => [normalizePositiveInteger(folder?.id), folder])
      .filter(([id]) => id)
  );
  const ancestorIds = [];
  const seen = new Set();
  let currentId = targetId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const folder = folderById.get(currentId);
    if (!folder) break;
    ancestorIds.unshift(currentId);
    currentId = normalizePositiveInteger(folder.parent_id);
  }

  return ancestorIds;
}

export function getDocumentTreeLocation(folders = [], document = {}) {
  const folderId = normalizePositiveInteger(document?.folder_id);
  const folder = folderId
    ? (Array.isArray(folders) ? folders : []).find(item => Number(item?.id) === folderId)
    : null;
  const domain = String(document?.domain || folder?.domain || 'all').trim() || 'all';
  const ancestorFolderIds = getDocumentFolderAncestorIds(folders, folderId);

  return {
    domain,
    folderId,
    ancestorFolderIds,
    expandedKeys: [
      ...(domain && domain !== 'all' ? [`domain-${domain}`] : []),
      ...ancestorFolderIds.map(id => `folder-${id}`),
    ],
    documentKey: normalizePositiveInteger(document?.id) ? `document-${Number(document.id)}` : null,
  };
}
