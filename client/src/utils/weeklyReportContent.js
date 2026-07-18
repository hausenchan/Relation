import {
  documentBodyHasContent,
  documentBodyToPlain,
  normalizeDocumentBodyValue,
} from './documentBodyBlocks';

export function normalizeWeeklyReportContent(value) {
  if (value && typeof value === 'object') return normalizeDocumentBodyValue(value);
  const raw = String(value || '').trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (Array.isArray(parsed) || Array.isArray(parsed.blocks))) {
        return normalizeDocumentBodyValue(parsed);
      }
    } catch {}
  }
  return normalizeDocumentBodyValue(value || '');
}

export function serializeWeeklyReportContent(value) {
  return JSON.stringify(normalizeWeeklyReportContent(value));
}

export function weeklyReportContentToPlain(value) {
  return documentBodyToPlain(normalizeWeeklyReportContent(value));
}

export function weeklyReportContentHasValue(value) {
  return documentBodyHasContent(normalizeWeeklyReportContent(value));
}

export function getWeeklyReportDraftSignature(values = {}) {
  const range = Array.isArray(values.week_range) ? values.week_range : [];
  const dateText = value => value?.format?.('YYYY-MM-DD') || String(value || '');
  return JSON.stringify({
    user_id: Number(values.user_id) || null,
    week_start: dateText(range[0]),
    week_end: dateText(range[1]),
    completed: serializeWeeklyReportContent(values.completed),
    next_week_plan: serializeWeeklyReportContent(values.next_week_plan),
    risks: serializeWeeklyReportContent(values.risks),
  });
}
