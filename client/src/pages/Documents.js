import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Alert,
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
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
  RightOutlined,
  RollbackOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
  TableOutlined,
  UndoOutlined,
  UpOutlined,
  UploadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatBusinessDateTime, parseBusinessDateTime } from '../utils/businessTime';
import { useSearchParams } from 'react-router-dom';
import { attachmentsApi, documentsApi, projectGroupsApi, teamsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import SidebarToggleButton from '../components/SidebarToggleButton';
import LegacySpreadsheetDocumentEditor from '../components/SpreadsheetDocumentEditor';
import MentionPicker, {
  getContentEditableMentionTrigger,
  insertMentionIntoContentEditable,
  preloadMentionCandidates,
  removeAdjacentMentionFromContentEditable,
  scheduleMentionNotification,
} from '../components/MentionPicker';
import {
  getDefaultDocumentCxoUsers,
  updateDefaultDocumentShareUsers,
  updateExplicitDocumentShareUsers,
} from '../utils/documentDefaultShares';
import { getDocumentKind, isSpreadsheetDocument } from '../utils/documentKind';
import { loadFreshDocumentHistoryDetail } from '../utils/documentHistory';
import {
  buildSpreadsheetCollaborationHint,
  getSpreadsheetConflictHintForDocument,
  trackSpreadsheetDocumentDraft,
} from '../utils/spreadsheetDocumentDraft';
import {
  buildSpreadsheetOperationSavePlan,
  spreadsheetOperationsAreApplied,
} from '../utils/spreadsheetOperations';
import {
  buildSpreadsheetPresencePayload,
  createSpreadsheetPresenceSessionId,
  filterRemoteSpreadsheetCollaborators,
} from '../utils/spreadsheetPresence';
import {
  getSpreadsheetWorkspaceChromeState,
  resolveSpreadsheetContextAutoCollapsed,
} from '../utils/spreadsheetWorkspaceLayout';
import { activateDocumentLink } from '../utils/documentLinkNavigation';
import {
  buildCollapsedDocumentBlockIds,
  buildDocumentBlockGuideMap,
  buildDocumentNumberedListValues,
  canNestDocumentBlock,
  getDocumentBlockHierarchyIndent,
  isDocumentBlockHierarchyMember,
} from '../utils/documentBlockHierarchy';
import {
  documentClipboardHasEmbeddedBlocks,
  flattenDocumentClipboardHtml,
  shouldSkipNestedClipboardListElement,
} from '../utils/documentClipboard';
import {
  buildOfficeClipboardEnvelope,
  buildOfficeTableHtml,
  buildOfficeTextBlockHtml,
} from '../utils/documentOfficeClipboard';
import { splitContentEditableAtSelection } from '../utils/contentEditableSplit';
import {
  isContentEditableComposing,
  removeContentEditableLineBreakBeforeCaret,
  shouldSuppressEnterAfterComposition,
} from '../utils/contentEditableComposition';
import { wrapInlineRangeContents } from '../utils/inlineTextFormatting';
import {
  buildBulkShareTreeCheckState,
  buildFolderDocumentSelectionMap,
  chunkBulkDocumentIds,
  updateBulkFolderSelection,
} from '../utils/documentBulkShare';
import {
  mergeAdjacentDocumentBlocks,
  shouldIgnoreGlobalDocumentDelete,
} from '../utils/documentBlockKeyboard';
import {
  deleteDocumentTableColumnWidths,
  deleteDocumentTableRowHeights,
  deleteDocumentTableRowWidths,
  getDocumentTableRowColumnWidths,
  getDocumentTableHorizontalAutoScrollDelta,
  insertDocumentTableColumnWidths,
  insertDocumentTableRowHeights,
  insertDocumentTableRowWidths,
  normalizeDocumentTableRowHeights,
  normalizeDocumentTableRowColumnWidths,
  resizeDocumentTableOverallWidth,
  resizeDocumentTableRowHeight,
  resizeDocumentTableScopedColumnWidths,
  resolveDocumentTableContextMenuPosition,
  resolveDocumentTableStyleBounds,
  shouldShowDocumentTableContextMenu,
} from '../utils/documentTable';
import {
  expandDocumentTableSelectionBounds,
  resolveDocumentTableMergePlan,
} from '../utils/documentTableMerge';
import {
  createDefaultSpreadsheetWorkbook,
  getDocumentContentSignature,
  mergeSpreadsheetWorkbookSnapshots,
  normalizeSpreadsheetWorkbook,
  spreadsheetWorkbookToText,
} from '../utils/spreadsheetWorkbook';
import DOMPurify from 'dompurify';
import './DocumentsSpreadsheetLayout.css';

const loadUniverSpreadsheetDocumentEditor = () => {
  if (typeof window !== 'undefined' && typeof window.__RELATION_LOAD_UNIVER_SPREADSHEET__ === 'function') {
    return window.__RELATION_LOAD_UNIVER_SPREADSHEET__();
  }
  return Promise.reject(new Error('Univer preview loader is not registered'));
};

const UniverSpreadsheetDocumentEditor = React.lazy(loadUniverSpreadsheetDocumentEditor);

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const domainOptions = [
  { value: 'all', label: '全部' },
  { value: 'domestic_project', label: '国内项目' },
  { value: 'overseas_project', label: '海外项目' },
  { value: 'hr_administration', label: '人力行政' },
  { value: 'executive_management', label: '经营管理' },
  { value: 'general', label: '通用文档' },
  { value: 'cross_region', label: '跨区域' },
];

const departmentOptions = [
  { value: 'OPS', label: '产运' },
  { value: 'BD', label: '商务' },
  { value: 'RD', label: '研发' },
  { value: 'ADS', label: '投放' },
  { value: 'HR', label: '人力' },
  { value: 'ADMIN', label: '行政' },
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
  { value: 'PLAN', label: '规划' },
  { value: 'IMP', label: '落地' },
  { value: 'LEGA', label: '沉淀' },
  { value: 'TEAM', label: '团队' },
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
const listMarkerBoxWidth = 24;
const listMarkerCenterOffset = 12;
const listMarkerColor = '#202124';
const listMarkerMutedColor = '#d8dce0';
const listGuideColor = '#f0f0f0';
const listGuideWidth = 2;
const listLineHeight = 1.96;
const listMarkerTextGap = 6;
const maxListIndent = 9;
const blockActionSelectedBackground = '#f7e3e6';
const blockActionSelectedBorder = '#f2c9d0';
const listBlockSelectedBackground = '#f8e6e8';
const inlineToolbarWidth = 420;

function getListGuideLineOffset(blockType, markerWidth = listMarkerBoxWidth) {
  if (blockType === 'numbered') return markerWidth - 6;
  return markerWidth / 2;
}

const domainLabel = Object.fromEntries(domainOptions.map(item => [item.value, item.label]));
const departmentLabel = Object.fromEntries(departmentOptions.map(item => [item.value, item.label]));
const orgDepartmentLabel = Object.fromEntries(orgDepartmentOptions.map(item => [item.value, item.label]));
const docTypeLabel = Object.fromEntries(docTypeOptions.map(item => [item.value, item.label]));
const managedDocumentDomainByProjectCode = Object.freeze({
  DOMESTIC: 'domestic_project',
  OVERSEAS: 'overseas_project',
  HRADM: 'hr_administration',
});
const documentKindOptions = [
  { value: 'rich_text', label: '普通文档', description: '编写方案、纪要、PRD、SOP 和知识内容' },
  { value: 'spreadsheet', label: '在线表格', description: '管理预算、名单、数据清单、排期和台账' },
];
const documentKindLabel = Object.fromEntries(documentKindOptions.map(item => [item.value, item.label]));
const defaultDocumentIconFormValue = '__default_document_icon__';
const documentIconOptions = [
  { value: 'star', label: '重点', symbol: '★' },
  { value: 'pin', label: '置顶', symbol: '📌' },
  { value: 'flag', label: '旗标', symbol: '⚑' },
  { value: 'target', label: '目标', symbol: '◎' },
  { value: 'rocket', label: '启动', symbol: '🚀' },
  { value: 'idea', label: '想法', symbol: '💡' },
  { value: 'chart', label: '数据', symbol: '📈' },
  { value: 'calendar', label: '日程', symbol: '◷' },
  { value: 'task', label: '任务', symbol: '✓' },
  { value: 'team', label: '团队', symbol: '👥' },
  { value: 'money', label: '资金', symbol: '¥' },
  { value: 'media', label: '媒体', symbol: '▶' },
  { value: 'doc', label: '文档', symbol: '▤' },
  { value: 'book', label: '手册', symbol: '📘' },
  { value: 'folder', label: '归档', symbol: '📁' },
  { value: 'link', label: '链接', symbol: '🔗' },
  { value: 'lock', label: '权限', symbol: '🔒' },
  { value: 'warning', label: '风险', symbol: '⚠' },
  { value: 'heart', label: '关注', symbol: '♥' },
  { value: 'trophy', label: '成果', symbol: '🏆' },
];
const documentIconMap = Object.fromEntries(documentIconOptions.map(item => [item.value, item]));

function normalizeDocumentIconFormValue(value) {
  return value === defaultDocumentIconFormValue ? null : (value || null);
}

const primaryDocumentSpaceDomains = ['domestic_project', 'overseas_project', 'hr_administration'];
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
const documentImportFileExts = [
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'pdf', 'ofd', 'caj', 'ceb',
  'doc', 'docx', 'dot', 'dotx', 'rtf', 'wps', 'wpt', 'odt', 'pages',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'csv', 'tsv', 'et', 'ett', 'ods', 'numbers',
  'ppt', 'pptx', 'pps', 'ppsx', 'dps', 'dpt', 'odp', 'key',
  'txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml',
  'vsdx', 'drawio', 'xmind', 'mind', 'mm',
  'eml', 'msg',
];
const documentImportAccept = documentImportFileExts.map(ext => `.${ext}`).join(',');
const documentImportMaxSize = 100 * 1024 * 1024;
const documentAttachmentChunkThreshold = 8 * 1024 * 1024;
const documentAttachmentChunkSize = 768 * 1024;
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
const documentLiveSyncInterval = 5000;
const documentClipboardBlocksMime = 'application/x-relation-document-blocks';
const documentClipboardBlocksHtmlAttr = 'data-relation-document-blocks';
const documentFolderSidebarCollapsedStorageKey = 'documents.folderSidebarCollapsed';
const documentFolderSidebarWidthStorageKey = 'documents.folderSidebarWidth';
const documentFolderSidebarDefaultWidth = 340;
const documentFolderSidebarMinWidth = 300;
const documentFolderSidebarMaxWidth = 560;
const univerSpreadsheetPreviewStorageKey = 'relation_univer_spreadsheet_preview';
const tableFillColorOptions = ['#ffffff', '#f8fafc', '#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#dbeafe', '#e0e7ff', '#f3e8ff'];
const tableTextColorOptions = ['#111827', '#475569', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#4338ca', '#7e22ce'];
const databaseFieldTypeOptions = [
  { value: 'title', label: '标题', icon: '▭' },
  { value: 'select', label: '单选', icon: '◉' },
  { value: 'multi_select', label: '多选', icon: '◎' },
  { value: 'text', label: '文本', icon: '☰' },
  { value: 'number', label: '数字', icon: '#' },
  { value: 'date', label: '日期', icon: '▣' },
  { value: 'person', label: '人员', icon: '♙' },
  { value: 'url', label: '链接', icon: '↗' },
  { value: 'email', label: '邮箱', icon: '@' },
  { value: 'phone', label: '电话', icon: '☎' },
  { value: 'checkbox', label: '勾选', icon: '☑' },
];
const databaseFieldTypeMap = Object.fromEntries(databaseFieldTypeOptions.map(item => [item.value, item]));
const databaseTagColorOptions = ['#f3f4f6', '#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe', '#fce7f3'];
const pasteHtmlBlockSelector = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'table', 'div',
  'img',
].join(',');

function readStoredUniverSpreadsheetPreviewFlag() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(univerSpreadsheetPreviewStorageKey) === '1';
  } catch {
    return false;
  }
}

function getUniverSpreadsheetPreviewSearchFlag(searchParams) {
  const rawValue = searchParams.get('univer_spreadsheet') || searchParams.get('univerSpreadsheet');
  if (rawValue === null) return null;
  const normalized = String(rawValue).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function persistUniverSpreadsheetPreviewFlag(enabled) {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.localStorage.setItem(univerSpreadsheetPreviewStorageKey, '1');
    } else {
      window.localStorage.removeItem(univerSpreadsheetPreviewStorageKey);
    }
  } catch {
    // localStorage may be blocked; the URL parameter still controls this render.
  }
}

class SpreadsheetEditorFallbackBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error) {
    console.error('[documents:univer-spreadsheet-preview]', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

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
  const filepath = String(attachment.filepath || '');
  return attachment.preview_url || attachment.url || (filepath && !filepath.startsWith('oss:') ? `/uploads/${filepath}` : '');
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

function clampDocumentFolderSidebarWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return documentFolderSidebarDefaultWidth;
  return Math.max(documentFolderSidebarMinWidth, Math.min(documentFolderSidebarMaxWidth, Math.round(width)));
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
    url: getAttachmentUrl(attachment),
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

function getMediaMetaUrl(meta = {}) {
  return getAttachmentUrl(meta);
}

function getImageBlockItems(block = {}) {
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  const rawItems = Array.isArray(meta.items) && meta.items.length
    ? meta.items
    : [{ ...meta, url: meta.url || block.content || '', filename: meta.filename || block.content || '' }];
  return rawItems
    .map((item, index) => {
      const itemMeta = item && typeof item === 'object' ? item : {};
      const url = getMediaMetaUrl(itemMeta) || itemMeta.url || itemMeta.original_url || (index === 0 ? block.content : '');
      return {
        ...itemMeta,
        url,
        filename: itemMeta.filename || itemMeta.display_name || meta.filename || '',
        alt: itemMeta.alt || itemMeta.display_name || itemMeta.filename || meta.alt || meta.filename || '图片',
      };
    })
    .filter(item => item.url);
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

function dedupeClipboardImageFiles(files = []) {
  const seen = new Set();
  return Array.from(files || []).filter(file => {
    if (!file) return false;
    const key = [file.name || '', file.type || '', file.size || 0, file.lastModified || 0].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getAsyncClipboardImageFiles() {
  if (!navigator.clipboard?.read || typeof window.ClipboardItem === 'undefined') return [];
  try {
    const clipboardItems = await navigator.clipboard.read();
    const files = [];
    for (const item of clipboardItems || []) {
      const imageTypes = (item.types || []).filter(type => clipboardImageExtByMime[String(type || '').toLowerCase()]);
      for (const type of imageTypes) {
        const blob = await item.getType(type);
        if (!blob?.size) continue;
        const ext = clipboardImageExtByMime[String(type || '').toLowerCase()] || 'png';
        const timestamp = dayjs().format('YYYYMMDD-HHmmss');
        files.push(new File([blob], `clipboard-read-image-${timestamp}-${files.length + 1}.${ext}`, {
          type,
          lastModified: Date.now(),
        }));
      }
    }
    return dedupeClipboardImageFiles(files);
  } catch {
    return [];
  }
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

function isClipboardHtmlImageBlock(block = {}) {
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  return block.type === 'image' && meta.source_system === 'clipboard_html';
}

function getClipboardHtmlImageBlockUrl(block = {}) {
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  return String(meta.url || block.content || '').trim();
}

function normalizeClipboardHtmlImageFilename(filename = '', mime = '', index = 0) {
  const mimeExt = clipboardImageExtByMime[String(mime || '').split(';')[0].trim().toLowerCase()];
  const rawExt = getFileExt(filename);
  const ext = imageExts.includes(rawExt) ? rawExt : (mimeExt || 'png');
  const fallback = `clipboard-html-image-${dayjs().format('YYYYMMDD-HHmmss')}-${index + 1}.${ext}`;
  const rawName = String(filename || fallback).split('?')[0].split('#')[0].split('/').pop() || fallback;
  const safeName = rawName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || fallback;
  return imageExts.includes(getFileExt(safeName)) ? safeName.slice(0, 160) : `${safeName.slice(0, 140)}.${ext}`;
}

function dataUriToClipboardHtmlImageFile(dataUri = '', filename = '', index = 0) {
  const value = String(dataUri || '').trim();
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) throw new Error('不支持的图片 Data URL');
  const header = value.slice(0, commaIndex);
  const rawData = value.slice(commaIndex + 1);
  const mime = (header.match(/^data:(image\/(?:png|jpe?g|gif|webp))(?:;|$)/i)?.[1] || '').toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!mime) throw new Error('不支持的图片 Data URL');
  const binary = /;base64(?:;|$)/i.test(header)
    ? window.atob(rawData.replace(/\s/g, ''))
    : decodeURIComponent(rawData);
  const chunks = [];
  for (let offset = 0; offset < binary.length; offset += 8192) {
    const slice = binary.slice(offset, offset + 8192);
    const bytes = new Uint8Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) bytes[i] = slice.charCodeAt(i);
    chunks.push(bytes);
  }
  const name = normalizeClipboardHtmlImageFilename(filename, mime, index);
  return new File(chunks, name, { type: mime, lastModified: Date.now() });
}

async function fetchClipboardHtmlImageAsFile(url = '', filename = '', index = 0) {
  if (!/^https?:\/\//i.test(url)) throw new Error('不是可下载的远程图片地址');
  const response = await fetch(url, {
    credentials: 'include',
    referrerPolicy: 'no-referrer',
    cache: 'force-cache',
  });
  if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const mime = contentType.split(';')[0].trim().toLowerCase() || getPastedImageMimeType(url);
  if (!mime.startsWith('image/')) throw new Error('远程资源不是图片');
  const blob = await response.blob();
  if (!blob.size) throw new Error('图片内容为空');
  const finalMime = String(blob.type || mime || 'image/png').toLowerCase();
  const name = normalizeClipboardHtmlImageFilename(filename, finalMime, index);
  return new File([blob], name, { type: finalMime, lastModified: Date.now() });
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

function isWolaiPageCoverUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, 'https://placeholder.local');
    const host = String(parsed.hostname || '').toLowerCase();
    const pathname = decodeURIComponent(String(parsed.pathname || '')).toLowerCase();
    return /(^|\.)wostatic\.cn$/.test(host) && pathname.includes('/cover/');
  } catch {
    return /wostatic\.cn\/cover\//i.test(raw);
  }
}

function isWolaiPageCoverBlock(block = {}) {
  if (block?.type !== 'image') return false;
  const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
  if (meta.source_system !== 'wolai_mcp' && !meta.original_url) return false;
  return [meta.original_url, meta.url, block.content].filter(Boolean).some(isWolaiPageCoverUrl);
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
  if (type === 'bullet') return '';
  if (type === 'numbered') return '';
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
  if (type === 'table-simple') return { columns: ['名称', '说明'], rows: [['', '']], mergedCells: [], rowHeights: {} };
  if (type === 'database-embed') {
    return {
      tableName: '',
      columns: ['标题', '标签', '字段名'],
      rows: [
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
      view: 'table',
      fieldTypes: ['title', 'select', 'text'],
      tagOptions: {
        1: [
          { name: '待完成', color: '#f3f4f6' },
          { name: '进行中', color: '#dbeafe' },
          { name: '已完成', color: '#dcfce7' },
        ],
      },
      columnWidths: [220, 220, 220],
      columnColors: {},
      titleColorColumns: {},
      sorts: [],
      filters: [],
      group: { columnIndex: null, visibleValues: [], collapsed: {} },
    };
  }
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

function clampTableCellSpan(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 1;
  return Math.max(1, Math.round(next));
}

function buildTableMergeKey(rowIndex, columnIndex) {
  return `${Number(rowIndex)}:${Number(columnIndex)}`;
}

function normalizeTableMergedCells(mergedCells, rowCount, columnCount) {
  if (!Array.isArray(mergedCells) || rowCount <= 0 || columnCount <= 0) return [];
  const normalized = [];
  const occupied = new Set();
  mergedCells.forEach(item => {
    const rowIndex = Number(item?.rowIndex);
    const columnIndex = Number(item?.columnIndex);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) return;
    const rowSpan = Math.min(clampTableCellSpan(item?.rowSpan), rowCount - rowIndex);
    const colSpan = Math.min(clampTableCellSpan(item?.colSpan), columnCount - columnIndex);
    if (rowSpan <= 1 && colSpan <= 1) return;
    let overlaps = false;
    for (let r = rowIndex; r < rowIndex + rowSpan && !overlaps; r += 1) {
      for (let c = columnIndex; c < columnIndex + colSpan; c += 1) {
        const key = buildTableMergeKey(r, c);
        if (occupied.has(key)) {
          overlaps = true;
          break;
        }
      }
    }
    if (overlaps) return;
    for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
      for (let c = columnIndex; c < columnIndex + colSpan; c += 1) {
        occupied.add(buildTableMergeKey(r, c));
      }
    }
    normalized.push({ rowIndex, columnIndex, rowSpan, colSpan });
  });
  return normalized;
}

function normalizeCssColor(value) {
  const color = String(value || '').trim();
  if (!color || color === 'transparent' || color === 'inherit' || color === 'initial') return '';
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  if (/^[a-z]+$/i.test(color)) return color;
  return '';
}

function normalizeTableCellStyle(style = {}) {
  const backgroundColor = normalizeCssColor(style.backgroundColor || style.background || style.fill);
  const color = normalizeCssColor(style.color || style.textColor);
  return {
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(color ? { color } : {}),
  };
}

function isEmptyTableCellStyle(style = {}) {
  return !style.backgroundColor && !style.color;
}

function normalizeTableCellStyles(cellStyles, rowCount, columnCount) {
  if (!cellStyles || typeof cellStyles !== 'object' || rowCount <= 0 || columnCount <= 0) return {};
  return Object.entries(cellStyles).reduce((acc, [key, style]) => {
    const [rowText, columnText] = String(key).split(':');
    const rowIndex = Number(rowText);
    const columnIndex = Number(columnText);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return acc;
    if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) return acc;
    const normalized = normalizeTableCellStyle(style);
    if (!isEmptyTableCellStyle(normalized)) acc[buildTableMergeKey(rowIndex, columnIndex)] = normalized;
    return acc;
  }, {});
}

function buildTableMergedLookup(mergedCells, rowCount, columnCount) {
  const normalized = normalizeTableMergedCells(mergedCells, rowCount, columnCount);
  const anchorMap = new Map();
  const coveredMap = new Map();
  normalized.forEach(merge => {
    const anchorKey = buildTableMergeKey(merge.rowIndex, merge.columnIndex);
    anchorMap.set(anchorKey, merge);
    for (let rowIndex = merge.rowIndex; rowIndex < merge.rowIndex + merge.rowSpan; rowIndex += 1) {
      for (let columnIndex = merge.columnIndex; columnIndex < merge.columnIndex + merge.colSpan; columnIndex += 1) {
        const key = buildTableMergeKey(rowIndex, columnIndex);
        coveredMap.set(key, {
          ...merge,
          isAnchor: key === anchorKey,
        });
      }
    }
  });
  return { normalized, anchorMap, coveredMap };
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

function hasImportedHierarchyIndent(block) {
  return !isHierarchicalListBlock(block) && isDocumentBlockHierarchyMember(block);
}

function getBlockHierarchyIndent(block) {
  return getDocumentBlockHierarchyIndent(block, maxListIndent);
}

function canAdjustBlockHierarchyIndent(block) {
  return canNestDocumentBlock(block);
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
  const markerSize = markerLevel === 1 ? 5.5 : markerLevel === 2 ? 5.5 : 5;
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
          border: `${Math.max(1.25, 1.25 * scale)}px solid ${listMarkerColor}`,
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
          borderRadius: 1.2,
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

function isFoldListMarkerSolid(meta = {}) {
  const value = meta.hasChildren ?? meta.has_children ?? meta.hasContent ?? meta.has_content;
  if (value === false || value === 0) return false;
  if (typeof value === 'string' && /^(false|0|no)$/i.test(value.trim())) return false;
  return true;
}

function renderFoldListTriangle(collapsed, scale = 1, solid = true) {
  const color = solid ? listMarkerColor : listMarkerMutedColor;
  const size = 14 * scale;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      style={{
        display: 'block',
        width: size,
        height: size,
        transform: collapsed ? `translateX(${0.5 * scale}px)` : `translateY(${0.5 * scale}px)`,
      }}
    >
      <path
        d={collapsed ? 'M5 3.8 L10 7 L5 10.2 Z' : 'M3.8 5 L10.2 5 L7 10 Z'}
        fill={color}
        stroke={color}
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function buildNumberedListMarkers(blocks = []) {
  const markers = new Map();
  buildDocumentNumberedListValues(blocks, maxListIndent).forEach(({ index, indent }, blockId) => {
    markers.set(blockId, formatNumberedListMarker(index, indent));
  });
  return markers;
}

function buildCollapsedListHiddenIds(blocks = []) {
  return buildCollapsedDocumentBlockIds(blocks, maxListIndent);
}

function buildHierarchicalGuideMap(blocks = [], hiddenIds = new Set()) {
  return buildDocumentBlockGuideMap(blocks, hiddenIds, maxListIndent);
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
const inlineHtmlAllowedAttrs = ['style', 'href', 'target', 'rel', 'data-relation-mention', 'contenteditable'];

function normalizeLegacyInlineHtml(value) {
  const raw = String(value || '');
  if (!raw || typeof document === 'undefined' || !/<font\b/i.test(raw)) return raw;
  const template = document.createElement('template');
  template.innerHTML = raw;
  template.content.querySelectorAll('font').forEach(font => {
    const face = String(font.getAttribute('face') || font.style?.fontFamily || '').toLowerCase();
    const color = normalizeCssColor(font.getAttribute('color') || font.style?.color || '');
    const wrapper = document.createElement(/mono|consolas|courier|menlo|monaco/.test(face) ? 'code' : 'span');
    if (color) wrapper.setAttribute('style', `color: ${color};`);
    while (font.firstChild) wrapper.appendChild(font.firstChild);
    font.replaceWith(wrapper);
  });
  return template.innerHTML;
}

function sanitizeInlineHtml(value) {
  if (!value) return '';
  return DOMPurify.sanitize(normalizeLegacyInlineHtml(value), {
    ALLOWED_TAGS: inlineHtmlAllowedTags,
    ALLOWED_ATTR: inlineHtmlAllowedAttrs,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'src', 'srcset'],
  });
}

function normalizePastedInlineHtml(value) {
  return sanitizeInlineHtml(flattenDocumentClipboardHtml(value));
}

function getElementStyleText(element) {
  return String(element?.getAttribute?.('style') || '');
}

function getStyleDeclarationColor(element, propertyNames = []) {
  if (!element) return '';
  for (const propertyName of propertyNames) {
    const directValue = element.style?.[propertyName];
    const normalizedDirect = normalizeCssColor(directValue);
    if (normalizedDirect) return normalizedDirect;
  }
  const styleText = getElementStyleText(element);
  for (const propertyName of propertyNames) {
    const cssName = propertyName.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
    const match = styleText.match(new RegExp(`${cssName}\\s*:\\s*([^;]+)`, 'i'));
    const normalized = normalizeCssColor(match?.[1]);
    if (normalized) return normalized;
  }
  return '';
}

function getPastedTableCellStyle(cell) {
  const backgroundColor = normalizeCssColor(cell?.getAttribute?.('bgcolor'))
    || getStyleDeclarationColor(cell, ['backgroundColor', 'background'])
    || getStyleDeclarationColor(cell?.parentElement, ['backgroundColor', 'background']);
  const color = getStyleDeclarationColor(cell, ['color'])
    || getStyleDeclarationColor(cell?.parentElement, ['color']);
  return normalizeTableCellStyle({ backgroundColor, color });
}

function removeNestedBlocksFromClone(element, selector) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll(selector).forEach(node => node.remove());
  return clone;
}

function getPastedBlockInlineHtml(element) {
  const clone = removeNestedBlocksFromClone(element, 'table, ul, ol, img');
  return normalizePastedInlineHtml(clone.innerHTML || clone.textContent || '');
}

function getClipboardHtmlSourceUrl(html) {
  const raw = String(html || '');
  const sourceMatch = raw.match(/(?:^|\n)SourceURL:(.+?)(?:\r?\n|$)/i);
  if (sourceMatch?.[1]) return sourceMatch[1].trim();
  if (typeof document === 'undefined') return '';
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['base'],
    ALLOWED_ATTR: ['href'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'],
  });
  return container.querySelector('base[href]')?.getAttribute('href') || '';
}

function getPastedImageRawSource(element) {
  if (!element) return '';
  const srcset = element.getAttribute?.('srcset') || element.getAttribute?.('data-srcset') || '';
  const srcsetSource = srcset.split(',').map(item => item.trim().split(/\s+/)[0]).find(Boolean);
  const raw = [
    element.getAttribute?.('src'),
    element.getAttribute?.('data-src'),
    element.getAttribute?.('data-original'),
    element.getAttribute?.('data-original-src'),
    element.getAttribute?.('original_src'),
    element.getAttribute?.('href'),
    srcsetSource,
  ].find(Boolean);
  return String(raw || '').trim();
}

function getPastedImageSource(element, sourceUrl = '') {
  const value = getPastedImageRawSource(element);
  if (!value || /^(javascript|vbscript):/i.test(value)) return '';
  if (/^data:image\//i.test(value)) {
    return /^data:image\/(?:png|jpe?g|gif|webp)[;,]/i.test(value) ? value : '';
  }
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `${window.location.protocol}${value}`;
  if (/^(blob:|file:|cid:|webkit-fake-url:)/i.test(value)) return '';
  try {
    return new URL(value, sourceUrl || document.baseURI).toString();
  } catch {
    return '';
  }
}

function getPastedImageFilename(src, element) {
  const alt = String(element?.getAttribute?.('alt') || element?.getAttribute?.('title') || '').trim();
  const dataExt = src.match(/^data:image\/([a-z0-9.+-]+)[;,]/i)?.[1]?.replace('jpeg', 'jpg') || '';
  const sourceExt = getFileExt(src.split('?')[0]);
  const fallbackExt = imageExts.includes(dataExt) ? dataExt : (imageExts.includes(sourceExt) ? sourceExt : 'png');
  try {
    const parsed = new URL(src, document.baseURI);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    if (name) return name.slice(0, 120);
  } catch {
    // Data URLs and malformed remote URLs fall through to readable fallbacks.
  }
  if (alt && !/[\\/:*?"<>|]/.test(alt)) return `${alt.slice(0, 80)}.${fallbackExt}`;
  return `pasted-image-${Date.now()}.${fallbackExt}`;
}

function getPastedImageMimeType(src) {
  const dataMatch = String(src || '').match(/^data:(image\/[a-z0-9.+-]+)[;,]/i);
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase();
  const ext = getFileExt(src.split('?')[0]);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/png';
}

function createPastedImageBlock(element, sourceUrl = '') {
  const rawSrc = getPastedImageRawSource(element);
  const src = getPastedImageSource(element, sourceUrl);
  if (!src && !rawSrc) return null;
  const filename = getPastedImageFilename(src || rawSrc, element);
  const alt = String(element?.getAttribute?.('alt') || element?.getAttribute?.('title') || filename || '图片').trim();
  const filenameExt = getFileExt(filename);
  const sourceExt = getFileExt((src || rawSrc).split('?')[0]);
  const ext = imageExts.includes(filenameExt) ? filenameExt : (imageExts.includes(sourceExt) ? sourceExt : 'png');
  return {
    type: 'image',
    content: filename,
    meta: {
      ...getDefaultBlockMeta('image'),
      url: src,
      filename,
      display_name: filename,
      mimetype: getPastedImageMimeType(src || rawSrc),
      file_ext: ext,
      embedOnly: true,
      remote: !/^data:image\//i.test(src),
      source_system: 'clipboard_html',
      source_url: sourceUrl || '',
      original_url: src && rawSrc && rawSrc !== src ? rawSrc : '',
      needs_clipboard_file: !src,
      alt,
    },
  };
}

function inferPastedBlockType(element) {
  const tag = String(element?.tagName || '').toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `heading${Math.min(4, Math.max(1, Number(tag.slice(1))))}`;
  if (tag === 'li') return element.parentElement?.tagName?.toLowerCase() === 'ol' ? 'numbered' : 'bullet';

  const className = String(element?.getAttribute?.('class') || '');
  const classHeadingMatch = className.match(/(?:heading|msoheading|标题)\s*([1-4])/i);
  if (classHeadingMatch) return `heading${Number(classHeadingMatch[1])}`;

  const styleText = getElementStyleText(element);
  const outlineMatch = styleText.match(/mso-outline-level\s*:\s*([1-4])/i);
  if (outlineMatch) return `heading${Number(outlineMatch[1])}`;

  const fontSizeMatch = styleText.match(/font-size\s*:\s*([0-9.]+)\s*(pt|px)/i);
  const fontSizeValue = Number(fontSizeMatch?.[1]);
  const fontSizePx = fontSizeMatch?.[2]?.toLowerCase() === 'pt' ? fontSizeValue * 1.333 : fontSizeValue;
  const boldish = /font-weight\s*:\s*(bold|[6-9]00)/i.test(styleText)
    || /<(strong|b)\b/i.test(element?.innerHTML || '');
  if (boldish && Number.isFinite(fontSizePx)) {
    if (fontSizePx >= 26) return 'heading1';
    if (fontSizePx >= 21) return 'heading2';
    if (fontSizePx >= 17) return 'heading3';
  }
  return 'paragraph';
}

function getPastedListIndent(element) {
  if (String(element?.tagName || '').toLowerCase() !== 'li') return 0;
  let indent = 0;
  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName?.toLowerCase() === 'li') indent += 1;
    parent = parent.parentElement;
  }
  return clampListIndent(indent);
}

function parsePastedTableElement(table) {
  if (!table) return null;
  const rowNodes = Array.from(table.querySelectorAll('tr'));
  const matrix = [];
  const occupied = new Set();
  const mergedCells = [];
  const cellStyles = {};

  rowNodes.forEach((rowNode, rowIndex) => {
    matrix[rowIndex] = matrix[rowIndex] || [];
    let columnIndex = 0;
    Array.from(rowNode.querySelectorAll('th,td')).forEach(cell => {
      while (occupied.has(buildTableMergeKey(rowIndex, columnIndex))) columnIndex += 1;
      const rowSpan = Math.max(1, Number(cell.getAttribute('rowspan')) || 1);
      const colSpan = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
      const rawContent = normalizePastedInlineHtml(cell.innerHTML || cell.textContent || '');
      const cellContent = cell.tagName?.toLowerCase() === 'th' && rawContent && !/^<strong\b/i.test(rawContent)
        ? `<strong>${rawContent}</strong>`
        : rawContent;
      matrix[rowIndex][columnIndex] = cellContent;

      const style = getPastedTableCellStyle(cell);
      if (!isEmptyTableCellStyle(style)) {
        cellStyles[buildTableMergeKey(rowIndex, columnIndex)] = style;
      }
      if (rowSpan > 1 || colSpan > 1) {
        mergedCells.push({ rowIndex, columnIndex, rowSpan, colSpan });
      }
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        matrix[r] = matrix[r] || [];
        for (let c = columnIndex; c < columnIndex + colSpan; c += 1) {
          occupied.add(buildTableMergeKey(r, c));
          if (r !== rowIndex || c !== columnIndex) matrix[r][c] = matrix[r][c] ?? '';
        }
      }
      columnIndex += colSpan;
    });
  });

  const visibleRows = matrix.filter(row => Array.isArray(row) && row.length);
  if (!visibleRows.length) return null;
  const columnCount = Math.max(...visibleRows.map(row => row.length), 1);
  const rows = visibleRows.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || ''));
  const columns = Array.from({ length: columnCount }, (_, index) => `字段 ${index + 1}`);
  return {
    type: 'table-simple',
    content: '',
    meta: {
      ...getDefaultBlockMeta('table-simple'),
      columns,
      rows,
      mergedCells: normalizeTableMergedCells(mergedCells, rows.length, columnCount),
      cellStyles: normalizeTableCellStyles(cellStyles, rows.length, columnCount),
    },
  };
}

function parseClipboardHtmlDocumentBlocks(html) {
  if (!html || typeof document === 'undefined') return [];
  const sourceUrl = getClipboardHtmlSourceUrl(html);
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: [
      'html', 'body', 'section', 'article', 'div', 'p',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'img',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      ...inlineHtmlAllowedTags,
    ],
    ALLOWED_ATTR: [
      'style', 'href', 'target', 'rel', 'colspan', 'rowspan', 'bgcolor', 'class',
      'src', 'srcset', 'data-src', 'data-srcset', 'data-original', 'data-original-src', 'original_src',
      'alt', 'title', 'width', 'height',
    ],
    ADD_DATA_URI_TAGS: ['img'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'video', 'audio'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'],
  });

  const blocks = [];
  Array.from(container.querySelectorAll(pasteHtmlBlockSelector)).forEach(element => {
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'img') {
      const imageBlock = createPastedImageBlock(element, sourceUrl);
      if (imageBlock) blocks.push(imageBlock);
      return;
    }
    if (tag !== 'table' && element.closest('table')) return;
    if (shouldSkipNestedClipboardListElement(element)) return;
    if (tag === 'div' && element.querySelector(pasteHtmlBlockSelector)) return;

    if (tag === 'table') {
      const tableBlock = parsePastedTableElement(element);
      if (tableBlock) blocks.push(tableBlock);
      return;
    }

    const content = getPastedBlockInlineHtml(element);
    if (!inlineHtmlToPlain(content).trim()) return;
    blocks.push({
      type: inferPastedBlockType(element),
      content,
      meta: {
        ...getDefaultBlockMeta(inferPastedBlockType(element)),
        ...(tag === 'li' ? { indent: getPastedListIndent(element) } : {}),
      },
    });
  });

  if (blocks.length) return blocks;
  const text = inlineHtmlToPlain(container.innerHTML || '');
  return text.trim() ? plainTextToBlocks(text) : [];
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
    const blocks = parsed.blocks.map(normalizeBlock).filter(block => !isWolaiPageCoverBlock(block));
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

function getDocumentRawSaveSignature(title, content) {
  return JSON.stringify({
    title: title || '未命名文档',
    content: getDocumentContentSignature(content),
  });
}

function assertDocumentSaveApplied(document, expectedSignature) {
  if (!document?.id) throw new Error('服务器未返回已保存的文档');
  const persistedSignature = getDocumentSaveSignature(
    document.title || '',
    contentToBlocks(document.content)
  );
  if (persistedSignature !== expectedSignature) {
    throw new Error('服务器未写入本次文档修改，请重试');
  }
  return document;
}

function assertRawDocumentSaveApplied(document, expectedSignature) {
  if (!document?.id) throw new Error('服务器未返回已保存的文档');
  const persistedSignature = getDocumentRawSaveSignature(document.title || '', document.content);
  if (persistedSignature !== expectedSignature) {
    throw new Error('服务器未写入本次文档修改，请重试');
  }
  return document;
}

function buildDocumentWritePayload(title, blocks, baseUpdatedAt) {
  const payload = buildDocumentSavePayload(title, blocks);
  if (baseUpdatedAt) payload.base_updated_at = baseUpdatedAt;
  return payload;
}

function buildRawDocumentWritePayload(title, content, contentText, baseUpdatedAt) {
  const payload = {
    title: title || '未命名文档',
    content,
    content_text: contentText || '',
  };
  if (baseUpdatedAt) payload.base_updated_at = baseUpdatedAt;
  return payload;
}

function getDocumentSaveErrorMessage(err, fallback = '保存失败') {
  if (err?.response?.status === 413) {
    return '文档内容过大，保存失败。请联系运维确认服务端 RELATION_JSON_BODY_LIMIT 和反向代理 client_max_body_size 已配置为足够大小。';
  }
  return err?.response?.data?.error || err?.message || fallback;
}

function getDocumentAttachmentUploadErrorMessage(err, fallback = '附件上传失败') {
  if (err?.response?.status === 413) {
    return err?.response?.data?.error
      || '附件过大，上传失败。请联系运维确认服务端 RELATION_UPLOAD_FILE_SIZE_LIMIT 和反向代理 client_max_body_size 已配置为足够大小。';
  }
  return err?.response?.data?.error || err?.message || fallback;
}

function cloneBlocksForSync(blocks = []) {
  return contentToBlocks(blocksToContent(Array.isArray(blocks) ? blocks : []));
}

function cloneBlockForSync(block) {
  return cloneBlocksForSync(block ? [block] : [])[0] || null;
}

function getSyncBlockSignature(block) {
  if (!block) return '';
  return JSON.stringify(blocksToContent([block]).blocks[0] || null);
}

function areSyncBlocksEqual(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return getSyncBlockSignature(left) === getSyncBlockSignature(right);
}

function buildDocumentSyncSnapshot(title, blocks, extra = {}) {
  return {
    title: title || '',
    blocks: cloneBlocksForSync(blocks),
    updated_at: extra.updated_at || '',
    updated_by: extra.updated_by || null,
    updated_by_name: extra.updated_by_name || '',
  };
}

function mergeCollaborativeBlockOrder(baseBlocks = [], localBlocks = [], remoteBlocks = [], survivingIds = new Set()) {
  const result = [];
  const seen = new Set();
  const pushId = (id) => {
    if (!id || seen.has(id) || !survivingIds.has(id)) return false;
    result.push(id);
    seen.add(id);
    return true;
  };

  remoteBlocks.forEach(block => pushId(block?.id));

  localBlocks.forEach((block, index) => {
    const id = block?.id;
    if (!id || seen.has(id) || !survivingIds.has(id)) return;
    let inserted = false;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const prevId = localBlocks[cursor]?.id;
      const prevIndex = result.indexOf(prevId);
      if (prevIndex >= 0) {
        result.splice(prevIndex + 1, 0, id);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      for (let cursor = index + 1; cursor < localBlocks.length; cursor += 1) {
        const nextId = localBlocks[cursor]?.id;
        const nextIndex = result.indexOf(nextId);
        if (nextIndex >= 0) {
          result.splice(nextIndex, 0, id);
          inserted = true;
          break;
        }
      }
    }
    if (!inserted) result.push(id);
    seen.add(id);
  });

  baseBlocks.forEach(block => pushId(block?.id));
  return result;
}

function mergeCollaborativeDocumentSnapshots(baseSnapshot, localSnapshot, remoteSnapshot) {
  const base = buildDocumentSyncSnapshot(baseSnapshot?.title, baseSnapshot?.blocks || [], { updated_at: baseSnapshot?.updated_at });
  const local = buildDocumentSyncSnapshot(localSnapshot?.title, localSnapshot?.blocks || [], { updated_at: localSnapshot?.updated_at });
  const remote = buildDocumentSyncSnapshot(remoteSnapshot?.title, remoteSnapshot?.blocks || [], { updated_at: remoteSnapshot?.updated_at });

  const baseSignature = getDocumentSaveSignature(base.title, base.blocks);
  const localSignature = getDocumentSaveSignature(local.title, local.blocks);
  const remoteSignature = getDocumentSaveSignature(remote.title, remote.blocks);
  const localChanged = localSignature !== baseSignature;
  const remoteChanged = remoteSignature !== baseSignature;

  if (!remoteChanged) {
    return { title: local.title, blocks: local.blocks, hadRemoteChanges: false, hadConflicts: false };
  }
  if (!localChanged) {
    return { title: remote.title, blocks: remote.blocks, hadRemoteChanges: true, hadConflicts: false };
  }

  let hadConflicts = false;
  let mergedTitle = local.title;
  if (local.title === remote.title) {
    mergedTitle = local.title;
  } else if (local.title === base.title) {
    mergedTitle = remote.title;
  } else if (remote.title === base.title) {
    mergedTitle = local.title;
  } else {
    mergedTitle = local.title || remote.title || base.title || '未命名文档';
    hadConflicts = true;
  }

  const baseById = new Map(base.blocks.map(block => [block.id, block]));
  const localById = new Map(local.blocks.map(block => [block.id, block]));
  const remoteById = new Map(remote.blocks.map(block => [block.id, block]));
  const mergedById = new Map();

  Array.from(new Set([
    ...base.blocks.map(block => block.id),
    ...local.blocks.map(block => block.id),
    ...remote.blocks.map(block => block.id),
  ])).forEach(id => {
    const baseBlock = baseById.get(id) || null;
    const localBlock = localById.get(id) || null;
    const remoteBlock = remoteById.get(id) || null;
    const localBlockChanged = baseBlock ? !areSyncBlocksEqual(localBlock, baseBlock) : Boolean(localBlock);
    const remoteBlockChanged = baseBlock ? !areSyncBlocksEqual(remoteBlock, baseBlock) : Boolean(remoteBlock);

    let nextBlock = null;
    if (!baseBlock) {
      if (localBlock && remoteBlock) {
        if (!areSyncBlocksEqual(localBlock, remoteBlock)) hadConflicts = true;
        nextBlock = localBlock;
      } else {
        nextBlock = localBlock || remoteBlock;
      }
    } else if (localBlock && remoteBlock) {
      if (localBlockChanged && remoteBlockChanged && !areSyncBlocksEqual(localBlock, remoteBlock)) {
        hadConflicts = true;
        nextBlock = localBlock;
      } else if (remoteBlockChanged) {
        nextBlock = remoteBlock;
      } else {
        nextBlock = localBlock;
      }
    } else if (localBlock && !remoteBlock) {
      if (!localBlockChanged) {
        nextBlock = null;
      } else {
        hadConflicts = true;
        nextBlock = localBlock;
      }
    } else if (!localBlock && remoteBlock) {
      if (!remoteBlockChanged) {
        nextBlock = null;
      } else {
        hadConflicts = true;
        nextBlock = null;
      }
    }

    if (nextBlock) mergedById.set(id, cloneBlockForSync(nextBlock));
  });

  const mergedOrder = mergeCollaborativeBlockOrder(base.blocks, local.blocks, remote.blocks, new Set(mergedById.keys()));
  const mergedBlocks = mergedOrder
    .map(id => mergedById.get(id))
    .filter(Boolean);

  return {
    title: mergedTitle,
    blocks: mergedBlocks.length ? mergedBlocks : [createBlock()],
    hadRemoteChanges: true,
    hadConflicts,
  };
}

function saveDocumentDraftBeforeUnload(docId, payload, baseUpdatedAt = '') {
  const token = localStorage.getItem('token');
  const requestPayload = baseUpdatedAt ? { ...payload, base_updated_at: baseUpdatedAt } : payload;
  return fetch(`/api/documents/${docId}/content`, {
    method: 'PUT',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(requestPayload),
  }).catch(() => {});
}

async function requestDocumentPinState(docId, pinned) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/documents/${docId}/pin`, {
    method: pinned ? 'POST' : 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || '置顶操作失败');
  }
  return data;
}

function blockMetaToText(meta = {}) {
  const parts = [];
  if (meta.url) parts.push(meta.url);
  if (meta.display_name) parts.push(meta.display_name);
  if (meta.filename) parts.push(meta.filename);
  if (meta.tableName) parts.push(meta.tableName);
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

function serializeVisibleTableRows(visibleRows = [], fallbackColumns = []) {
  const baseColumns = Array.isArray(fallbackColumns) && fallbackColumns.length ? fallbackColumns : ['名称', '说明'];
  const sourceRows = Array.isArray(visibleRows) && visibleRows.length ? visibleRows : [baseColumns];
  const columnCount = Math.max(
    baseColumns.length,
    ...sourceRows.map(row => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const normalizedVisibleRows = sourceRows.map(row => Array.from({ length: columnCount }, (_, index) => row?.[index] || ''));
  return {
    columns: Array.from({ length: columnCount }, (_, index) => baseColumns[index] || `字段 ${index + 1}`),
    rows: normalizedVisibleRows,
  };
}

function normalizeTableBlockData(block) {
  const meta = { ...getDefaultBlockMeta(block?.type), ...cloneMeta(block?.meta) };
  const storedColumns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : ['名称', '说明'];
  const storedRows = Array.isArray(meta.rows) ? meta.rows : [['', '']];
  const columnCount = Math.max(
    storedColumns.length,
    ...storedRows.map(row => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const normalizedColumns = Array.from({ length: columnCount }, (_, index) => storedColumns[index] || '');
  const normalizedRows = (storedRows.length ? storedRows : [normalizedColumns.map(() => '')]).map(row => (
    Array.from({ length: columnCount }, (_, index) => row?.[index] || '')
  ));
  return {
    columns: normalizedColumns,
    rows: normalizedRows,
    mergedCells: normalizeTableMergedCells(meta.mergedCells, normalizedRows.length, columnCount),
    cellStyles: normalizeTableCellStyles(meta.cellStyles, normalizedRows.length, columnCount),
  };
}

function normalizeDatabaseFieldType(value, columnIndex = 0, columnName = '', options = {}) {
  const raw = String(value || '').trim().toLowerCase();
  const compact = raw.replace(/[\s-]+/g, '_');
  if (databaseFieldTypeMap[compact]) return compact;
  const aliasMap = {
    primary: 'title',
    name: 'title',
    single_select: 'select',
    status: 'select',
    enum: 'select',
    option: 'select',
    multiple_select: 'multi_select',
    multi: 'multi_select',
    rich_text: 'text',
    plain_text: 'text',
    datetime: 'date',
    created_time: 'date',
    updated_time: 'date',
    people: 'person',
    user: 'person',
    users: 'person',
    member: 'person',
    integer: 'number',
    float: 'number',
    decimal: 'number',
    link: 'url',
    boolean: 'checkbox',
    bool: 'checkbox',
  };
  if (aliasMap[compact]) return aliasMap[compact];
  if (compact === 'single_select') return 'select';
  if (compact === 'multi_select' || compact === 'multiple_select') return 'multi_select';
  if (compact === 'rich_text' || compact === 'plain_text') return 'text';
  if (compact === 'created_time' || compact === 'updated_time') return 'date';
  const hasExplicitType = raw.length > 0;
  if (!hasExplicitType && options.inferFromColumnName !== true) return columnIndex === 0 ? 'title' : 'text';
  const label = inlineHtmlToPlain(columnName || '').trim().toLowerCase();
  const source = hasExplicitType ? raw : label;
  if (/multi[_\s-]*select|multiple|checkboxes|多选/.test(source)) return 'multi_select';
  if (/select|single|option|status|tag|enum|choice|标签|状态|优先级|类型|单选/.test(source)) return 'select';
  if (/title|name|名称|标题|任务/.test(source)) return 'title';
  if (/date|time|deadline|due|日期|时间|完成时间/.test(source)) return 'date';
  if (/person|people|user|owner|member|assignee|负责人|人员|成员/.test(source)) return 'person';
  if (/number|amount|price|count|score|数字|数量|金额|预算/.test(source)) return 'number';
  if (/url|link|链接|地址/.test(source)) return 'url';
  if (/email|mail|邮箱|邮件/.test(source)) return 'email';
  if (/phone|mobile|tel|电话|手机/.test(source)) return 'phone';
  if (/check|bool|done|完成|勾选/.test(source)) return 'checkbox';
  return columnIndex === 0 ? 'title' : 'text';
}

function splitDatabaseTagValue(value = '') {
  const text = inlineHtmlToPlain(String(value || '')).trim();
  if (!text) return [];
  return text
    .split(/\s*(?:[、,，;；|]|\n)\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeDatabaseTagOption(option, index = 0) {
  const rawName = typeof option === 'string' || typeof option === 'number'
    ? option
    : (option?.name ?? option?.label ?? option?.title ?? option?.value ?? option?.text ?? '');
  const name = inlineHtmlToPlain(String(rawName || '')).trim();
  if (!name) return null;
  const rawColor = typeof option === 'object'
    ? (option.color || option.backgroundColor || option.background_color || option.bgColor || option.bg_color || option.fill)
    : '';
  return {
    name,
    color: normalizeCssColor(rawColor) || databaseTagColorOptions[index % databaseTagColorOptions.length],
  };
}

function normalizeDatabaseTagOptions(rawOptions, columnCount, fieldTypes = [], rows = []) {
  const source = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const normalized = {};
  Object.entries(source).forEach(([key, value]) => {
    const columnIndex = Number(key);
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= columnCount) return;
    const options = Array.isArray(value)
      ? value
      : (value && typeof value === 'object' ? Object.values(value) : []);
    const mapped = options
      .map((item, index) => normalizeDatabaseTagOption(item, index))
      .filter(Boolean);
    if (mapped.length) normalized[columnIndex] = mapped;
  });

  fieldTypes.forEach((type, columnIndex) => {
    if (!['select', 'multi_select', 'person'].includes(type) || normalized[columnIndex]?.length) return;
    const inferred = [];
    rows.forEach(row => {
      splitDatabaseTagValue(row?.[columnIndex]).forEach(name => {
        if (!inferred.some(item => item.name === name)) {
          inferred.push(normalizeDatabaseTagOption(name, inferred.length));
        }
      });
    });
    if (inferred.length) normalized[columnIndex] = inferred;
  });
  return normalized;
}

function normalizeDatabaseIndexedMap(rawMap, columnCount, normalizer = value => value) {
  if (!rawMap || typeof rawMap !== 'object') return {};
  return Object.entries(rawMap).reduce((acc, [key, value]) => {
    const columnIndex = Number(key);
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= columnCount) return acc;
    const normalized = normalizer(value);
    if (normalized !== undefined && normalized !== null && normalized !== '') acc[columnIndex] = normalized;
    return acc;
  }, {});
}

function normalizeDatabaseColumnIndex(value, columnCount) {
  const columnIndex = Number(value);
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= columnCount) return null;
  return columnIndex;
}

function normalizeDatabaseSorts(rawSorts, columnCount) {
  const sources = Array.isArray(rawSorts) ? rawSorts : (rawSorts ? [rawSorts] : []);
  return sources.reduce((acc, rule) => {
    if (!rule || typeof rule !== 'object') return acc;
    const columnIndex = normalizeDatabaseColumnIndex(rule.columnIndex ?? rule.column_index ?? rule.fieldIndex ?? rule.field_index, columnCount);
    if (columnIndex === null) return acc;
    const rawDirection = String(rule.direction || rule.order || rule.sort || 'asc').trim().toLowerCase();
    acc.push({
      columnIndex,
      direction: /desc|reverse|down|9|倒/.test(rawDirection) ? 'desc' : 'asc',
    });
    return acc;
  }, []);
}

function normalizeDatabaseFilters(rawFilters, columnCount, legacyFilter = null) {
  const sources = Array.isArray(rawFilters) ? rawFilters : (rawFilters ? [rawFilters] : []);
  if (legacyFilter && typeof legacyFilter === 'object') sources.push({
    columnIndex: legacyFilter.columnIndex,
    operator: 'contains_any',
    values: [legacyFilter.value],
  });
  const operatorSet = new Set(['contains_any', 'not_contains_any', 'is_empty', 'is_not_empty']);
  return sources.reduce((acc, rule) => {
    if (!rule || typeof rule !== 'object') return acc;
    const columnIndex = normalizeDatabaseColumnIndex(rule.columnIndex ?? rule.column_index ?? rule.fieldIndex ?? rule.field_index, columnCount);
    if (columnIndex === null) return acc;
    const rawValues = Array.isArray(rule.values)
      ? rule.values
      : (rule.value !== undefined && rule.value !== null ? [rule.value] : []);
    const values = rawValues
      .map(value => inlineHtmlToPlain(String(value || '')).trim())
      .filter(Boolean);
    const rawOperator = String(rule.operator || rule.condition || 'contains_any').trim().toLowerCase();
    const operator = operatorSet.has(rawOperator) ? rawOperator : 'contains_any';
    acc.push({ columnIndex, operator, values });
    return acc;
  }, []);
}

function normalizeDatabaseGroup(rawGroup, columnCount) {
  if (!rawGroup || typeof rawGroup !== 'object') {
    return { columnIndex: null, visibleValues: [], collapsed: {} };
  }
  const columnIndex = normalizeDatabaseColumnIndex(rawGroup.columnIndex ?? rawGroup.column_index ?? rawGroup.fieldIndex ?? rawGroup.field_index, columnCount);
  const visibleValues = Array.isArray(rawGroup.visibleValues || rawGroup.visible_values)
    ? (rawGroup.visibleValues || rawGroup.visible_values)
      .map(value => inlineHtmlToPlain(String(value || '')).trim())
      .filter(Boolean)
    : [];
  const collapsed = rawGroup.collapsed && typeof rawGroup.collapsed === 'object' ? rawGroup.collapsed : {};
  return {
    columnIndex,
    visibleValues,
    collapsed,
  };
}

function normalizeDatabaseBlockMeta(block) {
  const meta = { ...getDefaultBlockMeta('database-embed'), ...cloneMeta(block?.meta) };
  let storedColumns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : ['标题', '标签', '字段名'];
  let storedRows = Array.isArray(meta.rows) ? meta.rows : [['', '', '']];
  const shouldPromoteHeaderRow = Boolean(meta.headerRow || meta.hasHeaderRow);
  if (shouldPromoteHeaderRow && storedRows.length) {
    const firstRow = storedRows[0] || [];
    storedColumns = firstRow.map((cell, index) => inlineHtmlToPlain(cell).trim() || storedColumns[index] || `字段 ${index + 1}`);
    storedRows = storedRows.slice(1);
  }
  const columnCount = Math.max(
    storedColumns.length,
    ...storedRows.map(row => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const name = inlineHtmlToPlain(storedColumns[index] || '').trim();
    return name || (index === 0 ? '标题' : `字段名 ${index}`);
  });
  const rowsSource = storedRows.length
    ? storedRows
    : (meta.rowDataUnavailable ? [] : [columns.map(() => '')]);
  const rows = rowsSource.map(row => (
    Array.from({ length: columnCount }, (_, index) => row?.[index] || '')
  ));
  const rawFieldTypes = Array.isArray(meta.fieldTypes) ? meta.fieldTypes : [];
  const fieldTypes = Array.from({ length: columnCount }, (_, index) => (
    normalizeDatabaseFieldType(rawFieldTypes[index], index, columns[index], {
      inferFromColumnName: meta.inferFieldTypesFromColumns === true,
    })
  ));
  const tagOptions = normalizeDatabaseTagOptions(meta.tagOptions || meta.selectOptions || meta.options, columnCount, fieldTypes, rows);
  const columnWidths = Array.from({ length: columnCount }, (_, index) => (
    Math.max(120, Number(meta.columnWidths?.[index]) || (index === 0 ? 220 : 200))
  ));
  return {
    ...meta,
    tableName: String(meta.tableName || '').trim(),
    columns,
    rows,
    fieldTypes,
    tagOptions,
    columnWidths,
    columnColors: normalizeDatabaseIndexedMap(meta.columnColors, columnCount, normalizeCssColor),
    titleColorColumns: normalizeDatabaseIndexedMap(meta.titleColorColumns, columnCount, value => Boolean(value)),
    sorts: normalizeDatabaseSorts(meta.sorts || meta.sort, columnCount),
    filters: normalizeDatabaseFilters(meta.filters, columnCount, meta.filter),
    group: normalizeDatabaseGroup(meta.group, columnCount),
    filter: null,
  };
}

function getDatabaseTagStyle(option = {}) {
  const background = normalizeCssColor(option.color) || '#f3f4f6';
  return {
    background,
    borderColor: background,
    color: '#1f2937',
  };
}

function buildStoredTableMetaFromVisibleRows(visibleRows, fallbackColumns, extra = {}) {
  const serialized = serializeVisibleTableRows(visibleRows, fallbackColumns);
  return {
    columns: serialized.columns,
    rows: serialized.rows,
    ...extra,
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

function getWholeTableMatrix(block) {
  const { rows } = normalizeTableBlockData(block);
  return rows;
}

function getTableRangeMatrix(block, range) {
  const { columns, rows } = normalizeTableBlockData(block);
  const clampRow = rowIndex => Math.max(0, Math.min(rows.length - 1, Number(rowIndex) || 0));
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
    const sourceRow = rows[rowIndex];
    matrix.push(sourceRow.slice(fromColumn, toColumn + 1));
  }
  return {
    matrix,
    fromRow,
    toRow,
    fromColumn,
    toColumn,
  };
}

function getTableClipboardFormatting(block, tablePayload) {
  const meta = { ...getDefaultBlockMeta(block?.type), ...cloneMeta(block?.meta) };
  const normalized = normalizeTableBlockData(block);
  const fromRow = Number.isInteger(tablePayload?.fromRow) ? tablePayload.fromRow : 0;
  const toRow = Number.isInteger(tablePayload?.toRow) ? tablePayload.toRow : normalized.rows.length - 1;
  const fromColumn = Number.isInteger(tablePayload?.fromColumn) ? tablePayload.fromColumn : 0;
  const toColumn = Number.isInteger(tablePayload?.toColumn) ? tablePayload.toColumn : normalized.columns.length - 1;
  const columnCount = Math.max(0, toColumn - fromColumn + 1);
  const columnWidths = Array.from({ length: columnCount }, (_, columnOffset) => (
    meta.columnWidths?.[fromColumn + columnOffset]
  ));
  const rowColumnWidths = Object.entries(meta.rowColumnWidths || {}).reduce((result, [rowKey, widths]) => {
    const sourceRowIndex = Number(rowKey);
    if (!Number.isInteger(sourceRowIndex) || sourceRowIndex < fromRow || sourceRowIndex > toRow || !Array.isArray(widths)) return result;
    result[sourceRowIndex - fromRow] = widths.slice(fromColumn, toColumn + 1);
    return result;
  }, {});
  const rowHeights = Object.entries(meta.rowHeights || {}).reduce((result, [rowKey, height]) => {
    const sourceRowIndex = Number(rowKey);
    if (Number.isInteger(sourceRowIndex) && sourceRowIndex >= fromRow && sourceRowIndex <= toRow) {
      result[sourceRowIndex - fromRow] = height;
    }
    return result;
  }, {});
  const mergedCells = normalized.mergedCells
    .filter(merge => (
      merge.rowIndex >= fromRow
      && merge.columnIndex >= fromColumn
      && merge.rowIndex + merge.rowSpan - 1 <= toRow
      && merge.columnIndex + merge.colSpan - 1 <= toColumn
    ))
    .map(merge => ({
      ...merge,
      rowIndex: merge.rowIndex - fromRow,
      columnIndex: merge.columnIndex - fromColumn,
    }));
  const cellStyles = Object.entries(normalized.cellStyles).reduce((result, [key, style]) => {
    const [sourceRowIndex, sourceColumnIndex] = key.split(':').map(Number);
    if (
      sourceRowIndex >= fromRow
      && sourceRowIndex <= toRow
      && sourceColumnIndex >= fromColumn
      && sourceColumnIndex <= toColumn
    ) {
      result[`${sourceRowIndex - fromRow}:${sourceColumnIndex - fromColumn}`] = style;
    }
    return result;
  }, {});
  return {
    columnWidths,
    rowColumnWidths,
    rowHeights,
    mergedCells,
    cellStyles,
    horizontalCenter: Boolean(meta.horizontalCenter),
    verticalCenter: Boolean(meta.verticalCenter),
  };
}

function buildTableClipboardPayload(block, range = null) {
  const tablePayload = range
    ? getTableRangeMatrix(block, range)
    : { matrix: getWholeTableMatrix(block) };
  const tableText = tableMatrixToTsv(tablePayload.matrix);
  const formatting = getTableClipboardFormatting(block, tablePayload);
  const tableHtml = buildOfficeTableHtml({
    rows: tablePayload.matrix,
    ...formatting,
    sanitizeCellHtml: sanitizeInlineHtml,
    tableAttributes: 'data-document-table-block="true"',
  });
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
    html: tableHtml,
    blocks,
  };
}

function blockToClipboardPayload(block) {
  if (!block) return { text: '', html: '' };
  if (isTableLikeBlock(block)) return buildTableClipboardPayload(block);
  const blocks = [{
    type: block.type || 'paragraph',
    content: block.type === 'divider' ? '' : (block.content || ''),
    checked: Boolean(block.checked),
    highlight: block.highlight || '',
    meta: cloneMeta(block.meta),
  }];
  if (block.type === 'divider') {
    return { text: '---', html: buildOfficeTextBlockHtml({ type: 'divider' }), blocks };
  }
  const text = blocksToText([block]);
  const content = sanitizeInlineHtml(block.content || '');
  const label = blockTypeMap[block.type]?.label || '';
  return {
    text,
    html: buildOfficeTextBlockHtml({
      type: block.type,
      content,
      checked: block.checked,
      highlight: block.highlight,
      indent: block.meta?.indent,
      body: sanitizeInlineHtml(block.meta?.body || ''),
      fallbackHtml: text ? escapeHtml(text) : escapeHtml(label),
    }),
    blocks,
  };
}

function blocksToClipboardPayload(blocks = []) {
  const payloads = blocks.map(blockToClipboardPayload).filter(payload => payload.text || payload.html);
  const structuredBlocks = payloads.flatMap(payload => payload.blocks || []);
  const html = payloads.map(payload => payload.html).filter(Boolean).join('');
  const encoded = encodeURIComponent(JSON.stringify({ blocks: structuredBlocks }));
  return {
    text: payloads.map(payload => payload.text).filter(Boolean).join('\n\n'),
    html: buildOfficeClipboardEnvelope(html, {
      attributeName: documentClipboardBlocksHtmlAttr,
      encodedPayload: encoded,
    }),
    blocks: structuredBlocks,
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
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.blocks)) return parsed.blocks;
    } catch {
      // Fall through to the HTML envelope used by menu-based copy.
    }
  }
  const html = clipboardData?.getData?.('text/html') || '';
  if (!html || typeof document === 'undefined') return [];
  const container = document.createElement('div');
  container.innerHTML = html;
  const encoded = container.querySelector(`[${documentClipboardBlocksHtmlAttr}]`)
    ?.getAttribute(documentClipboardBlocksHtmlAttr);
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  } catch {
    return [];
  }
}

function getPastedInlineClipboardHtml(clipboardData) {
  const html = clipboardData?.getData?.('text/html') || '';
  const normalizedHtml = normalizePastedInlineHtml(html);
  if (normalizedHtml) return normalizedHtml;
  const text = clipboardData?.getData?.('text/plain') || '';
  return text ? sanitizeInlineHtml(escapeHtml(text).replace(/\r\n?|\n/g, '<br>')) : '';
}

function insertPastedInlineHtml(editor, html) {
  if (!editor?.isContentEditable || !html || typeof document === 'undefined') return false;
  editor.focus();
  const selection = window.getSelection?.();
  if (!selection) return false;

  let range = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const inputEvent = typeof window.InputEvent === 'function'
    ? new window.InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' })
    : new Event('input', { bubbles: true });
  editor.dispatchEvent(inputEvent);
  return true;
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
    const maxColumnCount = Math.max(...matrix.map(row => row.length), 1);
    const columns = Array.from({ length: maxColumnCount }, (_, index) => `字段 ${index + 1}`);
    const rows = (matrix.length ? matrix : [Array.from({ length: columns.length }, () => '')])
      .map(row => columns.map((_, index) => row[index] || ''));
    return {
      type: 'table-simple',
      content: '',
      meta: {
        ...getDefaultBlockMeta('table-simple'),
        columns,
        rows,
        mergedCells: [],
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

function getDirectoryProjectGroupLabel(item = {}) {
  if (!item) return '';
  const projectLabel = String(item.project_group_name || item.project_code || '').trim();
  const itemDomainLabel = domainLabel[item.domain] || item.domain;
  if (!projectLabel || projectLabel === '未关联项目组') return '';
  if (projectLabel === itemDomainLabel || projectLabel === item.domain) return '';
  return projectLabel;
}

function getDocumentSpaceDomainKeys(scopedFolders, activeDomain) {
  if (activeDomain !== 'all') return activeDomain ? [activeDomain] : [];
  const domainSet = new Set(scopedFolders.map(folder => folder.domain || 'general'));
  const keys = [...primaryDocumentSpaceDomains];
  domainOptions
    .map(option => option.value)
    .filter(value => value !== 'all' && domainSet.has(value) && !keys.includes(value))
    .forEach(value => keys.push(value));
  [...domainSet]
    .filter(value => !keys.includes(value))
    .forEach(value => keys.push(value));
  return keys;
}

function buildFolderPathMap(folders = []) {
  const byId = new Map(folders.map(folder => [Number(folder.id), folder]));
  const pathMap = new Map();
  const resolvePath = (folder, seen = new Set()) => {
    if (!folder?.id || seen.has(Number(folder.id))) return [];
    if (pathMap.has(Number(folder.id))) return pathMap.get(Number(folder.id));
    seen.add(Number(folder.id));
    const parent = folder.parent_id ? byId.get(Number(folder.parent_id)) : null;
    const parentPath = parent ? resolvePath(parent, seen) : [];
    const path = [...parentPath, folder.name].filter(Boolean);
    pathMap.set(Number(folder.id), path);
    return path;
  };
  folders.forEach(folder => resolvePath(folder));
  return pathMap;
}

function normalizeDocumentFolderSelectValue(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function renderDocumentTreeTitle(title, nodeType = 'document', iconKey = '') {
  const text = String(title || '未命名文档');
  const icon = nodeType === 'document' ? getDocumentIconOption(iconKey) : null;
  return (
    <span
      className={`document-tree-title document-tree-title-${nodeType}`}
      title={text}
    >
      <span className={`document-tree-item-icon${icon ? ' document-tree-item-icon-custom' : ''}`} aria-hidden="true">
        {icon?.symbol || null}
      </span>
      <span className="document-tree-title-text">{text}</span>
    </span>
  );
}

function renderDocumentTreeSwitcher({ expanded, isLeaf }) {
  if (isLeaf) return <span className="document-tree-leaf-dot" aria-hidden="true" />;
  return (
    <span
      className={`document-tree-switcher-chevron${expanded ? ' is-expanded' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M6 3.5L10.5 8L6 12.5" />
      </svg>
    </span>
  );
}

function buildFolderNode(folder, childrenByParent, documentsByFolder, folderSelectionMap, folderCheckboxEnabled) {
  const folderDocuments = documentsByFolder.get(Number(folder.id)) || [];
  const childFolders = (childrenByParent.get(Number(folder.id)) || [])
    .map(child => buildFolderNode(child, childrenByParent, documentsByFolder, folderSelectionMap, folderCheckboxEnabled));
  const documentChildren = folderDocuments.map(doc => ({
    title: renderDocumentTreeTitle(doc.title || '未命名文档', 'document', doc.icon_key),
    key: `document-${doc.id}`,
    icon: <FileTextOutlined />,
    isLeaf: true,
    nodeType: 'document',
    documentId: doc.id,
    folderId: folder.id,
    document: doc,
    disableCheckbox: !Number(doc.can_edit || 0),
  }));
  const children = [...childFolders, ...documentChildren];
  const folderSelection = folderSelectionMap.get(Number(folder.id)) || { documentIds: [], editableDocumentIds: [] };
  return {
    title: renderDocumentTreeTitle(folder.name, 'folder'),
    key: `folder-${folder.id}`,
    icon: <FolderOutlined />,
    nodeType: 'folder',
    folderId: folder.id,
    folder,
    depth: Number(folder.depth || 0),
    canAddChild: Boolean(Number(folder.can_add_child || 0)),
    canEditFolder: Boolean(Number(folder.can_edit_folder || 0)),
    canDeleteFolder: Boolean(Number(folder.can_delete_folder || 0)),
    documentIds: folderSelection.documentIds,
    bulkDocumentIds: folderSelection.editableDocumentIds,
    disableCheckbox: !folderCheckboxEnabled || !folderSelection.editableDocumentIds.length,
    ...(children.length ? { children } : {}),
  };
}

function buildFolderTree(folders, activeDomain, visibleDocuments = [], options = {}) {
  const scopedFolders = activeDomain === 'all'
    ? folders
    : folders.filter(folder => folder.domain === activeDomain);
  const domainMap = new Map();
  const documentsByFolder = new Map();
  const childrenByParent = new Map();

  visibleDocuments.forEach(doc => {
    if (!doc.folder_id) return;
    const folderKey = Number(doc.folder_id);
    if (!documentsByFolder.has(folderKey)) documentsByFolder.set(folderKey, []);
    documentsByFolder.get(folderKey).push(doc);
  });

  scopedFolders
    .slice()
    .sort((a, b) => (
      Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN')
      || Number(a.id || 0) - Number(b.id || 0)
    ))
    .forEach(folder => {
      const parentKey = folder.parent_id ? Number(folder.parent_id) : 0;
      if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
      childrenByParent.get(parentKey).push(folder);
    });

  getDocumentSpaceDomainKeys(scopedFolders, activeDomain).forEach(domainKey => {
    if (!domainMap.has(domainKey)) {
      domainMap.set(domainKey, {
        title: renderDocumentTreeTitle(domainLabel[domainKey] || domainKey, 'domain'),
        key: `domain-${domainKey}`,
        nodeType: 'domain',
        selectable: false,
        disableCheckbox: true,
        children: [],
      });
    }
  });

  (childrenByParent.get(0) || []).forEach(folder => {
    const domainKey = folder.domain || 'general';
    if (!domainMap.has(domainKey)) {
      domainMap.set(domainKey, {
        title: renderDocumentTreeTitle(domainLabel[domainKey] || domainKey, 'domain'),
        key: `domain-${domainKey}`,
        nodeType: 'domain',
        selectable: false,
        disableCheckbox: true,
        children: [],
      });
    }
    domainMap.get(domainKey).children.push(buildFolderNode(
      folder,
      childrenByParent,
      documentsByFolder,
      options.folderSelectionMap || new Map(),
      Boolean(options.folderCheckboxEnabled)
    ));
  });

  return Array.from(domainMap.values());
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
  media_management: '媒体管理菜单授权',
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

function getFolderPathLabel(folder, folderPathMap = null) {
  if (!folder) return '';
  const pathParts = folderPathMap?.get?.(Number(folder.id)) || [folder.name];
  return [
    domainLabel[folder.domain] || folder.domain,
    ...pathParts,
  ].filter(Boolean).join(' / ');
}

function getFolderInnerPathLabel(folder, folderPathMap = null) {
  if (!folder) return '';
  const pathParts = folderPathMap?.get?.(Number(folder.id)) || [folder.name];
  return pathParts.filter(Boolean).join(' / ');
}

function isDocumentFolderCompatibleWithLocation(folder, values = {}) {
  if (!folder) return false;
  if (values.domain && folder.domain !== values.domain) return false;
  if (values.department_key && folder.department_key !== values.department_key) return false;
  if (values.doc_type && folder.default_doc_type !== values.doc_type) return false;
  return true;
}

function getDocumentFolderOptionsForLocation(folders = [], folderPathMap = null, values = {}) {
  return folders
    .filter(folder => isDocumentFolderCompatibleWithLocation(folder, values))
    .map(folder => ({
      value: Number(folder.id),
      label: getFolderPathLabel(folder, folderPathMap),
    }));
}

function getManagedDocumentDomainForProjectGroup(projectGroups = [], projectGroupId) {
  const id = Number(projectGroupId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const projectGroup = projectGroups.find(item => Number(item.id) === id);
  return managedDocumentDomainByProjectCode[String(projectGroup?.code || '').trim().toUpperCase()] || null;
}

function getDocumentPathLabel(doc) {
  if (!doc) return '未归档';
  const parts = [
    domainLabel[doc.domain] || doc.domain,
    getDirectoryProjectGroupLabel(doc),
    departmentLabel[doc.department_key] || doc.department_key,
    doc.folder_name,
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '未归档';
}

function getDocumentIconOption(iconKey = '') {
  return documentIconMap[String(iconKey || '').trim()] || null;
}

function renderDocumentInlineIcon(doc = {}, style = {}) {
  if (isSpreadsheetDocument(doc)) {
    return <TableOutlined style={{ color: '#0f766e', ...style }} />;
  }
  const icon = getDocumentIconOption(doc.icon_key);
  if (!icon) return <FileTextOutlined style={{ color: '#6b7280', ...style }} />;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        lineHeight: '18px',
        fontSize: 15,
        flex: '0 0 auto',
        ...style,
      }}
    >
      {icon.symbol}
    </span>
  );
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDocumentSearchHighlightTerms(keyword, exact) {
  const text = String(keyword || '').trim();
  if (!text) return [];
  const terms = exact ? [text] : text.split(/\s+/).map(item => item.trim()).filter(Boolean);
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

function renderHighlightedDocumentSearchText(value, keyword, exact) {
  const text = String(value || '');
  const terms = getDocumentSearchHighlightTerms(keyword, exact);
  if (!text || terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const nodes = [];
  let lastIndex = 0;
  Array.from(text.matchAll(pattern)).forEach((match, index) => {
    const start = match.index || 0;
    const matchText = match[0];
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <mark
        key={`${matchText}-${start}-${index}`}
        style={{ background: 'transparent', color: '#dc2626', padding: 0, fontWeight: 700 }}
      >
        {matchText}
      </mark>
    );
    lastIndex = start + matchText.length;
  });
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : text;
}

function isDocumentAdminUser(user) {
  return documentAdminRoles.has(user?.role);
}

function parseStoredTimestamp(value) {
  return parseBusinessDateTime(value);
}

function formatChangeLogTime(value) {
  return formatBusinessDateTime(value, 'YYYY-MM-DD HH:mm', String(value || '').slice(0, 16) || '-');
}

function formatDocumentTimestamp(value) {
  return formatBusinessDateTime(value, 'YYYY-MM-DD HH:mm', String(value || '').slice(0, 16) || '-');
}

function formatEditRecordTime(value) {
  return formatBusinessDateTime(value, 'YYYY-MM-DD HH:mm', String(value || '').slice(0, 16) || '-');
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
  onMentionTrigger,
  style,
}) {
  const editorRef = useRef(null);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const compositionEndedAtRef = useRef(0);
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

  const detectMention = () => {
    if (composingRef.current) return;
    const trigger = getContentEditableMentionTrigger(editorRef.current);
    onMentionTrigger?.(trigger || null);
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
          compositionEndedAtRef.current = 0;
          emitChange();
          onBlur?.(event);
        }}
        onCompositionStart={(event) => {
          composingRef.current = true;
          compositionEndedAtRef.current = 0;
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          compositionEndedAtRef.current = Date.now();
          emitChange();
          onCompositionEnd?.(event);
        }}
        onInput={() => {
          if (composingRef.current) {
            getEditorHtml();
            return;
          }
          emitChange();
          window.setTimeout(detectMention, 0);
        }}
        onMouseUp={onMouseUp}
        onKeyUp={(event) => {
          onKeyUp?.(event);
          if (event.key === '@' || event.key === 'Backspace' || event.key === 'Delete' || event.key.length === 1) {
            window.setTimeout(detectMention, 0);
          }
        }}
        onKeyDown={(event) => {
          if (isContentEditableComposing(event, composingRef.current)) return;
          if (shouldSuppressEnterAfterComposition(event, compositionEndedAtRef.current)) {
            compositionEndedAtRef.current = 0;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const simpleDelete = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !composingRef.current;
          if ((event.key === 'Delete' || event.key === 'Backspace') && simpleDelete) {
            if (removeAdjacentMentionFromContentEditable(editorRef.current, event)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
          }
          onKeyDown?.(event);
        }}
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
  const timestamp = rawTime ? parseStoredTimestamp(rawTime).valueOf() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortEditRecordsLatestFirst(records = []) {
  return [...records].sort((a, b) => {
    const timeDiff = getEditRecordSortTime(b) - getEditRecordSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

export default function Documents({ embedded = false, embeddedDocumentId = null }) {
  const { user: currentUser } = useAuth();
  const screens = useBreakpoint();
  const [searchParams, setSearchParams] = useSearchParams();
  const [enableUniverSpreadsheetPreview, setEnableUniverSpreadsheetPreview] = useState(readStoredUniverSpreadsheetPreviewFlag);
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
  const [tableMenuContext, setTableMenuContext] = useState(null);
  const [selectedSpreadsheetCell, setSelectedSpreadsheetCell] = useState({ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 });
  const [spreadsheetCollaborators, setSpreadsheetCollaborators] = useState([]);
  const [spreadsheetContextAutoCollapsed, setSpreadsheetContextAutoCollapsed] = useState(false);
  const [spreadsheetFocusMode, setSpreadsheetFocusMode] = useState(false);
  const [selectedAreaBlockIds, setSelectedAreaBlockIds] = useState([]);
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [openBlockMenuId, setOpenBlockMenuId] = useState(null);
  const [blockMenuTargetIds, setBlockMenuTargetIds] = useState([]);
  const [inlineToolbar, setInlineToolbar] = useState(null);
  const [mentionState, setMentionState] = useState(null);
  const [commentComposer, setCommentComposer] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [activeCommentBlockId, setActiveCommentBlockId] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [mobileLibraryVisible, setMobileLibraryVisible] = useState(false);
  const [domainFilter, setDomainFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchKeyword, setGlobalSearchKeyword] = useState('');
  const [globalSearchTitleOnly, setGlobalSearchTitleOnly] = useState(false);
  const [globalSearchExact, setGlobalSearchExact] = useState(false);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertySaving, setPropertySaving] = useState(false);
  const [wolaiImportOpen, setWolaiImportOpen] = useState(false);
  const [wolaiImportSaving, setWolaiImportSaving] = useState(false);
  const [wolaiImportTargetDoc, setWolaiImportTargetDoc] = useState(null);
  const [documentImportFileList, setDocumentImportFileList] = useState([]);
  const [optionsSaving, setOptionsSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPropertyDoc, setEditingPropertyDoc] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareDraft, setShareDraft] = useState(emptyShareDraft());
  const [bulkShareMode, setBulkShareMode] = useState(false);
  const [bulkSelectedDocIds, setBulkSelectedDocIds] = useState([]);
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkShareDraft, setBulkShareDraft] = useState(emptyShareDraft());
  const [bulkShareLoading, setBulkShareLoading] = useState(false);
  const [bulkShareSaving, setBulkShareSaving] = useState(false);
  const [bulkShareDocuments, setBulkShareDocuments] = useState([]);
  const [bulkShareDocumentsLoading, setBulkShareDocumentsLoading] = useState(false);
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [changeLogRefreshing, setChangeLogRefreshing] = useState(false);
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
  const [folderContextMenu, setFolderContextMenu] = useState({ open: false, x: 0, y: 0, folder: null });
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderCreateParent, setFolderCreateParent] = useState(null);
  const [folderCreateSaving, setFolderCreateSaving] = useState(false);
  const [folderRenameOpen, setFolderRenameOpen] = useState(false);
  const [folderRenameTarget, setFolderRenameTarget] = useState(null);
  const [folderRenameSaving, setFolderRenameSaving] = useState(false);
  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState(null);
  const [folderDeleteSaving, setFolderDeleteSaving] = useState(false);
  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState(null);
  const [moveFolderDoc, setMoveFolderDoc] = useState(null);
  const [moveFolderSaving, setMoveFolderSaving] = useState(false);
  const [editorUndoStack, setEditorUndoStack] = useState([]);
  const [folderSidebarCollapsed, setFolderSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(documentFolderSidebarCollapsedStorageKey) === '1';
  });
  const [folderSidebarWidth, setFolderSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return documentFolderSidebarDefaultWidth;
    const stored = window.localStorage.getItem(documentFolderSidebarWidthStorageKey);
    return clampDocumentFolderSidebarWidth(stored || documentFolderSidebarDefaultWidth);
  });
  const [folderTreeExpandedKeys, setFolderTreeExpandedKeys] = useState([]);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationSlideIndex, setPresentationSlideIndex] = useState(0);
  const [shareLinkError, setShareLinkError] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [spreadsheetImporting, setSpreadsheetImporting] = useState(false);
  const [remoteUpdateHint, setRemoteUpdateHint] = useState('');
  const [spreadsheetConflictNotice, setSpreadsheetConflictNotice] = useState(null);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);
  const [blockDragState, setBlockDragState] = useState(null);
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
  const selectAllEditorBlocksRef = useRef(false);
  const blockHandleSelectionRef = useRef(null);
  const activeEditorSnapshotRef = useRef(null);
  const liveEditorSnapshotRef = useRef(null);
  const remoteDocumentSnapshotRef = useRef({});
  const selectedDocIdRef = useRef(null);
  const docTabStatesRef = useRef({});
  const documentSelectionVersionRef = useRef(0);
  const documentListRequestRef = useRef(null);
  const documentListRequestSequenceRef = useRef(0);
  const detailRequestIdsRef = useRef({});
  const activeDetailLoadingRef = useRef(null);
  const lastSavedSignatureRef = useRef({});
  const documentSyncTimerRef = useRef(null);
  const spreadsheetEventAbortRef = useRef(null);
  const spreadsheetEventRetryTimerRef = useRef(null);
  const spreadsheetPresenceIntervalRef = useRef(null);
  const spreadsheetPresenceDebounceRef = useRef(null);
  const spreadsheetPresenceSessionIdRef = useRef(null);
  const spreadsheetSelectionRef = useRef(null);
  const selectedSpreadsheetCellRef = useRef(selectedSpreadsheetCell);
  const liveSyncPendingDocIdsRef = useRef(new Set());
  const dirtyDocumentIdsRef = useRef(new Set());
  const documentVisibilityStateRef = useRef(typeof document === 'undefined' ? 'visible' : document.visibilityState);
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
  const globalSearchInputRef = useRef(null);
  const replaceAttachmentInputRef = useRef(null);
  const replaceAttachmentTargetRef = useRef(null);
  if (!spreadsheetPresenceSessionIdRef.current) {
    spreadsheetPresenceSessionIdRef.current = createSpreadsheetPresenceSessionId();
  }
  selectedSpreadsheetCellRef.current = selectedSpreadsheetCell;
  const [createForm] = Form.useForm();
  const [wolaiImportForm] = Form.useForm();
  const [changeLogForm] = Form.useForm();
  const [folderCreateForm] = Form.useForm();
  const [folderRenameForm] = Form.useForm();

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
      .document-folder-tree {
        padding: 2px 0 8px;
        background: #f7f7f7 !important;
        color: #5f6368;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 15px;
        font-weight: 500;
        line-height: 22px;
      }
      .document-folder-tree .ant-tree-list-holder-inner {
        row-gap: 2px;
      }
      .document-folder-tree .ant-tree-treenode {
        position: relative;
        align-items: center;
        width: 100%;
        min-height: 34px;
        padding: 0 0 2px 0 !important;
        max-width: 100%;
      }
      .document-folder-tree .ant-tree-treenode::before {
        content: "";
        position: absolute;
        inset: 1px 0 3px;
        border-radius: 6px;
        opacity: 0;
        transition: opacity 0.12s ease;
      }
      .document-folder-tree .ant-tree-treenode:hover::before {
        background: #eeeeee;
        opacity: 1;
      }
      .document-folder-tree .ant-tree-treenode-selected::before {
        background: #e9e9e9;
        opacity: 1;
      }
      .document-folder-tree .ant-tree-indent,
      .document-folder-tree .ant-tree-switcher,
      .document-folder-tree .ant-tree-node-content-wrapper {
        position: relative;
        z-index: 1;
      }
      .document-folder-tree .ant-tree-indent-unit {
        width: 32px;
      }
      .document-folder-tree .ant-tree-switcher {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 30px;
        width: 30px;
        height: 34px;
        line-height: 34px;
        color: #858585;
      }
      .document-folder-tree .ant-tree-switcher:hover {
        color: #6f6f6f;
      }
      .document-folder-tree .ant-tree-switcher-noop {
        cursor: default;
      }
      .document-tree-switcher-chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        transform: rotate(0deg);
        transition: transform 0.12s ease;
      }
      .document-tree-switcher-chevron.is-expanded {
        transform: rotate(90deg);
      }
      .document-tree-switcher-chevron svg {
        width: 16px;
        height: 16px;
      }
      .document-tree-switcher-chevron path {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .document-tree-leaf-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #acacac;
      }
      .document-folder-tree .ant-tree-node-content-wrapper {
        display: inline-flex;
        align-items: center;
        flex: 1 1 auto;
        height: 34px;
        padding: 0 8px 0 0 !important;
        border-radius: 6px;
        background: transparent !important;
        color: inherit;
        min-width: 0;
        max-width: calc(100% - 30px);
      }
      .document-folder-tree .ant-tree-node-content-wrapper:hover,
      .document-folder-tree .ant-tree-node-content-wrapper.ant-tree-node-selected {
        background: transparent !important;
      }
      .document-folder-tree .ant-tree-title {
        display: block;
        width: 100%;
        min-width: 0;
        overflow: hidden;
      }
      .document-tree-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
        color: #5c5f63;
      }
      .document-tree-item-icon {
        position: relative;
        flex: 0 0 18px;
        width: 18px;
        height: 18px;
        border: 1.8px solid #8a8d90;
        border-radius: 4px;
        background: #f7f7f7;
      }
      .document-tree-item-icon::before {
        content: "";
        position: absolute;
        left: 4px;
        right: 4px;
        top: 5px;
        height: 1.8px;
        border-radius: 999px;
        background: #8a8d90;
        box-shadow: 0 5px 0 #8a8d90;
      }
      .document-tree-title-folder .document-tree-item-icon,
      .document-tree-title-domain .document-tree-item-icon {
        height: 14px;
        margin-top: 2px;
        border: 0;
        border-radius: 3px;
        background: linear-gradient(180deg, #7dd3fc 0%, #38bdf8 100%);
        box-shadow: inset 0 -1px 0 rgba(14, 116, 144, 0.18);
      }
      .document-tree-title-folder .document-tree-item-icon::before,
      .document-tree-title-domain .document-tree-item-icon::before {
        content: "";
        position: absolute;
        left: 1px;
        top: -4px;
        width: 10px;
        height: 5px;
        border-radius: 3px 3px 0 0;
        background: #67c6ee;
        box-shadow: none;
      }
      .document-tree-item-icon-custom {
        border: 0;
        background: transparent;
        border-radius: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        line-height: 18px;
      }
      .document-tree-item-icon-custom::before {
        display: none;
      }
      .document-tree-title-text {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .document-sidebar-resize-handle:hover .document-sidebar-resize-line,
      .document-sidebar-resize-handle:active .document-sidebar-resize-line {
        background: #6366f1 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {};
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      documentFolderSidebarCollapsedStorageKey,
      folderSidebarCollapsed ? '1' : '0'
    );
  }, [folderSidebarCollapsed]);

  useEffect(() => {
    setSpreadsheetContextAutoCollapsed(false);
  }, [selectedDocId]);

  useEffect(() => {
    const nextPreviewFlag = getUniverSpreadsheetPreviewSearchFlag(searchParams);
    if (nextPreviewFlag === null) return;
    persistUniverSpreadsheetPreviewFlag(nextPreviewFlag);
    setEnableUniverSpreadsheetPreview(nextPreviewFlag);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      documentFolderSidebarWidthStorageKey,
      String(clampDocumentFolderSidebarWidth(folderSidebarWidth))
    );
  }, [folderSidebarWidth]);

  const folderPathMap = useMemo(() => buildFolderPathMap(folders), [folders]);
  const defaultDocumentCxoUsers = useMemo(() => getDefaultDocumentCxoUsers(users), [users]);
  const defaultDocumentCxoUserIds = useMemo(
    () => defaultDocumentCxoUsers.map(user => Number(user.id)).filter(Boolean),
    [defaultDocumentCxoUsers]
  );
  const defaultDocumentCxoUserIdSet = useMemo(
    () => new Set(defaultDocumentCxoUserIds),
    [defaultDocumentCxoUserIds]
  );

  const bulkFolderSelectionMap = useMemo(
    () => buildFolderDocumentSelectionMap(folders, bulkShareDocuments),
    [folders, bulkShareDocuments]
  );
  const folderTree = useMemo(
    () => buildFolderTree(folders, domainFilter, folderTreeDocuments, {
      folderSelectionMap: bulkFolderSelectionMap,
      folderCheckboxEnabled: bulkShareMode && !bulkShareDocumentsLoading,
    }),
    [folders, domainFilter, folderTreeDocuments, bulkFolderSelectionMap, bulkShareMode, bulkShareDocumentsLoading]
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
  const bulkSelectedDocIdSet = useMemo(
    () => new Set(bulkSelectedDocIds.map(id => Number(id)).filter(Boolean)),
    [bulkSelectedDocIds]
  );
  const bulkTreeCheckState = useMemo(
    () => buildBulkShareTreeCheckState(folderTree, bulkSelectedDocIds),
    [folderTree, bulkSelectedDocIds]
  );
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
  const selectedDocProjectGroupTag = getDirectoryProjectGroupLabel(selectedDoc);
  const selectedDocDepartmentTag = departmentLabel[selectedDoc?.department_key] || selectedDoc?.department_key || '';
  const selectedDocTypeTag = docTypeLabel[selectedDoc?.doc_type] || selectedDoc?.doc_type || '';
  const selectedSpreadsheetContentSignature = isSpreadsheetDocument(selectedDoc)
    ? getDocumentContentSignature(selectedDoc.content)
    : '';
  const selectedDocFolder = selectedDoc?.folder_id
    ? folders.find(folder => Number(folder.id) === Number(selectedDoc.folder_id))
    : null;
  const selectedDocFolderPathTag = selectedDocFolder
    ? getFolderInnerPathLabel(selectedDocFolder, folderPathMap)
    : (selectedDoc?.folder_name || '');
  const compactSpreadsheetWorkspace = !embedded && !isMobile && isSpreadsheetDocument(selectedDoc);
  const spreadsheetWorkspaceChrome = getSpreadsheetWorkspaceChromeState({
    autoCollapsed: spreadsheetContextAutoCollapsed,
    focusMode: spreadsheetFocusMode,
  });
  const deepLinkedDocId = useMemo(() => {
    const embeddedId = Number(embeddedDocumentId);
    if (embedded && Number.isInteger(embeddedId) && embeddedId > 0) return embeddedId;
    return getDocumentIdFromSearch(searchParams);
  }, [embedded, embeddedDocumentId, searchParams]);
  const mobileHasEditorTarget = Boolean(selectedDocId || selectedDoc || shareLinkError);
  const showMobileEditor = isMobile && mobileHasEditorTarget && !mobileLibraryVisible;
  const showDocumentLibrary = !embedded && (!isMobile || !showMobileEditor);
  const showDocumentEditor = embedded || !isMobile || showMobileEditor;
  liveEditorSnapshotRef.current = {
    title: editorTitle,
    blocks: editorBlocks,
    selectedBlockId,
  };

  const getDocTabId = (id) => Number(id);

  const replaceDocumentLinkParam = (docId) => {
    if (embedded) return;
    const nextParams = new URLSearchParams(searchParams);
    documentLinkParamKeys.forEach(key => nextParams.delete(key));
    const normalizedId = getDocTabId(docId);
    if (Number.isFinite(normalizedId) && normalizedId > 0) {
      nextParams.set('doc', String(normalizedId));
    }
    setSearchParams(nextParams, { replace: true });
  };

  const canUseDocumentWriteActions = Boolean(currentUser && !['readonly', 'guest'].includes(currentUser.role));
  const canManageDocumentFolders = Boolean(canUseDocumentWriteActions && currentUser && (
    isDocumentAdminUser(currentUser)
    || ['ceo', 'coo', 'cto', 'cmo'].includes(currentUser.role)
    || ['ceo', 'coo', 'cto', 'cmo'].includes(currentUser.executive_role)
    || currentUser.role === 'leader'
  ));

  const canManageDoc = (doc) => Boolean(
    canUseDocumentWriteActions && doc && (
      Number(doc.can_manage) === 1
      || isDocumentAdminUser(currentUser)
      || Number(doc.created_by) === Number(currentUser.id)
    )
  );

  const canMoveDoc = (doc) => Boolean(
    canUseDocumentWriteActions && doc && (
      Number(doc.can_move) === 1
      || canManageDoc(doc)
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
      || isDocumentAdminUser(currentUser)
      || Number(doc.created_by) === Number(currentUser.id)
      || isDocumentSharedWithCurrentUser(doc)
    )
  );

  const canManageSelectedDoc = canManageDoc(selectedDoc);
  const canMoveSelectedDoc = canMoveDoc(selectedDoc);
  const isWolaiImportUpdateMode = Boolean(wolaiImportTargetDoc?.id);

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
    icon_key: doc.icon_key || '',
    document_kind: getDocumentKind(doc.document_kind),
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

  const isActiveDocumentId = (docId) => (
    getDocTabId(selectedDocIdRef.current) === getDocTabId(docId)
  );

  const setActiveDocumentId = (docId) => {
    const normalizedId = getDocTabId(docId);
    const nextDocId = Number.isFinite(normalizedId) && normalizedId > 0 ? normalizedId : null;
    const documentChanged = getDocTabId(selectedDocIdRef.current) !== getDocTabId(nextDocId);
    if (documentChanged) {
      documentSelectionVersionRef.current += 1;
      setSelectedDoc(null);
      activeEditorSnapshotRef.current = null;
      setEditorTitle('');
      setEditorBlocks([createBlock()]);
      setSelectedBlockId(null);
      setSelectedTableCell(null);
      setSelectedTableRange(null);
      setTableMenuContext(null);
      setSelectedSpreadsheetCell({ sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 });
      setHoveredBlockId(null);
      setOpenBlockMenuId(null);
      setTocOpen(true);
      setRemoteUpdateHint('');
      resetEditorUndoStack();
    }
    selectedDocIdRef.current = nextDocId;
    activeDetailLoadingRef.current = null;
    setDetailLoading(false);
    setSelectedDocId(nextDocId);
  };

  const getValidDocTabState = (docId, states = docTabStatesRef.current) => {
    const normalizedId = getDocTabId(docId);
    const tabState = states?.[normalizedId];
    return getDocTabId(tabState?.doc?.id) === normalizedId ? tabState : null;
  };

  const clearActiveDocument = ({ keepQuery = false } = {}) => {
    if (selectedDocIdRef.current) {
      clearRemoteDocumentSnapshot(selectedDocIdRef.current);
    }
    setActiveDocumentId(null);
    setMobileLibraryVisible(false);
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
  };

  const persistActiveDocTabState = () => {
    if (!selectedDoc?.id || !selectedDocId) return;
    const docId = getDocTabId(selectedDocId);
    if (getDocTabId(selectedDoc.id) !== docId || !isActiveDocumentId(docId)) return;
    const docSnapshot = { ...selectedDoc, title: editorTitle || selectedDoc.title || '未命名文档' };
    setDocTabStates(prev => {
      const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
      return {
        ...prev,
        [docId]: {
          ...previousState,
          doc: docSnapshot,
          editorTitle,
          editorBlocks,
          selectedBlockId,
          selectedSpreadsheetCell,
          tocOpen,
        },
      };
    });
    upsertDocTab(docSnapshot);
  };

  const applyDocTabState = (tabState, expectedDocId = null) => {
    const doc = tabState?.doc;
    if (!doc?.id) return false;
    const docId = getDocTabId(doc.id);
    const normalizedExpectedId = expectedDocId ? getDocTabId(expectedDocId) : docId;
    if (docId !== normalizedExpectedId || !isActiveDocumentId(docId)) return false;
    const blocks = Array.isArray(tabState.editorBlocks) && tabState.editorBlocks.length
      ? tabState.editorBlocks
      : contentToBlocks(doc.content);
    setSelectedDoc(doc);
    setEditorTitle(tabState.editorTitle ?? doc.title ?? '');
    setEditorBlocks(blocks);
    setSelectedBlockId(tabState.selectedBlockId ?? (blocks[0]?.id || null));
    setSelectedSpreadsheetCell(tabState.selectedSpreadsheetCell || { sheetId: 'sheet_1', rowIndex: 0, columnIndex: 0 });
    setHoveredBlockId(null);
    setOpenBlockMenuId(null);
    setTocOpen(tabState.tocOpen ?? asSwitchValue(doc.toc_enabled, true));
    upsertDocTab(doc);
    resetEditorUndoStack();
    return true;
  };

  const setRemoteDocumentSnapshot = (docId, snapshot) => {
    const normalizedId = getDocTabId(docId);
    if (!normalizedId || !snapshot) return;
    const remoteSnapshot = buildDocumentSyncSnapshot(
      snapshot.title,
      snapshot.blocks,
      {
        updated_at: snapshot.updated_at,
        updated_by: snapshot.updated_by,
        updated_by_name: snapshot.updated_by_name,
      }
    );
    if (Object.prototype.hasOwnProperty.call(snapshot, 'content')) {
      remoteSnapshot.content = snapshot.content;
    }
    remoteDocumentSnapshotRef.current[normalizedId] = remoteSnapshot;
  };

  const getRemoteDocumentSnapshot = (docId) => (
    remoteDocumentSnapshotRef.current[getDocTabId(docId)] || null
  );

  const clearRemoteDocumentSnapshot = (docId) => {
    const normalizedId = getDocTabId(docId);
    if (!normalizedId) return;
    delete remoteDocumentSnapshotRef.current[normalizedId];
  };

  const getDocumentSummaryById = (id) => {
    const docId = getDocTabId(id);
    const cachedDoc = getValidDocTabState(docId, docTabStates)?.doc;
    return documents.find(item => getDocTabId(item.id) === docId)
      || folderTreeDocuments.find(item => getDocTabId(item.id) === docId)
      || openDocTabs.find(item => getDocTabId(item.id) === docId)
      || cachedDoc;
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
    return { teamRows, userRows };
  };

  const buildDocumentQueryParams = ({ includeFolder = true, favoriteOnly = false } = {}) => {
    const params = {};
    if (domainFilter !== 'all') params.domain = domainFilter;
    if (keyword.trim()) params.search = keyword.trim();
    if (includeFolder && selectedFolderId) params.folder_id = selectedFolderId;
    if (favoriteOnly) params.favorite = 1;
    return params;
  };

  const loadFolderTreeDocuments = async () => {
    const params = buildDocumentQueryParams({ includeFolder: false });
    const requestKey = JSON.stringify(params);
    if (documentListRequestRef.current?.key === requestKey) {
      return documentListRequestRef.current.promise;
    }
    const requestSequence = documentListRequestSequenceRef.current + 1;
    documentListRequestSequenceRef.current = requestSequence;
    setLoading(true);
    const request = documentsApi.list(params)
      .then((rows) => {
        if (documentListRequestSequenceRef.current !== requestSequence) return rows;
        const normalizedRows = Array.isArray(rows) ? rows : [];
        setFolderTreeDocuments(normalizedRows);
        setDocuments(normalizedRows.filter(item => Number(item.is_favorite) === 1));
        return normalizedRows;
      })
      .catch((err) => {
        if (documentListRequestSequenceRef.current !== requestSequence) return [];
        message.error(err.response?.data?.error || err.message || '加载目录文档失败');
        return [];
      })
      .finally(() => {
        if (documentListRequestSequenceRef.current === requestSequence) {
          documentListRequestRef.current = null;
          setLoading(false);
        }
      });
    documentListRequestRef.current = { key: requestKey, promise: request };
    return request;
  };

  const loadDetail = async (id, options = {}) => {
    if (!id) return null;
    const docId = getDocTabId(id);
    if (!Number.isFinite(docId) || docId <= 0) return null;
    const requestId = Number(detailRequestIdsRef.current[docId] || 0) + 1;
    detailRequestIdsRef.current[docId] = requestId;
    const selectionVersion = documentSelectionVersionRef.current;
    // Cache late responses by document, but only the current selection version may update the editor.
    const isLatestRequest = () => detailRequestIdsRef.current[docId] === requestId;
    const canApplyToActiveEditor = () => (
      isLatestRequest()
      && documentSelectionVersionRef.current === selectionVersion
      && isActiveDocumentId(docId)
    );
    const cachedTabState = getValidDocTabState(docId, docTabStatesRef.current)
      || getValidDocTabState(docId, docTabStates);
    const hasCachedPermissions = Object.prototype.hasOwnProperty.call(cachedTabState?.doc || {}, 'can_edit');
    if (!options.force && hasCachedPermissions && cachedTabState?.doc && Array.isArray(cachedTabState.editorBlocks)) {
      if (canApplyToActiveEditor()) {
        activeDetailLoadingRef.current = null;
        setDetailLoading(false);
        applyDocTabState(cachedTabState, docId);
      }
      return cachedTabState.doc;
    }
    const loadingToken = { docId, requestId, selectionVersion };
    if (canApplyToActiveEditor()) {
      activeDetailLoadingRef.current = loadingToken;
      setDetailLoading(true);
    }
    try {
      const detail = await documentsApi.get(id);
      if (getDocTabId(detail?.id) !== docId) throw new Error('文档详情与当前请求不匹配');
      if (!isLatestRequest()) return detail;
      const blocks = contentToBlocks(detail.content);
      lastSavedSignatureRef.current[docId] = isSpreadsheetDocument(detail)
        ? getDocumentRawSaveSignature(detail.title || '', detail.content)
        : getDocumentSaveSignature(detail.title || '', blocks);
      setRemoteDocumentSnapshot(docId, {
        title: detail.title || '',
        blocks,
        content: detail.content,
        updated_at: detail.updated_at,
        updated_by: detail.updated_by,
        updated_by_name: detail.updated_by_name,
      });
      const nextTabState = {
        doc: detail,
        editorTitle: detail.title || '',
        editorBlocks: blocks,
        selectedBlockId: blocks[0]?.id || null,
        tocOpen: asSwitchValue(detail.toc_enabled, true),
      };
      setDocTabStates(prev => {
        const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
        return { ...prev, [docId]: { ...previousState, ...nextTabState } };
      });
      upsertDocTab(detail);
      if (!canApplyToActiveEditor()) return detail;
      setSelectedDoc(detail);
      setEditorTitle(detail.title || '');
      setEditorBlocks(blocks);
      setSelectedBlockId(blocks[0]?.id || null);
      setHoveredBlockId(null);
      setOpenBlockMenuId(null);
      setTocOpen(asSwitchValue(detail.toc_enabled, true));
      setShareLinkError(null);
      setRemoteUpdateHint('');
      resetEditorUndoStack();
      return detail;
    } catch (err) {
      if (!isLatestRequest() || !canApplyToActiveEditor()) return null;
      const isDeepLinkTarget = Number(deepLinkedDocId) === Number(docId);
      setOpenDocTabs(prev => prev.filter(tab => getDocTabId(tab.id) !== docId));
      setDocTabStates(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
      if (isActiveDocumentId(docId)) clearActiveDocument({ keepQuery: isDeepLinkTarget });
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
      return null;
    } finally {
      if (activeDetailLoadingRef.current === loadingToken) {
        activeDetailLoadingRef.current = null;
        setDetailLoading(false);
      }
    }
  };

  const openDocumentTab = (docOrId, options = {}) => {
    const docId = getDocTabId(typeof docOrId === 'object' ? docOrId?.id : docOrId);
    if (!docId) return;
    if (!options.keepContextMenu) closeDocContextMenu();
    if (isMobile) setMobileLibraryVisible(false);
    if (!embedded && getDocumentIdFromSearch(searchParams) !== docId) {
      replaceDocumentLinkParam(docId);
    }
    persistActiveDocTabState();
    const docSummary = typeof docOrId === 'object' ? docOrId : getDocumentSummaryById(docId);
    if (docSummary?.id) {
      upsertDocTab(docSummary);
      setDocTabStates(prev => {
        const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
        return {
          ...prev,
          [docId]: {
            ...previousState,
            doc: previousState.doc || docSummary,
          },
        };
      });
    }
    if (!isActiveDocumentId(docId)) {
      setActiveDocumentId(docId);
      const cachedTabState = getValidDocTabState(docId, docTabStatesRef.current)
        || getValidDocTabState(docId, docTabStates);
      const hasCachedPermissions = Object.prototype.hasOwnProperty.call(cachedTabState?.doc || {}, 'can_edit');
      if (hasCachedPermissions && Array.isArray(cachedTabState?.editorBlocks)) {
        applyDocTabState(cachedTabState, docId);
      }
    } else if (!selectedDoc || getDocTabId(selectedDoc.id) !== docId) {
      setSelectedDoc(null);
      loadDetail(docId, { force: true });
    }
  };

  const handleDocumentContentLinkClick = (event) => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor || !event.currentTarget?.contains?.(anchor)) return;
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;

    event.preventDefault();
    event.stopPropagation();
    activateDocumentLink(anchor.getAttribute('href'), {
      currentUrl: window.location.href,
      openDocument: openDocumentTab,
      openExternal: url => window.open(url, '_blank', 'noopener,noreferrer'),
    });
  };

  const applySelectedDocMeta = (detail, docId = getDocTabId(detail?.id)) => {
    if (!detail?.id || getDocTabId(detail.id) !== getDocTabId(docId)) return null;
    const blocks = contentToBlocks(detail.content);
    setRemoteDocumentSnapshot(detail.id, {
      title: detail.title || '',
      blocks,
      content: detail.content,
      updated_at: detail.updated_at,
      updated_by: detail.updated_by,
      updated_by_name: detail.updated_by_name,
    });
    if (isActiveDocumentId(docId)) {
      setSelectedDoc(prev => (
        getDocTabId(prev?.id) === docId ? { ...prev, ...detail } : prev
      ));
    }
    upsertDocTab(detail);
    setDocTabStates(prev => ({
      ...prev,
      [docId]: {
        ...(getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {}),
        doc: { ...(getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId].doc : {}), ...detail },
      },
    }));
    return detail;
  };

  const refreshSelectedDocMeta = async () => {
    if (!selectedDoc?.id) return null;
    const docId = getDocTabId(selectedDoc.id);
    const detail = await documentsApi.get(docId);
    return applySelectedDocMeta(detail, docId);
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

  const openGlobalDocumentSearch = () => {
    setGlobalSearchOpen(true);
    setGlobalSearchKeyword(prev => prev || keyword.trim());
  };

  const closeGlobalDocumentSearch = () => {
    setGlobalSearchOpen(false);
  };

  const openGlobalSearchResult = (item) => {
    closeGlobalDocumentSearch();
    openDocumentTab(item);
  };

  useEffect(() => {
    loadFolders().catch(err => message.error(err.response?.data?.error || err.message || '加载目录失败'));
    loadProjectGroups().catch(err => message.error(err.response?.data?.error || err.message || '加载项目组失败'));
  }, []);

  useEffect(() => {
    loadFolderTreeDocuments();
  }, [domainFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFolderTreeDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;
    if (!bulkShareMode) {
      setBulkShareDocuments([]);
      setBulkShareDocumentsLoading(false);
      return () => { cancelled = true; };
    }

    setBulkShareDocumentsLoading(true);
    const params = domainFilter === 'all' ? {} : { domain: domainFilter };
    documentsApi.list(params)
      .then((rows) => {
        if (!cancelled) setBulkShareDocuments(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setBulkShareDocuments([]);
        message.error(err.response?.data?.error || err.message || '加载文件夹文档失败');
      })
      .finally(() => {
        if (!cancelled) setBulkShareDocumentsLoading(false);
      });

    return () => { cancelled = true; };
  }, [bulkShareMode, domainFilter]);

  useEffect(() => {
    const handleGlobalSearchKeyDown = (event) => {
      const key = String(event.key || '').toLowerCase();
      if (key !== 'p' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      event.stopPropagation();
      openGlobalDocumentSearch();
    };
    window.addEventListener('keydown', handleGlobalSearchKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalSearchKeyDown, true);
  }, [keyword]);

  useEffect(() => {
    if (!globalSearchOpen) return undefined;
    const timer = window.setTimeout(() => {
      globalSearchInputRef.current?.focus?.({ cursor: 'end' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [globalSearchOpen]);

  useEffect(() => {
    if (!globalSearchOpen) return undefined;
    const searchText = globalSearchKeyword.trim();
    if (!searchText) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return undefined;
    }
    let cancelled = false;
    setGlobalSearchLoading(true);
    const timer = window.setTimeout(() => {
      documentsApi.list({
        search: searchText,
        title_only: globalSearchTitleOnly ? 1 : undefined,
        exact: globalSearchExact ? 1 : undefined,
        limit: 100,
      })
        .then(rows => {
          if (cancelled) return;
          setGlobalSearchResults(Array.isArray(rows) ? rows : []);
        })
        .catch(err => {
          if (cancelled) return;
          setGlobalSearchResults([]);
          message.error(err.response?.data?.error || err.message || '搜索文档失败');
        })
        .finally(() => {
          if (!cancelled) setGlobalSearchLoading(false);
        });
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [globalSearchOpen, globalSearchKeyword, globalSearchTitleOnly, globalSearchExact]);

  useEffect(() => {
    const docId = deepLinkedDocId;
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
  }, [deepLinkedDocId, selectedDocId]);

  useEffect(() => {
    const normalizedSelectedDocId = getDocTabId(selectedDocId);
    const nextDocId = Number.isFinite(normalizedSelectedDocId) && normalizedSelectedDocId > 0
      ? normalizedSelectedDocId
      : null;
    if (getDocTabId(selectedDocIdRef.current) !== getDocTabId(nextDocId)) {
      documentSelectionVersionRef.current += 1;
      selectedDocIdRef.current = nextDocId;
    }
    if (nextDocId) loadDetail(nextDocId);
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
    if (getDocTabId(selectedDoc.id) !== docId || !isActiveDocumentId(docId)) return;
    const docSnapshot = { ...selectedDoc, title: editorTitle || selectedDoc.title || '未命名文档' };
    const signature = isSpreadsheetDocument(selectedDoc)
      ? getDocumentRawSaveSignature(editorTitle, selectedDoc.content)
      : getDocumentSaveSignature(editorTitle, editorBlocks);
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
      selectedSpreadsheetCell,
    };
    setDocTabStates(prev => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        doc: docSnapshot,
        editorTitle,
        editorBlocks,
        selectedBlockId,
        selectedSpreadsheetCell,
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
            document_kind: getDocumentKind(docSnapshot.document_kind),
          }
        : tab
    )));
  }, [selectedDocId, selectedDoc, editorTitle, editorBlocks, selectedBlockId, selectedSpreadsheetCell, tocOpen]);

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
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || bulkShareOpen || changeLogOpen || moveFolderOpen) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'z' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      undoLastEditorAction();
    };
    window.addEventListener('keydown', handleUndoKeyDown);
    return () => window.removeEventListener('keydown', handleUndoKeyDown);
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, bulkShareOpen, changeLogOpen, moveFolderOpen]);

  useEffect(() => {
    const handleSaveKeyDown = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || bulkShareOpen || changeLogOpen || moveFolderOpen) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 's' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      saveCurrentDocumentRef.current?.({ force: true }).catch(() => {});
    };
    window.addEventListener('keydown', handleSaveKeyDown);
    return () => window.removeEventListener('keydown', handleSaveKeyDown);
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, bulkShareOpen, changeLogOpen, moveFolderOpen]);

  useEffect(() => {
    const handleSelectAllKeyDown = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || bulkShareOpen || changeLogOpen || moveFolderOpen) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'a' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const editorNode = document.getElementById('document-editor-blocks');
      const activeElement = document.activeElement;
      if (!editorNode?.contains(activeElement)) return;
      if (activeElement?.closest?.('input, textarea, [data-document-table-cell="true"], [data-document-database-editor-block-id]')) return;
      event.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      setAreaBlockSelection(editorBlocks.map(block => block.id));
      selectAllEditorBlocksRef.current = true;
    };
    window.addEventListener('keydown', handleSelectAllKeyDown);
    return () => window.removeEventListener('keydown', handleSelectAllKeyDown);
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, bulkShareOpen, changeLogOpen, moveFolderOpen, editorBlocks]);

  useEffect(() => {
    const handleDocumentCopy = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || bulkShareOpen || changeLogOpen || moveFolderOpen) return;
      const activeElement = document.activeElement;
      const activeTextSelection = activeElement?.closest?.('textarea, input, [contenteditable="true"]')
        && window.getSelection?.()?.toString?.();
      const nativeSelectedBlockIds = getSelectedEditorBlockIds();
      if (activeTextSelection && nativeSelectedBlockIds.length < 2 && !selectAllEditorBlocksRef.current) return;
      const nativeSelectedSet = new Set(nativeSelectedBlockIds);
      const nativeSelectedBlocks = nativeSelectedBlockIds.length > 1
        ? editorBlocks.filter(block => nativeSelectedSet.has(block.id))
        : [];
      const payload = nativeSelectedBlocks.length
        ? blocksToClipboardPayload(nativeSelectedBlocks)
        : getActiveDocumentClipboardPayload();
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
    bulkShareOpen,
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
  }, [selectedDoc?.id, editorTitle, editorBlocks, selectedSpreadsheetContentSignature]);

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
    if (documentSyncTimerRef.current) window.clearInterval(documentSyncTimerRef.current);
    if (!selectedDoc?.id || detailLoading || presentationOpen) return undefined;
    documentSyncTimerRef.current = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const activeDocId = getDocTabId(selectedDocIdRef.current || selectedDoc?.id);
      if (!activeDocId) return;
      syncDocumentFromRemote(activeDocId).catch(() => {});
    }, documentLiveSyncInterval);
    return () => {
      if (documentSyncTimerRef.current) {
        window.clearInterval(documentSyncTimerRef.current);
        documentSyncTimerRef.current = null;
      }
    };
  }, [selectedDoc?.id, detailLoading, presentationOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => {
      const previousState = documentVisibilityStateRef.current;
      documentVisibilityStateRef.current = document.visibilityState;
      if (document.visibilityState !== 'visible' || previousState === 'visible') return;
      const activeDocId = getDocTabId(selectedDocIdRef.current || selectedDoc?.id);
      if (!activeDocId || detailLoading || presentationOpen) return;
      syncDocumentFromRemote(activeDocId).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedDoc?.id, detailLoading, presentationOpen]);

  useEffect(() => {
    const docId = getDocTabId(selectedDoc?.id);
    if (!docId || !isSpreadsheetDocument(selectedDoc) || detailLoading || presentationOpen) {
      setSpreadsheetCollaborators([]);
      return undefined;
    }

    const sessionId = spreadsheetPresenceSessionIdRef.current;
    let disposed = false;
    let streamStopped = false;
    const applyCollaborators = collaborators => {
      if (disposed || getDocTabId(selectedDocIdRef.current) !== docId) return;
      setSpreadsheetCollaborators(filterRemoteSpreadsheetCollaborators(collaborators, sessionId));
    };
    const sendPresence = async () => {
      const payload = buildSpreadsheetPresencePayload({
        sessionId,
        selectedCell: selectedSpreadsheetCellRef.current,
        selectionState: spreadsheetSelectionRef.current,
      });
      if (!payload || disposed) return;
      try {
        const result = await documentsApi.updateSpreadsheetPresence(docId, payload);
        applyCollaborators(result?.collaborators);
      } catch (error) {
        if ([401, 403, 404].includes(error?.response?.status)) streamStopped = true;
      }
    };
    const handleEvent = event => {
      if (disposed || !event) return;
      if (event.type === 'presence') {
        applyCollaborators(event.collaborators);
        return;
      }
      if (event.type === 'access_revoked') {
        streamStopped = true;
        spreadsheetEventAbortRef.current?.abort();
        setSpreadsheetCollaborators([]);
        return;
      }
      if (
        event.type === 'document_updated'
        && Number(event.updated_by) !== Number(currentUser?.id)
        && getDocTabId(selectedDocIdRef.current) === docId
      ) {
        syncDocumentFromRemote(docId).catch(() => {});
      }
    };
    const connect = () => {
      if (disposed || streamStopped) return;
      const controller = new AbortController();
      spreadsheetEventAbortRef.current = controller;
      documentsApi.subscribeSpreadsheetEvents(docId, sessionId, {
        signal: controller.signal,
        onEvent: handleEvent,
      }).catch(error => {
        if (controller.signal.aborted || disposed) return;
        if ([401, 403, 404].includes(error?.response?.status)) streamStopped = true;
      }).finally(() => {
        if (disposed || streamStopped || controller.signal.aborted) return;
        spreadsheetEventRetryTimerRef.current = window.setTimeout(connect, 1500);
      });
    };

    connect();
    sendPresence();
    spreadsheetPresenceIntervalRef.current = window.setInterval(sendPresence, 8000);
    return () => {
      disposed = true;
      spreadsheetEventAbortRef.current?.abort();
      spreadsheetEventAbortRef.current = null;
      if (spreadsheetEventRetryTimerRef.current) window.clearTimeout(spreadsheetEventRetryTimerRef.current);
      spreadsheetEventRetryTimerRef.current = null;
      if (spreadsheetPresenceIntervalRef.current) window.clearInterval(spreadsheetPresenceIntervalRef.current);
      spreadsheetPresenceIntervalRef.current = null;
      if (spreadsheetPresenceDebounceRef.current) window.clearTimeout(spreadsheetPresenceDebounceRef.current);
      spreadsheetPresenceDebounceRef.current = null;
      setSpreadsheetCollaborators([]);
      documentsApi.leaveSpreadsheetPresence(docId, sessionId).catch(() => {});
    };
  }, [
    selectedDoc?.id,
    selectedDoc?.document_kind,
    detailLoading,
    presentationOpen,
    currentUser?.id,
  ]);

  useEffect(() => {
    if (!remoteUpdateHint) return undefined;
    const timer = window.setTimeout(() => setRemoteUpdateHint(''), 8000);
    return () => window.clearTimeout(timer);
  }, [remoteUpdateHint]);

  useEffect(() => {
    if (!spreadsheetConflictNotice?.text) return undefined;
    const timer = window.setTimeout(() => {
      setSpreadsheetConflictNotice(current => (
        current === spreadsheetConflictNotice ? null : current
      ));
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [spreadsheetConflictNotice]);

  useEffect(() => {
    const saveSnapshotImmediately = (snapshot) => {
      const doc = snapshot?.doc;
      if (!doc?.id || !canEditDoc(doc)) return;
      const blocks = Array.isArray(snapshot.editorBlocks) ? snapshot.editorBlocks : contentToBlocks(doc.content);
      const title = snapshot.editorTitle ?? doc.title ?? '';
      const payload = isSpreadsheetDocument(doc)
        ? buildRawDocumentWritePayload(title, doc.content, doc.content_text)
        : buildDocumentSavePayload(title, blocks);
      const signature = isSpreadsheetDocument(doc)
        ? getDocumentRawSaveSignature(title, doc.content)
        : JSON.stringify(payload);
      if (lastSavedSignatureRef.current[doc.id] === signature) return;
      lastSavedSignatureRef.current[doc.id] = signature;
      dirtyDocumentIdsRef.current.delete(getDocTabId(doc.id));
      saveDocumentDraftBeforeUnload(doc.id, payload, getRemoteDocumentSnapshot(doc.id)?.updated_at || doc.updated_at);
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
          : getValidDocTabState(docId, docTabStatesRef.current);
        if (getDocTabId(snapshot?.doc?.id) !== getDocTabId(docId)) return;
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
    if (documentSyncTimerRef.current) window.clearInterval(documentSyncTimerRef.current);
    if (tableResizeRef.current?.cleanup) tableResizeRef.current.cleanup();
    if (tableCellSelectionRef.current?.cleanup) tableCellSelectionRef.current.cleanup();
    saveCurrentDocumentRef.current?.({ silent: true }).catch(() => {});
    editorAreaSelectionRef.current?.cleanup?.();
    blockHandleSelectionRef.current?.cleanup?.();
    if (inlineToolbarHideTimerRef.current) window.clearTimeout(inlineToolbarHideTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selectedTableCell && !selectedTableRange && !tableMenuContext) return undefined;
    const handleTableOutsidePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.('[data-document-table-menu="true"]')) return;
      if (target?.closest?.('[data-document-table-shell="true"]')) return;
      setSelectedTableCell(null);
      setSelectedTableRange(null);
      setTableMenuContext(null);
    };
    document.addEventListener('pointerdown', handleTableOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleTableOutsidePointerDown, true);
  }, [selectedTableCell, selectedTableRange, tableMenuContext]);

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
    if (!folderContextMenu.open) return undefined;
    const handleFolderContextOutsidePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.('.document-folder-context-menu-dropdown')) return;
      closeFolderContextMenu();
    };
    document.addEventListener('pointerdown', handleFolderContextOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleFolderContextOutsidePointerDown, true);
  }, [folderContextMenu.open]);

  useEffect(() => {
    if (!selectedAreaBlockIdsRef.current.length) return;
    const validIds = normalizeBlockSelectionIds(selectedAreaBlockIdsRef.current);
    if (validIds.length !== selectedAreaBlockIdsRef.current.length) {
      setAreaBlockSelection(validIds);
    }
  }, [editorBlocks]);

  const getDocumentFolderFormDefaults = (folderId = selectedFolderId) => {
    const normalizedFolderId = normalizeDocumentFolderSelectValue(folderId);
    const folder = normalizedFolderId
      ? folders.find(item => Number(item.id) === normalizedFolderId)
      : null;
    return {
      domain: folder?.domain || (domainFilter === 'all' ? 'domestic_project' : domainFilter),
      project_group_id: folder?.project_group_id || undefined,
      department_key: folder?.department_key || 'OPS',
      folder_id: folder ? Number(folder.id) : undefined,
      doc_type: folder?.default_doc_type || 'IMP',
    };
  };

  const handleDocumentLocationValuesChange = (form, changedValues, allValues) => {
    if (Object.prototype.hasOwnProperty.call(changedValues, 'folder_id')) {
      const folderId = normalizeDocumentFolderSelectValue(changedValues.folder_id);
      const folder = folderId
        ? folders.find(item => Number(item.id) === Number(folderId))
        : null;
      if (!folder) return;
      const projectDomain = getManagedDocumentDomainForProjectGroup(projectGroups, allValues.project_group_id);
      form.setFieldsValue({
        domain: folder.domain,
        department_key: folder.department_key,
        doc_type: folder.default_doc_type,
        ...(projectDomain && projectDomain !== folder.domain ? { project_group_id: undefined } : {}),
        ...(folder.project_group_id ? { project_group_id: Number(folder.project_group_id) } : {}),
      });
      return;
    }
    if (!['domain', 'project_group_id', 'department_key', 'doc_type'].some(key => Object.prototype.hasOwnProperty.call(changedValues, key))) {
      return;
    }
    const changedProjectGroup = Object.prototype.hasOwnProperty.call(changedValues, 'project_group_id');
    const changedDomain = Object.prototype.hasOwnProperty.call(changedValues, 'domain');
    const projectDomain = getManagedDocumentDomainForProjectGroup(projectGroups, allValues.project_group_id);
    let nextValues = allValues;
    if (changedProjectGroup && projectDomain && projectDomain !== allValues.domain) {
      form.setFieldValue('domain', projectDomain);
      nextValues = { ...allValues, domain: projectDomain };
    } else if (changedDomain && projectDomain && projectDomain !== allValues.domain) {
      form.setFieldValue('project_group_id', undefined);
      nextValues = { ...allValues, project_group_id: undefined };
    }
    const folderId = normalizeDocumentFolderSelectValue(allValues.folder_id);
    if (!folderId) return;
    const folder = folders.find(item => Number(item.id) === Number(folderId));
    if (!isDocumentFolderCompatibleWithLocation(folder, nextValues)) {
      form.setFieldValue('folder_id', undefined);
    }
  };

  const renderDocumentLocationFolderField = () => (
    <Form.Item
      noStyle
      shouldUpdate={(previousValues, currentValues) => (
        previousValues.domain !== currentValues.domain
        || previousValues.department_key !== currentValues.department_key
        || previousValues.doc_type !== currentValues.doc_type
      )}
    >
      {({ getFieldValue }) => (
        <Form.Item name="folder_id" label="文件夹">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择当前归属域下的文件夹"
            options={getDocumentFolderOptionsForLocation(folders, folderPathMap, {
              domain: getFieldValue('domain'),
              department_key: getFieldValue('department_key'),
              doc_type: getFieldValue('doc_type'),
            })}
          />
        </Form.Item>
      )}
    </Form.Item>
  );

  const openCreate = async (documentKind = 'rich_text') => {
    const nextDocumentKind = getDocumentKind(documentKind);
    let shareUsers = users;
    if (!shareUsers.length) {
      try {
        const shareOptions = await loadShareOptions();
        shareUsers = shareOptions.userRows;
      } catch (err) {
        message.warning('默认共享人加载失败，创建时将由系统自动应用');
      }
    }
    const folderDefaults = getDocumentFolderFormDefaults();
    setEditingPropertyDoc(null);
    createForm.resetFields();
    const initialValues = {
      title: nextDocumentKind === 'spreadsheet' ? '未命名表格' : '新页面',
      document_kind: nextDocumentKind,
      icon_key: nextDocumentKind === 'spreadsheet' ? 'chart' : defaultDocumentIconFormValue,
      ...folderDefaults,
    };
    if (shareUsers.length) {
      initialValues.default_share_user_ids = getDefaultDocumentCxoUsers(shareUsers)
        .map(user => Number(user.id))
        .filter(Boolean);
    }
    setCreateOpen(true);
    window.setTimeout(() => {
      createForm.setFieldsValue(initialValues);
    }, 0);
  };

  const validateDocumentImportFile = (file) => {
    const ext = getFileExt(file?.name);
    if (!documentImportFileExts.includes(ext)) {
      message.error('请上传 Word、PDF、PPT、Excel、XMind、TXT 等常见文档文件');
      return Upload.LIST_IGNORE;
    }
    if (String(file?.type || '').startsWith('video/') || String(file?.type || '').startsWith('audio/')) {
      message.error('导入不支持视频或音频文件');
      return Upload.LIST_IGNORE;
    }
    if (Number(file?.size || 0) > documentImportMaxSize) {
      message.error('单个文件不能超过 100MB');
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const appendDocumentImportFormValue = (formData, key, value) => {
    if (value === undefined || value === null || value === '') return;
    formData.append(key, value);
  };

  const buildDocumentImportFileFormData = (values, file) => {
    const formData = new FormData();
    formData.append('file', file.originFileObj || file);
    const normalizedValues = {
      ...values,
      folder_id: normalizeDocumentFolderSelectValue(values.folder_id),
    };
    ['title', 'domain', 'project_group_id', 'department_key', 'folder_id', 'doc_type'].forEach(key => {
      appendDocumentImportFormValue(formData, key, normalizedValues[key]);
    });
    return formData;
  };

  const openWolaiImport = () => {
    const folderDefaults = getDocumentFolderFormDefaults();
    setWolaiImportTargetDoc(null);
    setDocumentImportFileList([]);
    wolaiImportForm.resetFields();
    wolaiImportForm.setFieldsValue({
      import_mode: 'url',
      url: '',
      mcp_target: '',
      mcp_token: '',
      title: '',
      ...folderDefaults,
    });
    setWolaiImportOpen(true);
  };

  const openWolaiImportForDocument = (doc) => {
    if (!doc?.id) return;
    if (!canEditDoc(doc)) {
      message.warning('你没有更新该文档正文的权限');
      return;
    }
    setWolaiImportTargetDoc(doc);
    setDocumentImportFileList([]);
    wolaiImportForm.resetFields();
    wolaiImportForm.setFieldsValue({
      import_mode: doc.source_system === 'wolai_mcp' ? 'wolai_mcp' : 'url',
      url: doc.source_system === 'wolai_mcp' ? '' : (doc.source_url || ''),
      mcp_target: doc.source_system === 'wolai_mcp' ? (doc.source_url || doc.source_record_key || '') : '',
      mcp_token: '',
    });
    setWolaiImportOpen(true);
  };

  const handleWolaiImport = async () => {
    try {
      const targetDoc = wolaiImportTargetDoc;
      const updatingExistingDoc = Boolean(targetDoc?.id);
      const values = await wolaiImportForm.validateFields();
      const importMode = values.import_mode || 'url';
      if (importMode === 'url' && !String(values.url || '').trim()) {
        wolaiImportForm.setFields([{ name: 'url', errors: ['请填写 URL'] }]);
        return;
      }
      if (importMode === 'wolai_mcp' && !String(values.mcp_target || '').trim()) {
        wolaiImportForm.setFields([{ name: 'mcp_target', errors: ['请填写 Wolai 页面 URL 或页面 ID'] }]);
        return;
      }
      if (importMode === 'file' && !documentImportFileList.length) {
        message.warning('请选择要导入的本地文件');
        return;
      }
      setWolaiImportSaving(true);
      if (updatingExistingDoc) {
        if (!canEditDoc(targetDoc)) {
          message.warning('你没有更新该文档正文的权限');
          return;
        }
        let doc;
        if (importMode === 'file') {
          doc = await documentsApi.importFileToDocument(
            targetDoc.id,
            buildDocumentImportFileFormData(values, documentImportFileList[0])
          );
        } else if (importMode === 'wolai_mcp') {
          doc = await documentsApi.importWolaiMcpToDocument(targetDoc.id, {
            target: values.mcp_target,
            token: values.mcp_token,
          });
        } else {
          doc = await documentsApi.importWolaiUrlToDocument(targetDoc.id, {
            url: values.url,
            prefer_chrome: true,
          });
        }
        const docId = getDocTabId(doc.id);
        const blocks = contentToBlocks(doc.content);
        lastSavedSignatureRef.current[docId] = getDocumentSaveSignature(doc.title || '', blocks);
        dirtyDocumentIdsRef.current.delete(docId);
        setWolaiImportOpen(false);
        setWolaiImportTargetDoc(null);
        setDocumentImportFileList([]);
        openDocumentTab(doc);
        await loadDetail(docId, { force: true });
        await loadFolderTreeDocuments();
        const warnings = doc.import_meta?.warnings || [];
        if (warnings.length) {
          message.warning('文档已更新，但导入过程有提示，可查看改动历史备注');
        } else {
          message.success(importMode === 'file'
            ? '已导入本地文件内容并更新文档'
            : importMode === 'wolai_mcp'
              ? '已从 Wolai MCP 更新文档内容'
              : '已从 URL 更新文档内容');
        }
        return;
      }
      let doc;
      const folderId = normalizeDocumentFolderSelectValue(values.folder_id) || null;
      if (importMode === 'file') {
        doc = await documentsApi.importFile(buildDocumentImportFileFormData(values, documentImportFileList[0]));
      } else if (importMode === 'wolai_mcp') {
        doc = await documentsApi.importWolaiMcp({
          ...values,
          target: values.mcp_target,
          token: values.mcp_token,
          title: values.title || undefined,
          project_group_id: values.project_group_id || null,
          folder_id: folderId,
        });
      } else {
        doc = await documentsApi.importWolaiUrl({
          ...values,
          title: values.title || undefined,
          project_group_id: values.project_group_id || null,
          folder_id: folderId,
          prefer_chrome: true,
        });
      }
      setWolaiImportOpen(false);
      setWolaiImportTargetDoc(null);
      setDocumentImportFileList([]);
      openDocumentTab(doc);
      await loadFolderTreeDocuments();
      const warnings = doc.import_meta?.warnings || [];
      if (warnings.length) {
        message.warning('文档已导入，但导入过程有提示，可查看改动历史备注');
      } else {
        message.success(importMode === 'file'
          ? '已导入本地文件内容并新建文档'
          : importMode === 'wolai_mcp'
            ? '已从 Wolai MCP 导入文档'
            : '已从 URL 导入文档');
      }
    } catch (err) {
      const hint = err.response?.data?.hint;
      message.error(err.response?.data?.error || err.message || '导入失败');
      if (hint) message.info(hint);
    } finally {
      setWolaiImportSaving(false);
    }
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
      const projectDomain = getManagedDocumentDomainForProjectGroup(projectGroups, doc.project_group_id);
      const locationValues = {
        domain: projectDomain || doc.domain || 'general',
        department_key: doc.department_key || 'ALL',
        doc_type: doc.doc_type || 'TMP',
      };
      const currentFolder = normalizeDocumentFolderSelectValue(doc.folder_id)
        ? folders.find(folder => Number(folder.id) === Number(doc.folder_id))
        : null;
      createForm.setFieldsValue({
        title: doc.title || '未命名文档',
        domain: locationValues.domain,
        project_group_id: doc.project_group_id || undefined,
        department_key: locationValues.department_key,
        folder_id: isDocumentFolderCompatibleWithLocation(currentFolder, locationValues)
          ? normalizeDocumentFolderSelectValue(doc.folder_id)
          : undefined,
        doc_type: locationValues.doc_type,
        document_kind: getDocumentKind(doc.document_kind),
        icon_key: doc.icon_key || defaultDocumentIconFormValue,
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
      const { default_share_user_ids: defaultShareUserIds, ...documentValues } = values;
      const folderId = normalizeDocumentFolderSelectValue(documentValues.folder_id) || null;
      if (editingPropertyDoc?.id) {
        setPropertySaving(true);
        const wasActiveDoc = isActiveDocumentId(editingPropertyDoc.id);
        const title = documentValues.title || '未命名文档';
        const blocks = wasActiveDoc ? editorBlocks : contentToBlocks(editingPropertyDoc.content);
        const savePayload = isSpreadsheetDocument(editingPropertyDoc)
          ? buildRawDocumentWritePayload(title, editingPropertyDoc.content, editingPropertyDoc.content_text)
          : buildDocumentSavePayload(title, blocks);
        const payload = {
          ...savePayload,
          ...documentValues,
          title,
          project_group_id: documentValues.project_group_id || null,
          folder_id: folderId,
          current_version: editingPropertyDoc.current_version || 'V1.0',
          icon_key: normalizeDocumentIconFormValue(documentValues.icon_key),
        };
        delete payload.document_kind;
        const updated = await documentsApi.update(editingPropertyDoc.id, payload);
        lastSavedSignatureRef.current[editingPropertyDoc.id] = isSpreadsheetDocument(updated)
          ? getDocumentRawSaveSignature(payload.title, updated.content)
          : getDocumentSaveSignature(payload.title, blocks);
        setCreateOpen(false);
        setEditingPropertyDoc(null);
        const isStillActiveDoc = isActiveDocumentId(updated.id);
        if (isStillActiveDoc) {
          setSelectedDoc(prev => (
            getDocTabId(prev?.id) === getDocTabId(updated.id) ? { ...prev, ...updated } : prev
          ));
          setEditorTitle(updated.title || title);
        }
        upsertDocTab(updated);
        const updatedDocId = getDocTabId(updated.id);
        setDocTabStates(prev => {
          const previousState = getDocTabId(prev[updatedDocId]?.doc?.id) === updatedDocId
            ? prev[updatedDocId]
            : {};
          return {
            ...prev,
            [updatedDocId]: {
              ...previousState,
              doc: { ...(previousState.doc || {}), ...updated },
              editorTitle: updated.title || title,
              editorBlocks: blocks,
            },
          };
        });
        await loadFolderTreeDocuments();
        message.success('文档属性已保存');
        return;
      }
      const documentKind = getDocumentKind(documentValues.document_kind);
      const doc = await documentsApi.create({
        ...documentValues,
        document_kind: documentKind,
        title: documentValues.title || (documentKind === 'spreadsheet' ? '未命名表格' : '未命名文档'),
        project_group_id: documentValues.project_group_id || null,
        folder_id: folderId,
        content: documentKind === 'spreadsheet' ? createDefaultSpreadsheetWorkbook() : { blocks: [] },
        icon_key: normalizeDocumentIconFormValue(documentValues.icon_key),
        ...(documentKind === 'spreadsheet' ? {} : { content_text: '' }),
        ...(Array.isArray(defaultShareUserIds) ? {
          shares: defaultShareUserIds.map(id => ({ target_type: 'user', target_id: Number(id) })),
        } : {}),
      });
      message.success(`已创建 ${doc.document_no}`);
      setCreateOpen(false);
      openDocumentTab(doc);
      await loadFolderTreeDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || (editingPropertyDoc ? '保存文档属性失败' : '创建文档失败'));
    } finally {
      setPropertySaving(false);
    }
  };

  const renderCreateDocumentButton = (label = '新建') => (
    <Dropdown.Button
      type="primary"
      icon={<DownOutlined />}
      onClick={() => openCreate('rich_text')}
      menu={{
        items: [
          {
            key: 'rich_text',
            icon: <FileTextOutlined />,
            label: '普通文档',
          },
          {
            key: 'spreadsheet',
            icon: <TableOutlined />,
            label: '在线表格',
          },
        ],
        onClick: ({ key }) => openCreate(key),
      }}
    >
      <PlusOutlined /> {label}
    </Dropdown.Button>
  );

  const saveCurrentDocument = async ({ silent = false, force = false } = {}) => {
    const activeDocId = getDocTabId(selectedDocIdRef.current);
    const snapshot = getDocTabId(activeEditorSnapshotRef.current?.doc?.id) === activeDocId
      ? activeEditorSnapshotRef.current
      : null;
    const doc = snapshot?.doc || (getDocTabId(selectedDoc?.id) === activeDocId ? selectedDoc : null);
    if (!doc?.id || !canEditDoc(doc)) return null;
    const blocks = Array.isArray(snapshot?.editorBlocks) ? snapshot.editorBlocks : editorBlocks;
    const title = snapshot?.editorTitle ?? editorTitle;
    const spreadsheetDoc = isSpreadsheetDocument(doc);
    const payload = spreadsheetDoc
      ? buildRawDocumentWritePayload(title, doc.content, doc.content_text, getRemoteDocumentSnapshot(doc.id)?.updated_at || doc.updated_at)
      : buildDocumentWritePayload(title, blocks, getRemoteDocumentSnapshot(doc.id)?.updated_at || doc.updated_at);
    const signature = spreadsheetDoc
      ? getDocumentRawSaveSignature(title, doc.content)
      : getDocumentSaveSignature(title, blocks);
    if (!force && lastSavedSignatureRef.current[doc.id] === signature) return null;
    if (pendingSavePromisesRef.current[doc.id]) return pendingSavePromisesRef.current[doc.id];

    if (!silent) setSaving(true);
    try {
      const remoteSnapshot = spreadsheetDoc ? getRemoteDocumentSnapshot(doc.id) : null;
      const operationPlan = spreadsheetDoc
        ? buildSpreadsheetOperationSavePlan({
            baseWorkbook: remoteSnapshot?.content,
            localWorkbook: doc.content,
            titleChanged: !remoteSnapshot || String(title || '') !== String(remoteSnapshot.title || ''),
          })
        : null;
      const useSpreadsheetOperations = operationPlan?.mode === 'operations' && operationPlan.operations.length > 0;
      const savePromise = (useSpreadsheetOperations
        ? documentsApi.applySpreadsheetOperations(doc.id, {
            base_updated_at: remoteSnapshot?.updated_at || doc.updated_at,
            operations: operationPlan.operations,
          })
        : documentsApi.updateContent(doc.id, payload))
        .then(updated => {
          if (useSpreadsheetOperations) {
            if (!spreadsheetOperationsAreApplied(updated?.content, operationPlan.operations)) {
              throw new Error('表格操作保存结果校验失败，请重试');
            }
            return updated;
          }
          return spreadsheetDoc
            ? assertRawDocumentSaveApplied(updated, signature)
            : assertDocumentSaveApplied(updated, signature);
        });
      pendingSavePromisesRef.current[doc.id] = savePromise;
      const updated = await savePromise;
      lastSavedSignatureRef.current[doc.id] = useSpreadsheetOperations
        ? getDocumentRawSaveSignature(updated.title || title, updated.content)
        : signature;
      const docId = getDocTabId(doc.id);
      dirtyDocumentIdsRef.current.delete(docId);
      setRemoteDocumentSnapshot(docId, {
        title,
        blocks,
        content: updated.content,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
        updated_by_name: updated.updated_by_name,
      });
      if (isActiveDocumentId(docId)) {
        setSelectedDoc(prev => (
          getDocTabId(prev?.id) === docId ? { ...prev, ...updated } : prev
        ));
        if (!spreadsheetDoc) setRemoteUpdateHint('');
      }
      upsertDocTab(updated);
      setDocTabStates(prev => {
        const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
        return {
          ...prev,
          [docId]: {
            ...previousState,
            doc: { ...(previousState.doc || {}), ...updated },
          },
        };
      });
      setDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      if (!silent && isActiveDocumentId(doc.id)) {
        await loadDetail(doc.id, { force: true });
        await loadFolderTreeDocuments();
        message.success(`已保存 ${updated.document_no}`);
      }
      return updated;
    } catch (err) {
      if (err?.response?.status === 409 && ['DOCUMENT_CONFLICT', 'SPREADSHEET_OPERATION_CONFLICT'].includes(err?.response?.data?.code)) {
        const alreadySaved = await resolveDocumentSaveConflict(doc, title, blocks, err, { spreadsheetDoc });
        if (!silent && !alreadySaved) {
          message.warning('检测到协作者更新，已自动同步最新内容并保留你的本地修改');
        }
        return null;
      }
      if (!silent) {
        message.error(getDocumentSaveErrorMessage(err, '保存失败'));
      }
      throw err;
    } finally {
      delete pendingSavePromisesRef.current[doc.id];
      if (!silent) setSaving(false);
    }
  };

  const applySavedDocumentMetadata = (doc, title, blocks, updated) => {
    const docId = getDocTabId(doc?.id || updated?.id);
    if (!docId || !updated) return;
    const signature = getDocumentSaveSignature(title, blocks);
    lastSavedSignatureRef.current[docId] = signature;
    dirtyDocumentIdsRef.current.delete(docId);
    setRemoteDocumentSnapshot(docId, {
      title,
      blocks,
      content: updated.content,
      updated_at: updated.updated_at,
      updated_by: updated.updated_by,
      updated_by_name: updated.updated_by_name,
    });
    if (isActiveDocumentId(docId)) {
      setSelectedDoc(prev => (
        getDocTabId(prev?.id) === docId ? { ...prev, ...updated } : prev
      ));
      setRemoteUpdateHint('');
    }
    upsertDocTab(updated);
    setDocTabStates(prev => {
      const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
      return {
        ...prev,
        [docId]: {
          ...previousState,
          doc: { ...(previousState.doc || {}), ...updated },
        },
      };
    });
    setDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
    setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
  };

  const resolveDocumentSaveConflict = async (doc, title, blocks, err, { spreadsheetDoc = false } = {}) => {
    const latest = err?.response?.data?.latest;
    if (!latest?.id) {
      await syncDocumentFromRemote(doc.id);
      return false;
    }
    if (spreadsheetDoc || isSpreadsheetDocument(doc)) {
      const docId = getDocTabId(doc.id);
      const activeSnapshot = getDocTabId(activeEditorSnapshotRef.current?.doc?.id) === docId
        ? activeEditorSnapshotRef.current
        : null;
      const previousRemoteSnapshot = getRemoteDocumentSnapshot(docId) || {};
      const mergedWorkbook = mergeSpreadsheetWorkbookSnapshots(
        previousRemoteSnapshot.content,
        activeSnapshot?.doc?.content || doc.content,
        latest.content,
      );
      const mergedTitle = mergeCollaborativeDocumentSnapshots(
        { title: previousRemoteSnapshot.title || doc.title || '', blocks: [] },
        { title: activeSnapshot?.editorTitle ?? title ?? doc.title ?? '', blocks: [] },
        { title: latest.title || '', blocks: [] },
      );
      const hadConflicts = mergedWorkbook.hadConflicts || mergedTitle.hadConflicts;
      const conflictHint = buildSpreadsheetCollaborationHint({
        updatedByName: latest.updated_by_name,
        hasLocalDirty: true,
        hadConflicts,
      });
      if (isActiveDocumentId(docId)) {
        setRemoteUpdateHint('');
        setSpreadsheetConflictNotice({ docId, text: conflictHint });
        message.warning({
          key: `spreadsheet-collaboration-${docId}`,
          content: conflictHint,
          duration: 8,
        });
      }
      await syncDocumentFromRemote(doc.id, { remoteDocument: latest });
      return false;
    }
    const latestBlocks = contentToBlocks(latest.content);
    const localSignature = getDocumentSaveSignature(title, blocks);
    const latestSignature = getDocumentSaveSignature(latest.title || '', latestBlocks);
    if (localSignature !== latestSignature) {
      await syncDocumentFromRemote(doc.id);
      return false;
    }
    applySavedDocumentMetadata(doc, title, blocks, latest);
    return true;
  };

  const saveDocumentSnapshot = async (snapshot, { force = false } = {}) => {
    const doc = snapshot?.doc;
    if (!doc?.id || !canEditDoc(doc)) return null;
    const blocks = Array.isArray(snapshot.editorBlocks) ? snapshot.editorBlocks : contentToBlocks(doc.content);
    const title = snapshot.editorTitle ?? doc.title ?? '';
    const spreadsheetDoc = isSpreadsheetDocument(doc);
    const payload = spreadsheetDoc
      ? buildRawDocumentWritePayload(title, doc.content, doc.content_text, getRemoteDocumentSnapshot(doc.id)?.updated_at || doc.updated_at)
      : buildDocumentWritePayload(title, blocks, getRemoteDocumentSnapshot(doc.id)?.updated_at || doc.updated_at);
    const signature = spreadsheetDoc
      ? getDocumentRawSaveSignature(title, doc.content)
      : getDocumentSaveSignature(title, blocks);
    const docId = getDocTabId(doc.id);
    if (!force && lastSavedSignatureRef.current[doc.id] === signature) {
      dirtyDocumentIdsRef.current.delete(docId);
      return null;
    }
    if (pendingSavePromisesRef.current[doc.id]) return pendingSavePromisesRef.current[doc.id];
    const remoteSnapshot = spreadsheetDoc ? getRemoteDocumentSnapshot(doc.id) : null;
    const operationPlan = spreadsheetDoc
      ? buildSpreadsheetOperationSavePlan({
          baseWorkbook: remoteSnapshot?.content,
          localWorkbook: doc.content,
          titleChanged: !remoteSnapshot || String(title || '') !== String(remoteSnapshot.title || ''),
        })
      : null;
    const useSpreadsheetOperations = operationPlan?.mode === 'operations' && operationPlan.operations.length > 0;
    const savePromise = (useSpreadsheetOperations
      ? documentsApi.applySpreadsheetOperations(doc.id, {
          base_updated_at: remoteSnapshot?.updated_at || doc.updated_at,
          operations: operationPlan.operations,
        })
      : documentsApi.updateContent(doc.id, payload))
      .then(updated => {
        if (useSpreadsheetOperations) {
          if (!spreadsheetOperationsAreApplied(updated?.content, operationPlan.operations)) {
            throw new Error('表格操作保存结果校验失败，请重试');
          }
          return updated;
        }
        return spreadsheetDoc
          ? assertRawDocumentSaveApplied(updated, signature)
          : assertDocumentSaveApplied(updated, signature);
      });
    pendingSavePromisesRef.current[doc.id] = savePromise;
    try {
      const updated = await savePromise;
      lastSavedSignatureRef.current[doc.id] = useSpreadsheetOperations
        ? getDocumentRawSaveSignature(updated.title || title, updated.content)
        : signature;
      dirtyDocumentIdsRef.current.delete(docId);
      setRemoteDocumentSnapshot(docId, {
        title,
        blocks,
        content: updated.content,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
        updated_by_name: updated.updated_by_name,
      });
      if (isActiveDocumentId(docId)) {
        setSelectedDoc(prev => (
          getDocTabId(prev?.id) === docId ? { ...prev, ...updated } : prev
        ));
        if (!spreadsheetDoc) setRemoteUpdateHint('');
      }
      upsertDocTab(updated);
      setDocTabStates(prev => {
        const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
        return {
          ...prev,
          [docId]: {
            ...previousState,
            doc: { ...(previousState.doc || {}), ...updated },
          },
        };
      });
      setDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === docId ? { ...item, ...updated } : item)));
      return updated;
    } catch (err) {
      if (err?.response?.status === 409 && ['DOCUMENT_CONFLICT', 'SPREADSHEET_OPERATION_CONFLICT'].includes(err?.response?.data?.code)) {
        await resolveDocumentSaveConflict(doc, title, blocks, err, { spreadsheetDoc });
        return null;
      }
      throw err;
    } finally {
      delete pendingSavePromisesRef.current[doc.id];
    }
  };

  const saveDirtyDocumentTabs = async () => {
    const dirtyIds = Array.from(dirtyDocumentIdsRef.current);
    if (!dirtyIds.length) return [];
    const snapshots = dirtyIds
      .map(docId => {
        if (
          selectedDocIdRef.current === docId
          && getDocTabId(activeEditorSnapshotRef.current?.doc?.id) === getDocTabId(docId)
        ) return activeEditorSnapshotRef.current;
        return getValidDocTabState(docId, docTabStatesRef.current);
      })
      .filter(Boolean);
    return Promise.all(snapshots.map(snapshot => saveDocumentSnapshot(snapshot).catch(() => null)));
  };

  saveDirtyDocumentTabsRef.current = saveDirtyDocumentTabs;

  const syncDocumentFromRemote = async (docId, { remoteDocument = null } = {}) => {
    const normalizedId = getDocTabId(docId);
    const hasProvidedRemoteDocument = Boolean(remoteDocument?.id);
    if (!normalizedId || (!hasProvidedRemoteDocument && liveSyncPendingDocIdsRef.current.has(normalizedId))) return;
    const activeDocId = getDocTabId(selectedDocIdRef.current || selectedDocId);
    const isActiveDoc = activeDocId === normalizedId;
    const activeSnapshot = getDocTabId(activeEditorSnapshotRef.current?.doc?.id) === normalizedId
      ? activeEditorSnapshotRef.current
      : null;
    const activeSelectedDoc = getDocTabId(selectedDoc?.id) === normalizedId ? selectedDoc : null;
    const activeState = (activeSnapshot || activeSelectedDoc)
      ? {
          doc: activeSnapshot?.doc || activeSelectedDoc,
          editorTitle: activeSnapshot?.editorTitle ?? editorTitle,
          editorBlocks: activeSnapshot?.editorBlocks || editorBlocks,
          selectedBlockId,
          tocOpen,
        }
      : null;
    const localState = isActiveDoc
      ? (activeState || getValidDocTabState(normalizedId, docTabStatesRef.current))
      : getValidDocTabState(normalizedId, docTabStatesRef.current);
    const localDoc = localState?.doc;
    if (!localDoc?.id) return;

    if (!hasProvidedRemoteDocument) liveSyncPendingDocIdsRef.current.add(normalizedId);
    try {
      const latestKnownUpdatedAt = getRemoteDocumentSnapshot(normalizedId)?.updated_at || localDoc.updated_at || '';
      const liveData = hasProvidedRemoteDocument
        ? { ...remoteDocument, has_changes: true }
        : await documentsApi.live(normalizedId, latestKnownUpdatedAt ? { since: latestKnownUpdatedAt } : undefined);
      if (!liveData?.has_changes) {
        if (liveData?.updated_at && latestKnownUpdatedAt !== liveData.updated_at) {
          setRemoteDocumentSnapshot(normalizedId, {
            title: getRemoteDocumentSnapshot(normalizedId)?.title || localDoc.title || '',
            blocks: getRemoteDocumentSnapshot(normalizedId)?.blocks || (Array.isArray(localState?.editorBlocks) ? localState.editorBlocks : contentToBlocks(localDoc.content)),
            content: getRemoteDocumentSnapshot(normalizedId)?.content,
            updated_at: liveData.updated_at,
            updated_by: liveData.updated_by,
            updated_by_name: liveData.updated_by_name,
          });
        }
        return;
      }
      if (isSpreadsheetDocument(liveData) || isSpreadsheetDocument(localDoc)) {
        const previousRemoteSnapshot = getRemoteDocumentSnapshot(normalizedId) || {};
        const hasLocalDirty = dirtyDocumentIdsRef.current.has(normalizedId);
        let nextTitle = liveData.title || '';
        let nextContent = liveData.content;
        let hadConflicts = false;
        if (hasLocalDirty) {
          const mergedWorkbook = mergeSpreadsheetWorkbookSnapshots(
            previousRemoteSnapshot.content,
            localDoc.content,
            liveData.content,
          );
          const mergedTitle = mergeCollaborativeDocumentSnapshots(
            { title: previousRemoteSnapshot.title || localDoc.title || '', blocks: [] },
            { title: localState?.editorTitle ?? localDoc.title ?? '', blocks: [] },
            { title: liveData.title || '', blocks: [] },
          );
          nextTitle = mergedTitle.title;
          nextContent = mergedWorkbook.workbook;
          hadConflicts = mergedWorkbook.hadConflicts || mergedTitle.hadConflicts;
        }
        const nextSpreadsheetDoc = {
          ...(localDoc || {}),
          ...liveData,
          title: nextTitle,
          content: nextContent,
          content_text: hasLocalDirty ? spreadsheetWorkbookToText(nextContent) : liveData.content_text,
          document_kind: 'spreadsheet',
        };
        lastSavedSignatureRef.current[normalizedId] = getDocumentRawSaveSignature(
          hasLocalDirty ? (liveData.title || '') : (nextSpreadsheetDoc.title || ''),
          hasLocalDirty ? liveData.content : nextSpreadsheetDoc.content,
        );
        if (hasLocalDirty) dirtyDocumentIdsRef.current.add(normalizedId);
        else dirtyDocumentIdsRef.current.delete(normalizedId);
        setRemoteDocumentSnapshot(normalizedId, {
          title: liveData.title || '',
          blocks: Array.isArray(localState?.editorBlocks) ? localState.editorBlocks : contentToBlocks(nextSpreadsheetDoc.content),
          content: liveData.content,
          updated_at: nextSpreadsheetDoc.updated_at,
          updated_by: nextSpreadsheetDoc.updated_by,
          updated_by_name: nextSpreadsheetDoc.updated_by_name,
        });
        setDocTabStates(prev => {
          const previousState = getDocTabId(prev[normalizedId]?.doc?.id) === normalizedId
            ? prev[normalizedId]
            : {};
          return {
            ...prev,
            [normalizedId]: {
              ...previousState,
              doc: nextSpreadsheetDoc,
              editorTitle: nextSpreadsheetDoc.title || '',
              editorBlocks: previousState.editorBlocks || localState?.editorBlocks || [createBlock()],
              selectedBlockId: previousState.selectedBlockId ?? localState?.selectedBlockId ?? null,
              tocOpen: previousState.tocOpen ?? localState?.tocOpen ?? asSwitchValue(nextSpreadsheetDoc.toc_enabled, true),
            },
          };
        });
        upsertDocTab(nextSpreadsheetDoc);
        setDocuments(prev => prev.map(item => (getDocTabId(item.id) === normalizedId ? { ...item, ...nextSpreadsheetDoc } : item)));
        setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === normalizedId ? { ...item, ...nextSpreadsheetDoc } : item)));
        if (isActiveDocumentId(normalizedId)) {
          setSelectedDoc(nextSpreadsheetDoc);
          setEditorTitle(nextSpreadsheetDoc.title || '');
          const syncHint = buildSpreadsheetCollaborationHint({
            updatedByName: nextSpreadsheetDoc.updated_by_name,
            hasLocalDirty,
            hadConflicts,
          });
          if (hasLocalDirty) {
            setRemoteUpdateHint('');
            setSpreadsheetConflictNotice({ docId: normalizedId, text: syncHint });
            message.warning({
              key: `spreadsheet-collaboration-${normalizedId}`,
              content: syncHint,
              duration: 8,
            });
          } else {
            setRemoteUpdateHint(syncHint);
          }
        }
        return;
      }
      const remoteSnapshot = buildDocumentSyncSnapshot(liveData.title || '', contentToBlocks(liveData.content), {
        updated_at: liveData.updated_at,
        updated_by: liveData.updated_by,
        updated_by_name: liveData.updated_by_name,
      });
      const previousRemoteSnapshot = getRemoteDocumentSnapshot(normalizedId) || buildDocumentSyncSnapshot(
        localDoc.title || '',
        Array.isArray(localState?.editorBlocks) ? localState.editorBlocks : contentToBlocks(localDoc.content),
        {
          updated_at: localDoc.updated_at,
          updated_by: localDoc.updated_by,
          updated_by_name: localDoc.updated_by_name,
        }
      );

      if (previousRemoteSnapshot.updated_at && previousRemoteSnapshot.updated_at === remoteSnapshot.updated_at) return;

      const hasLocalDirty = dirtyDocumentIdsRef.current.has(normalizedId);
      let nextTitle = remoteSnapshot.title;
      let nextBlocks = remoteSnapshot.blocks;
      let hadConflicts = false;

      if (hasLocalDirty) {
        const merged = mergeCollaborativeDocumentSnapshots(
          previousRemoteSnapshot,
          buildDocumentSyncSnapshot(localState?.editorTitle ?? localDoc.title ?? '', localState?.editorBlocks || [], {
            updated_at: localDoc.updated_at,
            updated_by: localDoc.updated_by,
            updated_by_name: localDoc.updated_by_name,
          }),
          remoteSnapshot
        );
        nextTitle = merged.title;
        nextBlocks = merged.blocks;
        hadConflicts = merged.hadConflicts;
        lastSavedSignatureRef.current[normalizedId] = getDocumentSaveSignature(remoteSnapshot.title, remoteSnapshot.blocks);
        dirtyDocumentIdsRef.current.add(normalizedId);
      } else {
        lastSavedSignatureRef.current[normalizedId] = getDocumentSaveSignature(remoteSnapshot.title, remoteSnapshot.blocks);
        dirtyDocumentIdsRef.current.delete(normalizedId);
      }

      const mergedDoc = {
        ...(localDoc || {}),
        ...liveData,
        title: nextTitle,
        content: blocksToContent(nextBlocks),
        content_text: blocksToText(nextBlocks),
      };
      setRemoteDocumentSnapshot(normalizedId, {
        title: remoteSnapshot.title,
        blocks: remoteSnapshot.blocks,
        updated_at: remoteSnapshot.updated_at,
        updated_by: remoteSnapshot.updated_by,
        updated_by_name: remoteSnapshot.updated_by_name,
      });

      setDocTabStates(prev => {
        const previousState = getDocTabId(prev[normalizedId]?.doc?.id) === normalizedId
          ? prev[normalizedId]
          : {};
        return {
          ...prev,
          [normalizedId]: {
            ...previousState,
            doc: mergedDoc,
            editorTitle: nextTitle,
            editorBlocks: nextBlocks,
            selectedBlockId: previousState.selectedBlockId ?? localState?.selectedBlockId ?? nextBlocks[0]?.id ?? null,
            tocOpen: previousState.tocOpen ?? localState?.tocOpen ?? asSwitchValue(mergedDoc.toc_enabled, true),
          },
        };
      });
      upsertDocTab(mergedDoc);
      setDocuments(prev => prev.map(item => (getDocTabId(item.id) === normalizedId ? { ...item, ...mergedDoc } : item)));
      setFolderTreeDocuments(prev => prev.map(item => (getDocTabId(item.id) === normalizedId ? { ...item, ...mergedDoc } : item)));

      if (isActiveDocumentId(normalizedId)) {
        setSelectedDoc(mergedDoc);
        setEditorTitle(nextTitle);
        setEditorBlocks(nextBlocks);
        setSelectedBlockId(prev => prev ?? localState?.selectedBlockId ?? nextBlocks[0]?.id ?? null);
        setRemoteUpdateHint(hadConflicts
          ? `检测到他人更新，已自动合并本地修改与${remoteSnapshot.updated_by_name || '协作者'}的最新内容`
          : `已同步${remoteSnapshot.updated_by_name || '协作者'}的最新修改`);
      }
    } catch (err) {
      if (err?.status !== 404 && err?.status !== 403) {
        console.error(err);
      }
    } finally {
      if (!hasProvidedRemoteDocument) liveSyncPendingDocIdsRef.current.delete(normalizedId);
    }
  };

  const handleSave = () => {
    saveCurrentDocument({ force: true }).catch(() => {});
  };

  saveCurrentDocumentRef.current = saveCurrentDocument;

  const getDocTabSnapshot = async (docId) => {
    const normalizedId = getDocTabId(docId);
    if (isActiveDocumentId(normalizedId) && getDocTabId(selectedDoc?.id) === normalizedId) {
      return {
        doc: selectedDoc,
        editorTitle,
        editorBlocks,
      };
    }
    const cached = getValidDocTabState(normalizedId, docTabStates);
    if (cached && Array.isArray(cached.editorBlocks)) {
      return cached;
    }
    const detail = await documentsApi.get(normalizedId);
    return {
      doc: detail,
      editorTitle: detail.title || '',
      editorBlocks: contentToBlocks(detail.content),
    };
  };

  const getCachedDocTabSnapshot = (docId) => {
    const normalizedId = getDocTabId(docId);
    if (isActiveDocumentId(normalizedId) && getDocTabId(selectedDoc?.id) === normalizedId) {
      return {
        doc: selectedDoc,
        editorTitle,
        editorBlocks,
      };
    }
    const cached = getValidDocTabState(normalizedId, docTabStatesRef.current)
      || getValidDocTabState(normalizedId, docTabStates);
    if (cached && Array.isArray(cached.editorBlocks)) return cached;
    return null;
  };

  const isDocTabSnapshotDirty = (snapshot) => {
    const doc = snapshot?.doc;
    if (!doc?.id || !canEditDoc(doc)) return false;
    const docId = getDocTabId(doc.id);
    const blocks = Array.isArray(snapshot.editorBlocks) && snapshot.editorBlocks.length
      ? snapshot.editorBlocks
      : contentToBlocks(doc.content);
    const title = snapshot.editorTitle ?? doc.title ?? '';
    const signature = getDocumentSaveSignature(title, blocks);
    const savedSignature = lastSavedSignatureRef.current[docId];
    if (savedSignature) return savedSignature !== signature;
    return dirtyDocumentIdsRef.current.has(docId);
  };

  const removeDocTab = (docId) => {
    const normalizedId = getDocTabId(docId);
    clearRemoteDocumentSnapshot(normalizedId);
    dirtyDocumentIdsRef.current.delete(normalizedId);
    const closingIndex = openDocTabs.findIndex(tab => getDocTabId(tab.id) === normalizedId);
    const nextTabs = openDocTabs.filter(tab => getDocTabId(tab.id) !== normalizedId);
    setOpenDocTabs(nextTabs);
    setDocTabStates(prev => {
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });

    if (!isActiveDocumentId(normalizedId)) return;
    const nextActiveTab = nextTabs[closingIndex] || nextTabs[closingIndex - 1] || null;
    if (nextActiveTab) {
      const nextActiveDocId = getDocTabId(nextActiveTab.id);
      replaceDocumentLinkParam(nextActiveDocId);
      setActiveDocumentId(nextActiveDocId);
    } else {
      clearActiveDocument();
    }
  };

  const closeDocTabsByIds = async (docIds, options = {}) => {
    const openTabsSnapshot = [...openDocTabs];
    const closingSet = new Set(closingTabIds);
    const targetIds = Array.from(new Set((Array.isArray(docIds) ? docIds : [docIds])
      .map(getDocTabId)
      .filter(docId => Number.isFinite(docId) && docId > 0)))
      .filter(docId => !closingSet.has(docId) && openTabsSnapshot.some(tab => getDocTabId(tab.id) === docId));
    if (!targetIds.length) return;

    const targetSet = new Set(targetIds);
    persistActiveDocTabState();
    setClosingTabIds(prev => Array.from(new Set([...prev, ...targetIds])));

    try {
      const snapshotsToSave = (await Promise.all(targetIds.map(async docId => {
        if (!dirtyDocumentIdsRef.current.has(docId)) return null;
        const snapshot = getCachedDocTabSnapshot(docId) || await getDocTabSnapshot(docId);
        if (!canEditDoc(snapshot?.doc)) {
          throw new Error('你没有编辑该文档的权限，本地修改尚未保存');
        }
        return isDocTabSnapshotDirty(snapshot) ? snapshot : null;
      }))).filter(Boolean);
      const savedResults = await Promise.all(snapshotsToSave.map(snapshot => saveDocumentSnapshot(snapshot)));

      targetIds.forEach(docId => {
        clearRemoteDocumentSnapshot(docId);
        dirtyDocumentIdsRef.current.delete(docId);
      });

      const nextTabs = openTabsSnapshot.filter(tab => !targetSet.has(getDocTabId(tab.id)));
      setOpenDocTabs(nextTabs);
      setDocTabStates(prev => {
        const next = { ...prev };
        targetIds.forEach(docId => { delete next[docId]; });
        return next;
      });

      const activeDocId = getDocTabId(selectedDocIdRef.current);
      if (targetSet.has(activeDocId)) {
        const requestedNextActiveId = getDocTabId(options.nextActiveDocId);
        let nextActiveTab = null;
        if (Number.isFinite(requestedNextActiveId) && requestedNextActiveId > 0 && !targetSet.has(requestedNextActiveId)) {
          nextActiveTab = nextTabs.find(tab => getDocTabId(tab.id) === requestedNextActiveId)
            || getDocumentSummaryById(requestedNextActiveId);
        } else if (options.fallbackToNeighbor !== false) {
          const firstClosingIndex = openTabsSnapshot.findIndex(tab => targetSet.has(getDocTabId(tab.id)));
          nextActiveTab = nextTabs[firstClosingIndex] || nextTabs[firstClosingIndex - 1] || null;
        }

        if (nextActiveTab?.id) {
          const nextActiveDocId = getDocTabId(nextActiveTab.id);
          replaceDocumentLinkParam(nextActiveDocId);
          setActiveDocumentId(nextActiveDocId);
        } else {
          clearActiveDocument();
        }
      } else if (!nextTabs.length) {
        clearActiveDocument();
      }

      if (savedResults.some(Boolean)) {
        await loadFolderTreeDocuments();
      }
      message.success(savedResults.some(Boolean)
        ? (options.successMessage || '已保存并关闭标签页')
        : (options.closeMessage || '已关闭标签页'));
    } catch (err) {
      message.error(getDocumentSaveErrorMessage(err, '关闭前自动保存失败'));
    } finally {
      setClosingTabIds(prev => prev.filter(id => !targetSet.has(id)));
    }
  };

  const handleCloseDocTab = async (event, docId) => {
    event.stopPropagation();
    const normalizedId = getDocTabId(docId);
    if (!normalizedId) return;
    await closeDocTabsByIds([normalizedId], { successMessage: '已保存并关闭当前标签页' });
  };

  const handleCloseAllDocTabs = async () => {
    await closeDocTabsByIds(openDocTabs.map(tab => tab.id), {
      fallbackToNeighbor: false,
      successMessage: '已保存并关闭全部标签页',
    });
  };

  const handleCloseOtherDocTabs = async (docId) => {
    const normalizedId = getDocTabId(docId);
    await closeDocTabsByIds(
      openDocTabs.filter(tab => getDocTabId(tab.id) !== normalizedId).map(tab => tab.id),
      {
        nextActiveDocId: normalizedId,
        fallbackToNeighbor: false,
        successMessage: '已保存并关闭其他标签页',
      }
    );
  };

  const handleCloseRightDocTabs = async (docId) => {
    const normalizedId = getDocTabId(docId);
    const tabIndex = openDocTabs.findIndex(tab => getDocTabId(tab.id) === normalizedId);
    if (tabIndex === -1) return;
    await closeDocTabsByIds(
      openDocTabs.slice(tabIndex + 1).map(tab => tab.id),
      {
        nextActiveDocId: normalizedId,
        fallbackToNeighbor: false,
        successMessage: '已保存并关闭右侧标签页',
      }
    );
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
    const docId = getDocTabId(selectedDoc.id);
    const payload = buildPageOptionsPayload(patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'toc_enabled')) {
      setTocOpen(Boolean(patch.toc_enabled));
      if (!patch.toc_enabled) setMobileTocOpen(false);
    }
    setOptionsSaving(true);
    try {
      await documentsApi.updatePageOptions(docId, payload);
      if (isActiveDocumentId(docId)) {
        setSelectedDoc(prev => (
          getDocTabId(prev?.id) === docId ? { ...prev, ...payload } : prev
        ));
      }
      message.success('页面选项已保存');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '保存页面选项失败');
    } finally {
      setOptionsSaving(false);
    }
  };

  const openShare = async () => {
    if (!selectedDoc) return;
    const docId = getDocTabId(selectedDoc.id);
    setShareOpen(true);
    setShareLoading(true);
    try {
      const [shares, accessSummary] = await Promise.all([
        documentsApi.listShares(docId),
        documentsApi.accessSummary(docId),
        loadShareOptions(),
      ]);
      setShareDraft(sharesToDraft(shares));
      if (isActiveDocumentId(docId)) {
        setSelectedDoc(prev => (
          getDocTabId(prev?.id) === docId ? { ...prev, access_summary: accessSummary } : prev
        ));
      }
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载共享范围失败');
    } finally {
      setShareLoading(false);
    }
  };

  const toggleBulkShareMode = () => {
    if (bulkShareMode) {
      setBulkShareMode(false);
      setBulkSelectedDocIds([]);
      setBulkShareDocuments([]);
      return;
    }
    setBulkShareMode(true);
  };

  const toggleBulkDocumentSelection = (doc, checked) => {
    const docId = Number(doc?.id);
    if (!docId) return;
    if (!Number(doc?.can_edit || 0)) {
      message.warning('只有可编辑的文档可以批量添加共享人');
      return;
    }
    setBulkSelectedDocIds(prev => {
      const current = new Set(prev.map(id => Number(id)));
      if (checked) current.add(docId);
      else current.delete(docId);
      return Array.from(current);
    });
  };

  const handleBulkTreeCheck = (checkedInfo, info = {}) => {
    const node = info.node;
    if (node?.nodeType === 'folder') {
      const editableDocumentIds = Array.isArray(node.bulkDocumentIds) ? node.bulkDocumentIds : [];
      if (!editableDocumentIds.length) {
        message.warning('该文件夹下没有可批量共享的文档');
        return;
      }
      setBulkSelectedDocIds(prev => updateBulkFolderSelection(prev, editableDocumentIds, Boolean(info.checked)));
      const skippedCount = Math.max(0, Number(node.documentIds?.length || 0) - editableDocumentIds.length);
      if (info.checked && skippedCount > 0) {
        message.info(`已跳过 ${skippedCount} 篇无编辑权限的文档`);
      }
      return;
    }
    if (node?.nodeType === 'document') {
      toggleBulkDocumentSelection(node.document || { id: node.documentId }, Boolean(info.checked));
      return;
    }

    const checkedKeys = Array.isArray(checkedInfo) ? checkedInfo : (checkedInfo?.checked || []);
    const visibleTreeDocIds = new Set(folderTreeDocuments.map(doc => Number(doc.id)).filter(Boolean));
    const checkedDocIds = checkedKeys
      .map(key => String(key || ''))
      .filter(key => key.startsWith('document-'))
      .map(key => Number(key.replace('document-', '')))
      .filter(id => visibleTreeDocIds.has(id));
    setBulkSelectedDocIds(prev => {
      const next = prev.map(id => Number(id)).filter(id => !visibleTreeDocIds.has(id));
      checkedDocIds.forEach(id => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });
  };

  const selectVisibleBulkDocuments = () => {
    const visibleEditableIds = folderTreeDocuments
      .filter(doc => Number(doc.can_edit || 0))
      .map(doc => Number(doc.id))
      .filter(Boolean);
    if (!visibleEditableIds.length) {
      message.warning('当前筛选范围没有可批量共享的文档');
      return;
    }
    setBulkSelectedDocIds(prev => Array.from(new Set([
      ...prev.map(id => Number(id)).filter(Boolean),
      ...visibleEditableIds,
    ])));
  };

  const openBulkShare = async () => {
    if (!bulkSelectedDocIds.length) {
      message.warning('请先勾选要批量共享的文档');
      return;
    }
    setBulkShareDraft(emptyShareDraft());
    setBulkShareOpen(true);
    setBulkShareLoading(true);
    try {
      await loadShareOptions();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载共享选项失败');
    } finally {
      setBulkShareLoading(false);
    }
  };

  const saveBulkShares = async () => {
    const shares = draftToShares(bulkShareDraft);
    if (!bulkSelectedDocIds.length) {
      message.warning('请先勾选要批量共享的文档');
      return;
    }
    if (!shares.length) {
      message.warning('请选择要追加的共享对象');
      return;
    }
    setBulkShareSaving(true);
    try {
      const batches = chunkBulkDocumentIds(bulkSelectedDocIds);
      const results = [];
      for (const batch of batches) {
        // Keep batches sequential so a large folder selection does not overload the server.
        // eslint-disable-next-line no-await-in-loop
        results.push(await documentsApi.addBulkShares(batch, shares));
      }
      await loadFolderTreeDocuments();
      if (selectedDoc?.id && bulkSelectedDocIdSet.has(Number(selectedDoc.id))) {
        await loadDetail(selectedDoc.id, { force: true });
      }
      setBulkShareOpen(false);
      setBulkSelectedDocIds([]);
      const successCount = results.reduce((sum, item) => sum + Number(item.success_count || 0), 0);
      const failedCount = results.reduce((sum, item) => sum + Number(item.failed_count || 0), 0);
      if (failedCount > 0) {
        message.warning(`已为 ${successCount} 篇文档追加共享权限，${failedCount} 篇失败`);
      } else {
        message.success(`已为 ${successCount} 篇文档追加共享权限`);
      }
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '批量共享失败');
    } finally {
      setBulkShareSaving(false);
    }
  };

  const saveShares = async () => {
    if (!selectedDoc) return;
    const docId = getDocTabId(selectedDoc.id);
    setShareSaving(true);
    try {
      const data = await documentsApi.saveShares(docId, draftToShares(shareDraft));
      if (isActiveDocumentId(docId)) {
        setSelectedDoc(prev => (
          getDocTabId(prev?.id) === docId
            ? {
                ...prev,
                shares: data.shares,
                access_summary: data.access_summary,
              }
            : prev
        ));
      }
      await loadFolderTreeDocuments();
      setShareOpen(false);
      message.success('共享范围已保存');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '保存共享范围失败');
    } finally {
      setShareSaving(false);
    }
  };

  const openChangeLogs = async () => {
    if (!selectedDoc) return;
    const docId = getDocTabId(selectedDoc.id);
    setChangeLogRefreshing(true);
    try {
      const detail = await loadFreshDocumentHistoryDetail({
        documentId: docId,
        savePendingChanges: () => saveCurrentDocument({ silent: true }),
        loadDocument: documentsApi.get,
      });
      if (!detail || !isActiveDocumentId(docId)) return;
      applySelectedDocMeta(detail, docId);
      const logs = sortChangeLogsLatestFirst(detail.change_logs || []);
      changeLogForm.resetFields();
      setEditingChangeLog(null);
      setChangeLogFormOpen(false);
      setActiveChangeLogTab('version');
      setExpandedChangeLogIds(logs[0]?.id ? [logs[0].id] : []);
      setChangeLogOpen(true);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '刷新改动历史失败');
    } finally {
      setChangeLogRefreshing(false);
    }
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
      await loadFolderTreeDocuments();
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
    if (!canManageDoc(selectedDoc)) {
      message.warning('你没有删除该文档的权限');
      return;
    }
    const deletedDocId = getDocTabId(selectedDoc.id);
    try {
      await documentsApi.delete(selectedDoc.id);
      message.success('文档已删除');
      removeDocTab(deletedDocId);
      await loadFolderTreeDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '删除失败');
    }
  };

  const openMoveFolder = (doc = selectedDoc) => {
    const targetDoc = doc?.id ? doc : selectedDoc;
    if (!targetDoc) return;
    if (!canMoveDoc(targetDoc)) {
      message.warning('你没有移动该文档的权限');
      return;
    }
    setPageMenuOpen(false);
    setDocContextMenu(prev => ({ ...prev, open: false }));
    setMoveFolderDoc(targetDoc);
    setMoveFolderId(targetDoc.folder_id ? Number(targetDoc.folder_id) : null);
    setMoveFolderOpen(true);
  };

  const handleMoveFolder = async () => {
    const targetDoc = moveFolderDoc || selectedDoc;
    if (!targetDoc || !moveFolderId) return;
    if (!canMoveDoc(targetDoc)) {
      message.warning('你没有移动该文档的权限');
      return;
    }
    const targetFolder = folders.find(folder => Number(folder.id) === Number(moveFolderId));
    if (!targetFolder) {
      message.error('请选择目标文件夹');
      return;
    }
    setMoveFolderSaving(true);
    try {
      const isActiveDoc = getDocTabId(selectedDoc?.id) === getDocTabId(targetDoc.id);
      await documentsApi.update(targetDoc.id, {
        folder_id: targetFolder.id,
        domain: targetFolder.domain || targetDoc.domain,
        project_group_id: targetFolder.project_group_id || 0,
        department_key: targetFolder.department_key || targetDoc.department_key,
        doc_type: targetFolder.default_doc_type || targetDoc.doc_type || 'IMP',
      });
      setMoveFolderOpen(false);
      setMoveFolderDoc(null);
      setSelectedFolderId(Number(targetFolder.id));
      if (targetFolder.domain) setDomainFilter(targetFolder.domain);
      if (isActiveDoc) await loadDetail(targetDoc.id, { force: true });
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
      await loadFolderTreeDocuments();
      if (selectedDoc?.id === doc.id) await loadDetail(doc.id, { force: true });
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '收藏操作失败');
    }
  };

  const toggleDocumentPin = async (doc) => {
    if (!doc?.id) return;
    const nextPinned = !doc.pinned_at;
    try {
      await requestDocumentPinState(doc.id, nextPinned);
      await loadFolderTreeDocuments();
      if (selectedDoc?.id === doc.id) await loadDetail(doc.id, { force: true });
      message.success(nextPinned ? '已置顶' : '已取消置顶');
    } catch (err) {
      message.error(err.message || '置顶操作失败');
    }
  };

  const handleApplyTemplate = async () => {
    try {
      const data = await documentsApi.applyFolderTemplate({});
      message.success(data.created > 0 ? `目录结构已初始化，新增 ${data.created} 个目录` : '目录结构已是最新');
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

  const duplicateBlocksByIds = (ids = []) => {
    const targetIds = normalizeBlockSelectionIds(ids);
    if (!targetIds.length) return false;
    const targetSet = new Set(targetIds);
    const sourceBlocks = editorBlocks.filter(block => targetSet.has(block.id));
    if (!sourceBlocks.length) return false;
    const copies = sourceBlocks.map(block => createBlock(block.type, block.content || '', {
      checked: Boolean(block.checked),
      highlight: block.highlight || '',
      meta: cloneMeta(block.meta),
    }));
    const lastSourceIndex = Math.max(...sourceBlocks.map(block => editorBlocks.findIndex(item => item.id === block.id)));
    pushEditorUndoSnapshot();
    const nextBlocks = [...editorBlocks];
    nextBlocks.splice(lastSourceIndex + 1, 0, ...copies);
    setEditorBlocks(nextBlocks);
    setSelectedBlockId(copies[0]?.id || null);
    const copyIds = copies.map(block => block.id);
    selectAllEditorBlocksRef.current = false;
    selectedAreaBlockIdsRef.current = copyIds;
    setSelectedAreaBlockIds(copyIds);
    pendingBlockMenuTargetIdsRef.current = [];
    activeBlockMenuTargetIdsRef.current = [];
    setBlockMenuTargetIds([]);
    setOpenBlockMenuId(null);
    setHoveredBlockId(null);
    window.setTimeout(() => document.getElementById(`doc-block-${copies[0]?.id}`)?.scrollIntoView({ block: 'nearest' }), 0);
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
    const currentHasHierarchy = isDocumentBlockHierarchyMember(block);
    const currentIndent = currentHasHierarchy ? getBlockHierarchyIndent(block) : 0;
    const currentComments = normalizeInlineComments(block?.meta?.comments);
    const nextIsHierarchicalList = isHierarchicalListBlock({ type });
    const nextMeta = {
      ...getDefaultBlockMeta(type),
      ...(nextIsHierarchicalList
        ? { indent: currentIndent }
        : (currentHasHierarchy ? { indent: currentIndent, hierarchy: 'list' } : {})),
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

  const buildLocalizedClipboardHtmlImageBlock = (block, attachment, originalUrl = '') => {
    const currentMeta = block.meta && typeof block.meta === 'object' ? block.meta : {};
    const displayName = attachment.display_name || attachment.filename || currentMeta.display_name || currentMeta.filename || block.content || '图片';
    return {
      ...block,
      type: 'image',
      content: attachment.filename || displayName,
      meta: {
        ...getDefaultBlockMeta('image'),
        ...currentMeta,
        ...attachmentToMediaMeta(attachment),
        display_name: displayName,
        filepath: attachment.filepath || currentMeta.filepath || '',
        file_ext: attachment.file_ext || getFileExt(displayName),
        size: Number(attachment.size || currentMeta.size || 0),
        preview_status: attachment.preview_status || currentMeta.preview_status || 'supported',
        embedOnly: true,
        remote: false,
        source_system: 'clipboard_html',
        original_url: currentMeta.original_url || originalUrl || currentMeta.url || '',
        alt: currentMeta.alt || displayName,
      },
    };
  };

  const uploadClipboardHtmlImageFiles = async (entries = []) => {
    if (!entries.length) return [];
    const formData = new FormData();
    formData.append('source_type', 'document');
    formData.append('source_id', selectedDoc.id);
    entries.forEach(entry => formData.append('files', entry.file));
    const rows = await attachmentsApi.upload(formData);
    return (rows || []).map((attachment, index) => ({ attachment, entry: entries[index] })).filter(item => item.attachment);
  };

  const importClipboardHtmlImageUrl = async (entry) => attachmentsApi.importUrl({
    source_type: 'document',
    source_id: selectedDoc.id,
    url: entry.url,
    filename: entry.filename,
    referer: entry.referer,
  });

  const localizeClipboardHtmlImageBlocks = async (blocks = [], clipboardImageFiles = []) => {
    const imageIndexes = blocks
      .map((block, blockIndex) => ({ block, blockIndex }))
      .filter(item => isClipboardHtmlImageBlock(item.block));
    if (!imageIndexes.length) return { blocks, localizedCount: 0, failedCount: 0 };

    const supportedClipboardFiles = Array.from(clipboardImageFiles || [])
      .filter(file => {
        const ext = getFileExt(file?.name);
        const mime = String(file?.type || '').toLowerCase();
        return imageExts.includes(ext) || Boolean(clipboardImageExtByMime[mime]);
      })
      .slice(0, clipboardImagePasteLimit)
      .map(normalizeClipboardImageFile);

    const nextBlocks = [...blocks];
    const uploadEntries = [];
    const serverImportEntries = [];
    let fallbackFileIndex = 0;
    let failedCount = 0;

    for (let imagePosition = 0; imagePosition < imageIndexes.length; imagePosition += 1) {
      const { block, blockIndex } = imageIndexes[imagePosition];
      const meta = block.meta && typeof block.meta === 'object' ? block.meta : {};
      const url = getClipboardHtmlImageBlockUrl(block);
      const filename = meta.filename || meta.display_name || block.content || `clipboard-html-image-${imagePosition + 1}.png`;
      let file = null;

      if (/^data:image\//i.test(url)) {
        try {
          file = dataUriToClipboardHtmlImageFile(url, filename, imagePosition);
        } catch {
          file = null;
        }
      }

      if (!file && supportedClipboardFiles.length === imageIndexes.length) {
        file = supportedClipboardFiles[imagePosition] || null;
      }

      if (!file && /^https?:\/\//i.test(url)) {
        try {
          file = await fetchClipboardHtmlImageAsFile(url, filename, imagePosition);
        } catch {
          file = null;
        }
      }

      if (!file && supportedClipboardFiles.length !== imageIndexes.length && fallbackFileIndex < supportedClipboardFiles.length) {
        file = supportedClipboardFiles[fallbackFileIndex];
        fallbackFileIndex += 1;
      }

      if (file) {
        uploadEntries.push({ blockIndex, file, originalUrl: url });
      } else if (/^https?:\/\//i.test(url)) {
        serverImportEntries.push({
          blockIndex,
          url,
          filename: normalizeClipboardHtmlImageFilename(filename, meta.mimetype, imagePosition),
          referer: meta.source_url || '',
        });
      } else {
        failedCount += 1;
      }
    }

    let localizedCount = 0;
    const uploadedItems = await uploadClipboardHtmlImageFiles(uploadEntries);
    uploadedItems.forEach(({ attachment, entry }) => {
      if (!isImageAttachment(attachment)) {
        failedCount += 1;
        return;
      }
      nextBlocks[entry.blockIndex] = buildLocalizedClipboardHtmlImageBlock(nextBlocks[entry.blockIndex], attachment, entry.originalUrl);
      localizedCount += 1;
    });
    failedCount += Math.max(0, uploadEntries.length - uploadedItems.length);

    for (const entry of serverImportEntries) {
      try {
        const attachment = await importClipboardHtmlImageUrl(entry);
        if (!isImageAttachment(attachment)) throw new Error('远程资源不是图片');
        nextBlocks[entry.blockIndex] = buildLocalizedClipboardHtmlImageBlock(nextBlocks[entry.blockIndex], attachment, entry.url);
        localizedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    return { blocks: nextBlocks, localizedCount, failedCount };
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
    const nextBlockIds = nextBlocks.map(block => block.id);
    selectAllEditorBlocksRef.current = false;
    selectedAreaBlockIdsRef.current = nextBlockIds;
    setSelectedAreaBlockIds(nextBlockIds);
    setSelectedTableCell(null);
    setSelectedTableRange(null);
    setOpenBlockMenuId(null);
    setHoveredBlockId(null);
    window.setTimeout(() => {
      document.getElementById(`doc-block-${nextBlocks[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (nextBlocks.length === 1 && isTableLikeBlock(nextBlocks[0])) {
        document.getElementById(`doc-table-shell-${nextBlocks[0].id}`)?.focus?.();
      } else if (nextBlocks.length === 1) {
        focusBlock(nextBlocks[0].id);
      }
    }, 0);
    return true;
  };

  const handleEditorPaste = async (event) => {
    if (event.target?.closest?.('[data-inline-comment-panel="true"]')) return;
    if (event.target?.closest?.('input, textarea')) return;
    if (event.target?.closest?.('[data-document-table-cell="true"], [data-document-database-editor-block-id] input, [data-document-database-editor-block-id] textarea, [data-document-database-editor-block-id] [contenteditable="true"], [data-document-database-editor-block-id] .ant-select, [data-document-database-editor-block-id] .ant-picker')) return;
    const clipboardData = event.clipboardData;
    const clipboardHtml = clipboardData?.getData?.('text/html') || '';
    const targetBlockId = event.target?.closest?.('[data-doc-block-id]')?.getAttribute('data-doc-block-id')
      || selectedBlockId
      || editorBlocks[editorBlocks.length - 1]?.id
      || null;
    const pastedImageFiles = getClipboardImageFiles(event);
    const documentBlocks = parseClipboardDocumentBlocks(clipboardData);
    const inlineEditor = event.target?.closest?.('[contenteditable="true"]');
    const shouldPasteInline = Boolean(
      inlineEditor
      && !documentBlocks.length
      && !pastedImageFiles.length
      && !documentClipboardHasEmbeddedBlocks(clipboardHtml)
    );
    if (shouldPasteInline) {
      const inlineHtml = getPastedInlineClipboardHtml(clipboardData);
      if (!inlineHtml) return;
      event.preventDefault();
      event.stopPropagation();
      if (!canEditDoc(selectedDoc)) {
        message.warning('你没有编辑该文档的权限');
        return;
      }
      insertPastedInlineHtml(inlineEditor, inlineHtml);
      return;
    }
    const htmlBlocks = documentBlocks.length ? [] : parseClipboardHtmlDocumentBlocks(clipboardHtml);
    const pastedBlocks = documentBlocks.length ? documentBlocks : htmlBlocks;
    if (pastedBlocks.length) {
      event.preventDefault();
      event.stopPropagation();
      if (!canEditDoc(selectedDoc)) {
        message.warning('你没有编辑该文档的权限');
        return;
      }
      const hasClipboardHtmlImages = htmlBlocks.some(isClipboardHtmlImageBlock);
      if (hasClipboardHtmlImages) {
        if (!selectedDoc?.id) {
          message.warning('请先保存文档，再粘贴带图片的内容');
          return;
        }
        const asyncImageFiles = await getAsyncClipboardImageFiles();
        const allPastedImageFiles = dedupeClipboardImageFiles([...pastedImageFiles, ...asyncImageFiles]);
        if (allPastedImageFiles.length > clipboardImagePasteLimit) {
          message.info(`一次最多粘贴 ${clipboardImagePasteLimit} 张剪贴板图片，已优先处理前 ${clipboardImagePasteLimit} 张`);
        }
        const imageCount = htmlBlocks.filter(isClipboardHtmlImageBlock).length;
        const hideLoading = message.loading(imageCount > 1 ? `正在处理 ${imageCount} 张粘贴图片` : '正在处理粘贴图片', 0);
        try {
          const result = await localizeClipboardHtmlImageBlocks(htmlBlocks, allPastedImageFiles);
          if (insertBlocksFromClipboard(result.blocks, targetBlockId)) {
            if (result.failedCount) {
              message.warning(`已粘贴内容，${result.failedCount} 张图片未能转存，可能仍需手动上传`);
            } else {
              message.success(result.localizedCount > 1 ? `已粘贴内容和 ${result.localizedCount} 张图片` : '已粘贴内容和图片');
            }
          }
        } catch (err) {
          message.error(err.response?.data?.error || err.message || '粘贴图片处理失败');
        } finally {
          hideLoading();
        }
        return;
      }
      if (insertBlocksFromClipboard(pastedBlocks, targetBlockId)) message.success(pastedBlocks.length > 1 ? `已粘贴 ${pastedBlocks.length} 个块` : '已粘贴');
      return;
    }

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
    const totalSize = Number(file?.size || 0);
    if (totalSize > documentAttachmentChunkThreshold && typeof file.slice === 'function') {
      const uploadId = (
        window.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      ).replace(/[^A-Za-z0-9_-]/g, '');
      const chunkCount = Math.ceil(totalSize / documentAttachmentChunkSize);
      let uploadedBytes = 0;
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * documentAttachmentChunkSize;
        const end = Math.min(totalSize, start + documentAttachmentChunkSize);
        const chunk = file.slice(start, end, file.type || 'application/octet-stream');
        const formData = new FormData();
        formData.append('file', chunk, file.name);
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', String(chunkIndex));
        formData.append('chunk_count', String(chunkCount));
        formData.append('total_size', String(totalSize));
        formData.append('filename', file.name || '');
        formData.append('mimetype', file.type || '');
        formData.append('block_id', blockId);
        if (displayName) formData.append('display_name', displayName);
        const result = await documentsApi.uploadAttachmentChunk(selectedDoc.id, formData, {
          onUploadProgress: (progressEvent) => {
            const chunkLoaded = Math.min(Number(progressEvent.loaded || 0), end - start);
            setAttachmentUploadProgress(blockId, ((uploadedBytes + chunkLoaded) / totalSize) * 100);
          },
        });
        uploadedBytes = end;
        setAttachmentUploadProgress(blockId, (uploadedBytes / totalSize) * 100);
        if (result?.done) return result.attachment || result;
      }
      throw new Error('附件分片上传未完成，请重试');
    }
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
          markAttachmentBlockFailed(block.id, file, getDocumentAttachmentUploadErrorMessage(err));
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
      const errorText = getDocumentAttachmentUploadErrorMessage(err);
      markAttachmentBlockFailed(block.id, file, errorText);
      message.error(errorText);
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
    const url = getAttachmentUrl(attachment);
    if (!attachment?.id && url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
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
    const url = getAttachmentUrl(attachment);
    if (!attachment?.id && url) {
      setAttachmentPreviewState({ open: true, mode, attachment, loading: false });
      return;
    }
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
    if (key === 'duplicate') {
      duplicateBlocksByIds(targetIds);
      return;
    }
    if (key === 'insert-paragraph-before') {
      addBlockBefore(block.id, 'paragraph', { content: '' });
      return;
    }
    if (key === 'indent-right' || key === 'indent-left') {
      updateBlocksHierarchyIndent(targetIds, key === 'indent-right' ? 1 : -1);
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
    const hierarchyAdjustable = targetBlocks.length
      ? targetBlocks.some(canAdjustBlockHierarchyIndent)
      : canAdjustBlockHierarchyIndent(block);
    return [
      { key: 'copy', icon: <CopyOutlined />, label: targetCount > 1 ? `复制 ${targetCount} 个块` : (isTableLikeBlock(block) ? '复制整个表格' : '复制') },
      { key: 'duplicate', icon: <PlusCircleOutlined />, label: targetCount > 1 ? `拷贝 ${targetCount} 个块的副本` : '拷贝副本' },
      ...(hierarchyAdjustable ? [
        { key: 'indent-right', icon: <MenuUnfoldOutlined />, label: targetCount > 1 ? `右移 ${targetCount} 个块` : '右移一级' },
        { key: 'indent-left', icon: <MenuFoldOutlined />, label: targetCount > 1 ? `左移 ${targetCount} 个块` : '左移一级' },
      ] : []),
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
    if (!canAdjustBlockHierarchyIndent(block)) return false;
    const currentIndent = getBlockHierarchyIndent(block);
    const previousBlock = editorBlocks[index - 1];
    const previousIndent = isDocumentBlockHierarchyMember(previousBlock)
      ? getBlockHierarchyIndent(previousBlock)
      : -1;
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
        ...(!isHierarchicalListBlock(block) && block?.meta?.source_system !== 'wolai_mcp' ? { hierarchy: 'list' } : {}),
      },
    });
    setSelectedBlockId(block.id);
    focusBlock(block.id);
    return true;
  };

  const updateBlocksHierarchyIndent = (ids = [], direction) => {
    const targetIds = normalizeBlockSelectionIds(ids);
    if (!targetIds.length) return false;
    const targetSet = new Set(targetIds);
    let changed = false;
    const nextBlocks = editorBlocks.map(block => ({ ...block, meta: cloneMeta(block.meta) }));
    nextBlocks.forEach((block, index) => {
      if (!targetSet.has(block.id) || !canAdjustBlockHierarchyIndent(block)) return;
      const currentIndent = getBlockHierarchyIndent(block);
      const previousBlock = nextBlocks[index - 1];
      const previousIndent = isDocumentBlockHierarchyMember(previousBlock)
        ? getBlockHierarchyIndent(previousBlock)
        : -1;
      const maxAllowedIndent = direction > 0
        ? Math.min(maxListIndent, previousIndent + 1)
        : maxListIndent;
      const nextIndent = direction > 0
        ? Math.min(currentIndent + 1, maxAllowedIndent)
        : Math.max(0, currentIndent - 1);
      if (nextIndent === currentIndent) return;
      changed = true;
      block.meta = {
        ...(block.meta || {}),
        indent: nextIndent,
        ...(!isHierarchicalListBlock(block) && block?.meta?.source_system !== 'wolai_mcp' ? { hierarchy: 'list' } : {}),
      };
    });
    if (!changed) return false;
    pushEditorUndoSnapshot();
    setEditorBlocks(nextBlocks);
    const firstId = targetIds[0];
    setSelectedBlockId(firstId);
    setAreaBlockSelection(targetIds);
    focusBlock(firstId);
    return true;
  };

  const getBlockDragIdsFromEvent = (event) => {
    const fallbackIds = Array.isArray(blockDragState?.ids) ? blockDragState.ids : [];
    const raw = event?.dataTransfer?.getData?.(documentClipboardBlocksMime);
    if (!raw) return normalizeBlockSelectionIds(fallbackIds);
    try {
      const parsed = JSON.parse(raw);
      return normalizeBlockSelectionIds(parsed.blockIds || parsed.ids || fallbackIds);
    } catch {
      return normalizeBlockSelectionIds(fallbackIds);
    }
  };

  const hasBlockDragData = (event) => {
    const types = Array.from(event?.dataTransfer?.types || []);
    return types.includes(documentClipboardBlocksMime) || Boolean(blockDragState?.ids?.length);
  };

  const startBlockDrag = (event, blockId) => {
    const block = editorBlocks.find(item => item.id === blockId);
    if (!block || isBlankBlock(block)) {
      event.preventDefault();
      return;
    }
    blockHandleSelectionRef.current?.cleanup?.();
    const targetIds = captureBlockMenuTargetIds(blockId);
    const payload = JSON.stringify({ blockIds: targetIds });
    event.dataTransfer.setData(documentClipboardBlocksMime, payload);
    event.dataTransfer.effectAllowed = 'move';
    setBlockDragState({ ids: targetIds, sourceId: blockId });
    setOpenBlockMenuId(null);
  };

  const finishBlockDrag = () => {
    setBlockDragState(null);
  };

  const getBlockDropPlacement = (event) => {
    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (!rect) return 'after';
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const getDropIndentFromPointer = (event, targetBlock, placement, remainingBlocks, insertIndex) => {
    const targetIndent = getBlockHierarchyIndent(targetBlock);
    let desiredIndent = targetIndent;
    if (placement === 'after' && targetBlock?.type === 'fold-list') {
      desiredIndent = targetIndent + 1;
    } else {
      const rect = event.currentTarget?.getBoundingClientRect?.();
      if (rect) {
        const relativeX = event.clientX - rect.left - listMarkerBoxWidth - listMarkerTextGap;
        if (relativeX > listIndentWidth / 2) desiredIndent = Math.round(relativeX / listIndentWidth);
      }
    }
    const previousBlock = remainingBlocks[insertIndex - 1];
    const previousIndent = previousBlock && isDocumentBlockHierarchyMember(previousBlock)
      ? getBlockHierarchyIndent(previousBlock)
      : -1;
    const maxAllowedIndent = previousBlock ? Math.min(maxListIndent, previousIndent + 1) : 0;
    return Math.max(0, Math.min(maxAllowedIndent, clampListIndent(desiredIndent)));
  };

  const moveDraggedBlocks = (dragIds = [], targetId, event) => {
    const targetIds = normalizeBlockSelectionIds(dragIds);
    if (!targetIds.length || !targetId) return false;
    const targetSet = new Set(targetIds);
    if (targetSet.has(targetId)) return false;
    const movingBlocks = editorBlocks.filter(block => targetSet.has(block.id));
    const remainingBlocks = editorBlocks.filter(block => !targetSet.has(block.id));
    const targetIndex = remainingBlocks.findIndex(block => block.id === targetId);
    if (targetIndex < 0 || !movingBlocks.length) return false;
    const placement = getBlockDropPlacement(event);
    const insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;
    const targetBlock = remainingBlocks[targetIndex];
    const desiredIndent = getDropIndentFromPointer(event, targetBlock, placement, remainingBlocks, insertIndex);
    const baseIndent = getBlockHierarchyIndent(movingBlocks[0]);
    const adjustedMovingBlocks = movingBlocks.map(block => {
      const currentIndent = isDocumentBlockHierarchyMember(block)
        ? getBlockHierarchyIndent(block)
        : baseIndent;
      const nextIndent = clampListIndent(desiredIndent + currentIndent - baseIndent);
      if (nextIndent === currentIndent && isDocumentBlockHierarchyMember(block)) return block;
      return {
        ...block,
        meta: {
          ...getBlockMeta(block),
          indent: nextIndent,
          ...(!isHierarchicalListBlock(block) && block?.meta?.source_system !== 'wolai_mcp' ? { hierarchy: 'list' } : {}),
        },
      };
    });
    pushEditorUndoSnapshot();
    setEditorBlocks([
      ...remainingBlocks.slice(0, insertIndex),
      ...adjustedMovingBlocks,
      ...remainingBlocks.slice(insertIndex),
    ]);
    const firstId = targetIds[0];
    setSelectedBlockId(firstId);
    setAreaBlockSelection(targetIds);
    focusBlock(firstId);
    return true;
  };

  const handleBlockDragOver = (event) => {
    if (!hasBlockDragData(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleBlockDrop = (event, targetBlock) => {
    if (!hasBlockDragData(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const dragIds = getBlockDragIdsFromEvent(event);
    moveDraggedBlocks(dragIds, targetBlock.id, event);
    finishBlockDrag();
  };

  const buildContinuationBlockExtra = (block) => {
    if (!isHierarchicalListBlock(block)) {
      if (!isDocumentBlockHierarchyMember(block)) return { content: '' };
      return {
        content: '',
        meta: {
          indent: getBlockHierarchyIndent(block),
          hierarchy: 'list',
        },
      };
    }
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
    const input = event.currentTarget?.isContentEditable ? event.currentTarget : event.target;
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
    const editableSplit = input?.isContentEditable ? splitContentEditableAtSelection(input) : null;
    const editableSelection = editableSplit
      ? { start: editableSplit.start, end: editableSplit.end }
      : null;
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
    if (editableSplit) {
      leftContent = sanitizeInlineHtml(editableSplit.leftHtml);
      rightContent = sanitizeInlineHtml(editableSplit.rightHtml);
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

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const result = mergeAdjacentDocumentBlocks(prev, block.id, {
        content: mergedContent,
        meta: nextPreviousMeta,
      });
      return result.changed ? result.blocks : prev;
    });
    setSelectedBlockId(previousBlock.id);
    clearAreaBlockSelection();
    setOpenBlockMenuId(null);
    focusBlock(previousBlock.id, previousPlainLength);
    return true;
  };

  const mergeBlockWithNextAtEnd = (event, block, index) => {
    const nextBlock = editorBlocks[index + 1];
    if (!nextBlock) return false;
    if (isTableLikeBlock(block) || isTableLikeBlock(nextBlock)) return false;
    if (block.type === 'divider' || nextBlock.type === 'divider') return false;
    if (block.type === 'attachment' || nextBlock.type === 'attachment') return false;

    const input = event.target;
    const selectionRange = input?.isContentEditable
      ? getContentEditableSelectionRange(input)
      : (
        typeof input?.selectionStart === 'number' && typeof input?.selectionEnd === 'number'
          ? { start: Math.min(input.selectionStart, input.selectionEnd), end: Math.max(input.selectionStart, input.selectionEnd) }
          : null
      );
    if (!selectionRange || selectionRange.start !== selectionRange.end) return false;

    const currentContent = input?.isContentEditable
      ? sanitizeInlineHtml(input.innerHTML)
      : String(block.content || '');
    const currentPlainLength = inlineHtmlToPlain(currentContent).length;
    if (selectionRange.start !== currentPlainLength) return false;

    const nextInput = document.getElementById(`doc-block-input-${nextBlock.id}`);
    const nextContent = nextInput?.isContentEditable
      ? sanitizeInlineHtml(nextInput.innerHTML)
      : String(nextBlock.content || '');
    const mergedContent = sanitizeInlineHtml(`${currentContent}${nextContent}`);
    const currentMeta = getBlockMeta(block);
    const shiftedNextComments = normalizeInlineComments(getBlockMeta(nextBlock).comments).map(comment => ({
      ...comment,
      start: comment.start + currentPlainLength,
      end: comment.end + currentPlainLength,
    }));
    const mergedComments = [
      ...normalizeInlineComments(currentMeta.comments),
      ...shiftedNextComments,
    ];
    const nextCurrentMeta = {
      ...currentMeta,
      ...(mergedComments.length ? { comments: mergedComments } : {}),
    };
    if (!mergedComments.length) delete nextCurrentMeta.comments;

    pushEditorUndoSnapshot();
    setEditorBlocks(prev => {
      const result = mergeAdjacentDocumentBlocks(prev, nextBlock.id, {
        content: mergedContent,
        meta: nextCurrentMeta,
      });
      return result.changed ? result.blocks : prev;
    });
    setSelectedBlockId(block.id);
    clearAreaBlockSelection();
    setOpenBlockMenuId(null);
    focusBlock(block.id, currentPlainLength);
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
    if (event.key === 'Tab' && canAdjustBlockHierarchyIndent(block)) {
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
    if (event.key === 'Backspace' && !block.content && isDocumentBlockHierarchyMember(block) && getBlockHierarchyIndent(block) > 0) {
      event.preventDefault();
      updateListIndent(block, index, -1);
      return;
    }
    if (event.key === 'Backspace' && mergeBlockWithPreviousAtStart(event, block, index)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Delete' && mergeBlockWithNextAtEnd(event, block, index)) {
      event.preventDefault();
      event.stopPropagation();
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
    selectAllEditorBlocksRef.current = false;
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
    if (selectAllEditorBlocksRef.current) {
      selectAllEditorBlocksRef.current = false;
      clearAreaBlockSelection();
    }
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

  const getBlockSelectionUnitIds = (blockId) => {
    const startIndex = editorBlocks.findIndex(block => block.id === blockId);
    if (startIndex < 0) return [];
    const root = editorBlocks[startIndex];
    if (root.type !== 'fold-list') return [root.id];
    const rootIndent = getBlockHierarchyIndent(root);
    let endIndex = startIndex;
    for (let index = startIndex + 1; index < editorBlocks.length; index += 1) {
      const block = editorBlocks[index];
      if (!isDocumentBlockHierarchyMember(block) || getBlockHierarchyIndent(block) <= rootIndent) break;
      endIndex = index;
    }
    return editorBlocks.slice(startIndex, endIndex + 1).map(block => block.id);
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
    return getBlockSelectionUnitIds(blockId);
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
    const unitIds = getBlockSelectionUnitIds(blockId);

    if (event.shiftKey && selectedBlockId) {
      const anchorIndex = blockIds.indexOf(selectedBlockId);
      if (anchorIndex >= 0) {
        const visibleUnitIds = unitIds.filter(id => blockIds.includes(id));
        setBlockRangeSelection(selectedBlockId, visibleUnitIds[visibleUnitIds.length - 1] || blockId, blockIds);
        return;
      }
    }

    if (event.metaKey || event.ctrlKey) {
      const currentSelection = selectedAreaBlockIdsRef.current.length ? selectedAreaBlockIdsRef.current : selectedAreaBlockIds;
      const base = currentSelection.length ? currentSelection : (selectedBlockId ? [selectedBlockId] : []);
      const removeUnit = unitIds.every(id => base.includes(id));
      const next = removeUnit
        ? base.filter(id => !unitIds.includes(id))
        : [...new Set([...base, ...unitIds])];
      setAreaBlockSelection(next.length ? next : unitIds);
      setSelectedBlockId(blockId);
      return;
    }

    setSelectedBlockId(blockId);
    setAreaBlockSelection(unitIds);
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
    if (!activeElement) return false;
    if (['TEXTAREA', 'INPUT'].includes(activeElement.tagName)) {
      const { selectionStart, selectionEnd } = activeElement;
      return typeof selectionStart === 'number'
        && typeof selectionEnd === 'number'
        && selectionStart !== selectionEnd;
    }
    if (!activeElement.isContentEditable) return false;
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    return activeElement.contains(range.startContainer) || activeElement.contains(range.endContainer);
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
    if (isTableLikeBlock(targetBlock)) return [];

    const activeInEditableInput = Boolean(
      activeElement?.closest?.('textarea, input, [contenteditable="true"]')
    );
    const activeDatabaseEditorBlockId = activeElement
      ?.closest?.('[data-document-database-editor-block-id]')
      ?.getAttribute?.('data-document-database-editor-block-id');
    const activeInTableLikeEditor = Boolean(
      activeElement?.closest?.('[data-document-table-cell="true"]')
      || (activeDatabaseEditorBlockId && activeDatabaseEditorBlockId === targetBlock.id)
      || (selectedTableCell?.blockId && selectedTableCell.blockId === targetBlock.id)
    );
    const activeIsTargetBlock = !activeBlockId || activeBlockId === targetBlock.id;
    const shouldSkipBlockDelete = activeInEditableInput
      && activeIsTargetBlock
      && (!isTableLikeBlock(targetBlock) || activeInTableLikeEditor)
      && targetBlock.type !== 'divider'
      && targetBlock.type !== 'attachment';
    if (shouldSkipBlockDelete) return [];

    return [targetBlock.id];
  };

  useEffect(() => {
    const handleSelectionDeleteKeyDown = (event) => {
      if (!selectedDoc?.id || presentationOpen || createOpen || templateOpen || shareOpen || bulkShareOpen || changeLogOpen || moveFolderOpen) return;
      if (!['Delete', 'Backspace'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreGlobalDocumentDelete(event)) return;
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
  }, [selectedDoc?.id, presentationOpen, createOpen, templateOpen, shareOpen, bulkShareOpen, changeLogOpen, moveFolderOpen, editorBlocks, editorTitle, selectedBlockId, selectedAreaBlockIds, selectedTableCell]);

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
    if (node?.nodeType === 'folder') {
      if (!canManageDocumentFolders || !node.canAddChild) return;
      const folderId = normalizeDocumentFolderSelectValue(node.folderId);
      if (folderId) setSelectedFolderId(folderId);
      event.preventDefault();
      event.stopPropagation();
      setFolderContextMenu({
        open: true,
        x: event.clientX,
        y: event.clientY,
        folder: node.folder || folders.find(folder => Number(folder.id) === Number(node.folderId)) || null,
      });
      return;
    }
    if (node?.nodeType !== 'document') return;
    const doc = node.document || getDocumentSummaryById(node.documentId) || { id: node.documentId, title: node.title };
    openDocContextMenu(event, doc);
  };

  const closeDocContextMenu = () => {
    setDocContextMenu(prev => ({ ...prev, open: false }));
  };

  const closeFolderContextMenu = () => {
    setFolderContextMenu(prev => ({ ...prev, open: false }));
  };

  const openCreateChildFolder = (folder) => {
    if (!folder || !canManageDocumentFolders || !Number(folder.can_add_child || 0)) return;
    closeFolderContextMenu();
    setFolderCreateParent(folder);
    folderCreateForm.resetFields();
    folderCreateForm.setFieldsValue({ name: '' });
    setFolderCreateOpen(true);
  };

  const handleCreateChildFolder = async () => {
    const parent = folderCreateParent;
    if (!parent?.id) {
      message.error('请选择父级目录后再创建文件夹');
      return;
    }
    if (!canManageDocumentFolders || !Number(parent.can_add_child || 0)) {
      message.error('当前目录不支持新增子文件夹');
      return;
    }
    try {
      const values = await folderCreateForm.validateFields();
      setFolderCreateSaving(true);
      const result = await documentsApi.createFolder({
        name: values.name,
        parent_id: parent.id,
      });
      setFolderCreateOpen(false);
      setFolderCreateParent(null);
      await loadFolders();
      setFolderTreeExpandedKeys(prev => Array.from(new Set([...prev, `folder-${parent.id}`, `folder-${result.id}`])));
      message.success('子文件夹已创建');
    } catch (err) {
      if (!err?.errorFields) {
        message.error(err.response?.data?.error || err.message || '创建文件夹失败');
      }
    } finally {
      setFolderCreateSaving(false);
    }
  };

  const openRenameFolder = (folder) => {
    if (!folder || !canManageDocumentFolders || !Number(folder.can_edit_folder || 0)) return;
    closeFolderContextMenu();
    setFolderRenameTarget(folder);
    folderRenameForm.resetFields();
    folderRenameForm.setFieldsValue({ name: folder.name || '' });
    setFolderRenameOpen(true);
  };

  const handleRenameFolder = async () => {
    const target = folderRenameTarget;
    if (!target?.id) return;
    try {
      const values = await folderRenameForm.validateFields();
      setFolderRenameSaving(true);
      await documentsApi.updateFolder(target.id, {
        name: values.name,
        sort_order: Number(target.sort_order || 0),
      });
      setFolderRenameOpen(false);
      setFolderRenameTarget(null);
      await loadFolders();
      await loadFolderTreeDocuments();
      message.success('文件夹已重命名');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '重命名文件夹失败');
    } finally {
      setFolderRenameSaving(false);
    }
  };

  const openDeleteFolder = (folder) => {
    if (!folder || !canManageDocumentFolders || !Number(folder.can_delete_folder || 0)) return;
    closeFolderContextMenu();
    setFolderDeleteTarget(folder);
    setFolderDeleteOpen(true);
  };

  const handleDeleteFolder = async () => {
    const target = folderDeleteTarget;
    if (!target?.id) return;
    const targetId = Number(target.id);
    const parentId = normalizeDocumentFolderSelectValue(target.parent_id);
    setFolderDeleteSaving(true);
    try {
      const result = await documentsApi.deleteFolder(targetId);
      setFolderDeleteOpen(false);
      setFolderDeleteTarget(null);
      if (Number(selectedFolderId) === targetId) {
        setSelectedFolderId(parentId || null);
      }
      if (parentId) {
        setFolderTreeExpandedKeys(prev => Array.from(new Set([...prev, `folder-${parentId}`])));
      }
      await loadFolders();
      await loadFolderTreeDocuments();
      if (selectedDoc?.id) await loadDetail(selectedDoc.id, { force: true });
      const movedFolders = Number(result?.moved_folders || 0);
      const movedDocuments = Number(result?.moved_documents || 0);
      const movedText = movedFolders || movedDocuments
        ? `，已上移 ${movedFolders} 个子文件夹、${movedDocuments} 篇文档`
        : '';
      message.success(`文件夹已删除${movedText}`);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '删除文件夹失败');
    } finally {
      setFolderDeleteSaving(false);
    }
  };

  const handleDocContextAction = ({ key }) => {
    const doc = docContextMenu.doc;
    if (!doc?.id) return;
    closeDocContextMenu();
    if (key === 'copy-link') {
      handleCopyDocLink(doc);
      return;
    }
    if (key === 'import' || key === 'import-wolai-url') {
      openWolaiImportForDocument(doc);
      return;
    }
    if (key === 'pin') {
      toggleDocumentPin(doc);
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

  const renderGlobalDocumentSearchModal = () => {
    const searchText = globalSearchKeyword.trim();
    const resultCount = globalSearchResults.length;
    return (
      <Modal
        open={globalSearchOpen}
        onCancel={closeGlobalDocumentSearch}
        footer={null}
        closable={false}
        destroyOnClose={false}
        width={isMobile ? '100%' : 920}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : { top: 36 }}
        styles={{
          body: {
            padding: 0,
            maxHeight: isMobile ? '100vh' : 'calc(100vh - 96px)',
            overflow: 'hidden',
          },
          content: {
            borderRadius: isMobile ? 0 : 8,
            overflow: 'hidden',
          },
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '100vh' : 'calc(100vh - 96px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 12px' : '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
            <Input
              ref={globalSearchInputRef}
              bordered={false}
              prefix={<SearchOutlined style={{ color: '#8c8c8c', fontSize: 19 }} />}
              allowClear
              size="large"
              placeholder="搜索标题、编号、正文"
              value={globalSearchKeyword}
              onChange={event => setGlobalSearchKeyword(event.target.value)}
              onPressEnter={() => {
                if (globalSearchResults[0]) openGlobalSearchResult(globalSearchResults[0]);
              }}
              style={{ flex: 1, minWidth: 0, paddingLeft: 0, fontSize: 20 }}
            />
            <Tooltip title="关闭">
              <Button
                type="text"
                shape="circle"
                icon={<CloseOutlined />}
                aria-label="关闭搜索"
                onClick={closeGlobalDocumentSearch}
                style={{ flex: '0 0 auto', color: '#8c8c8c' }}
              />
            </Tooltip>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: isMobile ? '10px 12px' : '12px 18px', borderBottom: '1px solid #f5f5f5' }}>
            <Space size={16} wrap>
              <Space size={6}>
                <Text type="secondary">仅匹配标题</Text>
                <Switch size="small" checked={globalSearchTitleOnly} onChange={setGlobalSearchTitleOnly} />
              </Space>
              <Space size={6}>
                <Text type="secondary">精准匹配</Text>
                <Switch size="small" checked={globalSearchExact} onChange={setGlobalSearchExact} />
              </Space>
            </Space>
            <Text type="secondary">{searchText ? `共 ${resultCount} 条匹配结果` : '输入关键词后搜索'}</Text>
          </div>

          <Spin spinning={globalSearchLoading}>
            <div style={{ maxHeight: isMobile ? 'calc(100vh - 140px)' : 'calc(100vh - 230px)', overflowY: 'auto' }}>
              {searchText ? (
                <List
                  dataSource={globalSearchResults}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配文档" /> }}
                  renderItem={(item) => {
                    const title = item.title || '未命名文档';
                    const path = getDocumentPathLabel(item);
                    const excerpt = item.match_excerpt || item.summary || item.document_no || '';
                    return (
                      <List.Item
                        key={item.id}
                        onClick={() => openGlobalSearchResult(item)}
                        style={{
                          cursor: 'pointer',
                          padding: isMobile ? '12px' : '13px 18px',
                          borderBottom: '1px solid #f3f4f6',
                          background: getDocTabId(selectedDocId) === getDocTabId(item.id) ? '#f5f7ff' : '#fff',
                        }}
                      >
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(220px, 36%)',
                          gap: isMobile ? 6 : 18,
                          alignItems: 'center',
                          width: '100%',
                          minWidth: 0,
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              {renderDocumentInlineIcon(item, { flex: '0 0 auto' })}
                              <Text
                                strong
                                title={title}
                                style={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}
                              >
                                {renderHighlightedDocumentSearchText(title, searchText, globalSearchExact)}
                              </Text>
                              {item.match_label && <Tag style={{ marginInlineEnd: 0 }}>{item.match_label}</Tag>}
                            </div>
                            {excerpt && (
                              <div
                                title={excerpt}
                                style={{
                                  marginTop: 5,
                                  color: '#8c8c8c',
                                  fontSize: 13,
                                  lineHeight: 1.4,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {renderHighlightedDocumentSearchText(excerpt, searchText, globalSearchExact)}
                              </div>
                            )}
                          </div>
                          <Text
                            type="secondary"
                            title={path}
                            style={{
                              display: 'block',
                              minWidth: 0,
                              textAlign: isMobile ? 'left' : 'right',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 13,
                            }}
                          >
                            {path}
                          </Text>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无搜索内容" style={{ padding: '52px 0' }} />
              )}
            </div>
          </Spin>
        </div>
      </Modal>
    );
  };

  const renderDocItem = (item) => {
    const docId = getDocTabId(item.id);
    const bulkSelected = bulkSelectedDocIdSet.has(docId);
    const bulkDisabled = !Number(item.can_edit || 0);
    return (
      <List.Item
        key={item.id}
        onClick={() => {
          if (bulkShareMode) {
            toggleBulkDocumentSelection(item, !bulkSelected);
            return;
          }
          openDocumentTab(item);
        }}
        onContextMenu={event => openDocContextMenu(event, item)}
        style={{
          cursor: bulkShareMode && bulkDisabled ? 'not-allowed' : 'pointer',
          padding: isMobile ? '9px 10px' : '7px 8px',
          borderRadius: 7,
          background: bulkSelected ? '#ecfeff' : (getDocTabId(selectedDocId) === docId ? '#eef2ff' : 'transparent'),
          border: bulkSelected ? '1px solid #67e8f9' : (getDocTabId(selectedDocId) === docId ? '1px solid #c7d2fe' : '1px solid transparent'),
          marginBottom: isMobile ? 4 : 3,
          opacity: bulkShareMode && bulkDisabled ? 0.58 : 1,
        }}
        actions={bulkShareMode ? [] : [
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
          avatar={(
            <Space size={6} align="start">
              {bulkShareMode && (
                <Checkbox
                  checked={bulkSelected}
                  disabled={bulkDisabled}
                  onClick={event => event.stopPropagation()}
                  onChange={event => toggleBulkDocumentSelection(item, event.target.checked)}
                  style={{ marginTop: 2 }}
                />
              )}
              {renderDocumentInlineIcon(item, { marginTop: 2 })}
            </Space>
          )}
          title={
            <Space size={6} style={{ maxWidth: '100%', overflow: 'hidden', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              <Text
                strong
                ellipsis={{ tooltip: item.title }}
                style={{
                  maxWidth: isMobile ? 'calc(100vw - 164px)' : Math.max(150, folderSidebarWidth - (bulkShareMode ? 214 : 188)),
                  lineHeight: '20px',
                }}
              >
                {item.title}
              </Text>
              {item.pinned_at && <Tag color="gold" style={{ marginInlineEnd: 0, lineHeight: '20px' }}>置顶</Tag>}
              {isSpreadsheetDocument(item) && <Tag color="green" style={{ marginInlineEnd: 0, lineHeight: '20px' }}>在线表格</Tag>}
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
  };

  const renderDocTabs = () => {
    if (!openDocTabs.length) return null;
    return (
      <div
        className="documents-open-tabs"
        role="tablist"
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          gap: 4,
          alignItems: 'center',
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: compactSpreadsheetWorkspace ? '0 2px 2px' : '0 2px 8px',
        }}
      >
        {openDocTabs.map((tab, index) => {
          const docId = getDocTabId(tab.id);
          const active = getDocTabId(selectedDocId) === docId;
          const closing = closingTabIds.includes(docId);
          const title = tab.title || '未命名文档';
          const hasOtherDocTabs = openDocTabs.some(item => getDocTabId(item.id) !== docId);
          const hasRightDocTabs = openDocTabs.slice(index + 1).length > 0;
          const contextMenuItems = [
            { key: 'close-current', label: '关闭当前标签页', disabled: closing },
            { key: 'close-all', label: '关闭全部标签页', disabled: !openDocTabs.length },
            { key: 'close-others', label: '关闭其他标签页', disabled: !hasOtherDocTabs },
            { key: 'close-right', label: '关闭右侧标签页', disabled: !hasRightDocTabs },
          ];
          const handleDocTabContextMenuClick = ({ key, domEvent }) => {
            domEvent?.stopPropagation?.();
            if (key === 'close-current') {
              closeDocTabsByIds([docId], { successMessage: '已保存并关闭当前标签页' });
              return;
            }
            if (key === 'close-all') {
              handleCloseAllDocTabs();
              return;
            }
            if (key === 'close-others') {
              handleCloseOtherDocTabs(docId);
              return;
            }
            if (key === 'close-right') {
              handleCloseRightDocTabs(docId);
            }
          };

          return (
            <Dropdown
              key={docId}
              trigger={['contextMenu']}
              menu={{ items: contextMenuItems, onClick: handleDocTabContextMenuClick }}
            >
              <div
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
                {renderDocumentInlineIcon(tab, { flex: '0 0 auto', fontSize: 13, width: 16, height: 16 })}
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
            </Dropdown>
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
            disabled={!canManageSelectedDoc}
            onConfirm={() => {
              setPageMenuOpen(false);
              handleDelete();
            }}
            okText="删除"
            cancelText="取消"
          >
            <Button
              danger
              type="text"
              block
              icon={<DeleteOutlined />}
              disabled={!canManageSelectedDoc}
              aria-label="删除页面"
              style={{ justifyContent: 'flex-start', padding: '4px 8px' }}
            >
              删除页面
            </Button>
          </Popconfirm>
          <Button
            type="text"
            block
            icon={<FolderOpenOutlined />}
            disabled={!canMoveSelectedDoc}
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

  const renderShareSelector = ({
    mode = 'single',
    draft = shareDraft,
    setDraft = setShareDraft,
    loading = shareLoading,
  } = {}) => {
    const isBulk = mode === 'bulk';
    const accessUsers = isBulk ? [] : (selectedDoc?.access_summary?.users || []);
    const systemUserIdSet = new Set(accessUsers
      .filter(item => Array.isArray(item?.source_types) && item.source_types.includes('media_management'))
      .map(item => Number(item.id))
      .filter(Boolean));
    const selectedDefaultUserIds = (draft.user_ids || [])
      .map(Number)
      .filter(id => defaultDocumentCxoUserIdSet.has(id));
    const selectedExplicitUserIds = (draft.user_ids || [])
      .map(Number)
      .filter(id => !defaultDocumentCxoUserIdSet.has(id));
    return (
      <Spin spinning={loading}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {isBulk ? (
                <Space size={8} wrap>
                  <Tag color="blue">已选 {bulkSelectedDocIds.length} 篇文档</Tag>
                  <Text type="secondary">批量共享会把下方对象追加到这些文档，不会覆盖每篇文档原有共享范围。</Text>
                </Space>
              ) : (
                <Space size={8} wrap>
                  <Tag color="cyan">{selectedDoc?.access_summary?.label || '仅自己'}</Tag>
                </Space>
              )}
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
          <Text strong>默认共享人</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择默认共享人"
            value={selectedDefaultUserIds}
            onChange={value => setDraft(prev => updateDefaultDocumentShareUsers(
              prev,
              defaultDocumentCxoUserIds,
              [...value, ...defaultDocumentCxoUserIds.filter(id => systemUserIdSet.has(Number(id)))]
            ))}
            options={defaultDocumentCxoUsers.map(item => ({
              value: Number(item.id),
              label: item.display_name || item.username,
              disabled: systemUserIdSet.has(Number(item.id)),
            }))}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>项目组</Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择项目组"
            value={draft.project_group_ids}
            onChange={value => setDraft(prev => ({ ...prev, project_group_ids: value }))}
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
            value={draft.departments}
            onChange={value => setDraft(prev => ({ ...prev, departments: value }))}
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
            value={draft.team_ids}
            onChange={value => setDraft(prev => ({ ...prev, team_ids: value }))}
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
            value={selectedExplicitUserIds}
            onChange={value => setDraft(prev => updateExplicitDocumentShareUsers(
              prev,
              defaultDocumentCxoUserIds,
              [...value, ...selectedExplicitUserIds.filter(id => systemUserIdSet.has(Number(id)))]
            ))}
            options={users.filter(item => !defaultDocumentCxoUserIdSet.has(Number(item.id))).map(item => ({
              value: Number(item.id),
              label: item.display_name || item.username,
              disabled: systemUserIdSet.has(Number(item.id)),
            }))}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
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

  const updateBlockMeta = (id, patchOrUpdater) => {
    pushEditorUndoSnapshot();
    setEditorBlocks(prev => prev.map(block => (
      block.id === id
        ? {
          ...block,
          meta: {
            ...getBlockMeta(block),
            ...(typeof patchOrUpdater === 'function' ? patchOrUpdater(getBlockMeta(block), block) : patchOrUpdater),
          },
        }
        : block
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

  const placeInlineToolbar = (block, input, start, end, selectionTarget = {}) => {
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
      ...selectionTarget,
      editorId: input.id || `doc-block-input-${block.id}`,
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
    if (selection.editorId) return selection.editorId;
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
    setTableMenuContext(null);
    setInlineToolbar({
      blockId: block.id,
      tableCell,
      editorId: input.id || '',
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

  const getInlineSelectionInput = (event) => {
    const current = event?.currentTarget;
    if (current?.isContentEditable || typeof current?.selectionStart === 'number') return current;
    const target = event?.target;
    const editableRoot = target?.closest?.('[contenteditable="true"]');
    if (editableRoot) return editableRoot;
    if (typeof target?.selectionStart === 'number') return target;
    return null;
  };

  const documentMentionContext = selectedDoc?.id ? {
    entity_type: 'document',
    entity_id: selectedDoc.id,
    module_name: '文档中心',
    title: editorTitle || selectedDoc.title,
  } : null;

  useEffect(() => {
    if (!documentMentionContext || !canEditDoc(selectedDoc)) return;
    preloadMentionCandidates(documentMentionContext).catch(() => {});
  }, [documentMentionContext?.entity_type, documentMentionContext?.entity_id, documentMentionContext?.scope, selectedDoc?.can_edit]);

  const handleDocumentMentionTrigger = (block, trigger) => {
    if (!trigger) {
      setMentionState(null);
      return;
    }
    if (!documentMentionContext || !canEditDoc(selectedDoc)) return;
    setMentionState({ ...trigger, blockId: block?.id || null });
  };

  const handleDocumentMentionSelect = (mentionUser) => {
    const userName = mentionUser?.name || mentionUser?.display_name || mentionUser?.username || '';
    const lineContent = insertMentionIntoContentEditable(mentionState, userName) || mentionState?.lineContent || '';
    setMentionState(null);
    scheduleMentionNotification({
      context: documentMentionContext,
      user: mentionUser,
      lineContent,
    });
  };

  const handleInlineTextSelection = (block, event, selectionTarget = {}) => {
    const input = getInlineSelectionInput(event);
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
      placeInlineToolbar(block, input, start, end, selectionTarget);
    }, 0);
  };

  const handleTableCellTextSelection = (block, tableCell, event) => {
    const input = getInlineSelectionInput(event);
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

  const focusInlineSelection = (blockId, start, end, selectionTarget = {}) => {
    window.setTimeout(() => {
      const input = document.getElementById(getInlineSelectionElementId({ blockId, ...selectionTarget }));
      if (input?.setSelectionRange) {
        input.focus();
        input.setSelectionRange(start, end);
        placeInlineToolbar({ id: blockId }, input, start, end, selectionTarget);
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
    const mergedLookup = buildTableMergedLookup(meta.mergedCells, normalizedRows.length, columns.length);
    const safeColumnIndex = Math.max(0, Math.min(columns.length - 1, Number(tableCell.columnIndex) || 0));
    const safeRowIndex = Math.max(0, Math.min(normalizedRows.length - 1, Number(tableCell.rowIndex) || 0));
    const mergedAnchor = mergedLookup.coveredMap.get(buildTableMergeKey(safeRowIndex, safeColumnIndex));
    const targetRowIndex = mergedAnchor?.rowIndex ?? safeRowIndex;
    const targetColumnIndex = mergedAnchor?.columnIndex ?? safeColumnIndex;
    const nextMeta = { ...meta };
    const currentValue = normalizedRows[targetRowIndex]?.[targetColumnIndex] || '';
    if (areSerializedValuesEqual(currentValue, value)) return false;
    if (shouldPushUndo) pushEditorUndoSnapshot();
    const nextVisibleRows = normalizedRows.map((row, rowIndex) => (
      rowIndex === targetRowIndex
        ? row.map((cell, columnIndex) => (columnIndex === targetColumnIndex ? value : cell))
        : row
    ));
    Object.assign(nextMeta, buildStoredTableMetaFromVisibleRows(nextVisibleRows, columns, {
      mergedCells: meta.mergedCells,
      columnWidths: meta.columnWidths,
      horizontalCenter: meta.horizontalCenter,
      verticalCenter: meta.verticalCenter,
      cellStyles: meta.cellStyles,
    }));

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

  const persistContentEditableInlineChange = (selection, editor) => {
    if (!selection?.blockId || !editor?.isContentEditable) return false;
    const nextHtml = sanitizeInlineHtml(editor.innerHTML);
    const block = editorBlocks.find(item => item.id === selection.blockId);
    if (selection.tableCell) {
      const changed = updateTableCellInlineContent(selection.blockId, selection.tableCell, nextHtml);
      if (block) handleTableCellTextSelection(block, selection.tableCell, { target: editor });
      return changed;
    }
    if (selection.blockMetaField) {
      updateBlockMeta(selection.blockId, { [selection.blockMetaField]: nextHtml });
      if (block) {
        handleInlineTextSelection(block, { target: editor }, {
          blockMetaField: selection.blockMetaField,
        });
      }
      return true;
    }
    updateBlock(selection.blockId, { content: nextHtml });
    if (block) handleInlineTextSelection(block, { target: editor });
    return true;
  };

  const getRestoredContentEditableRange = (selection, editor) => {
    if (!selection?.blockId || !editor?.isContentEditable || typeof window === 'undefined') return null;
    editor.focus();
    if (!setContentEditableSelectionRange(editor, selection.start, selection.end)) return null;
    const currentSelection = window.getSelection?.();
    if (!currentSelection?.rangeCount) return null;
    const range = currentSelection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
    return { range, currentSelection };
  };

  const applyContentEditableInlineNode = (selection, editor, createNode, format) => {
    const restored = getRestoredContentEditableRange(selection, editor);
    if (!restored) return false;
    const { range, currentSelection } = restored;
    const wrapper = createNode();
    if (!wrapper) return false;
    try {
      wrapInlineRangeContents(range, wrapper, { format });
    } catch {
      message.error('文字样式设置失败，请重新选择文字后再试');
      return false;
    }
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    currentSelection.removeAllRanges();
    currentSelection.addRange(nextRange);
    persistContentEditableInlineChange(selection, editor);
    return true;
  };

  const applyContentEditableInlineText = (selection, editor, text, selectStartOffset = 0, selectEndOffset = 0) => {
    const restored = getRestoredContentEditableRange(selection, editor);
    if (!restored) return false;
    const { range, currentSelection } = restored;
    const node = document.createTextNode(text);
    range.deleteContents();
    range.insertNode(node);
    const nextRange = document.createRange();
    const startOffset = Math.max(0, Math.min(node.textContent.length, selectStartOffset));
    const endOffset = Math.max(startOffset, Math.min(node.textContent.length, node.textContent.length - selectEndOffset));
    nextRange.setStart(node, startOffset);
    nextRange.setEnd(node, endOffset);
    currentSelection.removeAllRanges();
    currentSelection.addRange(nextRange);
    persistContentEditableInlineChange(selection, editor);
    return true;
  };

  const applyContentEditableInlineStyle = (selection, editor, kind) => {
    const selected = selection?.text || '';
    if (!selected) return false;
    if (kind === 'link') {
      const url = window.prompt('请输入链接地址', 'https://');
      if (!url) return true;
      return applyContentEditableInlineNode(selection, editor, () => {
        const node = document.createElement('a');
        node.href = url;
        node.target = '_blank';
        node.rel = 'noreferrer';
        return node;
      });
    }
    if (kind === 'formula') {
      return applyContentEditableInlineText(selection, editor, `$${selected}$`, 1, 1);
    }
    const tagMap = {
      bold: 'strong',
      italic: 'em',
      underline: 'u',
      strike: 's',
      code: 'code',
    };
    const tag = tagMap[kind];
    if (!tag) return false;
    return applyContentEditableInlineNode(selection, editor, () => document.createElement(tag), kind);
  };

  const applyInlineTextColorFallback = (selection, color) => {
    const selected = selection?.text || '';
    if (!selected) return false;
    const safeColor = normalizeCssColor(color);
    if (!safeColor) return false;
    return applyInlineTextReplace(selection, `<span style="color: ${safeColor};">${escapeHtml(selected)}</span>`, 0);
  };

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
      applyContentEditableInlineStyle(selection, editor, kind);
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
      const safeColor = normalizeCssColor(color);
      if (safeColor) {
        applyContentEditableInlineNode(inlineToolbar, editor, () => {
          const node = document.createElement('span');
          node.setAttribute('style', `color: ${safeColor};`);
          return node;
        }, 'color');
      }
      return;
    }
    applyInlineTextColorFallback(inlineToolbar, color);
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
          {!inlineToolbar.tableCell && !inlineToolbar.blockMetaField && (
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
          {!inlineToolbar.tableCell && !inlineToolbar.blockMetaField && (
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
      width: listGuideWidth,
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
    const foldListMarkerSolid = isFoldListMarkerSolid(meta);
    const markerColor = listMarkerColor;
    const marker = block.type === 'bullet'
      ? getBulletListMarker(indent)
      : numberedListMarkers.get(block.id);
    const listFontSize = selectedDoc?.small_font_enabled ? 13 : 15;
    const foldListFontSize = selectedDoc?.small_font_enabled ? 13 : 15;
    const blockListFontSize = block.type === 'fold-list' ? foldListFontSize : listFontSize;
    const markerLineHeight = blockListFontSize * listLineHeight;
    const listGuideCenterY = markerLineHeight / 2 + 1;
    const listGuideLineOffset = getListGuideLineOffset(block.type, listMarkerBoxWidth);
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
      <button
        type="button"
        aria-label={collapsed ? '展开折叠列表' : '收起折叠列表'}
        onClick={(event) => {
          event.stopPropagation();
          updateBlockMeta(block.id, { collapsed: !collapsed });
        }}
        style={{
          width: listMarkerBoxWidth,
          minWidth: listMarkerBoxWidth,
          height: markerLineHeight,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: listMarkerColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {renderFoldListTriangle(collapsed, 1, foldListMarkerSolid)}
      </button>
    ) : block.type === 'bullet' ? (
      <span style={markerContainerStyle}>
        {renderBulletListMarker(indent)}
      </span>
    ) : (
      <Text style={{
        ...markerContainerStyle,
        textAlign: 'right',
        color: markerColor,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontWeight: 400,
        fontSize: listFontSize,
        lineHeight: `${markerLineHeight}px`,
      }}>
        {marker}
      </Text>
    );

    return (
      <div style={{ position: 'relative', paddingLeft: indent * listIndentWidth }}>
        {renderListGuides(block, {
          top: -8,
          bottom: -8,
          centerY: listGuideCenterY,
          lineOffset: listGuideLineOffset,
        })}
        <div style={{ display: 'flex', gap: block.type === 'fold-list' ? 7 : listMarkerTextGap, alignItems: 'flex-start' }}>
          {markerNode}
          <InlineRichTextEditor
            {...commonProps}
            placeholder={selectedBlockId === block.id
              ? (block.type === 'fold-list' ? '折叠列表标题' : '')
              : ''}
            onChange={value => commonProps.onChange(value)}
            style={{
              ...commonProps.style,
              fontSize: blockListFontSize,
              lineHeight: listLineHeight,
              color: '#202124',
              fontWeight: 400,
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
          <div
            style={{
              marginLeft: isTodo ? 68 : 32,
              width: `calc(100% - ${isTodo ? 68 : 32}px)`,
              lineHeight: 1.7,
              fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
              background: '#f8fafc',
              borderRadius: 6,
              padding: '6px 8px',
            }}
          >
            <InlineRichTextEditor
              id={`doc-fold-body-input-${block.id}`}
              value={meta.body || ''}
              placeholder="折叠内容"
              onFocus={commonProps.onFocus}
              onBlur={commonProps.onBlur}
              onCompositionStart={commonProps.onCompositionStart}
              onCompositionEnd={commonProps.onCompositionEnd}
              onChange={value => updateBlockMeta(block.id, { body: value })}
              onMouseUp={event => handleInlineTextSelection(block, event, { blockMetaField: 'body' })}
              onKeyUp={event => handleInlineTextSelection(block, event, { blockMetaField: 'body' })}
              style={{
                minHeight: 42,
                padding: 0,
                resize: 'none',
                lineHeight: 1.7,
                fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
                background: 'transparent',
              }}
            />
          </div>
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

  const renderDatabaseTableBlock = (block) => {
    const meta = normalizeDatabaseBlockMeta(block);
    const {
      columns,
      rows,
      fieldTypes,
      tagOptions,
      columnWidths,
      columnColors,
      titleColorColumns,
      sorts,
      filters,
      group,
    } = meta;
    const defaultName = getDefaultBlockContent('database-embed');
    const tableName = meta.tableName || (block.content && block.content !== defaultName ? inlineHtmlToPlain(block.content) : '');
    const tableWidth = Math.max(columnWidths.reduce((sum, width) => sum + width, 0), isMobile ? 520 : 720);
    const selectedCell = selectedTableCell?.blockId === block.id ? selectedTableCell : null;
    const optionFieldTypes = ['select', 'multi_select', 'person'];
    const wolaiLiveEmbedUrl = meta.embedUrl || meta.source_url || meta.original_url || (
      meta.wolaiDatabaseBlockId ? `https://www.wolai.com/${encodeURIComponent(meta.wolaiDatabaseBlockId)}` : ''
    );
    const shouldRenderWolaiLiveEmbed = Boolean(
      meta.source_system === 'wolai_mcp'
      && meta.rowDataUnavailable
      && meta.wolaiPublicEmbedAvailable === true
      && (meta.liveEmbed || meta.externalEmbed || wolaiLiveEmbedUrl)
    );
    const shouldShowWolaiImportNotice = Boolean(
      meta.source_system === 'wolai_mcp'
      && meta.rowDataUnavailable
      && meta.wolaiRowsCount
    );

    if (shouldRenderWolaiLiveEmbed) {
      const viewTitle = String(meta.wolaiViewTitle || '').trim();
      const visibleProperties = Array.isArray(meta.wolaiViewProperties)
        ? meta.wolaiViewProperties.filter(item => !item.hidden)
        : [];
      const groupValues = (Array.isArray(meta.wolaiViewGroups) ? meta.wolaiViewGroups : [])
        .map(item => String(item.value || '').trim())
        .filter(Boolean);
      const propertyCount = Number(meta.wolaiViewPropertyCount) || visibleProperties.length || columns.length;
      const groupCount = Number(meta.wolaiViewGroupCount) || groupValues.length;
      const sorterCount = Number(meta.wolaiViewSorterCount) || (Array.isArray(meta.wolaiViewSorters) ? meta.wolaiViewSorters.length : 0);
      const filterCount = Number(meta.wolaiViewFilterCount) || 0;
      const statusTags = [
        propertyCount ? `字段 ${propertyCount}` : '',
        groupCount ? `分组 ${groupCount}` : '',
        sorterCount ? `排序 ${sorterCount}` : '',
        filterCount ? `筛选 ${filterCount}` : '',
      ].filter(Boolean);
      return (
        <div
          id={`doc-database-shell-${block.id}`}
          tabIndex={0}
          onClick={() => setSelectedBlockId(block.id)}
          style={{ width: '100%', outline: 'none', padding: '4px 0 12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap', borderBottom: '1px solid #e5e7eb', padding: '6px 0 10px', minWidth: 0 }}>
            <Space size={8} style={{ minWidth: 0, flex: '1 1 260px' }}>
              <FundProjectionScreenOutlined style={{ color: '#1f2937' }} />
              <Text strong style={{ fontSize: 16, maxWidth: isMobile ? 220 : 520, display: 'inline-block' }} ellipsis>
                {tableName || viewTitle || 'Wolai 数据表格'}
              </Text>
              {viewTitle && viewTitle !== tableName && <Tag color="blue">{viewTitle}</Tag>}
            </Space>
            <Space size={6} wrap style={{ marginLeft: 'auto', justifyContent: 'flex-end' }}>
              {statusTags.map(tag => <Tag key={tag}>{tag}</Tag>)}
              <Button
                size="small"
                type="primary"
                icon={<LinkOutlined />}
                href={wolaiLiveEmbedUrl || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!wolaiLiveEmbedUrl}
              >
                打开原表
              </Button>
            </Space>
          </div>
          {groupValues.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 0 4px' }}>
              {groupValues.slice(0, 8).map(value => <Tag key={value} color="processing">{value}</Tag>)}
              {groupValues.length > 8 && <Tag>+{groupValues.length - 8}</Tag>}
            </div>
          )}
          <div
            style={{
              marginTop: 10,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
              minHeight: isMobile ? 520 : 680,
            }}
          >
            {wolaiLiveEmbedUrl ? (
              <iframe
                title={tableName || viewTitle || 'Wolai 数据表格'}
                src={wolaiLiveEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                style={{
                  width: '100%',
                  height: isMobile ? 520 : 680,
                  border: 0,
                  display: 'block',
                  background: '#fff',
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可打开的原表链接" style={{ padding: 48 }} />
            )}
          </div>
        </div>
      );
    }

    const persistDatabaseMeta = (patchOrUpdater = {}) => {
      updateBlockMeta(block.id, currentRawMeta => {
        const currentMeta = normalizeDatabaseBlockMeta({ ...block, meta: currentRawMeta });
        const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(currentMeta) : patchOrUpdater;
        return {
          ...currentMeta,
          ...patch,
        };
      });
    };
    const normalizeCellText = value => inlineHtmlToPlain(String(value || '')).trim();
    const isOptionFieldType = type => optionFieldTypes.includes(type);
    const getCellValues = (row, columnIndex) => {
      const fieldType = fieldTypes[columnIndex];
      const text = normalizeCellText(row?.[columnIndex] || '');
      if (!text) return [];
      if (isOptionFieldType(fieldType)) return splitDatabaseTagValue(text);
      if (fieldType === 'checkbox') {
        return (String(text).toLowerCase() === 'true' || text === '是') ? ['是'] : [];
      }
      return [text];
    };
    const getColumnChoices = (columnIndex, { includeEmpty = false } = {}) => {
      const choiceMap = new Map();
      const pushChoice = (name, option = {}) => {
        const value = String(name || '').trim();
        if (!value || choiceMap.has(value)) return;
        choiceMap.set(value, {
          value,
          label: value,
          color: normalizeCssColor(option.color) || databaseTagColorOptions[choiceMap.size % databaseTagColorOptions.length],
        });
      };
      (tagOptions[columnIndex] || []).forEach(option => pushChoice(option.name, option));
      rows.forEach(row => {
        getCellValues(row, columnIndex).forEach(value => pushChoice(value));
      });
      const choices = Array.from(choiceMap.values());
      if (includeEmpty && rows.some(row => !getCellValues(row, columnIndex).length)) {
        choices.push({ value: '__empty__', label: '空白', color: '#f8fafc' });
      }
      return choices;
    };
    const getSortDirectionOptions = (fieldType) => {
      if (isOptionFieldType(fieldType)) {
        return [
          { value: 'asc', label: '按选项正序排序' },
          { value: 'desc', label: '按选项倒序排序' },
        ];
      }
      if (fieldType === 'date') {
        return [
          { value: 'asc', label: '按日期从早到晚排序' },
          { value: 'desc', label: '按日期从晚到早排序' },
        ];
      }
      if (fieldType === 'number') {
        return [
          { value: 'asc', label: '按 1 → 9 排序' },
          { value: 'desc', label: '按 9 → 1 排序' },
        ];
      }
      return [
        { value: 'asc', label: '按 A → Z 排序' },
        { value: 'desc', label: '按 Z → A 排序' },
      ];
    };
    const getSortDirectionLabel = (fieldType, direction) => {
      const options = getSortDirectionOptions(fieldType);
      return options.find(option => option.value === direction)?.label || options[0]?.label || '升序';
    };
    const getOptionSortRank = (columnIndex, value) => {
      const options = tagOptions[columnIndex] || [];
      const index = options.findIndex(option => option.name === value);
      return index >= 0 ? index : options.length + 1000;
    };
    const getDateSortValue = (value) => {
      const text = normalizeCellText(value);
      if (!text) return Number.POSITIVE_INFINITY;
      const parsed = dayjs(text);
      return parsed.isValid() ? parsed.valueOf() : Number.POSITIVE_INFINITY;
    };
    const getNumberSortValue = (value) => {
      const text = normalizeCellText(value).replace(/,/g, '');
      const number = Number(text);
      return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
    };
    const compareRowsByColumn = (leftRow, rightRow, columnIndex) => {
      const fieldType = fieldTypes[columnIndex];
      if (isOptionFieldType(fieldType)) {
        const leftValue = getCellValues(leftRow, columnIndex)[0] || '';
        const rightValue = getCellValues(rightRow, columnIndex)[0] || '';
        const rankDiff = getOptionSortRank(columnIndex, leftValue) - getOptionSortRank(columnIndex, rightValue);
        if (rankDiff !== 0) return rankDiff;
        return leftValue.localeCompare(rightValue, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
      }
      if (fieldType === 'date') {
        const diff = getDateSortValue(leftRow?.[columnIndex]) - getDateSortValue(rightRow?.[columnIndex]);
        if (diff !== 0) return diff;
      }
      if (fieldType === 'number') {
        const diff = getNumberSortValue(leftRow?.[columnIndex]) - getNumberSortValue(rightRow?.[columnIndex]);
        if (diff !== 0) return diff;
      }
      if (fieldType === 'checkbox') {
        const leftChecked = getCellValues(leftRow, columnIndex).length ? 1 : 0;
        const rightChecked = getCellValues(rightRow, columnIndex).length ? 1 : 0;
        if (leftChecked !== rightChecked) return leftChecked - rightChecked;
      }
      return normalizeCellText(leftRow?.[columnIndex] || '').localeCompare(
        normalizeCellText(rightRow?.[columnIndex] || ''),
        'zh-Hans-CN',
        { numeric: true, sensitivity: 'base' }
      );
    };
    const activeFilterRules = filters.filter(rule => (
      rule.operator === 'is_empty'
      || rule.operator === 'is_not_empty'
      || (Array.isArray(rule.values) && rule.values.length)
    ));
    const rowMatchesFilter = (row, rule) => {
      const values = getCellValues(row, rule.columnIndex);
      const text = normalizeCellText(row?.[rule.columnIndex] || '');
      if (rule.operator === 'is_empty') return !text && !values.length;
      if (rule.operator === 'is_not_empty') return Boolean(text || values.length);
      const targetValues = Array.isArray(rule.values) ? rule.values : [];
      if (!targetValues.length) return true;
      if (isOptionFieldType(fieldTypes[rule.columnIndex]) || values.length > 1) {
        const hit = values.some(value => targetValues.includes(value));
        return rule.operator === 'not_contains_any' ? !hit : hit;
      }
      const lowerText = text.toLowerCase();
      const hit = targetValues.some(value => lowerText.includes(String(value || '').toLowerCase()));
      return rule.operator === 'not_contains_any' ? !hit : hit;
    };
    const applyViewSorts = (items) => {
      if (!sorts.length) return items;
      return [...items].sort((left, right) => {
        for (const rule of sorts) {
          const result = compareRowsByColumn(left.row, right.row, rule.columnIndex);
          if (result !== 0) return rule.direction === 'desc' ? -result : result;
        }
        return left.rowIndex - right.rowIndex;
      });
    };
    const visibleRows = applyViewSorts(
      rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(item => activeFilterRules.every(rule => rowMatchesFilter(item.row, rule)))
    );
    const groupColumnIndex = Number.isInteger(group.columnIndex) && group.columnIndex >= 0 && group.columnIndex < columns.length
      ? group.columnIndex
      : null;
    const groupChoices = groupColumnIndex === null ? [] : getColumnChoices(groupColumnIndex, { includeEmpty: true });
    const getRowGroupValue = (row) => {
      if (groupColumnIndex === null) return '__all__';
      return getCellValues(row, groupColumnIndex)[0] || '__empty__';
    };
    const visibleGroupSet = new Set(Array.isArray(group.visibleValues) ? group.visibleValues : []);
    const groupSections = (() => {
      if (groupColumnIndex === null) return [{ key: '__all__', label: '', rows: visibleRows }];
      const sections = new Map();
      groupChoices.forEach(choice => {
        sections.set(choice.value, { key: choice.value, label: choice.label, color: choice.color, rows: [] });
      });
      visibleRows.forEach(item => {
        const key = getRowGroupValue(item.row);
        if (visibleGroupSet.size && !visibleGroupSet.has(key)) return;
        if (!sections.has(key)) sections.set(key, { key, label: key === '__empty__' ? '空白' : key, color: '#f8fafc', rows: [] });
        sections.get(key).rows.push(item);
      });
      return Array.from(sections.values()).filter(section => (
        !visibleGroupSet.size || visibleGroupSet.has(section.key)
      ));
    })();
    const hasActiveFilter = activeFilterRules.length > 0;
    const hasConfiguredFilter = filters.length > 0;
    const hasActiveSort = sorts.length > 0;
    const hasActiveGroup = groupColumnIndex !== null;
    const updateTableName = (value) => {
      persistDatabaseMeta({ tableName: value });
    };
    const updateColumn = (columnIndex, value) => {
      persistDatabaseMeta({
        columns: columns.map((item, index) => (index === columnIndex ? value : item)),
      });
    };
    const updateFieldType = (columnIndex, value) => {
      persistDatabaseMeta(currentMeta => {
        const nextType = normalizeDatabaseFieldType(value, columnIndex, currentMeta.columns[columnIndex]);
        const nextFieldTypes = currentMeta.fieldTypes.map((item, index) => (index === columnIndex ? nextType : item));
        const nextTagOptions = { ...currentMeta.tagOptions };
        if (['select', 'multi_select', 'person'].includes(nextType) && !nextTagOptions[columnIndex]?.length) {
          nextTagOptions[columnIndex] = currentMeta.rows.reduce((acc, row) => {
            splitDatabaseTagValue(row?.[columnIndex]).forEach(name => {
              if (!acc.some(item => item.name === name)) acc.push(normalizeDatabaseTagOption(name, acc.length));
            });
            return acc;
          }, []).filter(Boolean);
        }
        return { fieldTypes: nextFieldTypes, tagOptions: nextTagOptions };
      });
    };
    const shiftIndexedMapForInsert = (map, insertIndex, insertedValue) => {
      const next = {};
      Object.entries(map || {}).forEach(([key, value]) => {
        const columnIndex = Number(key);
        if (!Number.isInteger(columnIndex)) return;
        next[columnIndex >= insertIndex ? columnIndex + 1 : columnIndex] = value;
      });
      if (insertedValue !== undefined) next[insertIndex] = insertedValue;
      return next;
    };
    const shiftIndexedMapForDelete = (map, deleteIndex) => {
      const next = {};
      Object.entries(map || {}).forEach(([key, value]) => {
        const columnIndex = Number(key);
        if (!Number.isInteger(columnIndex) || columnIndex === deleteIndex) return;
        next[columnIndex > deleteIndex ? columnIndex - 1 : columnIndex] = value;
      });
      return next;
    };
    const shiftRuleForInsert = (rule, insertIndex) => ({
      ...rule,
      columnIndex: rule.columnIndex >= insertIndex ? rule.columnIndex + 1 : rule.columnIndex,
    });
    const shiftRuleForDelete = (rule, deleteIndex) => {
      if (rule.columnIndex === deleteIndex) return null;
      return {
        ...rule,
        columnIndex: rule.columnIndex > deleteIndex ? rule.columnIndex - 1 : rule.columnIndex,
      };
    };
    const shiftGroupForInsert = (currentGroup, insertIndex) => {
      if (!Number.isInteger(currentGroup?.columnIndex)) return currentGroup;
      return {
        ...currentGroup,
        columnIndex: currentGroup.columnIndex >= insertIndex ? currentGroup.columnIndex + 1 : currentGroup.columnIndex,
      };
    };
    const shiftGroupForDelete = (currentGroup, deleteIndex) => {
      if (!Number.isInteger(currentGroup?.columnIndex)) return currentGroup;
      if (currentGroup.columnIndex === deleteIndex) return { columnIndex: null, visibleValues: [], collapsed: {} };
      return {
        ...currentGroup,
        columnIndex: currentGroup.columnIndex > deleteIndex ? currentGroup.columnIndex - 1 : currentGroup.columnIndex,
      };
    };
    const insertColumn = (targetIndex = columns.length - 1, position = 'after') => {
      const safeTargetIndex = Math.max(0, Math.min(columns.length - 1, Number(targetIndex) || 0));
      const insertIndex = position === 'before' ? safeTargetIndex : safeTargetIndex + 1;
      const nextColumns = [...columns];
      nextColumns.splice(insertIndex, 0, '字段名');
      const nextRows = rows.map(row => {
        const nextRow = [...row];
        nextRow.splice(insertIndex, 0, '');
        return nextRow;
      });
      const nextFieldTypes = [...fieldTypes];
      nextFieldTypes.splice(insertIndex, 0, 'text');
      const nextWidths = [...columnWidths];
      nextWidths.splice(insertIndex, 0, 200);
      persistDatabaseMeta({
        columns: nextColumns,
        rows: nextRows,
        fieldTypes: nextFieldTypes,
        columnWidths: nextWidths,
        tagOptions: shiftIndexedMapForInsert(tagOptions, insertIndex),
        columnColors: shiftIndexedMapForInsert(columnColors, insertIndex),
        titleColorColumns: shiftIndexedMapForInsert(titleColorColumns, insertIndex, false),
        sorts: sorts.map(rule => shiftRuleForInsert(rule, insertIndex)),
        filters: filters.map(rule => shiftRuleForInsert(rule, insertIndex)),
        group: shiftGroupForInsert(group, insertIndex),
      });
      setSelectedTableCell({ blockId: block.id, type: 'database', rowIndex: 0, columnIndex: insertIndex });
    };
    const deleteColumn = (columnIndex) => {
      if (columns.length <= 1) return;
      const safeIndex = Math.max(0, Math.min(columns.length - 1, Number(columnIndex) || 0));
      persistDatabaseMeta({
        columns: columns.filter((_, index) => index !== safeIndex),
        rows: rows.map(row => row.filter((_, index) => index !== safeIndex)),
        fieldTypes: fieldTypes.filter((_, index) => index !== safeIndex),
        columnWidths: columnWidths.filter((_, index) => index !== safeIndex),
        tagOptions: shiftIndexedMapForDelete(tagOptions, safeIndex),
        columnColors: shiftIndexedMapForDelete(columnColors, safeIndex),
        titleColorColumns: shiftIndexedMapForDelete(titleColorColumns, safeIndex),
        sorts: sorts.map(rule => shiftRuleForDelete(rule, safeIndex)).filter(Boolean),
        filters: filters.map(rule => shiftRuleForDelete(rule, safeIndex)).filter(Boolean),
        group: shiftGroupForDelete(group, safeIndex),
        filter: null,
      });
    };
    const addRow = () => {
      const nextRows = [...rows, columns.map(() => '')];
      persistDatabaseMeta({ rows: nextRows });
      setSelectedTableCell({ blockId: block.id, type: 'database', rowIndex: nextRows.length - 1, columnIndex: 0 });
    };
    const updateCell = (rowIndex, columnIndex, value, extraPatch = {}) => {
      const nextRows = rows.map((row, currentRowIndex) => (
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell))
          : row
      ));
      persistDatabaseMeta({ rows: nextRows, ...extraPatch });
    };
    const updateSelectCell = (rowIndex, columnIndex, values = []) => {
      const fieldType = fieldTypes[columnIndex];
      const rawValues = Array.isArray(values) ? values : [values];
      const normalizedValues = (fieldType === 'select' ? rawValues.slice(-1) : rawValues)
        .map(item => String(item || '').trim())
        .filter(Boolean);
      const nextOptions = [...(tagOptions[columnIndex] || [])];
      normalizedValues.forEach(name => {
        if (!nextOptions.some(item => item.name === name)) {
          nextOptions.push(normalizeDatabaseTagOption(name, nextOptions.length));
        }
      });
      updateCell(rowIndex, columnIndex, normalizedValues.join('、'), {
        tagOptions: {
          ...tagOptions,
          [columnIndex]: nextOptions,
        },
      });
    };
    const updateTagOption = (columnIndex, optionIndex, patch) => {
      const nextOptions = [...(tagOptions[columnIndex] || [])];
      const current = nextOptions[optionIndex];
      if (!current) return;
      nextOptions[optionIndex] = {
        ...current,
        ...patch,
        name: String((patch.name ?? current.name) || '').trim(),
      };
      persistDatabaseMeta({
        tagOptions: {
          ...tagOptions,
          [columnIndex]: nextOptions.filter(item => item.name),
        },
      });
    };
    const addTagOption = (columnIndex) => {
      const nextOptions = [...(tagOptions[columnIndex] || [])];
      nextOptions.push(normalizeDatabaseTagOption(`选项 ${nextOptions.length + 1}`, nextOptions.length));
      persistDatabaseMeta({
        tagOptions: {
          ...tagOptions,
          [columnIndex]: nextOptions,
        },
      });
    };
    const removeTagOption = (columnIndex, optionIndex) => {
      const nextOptions = (tagOptions[columnIndex] || []).filter((_, index) => index !== optionIndex);
      persistDatabaseMeta({
        tagOptions: {
          ...tagOptions,
          [columnIndex]: nextOptions,
        },
      });
    };
    const setSortByColumn = (columnIndex, direction = 'asc') => {
      persistDatabaseMeta({ sorts: [{ columnIndex, direction }] });
    };
    const addSortRule = (columnIndex = 0) => {
      const safeIndex = Math.max(0, Math.min(columns.length - 1, Number(columnIndex) || 0));
      persistDatabaseMeta({ sorts: [...sorts, { columnIndex: safeIndex, direction: 'asc' }] });
    };
    const updateSortRule = (ruleIndex, patch) => {
      persistDatabaseMeta({
        sorts: sorts.map((rule, index) => (index === ruleIndex ? { ...rule, ...patch } : rule)),
      });
    };
    const removeSortRule = (ruleIndex) => {
      persistDatabaseMeta({ sorts: sorts.filter((_, index) => index !== ruleIndex) });
    };
    const addFilterRule = (columnIndex = 0) => {
      const safeIndex = Math.max(0, Math.min(columns.length - 1, Number(columnIndex) || 0));
      persistDatabaseMeta({ filters: [...filters, { columnIndex: safeIndex, operator: 'contains_any', values: [] }] });
    };
    const updateFilterRule = (ruleIndex, patch) => {
      persistDatabaseMeta({
        filters: filters.map((rule, index) => (index === ruleIndex ? { ...rule, ...patch } : rule)),
      });
    };
    const removeFilterRule = (ruleIndex) => {
      persistDatabaseMeta({ filters: filters.filter((_, index) => index !== ruleIndex) });
    };
    const updateGroup = (patch) => {
      persistDatabaseMeta({
        group: {
          ...group,
          ...patch,
        },
      });
    };
    const clearDatabaseViewRules = () => {
      persistDatabaseMeta({
        sorts: [],
        filters: [],
        group: { columnIndex: null, visibleValues: [], collapsed: {} },
        filter: null,
      });
    };
    const beginColumnResize = (event, columnIndex) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = columnWidths[columnIndex] || 200;
      pushEditorUndoSnapshot();
      const handleMouseMove = moveEvent => {
        const nextWidth = Math.max(120, Math.round(startWidth + moveEvent.clientX - startX));
        setEditorBlocks(prev => prev.map(item => {
          if (item.id !== block.id) return item;
          const currentMeta = normalizeDatabaseBlockMeta(item);
          const nextWidths = currentMeta.columnWidths.map((width, index) => (index === columnIndex ? nextWidth : width));
          return {
            ...item,
            meta: {
              ...currentMeta,
              columnWidths: nextWidths,
            },
          };
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
    const handleDatabaseShellKeyDown = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target?.closest?.('[contenteditable="true"], input, textarea, .ant-select')) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedTableCell(null);
      setSelectedTableRange(null);
      clearAreaBlockSelection();
      addBlockAfter(block.id, 'paragraph', { content: '' });
    };
    const handleDatabaseCellKeyDown = (event, rowIndex, columnIndex) => {
      if ((event.key === 'Backspace' || event.key === 'Delete') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      try {
        document.execCommand('insertLineBreak');
      } catch {
        document.execCommand('insertHTML', false, '<br>');
      }
      window.setTimeout(() => {
        updateCell(rowIndex, columnIndex, sanitizeInlineHtml(target.innerHTML));
      }, 0);
    };
    const normalizeDatabasePastedCellHtml = (value = '') => {
      const html = normalizePastedInlineHtml(value);
      return inlineHtmlToPlain(html).trim() ? html : '';
    };
    const normalizeDatabaseClipboardMatrix = (matrix = []) => {
      const normalized = matrix
        .map(row => (Array.isArray(row) ? row : [row]).map(cell => sanitizeInlineHtml(String(cell || ''))))
        .filter(row => row.some(cell => inlineHtmlToPlain(cell).trim()));
      while (normalized.length > 1 && normalized[normalized.length - 1].every(cell => !inlineHtmlToPlain(cell).trim())) {
        normalized.pop();
      }
      const maxColumnCount = Math.max(0, ...normalized.map(row => row.length));
      if (!normalized.length || maxColumnCount <= 0) return null;
      return normalized.map(row => Array.from({ length: maxColumnCount }, (_, index) => row[index] || ''));
    };
    const parseDatabaseClipboardHtmlMatrix = (html = '') => {
      if (!html || typeof DOMParser === 'undefined') return null;
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const table = parsed.querySelector('table');
      if (!table) return null;
      const matrix = Array.from(table.querySelectorAll('tr')).map(row => (
        Array.from(row.querySelectorAll('th,td')).map(cell => normalizeDatabasePastedCellHtml(cell.innerHTML || cell.textContent || ''))
      ));
      return normalizeDatabaseClipboardMatrix(matrix);
    };
    const parseDatabaseClipboardTsvMatrix = (text = '') => {
      if (!String(text || '').includes('\t')) return null;
      const matrix = [];
      let row = [];
      let cell = '';
      let inQuotes = false;
      const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const nextChar = source[index + 1];
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            cell += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (!inQuotes && char === '\t') {
          row.push(escapeHtml(cell).replace(/\n/g, '<br>'));
          cell = '';
          continue;
        }
        if (!inQuotes && char === '\n') {
          row.push(escapeHtml(cell).replace(/\n/g, '<br>'));
          matrix.push(row);
          row = [];
          cell = '';
          continue;
        }
        cell += char;
      }
      if (cell || row.length || !source.endsWith('\n')) row.push(escapeHtml(cell).replace(/\n/g, '<br>'));
      if (row.length) matrix.push(row);
      return normalizeDatabaseClipboardMatrix(matrix);
    };
    const getDatabaseClipboardMatrix = (event) => {
      const clipboardData = event.clipboardData;
      const html = clipboardData?.getData?.('text/html') || '';
      const text = clipboardData?.getData?.('text/plain') || '';
      return parseDatabaseClipboardHtmlMatrix(html) || parseDatabaseClipboardTsvMatrix(text);
    };
    const isMultiCellClipboardMatrix = (matrix) => (
      Array.isArray(matrix)
      && (
        matrix.length > 1
        || matrix.some(row => Array.isArray(row) && row.length > 1)
      )
    );
    const applyDatabaseClipboardMatrix = (matrix, rowIndex, columnIndex) => {
      if (!isMultiCellClipboardMatrix(matrix)) return false;
      const maxMatrixColumnCount = Math.max(1, ...matrix.map(row => row.length));
      const nextColumnCount = Math.max(columns.length, columnIndex + maxMatrixColumnCount);
      const nextRowCount = Math.max(rows.length, rowIndex + matrix.length);
      const nextColumns = Array.from({ length: nextColumnCount }, (_, index) => (
        index < columns.length ? columns[index] : `字段名 ${index + 1}`
      ));
      const nextRows = Array.from({ length: nextRowCount }, (_, currentRowIndex) => (
        Array.from({ length: nextColumnCount }, (_, currentColumnIndex) => rows[currentRowIndex]?.[currentColumnIndex] || '')
      ));
      matrix.forEach((matrixRow, matrixRowIndex) => {
        matrixRow.forEach((cell, matrixColumnIndex) => {
          nextRows[rowIndex + matrixRowIndex][columnIndex + matrixColumnIndex] = cell;
        });
      });
      persistDatabaseMeta({
        columns: nextColumns,
        rows: nextRows,
        fieldTypes: Array.from({ length: nextColumnCount }, (_, index) => fieldTypes[index] || 'text'),
        columnWidths: Array.from({ length: nextColumnCount }, (_, index) => columnWidths[index] || 200),
      });
      setSelectedTableCell({ blockId: block.id, type: 'database', rowIndex, columnIndex });
      return true;
    };
    const getDatabaseClipboardInlineHtml = (event) => {
      const clipboardData = event.clipboardData;
      const html = clipboardData?.getData?.('text/html') || '';
      const text = clipboardData?.getData?.('text/plain') || '';
      const normalizedHtml = normalizePastedInlineHtml(html);
      if (inlineHtmlToPlain(normalizedHtml).trim()) return normalizedHtml;
      if (!text) return '';
      return escapeHtml(text).replace(/\r?\n/g, '<br>');
    };
    const handleDatabaseCellPaste = (event, rowIndex, columnIndex) => {
      const matrix = getDatabaseClipboardMatrix(event);
      if (applyDatabaseClipboardMatrix(matrix, rowIndex, columnIndex)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const inlineHtml = getDatabaseClipboardInlineHtml(event);
      if (!inlineHtml) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        document.execCommand('insertHTML', false, inlineHtml);
      } catch {
        document.execCommand('insertText', false, inlineHtmlToPlain(inlineHtml));
      }
      const target = event.currentTarget;
      window.setTimeout(() => {
        updateCell(rowIndex, columnIndex, sanitizeInlineHtml(target.innerHTML));
      }, 0);
    };
    const handleDatabaseInputCellPaste = (event, rowIndex, columnIndex) => {
      const matrix = getDatabaseClipboardMatrix(event);
      if (applyDatabaseClipboardMatrix(matrix, rowIndex, columnIndex)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
    };
    const stopDatabaseEditorKeyDown = (event) => {
      if (!['Backspace', 'Delete', 'Enter'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
      event.stopPropagation();
    };
    const renderFieldTypeIcon = (type) => (
      <span style={{ width: 18, minWidth: 18, color: '#6b7280', display: 'inline-flex', justifyContent: 'center' }}>
        {databaseFieldTypeMap[type]?.icon || '☰'}
      </span>
    );
    const renderDatabaseMenuButton = ({ icon, label, onClick, danger = false, disabled = false }) => (
      <button
        type="button"
        disabled={disabled}
        onClick={event => {
          event.stopPropagation();
          if (!disabled) onClick?.();
        }}
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          color: disabled ? '#cbd5e1' : (danger ? '#b91c1c' : '#1f2937'),
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 34,
          padding: '6px 8px',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 14,
        }}
      >
        <span style={{ width: 20, textAlign: 'center', color: disabled ? '#cbd5e1' : '#64748b' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
      </button>
    );
    const renderColumnColorSwatches = (columnIndex) => (
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
        {databaseTagColorOptions.map(color => (
          <button
            key={`${columnIndex}-${color}`}
            type="button"
            title={color}
            onClick={event => {
              event.stopPropagation();
              persistDatabaseMeta({
                columnColors: {
                  ...columnColors,
                  [columnIndex]: color,
                },
              });
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              border: (columnColors[columnIndex] || '') === color ? '2px solid #111827' : '1px solid #d1d5db',
              background: color,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    );
    const renderDatabasePanelFrame = (children, width = 340) => (
      <div
        data-document-database-editor-block-id={block.id}
        onMouseDown={event => {
          event.stopPropagation();
          if (!event.target?.closest?.('input, textarea, [contenteditable="true"], .ant-select, .ant-picker')) event.preventDefault();
        }}
        onKeyDown={stopDatabaseEditorKeyDown}
        style={{
          width,
          maxHeight: 'min(680px, calc(100vh - 120px))',
          overflowY: 'auto',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 18px 44px rgba(15, 23, 42, 0.18)',
          padding: 12,
        }}
      >
        {children}
      </div>
    );
    const renderSortPanel = () => renderDatabasePanelFrame(
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text strong>排序</Text>
        {sorts.length ? sorts.map((rule, ruleIndex) => {
          const fieldType = fieldTypes[rule.columnIndex] || 'text';
          return (
            <div key={`sort-rule-${ruleIndex}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, alignItems: 'center' }}>
              <Select
                value={rule.columnIndex}
                onChange={value => updateSortRule(ruleIndex, { columnIndex: value, direction: 'asc' })}
                options={columns.map((column, index) => ({ value: index, label: column }))}
              />
              <Select
                value={rule.direction}
                onChange={value => updateSortRule(ruleIndex, { direction: value })}
                options={getSortDirectionOptions(fieldType)}
              />
              <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => removeSortRule(ruleIndex)} />
            </div>
          );
        }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无排序规则" />}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => addSortRule()} block>
          新增排序规则
        </Button>
      </Space>
    );
    const renderFilterPanel = () => renderDatabasePanelFrame(
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text strong>筛选</Text>
        {filters.length ? filters.map((rule, ruleIndex) => {
          const valueOptions = getColumnChoices(rule.columnIndex);
          const needsValues = !['is_empty', 'is_not_empty'].includes(rule.operator);
          return (
            <div key={`filter-rule-${ruleIndex}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, alignItems: 'center' }}>
              <Select
                value={rule.columnIndex}
                onChange={value => updateFilterRule(ruleIndex, { columnIndex: value, values: [] })}
                options={columns.map((column, index) => ({ value: index, label: column }))}
              />
              <Select
                value={rule.operator}
                onChange={value => updateFilterRule(ruleIndex, { operator: value, values: [] })}
                options={[
                  { value: 'contains_any', label: '包含任一条件' },
                  { value: 'not_contains_any', label: '不包含任一条件' },
                  { value: 'is_empty', label: '为空' },
                  { value: 'is_not_empty', label: '不为空' },
                ]}
              />
              <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => removeFilterRule(ruleIndex)} />
              {needsValues && (
                <Select
                  mode={valueOptions.length ? 'multiple' : 'tags'}
                  value={rule.values || []}
                  onChange={values => updateFilterRule(ruleIndex, { values })}
                  options={valueOptions.map(option => ({ value: option.value, label: option.label }))}
                  placeholder="选择或输入条件"
                  style={{ gridColumn: '1 / span 3' }}
                />
              )}
            </div>
          );
        }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无筛选规则" />}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => addFilterRule()} block>
          添加筛选
        </Button>
      </Space>
    );
    const renderGroupPanel = () => {
      const currentGroupChoices = groupColumnIndex === null ? [] : groupChoices;
      const selectedValues = group.visibleValues?.length ? group.visibleValues : currentGroupChoices.map(choice => choice.value);
      return renderDatabasePanelFrame(
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text strong>分组</Text>
          <Select
            value={groupColumnIndex === null ? 'none' : groupColumnIndex}
            onChange={value => {
              if (value === 'none') updateGroup({ columnIndex: null, visibleValues: [], collapsed: {} });
              else updateGroup({ columnIndex: value, visibleValues: [], collapsed: {} });
            }}
            options={[
              { value: 'none', label: '无分组' },
              ...columns.map((column, index) => ({ value: index, label: column })),
            ]}
            style={{ width: '100%' }}
          />
          {groupColumnIndex !== null && (
            <>
              <Text type="secondary">展示分组</Text>
              <Checkbox.Group
                value={selectedValues}
                onChange={values => updateGroup({ visibleValues: values })}
                style={{ width: '100%', display: 'grid', gap: 8 }}
              >
                {currentGroupChoices.map(choice => (
                  <Checkbox key={choice.value} value={choice.value}>
                    <Tag style={{ ...getDatabaseTagStyle(choice), marginInlineEnd: 6 }}>{choice.label}</Tag>
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </>
          )}
        </Space>
      );
    };
    const renderViewConfigPanel = () => renderDatabasePanelFrame(
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text strong>视图配置</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
            <Text type="secondary">字段</Text>
            <div style={{ fontWeight: 700 }}>{columns.length}</div>
          </div>
          <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
            <Text type="secondary">记录</Text>
            <div style={{ fontWeight: 700 }}>{rows.length}</div>
          </div>
        </div>
        <Text type="secondary">
          当前显示 {visibleRows.length} 条，排序 {sorts.length} 条，筛选 {activeFilterRules.length} 条，{hasActiveGroup ? `按「${columns[groupColumnIndex]}」分组` : '无分组'}。
        </Text>
        <Button onClick={clearDatabaseViewRules} disabled={!hasActiveSort && !hasConfiguredFilter && !hasActiveGroup} block>
          清空排序、筛选和分组
        </Button>
      </Space>
    );
    const renderDatabaseColumnMenu = (columnIndex) => {
      const fieldType = fieldTypes[columnIndex];
      const isOptionType = ['select', 'multi_select', 'person'].includes(fieldType);
      const options = tagOptions[columnIndex] || [];
      return (
        <div
          data-document-database-editor-block-id={block.id}
          onMouseDown={event => {
            event.stopPropagation();
            if (!event.target?.closest?.('input, textarea, [contenteditable="true"], .ant-select')) event.preventDefault();
          }}
          onKeyDown={stopDatabaseEditorKeyDown}
          style={{
            width: 320,
            maxHeight: 'min(680px, calc(100vh - 120px))',
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 18px 44px rgba(15, 23, 42, 0.18)',
            padding: 12,
          }}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>字段名称</Text>
          <Input
            value={columns[columnIndex]}
            onChange={event => updateColumn(columnIndex, event.target.value)}
            onFocus={event => event.target.select()}
            style={{ marginBottom: 12, fontWeight: 600 }}
          />
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>字段类型</Text>
          <Select
            value={fieldType}
            onChange={value => updateFieldType(columnIndex, value)}
            options={databaseFieldTypeOptions.map(item => ({ value: item.value, label: `${item.icon} ${item.label}` }))}
            style={{ width: '100%', marginBottom: 12 }}
          />
          <Text type="secondary" style={{ display: 'block' }}>列颜色</Text>
          {renderColumnColorSwatches(columnIndex)}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 8px' }}>
            <Text>同时设置标题颜色</Text>
            <Switch
              size="small"
              checked={Boolean(titleColorColumns[columnIndex])}
              onChange={checked => persistDatabaseMeta({
                titleColorColumns: {
                  ...titleColorColumns,
                  [columnIndex]: checked,
                },
              })}
            />
          </div>
          {isOptionType && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text type="secondary">选项</Text>
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => addTagOption(columnIndex)} />
              </div>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {options.map((option, optionIndex) => {
                  const tagStyle = getDatabaseTagStyle(option);
                  return (
                    <div key={`${option.name}-${optionIndex}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: tagStyle.background, border: `1px solid ${tagStyle.borderColor}` }} />
                      <Input
                        value={option.name}
                        onChange={event => updateTagOption(columnIndex, optionIndex, { name: event.target.value })}
                        style={{ flex: 1 }}
                      />
                      <Dropdown
                        trigger={['click']}
                        dropdownRender={() => (
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', width: 154, padding: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                            {databaseTagColorOptions.map(color => (
                              <button
                                key={color}
                                type="button"
                                title={color}
                                onClick={event => {
                                  event.stopPropagation();
                                  updateTagOption(columnIndex, optionIndex, { color });
                                }}
                                style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #d1d5db', background: color, cursor: 'pointer' }}
                              />
                            ))}
                          </div>
                        )}
                      >
                        <Button type="text" size="small" style={{ background: tagStyle.background, borderColor: tagStyle.borderColor }} />
                      </Dropdown>
                      <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => removeTagOption(columnIndex, optionIndex)} />
                    </div>
                  );
                })}
              </Space>
            </>
          )}
          <Divider style={{ margin: '10px 0' }} />
          {renderDatabaseMenuButton({ icon: '↑', label: getSortDirectionLabel(fieldType, 'asc'), onClick: () => setSortByColumn(columnIndex, 'asc') })}
          {renderDatabaseMenuButton({ icon: '↓', label: getSortDirectionLabel(fieldType, 'desc'), onClick: () => setSortByColumn(columnIndex, 'desc') })}
          {renderDatabaseMenuButton({ icon: '⌕', label: '按该字段筛选', onClick: () => addFilterRule(columnIndex) })}
          <Divider style={{ margin: '10px 0' }} />
          {renderDatabaseMenuButton({ icon: '←', label: '在左侧添加字段', onClick: () => insertColumn(columnIndex, 'before') })}
          {renderDatabaseMenuButton({ icon: '→', label: '在右侧添加字段', onClick: () => insertColumn(columnIndex, 'after') })}
          {renderDatabaseMenuButton({ icon: '×', label: '删除该字段', danger: true, disabled: columns.length <= 1, onClick: () => deleteColumn(columnIndex) })}
        </div>
      );
    };
    const focusDatabaseCell = (rowIndex, columnIndex) => {
      setSelectedBlockId(block.id);
      clearAreaBlockSelection();
      setSelectedTableCell({ blockId: block.id, type: 'database', rowIndex, columnIndex });
    };
    const renderSelectCell = (row, rowIndex, columnIndex) => {
      const options = tagOptions[columnIndex] || [];
      const fieldType = fieldTypes[columnIndex];
      const isSingleSelect = fieldType === 'select';
      const values = splitDatabaseTagValue(row[columnIndex]);
      return (
        <Select
          mode={isSingleSelect ? undefined : 'tags'}
          bordered={false}
          value={isSingleSelect ? (values[0] || undefined) : values}
          placeholder=""
          onFocus={() => focusDatabaseCell(rowIndex, columnIndex)}
          onChange={nextValues => updateSelectCell(rowIndex, columnIndex, nextValues)}
          onInputKeyDown={event => {
            if (['Enter', 'Backspace', 'Delete'].includes(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
              event.stopPropagation();
            }
          }}
          options={options.map(option => ({ value: option.name, label: option.name }))}
          tagRender={!isSingleSelect ? ({ value, closable, onClose }) => {
            const option = options.find(item => item.name === value) || normalizeDatabaseTagOption(value, 0);
            const tagStyle = getDatabaseTagStyle(option);
            return (
              <Tag
                closable={closable}
                onClose={onClose}
                style={{ ...tagStyle, marginInlineEnd: 4, borderRadius: 4, lineHeight: '22px' }}
              >
                {value}
              </Tag>
            );
          } : undefined}
          style={{ width: '100%' }}
        />
      );
    };
    const renderTypedInputCell = (row, rowIndex, columnIndex, inputType, placeholder = '') => {
      const activeCell = selectedCell?.type === 'database' && selectedCell.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex;
      return (
        <Input
          type={inputType}
          bordered={false}
          value={normalizeCellText(row[columnIndex])}
          placeholder={placeholder}
          onFocus={() => focusDatabaseCell(rowIndex, columnIndex)}
          onChange={event => updateCell(rowIndex, columnIndex, event.target.value)}
          onKeyDown={event => handleDatabaseCellKeyDown(event, rowIndex, columnIndex)}
          onPaste={event => handleDatabaseInputCellPaste(event, rowIndex, columnIndex)}
          style={{
            minHeight: 38,
            padding: '6px 8px',
            background: 'transparent',
            boxShadow: activeCell ? 'inset 0 0 0 1px #6366f1' : 'none',
          }}
        />
      );
    };
    const renderDatabaseCell = (row, rowIndex, columnIndex) => {
      const fieldType = fieldTypes[columnIndex];
      const activeCell = selectedCell?.type === 'database' && selectedCell.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex;
      if (['select', 'multi_select', 'person'].includes(fieldType)) {
        return renderSelectCell(row, rowIndex, columnIndex);
      }
      if (fieldType === 'checkbox') {
        return (
          <Checkbox
            checked={String(row[columnIndex]).toLowerCase() === 'true' || inlineHtmlToPlain(row[columnIndex]) === '是'}
            onFocus={() => focusDatabaseCell(rowIndex, columnIndex)}
            onChange={event => updateCell(rowIndex, columnIndex, event.target.checked ? 'true' : '')}
          />
        );
      }
      if (fieldType === 'date') {
        const text = normalizeCellText(row[columnIndex]);
        const dateValue = text && dayjs(text).isValid() ? dayjs(text) : null;
        return (
          <DatePicker
            value={dateValue}
            format="YYYY-MM-DD"
            bordered={false}
            allowClear
            placeholder="选择日期"
            onFocus={() => focusDatabaseCell(rowIndex, columnIndex)}
            onChange={(_, dateString) => updateCell(rowIndex, columnIndex, dateString || '')}
            onKeyDown={event => handleDatabaseCellKeyDown(event, rowIndex, columnIndex)}
            onPaste={event => handleDatabaseInputCellPaste(event, rowIndex, columnIndex)}
            style={{ width: '100%', minHeight: 38, padding: '6px 8px' }}
          />
        );
      }
      if (fieldType === 'number') {
        const numericValue = getNumberSortValue(row[columnIndex]);
        return (
          <InputNumber
            value={Number.isFinite(numericValue) ? numericValue : null}
            bordered={false}
            controls={false}
            placeholder=""
            onFocus={() => focusDatabaseCell(rowIndex, columnIndex)}
            onChange={value => updateCell(rowIndex, columnIndex, value === null || value === undefined ? '' : String(value))}
            onKeyDown={event => handleDatabaseCellKeyDown(event, rowIndex, columnIndex)}
            onPaste={event => handleDatabaseInputCellPaste(event, rowIndex, columnIndex)}
            style={{ width: '100%', padding: '6px 8px' }}
          />
        );
      }
      if (fieldType === 'url') return renderTypedInputCell(row, rowIndex, columnIndex, 'url', 'https://');
      if (fieldType === 'email') return renderTypedInputCell(row, rowIndex, columnIndex, 'email', 'name@example.com');
      if (fieldType === 'phone') return renderTypedInputCell(row, rowIndex, columnIndex, 'tel', '电话');
      return (
        <InlineRichTextEditor
          id={`doc-table-cell-input-${block.id}-database-${rowIndex}-${columnIndex}`}
          value={row[columnIndex]}
          placeholder=""
          onFocus={() => {
            setSelectedBlockId(block.id);
            clearAreaBlockSelection();
            setSelectedTableCell({ blockId: block.id, type: 'database', rowIndex, columnIndex });
          }}
          onChange={value => updateCell(rowIndex, columnIndex, value)}
          onMouseUp={event => handleTableCellTextSelection(block, { type: 'database', rowIndex, columnIndex }, event)}
          onKeyUp={event => handleTableCellTextSelection(block, { type: 'database', rowIndex, columnIndex }, event)}
          onKeyDown={event => handleDatabaseCellKeyDown(event, rowIndex, columnIndex)}
          onPaste={event => handleDatabaseCellPaste(event, rowIndex, columnIndex)}
          onBlur={() => {
            inlineToolbarHideTimerRef.current = window.setTimeout(() => {
              const activeElement = document.activeElement;
              if (activeElement?.closest?.('[data-inline-text-toolbar="true"]')) return;
              setInlineToolbar(null);
            }, 180);
          }}
          style={{
            minHeight: 38,
            padding: '6px 8px',
            lineHeight: 1.55,
            fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
            background: 'transparent',
            color: fieldType === 'title' ? '#111827' : '#374151',
            fontWeight: fieldType === 'title' ? 500 : 400,
            boxShadow: activeCell ? 'inset 0 0 0 1px #6366f1' : 'none',
          }}
        />
      );
    };
    const renderDatabaseGroupColumnHeaderRow = (sectionKey) => (
      <tr key={`database-group-header-${sectionKey}`}>
        {columns.map((column, columnIndex) => {
          const fieldType = fieldTypes[columnIndex];
          const headerBackground = titleColorColumns[columnIndex] ? (columnColors[columnIndex] || '#fff') : '#fff';
          return (
            <td
              key={`database-group-header-cell-${sectionKey}-${columnIndex}`}
              style={{
                position: 'relative',
                border: '1px solid #e5e7eb',
                background: headerBackground,
                textAlign: 'left',
                padding: 0,
                height: 40,
                verticalAlign: 'middle',
              }}
            >
              <Dropdown trigger={['click']} placement="bottomLeft" autoAdjustOverflow={false} dropdownRender={() => renderDatabaseColumnMenu(columnIndex)}>
                <button
                  type="button"
                  onClick={event => event.stopPropagation()}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 0,
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    color: '#4b5563',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {renderFieldTypeIcon(fieldType)}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column}</span>
                </button>
              </Dropdown>
            </td>
          );
        })}
        <td style={{ border: '1px solid #e5e7eb', background: '#fff', padding: 0, height: 40 }}>
          <Button type="text" icon={<PlusOutlined />} aria-label="新增字段" onClick={() => insertColumn(columns.length - 1, 'after')} />
        </td>
      </tr>
    );
    const renderDatabaseBodyRow = ({ row, rowIndex }) => (
      <tr key={`database-row-${rowIndex}`}>
        {columns.map((_, columnIndex) => {
          const cellBackground = columnColors[columnIndex] || '#fff';
          return (
            <td
              key={`database-cell-${rowIndex}-${columnIndex}`}
              data-document-table-cell="true"
              data-table-block-id={block.id}
              data-row-index={rowIndex}
              data-column-index={columnIndex}
              style={{
                border: '1px solid #e5e7eb',
                background: cellBackground,
                minHeight: 44,
                padding: 0,
                verticalAlign: 'top',
              }}
            >
              {renderDatabaseCell(row, rowIndex, columnIndex)}
            </td>
          );
        })}
        <td style={{ border: '1px solid #e5e7eb', background: '#fff' }} />
      </tr>
    );
    return (
      <div
        id={`doc-database-shell-${block.id}`}
        data-document-database-editor-block-id={block.id}
        tabIndex={0}
        onKeyDown={handleDatabaseShellKeyDown}
        style={{ width: '100%', outline: 'none', padding: '4px 0 8px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e5e7eb', padding: '6px 0 10px', minWidth: 0 }}>
          <Space size={8} style={{ minWidth: 0 }}>
            <MenuOutlined style={{ color: '#1f2937' }} />
            <Text strong style={{ fontSize: 16 }}>表格视图</Text>
            <Button type="text" size="small" icon={<PlusOutlined />} aria-label="新增视图" />
          </Space>
          <Space size={4} style={{ marginLeft: 'auto' }}>
            <Dropdown trigger={['click']} dropdownRender={renderViewConfigPanel}>
              <Button type="text" size="small">视图配置</Button>
            </Dropdown>
            <Dropdown trigger={['click']} dropdownRender={renderSortPanel}>
              <Button type="text" size="small">
                排序{sorts.length ? ` ${sorts.length}` : ''}
              </Button>
            </Dropdown>
            <Dropdown trigger={['click']} dropdownRender={renderFilterPanel}>
              <Button type="text" size="small">
                筛选{activeFilterRules.length ? ` ${activeFilterRules.length}` : ''}
              </Button>
            </Dropdown>
            <Dropdown trigger={['click']} dropdownRender={renderGroupPanel}>
              <Button type="text" size="small">
                分组{hasActiveGroup ? ` ${columns[groupColumnIndex]}` : ''}
              </Button>
            </Dropdown>
            <Tooltip title="搜索">
              <Button type="text" size="small" icon={<SearchOutlined />} aria-label="搜索" onClick={() => addFilterRule(0)} />
            </Tooltip>
            <Tooltip title="更多">
              <Button type="text" size="small" icon={<MoreOutlined />} aria-label="更多" />
            </Tooltip>
            <Button type="primary" danger size="small" onClick={addRow}>新增</Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'row', label: '新增记录' },
                  { key: 'field', label: '新增字段' },
                ],
                onClick: ({ key }) => {
                  if (key === 'row') addRow();
                  if (key === 'field') insertColumn(columns.length - 1, 'after');
                },
              }}
            >
              <Button type="primary" danger size="small" icon={<DownOutlined />} aria-label="新增菜单" />
            </Dropdown>
          </Space>
        </div>
        <Input
          value={tableName}
          placeholder="表格名称"
          bordered={false}
          onChange={event => updateTableName(event.target.value)}
          onKeyDown={stopDatabaseEditorKeyDown}
          style={{ fontSize: 18, fontWeight: 700, color: tableName ? '#111827' : '#9ca3af', margin: '14px 0 10px', paddingLeft: 0 }}
        />
        {shouldShowWolaiImportNotice && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              margin: '0 0 12px',
              padding: '10px 12px',
              border: '1px solid #fde68a',
              borderRadius: 8,
              background: '#fffbeb',
              color: '#92400e',
              fontSize: 13,
            }}
          >
            <Text style={{ color: '#92400e' }}>
              Wolai 未返回表格行数据，已导入字段、选项、排序和分组。
            </Text>
            {wolaiLiveEmbedUrl && (
              <Button
                size="small"
                icon={<LinkOutlined />}
                href={wolaiLiveEmbedUrl}
                target="_blank"
                rel="noreferrer"
              >
                打开原表
              </Button>
            )}
          </div>
        )}
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table style={{ width: tableWidth, maxWidth: 'none', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: isMobile ? 520 : 720 }}>
            <colgroup>
              {columnWidths.map((width, index) => <col key={`database-col-${index}`} style={{ width }} />)}
              <col style={{ width: 74 }} />
            </colgroup>
            {!hasActiveGroup && (
              <thead>
                <tr>
                  {columns.map((column, columnIndex) => {
                    const fieldType = fieldTypes[columnIndex];
                    const headerBackground = titleColorColumns[columnIndex] ? (columnColors[columnIndex] || '#fff') : '#fff';
                    return (
                      <th
                        key={`database-header-${columnIndex}`}
                        style={{
                          position: 'relative',
                          border: '1px solid #e5e7eb',
                          borderLeft: columnIndex === 0 ? '1px solid #e5e7eb' : undefined,
                          background: headerBackground,
                          textAlign: 'left',
                          padding: 0,
                          height: 44,
                          verticalAlign: 'middle',
                        }}
                      >
                        <Dropdown trigger={['click']} placement="bottomLeft" autoAdjustOverflow={false} dropdownRender={() => renderDatabaseColumnMenu(columnIndex)}>
                          <button
                            type="button"
                            onClick={event => event.stopPropagation()}
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 0,
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              color: '#4b5563',
                              fontWeight: 700,
                              fontSize: 15,
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            {renderFieldTypeIcon(fieldType)}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column}</span>
                          </button>
                        </Dropdown>
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
                    );
                  })}
                  <th style={{ border: '1px solid #e5e7eb', background: '#fff', padding: 0, height: 44 }}>
                    <Button type="text" icon={<PlusOutlined />} aria-label="新增字段" onClick={() => insertColumn(columns.length - 1, 'after')} />
                  </th>
                </tr>
              </thead>
            )}
            <tbody>
              {groupSections.length ? groupSections.map(section => (
                <React.Fragment key={`database-section-${section.key}`}>
                  {hasActiveGroup && (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '8px 12px' }}>
                        <Space size={8}>
                          <Tag style={{ ...getDatabaseTagStyle(section), marginInlineEnd: 0 }}>{section.label}</Tag>
                          <Text type="secondary">{section.rows.length} 条</Text>
                        </Space>
                      </td>
                    </tr>
                  )}
                  {hasActiveGroup && renderDatabaseGroupColumnHeaderRow(section.key)}
                  {section.rows.length ? section.rows.map(renderDatabaseBodyRow) : (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ border: '1px solid #e5e7eb', background: '#fff', padding: '10px 14px' }}>
                        <Text type="secondary">表格视图内容为空</Text>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )) : (
                <tr>
                  <td colSpan={columns.length + 1} style={{ border: '1px solid #e5e7eb', background: '#fff', padding: 24 }}>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配记录" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Button type="text" icon={<PlusOutlined />} onClick={addRow} style={{ marginTop: 8, color: '#6b7280' }}>
          新增
        </Button>
      </div>
    );
  };

  const renderTableBlock = (block) => {
    const meta = getBlockMeta(block);
    const storedColumns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : ['名称', '说明'];
    const storedRows = Array.isArray(meta.rows) && meta.rows.length ? meta.rows : [storedColumns.map(() => '')];
    const columnCount = Math.max(
      storedColumns.length,
      ...storedRows.map(row => (Array.isArray(row) ? row.length : 0)),
      1
    );
    const columns = Array.from({ length: columnCount }, (_, index) => storedColumns[index] || `字段 ${index + 1}`);
    const normalizedRows = storedRows.map(row => Array.from({ length: columnCount }, (_, index) => row?.[index] || ''));
    const rowHeights = normalizeDocumentTableRowHeights(meta.rowHeights, normalizedRows.length);
    const columnWidths = columns.map((_, index) => Math.max(80, Number(meta.columnWidths?.[index]) || (isMobile ? 120 : 160)));
    const rowColumnWidths = normalizeDocumentTableRowColumnWidths(
      meta.rowColumnWidths,
      normalizedRows.length,
      columns.length,
      columnWidths,
    );
    const getRowColumnWidths = rowIndex => getDocumentTableRowColumnWidths(columnWidths, rowColumnWidths, rowIndex);
    const mergedLookup = buildTableMergedLookup(meta.mergedCells, normalizedRows.length, columns.length);
    const mergedCells = mergedLookup.normalized;
    const hasVerticalMergedCells = mergedCells.some(merge => merge.rowSpan > 1);
    const useRowScopedWidths = Object.keys(rowColumnWidths).length > 0
      && !hasVerticalMergedCells;
    const cellStyles = normalizeTableCellStyles(meta.cellStyles, normalizedRows.length, columns.length);
    const selectedCell = selectedTableCell?.blockId === block.id ? selectedTableCell : null;
    const selectedTableCellIsBody = !selectedCell?.type || selectedCell.type === 'body';
    const selectedColumnIndex = Number.isInteger(selectedCell?.columnIndex) ? selectedCell.columnIndex : -1;
    const selectedRowIndex = Number.isInteger(selectedCell?.rowIndex) ? selectedCell.rowIndex : -1;
    const activeTableRange = selectedTableRange?.blockId === block.id ? selectedTableRange : null;
    const normalizeTableRange = (range) => {
      if (!range) return null;
      const clampRow = (rowIndex) => Math.max(0, Math.min(normalizedRows.length - 1, Number(rowIndex) || 0));
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
    const selectedRangeBounds = expandDocumentTableSelectionBounds(
      normalizeTableRange(activeTableRange),
      mergedCells,
      { rowCount: normalizedRows.length, columnCount: columns.length },
    );
    const wholeTableSelected = selectedAreaBlockIds.includes(block.id);
    const hasSelectedRange = Boolean(
      selectedRangeBounds
      && (
        selectedRangeBounds.startRowIndex !== selectedRangeBounds.endRowIndex
        || selectedRangeBounds.startColumnIndex !== selectedRangeBounds.endColumnIndex
      )
    );
    const activeStyleBounds = resolveDocumentTableStyleBounds({
      wholeTableSelected,
      selectedRangeBounds,
      hasSelectedRange,
      selectedCell,
      rowCount: normalizedRows.length,
      columnCount: columns.length,
    });
    const isCellInSelectedRange = (rowIndex, columnIndex) => (
      hasSelectedRange
      && rowIndex >= selectedRangeBounds.startRowIndex
      && rowIndex <= selectedRangeBounds.endRowIndex
      && columnIndex >= selectedRangeBounds.startColumnIndex
      && columnIndex <= selectedRangeBounds.endColumnIndex
    );
    const minimumTableWidth = Math.max(columns.length * 80, isMobile ? 240 : 160);
    const getRenderedRowWidth = rowIndex => Math.max(
      getRowColumnWidths(rowIndex).reduce((sum, width) => sum + width, 0),
      minimumTableWidth,
    );
    const tableWidth = Math.max(
      minimumTableWidth,
      ...normalizedRows.map((_, rowIndex) => getRenderedRowWidth(rowIndex)),
    );
    const horizontalCenter = Boolean(meta.horizontalCenter);
    const verticalCenter = Boolean(meta.verticalCenter);
    const getMergedAnchor = (rowIndex, columnIndex) => mergedLookup.anchorMap.get(buildTableMergeKey(rowIndex, columnIndex)) || null;
    const getMergedCover = (rowIndex, columnIndex) => mergedLookup.coveredMap.get(buildTableMergeKey(rowIndex, columnIndex)) || null;
    const getAnchorCellValue = (rowIndex, columnIndex) => String(normalizedRows[rowIndex]?.[columnIndex] || '');
    const mergeSelectionPlan = resolveDocumentTableMergePlan(mergedCells, selectedRangeBounds);
    const canMergeSelectedRange = hasSelectedRange && mergeSelectionPlan.canMerge;
    const persistTableMeta = (patch) => {
      const nextVisibleRows = Array.isArray(patch?.rows) ? patch.rows : normalizedRows;
      const nextColumns = Array.isArray(patch?.columns) ? patch.columns : columns;
      const nextColumnWidths = patch?.columnWidths ?? columnWidths;
      const nextRowColumnWidths = normalizeDocumentTableRowColumnWidths(
        patch?.rowColumnWidths ?? rowColumnWidths,
        nextVisibleRows.length,
        nextColumns.length,
        nextColumnWidths,
      );
      const nextRowHeights = normalizeDocumentTableRowHeights(
        patch?.rowHeights ?? rowHeights,
        nextVisibleRows.length,
      );
      const nextHorizontalCenter = patch?.horizontalCenter ?? horizontalCenter;
      const nextVerticalCenter = patch?.verticalCenter ?? verticalCenter;
      const nextMergedCells = patch?.mergedCells ?? mergedCells;
      const nextCellStyles = patch?.cellStyles ?? cellStyles;
      const stored = buildStoredTableMetaFromVisibleRows(nextVisibleRows, nextColumns, {
        columnWidths: nextColumnWidths,
        rowColumnWidths: nextRowColumnWidths,
        rowHeights: nextRowHeights,
        horizontalCenter: nextHorizontalCenter,
        verticalCenter: nextVerticalCenter,
        mergedCells: nextMergedCells,
        cellStyles: normalizeTableCellStyles(nextCellStyles, nextVisibleRows.length, nextColumns.length),
      });
      updateBlockMeta(block.id, stored);
    };
    const updateColumn = (index, value) => {
      const nextColumns = columns.map((item, columnIndex) => (columnIndex === index ? value : item));
      persistTableMeta({ columns: nextColumns });
    };
    const updateCell = (rowIndex, columnIndex, value) => {
      const anchor = getMergedCover(rowIndex, columnIndex);
      const targetRowIndex = anchor?.rowIndex ?? rowIndex;
      const targetColumnIndex = anchor?.columnIndex ?? columnIndex;
      const nextRows = normalizedRows.map((row, currentRowIndex) => (
        currentRowIndex === targetRowIndex
          ? row.map((cell, currentColumnIndex) => (currentColumnIndex === targetColumnIndex ? value : cell))
          : row
      ));
      persistTableMeta({ rows: nextRows });
    };
    const mapCellStyles = (mapper) => {
      const nextStyles = {};
      Object.entries(cellStyles).forEach(([key, style]) => {
        const [rowText, columnText] = key.split(':');
        const mapped = mapper(Number(rowText), Number(columnText), style);
        if (!mapped) return;
        const normalized = normalizeTableCellStyle(mapped.style || style);
        if (isEmptyTableCellStyle(normalized)) return;
        nextStyles[buildTableMergeKey(mapped.rowIndex, mapped.columnIndex)] = normalized;
      });
      return nextStyles;
    };
    const shiftCellStylesForInsertedRow = (insertIndex) => mapCellStyles((rowIndex, columnIndex, style) => ({
      rowIndex: rowIndex >= insertIndex ? rowIndex + 1 : rowIndex,
      columnIndex,
      style,
    }));
    const shiftCellStylesForInsertedColumn = (insertIndex) => mapCellStyles((rowIndex, columnIndex, style) => ({
      rowIndex,
      columnIndex: columnIndex >= insertIndex ? columnIndex + 1 : columnIndex,
      style,
    }));
    const shiftCellStylesForDeletedRows = (startRowIndex, endRowIndex) => {
      const deleteCount = endRowIndex - startRowIndex + 1;
      return mapCellStyles((rowIndex, columnIndex, style) => {
        if (rowIndex >= startRowIndex && rowIndex <= endRowIndex) return null;
        return {
          rowIndex: rowIndex > endRowIndex ? rowIndex - deleteCount : rowIndex,
          columnIndex,
          style,
        };
      });
    };
    const shiftCellStylesForDeletedColumns = (startColumnIndex, endColumnIndex) => {
      const deleteCount = endColumnIndex - startColumnIndex + 1;
      return mapCellStyles((rowIndex, columnIndex, style) => {
        if (columnIndex >= startColumnIndex && columnIndex <= endColumnIndex) return null;
        return {
          rowIndex,
          columnIndex: columnIndex > endColumnIndex ? columnIndex - deleteCount : columnIndex,
          style,
        };
      });
    };
    const insertRow = (targetIndex = normalizedRows.length - 1, position = 'after') => {
      const safeIndex = Math.max(0, Math.min(normalizedRows.length - 1, Number(targetIndex) || 0));
      const insertIndex = position === 'before' ? safeIndex : safeIndex + 1;
      const nextRows = [...normalizedRows];
      nextRows.splice(insertIndex, 0, columns.map(() => ''));
      const nextRowColumnWidths = insertDocumentTableRowWidths(columnWidths, rowColumnWidths, {
        insertIndex,
        sourceRowIndex: safeIndex,
        rowCount: normalizedRows.length,
      });
      const nextRowHeights = insertDocumentTableRowHeights(rowHeights, {
        insertIndex,
        sourceRowIndex: safeIndex,
        rowCount: normalizedRows.length,
      });
      const nextMergedCells = normalizeTableMergedCells(mergedCells.map(merge => {
        if (merge.rowIndex >= insertIndex) {
          return { ...merge, rowIndex: merge.rowIndex + 1 };
        }
        if (merge.rowIndex < insertIndex && merge.rowIndex + merge.rowSpan > insertIndex) {
          return { ...merge, rowSpan: merge.rowSpan + 1 };
        }
        return merge;
      }), nextRows.length, columns.length);
      persistTableMeta({
        rows: nextRows,
        rowColumnWidths: nextRowColumnWidths,
        rowHeights: nextRowHeights,
        mergedCells: nextMergedCells,
        cellStyles: shiftCellStylesForInsertedRow(insertIndex),
      });
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
      const nextWidthState = insertDocumentTableColumnWidths(columnWidths, rowColumnWidths, {
        insertIndex,
        sourceColumnIndex: safeIndex,
        rowCount: normalizedRows.length,
      });
      const nextMergedCells = normalizeTableMergedCells(mergedCells.map(merge => {
        if (merge.columnIndex >= insertIndex) {
          return { ...merge, columnIndex: merge.columnIndex + 1 };
        }
        if (merge.columnIndex < insertIndex && merge.columnIndex + merge.colSpan > insertIndex) {
          return { ...merge, colSpan: merge.colSpan + 1 };
        }
        return merge;
      }), nextRows.length, nextColumns.length);
      persistTableMeta({
        columns: nextColumns,
        rows: nextRows,
        columnWidths: nextWidthState.columnWidths,
        rowColumnWidths: nextWidthState.rowColumnWidths,
        mergedCells: nextMergedCells,
        cellStyles: shiftCellStylesForInsertedColumn(insertIndex),
      });
      setSelectedTableCell({ blockId: block.id, type: 'body', rowIndex: Math.max(0, selectedRowIndex), columnIndex: insertIndex });
      setSelectedTableRange(null);
    };
    const clearSelectedCell = () => {
      if (hasSelectedRange) {
        const nextRows = normalizedRows.map((row, rowIndex) => row.map((cell, columnIndex) => {
          const anchor = getMergedCover(rowIndex, columnIndex);
          if (anchor && !anchor.isAnchor) return cell;
          return isCellInSelectedRange(rowIndex, columnIndex) ? '' : cell;
        }));
        persistTableMeta({ rows: nextRows });
        return;
      }
      if (selectedRowIndex < 0) return;
      updateCell(selectedRowIndex, selectedColumnIndex, '');
    };
    const deleteSelectedRow = () => {
      const startRowIndex = hasSelectedRange ? selectedRangeBounds.startRowIndex : selectedRowIndex;
      const endRowIndex = hasSelectedRange ? selectedRangeBounds.endRowIndex : selectedRowIndex;
      if (startRowIndex < 0 || normalizedRows.length <= 1) return;
      const deleteCount = Math.max(1, endRowIndex - startRowIndex + 1);
      if (deleteCount >= normalizedRows.length) return;
      const nextRows = normalizedRows.filter((_, index) => (
        index < startRowIndex || index > endRowIndex
      ));
      const nextRowColumnWidths = deleteDocumentTableRowWidths(columnWidths, rowColumnWidths, {
        startRowIndex,
        endRowIndex,
        rowCount: normalizedRows.length,
      });
      const nextRowHeights = deleteDocumentTableRowHeights(rowHeights, {
        startRowIndex,
        endRowIndex,
        rowCount: normalizedRows.length,
      });
      const nextMergedCells = normalizeTableMergedCells(mergedCells.flatMap(merge => {
        const mergeEnd = merge.rowIndex + merge.rowSpan - 1;
        if (mergeEnd < startRowIndex) return [merge];
        if (merge.rowIndex > endRowIndex) {
          return [{ ...merge, rowIndex: merge.rowIndex - deleteCount }];
        }
        const overlapStart = Math.max(merge.rowIndex, startRowIndex);
        const overlapEnd = Math.min(mergeEnd, endRowIndex);
        const removedRows = overlapEnd - overlapStart + 1;
        const nextRowSpan = merge.rowSpan - removedRows;
        if (nextRowSpan <= 1 && merge.colSpan <= 1) return [];
        if (nextRowSpan <= 0) return [];
        const nextRowIndex = merge.rowIndex >= startRowIndex
          ? startRowIndex
          : merge.rowIndex;
        return [{ ...merge, rowIndex: nextRowIndex, rowSpan: nextRowSpan }];
      }), nextRows.length, columns.length);
      persistTableMeta({
        rows: nextRows,
        rowColumnWidths: nextRowColumnWidths,
        rowHeights: nextRowHeights,
        mergedCells: nextMergedCells,
        cellStyles: shiftCellStylesForDeletedRows(startRowIndex, endRowIndex),
      });
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
      const nextWidthState = deleteDocumentTableColumnWidths(columnWidths, rowColumnWidths, {
        startColumnIndex,
        endColumnIndex,
        rowCount: normalizedRows.length,
      });
      const nextMergedCells = normalizeTableMergedCells(mergedCells.flatMap(merge => {
        const mergeEnd = merge.columnIndex + merge.colSpan - 1;
        if (mergeEnd < startColumnIndex) return [merge];
        if (merge.columnIndex > endColumnIndex) {
          return [{ ...merge, columnIndex: merge.columnIndex - deleteCount }];
        }
        const overlapStart = Math.max(merge.columnIndex, startColumnIndex);
        const overlapEnd = Math.min(mergeEnd, endColumnIndex);
        const removedColumns = overlapEnd - overlapStart + 1;
        const nextColSpan = merge.colSpan - removedColumns;
        if (nextColSpan <= 1 && merge.rowSpan <= 1) return [];
        if (nextColSpan <= 0) return [];
        const nextColumnIndex = merge.columnIndex >= startColumnIndex
          ? startColumnIndex
          : merge.columnIndex;
        return [{ ...merge, columnIndex: nextColumnIndex, colSpan: nextColSpan }];
      }), nextRows.length, nextColumns.length);
      persistTableMeta({
        columns: nextColumns,
        rows: nextRows,
        columnWidths: nextWidthState.columnWidths,
        rowColumnWidths: nextWidthState.rowColumnWidths,
        mergedCells: nextMergedCells,
        cellStyles: shiftCellStylesForDeletedColumns(startColumnIndex, endColumnIndex),
      });
      setSelectedTableCell({
        blockId: block.id,
        type: 'body',
        rowIndex: Math.max(0, selectedRowIndex),
        columnIndex: Math.max(0, Math.min(startColumnIndex, nextColumns.length - 1)),
      });
      setSelectedTableRange(null);
    };
    const mergeSelectedCells = () => {
      if (!canMergeSelectedRange) return;
      const anchorRowIndex = selectedRangeBounds.startRowIndex;
      const anchorColumnIndex = selectedRangeBounds.startColumnIndex;
      const rangeRowSpan = selectedRangeBounds.endRowIndex - selectedRangeBounds.startRowIndex + 1;
      const rangeColSpan = selectedRangeBounds.endColumnIndex - selectedRangeBounds.startColumnIndex + 1;
      const mergedValueParts = [];
      for (let rowIndex = selectedRangeBounds.startRowIndex; rowIndex <= selectedRangeBounds.endRowIndex; rowIndex += 1) {
        for (let columnIndex = selectedRangeBounds.startColumnIndex; columnIndex <= selectedRangeBounds.endColumnIndex; columnIndex += 1) {
          const content = String(normalizedRows[rowIndex]?.[columnIndex] || '').trim();
          if (content) mergedValueParts.push(content);
        }
      }
      const nextRows = normalizedRows.map((row, rowIndex) => row.map((cell, columnIndex) => {
        if (!isCellInSelectedRange(rowIndex, columnIndex)) return cell;
        if (rowIndex === anchorRowIndex && columnIndex === anchorColumnIndex) {
          return mergedValueParts.join('<br/>');
        }
        return '';
      }));
      const nextMergedCells = normalizeTableMergedCells([
        ...mergeSelectionPlan.retainedMergedCells,
        {
          rowIndex: anchorRowIndex,
          columnIndex: anchorColumnIndex,
          rowSpan: rangeRowSpan,
          colSpan: rangeColSpan,
        },
      ], nextRows.length, columns.length);
      persistTableMeta({ rows: nextRows, mergedCells: nextMergedCells });
      setSelectedTableCell({ blockId: block.id, rowIndex: anchorRowIndex, columnIndex: anchorColumnIndex });
      setSelectedTableRange(null);
    };
    const distributeSelectedColumnWidths = () => {
      const averageWidth = Math.max(80, Math.round(tableWidth / columns.length));
      persistTableMeta({ columnWidths: columns.map(() => averageWidth), rowColumnWidths: {} });
    };
    const selectWholeTable = () => {
      clearNativeEditorSelection();
      setSelectedBlockId(block.id);
      setAreaBlockSelection([block.id]);
      setSelectedTableCell(null);
      setSelectedTableRange(null);
      setTableMenuContext(null);
      window.setTimeout(() => {
        document.getElementById(`doc-table-shell-${block.id}`)?.focus?.();
      }, 0);
    };
    const selectTableCell = (rowIndex, columnIndex) => {
      const anchor = getMergedCover(rowIndex, columnIndex);
      const nextRowIndex = anchor?.rowIndex ?? rowIndex;
      const nextColumnIndex = anchor?.columnIndex ?? columnIndex;
      setSelectedBlockId(block.id);
      clearAreaBlockSelection();
      setSelectedTableCell({ blockId: block.id, rowIndex: nextRowIndex, columnIndex: nextColumnIndex });
      setSelectedTableRange(null);
      setTableMenuContext(null);
    };
    const applyCellStyleToBounds = (patch) => {
      if (!activeStyleBounds) return;
      const nextStyles = { ...cellStyles };
      for (let rowIndex = activeStyleBounds.startRowIndex; rowIndex <= activeStyleBounds.endRowIndex; rowIndex += 1) {
        for (let columnIndex = activeStyleBounds.startColumnIndex; columnIndex <= activeStyleBounds.endColumnIndex; columnIndex += 1) {
          const mergedCell = getMergedCover(rowIndex, columnIndex);
          if (mergedCell && !mergedCell.isAnchor) continue;
          const key = buildTableMergeKey(rowIndex, columnIndex);
          const nextStyle = normalizeTableCellStyle({
            ...(nextStyles[key] || {}),
            ...patch,
          });
          if (isEmptyTableCellStyle(nextStyle)) {
            delete nextStyles[key];
          } else {
            nextStyles[key] = nextStyle;
          }
        }
      }
      persistTableMeta({ cellStyles: nextStyles });
    };
    const clearCellStyleFromBounds = () => {
      if (!activeStyleBounds) return;
      const nextStyles = { ...cellStyles };
      for (let rowIndex = activeStyleBounds.startRowIndex; rowIndex <= activeStyleBounds.endRowIndex; rowIndex += 1) {
        for (let columnIndex = activeStyleBounds.startColumnIndex; columnIndex <= activeStyleBounds.endColumnIndex; columnIndex += 1) {
          delete nextStyles[buildTableMergeKey(rowIndex, columnIndex)];
        }
      }
      persistTableMeta({ cellStyles: nextStyles });
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
      const anchor = getMergedCover(rowIndex, columnIndex);
      return {
        rowIndex: anchor?.rowIndex ?? rowIndex,
        columnIndex: anchor?.columnIndex ?? columnIndex,
      };
    };
    const beginTableCellSelection = (event, rowIndex, columnIndex) => {
      if (event.button !== 0) return;
      const scrollContainer = event.currentTarget.closest?.('[data-document-table-scroll-container="true"]') || null;
      setSelectedBlockId(block.id);
      clearAreaBlockSelection();
      setSelectedTableCell({ blockId: block.id, rowIndex, columnIndex });
      setSelectedTableRange(null);
      setTableMenuContext(null);
      const selectionState = {
        blockId: block.id,
        startRowIndex: rowIndex,
        startColumnIndex: columnIndex,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        pointerX: event.clientX,
        pointerY: event.clientY,
        scrollContainer,
        autoScrollFrame: null,
        cleanup: null,
      };
      const applyRange = (targetCell) => {
        const expandedRange = expandDocumentTableSelectionBounds({
          startRowIndex: selectionState.startRowIndex,
          startColumnIndex: selectionState.startColumnIndex,
          endRowIndex: targetCell.rowIndex,
          endColumnIndex: targetCell.columnIndex,
        }, mergedCells, {
          rowCount: normalizedRows.length,
          columnCount: columns.length,
        });
        setSelectedTableCell({
          blockId: block.id,
          type: targetCell.type,
          rowIndex: targetCell.rowIndex,
          columnIndex: targetCell.columnIndex,
        });
        setSelectedTableRange({
          blockId: block.id,
          ...expandedRange,
        });
      };
      const runAutoScroll = () => {
        selectionState.autoScrollFrame = null;
        if (!selectionState.dragging || !selectionState.scrollContainer) return;
        const container = selectionState.scrollContainer;
        const rect = container.getBoundingClientRect();
        const delta = getDocumentTableHorizontalAutoScrollDelta({
          pointerX: selectionState.pointerX,
          viewportLeft: rect.left,
          viewportRight: rect.right,
          scrollLeft: container.scrollLeft,
          scrollWidth: container.scrollWidth,
          clientWidth: container.clientWidth,
        });
        if (!delta) return;
        container.scrollLeft += delta;
        const sampleX = Math.max(rect.left + 2, Math.min(selectionState.pointerX, rect.right - 2));
        const sampleY = Math.max(rect.top + 2, Math.min(selectionState.pointerY, rect.bottom - 2));
        const targetCell = getTableCellFromPoint(sampleX, sampleY);
        if (targetCell) applyRange(targetCell);
        selectionState.autoScrollFrame = window.requestAnimationFrame(runAutoScroll);
      };
      const requestAutoScroll = () => {
        if (selectionState.autoScrollFrame !== null) return;
        selectionState.autoScrollFrame = window.requestAnimationFrame(runAutoScroll);
      };
      const handleMouseMove = moveEvent => {
        selectionState.pointerX = moveEvent.clientX;
        selectionState.pointerY = moveEvent.clientY;
        const targetCell = getTableCellFromPoint(moveEvent.clientX, moveEvent.clientY);
        const movedDistance = Math.hypot(moveEvent.clientX - selectionState.startX, moveEvent.clientY - selectionState.startY);
        if (!selectionState.dragging) {
          if (movedDistance < 6) return;
          selectionState.dragging = true;
        }
        if (targetCell) applyRange(targetCell);
        requestAutoScroll();
        moveEvent.preventDefault();
      };
      const handleMouseUp = () => {
        if (!selectionState.dragging) setSelectedTableRange(null);
        selectionState.cleanup?.();
      };
      selectionState.cleanup = () => {
        if (selectionState.autoScrollFrame !== null) {
          window.cancelAnimationFrame(selectionState.autoScrollFrame);
          selectionState.autoScrollFrame = null;
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (tableCellSelectionRef.current === selectionState) tableCellSelectionRef.current = null;
      };
      if (tableCellSelectionRef.current?.cleanup) tableCellSelectionRef.current.cleanup();
      tableCellSelectionRef.current = selectionState;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };
    const beginColumnResize = (event, rowIndex, columnIndex, colSpan = 1) => {
      event.preventDefault();
      event.stopPropagation();
      setTableMenuContext(null);
      const startX = event.clientX;
      pushEditorUndoSnapshot();
      const handleMouseMove = moveEvent => {
        const nextWidthState = resizeDocumentTableScopedColumnWidths(columnWidths, rowColumnWidths, {
          rowIndex: hasVerticalMergedCells ? 0 : rowIndex,
          rowCount: normalizedRows.length,
          columnIndex,
          colSpan,
          delta: moveEvent.clientX - startX,
        });
        setEditorBlocks(prev => prev.map(item => {
          if (item.id !== block.id) return item;
          const currentMeta = { ...getDefaultBlockMeta(item.type), ...cloneMeta(item.meta) };
          const stored = buildStoredTableMetaFromVisibleRows(normalizedRows, columns, {
            mergedCells,
            columnWidths: nextWidthState.columnWidths,
            rowColumnWidths: nextWidthState.rowColumnWidths,
            horizontalCenter: currentMeta.horizontalCenter,
            verticalCenter: currentMeta.verticalCenter,
            cellStyles: normalizeTableCellStyles(currentMeta.cellStyles || cellStyles, normalizedRows.length, columns.length),
          });
          return {
            ...item,
            meta: {
              ...currentMeta,
              ...stored,
            },
          };
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
    const beginRowResize = (event, rowIndex, rowSpan = 1) => {
      event.preventDefault();
      event.stopPropagation();
      setTableMenuContext(null);
      const resizeRowIndex = Math.min(
        normalizedRows.length - 1,
        rowIndex + Math.max(1, Number(rowSpan) || 1) - 1,
      );
      const rowElement = document.getElementById(`doc-table-shell-${block.id}`)
        ?.querySelector?.(`[data-document-table-row-index="${resizeRowIndex}"]`);
      const startY = event.clientY;
      const startHeight = Math.max(
        42,
        Number(rowElement?.getBoundingClientRect?.().height) || rowHeights[resizeRowIndex] || 42,
      );
      pushEditorUndoSnapshot();
      const handleMouseMove = moveEvent => {
        const nextRowHeights = resizeDocumentTableRowHeight(rowHeights, {
          rowIndex: resizeRowIndex,
          rowCount: normalizedRows.length,
          currentHeight: startHeight,
          delta: moveEvent.clientY - startY,
        });
        setEditorBlocks(prev => prev.map(item => {
          if (item.id !== block.id) return item;
          const currentMeta = { ...getDefaultBlockMeta(item.type), ...cloneMeta(item.meta) };
          const stored = buildStoredTableMetaFromVisibleRows(normalizedRows, columns, {
            mergedCells,
            columnWidths,
            rowColumnWidths,
            rowHeights: nextRowHeights,
            horizontalCenter: currentMeta.horizontalCenter,
            verticalCenter: currentMeta.verticalCenter,
            cellStyles: normalizeTableCellStyles(currentMeta.cellStyles || cellStyles, normalizedRows.length, columns.length),
          });
          return {
            ...item,
            meta: {
              ...currentMeta,
              ...stored,
            },
          };
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
    const beginTableWidthResize = (event, side = 'right') => {
      event.preventDefault();
      event.stopPropagation();
      setTableMenuContext(null);
      const startX = event.clientX;
      const startWidth = tableWidth;
      pushEditorUndoSnapshot();
      const handleMouseMove = moveEvent => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = startWidth + (side === 'left' ? -delta : delta);
        const nextWidthState = resizeDocumentTableOverallWidth(columnWidths, rowColumnWidths, {
          targetWidth: nextWidth,
          rowCount: normalizedRows.length,
        });
        setEditorBlocks(prev => prev.map(item => {
          if (item.id !== block.id) return item;
          const currentMeta = { ...getDefaultBlockMeta(item.type), ...cloneMeta(item.meta) };
          const stored = buildStoredTableMetaFromVisibleRows(normalizedRows, columns, {
            mergedCells,
            columnWidths: nextWidthState.columnWidths,
            rowColumnWidths: nextWidthState.rowColumnWidths,
            horizontalCenter: currentMeta.horizontalCenter,
            verticalCenter: currentMeta.verticalCenter,
            cellStyles: normalizeTableCellStyles(currentMeta.cellStyles || cellStyles, normalizedRows.length, columns.length),
          });
          return {
            ...item,
            meta: {
              ...currentMeta,
              ...stored,
            },
          };
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
    const renderColorSwatch = (color, onClick, title) => (
      <button
        key={`${title}-${color}`}
        type="button"
        aria-label={title}
        title={title}
        onMouseDown={event => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onClick(color);
        }}
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          border: color === '#ffffff' ? '1px solid #d1d5db' : '1px solid rgba(15, 23, 42, 0.14)',
          background: color,
          cursor: 'pointer',
        }}
      />
    );
    const renderTableColorControls = () => (
      <div style={{ padding: '8px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {renderTableMenuIcon('▣')}
          <span style={{ fontSize: 15, color: '#242424' }}>填充颜色</span>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingLeft: 40 }}>
          {tableFillColorOptions.map(color => renderColorSwatch(color, nextColor => applyCellStyleToBounds({ backgroundColor: nextColor }), `填充 ${color}`))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 8px' }}>
          {renderTableMenuIcon('A')}
          <span style={{ fontSize: 15, color: '#242424' }}>文字颜色</span>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingLeft: 40 }}>
          {tableTextColorOptions.map(color => renderColorSwatch(color, nextColor => applyCellStyleToBounds({ color: nextColor }), `文字 ${color}`))}
        </div>
        <Button size="small" type="text" onClick={clearCellStyleFromBounds} style={{ marginTop: 8, marginLeft: 36 }}>
          清除颜色
        </Button>
      </div>
    );
    const tableMenuVisible = shouldShowDocumentTableContextMenu({
      activeStyleBounds,
      blockId: block.id,
      openMenuBlockId: tableMenuContext?.blockId,
    });
    const tableMenu = tableMenuVisible && typeof document !== 'undefined' ? createPortal(
      <div
        data-document-table-menu="true"
        onMouseDown={event => event.preventDefault()}
        style={{
          position: 'fixed',
          left: tableMenuContext.left,
          top: tableMenuContext.top,
          width: tableMenuContext.width,
          background: '#fff',
          border: '1px solid #e4e4e7',
          borderRadius: 6,
          boxShadow: '0 14px 36px rgba(15, 23, 42, 0.18)',
          zIndex: 1050,
          overflowY: 'auto',
          overflowX: 'hidden',
          maxHeight: tableMenuContext.maxHeight,
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{ padding: '8px 10px' }}>
          {renderTableMenuItem({ icon: '▣', label: '合并单元格', disabled: !canMergeSelectedRange, onClick: mergeSelectedCells })}
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
          {renderTableMenuItem({ icon: '|||', label: '均分选中列宽', onClick: distributeSelectedColumnWidths })}
        </div>
        <Divider style={{ margin: 0 }} />
        {renderTableColorControls()}
        <Divider style={{ margin: 0 }} />
        <div style={{ padding: '8px 10px' }}>
          {renderTableMenuItem({ icon: '▭', label: '在上方插入一行', onClick: () => insertRow(menuRowIndex, 'before') })}
          {renderTableMenuItem({ icon: '▭', label: '在下方插入一行', onClick: () => insertRow(menuRowIndex, 'after') })}
          {renderTableMenuItem({ icon: '▯', label: '在左边插入一列', onClick: () => insertColumn(menuColumnIndex, 'before') })}
          {renderTableMenuItem({ icon: '▯', label: '在右边插入一列', onClick: () => insertColumn(menuColumnIndex, 'after') })}
        </div>
        <Divider style={{ margin: 0 }} />
        <div style={{ padding: '8px 10px' }}>
          {renderTableMenuItem({ icon: '◇', label: '清空选中单元格', onClick: clearSelectedCell })}
          {renderTableMenuItem({ icon: '▭×', label: '删除当前行', disabled: normalizedRows.length <= 1, onClick: deleteSelectedRow })}
          {renderTableMenuItem({ icon: '▯×', label: '删除当前列', disabled: columns.length <= 1, onClick: deleteSelectedColumn })}
        </div>
      </div>,
      document.body,
    ) : null;
    const insertParagraphAfterTable = () => {
      setSelectedTableCell(null);
      setSelectedTableRange(null);
      setTableMenuContext(null);
      clearAreaBlockSelection();
      addBlockAfter(block.id, 'paragraph', { content: '' });
    };
    const handleTableShellKeyDown = (event) => {
      if (event.key === 'Escape' && tableMenuContext?.blockId === block.id) {
        event.preventDefault();
        event.stopPropagation();
        setTableMenuContext(null);
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target?.closest?.('[contenteditable="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      insertParagraphAfterTable();
    };
    const handleTableCellKeyDown = (event, rowIndex, columnIndex) => {
      const simpleBackspace = event.key === 'Backspace'
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey;
      if (simpleBackspace && removeContentEditableLineBreakBeforeCaret(event.currentTarget)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      try {
        document.execCommand('insertLineBreak');
      } catch {
        document.execCommand('insertHTML', false, '<br>');
      }
      window.setTimeout(() => {
        updateCell(rowIndex, columnIndex, sanitizeInlineHtml(target.innerHTML));
      }, 0);
    };
    const handleTableMouseDown = (event) => {
      if (wholeTableSelected && !event.target?.closest?.('[contenteditable="true"]')) {
        selectWholeTable();
      }
    };
    const handleTableCellContextMenu = (event, rowIndex, columnIndex) => {
      event.preventDefault();
      event.stopPropagation();
      const anchor = getMergedCover(rowIndex, columnIndex);
      const nextRowIndex = anchor?.rowIndex ?? rowIndex;
      const nextColumnIndex = anchor?.columnIndex ?? columnIndex;
      const keepSelectedRange = isCellInSelectedRange(nextRowIndex, nextColumnIndex);
      const cellRect = event.currentTarget?.getBoundingClientRect?.();
      const menuPosition = resolveDocumentTableContextMenuPosition({
        anchorRect: cellRect ? {
          left: cellRect.left,
          right: cellRect.right,
          top: cellRect.top,
          bottom: cellRect.bottom,
        } : null,
        anchorX: event.clientX,
        anchorY: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setSelectedBlockId(block.id);
      clearAreaBlockSelection();
      if (!keepSelectedRange) {
        setSelectedTableCell({
          blockId: block.id,
          type: 'body',
          rowIndex: nextRowIndex,
          columnIndex: nextColumnIndex,
        });
        setSelectedTableRange(null);
      }
      setInlineToolbar(null);
      setTableMenuContext({ blockId: block.id, ...menuPosition });
    };
    const renderEditableTableRow = (row, rowIndex) => (
      <tr
        key={`row-${rowIndex}`}
        data-document-table-row-index={rowIndex}
        style={rowHeights[rowIndex] ? { height: rowHeights[rowIndex] } : undefined}
      >
        {row.map((cell, columnIndex) => {
          const mergedCell = getMergedCover(rowIndex, columnIndex);
          if (mergedCell && !mergedCell.isAnchor) return null;
          const rowSpan = mergedCell?.rowSpan || 1;
          const colSpan = mergedCell?.colSpan || 1;
          const selectedInRange = isCellInSelectedRange(rowIndex, columnIndex);
          const activeCell = selectedTableCellIsBody && selectedRowIndex === rowIndex && selectedColumnIndex === columnIndex;
          const cellStyle = cellStyles[buildTableMergeKey(rowIndex, columnIndex)] || {};
          const cellBackground = cellStyle.backgroundColor || '#fff';
          return (
            <td
              key={`cell-${rowIndex}-${columnIndex}`}
              data-document-table-cell="true"
              data-table-block-id={block.id}
              data-row-index={rowIndex}
              data-column-index={columnIndex}
              rowSpan={rowSpan}
              colSpan={colSpan}
              onMouseDown={event => beginTableCellSelection(event, rowIndex, columnIndex)}
              onContextMenu={event => handleTableCellContextMenu(event, rowIndex, columnIndex)}
              style={{
                position: 'relative',
                border: '1px solid #e5e7eb',
                padding: 4,
                verticalAlign: verticalCenter ? 'middle' : 'top',
                textAlign: horizontalCenter ? 'center' : 'left',
                background: wholeTableSelected || selectedInRange ? '#fde2e2' : cellBackground,
                color: cellStyle.color || '#111827',
                boxShadow: wholeTableSelected ? 'none' : (activeCell ? 'inset 0 0 0 1px #6366f1' : (selectedInRange ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.55)' : 'none')),
              }}
            >
              <InlineRichTextEditor
                id={`doc-table-cell-input-${block.id}-body-${rowIndex}-${columnIndex}`}
                value={getAnchorCellValue(rowIndex, columnIndex)}
                placeholder=""
                onFocus={() => selectTableCell(rowIndex, columnIndex)}
                onChange={value => updateCell(rowIndex, columnIndex, value)}
                onMouseUp={event => handleTableCellTextSelection(block, { type: 'body', rowIndex, columnIndex }, event)}
                onKeyUp={event => handleTableCellTextSelection(block, { type: 'body', rowIndex, columnIndex }, event)}
                onKeyDown={event => handleTableCellKeyDown(event, rowIndex, columnIndex)}
                onBlur={hideTableInlineToolbarOnBlur}
                style={{
                  minHeight: Math.max(28, rowSpan * 42 - 12),
                  padding: 4,
                  lineHeight: 1.55,
                  fontSize: selectedDoc?.small_font_enabled ? 13 : 14,
                  background: 'transparent',
                  color: cellStyle.color || '#111827',
                  textAlign: horizontalCenter ? 'center' : 'left',
                }}
              />
              <span
                role="presentation"
                aria-label="调整单元格宽度"
                title="拖动调整列宽"
                onMouseDown={event => beginColumnResize(event, rowIndex, columnIndex, colSpan)}
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
              {!isMobile && (
                <span
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="调整行高"
                  title="拖动调整行高"
                  onMouseDown={event => beginRowResize(event, rowIndex, rowSpan)}
                  style={{
                    position: 'absolute',
                    bottom: -4,
                    left: 0,
                    width: '100%',
                    height: 8,
                    cursor: 'row-resize',
                    zIndex: 2,
                  }}
                />
              )}
            </td>
          );
        })}
      </tr>
    );
    return (
      <div style={{ width: '100%' }}>
        <div
          id={`doc-table-shell-${block.id}`}
          data-document-table-shell="true"
          tabIndex={0}
          onKeyDown={handleTableShellKeyDown}
          onMouseDown={event => {
            if (event.button === 0 && !event.target?.closest?.('[data-document-table-menu="true"]')) {
              setTableMenuContext(null);
            }
          }}
          style={{ maxWidth: '100%', position: 'relative', overflow: 'visible', outline: 'none' }}
        >
          {tableMenu}
          <div data-document-table-scroll-container="true" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            {useRowScopedWidths ? (
              <div
                onMouseDown={handleTableMouseDown}
                style={{ width: tableWidth, minWidth: minimumTableWidth, position: 'relative' }}
              >
                {!isMobile && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="调整表格整体宽度"
                    title="拖动调整表格整体宽度"
                    onMouseDown={event => beginTableWidthResize(event, 'left')}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: -5,
                      width: 10,
                      height: '100%',
                      cursor: 'col-resize',
                      zIndex: 4,
                    }}
                  />
                )}
                {normalizedRows.map((row, rowIndex) => {
                  const widths = getRowColumnWidths(rowIndex);
                  return (
                    <table
                      key={`scoped-row-${rowIndex}`}
                      style={{
                        width: getRenderedRowWidth(rowIndex),
                        maxWidth: 'none',
                        borderCollapse: 'collapse',
                        tableLayout: 'fixed',
                        marginTop: rowIndex === 0 ? 0 : -1,
                      }}
                    >
                      <colgroup>
                        {widths.map((width, index) => <col key={`row-${rowIndex}-col-width-${index}`} style={{ width }} />)}
                      </colgroup>
                      <tbody>{renderEditableTableRow(row, rowIndex)}</tbody>
                    </table>
                  );
                })}
                {!isMobile && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="调整表格整体宽度"
                    title="拖动调整表格整体宽度"
                    onMouseDown={event => beginTableWidthResize(event, 'right')}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: -5,
                      width: 10,
                      height: '100%',
                      cursor: 'col-resize',
                      zIndex: 4,
                    }}
                  />
                )}
              </div>
            ) : (
              <div style={{ width: tableWidth, minWidth: minimumTableWidth, position: 'relative' }}>
                {!isMobile && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="调整表格整体宽度"
                    title="拖动调整表格整体宽度"
                    onMouseDown={event => beginTableWidthResize(event, 'left')}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: -5,
                      width: 10,
                      height: '100%',
                      cursor: 'col-resize',
                      zIndex: 4,
                    }}
                  />
                )}
                <table
                  onMouseDown={handleTableMouseDown}
                  style={{ width: tableWidth, maxWidth: 'none', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: minimumTableWidth }}
                >
                  <colgroup>
                    {columnWidths.map((width, index) => <col key={`col-width-${index}`} style={{ width }} />)}
                  </colgroup>
                  <tbody>{normalizedRows.map(renderEditableTableRow)}</tbody>
                </table>
                {!isMobile && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="调整表格整体宽度"
                    title="拖动调整表格整体宽度"
                    onMouseDown={event => beginTableWidthResize(event, 'right')}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: -5,
                      width: 10,
                      height: '100%',
                      cursor: 'col-resize',
                      zIndex: 4,
                    }}
                  />
                )}
              </div>
            )}
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
    const wolaiDocumentReference = block.type === 'external-link'
      && meta.source_system === 'wolai_mcp'
      && meta.reference_type === 'page';
    if (wolaiDocumentReference) {
      const title = meta.title || inlineHtmlToPlain(block.content) || 'Wolai 文档';
      return (
        <a
          href={url || undefined}
          target={url ? '_blank' : undefined}
          rel={url ? 'noreferrer' : undefined}
          onClick={event => event.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '100%',
            color: '#2f3437',
            fontWeight: 600,
            lineHeight: 1.6,
            textDecoration: 'none',
          }}
        >
          <span style={{
            width: 20,
            height: 20,
            minWidth: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #8a8d90',
            borderRadius: 4,
            color: '#666a6d',
            background: '#fff',
          }}>
            <FileTextOutlined style={{ fontSize: 13 }} />
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid #d8dadd' }}>{title}</span>
        </a>
      );
    }
    if (kind === 'image' && isWolaiPageCoverBlock(block)) return null;
    const shouldEmbedImageOnly = meta.embedOnly
      || meta.source_system === 'wolai_mcp'
      || meta.remote === true
      || /wostatic|wolai/i.test(url);
    const imageItems = kind === 'image' ? getImageBlockItems(block) : [];
    if (kind === 'image' && imageItems.length && shouldEmbedImageOnly) {
      if (imageItems.length > 1 || meta.layout === 'grid') {
        const columns = Math.max(2, Math.min(Number(meta.columns) || imageItems.length, 5));
        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : `repeat(${columns}, minmax(0, 1fr))`,
              gap: isMobile ? 12 : 24,
              alignItems: 'start',
              width: '100%',
            }}
          >
            {imageItems.map((item, itemIndex) => (
              <img
                key={`${item.url}-${itemIndex}`}
                src={item.url}
                alt={item.alt || item.filename || '图片'}
                referrerPolicy="no-referrer"
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: isMobile ? 520 : 680,
                  borderRadius: 6,
                  objectFit: 'contain',
                }}
              />
            ))}
          </div>
        );
      }
      const image = imageItems[0];
      return (
        <img
          src={image.url}
          alt={image.alt || image.filename || block.content || '图片'}
          referrerPolicy="no-referrer"
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
    const shouldEmbedVideoOnly = kind === 'video' && url && !isExternalMedia && (
      meta.embedOnly || meta.source_system === 'wolai_mcp' || meta.remote === true
    );
    if (shouldEmbedVideoOnly) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%', alignItems: 'center' }}>
          <video
            src={url}
            controls
            preload="metadata"
            poster={meta.poster_url || meta.cover_url || undefined}
            style={{
              display: 'block',
              width: 'min(100%, 520px)',
              maxHeight: isMobile ? 520 : 680,
              borderRadius: 6,
              background: '#111827',
            }}
          />
          <Space size={8} wrap style={{ width: 'min(100%, 520px)', justifyContent: 'space-between' }}>
            {meta.filename && <Text type="secondary" ellipsis style={{ maxWidth: isMobile ? 220 : 360 }}>{meta.filename}</Text>}
            <Button size="small" href={meta.download_url || url} target="_blank" icon={<DownloadOutlined />}>
              下载视频
            </Button>
          </Space>
        </Space>
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
          <img src={url} alt={meta.filename || block.content || '图片'} referrerPolicy="no-referrer" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 6, border: '1px solid #e5e7eb' }} />
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
          {(normalized.id || url) && (
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
        {(normalized.id || url) && <Button icon={<DownloadOutlined />} onClick={() => downloadDocumentAttachment(normalized)}>下载文件</Button>}
      </Empty>
    );
  };

  const renderAttachmentBlock = (block) => {
    const meta = getBlockMeta(block);
    const attachment = blockMetaToAttachment(meta);
    const attachmentUrl = getAttachmentUrl(attachment);
    const displayName = getAttachmentDisplayName(attachment);
    const uploading = attachmentUploadingBlockIds.includes(block.id) || meta.upload_status === 'uploading';
    const uploadPercent = clampUploadPercent(meta.upload_percent, 0, 100);
    const failed = meta.upload_status === 'failed';
    const hasStoredAttachment = Boolean(attachment.id);
    const hasAttachment = Boolean(hasStoredAttachment || attachmentUrl);
    const canEditAttachment = canEditDoc(selectedDoc);
    const actionVisible = isMobile || selectedBlockId === block.id || hoveredBlockId === block.id;
    const previewKind = getAttachmentPreviewKind(attachment);
    const previewable = hasAttachment && (attachment.preview_status === 'supported' || previewKind !== 'unsupported');
    const detailParts = [
      formatFileSize(attachment.size),
      !hasStoredAttachment && attachmentUrl ? 'Wolai 外部附件' : '',
      attachment.creator_name ? `上传人：${attachment.creator_name}` : '',
      attachment.created_at ? formatDocumentTimestamp(attachment.created_at) : '',
    ].filter(Boolean);
    const shouldInlineAttachmentVideo = hasAttachment && previewKind === 'video' && (
      meta.source_system === 'wolai_mcp' || meta.embedOnly || meta.remote === true
    );

    const menuItems = [
      { key: 'download', icon: <DownloadOutlined />, label: '下载', disabled: !hasAttachment },
      { key: 'preview-modal', icon: <EyeOutlined />, label: '弹窗预览', disabled: !hasAttachment },
      { key: 'preview-side', icon: <MenuUnfoldOutlined />, label: '右侧预览', disabled: !hasAttachment },
      { key: 'copy-link', icon: <LinkOutlined />, label: '复制链接' },
      { key: 'comment', icon: <CommentOutlined />, label: '评论', disabled: !hasAttachment },
      { type: 'divider' },
      { key: 'rename', icon: <EditOutlined />, label: '重命名', disabled: !canEditAttachment },
      { key: 'replace', icon: <UploadOutlined />, label: '替换文件', disabled: !canEditAttachment || !hasStoredAttachment },
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

    const attachmentCard = (
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
            {!hasStoredAttachment && attachmentUrl && <Tag color="cyan" style={{ marginInlineEnd: 0 }}>外部</Tag>}
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

    if (shouldInlineAttachmentVideo) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%', alignItems: 'center' }}>
          <video
            src={attachmentUrl}
            controls
            preload="metadata"
            poster={meta.poster_url || meta.cover_url || undefined}
            style={{
              display: 'block',
              width: 'min(100%, 520px)',
              maxHeight: isMobile ? 520 : 680,
              borderRadius: 6,
              background: '#111827',
            }}
          />
          <div style={{ width: '100%' }}>
            {attachmentCard}
          </div>
        </Space>
      );
    }

    return attachmentCard;
  };

  const renderPresentationAttachmentBlock = (block) => {
    const meta = getBlockMeta(block);
    const attachment = blockMetaToAttachment(meta);
    const attachmentUrl = getAttachmentUrl(attachment);
    const previewKind = getAttachmentPreviewKind(attachment);
    const attachmentCard = (
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
        {(attachment.id || attachmentUrl) && (
          <Button icon={<DownloadOutlined />} onClick={() => downloadDocumentAttachment(attachment)}>
            下载
          </Button>
        )}
      </div>
    );
    if (attachmentUrl && previewKind === 'video' && (meta.source_system === 'wolai_mcp' || meta.embedOnly || meta.remote === true)) {
      return (
        <Space direction="vertical" size={10} style={{ width: '100%', alignItems: 'center' }}>
          <video
            src={attachmentUrl}
            controls
            preload="metadata"
            poster={meta.poster_url || meta.cover_url || undefined}
            style={{ display: 'block', width: 'min(100%, 560px)', maxHeight: isMobile ? 320 : 620, borderRadius: 8, background: '#111827' }}
          />
          {attachmentCard}
        </Space>
      );
    }
    return attachmentCard;
  };

  const renderPresentationTableBlock = (block) => {
    const meta = getBlockMeta(block);
    const columns = Array.isArray(meta.columns) && meta.columns.length ? meta.columns : [];
    const rows = Array.isArray(meta.rows) && meta.rows.length ? meta.rows : [];
    const mergedLookup = buildTableMergedLookup(meta.mergedCells, rows.length, columns.length);
    const rowHeights = normalizeDocumentTableRowHeights(meta.rowHeights, rows.length);
    const columnWidths = columns.map((_, index) => Math.max(80, Number(meta.columnWidths?.[index]) || (isMobile ? 120 : 160)));
    const rowColumnWidths = normalizeDocumentTableRowColumnWidths(
      meta.rowColumnWidths,
      rows.length,
      columns.length,
      columnWidths,
    );
    const useRowScopedWidths = Object.keys(rowColumnWidths).length > 0
      && !mergedLookup.normalized.some(merge => merge.rowSpan > 1);
    const minimumTableWidth = Math.max(columns.length * 80, isMobile ? 240 : 160);
    const getPresentationRowWidths = rowIndex => getDocumentTableRowColumnWidths(
      columnWidths,
      rowColumnWidths,
      rowIndex,
    );
    const getPresentationRowWidth = rowIndex => Math.max(
      getPresentationRowWidths(rowIndex).reduce((sum, width) => sum + width, 0),
      minimumTableWidth,
    );
    const tableWidth = Math.max(
      minimumTableWidth,
      ...rows.map((_, rowIndex) => getPresentationRowWidth(rowIndex)),
    );
    if (!columns.length && !rows.length) {
      return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{block.content}</div>;
    }
    const renderPresentationRow = (row, rowIndex) => (
      <tr key={`row-${rowIndex}`} style={rowHeights[rowIndex] ? { height: rowHeights[rowIndex] } : undefined}>
        {(row || []).map((cell, cellIndex) => {
          const mergedCell = mergedLookup.coveredMap.get(buildTableMergeKey(rowIndex, cellIndex));
          if (mergedCell && !mergedCell.isAnchor) return null;
          return (
            <td
              key={`cell-${rowIndex}-${cellIndex}`}
              rowSpan={mergedCell?.rowSpan || 1}
              colSpan={mergedCell?.colSpan || 1}
              style={{ borderBottom: '1px solid #e5e7eb', padding: '10px 12px', verticalAlign: 'top' }}
            >
              <InlineHtmlView value={cell} />
            </td>
          );
        })}
      </tr>
    );
    return (
      <div style={{ overflowX: 'auto' }}>
        {block.content && <Text strong style={{ display: 'block', marginBottom: 10, fontSize: isMobile ? 18 : 22 }}>{block.content}</Text>}
        {useRowScopedWidths ? (
          <div style={{ width: tableWidth }}>
            {rows.map((row, rowIndex) => {
              const widths = getPresentationRowWidths(rowIndex);
              return (
                <table
                  key={`presentation-scoped-row-${rowIndex}`}
                  style={{
                    width: getPresentationRowWidth(rowIndex),
                    maxWidth: 'none',
                    borderCollapse: 'collapse',
                    tableLayout: 'fixed',
                    fontSize: isMobile ? 16 : 20,
                  }}
                >
                  <colgroup>
                    {widths.map((width, index) => <col key={`presentation-row-${rowIndex}-col-${index}`} style={{ width }} />)}
                  </colgroup>
                  <tbody>{renderPresentationRow(row, rowIndex)}</tbody>
                </table>
              );
            })}
          </div>
        ) : (
          <table style={{ width: tableWidth, maxWidth: 'none', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: isMobile ? 16 : 20 }}>
            {columns.length > 0 && (
              <colgroup>
                {columnWidths.map((width, index) => <col key={`presentation-col-${index}`} style={{ width }} />)}
              </colgroup>
            )}
            <tbody>{rows.map(renderPresentationRow)}</tbody>
          </table>
        )}
      </div>
    );
  };

  const renderPresentationMediaBlock = (block) => {
    const meta = getBlockMeta(block);
    const kind = getMediaKind(block.type);
    const url = meta.url || block.content || '';
    const isExternalMedia = ['netease-music', 'bilibili-video', 'tencent-video', 'external-link'].includes(block.type);
    const label = block.content || meta.filename || blockTypeMap[block.type]?.label || '媒体';
    if (block.type === 'external-link' && meta.source_system === 'wolai_mcp' && meta.reference_type === 'page') {
      const title = meta.title || inlineHtmlToPlain(block.content) || 'Wolai 文档';
      return (
        <a
          href={url || undefined}
          target={url ? '_blank' : undefined}
          rel={url ? 'noreferrer' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#2f3437', fontWeight: 600, textDecoration: 'none' }}
        >
          <span style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #8a8d90', borderRadius: 4 }}>
            <FileTextOutlined style={{ fontSize: 15 }} />
          </span>
          <span style={{ borderBottom: '1px solid #d8dadd' }}>{title}</span>
        </a>
      );
    }
    if (kind === 'image' && isWolaiPageCoverBlock(block)) return null;
    const imageItems = kind === 'image' ? getImageBlockItems(block) : [];
    if (kind === 'image' && imageItems.length) {
      if (imageItems.length > 1 || meta.layout === 'grid') {
        const columns = Math.max(2, Math.min(Number(meta.columns) || imageItems.length, 5));
        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : `repeat(${columns}, minmax(0, 1fr))`,
              gap: isMobile ? 12 : 26,
              alignItems: 'start',
              width: '100%',
            }}
          >
            {imageItems.map((item, itemIndex) => (
              <img
                key={`${item.url}-${itemIndex}`}
                src={item.url}
                alt={item.alt || item.filename || label}
                referrerPolicy="no-referrer"
                style={{ display: 'block', width: '100%', maxHeight: isMobile ? 320 : 620, objectFit: 'contain', borderRadius: 8 }}
              />
            ))}
          </div>
        );
      }
      const image = imageItems[0];
      return (
        <div>
          <img src={image.url} alt={image.alt || label} referrerPolicy="no-referrer" style={{ display: 'block', maxWidth: '100%', maxHeight: isMobile ? 320 : 520, objectFit: 'contain', borderRadius: 8 }} />
          {meta.filename && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{meta.filename}</Text>}
        </div>
      );
    }
    if (kind === 'video' && url && !isExternalMedia) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%', alignItems: 'center' }}>
          <video
            src={url}
            controls
            preload="metadata"
            poster={meta.poster_url || meta.cover_url || undefined}
            style={{ display: 'block', width: 'min(100%, 560px)', maxHeight: isMobile ? 320 : 620, borderRadius: 8, background: '#111827' }}
          />
          {(meta.embedOnly || meta.source_system === 'wolai_mcp') && (
            <Button size="small" href={meta.download_url || url} target="_blank" icon={<DownloadOutlined />}>下载视频</Button>
          )}
        </Space>
      );
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
    const indent = getBlockHierarchyIndent(block);
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
      const presentationIndentWidth = isMobile ? 26 : listIndentWidth;
      const presentationMarkerWidth = isMobile ? 24 : listMarkerBoxWidth;
      const presentationFontSize = isMobile ? 17 : 22;
      const presentationListFontSize = presentationFontSize;
      const presentationLineHeight = presentationListFontSize * listLineHeight;
      const foldListMarkerSolid = isFoldListMarkerSolid(meta);
      const presentationGuideCenterY = presentationLineHeight / 2 + 1;
      const presentationGuideLineOffset = getListGuideLineOffset(block.type, presentationMarkerWidth);
      const marker = block.type === 'bullet'
        ? getBulletListMarker(indent)
        : block.type === 'numbered'
          ? numberedListMarkers.get(block.id)
          : null;
      const markerNode = block.type === 'bullet' ? (
        <span style={{ minWidth: presentationMarkerWidth, height: presentationLineHeight, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderBulletListMarker(indent, isMobile ? 1 : 1.1)}
        </span>
      ) : (
        <span
          style={{
            minWidth: presentationMarkerWidth,
            height: presentationLineHeight,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: block.type === 'numbered' ? 'flex-end' : 'center',
            color: listMarkerColor,
            fontFamily: block.type === 'numbered' ? 'Arial, Helvetica, sans-serif' : undefined,
            fontSize: presentationListFontSize,
            fontWeight: 400,
          }}
        >
          {block.type === 'fold-list'
            ? renderFoldListTriangle(meta.collapsed, isMobile ? 1 : 1, foldListMarkerSolid)
            : marker}
        </span>
      );
      return (
        <div style={{ ...blockStyle, position: 'relative', paddingLeft: indent * presentationIndentWidth, display: 'flex', gap: block.type === 'fold-list' ? 7 : listMarkerTextGap, fontSize: presentationListFontSize, lineHeight: listLineHeight }}>
          {renderListGuides(block, {
            top: -8,
            bottom: -8,
            centerY: presentationGuideCenterY,
            lineOffset: presentationGuideLineOffset,
            indentWidth: presentationIndentWidth,
          })}
          {markerNode}
          <InlineHtmlView value={block.content} style={{ color: '#202124', fontWeight: 400 }} />
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
          {meta.body && <InlineHtmlView as="div" value={meta.body} style={{ ...blockStyle, color: '#475569' }} />}
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
    const importedHierarchyIndent = !isHierarchicalListBlock(block) && hasImportedHierarchyIndent(block) ? indent : 0;
    const presentationIndentWidth = isMobile ? 26 : listIndentWidth;
    const presentationMarkerWidth = isMobile ? 24 : listMarkerBoxWidth;
    return (
      <div
        style={{
          position: 'relative',
          ...(importedHierarchyIndent > 0
            ? { paddingLeft: importedHierarchyIndent * presentationIndentWidth + presentationMarkerWidth + listMarkerTextGap }
            : {}),
        }}
      >
        {importedHierarchyIndent > 0 && renderListGuides(block, {
          top: -8,
          bottom: -8,
          centerY: 18,
          lineOffset: presentationMarkerWidth / 2,
          indentWidth: presentationIndentWidth,
        })}
        <InlineHtmlView as="div" value={block.content} style={blockStyle} />
      </div>
    );
  };

  const renderPresentationMode = () => {
    if (!presentationOpen || !selectedDoc) return null;
    return (
      <div
        id="document-presentation-mode"
        ref={presentationRef}
        role="dialog"
        aria-modal="true"
        onClickCapture={handleDocumentContentLinkClick}
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
                {selectedDocFolderPathTag && (
                  <Tag icon={<FolderOutlined />} title={selectedDocFolderPathTag}>{selectedDocFolderPathTag}</Tag>
                )}
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

  const updateSelectedSpreadsheetWorkbook = (updater) => {
    if (!selectedDoc?.id || !isSpreadsheetDocument(selectedDoc) || !canEditDoc(selectedDoc)) return;
    const currentWorkbook = normalizeSpreadsheetWorkbook(selectedDoc.content);
    const draft = JSON.parse(JSON.stringify(currentWorkbook));
    const nextWorkbook = normalizeSpreadsheetWorkbook(updater(draft) || draft);
    const nextContent = JSON.stringify(nextWorkbook);
    const nextContentText = spreadsheetWorkbookToText(nextWorkbook);
    const nextDoc = {
      ...selectedDoc,
      content: nextContent,
      content_text: nextContentText,
      summary: nextContentText.replace(/\s+/g, ' ').trim().slice(0, 100),
    };
    const docId = getDocTabId(nextDoc.id);
    trackSpreadsheetDocumentDraft({
      dirtyDocumentIds: dirtyDocumentIdsRef.current,
      activeEditorSnapshotRef,
      docId,
      document: {
        ...nextDoc,
        title: editorTitle || nextDoc.title || '未命名文档',
      },
      editorTitle,
      editorBlocks,
      canEdit: canEditDoc(nextDoc),
      selectedSpreadsheetCell,
    });
    setSelectedDoc(nextDoc);
    setDocTabStates(prev => {
      const previousState = getDocTabId(prev[docId]?.doc?.id) === docId ? prev[docId] : {};
      return {
        ...prev,
        [docId]: {
          ...previousState,
          doc: nextDoc,
          selectedSpreadsheetCell,
        },
      };
    });
  };

  const handleSpreadsheetXlsxImport = async (file) => {
    if (!selectedDoc?.id || !isSpreadsheetDocument(selectedDoc) || !canEditDoc(selectedDoc)) return;
    const ext = getFileExt(file?.name);
    if (!['xlsx', 'xlsm'].includes(ext)) {
      message.error('仅支持导入 .xlsx 或 .xlsm 文件');
      return;
    }
    if (Number(file?.size || 0) > documentImportMaxSize) {
      message.error('单个文件不能超过 100MB');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    setSpreadsheetImporting(true);
    try {
      const result = await documentsApi.importSpreadsheet(selectedDoc.id, formData);
      const nextWorkbook = normalizeSpreadsheetWorkbook(result?.workbook);
      const activeSheet = nextWorkbook.sheets.find(sheet => sheet.id === nextWorkbook.activeSheetId) || nextWorkbook.sheets[0];
      setSelectedSpreadsheetCell({ sheetId: activeSheet.id, rowIndex: 0, columnIndex: 0 });
      updateSelectedSpreadsheetWorkbook(() => nextWorkbook);
      message.success(`已导入 ${result?.filename || file.name}，正在自动保存`);
    } catch (error) {
      message.error(error?.response?.data?.error || error?.message || 'Excel 导入失败');
    } finally {
      setSpreadsheetImporting(false);
    }
  };

  const handleSpreadsheetXlsxExport = async () => {
    if (!selectedDoc?.id || !isSpreadsheetDocument(selectedDoc)) return;
    try {
      if (canEditDoc(selectedDoc)) await saveCurrentDocument({ silent: false, force: true });
      const response = await documentsApi.exportSpreadsheet(selectedDoc.id);
      const blob = response?.data instanceof Blob
        ? response.data
        : new Blob([response?.data || ''], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${String(editorTitle || selectedDoc.title || '在线表格').replace(/[\\/:*?"<>|\r\n]+/g, '_')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      message.error(error?.message || 'Excel 导出失败');
    }
  };

  const handleSpreadsheetSelectionChange = nextSelectionState => {
    spreadsheetSelectionRef.current = nextSelectionState;
    if (spreadsheetPresenceDebounceRef.current) {
      window.clearTimeout(spreadsheetPresenceDebounceRef.current);
    }
    const docId = getDocTabId(selectedDoc?.id);
    const sessionId = spreadsheetPresenceSessionIdRef.current;
    if (!docId || !isSpreadsheetDocument(selectedDoc)) return;
    spreadsheetPresenceDebounceRef.current = window.setTimeout(async () => {
      const payload = buildSpreadsheetPresencePayload({
        sessionId,
        selectedCell: selectedSpreadsheetCellRef.current,
        selectionState: spreadsheetSelectionRef.current,
      });
      if (!payload || getDocTabId(selectedDocIdRef.current) !== docId) return;
      try {
        const result = await documentsApi.updateSpreadsheetPresence(docId, payload);
        if (getDocTabId(selectedDocIdRef.current) !== docId) return;
        setSpreadsheetCollaborators(filterRemoteSpreadsheetCollaborators(
          result?.collaborators,
          sessionId,
        ));
      } catch {
        // The 5-second document poll remains the fallback when presence is unavailable.
      }
    }, 150);
  };

  const activeSpreadsheetConflictHint = getSpreadsheetConflictHintForDocument(
    spreadsheetConflictNotice,
    selectedDoc?.id,
  );
  const canEditSelectedSpreadsheet = canEditDoc(selectedDoc);
  const handleSpreadsheetViewportScroll = metrics => {
    setSpreadsheetContextAutoCollapsed(current => (
      resolveSpreadsheetContextAutoCollapsed(current, metrics)
    ));
  };
  const legacySpreadsheetEditor = (
    <LegacySpreadsheetDocumentEditor
      key={`legacy-${selectedDoc?.id || 'spreadsheet'}`}
      workbook={selectedDoc?.content}
      canEdit={canEditSelectedSpreadsheet}
      isMobile={isMobile}
      selectedCell={selectedSpreadsheetCell}
      onSelectedCellChange={setSelectedSpreadsheetCell}
      onSelectionChange={handleSpreadsheetSelectionChange}
      onWorkbookChange={nextWorkbook => updateSelectedSpreadsheetWorkbook(() => nextWorkbook)}
      onImportXlsx={handleSpreadsheetXlsxImport}
      onExportXlsx={handleSpreadsheetXlsxExport}
      importing={spreadsheetImporting}
      collaborationNotice={activeSpreadsheetConflictHint ? '' : remoteUpdateHint}
      collaborators={spreadsheetCollaborators}
      mentionContext={documentMentionContext}
      currentUser={currentUser}
      protectionUsers={selectedDoc?.access_summary?.users || []}
      canManageProtection={canManageSelectedDoc}
      fillAvailableHeight={compactSpreadsheetWorkspace}
      frameless={compactSpreadsheetWorkspace}
      workspaceFocusMode={compactSpreadsheetWorkspace && spreadsheetWorkspaceChrome.menuCollapsed}
      onWorkspaceFocusModeChange={compactSpreadsheetWorkspace ? setSpreadsheetFocusMode : undefined}
      onViewportScroll={compactSpreadsheetWorkspace ? handleSpreadsheetViewportScroll : undefined}
    />
  );
  const univerSpreadsheetEditor = (
    <SpreadsheetEditorFallbackBoundary
      resetKey={`${selectedDoc?.id || 'spreadsheet'}:${enableUniverSpreadsheetPreview ? 'univer' : 'legacy'}`}
      fallback={legacySpreadsheetEditor}
    >
      <React.Suspense fallback={legacySpreadsheetEditor}>
        <UniverSpreadsheetDocumentEditor
          key={`univer-${selectedDoc?.id || 'spreadsheet'}`}
          workbook={selectedDoc?.content}
          canEdit={canEditSelectedSpreadsheet}
          onWorkbookChange={nextWorkbook => updateSelectedSpreadsheetWorkbook(() => nextWorkbook)}
          collaborationNotice={activeSpreadsheetConflictHint ? '' : remoteUpdateHint}
          fillAvailableHeight={compactSpreadsheetWorkspace}
        />
      </React.Suspense>
    </SpreadsheetEditorFallbackBoundary>
  );
  const renderSpreadsheetEditor = () => (
    <div className={`documents-spreadsheet-editor-stack${compactSpreadsheetWorkspace ? ' documents-spreadsheet-editor-stack--fill' : ''}`}>
      {activeSpreadsheetConflictHint ? (
        <Alert
          data-spreadsheet-conflict-notice="true"
          type="warning"
          showIcon
          message={activeSpreadsheetConflictHint}
          style={{ borderRadius: 0, borderWidth: '1px 1px 0' }}
        />
      ) : null}
      {enableUniverSpreadsheetPreview ? univerSpreadsheetEditor : legacySpreadsheetEditor}
    </div>
  );
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
      onMentionTrigger: trigger => handleDocumentMentionTrigger(block, trigger),
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
    if (block.type === 'database-embed') return renderDatabaseTableBlock(block);
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
    const importedHierarchyIndent = !hierarchicalListBlock && hasImportedHierarchyIndent(block)
      ? getBlockHierarchyIndent(block)
      : 0;
    const listBlockSelectionActive = hierarchicalListBlock && blockSelected && !menuOpen;
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
        onDragOver={handleBlockDragOver}
        onDrop={event => handleBlockDrop(event, block)}
        onMouseEnter={() => setHoveredBlockId(block.id)}
        onMouseLeave={() => setHoveredBlockId(prev => (prev === block.id ? null : prev))}
        style={{
          position: 'relative',
          border: listBlockSelectionActive ? '1px solid transparent' : (blockSelected || menuOpen ? `1px solid ${blockActionSelectedBorder}` : '1px solid transparent'),
          background: commentsOpen
            ? '#f8fbff'
            : (listBlockSelectionActive
              ? listBlockSelectedBackground
              : (blockSelected || menuOpen ? blockActionSelectedBackground : (block.highlight || 'transparent'))),
          borderRadius: listBlockSelectionActive ? 0 : 6,
          padding: hierarchicalListBlock ? (isMobile ? '1px 6px' : '1px 8px 1px 0') : (isMobile ? '5px 6px' : '3px 8px 3px 0'),
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
                  draggable={!blankParagraph}
                  onDragStart={event => startBlockDrag(event, block.id)}
                  onDragEnd={finishBlockDrag}
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
          <div
            style={{
              position: 'relative',
              minWidth: 0,
              flex: 1,
              ...(importedHierarchyIndent > 0
                ? { paddingLeft: importedHierarchyIndent * listIndentWidth + listMarkerBoxWidth + listMarkerTextGap }
                : {}),
            }}
          >
            {importedHierarchyIndent > 0 && renderListGuides(block, {
              top: -7,
              bottom: -7,
              centerY: 14,
              lineOffset: listMarkerCenterOffset,
            })}
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

  const startFolderSidebarResize = (event) => {
    if (isMobile || isFolderSidebarCollapsed) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = folderSidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      const nextWidth = clampDocumentFolderSidebarWidth(startWidth + moveEvent.clientX - startX);
      setFolderSidebarWidth(nextWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className={`documents-layout${compactSpreadsheetWorkspace ? ' documents-layout--spreadsheet' : ''}${compactSpreadsheetWorkspace && spreadsheetWorkspaceChrome.contextCollapsed ? ' documents-layout--spreadsheet-context-collapsed' : ''}${compactSpreadsheetWorkspace && spreadsheetFocusMode ? ' documents-layout--spreadsheet-focus-mode' : ''}`} style={{
      display: 'flex',
      gap: embedded || isMobile || isFolderSidebarCollapsed ? 0 : 16,
      height: compactSpreadsheetWorkspace
        ? 'calc(100dvh - 80px)'
        : (embedded ? 'min(780px, calc(100vh - 180px))' : (isMobile ? 'auto' : 'calc(100vh - 120px)')),
      minHeight: compactSpreadsheetWorkspace ? 0 : (embedded ? 620 : (isMobile ? 'calc(100vh - 80px)' : 640)),
      flexDirection: 'row',
      overflow: embedded || !isMobile ? 'hidden' : 'visible',
    }}>
      <MentionPicker
        open={Boolean(mentionState)}
        context={documentMentionContext}
        query={mentionState?.query || ''}
        position={mentionState?.position}
        onSelect={handleDocumentMentionSelect}
        onClose={() => setMentionState(null)}
      />
      {showDocumentLibrary && (
      <aside style={{
        position: 'relative',
        width: isMobile ? '100%' : (isFolderSidebarCollapsed ? 0 : folderSidebarWidth),
        minWidth: isMobile ? '100%' : (isFolderSidebarCollapsed ? 0 : folderSidebarWidth),
        maxWidth: isMobile ? '100%' : (isFolderSidebarCollapsed ? 0 : folderSidebarWidth),
        borderRight: isMobile || isFolderSidebarCollapsed ? 'none' : '1px solid #f0f0f0',
        paddingRight: isMobile ? 0 : (isFolderSidebarCollapsed ? 0 : 16),
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease, padding 0.2s ease',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!isFolderSidebarCollapsed && (
              <Space size={6} style={{ flex: '1 1 220px', minWidth: 0, justifyContent: 'flex-end' }} wrap>
                <Tooltip title="搜索文档">
                  <Button icon={<SearchOutlined />} aria-label="搜索文档" onClick={openGlobalDocumentSearch} />
                </Tooltip>
                <Tooltip title={bulkShareMode ? '退出批量共享' : '批量添加共享人'}>
                  <Button
                    type={bulkShareMode ? 'primary' : 'default'}
                    icon={<UserAddOutlined />}
                    aria-label={bulkShareMode ? '退出批量共享' : '批量添加共享人'}
                    onClick={toggleBulkShareMode}
                  />
                </Tooltip>
                <Tooltip title="刷新">
                  <Button icon={<ReloadOutlined />} onClick={() => { loadFolders(); loadFolderTreeDocuments(); }} />
                </Tooltip>
                <Tooltip title="导入">
                  <Button icon={<DownloadOutlined />} aria-label="导入" onClick={openWolaiImport} />
                </Tooltip>
                {renderCreateDocumentButton('新建')}
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

              {bulkShareMode && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  border: '1px solid #bae6fd',
                  borderRadius: 8,
                  background: '#f0f9ff',
                }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {bulkShareDocumentsLoading ? '正在加载文件夹文档' : `已选 ${bulkSelectedDocIds.length} 篇`}
                  </Text>
                  <Space size={6} wrap>
                    <Button size="small" onClick={selectVisibleBulkDocuments}>
                      全选当前
                    </Button>
                    <Button size="small" type="primary" icon={<UserAddOutlined />} disabled={!bulkSelectedDocIds.length} onClick={openBulkShare}>
                      添加共享人
                    </Button>
                    <Button size="small" disabled={!bulkSelectedDocIds.length} onClick={() => setBulkSelectedDocIds([])}>
                      清空
                    </Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={toggleBulkShareMode}>
                      退出
                    </Button>
                  </Space>
                </div>
              )}

              {canManageDocumentFolders && (
                <Space size={8} wrap>
                  <Button size="small" icon={<FolderOutlined />} onClick={() => setTemplateOpen(true)}>初始化目录</Button>
                </Space>
              )}

              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>目录</Text>
                {folderTree.length ? (
                  <Tree
                    className="document-folder-tree"
                    blockNode
                    showIcon={false}
                    expandedKeys={folderTreeExpandedKeys}
                    selectedKeys={bulkShareMode ? [] : selectedTreeKeys}
                    checkable={bulkShareMode}
                    checkStrictly={bulkShareMode}
                    checkedKeys={bulkShareMode ? bulkTreeCheckState : []}
                    treeData={folderTree}
                    switcherIcon={renderDocumentTreeSwitcher}
                    onExpand={(keys) => setFolderTreeExpandedKeys(keys)}
                    onCheck={handleBulkTreeCheck}
                    onRightClick={openTreeDocContextMenu}
                    onSelect={(keys, info) => {
                      const key = keys[0] || info?.node?.key;
                      if (typeof key === 'string' && key.startsWith('folder-')) {
                        if (bulkShareMode) {
                          setFolderTreeExpandedKeys(prev => (prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]));
                          return;
                        }
                        const folderId = normalizeDocumentFolderSelectValue(key.replace('folder-', ''));
                        if (folderId) setSelectedFolderId(folderId);
                        if (isMobile) setMobileLibraryVisible(true);
                        setFolderTreeExpandedKeys(prev => (prev.includes(key) ? prev : [...prev, key]));
                      } else if (typeof key === 'string' && key.startsWith('document-')) {
                        const documentId = Number(key.replace('document-', ''));
                        if (bulkShareMode) {
                          const doc = info?.node?.document || getDocumentSummaryById(documentId);
                          toggleBulkDocumentSelection(doc || { id: documentId }, !bulkSelectedDocIdSet.has(documentId));
                          return;
                        }
                        const folderId = normalizeDocumentFolderSelectValue(info?.node?.folderId);
                        if (folderId) {
                          const folderKey = `folder-${folderId}`;
                          setSelectedFolderId(folderId);
                          setFolderTreeExpandedKeys(prev => (prev.includes(folderKey) ? prev : [...prev, folderKey]));
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
                <Text type="secondary" style={{ fontSize: 12 }}>收藏文档</Text>
                <Spin spinning={loading}>
                  <List
                    dataSource={documents}
                    renderItem={renderDocItem}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无收藏文档" /> }}
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
                      {
                        key: 'import',
                        icon: <DownloadOutlined />,
                        label: '导入',
                        disabled: !canEditDoc(docContextMenu.doc),
                      },
                      {
                        key: 'pin',
                        icon: docContextMenu.doc?.pinned_at
                          ? <PushpinFilled style={{ color: '#f59e0b' }} />
                          : <PushpinOutlined />,
                        label: docContextMenu.doc?.pinned_at ? '取消置顶' : '置顶',
                        disabled: !Number(docContextMenu.doc?.can_pin),
                      },
                      {
                        key: 'move',
                        icon: <FolderOpenOutlined />,
                        label: '移动到',
                        disabled: !canMoveDoc(docContextMenu.doc),
                      },
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
                <Dropdown
                  open={folderContextMenu.open}
                  trigger={[]}
                  overlayClassName="document-folder-context-menu-dropdown"
                  onOpenChange={(open) => {
                    if (!open) closeFolderContextMenu();
                  }}
                  menu={{
                    onClick: ({ key }) => {
                      const folder = folderContextMenu.folder;
                      closeFolderContextMenu();
                      if (key === 'create-child') openCreateChildFolder(folder);
                      if (key === 'rename') openRenameFolder(folder);
                      if (key === 'delete') openDeleteFolder(folder);
                    },
                    items: [
                      {
                        key: 'create-child',
                        icon: <PlusOutlined />,
                        label: '新增子文件夹',
                        disabled: !Number(folderContextMenu.folder?.can_add_child || 0),
                      },
                      {
                        key: 'rename',
                        icon: <EditOutlined />,
                        label: '重命名',
                        disabled: !Number(folderContextMenu.folder?.can_edit_folder || 0),
                      },
                      {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        label: '删除',
                        danger: true,
                        disabled: !Number(folderContextMenu.folder?.can_delete_folder || 0),
                      },
                    ],
                  }}
                >
                  <span style={{
                    position: 'fixed',
                    pointerEvents: 'none',
                    left: folderContextMenu.x,
                    top: folderContextMenu.y,
                    width: 1,
                    height: 1,
                  }} />
                </Dropdown>
              </div>
            </Space>
            </div>
          )}
          {!isMobile && !isFolderSidebarCollapsed && (
            <div
              className="document-sidebar-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整文档列表宽度"
              title="拖动调整文档列表宽度"
              onMouseDown={startFolderSidebarResize}
              style={{
                position: 'absolute',
                top: 0,
                right: -5,
                width: 10,
                height: '100%',
                cursor: 'col-resize',
                zIndex: 5,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <span
                className="document-sidebar-resize-line"
                aria-hidden="true"
                style={{
                  display: 'block',
                  width: 2,
                  height: '100%',
                  background: '#f1f5f9',
                  transition: 'background 0.15s ease',
                }}
              />
            </div>
          )}
      </aside>
      )}

      {showDocumentEditor && (
      <main
        className="documents-editor-main"
        style={{
          flex: 1,
          minWidth: 0,
          width: '100%',
          overflow: compactSpreadsheetWorkspace ? 'hidden' : (isMobile ? 'visible' : 'auto'),
          display: compactSpreadsheetWorkspace ? 'flex' : undefined,
          flexDirection: compactSpreadsheetWorkspace ? 'column' : undefined,
        }}
      >
        {!isMobile && !embedded && (
          <div
            className="documents-editor-tabs"
            aria-hidden={compactSpreadsheetWorkspace && spreadsheetWorkspaceChrome.contextCollapsed}
            style={{
              display: 'flex',
              alignItems: compactSpreadsheetWorkspace ? 'center' : 'flex-start',
              gap: 4,
              minHeight: compactSpreadsheetWorkspace ? 38 : 42,
              marginBottom: compactSpreadsheetWorkspace ? 0 : 10,
              padding: compactSpreadsheetWorkspace ? '1px 8px 0' : 0,
              borderBottom: '1px solid #edf0f5',
            }}
          >
            <SidebarToggleButton
              collapsed={isFolderSidebarCollapsed}
              onToggle={() => setFolderSidebarCollapsed(prev => !prev)}
              expandLabel="展开文档目录"
              collapseLabel="收起文档目录"
              tooltipPlacement="right"
              style={{ marginTop: 1 }}
            />
            {renderDocTabs()}
          </div>
        )}
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
                    <Button icon={<DownloadOutlined />} onClick={openWolaiImport}>导入</Button>
                    {renderCreateDocumentButton('新建文档')}
                  </Space>
                )}
              </Empty>
            )}
          </div>
        ) : (
          <Spin wrapperClassName="documents-detail-spin" spinning={detailLoading}>
            <div className="documents-editor-shell" style={{
              maxWidth: compactSpreadsheetWorkspace ? 'none' : (isMobile ? '100%' : getEditorShellMaxWidth(selectedDoc, tocOpen)),
              margin: compactSpreadsheetWorkspace || isMobile || isFolderSidebarCollapsed ? '0' : '0 auto',
              padding: compactSpreadsheetWorkspace ? 0 : (isMobile ? '0 0 24px' : '4px 12px'),
              height: compactSpreadsheetWorkspace ? '100%' : undefined,
              minHeight: compactSpreadsheetWorkspace ? 0 : undefined,
              display: compactSpreadsheetWorkspace ? 'flex' : undefined,
              flexDirection: compactSpreadsheetWorkspace ? 'column' : undefined,
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
                    {!embedded && <Button type="text" icon={<LeftOutlined />} onClick={backToMobileLibrary} aria-label="返回文档列表" style={{ flex: '0 0 auto' }} />}
                    <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                      {editorTitle || selectedDoc.title || '未命名文档'}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 8, paddingBottom: 2 }}>
                    {!isSpreadsheetDocument(selectedDoc) && (
                      <Button
                        size="small"
                        icon={<MenuOutlined />}
                        onClick={toggleTocPanel}
                      >
                        目录
                      </Button>
                    )}
                    <Dropdown
                      trigger={['click']}
                      open={pageMenuOpen}
                      onOpenChange={setPageMenuOpen}
                      dropdownRender={renderPageMenu}
                    >
                      <Button size="small" icon={<MoreOutlined />}>页面</Button>
                    </Dropdown>
                    {!isSpreadsheetDocument(selectedDoc) && <Button size="small" icon={<FundProjectionScreenOutlined />} onClick={openPresentationMode}>演示</Button>}
                    <Button size="small" icon={<UserAddOutlined />} onClick={openShare}>分享</Button>
                    <Button size="small" icon={<HistoryOutlined />} loading={changeLogRefreshing} onClick={openChangeLogs}>历史</Button>
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

              {compactSpreadsheetWorkspace && (
                <header
                  className="documents-spreadsheet-header"
                  data-spreadsheet-document-header="true"
                  aria-hidden={spreadsheetWorkspaceChrome.contextCollapsed}
                >
                  <div className="documents-spreadsheet-header-main">
                    <TableOutlined className="documents-spreadsheet-header-icon" aria-hidden="true" />
                    <Tooltip title={editorTitle || selectedDoc.title || '未命名表格'}>
                      <Input
                        className="documents-spreadsheet-title-input"
                        aria-label="表格标题"
                        value={editorTitle}
                        onChange={event => {
                          pushEditorUndoSnapshot();
                          setEditorTitle(event.target.value);
                        }}
                        onKeyDown={event => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        placeholder="未命名表格"
                      />
                    </Tooltip>
                    <Text className="documents-spreadsheet-save-state" type="secondary">
                      {autoSaving || saving ? '自动保存中' : (canEditDoc(selectedDoc) ? '表格将自动保存' : '只读')}
                    </Text>
                    {selectedDocFolderPathTag && (
                      <Tooltip title={selectedDocFolderPathTag}>
                        <span className="documents-spreadsheet-folder-path">
                          <FolderOutlined aria-hidden="true" />
                          <span>{selectedDocFolderPathTag}</span>
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <Space className="documents-spreadsheet-header-actions" size={2}>
                    <Tooltip title="页面">
                      <Dropdown
                        trigger={['click']}
                        open={pageMenuOpen}
                        onOpenChange={setPageMenuOpen}
                        dropdownRender={renderPageMenu}
                      >
                        <Button type="text" icon={<MoreOutlined />} aria-label="页面" />
                      </Dropdown>
                    </Tooltip>
                    <Tooltip title={`添加分享人 · ${selectedDoc.access_summary?.label || '仅自己'}`}>
                      <Button type="text" icon={<UserAddOutlined />} onClick={openShare} aria-label={`添加分享人 · ${selectedDoc.access_summary?.label || '仅自己'}`} />
                    </Tooltip>
                    <Tooltip title="改动历史">
                      <Button type="text" icon={<HistoryOutlined />} loading={changeLogRefreshing} onClick={openChangeLogs} aria-label="改动历史" />
                    </Tooltip>
                    <Tooltip title={selectedDoc.is_favorite ? '取消收藏' : '收藏'}>
                      <Button
                        type="text"
                        icon={selectedDoc.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
                        onClick={() => toggleFavorite(selectedDoc)}
                        aria-label={selectedDoc.is_favorite ? '取消收藏' : '收藏'}
                      />
                    </Tooltip>
                  </Space>
                </header>
              )}

              {!isMobile && !compactSpreadsheetWorkspace && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <Space direction="vertical" size={4} style={{ minWidth: 0, flex: 1 }}>
                  <Space size={[8, 8]} wrap>
                    {isSpreadsheetDocument(selectedDoc) && <Tag icon={<TableOutlined />} color="green">在线表格</Tag>}
                    <Tag color="geekblue">{selectedDoc.document_no}</Tag>
                    <Tag>{selectedDoc.current_version || 'V1.0'}</Tag>
                    <Tag color="cyan">{selectedDoc.access_summary?.label || '仅自己'}</Tag>
                    {selectedDocDomainTag && <Tag>{selectedDocDomainTag}</Tag>}
                    {selectedDocProjectGroupTag && selectedDocProjectGroupTag !== selectedDocDomainTag && <Tag>{selectedDocProjectGroupTag}</Tag>}
                    {selectedDocDepartmentTag && <Tag>{selectedDocDepartmentTag}</Tag>}
                    {selectedDocTypeTag && <Tag>{selectedDocTypeTag}</Tag>}
                    {selectedDocFolderPathTag && (
                      <Tag icon={<FolderOutlined />} title={selectedDocFolderPathTag}>{selectedDocFolderPathTag}</Tag>
                    )}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    创建人：{selectedDoc.created_by_name || '-'} · 最后编辑：{selectedDoc.updated_by_name || selectedDoc.created_by_name || '-'} · {formatDocumentTimestamp(selectedDoc.updated_at)}
                    {autoSaving && ' · 自动保存中'}
                  </Text>
                </Space>
                <Space wrap size={6}>
                  {!isSpreadsheetDocument(selectedDoc) && (
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
                  )}
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
                  {!isSpreadsheetDocument(selectedDoc) && (
                    <Tooltip title="演示模式">
                      <Button icon={<FundProjectionScreenOutlined />} onClick={openPresentationMode} aria-label="演示模式" />
                    </Tooltip>
                  )}
                  <Tooltip title={`添加分享人 · ${selectedDoc.access_summary?.label || '仅自己'}`}>
                    <Button icon={<UserAddOutlined />} onClick={openShare} aria-label={`添加分享人 · ${selectedDoc.access_summary?.label || '仅自己'}`} />
                  </Tooltip>
                  <Tooltip title="改动历史">
                    <Button icon={<HistoryOutlined />} loading={changeLogRefreshing} onClick={openChangeLogs} aria-label="改动历史" />
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

              {!compactSpreadsheetWorkspace && (embedded || String(selectedDoc.doc_type || '').toUpperCase() === 'MEDIA' ? (
                <Title level={2} style={{ margin: isMobile ? '4px 0 12px' : '8px 0 16px' }}>
                  {editorTitle || selectedDoc.title || '未命名文档'}
                </Title>
              ) : (
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
              ))}

              {isSpreadsheetDocument(selectedDoc) ? (
                renderSpreadsheetEditor()
              ) : (
                <>
                  <div style={{
                    display: 'flex',
                    gap: isMobile ? 16 : 32,
                    alignItems: 'flex-start',
                    flexDirection: isMobile ? 'column' : 'row',
                  }}>
                    <section
                      id="document-editor-blocks"
                      tabIndex={0}
                      aria-label="文档正文编辑区"
                      onClickCapture={handleDocumentContentLinkClick}
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
                      outline: 'none',
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
                </>
              )}
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

      <Modal
        title="批量添加共享人"
        open={bulkShareOpen}
        onCancel={() => setBulkShareOpen(false)}
        onOk={saveBulkShares}
        okText="追加共享"
        cancelText="取消"
        confirmLoading={bulkShareSaving}
        destroyOnClose
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        {renderShareSelector({
          mode: 'bulk',
          draft: bulkShareDraft,
          setDraft: setBulkShareDraft,
          loading: bulkShareLoading,
        })}
      </Modal>

      {renderGlobalDocumentSearchModal()}

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
        title="新增子文件夹"
        open={folderCreateOpen}
        onCancel={() => {
          setFolderCreateOpen(false);
          setFolderCreateParent(null);
        }}
        onOk={handleCreateChildFolder}
        okText="创建"
        cancelText="取消"
        confirmLoading={folderCreateSaving}
        destroyOnClose
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Form form={folderCreateForm} layout="vertical">
          <Form.Item label="父级目录">
            <Input value={folderCreateParent ? getFolderPathLabel(folderCreateParent, folderPathMap) : ''} disabled />
          </Form.Item>
          <Form.Item
            name="name"
            label="文件夹名称"
            rules={[
              { required: true, whitespace: true, message: '请输入文件夹名称' },
              { max: 40, message: '文件夹名称不能超过 40 个字符' },
            ]}
          >
            <Input placeholder="例如 SOP" maxLength={40} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            仅支持在二级目录及其下级目录新增，最多 10 级。
          </Text>
        </Form>
      </Modal>

      <Modal
        title="重命名文件夹"
        open={folderRenameOpen}
        onCancel={() => {
          setFolderRenameOpen(false);
          setFolderRenameTarget(null);
        }}
        onOk={handleRenameFolder}
        okText="保存"
        cancelText="取消"
        confirmLoading={folderRenameSaving}
        destroyOnClose
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Form form={folderRenameForm} layout="vertical">
          <Form.Item label="当前路径">
            <Input value={folderRenameTarget ? getFolderPathLabel(folderRenameTarget, folderPathMap) : ''} disabled />
          </Form.Item>
          <Form.Item
            name="name"
            label="文件夹名称"
            rules={[
              { required: true, whitespace: true, message: '请输入文件夹名称' },
              { max: 40, message: '文件夹名称不能超过 40 个字符' },
            ]}
          >
            <Input placeholder="请输入文件夹名称" maxLength={40} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="删除文件夹"
        open={folderDeleteOpen}
        onCancel={() => {
          setFolderDeleteOpen(false);
          setFolderDeleteTarget(null);
        }}
        onOk={handleDeleteFolder}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={folderDeleteSaving}
        destroyOnClose
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text>
            确认删除「{folderDeleteTarget?.name || '该文件夹'}」吗？
          </Text>
          <Text type="secondary">
            当前路径：{folderDeleteTarget ? getFolderPathLabel(folderDeleteTarget, folderPathMap) : '-'}
          </Text>
          <Text type="danger">
            删除后，该文件夹下的文档和子文件夹会自动移动到上一级文件夹。此操作不可恢复。
          </Text>
        </Space>
      </Modal>

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
              label: getFolderPathLabel(folder, folderPathMap),
              disabled: Number(folder.id) === Number((moveFolderDoc || selectedDoc)?.folder_id),
            }))}
            style={{ width: '100%' }}
            notFoundContent="暂无可移动的文件夹"
          />
        </Space>
      </Modal>

      <Modal
        title="导入"
        open={wolaiImportOpen}
        onCancel={() => {
          setWolaiImportOpen(false);
          setWolaiImportTargetDoc(null);
          setDocumentImportFileList([]);
        }}
        onOk={handleWolaiImport}
        okText={isWolaiImportUpdateMode ? '导入并更新' : '导入并新建'}
        cancelText="取消"
        confirmLoading={wolaiImportSaving}
        destroyOnClose
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Form
          form={wolaiImportForm}
          layout="vertical"
          onValuesChange={(changedValues, allValues) => (
            handleDocumentLocationValuesChange(wolaiImportForm, changedValues, allValues)
          )}
        >
          <Form.Item
            name="import_mode"
            label="导入方式"
            rules={[{ required: true, message: '请选择导入方式' }]}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={(event) => {
                if (event.target.value === 'file') {
                  wolaiImportForm.setFields([{ name: 'url', errors: [] }]);
                }
                if (event.target.value === 'url') {
                  wolaiImportForm.setFields([{ name: 'mcp_target', errors: [] }]);
                }
                if (event.target.value === 'wolai_mcp') {
                  wolaiImportForm.setFields([{ name: 'url', errors: [] }]);
                }
              }}
            >
              <Radio.Button value="url">URL</Radio.Button>
              <Radio.Button value="wolai_mcp">Wolai MCP</Radio.Button>
              <Radio.Button value="file">本地文件</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.import_mode !== next.import_mode}>
            {({ getFieldValue }) => {
              const importMode = getFieldValue('import_mode') || 'url';
              if (importMode === 'file') {
                return (
                  <Form.Item label="本地文件" required>
                    <Upload.Dragger
                      accept={documentImportAccept}
                      beforeUpload={validateDocumentImportFile}
                      fileList={documentImportFileList}
                      maxCount={1}
                      onChange={({ fileList }) => setDocumentImportFileList(fileList.slice(-1))}
                      onRemove={() => {
                        setDocumentImportFileList([]);
                        return true;
                      }}
                    >
                      <Space direction="vertical" size={6}>
                        <UploadOutlined style={{ color: '#64748b', fontSize: 20 }} />
                        <Text>拖入或选择文件</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          支持 Word、PDF、PPT、Excel、XMind、TXT 等常见文档内容导入，单个文件不超过 100MB
                        </Text>
                      </Space>
                    </Upload.Dragger>
                  </Form.Item>
                );
              }
              if (importMode === 'wolai_mcp') {
                return (
                  <>
                    <Form.Item
                      name="mcp_target"
                      label="Wolai 页面 URL / 页面 ID"
                      rules={[{ required: true, message: '请填写 Wolai 页面 URL 或页面 ID' }]}
                    >
                      <Input placeholder="https://www.wolai.com/... 或页面 ID" />
                    </Form.Item>
                    <Form.Item name="mcp_token" label="MCP Token">
                      <Input.Password placeholder="Bearer Token，可留空使用服务器 WOLAI_MCP_TOKEN" autoComplete="off" />
                    </Form.Item>
                    <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 16, fontSize: 12 }}>
                      Token 仅用于本次导入请求，不会保存到文档；服务器已配置 WOLAI_MCP_TOKEN 时可留空。
                    </Text>
                  </>
                );
              }
              return (
                <Form.Item
                  name="url"
                  label="URL"
                  rules={[
                    { required: true, message: '请填写 URL' },
                    { type: 'url', message: '请输入完整 URL，例如 https://...' },
                  ]}
                >
                  <Input placeholder="https://..." />
                </Form.Item>
              );
            }}
          </Form.Item>
          {!isWolaiImportUpdateMode && (
            <>
              <Form.Item name="title" label="标题">
                <Input placeholder="留空则自动读取页面标题或文件名" />
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
              {renderDocumentLocationFolderField()}
              <Form.Item name="doc_type" label="文档类型">
                <Select options={docTypeOptions} />
              </Form.Item>
            </>
          )}
          <Text type="secondary">
            {isWolaiImportUpdateMode
              ? 'URL 导入会采集页面正文；Wolai MCP 会通过授权 Token 读取页面内容；本地文件会解析正文并转换为文档内容。导入成功后将覆盖当前文档内容。'
              : 'URL 导入会采集页面正文；Wolai MCP 会通过授权 Token 读取页面内容；本地文件会解析正文并转换为文档内容。导入成功后将创建新文档。'}
          </Text>
        </Form>
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
        <Form
          form={createForm}
          layout="vertical"
          onValuesChange={(changedValues, allValues) => (
            handleDocumentLocationValuesChange(createForm, changedValues, allValues)
          )}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入文档标题" />
          </Form.Item>
          <Form.Item name="document_kind" label="文件形态" initialValue="rich_text">
            {editingPropertyDoc ? (
              <Tag icon={isSpreadsheetDocument(editingPropertyDoc) ? <TableOutlined /> : <FileTextOutlined />}>
                {documentKindLabel[getDocumentKind(editingPropertyDoc.document_kind)]}
              </Tag>
            ) : (
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={event => {
                  if (event.target.value === 'spreadsheet' && createForm.getFieldValue('title') === '新页面') {
                    createForm.setFieldValue('title', '未命名表格');
                  }
                }}
              >
                {documentKindOptions.map(option => (
                  <Radio.Button key={option.value} value={option.value}>
                    <Space size={6}>
                      {option.value === 'spreadsheet' ? <TableOutlined /> : <FileTextOutlined />}
                      <span>{option.label}</span>
                    </Space>
                  </Radio.Button>
                ))}
              </Radio.Group>
            )}
          </Form.Item>
          <Form.Item name="icon_key" label="文档图标">
            <Select
              allowClear
              placeholder="默认文档图标"
              options={[
                {
                  value: defaultDocumentIconFormValue,
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <FileTextOutlined />
                      <span>默认文档图标</span>
                    </span>
                  ),
                },
                ...documentIconOptions.map(option => ({
                  value: option.value,
                  label: `${option.symbol} ${option.label}`,
                })),
              ]}
            />
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
          {renderDocumentLocationFolderField()}
          <Form.Item name="doc_type" label="文档类型">
            <Select options={docTypeOptions} />
          </Form.Item>
          {!editingPropertyDoc && (
            <Form.Item name="default_share_user_ids" label="默认共享人">
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="选择默认共享人"
                options={defaultDocumentCxoUsers.map(item => ({
                  value: Number(item.id),
                  label: item.display_name || item.username,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="初始化目录结构"
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
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text>
            将确保国内项目下包含产运、商务、研发、投放，海外项目下包含商务、投放，
            人力行政下包含人力、行政。
          </Text>
          <Text type="secondary">
            每个一级目录会自动包含规划、落地、沉淀、团队四个二级目录；系统目录名称固定，
            四类目录及其后代可继续新建自定义子文件夹。已有项目文档会按目录规则归到新的阶段目录中。
          </Text>
        </Space>
      </Modal>
    </div>
  );
}
