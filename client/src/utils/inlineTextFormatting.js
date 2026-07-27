const INLINE_FORMAT_CONFLICT_PROPERTIES = Object.freeze({
  bold: ['font', 'font-weight'],
  italic: ['font', 'font-style'],
  underline: ['text-decoration', 'text-decoration-line'],
  strike: ['text-decoration', 'text-decoration-line'],
  code: ['font', 'font-family'],
  color: ['color'],
});

export function getInlineFormatConflictProperties(format) {
  return [...(INLINE_FORMAT_CONFLICT_PROPERTIES[format] || [])];
}

export function clearInlineStyleProperties(root, properties = []) {
  if (!root?.querySelectorAll || !properties.length) return;
  root.querySelectorAll('[style]').forEach(element => {
    properties.forEach(property => element.style.removeProperty(property));
    if (!String(element.getAttribute('style') || '').trim()) element.removeAttribute('style');
  });
}

export function wrapInlineRangeContents(range, wrapper, { format, clearProperties } = {}) {
  if (!range || range.collapsed || !wrapper) return null;
  const fragment = range.extractContents();
  clearInlineStyleProperties(
    fragment,
    clearProperties || getInlineFormatConflictProperties(format),
  );
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);
  return wrapper;
}
