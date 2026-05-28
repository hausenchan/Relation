const LOGIN_REDIRECT_STORAGE_KEY = 'relation_login_redirect';

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

export function resolveLoginRedirect(explicitRedirect) {
  const explicitPath = getSafeInternalPath(explicitRedirect);
  try {
    const storedPath = getSafeInternalPath(sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY));
    sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
    return explicitPath !== '/' ? explicitPath : storedPath;
  } catch {
    return explicitPath;
  }
}

export function buildLoginPath(redirectPath) {
  const safeRedirect = storeLoginRedirect(redirectPath);
  return safeRedirect === '/' ? '/login' : `/login?redirect=${encodeURIComponent(safeRedirect)}`;
}
