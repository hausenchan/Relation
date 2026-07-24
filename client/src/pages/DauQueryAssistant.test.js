import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DauQueryAssistant, { DAU_QUERY_ASSISTANT_URL } from './DauQueryAssistant';

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test('loads the DAU query assistant as the only page content', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<DauQueryAssistant />));

  const frame = container.querySelector('[data-testid="dau-query-assistant-frame"]');
  expect(frame).not.toBeNull();
  expect(frame.getAttribute('src')).toBe(DAU_QUERY_ASSISTANT_URL);
  expect(frame.getAttribute('title')).toBe('DAU查询助手');
  expect(frame.getAttribute('loading')).toBe('eager');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(container.querySelectorAll('iframe')).toHaveLength(1);

  act(() => root.unmount());
  container.remove();
});
