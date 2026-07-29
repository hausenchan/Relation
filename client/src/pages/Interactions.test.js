import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListInteractions = jest.fn();
const mockListPersons = jest.fn();
const mockListUsers = jest.fn();

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => ({ md: false }),
    },
  };
});

jest.mock('../api', () => ({
  interactionsApi: {
    list: (...args) => mockListInteractions(...args),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  personsApi: {
    list: (...args) => mockListPersons(...args),
  },
  usersApi: {
    listSimple: (...args) => mockListUsers(...args),
  },
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', display_name: '管理员' } }),
}));

jest.mock('../components/AttachmentList', () => () => null);
jest.mock('../components/RichText', () => ({
  RichTextEditor: () => null,
  RichTextView: ({ value }) => String(value || ''),
  richTextToPlain: value => String(value || ''),
}));

import Interactions from './Interactions';

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findButton(text) {
  const normalizedText = String(text || '').replace(/\s+/g, '');
  return Array.from(document.body.querySelectorAll('button'))
    .find(button => button.textContent.replace(/\s+/g, '') === normalizedText);
}

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
  mockListInteractions.mockResolvedValue([{
    id: 7,
    person_name: '杨柳',
    company_name: '小蚕惠生活',
    created_by: 2,
    created_by_name: '张学成',
    person_category: 'business',
    type: 'visit',
    importance: 'medium',
    city: '杭州',
    weight: 'medium',
    date: '2026-07-28',
  }]);
  mockListPersons.mockResolvedValue([]);
  mockListUsers.mockResolvedValue([
    { id: 1, display_name: '管理员' },
    { id: 2, display_name: '张学成' },
  ]);
});

test('shows the creator on mobile cards and applies text filters from the drawer', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Interactions />);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  expect(container.textContent).toContain('创建人：张学成');
  expect(container.querySelector('input[placeholder="搜索公司、姓名、描述、结果"]')).toBeNull();

  const filterButton = findButton('筛选');
  expect(filterButton).not.toBeNull();
  await act(async () => {
    filterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  const keywordInput = document.body.querySelector('input[placeholder="搜索公司、姓名、描述、结果"]');
  const cityInput = document.body.querySelector('input[placeholder="城市"]');
  expect(keywordInput).not.toBeNull();
  expect(cityInput).not.toBeNull();

  await act(async () => {
    setInputValue(keywordInput, '小蚕');
    setInputValue(cityInput, '杭州');
  });

  const completeButton = findButton('完成');
  expect(completeButton).toBeDefined();
  await act(async () => {
    completeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  expect(mockListInteractions).toHaveBeenLastCalledWith({ search: '小蚕', city: '杭州' });

  act(() => root.unmount());
  container.remove();
});
