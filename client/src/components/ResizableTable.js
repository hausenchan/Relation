import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Table } from 'antd';

const DEFAULT_MIN_WIDTH = 72;
const DEFAULT_COLUMN_WIDTH = 160;

export const resizableTableComponents = {
  header: {
    cell: ResizableTitle,
  },
};

function ResizableTitle({ onResize, width, minWidth = DEFAULT_MIN_WIDTH, children, ...restProps }) {
  if (!width || !onResize) {
    return <th {...restProps}>{children}</th>;
  }

  const handleMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      onResize(Math.max(minWidth, startWidth + moveEvent.clientX - startX));
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <th {...restProps} style={{ ...restProps.style, position: 'relative' }}>
      {children}
      <span
        role="separator"
        aria-orientation="vertical"
        title="拖动调整列宽"
        onMouseDown={handleMouseDown}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: -4,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          userSelect: 'none',
          zIndex: 2,
        }}
      />
    </th>
  );
}

function getColumnKey(column, index) {
  if (column.key) return String(column.key);
  if (Array.isArray(column.dataIndex)) return column.dataIndex.join('.');
  if (column.dataIndex) return String(column.dataIndex);
  if (typeof column.title === 'string') return column.title;
  return `column_${index}`;
}

function readSavedWidths(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch {
    return {};
  }
}

export function useResizableColumns(storageKey, columns, options = {}) {
  const defaultWidth = options.defaultWidth || DEFAULT_COLUMN_WIDTH;
  const minWidth = options.minWidth || DEFAULT_MIN_WIDTH;
  const minWidths = options.minWidths || {};
  const [widths, setWidths] = useState(() => readSavedWidths(storageKey));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  const resizeColumn = useCallback((columnKey, width) => {
    setWidths(prev => ({ ...prev, [columnKey]: Math.round(width) }));
  }, []);

  const resizableColumns = useMemo(() => {
    return columns.map((column, index) => {
      const columnKey = getColumnKey(column, index);
      const columnMinWidth = minWidths[columnKey] || minWidth;
      const savedWidth = Number(widths[columnKey]);
      const baseWidth = Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : (column.width || defaultWidth);
      const width = Math.max(columnMinWidth, baseWidth);
      const originalOnHeaderCell = column.onHeaderCell;

      return {
        ...column,
        width,
        onHeaderCell: (...args) => ({
          ...(typeof originalOnHeaderCell === 'function' ? originalOnHeaderCell(...args) : {}),
          width,
          minWidth: columnMinWidth,
          onResize: (nextWidth) => resizeColumn(columnKey, nextWidth),
        }),
      };
    });
  }, [columns, defaultWidth, minWidth, minWidths, resizeColumn, widths]);

  const scrollX = useMemo(() => {
    return resizableColumns.reduce((sum, column) => sum + (Number(column.width) || defaultWidth), 0);
  }, [defaultWidth, resizableColumns]);

  return { columns: resizableColumns, scrollX, widths };
}

export default function ResizableTable({ storageKey, columns, scroll, resizableOptions, ...tableProps }) {
  const { columns: resizableColumns, scrollX } = useResizableColumns(storageKey, columns, resizableOptions);

  return (
    <Table
      {...tableProps}
      columns={resizableColumns}
      components={resizableTableComponents}
      scroll={{ ...(scroll || {}), x: scroll?.x || scrollX }}
    />
  );
}
