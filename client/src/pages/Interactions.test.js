import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListInteractions = jest.fn();
const mockListPersons = jest.fn();
const mockListUsers = jest.fn();
const mockDeleteInteraction = jest.fn();
let mockBreakpointState = { md: false };

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => mockBreakpointState,
    },
  };
});

jest.mock('../api', () => ({
  interactionsApi: {
    list: (...args) => mockListInteractions(...args),
    create: jest.fn(),
    update: jest.fn(),
    delete: (...args) => mockDeleteInteraction(...args),
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
  RichTextEditor: ({ value, onChange, placeholder }) => (
    <textarea
      data-rich-text-editor="true"
      aria-label={placeholder}
      value={value || ''}
      onChange={event => onChange?.(event.target.value)}
    />
  ),
  RichTextView: ({ value }) => String(value || '').replace(/<[^>]+>/g, ''),
  richTextToPlain: value => String(value || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim(),
}));

import Interactions, {
  buildInteractionPersonSelectOptions,
  filterInteractionPersonOption,
} from './Interactions';

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

async function flushUi() {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

async function renderInteractions() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Interactions />);
    await flushUi();
  });
  await act(flushUi);

  return { container, root };
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUi();
  });
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
  jest.clearAllMocks();
  localStorage.clear();
  mockBreakpointState = { md: false };
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
    description: '围绕年度合作计划沟通下一步安排',
    outcome: '确认试点范围',
    next_action: '发送合作方案',
    opportunity_title: '年度联合增长项目',
    opportunity_status: 'following',
    opportunity_type: '增长-客户',
  }]);
  mockListPersons.mockResolvedValue([]);
  mockListUsers.mockResolvedValue([
    { id: 1, display_name: '管理员' },
    { id: 2, display_name: '张学成' },
  ]);
  mockDeleteInteraction.mockResolvedValue({ success: true });
});

test('renders concise mobile metadata and applies text filters from the drawer', async () => {
  const { container, root } = await renderInteractions();

  const card = container.querySelector('.interaction-mobile-card');
  expect(card).not.toBeNull();
  expect(card.getAttribute('role')).toBe('button');
  expect(card.getAttribute('tabindex')).toBe('0');
  expect(card.textContent).toContain('信息·中等');
  expect(card.textContent).toContain('杭州 · 创建人 张学成 · 人脉权重 中');
  expect(card.textContent).not.toContain('medium');
  expect(card.textContent).not.toContain('编辑');
  expect(card.textContent).not.toContain('删除');
  expect(container.querySelector('input[placeholder="搜索公司、姓名、描述、结果"]')).toBeNull();

  const filterButton = findButton('筛选');
  expect(filterButton).not.toBeNull();
  await click(filterButton);

  const keywordInput = document.body.querySelector('input[placeholder="搜索公司、姓名、描述、结果"]');
  const cityInput = document.body.querySelector('input[placeholder="城市"]');
  expect(keywordInput).not.toBeNull();
  expect(cityInput).not.toBeNull();

  await act(() => {
    setInputValue(keywordInput, '小蚕');
    setInputValue(cityInput, '杭州');
  });

  const completeButton = findButton('完成');
  expect(completeButton).toBeDefined();
  await click(completeButton);

  expect(mockListInteractions).toHaveBeenLastCalledWith({ search: '小蚕', city: '杭州' });

  act(() => root.unmount());
  container.remove();
});

test('opens details from the whole card and keyboard without exposing raw weight enums', async () => {
  const { container, root } = await renderInteractions();
  const card = container.querySelector('.interaction-mobile-card');

  await click(card);
  expect(document.body.textContent).toContain('互动记录详情');
  expect(document.body.textContent).toContain('人脉权重');
  expect(document.body.textContent).not.toContain('medium');

  const detailMoreButton = document.body.querySelector('button[aria-label="更多互动记录操作"]');
  await click(detailMoreButton);
  const detailActionSheet = document.body.querySelector('.interaction-mobile-action-sheet');
  expect(detailActionSheet.textContent).toContain('编辑记录');
  const cancelActionButton = Array.from(detailActionSheet.querySelectorAll('button'))
    .find(button => button.textContent.includes('取消'));
  await click(cancelActionButton);
  expect(document.body.textContent).toContain('互动记录详情');

  const closeButton = findButton('关闭');
  await click(closeButton);

  await act(async () => {
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushUi();
  });
  expect(document.body.textContent).toContain('互动记录详情');

  act(() => root.unmount());
  container.remove();
});

test('keeps mobile deletion behind a confirmation step', async () => {
  const { container, root } = await renderInteractions();
  const moreButton = container.querySelector('button[aria-label="更多操作：杨柳"]');

  await click(moreButton);
  const actionSheet = document.body.querySelector('.interaction-mobile-action-sheet');
  const deleteButton = Array.from(actionSheet.querySelectorAll('button'))
    .find(button => button.textContent.includes('删除记录'));
  await click(deleteButton);

  expect(mockDeleteInteraction).not.toHaveBeenCalled();
  const confirmation = document.body.querySelector('.ant-modal-confirm');
  expect(confirmation).not.toBeNull();
  expect(confirmation.textContent).toContain('删除互动记录？');

  const cancelButton = Array.from(confirmation.querySelectorAll('button'))
    .find(button => button.textContent.replace(/\s+/g, '') === '取消');
  await click(cancelButton);
  expect(mockDeleteInteraction).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
});

test('opens the mobile action sheet from more without also opening details', async () => {
  const { container, root } = await renderInteractions();
  const moreButton = container.querySelector('button[aria-label="更多操作：杨柳"]');

  await click(moreButton);

  const actionSheet = document.body.querySelector('.interaction-mobile-action-sheet');
  expect(actionSheet).not.toBeNull();
  expect(actionSheet.textContent).toContain('编辑记录');
  expect(actionSheet.textContent).toContain('删除记录');
  expect(document.body.querySelector('.ant-modal-wrap')).toBeNull();

  await click(Array.from(actionSheet.querySelectorAll('button')).find(button => button.textContent.includes('编辑记录')));
  expect(document.body.textContent).toContain('编辑互动记录');

  act(() => root.unmount());
  container.remove();
});

test('reuses the interaction rich-text editor for all opportunity narrative fields', async () => {
  const { container, root } = await renderInteractions();

  await click(findButton('添加记录'));
  expect(document.body.textContent).toContain('添加互动记录');

  const collapseHeader = Array.from(document.body.querySelectorAll('.ant-collapse-header'))
    .find(header => header.textContent.includes('商机信息'));
  expect(collapseHeader).not.toBeUndefined();
  await click(collapseHeader);

  const editorLabels = Array.from(document.body.querySelectorAll('[data-rich-text-editor="true"]'))
    .map(editor => editor.getAttribute('aria-label'));
  expect(editorLabels).toEqual(expect.arrayContaining([
    '互动描述...',
    '互动结果或收获...',
    '下一步跟进事项...',
    '背景、需求或其他说明...',
    '当前商机跟进结果...',
  ]));
  expect(editorLabels).toHaveLength(5);

  act(() => root.unmount());
  container.remove();
});

test('builds searchable person options by name and company without string child assumptions', () => {
  const options = buildInteractionPersonSelectOptions([
    { id: 11, name: '侯笑', company: '集集星球' },
    { id: 12, name: '凌杰', company: '上海神营广告 AdSet' },
    { id: 13, name: '肖欣亮', current_company: '上海微联文化传媒有限公司' },
  ]);

  expect(options).toEqual([
    { value: 11, label: '侯笑（集集星球）' },
    { value: 12, label: '凌杰（上海神营广告 AdSet）' },
    { value: 13, label: '肖欣亮（上海微联文化传媒有限公司）' },
  ]);
  expect(options.filter(option => filterInteractionPersonOption('微联', option)).map(option => option.value))
    .toEqual([13]);
  expect(options.filter(option => filterInteractionPersonOption('侯笑', option)).map(option => option.value))
    .toEqual([11]);
  expect(() => filterInteractionPersonOption('微联', { children: <span>肖欣亮</span> })).not.toThrow();
});

test('omits the company row on mobile when the related person has no company', async () => {
  mockListInteractions.mockResolvedValueOnce([{
    id: 8,
    person_name: '无公司联系人',
    created_by: 2,
    created_by_name: '张学成',
    type: 'call',
    importance: 'normal',
    weight: 'low',
    date: '2026-07-29',
  }]);

  const { container, root } = await renderInteractions();
  const card = container.querySelector('.interaction-mobile-card');

  expect(card.querySelector('.interaction-mobile-card-company')).toBeNull();
  expect(card.textContent).toContain('创建人 张学成 · 人脉权重 低');

  act(() => root.unmount());
  container.remove();
});

test('splits desktop opportunity data into stable title, status, and type columns', async () => {
  mockBreakpointState = { md: true };
  const { container, root } = await renderInteractions();
  const headers = Array.from(container.querySelectorAll('.ant-table-thead th'))
    .map(header => header.textContent.trim());

  const titleIndex = headers.indexOf('商机标题');
  expect(titleIndex).toBeGreaterThan(-1);
  expect(headers.slice(titleIndex, titleIndex + 3)).toEqual(['商机标题', '商机状态', '商机类型']);
  expect(headers).not.toContain('商机');

  const opportunityTitle = container.querySelector('.interaction-opportunity-title');
  expect(opportunityTitle.textContent).toBe('年度联合增长项目');
  expect(opportunityTitle.closest('td').querySelector('.ant-tag')).toBeNull();
  expect(container.querySelectorAll('.interaction-opportunity-tag')).toHaveLength(2);

  act(() => root.unmount());
  container.remove();
});
