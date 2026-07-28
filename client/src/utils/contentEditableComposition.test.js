import {
  COMPOSITION_CONFIRM_ENTER_GUARD_MS,
  isContentEditableComposing,
  removeContentEditableLineBreakBeforeCaret,
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

  test('removes a trailing line break when Backspace is pressed on the empty line', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = 'DAU<br>';
    document.body.appendChild(editor);
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(editor, editor.childNodes.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const inputListener = jest.fn();
    editor.addEventListener('input', inputListener);

    expect(removeContentEditableLineBreakBeforeCaret(editor, selection)).toBe(true);
    expect(editor.innerHTML).toBe('DAU');
    expect(inputListener).toHaveBeenCalledTimes(1);
    editor.remove();
  });

  test('removes an empty browser line wrapper without deleting the previous text', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = '<div>DAU</div><div><br></div>';
    document.body.appendChild(editor);
    const emptyLine = editor.lastElementChild;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(emptyLine, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(removeContentEditableLineBreakBeforeCaret(editor, selection)).toBe(true);
    expect(editor.innerHTML).toBe('<div>DAU</div>');
    expect(editor.textContent).toBe('DAU');
    editor.remove();
  });

  test('leaves ordinary text untouched when there is no line break before the caret', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.textContent = 'DAU';
    document.body.appendChild(editor);
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(editor.firstChild, 3);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(removeContentEditableLineBreakBeforeCaret(editor, selection)).toBe(false);
    expect(editor.textContent).toBe('DAU');
    editor.remove();
  });
});
