import {
  RELATION_SPREADSHEET_CLIPBOARD_MIME,
  applySpreadsheetClipboardPayload,
  buildSpreadsheetClipboardPayload,
  parseSpreadsheetClipboardData,
  parseSpreadsheetHtmlClipboard,
  resolveExternalSpreadsheetClipboardFormulas,
  spreadsheetClipboardPayloadToHtml,
  spreadsheetClipboardPayloadToText,
} from './spreadsheetClipboard';
import { createDefaultSpreadsheetWorkbook, createSpreadsheetFormulaEvaluator } from './spreadsheetWorkbook';

function clipboardData(values) {
  return { getData: type => values[type] || '' };
}

test('round-trips Relation cells, formulas, styles, HTML, and TSV clipboard formats', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const sheet = workbook.sheets[0];
  sheet.cells = {
    A1: { v: '10', style: { bold: true } },
    B1: { v: '=A1*2', style: { backgroundColor: '#dbeafe' } },
  };
  sheet.mergedCells = [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }];
  sheet.rowHeights = { 0: 32 };
  sheet.columnWidths = { 0: 140, 1: 112 };
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
  }, { includeDimensions: true });
  expect(payload.copyDimensions).toBe(true);
  expect(payload.rowHeights).toEqual([32]);
  expect(payload.columnWidths).toEqual([140, 112]);
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
  expect(sheet.rowHeights[2]).toBe(32);
  expect(sheet.columnWidths).toMatchObject({ 2: 140, 3: 112 });
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
  expect(result.payload.externalFormulaDisplayValues).toEqual([[null, '2.09']]);
});

test('falls back to displayed values when external formulas cannot reproduce their source results', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const sheet = workbook.sheets[0];
  const parsed = parseSpreadsheetHtmlClipboard(`
    <html><body data-source="shimo"><table><tbody>
      <tr><td style="font-weight:700">汇总申请uv</td></tr>
      <tr><td data-formula="=SHIMO_ONLY(A1)" style="background-color:#dbeafe">5575</td></tr>
      <tr><td data-formula="='源数据'!C2">6445</td></tr>
      <tr><td data-formula="=1+1">6468</td></tr>
    </tbody></table></body></html>
  `);
  applySpreadsheetClipboardPayload(sheet, parsed.payload, 0, 1);
  const evaluator = createSpreadsheetFormulaEvaluator(workbook);
  const resolved = resolveExternalSpreadsheetClipboardFormulas(parsed.payload, {
    startRow: 0,
    startColumn: 1,
    evaluateCell: (rowIndex, columnIndex) => evaluator.getValue(sheet.id, rowIndex, columnIndex),
    isFormulaError: value => evaluator.isError(value),
  });
  expect(resolved.fallbackCount).toBe(3);
  expect(resolved.payload.externalFormulaDisplayValues).toBeUndefined();
  expect(resolved.payload.cells).toEqual([
    [{ v: '汇总申请uv', style: { bold: true } }],
    [{ v: '5575', style: { backgroundColor: 'rgb(219, 234, 254)' } }],
    [{ v: '6445' }],
    [{ v: '6468' }],
  ]);
  applySpreadsheetClipboardPayload(sheet, resolved.payload, 0, 1);
  expect([sheet.cells.B1.v, sheet.cells.B2.v, sheet.cells.B3.v, sheet.cells.B4.v])
    .toEqual(['汇总申请uv', '5575', '6445', '6468']);
});

test('keeps portable external formulas whose calculated values match the source display', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const sheet = workbook.sheets[0];
  sheet.cells.A1 = { v: '5' };
  const parsed = parseSpreadsheetHtmlClipboard(`
    <table><tbody><tr><td data-formula="=A1*2">10</td></tr></tbody></table>
  `);
  applySpreadsheetClipboardPayload(sheet, parsed.payload, 0, 1);
  const evaluator = createSpreadsheetFormulaEvaluator(workbook);
  const resolved = resolveExternalSpreadsheetClipboardFormulas(parsed.payload, {
    startRow: 0,
    startColumn: 1,
    evaluateCell: (rowIndex, columnIndex) => evaluator.getValue(sheet.id, rowIndex, columnIndex),
    isFormulaError: value => evaluator.isError(value),
  });
  expect(resolved.fallbackCount).toBe(0);
  expect(resolved.payload.cells[0][0]).toEqual({ v: '=A1*2' });
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
