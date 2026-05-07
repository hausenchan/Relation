import React, { useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ol', 'ul', 'li'];
const ALLOWED_ATTR = ['style'];

const sanitizeOptions = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'img', 'video', 'audio', 'a'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'href', 'src', 'srcset'],
};

if (typeof window !== 'undefined' && DOMPurify.addHook) {
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      const safe = String(data.attrValue || '')
        .split(';')
        .map(s => s.trim())
        .filter(s => /^(color|background-color|font-size|font-weight)\s*:\s*[^;]+$/i.test(s))
        .join('; ');
      data.attrValue = safe;
      if (!safe) data.keepAttr = false;
    }
  });
}

export function sanitizeRichText(html) {
  if (html == null) return '';
  return DOMPurify.sanitize(String(html), sanitizeOptions);
}

const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;

export function normalizeRichText(value) {
  if (value == null || value === '') return '';
  const s = String(value);
  if (HTML_TAG_RE.test(s)) return s;
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
}

export function richTextToPlain(value) {
  if (!value) return '';
  if (typeof document === 'undefined') return String(value).replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = sanitizeRichText(value);
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

const DEFAULT_TOOLBAR = [
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

export function RichTextEditor({ value, onChange, placeholder, minHeight = 140, readOnly = false }) {
  const modules = useMemo(() => ({
    toolbar: DEFAULT_TOOLBAR,
    history: { delay: 800, maxStack: 100, userOnly: true },
  }), []);

  const formats = useMemo(() => [
    'size', 'bold', 'italic', 'underline', 'color', 'background', 'list',
  ], []);

  return (
    <div className="rich-text-editor" style={{ background: '#fff' }}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ minHeight }}
      />
      <style>{`
        .rich-text-editor .ql-container { min-height: ${minHeight}px; font-size: 14px; }
        .rich-text-editor .ql-editor { min-height: ${minHeight}px; }
      `}</style>
    </div>
  );
}

export function RichTextView({ value, style, className }) {
  const html = useMemo(() => sanitizeRichText(normalizeRichText(value)), [value]);
  if (!html) return <span style={{ color: '#bfbfbf' }}>-</span>;
  return (
    <div
      className={className}
      style={{ wordBreak: 'break-word', ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default RichTextEditor;
