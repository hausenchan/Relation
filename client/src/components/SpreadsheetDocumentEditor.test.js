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
}) {
  const [workbook, setWorkbook] = React.useState(initialWorkbook);
  const [selectedCell, setSelectedCell] = React.useState(initialSelectedCell);
  return (
    <SpreadsheetDocumentEditor
      workbook={workbook}
      canEdit
      selectedCell={selectedCell}
      onSelectedCellChange={setSelectedCell}
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

test('leaves single-value paste events inside the cell editor to native editing', () => {
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

  const firstCell = container.querySelector('[role="gridcell"]');
  act(() => firstCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  const cellInput = firstCell.querySelector('input');
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: { getData: type => type === 'text/plain' ? 'alpha' : '' },
  });
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
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 0, columns: 5 });
  await clickFreezeItem('冻结至当前行和列（5 行 | 5 列）');
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 5 });

  const editor = container.querySelector('[aria-label="在线表格编辑区"]');
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 0, columns: 5 });
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
  expect(latestWorkbook.sheets[0].frozen).toEqual({ rows: 5, columns: 5 });

  await clickFreezeItem('取消冻结');
  expect(latestWorkbook.sheets[0].frozen).toBeNull();

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
  const fileInput = container.querySelector('input[type="file"]');
  const formulaInput = container.querySelector('[data-spreadsheet-formula-input="true"]');
  expect(importButton.disabled).toBe(true);
  expect(freezeTrigger.disabled).toBe(true);
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
