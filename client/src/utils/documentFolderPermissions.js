export function canOpenDocumentFolderMenu(node, canManageDocumentFolders) {
  if (!canManageDocumentFolders || node?.nodeType !== 'folder') return false;
  return Boolean(node.canAddChild || node.canEditFolder || node.canDeleteFolder);
}
