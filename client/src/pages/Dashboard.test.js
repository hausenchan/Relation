import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListTasks = jest.fn();
const mockDeleteTask = jest.fn();
const mockListFollowUps = jest.fn();
const mockWatchFollowUps = jest.fn();
const mockGetStats = jest.fn();
const mockListReminders = jest.fn();
const mockListUsers = jest.fn();
const mockNavigate = jest.fn();
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
  statsApi: { get: (...args) => mockGetStats(...args) },
  remindersApi: { list: (...args) => mockListReminders(...args) },
  tasksApi: {
    list: (...args) => mockListTasks(...args),
    create: jest.fn(),
    update: jest.fn(),
    delete: (...args) => mockDeleteTask(...args),
  },
  followUpTasksApi: {
    list: (...args) => mockListFollowUps(...args),
    watch: (...args) => mockWatchFollowUps(...args),
  },
  usersApi: { listSimple: (...args) => mockListUsers(...args) },
  aiSuggestionsApi: { list: jest.fn() },
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', display_name: '陈豪赞', team_ids: [], managed_team_ids: [] },
    isExecutive: () => false,
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

import Dashboard from './Dashboard';

async function flushUi() {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

async function renderDashboard() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Dashboard />);
    await flushUi();
  });
  await act(flushUi);
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
  mockListTasks.mockResolvedValue([{
    id: 11,
    title: '增长团队思路沟通',
    description: '围绕团队协同和数据分析能力建设梳理执行路径',
    result: '完成 Agent 方案和项目级 skill 落实',
    status: 'done',
    priority: 'high',
    task_type: '组织',
    date: '2026-07-29',
    estimated_completion_date: '2026-07-30',
    done_at: '2026-07-29 11:20:00',
    created_by: 1,
    created_by_name: '陈豪赞',
    assigned_to: 1,
    assigned_to_name: '陈豪赞',
  }]);
  mockDeleteTask.mockResolvedValue({ success: true });
  mockListFollowUps.mockResolvedValue([]);
  mockWatchFollowUps.mockResolvedValue([]);
  mockGetStats.mockResolvedValue({ showRelationshipPanels: false });
  mockListReminders.mockResolvedValue([]);
  mockListUsers.mockResolvedValue([{ id: 1, display_name: '陈豪赞' }]);
});

test('renders a concise mobile task card without exposed edit or delete buttons', async () => {
  const { container, root } = await renderDashboard();
  const card = container.querySelector('.dashboard-task-mobile-card');

  expect(card).not.toBeNull();
  expect(card.getAttribute('role')).toBe('button');
  expect(card.textContent).toContain('增长团队思路沟通');
  expect(card.textContent).toContain('日常指派');
  expect(card.textContent).toContain('已完成');
  expect(card.textContent).toContain('优先级·高');
  expect(card.textContent).toContain('组织');
  expect(card.querySelector('.dashboard-task-mobile-card-dates').textContent)
    .toBe('计划 07-29 · 预估完成 07-30 · 完成 07-29');
  expect(card.querySelector('.dashboard-task-mobile-card-people').textContent)
    .toBe('指派人 陈豪赞 · 执行人 陈豪赞');
  expect(card.querySelector('.dashboard-task-mobile-card-result-value').textContent)
    .toContain('完成 Agent 方案');
  expect(card.textContent).not.toContain('编辑');
  expect(card.textContent).not.toContain('删除');

  await click(card);
  expect(document.body.textContent).toContain('任务详情');

  act(() => root.unmount());
  container.remove();
});

test('opens mobile edit and delete actions from more without opening task details', async () => {
  const { container, root } = await renderDashboard();
  const moreButton = container.querySelector('button[aria-label="更多操作：增长团队思路沟通"]');

  await click(moreButton);
  const actionSheet = document.body.querySelector('.dashboard-task-mobile-action-sheet');
  expect(actionSheet).not.toBeNull();
  expect(actionSheet.textContent).toContain('编辑任务');
  expect(actionSheet.textContent).toContain('删除任务');
  expect(document.body.textContent).not.toContain('任务详情');

  const editButton = Array.from(actionSheet.querySelectorAll('button'))
    .find(button => button.textContent.includes('编辑任务'));
  await click(editButton);
  expect(document.body.textContent).toContain('编辑任务');

  act(() => root.unmount());
  container.remove();
});

test('keeps mobile task deletion behind a confirmation step', async () => {
  const { container, root } = await renderDashboard();
  const moreButton = container.querySelector('button[aria-label="更多操作：增长团队思路沟通"]');
  await click(moreButton);

  const actionSheet = document.body.querySelector('.dashboard-task-mobile-action-sheet');
  const deleteButton = Array.from(actionSheet.querySelectorAll('button'))
    .find(button => button.textContent.includes('删除任务'));
  await click(deleteButton);

  expect(mockDeleteTask).not.toHaveBeenCalled();
  const confirmation = document.body.querySelector('.ant-modal-confirm');
  expect(confirmation).not.toBeNull();
  expect(confirmation.textContent).toContain('删除任务？');
  const cancelButton = Array.from(confirmation.querySelectorAll('button'))
    .find(button => button.textContent.replace(/\s+/g, '') === '取消');
  await click(cancelButton);
  expect(mockDeleteTask).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
});

test('keeps the existing desktop task table actions', async () => {
  mockBreakpointState = { md: true };
  const { container, root } = await renderDashboard();

  expect(container.querySelector('.dashboard-task-mobile-card')).toBeNull();
  expect(container.querySelector('.ant-table')).not.toBeNull();
  expect(container.textContent).toContain('编辑');
  expect(container.textContent).toContain('删除');

  act(() => root.unmount());
  container.remove();
});
