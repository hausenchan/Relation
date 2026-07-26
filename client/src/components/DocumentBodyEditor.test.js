import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import DocumentBodyEditor from './DocumentBodyEditor';
import { DOCUMENT_BODY_CLIPBOARD_MIME, DOCUMENT_BODY_FORMAT } from '../utils/documentBodyBlocks';

jest.mock('../api', () => ({
  mentionsApi: {
    candidates: jest.fn(() => Promise.resolve({ users: [{ id: 2, name: '陈豪赞', username: 'chenhaozan' }] })),
    notify: jest.fn(() => Promise.resolve({ success: true })),
  },
}));

jest.mock('antd', () => {
  const ReactModule = require('react');
  const Button = ({ children, icon, onClick, onMouseDown, ...props }) => (
    <button type="button" onClick={onClick} onMouseDown={onMouseDown} {...props}>{icon}{children}</button>
  );
  const Input = props => <input {...props} />;
  Input.TextArea = props => <textarea {...props} />;
  const List = ({ dataSource = [], renderItem }) => (
    <div>{dataSource.map((item, index) => ReactModule.cloneElement(renderItem(item), { key: item?.id || index }))}</div>
  );
  List.Item = ({ children, onClick, onMouseDown, onKeyDown, role, tabIndex, style }) => (
    <div role={role} tabIndex={tabIndex} onClick={onClick} onMouseDown={onMouseDown} onKeyDown={onKeyDown} style={style}>{children}</div>
  );
  List.Item.Meta = ({ avatar, title, description }) => (
    <div>{avatar}<div>{title}</div><div>{description}</div></div>
  );
  return {
    Button,
    Avatar: ({ children }) => <span>{children}</span>,
    Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={checked} onChange={onChange} />,
    Divider: () => <hr />,
    Dropdown: ({ children, menu }) => (
      <>
        {children}
        {(menu?.items || []).filter(item => item?.key).map(item => (
          <button
            key={item.key}
            type="button"
            data-menu-key={item.key}
            onClick={() => menu.onClick?.({ key: item.key, domEvent: { stopPropagation: () => {} } })}
          >
            {item.label}
          </button>
        ))}
      </>
    ),
    Input,
    Empty: ({ description }) => <div>{description}</div>,
    List,
    Spin: () => <span>loading</span>,
    Space: ({ children }) => <div>{children}</div>,
    Tooltip: ({ children }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    Typography: { Text: ({ children }) => <span>{children}</span> },
    message: { destroy: jest.fn(), error: jest.fn(), info: jest.fn(), open: jest.fn(), success: jest.fn() },
  };
});

jest.mock('@ant-design/icons', () => ({
  ArrowDownOutlined: () => null,
  ArrowLeftOutlined: () => null,
  ArrowRightOutlined: () => null,
  ArrowUpOutlined: () => null,
  CopyOutlined: () => null,
  CloseOutlined: () => null,
  DeleteOutlined: () => null,
  LinkOutlined: () => null,
  PlusOutlined: () => null,
  SnippetsOutlined: () => null,
}));

const { mentionsApi } = require('../api');
const { message } = require('antd');
const { clearMentionCandidateCache } = require('./MentionPicker');

function createClipboardData() {
  const values = new Map();
  return {
    getData: type => values.get(type) || '',
    setData: (type, value) => values.set(type, value),
    values,
  };
}

function dispatchCopy(target, clipboardData) {
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  target.dispatchEvent(event);
  return event;
}

function dispatchPaste(target, clipboardData) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  target.dispatchEvent(event);
  return event;
}

describe('DocumentBodyEditor block copy', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    clearMentionCandidateCache();
    mentionsApi.candidates.mockResolvedValue({ users: [{ id: 2, name: '陈豪赞', username: 'chenhaozan' }] });
    mentionsApi.notify.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    window.getSelection()?.removeAllRanges();
    container.remove();
  });

  const value = {
    format: DOCUMENT_BODY_FORMAT,
    blocks: [
      { id: 'one', type: 'fold-list', content: '第一块', meta: { indent: 0, collapsed: false } },
      { id: 'two', type: 'numbered', content: '<strong>第二块</strong>', meta: { indent: 1, hierarchy: 'list' } },
      { id: 'three', type: 'paragraph', content: '第三块', meta: {} },
    ],
  };

  test('Cmd+A selects every editor block and Cmd+C copies structured content', () => {
    flushSync(() => {
      root.render(<DocumentBodyEditor value={value} onChange={() => {}} />);
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'a',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(container.querySelectorAll('[data-document-body-block-id][data-copy-selected="true"]')).toHaveLength(3);
    const clipboardData = createClipboardData();
    let copyEvent;
    flushSync(() => {
      copyEvent = dispatchCopy(inlineEditor, clipboardData);
    });

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(clipboardData.getData('text/plain')).toBe('- 第一块\n  1. 第二块\n第三块');
    expect(clipboardData.getData('text/html')).toContain('<strong>第二块</strong>');
    expect(JSON.parse(clipboardData.getData(DOCUMENT_BODY_CLIPBOARD_MIME)).blocks).toHaveLength(3);
  });

  test('selects a fold handle as one block unit including all descendants', () => {
    flushSync(() => {
      root.render(<DocumentBodyEditor value={value} onChange={() => {}} />);
    });
    const foldHandle = container.querySelector('button[aria-label="块菜单"]');

    flushSync(() => {
      foldHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });

    expect(container.querySelectorAll('[data-document-body-block-id][data-block-selected="true"]')).toHaveLength(2);
    const clipboardData = createClipboardData();
    let copyEvent;
    flushSync(() => {
      copyEvent = dispatchCopy(foldHandle, clipboardData);
    });

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(JSON.parse(clipboardData.getData(DOCUMENT_BODY_CLIPBOARD_MIME)).blocks.map(block => block.content))
      .toEqual(['第一块', '<strong>第二块</strong>']);
  });

  test('adds an independent block to the selected fold subtree with Cmd/Ctrl click', () => {
    flushSync(() => {
      root.render(<DocumentBodyEditor value={value} onChange={() => {}} />);
    });
    const handles = container.querySelectorAll('button[aria-label="块菜单"]');

    flushSync(() => {
      handles[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      handles[2].dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        metaKey: true,
      }));
    });

    expect(container.querySelectorAll('[data-document-body-block-id][data-block-selected="true"]')).toHaveLength(3);
  });

  test('duplicates the selected fold subtree directly below the source blocks', () => {
    const onChange = jest.fn();
    flushSync(() => {
      root.render(<DocumentBodyEditor value={value} onChange={onChange} />);
    });
    const firstBlock = container.querySelector('[data-document-body-block-id="one"]');
    const foldHandle = firstBlock.querySelector('button[aria-label="块菜单"]');
    const duplicateButton = firstBlock.querySelector('button[data-menu-key="duplicate"]');

    flushSync(() => {
      foldHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      duplicateButton.click();
    });

    const nextValue = onChange.mock.calls.at(-1)[0];
    expect(nextValue.blocks.map(block => block.content)).toEqual([
      '第一块',
      '<strong>第二块</strong>',
      '第一块',
      '<strong>第二块</strong>',
      '第三块',
    ]);
    expect(nextValue.blocks[2].id).not.toBe('one');
    expect(nextValue.blocks[3].id).not.toBe('two');
    expect(nextValue.blocks[2].meta).toEqual(value.blocks[0].meta);
    expect(nextValue.blocks[3].meta).toEqual(value.blocks[1].meta);
  });

  test('inserts a styled mention and sends notification after undo window', async () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{ blocks: [{ id: 'mention-line', type: 'paragraph', content: '', meta: {} }] }}
          onChange={onChange}
          mentionContext={{ entity_type: 'goal', entity_id: 5, module_name: '目标', title: '增长目标' }}
        />
      );
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    inlineEditor.textContent = '@';
    const range = document.createRange();
    range.selectNodeContents(inlineEditor);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    flushSync(() => {
      inlineEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    const memberButton = Array.from(container.querySelectorAll('[role="button"]'))
      .find(node => node.textContent.includes('陈豪赞'));
    expect(memberButton).toBeTruthy();

    flushSync(() => {
      memberButton.click();
    });

    expect(inlineEditor.innerHTML).toContain('@陈豪赞');
    expect(onChange.mock.calls.at(-1)[0].blocks[0].content).toContain('background-color');

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mentionsApi.notify).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'goal',
      entity_id: 5,
      target_user_id: 2,
    }));
    jest.useRealTimers();
  });

  test('preloads mention candidates so picker opens with members immediately', async () => {
    jest.useFakeTimers();
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{ blocks: [{ id: 'mention-fast-line', type: 'paragraph', content: '', meta: {} }] }}
          onChange={() => {}}
          mentionContext={{ entity_type: 'goal', entity_id: 5, module_name: '目标', title: '增长目标' }}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    inlineEditor.textContent = '@';
    const range = document.createRange();
    range.selectNodeContents(inlineEditor);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    flushSync(() => {
      inlineEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-mention-picker="true"]')).toBeTruthy();
    expect(container.textContent).toContain('陈豪赞');
    expect(container.textContent).not.toContain('loading');
    expect(mentionsApi.candidates).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('deletes a styled mention as one record when caret is after it and Delete is pressed', () => {
    const onChange = jest.fn();
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{
            blocks: [{
              id: 'mention-delete-line',
              type: 'paragraph',
              content: '跟进 <span data-relation-mention="true" contenteditable="false" style="background-color:#e6f4ff;color:#0958d9;">@陈豪赞</span>&nbsp;项目',
              meta: {},
            }],
          }}
          onChange={onChange}
          mentionContext={{ entity_type: 'goal', entity_id: 5 }}
        />
      );
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    const mentionNode = inlineEditor.querySelector('[data-relation-mention="true"]');
    const range = document.createRange();
    range.setStartAfter(mentionNode);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    flushSync(() => {
      inlineEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    });

    expect(inlineEditor.textContent).not.toContain('@陈豪赞');
    expect(onChange.mock.calls.at(-1)[0].blocks[0].content).not.toContain('@陈豪赞');
  });

  test('closes mention picker when the trigger text no longer matches', async () => {
    jest.useFakeTimers();
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{ blocks: [{ id: 'mention-close-line', type: 'paragraph', content: '', meta: {} }] }}
          onChange={() => {}}
          mentionContext={{ entity_type: 'goal', entity_id: 5 }}
        />
      );
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    inlineEditor.textContent = '@';
    const range = document.createRange();
    range.selectNodeContents(inlineEditor);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    flushSync(() => {
      inlineEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-mention-picker="true"]')).toBeTruthy();

    inlineEditor.textContent = '普通文字';
    const closeRange = document.createRange();
    closeRange.selectNodeContents(inlineEditor);
    closeRange.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(closeRange);
    flushSync(() => {
      inlineEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-mention-picker="true"]')).toBeFalsy();
    jest.useRealTimers();
  });

  test('allows mentioning self without sending a notification', async () => {
    jest.useFakeTimers();
    window.localStorage.setItem('user', JSON.stringify({ id: 9, name: 'Iris林璐韵' }));
    mentionsApi.candidates.mockResolvedValue({ users: [{ id: 9, name: 'Iris林璐韵', username: 'iris' }] });
    const onChange = jest.fn();
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{ blocks: [{ id: 'mention-self-line', type: 'paragraph', content: '', meta: {} }] }}
          onChange={onChange}
          mentionContext={{ entity_type: 'goal', entity_id: 5, module_name: '目标', title: '增长目标' }}
        />
      );
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    inlineEditor.textContent = '@';
    const range = document.createRange();
    range.selectNodeContents(inlineEditor);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    flushSync(() => {
      inlineEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    const memberButton = Array.from(container.querySelectorAll('[role="button"]'))
      .find(node => node.textContent.includes('Iris林璐韵'));
    expect(memberButton).toBeTruthy();

    flushSync(() => {
      memberButton.click();
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(inlineEditor.innerHTML).toContain('@Iris林璐韵');
    expect(mentionsApi.notify).not.toHaveBeenCalled();
    expect(message.info).toHaveBeenCalledWith('已添加 @自己，不发送通知');
    jest.useRealTimers();
  });

  test('copies only the blocks intersected by a native mouse-style selection', () => {
    flushSync(() => {
      root.render(<DocumentBodyEditor value={value} onChange={() => {}} />);
    });
    const blockNodes = container.querySelectorAll('[data-document-body-block-id]');
    const editableNodes = container.querySelectorAll('[contenteditable="true"]');
    const range = document.createRange();
    range.setStart(editableNodes[0].firstChild, 1);
    range.setEnd(editableNodes[1].querySelector('strong').firstChild, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const clipboardData = createClipboardData();
    let copyEvent;
    flushSync(() => {
      copyEvent = dispatchCopy(blockNodes[0], clipboardData);
    });

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(JSON.parse(clipboardData.getData(DOCUMENT_BODY_CLIPBOARD_MIME)).blocks.map(block => block.content))
      .toEqual(['第一块', '<strong>第二块</strong>']);
  });

  test('drags across independent editable blocks and copies the selected block range', () => {
    flushSync(() => {
      root.render(<DocumentBodyEditor value={value} onChange={() => {}} />);
    });
    const blockNodes = container.querySelectorAll('[data-document-body-block-id]');
    const editableNodes = container.querySelectorAll('[contenteditable="true"]');
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = jest.fn(() => editableNodes[1]);

    flushSync(() => {
      editableNodes[0].dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }));
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 10,
        clientY: 60,
      }));
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: 10,
        clientY: 60,
      }));
    });

    expect(container.querySelectorAll('[data-document-body-block-id][data-copy-selected="true"]')).toHaveLength(2);
    window.getSelection()?.removeAllRanges();
    const clipboardData = createClipboardData();
    let copyEvent;
    flushSync(() => {
      copyEvent = dispatchCopy(blockNodes[0], clipboardData);
    });

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(JSON.parse(clipboardData.getData(DOCUMENT_BODY_CLIPBOARD_MIME)).blocks.map(block => block.content))
      .toEqual(['第一块', '<strong>第二块</strong>']);
    document.elementFromPoint = originalElementFromPoint;
  });

  test('keeps block selection active in only one meeting editor at a time', () => {
    flushSync(() => {
      root.render(
        <>
          <DocumentBodyEditor value={value} onChange={() => {}} />
          <DocumentBodyEditor value={value} onChange={() => {}} />
        </>
      );
    });
    const editorRegions = container.querySelectorAll('[aria-label="正文编辑区"]');
    const firstInlineEditor = editorRegions[0].querySelector('[contenteditable="true"]');
    const secondInlineEditor = editorRegions[1].querySelector('[contenteditable="true"]');

    firstInlineEditor.focus();
    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'a', metaKey: true, bubbles: true, cancelable: true,
      }));
    });
    expect(editorRegions[0].querySelectorAll('[data-copy-selected="true"]')).toHaveLength(3);

    secondInlineEditor.focus();
    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'a', metaKey: true, bubbles: true, cancelable: true,
      }));
    });
    expect(editorRegions[0].querySelectorAll('[data-copy-selected="true"]')).toHaveLength(0);
    expect(editorRegions[1].querySelectorAll('[data-copy-selected="true"]')).toHaveLength(3);
  });

  test('pastes multi-line inline content into the current block without creating extra blocks', () => {
    const onChange = jest.fn();
    const inlineValue = {
      format: DOCUMENT_BODY_FORMAT,
      blocks: [{ id: 'target', type: 'paragraph', content: '已有内容', meta: {} }],
    };
    flushSync(() => {
      root.render(<DocumentBodyEditor value={inlineValue} onChange={onChange} />);
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(inlineEditor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    const clipboardData = createClipboardData();
    clipboardData.setData('text/html', '<div>第一行</div><div><strong>第二行</strong></div>');
    clipboardData.setData('text/plain', '第一行\n第二行');

    let pasteEvent;
    flushSync(() => {
      pasteEvent = dispatchPaste(inlineEditor, clipboardData);
    });

    expect(pasteEvent.defaultPrevented).toBe(true);
    const nextValue = onChange.mock.calls.at(-1)[0];
    expect(nextValue.blocks).toHaveLength(1);
    expect(nextValue.blocks[0].content).toContain('已有内容第一行<br><strong>第二行</strong>');
  });

  test('Enter in the middle of a numbered item moves the trailing content to the next item', () => {
    const onChange = jest.fn();
    const listValue = {
      format: DOCUMENT_BODY_FORMAT,
      blocks: [
        { id: 'wish', type: 'numbered', content: '许愿星测试：', meta: { indent: 1, hierarchy: 'list' } },
        { id: 'next', type: 'numbered', content: '数字列表项', meta: { indent: 1, hierarchy: 'list' } },
      ],
    };
    flushSync(() => {
      root.render(<DocumentBodyEditor value={listValue} onChange={onChange} />);
    });
    const inlineEditor = container.querySelector('[data-document-body-block-id="wish"] [contenteditable="true"]');
    inlineEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(inlineEditor.firstChild, 3);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    let enterEvent;
    flushSync(() => {
      enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      inlineEditor.dispatchEvent(enterEvent);
    });

    expect(enterEvent.defaultPrevented).toBe(true);
    const nextValue = onChange.mock.calls.at(-1)[0];
    expect(nextValue.blocks.map(block => ({ type: block.type, content: block.content, indent: block.meta.indent })))
      .toEqual([
        { type: 'numbered', content: '许愿星', indent: 1 },
        { type: 'numbered', content: '测试：', indent: 1 },
        { type: 'numbered', content: '数字列表项', indent: 1 },
      ]);
  });

  test('Enter preserves inline formatting on both sides of the split point', () => {
    const onChange = jest.fn();
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{
            blocks: [{
              id: 'styled',
              type: 'numbered',
              content: '<strong>许愿星</strong><span style="color: #d4380d">测试：</span>',
              meta: { indent: 0, hierarchy: 'list' },
            }],
          }}
          onChange={onChange}
        />
      );
    });
    const inlineEditor = container.querySelector('[data-document-body-block-id="styled"] [contenteditable="true"]');
    const trailingText = inlineEditor.querySelector('span').firstChild;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(trailingText, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    flushSync(() => {
      inlineEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    const nextValue = onChange.mock.calls.at(-1)[0];
    expect(nextValue.blocks[0].content).toBe('<strong>许愿星</strong>');
    expect(nextValue.blocks[1].content).toContain('color: #d4380d');
    expect(nextValue.blocks[1].content).toContain('测试：');
  });

  test('Backspace at the start of a block merges it into the previous block', () => {
    const onChange = jest.fn();
    const mergeValue = {
      format: DOCUMENT_BODY_FORMAT,
      blocks: [
        { id: 'previous', type: 'paragraph', content: '上一行', meta: {} },
        { id: 'current', type: 'paragraph', content: '<strong>下一行</strong>', meta: {} },
      ],
    };
    flushSync(() => {
      root.render(<DocumentBodyEditor value={mergeValue} onChange={onChange} />);
    });
    const currentEditor = container.querySelector('[data-document-body-block-id="current"] [contenteditable="true"]');
    currentEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(currentEditor);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    let backspaceEvent;
    flushSync(() => {
      backspaceEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      currentEditor.dispatchEvent(backspaceEvent);
    });

    expect(backspaceEvent.defaultPrevented).toBe(true);
    const nextValue = onChange.mock.calls.at(-1)[0];
    expect(nextValue.blocks).toHaveLength(1);
    expect(nextValue.blocks[0]).toMatchObject({ id: 'previous', content: '上一行<strong>下一行</strong>' });
  });

  test('Backspace inside a non-empty block deterministically deletes one character', () => {
    const onChange = jest.fn();
    flushSync(() => {
      root.render(<DocumentBodyEditor value={{ blocks: [{ id: 'line', type: 'paragraph', content: '三个字', meta: {} }] }} onChange={onChange} />);
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(inlineEditor.firstChild, 2);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });

    flushSync(() => inlineEditor.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onChange.mock.calls.at(-1)[0].blocks[0].content).toBe('三字');
  });

  test('Backspace at the start of an inline line removes only the line break', () => {
    const onChange = jest.fn();
    flushSync(() => {
      root.render(<DocumentBodyEditor value={{ blocks: [{ id: 'line', type: 'paragraph', content: '上一行<br>下一行', meta: {} }] }} onChange={onChange} />);
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    const textNodes = [...inlineEditor.childNodes].filter(node => node.nodeType === 3);
    expect(textNodes).toHaveLength(2);
    inlineEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNodes[1], 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });

    flushSync(() => inlineEditor.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onChange.mock.calls.at(-1)[0].blocks[0].content).toBe('上一行下一行');
  });

  test('Delete inside a non-empty block deterministically deletes one forward character', () => {
    const onChange = jest.fn();
    flushSync(() => {
      root.render(<DocumentBodyEditor value={{ blocks: [{ id: 'line', type: 'paragraph', content: '三个字', meta: {} }] }} onChange={onChange} />);
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    inlineEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(inlineEditor.firstChild, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });

    flushSync(() => inlineEditor.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onChange.mock.calls.at(-1)[0].blocks[0].content).toBe('三字');
  });

  test('does not show list item placeholder text while editing an empty numbered list item', () => {
    flushSync(() => {
      root.render(
        <DocumentBodyEditor
          value={{ blocks: [{ id: 'empty-numbered', type: 'numbered', content: '', meta: {} }] }}
          onChange={() => {}}
        />
      );
    });
    const inlineEditor = container.querySelector('[contenteditable="true"]');
    flushSync(() => {
      inlineEditor.focus();
      inlineEditor.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('数字列表项');
    expect(container.textContent).not.toContain('列表项');
  });
});
