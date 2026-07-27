import {
  getInlineFormatConflictProperties,
  wrapInlineRangeContents,
} from './inlineTextFormatting';

function createCrossNodeRange(container) {
  const styledNodes = container.querySelectorAll('span');
  const range = document.createRange();
  range.setStart(styledNodes[0].firstChild, 0);
  range.setEnd(styledNodes[1].firstChild, styledNodes[1].textContent.length);
  return range;
}

describe('inline text formatting', () => {
  test('applies a color across imported spans without nested colors overriding it', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span style="color: #111827; font-weight: 700;">已</span><span style="color: rgb(17, 24, 39); background-color: #fef3c7;">上线</span>';
    const wrapper = document.createElement('span');
    wrapper.style.color = '#22c55e';

    wrapInlineRangeContents(createCrossNodeRange(container), wrapper, { format: 'color' });

    expect(container.textContent).toBe('已上线');
    expect(wrapper.textContent).toBe('已上线');
    expect(wrapper.style.color).toBe('rgb(34, 197, 94)');
    expect(Array.from(wrapper.querySelectorAll('[style]')).every(element => !element.style.color)).toBe(true);
    expect(wrapper.querySelector('[style*="background-color"]')).not.toBeNull();
    expect(wrapper.querySelector('[style*="font-weight"]')).not.toBeNull();
  });

  test('applies bold without an imported normal weight cancelling it', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span style="font-weight: 400; color: #ef4444;">需要</span><span style="font: normal 400 15px sans-serif; color: #3b82f6;">加粗</span>';
    const wrapper = document.createElement('strong');

    wrapInlineRangeContents(createCrossNodeRange(container), wrapper, { format: 'bold' });

    expect(wrapper.textContent).toBe('需要加粗');
    expect(Array.from(wrapper.querySelectorAll('[style]')).every(element => (
      !element.style.fontWeight && !/(^|;)\s*font\s*:/.test(element.getAttribute('style') || '')
    ))).toBe(true);
    expect(wrapper.querySelectorAll('[style*="color"]')).toHaveLength(2);
    expect(getInlineFormatConflictProperties('bold')).toEqual(['font', 'font-weight']);
  });

  test('keeps conflicting styles on text outside the selected range', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span style="color: #111827;">前已</span><span style="color: #ef4444;">上线后</span>';
    const spans = container.querySelectorAll('span');
    const range = document.createRange();
    range.setStart(spans[0].firstChild, 1);
    range.setEnd(spans[1].firstChild, 2);
    const wrapper = document.createElement('span');
    wrapper.style.color = '#22c55e';

    wrapInlineRangeContents(range, wrapper, { format: 'color' });

    expect(wrapper.textContent).toBe('已上线');
    expect(Array.from(wrapper.querySelectorAll('[style]')).every(element => !element.style.color)).toBe(true);
    expect(container.firstElementChild.style.color).toBe('rgb(17, 24, 39)');
    expect(container.lastElementChild.style.color).toBe('rgb(239, 68, 68)');
    expect(container.textContent).toBe('前已上线后');
  });
});
