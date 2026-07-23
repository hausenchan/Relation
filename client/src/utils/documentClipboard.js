const clipboardLineBreakTags = [
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dt',
  'footer',
  'header',
  'h[1-6]',
  'li',
  'main',
  'nav',
  'p',
  'pre',
  'section',
].join('|');

const clipboardLineBreakTagPattern = new RegExp(`</?(?:${clipboardLineBreakTags})\\b[^>]*>`, 'gi');

export function flattenDocumentClipboardHtml(value = '') {
  return String(value || '')
    .replace(/<!--(?:Start|End)Fragment-->/gi, '')
    .replace(/<br\b[^>]*\/?\s*>/gi, '<br>')
    .replace(/<hr\b[^>]*\/?\s*>/gi, '<br>')
    .replace(clipboardLineBreakTagPattern, '<br>')
    .replace(/<\/?(?:ol|ul)\b[^>]*>/gi, '')
    .replace(/(?:\s*<br>\s*){2,}/gi, '<br>')
    .replace(/^(?:\s*<br>\s*)+|(?:\s*<br>\s*)+$/gi, '');
}

export function documentClipboardHasEmbeddedBlocks(value = '') {
  return /<(?:audio|embed|iframe|img|object|table|video)\b/i.test(String(value || ''));
}

export function shouldSkipNestedClipboardListElement(element) {
  const tag = String(element?.tagName || '').toLowerCase();
  if (['li', 'table', 'img'].includes(tag)) return false;
  return Boolean(element?.closest?.('li'));
}
