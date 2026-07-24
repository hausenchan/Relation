import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListMedia = jest.fn();
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
  mockListUsers.mockResolvedValue([]);
  mockListAttachments.mockResolvedValue([]);
});

test('moves row operations into the media cell contextual menu', async () => {
  localStorage.clear();
  mockListMedia.mockResolvedValueOnce([
    {
      id: 7,
      cid: '100026',
      media_name: '小蚕惠生活-安卓',
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
  expect(container.querySelector('button[aria-label="更多操作：只读媒体"]')).not.toBeNull();

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
