export const GLOBAL_SIDEBAR_WIDTH = 180;
export const GLOBAL_SIDEBAR_COLLAPSED_WIDTH = 52;

export const fixedGlobalSiderStyle = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  left: 0,
  height: 'auto',
  minHeight: 0,
  maxHeight: 'none',
  zIndex: 20,
};

export function getAppContentLayoutStyle(isMobile, desktopSiderWidth) {
  const siderOffset = isMobile ? 0 : desktopSiderWidth;
  const contentWidth = isMobile ? '100%' : `calc(100vw - ${siderOffset}px)`;
  return {
    flex: '0 0 auto',
    width: contentWidth,
    maxWidth: contentWidth,
    minWidth: 0,
    marginLeft: siderOffset,
    overflowX: 'hidden',
    transition: 'width 0.2s ease, max-width 0.2s ease, margin-left 0.2s ease',
  };
}
