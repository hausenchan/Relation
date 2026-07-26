export function splitContentEditableAtSelection(editor, selection) {
  const activeSelection = selection
    || (typeof window !== 'undefined' ? window.getSelection?.() : null);
  const html = String(editor?.innerHTML || '');
  const textLength = String(editor?.textContent || '').length;
  if (!editor || !activeSelection || activeSelection.rangeCount === 0) {
    return { leftHtml: html, rightHtml: '', start: textLength, end: textLength };
  }

  const range = activeSelection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return { leftHtml: html, rightHtml: '', start: textLength, end: textLength };
  }

  const leftRange = document.createRange();
  leftRange.selectNodeContents(editor);
  leftRange.setEnd(range.startContainer, range.startOffset);
  const rightRange = document.createRange();
  rightRange.selectNodeContents(editor);
  rightRange.setStart(range.endContainer, range.endOffset);

  const container = document.createElement('div');
  const getFragmentHtml = (fragment) => {
    container.replaceChildren(fragment);
    Array.from(container.querySelectorAll('*')).reverse().forEach((node) => {
      if (!node.textContent && !node.querySelector('br')) node.remove();
    });
    return container.innerHTML;
  };
  const leftHtml = getFragmentHtml(leftRange.cloneContents());
  const rightHtml = getFragmentHtml(rightRange.cloneContents());

  const start = leftRange.toString().length;
  const end = start + range.toString().length;
  return {
    leftHtml,
    rightHtml,
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}
