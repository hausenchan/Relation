import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListTrips = jest.fn();
const mockListSchedules = jest.fn();
const mockListUsers = jest.fn();

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
