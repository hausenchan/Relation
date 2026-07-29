import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockOverview = jest.fn();
const mockGetRuntimeStatus = jest.fn();
const mockListSessions = jest.fn();
const mockListMessages = jest.fn();
const mockListCaseCandidates = jest.fn();
const mockListCases = jest.fn();
const mockListSkills = jest.fn();
const mockGetSkill = jest.fn();
const mockListEvalRuns = jest.fn();
const mockGetStats = jest.fn();
let mockBreakpoints = { md: true, xl: true };

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => mockBreakpoints,
    },
  };
});

jest.mock('../api', () => ({
  aiTrainingApi: {
    overview: (...args) => mockOverview(...args),
    getRuntimeStatus: (...args) => mockGetRuntimeStatus(...args),
    listSessions: (...args) => mockListSessions(...args),
    listMessages: (...args) => mockListMessages(...args),
    listCaseCandidates: (...args) => mockListCaseCandidates(...args),
    listCases: (...args) => mockListCases(...args),
    listSkills: (...args) => mockListSkills(...args),
    getSkill: (...args) => mockGetSkill(...args),
    listEvalRuns: (...args) => mockListEvalRuns(...args),
    getStats: (...args) => mockGetStats(...args),
  },
}));
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', display_name: '管理员' } }),
}));
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams('tab=sessions'), jest.fn()],
}));

import AiTrainingWorkbench from './AiTrainingWorkbench';

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || (() => ({
    matches: true,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  global.ResizeObserver = global.ResizeObserver || class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterAll(() => {
  delete global.IS_REACT_ACT_ENVIRONMENT;
  delete global.ResizeObserver;
});

beforeEach(() => {
  mockBreakpoints = { md: true, xl: true };
  window.localStorage.setItem('aiTraining.sessionListCollapsed', '1');
  mockOverview.mockResolvedValue({});
  mockGetRuntimeStatus.mockResolvedValue(null);
  mockListSessions.mockResolvedValue([]);
  mockListMessages.mockResolvedValue([]);
  mockListCaseCandidates.mockResolvedValue([]);
  mockListCases.mockResolvedValue([]);
  mockListSkills.mockResolvedValue([]);
  mockGetSkill.mockResolvedValue(null);
  mockListEvalRuns.mockResolvedValue([]);
  mockGetStats.mockResolvedValue({});
});

test('removes the collapsed session column and keeps its toggle in the chat header', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AiTrainingWorkbench />);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  const expandButton = container.querySelector('button[aria-label="展开会话列表"]');
  const cardTitles = () => Array.from(container.querySelectorAll('.ant-card-head-title'))
    .map(node => node.textContent.trim());
  expect(expandButton).not.toBeNull();
  expect(cardTitles()).not.toContain('会话列表');

  await act(async () => {
    expandButton.click();
  });
  expect(container.querySelector('button[aria-label="收起会话列表"]')).not.toBeNull();
  expect(cardTitles()).toContain('会话列表');

  act(() => root.unmount());
  container.remove();
});

test('keeps the session list visible in stacked layouts', async () => {
  mockBreakpoints = { md: true, xl: false };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AiTrainingWorkbench />);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  const cardTitles = Array.from(container.querySelectorAll('.ant-card-head-title'))
    .map(node => node.textContent.trim());
  expect(cardTitles).toContain('会话列表');
  expect(container.querySelector('button[aria-label="展开会话列表"]')).toBeNull();
  expect(container.querySelector('button[aria-label="收起会话列表"]')).toBeNull();

  act(() => root.unmount());
  container.remove();
});
