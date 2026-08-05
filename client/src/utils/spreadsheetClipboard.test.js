import {
  RELATION_SPREADSHEET_CLIPBOARD_MIME,
  applySpreadsheetClipboardPayload,
  buildSpreadsheetClipboardPayload,
  parseSpreadsheetClipboardData,
  parseSpreadsheetHtmlClipboard,
  spreadsheetClipboardPayloadToHtml,
  spreadsheetClipboardPayloadToText,
} from './spreadsheetClipboard';
import { createDefaultSpreadsheetWorkbook } from './spreadsheetWorkbook';

function clipboardData(values) {
  return { getData: type => values[type] || '', types: Object.keys(values) };
}

test('round-trips Relation cells, formulas, styles, HTML, and TSV clipboard formats', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const sheet = workbook.sheets[0];
  sheet.cells = {
    A1: { v: '10', style: { bold: true } },
    B1: { v: '=A1*2', style: { backgroundColor: '#dbeafe' } },
  };
  sheet.mergedCells = [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }];
  sheet.conditionalFormats = [{
    id: 'condition-source',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 },
    type: 'greater_than',
    values: ['5'],
    style: { color: '#dc2626' },
    enabled: true,
  }];
  sheet.dataValidations = [{
    id: 'validation-source',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    type: 'number',
    min: 0,
    invalidAction: 'reject',
    enabled: true,
  }];
  const payload = buildSpreadsheetClipboardPayload(sheet, {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 1,
  });
  expect(spreadsheetClipboardPayloadToText(payload, [['10', 20]])).toBe('10\t20');
  expect(spreadsheetClipboardPayloadToHtml(payload, [['10', 20]])).toContain('data-formula="=A1*2"');

  const parsed = parseSpreadsheetClipboardData(clipboardData({
    [RELATION_SPREADSHEET_CLIPBOARD_MIME]: JSON.stringify(payload),
  }));
  expect(parsed.source).toBe('relation');
  expect(parsed.payload.cells[0][1]).toEqual({ v: '=A1*2', style: { backgroundColor: '#dbeafe' } });
  expect(parsed.payload.mergedCells).toEqual([{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }]);

  applySpreadsheetClipboardPayload(sheet, parsed.payload, 2, 2);
  expect(sheet.cells.C3).toEqual({ v: '10', style: { bold: true } });
  expect(sheet.cells.D3).toEqual({ v: '=C3*2', style: { backgroundColor: '#dbeafe' } });
  expect(sheet.mergedCells).toContainEqual({ startRow: 2, endRow: 2, startColumn: 2, endColumn: 3 });
  expect(sheet.conditionalFormats).toContainEqual(expect.objectContaining({
    id: 'condition-source_copy',
    range: { startRow: 2, endRow: 2, startColumn: 2, endColumn: 3 },
  }));
  expect(sheet.dataValidations).toContainEqual(expect.objectContaining({
    id: 'validation-source_copy',
    range: { startRow: 2, endRow: 2, startColumn: 2, endColumn: 2 },
  }));
});

test('reads formulas and basic styles from Shimo-like HTML when metadata is exposed', () => {
  const result = parseSpreadsheetHtmlClipboard(`
    <html><body data-source="shimo"><table><tbody><tr>
      <td style="font-weight:700">1658.46</td>
      <td data-formula="=P4/T4" style="background-color:#dbeafe">2.09</td>
    </tr></tbody></table></body></html>
  `);
  expect(result.hasFormulaMetadata).toBe(true);
  expect(result.sourceLooksLikeShimo).toBe(true);
  expect(result.payload.cells[0][0]).toMatchObject({ v: '1658.46', style: { bold: true } });
  expect(result.payload.cells[0][1]).toMatchObject({ v: '=P4/T4' });
});

test('reads nested Shimo formula metadata and preserves the copied source range', () => {
  const result = parseSpreadsheetHtmlClipboard(`
    <html><body data-source="shimo"><table data-copy-range="F6:G7"><tbody>
      <tr><td data-cell-meta='{"formula":"=F6+F7"}'>5</td><td>6</td></tr>
      <tr><td>7</td><td><span data-shimo-formula="='飞猪-海韵'!Q18">10</span></td></tr>
    </tbody></table></body></html>
  `);
  expect(result.hasFormulaMetadata).toBe(true);
  expect(result.payload.sourceRange).toEqual({
    startRow: 5, endRow: 6, startColumn: 5, endColumn: 6,
  });
  expect(result.payload.cells[0][0]).toMatchObject({ v: '=F6+F7' });
  expect(result.payload.cells[1][1]).toMatchObject({ v: "='飞猪-海韵'!Q18" });
});

test('merges formulas from plain text when interoperable HTML only contains display values', () => {
  const parsed = parseSpreadsheetClipboardData(clipboardData({
    'text/html': '<table><tr><td>10</td><td>30</td></tr></table>',
    'text/plain': "10\t='飞猪-海韵'!Q18+'小德果园-海韵'!R18",
  }));
  expect(parsed.source).toBe('html');
  expect(parsed.hasFormulaMetadata).toBe(true);
  expect(parsed.payload.cells[0][1].v).toBe("='飞猪-海韵'!Q18+'小德果园-海韵'!R18");
});

test('uses raw numeric text instead of grouped HTML display values', () => {
  const parsed = parseSpreadsheetClipboardData(clipboardData({
    'text/html': '<table><tr><td>5,107</td><td>-12,345.67</td></tr></table>',
    'text/plain': '5107\t-12345.67',
  }));
  expect(parsed.source).toBe('html');
  expect(parsed.payload.cells[0]).toEqual([{ v: '5107' }, { v: '-12345.67' }]);
});

test('normalizes strict grouped numeric displays without changing comma text or identifiers', () => {
  const parsed = parseSpreadsheetHtmlClipboard(`
    <table><tr>
      <td>5,107</td><td>北京,上海</td><td>1,23</td><td>001,234</td><td>=SUM(A1,B1)</td>
    </tr></table>
  `);
  expect(parsed.payload.cells[0]).toEqual([
    { v: '5107' },
    { v: '北京,上海' },
    { v: '1,23' },
    { v: '001,234' },
    { v: '=SUM(A1,B1)' },
  ]);
});

test('reads formula cells from a structured Shimo clipboard MIME payload', () => {
  const parsed = parseSpreadsheetClipboardData(clipboardData({
    'application/x-shimo-spreadsheet': JSON.stringify({
      cells: [[
        { displayValue: '10' },
        { displayValue: '30', formula: '=A1*3' },
      ]],
    }),
  }));
  expect(parsed.source).toBe('structured');
  expect(parsed.sourceLooksLikeShimo).toBe(true);
  expect(parsed.hasFormulaMetadata).toBe(true);
  expect(parsed.payload.cells[0][1].v).toBe('=A1*3');
});

test('prefers structured raw values and normalizes display-only grouped numbers', () => {
  const parsed = parseSpreadsheetClipboardData(clipboardData({
    'application/x-shimo-spreadsheet': JSON.stringify({
      cells: [[
        { value: '5107', displayValue: '5,107' },
        { displayValue: '6,108' },
        { displayValue: '渠道A,渠道B' },
      ]],
    }),
  }));
  expect(parsed.payload.cells[0]).toEqual([
    { v: '5107' },
    { v: '6108' },
    { v: '渠道A,渠道B' },
  ]);
});

test('falls back to a text matrix when HTML and Relation data are absent', () => {
  const parsed = parseSpreadsheetClipboardData(clipboardData({
    'text/plain': '甲\t乙\n1\t2',
  }));
  expect(parsed.source).toBe('text');
  expect(parsed.payload.cells).toEqual([
    [{ v: '甲' }, { v: '乙' }],
    [{ v: '1' }, { v: '2' }],
  ]);
});
