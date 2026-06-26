import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Avatar,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CaretDownFilled,
  CaretRightFilled,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FullscreenExitOutlined,
  FundProjectionScreenOutlined,
  HistoryOutlined,
  LeftOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  RollbackOutlined,
  StarFilled,
  StarOutlined,
  TeamOutlined,
  UndoOutlined,
  UpOutlined,
  UploadOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { attachmentsApi, documentsApi, projectGroupsApi, teamsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import DOMPurify from 'dompurify';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const domainOptions = [
  { value: 'all', label: '全部' },
  { value: 'domestic_project', label: '国内项目' },
  { value: 'overseas_project', label: '海外项目' },
  { value: 'executive_management', label: '经营管理' },
  { value: 'general', label: '通用文档' },
  { value: 'cross_region', label: '跨区域' },
];

const departmentOptions = [
  { value: 'PM', label: '0_项目' },
  { value: 'PD', label: '1_产研' },
  { value: 'BD', label: '2_商务' },
  { value: 'OPS', label: '3_产运' },
  { value: 'ADS', label: '4_投放' },
  { value: 'MGT', label: '经营管理' },
  { value: 'ALL', label: '通用' },
];

const orgDepartmentOptions = [
  { value: 'commercial', label: '商务' },
  { value: 'operation', label: '产运' },
  { value: 'rd', label: '研发' },
  { value: 'general', label: '综合' },
  { value: 'ad_delivery', label: '投放' },
];

const docTypeOptions = [
  { value: 'SOP', label: 'SOP' },
  { value: 'RULE', label: '规则制度' },
  { value: 'TPL', label: '模板表单' },
  { value: 'SPEC', label: '技术/需求说明' },
  { value: 'PLAN', label: '计划' },
  { value: 'RPT', label: '报告' },
  { value: 'MEET', label: '会议纪要' },
  { value: 'REVIEW', label: '复盘' },
  { value: 'TMP', label: '临时文档' },
];

const blockIconStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: 5,
  color: '#64748b',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
};

function blockIcon(text, style = {}) {
  return <span style={{ ...blockIconStyle, ...style }}>{text}</span>;
}

function BlockHandleIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        color: '#6b7280',
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      ::
    </span>
  );
}

function BlockAddIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        color: '#6b7280',
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      +
    </span>
  );
}

const blockTypeGroups = [
  {
    label: '基础块',
    children: [
      { value: 'paragraph', label: '文本', icon: blockIcon('T') },
      { value: 'heading1', label: '主标题', icon: blockIcon('H1') },
      { value: 'heading2', label: '大标题', icon: blockIcon('H2') },
      { value: 'heading3', label: '中标题', icon: blockIcon('H3') },
      { value: 'heading4', label: '小标题', icon: blockIcon('H4') },
      { value: 'page', label: '页面', icon: <FileTextOutlined /> },
      { value: 'bullet', label: '列表', icon: blockIcon('•') },
      { value: 'numbered', label: '数字列表', icon: blockIcon('1') },
      { value: 'fold-list', label: '折叠列表', icon: <MenuOutlined /> },
      { value: 'quote', label: '引述文字', icon: blockIcon('“') },
      { value: 'emphasis', label: '着重文字', icon: blockIcon('Aa') },
      { value: 'marquee', label: '着重文字 - 跑马灯', icon: blockIcon('T') },
      { value: 'code', label: '代码块', icon: blockIcon('{ }') },
      { value: 'divider', label: '分割线', icon: blockIcon('—') },
    ],
  },
  {
    label: '折叠与任务',
    children: [
      { value: 'fold-heading2', label: '折叠大标题', icon: blockIcon('H2') },
      { value: 'fold-heading3', label: '折叠中标题', icon: blockIcon('H3') },
      { value: 'fold-heading4', label: '折叠小标题', icon: blockIcon('H4') },
      { value: 'todo', label: '待办列表', icon: blockIcon('☑') },
      { value: 'fold-todo', label: '折叠待办列表', icon: blockIcon('☑') },
      { value: 'fold-advanced-todo', label: '折叠高级待办列表', icon: blockIcon('◎') },
    ],
  },
  {
    label: '页面组件',
    children: [
      { value: 'toc', label: '页面目录', icon: <MenuOutlined /> },
      { value: 'button', label: '按钮', icon: blockIcon('↗') },
      { value: 'table-simple', label: '简单表格', icon: blockIcon('▦') },
      { value: 'progress', label: '进度条', icon: blockIcon('%') },
      { value: 'database-embed', label: '数据表格 - 嵌入', icon: blockIcon('DB') },
      { value: 'database-subpage', label: '数据表格 - 子页面', icon: blockIcon('DB') },
      { value: 'database-kanban', label: '数据表格 - 看板视图', icon: blockIcon('KB') },
      { value: 'database-form', label: '数据表格 - 表单', icon: blockIcon('FM') },
      { value: 'chart', label: '统计图表', icon: blockIcon('▥') },
      { value: 'mermaid', label: 'Mermaid 绘图', icon: blockIcon('M') },
      { value: 'metric', label: '仪表数字', icon: blockIcon('#') },
      { value: 'meeting', label: '会议', icon: blockIcon('会') },
      { value: 'mindmap', label: '思维导图', icon: blockIcon('⌘') },
    ],
  },
  {
    label: '软硬分栏',
    children: [
      { value: 'columns-2', label: '二列分栏', icon: blockIcon('2') },
      { value: 'columns-3', label: '三列分栏', icon: blockIcon('3') },
      { value: 'columns-4', label: '四列分栏', icon: blockIcon('4') },
      { value: 'columns-5', label: '五列分栏', icon: blockIcon('5') },
    ],
  },
  {
    label: '媒体与附件',
    children: [
      { value: 'image', label: '图片', icon: blockIcon('图') },
      { value: 'recent-image', label: '最近上传图片', icon: blockIcon('近') },
      { value: 'video', label: '视频', icon: blockIcon('▶') },
      { value: 'audio', label: '音频', icon: blockIcon('♫') },
      { value: 'attachment', label: '附件', icon: blockIcon('附') },
      { value: 'netease-music', label: '网易云音乐', icon: blockIcon('云', { color: '#dc2626' }) },
      { value: 'bilibili-video', label: '哔哩哔哩视频', icon: blockIcon('B', { color: '#0891b2' }) },
      { value: 'tencent-video', label: '腾讯视频', icon: blockIcon('腾', { color: '#16a34a' }) },
      { value: 'external-link', label: '外部链接', icon: blockIcon('↗') },
    ],
  },
];

const blockTypeOptions = blockTypeGroups.flatMap(group => group.children);
const hierarchicalListTypes = new Set(['bullet', 'numbered', 'fold-list']);
const listIndentWidth = 28;
const listMarkerBoxWidth = 20;
const listMarkerCenterOffset = 10;
const listMarkerColor = '#1f1f1f';
const listGuideColor = '#eeeeee';
const listLineHeight = 1.32;
const maxListIndent = 9;
const blockActionSelectedBackground = '#f7e3e6';
const blockActionSelectedBorder = '#f2c9d0';
const inlineToolbarWidth = 420;

const domainLabel = Object.fromEntries(domainOptions.map(item => [item.value, item.label]));
const departmentLabel = Object.fromEntries(departmentOptions.map(item => [item.value, item.label]));
const orgDepartmentLabel = Object.fromEntries(orgDepartmentOptions.map(item => [item.value, item.label]));
const docTypeLabel = Object.fromEntries(docTypeOptions.map(item => [item.value, item.label]));
const validBlockTypes = new Set(blockTypeOptions.map(item => item.value));
const blockTypeMap = Object.fromEntries(blockTypeOptions.map(item => [item.value, item]));
const documentAdminRoles = new Set(['admin']);
const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const textPreviewExts = ['txt', 'md', 'csv', 'json', 'log', 'xml'];
const mediaAcceptMap = {
  image: '.jpg,.jpeg,.png,.gif,.webp',
  video: '.mp4,.mov,.avi',
  audio: '.mp3,.wav,.m4a,.aac,.ogg',
};
const attachmentAccept = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.ofd', '.caj', '.ceb',
  '.doc', '.docx', '.dot', '.dotx', '.rtf', '.wps', '.wpt', '.odt', '.pages',
  '.xls', '.xlsx', '.xlsm', '.xlsb', '.csv', '.tsv', '.et', '.ett', '.ods', '.numbers',
  '.ppt', '.pptx', '.pps', '.ppsx', '.dps', '.dpt', '.odp', '.key',
  '.txt', '.md', '.markdown', '.json', '.log', '.xml', '.yaml', '.yml',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2',
  '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac',
  '.apk', '.aab', '.ipa',
  '.vsdx', '.drawio', '.xmind', '.mind', '.mm',
  '.eml', '.msg',
].join(',');
const clipboardImagePasteLimit = 10;
const clipboardImageExtByMime = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const documentLinkParamKeys = ['doc', 'document_id', 'documentId', 'docId'];
const documentAutoSaveDelay = 3000;
const documentAutoSaveInterval = 30000;
const documentClipboardBlocksMime = 'application/x-relation-document-blocks';

function getDocumentIdFromSearch(searchParams) {
  for (const key of documentLinkParamKeys) {
    const value = searchParams.get(key);
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

function buildDocumentPageLink(docId) {
  const id = Number(docId);
  if (!Number.isFinite(id) || id <= 0) return '';
  const url = new URL('/documents', window.location.origin);
  url.searchParams.set('doc', String(id));
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '0';
  document.body.appendChild(input);
  input.focus();
  input.select();
  try {
    const copied = document.execCommand('copy');
    if (!copied) throw new Error('copy failed');
  } finally {
    document.body.removeChild(input);
  }
}

function getFileExt(filename = '') {
  return String(filename || '').split('.').pop().toLowerCase();
}

function isImageAttachment(attachment) {
  const mime = String(attachment?.mimetype || '');
  return mime.startsWith('image/') || imageExts.includes(getFileExt(attachment?.filename));
}

function getAttachmentDisplayName(attachment = {}) {
  return attachment.display_name || attachment.filename || attachment.name || '未命名附件';
}

function getAttachmentUrl(attachment = {}) {
  return attachment.preview_url || attachment.url || (attachment.filepath ? `/uploads/${attachment.filepath}` : '');
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 1024 * 10 ? 1 : 0)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size < 1024 * 1024 * 10 ? 1 : 0)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function clampUploadPercent(value, fallback = 0, max = 100) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return fallback;
  return Math.max(0, Math.min(max, Math.round(percent)));
}

function normalizeUploadProgressPercent(progressEvent) {
  const progress = Number(progressEvent?.progress);
  if (Number.isFinite(progress)) return clampUploadPercent(progress * 100, 0, 99);

  const loaded = Number(progressEvent?.loaded);
  const total = Number(progressEvent?.total);
  if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
    return clampUploadPercent((loaded / total) * 100, 0, 99);
  }

  return null;
}

function attachmentToMediaMeta(attachment) {
  if (!attachment) return {};
  return {
    attachment_id: attachment.id || null,
    filename: attachment.filename || '',
    url: attachment.filepath ? `/uploads/${attachment.filepath}` : '',
    mimetype: attachment.mimetype || '',
  };
}

function attachmentToBlockMeta(attachment) {
  if (!attachment) return getDefaultBlockMeta('attachment');
  const displayName = getAttachmentDisplayName(attachment);
  return {
    attachment_id: attachment.id || null,
    filename: attachment.filename || displayName,
    display_name: displayName,
    url: getAttachmentUrl(attachment),
    filepath: attachment.filepath || '',
    mimetype: attachment.mimetype || '',
    file_ext: attachment.file_ext || getFileExt(displayName),
    size: Number(attachment.size || 0),
    preview_status: attachment.preview_status || 'unsupported',
    created_by_name: attachment.creator_name || attachment.created_by_name || '',
    created_at: attachment.created_at || '',
    updated_at: attachment.updated_at || '',
  };
}

function blockMetaToAttachment(meta = {}) {
  const displayName = meta.display_name || meta.filename || '';
  return {
    id: meta.attachment_id || meta.id || null,
    filename: meta.filename || displayName,
    display_name: displayName,
    url: meta.url || '',
    filepath: meta.filepath || '',
    mimetype: meta.mimetype || '',
    file_ext: meta.file_ext || getFileExt(displayName),
    size: Number(meta.size || 0),
    preview_status: meta.preview_status || 'unsupported',
    creator_name: meta.created_by_name || '',
    created_at: meta.created_at || '',
    updated_at: meta.updated_at || '',
  };
}

function getAttachmentPreviewKind(attachment = {}) {
  const mime = String(attachment.mimetype || '').toLowerCase();
  const ext = String(attachment.file_ext || getFileExt(getAttachmentDisplayName(attachment))).toLowerCase();
  if (mime.startsWith('image/') || imageExts.includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(ext)) return 'video';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || textPreviewExts.includes(ext)) return 'text';
  return 'unsupported';
}

function getClipboardImageFiles(event) {
  const clipboardData = event?.clipboardData;
  if (!clipboardData) return [];
  const itemFiles = Array.from(clipboardData.items || []).map(item => {
    if (item.kind !== 'file' || !String(item.type || '').startsWith('image/')) return;
    return item.getAsFile();
  }).filter(Boolean);
  if (itemFiles.length) return itemFiles;
  return Array.from(clipboardData.files || [])
    .filter(file => String(file?.type || '').startsWith('image/'));
}

function normalizeClipboardImageFile(file, index = 0) {
  const currentExt = getFileExt(file?.name);
  if (currentExt && imageExts.includes(currentExt)) return file;
  const mime = String(file?.type || 'image/png').toLowerCase();
  const ext = clipboardImageExtByMime[mime] || 'png';
  const timestamp = dayjs().format('YYYYMMDD-HHmmss');
  return new File([file], `clipboard-image-${timestamp}-${index + 1}.${ext}`, {
    type: mime,
    lastModified: file?.lastModified || Date.now(),
  });
}

function createBlock(type = 'paragraph', content = '', extra = {}) {
  return {
    id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    ...extra,
  };
}

function cloneMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return { ...meta };
  }
}

function getColumnCount(type) {
  const match = String(type || '').match(/^columns-(\d)$/);
  return match ? Number(match[1]) : 0;
}

function getMediaKind(type) {
  if (type === 'image' || type === 'recent-image') return 'image';
  if (type === 'video' || type === 'bilibili-video' || type === 'tencent-video') return 'video';
  if (type === 'audio' || type === 'netease-music') return 'audio';
  return null;
}

function getDefaultBlockContent(type) {
  if (type === 'heading1') return '主标题';
  if (type === 'heading2') return '大标题';
  if (type === 'heading3') return '中标题';
  if (type === 'heading4') return '小标题';
  if (type === 'page') return '页面标题';
  if (type === 'bullet') return '';
  if (type === 'numbered') return '';
  if (type === 'fold-list') return '';
  if (type === 'quote') return '引述文字';
  if (type === 'emphasis') return '着重文字';
  if (type === 'marquee') return '重点提示';
  if (type === 'todo') return '';
  if (type === 'fold-todo') return '';
  if (type === 'fold-advanced-todo') return '';
  if (type === 'fold-heading2') return '折叠大标题';
  if (type === 'fold-heading3') return '折叠中标题';
  if (type === 'fold-heading4') return '折叠小标题';
  if (type === 'button') return '按钮';
  if (type === 'progress') return '任务进度';
  if (type === 'chart') return '指标,数值\n访问量,120\n转化量,36';
  if (type === 'mermaid') return 'graph TD\n  A[开始] --> B[完成]';
  if (type === 'metric') return '核心指标';
  if (type === 'meeting') return '会议主题\n参会人：\n议题：';
  if (type === 'mindmap') return '- 中心主题\n  - 分支一\n  - 分支二';
  if (type === 'database-embed') return '嵌入数据表格';
  if (type === 'database-subpage') return '子页面数据表格';
  if (type === 'database-kanban') return '看板视图';
  if (type === 'database-form') return '表单视图';
  if (type === 'external-link') return '外部链接';
  if (type === 'attachment') return '';
  if (getMediaKind(type)) return '';
  return '';
}

function getTransientBlockPlaceholder(type) {
  if (type === 'bullet') return '列表项';
  if (type === 'numbered') return '数字列表项';
  if (type === 'fold-list') return '折叠列表标题';
  if (type === 'todo') return '待办事项';
  if (type === 'fold-todo') return '折叠待办事项';
  if (type === 'fold-advanced-todo') return '高级待办事项';
  return '';
}

function normalizeTransientBlockInput(block, nextValue) {
  const placeholder = getTransientBlockPlaceholder(block?.type);
  const currentValue = String(block?.content || '');
  if (!placeholder || currentValue !== placeholder) return nextValue;
  const value = String(nextValue || '');
  if (value === placeholder) return value;
  return value.replace(placeholder, '');
}

function getDefaultBlockMeta(type) {
  const columnCount = getColumnCount(type);
  if (columnCount) return { cells: Array.from({ length: columnCount }, (_, index) => `分栏 ${index + 1}`) };
  if (type === 'table-simple') return { columns: ['名称', '说明'], rows: [['', '']] };
  if (type?.startsWith('database-')) return { columns: ['字段', '内容'], rows: [['', '']], view: type.replace('database-', '') };
  if (type === 'progress') return { value: 30 };
  if (type === 'button') return { url: '' };
  if (type === 'metric') return { value: 0, unit: '' };
  if (type === 'bullet' || type === 'numbered') return { indent: 0 };
  if (type === 'fold-list') return { indent: 0, collapsed: false, body: '' };
  if (type?.startsWith('fold-')) return { collapsed: false, body: '' };
  if (type === 'chart') return { chartType: 'bar' };
  if (getMediaKind(type) || type === 'external-link') return { url: '', filename: '', attachment_id: null };
  if (type === 'attachment') {
    return {
      attachment_id: null,
      filename: '',
      display_name: '',
      url: '',
      filepath: '',
      mimetype: '',
      file_ext: '',
      size: 0,
      preview_status: 'unsupported',
      created_by_name: '',
      created_at: '',
      updated_at: '',
    };
  }
  return {};
}

function isHierarchicalListBlock(block) {
  return hierarchicalListTypes.has(block?.type);
}

function clampListIndent(value) {
  const indent = Number(value);
  if (!Number.isFinite(indent)) return 0;
  return Math.max(0, Math.min(maxListIndent, Math.floor(indent)));
}

function getListIndent(block) {
  return clampListIndent(block?.meta?.indent);
}

function formatAlphaNumber(value) {
  let number = Math.max(1, Number(value) || 1);
  let text = '';
  while (number > 0) {
    number -= 1;
    text = String.fromCharCode(97 + (number % 26)) + text;
    number = Math.floor(number / 26);
  }
  return text;
}

function formatRomanNumber(value) {
  const pairs = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let number = Math.max(1, Math.min(3999, Number(value) || 1));
  let text = '';
  pairs.forEach(([amount, roman]) => {
    while (number >= amount) {
      text += roman;
      number -= amount;
    }
  });
  return text;
}

function formatNumberedListMarker(value, indent) {
  const mode = clampListIndent(indent) % 3;
  if (mode === 1) return `${formatAlphaNumber(value)}.`;
  if (mode === 2) return `${formatRomanNumber(value)}.`;
  return `${Math.max(1, Number(value) || 1)}.`;
}

function getBulletListMarker(indent) {
  const markers = ['•', '◦', '◆'];
  return markers[clampListIndent(indent) % markers.length];
}

function renderBulletListMarker(indent, scale = 1) {
  const markerLevel = clampListIndent(indent) % 3;
  const markerSize = markerLevel === 1 ? 5 : 4;
  const baseStyle = {
    display: 'block',
    width: markerSize * scale,
    height: markerSize * scale,
    boxSizing: 'border-box',
  };

  if (markerLevel === 1) {
    return (
      <span
        aria-hidden="true"
        style={{
          ...baseStyle,
          border: `${Math.max(1, scale)}px solid ${listMarkerColor}`,
          borderRadius: '50%',
          background: 'transparent',
        }}
      />
    );
  }

  if (markerLevel === 2) {
    return (
      <span
        aria-hidden="true"
        style={{
          ...baseStyle,
          borderRadius: 1,
          background: listMarkerColor,
          transform: 'rotate(45deg)',
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        ...baseStyle,
        borderRadius: '50%',
        background: listMarkerColor,
      }}
    />
  );
}

function buildNumberedListMarkers(blocks = []) {
  const counters = [];
  const markers = new Map();
  blocks.forEach(block => {
    if (!isHierarchicalListBlock(block)) {
      counters.length = 0;
      return;
    }
    const indent = getListIndent(block);
    counters.length = indent + 1;
    if (block?.type !== 'numbered') {
      counters.length = indent;
      return;
    }
    counters[indent] = (counters[indent] || 0) + 1;
    markers.set(block.id, formatNumberedListMarker(counters[indent], indent));
  });
  return markers;
}

function buildCollapsedListHiddenIds(blocks = []) {
  const hidden = new Set();
  let collapsedAncestors = [];
  blocks.forEach(block => {
    const indent = isHierarchicalListBlock(block) ? getListIndent(block) : 0;
    collapsedAncestors = collapsedAncestors.filter(item => indent > item.indent);
    const isHidden = collapsedAncestors.length > 0;
    if (isHidden) hidden.add(block.id);
    if (!isHidden && block?.type === 'fold-list' && block?.meta?.collapsed) {
      collapsedAncestors.push({ id: block.id, indent });
    }
  });
  return hidden;
}

function buildHierarchicalGuideMap(blocks = [], hiddenIds = new Set()) {
  const visibleBlocks = blocks.filter(block => isHierarchicalListBlock(block) && !hiddenIds.has(block.id));
  const map = new Map();

  visibleBlocks.forEach((block, index) => {
    const indent = getListIndent(block);
    const nextBlocks = visibleBlocks.slice(index + 1);
    const nextVisible = nextBlocks[0] || null;
    map.set(block.id, {
      ancestorLines: Array.from({ length: indent }, (_, level) => ({
        level,
        continuesBelow: nextBlocks.some(next => getListIndent(next) >= level + 1),
      })),
      hasChildren: Boolean(nextVisible && getListIndent(nextVisible) > indent),
    });
  });

  return map;
}

function renderBlockMenuLabel(item, checked = false) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
      <span>{item.label}</span>
      {checked && <CheckOutlined style={{ color: '#6b7280' }} />}
    </span>
  );
}

function createEditorBlock(type = 'paragraph', extra = {}) {
  const defaultMeta = getDefaultBlockMeta(type);
  const meta = { ...defaultMeta, ...cloneMeta(extra.meta) };
  return createBlock(type, extra.content ?? getDefaultBlockContent(type), {
    checked: Boolean(extra.checked),
    highlight: extra.highlight || '',
    ...extra,
    meta,
  });
}

function collectText(value, parts = []) {
  if (value === null || value === undefined) return parts;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) parts.push(text);
    return parts;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectText(item, parts));
    return parts;
  }
  if (typeof value === 'object') {
    ['text', 'title', 'content', 'children', 'blocks', 'items'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(value, key)) collectText(value[key], parts);
    });
  }
  return parts;
}

function plainTextToBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = lines.map(line => createBlock('paragraph', line));
  return blocks.length ? blocks : [createBlock()];
}

const inlineHtmlAllowedTags = ['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'span', 'mark', 'a', 'br'];
const inlineHtmlAllowedAttrs = ['style', 'href', 'target', 'rel'];

function sanitizeInlineHtml(value) {
  if (!value) return '';
  return DOMPurify.sanitize(String(value), {
    ALLOWED_TAGS: inlineHtmlAllowedTags,
    ALLOWED_ATTR: inlineHtmlAllowedAttrs,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'src', 'srcset'],
  });
}

function inlineHtmlToPlain(value) {
  if (!value) return '';
  if (typeof document === 'undefined') return String(value).replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = sanitizeInlineHtml(value);
  return (div.textContent || div.innerText || '').replace(/\u00a0/g, ' ');
}

function setContentEditableCaretPosition(element, offset = 0) {
  if (!element || typeof document === 'undefined') return false;
  const selection = window.getSelection?.();
  if (!selection) return false;
  const targetOffset = Math.max(0, Number(offset) || 0);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let remaining = targetOffset;
  while (node) {
    const length = node.textContent?.length || 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function setContentEditableSelectionRange(element, start = 0, end = start) {
  if (!element || typeof document === 'undefined') return false;
  const selection = window.getSelection?.();
  if (!selection) return false;
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart, Number(end) || safeStart);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }

  const resolvePosition = (targetOffset) => {
    let remaining = targetOffset;
    for (const textNode of textNodes) {
      const length = textNode.textContent?.length || 0;
      if (remaining <= length) return { node: textNode, offset: remaining };
      remaining -= length;
    }
    const lastNode = textNodes[textNodes.length - 1];
    return lastNode
      ? { node: lastNode, offset: lastNode.textContent?.length || 0 }
      : { node: element, offset: element.childNodes.length };
  };

  const startPosition = resolvePosition(safeStart);
  const endPosition = resolvePosition(safeEnd);
  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function InlineHtmlView({ value, as: TagName = 'span', style }) {
  return (
    <TagName
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(value || '') }}
    />
  );
}

function isInlineHtmlContent(value) {
  return /<\/?(strong|b|em|i|u|s|strike|del|code|span|mark|a|br)\b/i.test(String(value || ''));
}

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') return createBlock();
  const type = validBlockTypes.has(block.type) ? block.type : 'paragraph';
  const meta = { ...getDefaultBlockMeta(type), ...cloneMeta(block.meta) };
  return {
    id: block.id || createBlock().id,
    type,
    content: type === 'divider' ? '' : String(block.content ?? block.text ?? block.title ?? ''),
    highlight: block.highlight || '',
    checked: Boolean(block.checked),
    meta,
  };
}

function isBlankBlock(block) {
  if (!block) return true;
  if (block.type === 'divider') return false;
  const meta = block.meta || {};
  if (meta.attachment_id || meta.display_name || meta.url || meta.filename || meta.body || meta.value) return false;
  if (Array.isArray(meta.cells) && meta.cells.some(cell => String(cell || '').trim())) return false;
  if (Array.isArray(meta.rows) && meta.rows.some(row => row.some(cell => String(cell || '').trim()))) return false;
  return !inlineHtmlToPlain(block.content || '').trim();
}

function contentToBlocks(content) {
  if (!content) return [createBlock()];
  const parsed = typeof content === 'string'
    ? (() => {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    })()
    : content;

  if (typeof parsed === 'string') return plainTextToBlocks(parsed);
  if (Array.isArray(parsed?.blocks)) {
    const blocks = parsed.blocks.map(normalizeBlock);
    return blocks.length ? blocks : [createBlock()];
  }
  return plainTextToBlocks(collectText(parsed).join('\n'));
}

function blocksToContent(blocks) {
  return {
    blocks: blocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.type === 'divider' ? '' : block.content || '',
      highlight: block.highlight || '',
      checked: Boolean(block.checked),
      meta: cloneMeta(block.meta),
    })),
  };
}

function buildDocumentSavePayload(title, blocks) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  return {
    title: title || '未命名文档',
    content: blocksToContent(safeBlocks),
    content_text: blocksToText(safeBlocks),
  };
}

function getDocumentSaveSignature(title, blocks) {
  return JSON.stringify(buildDocumentSavePayload(title, blocks));
}

function saveDocumentDraftBeforeUnload(docId, payload) {
  const token = localStorage.getItem('token');
  return fetch(`/api/documents/${docId}`, {
    method: 'PUT',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function blockMetaToText(meta = {}) {
  const parts = [];
  if (meta.url) parts.push(meta.url);
  if (meta.display_name) parts.push(meta.display_name);
  if (meta.filename) parts.push(meta.filename);
  if (meta.body) parts.push(meta.body);
  if (meta.value !== undefined && meta.value !== null && meta.value !== '') parts.push(`${meta.value}`);
  if (Array.isArray(meta.cells)) parts.push(...meta.cells);
  if (Array.isArray(meta.columns)) parts.push(meta.columns.join(' / '));
  if (Array.isArray(meta.rows)) parts.push(...meta.rows.map(row => row.join(' / ')));
  return parts
    .map(item => inlineHtmlToPlain(item).trim())
    .filter(Boolean)
    .join('\n');
}

function blocksToText(blocks) {
  return blocks
    .map(block => {
      if (block.type === 'divider') return '';
      const text = inlineHtmlToPlain(block.content || '');
      if (block.type === 'todo') return `${block.checked ? '[x]' : '[ ]'} ${text}`.trim();
      return [text, blockMetaToText(block.meta)].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTableLikeBlock(block) {
  return block?.type === 'table-simple' || String(block?.type || '').startsWith('database-');
}

function normalizeTableBlockData(block) {
  const meta = { ...getDefaultBlockMeta(block?.type), ...cloneMeta(block?.meta) };
  const columns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : ['名称', '说明'];
  const rows = Array.isArray(meta.rows) && meta.rows.length ? meta.rows : [['', '']];
  return {
    columns,
    rows: rows.map(row => columns.map((_, index) => row?.[index] || '')),
  };
}

function normalizeClipboardCellText(value) {
  return inlineHtmlToPlain(value)
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function tableMatrixToTsv(matrix = []) {
  return matrix
    .map(row => row.map(normalizeClipboardCellText).join('\t'))
    .join('\n');
}

function tableMatrixToHtml(matrix = [], { firstRowIsHeader = true } = {}) {
  const rows = matrix.map((row, rowIndex) => {
    const CellTag = firstRowIsHeader && rowIndex === 0 ? 'th' : 'td';
    const cells = row.map(cell => `<${CellTag}>${sanitizeInlineHtml(cell) || '&nbsp;'}</${CellTag}>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table>${rows}</table>`;
}

function getWholeTableMatrix(block) {
  const { columns, rows } = normalizeTableBlockData(block);
  return [columns, ...rows];
}

function getTableRangeMatrix(block, range) {
  const { columns, rows } = normalizeTableBlockData(block);
  const clampRow = rowIndex => Math.max(-1, Math.min(rows.length - 1, Number(rowIndex) || 0));
  const clampColumn = columnIndex => Math.max(0, Math.min(columns.length - 1, Number(columnIndex) || 0));
  const startRowIndex = clampRow(range?.startRowIndex);
  const endRowIndex = clampRow(range?.endRowIndex);
  const startColumnIndex = clampColumn(range?.startColumnIndex);
  const endColumnIndex = clampColumn(range?.endColumnIndex);
  const fromRow = Math.min(startRowIndex, endRowIndex);
  const toRow = Math.max(startRowIndex, endRowIndex);
  const fromColumn = Math.min(startColumnIndex, endColumnIndex);
  const toColumn = Math.max(startColumnIndex, endColumnIndex);
  const matrix = [];
  for (let rowIndex = fromRow; rowIndex <= toRow; rowIndex += 1) {
    const sourceRow = rowIndex < 0 ? columns : rows[rowIndex];
    matrix.push(sourceRow.slice(fromColumn, toColumn + 1));
  }
  return {
    matrix,
    firstRowIsHeader: fromRow < 0,
  };
}

function buildTableClipboardPayload(block, range = null) {
  const tablePayload = range
    ? getTableRangeMatrix(block, range)
    : { matrix: getWholeTableMatrix(block), firstRowIsHeader: true };
  const tableText = tableMatrixToTsv(tablePayload.matrix);
  const tableHtml = tableMatrixToHtml(tablePayload.matrix, { firstRowIsHeader: tablePayload.firstRowIsHeader });
  const blocks = range ? [] : [{
    type: block?.type || 'table-simple',
    content: '',
    meta: {
      ...getDefaultBlockMeta(block?.type),
      ...cloneMeta(block?.meta),
      ...normalizeTableBlockData(block),
    },
  }];
  return {
    text: tableText,
    html: tableHtml.replace('<table>', '<table data-document-table-block="true">'),
    blocks,
  };
}

function blockToClipboardPayload(block) {
  if (!block) return { text: '', html: '' };
  if (isTableLikeBlock(block)) return buildTableClipboardPayload(block);
  if (block.type === 'divider') return { text: '---', html: '<hr>' };
  const text = blocksToText([block]);
  const content = sanitizeInlineHtml(block.content || '');
  const label = blockTypeMap[block.type]?.label || '';
  return {
    text,
    html: content ? `<p>${content}</p>` : (text ? `<p>${escapeHtml(text)}</p>` : `<p>${escapeHtml(label)}</p>`),
  };
}

function blocksToClipboardPayload(blocks = []) {
  const payloads = blocks.map(blockToClipboardPayload).filter(payload => payload.text || payload.html);
  return {
    text: payloads.map(payload => payload.text).filter(Boolean).join('\n\n'),
    html: payloads.map(payload => payload.html).filter(Boolean).join(''),
    blocks: payloads.flatMap(payload => payload.blocks || []),
  };
}

async function copyClipboardPayload({ text = '', html = '' } = {}) {
  if (html && navigator.clipboard?.write && window.ClipboardItem && window.isSecureContext) {
    await navigator.clipboard.write([
      new window.ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
    return;
  }
  await copyTextToClipboard(text);
}

function writeClipboardPayloadToEvent(event, { text = '', html = '', blocks = [] } = {}) {
  if (!event?.clipboardData) return false;
  event.clipboardData.setData('text/plain', text);
  if (html) event.clipboardData.setData('text/html', html);
  if (blocks.length) {
    event.clipboardData.setData(documentClipboardBlocksMime, JSON.stringify({ blocks }));
  }
  return true;
}

function parseClipboardDocumentBlocks(clipboardData) {
  const raw = clipboardData?.getData?.(documentClipboardBlocksMime);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  } catch {
    return [];
  }
}

function parseClipboardHtmlTableBlocks(html) {
  if (!html || typeof document === 'undefined') return [];
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'span', 'mark', 'a', 'br'],
    ALLOWED_ATTR: ['style', 'href', 'target', 'rel'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'src', 'srcset'],
  });
  return Array.from(container.querySelectorAll('table')).map(table => {
    const rowNodes = Array.from(table.querySelectorAll('tr'));
    const matrix = rowNodes
      .map(row => Array.from(row.querySelectorAll('th,td')).map(cell => sanitizeInlineHtml(cell.innerHTML || '')))
      .filter(row => row.length);
    if (!matrix.length) return null;
    const firstRowHasHeaders = Boolean(rowNodes[0]?.querySelector('th'));
    const maxColumnCount = Math.max(...matrix.map(row => row.length), 1);
    const columns = firstRowHasHeaders
      ? matrix[0].map((cell, index) => cell || `字段 ${index + 1}`)
      : Array.from({ length: maxColumnCount }, (_, index) => `字段 ${index + 1}`);
    const sourceRows = firstRowHasHeaders ? matrix.slice(1) : matrix;
    const rows = (sourceRows.length ? sourceRows : [Array.from({ length: columns.length }, () => '')])
      .map(row => columns.map((_, index) => row[index] || ''));
    return {
      type: 'table-simple',
      content: '',
      meta: {
        ...getDefaultBlockMeta('table-simple'),
        columns,
        rows,
      },
    };
  }).filter(Boolean);
}

function buildPresentationSections(blocks, fallbackTitle) {
  const docTitle = String(fallbackTitle || '').trim() || '未命名文档';
  const sections = [];
  let current = { title: docTitle, blocks: [] };

  (blocks || []).forEach(block => {
    if (block?.type === 'page') {
      if (current.blocks.length) sections.push(current);
      current = {
        title: inlineHtmlToPlain(block.content || '').trim() || docTitle,
        blocks: [],
      };
      return;
    }
    if (block?.type === 'divider' || !isBlankBlock(block)) {
      current.blocks.push(block);
    }
  });

  if (current.blocks.length || sections.length === 0) sections.push(current);
  return sections;
}

function buildFolderTree(folders, activeDomain, visibleDocuments = []) {
  const scopedFolders = activeDomain === 'all'
    ? folders
    : folders.filter(folder => folder.domain === activeDomain);
  const domainMap = new Map();
  const documentsByFolder = new Map();

  visibleDocuments.forEach(doc => {
    if (!doc.folder_id) return;
    const folderKey = Number(doc.folder_id);
    if (!documentsByFolder.has(folderKey)) documentsByFolder.set(folderKey, []);
    documentsByFolder.get(folderKey).push(doc);
  });

  scopedFolders.forEach(folder => {
    const domainKey = folder.domain || 'general';
    if (!domainMap.has(domainKey)) {
      domainMap.set(domainKey, {
        title: domainLabel[domainKey] || domainKey,
        key: `domain-${domainKey}`,
        selectable: false,
        children: [],
        projectMap: new Map(),
      });
    }
    const domainNode = domainMap.get(domainKey);
    const projectKey = folder.project_group_id ? `project-${folder.project_group_id}` : `project-${domainKey}-none`;
    if (!domainNode.projectMap.has(projectKey)) {
      const projectNode = {
        title: folder.project_group_name || '未关联项目组',
        key: projectKey,
        selectable: false,
        children: [],
        deptMap: new Map(),
      };
      domainNode.projectMap.set(projectKey, projectNode);
      domainNode.children.push(projectNode);
    }
    const projectNode = domainNode.projectMap.get(projectKey);
    const deptKey = folder.department_key || 'ALL';
    if (!projectNode.deptMap.has(deptKey)) {
      const deptNode = {
        title: departmentLabel[deptKey] || deptKey,
        key: `${projectKey}-dept-${deptKey}`,
        selectable: false,
        children: [],
      };
      projectNode.deptMap.set(deptKey, deptNode);
      projectNode.children.push(deptNode);
    }
    const folderDocuments = documentsByFolder.get(Number(folder.id)) || [];
    const documentChildren = folderDocuments.map(doc => ({
      title: doc.title || '未命名文档',
      key: `document-${doc.id}`,
      icon: <FileTextOutlined />,
      isLeaf: true,
      nodeType: 'document',
      documentId: doc.id,
      folderId: folder.id,
      document: doc,
    }));
    projectNode.deptMap.get(deptKey).children.push({
      title: folder.name,
      key: `folder-${folder.id}`,
      icon: <FolderOutlined />,
      nodeType: 'folder',
      folderId: folder.id,
      ...(documentChildren.length ? { children: documentChildren } : {}),
    });
  });

  return Array.from(domainMap.values()).map(domainNode => {
    const { projectMap, ...domainRest } = domainNode;
    domainRest.children = domainRest.children.map(projectNode => {
      const { deptMap, ...projectRest } = projectNode;
      return projectRest;
    });
    return domainRest;
  });
}

function collectDefaultFolderExpandedKeys(nodes = []) {
  const keys = [];
  nodes.forEach(node => {
    if (!node.children?.length) return;
    if (node.nodeType !== 'folder') {
      keys.push(node.key);
      keys.push(...collectDefaultFolderExpandedKeys(node.children));
    }
  });
  return keys;
}

function collectTreeKeys(nodes = [], keys = new Set()) {
  nodes.forEach(node => {
    keys.add(node.key);
    if (node.children?.length) collectTreeKeys(node.children, keys);
  });
  return keys;
}

function areTreeKeysSame(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((key, index) => key === right[index]);
}

function buildHeadingMeta(blocks, numberingEnabled) {
  const counters = [0, 0, 0, 0];
  const map = new Map();
  const toc = [];
  blocks.forEach(block => {
    const level = block.type === 'heading1' ? 1
      : block.type === 'heading2' ? 2
        : block.type === 'heading3' ? 3
          : block.type === 'heading4' ? 4
            : 0;
    const title = inlineHtmlToPlain(block.content || '').trim();
    if (!level || !title) return;
    counters[level - 1] += 1;
    for (let index = level; index < counters.length; index += 1) counters[index] = 0;
    const number = counters.slice(0, level).filter(Boolean).join('.');
    const meta = { id: block.id, title, level, number: numberingEnabled ? number : '' };
    map.set(block.id, meta);
    toc.push(meta);
  });
  return { map, toc };
}

function getEditorMaxWidth(doc) {
  if (!doc) return '100%';
  if (doc.width_mode === 'full') return '100%';
  if (doc.width_mode === 'wide') return 1120;
  if (doc.width_mode === 'custom') return Number(doc.custom_width) || 960;
  return '100%';
}

function getEditorShellMaxWidth(doc, tocVisible) {
  const contentWidth = getEditorMaxWidth(doc);
  if (!tocVisible || typeof contentWidth !== 'number') return contentWidth;
  return contentWidth + 300;
}

function asSwitchValue(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return Boolean(Number(value));
}

function emptyShareDraft() {
  return {
    project_group_ids: [],
    departments: [],
    team_ids: [],
    user_ids: [],
  };
}

function sharesToDraft(shares = []) {
  return shares.reduce((draft, share) => {
    if (share.target_type === 'project_group' && share.target_id) draft.project_group_ids.push(Number(share.target_id));
    if (share.target_type === 'department' && share.target_key) draft.departments.push(share.target_key);
    if (share.target_type === 'team' && share.target_id) draft.team_ids.push(Number(share.target_id));
    if (share.target_type === 'user' && share.target_id) draft.user_ids.push(Number(share.target_id));
    return draft;
  }, emptyShareDraft());
}

function draftToShares(draft) {
  return [
    ...(draft.project_group_ids || []).map(id => ({ target_type: 'project_group', target_id: id })),
    ...(draft.departments || []).map(key => ({ target_type: 'department', target_key: key })),
    ...(draft.team_ids || []).map(id => ({ target_type: 'team', target_id: id })),
    ...(draft.user_ids || []).map(id => ({ target_type: 'user', target_id: id })),
  ];
}

const accessSourceLabel = {
  creator: '创建人',
  default: '超级管理员默认可访问',
  project_group: '项目组共享',
  department: '部门共享',
  team: '小组共享',
  user: '个人共享',
};

function getAccessUserName(user) {
  return user?.name || user?.display_name || user?.username || `用户 ${user?.id || ''}`;
}

function getAccessUserSourceText(user) {
  const sources = Array.isArray(user?.source_types) ? user.source_types : [];
  return sources.map(type => accessSourceLabel[type] || type).join('、') || '可访问';
}

function cloneEditorBlocks(blocks = []) {
  return blocks.map(block => ({
    ...block,
    meta: cloneMeta(block.meta),
  }));
}

function areSerializedValuesEqual(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function areEditorSnapshotContentsEqual(left, right) {
  return Boolean(left && right)
    && left.title === right.title
    && areSerializedValuesEqual(left.blocks, right.blocks);
}

function getFolderPathLabel(folder) {
  if (!folder) return '';
  return [
    domainLabel[folder.domain] || folder.domain,
    folder.project_group_name || '未关联项目组',
    departmentLabel[folder.department_key] || folder.department_key,
    folder.name,
  ].filter(Boolean).join(' / ');
}

function isDocumentAdminUser(user) {
  return documentAdminRoles.has(user?.role);
}

function parseSqliteUtcTimestamp(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  const sqliteUtcMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  const parseValue = sqliteUtcMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${sqliteUtcMatch[1]}T${sqliteUtcMatch[2]}Z`
    : raw;
  return dayjs(parseValue);
}

function formatChangeLogTime(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value).slice(0, 16);
}

function formatDocumentTimestamp(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  const parsed = parseSqliteUtcTimestamp(raw);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : raw.slice(0, 16);
}

function formatEditRecordTime(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  const parsed = parseSqliteUtcTimestamp(raw);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : raw.slice(0, 16);
}

function normalizeInlineComments(comments = []) {
  if (!Array.isArray(comments)) return [];
  return comments
    .map((item, index) => {
      const start = Math.max(0, Number(item?.start) || 0);
      const end = Math.max(start, Number(item?.end) || start);
      const text = String(item?.text || item?.quote || '').slice(0, 500);
      const comment = String(item?.comment || item?.content || '').trim();
      return {
        id: item?.id || `comment_${index}_${start}_${end}`,
        start,
        end,
        text,
        comment,
        authorId: item?.authorId ?? item?.author_id ?? null,
        authorName: item?.authorName || item?.author_name || '匿名用户',
        createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
        updatedAt: item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at || new Date().toISOString(),
      };
    })
    .filter(item => item.comment || item.text);
}

function makeInlineCommentId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function InlineRichTextEditor({
  id,
  value,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  onMouseUp,
  onKeyUp,
  onKeyDown,
  onPaste,
  style,
}) {
  const editorRef = useRef(null);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const localHtmlRef = useRef(sanitizeInlineHtml(value || ''));
  const [draftHtml, setDraftHtml] = useState(() => sanitizeInlineHtml(value || ''));

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || composingRef.current) return;
    const html = sanitizeInlineHtml(value || '');
    if (focusedRef.current && html === localHtmlRef.current) return;
    if (editor.innerHTML !== html) editor.innerHTML = html;
    localHtmlRef.current = html;
    setDraftHtml(prev => (prev === html ? prev : html));
  }, [value]);

  const getEditorHtml = () => {
    const editor = editorRef.current;
    if (!editor) return draftHtml;
    const html = sanitizeInlineHtml(editor.innerHTML);
    localHtmlRef.current = html;
    setDraftHtml(prev => (prev === html ? prev : html));
    return html;
  };

  const emitChange = () => {
    onChange?.(getEditorHtml());
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {!inlineHtmlToPlain(draftHtml).trim() && placeholder && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: style?.paddingLeft || 0,
            top: style?.paddingTop || 0,
            color: '#bfbfbf',
            pointerEvents: 'none',
            lineHeight: style?.lineHeight || 1.75,
            fontSize: style?.fontSize || 15,
          }}
        >
          {placeholder}
        </span>
      )}
      <div
        id={id}
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onFocus={(event) => {
          focusedRef.current = true;
          onFocus?.(event);
        }}
        onBlur={(event) => {
          focusedRef.current = false;
          composingRef.current = false;
          emitChange();
          onBlur?.(event);
        }}
        onCompositionStart={(event) => {
          composingRef.current = true;
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          emitChange();
          onCompositionEnd?.(event);
        }}
        onInput={() => {
          if (composingRef.current) {
            getEditorHtml();
            return;
          }
          emitChange();
        }}
        onMouseUp={onMouseUp}
        onKeyUp={onKeyUp}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        style={{
          minHeight: 24,
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          ...style,
        }}
      />
    </div>
  );
}

function parseEditRecordDiff(record) {
  if (record?.diff && typeof record.diff === 'object') return record.diff;
  if (typeof record?.diff_json === 'string' && record.diff_json.trim()) {
    try {
      return JSON.parse(record.diff_json);
    } catch {
      return { items: [] };
    }
  }
  return { items: [] };
}

function getEditRecordDiffItems(record) {
  const diff = parseEditRecordDiff(record);
  if (Array.isArray(diff?.items) && diff.items.length) return diff.items;
  const fallbackLines = String(record?.diff_text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return fallbackLines.length ? [{
    label: '更新内容',
    lines: fallbackLines.map(line => ({
      text: line,
      changed: true,
      parts: [{ text: line, changed: true }],
    })),
  }] : [];
}

function getVersionNumberParts(version) {
  const matches = String(version || '').match(/\d+/g);
  return matches ? matches.map(item => Number(item) || 0) : [];
}

function compareVersionTextDesc(a, b) {
  const left = getVersionNumberParts(a);
  const right = getVersionNumberParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (right[index] || 0) - (left[index] || 0);
    if (diff !== 0) return diff;
  }
  return String(b || '').localeCompare(String(a || ''));
}

function getChangeLogSortTime(log) {
  const rawTime = log?.changed_at || log?.updated_at || log?.created_at;
  const timestamp = rawTime ? dayjs(rawTime).valueOf() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortChangeLogsLatestFirst(logs = []) {
  return [...logs].sort((a, b) => {
    const versionDiff = compareVersionTextDesc(a?.version, b?.version);
    if (versionDiff !== 0) return versionDiff;
    const timeDiff = getChangeLogSortTime(b) - getChangeLogSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

function getEditRecordSortTime(record) {
  const rawTime = record?.edited_at || record?.created_at;
  const timestamp = rawTime ? parseSqliteUtcTimestamp(rawTime).valueOf() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortEditRecordsLatestFirst(records = []) {
  return [...records].sort((a, b) => {
    const timeDiff = getEditRecordSortTime(b) - getEditRecordSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

export default function Documents() {
  const { user: currentUser } = useAuth();
  const screens = useBreakpoint();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = !screens.md;
  const [folders, setFolders] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [folderTreeDocuments, setFolderTreeDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [openDocTabs, setOpenDocTabs] = useState([]);
  const [docTabStates, setDocTabStates] = useState({});
  const [closingTabIds, setClosingTabIds] = useState([]);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBlocks, setEditorBlocks] = useState([createBlock()]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedTableCell, setSelectedTableCell] = useState(null);
  const [selectedTableRange, setSelectedTableRange] = useState(null);
  const [selectedAreaBlockIds, setSelectedAreaBlockIds] = useState([]);
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [openBlockMenuId, setOpenBlockMenuId] = useState(null);
  const [blockMenuTargetIds, setBlockMenuTargetIds] = useState([]);
  const [inlineToolbar, setInlineToolbar] = useState(null);
  const [commentComposer, setCommentComposer] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [activeCommentBlockId, setActiveCommentBlockId] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [mobileLibraryVisible, setMobileLibraryVisible] = useState(false);
  const [domainFilter, setDomainFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [sopOnly, setSopOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertySaving, setPropertySaving] = useState(false);
  const [optionsSaving, setOptionsSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPropertyDoc, setEditingPropertyDoc] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareDraft, setShareDraft] = useState(emptyShareDraft());
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [activeChangeLogTab, setActiveChangeLogTab] = useState('version');
  const [changeLogSaving, setChangeLogSaving] = useState(false);
  const [restoringEditRecordId, setRestoringEditRecordId] = useState(null);
  const [changeLogFormOpen, setChangeLogFormOpen] = useState(false);
  const [editingChangeLog, setEditingChangeLog] = useState(null);
  const [expandedChangeLogIds, setExpandedChangeLogIds] = useState([]);
  const [changeLogNotifyEnabled, setChangeLogNotifyEnabled] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [docContextMenu, setDocContextMenu] = useState({ open: false, x: 0, y: 0, doc: null });
  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState(null);
  const [moveFolderDoc, setMoveFolderDoc] = useState(null);
  const [moveFolderSaving, setMoveFolderSaving] = useState(false);
  const [editorUndoStack, setEditorUndoStack] = useState([]);
  const [folderSidebarCollapsed, setFolderSidebarCollapsed] = useState(false);
  const [folderTreeExpandedKeys, setFolderTreeExpandedKeys] = useState([]);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationSlideIndex, setPresentationSlideIndex] = useState(0);
  const [shareLinkError, setShareLinkError] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);
  const [attachmentUploadingBlockIds, setAttachmentUploadingBlockIds] = useState([]);
  const [attachmentPreviewState, setAttachmentPreviewState] = useState({ open: false, mode: 'modal', attachment: null, loading: false });
  const [attachmentRenameTarget, setAttachmentRenameTarget] = useState(null);
  const [attachmentRenameValue, setAttachmentRenameValue] = useState('');
  const [attachmentRenameSaving, setAttachmentRenameSaving] = useState(false);
  const [attachmentCommentState, setAttachmentCommentState] = useState({
    open: false,
    blockId: null,
    attachment: null,
    comments: [],
    loading: false,
    saving: false,
  });
  const [attachmentCommentDraft, setAttachmentCommentDraft] = useState('');
  const presentationRef = useRef(null);
  const autoOpenedDocIdRef = useRef(null);
  const editorUndoStackRef = useRef([]);
  const applyingUndoRef = useRef(false);
  const editorAreaSelectionRef = useRef(null);
  const selectedAreaBlockIdsRef = useRef([]);
  const blockHandleSelectionRef = useRef(null);
  const activeEditorSnapshotRef = useRef(null);
  const liveEditorSnapshotRef = useRef(null);
  const selectedDocIdRef = useRef(null);
  const docTabStatesRef = useRef({});
  const lastSavedSignatureRef = useRef({});
  const dirtyDocumentIdsRef = useRef(new Set());
  const autoSaveTimerRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  const saveDirtyDocumentTabsRef = useRef(null);
  const pendingSavePromisesRef = useRef({});
  const saveCurrentDocumentRef = useRef(null);
  const pendingBlockMenuTargetIdsRef = useRef([]);
  const activeBlockMenuTargetIdsRef = useRef([]);
  const suppressBlockMenuOpenUntilRef = useRef(0);
  const suppressEditorClickRef = useRef(false);
  const inlineToolbarHideTimerRef = useRef(null);
  const tableResizeRef = useRef(null);
  const tableCellSelectionRef = useRef(null);
  const composingBlockIdsRef = useRef(new Set());
  const replaceAttachmentInputRef = useRef(null);
  const replaceAttachmentTargetRef = useRef(null);
  const [createForm] = Form.useForm();
  const [templateForm] = Form.useForm();
  const [changeLogForm] = Form.useForm();

  useEffect(() => {
    const styleId = 'document-block-menu-style';
    if (document.getElementById(styleId)) return undefined;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .document-block-menu-dropdown,
      .document-block-menu-dropdown .ant-dropdown-menu {
        background: #fff !important;
        color: #1f2937 !important;
      }
      .document-block-menu-dropdown .ant-dropdown-menu {
        box-shadow: none !important;
      }
      .document-block-menu-dropdown .ant-dropdown-menu-item {
        color: #1f2937 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {};
  }, []);

  const selectedFolder = useMemo(
    () => folders.find(folder => Number(folder.id) === Number(selectedFolderId)),
    [folders, selectedFolderId]
  );

  const folderTree = useMemo(
    () => buildFolderTree(folders, domainFilter, folderTreeDocuments),
    [folders, domainFilter, folderTreeDocuments]
  );
  const defaultFolderTreeExpandedKeys = useMemo(() => collectDefaultFolderExpandedKeys(folderTree), [folderTree]);
  const folderTreeKeySet = useMemo(() => collectTreeKeys(folderTree), [folderTree]);
  const selectedTreeKeys = useMemo(() => {
    const selectedTreeDoc = selectedDocId
      ? folderTreeDocuments.find(item => Number(item.id) === Number(selectedDocId) && item.folder_id)
      : null;
    if (selectedTreeDoc) return [`document-${selectedDocId}`];
    return selectedFolderId ? [`folder-${selectedFolderId}`] : [];
  }, [folderTreeDocuments, selectedDocId, selectedFolderId]);
  const headingMeta = useMemo(
    () => buildHeadingMeta(editorBlocks, asSwitchValue(selectedDoc?.title_numbering_enabled)),
    [editorBlocks, selectedDoc?.title_numbering_enabled]
  );
  const numberedListMarkers = useMemo(() => buildNumberedListMarkers(editorBlocks), [editorBlocks]);
  const hiddenListBlockIds = useMemo(() => buildCollapsedListHiddenIds(editorBlocks), [editorBlocks]);
  const hierarchicalGuideMap = useMemo(
    () => buildHierarchicalGuideMap(editorBlocks, hiddenListBlockIds),
    [editorBlocks, hiddenListBlockIds]
  );
  const presentationSections = useMemo(
    () => buildPresentationSections(editorBlocks, editorTitle || selectedDoc?.title),
    [editorBlocks, editorTitle, selectedDoc?.title]
  );
  const presentationSlideCount = presentationSections.length || 1;
  const activePresentationSlideIndex = Math.min(presentationSlideIndex, presentationSlideCount - 1);
  const activePresentationSection = presentationSections[activePresentationSlideIndex] || presentationSections[0];
  const isFolderSidebarCollapsed = !isMobile && folderSidebarCollapsed;
  const selectedDocDomainTag = domainLabel[selectedDoc?.domain] || selectedDoc?.domain || '';
  const selectedDocProjectGroupTag = selectedDoc?.project_group_name || selectedDoc?.project_code || '未关联项目组';
  const selectedDocDepartmentTag = departmentLabel[selectedDoc?.department_key] || selectedDoc?.department_key || '';
  const selectedDocTypeTag = docTypeLabel[selectedDoc?.doc_type] || selectedDoc?.doc_type || '';
  const deepLinkedDocId = useMemo(() => {
    return getDocumentIdFromSearch(searchParams);
  }, [searchParams]);
  const mobileHasEditorTarget = Boolean(selectedDocId || selectedDoc || shareLinkError);
  const showMobileEditor = isMobile && mobileHasEditorTarget && !mobileLibraryVisible;
  const showDocumentLibrary = !isMobile || !showMobileEditor;
  const showDocumentEditor = !isMobile || showMobileEditor;
  liveEditorSnapshotRef.current = {
    title: editorTitle,
    blocks: editorBlocks,
    selectedBlockId,
  };

  const getDocTabId = (id) => Number(id);

  const replaceDocumentLinkParam = (docId) => {
    const nextParams = new URLSearchParams(searchParams);
    documentLinkParamKeys.forEach(key => nextParams.delete(key));
    const normalizedId = getDocTabId(docId);
    if (Number.isFinite(normalizedId) && normalizedId > 0) {
      nextParams.set('doc', String(normalizedId));
    }
    setSearchParams(nextParams, { replace: true });
  };

  const canUseDocumentWriteActions = Boolean(currentUser && !['readonly', 'guest'].includes(currentUser.role));

  const canManageDoc = (doc) => Boolean(
    canUseDocumentWriteActions && doc && (
      Number(doc.can_manage) === 1
      || isDocumentAdminUser(currentUser)
      || Number(doc.created_by) === Number(currentUser.id)
    )
  );

  const isDocumentSharedWithCurrentUser = (doc) => {
    if (!currentUser || !doc) return false;
    const accessUser = (doc.access_summary?.users || []).find(user => Number(user.id) === Number(currentUser.id));
    return Boolean(accessUser?.is_shared);
  };

  const canEditDoc = (doc) => Boolean(
    canUseDocumentWriteActions && doc && (
      Number(doc.can_edit) === 1
      || canManageDoc(doc)
      || isDocumentSharedWithCurrentUser(doc)
    )
  );

  const canManageSelectedDoc = canManageDoc(selectedDoc);

  const resetEditorUndoStack = () => {
    editorUndoStackRef.current = [];
    setEditorUndoStack([]);
  };

  const pushEditorUndoSnapshot = () => {
    if (applyingUndoRef.current || !selectedDoc?.id) return;
    const liveSnapshot = liveEditorSnapshotRef.current || {};
    const snapshot = {
      title: liveSnapshot.title || '',
      blocks: cloneEditorBlocks(liveSnapshot.blocks?.length ? liveSnapshot.blocks : editorBlocks),
      selectedBlockId: liveSnapshot.selectedBlockId || selectedBlockId,
    };
    setEditorUndoStack(prev => {
      const last = prev[prev.length - 1];
      if (areEditorSnapshotContentsEqual(last, snapshot)) {
        return prev;
      }
      const next = [...prev, snapshot].slice(-80);
      editorUndoStackRef.current = next;
      return next;
    });
  };

  const undoLastEditorAction = () => {
    let nextStack = [...editorUndoStackRef.current];
    const liveSnapshot = liveEditorSnapshotRef.current || {};
    const currentSnapshot = {
      title: liveSnapshot.title || '',
      blocks: cloneEditorBlocks(liveSnapshot.blocks?.length ? liveSnapshot.blocks : editorBlocks),
      selectedBlockId: liveSnapshot.selectedBlockId || selectedBlockId,
    };
    let snapshot = nextStack.pop();
    while (snapshot && areEditorSnapshotContentsEqual(snapshot, currentSnapshot)) {
      snapshot = nextStack.pop();
    }
    if (!snapshot) {
      editorUndoStackRef.current = nextStack;
      setEditorUndoStack(nextStack);
      message.info('没有可撤回的操作');
      return;
    }
    editorUndoStackRef.current = nextStack;
    setEditorUndoStack(nextStack);
    applyingUndoRef.current = true;
    setEditorTitle(snapshot.title || '');
    setEditorBlocks(cloneEditorBlocks(snapshot.blocks?.length ? snapshot.blocks : [createBlock()]));
    setSelectedBlockId(snapshot.selectedBlockId || snapshot.blocks?.[0]?.id || null);
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    window.setTimeout(() => {
      applyingUndoRef.current = false;
      if (snapshot.selectedBlockId) focusBlock(snapshot.selectedBlockId);
    }, 0);
    message.success('已撤回上一次操作');
  };

  const getDocTabTitle = (doc, fallback = '未命名文档') => String(doc?.title || fallback || '未命名文档').trim() || '未命名文档';

  const makeDocTab = (doc) => ({
    id: doc.id,
    title: getDocTabTitle(doc),
    document_no: doc.document_no,
    current_version: doc.current_version,
    access_label: doc.access_summary?.label,
  });

  const upsertDocTab = (doc) => {
    if (!doc?.id) return;
    const docId = getDocTabId(doc.id);
    setOpenDocTabs(prev => {
      const nextTab = makeDocTab(doc);
      if (prev.some(tab => getDocTabId(tab.id) === docId)) {
        return prev.map(tab => (getDocTabId(tab.id) === docId ? { ...tab, ...nextTab } : tab));
      }
      return [...prev, nextTab];
    });
  };

  const clearActiveDocument = ({ keepQuery = false } = {}) => {
    setSelectedDocId(null);
    setSelectedDoc(null);
    activeEditorSnapshotRef.current = null;
    setEditorTitle('');
    setEditorBlocks([createBlock()]);
    setSelectedBlockId(null);
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    setMobileLibraryVisible(false);
    setTocOpen(true);
    setMobileTocOpen(false);
    setPageMenuOpen(false);
    setMoveFolderOpen(false);
    setShareOpen(false);
    setChangeLogOpen(false);
    setPresentationOpen(false);
    if (!keepQuery) {
      replaceDocumentLinkParam(null);
      setShareLinkError(null);
    }
    resetEditorUndoStack();
  };

  const persistActiveDocTabState = () => {
    if (!selectedDoc?.id || !selectedDocId) return;
    const docId = getDocTabId(selectedDocId);
    const docSnapshot = { ...selectedDoc, title: editorTitle || selectedDoc.title || '未命名文档' };
    setDocTabStates(prev => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        doc: docSnapshot,
        editorTitle,
        editorBlocks,
        selectedBlockId,
        tocOpen,
      },
    }));
    upsertDocTab(docSnapshot);
  };

  const applyDocTabState = (tabState) => {
    const doc = tabState?.doc;
    if (!doc?.id) return false;
    const blocks = Array.isArray(tabState.editorBlocks) && tabState.editorBlocks.length
      ? tabState.editorBlocks
      : contentToBlocks(doc.content);
    setSelectedDoc(doc);
    setEditorTitle(tabState.editorTitle ?? doc.title ?? '');
    setEditorBlocks(blocks);
    setSelectedBlockId(tabState.selectedBlockId ?? (blocks[0]?.id || null));
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    setTocOpen(tabState.tocOpen ?? asSwitchValue(doc.toc_enabled, true));
    upsertDocTab(doc);
    resetEditorUndoStack();
    return true;
  };

  const getDocumentSummaryById = (id) => {
    const docId = getDocTabId(id);
    return documents.find(item => getDocTabId(item.id) === docId)
      || folderTreeDocuments.find(item => getDocTabId(item.id) === docId)
      || openDocTabs.find(item => getDocTabId(item.id) === docId)
      || docTabStates[docId]?.doc;
  };

  const focusBlock = (id, cursorPosition = null) => {
    window.setTimeout(() => {
      const input = document.getElementById(`doc-block-input-${id}`);
      if (!input) return;
      input.focus();
      if (typeof cursorPosition === 'number' && typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(cursorPosition, cursorPosition);
      } else if (typeof cursorPosition === 'number' && input.isContentEditable) {
        setContentEditableCaretPosition(input, cursorPosition);
      }
    }, 0);
  };

  const loadFolders = async () => {
    const rows = await documentsApi.listFolders();
    setFolders(rows);
  };

  const loadProjectGroups = async () => {
    const rows = await projectGroupsApi.list();
    setProjectGroups(rows.filter(item => item.status !== 'inactive'));
  };

  const loadShareOptions = async () => {
    const [teamRows, userRows] = await Promise.all([
      teamsApi.list(),
      usersApi.listSimple({ include_readonly: true }),
    ]);
    setTeams(teamRows);
    setUsers(userRows);
  };

  const buildDocumentQueryParams = ({ includeFolder = true } = {}) => {
    const params = {};
    if (domainFilter !== 'all') params.domain = domainFilter;
    if (keyword.trim()) params.search = keyword.trim();
    if (includeFolder && selectedFolderId) params.folder_id = selectedFolderId;
    if (sopOnly) params.sop_only = true;
    return params;
  };

  const loadFolderTreeDocuments = async () => {
    try {
      const rows = await documentsApi.list(buildDocumentQueryParams({ includeFolder: false }));
      setFolderTreeDocuments(rows);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载目录文档失败');
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const params = buildDocumentQueryParams();
      const rows = await documentsApi.list(params);
      setDocuments(rows);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载文档失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id, options = {}) => {
    if (!id) return;
    const docId = getDocTabId(id);
    const cachedTabState = docTabStates[docId];
    const hasCachedPermissions = Object.prototype.hasOwnProperty.call(cachedTabState?.doc || {}, 'can_edit');
    if (!options.force && hasCachedPermissions && cachedTabState?.doc && Array.isArray(cachedTabState.editorBlocks)) {
      applyDocTabState(cachedTabState);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await documentsApi.get(id);
      const blocks = contentToBlocks(detail.content);
      lastSavedSignatureRef.current[docId] = getDocumentSaveSignature(detail.title || '', blocks);
      const nextTabState = {
        doc: detail,
        editorTitle: detail.title || '',
        editorBlocks: blocks,
        selectedBlockId: blocks[0]?.id || null,
        tocOpen: asSwitchValue(detail.toc_enabled, true),
      };
      setDocTabStates(prev => ({ ...prev, [docId]: { ...(prev[docId] || {}), ...nextTabState } }));
      upsertDocTab(detail);
      setSelectedDoc(detail);
      setEditorTitle(detail.title || '');
      setEditorBlocks(blocks);
      setSelectedBlockId(blocks[0]?.id || null);
      setHoveredBlockId(null);
      setOpenBlockMenuId(null);
      setTocOpen(asSwitchValue(detail.toc_enabled, true));
      setShareLinkError(null);
      resetEditorUndoStack();
    } catch (err) {
      const isDeepLinkTarget = Number(deepLinkedDocId) === Number(docId);
      setOpenDocTabs(prev => prev.filter(tab => getDocTabId(tab.id) !== docId));
      setDocTabStates(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
      if (getDocTabId(selectedDocId) === docId) clearActiveDocument({ keepQuery: isDeepLinkTarget });
      if (isDeepLinkTarget) {
        setShareLinkError({
          docId,
          message: err.response?.status === 404
            ? '该文档不存在，或你暂无访问权限。请联系创建人或管理员共享后再打开。'
            : (err.response?.data?.error || err.message || '打开文档失败，请稍后重试'),
        });
      } else {
        message.error(err.response?.data?.error || err.message || '加载文档详情失败');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const openDocumentTab = (docOrId, options = {}) => {
    const docId = getDocTabId(typeof docOrId === 'object' ? docOrId?.id : docOrId);
    if (!docId) return;
    if (!options.keepContextMenu) closeDocContextMenu();
    if (isMobile) setMobileLibraryVisible(false);
    if (getDocumentIdFromSearch(searchParams) !== docId) {
      replaceDocumentLinkParam(docId);
    }
    persistActiveDocTabState();
    const docSummary = typeof docOrId === 'object' ? docOrId : getDocumentSummaryById(docId);
    if (docSummary?.id) {
      upsertDocTab(docSummary);
      setDocTabStates(prev => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          doc: prev[docId]?.doc || docSummary,
        },
      }));
    }
    if (getDocTabId(selectedDocId) !== docId) {
      setSelectedDocId(docId);
    } else if (!selectedDoc) {
      loadDetail(docId);
    }
  };

  const refreshSelectedDocMeta = async () => {
    if (!selectedDoc?.id) return;
    const detail = await documentsApi.get(selectedDoc.id);
    setSelectedDoc(prev => ({ ...prev, ...detail }));
    upsertDocTab(detail);
    setDocTabStates(prev => ({
      ...prev,
      [getDocTabId(detail.id)]: {
        ...(prev[getDocTabId(detail.id)] || {}),
        doc: { ...(prev[getDocTabId(detail.id)]?.doc || {}), ...detail },
      },
    }));
  };

  const openPresentationMode = () => {
    if (!selectedDoc) return;
    setPageMenuOpen(false);
    setPresentationSlideIndex(0);
    setPresentationOpen(true);
  };

  const backToMobileLibrary = () => {
    if (!isMobile) return;
    persistActiveDocTabState();
    setMobileLibraryVisible(true);
    setPageMenuOpen(false);
    setMobileTocOpen(false);
    setOpenBlockMenuId(null);
    clearAreaBlockSelection();
  };

  const closePresentationMode = () => {
    setPresentationOpen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const movePresentationSlide = (step) => {
    setPresentationSlideIndex(prev => {
      const next = prev + step;
      return Math.max(0, Math.min(next, presentationSlideCount - 1));
    });
  };

  useEffect(() => {
    loadFolders().catch(err => message.error(err.response?.data?.error || err.message || '加载目录失败'));
    loadProjectGroups().catch(err => message.error(err.response?.data?.error || err.message || '加载项目组失败'));
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [domainFilter, selectedFolderId, sopOnly]);

  useEffect(() => {
    loadFolderTreeDocuments();
  }, [domainFilter, sopOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDocuments();
      loadFolderTreeDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const docId = getDocumentIdFromSearch(searchParams);
    if (!docId) {
      autoOpenedDocIdRef.current = null;
      return;
    }
    if (getDocTabId(selectedDocId) === docId) {
      autoOpenedDocIdRef.current = docId;
      return;
    }
    if (autoOpenedDocIdRef.current === docId) return;
    autoOpenedDocIdRef.current = docId;
    openDocumentTab(docId);
  }, [searchParams, selectedDocId]);

  useEffect(() => {
    if (selectedDocId) loadDetail(selectedDocId);
  }, [selectedDocId]);

  useEffect(() => {
    selectedDocIdRef.current = getDocTabId(selectedDocId);
  }, [selectedDocId]);

  useEffect(() => {
    docTabStatesRef.current = docTabStates;
  }, [docTabStates]);

  useEffect(() => {
    if (!deepLinkedDocId) return;
    if (getDocTabId(selectedDocId) === deepLinkedDocId) return;
    if (Number(shareLinkError?.docId) === Number(deepLinkedDocId)) return;
    setShareLinkError(null);
    openDocumentTab(deepLinkedDocId);
  }, [deepLinkedDocId, selectedDocId, shareLinkError]);

  useEffect(() => {
    const activeDocId = getDocTabId(selectedDocId);
    if (!activeDocId || activeDocId === deepLinkedDocId) return;
    replaceDocumentLinkParam(activeDocId);
  }, [selectedDocId, deepLinkedDocId]);

  useEffect(() => {
    if (!selectedDoc?.id || !editorBlocks.length) return;
    const hash = decodeURIComponent(window.location.hash || '');
    if (!hash.startsWith('#doc-block-')) return;
    const blockId = hash.replace('#doc-block-', '');
    if (!editorBlocks.some(block => block.id === blockId)) return;
    window.setTimeout(() => {
      scrollToBlock(blockId);
    }, 120);
  }, [selectedDoc?.id, editorBlocks.length]);

  useEffect(() => {
    if (!selectedDoc?.id || !selectedDocId) return;
    const docId = getDocTabId(selectedDocId);
    const docSnapshot = { ...selectedDoc, title: editorTitle || selectedDoc.title || '未命名文档' };
    const signature = getDocumentSaveSignature(editorTitle, editorBlocks);
    if (lastSavedSignatureRef.current[docId] && lastSavedSignatureRef.current[docId] !== signature) {
      dirtyDocumentIdsRef.current.add(docId);
    } else {
      dirtyDocumentIdsRef.current.delete(docId);
    }
    activeEditorSnapshotRef.current = {
      doc: docSnapshot,
      editorTitle,
      editorBlocks,
      canEdit: canEditDoc(docSnapshot),
    };
    setDocTabStates(prev => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        doc: docSnapshot,
        editorTitle,
        editorBlocks,
        selectedBlockId,
        tocOpen,
      },
    }));
    setOpenDocTabs(prev => prev.map(tab => (
      getDocTabId(tab.id) === docId
        ? {
            ...tab,
            title: getDocTabTitle(docSnapshot),
            document_no: docSnapshot.document_no,
            current_version: docSnapshot.current_version,
            access_label: docSnapshot.access_summary?.label,
          }
        : tab
    )));
  }, [selectedDocId, selectedDoc, editorTitle, editorBlocks, selectedBlockId, tocOpen]);

  useEffect(() => {
    setFolderTreeExpandedKeys(prev => {
      const keptFolderKeys = prev.filter(key => String(key).startsWith('folder-') && folderTreeKeySet.has(key));
      const next = Array.from(new Set([...defaultFolderTreeExpandedKeys, ...keptFolderKeys]));
      return areTreeKeysSame(prev, next) ? prev : next;
    });
  }, [defaultFolderTreeExpandedKeys, folderTreeKeySet]);

  useEffect(() => {
    if (!selectedDoc?.folder_id) return;
    const folderKey = `folder-${selectedDoc.folder_id}`;
    setFolderTreeExpandedKeys(prev => (
      prev.includes(folderKey) ? prev : [...prev, folderKey]
    ));
  }, [selectedDoc?.folder_id]);

  useEffect(() => {
    setPresentationSlideIndex(prev => Math.min(prev, presentationSlideCount - 1));
  }, [presentationSlideCount]);

  useEffect(() => {
    if (!presentationOpen) return undefined;
    const node = presentationRef.current;
    if (node?.requestFullscreen && document.fullscreenElement !== node) {
      node.requestFullscreen().catch(() => {});
    }
    return undefined;
  }, [presentationOpen]);

  useEffect(() => {
    if (!presentationOpen) return undefined;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setPresentationOpen(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [presentationOpen]);

  useEffect(() => {
    if (!presentationOpen) return undefined;
    const handlePresentationKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePresentationMode();
        return;
      }
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        movePresentationSlide(1);
        return;
      }
      if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        movePresentationSlide(-1);
      }
    };
    window.addEventListener('keydown', handlePresentationKeyDown);
    return () => window.removeEventListener('keydown', handlePresentationKeyDown);
  }, [presentationOpen, presentationSlideCount]);

  useEffect(() => {
    const handleUndoKeyDown = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || changeLogOpen || moveFolderOpen) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'z' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      undoLastEditorAction();
    };
    window.addEventListener('keydown', handleUndoKeyDown);
    return () => window.removeEventListener('keydown', handleUndoKeyDown);
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, changeLogOpen, moveFolderOpen]);

  useEffect(() => {
    const handleSaveKeyDown = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || changeLogOpen || moveFolderOpen) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 's' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      saveCurrentDocumentRef.current?.({ force: true }).catch(() => {});
    };
    window.addEventListener('keydown', handleSaveKeyDown);
    return () => window.removeEventListener('keydown', handleSaveKeyDown);
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, changeLogOpen, moveFolderOpen]);

  useEffect(() => {
    const handleDocumentCopy = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || changeLogOpen || moveFolderOpen) return;
      const activeElement = document.activeElement;
      const activeTextSelection = activeElement?.closest?.('textarea, input, [contenteditable="true"]')
        && window.getSelection?.()?.toString?.();
      if (activeTextSelection) return;
      const payload = getActiveDocumentClipboardPayload();
      if (!payload?.text && !payload?.html) return;
      if (!writeClipboardPayloadToEvent(event, payload)) return;
      event.preventDefault();
      message.success('已复制');
    };
    document.addEventListener('copy', handleDocumentCopy);
    return () => document.removeEventListener('copy', handleDocumentCopy);
  }, [
    selectedDoc?.id,
    presentationOpen,
    createOpen,
    templateOpen,
    shareOpen,
    changeLogOpen,
    moveFolderOpen,
    editorBlocks,
    selectedAreaBlockIds,
    selectedTableRange,
  ]);

  useEffect(() => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    const docId = getDocTabId(selectedDoc?.id);
    if (!docId || !dirtyDocumentIdsRef.current.has(docId) || !canEditDoc(selectedDoc)) return undefined;
    autoSaveTimerRef.current = window.setTimeout(() => {
      setAutoSaving(true);
      saveDirtyDocumentTabsRef.current?.()
        .catch(() => {})
        .finally(() => setAutoSaving(false));
    }, documentAutoSaveDelay);
    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [selectedDoc?.id, editorTitle, editorBlocks]);

  useEffect(() => {
    autoSaveIntervalRef.current = window.setInterval(() => {
      if (!dirtyDocumentIdsRef.current.size) return;
      setAutoSaving(true);
      saveDirtyDocumentTabsRef.current?.()
        .catch(() => {})
        .finally(() => setAutoSaving(false));
    }, documentAutoSaveInterval);
    return () => {
      if (autoSaveIntervalRef.current) window.clearInterval(autoSaveIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const saveSnapshotImmediately = (snapshot) => {
      const doc = snapshot?.doc;
      if (!doc?.id || !canEditDoc(doc)) return;
      const blocks = Array.isArray(snapshot.editorBlocks) ? snapshot.editorBlocks : contentToBlocks(doc.content);
      const title = snapshot.editorTitle ?? doc.title ?? '';
      const payload = buildDocumentSavePayload(title, blocks);
      const signature = JSON.stringify(payload);
      if (lastSavedSignatureRef.current[doc.id] === signature) return;
      lastSavedSignatureRef.current[doc.id] = signature;
      dirtyDocumentIdsRef.current.delete(getDocTabId(doc.id));
      saveDocumentDraftBeforeUnload(doc.id, payload);
    };

    const saveDraftsImmediately = () => {
      const dirtyIds = Array.from(dirtyDocumentIdsRef.current);
      if (!dirtyIds.length) {
        saveSnapshotImmediately(activeEditorSnapshotRef.current);
        return;
      }
      dirtyIds.forEach(docId => {
        const snapshot = selectedDocIdRef.current === docId
          ? activeEditorSnapshotRef.current
          : docTabStatesRef.current[docId];
        saveSnapshotImmediately(snapshot);
      });
    };

    const handleBeforeUnload = () => {
      saveDraftsImmediately();
    };
    const handlePageHide = () => {
      saveDraftsImmediately();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveDraftsImmediately();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    if (autoSaveIntervalRef.current) window.clearInterval(autoSaveIntervalRef.current);
    if (tableResizeRef.current?.cleanup) tableResizeRef.current.cleanup();
    if (tableCellSelectionRef.current?.cleanup) tableCellSelectionRef.current.cleanup();
    saveCurrentDocumentRef.current?.({ silent: true }).catch(() => {});
    editorAreaSelectionRef.current?.cleanup?.();
    blockHandleSelectionRef.current?.cleanup?.();
    if (inlineToolbarHideTimerRef.current) window.clearTimeout(inlineToolbarHideTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selectedTableCell && !selectedTableRange) return undefined;
    const handleTableOutsidePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.('[data-document-table-menu="true"]')) return;
      if (target?.closest?.('[data-document-table-shell="true"]')) return;
      setSelectedTableCell(null);
      setSelectedTableRange(null);
    };
    document.addEventListener('pointerdown', handleTableOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleTableOutsidePointerDown, true);
  }, [selectedTableCell, selectedTableRange]);

  useEffect(() => {
    if (!docContextMenu.open) return undefined;
    const handleDocContextOutsidePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.('[data-document-context-menu="true"]')) return;
      if (target?.closest?.('.document-context-menu-dropdown')) return;
      closeDocContextMenu();
    };
    document.addEventListener('pointerdown', handleDocContextOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleDocContextOutsidePointerDown, true);
  }, [docContextMenu.open]);

  useEffect(() => {
    if (!selectedAreaBlockIdsRef.current.length) return;
    const validIds = normalizeBlockSelectionIds(selectedAreaBlockIdsRef.current);
    if (validIds.length !== selectedAreaBlockIdsRef.current.length) {
      setAreaBlockSelection(validIds);
    }
  }, [editorBlocks]);

  const openCreate = () => {
    setEditingPropertyDoc(null);
    createForm.resetFields();
    createForm.setFieldsValue({
      title: '新页面',
      domain: selectedFolder?.domain || (domainFilter === 'all' ? 'general' : domainFilter),
      project_group_id: selectedFolder?.project_group_id || undefined,
      department_key: selectedFolder?.department_key || 'ALL',
      folder_id: selectedFolderId || undefined,
      doc_type: selectedFolder?.default_doc_type || (sopOnly ? 'SOP' : 'TMP'),
    });
    setCreateOpen(true);
  };

  const openEditProperties = async (docOrId) => {
    const docId = getDocTabId(typeof docOrId === 'object' ? docOrId?.id : docOrId);
    if (!docId) return;
    try {
      const doc = getDocTabId(selectedDoc?.id) === docId && selectedDoc
        ? selectedDoc
        : await documentsApi.get(docId);
      if (!canManageDoc(doc)) {
        message.warning('你没有编辑该文档属性的权限');
        return;
      }
      createForm.resetFields();
      createForm.setFieldsValue({
        title: doc.title || '未命名文档',
        domain: doc.domain || 'general',
        project_group_id: doc.project_group_id || undefined,
        department_key: doc.department_key || 'ALL',
        folder_id: doc.folder_id || undefined,
        doc_type: doc.doc_type || 'TMP',
      });
      setEditingPropertyDoc(doc);
      setCreateOpen(true);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载文档属性失败');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      if (editingPropertyDoc?.id) {
        setPropertySaving(true);
        const isActiveDoc = getDocTabId(selectedDoc?.id) === getDocTabId(editingPropertyDoc.id);
        const title = values.title || '未命名文档';
        const blocks = isActiveDoc ? editorBlocks : contentToBlocks(editingPropertyDoc.content);
        const payload = {
          ...buildDocumentSavePayload(title, blocks),
          ...values,
          title,
          project_group_id: values.project_group_id || null,
          folder_id: values.folder_id || null,
          current_version: editingPropertyDoc.current_version || 'V1.0',
        };
        const updated = await documentsApi.update(editingPropertyDoc.id, payload);
        lastSavedSignatureRef.current[editingPropertyDoc.id] = getDocumentSaveSignature(payload.title, blocks);
        setCreateOpen(false);
        setEditingPropertyDoc(null);
        if (isActiveDoc) {
          setSelectedDoc(prev => ({ ...prev, ...updated }));
          setEditorTitle(updated.title || title);
        }
        upsertDocTab(updated);
        setDocTabStates(prev => ({
          ...prev,
          [getDocTabId(updated.id)]: {
            ...(prev[getDocTabId(updated.id)] || {}),
            doc: { ...(prev[getDocTabId(updated.id)]?.doc || {}), ...updated },
            editorTitle: updated.title || title,
            editorBlocks: isActiveDoc ? editorBlocks : blocks,
          },
        }));
        await loadDocuments();
        await loadFolderTreeDocuments();
        message.success('文档属性已保存');
        return;
      }
      const doc = await documentsApi.create({
        ...values,
        content: { blocks: [] },
        content_text: '',
      });
      message.success(`已创建 ${doc.document_no}`);
      setCreateOpen(false);
      openDocumentTab(doc);
      await loadDocuments();
      await loadFolderTreeDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || (editingPropertyDoc ? '保存文档属性失败' : '创建文档失败'));
    } finally {
      setPropertySaving(false);
    }
  };

  const saveCurrentDocument = async ({ silent = false, force = false } = {}) => {
    const snapshot = activeEditorSnapshotRef.current;
    const doc = snapshot?.doc || selectedDoc;
    if (!doc?.id || !canEditDoc(doc)) return null;
    const blocks = Array.isArray(snapshot?.editorBlocks) ? snapshot.editorBlocks : editorBlocks;
    const title = snapshot?.editorTitle ?? editorTitle;
    const payload = buildDocumentSavePayload(title, blocks);
    const signature = JSON.stringify(payload);
    if (!force && lastSavedSignatureRef.current[doc.id] === signature) return null;
    if (pendingSavePromisesRef.current[doc.id]) return pendingSavePromisesRef.current[doc.id];

    if (!silent) setSaving(true);
    try {
      const savePromise = documentsApi.update(doc.id, payload);
      pendingSavePromisesRef.current[doc.id] = savePromise;
      const updated = await savePromise;
      lastSavedSignatureRef.current[doc.id] = signature;
      const docId = getDocTabId(doc.id);
      dirtyDocumentIdsRef.current.delete(docId);
      const isActiveDoc = getDocTabId(selectedDocId) === docId;
      if (isActiveDoc) {
        setSelectedDoc(prev => ({ ...prev, ...updated }));
      }
      upsertDocTab(updated);
      setDocTabStates(prev => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          doc: { ...(prev[docId]?.doc || {}), ...updated },
        },
      }));
      setDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      if (!silent && getDocTabId(selectedDocId) === getDocTabId(doc.id)) {
        await loadDetail(doc.id, { force: true });
        await loadDocuments();
        await loadFolderTreeDocuments();
        message.success(`已保存 ${updated.document_no}`);
      }
      return updated;
    } catch (err) {
      if (!silent) {
        message.error(err.response?.data?.error || err.message || '保存失败');
      }
      throw err;
    } finally {
      delete pendingSavePromisesRef.current[doc.id];
      if (!silent) setSaving(false);
    }
  };

  const saveDocumentSnapshot = async (snapshot, { force = false } = {}) => {
    const doc = snapshot?.doc;
    if (!doc?.id || !canEditDoc(doc)) return null;
    const blocks = Array.isArray(snapshot.editorBlocks) ? snapshot.editorBlocks : contentToBlocks(doc.content);
    const title = snapshot.editorTitle ?? doc.title ?? '';
    const payload = buildDocumentSavePayload(title, blocks);
    const signature = JSON.stringify(payload);
    const docId = getDocTabId(doc.id);
    if (!force && lastSavedSignatureRef.current[doc.id] === signature) {
      dirtyDocumentIdsRef.current.delete(docId);
      return null;
    }
    if (pendingSavePromisesRef.current[doc.id]) return pendingSavePromisesRef.current[doc.id];
    const savePromise = documentsApi.update(doc.id, payload);
    pendingSavePromisesRef.current[doc.id] = savePromise;
    try {
      const updated = await savePromise;
      lastSavedSignatureRef.current[doc.id] = signature;
      dirtyDocumentIdsRef.current.delete(docId);
      const isActiveDoc = getDocTabId(selectedDocId) === docId;
      if (isActiveDoc) {
        setSelectedDoc(prev => ({ ...prev, ...updated }));
      }
      upsertDocTab(updated);
      setDocTabStates(prev => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          doc: { ...(prev[docId]?.doc || {}), ...updated },
        },
      }));
      setDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      return updated;
    } finally {
      delete pendingSavePromisesRef.current[doc.id];
    }
  };

  const saveDirtyDocumentTabs = async () => {
    const dirtyIds = Array.from(dirtyDocumentIdsRef.current);
    if (!dirtyIds.length) return [];
    const snapshots = dirtyIds
      .map(docId => {
        if (selectedDocIdRef.current === docId) return activeEditorSnapshotRef.current;
        return docTabStatesRef.current[docId];
      })
      .filter(Boolean);
    return Promise.all(snapshots.map(snapshot => saveDocumentSnapshot(snapshot).catch(() => null)));
  };

  saveDirtyDocumentTabsRef.current = saveDirtyDocumentTabs;

  const handleSave = () => {
    saveCurrentDocument({ force: true }).catch(() => {});
  };

  saveCurrentDocumentRef.current = saveCurrentDocument;

  const getDocTabSnapshot = async (docId) => {
    const normalizedId = getDocTabId(docId);
    if (getDocTabId(selectedDocId) === normalizedId && selectedDoc) {
      return {
        doc: selectedDoc,
        editorTitle,
        editorBlocks,
      };
    }
    const cached = docTabStates[normalizedId];
    if (cached?.doc && Array.isArray(cached.editorBlocks)) {
      return cached;
    }
    const detail = await documentsApi.get(normalizedId);
    return {
      doc: detail,
      editorTitle: detail.title || '',
      editorBlocks: contentToBlocks(detail.content),
    };
  };

  const saveDocTabSnapshot = async (docId) => {
    const snapshot = await getDocTabSnapshot(docId);
    const doc = snapshot?.doc;
    if (!doc?.id || !canEditDoc(doc)) return null;
    const blocks = Array.isArray(snapshot.editorBlocks) && snapshot.editorBlocks.length
      ? snapshot.editorBlocks
      : contentToBlocks(doc.content);
    const payload = buildDocumentSavePayload(snapshot.editorTitle || doc.title || '未命名文档', blocks);
    return documentsApi.update(doc.id, payload);
  };

  const removeDocTab = (docId) => {
    const normalizedId = getDocTabId(docId);
    const closingIndex = openDocTabs.findIndex(tab => getDocTabId(tab.id) === normalizedId);
    const nextTabs = openDocTabs.filter(tab => getDocTabId(tab.id) !== normalizedId);
    setOpenDocTabs(nextTabs);
    setDocTabStates(prev => {
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });

    if (getDocTabId(selectedDocId) !== normalizedId) return;
    const nextActiveTab = nextTabs[closingIndex] || nextTabs[closingIndex - 1] || null;
    if (nextActiveTab) {
      const nextActiveDocId = getDocTabId(nextActiveTab.id);
      replaceDocumentLinkParam(nextActiveDocId);
      setSelectedDocId(nextActiveDocId);
    } else {
      clearActiveDocument();
    }
  };

  const handleCloseDocTab = async (event, docId) => {
    event.stopPropagation();
    const normalizedId = getDocTabId(docId);
    if (!normalizedId || closingTabIds.includes(normalizedId)) return;
    persistActiveDocTabState();
    setClosingTabIds(prev => [...prev, normalizedId]);
    try {
      await saveDocTabSnapshot(normalizedId);
      removeDocTab(normalizedId);
      await loadDocuments();
      await loadFolderTreeDocuments();
      message.success('已保存并关闭文档');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '关闭前自动保存失败');
    } finally {
      setClosingTabIds(prev => prev.filter(id => id !== normalizedId));
    }
  };

  const buildPageOptionsPayload = (patch = {}) => ({
    toc_enabled: asSwitchValue(selectedDoc?.toc_enabled, true),
    width_mode: selectedDoc?.width_mode || 'full',
    custom_width: selectedDoc?.custom_width || null,
    small_font_enabled: asSwitchValue(selectedDoc?.small_font_enabled),
    title_numbering_enabled: asSwitchValue(selectedDoc?.title_numbering_enabled),
    ...patch,
  });

  const savePageOptions = async (patch) => {
    if (!selectedDoc) return;
    const payload = buildPageOptionsPayload(patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'toc_enabled')) {
      setTocOpen(Boolean(patch.toc_enabled));
      if (!patch.toc_enabled) setMobileTocOpen(false);
    }
    setOptionsSaving(true);
    try {
      await documentsApi.updatePageOptions(selectedDoc.id, payload);
      setSelectedDoc(prev => ({ ...prev, ...payload }));
      message.success('页面选项已保存');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '保存页面选项失败');
    } finally {
      setOptionsSaving(false);
    }
  };

  const openShare = async () => {
    if (!selectedDoc) return;
    setShareOpen(true);
    setShareLoading(true);
    try {
      const [shares, accessSummary] = await Promise.all([
        documentsApi.listShares(selectedDoc.id),
        documentsApi.accessSummary(selectedDoc.id),
        loadShareOptions(),
      ]);
      setShareDraft(sharesToDraft(shares));
      setSelectedDoc(prev => ({ ...prev, access_summary: accessSummary }));
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载共享范围失败');
    } finally {
      setShareLoading(false);
    }
  };

  const saveShares = async () => {
    if (!selectedDoc) return;
    setShareSaving(true);
    try {
      const data = await documentsApi.saveShares(selectedDoc.id, draftToShares(shareDraft));
      setSelectedDoc(prev => ({
        ...prev,
        shares: data.shares,
        access_summary: data.access_summary,
      }));
      await loadDocuments();
      await loadFolderTreeDocuments();
      setShareOpen(false);
      message.success('共享范围已保存');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '保存共享范围失败');
    } finally {
      setShareSaving(false);
    }
  };

  const openChangeLogs = () => {
    if (!selectedDoc) return;
    const logs = sortChangeLogsLatestFirst(selectedDoc.change_logs || []);
    changeLogForm.resetFields();
    setEditingChangeLog(null);
    setChangeLogFormOpen(false);
    setActiveChangeLogTab('version');
    setExpandedChangeLogIds(logs[0]?.id ? [logs[0].id] : []);
    setChangeLogOpen(true);
  };

  const openCreateChangeLog = () => {
    if (!selectedDoc) return;
    setEditingChangeLog(null);
    changeLogForm.resetFields();
    changeLogForm.setFieldsValue({
      version: selectedDoc.current_version || 'V1.0',
      changed_at: dayjs(),
    });
    setChangeLogFormOpen(true);
  };

  const openEditChangeLog = (log) => {
    setEditingChangeLog(log);
    changeLogForm.resetFields();
    changeLogForm.setFieldsValue({
      version: log.version || selectedDoc?.current_version || 'V1.0',
      changed_at: log.changed_at ? dayjs(log.changed_at) : dayjs(),
      summary: log.summary || '',
      detail: log.detail || '',
      impact_scope: log.impact_scope || '',
      remark: log.remark || '',
    });
    setExpandedChangeLogIds(prev => (prev.includes(log.id) ? prev : [...prev, log.id]));
    setChangeLogFormOpen(true);
  };

  const closeChangeLogEditor = () => {
    setEditingChangeLog(null);
    setChangeLogFormOpen(false);
    changeLogForm.resetFields();
  };

  const serializeChangeLogPayload = (values) => ({
    ...values,
    changed_at: values.changed_at ? values.changed_at.format('YYYY-MM-DD HH:mm:ss') : undefined,
    detail_text: values.detail ? String(values.detail).trim() : '',
  });

  const saveChangeLog = async () => {
    if (!selectedDoc) return;
    try {
      const values = await changeLogForm.validateFields();
      setChangeLogSaving(true);
      const payload = serializeChangeLogPayload(values);
      const result = editingChangeLog
        ? await documentsApi.updateChangeLog(editingChangeLog.id, payload)
        : await documentsApi.createChangeLog(selectedDoc.id, payload);
      if (!editingChangeLog && result?.id) {
        setExpandedChangeLogIds(prev => [result.id, ...prev.filter(id => id !== result.id)]);
      }
      closeChangeLogEditor();
      await refreshSelectedDocMeta();
      await loadDocuments();
      message.success(editingChangeLog ? '改动记录已更新' : '改动记录已添加');
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || err.message || '保存页面编辑记录失败');
    } finally {
      setChangeLogSaving(false);
    }
  };

  const canEditChangeLog = (log) => (
    canManageSelectedDoc || (currentUser && Number(log?.changed_by) === Number(currentUser.id))
  );

  const canDeleteChangeLog = () => canManageSelectedDoc;

  const toggleChangeLogExpanded = (logId) => {
    setExpandedChangeLogIds(prev => (
      prev.includes(logId) ? prev.filter(id => id !== logId) : [...prev, logId]
    ));
  };

  const toggleAllChangeLogs = () => {
    const logs = sortChangeLogsLatestFirst(selectedDoc?.change_logs || []);
    const allExpanded = logs.length > 0 && logs.every(item => expandedChangeLogIds.includes(item.id));
    setExpandedChangeLogIds(allExpanded ? [] : logs.map(item => item.id));
  };

  const deleteChangeLog = async (logId) => {
    try {
      await documentsApi.deleteChangeLog(logId);
      setExpandedChangeLogIds(prev => prev.filter(id => id !== logId));
      await refreshSelectedDocMeta();
      message.success('改动记录已删除');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '删除页面编辑记录失败');
    }
  };

  const restoreEditRecord = async (record) => {
    if (!selectedDoc?.id || !record?.id) return;
    if (!record.can_restore) {
      message.warning('该页面编辑记录缺少可恢复快照，无法恢复');
      return;
    }
    setRestoringEditRecordId(record.id);
    try {
      await documentsApi.restoreEditRecord(record.id);
      await loadDetail(selectedDoc.id, { force: true });
      await loadDocuments();
      await loadFolderTreeDocuments();
      message.success('已恢复到此版本');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '恢复版本失败');
    } finally {
      setRestoringEditRecordId(null);
    }
  };

  const confirmRestoreEditRecord = (record) => {
    if (!record?.id) return;
    if (!record.can_restore) {
      message.warning('该页面编辑记录缺少可恢复快照，无法恢复');
      return;
    }
    Modal.confirm({
      title: '恢复到此版本？',
      content: '确认后，当前文档标题和正文会被该页面编辑记录对应的版本覆盖，并生成一条新的页面编辑记录。',
      okText: '恢复',
      cancelText: '取消',
      onOk: () => restoreEditRecord(record),
    });
  };

  const handleCopyPageLink = async () => {
    if (!selectedDoc?.id) return;
    const pageLink = buildDocumentPageLink(selectedDoc.id);
    if (!pageLink) return;
    try {
      await copyTextToClipboard(pageLink);
      setPageMenuOpen(false);
      message.success('页面链接已复制，可分享给有权限的人');
    } catch {
      message.error('复制失败，请手动复制浏览器地址');
    }
  };

  const handleCopyDocLink = async (doc) => {
    if (!doc?.id) return;
    const pageLink = buildDocumentPageLink(doc.id);
    if (!pageLink) return;
    try {
      await copyTextToClipboard(pageLink);
      message.success('页面链接已复制，可分享给有权限的人');
    } catch {
      message.error('复制失败，请手动复制浏览器地址');
    }
  };

  const handleCopyCodeBlock = async (event, text) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    try {
      await copyTextToClipboard(text || '');
      message.success('代码已复制');
    } catch {
      message.error('复制失败，请手动复制代码');
    }
  };

  const getTableSelectionClipboardPayload = () => {
    if (!selectedTableRange) return null;
    const blockId = selectedTableRange.blockId;
    const block = editorBlocks.find(item => item.id === blockId);
    if (!isTableLikeBlock(block)) return null;
    return buildTableClipboardPayload(block, selectedTableRange);
  };

  const getSelectedBlocksClipboardPayload = () => {
    const selectedBlockIds = normalizeBlockSelectionIds(
      selectedAreaBlockIdsRef.current.length ? selectedAreaBlockIdsRef.current : selectedAreaBlockIds
    );
    if (!selectedBlockIds.length) return null;
    const selectedSet = new Set(selectedBlockIds);
    const blocks = editorBlocks.filter(block => selectedSet.has(block.id));
    if (!blocks.length) return null;
    return blocksToClipboardPayload(blocks);
  };

  const getActiveDocumentClipboardPayload = () => (
    getTableSelectionClipboardPayload() || getSelectedBlocksClipboardPayload()
  );

  const handleDelete = async () => {
    if (!selectedDoc) return;
    const deletedDocId = getDocTabId(selectedDoc.id);
    try {
      await documentsApi.delete(selectedDoc.id);
      message.success('文档已删除');
      removeDocTab(deletedDocId);
      await loadDocuments();
      await loadFolderTreeDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '删除失败');
    }
  };

  const openMoveFolder = (doc = selectedDoc) => {
    const targetDoc = doc?.id ? doc : selectedDoc;
    if (!targetDoc) return;
    setPageMenuOpen(false);
    setDocContextMenu(prev => ({ ...prev, open: false }));
    setMoveFolderDoc(targetDoc);
    setMoveFolderId(targetDoc.folder_id ? Number(targetDoc.folder_id) : null);
    setMoveFolderOpen(true);
  };

  const handleMoveFolder = async () => {
    const targetDoc = moveFolderDoc || selectedDoc;
    if (!targetDoc || !moveFolderId) return;
    const targetFolder = folders.find(folder => Number(folder.id) === Number(moveFolderId));
    if (!targetFolder) {
      message.error('请选择目标文件夹');
      return;
    }
    setMoveFolderSaving(true);
    try {
      const isActiveDoc = getDocTabId(selectedDoc?.id) === getDocTabId(targetDoc.id);
      const blocks = isActiveDoc ? editorBlocks : contentToBlocks(targetDoc.content);
      await documentsApi.update(targetDoc.id, {
        title: isActiveDoc ? (editorTitle || targetDoc.title || '未命名文档') : (targetDoc.title || '未命名文档'),
        content: blocksToContent(blocks),
        content_text: blocksToText(blocks),
        folder_id: targetFolder.id,
        domain: targetFolder.domain || targetDoc.domain,
        project_group_id: targetFolder.project_group_id || 0,
        department_key: targetFolder.department_key || targetDoc.department_key,
        doc_type: targetDoc.doc_type || targetFolder.default_doc_type || 'TMP',
      });
      setMoveFolderOpen(false);
      setMoveFolderDoc(null);
      setSelectedFolderId(Number(targetFolder.id));
      if (targetFolder.domain) setDomainFilter(targetFolder.domain);
      setSopOnly(false);
      if (isActiveDoc) await loadDetail(targetDoc.id, { force: true });
      await loadDocuments();
      await loadFolderTreeDocuments();
      message.success(`已移动到 ${targetFolder.name}`);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '移动文档失败');
    } finally {
      setMoveFolderSaving(false);
    }
  };

  const toggleFavorite = async (doc) => {
    try {
      if (doc.is_favorite) {
        await documentsApi.unfavorite(doc.id);
      } else {
        await documentsApi.favorite(doc.id);
      }
      await loadDocuments();
      await loadFolderTreeDocuments();
      if (selectedDoc?.id === doc.id) await loadDetail(doc.id, { force: true });
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '收藏操作失败');
    }
  };

  const handleApplyTemplate = async () => {
    try {
      const values = await templateForm.validateFields();
      const data = await documentsApi.applyFolderTemplate({
        ...values,
        departments: values.departments?.map(key => ({ key })) || undefined,
      });
      message.success(`目录模板已初始化，新增 ${data.created} 个目录`);
      setTemplateOpen(false);
      await loadFolders();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '初始化目录失败');
    }
  };

  const updateBlock = (id, patch) => {
    const currentBlock = editorBlocks.find(block => block.id === id);
    if (!currentBlock || Object.entries(patch).every(([key, value]) => areSerializedValuesEqual(currentBlock[key], value))) return;
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(block => (block.id === id ? { ...block, ...patch } : block)));
  };

  const addBlockAfter = (afterId, type = 'paragraph', extra = {}) => {
    const nextBlock = createEditorBlock(type, extra);
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const index = prev.findIndex(block => block.id === afterId);
      const next = [...prev];
      next.splice(index >= 0 ? index + 1 : next.length, 0, nextBlock);
      return next;
    });
    setSelectedBlockId(nextBlock.id);
    focusBlock(nextBlock.id);
  };

  const addBlockBefore = (beforeId, type = 'paragraph', extra = {}) => {
    const nextBlock = createEditorBlock(type, extra);
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const index = prev.findIndex(block => block.id === beforeId);
      const next = [...prev];
      next.splice(index >= 0 ? index : 0, 0, nextBlock);
      return next;
    });
    setSelectedBlockId(nextBlock.id);
    clearAreaBlockSelection();
    setSelectedTableCell(null);
    setSelectedTableRange(null);
    setOpenBlockMenuId(null);
    focusBlock(nextBlock.id);
    return nextBlock;
  };

  const openBlockMenuForId = (blockId) => {
    if (!blockId) return;
    pendingBlockMenuTargetIdsRef.current = [blockId];
    activeBlockMenuTargetIdsRef.current = [blockId];
    selectedAreaBlockIdsRef.current = [blockId];
    setBlockMenuTargetIds([blockId]);
    setSelectedAreaBlockIds([blockId]);
    setSelectedBlockId(blockId);
    setOpenBlockMenuId(blockId);
  };

  const appendBlankBlockAtEnd = ({ openMenu = false } = {}) => {
    const lastBlock = editorBlocks[editorBlocks.length - 1];
    if (lastBlock?.type === 'paragraph' && isBlankBlock(lastBlock)) {
      setSelectedBlockId(lastBlock.id);
      clearAreaBlockSelection();
      if (openMenu) {
        openBlockMenuForId(lastBlock.id);
        return;
      }
      setOpenBlockMenuId(null);
      focusBlock(lastBlock.id);
      return;
    }

    const nextBlock = createBlock();
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => [...prev, nextBlock]);
    setSelectedBlockId(nextBlock.id);
    clearAreaBlockSelection();
    if (openMenu) {
      openBlockMenuForId(nextBlock.id);
      return;
    }
    setOpenBlockMenuId(null);
    focusBlock(nextBlock.id);
  };

  const deleteBlock = (id) => {
    pushEditorUndoSnapshot();
    if (editorBlocks.length <= 1) {
      const blank = createBlock();
      setEditorBlocks([blank]);
      setSelectedBlockId(blank.id);
      clearAreaBlockSelection();
      setHoveredBlockId(null);
      setOpenBlockMenuId(null);
      focusBlock(blank.id);
      return;
    }
    const index = editorBlocks.findIndex(block => block.id === id);
    const next = editorBlocks.filter(block => block.id !== id);
    const nextSelected = next[Math.max(0, index - 1)] || next[0];
    setEditorBlocks(next);
    setSelectedBlockId(nextSelected?.id || null);
    clearAreaBlockSelection();
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    if (nextSelected) focusBlock(nextSelected.id);
  };

  const deleteBlocksByIds = (ids = []) => {
    const deleteSet = new Set(ids.filter(Boolean));
    if (!deleteSet.size) return false;
    const firstDeletedIndex = editorBlocks.findIndex(block => deleteSet.has(block.id));
    if (firstDeletedIndex < 0) return false;
    pushEditorUndoSnapshot();
    const nextBlocks = editorBlocks.filter(block => !deleteSet.has(block.id));
    if (!nextBlocks.length) {
      const blank = createBlock();
      setEditorBlocks([blank]);
      setSelectedBlockId(blank.id);
      clearAreaBlockSelection();
      focusBlock(blank.id);
      return true;
    }
    const nextSelected = nextBlocks[Math.min(firstDeletedIndex, nextBlocks.length - 1)] || nextBlocks[0];
    setEditorBlocks(nextBlocks);
    setSelectedBlockId(nextSelected?.id || null);
    clearAreaBlockSelection();
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    if (nextSelected) focusBlock(nextSelected.id);
    return true;
  };

  const changeBlockType = (id, type, extra = {}) => {
    const current = editorBlocks.find(block => block.id === id);
    updateBlock(id, {
      ...buildBlockTypePatch(current, type, extra),
    });
    setSelectedBlockId(id);
    focusBlock(id);
  };

  const buildBlockTypePatch = (block, type, extra = {}) => {
    const defaultContent = getDefaultBlockContent(type);
    const content = type === 'divider'
      ? ''
      : (extra.content ?? (isBlankBlock(block) ? defaultContent : (block?.content || defaultContent)));
    const currentIndent = isHierarchicalListBlock(block) ? getListIndent(block) : 0;
    const currentComments = normalizeInlineComments(block?.meta?.comments);
    const nextMeta = {
      ...getDefaultBlockMeta(type),
      ...(isHierarchicalListBlock({ type }) ? { indent: currentIndent } : {}),
      ...(currentComments.length ? { comments: currentComments } : {}),
      ...cloneMeta(extra.meta),
    };
    return {
      type,
      content,
      checked: Boolean(extra.checked),
      meta: nextMeta,
    };
  };

  const changeBlocksType = (ids = [], type, extra = {}) => {
    const targetIds = normalizeBlockSelectionIds(ids);
    if (!targetIds.length) return false;
    const targetSet = new Set(targetIds);
    const firstId = targetIds[0];
    const isBatchListConversion = targetIds.length > 1 && isHierarchicalListBlock({ type });
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(block => {
      if (!targetSet.has(block.id)) return block;
      const patchExtra = isBatchListConversion
        ? {
          ...extra,
          meta: {
            ...cloneMeta(extra.meta),
            indent: 0,
            ...(type === 'fold-list' ? { collapsed: false } : {}),
          },
        }
        : extra;
      return { ...block, ...buildBlockTypePatch(block, type, patchExtra) };
    }));
    setSelectedBlockId(firstId);
    setAreaBlockSelection(targetIds);
    focusBlock(firstId);
    return true;
  };

  const insertRecentImageBlock = async (block) => {
    if (!selectedDoc?.id) {
      changeBlockType(block.id, 'recent-image');
      message.info('请先保存文档，再使用最近上传图片');
      return;
    }
    try {
      const rows = await attachmentsApi.list({ source_type: 'document', source_id: selectedDoc.id });
      const image = [...rows].reverse().find(isImageAttachment);
      if (!image) {
        changeBlockType(block.id, 'recent-image');
        message.info('当前文档还没有最近上传图片，已插入图片上传块');
        return;
      }
      changeBlockType(block.id, 'recent-image', {
        content: image.filename || '',
        meta: attachmentToMediaMeta(image),
      });
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '读取最近上传图片失败');
    }
  };

  const insertImageBlocksFromAttachments = (attachments = [], targetBlockId = null) => {
    const imageBlocks = attachments
      .filter(isImageAttachment)
      .map(attachment => createEditorBlock('image', {
        content: attachment.filename || '',
        meta: { ...attachmentToMediaMeta(attachment), embedOnly: true },
      }));
    if (!imageBlocks.length) return;

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const targetIndex = prev.findIndex(block => block.id === targetBlockId);
      if (targetIndex < 0) return [...prev, ...imageBlocks];
      const targetBlock = prev[targetIndex];
      const next = [...prev];
      if (targetBlock.type === 'paragraph' && isBlankBlock(targetBlock)) {
        next.splice(targetIndex, 1, ...imageBlocks);
      } else {
        next.splice(targetIndex + 1, 0, ...imageBlocks);
      }
      return next;
    });
    setSelectedBlockId(imageBlocks[0].id);
    clearAreaBlockSelection();
    setOpenBlockMenuId(null);
    setHoveredBlockId(null);
    window.setTimeout(() => {
      document.getElementById(`doc-block-${imageBlocks[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const insertBlocksFromClipboard = (blockInputs = [], targetBlockId = null) => {
    const nextBlocks = blockInputs
      .map(input => createEditorBlock(input.type || 'paragraph', {
        content: input.content || '',
        checked: Boolean(input.checked),
        highlight: input.highlight || '',
        meta: cloneMeta(input.meta),
      }))
      .filter(Boolean);
    if (!nextBlocks.length) return false;

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const targetIndex = prev.findIndex(block => block.id === targetBlockId);
      if (targetIndex < 0) return [...prev, ...nextBlocks];
      const targetBlock = prev[targetIndex];
      const next = [...prev];
      if (targetBlock.type === 'paragraph' && isBlankBlock(targetBlock)) {
        next.splice(targetIndex, 1, ...nextBlocks);
      } else {
        next.splice(targetIndex + 1, 0, ...nextBlocks);
      }
      return next;
    });
    setSelectedBlockId(nextBlocks[0].id);
    setAreaBlockSelection(nextBlocks.map(block => block.id));
    setSelectedTableCell(null);
    setSelectedTableRange(null);
    setOpenBlockMenuId(null);
    setHoveredBlockId(null);
    window.setTimeout(() => {
      document.getElementById(`doc-block-${nextBlocks[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (nextBlocks.length === 1 && !isTableLikeBlock(nextBlocks[0])) focusBlock(nextBlocks[0].id);
    }, 0);
    return true;
  };

  const handleEditorPaste = async (event) => {
    if (event.target?.closest?.('[data-inline-comment-panel="true"]')) return;
    const clipboardData = event.clipboardData;
    const targetBlockId = event.target?.closest?.('[data-doc-block-id]')?.getAttribute('data-doc-block-id')
      || selectedBlockId
      || editorBlocks[editorBlocks.length - 1]?.id
      || null;
    const documentBlocks = parseClipboardDocumentBlocks(clipboardData);
    const htmlTableBlocks = documentBlocks.length ? [] : parseClipboardHtmlTableBlocks(clipboardData?.getData?.('text/html'));
    const pastedBlocks = documentBlocks.length ? documentBlocks : htmlTableBlocks;
    if (pastedBlocks.length) {
      event.preventDefault();
      event.stopPropagation();
      if (!canEditDoc(selectedDoc)) {
        message.warning('你没有编辑该文档的权限');
        return;
      }
      if (insertBlocksFromClipboard(pastedBlocks, targetBlockId)) message.success(pastedBlocks.length > 1 ? `已粘贴 ${pastedBlocks.length} 个块` : '表格已粘贴');
      return;
    }

    const pastedImageFiles = getClipboardImageFiles(event);
    if (!pastedImageFiles.length) return;

    event.preventDefault();
    event.stopPropagation();

    if (!selectedDoc?.id) {
      message.warning('请先保存文档，再粘贴截图');
      return;
    }
    if (!canEditDoc(selectedDoc)) {
      message.warning('你没有编辑该文档的权限');
      return;
    }

    const supportedFiles = pastedImageFiles.filter(file => {
      const ext = getFileExt(file.name);
      const mime = String(file.type || '').toLowerCase();
      return imageExts.includes(ext) || Boolean(clipboardImageExtByMime[mime]);
    });
    if (!supportedFiles.length) {
      message.warning('剪贴板图片格式暂不支持，请粘贴 JPG、PNG、GIF 或 WebP');
      return;
    }

    const files = supportedFiles.slice(0, clipboardImagePasteLimit).map(normalizeClipboardImageFile);
    if (supportedFiles.length > clipboardImagePasteLimit) {
      message.info(`一次最多粘贴 ${clipboardImagePasteLimit} 张图片，已处理前 ${clipboardImagePasteLimit} 张`);
    }

    const hideLoading = message.loading(files.length > 1 ? `正在上传 ${files.length} 张图片` : '正在上传截图', 0);
    try {
      const formData = new FormData();
      formData.append('source_type', 'document');
      formData.append('source_id', selectedDoc.id);
      files.forEach(file => formData.append('files', file));
      const rows = await attachmentsApi.upload(formData);
      const uploadedImages = (rows || []).filter(isImageAttachment);
      if (!uploadedImages.length) throw new Error('图片上传失败');
      insertImageBlocksFromAttachments(uploadedImages, targetBlockId);
      message.success(uploadedImages.length > 1 ? `已粘贴 ${uploadedImages.length} 张图片` : '截图已粘贴');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '截图粘贴失败');
    } finally {
      hideLoading();
    }
  };

  const setAttachmentBlockUploading = (blockId, uploading) => {
    setAttachmentUploadingBlockIds(prev => {
      const next = new Set(prev);
      if (uploading) next.add(blockId);
      else next.delete(blockId);
      return [...next];
    });
  };

  const setAttachmentUploadProgress = (blockId, percent) => {
    const uploadPercent = clampUploadPercent(percent, 0, 99);
    setEditorBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const currentMeta = { ...getDefaultBlockMeta('attachment'), ...cloneMeta(block.meta) };
      return {
        ...block,
        meta: {
          ...currentMeta,
          upload_status: 'uploading',
          upload_percent: uploadPercent,
          upload_error: '',
        },
      };
    }));
  };

  const getAttachmentUploadProgressConfig = (blockId) => ({
    onUploadProgress: (progressEvent) => {
      const percent = normalizeUploadProgressPercent(progressEvent);
      if (percent !== null) setAttachmentUploadProgress(blockId, percent);
    },
  });

  const patchAttachmentBlockFromAttachment = (blockId, attachment, extraMeta = {}) => {
    const attachmentMeta = { ...attachmentToBlockMeta(attachment), ...extraMeta };
    setEditorBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const currentMeta = { ...getDefaultBlockMeta('attachment'), ...cloneMeta(block.meta) };
      const nextUploadStatus = extraMeta.upload_status || 'done';
      const nextMeta = {
        ...currentMeta,
        ...attachmentMeta,
        upload_status: nextUploadStatus,
        upload_percent: extraMeta.upload_percent ?? (nextUploadStatus === 'uploading' ? (currentMeta.upload_percent || 0) : 100),
        upload_error: extraMeta.upload_error || '',
      };
      const displayName = getAttachmentDisplayName(nextMeta);
      return {
        ...block,
        type: 'attachment',
        content: displayName,
        meta: nextMeta,
      };
    }));
  };

  const markAttachmentBlockFailed = (blockId, file, errorText) => {
    setEditorBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const currentMeta = { ...getDefaultBlockMeta('attachment'), ...cloneMeta(block.meta) };
      const displayName = currentMeta.display_name || file?.name || block.content || '上传失败';
      return {
        ...block,
        type: 'attachment',
        content: displayName,
        meta: {
          ...currentMeta,
          display_name: displayName,
          filename: currentMeta.filename || file?.name || displayName,
          file_ext: currentMeta.file_ext || getFileExt(file?.name || displayName),
          size: currentMeta.size || Number(file?.size || 0),
          upload_status: 'failed',
          upload_percent: currentMeta.upload_percent || 0,
          upload_error: errorText || '上传失败',
        },
      };
    }));
  };

  const uploadDocumentAttachmentFile = async (file, blockId, displayName) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('block_id', blockId);
    if (displayName) formData.append('display_name', displayName);
    return documentsApi.uploadAttachment(selectedDoc.id, formData, getAttachmentUploadProgressConfig(blockId));
  };

  const insertAttachmentBlocksFromFiles = async (files = [], targetBlockId = null) => {
    const validFiles = Array.from(files || []).filter(Boolean);
    if (!validFiles.length) return;
    if (!selectedDoc?.id) {
      message.warning('请先保存文档，再上传附件');
      return;
    }
    if (!canEditDoc(selectedDoc)) {
      message.warning('你没有编辑该文档的权限');
      return;
    }

    const attachmentBlocks = validFiles.map(file => createEditorBlock('attachment', {
      content: file.name || '',
      meta: {
        ...getDefaultBlockMeta('attachment'),
        filename: file.name || '',
        display_name: file.name || '',
        file_ext: getFileExt(file.name),
        size: Number(file.size || 0),
        mimetype: file.type || '',
        upload_status: 'uploading',
        upload_percent: 0,
      },
    }));
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const targetIndex = prev.findIndex(block => block.id === targetBlockId);
      if (targetIndex < 0) return [...prev, ...attachmentBlocks];
      const targetBlock = prev[targetIndex];
      const next = [...prev];
      if (targetBlock.type === 'paragraph' && isBlankBlock(targetBlock)) {
        next.splice(targetIndex, 1, ...attachmentBlocks);
      } else {
        next.splice(targetIndex + 1, 0, ...attachmentBlocks);
      }
      return next;
    });
    setSelectedBlockId(attachmentBlocks[0].id);
    clearAreaBlockSelection();
    setOpenBlockMenuId(null);
    attachmentBlocks.forEach(block => setAttachmentBlockUploading(block.id, true));

    const hideLoading = message.loading(validFiles.length > 1 ? `正在上传 ${validFiles.length} 个附件` : '正在上传附件', 0);
    let successCount = 0;
    try {
      for (let index = 0; index < attachmentBlocks.length; index += 1) {
        const block = attachmentBlocks[index];
        const file = validFiles[index];
        try {
          const uploaded = await uploadDocumentAttachmentFile(file, block.id, file.name);
          patchAttachmentBlockFromAttachment(block.id, uploaded);
          successCount += 1;
        } catch (err) {
          markAttachmentBlockFailed(block.id, file, err.response?.data?.error || err.message || '附件上传失败');
        } finally {
          setAttachmentBlockUploading(block.id, false);
        }
      }
      if (successCount) message.success(successCount > 1 ? `已上传 ${successCount} 个附件` : '附件已上传');
      if (successCount < validFiles.length) message.warning(`${validFiles.length - successCount} 个附件上传失败`);
    } finally {
      hideLoading();
      window.setTimeout(() => {
        document.getElementById(`doc-block-${attachmentBlocks[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
    }
  };

  const handleAttachmentBlockUpload = async (block, file) => {
    if (!selectedDoc?.id) {
      message.warning('请先保存文档，再上传附件');
      return Upload.LIST_IGNORE;
    }
    if (!canEditDoc(selectedDoc)) {
      message.warning('你没有编辑该文档的权限');
      return Upload.LIST_IGNORE;
    }
    pushEditorUndoSnapshot();
    setAttachmentBlockUploading(block.id, true);
    patchAttachmentBlockFromAttachment(block.id, {
      id: null,
      filename: file.name || '',
      display_name: file.name || '',
      mimetype: file.type || '',
      file_ext: getFileExt(file.name),
      size: Number(file.size || 0),
      preview_status: 'unsupported',
    }, { upload_status: 'uploading', upload_percent: 0 });
    try {
      const uploaded = await uploadDocumentAttachmentFile(file, block.id, file.name);
      patchAttachmentBlockFromAttachment(block.id, uploaded);
      message.success('附件已上传');
    } catch (err) {
      markAttachmentBlockFailed(block.id, file, err.response?.data?.error || err.message || '附件上传失败');
      message.error(err.response?.data?.error || err.message || '附件上传失败');
    } finally {
      setAttachmentBlockUploading(block.id, false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleEditorDragOver = (event) => {
    const hasFiles = Array.from(event.dataTransfer?.types || []).includes('Files');
    if (!hasFiles) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setAttachmentDragOver(true);
  };

  const handleEditorDragLeave = (event) => {
    if (event.currentTarget?.contains?.(event.relatedTarget)) return;
    setAttachmentDragOver(false);
  };

  const handleEditorDrop = async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    setAttachmentDragOver(false);
    const targetBlockId = event.target?.closest?.('[data-doc-block-id]')?.getAttribute('data-doc-block-id')
      || selectedBlockId
      || editorBlocks[editorBlocks.length - 1]?.id
      || null;
    await insertAttachmentBlocksFromFiles(files, targetBlockId);
  };

  const downloadDocumentAttachment = async (attachment) => {
    if (!attachment?.id) {
      message.warning('附件尚未上传完成');
      return;
    }
    try {
      await documentsApi.downloadAttachment(attachment.id, getAttachmentDisplayName(attachment));
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '下载失败');
    }
  };

  const openAttachmentPreview = async (block, mode = 'modal') => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    if (!attachment?.id) {
      message.warning('附件尚未上传完成');
      return;
    }
    setAttachmentPreviewState({ open: true, mode, attachment, loading: true });
    try {
      const preview = await documentsApi.previewAttachment(attachment.id);
      setAttachmentPreviewState({
        open: true,
        mode,
        attachment: { ...attachment, ...preview },
        loading: false,
      });
    } catch (err) {
      setAttachmentPreviewState({ open: true, mode, attachment, loading: false });
      message.error(err.response?.data?.error || err.message || '预览失败');
    }
  };

  const openAttachmentRename = (block) => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    setAttachmentRenameTarget({ blockId: block.id, attachment });
    setAttachmentRenameValue(getAttachmentDisplayName(attachment));
  };

  const saveAttachmentRename = async () => {
    const displayName = attachmentRenameValue.trim();
    if (!attachmentRenameTarget?.blockId || !displayName) {
      message.warning('请输入附件名称');
      return;
    }
    if (!canEditDoc(selectedDoc)) {
      message.warning('你没有编辑该文档的权限');
      return;
    }
    setAttachmentRenameSaving(true);
    try {
      const attachment = attachmentRenameTarget.attachment;
      const renamed = attachment?.id
        ? await documentsApi.renameAttachment(attachment.id, { display_name: displayName })
        : { ...attachment, display_name: displayName, filename: attachment?.filename || displayName };
      patchAttachmentBlockFromAttachment(attachmentRenameTarget.blockId, renamed);
      setAttachmentRenameTarget(null);
      setAttachmentRenameValue('');
      message.success('附件已重命名');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '重命名失败');
    } finally {
      setAttachmentRenameSaving(false);
    }
  };

  const copyAttachmentLink = async (block) => {
    if (!selectedDoc?.id) return;
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    let link = `${buildDocumentPageLink(selectedDoc.id)}#doc-block-${block.id}`;
    if (attachment?.id) {
      try {
        const result = await documentsApi.copyAttachmentLink(attachment.id, { block_id: block.id });
        if (result?.link) link = result.link.includes('#') ? result.link : link;
      } catch {
        // 本地锚点链接可兜底，不阻断复制。
      }
    }
    try {
      await copyTextToClipboard(link);
      message.success('附件链接已复制');
    } catch {
      message.error('复制失败，请手动复制浏览器地址');
    }
  };

  const openAttachmentComments = async (block) => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    setAttachmentCommentState({
      open: true,
      blockId: block.id,
      attachment,
      comments: [],
      loading: true,
      saving: false,
    });
    setAttachmentCommentDraft('');
    try {
      const comments = await documentsApi.listBlockComments(selectedDoc.id, block.id);
      setAttachmentCommentState(prev => ({
        ...prev,
        comments: Array.isArray(comments) ? comments : [],
        loading: false,
      }));
    } catch (err) {
      setAttachmentCommentState(prev => ({ ...prev, loading: false }));
      message.error(err.response?.data?.error || err.message || '读取评论失败');
    }
  };

  const saveAttachmentComment = async () => {
    const content = attachmentCommentDraft.trim();
    if (!content) {
      message.warning('请输入评论内容');
      return;
    }
    if (!canEditDoc(selectedDoc)) {
      message.warning('你没有编辑该文档的权限');
      return;
    }
    const { blockId, attachment } = attachmentCommentState;
    if (!selectedDoc?.id || !blockId) return;
    setAttachmentCommentState(prev => ({ ...prev, saving: true }));
    try {
      const comment = await documentsApi.createBlockComment(selectedDoc.id, blockId, {
        attachment_id: attachment?.id || null,
        content,
      });
      setAttachmentCommentState(prev => ({
        ...prev,
        comments: [...prev.comments, comment],
        saving: false,
      }));
      setAttachmentCommentDraft('');
      message.success('评论已添加');
    } catch (err) {
      setAttachmentCommentState(prev => ({ ...prev, saving: false }));
      message.error(err.response?.data?.error || err.message || '评论失败');
    }
  };

  const confirmDeleteAttachmentBlock = (block) => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    Modal.confirm({
      title: '删除附件块？',
      content: attachment?.id ? '删除后，正文中的附件块和该附件入口都会被移除。' : '删除后，该附件块会从正文中移除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (attachment?.id) await documentsApi.deleteAttachment(attachment.id);
        deleteBlock(block.id);
        message.success('附件块已删除');
      },
    });
  };

  const triggerReplaceAttachment = (block) => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    if (!attachment?.id) {
      message.warning('附件尚未上传完成');
      return;
    }
    if (!canEditDoc(selectedDoc)) {
      message.warning('你没有编辑该文档的权限');
      return;
    }
    replaceAttachmentTargetRef.current = { block };
    replaceAttachmentInputRef.current?.click();
  };

  const handleReplaceAttachmentInputChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const target = replaceAttachmentTargetRef.current;
    replaceAttachmentTargetRef.current = null;
    if (!file || !target?.block) return;
    const block = target.block;
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    if (!attachment?.id) return;
    setAttachmentBlockUploading(block.id, true);
    setAttachmentUploadProgress(block.id, 0);
    const hideLoading = message.loading('正在替换附件', 0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('display_name', getAttachmentDisplayName(attachment));
      const replaced = await documentsApi.replaceAttachment(attachment.id, formData, getAttachmentUploadProgressConfig(block.id));
      patchAttachmentBlockFromAttachment(block.id, replaced);
      message.success('附件已替换');
    } catch (err) {
      patchAttachmentBlockFromAttachment(block.id, attachment);
      message.error(err.response?.data?.error || err.message || '替换失败');
    } finally {
      setAttachmentBlockUploading(block.id, false);
      hideLoading();
    }
  };

  const handleAttachmentMenuAction = (block, key) => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    if (key === 'download') {
      downloadDocumentAttachment(attachment);
      return;
    }
    if (key === 'preview-modal') {
      openAttachmentPreview(block, 'modal');
      return;
    }
    if (key === 'preview-side') {
      openAttachmentPreview(block, 'side');
      return;
    }
    if (key === 'copy-link') {
      copyAttachmentLink(block);
      return;
    }
    if (key === 'comment') {
      openAttachmentComments(block);
      return;
    }
    if (key === 'rename') {
      openAttachmentRename(block);
      return;
    }
    if (key === 'replace') {
      triggerReplaceAttachment(block);
      return;
    }
    if (key === 'delete') {
      confirmDeleteAttachmentBlock(block);
    }
  };

  const handleBlockMenuAction = async (block, key, targetIdsOverride = []) => {
    if (!block) return;
    const overrideTargetIds = normalizeBlockSelectionIds(targetIdsOverride);
    const activeTargetIds = normalizeBlockSelectionIds(activeBlockMenuTargetIdsRef.current);
    const targetIds = overrideTargetIds.includes(block.id)
      ? overrideTargetIds
      : (activeTargetIds.includes(block.id) ? activeTargetIds : normalizeBlockSelectionIds(getBlockMenuTargetIds(block.id)));
    pendingBlockMenuTargetIdsRef.current = [];
    activeBlockMenuTargetIdsRef.current = targetIds;
    setBlockMenuTargetIds(targetIds);
    if (key === 'copy') {
      const targetSet = new Set(targetIds);
      const targetBlocks = editorBlocks.filter(item => targetSet.has(item.id));
      const payload = blocksToClipboardPayload(targetBlocks.length ? targetBlocks : [block]);
      try {
        await copyClipboardPayload(payload);
        message.success(targetBlocks.length > 1 ? `已复制 ${targetBlocks.length} 个块` : '已复制');
      } catch {
        message.error('复制失败，请重试');
      }
      return;
    }
    if (key === 'insert-paragraph-before') {
      addBlockBefore(block.id, 'paragraph', { content: '' });
      return;
    }
    if (key.startsWith('type:')) {
      const type = key.replace('type:', '');
      if (type === 'recent-image') {
        if (targetIds.length > 1) {
          message.info('最近上传图片暂不支持批量转换');
          return;
        }
        await insertRecentImageBlock(block);
        return;
      }
      if (targetIds.length > 1) {
        changeBlocksType(targetIds, type);
        return;
      }
      changeBlockType(block.id, type);
      return;
    }
    if (key === 'delete') {
      if (targetIds.length > 1) {
        deleteBlocksByIds(targetIds);
        return;
      }
      deleteBlock(block.id);
    }
  };

  const buildBlockMenuItems = (block, targetIdsOverride = []) => {
    const overrideTargetIds = normalizeBlockSelectionIds(targetIdsOverride);
    const activeTargetIds = normalizeBlockSelectionIds(activeBlockMenuTargetIdsRef.current);
    const targetIds = overrideTargetIds.includes(block?.id)
      ? overrideTargetIds
      : (activeTargetIds.includes(block?.id) ? activeTargetIds : normalizeBlockSelectionIds(getBlockMenuTargetIds(block?.id)));
    const targetSet = new Set(targetIds);
    const targetBlocks = editorBlocks.filter(item => targetSet.has(item.id));
    const targetCount = Math.max(1, targetBlocks.length || targetIds.length);
    const tableSelected = targetBlocks.some(isTableLikeBlock) || isTableLikeBlock(block);
    return [
      { key: 'copy', icon: <CopyOutlined />, label: targetCount > 1 ? `复制 ${targetCount} 个块` : (isTableLikeBlock(block) ? '复制整个表格' : '复制') },
      ...(tableSelected && targetCount === 1 ? [
        { key: 'insert-paragraph-before', icon: <PlusOutlined />, label: '在表格上方插入文本' },
      ] : []),
      { key: 'delete', danger: true, icon: <DeleteOutlined />, label: targetCount > 1 ? `删除 ${targetCount} 个块` : '删除' },
    ];
  };

  const getCurrentBlockMenuTargetIds = (block) => {
    if (!block) return [];
    const menuTargetIds = normalizeBlockSelectionIds(blockMenuTargetIds);
    if (menuTargetIds.includes(block.id)) return menuTargetIds;
    const activeTargetIds = normalizeBlockSelectionIds(activeBlockMenuTargetIdsRef.current);
    if (activeTargetIds.includes(block.id)) return activeTargetIds;
    const selectedTargetIds = normalizeBlockSelectionIds(selectedAreaBlockIdsRef.current.length ? selectedAreaBlockIdsRef.current : selectedAreaBlockIds);
    if (selectedTargetIds.includes(block.id)) return selectedTargetIds;
    return captureBlockMenuTargetIds(block.id);
  };

  const renderConvertBlockTypePanel = (block) => {
    const menuTargetIds = normalizeBlockSelectionIds(blockMenuTargetIds);
    const activeTargetIds = normalizeBlockSelectionIds(activeBlockMenuTargetIdsRef.current);
    const targetIds = menuTargetIds.includes(block?.id)
      ? menuTargetIds
      : (activeTargetIds.includes(block?.id) ? activeTargetIds : normalizeBlockSelectionIds(getBlockMenuTargetIds(block?.id)));
    const targetSet = new Set(targetIds);
    const targetBlocks = editorBlocks.filter(item => targetSet.has(item.id));
    const targetCount = Math.max(1, targetBlocks.length || targetIds.length);
    const isSelectedType = (type) => targetBlocks.length > 0 && targetBlocks.every(target => target.type === type);

    return (
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: isMobile ? 280 : 320,
          maxHeight: 'min(440px, calc(100vh - 190px))',
          overflowY: 'auto',
          padding: '6px 4px',
          background: '#fff',
        }}
      >
        {blockTypeGroups.map(group => (
          <div key={group.label} style={{ padding: '2px 0 8px' }}>
            <div style={{ padding: '6px 12px', fontSize: 12, color: '#8c8c8c' }}>{group.label}</div>
            {group.children.map(item => {
              const disabled = targetCount > 1 && item.value === 'recent-image';
              const selected = isSelectedType(item.value);
              return (
                <Button
                  key={item.value}
                  type="text"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    const nextTargetIds = getCurrentBlockMenuTargetIds(block);
                    setOpenBlockMenuId(null);
                    handleBlockMenuAction(block, `type:${item.value}`, nextTargetIds);
                  }}
                  style={{
                    width: '100%',
                    height: 36,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 12px',
                    borderRadius: 6,
                    background: selected ? '#f3f4f6' : undefined,
                    color: selected ? '#111827' : undefined,
                  }}
                >
                  <span style={{ width: 20, display: 'inline-flex', justifyContent: 'center', color: selected ? '#111827' : '#64748b' }}>{item.icon}</span>
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {selected && <CheckOutlined style={{ color: '#1677ff' }} />}
                </Button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const updateListIndent = (block, index, direction) => {
    if (!isHierarchicalListBlock(block)) return false;
    const currentIndent = getListIndent(block);
    const previousBlock = editorBlocks[index - 1];
    const previousIndent = isHierarchicalListBlock(previousBlock) ? getListIndent(previousBlock) : -1;
    const maxAllowedIndent = direction > 0
      ? Math.min(maxListIndent, previousIndent + 1)
      : maxListIndent;
    const nextIndent = direction > 0
      ? Math.min(currentIndent + 1, maxAllowedIndent)
      : Math.max(0, currentIndent - 1);
    if (nextIndent === currentIndent) return true;
    updateBlock(block.id, {
      meta: {
        ...getBlockMeta(block),
        indent: nextIndent,
      },
    });
    setSelectedBlockId(block.id);
    focusBlock(block.id);
    return true;
  };

  const buildContinuationBlockExtra = (block) => {
    if (!isHierarchicalListBlock(block)) return { content: '' };
    return {
      content: '',
      meta: {
        ...getDefaultBlockMeta(block.type),
        indent: getListIndent(block),
        ...(block.type === 'fold-list' ? { collapsed: false, body: '' } : {}),
      },
    };
  };

  const getNextBlockTypeAfterEnter = (block) => {
    if (block.type?.startsWith('heading') || block.type === 'code') return 'paragraph';
    return block.type || 'paragraph';
  };

  const splitInlineCommentsForEnter = (comments, splitStart, splitEnd) => {
    const leftComments = [];
    const rightComments = [];
    normalizeInlineComments(comments).forEach(comment => {
      if (comment.end <= splitStart) {
        leftComments.push(comment);
        return;
      }
      if (comment.start >= splitEnd) {
        rightComments.push({
          ...comment,
          start: comment.start - splitEnd,
          end: comment.end - splitEnd,
        });
        return;
      }
      if (comment.start < splitStart) {
        leftComments.push({
          ...comment,
          end: splitStart,
          text: String(comment.text || '').slice(0, Math.max(0, splitStart - comment.start)),
        });
      }
      if (comment.end > splitEnd) {
        rightComments.push({
          ...comment,
          id: `${comment.id}_split`,
          start: 0,
          end: comment.end - splitEnd,
          text: String(comment.text || '').slice(Math.max(0, splitEnd - comment.start)),
        });
      }
    });
    return { leftComments, rightComments };
  };

  const splitBlockAtCursor = (event, block, index) => {
    const input = event.target;
    const getCurrentContent = () => {
      if (!input?.isContentEditable) return String(block.content || '');
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0) return inlineHtmlToPlain(input.innerHTML);
      const range = selection.getRangeAt(0);
      if (!input.contains(range.startContainer) || !input.contains(range.endContainer)) {
        return inlineHtmlToPlain(input.innerHTML);
      }
      return sanitizeInlineHtml(input.innerHTML);
    };
    const content = getCurrentContent();
    const editableSelection = input?.isContentEditable ? getContentEditableSelectionRange(input) : null;
    const selectionStart = editableSelection
      ? editableSelection.start
      : (typeof input?.selectionStart === 'number' ? input.selectionStart : content.length);
    const selectionEnd = editableSelection
      ? editableSelection.end
      : (typeof input?.selectionEnd === 'number' ? input.selectionEnd : selectionStart);
    const plainContent = input?.isContentEditable ? inlineHtmlToPlain(content) : content;
    const start = Math.max(0, Math.min(selectionStart, selectionEnd, plainContent.length));
    const end = Math.max(start, Math.min(Math.max(selectionStart, selectionEnd), plainContent.length));
    let leftContent = plainContent.slice(0, start);
    let rightContent = plainContent.slice(end);
    if (input?.isContentEditable) {
      const selection = window.getSelection?.();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range && input.contains(range.startContainer) && input.contains(range.endContainer)) {
        const leftRange = document.createRange();
        leftRange.selectNodeContents(input);
        leftRange.setEnd(range.startContainer, range.startOffset);
        const rightRange = document.createRange();
        rightRange.selectNodeContents(input);
        rightRange.setStart(range.endContainer, range.endOffset);
        const container = document.createElement('div');
        container.appendChild(leftRange.cloneContents());
        leftContent = sanitizeInlineHtml(container.innerHTML);
        container.innerHTML = '';
        container.appendChild(rightRange.cloneContents());
        rightContent = sanitizeInlineHtml(container.innerHTML);
      }
      input.innerHTML = leftContent;
    }
    const nextType = getNextBlockTypeAfterEnter(block);
    const continuationExtra = buildContinuationBlockExtra(block);
    const meta = getBlockMeta(block);
    const { leftComments, rightComments } = splitInlineCommentsForEnter(meta.comments, start, end);
    const leftMeta = {
      ...meta,
      ...(leftComments.length ? { comments: leftComments } : {}),
    };
    if (!leftComments.length) delete leftMeta.comments;
    const nextMeta = {
      ...cloneMeta(continuationExtra.meta),
      ...(rightComments.length ? { comments: rightComments } : {}),
    };
    const nextBlock = createEditorBlock(nextType, {
      ...continuationExtra,
      content: rightContent,
      meta: nextMeta,
    });

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const blockIndex = prev.findIndex(item => item.id === block.id);
      const insertIndex = blockIndex >= 0 ? blockIndex : index;
      const nextBlocks = [...prev];
      if (insertIndex >= 0 && insertIndex < nextBlocks.length) {
        nextBlocks[insertIndex] = { ...nextBlocks[insertIndex], content: leftContent, meta: leftMeta };
        nextBlocks.splice(insertIndex + 1, 0, nextBlock);
        return nextBlocks;
      }
      return [...nextBlocks, nextBlock];
    });
    setSelectedBlockId(nextBlock.id);
    clearAreaBlockSelection();
    setOpenBlockMenuId(null);
    focusBlock(nextBlock.id, 0);
  };

  const mergeBlockWithPreviousAtStart = (event, block, index) => {
    if (index <= 0) return false;
    const input = event.target;
    const selectionRange = input?.isContentEditable
      ? getContentEditableSelectionRange(input)
      : (
        typeof input?.selectionStart === 'number' && typeof input?.selectionEnd === 'number'
          ? { start: Math.min(input.selectionStart, input.selectionEnd), end: Math.max(input.selectionStart, input.selectionEnd) }
          : null
      );
    if (!selectionRange || selectionRange.start !== 0 || selectionRange.end !== 0) return false;

    const previousBlock = editorBlocks[index - 1];
    if (!previousBlock) return false;

    const previousInput = document.getElementById(`doc-block-input-${previousBlock.id}`);
    const previousContent = previousInput?.isContentEditable
      ? sanitizeInlineHtml(previousInput.innerHTML)
      : String(previousBlock.content || '');
    const currentContent = input?.isContentEditable
      ? sanitizeInlineHtml(input.innerHTML)
      : String(block.content || '');
    const previousPlainLength = inlineHtmlToPlain(previousContent).length;
    const mergedContent = sanitizeInlineHtml(`${previousContent}${currentContent}`);
    const previousMeta = getBlockMeta(previousBlock);
    const shiftedCurrentComments = normalizeInlineComments(getBlockMeta(block).comments).map(comment => ({
      ...comment,
      start: comment.start + previousPlainLength,
      end: comment.end + previousPlainLength,
    }));
    const mergedComments = [
      ...normalizeInlineComments(previousMeta.comments),
      ...shiftedCurrentComments,
    ];
    const nextPreviousMeta = {
      ...previousMeta,
      ...(mergedComments.length ? { comments: mergedComments } : {}),
    };
    if (!mergedComments.length) delete nextPreviousMeta.comments;

    if (previousInput?.isContentEditable) {
      previousInput.innerHTML = mergedContent;
    }

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const blockIndex = prev.findIndex(item => item.id === block.id);
      const previousIndex = blockIndex > 0 ? blockIndex - 1 : index - 1;
      if (previousIndex < 0 || previousIndex >= prev.length) return prev;
      const nextBlocks = [...prev];
      nextBlocks[previousIndex] = {
        ...nextBlocks[previousIndex],
        content: mergedContent,
        meta: nextPreviousMeta,
      };
      if (blockIndex >= 0) {
        nextBlocks.splice(blockIndex, 1);
      } else if (index >= 0 && index < nextBlocks.length) {
        nextBlocks.splice(index, 1);
      }
      return nextBlocks;
    });
    setSelectedBlockId(previousBlock.id);
    clearAreaBlockSelection();
    setOpenBlockMenuId(null);
    focusBlock(previousBlock.id, previousPlainLength);
    return true;
  };

  const handleBlockKeyDown = (event, block, index) => {
    const composing = Boolean(
      event.nativeEvent?.isComposing
      || event.isComposing
      || event.keyCode === 229
      || event.nativeEvent?.keyCode === 229
      || composingBlockIdsRef.current.has(block.id)
    );
    if (event.key === 'Tab' && isHierarchicalListBlock(block)) {
      event.preventDefault();
      updateListIndent(block, index, event.shiftKey ? -1 : 1);
      return;
    }
    if (composing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      splitBlockAtCursor(event, block, index);
      return;
    }
    if (event.key === 'Backspace' && !block.content && isHierarchicalListBlock(block) && getListIndent(block) > 0) {
      event.preventDefault();
      updateListIndent(block, index, -1);
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && mergeBlockWithPreviousAtStart(event, block, index)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Backspace' && !block.content && editorBlocks.length > 1) {
      event.preventDefault();
      const previousBlock = editorBlocks[index - 1] || editorBlocks[index + 1];
      deleteBlock(block.id);
      if (previousBlock) focusBlock(previousBlock.id);
    }
  };

  const normalizeBlockSelectionIds = (ids = []) => {
    const idSet = new Set(ids.filter(Boolean));
    if (!idSet.size) return [];
    return editorBlocks.map(block => block.id).filter(id => idSet.has(id));
  };

  const setAreaBlockSelection = (ids = []) => {
    const nextIds = normalizeBlockSelectionIds(ids);
    selectedAreaBlockIdsRef.current = nextIds;
    setSelectedAreaBlockIds(prev => (
      prev.length === nextIds.length && prev.every((id, index) => id === nextIds[index]) ? prev : nextIds
    ));
  };

  const clearAreaBlockSelection = () => {
    pendingBlockMenuTargetIdsRef.current = [];
    activeBlockMenuTargetIdsRef.current = [];
    setBlockMenuTargetIds([]);
    setAreaBlockSelection([]);
  };

  const getVisibleEditorBlockIds = () => {
    const editorNode = document.getElementById('document-editor-blocks');
    const ids = editorNode
      ? Array.from(editorNode.querySelectorAll('[data-doc-block-id]'))
        .map(node => node.getAttribute('data-doc-block-id'))
        .filter(Boolean)
      : [];
    return ids.length ? ids : editorBlocks.map(block => block.id);
  };

  const getEditorBlockIdFromPoint = (clientX, clientY, fallbackIds = []) => {
    const editorNode = document.getElementById('document-editor-blocks');
    if (!editorNode) return null;
    const directNode = document.elementFromPoint?.(clientX, clientY)?.closest?.('[data-doc-block-id]');
    if (directNode && editorNode.contains(directNode)) {
      return directNode.getAttribute('data-doc-block-id');
    }

    const nodes = Array.from(editorNode.querySelectorAll('[data-doc-block-id]'))
      .filter(node => !fallbackIds.length || fallbackIds.includes(node.getAttribute('data-doc-block-id')));
    if (!nodes.length) return null;
    const nodeAtY = nodes.find(node => {
      const rect = node.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    if (nodeAtY) return nodeAtY.getAttribute('data-doc-block-id');

    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (clientY < firstNode.getBoundingClientRect().top) return firstNode.getAttribute('data-doc-block-id');
    if (clientY > lastNode.getBoundingClientRect().bottom) return lastNode.getAttribute('data-doc-block-id');
    return null;
  };

  const getBlockRangeIds = (startId, endId, blockIds = getVisibleEditorBlockIds()) => {
    const startIndex = blockIds.indexOf(startId);
    const endIndex = blockIds.indexOf(endId);
    if (startIndex < 0 || endIndex < 0) return [];
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    return blockIds.slice(from, to + 1);
  };

  const setBlockRangeSelection = (startId, endId, blockIds = getVisibleEditorBlockIds()) => {
    const nextIds = getBlockRangeIds(startId, endId, blockIds);
    if (!nextIds.length) return [];
    setAreaBlockSelection(nextIds);
    setSelectedBlockId(endId);
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    return nextIds;
  };

  const clearNativeEditorSelection = () => {
    window.getSelection?.()?.removeAllRanges();
    const activeElement = document.activeElement;
    if (!activeElement || !['TEXTAREA', 'INPUT'].includes(activeElement.tagName)) return;
    if (typeof activeElement.setSelectionRange !== 'function') return;
    const cursorPosition = activeElement.selectionEnd ?? activeElement.value?.length ?? 0;
    activeElement.setSelectionRange(cursorPosition, cursorPosition);
    activeElement.blur?.();
  };

  const isEditorAreaSelectionIgnoredTarget = (target) => {
    if (!target?.closest) return false;
    return Boolean(target.closest('textarea, input, button, a, [role="button"], .ant-select, .ant-dropdown, .ant-picker, .ant-checkbox-wrapper'));
  };

  const getEditorBlockIdsInArea = (areaRect) => {
    const editorNode = document.getElementById('document-editor-blocks');
    if (!editorNode) return [];
    return Array.from(editorNode.querySelectorAll('[data-doc-block-id]'))
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0
          && rect.height > 0
          && rect.left <= areaRect.right
          && rect.right >= areaRect.left
          && rect.top <= areaRect.bottom
          && rect.bottom >= areaRect.top;
      })
      .map(node => node.getAttribute('data-doc-block-id'))
      .filter(Boolean);
  };

  const handleEditorAreaMouseDown = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const startBlockNode = event.target.closest?.('[data-doc-block-id]');
    const startsInBlockTextArea = Boolean(startBlockNode && event.target.closest?.('textarea'));
    if (isEditorAreaSelectionIgnoredTarget(event.target) && !startsInBlockTextArea) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startBlockId = startBlockNode?.getAttribute('data-doc-block-id') || null;
    const visibleBlockIds = startBlockId ? getVisibleEditorBlockIds() : [];

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      editorAreaSelectionRef.current = null;
    };

    const handleMouseMove = (moveEvent) => {
      const selectionState = editorAreaSelectionRef.current;
      if (!selectionState) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const movedDistance = Math.hypot(dx, dy);
      if (selectionState.startBlockId) {
        const currentId = getEditorBlockIdFromPoint(moveEvent.clientX, moveEvent.clientY, selectionState.blockIds);
        if (!selectionState.dragging) {
          if (movedDistance < 6 || !currentId || currentId === selectionState.startBlockId) return;
        }
        if (currentId) {
          selectionState.dragging = true;
          selectionState.mode = 'range';
          moveEvent.preventDefault();
          clearNativeEditorSelection();
          setBlockRangeSelection(selectionState.startBlockId, currentId, selectionState.blockIds);
          return;
        }
      }
      if (!selectionState.dragging && movedDistance < 6) return;
      selectionState.dragging = true;
      selectionState.mode = 'area';
      moveEvent.preventDefault();
      clearNativeEditorSelection();
      const areaRect = {
        left: Math.min(startX, moveEvent.clientX),
        right: Math.max(startX, moveEvent.clientX),
        top: Math.min(startY, moveEvent.clientY),
        bottom: Math.max(startY, moveEvent.clientY),
      };
      const ids = getEditorBlockIdsInArea(areaRect);
      setAreaBlockSelection(ids);
      if (ids.length) {
        setSelectedBlockId(ids[ids.length - 1]);
        setHoveredBlockId(null);
        setOpenBlockMenuId(null);
      }
    };

    const handleMouseUp = (upEvent) => {
      const selectionState = editorAreaSelectionRef.current;
      cleanup();
      if (selectionState?.dragging) {
        suppressEditorClickRef.current = true;
        upEvent.preventDefault();
        window.setTimeout(() => {
          suppressEditorClickRef.current = false;
        }, 0);
      } else if (!event.target.closest?.('[data-doc-block-id]')) {
        clearAreaBlockSelection();
      }
    };

    editorAreaSelectionRef.current = {
      cleanup,
      dragging: false,
      mode: null,
      startBlockId,
      blockIds: visibleBlockIds,
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const getSelectedEditorBlockIds = () => {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
    const editorNode = document.getElementById('document-editor-blocks');
    if (!editorNode) return [];
    const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
    const touchesEditor = ranges.some(range => {
      try {
        return range.intersectsNode(editorNode);
      } catch {
        return false;
      }
    });
    if (!touchesEditor) return [];
    return Array.from(editorNode.querySelectorAll('[data-doc-block-id]'))
      .filter(node => ranges.some(range => {
        try {
          return range.intersectsNode(node);
        } catch {
          return false;
        }
      }))
      .map(node => node.getAttribute('data-doc-block-id'))
      .filter(Boolean);
  };

  const getBlockMenuTargetIds = (blockId) => {
    const selectedTargetIds = selectedAreaBlockIdsRef.current.length ? selectedAreaBlockIdsRef.current : selectedAreaBlockIds;
    if (selectedTargetIds.includes(blockId) && selectedTargetIds.length) return selectedTargetIds;
    const pendingTargetIds = pendingBlockMenuTargetIdsRef.current || [];
    if (pendingTargetIds.includes(blockId)) return pendingTargetIds;
    const activeTargetIds = activeBlockMenuTargetIdsRef.current || [];
    if (activeTargetIds.includes(blockId)) return activeTargetIds;
    const textSelectionIds = getSelectedEditorBlockIds();
    if (textSelectionIds.includes(blockId)) return textSelectionIds;
    return [blockId].filter(Boolean);
  };

  const captureBlockMenuTargetIds = (blockId) => {
    const targetIds = normalizeBlockSelectionIds(getBlockMenuTargetIds(blockId));
    const nextTargetIds = targetIds.includes(blockId) && targetIds.length ? targetIds : [blockId].filter(Boolean);
    pendingBlockMenuTargetIdsRef.current = nextTargetIds;
    activeBlockMenuTargetIdsRef.current = nextTargetIds;
    setBlockMenuTargetIds(nextTargetIds);
    setAreaBlockSelection(nextTargetIds);
    setSelectedBlockId(blockId);
    return nextTargetIds;
  };

  const selectBlockFromHandle = (event, blockId) => {
    const blockIds = getVisibleEditorBlockIds();
    const blockIndex = blockIds.indexOf(blockId);
    if (blockIndex < 0) return;

    if (event.shiftKey && selectedBlockId) {
      const anchorIndex = blockIds.indexOf(selectedBlockId);
      if (anchorIndex >= 0) {
        setBlockRangeSelection(selectedBlockId, blockId, blockIds);
        return;
      }
    }

    if (event.metaKey || event.ctrlKey) {
      const currentSelection = selectedAreaBlockIdsRef.current.length ? selectedAreaBlockIdsRef.current : selectedAreaBlockIds;
      const base = currentSelection.length ? currentSelection : (selectedBlockId ? [selectedBlockId] : []);
      const next = base.includes(blockId)
        ? base.filter(id => id !== blockId)
        : [...base, blockId];
      setAreaBlockSelection(next.length ? next : [blockId]);
      setSelectedBlockId(blockId);
      return;
    }

    setSelectedBlockId(blockId);
    setAreaBlockSelection(getBlockMenuTargetIds(blockId));
  };

  const updateHandleDragSelection = (clientY) => {
    const dragState = blockHandleSelectionRef.current;
    if (!dragState) return;
    const currentId = getEditorBlockIdFromPoint(dragState.startX, clientY, dragState.blockIds);
    if (!currentId) return;
    setBlockRangeSelection(dragState.startId, currentId, dragState.blockIds);
  };

  const startBlockHandleSelection = (event, blockId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const blockIds = getVisibleEditorBlockIds();
    const startIndex = blockIds.indexOf(blockId);
    if (startIndex < 0) return;
    pendingBlockMenuTargetIdsRef.current = getBlockMenuTargetIds(blockId);
    blockHandleSelectionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startId: blockId,
      startIndex,
      blockIds,
      dragging: false,
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      blockHandleSelectionRef.current = null;
    };
    blockHandleSelectionRef.current.cleanup = cleanup;

    const handleMouseMove = (moveEvent) => {
      const dragState = blockHandleSelectionRef.current;
      if (!dragState) return;
      const dx = moveEvent.clientX - dragState.startX;
      const dy = moveEvent.clientY - dragState.startY;
      if (!dragState.dragging && Math.hypot(dx, dy) < 6) return;
      dragState.dragging = true;
      moveEvent.preventDefault();
      clearNativeEditorSelection();
      updateHandleDragSelection(moveEvent.clientY);
    };

    const handleMouseUp = (upEvent) => {
      const dragState = blockHandleSelectionRef.current;
      cleanup();
      if (dragState?.dragging) {
        pendingBlockMenuTargetIdsRef.current = [];
        suppressBlockMenuOpenUntilRef.current = Date.now() + 250;
        suppressEditorClickRef.current = true;
        upEvent.preventDefault();
        window.setTimeout(() => {
          suppressEditorClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const hasActiveNativeTextSelection = () => {
    const activeElement = document.activeElement;
    if (!activeElement || !['TEXTAREA', 'INPUT'].includes(activeElement.tagName)) return false;
    const { selectionStart, selectionEnd } = activeElement;
    return typeof selectionStart === 'number'
      && typeof selectionEnd === 'number'
      && selectionStart !== selectionEnd;
  };

  const getDeleteTargetBlockIds = () => {
    const selectedBlockIds = selectedAreaBlockIdsRef.current.length
      ? selectedAreaBlockIdsRef.current
      : selectedAreaBlockIds;
    if (selectedBlockIds.length) return selectedBlockIds;

    const nativeSelectedBlockIds = getSelectedEditorBlockIds();
    if (nativeSelectedBlockIds.length) return nativeSelectedBlockIds;

    if (!selectedBlockId) return [];
    const activeElement = document.activeElement;
    const activeBlockId = activeElement?.closest?.('[data-doc-block-id]')?.getAttribute?.('data-doc-block-id') || null;
    const selectedBlock = editorBlocks.find(block => block.id === selectedBlockId);
    const activeBlock = editorBlocks.find(block => block.id === activeBlockId);
    const targetBlock = selectedBlock || activeBlock;
    if (!targetBlock) return [];

    const activeInEditableInput = Boolean(
      activeElement?.closest?.('textarea, input, [contenteditable="true"]')
    );
    const activeIsTargetBlock = !activeBlockId || activeBlockId === targetBlock.id;
    const shouldSkipBlockDelete = activeInEditableInput
      && activeIsTargetBlock
      && !isTableLikeBlock(targetBlock)
      && targetBlock.type !== 'divider'
      && targetBlock.type !== 'attachment';
    if (shouldSkipBlockDelete) return [];

    return [targetBlock.id];
  };

  useEffect(() => {
    const handleSelectionDeleteKeyDown = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || changeLogOpen || moveFolderOpen) return;
      if (!['Delete', 'Backspace'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (hasActiveNativeTextSelection()) return;
      const selectedBlockIds = getDeleteTargetBlockIds();
      if (!selectedBlockIds.length) return;
      event.preventDefault();
      event.stopPropagation();
      if (deleteBlocksByIds(selectedBlockIds)) {
        clearAreaBlockSelection();
        window.getSelection?.()?.removeAllRanges();
      }
    };
    window.addEventListener('keydown', handleSelectionDeleteKeyDown);
    return () => window.removeEventListener('keydown', handleSelectionDeleteKeyDown);
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, changeLogOpen, moveFolderOpen, editorBlocks, editorTitle, selectedBlockId, selectedAreaBlockIds]);

  const scrollToBlock = (id) => {
    setSelectedBlockId(id);
    const node = document.getElementById(`doc-block-${id}`);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusBlock(id);
  };

  const openDocContextMenu = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    openDocumentTab(item, { keepContextMenu: true });
    setDocContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      doc: item,
    });
  };

  const openTreeDocContextMenu = ({ event, node }) => {
    if (node?.nodeType !== 'document') return;
    const doc = node.document || getDocumentSummaryById(node.documentId) || { id: node.documentId, title: node.title };
    openDocContextMenu(event, doc);
  };

  const closeDocContextMenu = () => {
    setDocContextMenu(prev => ({ ...prev, open: false }));
  };

  const handleDocContextAction = ({ key }) => {
    const doc = docContextMenu.doc;
    if (!doc?.id) return;
    closeDocContextMenu();
    if (key === 'copy-link') {
      handleCopyDocLink(doc);
      return;
    }
    if (key === 'move') {
      openMoveFolder(doc);
      return;
    }
    if (key === 'edit-properties') {
      openDocumentTab(doc);
      openEditProperties(doc);
    }
  };

  const renderDocItem = (item) => (
    <List.Item
      key={item.id}
      onClick={() => openDocumentTab(item)}
      onContextMenu={event => openDocContextMenu(event, item)}
      style={{
        cursor: 'pointer',
        padding: isMobile ? '9px 10px' : '7px 8px',
        borderRadius: 7,
        background: selectedDocId === item.id ? '#eef2ff' : 'transparent',
        border: selectedDocId === item.id ? '1px solid #c7d2fe' : '1px solid transparent',
        marginBottom: isMobile ? 4 : 3,
      }}
      actions={[
        <Button
          key="favorite"
          type="text"
          size="small"
          icon={item.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(item);
          }}
        />,
      ]}
    >
      <List.Item.Meta
        title={
          <Space size={6} wrap style={{ rowGap: 2, lineHeight: 1.25 }}>
            <Text strong ellipsis style={{ maxWidth: isMobile ? 'calc(100vw - 164px)' : 170, lineHeight: '20px' }}>{item.title}</Text>
            <Tag color="blue" style={{ marginInlineEnd: 0, lineHeight: '20px' }}>{docTypeLabel[item.doc_type] || item.doc_type}</Tag>
          </Space>
        }
        description={
          <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.35 }}>
            {item.updated_by_name || item.created_by_name || '-'} · {formatDocumentTimestamp(item.updated_at)}
          </Text>
        }
      />
    </List.Item>
  );

  const renderDocTabs = () => {
    if (!openDocTabs.length) return null;
    return (
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '0 2px 8px',
          marginBottom: 10,
          borderBottom: '1px solid #edf0f5',
        }}
      >
        {openDocTabs.map(tab => {
          const docId = getDocTabId(tab.id);
          const active = getDocTabId(selectedDocId) === docId;
          const closing = closingTabIds.includes(docId);
          const title = tab.title || '未命名文档';
          return (
            <div
              key={docId}
              role="tab"
              aria-selected={active}
              onClick={() => openDocumentTab(tab)}
              style={{
                height: 34,
                minWidth: 128,
                maxWidth: isMobile ? 180 : 240,
                flex: '0 0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 4px 0 10px',
                borderRadius: 6,
                border: active ? '1px solid #c7d2fe' : '1px solid #e5e7eb',
                background: active ? '#eef2ff' : '#fff',
                color: active ? '#3730a3' : '#374151',
                cursor: 'pointer',
                boxShadow: active ? '0 2px 8px rgba(79, 70, 229, 0.12)' : 'none',
              }}
            >
              <FileTextOutlined style={{ flex: '0 0 auto', fontSize: 13 }} />
              <Tooltip title={title}>
                <Text
                  ellipsis
                  style={{
                    flex: 1,
                    minWidth: 0,
                    maxWidth: isMobile ? 110 : 168,
                    fontSize: 13,
                    color: 'inherit',
                    lineHeight: '32px',
                  }}
                >
                  {title}
                </Text>
              </Tooltip>
              <Tooltip title="关闭">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  loading={closing}
                  aria-label={`关闭 ${title}`}
                  onClick={(event) => handleCloseDocTab(event, docId)}
                  style={{
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    color: active ? '#4338ca' : '#6b7280',
                  }}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPageMenu = () => (
    <div style={{ width: isMobile ? 'min(92vw, 320px)' : 280, padding: 14, background: '#fff', borderRadius: 8, boxShadow: '0 6px 24px rgba(15,23,42,0.16)' }}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Button
            type="text"
            block
            icon={<UndoOutlined />}
            disabled={!editorUndoStack.length}
            onClick={() => {
              setPageMenuOpen(false);
              undoLastEditorAction();
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}
          >
            <span style={{ flex: 1, textAlign: 'left' }}>撤回</span>
            <Text type="secondary" style={{ fontSize: 12 }}>⌘Z</Text>
          </Button>
          <Tooltip title="复制页面链接可以粘贴到其他页面或分享给他人" placement="left">
            <Button
              type="text"
              block
              icon={<LinkOutlined />}
              onClick={handleCopyPageLink}
              style={{ justifyContent: 'flex-start', padding: '4px 8px' }}
            >
              复制页面链接
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除该页面？"
            onConfirm={() => {
              setPageMenuOpen(false);
              handleDelete();
            }}
            okText="删除"
            cancelText="取消"
          >
            <Button danger type="text" block icon={<DeleteOutlined />} aria-label="删除页面" style={{ justifyContent: 'flex-start', padding: '4px 8px' }}>
              删除页面
            </Button>
          </Popconfirm>
          <Button
            type="text"
            block
            icon={<FolderOpenOutlined />}
            onClick={openMoveFolder}
            style={{ justifyContent: 'flex-start', padding: '4px 8px' }}
          >
            移动到...
          </Button>
        </Space>
        <Divider style={{ margin: '0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text strong>标题目录</Text>
          <Switch
            size="small"
            loading={optionsSaving}
            checked={asSwitchValue(selectedDoc?.toc_enabled, true)}
            onChange={checked => {
              savePageOptions({ toc_enabled: checked });
              if (checked) {
                setTocOpen(true);
                if (isMobile) setMobileTocOpen(true);
              }
            }}
          />
        </div>
        <div>
          <Text strong>编辑宽度</Text>
          <Radio.Group
            value={selectedDoc?.width_mode || 'full'}
            onChange={event => savePageOptions({
              width_mode: event.target.value,
              custom_width: event.target.value === 'custom' ? (selectedDoc?.custom_width || 960) : selectedDoc?.custom_width,
            })}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}
          >
            <Radio.Button value="standard">标准</Radio.Button>
            <Radio.Button value="wide">宽屏</Radio.Button>
            <Radio.Button value="full">满屏</Radio.Button>
            <Radio.Button value="custom">自定义</Radio.Button>
          </Radio.Group>
          {selectedDoc?.width_mode === 'custom' && (
            <InputNumber
              min={640}
              max={1440}
              step={20}
              value={Number(selectedDoc?.custom_width) || 960}
              addonAfter="px"
              style={{ width: '100%', marginTop: 8 }}
              onChange={value => savePageOptions({ custom_width: value || 960 })}
            />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text strong>小字号</Text>
          <Switch
            size="small"
            loading={optionsSaving}
            checked={asSwitchValue(selectedDoc?.small_font_enabled)}
            onChange={checked => savePageOptions({ small_font_enabled: checked })}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text strong>标题编号</Text>
          <Switch
            size="small"
            loading={optionsSaving}
            checked={asSwitchValue(selectedDoc?.title_numbering_enabled)}
            onChange={checked => savePageOptions({ title_numbering_enabled: checked })}
          />
        </div>
      </Space>
    </div>
  );

  const renderShareSelector = () => {
    const accessUsers = selectedDoc?.access_summary?.users || [];
    return (
      <Spin spinning={shareLoading}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Space size={8} wrap>
                <Tag color="cyan">{selectedDoc?.access_summary?.label || '仅自己'}</Tag>
                <Text type="secondary">新建文档默认仅创建人可访问；超级管理员可查看所有文档权限。下方用于追加共享范围。</Text>
              </Space>
              {accessUsers.length > 0 && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>有权限成员</Text>
                  <div style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    maxHeight: 96,
                    overflowY: 'auto',
                    marginTop: 8,
                    paddingRight: 4,
                  }}>
                    {accessUsers.map(item => {
                      const sourceText = getAccessUserSourceText(item);
                      const color = item.is_creator ? 'geekblue' : item.is_default ? 'purple' : 'blue';
                      return (
                        <Tooltip key={item.id} title={sourceText}>
                          <Tag color={color} style={{ display: 'inline-flex', alignItems: 'center', margin: 0, padding: '2px 8px' }}>
                            <span>{getAccessUserName(item)}</span>
                          </Tag>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              )}
            </Space>
          </div>
        <div>
          <Text strong>项目组</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择项目组"
            value={shareDraft.project_group_ids}
            onChange={value => setShareDraft(prev => ({ ...prev, project_group_ids: value }))}
            options={projectGroups.map(group => ({
              value: group.id,
              label: `${group.name}${group.code ? ` (${group.code})` : ''}`,
            }))}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>部门</Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="选择部门"
            value={shareDraft.departments}
            onChange={value => setShareDraft(prev => ({ ...prev, departments: value }))}
            options={orgDepartmentOptions}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>小组</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择小组"
            value={shareDraft.team_ids}
            onChange={value => setShareDraft(prev => ({ ...prev, team_ids: value }))}
            options={teams.map(team => ({
              value: team.id,
              label: `${team.name}${team.department ? ` / ${orgDepartmentLabel[team.department] || team.department}` : ''}`,
            }))}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>个人</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择个人"
            value={shareDraft.user_ids}
            onChange={value => setShareDraft(prev => ({ ...prev, user_ids: value }))}
            options={users.map(item => ({
              value: item.id,
              label: `${item.display_name || item.username}${item.department ? ` / ${orgDepartmentLabel[item.department] || item.department}` : ''}`,
            }))}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
        <Divider style={{ margin: '2px 0' }} />
        <Space size={6} wrap>
          {(shareDraft.project_group_ids || []).map(id => {
            const group = projectGroups.find(item => Number(item.id) === Number(id));
            return <Tag key={`pg-${id}`} icon={<TeamOutlined />} color="blue">{group?.name || `项目组 ${id}`}</Tag>;
          })}
          {(shareDraft.departments || []).map(key => (
            <Tag key={`dept-${key}`} color="green">{orgDepartmentLabel[key] || key}</Tag>
          ))}
          {(shareDraft.team_ids || []).map(id => {
            const team = teams.find(item => Number(item.id) === Number(id));
            return <Tag key={`team-${id}`} icon={<TeamOutlined />} color="purple">{team?.name || `小组 ${id}`}</Tag>;
          })}
          {(shareDraft.user_ids || []).map(id => {
            const item = users.find(user => Number(user.id) === Number(id));
            return <Tag key={`user-${id}`} icon={<UserOutlined />} color="orange">{item?.display_name || item?.username || `用户 ${id}`}</Tag>;
          })}
          {draftToShares(shareDraft).length === 0 && <Text type="secondary">尚未追加共享对象</Text>}
        </Space>
        </Space>
      </Spin>
    );
  };

  const renderChangeLogEditor = () => {
    if (!changeLogFormOpen) return null;
    return (
      <div style={{ padding: 14, border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: 8 }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text strong>{editingChangeLog ? '编辑改动记录' : '新增改动记录'}</Text>
          <Form form={changeLogForm} layout="vertical">
            <Form.Item name="version" label="版本号" rules={[{ required: true, message: '请输入版本号' }]}>
              <Input placeholder="例如 V1.1" />
            </Form.Item>
            <Form.Item name="changed_at" label="更新时间">
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="summary" label="改动摘要" rules={[{ required: true, message: '请输入改动摘要' }]}>
              <Input placeholder="例如 调整开户 SOP 的审核步骤" />
            </Form.Item>
            <Form.Item name="detail" label="详细改动内容">
              <TextArea autoSize={{ minRows: 3 }} placeholder="逐条写清本次新增、删除或调整的内容" />
            </Form.Item>
            <Form.Item name="impact_scope" label="影响范围">
              <Input placeholder="例如 投放流程 / 开户 SOP / 全部项目组" />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <TextArea autoSize={{ minRows: 2 }} placeholder="补充变更原因、注意事项或回滚说明" />
            </Form.Item>
          </Form>
          <Space>
            <Button type="primary" icon={<PlusCircleOutlined />} loading={changeLogSaving} onClick={saveChangeLog}>
              {editingChangeLog ? '保存记录' : '添加记录'}
            </Button>
            <Button onClick={closeChangeLogEditor}>取消</Button>
          </Space>
        </Space>
      </div>
    );
  };

  const renderChangeLogItem = (item) => {
    const expanded = expandedChangeLogIds.includes(item.id);
    const actorName = item.changed_by_name || '未知用户';
    const canEdit = canEditChangeLog(item);
    const canDelete = canDeleteChangeLog(item);
    return (
      <List.Item style={{ padding: 0, borderBlockEnd: 'none' }}>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <div style={{ position: 'relative', width: 34, display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 34, bottom: -16, width: 1, background: '#e5e7eb' }} />
            <Avatar size={32} style={{ background: '#1677ff', zIndex: 1 }}>
              {actorName.slice(0, 1).toUpperCase()}
            </Avatar>
          </div>
          <div style={{ flex: 1, minWidth: 0, border: '1px solid #eef2f7', borderRadius: 8, padding: 12, background: '#fff' }}>
            <div
              onClick={() => toggleChangeLogExpanded(item.id)}
              style={{ display: 'flex', gap: 8, justifyContent: 'space-between', cursor: 'pointer' }}
            >
              <Space direction="vertical" size={4} style={{ minWidth: 0, flex: 1 }}>
                <Space size={8} wrap>
                  <Text strong>{actorName}</Text>
                  <Text type="secondary">记录了改动</Text>
                  <Tag color="blue">{item.version || 'V1.0'}</Tag>
                </Space>
                <Text strong ellipsis={{ tooltip: item.summary }}>{item.summary || '未填写摘要'}</Text>
                <Space size={6} wrap>
                  <ClockCircleOutlined style={{ color: '#94a3b8' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatChangeLogTime(item.changed_at || item.created_at)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{selectedDoc?.title || '-'}</Text>
                </Space>
              </Space>
              <Button
                type="text"
                size="small"
                icon={expanded ? <UpOutlined /> : <DownOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleChangeLogExpanded(item.id);
                }}
              />
            </div>

            {expanded && (
              <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>改动摘要</Text>
                  <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{item.summary || '-'}</div>
                </div>
                {item.detail && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>详细改动内容</Text>
                    <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{item.detail}</div>
                  </div>
                )}
                {item.impact_scope && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>影响范围</Text>
                    <div style={{ marginTop: 4 }}>{item.impact_scope}</div>
                  </div>
                )}
                {item.remark && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
                    <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{item.remark}</div>
                  </div>
                )}
                {(canEdit || canDelete) && (
                  <Space size={6}>
                    {canEdit && (
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditChangeLog(item)}>
                        编辑
                      </Button>
                    )}
                    {canDelete && (
                      <Popconfirm
                        title="删除这条改动记录？"
                        onConfirm={() => deleteChangeLog(item.id)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                      </Popconfirm>
                    )}
                  </Space>
                )}
              </Space>
            )}
          </div>
        </div>
      </List.Item>
    );
  };

  const renderEditRecordLine = (line, index) => {
    const parts = Array.isArray(line?.parts) && line.parts.length
      ? line.parts
      : [{ text: line?.text || '', changed: Boolean(line?.changed) }];
    return (
      <div
        key={`${line?.text || 'line'}-${index}`}
        style={{
          lineHeight: 1.8,
          padding: line?.changed ? '2px 4px' : '0 4px',
          background: line?.changed ? '#f0fdf4' : 'transparent',
          color: '#111827',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {parts.map((part, partIndex) => (
          <span
            key={`${part?.text || 'part'}-${partIndex}`}
            style={{
              color: part?.changed ? '#10b981' : '#111827',
              fontWeight: part?.changed ? 600 : 400,
              background: part?.changed ? '#dcfce7' : 'transparent',
            }}
          >
            {part?.text || ''}
          </span>
        ))}
      </div>
    );
  };

  const renderEditRecordItem = (item) => {
    const actorName = item.edited_by_name || '未知用户';
    const diffItems = getEditRecordDiffItems(item);
    const pageTitle = item.title_after || selectedDoc?.title || '未命名文档';
    const canRestoreRecord = Boolean(item.can_restore);
    return (
      <List.Item style={{ padding: 0, borderBlockEnd: 'none' }}>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <div style={{ position: 'relative', width: 34, display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 34, bottom: -16, width: 1, background: '#e5e7eb' }} />
            <Avatar size={32} style={{ background: '#dbeafe', color: '#2563eb', zIndex: 1 }}>
              {actorName.slice(0, 1).toUpperCase()}
            </Avatar>
          </div>
          <div style={{ flex: 1, minWidth: 0, border: '1px solid #eef2f7', borderRadius: 8, padding: 12, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <Space direction="vertical" size={4} style={{ flex: 1, minWidth: 0 }}>
                <Space size={6} wrap>
                  <Text strong>{actorName}</Text>
                  <Text type="secondary">编辑了页面</Text>
                  <Text strong ellipsis={{ tooltip: pageTitle }}>{pageTitle}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatEditRecordTime(item.edited_at || item.created_at)}</Text>
              </Space>
              <Space size={4}>
                {canManageSelectedDoc && (
                  <Tooltip title={canRestoreRecord ? '恢复到此版本' : '该记录缺少可恢复快照'}>
                    <span>
                      <Button
                        type="text"
                        size="small"
                        icon={<RollbackOutlined />}
                        loading={restoringEditRecordId === item.id}
                        disabled={!canRestoreRecord}
                        aria-label="恢复到此版本"
                        onClick={(event) => {
                          event.stopPropagation();
                          confirmRestoreEditRecord(item);
                        }}
                        style={{ color: canRestoreRecord ? '#64748b' : undefined }}
                      />
                    </span>
                  </Tooltip>
                )}
                <ClockCircleOutlined style={{ color: '#94a3b8', marginTop: 5 }} />
              </Space>
            </div>
            <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 10 }}>
              {diffItems.length ? diffItems.map((diffItem, index) => (
                <div key={`${diffItem?.label || 'diff'}-${index}`}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{diffItem?.label || '更新内容'}</Text>
                  <div style={{ marginTop: 4 }}>
                    {(diffItem?.lines || []).map(renderEditRecordLine)}
                  </div>
                </div>
              )) : (
                <Text type="secondary">本次保存未生成可展示的内容差异</Text>
              )}
            </Space>
          </div>
        </div>
      </List.Item>
    );
  };

  const renderChangeLogDrawer = () => {
    const logs = sortChangeLogsLatestFirst(selectedDoc?.change_logs || []);
    const editRecords = sortEditRecordsLatestFirst(selectedDoc?.edit_records || []);
    const allExpanded = logs.length > 0 && logs.every(item => expandedChangeLogIds.includes(item.id));
    const versionRecordPane = (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Text type="secondary">人工维护的重要版本节点</Text>
          <Space size={8} wrap>
            {canManageSelectedDoc && (
              <Button size="small" type="primary" icon={<PlusCircleOutlined />} onClick={openCreateChangeLog}>
                新增记录
              </Button>
            )}
            <Button size="small" disabled={!logs.length} icon={allExpanded ? <UpOutlined /> : <DownOutlined />} onClick={toggleAllChangeLogs}>
              {allExpanded ? '收起全部' : '展开全部'}
            </Button>
          </Space>
        </div>

        {renderChangeLogEditor()}

        <List
          dataSource={logs}
          rowKey="id"
          split={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本记录" /> }}
          renderItem={renderChangeLogItem}
        />
      </Space>
    );
    const editRecordPane = (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Space>
            <Switch size="small" checked={changeLogNotifyEnabled} onChange={setChangeLogNotifyEnabled} />
            <Text>接收页面变更通知</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>自动记录每次页面保存</Text>
        </div>

        <List
          dataSource={editRecords}
          rowKey="id"
          split={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无页面编辑记录" /> }}
          renderItem={renderEditRecordItem}
        />
      </Space>
    );
    return (
      <Drawer
        title="改动历史"
        placement="right"
        open={changeLogOpen}
        onClose={() => setChangeLogOpen(false)}
        width={isMobile ? '92vw' : 520}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ padding: 12, border: '1px solid #eef2f7', borderRadius: 8, background: '#fafafa' }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space size={8} wrap>
                <Tag>{selectedDoc?.document_no || '-'}</Tag>
                <Tag color="blue">{selectedDoc?.current_version || 'V1.0'}</Tag>
                <Text type="secondary">最后编辑：{selectedDoc?.updated_by_name || selectedDoc?.created_by_name || '-'}</Text>
              </Space>
              <Text strong>{selectedDoc?.title || '未命名文档'}</Text>
            </Space>
          </div>

          <Tabs
            activeKey={activeChangeLogTab}
            onChange={setActiveChangeLogTab}
            items={[
              {
                key: 'version',
                label: (
                  <Space size={6}>
                    <span>版本记录</span>
                    <Tag>{logs.length} 条</Tag>
                  </Space>
                ),
                children: versionRecordPane,
              },
              {
                key: 'edits',
                label: (
                  <Space size={6}>
                    <span>页面编辑记录</span>
                    <Tag color="green">{editRecords.length} 条</Tag>
                  </Space>
                ),
                children: editRecordPane,
              },
            ]}
          />
        </Space>
      </Drawer>
    );
  };

  const renderTocContent = ({ compact = false } = {}) => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text strong style={{ color: '#64748b' }}>标题目录</Text>
        {!compact && <Button type="text" size="small" icon={<MoreOutlined />} onClick={() => setTocOpen(false)} />}
      </div>
      {headingMeta.toc.length ? (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          {headingMeta.toc.map(item => (
            <Button
              key={item.id}
              type="text"
              block
              onClick={() => {
                if (compact) setMobileTocOpen(false);
                scrollToBlock(item.id);
              }}
              style={{
                justifyContent: 'flex-start',
                paddingLeft: (item.level - 1) * 14,
                height: 'auto',
                minHeight: 32,
                whiteSpace: 'normal',
                textAlign: 'left',
                color: '#64748b',
              }}
            >
              <span>{item.number ? `${item.number} ` : ''}{item.title}</span>
            </Button>
          ))}
        </Space>
      ) : (
        <Text type="secondary">请在正文添加标题</Text>
      )}
    </>
  );

  const renderTocPanel = () => {
    if (isMobile || !tocOpen) return null;
    return (
      <aside style={{
        width: 260,
        flex: '0 0 auto',
        borderLeft: '1px solid #e5e7eb',
        paddingLeft: 20,
        color: '#64748b',
        position: 'sticky',
        top: 16,
        alignSelf: 'flex-start',
        maxHeight: 'calc(100vh - 160px)',
        overflowY: 'auto',
      }}>
        {renderTocContent()}
      </aside>
    );
  };

  const toggleTocPanel = () => {
    if (!isMobile) {
      setTocOpen(prev => !prev);
      return;
    }
    setTocOpen(true);
    if (isMobile) setMobileTocOpen(true);
  };

  const getBlockMeta = (block) => ({ ...getDefaultBlockMeta(block?.type), ...cloneMeta(block?.meta) });

  const updateBlockMeta = (id, patch) => {
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(block => (
      block.id === id ? { ...block, meta: { ...getBlockMeta(block), ...patch } } : block
    )));
  };

  const getBlockInlineComments = (block) => normalizeInlineComments(getBlockMeta(block).comments);

  const getInlineCommentAuthorName = () => (
    currentUser?.display_name
    || currentUser?.username
    || currentUser?.name
    || currentUser?.email
    || '当前用户'
  );

  const hideInlineTextTools = () => {
    if (inlineToolbarHideTimerRef.current) {
      window.clearTimeout(inlineToolbarHideTimerRef.current);
      inlineToolbarHideTimerRef.current = null;
    }
    setInlineToolbar(null);
    setCommentComposer(null);
    setCommentDraft('');
  };

  const placeInlineToolbar = (block, input, start, end) => {
    if (!input || start === end) return;
    const inputText = input.isContentEditable ? (input.textContent || '') : (input.value || '');
    const selectedText = String(inputText).slice(start, end);
    if (!selectedText.trim()) {
      setInlineToolbar(prev => (prev?.blockId === block.id ? null : prev));
      return;
    }
    const rect = input.getBoundingClientRect();
    const toolbarWidth = Math.min(inlineToolbarWidth, Math.max(280, window.innerWidth - 24));
    const left = Math.min(
      Math.max(12, rect.left + (rect.width / 2) - (toolbarWidth / 2)),
      Math.max(12, window.innerWidth - toolbarWidth - 12)
    );
    const top = Math.max(8, rect.top - 48);
    setSelectedBlockId(block.id);
    clearAreaBlockSelection();
    setInlineToolbar({
      blockId: block.id,
      start,
      end,
      text: selectedText,
      top,
      left,
      width: toolbarWidth,
    });
  };

  const getInlineSelectionElementId = (selection) => {
    if (!selection?.blockId) return '';
    if (selection.tableCell) {
      const { type, rowIndex, columnIndex } = selection.tableCell;
      return `doc-table-cell-input-${selection.blockId}-${type}-${rowIndex}-${columnIndex}`;
    }
    return `doc-block-input-${selection.blockId}`;
  };

  const placeTableCellInlineToolbar = (block, input, tableCell, start, end) => {
    if (!input || start === end) return;
    const inputText = input.textContent || '';
    const selectedText = String(inputText).slice(start, end);
    if (!selectedText.trim()) {
      setInlineToolbar(prev => (prev?.blockId === block.id && prev?.tableCell ? null : prev));
      return;
    }
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rangeRect = range?.getBoundingClientRect?.();
    const inputRect = input.getBoundingClientRect();
    const anchorRect = rangeRect && (rangeRect.width || rangeRect.height) ? rangeRect : inputRect;
    const toolbarWidth = Math.min(inlineToolbarWidth, Math.max(280, window.innerWidth - 24));
    const left = Math.min(
      Math.max(12, anchorRect.left + (anchorRect.width / 2) - (toolbarWidth / 2)),
      Math.max(12, window.innerWidth - toolbarWidth - 12)
    );
    const top = Math.max(8, anchorRect.top - 48);
    setSelectedBlockId(block.id);
    clearAreaBlockSelection();
    setSelectedTableCell({ blockId: block.id, ...tableCell });
    setSelectedTableRange(null);
    setInlineToolbar({
      blockId: block.id,
      tableCell,
      start,
      end,
      text: selectedText,
      top,
      left,
      width: toolbarWidth,
    });
  };

  const getContentEditableSelectionRange = (element) => {
    if (!element || typeof window === 'undefined') return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(element);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const selectedRange = range.cloneRange();
    const start = beforeRange.toString().length;
    const end = start + selectedRange.toString().length;
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
      text: selectedRange.toString(),
    };
  };

  const handleInlineTextSelection = (block, event) => {
    const input = event?.target;
    if (!input) return;
    window.setTimeout(() => {
      const selectionRange = input.isContentEditable
        ? getContentEditableSelectionRange(input)
        : (
          typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number'
            ? { start: Math.min(input.selectionStart, input.selectionEnd), end: Math.max(input.selectionStart, input.selectionEnd) }
            : null
        );
      if (!selectionRange) return;
      const { start, end } = selectionRange;
      if (start === end) {
        if (!commentComposer) setInlineToolbar(prev => (prev?.blockId === block.id ? null : prev));
        return;
      }
      placeInlineToolbar(block, input, start, end);
    }, 0);
  };

  const handleTableCellTextSelection = (block, tableCell, event) => {
    const input = event?.target;
    if (!input?.isContentEditable) return;
    window.setTimeout(() => {
      const selectionRange = getContentEditableSelectionRange(input);
      if (!selectionRange) return;
      const { start, end } = selectionRange;
      if (start === end) {
        if (!commentComposer) {
          setInlineToolbar(prev => (prev?.blockId === block.id && prev?.tableCell ? null : prev));
        }
        return;
      }
      placeTableCellInlineToolbar(block, input, tableCell, start, end);
    }, 0);
  };

  const shiftInlineCommentsForReplace = (comments, start, end, delta, prefixLength = 0) => (
    normalizeInlineComments(comments).map(comment => {
      if (comment.end <= start) return comment;
      if (comment.start >= end) {
        return { ...comment, start: comment.start + delta, end: comment.end + delta };
      }
      if (comment.start >= start && comment.end <= end) {
        return { ...comment, start: comment.start + prefixLength, end: comment.end + prefixLength };
      }
      return { ...comment, end: Math.max(comment.start, comment.end + delta) };
    })
  );

  const focusInlineSelection = (blockId, start, end) => {
    window.setTimeout(() => {
      const input = document.getElementById(`doc-block-input-${blockId}`);
      if (input?.setSelectionRange) {
        input.focus();
        input.setSelectionRange(start, end);
        placeInlineToolbar({ id: blockId }, input, start, end);
      }
    }, 0);
  };

  const focusTableCellInlineSelection = (selection, start, end) => {
    if (!selection?.tableCell) return;
    window.setTimeout(() => {
      const input = document.getElementById(getInlineSelectionElementId(selection));
      if (!input?.isContentEditable) return;
      input.focus();
      setContentEditableSelectionRange(input, start, end);
      const block = editorBlocks.find(item => item.id === selection.blockId) || { id: selection.blockId };
      placeTableCellInlineToolbar(block, input, selection.tableCell, start, end);
    }, 0);
  };

  const getTableCellValue = (block, tableCell) => {
    const meta = getBlockMeta(block);
    if (tableCell?.type === 'header') {
      const columns = Array.isArray(meta.columns) ? meta.columns : [];
      return String(columns[tableCell.columnIndex] || '');
    }
    const rows = Array.isArray(meta.rows) ? meta.rows : [];
    return String(rows[tableCell?.rowIndex]?.[tableCell?.columnIndex] || '');
  };

  const updateTableCellInlineContent = (blockId, tableCell, value, shouldPushUndo = true) => {
    const currentBlock = editorBlocks.find(item => item.id === blockId);
    if (!currentBlock || !tableCell) return false;
    const meta = getBlockMeta(currentBlock);
    const columns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : ['名称', '说明'];
    const rows = Array.isArray(meta.rows) && meta.rows.length ? meta.rows : [['', '']];
    const normalizedRows = rows.map(row => columns.map((_, index) => row?.[index] || ''));
    const safeColumnIndex = Math.max(0, Math.min(columns.length - 1, Number(tableCell.columnIndex) || 0));
    const nextMeta = { ...meta };

    if (tableCell.type === 'header') {
      const currentValue = columns[safeColumnIndex] || '';
      if (areSerializedValuesEqual(currentValue, value)) return false;
      if (shouldPushUndo) pushEditorUndoSnapshot();
      nextMeta.columns = columns.map((column, index) => (index === safeColumnIndex ? value : column));
      nextMeta.rows = normalizedRows;
    } else {
      const safeRowIndex = Math.max(0, Math.min(normalizedRows.length - 1, Number(tableCell.rowIndex) || 0));
      const currentValue = normalizedRows[safeRowIndex]?.[safeColumnIndex] || '';
      if (areSerializedValuesEqual(currentValue, value)) return false;
      if (shouldPushUndo) pushEditorUndoSnapshot();
      nextMeta.columns = columns;
      nextMeta.rows = normalizedRows.map((row, rowIndex) => (
        rowIndex === safeRowIndex
          ? row.map((cell, columnIndex) => (columnIndex === safeColumnIndex ? value : cell))
          : row
      ));
    }

    setEditorBlocks(prev => prev.map(item => (
      item.id === blockId ? { ...item, meta: nextMeta } : item
    )));
    return true;
  };

  const applyInlineTextReplace = (selection, nextSelectedText, prefixLength = 0) => {
    if (!selection?.blockId) return false;
    const block = editorBlocks.find(item => item.id === selection.blockId);
    if (!block || typeof selection.start !== 'number' || typeof selection.end !== 'number') return false;
    if (selection.tableCell) {
      const content = getTableCellValue(block, selection.tableCell);
      const selected = content.slice(selection.start, selection.end);
      if (!selected) return false;
      const nextContent = `${content.slice(0, selection.start)}${nextSelectedText}${content.slice(selection.end)}`;
      const nextSelectionStart = selection.start + prefixLength;
      const nextSelectionEnd = nextSelectionStart + selected.length;
      updateTableCellInlineContent(selection.blockId, selection.tableCell, nextContent);
      focusTableCellInlineSelection(selection, nextSelectionStart, nextSelectionEnd);
      return true;
    }
    const content = String(block.content || '');
    const selected = content.slice(selection.start, selection.end);
    if (!selected) return false;
    const nextContent = `${content.slice(0, selection.start)}${nextSelectedText}${content.slice(selection.end)}`;
    const delta = nextSelectedText.length - selected.length;
    const nextSelectionStart = selection.start + prefixLength;
    const nextSelectionEnd = nextSelectionStart + selected.length;
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(item => {
      if (item.id !== selection.blockId) return item;
      const meta = getBlockMeta(item);
      return {
        ...item,
        content: nextContent,
        meta: {
          ...meta,
          comments: shiftInlineCommentsForReplace(meta.comments, selection.start, selection.end, delta, prefixLength),
        },
      };
    }));
    focusInlineSelection(selection.blockId, nextSelectionStart, nextSelectionEnd);
    return true;
  };

  const getInlineWrapConfig = (kind) => ({
    bold: ['**', '**'],
    italic: ['*', '*'],
    underline: ['<u>', '</u>'],
    strike: ['~~', '~~'],
    code: ['`', '`'],
    formula: ['$', '$'],
    color: ['<mark>', '</mark>'],
  }[kind] || ['', '']);

  const applyInlineTextUnwrap = (selection, prefix, suffix) => {
    if (!selection?.blockId || (!prefix && !suffix)) return false;
    const block = editorBlocks.find(item => item.id === selection.blockId);
    if (!block) return false;
    const content = selection.tableCell ? getTableCellValue(block, selection.tableCell) : String(block.content || '');
    const selected = content.slice(selection.start, selection.end);
    const wrappedSelection = selected.startsWith(prefix) && selected.endsWith(suffix);
    const outerWrappedSelection = content.slice(selection.start - prefix.length, selection.start) === prefix
      && content.slice(selection.end, selection.end + suffix.length) === suffix;
    if (!wrappedSelection && !outerWrappedSelection) return false;

    const replaceStart = wrappedSelection ? selection.start : selection.start - prefix.length;
    const replaceEnd = wrappedSelection ? selection.end : selection.end + suffix.length;
    const nextSelectedText = wrappedSelection
      ? selected.slice(prefix.length, selected.length - suffix.length)
      : selected;
    const nextContent = `${content.slice(0, replaceStart)}${nextSelectedText}${content.slice(replaceEnd)}`;
    const delta = nextContent.length - content.length;

    if (selection.tableCell) {
      updateTableCellInlineContent(selection.blockId, selection.tableCell, nextContent);
      focusTableCellInlineSelection(selection, replaceStart, replaceStart + nextSelectedText.length);
      return true;
    }

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(item => {
      if (item.id !== selection.blockId) return item;
      const meta = getBlockMeta(item);
      return {
        ...item,
        content: nextContent,
        meta: {
          ...meta,
          comments: shiftInlineCommentsForReplace(meta.comments, replaceStart, replaceEnd, delta, 0),
        },
      };
    }));
    focusInlineSelection(selection.blockId, replaceStart, replaceStart + nextSelectedText.length);
    return true;
  };

  const applyInlineWrap = (kind) => {
    const selection = inlineToolbar;
    if (!selection) return;
    const editor = document.getElementById(getInlineSelectionElementId(selection));
    if (editor?.isContentEditable) {
      editor.focus();
      const commandMap = {
        bold: 'bold',
        italic: 'italic',
        underline: 'underline',
        strike: 'strikeThrough',
        code: 'formatBlock',
        formula: 'insertText',
      };
      if (kind === 'link') {
        const url = window.prompt('请输入链接地址', 'https://');
        if (!url) return;
        document.execCommand('createLink', false, url);
      } else if (kind === 'code') {
        document.execCommand('fontName', false, 'monospace');
      } else if (kind === 'formula') {
        document.execCommand('insertText', false, `$${selection.text || ''}$`);
      } else if (commandMap[kind]) {
        document.execCommand(commandMap[kind], false, null);
      }
      const block = editorBlocks.find(item => item.id === selection.blockId);
      if (selection.tableCell) {
        updateTableCellInlineContent(selection.blockId, selection.tableCell, sanitizeInlineHtml(editor.innerHTML));
        if (block) handleTableCellTextSelection(block, selection.tableCell, { target: editor });
      } else {
        updateBlock(selection.blockId, { content: sanitizeInlineHtml(editor.innerHTML) });
        if (block) handleInlineTextSelection(block, { target: editor });
      }
      return;
    }
    const selected = selection.text || '';
    if (kind === 'link') {
      const url = window.prompt('请输入链接地址', 'https://');
      if (!url) return;
      applyInlineTextReplace(selection, `[${selected}](${url})`, 1);
      return;
    }
    const [prefix, suffix] = getInlineWrapConfig(kind);
    if (!prefix && !suffix) return;
    if (applyInlineTextUnwrap(selection, prefix, suffix)) return;
    applyInlineTextReplace(selection, `${prefix}${selected}${suffix}`, prefix.length);
  };

  const applyInlineColor = (color) => {
    if (!inlineToolbar?.blockId || !color) return;
    const editor = document.getElementById(getInlineSelectionElementId(inlineToolbar));
    if (editor?.isContentEditable) {
      editor.focus();
      document.execCommand('foreColor', false, color);
      const block = editorBlocks.find(item => item.id === inlineToolbar.blockId);
      if (inlineToolbar.tableCell) {
        updateTableCellInlineContent(inlineToolbar.blockId, inlineToolbar.tableCell, sanitizeInlineHtml(editor.innerHTML));
        if (block) handleTableCellTextSelection(block, inlineToolbar.tableCell, { target: editor });
      } else {
        updateBlock(inlineToolbar.blockId, { content: sanitizeInlineHtml(editor.innerHTML) });
        if (block) handleInlineTextSelection(block, { target: editor });
      }
      return;
    }
    applyInlineWrap('color');
  };

  const openInlineCommentComposer = () => {
    if (!inlineToolbar?.text?.trim()) return;
    setCommentComposer({ ...inlineToolbar });
    setCommentDraft('');
  };

  const saveInlineComment = () => {
    const draft = commentDraft.trim();
    if (!commentComposer?.blockId || !draft) {
      message.warning('请输入评论内容');
      return;
    }
    const now = new Date().toISOString();
    const nextComment = {
      id: makeInlineCommentId(),
      start: commentComposer.start,
      end: commentComposer.end,
      text: commentComposer.text,
      comment: draft,
      authorId: currentUser?.id || null,
      authorName: getInlineCommentAuthorName(),
      createdAt: now,
      updatedAt: now,
    };
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(block => {
      if (block.id !== commentComposer.blockId) return block;
      const meta = getBlockMeta(block);
      return {
        ...block,
        meta: {
          ...meta,
          comments: [...normalizeInlineComments(meta.comments), nextComment],
        },
      };
    }));
    setActiveCommentBlockId(commentComposer.blockId);
    hideInlineTextTools();
    message.success('评论已添加');
  };

  const startEditInlineComment = (blockId, comment) => {
    setEditingComment({ blockId, commentId: comment.id });
    setEditingCommentText(comment.comment || '');
  };

  const cancelEditInlineComment = () => {
    setEditingComment(null);
    setEditingCommentText('');
  };

  const saveEditedInlineComment = () => {
    const draft = editingCommentText.trim();
    if (!editingComment?.blockId || !editingComment?.commentId || !draft) {
      message.warning('请输入评论内容');
      return;
    }
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(block => {
      if (block.id !== editingComment.blockId) return block;
      const meta = getBlockMeta(block);
      const nextComments = normalizeInlineComments(meta.comments).map(comment => (
        comment.id === editingComment.commentId
          ? { ...comment, comment: draft, updatedAt: new Date().toISOString() }
          : comment
      ));
      return {
        ...block,
        meta: {
          ...meta,
          comments: nextComments,
        },
      };
    }));
    cancelEditInlineComment();
    message.success('评论已更新');
  };

  const deleteInlineComment = (blockId, commentId) => {
    pushEditorUndoSnapshot();
    const block = editorBlocks.find(item => item.id === blockId);
    const remainingCount = getBlockInlineComments(block).filter(comment => comment.id !== commentId).length;
    setEditorBlocks(prev => prev.map(item => {
      if (item.id !== blockId) return item;
      const meta = getBlockMeta(item);
      const nextComments = normalizeInlineComments(meta.comments).filter(comment => comment.id !== commentId);
      const nextMeta = { ...meta };
      if (nextComments.length) {
        nextMeta.comments = nextComments;
      } else {
        delete nextMeta.comments;
      }
      return {
        ...item,
        meta: nextMeta,
      };
    }));
    if (!remainingCount) setActiveCommentBlockId(null);
    if (editingComment?.commentId === commentId) cancelEditInlineComment();
    message.success('评论已删除');
  };

  const keepInlineToolbarOpen = (event) => {
    if (inlineToolbarHideTimerRef.current) {
      window.clearTimeout(inlineToolbarHideTimerRef.current);
      inlineToolbarHideTimerRef.current = null;
    }
    if (!event.target?.closest?.('textarea, input, [contenteditable="true"]')) event.preventDefault();
  };

  const renderInlineStyleMenu = () => {
    const block = editorBlocks.find(item => item.id === inlineToolbar?.blockId);
    if (!block) return null;
    return (
      <Dropdown
        trigger={['click']}
        menu={{
          items: blockTypeGroups.map(group => ({
            type: 'group',
            label: group.label,
            children: group.children.map(item => ({
              key: item.value,
              label: renderBlockMenuLabel(item, block.type === item.value),
              icon: item.icon,
              disabled: item.value === 'recent-image',
            })),
          })),
          onClick: ({ key }) => {
            changeBlockType(block.id, key);
            setInlineToolbar(prev => (prev ? { ...prev, blockId: block.id } : prev));
          },
        }}
      >
        <Button size="small" type="text" style={{ fontWeight: 600, color: '#111827' }}>
          {blockTypeMap[block.type]?.label || '文本'} <DownOutlined style={{ fontSize: 10 }} />
        </Button>
      </Dropdown>
    );
  };

  const renderInlineTextToolbar = () => {
    if (!inlineToolbar || !selectedDoc) return null;
    return (
      <div
        data-inline-text-toolbar="true"
        onMouseDown={keepInlineToolbarOpen}
        style={{
          position: 'fixed',
          top: inlineToolbar.top,
          left: inlineToolbar.left,
          width: inlineToolbar.width,
          zIndex: 1000,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
          padding: 6,
        }}
      >
        <Space size={2} wrap style={{ width: '100%' }}>
          {!inlineToolbar.tableCell && (
            <>
              {renderInlineStyleMenu()}
              <Divider type="vertical" style={{ marginInline: 4 }} />
            </>
          )}
          {[
            ['bold', 'B', '加粗'],
            ['italic', 'I', '斜体'],
            ['underline', 'U', '下划线'],
            ['strike', 'S', '删除线'],
            ['code', '{}', '代码'],
            ['formula', 'ƒ', '公式'],
            ['link', <LinkOutlined />, '链接'],
          ].map(([key, label, title]) => (
            <Tooltip key={key} title={title}>
              <Button
                size="small"
                type="text"
                aria-label={title}
                onClick={() => applyInlineWrap(key)}
                style={{
                  width: 28,
                  minWidth: 28,
                  padding: 0,
                  fontWeight: key === 'bold' ? 800 : 600,
                  fontStyle: key === 'italic' ? 'italic' : 'normal',
                  textDecoration: key === 'underline' ? 'underline' : key === 'strike' ? 'line-through' : 'none',
                }}
              >
                {label}
              </Button>
            </Tooltip>
          ))}
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div
                onMouseDown={event => event.preventDefault()}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 24px)',
                  gap: 6,
                  padding: 8,
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
                }}
              >
                {['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#ffffff', '#fef3c7'].map(color => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`文字颜色 ${color}`}
                    onClick={() => applyInlineColor(color)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      border: color === '#ffffff' ? '1px solid #d1d5db' : '1px solid transparent',
                      background: color,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              aria-label="文字颜色"
              style={{ width: 28, minWidth: 28, padding: 0, fontWeight: 700 }}
            >
              A
            </Button>
          </Dropdown>
          {!inlineToolbar.tableCell && (
            <>
              <Divider type="vertical" style={{ marginInline: 4 }} />
              <Tooltip title="添加评论">
                <Button size="small" type="text" onClick={openInlineCommentComposer} style={{ paddingInline: 8 }}>
                  评论
                </Button>
              </Tooltip>
            </>
          )}
        </Space>
        {commentComposer && (
          <div style={{ marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
            <TextArea
              value={commentDraft}
              autoSize={{ minRows: 2, maxRows: 5 }}
              placeholder="输入评论"
              onChange={event => setCommentDraft(event.target.value)}
              onKeyDown={event => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveInlineComment();
              }}
              style={{ borderRadius: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: commentComposer.text }}>
                “{commentComposer.text}”
              </Text>
              <Space size={6}>
                <Button size="small" onClick={() => {
                  setCommentComposer(null);
                  setCommentDraft('');
                }}>
                  取消
                </Button>
                <Button size="small" type="primary" onClick={saveInlineComment}>评论</Button>
              </Space>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderInlineCommentPanel = (block) => {
    const comments = getBlockInlineComments(block);
    if (!comments.length || activeCommentBlockId !== block.id) return null;
    return (
      <div
        data-inline-comment-panel="true"
        onClick={event => event.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          marginTop: 10,
          marginLeft: isMobile ? 0 : 28,
          maxWidth: isMobile ? '100%' : 520,
          zIndex: 8,
          border: '1px solid #dbeafe',
          borderRadius: 8,
          background: '#ffffff',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <Space size={6}>
            <Text strong>评论</Text>
            <Tag color="blue">{comments.length}</Tag>
          </Space>
          <Button type="text" size="small" icon={<CloseOutlined />} aria-label="收起评论" onClick={() => setActiveCommentBlockId(null)} />
        </div>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {comments.map(comment => {
            const editing = editingComment?.blockId === block.id && editingComment?.commentId === comment.id;
            return (
              <div key={comment.id} style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: 10, background: '#fbfdff' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <Space size={8} style={{ minWidth: 0 }}>
                      <Avatar size={24} style={{ background: '#1677ff', flex: '0 0 auto' }}>
                        {(comment.authorName || '用').slice(0, 1)}
                      </Avatar>
                      <div style={{ minWidth: 0 }}>
                        <Text strong style={{ fontSize: 13 }}>{comment.authorName}</Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatChangeLogTime(comment.updatedAt || comment.createdAt)}
                          </Text>
                        </div>
                      </div>
                    </Space>
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key: 'edit', icon: <EditOutlined />, label: '编辑' },
                          { key: 'delete', danger: true, icon: <DeleteOutlined />, label: '删除' },
                        ],
                        onClick: ({ key }) => {
                          if (key === 'edit') startEditInlineComment(block.id, comment);
                          if (key === 'delete') deleteInlineComment(block.id, comment.id);
                        },
                      }}
                    >
                      <Button type="text" size="small" icon={<MoreOutlined />} aria-label="评论操作" />
                    </Dropdown>
                  </div>
                  <div style={{
                    borderLeft: '3px solid #bfdbfe',
                    paddingLeft: 8,
                    color: '#64748b',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {comment.text || '所选文本'}
                  </div>
                  {editing ? (
                    <div>
                      <TextArea
                        value={editingCommentText}
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        onChange={event => setEditingCommentText(event.target.value)}
                      />
                      <Space size={6} style={{ marginTop: 8 }}>
                        <Button size="small" type="primary" onClick={saveEditedInlineComment}>保存</Button>
                        <Button size="small" onClick={cancelEditInlineComment}>取消</Button>
                      </Space>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#111827' }}>
                      {comment.comment}
                    </div>
                  )}
                </Space>
              </div>
            );
          })}
        </Space>
      </div>
    );
  };

  const renderInlineCommentHints = (block) => {
    const comments = getBlockInlineComments(block);
    if (!comments.length || activeCommentBlockId === block.id) return null;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          setActiveCommentBlockId(block.id);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setActiveCommentBlockId(block.id);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 6,
          marginLeft: isMobile ? 0 : 28,
          padding: '3px 8px',
          borderRadius: 999,
          background: '#eff6ff',
          color: '#1d4ed8',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <span>{comments.length} 条评论</span>
        <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {comments[0].text || comments[0].comment}
        </span>
      </div>
    );
  };

  const handleMediaUpload = async (block, file, kind) => {
    const acceptText = mediaAcceptMap[kind] || '';
    const allowedExts = acceptText.split(',').map(item => item.replace('.', '').trim()).filter(Boolean);
    if (allowedExts.length && !allowedExts.includes(getFileExt(file.name))) {
      message.error(kind === 'image' ? '请选择图片文件' : kind === 'video' ? '请选择视频文件' : '请选择音频文件');
      return Upload.LIST_IGNORE;
    }
    if (!selectedDoc?.id) {
      message.warning('请先保存文档，再上传媒体文件');
      return Upload.LIST_IGNORE;
    }
    try {
      const formData = new FormData();
      formData.append('source_type', 'document');
      formData.append('source_id', selectedDoc.id);
      formData.append('files', file);
      const rows = await attachmentsApi.upload(formData);
      const uploaded = rows?.[0];
      if (uploaded) {
        updateBlock(block.id, {
          content: uploaded.filename || block.content || '',
          meta: { ...getBlockMeta(block), ...attachmentToMediaMeta(uploaded) },
        });
        message.success('媒体已上传');
      }
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '媒体上传失败');
    }
    return Upload.LIST_IGNORE;
  };

  const renderListGuides = (block, options = {}) => {
    const guideMeta = hierarchicalGuideMap.get(block.id);
    const indent = getListIndent(block);
    if ((!guideMeta?.ancestorLines?.length && !guideMeta?.hasChildren) || indent < 0) return null;

    const {
      top = -6,
      bottom = -6,
      centerY = 14,
      lineOffset = listMarkerCenterOffset,
      indentWidth = listIndentWidth,
      color = listGuideColor,
    } = options;
    const lineStyles = {
      position: 'absolute',
      width: 1,
      background: color,
      pointerEvents: 'none',
      zIndex: 0,
    };

    return (
      <>
        {(guideMeta?.ancestorLines || []).map(({ level, continuesBelow }) => (
          <span
            key={`${block.id}-guide-${level}`}
            style={{
              ...lineStyles,
              left: level * indentWidth + lineOffset,
              top,
              ...(continuesBelow
                ? { bottom }
                : { height: Math.max(1, centerY - top + 1) }),
            }}
          />
        ))}
        {indent > 0 && (
          <span
            style={{
              position: 'absolute',
              left: (indent - 1) * indentWidth + lineOffset,
              top: centerY,
              width: indentWidth,
              height: 1,
              background: color,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}
        {guideMeta?.hasChildren && (
          <span
            style={{
              ...lineStyles,
              left: indent * indentWidth + lineOffset,
              top: centerY,
              bottom,
            }}
          />
        )}
      </>
    );
  };

  const renderHierarchicalListBlock = (block, commonProps) => {
    const meta = getBlockMeta(block);
    const indent = getListIndent(block);
    const collapsed = Boolean(meta.collapsed);
    const markerColor = listMarkerColor;
    const marker = block.type === 'bullet'
      ? getBulletListMarker(indent)
      : numberedListMarkers.get(block.id);
    const markerLineHeight = (Number(commonProps.style.fontSize) || 15) * listLineHeight;
    const markerContainerStyle = {
      width: listMarkerBoxWidth,
      minWidth: listMarkerBoxWidth,
      height: markerLineHeight,
      display: 'flex',
      alignItems: 'center',
      justifyContent: block.type === 'numbered' ? 'flex-end' : 'center',
      color: markerColor,
      position: 'relative',
      zIndex: 1,
    };

    const markerNode = block.type === 'fold-list' ? (
      <Button
        type="text"
        size="small"
        icon={collapsed ? <CaretRightFilled style={{ fontSize: 12, color: listMarkerColor }} /> : <CaretDownFilled style={{ fontSize: 12, color: listMarkerColor }} />}
        onClick={(event) => {
          event.stopPropagation();
          updateBlockMeta(block.id, { collapsed: !collapsed });
        }}
        style={{
          width: listMarkerBoxWidth,
          minWidth: listMarkerBoxWidth,
          height: markerLineHeight,
          padding: 0,
          color: listMarkerColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    ) : block.type === 'bullet' ? (
      <span style={markerContainerStyle}>
        {renderBulletListMarker(indent)}
      </span>
    ) : (
      <Text style={{
        ...markerContainerStyle,
        textAlign: 'right',
        color: markerColor,
        fontWeight: 500,
        lineHeight: `${markerLineHeight}px`,
      }}>
        {marker}
      </Text>
    );

    return (
      <div style={{ position: 'relative', paddingLeft: indent * listIndentWidth }}>
        {renderListGuides(block, { top: -2, bottom: -2, centerY: markerLineHeight / 2 })}
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
          {markerNode}
          <InlineRichTextEditor
            {...commonProps}
            placeholder={selectedBlockId === block.id
              ? (block.type === 'fold-list' ? '折叠列表标题' : block.type === 'numbered' ? '数字列表项' : '列表项')
              : ''}
            onChange={value => commonProps.onChange(value)}
            style={{
              ...commonProps.style,
              lineHeight: listLineHeight,
              fontWeight: block.type === 'fold-list' ? 500 : commonProps.style.fontWeight,
              minHeight: markerLineHeight,
              padding: '0',
            }}
          />
        </div>
      </div>
    );
  };

  const renderFoldBlock = (block, commonProps) => {
    const meta = getBlockMeta(block);
    const collapsed = Boolean(meta.collapsed);
    const headingLevel = block.type === 'fold-heading2' ? 2 : block.type === 'fold-heading3' ? 3 : block.type === 'fold-heading4' ? 4 : 0;
    const isTodo = block.type === 'fold-todo' || block.type === 'fold-advanced-todo';
    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Button
            type="text"
            size="small"
            icon={collapsed ? <RightOutlined /> : <DownOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              updateBlockMeta(block.id, { collapsed: !collapsed });
            }}
            style={{ width: 24, minWidth: 24, padding: 0, marginTop: 2 }}
          />
          {isTodo && (
            <Checkbox
              checked={Boolean(block.checked)}
              onChange={event => updateBlock(block.id, { checked: event.target.checked })}
              style={{ paddingTop: 4 }}
            />
          )}
          <InlineRichTextEditor
            {...commonProps}
            placeholder={selectedBlockId === block.id
              ? (block.type === 'fold-todo' ? '折叠待办事项' : block.type === 'fold-advanced-todo' ? '高级待办事项' : '')
              : ''}
            onChange={value => commonProps.onChange(value)}
            style={{
              ...commonProps.style,
              fontSize: headingLevel === 2 ? 24 : headingLevel === 3 ? 19 : headingLevel === 4 ? 16 : commonProps.style.fontSize,
              fontWeight: headingLevel ? 700 : 600,
            }}
          />
          {block.type === 'fold-advanced-todo' && <Tag color="gold" style={{ marginTop: 2 }}>高级</Tag>}
        </div>
        {!collapsed && (
          <TextArea
            value={meta.body || ''}
            bordered={false}
            autoSize={{ minRows: 2 }}
            placeholder="折叠内容"
            onFocus={() => setSelectedBlockId(block.id)}
            onChange={event => updateBlockMeta(block.id, { body: event.target.value })}
            style={{
              marginLeft: isTodo ? 68 : 32,
              width: `calc(100% - ${isTodo ? 68 : 32}px)`,
              resize: 'none',
              lineHeight: 1.7,
              fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
              background: '#f8fafc',
              borderRadius: 6,
              padding: '6px 8px',
            }}
          />
        )}
      </Space>
    );
  };

  const renderTocBlock = () => (
    <div style={{ borderLeft: '3px solid #dbeafe', padding: '8px 10px', background: '#f8fbff', borderRadius: 6 }}>
      <Text strong>页面目录</Text>
      <Space direction="vertical" size={2} style={{ display: 'flex', marginTop: 6 }}>
        {headingMeta.toc.length ? headingMeta.toc.map(item => (
          <Text key={item.id} type="secondary" style={{ paddingLeft: (item.level - 1) * 12 }}>
            {item.number ? `${item.number} ` : ''}{item.title}
          </Text>
        )) : <Text type="secondary">正文添加标题后自动生成目录</Text>}
      </Space>
    </div>
  );

  const renderButtonBlock = (block, commonProps) => {
    const meta = getBlockMeta(block);
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <TextArea {...commonProps} autoSize={{ minRows: 1 }} placeholder="按钮文案" style={{ ...commonProps.style, fontWeight: 600 }} />
        <Input
          value={meta.url || ''}
          placeholder="按钮链接，可填写 https:// 或站内路径"
          onChange={event => updateBlockMeta(block.id, { url: event.target.value })}
        />
        <Button type="primary" href={meta.url || undefined} target={meta.url ? '_blank' : undefined}>
          {block.content || '按钮'}
        </Button>
      </Space>
    );
  };

  const renderTableBlock = (block) => {
    const meta = getBlockMeta(block);
    const columns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : ['名称', '说明'];
    const rows = Array.isArray(meta.rows) && meta.rows.length ? meta.rows : [['', '']];
    const normalizedRows = rows.map(row => columns.map((_, index) => row?.[index] || ''));
    const columnWidths = columns.map((_, index) => Math.max(80, Number(meta.columnWidths?.[index]) || (isMobile ? 120 : 160)));
    const selectedCell = selectedTableCell?.blockId === block.id ? selectedTableCell : null;
    const selectedTableCellIsBody = selectedCell?.type === 'body' && Number.isInteger(selectedCell?.rowIndex);
    const selectedColumnIndex = Number.isInteger(selectedCell?.columnIndex) ? selectedCell.columnIndex : -1;
    const selectedRowIndex = selectedTableCellIsBody ? selectedCell.rowIndex : -1;
    const activeTableRange = selectedTableRange?.blockId === block.id ? selectedTableRange : null;
    const normalizeTableRange = (range) => {
      if (!range) return null;
      const clampRow = (rowIndex) => Math.max(-1, Math.min(normalizedRows.length - 1, Number(rowIndex) || 0));
      const clampColumn = (columnIndex) => Math.max(0, Math.min(columns.length - 1, Number(columnIndex) || 0));
      const startRowIndex = clampRow(range.startRowIndex);
      const endRowIndex = clampRow(range.endRowIndex);
      const startColumnIndex = clampColumn(range.startColumnIndex);
      const endColumnIndex = clampColumn(range.endColumnIndex);
      return {
        startRowIndex: Math.min(startRowIndex, endRowIndex),
        endRowIndex: Math.max(startRowIndex, endRowIndex),
        startColumnIndex: Math.min(startColumnIndex, endColumnIndex),
        endColumnIndex: Math.max(startColumnIndex, endColumnIndex),
      };
    };
    const selectedRangeBounds = normalizeTableRange(activeTableRange);
    const wholeTableSelected = selectedAreaBlockIds.includes(block.id);
    const hasSelectedRange = Boolean(
      selectedRangeBounds
      && (
        selectedRangeBounds.startRowIndex !== selectedRangeBounds.endRowIndex
        || selectedRangeBounds.startColumnIndex !== selectedRangeBounds.endColumnIndex
      )
    );
    const isCellInSelectedRange = (rowIndex, columnIndex) => (
      hasSelectedRange
      && rowIndex >= selectedRangeBounds.startRowIndex
      && rowIndex <= selectedRangeBounds.endRowIndex
      && columnIndex >= selectedRangeBounds.startColumnIndex
      && columnIndex <= selectedRangeBounds.endColumnIndex
    );
    const tableWidth = Math.max(columnWidths.reduce((sum, width) => sum + width, 0), isMobile ? 320 : 560);
    const horizontalCenter = Boolean(meta.horizontalCenter);
    const verticalCenter = Boolean(meta.verticalCenter);
    const persistTableMeta = (patch) => updateBlockMeta(block.id, {
      columns,
      rows: normalizedRows,
      columnWidths,
      horizontalCenter,
      verticalCenter,
      ...patch,
    });
    const updateColumn = (index, value) => {
      const nextColumns = columns.map((item, columnIndex) => (columnIndex === index ? value : item));
      persistTableMeta({ columns: nextColumns });
    };
    const updateCell = (rowIndex, columnIndex, value) => {
      const nextRows = normalizedRows.map((row, currentRowIndex) => (
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell))
          : row
      ));
      persistTableMeta({ rows: nextRows });
    };
    const insertRow = (targetIndex = normalizedRows.length - 1, position = 'after') => {
      const safeIndex = Math.max(0, Math.min(normalizedRows.length - 1, Number(targetIndex) || 0));
      const insertIndex = position === 'before' ? safeIndex : safeIndex + 1;
      const nextRows = [...normalizedRows];
      nextRows.splice(insertIndex, 0, columns.map(() => ''));
      persistTableMeta({ rows: nextRows });
      setSelectedTableCell({ blockId: block.id, type: 'body', rowIndex: insertIndex, columnIndex: Math.max(0, selectedColumnIndex) });
      setSelectedTableRange(null);
    };
    const insertColumn = (targetIndex = columns.length - 1, position = 'after') => {
      const safeIndex = Math.max(0, Math.min(columns.length - 1, Number(targetIndex) || 0));
      const insertIndex = position === 'before' ? safeIndex : safeIndex + 1;
      const nextColumns = [...columns];
      nextColumns.splice(insertIndex, 0, `字段 ${columns.length + 1}`);
      const nextRows = normalizedRows.map(row => {
        const nextRow = [...row];
        nextRow.splice(insertIndex, 0, '');
        return nextRow;
      });
      const nextWidths = [...columnWidths];
      nextWidths.splice(insertIndex, 0, columnWidths[safeIndex] || 160);
      persistTableMeta({ columns: nextColumns, rows: nextRows, columnWidths: nextWidths });
      setSelectedTableCell({ blockId: block.id, type: 'body', rowIndex: Math.max(0, selectedRowIndex), columnIndex: insertIndex });
      setSelectedTableRange(null);
    };
    const clearSelectedCell = () => {
      if (hasSelectedRange) {
        const nextColumns = columns.map((column, columnIndex) => (
          isCellInSelectedRange(-1, columnIndex) ? '' : column
        ));
        const nextRows = normalizedRows.map((row, rowIndex) => (
          row.map((cell, columnIndex) => (
            isCellInSelectedRange(rowIndex, columnIndex) ? '' : cell
          ))
        ));
        persistTableMeta({ columns: nextColumns, rows: nextRows });
        return;
      }
      if (!selectedTableCellIsBody) return;
      updateCell(selectedRowIndex, selectedColumnIndex, '');
    };
    const deleteSelectedRow = () => {
      const startRowIndex = hasSelectedRange ? Math.max(0, selectedRangeBounds.startRowIndex) : selectedRowIndex;
      const endRowIndex = hasSelectedRange ? Math.max(0, selectedRangeBounds.endRowIndex) : selectedRowIndex;
      if (startRowIndex < 0 || normalizedRows.length <= 1) return;
      const deleteCount = Math.max(1, endRowIndex - startRowIndex + 1);
      if (deleteCount >= normalizedRows.length) return;
      const nextRows = normalizedRows.filter((_, index) => (
        index < startRowIndex || index > endRowIndex
      ));
      persistTableMeta({ rows: nextRows });
      setSelectedTableCell({
        blockId: block.id,
        type: 'body',
        rowIndex: Math.max(0, Math.min(startRowIndex, nextRows.length - 1)),
        columnIndex: Math.max(0, selectedColumnIndex),
      });
      setSelectedTableRange(null);
    };
    const deleteSelectedColumn = () => {
      const startColumnIndex = hasSelectedRange ? selectedRangeBounds.startColumnIndex : selectedColumnIndex;
      const endColumnIndex = hasSelectedRange ? selectedRangeBounds.endColumnIndex : selectedColumnIndex;
      if (startColumnIndex < 0 || columns.length <= 1) return;
      const deleteCount = Math.max(1, endColumnIndex - startColumnIndex + 1);
      if (deleteCount >= columns.length) return;
      const nextColumns = columns.filter((_, index) => (
        index < startColumnIndex || index > endColumnIndex
      ));
      const nextRows = normalizedRows.map(row => row.filter((_, index) => (
        index < startColumnIndex || index > endColumnIndex
      )));
      const nextWidths = columnWidths.filter((_, index) => (
        index < startColumnIndex || index > endColumnIndex
      ));
      persistTableMeta({ columns: nextColumns, rows: nextRows, columnWidths: nextWidths });
      setSelectedTableCell({
        blockId: block.id,
        type: 'body',
        rowIndex: Math.max(0, selectedRowIndex),
        columnIndex: Math.max(0, Math.min(startColumnIndex, nextColumns.length - 1)),
      });
      setSelectedTableRange(null);
    };
    const distributeSelectedColumnWidths = () => {
      const averageWidth = Math.max(80, Math.round(tableWidth / columns.length));
      persistTableMeta({ columnWidths: columns.map(() => averageWidth) });
    };
    const selectWholeTable = () => {
      clearNativeEditorSelection();
      setSelectedBlockId(block.id);
      setAreaBlockSelection([block.id]);
      setSelectedTableCell(null);
      setSelectedTableRange(null);
    };
    const selectTableCell = (rowIndex, columnIndex) => {
      setSelectedBlockId(block.id);
      setSelectedTableCell({ blockId: block.id, type: 'body', rowIndex, columnIndex });
      setSelectedTableRange(null);
    };
    const selectTableHeader = (columnIndex) => {
      setSelectedBlockId(block.id);
      setSelectedTableCell({ blockId: block.id, type: 'header', rowIndex: -1, columnIndex });
      setSelectedTableRange(null);
    };
    const hideTableInlineToolbarOnBlur = () => {
      inlineToolbarHideTimerRef.current = window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (activeElement?.closest?.('[data-inline-text-toolbar="true"]')) return;
        setInlineToolbar(null);
      }, 180);
    };
    const getTableCellFromPoint = (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY);
      const cell = target?.closest?.('[data-document-table-cell="true"]');
      if (!cell || cell.dataset.tableBlockId !== block.id) return null;
      const rowIndex = Number(cell.dataset.rowIndex);
      const columnIndex = Number(cell.dataset.columnIndex);
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
      const type = cell.dataset.cellType === 'header' || rowIndex < 0 ? 'header' : 'body';
      return { type, rowIndex, columnIndex };
    };
    const beginTableCellSelection = (event, type, rowIndex, columnIndex) => {
      if (event.button !== 0) return;
      setSelectedBlockId(block.id);
      setSelectedTableCell({ blockId: block.id, type, rowIndex, columnIndex });
      setSelectedTableRange(null);
      const selectionState = {
        blockId: block.id,
        startRowIndex: rowIndex,
        startColumnIndex: columnIndex,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        cleanup: null,
      };
      const applyRange = (targetCell) => {
        setSelectedTableCell({
          blockId: block.id,
          type: targetCell.type,
          rowIndex: targetCell.rowIndex,
          columnIndex: targetCell.columnIndex,
        });
        setSelectedTableRange({
          blockId: block.id,
          startRowIndex: selectionState.startRowIndex,
          startColumnIndex: selectionState.startColumnIndex,
          endRowIndex: targetCell.rowIndex,
          endColumnIndex: targetCell.columnIndex,
        });
      };
      const handleMouseMove = moveEvent => {
        const targetCell = getTableCellFromPoint(moveEvent.clientX, moveEvent.clientY);
        if (!targetCell) return;
        const movedDistance = Math.hypot(moveEvent.clientX - selectionState.startX, moveEvent.clientY - selectionState.startY);
        const sameCell = targetCell.rowIndex === rowIndex && targetCell.columnIndex === columnIndex;
        if (!selectionState.dragging) {
          if (movedDistance < 6 || sameCell) return;
          selectionState.dragging = true;
        }
        applyRange(targetCell);
        moveEvent.preventDefault();
      };
      const handleMouseUp = () => {
        if (!selectionState.dragging) setSelectedTableRange(null);
        selectionState.cleanup?.();
      };
      selectionState.cleanup = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (tableCellSelectionRef.current === selectionState) tableCellSelectionRef.current = null;
      };
      if (tableCellSelectionRef.current?.cleanup) tableCellSelectionRef.current.cleanup();
      tableCellSelectionRef.current = selectionState;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };
    const beginColumnResize = (event, columnIndex) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = columnWidths[columnIndex] || 160;
      pushEditorUndoSnapshot();
      const handleMouseMove = moveEvent => {
        const nextWidth = Math.max(80, Math.round(startWidth + moveEvent.clientX - startX));
        setEditorBlocks(prev => prev.map(item => {
          if (item.id !== block.id) return item;
          const currentMeta = { ...getDefaultBlockMeta(item.type), ...cloneMeta(item.meta) };
          const nextWidths = columns.map((_, index) => (
            index === columnIndex
              ? nextWidth
              : Math.max(80, Number(currentMeta.columnWidths?.[index]) || columnWidths[index] || 160)
          ));
          return { ...item, meta: { ...currentMeta, columns, rows: normalizedRows, columnWidths: nextWidths } };
        }));
      };
      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        tableResizeRef.current = null;
      };
      if (tableResizeRef.current?.cleanup) tableResizeRef.current.cleanup();
      tableResizeRef.current = {
        cleanup: () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        },
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };
    const menuColumnIndex = hasSelectedRange ? selectedRangeBounds.startColumnIndex : (selectedColumnIndex >= 0 ? selectedColumnIndex : 0);
    const menuRowIndex = hasSelectedRange ? selectedRangeBounds.startRowIndex : (selectedRowIndex >= 0 ? selectedRowIndex : 0);
    const selectedColumnLeft = columnWidths.slice(0, menuColumnIndex).reduce((sum, width) => sum + width, 0);
    const tableMenuLeft = Math.max(12, Math.min(selectedColumnLeft + columnWidths[menuColumnIndex] / 2 + 8, Math.max(12, tableWidth - 260)));
    const tableMenuTop = Math.max(0, Math.min(44 + Math.max(0, menuRowIndex) * 42, 24));
    const renderTableMenuIcon = (icon) => (
      <span style={{ width: 28, minWidth: 28, color: '#7a7a7a', fontSize: 20, lineHeight: 1, textAlign: 'center' }}>{icon}</span>
    );
    const renderTableMenuItem = ({ icon, label, onClick, trailing, danger = false, disabled = false, active = false }) => (
      <button
        type="button"
        disabled={disabled}
        onMouseDown={event => event.preventDefault()}
        onClick={event => {
          event.stopPropagation();
          if (!disabled && onClick) onClick();
        }}
        style={{
          width: '100%',
          border: 0,
          background: active ? '#f0f0f0' : 'transparent',
          color: disabled ? '#b9b9b9' : (danger ? '#333' : '#242424'),
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 42,
          padding: '7px 12px',
          fontSize: 16,
          lineHeight: 1.25,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {renderTableMenuIcon(icon)}
        <span style={{ flex: 1 }}>{label}</span>
        {trailing}
      </button>
    );
    const renderTableSwitch = (checked) => (
      <span style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: checked ? '#6366f1' : '#cfcfcf',
        padding: 3,
        display: 'inline-flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', display: 'block' }} />
      </span>
    );
    const tableMenu = hasSelectedRange ? (
      <div
        data-document-table-menu="true"
        onMouseDown={event => event.preventDefault()}
        style={{
          position: 'absolute',
          left: tableMenuLeft,
          top: tableMenuTop,
          width: 300,
          background: '#fff',
          border: '1px solid #e4e4e7',
          borderRadius: 6,
          boxShadow: '0 14px 36px rgba(15, 23, 42, 0.18)',
          zIndex: 20,
          overflowY: 'auto',
          overflowX: 'hidden',
          maxHeight: 'min(560px, calc(100vh - 180px))',
        }}
      >
        <div style={{ padding: '8px 10px' }}>
          {renderTableMenuItem({
            icon: '☰',
            label: '单元格文字居中',
            active: horizontalCenter,
            trailing: renderTableSwitch(horizontalCenter),
            onClick: () => persistTableMeta({ horizontalCenter: !horizontalCenter }),
          })}
          {renderTableMenuItem({
            icon: '≡',
            label: '单元格垂直居中',
            trailing: renderTableSwitch(verticalCenter),
            onClick: () => persistTableMeta({ verticalCenter: !verticalCenter }),
          })}
          {renderTableMenuItem({ icon: '🖌', label: '颜色', trailing: <span style={{ color: '#9ca3af', fontSize: 26 }}>›</span>, onClick: () => message.info('颜色设置即将支持') })}
          {renderTableMenuItem({ icon: '|||', label: '均分选中列宽', onClick: distributeSelectedColumnWidths })}
        </div>
        <Divider style={{ margin: 0 }} />
        <div style={{ padding: '8px 10px' }}>
          {renderTableMenuItem({ icon: '▭', label: '在上方插入一行', onClick: () => insertRow(menuRowIndex, 'before') })}
          {renderTableMenuItem({ icon: '▭', label: '在下方插入一行', onClick: () => insertRow(menuRowIndex, 'after') })}
          {renderTableMenuItem({ icon: '▯', label: '在左边插入一列', onClick: () => insertColumn(menuColumnIndex, 'before') })}
          {renderTableMenuItem({ icon: '▯', label: '在右边插入一列', onClick: () => insertColumn(menuColumnIndex, 'after') })}
          {renderTableMenuItem({ icon: '▣', label: '合并单元格', disabled: true })}
        </div>
        <Divider style={{ margin: 0 }} />
        <div style={{ padding: '8px 10px' }}>
          {renderTableMenuItem({ icon: '◇', label: '清空选中单元格', onClick: clearSelectedCell })}
          {renderTableMenuItem({ icon: '▭×', label: '删除当前行', disabled: normalizedRows.length <= 1, onClick: deleteSelectedRow })}
          {renderTableMenuItem({ icon: '▯×', label: '删除当前列', disabled: columns.length <= 1, onClick: deleteSelectedColumn })}
        </div>
      </div>
    ) : null;
    return (
      <div style={{ width: '100%' }}>
        <div data-document-table-shell="true" style={{ maxWidth: '100%', position: 'relative', paddingBottom: hasSelectedRange ? 8 : 0, overflow: 'visible' }}>
          {tableMenu}
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table
              onMouseDown={(event) => {
                if (wholeTableSelected && !event.target?.closest?.('[contenteditable="true"]')) {
                  selectWholeTable();
                }
              }}
              style={{ width: tableWidth, maxWidth: 'none', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: isMobile ? 320 : 360 }}
            >
            <colgroup>
              {columnWidths.map((width, index) => <col key={`col-width-${index}`} style={{ width }} />)}
            </colgroup>
            <thead>
              <tr>
                {columns.map((column, columnIndex) => (
                  <th
                    key={`col-${columnIndex}`}
                    data-document-table-cell="true"
                    data-table-block-id={block.id}
                    data-cell-type="header"
                    data-row-index={-1}
                    data-column-index={columnIndex}
                    onMouseDown={event => beginTableCellSelection(event, 'header', -1, columnIndex)}
                    style={{
                      position: 'relative',
                      border: '1px solid #e5e7eb',
                      background: wholeTableSelected || isCellInSelectedRange(-1, columnIndex) ? '#fde2e2' : (selectedCell?.type === 'header' && selectedColumnIndex === columnIndex ? '#eef2ff' : '#f8fafc'),
                      padding: 4,
                      boxShadow: wholeTableSelected ? 'none' : (selectedCell?.type === 'header' && selectedColumnIndex === columnIndex ? 'inset 0 0 0 1px #6366f1' : (isCellInSelectedRange(-1, columnIndex) ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.55)' : 'none')),
                    }}
                  >
                    <InlineRichTextEditor
                      id={`doc-table-cell-input-${block.id}-header--1-${columnIndex}`}
                      value={column}
                      placeholder=""
                      onFocus={() => selectTableHeader(columnIndex)}
                      onChange={value => updateColumn(columnIndex, value)}
                      onMouseUp={event => handleTableCellTextSelection(block, { type: 'header', rowIndex: -1, columnIndex }, event)}
                      onKeyUp={event => handleTableCellTextSelection(block, { type: 'header', rowIndex: -1, columnIndex }, event)}
                      onBlur={hideTableInlineToolbarOnBlur}
                      style={{
                        minHeight: 26,
                        padding: 4,
                        lineHeight: 1.45,
                        fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
                        fontWeight: 600,
                        background: 'transparent',
                        textAlign: horizontalCenter ? 'center' : 'left',
                      }}
                    />
                    <span
                      role="presentation"
                      onMouseDown={event => beginColumnResize(event, columnIndex)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: -4,
                        width: 8,
                        height: '100%',
                        cursor: 'col-resize',
                        zIndex: 3,
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizedRows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, columnIndex) => (
                    (() => {
                      const selectedInRange = isCellInSelectedRange(rowIndex, columnIndex);
                      const activeCell = selectedTableCellIsBody && selectedRowIndex === rowIndex && selectedColumnIndex === columnIndex;
                      return (
                    <td
                      key={`cell-${rowIndex}-${columnIndex}`}
                      data-document-table-cell="true"
                      data-table-block-id={block.id}
                      data-cell-type="body"
                      data-row-index={rowIndex}
                      data-column-index={columnIndex}
                      onMouseDown={event => beginTableCellSelection(event, 'body', rowIndex, columnIndex)}
                      style={{
                        border: '1px solid #e5e7eb',
                        padding: 4,
                        verticalAlign: verticalCenter ? 'middle' : 'top',
                        textAlign: horizontalCenter ? 'center' : 'left',
                        background: wholeTableSelected || selectedInRange ? '#fde2e2' : '#fff',
                        boxShadow: wholeTableSelected ? 'none' : (activeCell ? 'inset 0 0 0 1px #6366f1' : (selectedInRange ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.55)' : 'none')),
                      }}
                    >
                      <InlineRichTextEditor
                        id={`doc-table-cell-input-${block.id}-body-${rowIndex}-${columnIndex}`}
                        value={cell}
                        placeholder=""
                        onFocus={() => selectTableCell(rowIndex, columnIndex)}
                        onChange={value => updateCell(rowIndex, columnIndex, value)}
                        onMouseUp={event => handleTableCellTextSelection(block, { type: 'body', rowIndex, columnIndex }, event)}
                        onKeyUp={event => handleTableCellTextSelection(block, { type: 'body', rowIndex, columnIndex }, event)}
                        onBlur={hideTableInlineToolbarOnBlur}
                        style={{
                          minHeight: 28,
                          padding: 4,
                          lineHeight: 1.55,
                          fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
                          background: 'transparent',
                          textAlign: horizontalCenter ? 'center' : 'left',
                        }}
                      />
                    </td>
                      );
                    })()
                  ))}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderProgressBlock = (block) => {
    const meta = getBlockMeta(block);
    const value = Math.max(0, Math.min(100, Number(meta.value || 0)));
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Input
          value={block.content}
          placeholder="进度名称"
          onChange={event => updateBlock(block.id, { content: event.target.value })}
          style={{ fontWeight: 600 }}
        />
        <Space size={8} style={{ width: '100%' }}>
          <InputNumber min={0} max={100} value={value} onChange={next => updateBlockMeta(block.id, { value: next || 0 })} />
          <div style={{ flex: 1, height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${value}%`, height: '100%', background: '#2563eb' }} />
          </div>
          <Text type="secondary">{value}%</Text>
        </Space>
      </Space>
    );
  };

  const renderColumnsBlock = (block) => {
    const count = getColumnCount(block.type) || 2;
    const meta = getBlockMeta(block);
    const cells = Array.from({ length: count }, (_, index) => meta.cells?.[index] || '');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${count}, minmax(0, 1fr))`, gap: 10 }}>
        {cells.map((cell, index) => (
          <TextArea
            key={`column-${index}`}
            value={cell}
            bordered={false}
            autoSize={{ minRows: 4 }}
            placeholder={`分栏 ${index + 1}`}
            onFocus={() => setSelectedBlockId(block.id)}
            onChange={event => {
              const nextCells = [...cells];
              nextCells[index] = event.target.value;
              updateBlockMeta(block.id, { cells: nextCells });
            }}
            style={{ resize: 'none', background: '#f8fafc', borderRadius: 6, padding: 8, lineHeight: 1.7 }}
          />
        ))}
      </div>
    );
  };

  const renderChartPreview = (content) => {
    const rows = String(content || '').split('\n').slice(1, 6).map(line => {
      const [name, value] = line.split(',');
      return { name: name?.trim(), value: Number(value) || 0 };
    }).filter(item => item.name);
    const max = Math.max(...rows.map(item => item.value), 1);
    return (
      <Space direction="vertical" size={5} style={{ width: '100%' }}>
        {rows.map(item => (
          <div key={item.name} style={{ display: 'grid', gridTemplateColumns: isMobile ? '64px 1fr 40px' : '80px 1fr 44px', gap: 8, alignItems: 'center' }}>
            <Text ellipsis>{item.name}</Text>
            <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((item.value / max) * 100)}%`, height: '100%', background: '#10b981' }} />
            </div>
            <Text type="secondary">{item.value}</Text>
          </div>
        ))}
      </Space>
    );
  };

  const renderMediaBlock = (block) => {
    const meta = getBlockMeta(block);
    const kind = getMediaKind(block.type);
    const url = meta.url || block.content || '';
    const isExternalMedia = ['netease-music', 'bilibili-video', 'tencent-video', 'external-link'].includes(block.type);
    if (kind === 'image' && url && meta.embedOnly) {
      return (
        <img
          src={url}
          alt={meta.filename || block.content || '图片'}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: 520,
            borderRadius: 6,
            objectFit: 'contain',
          }}
        />
      );
    }
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Input
          value={url}
          placeholder={isExternalMedia ? '输入外部链接' : '输入链接，或上传本地文件'}
          onChange={event => {
            const nextUrl = event.target.value;
            updateBlock(block.id, { content: nextUrl, meta: { ...meta, url: nextUrl } });
          }}
        />
        {!isExternalMedia && (
          <Upload
            showUploadList={false}
            accept={mediaAcceptMap[kind] || undefined}
            beforeUpload={(file) => handleMediaUpload(block, file, kind)}
          >
            <Button size="small" icon={<PlusOutlined />}>上传{kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频'}</Button>
          </Upload>
        )}
        {meta.filename && <Text type="secondary">{meta.filename}</Text>}
        {kind === 'image' && url && (
          <img src={url} alt={meta.filename || block.content || '图片'} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 6, border: '1px solid #e5e7eb' }} />
        )}
        {kind === 'video' && url && !isExternalMedia && (
          <video src={url} controls style={{ width: '100%', maxHeight: 360, borderRadius: 6, background: '#111827' }} />
        )}
        {kind === 'audio' && url && !isExternalMedia && (
          <audio src={url} controls style={{ width: '100%' }} />
        )}
        {isExternalMedia && url && (
          <Button href={url} target="_blank" icon={<FileTextOutlined />}>
            打开{blockTypeMap[block.type]?.label || '链接'}
          </Button>
        )}
      </Space>
    );
  };

  const renderAttachmentFileBadge = (attachment) => {
    const ext = String(attachment.file_ext || getFileExt(getAttachmentDisplayName(attachment)) || 'file').slice(0, 4).toUpperCase();
    const mime = String(attachment.mimetype || '').toLowerCase();
    const background = mime.startsWith('image/') ? '#e0f2fe'
      : mime.startsWith('video/') ? '#fee2e2'
        : ext === 'PDF' ? '#fee2e2'
          : ['XLS', 'XLSX', 'CSV'].includes(ext) ? '#dcfce7'
            : ['DOC', 'DOCX'].includes(ext) ? '#dbeafe'
              : ['PPT', 'PPTX'].includes(ext) ? '#ffedd5'
                : '#f1f5f9';
    const color = mime.startsWith('image/') ? '#0369a1'
      : mime.startsWith('video/') ? '#b91c1c'
        : ext === 'PDF' ? '#b91c1c'
          : ['XLS', 'XLSX', 'CSV'].includes(ext) ? '#15803d'
            : ['DOC', 'DOCX'].includes(ext) ? '#1d4ed8'
              : ['PPT', 'PPTX'].includes(ext) ? '#c2410c'
                : '#475569';
    return (
      <span style={{
        width: 42,
        height: 42,
        minWidth: 42,
        borderRadius: 8,
        background,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: ext.length > 3 ? 10 : 12,
        fontWeight: 800,
      }}>
        {ext || 'FILE'}
      </span>
    );
  };

  const renderAttachmentPreviewContent = (attachment) => {
    const normalized = attachment || {};
    const url = getAttachmentUrl(normalized);
    const previewKind = getAttachmentPreviewKind(normalized);
    const canPreview = normalized.preview_status === 'supported' || previewKind !== 'unsupported';
    if (attachmentPreviewState.loading) {
      return <Spin tip="正在加载预览" style={{ width: '100%', padding: '80px 0' }} />;
    }
    if (!canPreview || !url) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前文件暂不支持在线预览，可下载后查看。"
        >
          {normalized.id && (
            <Button icon={<DownloadOutlined />} onClick={() => downloadDocumentAttachment(normalized)}>
              下载文件
            </Button>
          )}
        </Empty>
      );
    }
    if (previewKind === 'image') {
      return (
        <div style={{ textAlign: 'center' }}>
          <img
            src={url}
            alt={getAttachmentDisplayName(normalized)}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 6 }}
          />
        </div>
      );
    }
    if (previewKind === 'video') {
      return <video src={url} controls style={{ width: '100%', maxHeight: '70vh', borderRadius: 6, background: '#111827' }} />;
    }
    if (previewKind === 'pdf' || previewKind === 'text') {
      return (
        <iframe
          title={getAttachmentDisplayName(normalized)}
          src={url}
          style={{ width: '100%', height: attachmentPreviewState.mode === 'side' ? 'calc(100vh - 230px)' : '70vh', border: '1px solid #e5e7eb', borderRadius: 6 }}
        />
      );
    }
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前文件暂不支持在线预览，可下载后查看。">
        {normalized.id && <Button icon={<DownloadOutlined />} onClick={() => downloadDocumentAttachment(normalized)}>下载文件</Button>}
      </Empty>
    );
  };

  const renderAttachmentBlock = (block) => {
    const meta = getBlockMeta(block);
    const attachment = blockMetaToAttachment(meta);
    const displayName = getAttachmentDisplayName(attachment);
    const uploading = attachmentUploadingBlockIds.includes(block.id) || meta.upload_status === 'uploading';
    const uploadPercent = clampUploadPercent(meta.upload_percent, 0, 100);
    const failed = meta.upload_status === 'failed';
    const hasAttachment = Boolean(attachment.id);
    const canEditAttachment = canEditDoc(selectedDoc);
    const actionVisible = isMobile || selectedBlockId === block.id || hoveredBlockId === block.id;
    const previewKind = getAttachmentPreviewKind(attachment);
    const previewable = hasAttachment && (attachment.preview_status === 'supported' || previewKind !== 'unsupported');
    const detailParts = [
      formatFileSize(attachment.size),
      attachment.creator_name ? `上传人：${attachment.creator_name}` : '',
      attachment.created_at ? formatDocumentTimestamp(attachment.created_at) : '',
    ].filter(Boolean);

    const menuItems = [
      { key: 'download', icon: <DownloadOutlined />, label: '下载', disabled: !hasAttachment },
      { key: 'preview-modal', icon: <EyeOutlined />, label: '弹窗预览', disabled: !hasAttachment },
      { key: 'preview-side', icon: <MenuUnfoldOutlined />, label: '右侧预览', disabled: !hasAttachment },
      { key: 'copy-link', icon: <LinkOutlined />, label: '复制链接' },
      { key: 'comment', icon: <CommentOutlined />, label: '评论', disabled: !hasAttachment },
      { type: 'divider' },
      { key: 'rename', icon: <EditOutlined />, label: '重命名', disabled: !canEditAttachment },
      { key: 'replace', icon: <UploadOutlined />, label: '替换文件', disabled: !canEditAttachment || !hasAttachment },
      { key: 'delete', danger: true, icon: <DeleteOutlined />, label: '删除', disabled: !canEditAttachment },
    ];

    if (!hasAttachment && !uploading && !failed) {
      return (
        <Upload.Dragger
          showUploadList={false}
          accept={attachmentAccept}
          beforeUpload={(file) => handleAttachmentBlockUpload(block, file)}
          disabled={!canEditAttachment}
          style={{ background: '#f8fafc', borderRadius: 8 }}
        >
          <Space direction="vertical" size={6}>
            <UploadOutlined style={{ color: '#64748b', fontSize: 18 }} />
            <Text type="secondary">{canEditAttachment ? '拖入或选择附件' : '暂无附件'}</Text>
          </Space>
        </Upload.Dragger>
      );
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        border: `1px solid ${failed ? '#fecaca' : '#e5e7eb'}`,
        borderRadius: 8,
        padding: '8px 10px',
        background: failed ? '#fff1f2' : '#ffffff',
        boxShadow: selectedBlockId === block.id ? '0 0 0 2px rgba(59, 130, 246, 0.08)' : 'none',
      }}>
        {renderAttachmentFileBadge(attachment)}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Text strong ellipsis style={{ maxWidth: '100%' }}>{displayName}</Text>
            {previewable && <Tag color="blue" style={{ marginInlineEnd: 0 }}>可预览</Tag>}
            {uploading && <Tag color="processing" style={{ marginInlineEnd: 0 }}>{`上传中 ${uploadPercent}%`}</Tag>}
            {failed && <Tag color="red" style={{ marginInlineEnd: 0 }}>失败</Tag>}
          </div>
          <Text type={failed ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
            {failed ? (meta.upload_error || '上传失败') : detailParts.join(' · ')}
          </Text>
        </div>
        <Space size={4} style={{ opacity: actionVisible ? 1 : 0.18, transition: 'opacity 0.15s ease' }}>
          {failed && canEditAttachment && (
            <Upload
              showUploadList={false}
              accept={attachmentAccept}
              beforeUpload={(file) => handleAttachmentBlockUpload(block, file)}
            >
              <Tooltip title="重新上传">
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  aria-label="重新上传"
                  onClick={event => event.stopPropagation()}
                />
              </Tooltip>
            </Upload>
          )}
          <Tooltip title="下载文件">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              aria-label="下载文件"
              disabled={!hasAttachment}
              onClick={event => {
                event.stopPropagation();
                downloadDocumentAttachment(attachment);
              }}
            />
          </Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{
              items: menuItems,
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                handleAttachmentMenuAction(block, key);
              },
            }}
          >
            <Button
              size="small"
              icon={<MoreOutlined />}
              aria-label="附件更多操作"
              onClick={event => event.stopPropagation()}
            />
          </Dropdown>
        </Space>
      </div>
    );
  };

  const renderPresentationAttachmentBlock = (block) => {
    const attachment = blockMetaToAttachment(getBlockMeta(block));
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 12,
        background: '#f8fafc',
      }}>
        {renderAttachmentFileBadge(attachment)}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text strong ellipsis style={{ display: 'block', fontSize: isMobile ? 16 : 20 }}>{getAttachmentDisplayName(attachment)}</Text>
          <Text type="secondary" style={{ fontSize: isMobile ? 13 : 15 }}>{formatFileSize(attachment.size)}</Text>
        </div>
        {attachment.id && (
          <Button icon={<DownloadOutlined />} onClick={() => downloadDocumentAttachment(attachment)}>
            下载
          </Button>
        )}
      </div>
    );
  };

  const renderPresentationTableBlock = (block) => {
    const meta = getBlockMeta(block);
    const columns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : [];
    const rows = Array.isArray(meta.rows) && meta.rows.length ? meta.rows : [];
    const columnWidths = columns.map((_, index) => Math.max(80, Number(meta.columnWidths?.[index]) || (isMobile ? 120 : 160)));
    const tableWidth = Math.max(columnWidths.reduce((sum, width) => sum + width, 0), isMobile ? 320 : 560);
    if (!columns.length && !rows.length) {
      return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{block.content}</div>;
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        {block.content && <Text strong style={{ display: 'block', marginBottom: 10, fontSize: isMobile ? 18 : 22 }}>{block.content}</Text>}
        <table style={{ width: tableWidth, maxWidth: 'none', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: isMobile ? 16 : 20 }}>
          {columns.length > 0 && (
            <colgroup>
              {columnWidths.map((width, index) => <col key={`presentation-col-${index}`} style={{ width }} />)}
            </colgroup>
          )}
          {columns.length > 0 && (
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={`${column}-${index}`} style={{ borderBottom: '2px solid #d1d5db', padding: '10px 12px', textAlign: 'left' }}>
                    <InlineHtmlView value={column} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {(row || []).map((cell, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`} style={{ borderBottom: '1px solid #e5e7eb', padding: '10px 12px', verticalAlign: 'top' }}>
                    <InlineHtmlView value={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPresentationMediaBlock = (block) => {
    const meta = getBlockMeta(block);
    const kind = getMediaKind(block.type);
    const url = meta.url || block.content || '';
    const isExternalMedia = ['netease-music', 'bilibili-video', 'tencent-video', 'external-link'].includes(block.type);
    const label = block.content || meta.filename || blockTypeMap[block.type]?.label || '媒体';
    if (kind === 'image' && url) {
      return (
        <div>
          <img src={url} alt={label} style={{ display: 'block', maxWidth: '100%', maxHeight: isMobile ? 320 : 520, objectFit: 'contain', borderRadius: 8 }} />
          {meta.filename && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{meta.filename}</Text>}
        </div>
      );
    }
    if (kind === 'video' && url && !isExternalMedia) {
      return <video src={url} controls style={{ display: 'block', width: '100%', maxHeight: isMobile ? 320 : 520, borderRadius: 8, background: '#111827' }} />;
    }
    if (kind === 'audio' && url && !isExternalMedia) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>{label}</Text>
          <audio src={url} controls style={{ width: '100%' }} />
        </Space>
      );
    }
    return (
      <Space direction="vertical" size={4}>
        <Text strong>{label}</Text>
        {url && <a href={url} target="_blank" rel="noreferrer">{url}</a>}
      </Space>
    );
  };

  const renderCodeCopyButton = (text, style = {}) => (
    <Tooltip title="复制代码">
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        aria-label="复制代码"
        onMouseDown={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={event => handleCopyCodeBlock(event, text)}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 2,
          width: 28,
          height: 28,
          minWidth: 28,
          padding: 0,
          borderRadius: 6,
          color: '#cbd5e1',
          background: 'rgba(15, 23, 42, 0.82)',
          border: '1px solid rgba(148, 163, 184, 0.34)',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.22)',
          ...style,
        }}
      />
    </Tooltip>
  );

  const renderPresentationBlock = (block) => {
    if (hiddenListBlockIds.has(block.id)) return null;
    const meta = getBlockMeta(block);
    const indent = getListIndent(block);
    const blockStyle = {
      fontSize: isMobile ? 18 : 24,
      lineHeight: 1.7,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    };
    const headingMatch = String(block.type || '').match(/heading(\d)/);
    if (headingMatch) {
      const level = Number(headingMatch[1]);
      const heading = headingMeta.map.get(block.id);
      return (
        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          fontSize: isMobile ? (level === 1 ? 32 : level === 2 ? 26 : 22) : (level === 1 ? 46 : level === 2 ? 36 : level === 3 ? 28 : 24),
          lineHeight: 1.2,
          fontWeight: 800,
          color: '#0f172a',
        }}>
          {heading?.number && <span style={{ color: '#64748b', minWidth: isMobile ? 36 : 52 }}>{heading.number}</span>}
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{block.content || blockTypeMap[block.type]?.label}</span>
        </div>
      );
    }
    if (block.type === 'divider') return <Divider style={{ margin: '18px 0', borderColor: '#cbd5e1' }} />;
    if (block.type === 'bullet' || block.type === 'numbered' || block.type === 'fold-list') {
      const presentationIndentWidth = isMobile ? 22 : listIndentWidth;
      const presentationMarkerWidth = isMobile ? 22 : listMarkerBoxWidth;
      const presentationLineHeight = (isMobile ? 18 : 24) * listLineHeight;
      const marker = block.type === 'bullet'
        ? getBulletListMarker(indent)
        : block.type === 'numbered'
          ? numberedListMarkers.get(block.id)
          : null;
      const markerNode = block.type === 'bullet' ? (
        <span style={{ minWidth: presentationMarkerWidth, height: '1.8em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderBulletListMarker(indent, isMobile ? 1 : 1.1)}
        </span>
      ) : (
        <span
          style={{
            minWidth: presentationMarkerWidth,
            height: '1.8em',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: block.type === 'numbered' ? 'flex-end' : 'center',
            color: listMarkerColor,
            fontWeight: block.type === 'fold-list' ? 600 : 500,
          }}
        >
          {block.type === 'fold-list'
            ? (meta.collapsed ? <CaretRightFilled style={{ fontSize: 13, color: listMarkerColor }} /> : <CaretDownFilled style={{ fontSize: 13, color: listMarkerColor }} />)
            : marker}
        </span>
      );
      return (
        <div style={{ ...blockStyle, position: 'relative', paddingLeft: indent * presentationIndentWidth, display: 'flex', gap: 8, lineHeight: listLineHeight }}>
          {renderListGuides(block, {
            top: -4,
            bottom: -4,
            centerY: presentationLineHeight / 2,
            lineOffset: presentationMarkerWidth / 2,
            indentWidth: presentationIndentWidth,
          })}
          {markerNode}
          <InlineHtmlView value={block.content} style={{ fontWeight: block.type === 'fold-list' ? 600 : 400 }} />
        </div>
      );
    }
    if (block.type === 'todo' || block.type === 'fold-todo' || block.type === 'fold-advanced-todo') {
      return (
        <div style={{ ...blockStyle, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Checkbox checked={Boolean(block.checked)} disabled style={{ paddingTop: 5 }} />
          <InlineHtmlView value={block.content} />
        </div>
      );
    }
    if (block.type === 'quote') {
      return <InlineHtmlView as="div" value={block.content} style={{ ...blockStyle, borderLeft: '5px solid #94a3b8', paddingLeft: 18, color: '#475569', fontStyle: 'italic' }} />;
    }
    if (block.type === 'code' || block.type === 'mermaid' || block.type === 'mindmap') {
      return (
        <div style={{ position: 'relative' }}>
          {renderCodeCopyButton(block.content)}
          <pre style={{ margin: 0, padding: '18px 52px 18px 18px', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto', fontSize: isMobile ? 14 : 18, lineHeight: 1.7 }}>{block.content}</pre>
        </div>
      );
    }
    if (block.type === 'emphasis' || block.type === 'marquee') {
      return <InlineHtmlView as="div" value={block.content} style={{ ...blockStyle, padding: '16px 18px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontWeight: 700 }} />;
    }
    if (block.type?.startsWith('fold-heading') || block.type === 'meeting') {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <InlineHtmlView as="div" value={block.content} style={{ ...blockStyle, fontWeight: 700 }} />
          {meta.body && <div style={{ ...blockStyle, color: '#475569' }}>{meta.body}</div>}
        </Space>
      );
    }
    if (getColumnCount(block.type)) {
      const count = getColumnCount(block.type);
      const cells = Array.from({ length: count }, (_, cellIndex) => meta.cells?.[cellIndex] || '');
      return (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${count}, minmax(0, 1fr))`, gap: 14 }}>
          {cells.map((cell, cellIndex) => (
            <div key={`column-${cellIndex}`} style={{ ...blockStyle, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc' }}>{cell}</div>
          ))}
        </div>
      );
    }
    if (block.type === 'table-simple' || block.type?.startsWith('database-')) return renderPresentationTableBlock(block);
    if (block.type === 'chart') {
      return (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {block.content && <Text strong style={{ fontSize: isMobile ? 18 : 22 }}>{inlineHtmlToPlain(block.content).split('\n')[0]}</Text>}
          {renderChartPreview(block.content)}
        </Space>
      );
    }
    if (block.type === 'progress') {
      const value = Math.max(0, Math.min(Number(meta.value) || 0, 100));
      return (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <InlineHtmlView value={block.content} style={{ fontSize: isMobile ? 18 : 24 }} />
          <div style={{ height: 14, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${value}%`, height: '100%', background: '#2563eb' }} />
          </div>
          <Text strong>{value}%</Text>
        </Space>
      );
    }
    if (block.type === 'metric') {
      return (
        <Space direction="vertical" size={6}>
          <Text type="secondary" style={{ fontSize: isMobile ? 16 : 18 }}>{inlineHtmlToPlain(block.content)}</Text>
          <Text strong style={{ fontSize: isMobile ? 42 : 64, lineHeight: 1 }}>{meta.value ?? 0}{meta.unit || ''}</Text>
        </Space>
      );
    }
    if (block.type === 'button' || block.type === 'external-link') {
      return (
        <Button size="large" href={meta.url || block.content || undefined} target={(meta.url || block.content) ? '_blank' : undefined} icon={<RightOutlined />}>
          {inlineHtmlToPlain(block.content) || meta.url || blockTypeMap[block.type]?.label}
        </Button>
      );
    }
    if (block.type === 'attachment') return renderPresentationAttachmentBlock(block);
    if (getMediaKind(block.type)) return renderPresentationMediaBlock(block);
    if (block.type === 'toc') {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {headingMeta.toc.map(item => (
            <div key={item.id} style={{ fontSize: isMobile ? 17 : 22, paddingLeft: (item.level - 1) * 24, color: '#334155' }}>
              {item.number ? `${item.number} ` : ''}{item.title}
            </div>
          ))}
        </Space>
      );
    }
    return <InlineHtmlView as="div" value={block.content} style={blockStyle} />;
  };

  const renderPresentationMode = () => {
    if (!presentationOpen || !selectedDoc) return null;
    return (
      <div
        id="document-presentation-mode"
        ref={presentationRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          background: '#0b1120',
          color: '#0f172a',
        }}
      >
        <div style={{
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: isMobile ? '10px 12px' : '12px 24px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.24)',
        }}>
          <Space size={10} style={{ minWidth: 0 }}>
            <FundProjectionScreenOutlined style={{ color: '#bfdbfe', fontSize: 18 }} />
            <Text ellipsis style={{ color: '#f8fafc', maxWidth: isMobile ? 170 : 520 }}>{editorTitle || selectedDoc.title || '未命名文档'}</Text>
            {!isMobile && <Tag color="blue">{selectedDoc.document_no}</Tag>}
          </Space>
          <Space size={8}>
            <Tooltip title="上一页">
              <Button type="text" aria-label="上一页" disabled={activePresentationSlideIndex <= 0} icon={<LeftOutlined />} onClick={() => movePresentationSlide(-1)} style={{ color: '#e5e7eb' }} />
            </Tooltip>
            <Tag>{activePresentationSlideIndex + 1} / {presentationSlideCount}</Tag>
            <Tooltip title="下一页">
              <Button type="text" aria-label="下一页" disabled={activePresentationSlideIndex >= presentationSlideCount - 1} icon={<RightOutlined />} onClick={() => movePresentationSlide(1)} style={{ color: '#e5e7eb' }} />
            </Tooltip>
            <Tooltip title="退出演示">
              <Button type="text" aria-label="退出演示" icon={<FullscreenExitOutlined />} onClick={closePresentationMode} style={{ color: '#e5e7eb' }} />
            </Tooltip>
          </Space>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: isMobile ? 12 : 28 }}>
          <section style={{
            height: '100%',
            maxWidth: 1180,
            margin: '0 auto',
            overflow: 'auto',
            background: '#ffffff',
            borderRadius: 8,
            padding: isMobile ? 24 : 54,
          }}>
            <Space direction="vertical" size={22} style={{ width: '100%' }}>
              <Space size={8} wrap>
                <Tag color="geekblue">{selectedDoc.current_version || 'V1.0'}</Tag>
                <Tag>{docTypeLabel[selectedDoc.doc_type] || selectedDoc.doc_type}</Tag>
                {selectedDoc.folder_name && <Tag icon={<FolderOutlined />}>{selectedDoc.folder_name}</Tag>}
              </Space>
              <Title level={1} style={{ margin: 0, fontSize: isMobile ? 34 : 52, lineHeight: 1.12 }}>
                {activePresentationSection?.title || editorTitle || selectedDoc.title || '未命名文档'}
              </Title>
              <Divider style={{ margin: '0 0 4px', borderColor: '#e5e7eb' }} />
              {activePresentationSection?.blocks?.length ? (
                <Space direction="vertical" size={18} style={{ width: '100%' }}>
                  {activePresentationSection.blocks.map((block, index) => (
                    <div key={block.id || `${block.type}-${index}`} style={{ background: block.highlight || 'transparent', borderRadius: 8 }}>
                      {renderPresentationBlock(block)}
                    </div>
                  ))}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内容" />
              )}
            </Space>
          </section>
        </div>
      </div>
    );
  };

  const renderBlockInput = (block, index, heading) => {
    const active = selectedBlockId === block.id;
    const placeholder = (() => {
      if (!active) return '';
      if (block.type?.startsWith('heading')) return '输入标题';
      if (block.type === 'paragraph' && isBlankBlock(block)) return '输入 / 选择样式内容';
      return '输入内容';
    })();
    const commonProps = {
      id: `doc-block-input-${block.id}`,
      value: block.content,
      bordered: false,
      autoSize: { minRows: block.type === 'code' ? 3 : 1 },
      placeholder,
      onFocus: () => {
        setSelectedBlockId(block.id);
        clearAreaBlockSelection();
      },
      onChange: valueOrEvent => {
        const nextValue = typeof valueOrEvent === 'string'
          ? valueOrEvent
          : valueOrEvent.target.value;
        updateBlock(block.id, { content: normalizeTransientBlockInput(block, nextValue) });
      },
      onCompositionStart: () => {
        composingBlockIdsRef.current.add(block.id);
      },
      onCompositionEnd: () => {
        composingBlockIdsRef.current.delete(block.id);
      },
      onSelect: event => handleInlineTextSelection(block, event),
      onMouseUp: event => handleInlineTextSelection(block, event),
      onKeyUp: event => handleInlineTextSelection(block, event),
      onBlur: () => {
        inlineToolbarHideTimerRef.current = window.setTimeout(() => {
          const activeElement = document.activeElement;
          if (activeElement?.closest?.('[data-inline-text-toolbar="true"]')) return;
          setInlineToolbar(null);
        }, 180);
      },
      onKeyDown: event => handleBlockKeyDown(event, block, index),
      style: {
        padding: 0,
        resize: 'none',
        lineHeight: block.type === 'code' ? 1.7 : 1.75,
        fontSize: selectedDoc?.small_font_enabled ? 13 : 15,
        background: 'transparent',
      },
    };

    const renderRichTextInput = (props = {}, stylePatch = {}) => (
      <InlineRichTextEditor
        {...commonProps}
        {...props}
        onChange={value => commonProps.onChange(value)}
        onMouseUp={event => handleInlineTextSelection(block, event)}
        onKeyUp={event => handleInlineTextSelection(block, event)}
        onKeyDown={event => handleBlockKeyDown(event, block, index)}
        style={{
          ...commonProps.style,
          ...stylePatch,
          ...(props.style || {}),
        }}
      />
    );

    if (block.type === 'divider') {
      return <Divider style={{ margin: '10px 0' }} />;
    }

    if (block.type === 'toc') return renderTocBlock();
    if (block.type === 'button') return renderButtonBlock(block, commonProps);
    if (block.type === 'table-simple') return renderTableBlock(block);
    if (block.type?.startsWith('database-')) return renderTableBlock(block);
    if (block.type === 'progress') return renderProgressBlock(block);
    if (getColumnCount(block.type)) return renderColumnsBlock(block);
    if (block.type === 'attachment') return renderAttachmentBlock(block);
    if (getMediaKind(block.type) || block.type === 'external-link') return renderMediaBlock(block);
    if (isHierarchicalListBlock(block)) return renderHierarchicalListBlock(block, commonProps);
    if (block.type?.startsWith('fold-')) return renderFoldBlock(block, commonProps);

    if (block.type === 'emphasis' || block.type === 'marquee') {
      return (
        <InlineRichTextEditor
          {...commonProps}
          onChange={value => commonProps.onChange(value)}
          style={{
            ...commonProps.style,
            fontWeight: 700,
            color: block.type === 'marquee' ? '#b91c1c' : '#111827',
            background: block.type === 'marquee' ? '#fff1f2' : '#f8fafc',
            borderRadius: 6,
            padding: '6px 8px',
          }}
        />
      );
    }

    if (block.type === 'chart') {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <TextArea
            {...commonProps}
            autoSize={{ minRows: 4 }}
            placeholder="按 CSV 输入：指标,数值"
            style={{ ...commonProps.style, background: '#f8fafc', borderRadius: 6, padding: 8 }}
          />
          {renderChartPreview(block.content)}
        </Space>
      );
    }

    if (block.type === 'mermaid' || block.type === 'mindmap' || block.type === 'meeting') {
      return (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text type="secondary">{blockTypeMap[block.type]?.label}</Text>
          <TextArea
            {...commonProps}
            autoSize={{ minRows: block.type === 'meeting' ? 3 : 4 }}
            style={{
              ...commonProps.style,
              fontFamily: block.type === 'mermaid' ? "'SFMono-Regular', Consolas, monospace" : undefined,
              background: '#f8fafc',
              borderRadius: 6,
              padding: 8,
            }}
          />
        </Space>
      );
    }

    if (block.type === 'metric') {
      const meta = getBlockMeta(block);
      return (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 120px 80px', gap: 8, alignItems: 'center' }}>
          <Input value={block.content} placeholder="指标名称" onChange={event => updateBlock(block.id, { content: event.target.value })} />
          <InputNumber value={Number(meta.value || 0)} onChange={value => updateBlockMeta(block.id, { value: value || 0 })} style={{ width: '100%' }} />
          <Input value={meta.unit || ''} placeholder="单位" onChange={event => updateBlockMeta(block.id, { unit: event.target.value })} />
        </div>
      );
    }

    if (block.type?.startsWith('heading')) {
      const level = Number(block.type.replace('heading', ''));
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {heading?.number && <Text type="secondary" style={{ paddingTop: 4, minWidth: 28 }}>{heading.number}</Text>}
          <InlineRichTextEditor
            {...commonProps}
            onChange={value => commonProps.onChange(value)}
            style={{
              ...commonProps.style,
              fontSize: isMobile
                ? (level === 1 ? 24 : level === 2 ? 21 : level === 3 ? 18 : 16)
                : (level === 1 ? 30 : level === 2 ? 24 : level === 3 ? 19 : 16),
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          />
        </div>
      );
    }

    if (block.type === 'todo') {
      return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Checkbox
            checked={Boolean(block.checked)}
            onChange={event => updateBlock(block.id, { checked: event.target.checked })}
            style={{ paddingTop: 4 }}
          />
          <InlineRichTextEditor {...commonProps} onChange={value => commonProps.onChange(value)} />
        </div>
      );
    }

    if (block.type === 'quote') {
      return (
        <div style={{ borderLeft: '3px solid #94a3b8', paddingLeft: 12 }}>
          <InlineRichTextEditor
            {...commonProps}
            onChange={value => commonProps.onChange(value)}
            style={{
              ...commonProps.style,
              color: '#475569',
              fontStyle: 'italic',
            }}
          />
        </div>
      );
    }

    if (block.type === 'code') {
      return (
        <div style={{ position: 'relative' }}>
          {renderCodeCopyButton(block.content, {
            top: 7,
            right: 7,
            color: '#dbeafe',
            background: 'rgba(30, 41, 59, 0.92)',
          })}
          <TextArea
            {...commonProps}
            style={{
              ...commonProps.style,
              fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
              background: '#0f172a',
              color: '#e2e8f0',
              borderRadius: 8,
              padding: '12px 50px 12px 12px',
            }}
          />
        </div>
      );
    }

    if (block.type === 'page') {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '8px 10px',
          background: '#f8fafc',
        }}>
          <FileTextOutlined style={{ color: '#64748b' }} />
          <InlineRichTextEditor
            {...commonProps}
            placeholder={active ? '页面标题' : ''}
            onChange={value => commonProps.onChange(value)}
            style={{ ...commonProps.style, fontWeight: 600 }}
          />
        </div>
      );
    }

    return <InlineRichTextEditor {...commonProps} onChange={value => commonProps.onChange(value)} />;
  };

  const renderAppendBlockShortcut = () => {
    const visibleBlocks = editorBlocks.filter(block => !hiddenListBlockIds.has(block.id));
    const lastVisibleBlock = visibleBlocks[visibleBlocks.length - 1];
    if (lastVisibleBlock?.type === 'paragraph' && isBlankBlock(lastVisibleBlock)) return null;

    return (
      <div
        onMouseEnter={() => setHoveredBlockId(null)}
        style={{
          position: 'relative',
          minHeight: 34,
          padding: isMobile ? '5px 6px' : '3px 8px 3px 0',
          marginTop: 2,
        }}
      >
        <div style={{
          position: 'absolute',
          left: isMobile ? -24 : -32,
          top: 6,
          width: 24,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 2,
        }}>
          <Tooltip title="添加内容" placement="left">
            <Button
              type="text"
              size="small"
              icon={<BlockAddIcon />}
              aria-label="添加内容"
              onMouseDown={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={event => {
                event.stopPropagation();
                appendBlankBlockAtEnd({ openMenu: true });
              }}
              style={{
                width: 24,
                height: 24,
                minWidth: 24,
                color: '#6b7280',
                background: 'transparent',
              }}
            />
          </Tooltip>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="继续输入"
          onMouseDown={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => appendBlankBlockAtEnd()}
          onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            appendBlankBlockAtEnd({ openMenu: event.key === ' ' });
          }}
          style={{
            minHeight: 28,
            borderRadius: 6,
            cursor: 'text',
          }}
        />
      </div>
    );
  };

  const renderEditorBlock = (block, index) => {
    if (hiddenListBlockIds.has(block.id)) return null;
    const menuOpen = openBlockMenuId === block.id;
    const blockSelected = selectedAreaBlockIds.includes(block.id);
    const selectedVisibleBlockIds = selectedAreaBlockIds.filter(id => !hiddenListBlockIds.has(id));
    const multiBlockSelected = selectedVisibleBlockIds.length > 1;
    const groupHandleBlockId = multiBlockSelected ? selectedVisibleBlockIds[0] : null;
    const canShowGroupHandle = !multiBlockSelected || block.id === groupHandleBlockId || menuOpen;
    const blockFocused = selectedBlockId === block.id;
    const handleVisible = canShowGroupHandle && (isMobile || menuOpen || blockSelected || blockFocused || hoveredBlockId === block.id);
    const heading = headingMeta.map.get(block.id);
    const comments = getBlockInlineComments(block);
    const commentsOpen = activeCommentBlockId === block.id && comments.length > 0;
    const blankParagraph = block.type === 'paragraph' && isBlankBlock(block);
    const blankAddVisible = isMobile || menuOpen || blockSelected || hoveredBlockId === block.id;
    const blockHandleVisible = blankParagraph ? blankAddVisible : handleVisible;
    const hierarchicalListBlock = isHierarchicalListBlock(block);
    const handleIcon = blankParagraph ? <BlockAddIcon /> : <BlockHandleIcon />;
    const handleLabel = blankParagraph ? '添加各种样式内容' : '块菜单';
    const handleTooltip = blankParagraph
      ? '点击 添加各种样式内容\n拖拽 可移动位置'
      : '点击 打开菜单\n拖拽 可移动位置';
    return (
      <div
        id={`doc-block-${block.id}`}
        data-doc-block-id={block.id}
        key={block.id}
        onClick={() => {
          if (suppressEditorClickRef.current) return;
          setSelectedBlockId(block.id);
          const currentSelection = selectedAreaBlockIdsRef.current.length ? selectedAreaBlockIdsRef.current : selectedAreaBlockIds;
          if (!currentSelection.includes(block.id)) {
            clearAreaBlockSelection();
          }
        }}
        onMouseEnter={() => setHoveredBlockId(block.id)}
        onMouseLeave={() => setHoveredBlockId(prev => (prev === block.id ? null : prev))}
        style={{
          position: 'relative',
          border: blockSelected || menuOpen ? `1px solid ${blockActionSelectedBorder}` : '1px solid transparent',
          background: commentsOpen ? '#f8fbff' : (blockSelected || menuOpen ? blockActionSelectedBackground : (block.highlight || 'transparent')),
          borderRadius: 6,
          padding: hierarchicalListBlock ? (isMobile ? '1px 6px' : '0 8px 0 0') : (isMobile ? '5px 6px' : '3px 8px 3px 0'),
          marginBottom: hierarchicalListBlock ? 0 : (isMobile ? 4 : 2),
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
          <div style={{
            width: 24,
            minWidth: 24,
            display: 'flex',
            justifyContent: 'center',
            paddingTop: blankParagraph ? 0 : (block.type?.startsWith('heading') ? 5 : 2),
            zIndex: 2,
          }}>
            <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{handleTooltip}</span>} placement="left">
              <Dropdown
                trigger={['click']}
                open={menuOpen}
                overlayStyle={{
                  width: isMobile ? 300 : 340,
                  maxHeight: 'min(560px, calc(100vh - 96px))',
                  overflowY: 'hidden',
                  zIndex: 2600,
                }}
                overlayClassName="document-block-menu-dropdown"
                dropdownRender={(menu) => (
                  <div
                    onMouseDown={event => event.stopPropagation()}
                    onClick={event => event.stopPropagation()}
                    style={{
                      width: isMobile ? 300 : 340,
                      maxHeight: 'min(560px, calc(100vh - 96px))',
                      overflow: 'hidden',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
                      color: '#1f2937',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px', color: '#374151', fontWeight: 500 }}>
                      <ReloadOutlined />
                      <span>{blankParagraph ? '添加内容' : '转换为'}</span>
                    </div>
                    {renderConvertBlockTypePanel(block)}
                    <Divider style={{ margin: '4px 0' }} />
                    <div style={{ background: '#fff' }}>{menu}</div>
                  </div>
                )}
                onOpenChange={(open) => {
                  if (open) {
                    if (Date.now() < suppressBlockMenuOpenUntilRef.current) {
                      setOpenBlockMenuId(null);
                      return;
                    }
                    captureBlockMenuTargetIds(block.id);
                    setOpenBlockMenuId(block.id);
                    return;
                  }
                  pendingBlockMenuTargetIdsRef.current = [];
                  if (openBlockMenuId === block.id && !activeBlockMenuTargetIdsRef.current.includes(block.id)) {
                    activeBlockMenuTargetIdsRef.current = [];
                    setBlockMenuTargetIds([]);
                  }
                  setOpenBlockMenuId(prev => (prev === block.id ? null : prev));
                }}
                placement="bottomLeft"
                menu={{
                  items: buildBlockMenuItems(block, blockMenuTargetIds),
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    let targetIds = [];
                    if (blockMenuTargetIds.includes(block.id)) {
                      targetIds = [...blockMenuTargetIds];
                    } else if (activeBlockMenuTargetIdsRef.current.includes(block.id)) {
                      targetIds = [...activeBlockMenuTargetIdsRef.current];
                    } else {
                      targetIds = captureBlockMenuTargetIds(block.id);
                    }
                    setOpenBlockMenuId(null);
                    handleBlockMenuAction(block, key, targetIds);
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={handleIcon}
                  aria-label={handleLabel}
                  onMouseDown={event => {
                    if (blankParagraph) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    event.stopPropagation();
                    startBlockHandleSelection(event, block.id);
                  }}
                  onClick={event => {
                    event.stopPropagation();
                    if (Date.now() < suppressBlockMenuOpenUntilRef.current) return;
                    if (blankParagraph) {
                      captureBlockMenuTargetIds(block.id);
                      setOpenBlockMenuId(block.id);
                      return;
                    }
                    if (event.metaKey || event.ctrlKey || event.shiftKey) {
                      selectBlockFromHandle(event, block.id);
                      return;
                    }
                    captureBlockMenuTargetIds(block.id);
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    opacity: blockHandleVisible ? 1 : 0,
                    pointerEvents: blockHandleVisible ? 'auto' : 'none',
                    color: '#6b7280',
                    background: menuOpen ? '#eef2ff' : 'transparent',
                  }}
                />
              </Dropdown>
            </Tooltip>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {renderBlockInput(block, index, heading)}
            {renderInlineCommentHints(block)}
            {renderInlineCommentPanel(block)}
          </div>
        </div>
        {comments.length > 0 && !commentsOpen && (
          <Tooltip title={commentsOpen ? '收起评论' : '展开评论'}>
            <Button
              type={commentsOpen ? 'primary' : 'default'}
              size="small"
              aria-label={`${comments.length} 条评论`}
              onClick={event => {
                event.stopPropagation();
                setActiveCommentBlockId(prev => (prev === block.id ? null : block.id));
              }}
              style={{
                position: 'absolute',
                top: 3,
                right: 4,
                minWidth: 24,
                width: 24,
                height: 24,
                padding: 0,
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {comments.length}
            </Button>
          </Tooltip>
        )}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      gap: isMobile ? 0 : 16,
      height: isMobile ? 'auto' : 'calc(100vh - 120px)',
      minHeight: isMobile ? 'calc(100vh - 80px)' : 640,
      flexDirection: 'row',
      overflow: isMobile ? 'visible' : 'hidden',
    }}>
      {showDocumentLibrary && (
      <aside style={{
        width: isMobile ? '100%' : (isFolderSidebarCollapsed ? 32 : 340),
        minWidth: isMobile ? '100%' : (isFolderSidebarCollapsed ? 32 : 320),
        borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
        paddingRight: isMobile ? 0 : (isFolderSidebarCollapsed ? 0 : 16),
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease, padding 0.2s ease',
      }}>
        <div
          style={{
            flex: '0 0 auto',
            position: isMobile ? 'static' : 'sticky',
            top: 0,
            zIndex: 2,
            background: '#fff',
            paddingBottom: isFolderSidebarCollapsed ? 0 : 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Space size={8} align="center" style={{ minWidth: 0 }}>
              {!isMobile && (
                <Tooltip title={isFolderSidebarCollapsed ? '展开文档目录' : '收起文档目录'}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={isFolderSidebarCollapsed ? '展开文档目录' : '收起文档目录'}
                    aria-expanded={!isFolderSidebarCollapsed}
                    icon={isFolderSidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => setFolderSidebarCollapsed(prev => !prev)}
                    style={{
                      width: 32,
                      height: 32,
                      color: '#6b7280',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '0 0 auto',
                    }}
                  />
                </Tooltip>
              )}
              {!isFolderSidebarCollapsed && <Title level={4} style={{ margin: 0 }}>文档中心</Title>}
            </Space>
            {!isFolderSidebarCollapsed && (
              <Space size={6}>
                <Tooltip title="刷新">
                  <Button icon={<ReloadOutlined />} onClick={() => { loadFolders(); loadDocuments(); loadFolderTreeDocuments(); }} />
                </Tooltip>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建</Button>
              </Space>
            )}
          </div>
        </div>

          {!isFolderSidebarCollapsed && (
            <div style={{ flex: 1, minHeight: 0, overflowY: isMobile ? 'visible' : 'auto' }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Select
                value={domainFilter}
                options={domainOptions}
                onChange={(value) => {
                  setDomainFilter(value);
                  setSelectedFolderId(null);
                  setSopOnly(false);
                  if (isMobile) setMobileLibraryVisible(true);
                }}
                style={{ width: '100%' }}
              />

              <Input.Search
                allowClear
                placeholder="搜索标题、编号、正文"
                value={keyword}
                onChange={event => {
                  setKeyword(event.target.value);
                  if (isMobile) setMobileLibraryVisible(true);
                }}
              />

              <Space size={8} wrap>
                <Button
                  type={sopOnly ? 'primary' : 'default'}
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => {
                    setSopOnly(!sopOnly);
                    setSelectedFolderId(null);
                    if (isMobile) setMobileLibraryVisible(true);
                  }}
                >
                  SOP 总库
                </Button>
                <Button size="small" icon={<FolderOutlined />} onClick={() => setTemplateOpen(true)}>初始化目录</Button>
              </Space>

              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>目录</Text>
                {folderTree.length ? (
                  <Tree
                    showIcon
                    expandedKeys={folderTreeExpandedKeys}
                    selectedKeys={selectedTreeKeys}
                    treeData={folderTree}
                    switcherIcon={({ isLeaf }) => {
                      if (isLeaf) return null;
                      return <DownOutlined />;
                    }}
                    onExpand={(keys) => setFolderTreeExpandedKeys(keys)}
                    onRightClick={openTreeDocContextMenu}
                    onSelect={(keys, info) => {
                      const key = keys[0] || info?.node?.key;
                      if (typeof key === 'string' && key.startsWith('folder-')) {
                        setSelectedFolderId(Number(key.replace('folder-', '')));
                        setSopOnly(false);
                        if (isMobile) setMobileLibraryVisible(true);
                        setFolderTreeExpandedKeys(prev => (prev.includes(key) ? prev : [...prev, key]));
                      } else if (typeof key === 'string' && key.startsWith('document-')) {
                        const documentId = Number(key.replace('document-', ''));
                        const folderId = info?.node?.folderId;
                        if (folderId) {
                          const folderKey = `folder-${folderId}`;
                          setSelectedFolderId(Number(folderId));
                          setFolderTreeExpandedKeys(prev => (prev.includes(folderKey) ? prev : [...prev, folderKey]));
                          setSopOnly(false);
                        }
                        openDocumentTab(getDocumentSummaryById(documentId) || documentId);
                      }
                    }}
                    style={{ marginTop: 8, background: 'transparent' }}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无目录" />
                )}
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>文档</Text>
                <Spin spinning={loading}>
                  <List
                    dataSource={documents}
                    renderItem={renderDocItem}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文档" /> }}
                    style={{ marginTop: 8 }}
                  />
                </Spin>
                <Dropdown
                  open={docContextMenu.open}
                  trigger={[]}
                  overlayClassName="document-context-menu-dropdown"
                  onOpenChange={(open) => {
                    if (!open) closeDocContextMenu();
                  }}
                  menu={{
                    onClick: handleDocContextAction,
                    items: [
                      { key: 'copy-link', icon: <LinkOutlined />, label: '复制页面链接' },
                      { key: 'move', icon: <FolderOpenOutlined />, label: '移动到' },
                      {
                        key: 'edit-properties',
                        icon: <EditOutlined />,
                        label: '编辑文档属性',
                        disabled: !canManageDoc(docContextMenu.doc),
                      },
                    ],
                  }}
                >
                  <span style={{
                    position: 'fixed',
                    pointerEvents: 'none',
                    left: docContextMenu.x,
                    top: docContextMenu.y,
                    width: 1,
                    height: 1,
                  }} />
                </Dropdown>
              </div>
            </Space>
            </div>
          )}
      </aside>
      )}

      {showDocumentEditor && (
      <main style={{ flex: 1, minWidth: 0, width: '100%', overflow: isMobile ? 'visible' : 'auto' }}>
        {!isMobile && renderDocTabs()}
        {!selectedDoc ? (
          <div style={{
            minHeight: isMobile ? 'calc(100vh - 96px)' : '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed #d9d9d9',
            borderRadius: 8,
          }}>
            {detailLoading || selectedDocId ? (
              <Spin tip="正在打开文档" />
            ) : (
              <Empty description={shareLinkError?.message || '选择或新建一篇文档'}>
                {shareLinkError ? (
                  <Button
                    onClick={() => {
                      setShareLinkError(null);
                      clearActiveDocument();
                      if (isMobile) setMobileLibraryVisible(true);
                    }}
                  >
                    返回文档中心
                  </Button>
                ) : (
                  <Space>
                    {isMobile && <Button icon={<LeftOutlined />} onClick={backToMobileLibrary}>文档列表</Button>}
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建文档</Button>
                  </Space>
                )}
              </Empty>
            )}
          </div>
        ) : (
          <Spin spinning={detailLoading}>
            <div style={{
              maxWidth: isMobile ? '100%' : getEditorShellMaxWidth(selectedDoc, tocOpen),
              margin: isMobile || isFolderSidebarCollapsed ? '0' : '0 auto',
              padding: isMobile ? '0 0 24px' : '4px 12px',
            }}>
              {isMobile && (
                <div style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 6,
                  margin: '-12px -12px 12px',
                  padding: '8px 12px',
                  background: '#fff',
                  borderBottom: '1px solid #eef2f7',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Button type="text" icon={<LeftOutlined />} onClick={backToMobileLibrary} aria-label="返回文档列表" style={{ flex: '0 0 auto' }} />
                    <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                      {editorTitle || selectedDoc.title || '未命名文档'}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 8, paddingBottom: 2 }}>
                    <Button
                      size="small"
                      icon={<MenuOutlined />}
                      onClick={toggleTocPanel}
                    >
                      目录
                    </Button>
                    <Dropdown
                      trigger={['click']}
                      open={pageMenuOpen}
                      onOpenChange={setPageMenuOpen}
                      dropdownRender={renderPageMenu}
                    >
                      <Button size="small" icon={<MoreOutlined />}>页面</Button>
                    </Dropdown>
                    <Button size="small" icon={<FundProjectionScreenOutlined />} onClick={openPresentationMode}>演示</Button>
                    <Button size="small" icon={<UserAddOutlined />} onClick={openShare}>分享</Button>
                    <Button size="small" icon={<HistoryOutlined />} onClick={openChangeLogs}>历史</Button>
                    <Button
                      size="small"
                      icon={selectedDoc.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
                      onClick={() => toggleFavorite(selectedDoc)}
                    >
                      收藏
                    </Button>
                  </div>
                </div>
              )}

              {!isMobile && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <Space direction="vertical" size={4} style={{ minWidth: 0, flex: 1 }}>
                  <Space size={[8, 8]} wrap>
                    <Tag color="geekblue">{selectedDoc.document_no}</Tag>
                    <Tag>{selectedDoc.current_version || 'V1.0'}</Tag>
                    <Tag color="cyan">{selectedDoc.access_summary?.label || '仅自己'}</Tag>
                    {selectedDocDomainTag && <Tag>{selectedDocDomainTag}</Tag>}
                    {selectedDocProjectGroupTag && selectedDocProjectGroupTag !== selectedDocDomainTag && <Tag>{selectedDocProjectGroupTag}</Tag>}
                    {selectedDocDepartmentTag && <Tag>{selectedDocDepartmentTag}</Tag>}
                    {selectedDocTypeTag && <Tag>{selectedDocTypeTag}</Tag>}
                    {selectedDoc.folder_name && <Tag icon={<FolderOutlined />}>{selectedDoc.folder_name}</Tag>}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    创建人：{selectedDoc.created_by_name || '-'} · 最后编辑：{selectedDoc.updated_by_name || selectedDoc.created_by_name || '-'} · {formatDocumentTimestamp(selectedDoc.updated_at)}
                    {autoSaving && ' · 自动保存中'}
                  </Text>
                </Space>
                <Space wrap size={6}>
                  <Tooltip title="目录">
                    <span>
                      <Button
                        type={tocOpen ? 'primary' : 'default'}
                        icon={<MenuOutlined />}
                        onClick={toggleTocPanel}
                        aria-label="目录"
                      />
                    </span>
                  </Tooltip>
                  <Tooltip title="页面">
                    <span>
                      <Dropdown
                        trigger={['click']}
                        open={pageMenuOpen}
                        onOpenChange={setPageMenuOpen}
                        dropdownRender={renderPageMenu}
                      >
                        <Button icon={<MoreOutlined />} aria-label="页面" />
                      </Dropdown>
                    </span>
                  </Tooltip>
                  <Tooltip title="演示模式">
                    <Button icon={<FundProjectionScreenOutlined />} onClick={openPresentationMode} aria-label="演示模式" />
                  </Tooltip>
                  <Tooltip title={`添加分享人 · ${selectedDoc.access_summary?.label || '仅自己'}`}>
                    <Button icon={<UserAddOutlined />} onClick={openShare} aria-label={`添加分享人 · ${selectedDoc.access_summary?.label || '仅自己'}`} />
                  </Tooltip>
                  <Tooltip title="改动历史">
                    <Button icon={<HistoryOutlined />} onClick={openChangeLogs} aria-label="改动历史" />
                  </Tooltip>
                  <Tooltip title={selectedDoc.is_favorite ? '取消收藏' : '收藏'}>
                    <Button
                      icon={selectedDoc.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
                      onClick={() => toggleFavorite(selectedDoc)}
                      aria-label={selectedDoc.is_favorite ? '取消收藏' : '收藏'}
                    />
                  </Tooltip>
                </Space>
              </div>}

              <Input
                value={editorTitle}
                onChange={event => {
                  pushEditorUndoSnapshot();
                  setEditorTitle(event.target.value);
                }}
                placeholder="文档标题"
                style={{
                  border: 'none',
                  boxShadow: 'none',
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 700,
                  padding: isMobile ? '4px 0 8px' : '8px 0',
                  marginBottom: isMobile ? 6 : 8,
                }}
              />

              <div style={{
                display: 'flex',
                gap: isMobile ? 16 : 32,
                alignItems: 'flex-start',
                flexDirection: isMobile ? 'column' : 'row',
              }}>
                <section
                  id="document-editor-blocks"
                  onMouseDown={handleEditorAreaMouseDown}
                  onPaste={handleEditorPaste}
                  onDragOver={handleEditorDragOver}
                  onDragLeave={handleEditorDragLeave}
                  onDrop={handleEditorDrop}
                  style={{
                  flex: 1,
                  minWidth: 0,
                  maxWidth: isMobile ? '100%' : getEditorMaxWidth(selectedDoc),
                  width: '100%',
                  position: 'relative',
                  paddingBottom: isMobile ? 120 : 96,
                  minHeight: isMobile ? 'calc(100vh - 260px)' : 420,
                }}>
                  {attachmentDragOver && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 30,
                      pointerEvents: 'none',
                      border: '2px dashed #3b82f6',
                      borderRadius: 10,
                      background: 'rgba(239, 246, 255, 0.72)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                      paddingTop: 28,
                      color: '#1d4ed8',
                      fontWeight: 600,
                    }}>
                      松开上传附件
                    </div>
                  )}
                  {editorBlocks.map((block, index) => renderEditorBlock(block, index))}
                  {renderAppendBlockShortcut()}
                </section>
                {renderTocPanel()}
              </div>
              {renderInlineTextToolbar()}
            </div>
          </Spin>
        )}
      </main>
      )}

      <Modal
        title="共享文档"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={saveShares}
        okText="保存共享"
        cancelText="取消"
        confirmLoading={shareSaving}
        destroyOnClose
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        {renderShareSelector()}
      </Modal>

      {renderChangeLogDrawer()}

      {renderPresentationMode()}

      <input
        ref={replaceAttachmentInputRef}
        type="file"
        accept={attachmentAccept}
        style={{ display: 'none' }}
        onChange={handleReplaceAttachmentInputChange}
      />

      <Modal
        title={getAttachmentDisplayName(attachmentPreviewState.attachment || {})}
        open={attachmentPreviewState.open && attachmentPreviewState.mode === 'modal'}
        onCancel={() => setAttachmentPreviewState(prev => ({ ...prev, open: false }))}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} disabled={!attachmentPreviewState.attachment?.id} onClick={() => downloadDocumentAttachment(attachmentPreviewState.attachment)}>
            下载文件
          </Button>,
          <Button key="close" type="primary" onClick={() => setAttachmentPreviewState(prev => ({ ...prev, open: false }))}>
            关闭
          </Button>,
        ]}
        width={isMobile ? '100%' : 920}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        destroyOnClose
      >
        {renderAttachmentPreviewContent(attachmentPreviewState.attachment)}
      </Modal>

      <Drawer
        title={getAttachmentDisplayName(attachmentPreviewState.attachment || {})}
        placement="right"
        open={attachmentPreviewState.open && attachmentPreviewState.mode === 'side'}
        onClose={() => setAttachmentPreviewState(prev => ({ ...prev, open: false }))}
        width={isMobile ? '92vw' : 560}
        extra={(
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!attachmentPreviewState.attachment?.id}
            onClick={() => downloadDocumentAttachment(attachmentPreviewState.attachment)}
          >
            下载
          </Button>
        )}
        destroyOnClose
      >
        {renderAttachmentPreviewContent(attachmentPreviewState.attachment)}
      </Drawer>

      <Modal
        title="重命名附件"
        open={Boolean(attachmentRenameTarget)}
        onCancel={() => {
          setAttachmentRenameTarget(null);
          setAttachmentRenameValue('');
        }}
        onOk={saveAttachmentRename}
        okText="保存"
        cancelText="取消"
        confirmLoading={attachmentRenameSaving}
        destroyOnClose
      >
        <Input
          value={attachmentRenameValue}
          placeholder="附件名称"
          onChange={event => setAttachmentRenameValue(event.target.value)}
          onPressEnter={saveAttachmentRename}
        />
      </Modal>

      <Drawer
        title="附件评论"
        placement="right"
        open={attachmentCommentState.open}
        onClose={() => setAttachmentCommentState(prev => ({ ...prev, open: false }))}
        width={isMobile ? '92vw' : 420}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {attachmentCommentState.attachment && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc' }}>
              {renderAttachmentFileBadge(attachmentCommentState.attachment)}
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ display: 'block' }}>{getAttachmentDisplayName(attachmentCommentState.attachment)}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatFileSize(attachmentCommentState.attachment.size)}</Text>
              </div>
            </div>
          )}
          <Spin spinning={attachmentCommentState.loading}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {attachmentCommentState.comments.length ? attachmentCommentState.comments.map(comment => (
                <div key={comment.id} style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: 10, background: '#fff' }}>
                  <Space size={8} align="start">
                    <Avatar size={26} style={{ background: '#1677ff' }}>{(comment.created_by_name || '用').slice(0, 1)}</Avatar>
                    <div style={{ minWidth: 0 }}>
                      <Text strong style={{ fontSize: 13 }}>{comment.created_by_name || '匿名用户'}</Text>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{formatDocumentTimestamp(comment.created_at)}</Text></div>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>{comment.content}</div>
                    </div>
                  </Space>
                </div>
              )) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论" />
              )}
            </Space>
          </Spin>
          <Divider style={{ margin: '4px 0' }} />
          <TextArea
            value={attachmentCommentDraft}
            disabled={!canEditDoc(selectedDoc)}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder={canEditDoc(selectedDoc) ? '输入评论' : '你没有评论权限'}
            onChange={event => setAttachmentCommentDraft(event.target.value)}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveAttachmentComment();
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              disabled={!canEditDoc(selectedDoc)}
              loading={attachmentCommentState.saving}
              onClick={saveAttachmentComment}
            >
              评论
            </Button>
          </div>
        </Space>
      </Drawer>

      <Drawer
        title="标题目录"
        placement="right"
        open={isMobile && mobileTocOpen}
        onClose={() => setMobileTocOpen(false)}
        width={isMobile ? '86vw' : 360}
        styles={{ body: { padding: 14 } }}
      >
        {renderTocContent({ compact: true })}
      </Drawer>

      <Modal
        title="移动到"
        open={moveFolderOpen}
        onCancel={() => {
          setMoveFolderOpen(false);
          setMoveFolderDoc(null);
        }}
        onOk={handleMoveFolder}
        okText="移动"
        cancelText="取消"
        confirmLoading={moveFolderSaving}
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
        okButtonProps={{
          disabled: !moveFolderId || Number(moveFolderId) === Number((moveFolderDoc || selectedDoc)?.folder_id),
        }}
        destroyOnClose
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text type="secondary">选择目标文件夹后，当前文档会移动到该目录下。</Text>
          <Select
            showSearch
            placeholder="选择目标文件夹"
            value={moveFolderId || undefined}
            onChange={setMoveFolderId}
            optionFilterProp="label"
            options={folders.map(folder => ({
              value: Number(folder.id),
              label: getFolderPathLabel(folder),
              disabled: Number(folder.id) === Number((moveFolderDoc || selectedDoc)?.folder_id),
            }))}
            style={{ width: '100%' }}
            notFoundContent="暂无可移动的文件夹"
          />
        </Space>
      </Modal>

      <Modal
        title={editingPropertyDoc ? '编辑文档' : '新建文档'}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setEditingPropertyDoc(null);
        }}
        onOk={handleCreate}
        okText={editingPropertyDoc ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={propertySaving}
        destroyOnClose
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入文档标题" />
          </Form.Item>
          <Form.Item name="domain" label="归属域" rules={[{ required: true, message: '请选择归属域' }]}>
            <Select options={domainOptions.filter(item => item.value !== 'all')} />
          </Form.Item>
          <Form.Item name="project_group_id" label="项目组">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={projectGroups.map(group => ({ value: group.id, label: `${group.name}${group.code ? ` (${group.code})` : ''}` }))}
            />
          </Form.Item>
          <Form.Item name="department_key" label="部门">
            <Select options={departmentOptions} />
          </Form.Item>
          <Form.Item name="folder_id" label="文件夹">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={folders.map(folder => ({
                value: folder.id,
                label: `${domainLabel[folder.domain] || folder.domain} / ${folder.project_group_name || '未关联项目组'} / ${departmentLabel[folder.department_key] || folder.department_key} / ${folder.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="doc_type" label="文档类型">
            <Select options={docTypeOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="初始化部门目录模板"
        open={templateOpen}
        onCancel={() => setTemplateOpen(false)}
        onOk={handleApplyTemplate}
        okText="初始化"
        cancelText="取消"
        destroyOnClose
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Form form={templateForm} layout="vertical" initialValues={{ domain: domainFilter === 'all' ? 'domestic_project' : domainFilter, departments: ['PM', 'PD', 'BD', 'OPS', 'ADS'] }}>
          <Form.Item name="domain" label="归属域" rules={[{ required: true, message: '请选择归属域' }]}>
            <Select options={domainOptions.filter(item => item.value !== 'all')} />
          </Form.Item>
          <Form.Item name="project_group_id" label="项目组">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={projectGroups.map(group => ({ value: group.id, label: `${group.name}${group.code ? ` (${group.code})` : ''}` }))}
            />
          </Form.Item>
          <Form.Item name="departments" label="部门">
            <Select mode="multiple" options={departmentOptions.filter(item => ['PM', 'PD', 'BD', 'OPS', 'ADS'].includes(item.value))} />
          </Form.Item>
          <Text type="secondary">会为所选部门创建 SOP、规则制度、模板表单、项目资料、复盘案例和临时文档目录。</Text>
        </Form>
      </Modal>
    </div>
  );
}
