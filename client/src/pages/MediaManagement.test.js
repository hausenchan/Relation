import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListMedia = jest.fn();
const mockGetMedia = jest.fn();
const mockListUsers = jest.fn();
const mockListAttachments = jest.fn();

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => ({ md: true }),
    },
  };
});

jest.mock('../api', () => ({
  documentsApi: {
    listAttachments: (...args) => mockListAttachments(...args),
  },
  mediaManagementApi: {
    list: (...args) => mockListMedia(...args),
    get: (...args) => mockGetMedia(...args),
  },
  usersApi: {
    listSimple: (...args) => mockListUsers(...args),
  },
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin' },
    canWrite: () => true,
  }),
}));

jest.mock('./Documents', () => () => <div data-testid="embedded-document" />);

import MediaManagement from './MediaManagement';

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    disconnect() {}
  };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterAll(() => {
  delete global.ResizeObserver;
});

beforeEach(() => {
  mockListMedia.mockResolvedValue([]);
  mockGetMedia.mockResolvedValue(null);
  mockListUsers.mockResolvedValue([]);
  mockListAttachments.mockResolvedValue([]);
});

test('moves row operations into a leading contextual menu column', async () => {
  localStorage.clear();
  mockListMedia.mockResolvedValueOnce([
    {
      id: 7,
      cid: '100026',
      media_name: '小蚕惠生活-安卓',
      endpoint_description: '安卓-100026/iOS-100027/极速版-100028/鸿蒙-100029/平板版-100030',
      can_edit: 1,
      can_delete: 1,
      budget_types: [],
    },
    {
      id: 8,
      cid: '100027',
      media_name: '只读媒体',
      can_edit: 0,
      can_delete: 0,
      budget_types: [],
    },
  ]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<MediaManagement />);
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 260));
  });

  const headers = Array.from(container.querySelectorAll('th')).map(node => node.textContent.trim());
  expect(headers).not.toContain('操作');
  const editableMoreButton = container.querySelector('button[aria-label="更多操作：小蚕惠生活-安卓"]');
  expect(editableMoreButton).not.toBeNull();
  expect(editableMoreButton.closest('td')?.className).toContain('media-management-row-action-cell');
  expect(container.querySelector('button[aria-label="更多操作：只读媒体"]')).not.toBeNull();
  const endpointDescription = '安卓-100026/iOS-100027/极速版-100028/鸿蒙-100029/平板版-100030';
  expect(container.textContent).toContain(endpointDescription);
  expect(container.textContent).not.toContain('文档 #');
  expect(container.querySelector('.media-management-table table')?.style.tableLayout).toBe('fixed');
  const columnWidths = Array.from(container.querySelectorAll('.media-management-table col'))
    .map(column => column.style.width);
  expect(columnWidths[2]).toBe('168px');
  const endpointNode = container.querySelector('.media-management-endpoint-description');
  expect(endpointNode).not.toBeNull();
  await act(async () => {
    endpointNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(resolve => window.setTimeout(resolve, 150));
  });
  expect(document.body.querySelector('.ant-tooltip-inner')?.textContent).toBe(endpointDescription);

  await act(async () => {
    editableMoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  const menuItems = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
    .map(node => node.textContent.trim());
  expect(menuItems).toEqual(expect.arrayContaining(['查看详情', '编辑媒体', '删除媒体']));

  act(() => root.unmount());
  container.remove();
});

test('deduplicates repeated row double clicks and ignores drawer mask clicks', async () => {
  localStorage.clear();
  const record = {
    id: 9,
    cid: '100029',
    media_name: '稳定媒体',
    document_id: 29,
    can_edit: 1,
    can_delete: 0,
    budget_types: [],
  };
  let resolveDetail;
  mockListMedia.mockResolvedValueOnce([record]);
  mockGetMedia.mockImplementationOnce(() => new Promise(resolve => {
    resolveDetail = resolve;
  }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<MediaManagement />);
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 260));
  });

  const mediaName = Array.from(container.querySelectorAll('button'))
    .find(button => button.textContent.includes(record.media_name));
  const row = mediaName?.closest('tr');
  expect(row).not.toBeNull();
  await act(async () => {
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await Promise.resolve();
  });
  expect(mockGetMedia).toHaveBeenCalledTimes(1);
  expect(document.body.querySelector('.ant-drawer-open')).not.toBeNull();

  const mask = document.body.querySelector('.ant-drawer-mask');
  expect(mask).not.toBeNull();
  await act(async () => {
    mask.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(document.body.querySelector('.ant-drawer-open')).not.toBeNull();

  await act(async () => {
    resolveDetail(record);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  expect(mockListAttachments).toHaveBeenCalledWith(record.document_id);
  expect(document.body.querySelector('.ant-drawer-open')).not.toBeNull();
  expect(document.body.querySelector('[data-testid="embedded-document"]')).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});
