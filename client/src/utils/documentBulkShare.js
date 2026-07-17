function normalizeDocumentId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function appendUnique(target, values = []) {
  const seen = new Set(target);
  values.forEach((value) => {
    const id = normalizeDocumentId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    target.push(id);
  });
  return target;
}

export function buildFolderDocumentSelectionMap(folders = [], documents = []) {
  const folderIds = new Set(folders.map(folder => normalizeDocumentId(folder?.id)).filter(Boolean));
  const childrenByParent = new Map();
  const directByFolder = new Map();

  folders.forEach((folder) => {
    const folderId = normalizeDocumentId(folder?.id);
    if (!folderId) return;
    const parentId = normalizeDocumentId(folder?.parent_id) || 0;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(folderId);
  });

  documents.forEach((document) => {
    const folderId = normalizeDocumentId(document?.folder_id);
    const documentId = normalizeDocumentId(document?.id);
    if (!folderId || !documentId || !folderIds.has(folderId)) return;
    if (!directByFolder.has(folderId)) {
      directByFolder.set(folderId, { documentIds: [], editableDocumentIds: [] });
    }
    const direct = directByFolder.get(folderId);
    appendUnique(direct.documentIds, [documentId]);
    if (Number(document?.can_edit || 0)) appendUnique(direct.editableDocumentIds, [documentId]);
  });

  const result = new Map();
  const collect = (folderId, ancestors = new Set()) => {
    if (result.has(folderId)) return result.get(folderId);
    if (ancestors.has(folderId)) return { documentIds: [], editableDocumentIds: [] };
    const nextAncestors = new Set(ancestors).add(folderId);
    const direct = directByFolder.get(folderId) || { documentIds: [], editableDocumentIds: [] };
    const aggregate = {
      documentIds: [...direct.documentIds],
      editableDocumentIds: [...direct.editableDocumentIds],
    };
    (childrenByParent.get(folderId) || []).forEach((childId) => {
      const child = collect(childId, nextAncestors);
      appendUnique(aggregate.documentIds, child.documentIds);
      appendUnique(aggregate.editableDocumentIds, child.editableDocumentIds);
    });
    result.set(folderId, aggregate);
    return aggregate;
  };

  folderIds.forEach(folderId => collect(folderId));
  return result;
}

export function buildBulkShareTreeCheckState(nodes = [], selectedDocumentIds = []) {
  const selected = new Set(selectedDocumentIds.map(normalizeDocumentId).filter(Boolean));
  const checked = [];
  const halfChecked = [];

  const visit = (node) => {
    (node?.children || []).forEach(visit);
    if (node?.nodeType === 'document') {
      if (selected.has(normalizeDocumentId(node.documentId))) checked.push(node.key);
      return;
    }
    if (node?.nodeType !== 'folder') return;
    const selectableIds = (node.bulkDocumentIds || []).map(normalizeDocumentId).filter(Boolean);
    if (!selectableIds.length) return;
    const selectedCount = selectableIds.filter(id => selected.has(id)).length;
    if (selectedCount === selectableIds.length) checked.push(node.key);
    else if (selectedCount > 0) halfChecked.push(node.key);
  };

  nodes.forEach(visit);
  return { checked, halfChecked };
}

export function updateBulkFolderSelection(selectedDocumentIds = [], folderDocumentIds = [], checked) {
  const selected = new Set(selectedDocumentIds.map(normalizeDocumentId).filter(Boolean));
  folderDocumentIds.map(normalizeDocumentId).filter(Boolean).forEach((id) => {
    if (checked) selected.add(id);
    else selected.delete(id);
  });
  return Array.from(selected);
}

export function chunkBulkDocumentIds(documentIds = [], batchSize = 200) {
  const normalized = Array.from(new Set(documentIds.map(normalizeDocumentId).filter(Boolean)));
  const size = Math.max(1, Number(batchSize) || 200);
  const batches = [];
  for (let index = 0; index < normalized.length; index += size) {
    batches.push(normalized.slice(index, index + size));
  }
  return batches;
}
