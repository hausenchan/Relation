import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const mockListTemplates = jest.fn();
const mockListProxies = jest.fn();
const mockCreateProxy = jest.fn();
const mockUpdateProxy = jest.fn();
const mockDeleteProxy = jest.fn();
const mockCanWrite = jest.fn();
const mockModalConfirm = jest.fn();

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => ({ md: true }),
    },
    Modal: Object.assign(actual.Modal, {
      confirm: (...args) => mockModalConfirm(...args),
    }),
  };
});

jest.mock('../api', () => ({
  productTemplatesApi: {
    list: (...args) => mockListTemplates(...args),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    preview: jest.fn(),
    runtimeCheck: jest.fn(),
  },
  productReleaseProxiesApi: {
    list: (...args) => mockListProxies(...args),
    get: jest.fn(),
    create: (...args) => mockCreateProxy(...args),
    update: (...args) => mockUpdateProxy(...args),
    delete: (...args) => mockDeleteProxy(...args),
  },
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin' },
    canWrite: (...args) => mockCanWrite(...args),
  }),
}));

import ProductTemplates from './ProductTemplates';

async function flushUi(ms = 0) {
  await new Promise(resolve => window.setTimeout(resolve, ms));
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi();
  });
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
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
  jest.clearAllMocks();
  mockCanWrite.mockReturnValue(true);
  mockListTemplates.mockResolvedValue([]);
  mockCreateProxy.mockResolvedValue({ id: 2 });
  mockUpdateProxy.mockResolvedValue({ success: true });
  mockDeleteProxy.mockResolvedValue({ success: true });
  mockListProxies.mockResolvedValue([{
    id: 1,
    name: '默认出口',
    protocol: 'http',
    host: '127.0.0.1',
    port: 8080,
    domain_suffixes: ['*'],
    priority: 100,
    status: 'enabled',
    has_auth: false,
    updated_at: '2026-07-30T10:00:00.000Z',
  }]);
});

test('shows template and proxy tabs and loads proxy records', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<MemoryRouter><ProductTemplates /></MemoryRouter>);
    await flushUi();
  });

  expect(document.body.textContent).toContain('模版');
  expect(document.body.textContent).toContain('代理');
  const proxyTab = Array.from(document.body.querySelectorAll('.ant-tabs-tab-btn')).find(node => node.textContent === '代理');
  expect(proxyTab).toBeDefined();
  await click(proxyTab);
  expect(document.body.textContent).toContain('默认出口');
  expect(document.body.textContent).toContain('127.0.0.1:8080');

  act(() => root.unmount());
  container.remove();
});

test('hides proxy write actions for readonly users', async () => {
  mockCanWrite.mockReturnValue(false);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<MemoryRouter><ProductTemplates /></MemoryRouter>);
    await flushUi();
  });
  const proxyTab = Array.from(document.body.querySelectorAll('.ant-tabs-tab-btn')).find(node => node.textContent === '代理');
  await click(proxyTab);
  expect(document.body.textContent).not.toContain('新增代理');
  expect(document.body.textContent).toContain('默认出口');

  act(() => root.unmount());
  container.remove();
});

test('opens proxy tab from the URL and sends filter parameters', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/product-templates?tab=proxy']}><ProductTemplates /></MemoryRouter>);
    await flushUi();
  });
  expect(document.body.textContent).toContain('默认出口');
  const suffixInput = document.body.querySelector('input[placeholder="域名后缀"]');
  expect(suffixInput).toBeDefined();
  await act(async () => {
    setInputValue(suffixInput, 'example.com');
    await flushUi();
  });
  expect(mockListProxies).toHaveBeenLastCalledWith({ domain_suffix: 'example.com' });

  act(() => root.unmount());
  container.remove();
});

test('creates, edits, and deletes a proxy through the write controls', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/product-templates?tab=proxy']}><ProductTemplates /></MemoryRouter>);
    await flushUi();
  });
  await click(Array.from(document.body.querySelectorAll('button')).find(button => button.textContent.includes('新增代理')));
  const modal = Array.from(document.body.querySelectorAll('.ant-modal')).find(node => node.textContent.includes('新增代理配置'));
  expect(modal).toBeDefined();
  await act(async () => {
    setInputValue(modal.querySelector('input[placeholder="例如：支付宝生产出口"]'), '集成代理');
    setInputValue(modal.querySelector('input[placeholder="代理服务器地址"]'), '127.0.0.1');
    await flushUi();
  });
  await click(Array.from(modal.querySelectorAll('button')).find(button => button.textContent.replace(/\s+/g, '') === '保存'));
  await act(async () => { await flushUi(); });
  expect(mockCreateProxy).toHaveBeenCalledWith(expect.objectContaining({
    name: '集成代理',
    host: '127.0.0.1',
    domain_suffixes: ['*'],
  }));

  await click(Array.from(document.body.querySelectorAll('button')).find(button => button.textContent.replace(/\s+/g, '') === '编辑'));
  const editModal = Array.from(document.body.querySelectorAll('.ant-modal')).find(node => node.textContent.includes('编辑代理配置'));
  expect(editModal).toBeDefined();
  await click(Array.from(editModal.querySelectorAll('.ant-checkbox-wrapper')).find(node => node.textContent.includes('清除密码')));
  await click(Array.from(editModal.querySelectorAll('button')).find(button => button.textContent.replace(/\s+/g, '') === '保存'));
  await act(async () => { await flushUi(); });
  expect(mockUpdateProxy).toHaveBeenCalledWith(1, expect.objectContaining({ clear_password: true }));

  act(() => root.unmount());
  container.remove();

  const secondContainer = document.createElement('div');
  document.body.appendChild(secondContainer);
  const secondRoot = createRoot(secondContainer);
  await act(async () => {
    secondRoot.render(<MemoryRouter initialEntries={['/product-templates?tab=proxy']}><ProductTemplates /></MemoryRouter>);
    await flushUi();
  });
  await click(Array.from(document.body.querySelectorAll('button')).find(button => button.textContent.replace(/\s+/g, '') === '删除'));
  expect(mockModalConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除代理配置' }));
  await act(async () => {
    await mockModalConfirm.mock.calls[0][0].onOk();
    await flushUi();
  });
  expect(mockDeleteProxy).toHaveBeenCalledWith(1);

  act(() => secondRoot.unmount());
  secondContainer.remove();
});
