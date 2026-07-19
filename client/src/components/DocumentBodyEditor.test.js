import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import DocumentBodyEditor from './DocumentBodyEditor';
import { DOCUMENT_BODY_CLIPBOARD_MIME, DOCUMENT_BODY_FORMAT } from '../utils/documentBodyBlocks';

jest.mock('antd', () => {
  const ReactModule = require('react');
  const Button = ({ children, icon, onClick, onMouseDown, ...props }) => (
    <button type="button" onClick={onClick} onMouseDown={onMouseDown} {...props}>{icon}{children}</button>
  );
  const Input = props => <input {...props} />;
  Input.TextArea = props => <textarea {...props} />;
  return {
    Button,
    Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={checked} onChange={onChange} />,
    Divider: () => <hr />,
    Dropdown: ({ children }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    Input,
    Space: ({ children }) => <div>{children}</div>,
    Tooltip: ({ children }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    message: { info: jest.fn(), success: jest.fn() },
  };
});

jest.mock('@ant-design/icons', () => ({
  ArrowDownOutlined: () => null,
  ArrowLeftOutlined: () => null,
  ArrowRightOutlined: () => null,
  ArrowUpOutlined: () => null,
  DeleteOutlined: () => null,
  LinkOutlined: () => null,
  PlusOutlined: () => null,
}));

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

describe('DocumentBodyEditor block copy', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
});
