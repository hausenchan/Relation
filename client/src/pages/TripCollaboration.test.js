import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListTrips = jest.fn();
const mockListSchedules = jest.fn();
const mockListUsers = jest.fn();
let mockBreakpoints = { md: true };

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
  tripCollaborationApi: {
    listTrips: (...args) => mockListTrips(...args),
    listSchedules: (...args) => mockListSchedules(...args),
  },
  usersApi: {
    listSimple: (...args) => mockListUsers(...args),
  },
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', display_name: '管理员' } }),
}));

import TripCollaboration from './TripCollaboration';

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
  mockBreakpoints = { md: true };
  window.localStorage.removeItem('relation.tripCollaborationListCollapsed.v1');
  mockListTrips.mockResolvedValue([{
    id: 7,
    name: '华东客户行程',
    start_date: '2026-07-27',
    end_date: '2026-07-29',
    schedule_count: 0,
    participant_names: [],
    can_edit: 1,
    can_delete: 1,
  }]);
  mockListSchedules.mockResolvedValue([]);
  mockListUsers.mockResolvedValue([]);
});

test('moves the list toggle into the schedule header and removes the collapsed rail', async () => {
  window.localStorage.setItem('relation.tripCollaborationListCollapsed.v1', '1');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TripCollaboration />);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  const aside = container.querySelector('aside');
  const section = container.querySelector('section');
  const expandButton = section?.querySelector('button[aria-label="展开行程列表"]');
  expect(aside?.style.width).toBe('0px');
  expect(aside?.style.minWidth).toBe('0');
  expect(expandButton).not.toBeNull();
  expect(aside?.querySelector('button[aria-label="展开行程列表"]')).toBeNull();

  await act(async () => {
    expandButton.click();
  });
  expect(aside?.style.width).toBe('360px');
  expect(section?.querySelector('button[aria-label="收起行程列表"]')).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});

test('marks the date row, period column, and corner for two-axis sticky scrolling', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TripCollaboration />);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  expect(container.querySelector('[data-testid="trip-collaboration-grid-scroll"]')).not.toBeNull();
  expect(container.querySelectorAll('.trip-collaboration-grid-date')).toHaveLength(3);
  expect(container.querySelectorAll('.trip-collaboration-grid-period')).toHaveLength(4);
  expect(container.querySelector('.trip-collaboration-grid-corner')).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});

test('keeps the trip list visible on mobile even when desktop state is collapsed', async () => {
  mockBreakpoints = { md: false };
  window.localStorage.setItem('relation.tripCollaborationListCollapsed.v1', '1');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TripCollaboration />);
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });

  const aside = container.querySelector('aside');
  expect(aside?.style.width).toBe('100%');
  expect(aside?.textContent).toContain('出差协同');
  expect(container.querySelector('button[aria-label="展开行程列表"]')).toBeNull();
  expect(container.querySelector('button[aria-label="收起行程列表"]')).toBeNull();

  act(() => root.unmount());
  container.remove();
});
