import {
  COMPOSITION_CONFIRM_ENTER_GUARD_MS,
  isContentEditableComposing,
  shouldSuppressEnterAfterComposition,
} from './contentEditableComposition';

describe('contenteditable composition keyboard guard', () => {
  test('recognizes active composition from local and browser event state', () => {
    expect(isContentEditableComposing({ key: 'Enter' }, true)).toBe(true);
    expect(isContentEditableComposing({ key: 'Enter', isComposing: true })).toBe(true);
    expect(isContentEditableComposing({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(true);
    expect(isContentEditableComposing({ key: 'Enter', keyCode: 229 })).toBe(true);
    expect(isContentEditableComposing({ key: 'Enter', nativeEvent: { which: 229 } })).toBe(true);
    expect(isContentEditableComposing({ key: 'Enter', keyCode: 13 })).toBe(false);
  });

  test('suppresses only the unmodified Enter immediately following compositionend', () => {
    const endedAt = 1000;
    expect(shouldSuppressEnterAfterComposition({ key: 'Enter' }, endedAt, endedAt)).toBe(true);
    expect(shouldSuppressEnterAfterComposition(
      { key: 'Enter' },
      endedAt,
      endedAt + COMPOSITION_CONFIRM_ENTER_GUARD_MS,
    )).toBe(true);
    expect(shouldSuppressEnterAfterComposition(
      { key: 'Enter' },
      endedAt,
      endedAt + COMPOSITION_CONFIRM_ENTER_GUARD_MS + 1,
    )).toBe(false);
    expect(shouldSuppressEnterAfterComposition({ key: 'Enter', shiftKey: true }, endedAt, endedAt + 1)).toBe(false);
    expect(shouldSuppressEnterAfterComposition({ key: 'a' }, endedAt, endedAt + 1)).toBe(false);
  });
});
