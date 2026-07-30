import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, message } from 'antd';

import SpreadsheetDocumentEditor from './SpreadsheetDocumentEditor';
import { createDefaultSpreadsheetSheet, createDefaultSpreadsheetWorkbook } from '../utils/spreadsheetWorkbook';

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function ControlledSpreadsheetEditor({
  initialWorkbook = createDefaultSpreadsheetWorkbook(),
  initialSelectedCell = { sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 },
  onWorkbookChange = () => {},
  onSelectionChange = () => {},
  editorProps = {},
}) {
  const [workbook, setWorkbook] = React.useState(initialWorkbook);
  const [selectedCell, setSelectedCell] = React.useState(initialSelectedCell);
  return (
    <SpreadsheetDocumentEditor
      workbook={workbook}
      canEdit
      {...editorProps}
      selectedCell={selectedCell}
      onSelectedCellChange={setSelectedCell}
      onSelectionChange={onSelectionChange}
      onWorkbookChange={nextWorkbook => {
        onWorkbookChange(nextWorkbook);
        setWorkbook(nextWorkbook);
      }}
    />
  );
}

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    disconnect() {}
  };
  jest.spyOn(message, 'success').mockImplementation(() => {});
  jest.spyOn(message, 'info').mockImplementation(() => {});
  jest.spyOn(message, 'warning').mockImplementation(() => {});
  jest.spyOn(message, 'error').mockImplementation(() => {});
});

afterAll(() => jest.restoreAllMocks());

test('fills a frameless document workspace while keeping every spreadsheet region visible', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SpreadsheetDocumentEditor
        workbook={createDefaultSpreadsheetWorkbook()}
        canEdit
        fillAvailableHeight
        frameless
        selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
        onSelectedCellChange={() => {}}
        onWorkbookChange={() => {}}
      />
    );
  });

  const editor = container.querySelector('[data-spreadsheet-editor-root="true"]');
  expect(editor.style.height).toBe('100%');
  expect(editor.style.minHeight).toBe('0');
  expect(editor.classList.contains('relation-spreadsheet-editor--frameless')).toBe(true);
  expect(editor.style.borderRadius).toBe('0');
  expect(container.querySelector('[data-spreadsheet-menu-bar="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-toolbar="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-formula-bar="true"]').style.gridTemplateColumns)
    .toBe('74px minmax(0, 1fr)');
  expect(container.querySelector('[data-spreadsheet-grid="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-sheet-bar="true"]')).not.toBeNull();
  expect(container.querySelector('.relation-spreadsheet-sheet-tab--active')).not.toBeNull();
  expect(container.querySelector('.relation-spreadsheet-sheet-tab-shell--active')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-sheet-list-trigger="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-view-trigger="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-fullscreen-trigger="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-zoom-out="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-zoom-value="true"]').textContent).toBe('100%');
  expect(container.querySelector('[data-spreadsheet-zoom-in="true"]')).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});

test('switches sheets from the footer list and exposes working fullscreen and zoom controls', async () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const secondSheet = createDefaultSpreadsheetSheet(1, workbook.sheets);
  secondSheet.name = '数据明细';
  workbook.sheets.push(secondSheet);
  const onSelectedCellChange = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <SpreadsheetDocumentEditor
      workbook={workbook}
      canEdit
      fillAvailableHeight
      selectedCell={{ sheetId: workbook.sheets[0].id, rowIndex: 0, columnIndex: 0 }}
      onSelectedCellChange={onSelectedCellChange}
      onWorkbookChange={() => {}}
    />,
  ));

  const editor = container.querySelector('[data-spreadsheet-editor-root="true"]');
  editor.requestFullscreen = jest.fn().mockResolvedValue(undefined);
  await act(async () => {
    container.querySelector('[data-spreadsheet-fullscreen-trigger="true"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(editor.requestFullscreen).toHaveBeenCalledTimes(1);

  act(() => container.querySelector('[data-spreadsheet-zoom-in="true"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(container.querySelector('[data-spreadsheet-zoom-value="true"]').textContent).toBe('125%');
  act(() => container.querySelector('[data-spreadsheet-zoom-out="true"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(container.querySelector('[data-spreadsheet-zoom-value="true"]').textContent).toBe('100%');

  await act(async () => {
    container.querySelector('.relation-spreadsheet-sheet-tab__menu')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain('重命名');
  expect(document.body.textContent).toContain('向右移动');

  await act(async () => {
    container.querySelector('[data-spreadsheet-view-trigger="true"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  const viewMenu = document.body.querySelector('.relation-spreadsheet-view-menu');
  expect(viewMenu).not.toBeNull();
  expect(viewMenu.textContent).toContain('普通视图');

  await act(async () => {
    container.querySelector('[data-spreadsheet-sheet-list-trigger="true"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  const sheetListMenu = document.body.querySelector('.relation-spreadsheet-sheet-list-menu');
  expect(sheetListMenu).not.toBeNull();
  const secondSheetItem = [...sheetListMenu.querySelectorAll('.ant-dropdown-menu-item')]
    .find(item => item.textContent.includes('数据明细'));
  expect(secondSheetItem).not.toBeUndefined();
  await act(async () => {
    secondSheetItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(onSelectedCellChange).toHaveBeenLastCalledWith({
    sheetId: secondSheet.id,
    rowIndex: 0,
    columnIndex: 0,
  });

  act(() => root.unmount());
  container.remove();
});

test('reports grid scrolling and keeps the workspace focus toggle pinned beside the toolbar', () => {
  const onViewportScroll = jest.fn();
  const onWorkspaceFocusModeChange = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const renderEditor = workspaceFocusMode => (
    <SpreadsheetDocumentEditor
      workbook={createDefaultSpreadsheetWorkbook()}
      canEdit
      fillAvailableHeight
      frameless
      workspaceFocusMode={workspaceFocusMode}
      onWorkspaceFocusModeChange={onWorkspaceFocusModeChange}
      onViewportScroll={onViewportScroll}
      selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
      onSelectedCellChange={() => {}}
      onWorkbookChange={() => {}}
    />
  );

  act(() => root.render(renderEditor(false)));
  const grid = container.querySelector('[data-spreadsheet-grid="true"]');
  Object.defineProperty(grid, 'scrollHeight', { configurable: true, value: 900 });
  Object.defineProperty(grid, 'clientHeight', { configurable: true, value: 500 });
  grid.scrollTop = 32;
  grid.scrollLeft = 18;
  act(() => grid.dispatchEvent(new Event('scroll', { bubbles: true })));
  expect(onViewportScroll).toHaveBeenLastCalledWith({
    scrollTop: 32,
    scrollLeft: 18,
    scrollHeight: 900,
    clientHeight: 500,
  });

  const collapseButton = container.querySelector('[data-spreadsheet-focus-toggle="true"]');
  expect(collapseButton.getAttribute('aria-label')).toBe('收起标题与菜单');
  expect(collapseButton.closest('.relation-spreadsheet-focus-toggle-slot')).not.toBeNull();
  act(() => collapseButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onWorkspaceFocusModeChange).toHaveBeenCalledWith(true);

  act(() => root.render(renderEditor(true)));
  expect(container.querySelector('[data-spreadsheet-editor-root="true"]')
    .classList.contains('relation-spreadsheet-editor--focus-mode')).toBe(true);
  expect(container.querySelector('[data-spreadsheet-menu-bar="true"]').hidden).toBe(true);
  expect(container.querySelector('[data-spreadsheet-toolbar="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-formula-bar="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-focus-toggle="true"]')
    .getAttribute('aria-label')).toBe('展开标题与菜单');

  act(() => root.unmount());
  container.remove();
});

test('keeps headers and frozen cells pinned with native sticky positioning', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].frozen = { rows: 1, columns: 1 };
  workbook.sheets[0].cells = {
    A1: { v: '冻结交叉格' },
    B1: { v: '冻结首行' },
    A2: { v: '冻结首列' },
    B2: { v: '普通单元格' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ControlledSpreadsheetEditor initialWorkbook={workbook} />));

  const grid = container.querySelector('[data-spreadsheet-grid="true"]');
  const frozenCell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="0"]');
  const frozenRowCell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="1"]');
  const frozenColumnCell = container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="0"]');
  const initialPositions = {
    frozenCell: { position: frozenCell.style.position, top: frozenCell.style.top, left: frozenCell.style.left },
    frozenRowCell: { position: frozenRowCell.style.position, top: frozenRowCell.style.top, left: frozenRowCell.style.left },
    frozenColumnCell: { position: frozenColumnCell.style.position, top: frozenColumnCell.style.top, left: frozenColumnCell.style.left },
  };

  grid.scrollTop = 84.5;
  grid.scrollLeft = 122.25;
  act(() => grid.dispatchEvent(new Event('scroll', { bubbles: true })));

  expect(initialPositions).toEqual({
    frozenCell: { position: 'sticky', top: '24px', left: '46px' },
    frozenRowCell: { position: 'sticky', top: '24px', left: '' },
    frozenColumnCell: { position: 'sticky', top: '', left: '46px' },
  });
  expect(frozenCell.getAttribute('data-spreadsheet-pinned-axes')).toBe('xy');
  expect(frozenRowCell.getAttribute('data-spreadsheet-pinned-axes')).toBe('y');
  expect(frozenColumnCell.getAttribute('data-spreadsheet-pinned-axes')).toBe('x');
  expect(container.querySelector('[data-spreadsheet-column-header="0"]')
    .getAttribute('data-spreadsheet-pinned-axes')).toBe('xy');
  expect(container.querySelector('[data-spreadsheet-row-header="0"]')
    .getAttribute('data-spreadsheet-pinned-axes')).toBe('xy');
  expect(container.querySelector('[data-spreadsheet-corner="true"]')
    .getAttribute('data-spreadsheet-pinned-axes')).toBe('xy');
  expect({ position: frozenCell.style.position, top: frozenCell.style.top, left: frozenCell.style.left })
    .toEqual(initialPositions.frozenCell);
  expect({ position: frozenRowCell.style.position, top: frozenRowCell.style.top, left: frozenRowCell.style.left })
    .toEqual(initialPositions.frozenRowCell);
  expect({ position: frozenColumnCell.style.position, top: frozenColumnCell.style.top, left: frozenColumnCell.style.left })
    .toEqual(initialPositions.frozenColumnCell);
  expect(container.querySelectorAll('[data-spreadsheet-pinned-wrapper]').length).toBeGreaterThan(0);
  expect(grid.style.overscrollBehavior).toBe('none');

  act(() => root.unmount());
  container.remove();
});

test('selects the used sheet range and copies it into another sheet as one undoable paste', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const sourceSheet = workbook.sheets[0];
  sourceSheet.name = '来源Sheet';
  sourceSheet.cells = {
    A1: { v: '日期', style: { bold: true, backgroundColor: '#dbeafe' } },
    B1: { v: '申请量', style: { bold: true } },
    A2: { v: '2026/7/28' },
    B2: { v: '=A2', style: { color: '#dc2626' } },
  };
  sourceSheet.mergedCells = [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }];
  sourceSheet.rowHeights = { 0: 32, 1: 28 };
  sourceSheet.columnWidths = { 0: 140, 1: 112 };
  const targetSheet = createDefaultSpreadsheetSheet(1, workbook.sheets);
  targetSheet.id = 'target-sheet';
  targetSheet.name = '目标Sheet';
  targetSheet.cells = { A1: { v: '旧内容' } };
  workbook.sheets.push(targetSheet);

  let latestWorkbook = workbook;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'a', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('A1:B2');

  const clipboardValues = {};
  const clipboardData = {
    setData: (type, value) => { clipboardValues[type] = value; },
    getData: type => clipboardValues[type] || '',
  };
  const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(copyEvent, 'clipboardData', { value: clipboardData });
  act(() => editor.dispatchEvent(copyEvent));
  expect(copyEvent.defaultPrevented).toBe(true);
  expect(JSON.parse(clipboardValues['application/x-relation-spreadsheet+json']).copyDimensions).toBe(true);

  const targetSheetButton = [...container.querySelectorAll('button')]
    .find(button => button.textContent === '目标Sheet');
  act(() => targetSheetButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
  act(() => editor.dispatchEvent(pasteEvent));

  const pastedSheet = latestWorkbook.sheets.find(sheet => sheet.id === 'target-sheet');
  expect(pastedSheet.cells).toMatchObject(sourceSheet.cells);
  expect(pastedSheet.mergedCells).toEqual(sourceSheet.mergedCells);
  expect(pastedSheet.rowHeights).toMatchObject(sourceSheet.rowHeights);
  expect(pastedSheet.columnWidths).toMatchObject(sourceSheet.columnWidths);
  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('A1:B2');

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  const restoredSheet = latestWorkbook.sheets.find(sheet => sheet.id === 'target-sheet');
  expect(restoredSheet.cells).toEqual({ A1: { v: '旧内容' } });

  act(() => root.unmount());
  container.remove();
});

test('pastes Shimo columns as displayed values when source formulas are unavailable', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  let latestWorkbook = workbook;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const targetCell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="1"]');
  act(() => targetCell.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })));

  const clipboardData = {
    getData: type => ({
      'text/html': `<html><body data-source="shimo"><table><tbody>
        <tr><td style="font-weight:700">汇总申请uv</td></tr>
        <tr><td data-formula="=SHIMO_ONLY(A1)">5575</td></tr>
        <tr><td data-formula="='源数据'!C2">6445</td></tr>
      </tbody></table></body></html>`,
      'text/plain': '汇总申请uv\n5575\n6445',
    }[type] || ''),
  };
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(pasteEvent));

  expect(pasteEvent.defaultPrevented).toBe(true);
  expect([latestWorkbook.sheets[0].cells.B1?.v, latestWorkbook.sheets[0].cells.B2?.v, latestWorkbook.sheets[0].cells.B3?.v])
    .toEqual(['汇总申请uv', '5575', '6445']);
  expect(container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="1"]').textContent)
    .toContain('5575');

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
  })));
  expect([latestWorkbook.sheets[0].cells.B1, latestWorkbook.sheets[0].cells.B2, latestWorkbook.sheets[0].cells.B3])
    .toEqual([undefined, undefined, undefined]);

  act(() => root.unmount());
  container.remove();
});

test('virtualizes a large worksheet and renders calculated formula values', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0] = {
    ...workbook.sheets[0],
    rowCount: 100000,
    columnCount: 500,
    cells: {
      A1: { v: '=SUM(A2:A3)' },
      A2: { v: '1' },
      A3: { v: '2' },
    },
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SpreadsheetDocumentEditor
        workbook={workbook}
        canEdit={false}
        selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
        onSelectedCellChange={() => {}}
        onWorkbookChange={() => {}}
      />
    );
  });

  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('=SUM(A2:A3)');
  expect([...container.querySelectorAll('[role="gridcell"]')].some(cell => cell.textContent === '3')).toBe(true);
  expect(container.querySelectorAll('[role="gridcell"]').length).toBeLessThan(400);
  expect(container.querySelector('[role="grid"]').getAttribute('aria-rowcount')).toBe('100000');
  expect(container.querySelector('[role="grid"]').getAttribute('aria-colcount')).toBe('500');

  act(() => root.unmount());
  container.remove();
});

test('captures scroll offsets before rerendering or unmounting the virtual grid', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SpreadsheetDocumentEditor
        workbook={createDefaultSpreadsheetWorkbook()}
        canEdit
        selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
        onSelectedCellChange={() => {}}
        onWorkbookChange={() => {}}
      />
    );
  });

  const grid = container.querySelector('[role="grid"]');
  Object.defineProperty(grid, 'scrollTop', { configurable: true, value: 320 });
  Object.defineProperty(grid, 'scrollLeft', { configurable: true, value: 180 });
  expect(() => act(() => {
    grid.dispatchEvent(new Event('scroll', { bubbles: true }));
    root.unmount();
  })).not.toThrow();
  container.remove();
});

test('leaves Command+A and clipboard events inside formula or cell inputs native', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const onWorkbookChange = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SpreadsheetDocumentEditor
        workbook={workbook}
        canEdit
        selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
        onSelectedCellChange={() => {}}
        onWorkbookChange={onWorkbookChange}
      />
    );
  });

  const clipboardWrites = {};
  const clipboardData = {
    setData: (type, value) => { clipboardWrites[type] = value; },
    getData: type => type === 'text/plain' ? 'alpha\tbeta' : '',
  };
  const formulaInput = container.querySelector('[data-spreadsheet-formula-input="true"]');
  const formulaSelectAllEvent = new KeyboardEvent('keydown', {
    key: 'a', metaKey: true, bubbles: true, cancelable: true,
  });
  act(() => formulaInput.dispatchEvent(formulaSelectAllEvent));
  expect(formulaSelectAllEvent.defaultPrevented).toBe(false);
  const formulaCopyEvent = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(formulaCopyEvent, 'clipboardData', { value: clipboardData });
  act(() => formulaInput.dispatchEvent(formulaCopyEvent));
  expect(formulaCopyEvent.defaultPrevented).toBe(false);

  const firstCell = container.querySelector('[role="gridcell"]');
  act(() => firstCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  const cellInput = firstCell.querySelector('input');
  const cellSelectAllEvent = new KeyboardEvent('keydown', {
    key: 'a', metaKey: true, bubbles: true, cancelable: true,
  });
  act(() => cellInput.dispatchEvent(cellSelectAllEvent));
  expect(cellSelectAllEvent.defaultPrevented).toBe(false);
  const cellCopyEvent = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(cellCopyEvent, 'clipboardData', { value: clipboardData });
  act(() => cellInput.dispatchEvent(cellCopyEvent));
  expect(cellCopyEvent.defaultPrevented).toBe(false);
  expect(clipboardWrites).toEqual({});
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
  act(() => cellInput.dispatchEvent(pasteEvent));

  expect(pasteEvent.defaultPrevented).toBe(false);
  expect(onWorkbookChange).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
});

test('invokes Excel import and export callbacks for editable users', () => {
  const onImportXlsx = jest.fn();
  const onExportXlsx = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SpreadsheetDocumentEditor
        workbook={createDefaultSpreadsheetWorkbook()}
        canEdit
        selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
        onSelectedCellChange={() => {}}
        onWorkbookChange={() => {}}
        onImportXlsx={onImportXlsx}
        onExportXlsx={onExportXlsx}
      />
    );
  });

  const importButton = container.querySelector('[aria-label="导入 Excel"]');
  const exportButton = container.querySelector('[aria-label="导出 Excel"]');
  const fileInput = container.querySelector('input[type="file"]');
  const clickSpy = jest.spyOn(fileInput, 'click').mockImplementation(() => {});
  expect(importButton.disabled).toBe(false);
  expect(fileInput.disabled).toBe(false);
  expect(fileInput.accept).toBe('.xlsx,.xlsm');

  act(() => importButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(clickSpy).toHaveBeenCalledTimes(1);
  const file = new File(['fixture'], 'fixture.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
  act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImportXlsx).toHaveBeenCalledWith(file);

  act(() => exportButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onExportXlsx).toHaveBeenCalledTimes(1);

  clickSpy.mockRestore();
  act(() => root.unmount());
  container.remove();
});

test('applies native spreadsheet basic formatting to the selected cell', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = { A1: { v: '格式' } };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  act(() => container.querySelector('[aria-label="斜体"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  act(() => container.querySelector('[aria-label="下划线"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  act(() => container.querySelector('[aria-label="自动换行"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  act(() => container.querySelector('[aria-label="边框"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets[0].cells.A1.style).toMatchObject({
    italic: true,
    underline: true,
    wrap: true,
    border: { color: '#cbd5e1' },
  });

  act(() => root.unmount());
  container.remove();
});

test('keeps toolbar formatting in the shared undo stack after toolbar focus', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = { A1: { v: '6780' } };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const italicButton = container.querySelector('[aria-label="斜体"]');
  act(() => italicButton.focus());
  act(() => italicButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(latestWorkbook.sheets[0].cells.A1.style.italic).toBe(true);

  act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].cells.A1.style).toBeUndefined();

  act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].cells.A1.style.italic).toBe(true);

  act(() => root.unmount());
  container.remove();
});

test('shows formula raw text and highlights referenced cells', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].cells = {
    A1: { v: '10' },
    B1: { v: '2' },
    C1: { v: '=A1/B1' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      initialSelectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 2 }}
    />
  ));

  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('=A1/B1');
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]')
    .getAttribute('data-spreadsheet-formula-reference-count')).toBe('2');
  expect(container.querySelector('[data-spreadsheet-formula-reference="A1"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-formula-reference="B1"]')).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});

test('sorts a selected whole column descending without moving blanks before values', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '日期' },
    B1: { v: '汇总申请uv' },
    A2: { v: '2026/7/15' },
    B2: { v: '5575' },
    A3: { v: '2026/7/14' },
    B3: { v: '6445' },
    A5: { v: '2026/7/12' },
    B5: { v: '6888' },
    A6: { v: '2026/7/11' },
    B6: { v: '314' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  act(() => container.querySelector('[data-spreadsheet-column-header="1"]')
    .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  act(() => container.querySelector('[aria-label="降序"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect([
    latestWorkbook.sheets[0].cells.B2?.v,
    latestWorkbook.sheets[0].cells.B3?.v,
    latestWorkbook.sheets[0].cells.B4?.v,
    latestWorkbook.sheets[0].cells.B5?.v,
  ]).toEqual(['6888', '6445', '5575', '314']);
  expect([
    latestWorkbook.sheets[0].cells.A2?.v,
    latestWorkbook.sheets[0].cells.A3?.v,
    latestWorkbook.sheets[0].cells.A4?.v,
    latestWorkbook.sheets[0].cells.A5?.v,
  ]).toEqual(['2026/7/12', '2026/7/14', '2026/7/15', '2026/7/11']);
  act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect([latestWorkbook.sheets[0].cells.A2?.v, latestWorkbook.sheets[0].cells.B2?.v])
    .toEqual(['2026/7/15', '5575']);

  act(() => root.unmount());
  container.remove();
});

test('enables a single-column value filter from its header cell and keeps it undoable', async () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '日期' }, B1: { v: '区域' },
    A2: { v: '07-28' }, B2: { v: '华东' },
    A3: { v: '07-29' }, B3: { v: '华南' },
    A4: { v: '07-30' }, B4: { v: '华东' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />,
  ));

  act(() => container.querySelector('[data-spreadsheet-column-header="1"]')
    .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  act(() => container.querySelector('[aria-label="筛选"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets[0].filterRange)
    .toEqual({ startRow: 0, endRow: 3, startColumn: 1, endColumn: 1 });
  const filterTrigger = container.querySelector('[data-spreadsheet-filter-trigger="1"]');
  expect(filterTrigger).not.toBeNull();
  expect(filterTrigger.closest('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="1"]'))
    .not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-column-header="1"] .anticon-filter')).toBeNull();

  await act(async () => {
    filterTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  const panel = document.body.querySelector('[data-spreadsheet-filter-panel="true"]');
  expect(panel).not.toBeNull();
  expect(panel.textContent).toContain('按值筛选 · B 列');
  expect(panel.textContent).toContain('华东');
  expect(panel.textContent).toContain('2');
  expect(panel.textContent).toContain('华南');

  const southCheckbox = panel.querySelector('[data-spreadsheet-filter-option="华南"]');
  act(() => southCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const applyButton = [...panel.querySelectorAll('button')]
    .find(button => button.textContent.includes('应用筛选'));
  act(() => applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets[0].filters).toEqual([
    { columnIndex: 1, operator: 'in', values: ['华东'] },
  ]);
  expect(container.querySelector('[data-spreadsheet-row-index="2"][data-spreadsheet-column-index="1"]')).toBeNull();
  expect(container.querySelector('[data-spreadsheet-row-index="3"][data-spreadsheet-column-index="1"]')).not.toBeNull();

  act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].filters).toEqual([]);
  expect(latestWorkbook.sheets[0].filterRange)
    .toEqual({ startRow: 0, endRow: 3, startColumn: 1, endColumn: 1 });

  act(() => container.querySelector('[data-spreadsheet-filter-toggle="true"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(latestWorkbook.sheets[0].filterRange).toBeNull();
  expect(latestWorkbook.sheets[0].filters).toEqual([]);
  expect(container.querySelectorAll('[data-spreadsheet-filter-trigger]')).toHaveLength(0);

  act(() => root.unmount());
  container.remove();
});

test('selects arbitrary columns with Command or Ctrl and only enables filters on those columns', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '日期' }, B1: { v: '申请量' }, C1: { v: '填充列' }, D1: { v: '完成量' }, E1: { v: '填充列2' }, F1: { v: '转化率' },
    A2: { v: '07-28' }, B2: { v: '5575' }, C2: { v: '-' }, D2: { v: '3103' }, E2: { v: '-' }, F2: { v: '55.66%' },
    A3: { v: '07-29' }, B3: { v: '6445' }, C3: { v: '-' }, D3: { v: '3792' }, E3: { v: '-' }, F3: { v: '58.84%' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />,
  ));

  const clickColumn = (columnIndex, modifiers = {}) => act(() => (
    container.querySelector(`[data-spreadsheet-column-header="${columnIndex}"]`)
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, ...modifiers }))
  ));
  clickColumn(1);
  clickColumn(3, { metaKey: true });
  expect(container.querySelector('[data-spreadsheet-column-header="3"]').getAttribute('aria-selected')).toBe('true');
  clickColumn(3, { metaKey: true });
  expect(container.querySelector('[data-spreadsheet-column-header="3"]').getAttribute('aria-selected')).toBe('false');
  clickColumn(3, { metaKey: true });
  clickColumn(5, { ctrlKey: true });

  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('B:B,D:D,F:F');
  expect([1, 3, 5].map(columnIndex => (
    container.querySelector(`[data-spreadsheet-column-header="${columnIndex}"]`).getAttribute('aria-selected')
  ))).toEqual(['true', 'true', 'true']);
  expect(container.querySelector('[data-spreadsheet-column-header="2"]').getAttribute('aria-selected')).toBe('false');
  expect(container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="3"]')
    .getAttribute('aria-selected')).toBe('true');
  expect(container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="4"]')
    .getAttribute('aria-selected')).toBe('false');

  act(() => container.querySelector('[aria-label="筛选"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets[0].filterRange).toEqual({
    startRow: 0,
    endRow: 2,
    startColumn: 1,
    endColumn: 5,
    columns: [1, 3, 5],
  });
  expect([...container.querySelectorAll('[data-spreadsheet-filter-trigger]')]
    .map(trigger => trigger.getAttribute('data-spreadsheet-filter-trigger'))).toEqual(['1', '3', '5']);

  act(() => root.unmount());
  container.remove();
});

test('uses a selected row as the filter header and extends through all used rows and columns', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '日期' }, B1: { v: '申请量' }, C1: { v: '状态' },
    A2: { v: '07-28' }, B2: { v: '5575' }, C2: { v: '完成' },
    A3: { v: '07-29' }, B3: { v: '6445' }, C3: { v: '进行中' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />,
  ));

  act(() => container.querySelector('[data-spreadsheet-row-header="0"]')
    .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  act(() => container.querySelector('[aria-label="筛选"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets[0].filterRange)
    .toEqual({ startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 });
  expect([...container.querySelectorAll('[data-spreadsheet-filter-trigger]')]
    .map(trigger => trigger.getAttribute('data-spreadsheet-filter-trigger'))).toEqual(['0', '1', '2']);

  act(() => root.unmount());
  container.remove();
});

test('clears filter results without removing controls and can then cancel the filter entirely', async () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '状态' }, A2: { v: '完成' }, A3: { v: '进行中' },
  };
  latestWorkbook.sheets[0].filterRange = {
    startRow: 0, endRow: 2, startColumn: 0, endColumn: 0,
  };
  latestWorkbook.sheets[0].filters = [
    { columnIndex: 0, operator: 'in', values: ['完成'] },
  ];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />,
  ));

  const clickFilterMenuItem = async label => {
    await act(async () => {
      container.querySelector('[aria-label="筛选菜单"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const menuItem = [...document.body.querySelectorAll('.ant-dropdown-menu-item')]
      .find(item => item.textContent.includes(label));
    expect(menuItem).not.toBeNull();
    act(() => menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };

  await clickFilterMenuItem('清除筛选结果');
  expect(latestWorkbook.sheets[0].filters).toEqual([]);
  expect(latestWorkbook.sheets[0].filterRange)
    .toEqual({ startRow: 0, endRow: 2, startColumn: 0, endColumn: 0 });
  expect(container.querySelector('[data-spreadsheet-filter-trigger="0"]')).not.toBeNull();

  await clickFilterMenuItem('取消筛选');
  expect(latestWorkbook.sheets[0].filterRange).toBeNull();
  expect(container.querySelector('[data-spreadsheet-filter-trigger="0"]')).toBeNull();

  act(() => root.unmount());
  container.remove();
});

test('enables filter controls for every used column from the select-all corner', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '日期' }, B1: { v: '申请量' }, C1: { v: '状态' },
    A2: { v: '07-28' }, B2: { v: '5575' }, C2: { v: '完成' },
    A3: { v: '07-29' }, B3: { v: '6445' }, C3: { v: '进行中' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />,
  ));

  act(() => container.querySelector('[data-spreadsheet-corner="true"]')
    .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('A1:C3');
  act(() => container.querySelector('[aria-label="筛选"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets[0].filterRange)
    .toEqual({ startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 });
  expect(container.querySelectorAll('[data-spreadsheet-filter-trigger]').length).toBe(3);
  expect([...container.querySelectorAll('[data-spreadsheet-filter-trigger]')]
    .map(trigger => trigger.getAttribute('data-spreadsheet-filter-trigger'))).toEqual(['0', '1', '2']);

  act(() => root.unmount());
  container.remove();
});

test('renders a Shimo-style range outline and selection statistics', async () => {
  const onWorkbookChange = jest.fn();
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].cells = {
    B2: { v: '10' },
    B3: { v: '20' },
    B4: { v: '31' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor initialWorkbook={workbook} onWorkbookChange={onWorkbookChange} />,
  ));

  const firstCell = container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="1"]');
  const middleCell = container.querySelector('[data-spreadsheet-row-index="2"][data-spreadsheet-column-index="1"]');
  const lastCell = container.querySelector('[data-spreadsheet-row-index="3"][data-spreadsheet-column-index="1"]');
  act(() => firstCell.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  act(() => lastCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })));

  expect(firstCell.style.background).toBe('rgb(255, 255, 255)');
  expect(firstCell.style.boxShadow).toContain('inset 0 2px 0');
  expect(firstCell.style.boxShadow).not.toContain('inset 0 0 0 2px');
  expect(middleCell.style.background).toBe('rgb(226, 237, 249)');
  expect(lastCell.querySelector('[data-spreadsheet-selection-fill-handle="true"]')).not.toBeNull();

  const summary = container.querySelector('[data-spreadsheet-selection-summary="true"]');
  expect(summary).not.toBeNull();
  expect(summary.textContent).toContain('总和:61');
  expect(summary.querySelector('[data-spreadsheet-selection-summary-value="true"]').textContent).toBe('61');
  await act(async () => {
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  const summaryMenu = document.body.querySelector('.relation-spreadsheet-selection-summary-menu');
  expect(summaryMenu.textContent).toContain('总和');
  expect(summaryMenu.textContent).toContain('平均');
  expect(summaryMenu.textContent).toContain('最大');
  expect(summaryMenu.textContent).toContain('最小');
  expect(summaryMenu.textContent).toContain('计数');
  expect(summaryMenu.textContent).toContain('数值计数');

  const averageItem = [...summaryMenu.querySelectorAll('.ant-dropdown-menu-item')]
    .find(item => item.textContent.includes('平均'));
  await act(async () => {
    averageItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(summary.textContent).toContain('平均:20.33');
  expect(summary.querySelector('[data-spreadsheet-selection-summary-value="true"]').textContent).toBe('20.33');
  expect(onWorkbookChange).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
});

test('auto-scrolls the virtual grid while extending a selection beyond the viewport', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].rowCount = 80;
  workbook.sheets[0].cells = Object.fromEntries(Array.from({ length: 22 }, (_, index) => [
    `B${index + 1}`,
    { v: index === 0 ? '下载类申请uv' : String(5500 + index) },
  ]));
  const animationFrames = [];
  const requestAnimationFrameSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  const cancelAnimationFrameSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ControlledSpreadsheetEditor initialWorkbook={workbook} />));

  const grid = container.querySelector('[data-spreadsheet-grid="true"]');
  Object.defineProperties(grid, {
    clientWidth: { configurable: true, value: 320 },
    clientHeight: { configurable: true, value: 120 },
    scrollWidth: { configurable: true, value: 620 },
    scrollHeight: { configurable: true, value: 1944 },
  });
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 320,
    bottom: 120,
    width: 320,
    height: 120,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const firstCell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="1"]');
  act(() => firstCell.dispatchEvent(new MouseEvent('mousedown', {
    button: 0, clientX: 150, clientY: 36, bubbles: true,
  })));
  act(() => window.dispatchEvent(new MouseEvent('mousemove', {
    buttons: 1, clientX: 150, clientY: 118, bubbles: true,
  })));

  for (let index = 0; index < 30; index += 1) {
    const callback = animationFrames.shift();
    if (!callback) break;
    act(() => callback(index * 16));
    const endRow = Number(container.querySelector('.relation-spreadsheet-name-box').value.match(/B(\d+)$/)?.[1] || 0);
    if (endRow >= 22) break;
  }
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })));

  expect(grid.scrollTop).toBeGreaterThan(0);
  expect(Number(container.querySelector('.relation-spreadsheet-name-box').value.match(/B(\d+)$/)?.[1] || 0))
    .toBeGreaterThanOrEqual(22);
  const stoppedScrollTop = grid.scrollTop;
  const pendingFrame = animationFrames.shift();
  if (pendingFrame) act(() => pendingFrame(512));
  expect(grid.scrollTop).toBe(stoppedScrollTop);

  act(() => root.unmount());
  container.remove();
  requestAnimationFrameSpy.mockRestore();
  cancelAnimationFrameSpy.mockRestore();
});

test('copies and pastes formulas from the cell context menu as one undoable operation', async () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '10' },
    B1: { v: '=A1+1', style: { bold: true } },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const source = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="1"]');
  act(() => source.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  await act(async () => {
    source.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const contextMenu = document.body.querySelector('.relation-spreadsheet-context-menu');
  expect(contextMenu).not.toBeNull();
  expect(contextMenu.textContent).toContain('插入复制的单元格');
  const copyItem = [...contextMenu.querySelectorAll('.ant-dropdown-menu-item')]
    .find(item => item.textContent === '复制');
  await act(async () => {
    copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  const target = container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="2"]');
  act(() => target.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  await act(async () => {
    target.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const pasteItem = [...document.body.querySelectorAll('.relation-spreadsheet-context-menu .ant-dropdown-menu-item')]
    .find(item => item.textContent === '粘贴');
  await act(async () => {
    pasteItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(latestWorkbook.sheets[0].cells.C2).toEqual({ v: '=B2+1', style: { bold: true } });

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].cells.C2).toBeUndefined();

  act(() => root.unmount());
  container.remove();
});

test('creates a protected range from the context menu and keeps it undoable', async () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells.A1 = { v: '核心数据' };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
      editorProps={{
        currentUser: { id: 1, display_name: '文档所有者' },
        protectionUsers: [{ id: 2, name: '协作者' }],
        canManageProtection: true,
      }}
    />
  ));

  const cell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="0"]');
  await act(async () => {
    cell.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const contextMenu = document.body.querySelector('.relation-spreadsheet-context-menu');
  expect(contextMenu.textContent).toContain('锁定单元格');
  expect(contextMenu.textContent).toContain('条件格式');
  expect(contextMenu.textContent).toContain('数据验证');
  const lockItem = [...contextMenu.querySelectorAll('.ant-dropdown-menu-item')]
    .find(item => item.textContent.includes('锁定单元格'));
  await act(async () => {
    lockItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  const lockButton = document.body.querySelector('[aria-label="创建锁定规则"]');
  expect(lockButton).not.toBeNull();
  await act(async () => {
    lockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(latestWorkbook.sheets[0].protectedRanges).toEqual([
    expect.objectContaining({
      range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      ownerUserId: 1,
      allowedUserIds: [],
      enabled: true,
    }),
  ]);

  act(() => container.querySelector('[aria-label="在线表格编辑区"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })));
  expect(latestWorkbook.sheets[0].protectedRanges).toEqual([]);

  act(() => root.unmount());
  container.remove();
});

test('keeps protected cells selectable and copyable but blocks unauthorized editing', async () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].cells.A1 = { v: '锁定值' };
  workbook.sheets[0].protectedRanges = [{
    id: 'lock-a1',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    ownerUserId: 1,
    allowedUserIds: [],
    description: '仅所有者可编辑',
    enabled: true,
  }];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      editorProps={{ currentUser: { id: 3 }, canManageProtection: false }}
    />
  ));

  const cell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="0"]');
  expect(cell.getAttribute('data-spreadsheet-locked')).toBe('true');
  expect(cell.getAttribute('aria-selected')).toBe('true');
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').readOnly).toBe(true);
  expect(container.querySelector('[aria-label="加粗"]').disabled).toBe(true);
  expect(container.querySelector('[aria-label="调整 A 列宽"]')).toBeNull();
  expect(container.querySelector('[aria-label="调整第 1 行高度"]')).toBeNull();
  act(() => cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(cell.querySelector('input')).toBeNull();

  await act(async () => {
    cell.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const items = [...document.body.querySelectorAll('.relation-spreadsheet-context-menu .ant-dropdown-menu-item')];
  const copyItem = items.find(item => item.textContent === '复制');
  const cutItem = items.find(item => item.textContent === '剪切');
  expect(copyItem.classList.contains('ant-dropdown-menu-item-disabled')).toBe(false);
  expect(cutItem.classList.contains('ant-dropdown-menu-item-disabled')).toBe(true);

  act(() => root.unmount());
  container.remove();
});

test('renders conditional formatting and edits list validations from the cell dropdown', async () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = { A1: { v: '120' }, B1: { v: '研发' } };
  latestWorkbook.sheets[0].conditionalFormats = [{
    id: 'condition-a1',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    type: 'greater_than',
    values: ['100'],
    style: { color: '#dc2626', backgroundColor: '#fee2e2' },
    enabled: true,
  }];
  latestWorkbook.sheets[0].dataValidations = [{
    id: 'validation-b1',
    range: { startRow: 0, endRow: 0, startColumn: 1, endColumn: 1 },
    type: 'list',
    values: ['研发', '产品'],
    invalidAction: 'reject',
    enabled: true,
  }];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      initialSelectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 1 }}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  expect(container.querySelector('[data-spreadsheet-conditional="true"]')).not.toBeNull();
  expect(container.querySelector('[data-spreadsheet-validation="validation-b1"]')).not.toBeNull();
  const trigger = container.querySelector('[aria-label="选择数据验证选项"]');
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  const productOption = [...document.body.querySelectorAll('.ant-dropdown-menu-item')]
    .find(item => item.textContent === '产品');
  await act(async () => {
    productOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(latestWorkbook.sheets[0].cells.B1.v).toBe('产品');

  act(() => root.unmount());
  container.remove();
});

test('rejects invalid direct input and restores the previous validated value', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells.A1 = { v: '5' };
  latestWorkbook.sheets[0].dataValidations = [{
    id: 'validation-a1',
    range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    type: 'number',
    min: 1,
    max: 10,
    allowBlank: false,
    invalidAction: 'reject',
    message: '请输入 1 到 10',
    enabled: true,
  }];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const cell = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="0"]');
  act(() => cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  const input = container.querySelector('[role="gridcell"] input');
  act(() => setInputValue(input, '99'));
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].cells.A1.v).toBe('5');
  expect(message.error).toHaveBeenCalledWith('请输入 1 到 10');

  act(() => root.unmount());
  container.remove();
});

test('uses format painter once without changing the target value and supports undo', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '来源', style: { bold: true, color: '#dc2626', backgroundColor: '#dbeafe' } },
    B1: { v: '=1+1', style: { italic: true, wrap: true } },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const formatPainterButton = container.querySelector('[data-spreadsheet-format-painter="true"]');
  act(() => formatPainterButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(formatPainterButton.getAttribute('aria-pressed')).toBe('true');
  expect(formatPainterButton.getAttribute('data-spreadsheet-format-painter-mode')).toBe('once');

  const target = container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="1"]');
  act(() => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })));

  expect(latestWorkbook.sheets[0].cells.B1).toEqual({
    v: '=1+1',
    style: { bold: true, color: '#dc2626', backgroundColor: '#dbeafe' },
  });
  expect(container.querySelector('[data-spreadsheet-format-painter="true"]')
    .getAttribute('data-spreadsheet-format-painter-mode')).toBe('off');

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].cells.B1).toEqual({
    v: '=1+1',
    style: { italic: true, wrap: true },
  });

  act(() => root.unmount());
  container.remove();
});

test('keeps a double-clicked format painter active for repeated targets until Escape', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  latestWorkbook.sheets[0].cells = {
    A1: { v: '来源', style: { underline: true, border: { color: '#cbd5e1' } } },
    B1: { v: '目标一' },
    C1: { v: '目标二' },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  act(() => container.querySelector('[data-spreadsheet-format-painter="true"]')
    .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })));
  expect(container.querySelector('[data-spreadsheet-format-painter="true"]')
    .getAttribute('data-spreadsheet-format-painter-mode')).toBe('continuous');

  const paintCell = columnIndex => {
    const target = container.querySelector(`[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="${columnIndex}"]`);
    act(() => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })));
  };
  paintCell(1);
  paintCell(2);

  expect(latestWorkbook.sheets[0].cells.B1.style).toEqual({
    underline: true,
    border: { color: '#cbd5e1' },
  });
  expect(latestWorkbook.sheets[0].cells.C1.style).toEqual(latestWorkbook.sheets[0].cells.B1.style);
  expect(container.querySelector('[data-spreadsheet-format-painter="true"]')
    .getAttribute('data-spreadsheet-format-painter-mode')).toBe('continuous');

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true, cancelable: true,
  })));
  expect(container.querySelector('[data-spreadsheet-format-painter="true"]')
    .getAttribute('data-spreadsheet-format-painter-mode')).toBe('off');

  act(() => root.unmount());
  container.remove();
});

test('selects complete rows and columns from spreadsheet headers', () => {
  const onSelectionChange = jest.fn();
  const onWorkbookChange = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      onSelectionChange={onSelectionChange}
      onWorkbookChange={onWorkbookChange}
    />
  ));

  const rowHeader = container.querySelector('[data-spreadsheet-row-header="1"]');
  act(() => rowHeader.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  expect(rowHeader.getAttribute('aria-selected')).toBe('true');
  expect(rowHeader.style.background).toBe('rgb(219, 234, 254)');
  expect([...container.querySelectorAll('[data-spreadsheet-row-index="1"]')]
    .every(cell => cell.getAttribute('aria-selected') === 'true')).toBe(true);
  expect(container.querySelector('[data-spreadsheet-column-header="0"]').getAttribute('aria-selected')).toBe('false');
  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('A2:Z2');
  act(() => container.querySelector('[data-spreadsheet-resize-handle="column"]')
    .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('A2:Z2');

  const columnHeader = container.querySelector('[data-spreadsheet-column-header="2"]');
  act(() => columnHeader.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  expect(columnHeader.getAttribute('aria-selected')).toBe('true');
  expect(columnHeader.style.background).toBe('rgb(219, 234, 254)');
  expect([...container.querySelectorAll('[data-spreadsheet-column-index="2"]')]
    .every(cell => cell.getAttribute('aria-selected') === 'true')).toBe(true);
  expect(container.querySelector('[data-spreadsheet-row-header="0"]').getAttribute('aria-selected')).toBe('false');
  expect(container.querySelector('.relation-spreadsheet-name-box').value).toBe('C1:C1000');
  expect(onSelectionChange).toHaveBeenLastCalledWith({
    sheetId: 'sheet_1',
    selection: { startRow: 0, endRow: 999, startColumn: 2, endColumn: 2 },
  });
  expect(onWorkbookChange).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
});

test('offers current row and column freeze presets with undo and redo support', async () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      initialSelectedCell={{ sheetId: 'sheet_1', rowIndex: 4, columnIndex: 4 }}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const openFreezeMenu = async () => {
    const trigger = container.querySelector('[data-spreadsheet-freeze-trigger="true"]');
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    return [...document.body.querySelectorAll('.relation-spreadsheet-freeze-menu .ant-dropdown-menu-item')];
  };
  const clickFreezeItem = async label => {
    const items = await openFreezeMenu();
    const item = items.find(candidate => candidate.textContent === label);
    expect(item).toBeTruthy();
    await act(async () => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
  };

  let menuItems = await openFreezeMenu();
  expect(menuItems.map(item => item.textContent)).toEqual([
    '冻结至当前行（5 行）',
    '冻结至当前列（5 列）',
    '冻结至当前行和列（5 行 | 5 列）',
    '取消冻结',
  ]);
  expect(menuItems[3].classList.contains('ant-dropdown-menu-item-disabled')).toBe(true);
  await act(async () => {
    container.querySelector('[data-spreadsheet-freeze-trigger="true"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  await clickFreezeItem('冻结至当前行（5 行）');
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 0 });
  await clickFreezeItem('冻结至当前列（5 列）');
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 5 });

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 0 });
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 5 });

  await clickFreezeItem('取消冻结');
  expect(latestWorkbook.sheets[0].frozen).toBeNull();
  await clickFreezeItem('冻结至当前列（5 列）');
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 0, columns: 5 });
  await clickFreezeItem('冻结至当前行（5 行）');
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 5 });
  await clickFreezeItem('取消冻结');
  await clickFreezeItem('冻结至当前行和列（5 行 | 5 列）');
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 5 });

  act(() => root.unmount());
  container.remove();
});

test('starts editing the selected cell when typing a printable key', () => {
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', bubbles: true, cancelable: true })));

  expect(latestWorkbook.sheets[0].cells.A1.v).toBe('X');
  expect(container.querySelector('[data-spreadsheet-row-index="0"][data-spreadsheet-column-index="0"] input')?.value)
    .toBe('X');

  act(() => root.unmount());
  container.remove();
});

test('keeps Excel import and cell editing disabled for readonly users while allowing export', () => {
  const onImportXlsx = jest.fn();
  const onExportXlsx = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SpreadsheetDocumentEditor
        workbook={createDefaultSpreadsheetWorkbook()}
        canEdit={false}
        selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
        onSelectedCellChange={() => {}}
        onWorkbookChange={() => {}}
        onImportXlsx={onImportXlsx}
        onExportXlsx={onExportXlsx}
      />
    );
  });

  const importButton = container.querySelector('[aria-label="导入 Excel"]');
  const exportButton = container.querySelector('[aria-label="导出 Excel"]');
  const freezeTrigger = container.querySelector('[data-spreadsheet-freeze-trigger="true"]');
  const formatPainterButton = container.querySelector('[data-spreadsheet-format-painter="true"]');
  const fileInput = container.querySelector('input[type="file"]');
  const formulaInput = container.querySelector('[data-spreadsheet-formula-input="true"]');
  expect(importButton.disabled).toBe(true);
  expect(freezeTrigger.disabled).toBe(true);
  expect(formatPainterButton.disabled).toBe(true);
  expect(fileInput.disabled).toBe(true);
  expect(exportButton.disabled).toBe(false);
  expect(formulaInput.readOnly).toBe(true);

  const file = new File(['fixture'], 'fixture.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
  act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImportXlsx).not.toHaveBeenCalled();

  const firstCell = container.querySelector('[role="gridcell"]');
  act(() => firstCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(firstCell.querySelector('input')).toBeNull();
  act(() => exportButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onExportXlsx).toHaveBeenCalledTimes(1);

  act(() => root.unmount());
  container.remove();
});

test('keeps rapidly added sheet ids unique and activates the newest sheet', () => {
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);
  let latestWorkbook = createDefaultSpreadsheetWorkbook();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={latestWorkbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const addSheetButton = container.querySelector('[aria-label="新增工作表"]');
  act(() => addSheetButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  act(() => addSheetButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(latestWorkbook.sheets.map(sheet => sheet.name)).toEqual(['工作表1', '工作表2', '工作表3']);
  expect(new Set(latestWorkbook.sheets.map(sheet => sheet.id)).size).toBe(3);
  expect(latestWorkbook.activeSheetId).toBe(latestWorkbook.sheets[2].id);
  expect(latestWorkbook.sheets[1].id).toBe('sheet_1234567890');
  expect(latestWorkbook.sheets[2].id).toBe('sheet_1234567890_2');

  nowSpy.mockRestore();
  act(() => root.unmount());
  container.remove();
});

test('moves a sheet from its context menu and keeps the action in undo history', async () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  const sheet2 = { ...createDefaultSpreadsheetSheet(1, workbook.sheets), id: 'sheet_2', name: '工作表2' };
  const sheet3 = { ...createDefaultSpreadsheetSheet(2, [...workbook.sheets, sheet2]), id: 'sheet_3', name: '工作表3' };
  workbook.sheets.push(sheet2, sheet3);
  let latestWorkbook = workbook;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const sheet2Button = [...container.querySelectorAll('button')]
    .find(button => button.textContent === '工作表2');
  await act(async () => {
    sheet2Button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const moveLeftItem = [...document.body.querySelectorAll('.ant-dropdown-menu-item')]
    .find(item => item.textContent.includes('向左移动'));
  expect(moveLeftItem).toBeTruthy();
  act(() => moveLeftItem.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(latestWorkbook.sheets.map(sheet => sheet.id)).toEqual(['sheet_2', 'sheet_1', 'sheet_3']);

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets.map(sheet => sheet.id)).toEqual(['sheet_1', 'sheet_2', 'sheet_3']);

  act(() => root.unmount());
  container.remove();
});

test('keeps a same-cell conflict notice visible across the merged workbook update', () => {
  const conflictNotice = '检测到超级管理员修改了相同表格位置，已保留你的本地内容并合并其他更新';
  const workbook = createDefaultSpreadsheetWorkbook();
  const mergedWorkbook = createDefaultSpreadsheetWorkbook();
  mergedWorkbook.sheets[0].cells.I18 = { v: 'LOCAL_WINS_R17' };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const renderEditor = currentWorkbook => (
    <SpreadsheetDocumentEditor
      workbook={currentWorkbook}
      canEdit
      selectedCell={{ sheetId: 'sheet_1', rowIndex: 17, columnIndex: 8 }}
      onSelectedCellChange={() => {}}
      onWorkbookChange={() => {}}
      collaborationNotice={conflictNotice}
    />
  );

  act(() => root.render(renderEditor(workbook)));
  expect(container.querySelector('[data-spreadsheet-collaboration-notice="true"]')?.textContent)
    .toContain(conflictNotice);

  act(() => root.render(renderEditor(mergedWorkbook)));
  expect(container.querySelector('[data-spreadsheet-collaboration-notice="true"]')?.textContent)
    .toContain(conflictNotice);

  act(() => root.unmount());
  container.remove();
});

test('renders remote collaborators and reports the complete local selection', () => {
  const onSelectionChange = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <SpreadsheetDocumentEditor
      workbook={createDefaultSpreadsheetWorkbook()}
      canEdit
      selectedCell={{ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 }}
      onSelectedCellChange={() => {}}
      onSelectionChange={onSelectionChange}
      onWorkbookChange={() => {}}
      collaborators={[{
        session_id: 'remote-session',
        user_id: 2,
        user_name: '协作者乙',
        color: '#389e0d',
        sheet_id: 'sheet_1',
        selection: { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 },
      }]}
    />
  ));

  expect(container.querySelector('[data-spreadsheet-online-collaborators="true"]')?.getAttribute('aria-label'))
    .toBe('1 位协作者在线');
  const remoteCell = container.querySelector('[data-spreadsheet-remote-selection="remote-session"]');
  expect(remoteCell).not.toBeNull();
  expect(remoteCell.style.boxShadow).toContain('#389e0d');

  const localCell = container.querySelector('[data-spreadsheet-row-index="1"][data-spreadsheet-column-index="1"]');
  expect(localCell).not.toBeNull();
  act(() => localCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  expect(onSelectionChange).toHaveBeenLastCalledWith({
    sheetId: 'sheet_1',
    selection: { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 },
  });

  act(() => root.unmount());
  container.remove();
});

test('undoes and redoes a formula-bar edit as one committed action', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ControlledSpreadsheetEditor />));

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  const formulaInput = container.querySelector('[data-spreadsheet-formula-input="true"]');
  act(() => formulaInput.focus());
  act(() => setInputValue(formulaInput, 'UNDO_SHOULD_REMOVE'));
  act(() => formulaInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('UNDO_SHOULD_REMOVE');

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })));
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('');

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })));
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('UNDO_SHOULD_REMOVE');

  act(() => root.unmount());
  container.remove();
});

test('keeps direct cell editing in the same undo and redo history', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ControlledSpreadsheetEditor />));

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  const firstCell = container.querySelector('[role="gridcell"]');
  act(() => firstCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  const cellInput = firstCell.querySelector('input');
  act(() => setInputValue(cellInput, 'DIRECT_EDIT'));
  act(() => cellInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  expect([...container.querySelectorAll('[role="gridcell"]')].some(cell => cell.textContent === 'DIRECT_EDIT')).toBe(true);

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
  expect([...container.querySelectorAll('[role="gridcell"]')].some(cell => cell.textContent === 'DIRECT_EDIT')).toBe(false);

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true })));
  expect([...container.querySelectorAll('[role="gridcell"]')].some(cell => cell.textContent === 'DIRECT_EDIT')).toBe(true);

  act(() => root.unmount());
  container.remove();
});

test('renames referenced sheets and undoes or redoes the migration atomically', async () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].cells = { B2: { v: '15' } };
  workbook.sheets.push({
    ...createDefaultSpreadsheetSheet(1),
    id: 'formula',
    name: '公式表',
    cells: { D2: { v: '=工作表1!B2' } },
  });
  let latestWorkbook = workbook;
  let renameDialog;
  const confirmSpy = jest.spyOn(Modal, 'confirm').mockImplementation(config => {
    renameDialog = config;
    return { destroy() {}, update() {} };
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const sourceSheetButton = [...container.querySelectorAll('button')].find(button => button.textContent === '工作表1');
  act(() => sourceSheetButton.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(renameDialog).toBeTruthy();
  act(() => renameDialog.content.props.onChange({ target: { value: '源数据' } }));
  await act(async () => renameDialog.onOk());
  expect(latestWorkbook.sheets[0].name).toBe('源数据');
  expect(latestWorkbook.sheets[1].cells.D2.v).toBe('=源数据!B2');

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  const formulaSheetButton = [...container.querySelectorAll('button')].find(button => button.textContent === '公式表');
  act(() => formulaSheetButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(latestWorkbook.activeSheetId).toBe('formula');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })));
  expect(latestWorkbook.sheets[0].name).toBe('工作表1');
  expect(latestWorkbook.sheets[1].cells.D2.v).toBe('=工作表1!B2');

  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })));
  expect(latestWorkbook.sheets[0].name).toBe('源数据');
  expect(latestWorkbook.sheets[1].cells.D2.v).toBe('=源数据!B2');

  confirmSpy.mockRestore();
  act(() => root.unmount());
  container.remove();
});

test('keeps sheet-name validation inside the dialog and saves after the error is corrected', () => {
  const workbook = createDefaultSpreadsheetWorkbook();
  workbook.sheets[0].name = 'QA_R13_RENAMED';
  workbook.sheets.push({
    ...createDefaultSpreadsheetSheet(1),
    id: 'qa-r13-calc',
    name: 'QA_R13_CALC',
  });
  let latestWorkbook = workbook;
  let renameDialog;
  const confirmSpy = jest.spyOn(Modal, 'confirm').mockImplementation(config => {
    renameDialog = config;
    return { destroy() {}, update() {} };
  });
  const container = document.createElement('div');
  const dialogContainer = document.createElement('div');
  document.body.append(container, dialogContainer);
  const root = createRoot(container);
  const dialogRoot = createRoot(dialogContainer);
  act(() => root.render(
    <ControlledSpreadsheetEditor
      initialWorkbook={workbook}
      onWorkbookChange={nextWorkbook => { latestWorkbook = nextWorkbook; }}
    />
  ));

  const targetSheetButton = [...container.querySelectorAll('button')]
    .find(button => button.textContent === 'QA_R13_CALC');
  act(() => targetSheetButton.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  act(() => dialogRoot.render(renameDialog.content));
  const renameInput = dialogContainer.querySelector('input');
  const close = jest.fn();
  const expectInvalidName = (name, error) => {
    act(() => setInputValue(renameInput, name));
    expect(() => act(() => renameDialog.onOk(close))).not.toThrow();
    expect(dialogContainer.querySelector('[role="alert"]').textContent).toBe(error);
    expect(renameInput.getAttribute('aria-invalid')).toBe('true');
    expect(close).not.toHaveBeenCalled();
    expect(latestWorkbook.sheets.map(sheet => sheet.name)).toEqual(['QA_R13_RENAMED', 'QA_R13_CALC']);
  };

  expectInvalidName('', '工作表名称不能为空');
  expectInvalidName('A'.repeat(32), '工作表名称不能超过 31 个字符');
  expectInvalidName('预算/明细', '工作表名称不能包含 \\ / ? * [ ] :');
  expectInvalidName("'明细", '工作表名称不能以英文单引号开头或结尾');
  expectInvalidName('QA_R13_RENAMED', '工作表名称不能重复');

  act(() => setInputValue(renameInput, 'QA_R13_FIXED'));
  expect(dialogContainer.querySelector('[role="alert"]')).toBeNull();
  expect(renameInput.getAttribute('aria-invalid')).toBe('false');
  act(() => renameDialog.onOk(close));
  expect(close).toHaveBeenCalledTimes(1);
  expect(latestWorkbook.sheets.map(sheet => sheet.name)).toEqual(['QA_R13_RENAMED', 'QA_R13_FIXED']);
  expect(container.querySelector('[aria-label="在线表格编辑区"]')).not.toBeNull();

  confirmSpy.mockRestore();
  act(() => dialogRoot.unmount());
  act(() => root.unmount());
  dialogContainer.remove();
  container.remove();
});

test('bounds workbook undo history while preserving the newest actions', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ControlledSpreadsheetEditor />));

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  const formulaInput = container.querySelector('[data-spreadsheet-formula-input="true"]');
  for (let index = 1; index <= 35; index += 1) {
    act(() => formulaInput.focus());
    act(() => setInputValue(formulaInput, String(index)));
    act(() => formulaInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  }
  for (let index = 0; index < 30; index += 1) {
    act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
  }
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('5');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
  expect(container.querySelector('[data-spreadsheet-formula-input="true"]').value).toBe('5');

  act(() => root.unmount());
  container.remove();
});
