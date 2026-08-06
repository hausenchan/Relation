import { canOpenDocumentFolderMenu } from './documentFolderPermissions';

describe('document folder context menu permissions', () => {
  test('allows an empty max-depth folder to open the menu for deletion', () => {
    expect(canOpenDocumentFolderMenu({
      nodeType: 'folder',
      canAddChild: false,
      canEditFolder: true,
      canDeleteFolder: true,
    }, true)).toBe(true);
  });

  test('rejects a folder when no folder action is available', () => {
    expect(canOpenDocumentFolderMenu({
      nodeType: 'folder',
      canAddChild: false,
      canEditFolder: false,
      canDeleteFolder: false,
    }, true)).toBe(false);
  });
});
