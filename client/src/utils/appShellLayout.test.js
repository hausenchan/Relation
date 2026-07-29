import { fixedGlobalSiderStyle, getAppContentLayoutStyle } from './appShellLayout';

test('pins the desktop global sidebar to the viewport', () => {
  expect(fixedGlobalSiderStyle).toMatchObject({
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    height: 'auto',
    minHeight: 0,
    maxHeight: 'none',
  });
});

test.each([
  [64, 'calc(100vw - 64px)'],
  [180, 'calc(100vw - 180px)'],
])('offsets desktop content by a %ipx sidebar', (sidebarWidth, expectedWidth) => {
  expect(getAppContentLayoutStyle(false, sidebarWidth)).toMatchObject({
    width: expectedWidth,
    maxWidth: expectedWidth,
    marginLeft: sidebarWidth,
  });
});

test('keeps the mobile content full width without a sidebar offset', () => {
  expect(getAppContentLayoutStyle(true, 64)).toMatchObject({
    width: '100%',
    maxWidth: '100%',
    marginLeft: 0,
  });
});
