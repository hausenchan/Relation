import {
  getDefaultPreparationSectionKeys,
  getPreparationEditorState,
} from './operationalMeetingAccess';

describe('operational meeting preparation access', () => {
  test('allows an editable empty section before the security key is unlocked', () => {
    expect(getPreparationEditorState({ can_edit: 1, content_ciphertext: null }, false)).toEqual({
      canEdit: true,
      lacksDecryptGrant: false,
      needsUnlockForExistingContent: false,
      readOnly: false,
    });
  });

  test('keeps another owner section read-only', () => {
    expect(getPreparationEditorState({ can_edit: 0, content_ciphertext: null }, true).readOnly).toBe(true);
  });

  test('requires unlock and a record key for existing encrypted content', () => {
    const state = getPreparationEditorState({
      can_edit: 1,
      content_ciphertext: 'encrypted',
      my_record_key: null,
    }, false);

    expect(state.readOnly).toBe(true);
    expect(state.needsUnlockForExistingContent).toBe(true);
    expect(state.lacksDecryptGrant).toBe(true);
  });

  test('opens the current user editable preparation section by default', () => {
    const sections = [
      { id: 11, can_edit: 0 },
      { id: 12, can_edit: 1 },
      { id: 13, can_edit: 0 },
    ];

    expect(getDefaultPreparationSectionKeys(sections)).toEqual(['12']);
  });
});
