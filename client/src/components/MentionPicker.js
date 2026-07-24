import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Empty, Input, List, Spin, Typography, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { mentionsApi } from '../api';

const { Text } = Typography;
const mentionStyle = 'display:inline-flex;align-items:center;border-radius:4px;background-color:#e6f4ff;color:#0958d9;padding:0 4px;font-weight:600;';
const MENTION_SELECTOR = 'span[data-relation-mention="true"],span[style*="background-color:#e6f4ff"],span[style*="background-color: #e6f4ff"]';

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function buildMentionHtml(name) {
  return `<span data-relation-mention="true" contenteditable="false" style="${mentionStyle}">@${escapeHtml(name)}</span>&nbsp;`;
}

function getSelectionRangeInside(editor) {
  if (!editor || typeof window === 'undefined') return null;
  const selection = window.getSelection?.();
  if (!selection || !selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  return { selection, range };
}

function getTextOffset(editor, range) {
  const before = document.createRange();
  before.selectNodeContents(editor);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function setRangeByTextOffset(editor, start, end) {
  const walker = document.createTreeWalker(editor, window.NodeFilter.SHOW_TEXT, null);
  let currentOffset = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nextOffset = currentOffset + (node.nodeValue || '').length;
    if (!startNode && start >= currentOffset && start <= nextOffset) {
      startNode = node;
      startOffset = start - currentOffset;
    }
    if (!endNode && end >= currentOffset && end <= nextOffset) {
      endNode = node;
      endOffset = end - currentOffset;
      break;
    }
    currentOffset = nextOffset;
  }
  const range = document.createRange();
  if (!startNode || !endNode) {
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function getContentEditableMentionTrigger(editor) {
  const caret = getSelectionRangeInside(editor);
  if (!caret) return null;
  const text = editor.textContent || '';
  const offset = getTextOffset(editor, caret.range);
  const before = text.slice(0, offset);
  const match = before.match(/(^|[\s([{，。；：、“‘])@([\p{L}\p{N}_-]{0,24})$/u);
  if (!match) return null;
  const atOffset = offset - match[2].length - 1;
  const rect = typeof caret.range.getBoundingClientRect === 'function'
    ? caret.range.getBoundingClientRect()
    : null;
  const editorRect = editor.getBoundingClientRect();
  return {
    editor,
    query: match[2] || '',
    atOffset,
    endOffset: offset,
    lineContent: text.split(/\r?\n/).find(line => line.includes('@')) || text,
    position: {
      left: (rect?.left || editorRect.left) + window.scrollX,
      top: (rect?.bottom || editorRect.bottom) + window.scrollY + 6,
    },
  };
}

export function insertMentionIntoContentEditable(trigger, userName) {
  const editor = trigger?.editor;
  if (!editor || !userName || typeof document === 'undefined') return '';
  editor.focus();
  const range = setRangeByTextOffset(editor, trigger.atOffset, trigger.endOffset);
  const selection = window.getSelection?.();
  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = buildMentionHtml(userName);
  const fragment = template.content;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (selection && lastNode) {
    const nextRange = document.createRange();
    nextRange.setStartAfter(lastNode);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return editor.textContent || '';
}

function isMentionElement(node) {
  if (!node || node.nodeType !== 1 || node.tagName !== 'SPAN') return false;
  if (node.getAttribute('data-relation-mention') === 'true') return true;
  const style = String(node.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
  return style.includes('background-color:#e6f4ff') && String(node.textContent || '').trim().startsWith('@');
}

function textOffsetBeforeNode(editor, targetNode) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEndBefore(targetNode);
  return range.toString().length;
}

function removeAdjacentWhitespaceText(node, direction = 'after') {
  const sibling = direction === 'before' ? node.previousSibling : node.nextSibling;
  if (sibling?.nodeType !== 3) return;
  const value = sibling.nodeValue || '';
  if (!value) return;
  if (direction === 'after') {
    sibling.nodeValue = value.replace(/^[\s\u00a0]+/, '');
  } else {
    sibling.nodeValue = value.replace(/[\s\u00a0]+$/, '');
  }
  if (!sibling.nodeValue) sibling.remove();
}

function collapseSelectionNear(editor, referenceNode) {
  const selection = window.getSelection?.();
  if (!selection || !editor) return;
  const range = document.createRange();
  if (referenceNode && editor.contains(referenceNode)) {
    range.setStartBefore(referenceNode);
  } else {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function removeAdjacentMentionFromContentEditable(editor, event) {
  if (!editor || !event || (event.key !== 'Delete' && event.key !== 'Backspace')) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const caret = getSelectionRangeInside(editor);
  if (!caret) return false;
  const offset = getTextOffset(editor, caret.range);
  const mentions = Array.from(editor.querySelectorAll(MENTION_SELECTOR)).filter(isMentionElement);
  let target = null;
  let removeWhitespace = 'after';
  mentions.some(node => {
    const start = textOffsetBeforeNode(editor, node);
    const end = start + (node.textContent || '').length;
    const textBetweenAfter = (editor.textContent || '').slice(end, offset);
    const textBetweenBefore = (editor.textContent || '').slice(offset, start);
    if ((event.key === 'Delete' || event.key === 'Backspace') && offset >= end && /^[\s\u00a0]*$/.test(textBetweenAfter)) {
      target = node;
      removeWhitespace = 'after';
      return true;
    }
    if (event.key === 'Delete' && offset <= start && /^[\s\u00a0]*$/.test(textBetweenBefore)) {
      target = node;
      removeWhitespace = 'before';
      return true;
    }
    return false;
  });
  if (!target) return false;
  const nextReference = removeWhitespace === 'after' ? target.nextSibling : target;
  removeAdjacentWhitespaceText(target, removeWhitespace);
  target.remove();
  collapseSelectionNear(editor, nextReference);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function getCurrentUserId() {
  if (typeof window === 'undefined') return null;
  try {
    const user = JSON.parse(window.localStorage.getItem('user') || 'null');
    return user?.id ? Number(user.id) : null;
  } catch {
    return null;
  }
}

export function scheduleMentionNotification({ context, user, lineContent }) {
  if (!context?.entity_type || !context?.entity_id || !user?.id) return;
  if (Number(user.id) === getCurrentUserId()) {
    message.info('已添加 @自己，不发送通知');
    return;
  }
  const key = `mention-${context.entity_type}-${context.entity_id}-${user.id}-${Date.now()}`;
  let canceled = false;
  const close = () => {
    canceled = true;
    window.clearTimeout(timer);
    message.destroy(key);
  };
  const timer = window.setTimeout(async () => {
    if (canceled) return;
    try {
      await mentionsApi.notify({
        ...context,
        target_user_id: user.id,
        line_content: lineContent,
      });
    } catch (error) {
      message.error(error?.response?.data?.error || error?.message || '@ 通知发送失败');
    }
  }, 5000);
  message.open({
    key,
    type: 'info',
    duration: 5,
    content: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span>将通知 {user.name || user.display_name || user.username}</span>
        <Button type="link" size="small" onClick={close} style={{ padding: 0 }}>取消</Button>
        <Button type="text" size="small" aria-label="取消通知" icon={<CloseOutlined />} onClick={close} />
      </span>
    ),
  });
}

export default function MentionPicker({ open, context, query = '', position, onSelect, onClose }) {
  const [members, setMembers] = useState([]);
  const [keyword, setKeyword] = useState(query || '');
  const [loading, setLoading] = useState(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    setKeyword(query || '');
  }, [query, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (event.target?.closest?.('[data-mention-picker="true"]')) return;
      onClose?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !context?.entity_type || !context?.entity_id) return undefined;
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setLoading(true);
    mentionsApi.candidates(context)
      .then(data => {
        if (requestSeqRef.current !== seq) return;
        setMembers(Array.isArray(data?.users) ? data.users : []);
      })
      .catch(error => {
        if (requestSeqRef.current !== seq) return;
        setMembers([]);
        message.error(error?.response?.data?.error || error?.message || '@ 成员加载失败');
      })
      .finally(() => {
        if (requestSeqRef.current === seq) setLoading(false);
      });
    return undefined;
  }, [open, context?.entity_type, context?.entity_id, context?.scope]);

  const filtered = useMemo(() => {
    const needle = String(keyword || '').trim().toLowerCase();
    if (!needle) return members;
    return members.filter(user => [
      user.name,
      user.display_name,
      user.username,
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [keyword, members]);

  if (!open) return null;
  return (
    <div
      data-mention-picker="true"
      style={{
        position: 'fixed',
        left: Math.min(Math.max(12, Number(position?.left || 0)), Math.max(12, window.innerWidth - 292)),
        top: Math.min(Math.max(12, Number(position?.top || 0)), Math.max(12, window.innerHeight - 340)),
        zIndex: 3000,
        width: 280,
        maxHeight: 328,
        background: '#fff',
        border: '1px solid #dbeafe',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(15,23,42,0.18)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 10, borderBottom: '1px solid #eef2ff' }}>
        <Input
          size="small"
          autoFocus
          value={keyword}
          placeholder="搜索可通知成员"
          onChange={event => setKeyword(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') onClose?.();
            if (event.key === 'Enter' && filtered[0]) onSelect?.(filtered[0]);
          }}
        />
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>
      ) : filtered.length ? (
        <List
          dataSource={filtered.slice(0, 30)}
          style={{ maxHeight: 270, overflowY: 'auto' }}
          renderItem={user => (
            <List.Item
              role="button"
              tabIndex={0}
              onMouseDown={event => event.preventDefault()}
              onClick={() => onSelect?.(user)}
              onKeyDown={event => {
                if (event.key === 'Enter') onSelect?.(user);
              }}
              style={{ padding: '8px 12px', cursor: 'pointer' }}
            >
              <List.Item.Meta
                avatar={<Avatar size={28}>{String(user.name || user.username || '用').slice(0, 1)}</Avatar>}
                title={<Text style={{ fontSize: 14 }}>{user.name || user.display_name || user.username}</Text>}
                description={<Text type="secondary" style={{ fontSize: 12 }}>{user.department || user.role || ''}</Text>}
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可通知成员" style={{ padding: 24 }} />
      )}
    </div>
  );
}
