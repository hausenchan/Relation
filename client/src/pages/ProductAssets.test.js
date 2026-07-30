import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListAssets = jest.fn();
const mockGetAsset = jest.fn();
const mockCreateRelease = jest.fn();
const mockGetReleaseTask = jest.fn();
const mockListReleases = jest.fn();
const mockListUsers = jest.fn();
const mockListSubjects = jest.fn();
const mockGetSubject = jest.fn();
const mockListTemplates = jest.fn();
const mockModalConfirm = jest.fn();
const mockMessageError = jest.fn();

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
    message: Object.assign(actual.message, {
      error: (...args) => mockMessageError(...args),
    }),
  };
});

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

jest.mock('../api', () => ({
  companySubjectsApi: {
    simple: (...args) => mockListSubjects(...args),
    get: (...args) => mockGetSubject(...args),
  },
  productAssetsApi: {
    list: (...args) => mockListAssets(...args),
    get: (...args) => mockGetAsset(...args),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    importPreview: jest.fn(),
    import: jest.fn(),
    createReduction: jest.fn(),
    updateReduction: jest.fn(),
    deleteReduction: jest.fn(),
    createRelease: (...args) => mockCreateRelease(...args),
    getReleaseTask: (...args) => mockGetReleaseTask(...args),
    cancelReleaseTask: jest.fn(),
    listReleases: (...args) => mockListReleases(...args),
  },
  productTemplatesApi: {
    list: (...args) => mockListTemplates(...args),
  },
  usersApi: {
    listSimple: (...args) => mockListUsers(...args),
  },
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', display_name: '管理员' },
    canWrite: () => true,
  }),
}));

jest.mock('../components/ResizableTable', () => function MockResizableTable({ columns, dataSource, rowKey }) {
  return (
    <table>
      <tbody>
        {dataSource.map(record => (
          <tr key={record[rowKey]}>
            {columns.map(column => (
              <td key={column.key || column.dataIndex}>
                {column.render ? column.render(record[column.dataIndex], record) : record[column.dataIndex]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
});

import ProductAssets from './ProductAssets';

function findButton(text) {
  const normalizedText = String(text || '').replace(/\s+/g, '');
  return Array.from(document.body.querySelectorAll('button'))
    .find(button => button.textContent.replace(/\s+/g, '') === normalizedText);
}

function findButtonIncluding(text) {
  return Array.from(document.body.querySelectorAll('button'))
    .find(button => button.textContent.includes(text));
}

async function flushUi(ms = 0) {
  await new Promise(resolve => window.setTimeout(resolve, ms));
}

async function waitFor(assertion, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = assertion();
      return value;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await flushUi();
      });
    }
  }
  throw lastError;
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

async function selectTemplate(templateText) {
  const releaseModal = Array.from(document.body.querySelectorAll('.ant-modal'))
    .find(modal => modal.textContent.includes('产品资产提版'));
  expect(releaseModal).toBeDefined();

  const selector = Array.from(releaseModal.querySelectorAll('.ant-select-selector')).pop();
  expect(selector).toBeDefined();
  await act(async () => {
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi();
  });

  const option = await waitFor(() => {
    const matched = Array.from(document.body.querySelectorAll('.ant-select-item-option-content'))
      .find(node => node.textContent.includes(templateText));
    expect(matched).toBeDefined();
    return matched;
  });
  await click(option);
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
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || jest.fn();
});

afterAll(() => {
  delete global.ResizeObserver;
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockListAssets.mockResolvedValue([{
    id: 1,
    app_name: '测试产品',
    group_name: '测试集团',
    company_entity: '测试主体',
    company_subject_id: 11,
    budget_type: 'zhixiao',
    platform: 'mini_program',
    launch_status: 'launched_available',
    appid: '2021005195649602',
    owner_name: '管理员',
    reduction_count: 0,
  }]);
  mockGetAsset.mockResolvedValue({ id: 1, app_name: '测试产品' });
  mockCreateRelease.mockResolvedValue({
    id: 88,
    status: 'success',
    proxy_summary: [
      { field: 'api_domain', hostname: 'api.example.test', proxy_name: '默认出口' },
      { field: 'analytics_domain', hostname: 'analytics.example.test', proxy_name: '默认出口' },
      { field: 'cdn_domain', hostname: 'cdn.example.test', proxy_name: '默认出口' },
    ],
  });
  mockGetReleaseTask.mockResolvedValue({ task: { id: 88, status: 'success' } });
  mockListReleases.mockResolvedValue([]);
  mockListUsers.mockResolvedValue([]);
  mockListSubjects.mockResolvedValue([]);
  mockGetSubject.mockResolvedValue({
    id: 11,
    company_entity: '测试主体',
    api_domain: 'https://api.example.test',
    analytics_domain: 'https://analytics.example.test',
    cdn_domain: 'https://cdn.example.test',
    short_drama_domain: '',
    has_identity_key_file: true,
  });
  mockListTemplates.mockResolvedValue([{
    id: 2,
    name: '普通模版',
    version: 'v1',
    status: 'enabled',
    budget_type: 'zhixiao',
    template_type: 'standard',
    project_path: 'offer-wall/newsWall',
  }]);
});

test('does not open product details after confirming a release task', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ProductAssets />);
    await flushUi();
  });

  const releaseButton = await waitFor(() => {
    const button = findButton('提版');
    expect(button).toBeDefined();
    return button;
  });
  await click(releaseButton);

  await waitFor(() => expect(mockGetSubject).toHaveBeenCalledWith(11));
  await selectTemplate('普通模版');
  const appIdInput = document.body.querySelector('.ant-modal input');
  expect(appIdInput.value).toBe('2021005195649602');
  await act(async () => {
    setInputValue(appIdInput, '2021005195649602');
    await flushUi();
  });

  const submitButton = await waitFor(() => {
    const button = findButton('确认参数');
    expect(button).toBeDefined();
    return button;
  });
  await click(submitButton);

  const confirmConfig = await waitFor(() => {
    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    return mockModalConfirm.mock.calls[0][0];
  });
  await act(async () => {
    await confirmConfig.onOk();
    await flushUi();
  });

  expect(mockCreateRelease).toHaveBeenCalledWith(1, {
    app_id: '2021005195649602',
    template_id: 2,
  });
  expect(mockGetAsset).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('产品资产详情');
  expect(document.body.textContent).toContain('提版执行进度');
  expect(document.body.textContent).toContain('已匹配 3 个提版域名代理');
  expect(document.body.textContent).toContain('api.example.test · 默认出口');

  act(() => root.unmount());
  container.remove();
});

test('refreshes product assets after a release task reaches success', async () => {
  const baseAsset = {
    id: 1,
    app_name: '测试产品',
    group_name: '测试集团',
    company_entity: '测试主体',
    company_subject_id: 11,
    budget_type: 'zhixiao',
    platform: 'mini_program',
    launch_status: 'launched_available',
    appid: '2021005195649602',
    owner_name: '管理员',
    reduction_count: 0,
  };
  mockListAssets
    .mockResolvedValueOnce([baseAsset])
    .mockResolvedValueOnce([baseAsset])
    .mockResolvedValueOnce([{
      ...baseAsset,
      last_release_template_name: '普通模版',
      last_release_status: 'success',
    }]);
  mockCreateRelease.mockResolvedValueOnce({ id: 89, status: 'running' });
  mockGetReleaseTask.mockResolvedValueOnce({
    task: {
      id: 89,
      status: 'success',
      status_label: '已完成',
      current_step: 'completed',
      app_id: '2021005195649602',
      log_text: '上传完成',
    },
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ProductAssets />);
    await flushUi();
  });

  const releaseButton = await waitFor(() => {
    const button = findButton('提版');
    expect(button).toBeDefined();
    return button;
  });
  await click(releaseButton);
  await selectTemplate('普通模版');

  const submitButton = await waitFor(() => {
    const button = findButton('确认参数');
    expect(button).toBeDefined();
    return button;
  });
  await click(submitButton);
  const confirmConfig = await waitFor(() => mockModalConfirm.mock.calls[0][0]);
  await act(async () => {
    await confirmConfig.onOk();
    await flushUi(1700);
  });

  await waitFor(() => expect(mockGetReleaseTask).toHaveBeenCalledWith(89));
  await waitFor(() => expect(mockListAssets).toHaveBeenCalledTimes(3));
  expect(document.body.textContent).toContain('普通模版');
  expect(document.body.textContent).toContain('已完成');

  act(() => root.unmount());
  container.remove();
});

test('shows the server error when release proxy matching is missing', async () => {
  mockCreateRelease.mockRejectedValueOnce({
    response: { data: { error: '提版信息不完整：以下域名没有匹配到启用的 IP 代理：API 域名' } },
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ProductAssets />);
    await flushUi();
  });
  await click(await waitFor(() => {
    const button = findButton('提版');
    expect(button).toBeDefined();
    return button;
  }));
  await selectTemplate('普通模版');
  await click(await waitFor(() => {
    const button = findButton('确认参数');
    expect(button).toBeDefined();
    return button;
  }));
  const confirmConfig = await waitFor(() => mockModalConfirm.mock.calls[0][0]);
  await act(async () => {
    await expect(confirmConfig.onOk()).rejects.toEqual(expect.objectContaining({
      response: expect.objectContaining({ data: expect.objectContaining({ error: expect.stringContaining('IP 代理') }) }),
    }));
    await flushUi();
  });
  expect(mockMessageError).toHaveBeenCalledWith(expect.stringContaining('IP 代理'));
  expect(document.body.textContent).not.toContain('已匹配 3 个提版域名代理');

  act(() => root.unmount());
  container.remove();
});
