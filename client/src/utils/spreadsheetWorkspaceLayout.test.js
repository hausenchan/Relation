import {
  getSpreadsheetWorkspaceChromeState,
  resolveSpreadsheetContextAutoCollapsed,
  SPREADSHEET_CONTEXT_COLLAPSE_SCROLL_TOP,
  SPREADSHEET_CONTEXT_EXPAND_SCROLL_TOP,
  SPREADSHEET_CONTEXT_MIN_SCROLL_RANGE,
} from './spreadsheetWorkspaceLayout';

test('collapses spreadsheet context only after meaningful vertical grid scrolling', () => {
  const scrollHeight = 800;
  const clientHeight = scrollHeight - SPREADSHEET_CONTEXT_MIN_SCROLL_RANGE;

  expect(resolveSpreadsheetContextAutoCollapsed(false, {
    scrollTop: SPREADSHEET_CONTEXT_COLLAPSE_SCROLL_TOP - 1,
    scrollHeight,
    clientHeight,
  })).toBe(false);
  expect(resolveSpreadsheetContextAutoCollapsed(false, {
    scrollTop: SPREADSHEET_CONTEXT_COLLAPSE_SCROLL_TOP,
    scrollHeight,
    clientHeight,
  })).toBe(true);
  expect(resolveSpreadsheetContextAutoCollapsed(false, {
    scrollTop: SPREADSHEET_CONTEXT_COLLAPSE_SCROLL_TOP,
    scrollHeight: clientHeight + SPREADSHEET_CONTEXT_MIN_SCROLL_RANGE - 1,
    clientHeight,
  })).toBe(false);
});

test('keeps collapsed context stable until the grid returns to its top edge', () => {
  expect(resolveSpreadsheetContextAutoCollapsed(true, {
    scrollTop: SPREADSHEET_CONTEXT_EXPAND_SCROLL_TOP + 1,
  })).toBe(true);
  expect(resolveSpreadsheetContextAutoCollapsed(true, {
    scrollTop: SPREADSHEET_CONTEXT_EXPAND_SCROLL_TOP,
  })).toBe(false);
});

test('manual focus mode collapses context and menu independently from scrolling', () => {
  expect(getSpreadsheetWorkspaceChromeState()).toEqual({
    contextCollapsed: false,
    menuCollapsed: false,
  });
  expect(getSpreadsheetWorkspaceChromeState({ autoCollapsed: true })).toEqual({
    contextCollapsed: true,
    menuCollapsed: false,
  });
  expect(getSpreadsheetWorkspaceChromeState({ focusMode: true })).toEqual({
    contextCollapsed: true,
    menuCollapsed: true,
  });
});
