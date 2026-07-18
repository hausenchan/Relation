export function getPreparationEditorState(section) {
  const canEdit = Boolean(section?.can_edit);

  return {
    canEdit,
    readOnly: !canEdit,
  };
}

export function getDefaultPreparationSectionKeys(sections = []) {
  const editableKeys = sections
    .filter(section => Boolean(section?.can_edit))
    .map(section => String(section.id));

  if (editableKeys.length) return editableKeys;
  return sections[0]?.id == null ? [] : [String(sections[0].id)];
}
