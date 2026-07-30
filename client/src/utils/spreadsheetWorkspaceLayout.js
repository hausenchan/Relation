export const SPREADSHEET_CONTEXT_COLLAPSE_SCROLL_TOP = 16;
export const SPREADSHEET_CONTEXT_EXPAND_SCROLL_TOP = 2;
export const SPREADSHEET_CONTEXT_MIN_SCROLL_RANGE = 96;

function normalizeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function resolveSpreadsheetContextAutoCollapsed(currentCollapsed, metrics = {}) {
  const scrollTop = normalizeMetric(metrics.scrollTop);
  if (currentCollapsed) return scrollTop > SPREADSHEET_CONTEXT_EXPAND_SCROLL_TOP;

  const scrollRange = Math.max(
    0,
    normalizeMetric(metrics.scrollHeight) - normalizeMetric(metrics.clientHeight),
  );
  return scrollTop >= SPREADSHEET_CONTEXT_COLLAPSE_SCROLL_TOP
    && scrollRange >= SPREADSHEET_CONTEXT_MIN_SCROLL_RANGE;
}

export function getSpreadsheetWorkspaceChromeState({ autoCollapsed = false, focusMode = false } = {}) {
  return {
    contextCollapsed: Boolean(autoCollapsed || focusMode),
    menuCollapsed: Boolean(focusMode),
  };
}
