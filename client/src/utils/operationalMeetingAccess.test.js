import {
  getDefaultPreparationSectionKeys,
  getOperationalMeetingDetailTab,
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

  test('meeting-only users always land on the meeting tab', () => {
    expect(getOperationalMeetingDetailTab('preparation', false)).toBe('meeting');
    expect(getOperationalMeetingDetailTab('meeting', false)).toBe('meeting');
  });

  test('preparation users default to preparation but can switch to meeting', () => {
    expect(getOperationalMeetingDetailTab('preparation', true)).toBe('preparation');
    expect(getOperationalMeetingDetailTab('meeting', true)).toBe('meeting');
  });
});
