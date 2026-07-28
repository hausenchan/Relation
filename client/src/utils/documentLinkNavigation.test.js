import { activateDocumentLink, resolveDocumentLink } from './documentLinkNavigation';

const localDocumentUrl = 'http://localhost:3000/documents?doc=12';

describe('document link navigation', () => {
  test.each([
    ['/documents?doc=523', 523],
    ['?doc=524', 524],
    ['http://localhost:3000/documents/?doc=525#doc-block-title', 525],
    ['https://relation.midongtech.com/documents?doc=526', 526],
  ])('recognizes Relation document links: %s', (href, documentId) => {
    expect(resolveDocumentLink(href, { currentUrl: localDocumentUrl })).toMatchObject({
      type: 'document',
      documentId,
    });
  });

  test.each([
    'https://example.com/news?id=523',
    'https://example.com/documents?doc=523',
    '/documents?doc=0',
    '/documents?doc=523abc',
    '/goals?doc=523',
  ])('keeps ordinary HTTP URLs external: %s', (href) => {
    const result = resolveDocumentLink(href, { currentUrl: localDocumentUrl });
    expect(result.type).toBe('external');
    expect(result.url).toMatch(/^https?:\/\//);
  });

  test.each([
    '',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:user@example.com',
  ])('rejects unsupported or unsafe link protocols: %s', (href) => {
    expect(resolveDocumentLink(href, { currentUrl: localDocumentUrl })).toEqual({
      type: 'unsupported',
    });
  });

  test('opens document links in the document workspace and ordinary URLs externally', () => {
    const openDocument = jest.fn();
    const openExternal = jest.fn();
    const options = { currentUrl: localDocumentUrl, openDocument, openExternal };

    activateDocumentLink('/documents?doc=523', options);
    expect(openDocument).toHaveBeenCalledWith(523);
    expect(openExternal).not.toHaveBeenCalled();

    activateDocumentLink('https://example.com/news', options);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/news');
  });

  test('does not invoke a navigation action for unsafe protocols', () => {
    const openDocument = jest.fn();
    const openExternal = jest.fn();

    activateDocumentLink('javascript:alert(1)', {
      currentUrl: localDocumentUrl,
      openDocument,
      openExternal,
    });

    expect(openDocument).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});
