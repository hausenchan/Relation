export const COMPOSITION_CONFIRM_ENTER_GUARD_MS = 150;

export function isContentEditableComposing(event, active = false) {
  const nativeEvent = event?.nativeEvent || event;
  return Boolean(
    active
    || event?.isComposing
    || nativeEvent?.isComposing
    || event?.keyCode === 229
    || event?.which === 229
    || nativeEvent?.keyCode === 229
    || nativeEvent?.which === 229
  );
}

export function shouldSuppressEnterAfterComposition(
  event,
  compositionEndedAt,
  now = Date.now(),
) {
  if (event?.key !== 'Enter' || event?.shiftKey || event?.metaKey || event?.ctrlKey || event?.altKey) {
    return false;
  }
  const endedAt = Number(compositionEndedAt);
  const elapsed = Number(now) - endedAt;
  return endedAt > 0 && elapsed >= 0 && elapsed <= COMPOSITION_CONFIRM_ENTER_GUARD_MS;
}

function setContentEditableCaret(selection, container, offset) {
  const range = document.createRange();
  range.setStart(container, Math.max(0, offset));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchContentEditableDeleteInput(editor) {
  const inputEvent = typeof window.InputEvent === 'function'
    ? new window.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })
    : new Event('input', { bubbles: true });
  editor.dispatchEvent(inputEvent);
}

function getPreviousContentEditableLeaf(editor, container, offset) {
  if (container?.nodeType === 1 && offset > 0 && offset <= container.childNodes.length) {
    let current = container.childNodes[offset - 1];
    while (current?.nodeType === 1 && current.childNodes.length) current = current.lastChild;
    return current;
  }
  let current = container;
  while (current && current !== editor) {
    if (current.previousSibling) {
      current = current.previousSibling;
      while (current?.nodeType === 1 && current.childNodes.length) current = current.lastChild;
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function isEmptyContentEditableLine(element) {
  if (!element || !['DIV', 'P'].includes(element.tagName)) return false;
  if (String(element.textContent || '').replace(/\u00a0/g, ' ').trim()) return false;
  return Array.from(element.childNodes).every(node => (
    (node.nodeType === 3 && !String(node.textContent || '').replace(/\u00a0/g, ' ').trim())
    || (node.nodeType === 1 && node.tagName === 'BR')
  ));
}

export function removeContentEditableLineBreakBeforeCaret(
  editor,
  selection = typeof window !== 'undefined' ? window.getSelection?.() : null,
) {
  if (!editor || !selection || !selection.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  let lineElement = range.startContainer.nodeType === 1
    ? range.startContainer
    : range.startContainer.parentElement;
  while (lineElement && lineElement !== editor) {
    if (isEmptyContentEditableLine(lineElement)) {
      const parent = lineElement.parentNode;
      const lineIndex = parent ? Array.prototype.indexOf.call(parent.childNodes, lineElement) : -1;
      const previousSibling = lineIndex > 0 ? parent.childNodes[lineIndex - 1] : null;
      if (!parent || lineIndex <= 0 || !previousSibling) return false;
      parent.removeChild(lineElement);
      const caretRange = document.createRange();
      caretRange.selectNodeContents(previousSibling);
      caretRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(caretRange);
      dispatchContentEditableDeleteInput(editor);
      return true;
    }
    lineElement = lineElement.parentElement;
  }

  let previousLeaf = getPreviousContentEditableLeaf(
    editor,
    range.startContainer,
    range.startOffset,
  );
  while (previousLeaf?.nodeType === 3 && !String(previousLeaf.textContent || '').replace(/\u00a0/g, ' ').trim()) {
    previousLeaf = getPreviousContentEditableLeaf(editor, previousLeaf, 0);
  }
  if (!previousLeaf || previousLeaf.nodeType !== 1 || previousLeaf.tagName !== 'BR') return false;
  const parent = previousLeaf.parentNode;
  const childIndex = parent ? Array.prototype.indexOf.call(parent.childNodes, previousLeaf) : -1;
  if (!parent || childIndex < 0) return false;
  parent.removeChild(previousLeaf);
  setContentEditableCaret(selection, parent, childIndex);
  dispatchContentEditableDeleteInput(editor);
  return true;
}
