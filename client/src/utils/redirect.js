const LOGIN_REDIRECT_STORAGE_KEY = 'relation_login_redirect';
const ADMIN_ROLES = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);
const ADMIN_ONLY_PATHS = new Set([
  '/users',
  '/teams',
  '/project-groups',
  '/menu-perms',
  '/cross-team-access',
  '/mobile-task-center',
  '/operation-logs',
]);

export function getSafeInternalPath(value) {
  if (!value || typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.startsWith('/login')) return '/';
  return value;
}

export function getLocationPath(location) {
  if (!location) return '/';
  return getSafeInternalPath(`${location.pathname || ''}${location.search || ''}${location.hash || ''}`);
}

export function getBrowserPath() {
  return getSafeInternalPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

export function storeLoginRedirect(value) {
  const redirectPath = getSafeInternalPath(value);
  try {
    if (redirectPath === '/') {
      sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
    } else {
      sessionStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, redirectPath);
    }
  } catch {}
  return redirectPath;
}

export function clearLoginRedirect() {
  try {
    sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
  } catch {}
}

export function resolveLoginRedirect(explicitRedirect) {
  const explicitPath = getSafeInternalPath(explicitRedirect);
  try {
    const storedPath = getSafeInternalPath(sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY));
    clearLoginRedirect();
    return explicitPath !== '/' ? explicitPath : storedPath;
  } catch {
    return explicitPath;
  }
}

export function buildLoginPath(redirectPath) {
  const safeRedirect = storeLoginRedirect(redirectPath);
  return safeRedirect === '/' ? '/login' : `/login?redirect=${encodeURIComponent(safeRedirect)}`;
}

function getPathname(value) {
  const safePath = getSafeInternalPath(value);
  try {
    return new URL(safePath, window.location.origin).pathname;
  } catch {
    return safePath.split(/[?#]/)[0] || '/';
  }
}

function isAdmin(user) {
  return ADMIN_ROLES.has(user?.role || user) || ADMIN_ROLES.has(user?.executive_role);
}

export function getAuthorizedRedirectPath(value, user) {
  const safePath = getSafeInternalPath(value);
  const pathname = getPathname(safePath);
  if (!user) return safePath;
  const sensitiveModules = Array.isArray(user.sensitiveModules) ? user.sensitiveModules : [];
  if (pathname === '/executive/operational' && !sensitiveModules.some(item => item?.module_key === 'operational_meeting')) {
    return '/';
  }
  if (isAdmin(user)) return safePath;
  if (ADMIN_ONLY_PATHS.has(pathname)) return '/';
  if (pathname.startsWith('/executive/recruit-radar')) return '/';
  if (pathname !== '/' && Array.isArray(user.menuPerms) && !user.menuPerms.includes(pathname)) {
    return '/';
  }
  return safePath;
}
