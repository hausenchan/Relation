export function getPreparationEditorState(section, hasUnlockedPrivateKey) {
  const canEdit = Boolean(section?.can_edit);
  const hasEncryptedContent = Boolean(section?.content_ciphertext);
  const lacksDecryptGrant = Boolean(hasEncryptedContent && !section?.my_record_key);
  const needsUnlockForExistingContent = Boolean(hasEncryptedContent && !hasUnlockedPrivateKey);

  return {
    canEdit,
    lacksDecryptGrant,
    needsUnlockForExistingContent,
    readOnly: !canEdit || lacksDecryptGrant || needsUnlockForExistingContent,
  };
}

export function getDefaultPreparationSectionKeys(sections = []) {
  const editableKeys = sections
    .filter(section => Boolean(section?.can_edit))
    .map(section => String(section.id));

  if (editableKeys.length) return editableKeys;
  return sections[0]?.id == null ? [] : [String(sections[0].id)];
}
