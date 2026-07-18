import {
  getDefaultPreparationSectionKeys,
  getPreparationEditorState,
} from './operationalMeetingAccess';

describe('operational meeting preparation access', () => {
  test('allows a preparation section when the API grants edit permission', () => {
    expect(getPreparationEditorState({ can_edit: 1 })).toEqual({
      canEdit: true,
      readOnly: false,
    });
  });

  test('keeps another owner section read-only', () => {
    expect(getPreparationEditorState({ can_edit: 0 }).readOnly).toBe(true);
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
