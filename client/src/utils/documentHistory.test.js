import { loadFreshDocumentHistoryDetail } from './documentHistory';

test('waits for pending saves before loading the latest page edit records', async () => {
  const calls = [];
  let releaseSave;
  const savePromise = new Promise(resolve => { releaseSave = resolve; });
  const loadDocument = jest.fn(async id => {
    calls.push(`load:${id}`);
    return {
      id,
      edit_records: [{ id: 189, action_type: 'spreadsheet_operations' }],
    };
  });

  const pending = loadFreshDocumentHistoryDetail({
    documentId: 10,
    savePendingChanges: async () => {
      calls.push('save:start');
      await savePromise;
      calls.push('save:end');
    },
    loadDocument,
  });
  await Promise.resolve();
  expect(loadDocument).not.toHaveBeenCalled();

  releaseSave();
  const detail = await pending;
  expect(calls).toEqual(['save:start', 'save:end', 'load:10']);
  expect(detail.edit_records[0].id).toBe(189);
});

test('ignores mismatched document details', async () => {
  await expect(loadFreshDocumentHistoryDetail({
    documentId: 10,
    loadDocument: async () => ({ id: 11, edit_records: [] }),
  })).resolves.toBeNull();
});
