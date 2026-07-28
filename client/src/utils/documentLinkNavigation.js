const DEFAULT_RELATION_DOCUMENT_HOSTS = new Set([
  'relation.midongtech.com',
]);

function getCurrentUrl(currentUrl) {
  if (currentUrl) return String(currentUrl);
  if (typeof window !== 'undefined' && window.location?.href) return window.location.href;
  return 'https://relation.midongtech.com/documents';
}

function normalizeDocumentId(value) {
  const text = String(value || '').trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const documentId = Number(text);
  return Number.isSafeInteger(documentId) ? documentId : null;
}

export function resolveDocumentLink(href, options = {}) {
  const value = String(href || '').trim();
  if (!value) return { type: 'unsupported' };

  let currentUrl;
  let url;
  try {
    currentUrl = new URL(getCurrentUrl(options.currentUrl));
    url = new URL(value, currentUrl);
  } catch {
    return { type: 'unsupported' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { type: 'unsupported' };
  }

  const relationHosts = options.relationHosts || DEFAULT_RELATION_DOCUMENT_HOSTS;
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const documentId = normalizeDocumentId(url.searchParams.get('doc'));
  const trustedDocumentHost = url.origin === currentUrl.origin
    || relationHosts.has(url.hostname.toLowerCase());

  if (pathname === '/documents' && documentId && trustedDocumentHost) {
    return { type: 'document', documentId, url: url.href };
  }

  return { type: 'external', url: url.href };
}

export function activateDocumentLink(href, options = {}) {
  const destination = resolveDocumentLink(href, options);
  if (destination.type === 'document') {
    options.openDocument?.(destination.documentId);
  } else if (destination.type === 'external') {
    options.openExternal?.(destination.url);
  }
  return destination;
}
