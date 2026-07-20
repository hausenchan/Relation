import {
  documentBodyToPlain,
  normalizeDocumentBodyValue,
} from './documentBodyBlocks';

export function normalizeGoalDocumentContent(value) {
  if (value && typeof value === 'object') return normalizeDocumentBodyValue(value);
  const raw = String(value || '').trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (Array.isArray(parsed) || Array.isArray(parsed.blocks))) {
        return normalizeDocumentBodyValue(parsed);
      }
    } catch {
      // Legacy HTML and plain text are normalized below.
    }
  }
  return normalizeDocumentBodyValue(value || '');
}

export function serializeGoalDocumentContent(value) {
  return JSON.stringify(normalizeGoalDocumentContent(value));
}

export function goalDocumentContentToPlain(value) {
  return documentBodyToPlain(normalizeGoalDocumentContent(value));
}
