import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SidebarToggleButton from './SidebarToggleButton';

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
});

afterAll(() => {
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test('uses one accessible control for expanded and collapsed sidebars', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onToggle = jest.fn();

  act(() => {
    root.render(
      <SidebarToggleButton
        collapsed
        onToggle={onToggle}
        expandLabel="展开文档目录"
        collapseLabel="收起文档目录"
      />
    );
  });

  const button = container.querySelector('button');
  expect(button?.getAttribute('aria-label')).toBe('展开文档目录');
  expect(button?.getAttribute('aria-expanded')).toBe('false');
  act(() => button.click());
  expect(onToggle).toHaveBeenCalledTimes(1);

  act(() => {
    root.render(
      <SidebarToggleButton
        collapsed={false}
        onToggle={onToggle}
        expandLabel="展开文档目录"
        collapseLabel="收起文档目录"
      />
    );
  });
  expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('收起文档目录');
  expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');

  act(() => root.unmount());
  container.remove();
});
