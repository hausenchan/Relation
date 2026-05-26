import React, { useEffect, useMemo, useState } from 'react';
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
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  ShareAltOutlined,
  StarFilled,
  StarOutlined,
  TeamOutlined,
  UpOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { documentsApi, projectGroupsApi, teamsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';

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

const blockTypeOptions = [
  { value: 'paragraph', label: '文本' },
  { value: 'todo', label: '待办列表' },
  { value: 'heading1', label: '主标题' },
  { value: 'heading2', label: '大标题' },
  { value: 'heading3', label: '中标题' },
  { value: 'heading4', label: '小标题' },
  { value: 'page', label: '页面' },
  { value: 'bullet', label: '列表' },
  { value: 'numbered', label: '数字列表' },
  { value: 'quote', label: '引用' },
  { value: 'code', label: '代码块' },
  { value: 'divider', label: '分割线' },
];

const highlightOptions = [
  { value: '', label: '无色', color: '#ffffff', border: '#d9d9d9' },
  { value: '#fff7cc', label: '黄色', color: '#fff7cc' },
  { value: '#dcfce7', label: '绿色', color: '#dcfce7' },
  { value: '#dbeafe', label: '蓝色', color: '#dbeafe' },
  { value: '#f3e8ff', label: '紫色', color: '#f3e8ff' },
  { value: '#fee2e2', label: '红色', color: '#fee2e2' },
];

const domainLabel = Object.fromEntries(domainOptions.map(item => [item.value, item.label]));
const departmentLabel = Object.fromEntries(departmentOptions.map(item => [item.value, item.label]));
const orgDepartmentLabel = Object.fromEntries(orgDepartmentOptions.map(item => [item.value, item.label]));
const docTypeLabel = Object.fromEntries(docTypeOptions.map(item => [item.value, item.label]));
const validBlockTypes = new Set(blockTypeOptions.map(item => item.value));
const documentAdminRoles = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);

function createBlock(type = 'paragraph', content = '', extra = {}) {
  return {
    id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    ...extra,
  };
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

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') return createBlock();
  const type = validBlockTypes.has(block.type) ? block.type : 'paragraph';
  return {
    id: block.id || createBlock().id,
    type,
    content: type === 'divider' ? '' : String(block.content ?? block.text ?? block.title ?? ''),
    highlight: block.highlight || '',
    checked: Boolean(block.checked),
  };
}

function isBlankBlock(block) {
  if (!block) return true;
  if (block.type === 'divider') return false;
  return !String(block.content || '').trim();
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
    })),
  };
}

function blocksToText(blocks) {
  return blocks
    .map(block => {
      if (block.type === 'divider') return '';
      if (block.type === 'todo') return `${block.checked ? '[x]' : '[ ]'} ${block.content || ''}`.trim();
      return block.content || '';
    })
    .filter(Boolean)
    .join('\n');
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
    const title = String(block.content || '').trim();
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
  if (!doc) return 860;
  if (doc.width_mode === 'full') return '100%';
  if (doc.width_mode === 'wide') return 1120;
  if (doc.width_mode === 'custom') return Number(doc.custom_width) || 960;
  return 860;
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
  default: '管理员/高管默认可访问',
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

function isDocumentAdminUser(user) {
  return documentAdminRoles.has(user?.role) || documentAdminRoles.has(user?.executive_role);
}

function formatChangeLogTime(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value).slice(0, 16);
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

export default function Documents() {
  const { user: currentUser } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [folders, setFolders] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [folderTreeDocuments, setFolderTreeDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBlocks, setEditorBlocks] = useState([createBlock()]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [openBlockMenuId, setOpenBlockMenuId] = useState(null);
  const [domainFilter, setDomainFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [sopOnly, setSopOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optionsSaving, setOptionsSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareDraft, setShareDraft] = useState(emptyShareDraft());
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [changeLogSaving, setChangeLogSaving] = useState(false);
  const [changeLogFormOpen, setChangeLogFormOpen] = useState(false);
  const [editingChangeLog, setEditingChangeLog] = useState(null);
  const [expandedChangeLogIds, setExpandedChangeLogIds] = useState([]);
  const [changeLogNotifyEnabled, setChangeLogNotifyEnabled] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [folderSidebarCollapsed, setFolderSidebarCollapsed] = useState(false);
  const [folderTreeExpandedKeys, setFolderTreeExpandedKeys] = useState([]);
  const [createForm] = Form.useForm();
  const [templateForm] = Form.useForm();
  const [changeLogForm] = Form.useForm();

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
  const isFolderSidebarCollapsed = !isMobile && folderSidebarCollapsed;
  const canManageSelectedDoc = Boolean(
    currentUser && selectedDoc && (isDocumentAdminUser(currentUser) || Number(selectedDoc.created_by) === Number(currentUser.id))
  );

  const focusBlock = (id) => {
    window.setTimeout(() => {
      const input = document.getElementById(`doc-block-input-${id}`);
      if (input) input.focus();
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
      if (selectedDocId && !rows.some(item => item.id === selectedDocId)) {
        setSelectedDocId(null);
        setSelectedDoc(null);
      }
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载文档失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const detail = await documentsApi.get(id);
      const blocks = contentToBlocks(detail.content);
      const isBlankPage = blocks.length === 1 && blocks[0].type === 'paragraph' && isBlankBlock(blocks[0]);
      setSelectedDoc(detail);
      setEditorTitle(detail.title || '');
      setEditorBlocks(blocks);
      setSelectedBlockId(isBlankPage ? null : (blocks[0]?.id || null));
      setHoveredBlockId(null);
      setTocOpen(asSwitchValue(detail.toc_enabled, true));
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载文档详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelectedDocMeta = async () => {
    if (!selectedDoc?.id) return;
    const detail = await documentsApi.get(selectedDoc.id);
    setSelectedDoc(prev => ({ ...prev, ...detail }));
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
    if (selectedDocId) loadDetail(selectedDocId);
  }, [selectedDocId]);

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

  const openCreate = () => {
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

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const doc = await documentsApi.create({
        ...values,
        content: { blocks: [] },
        content_text: '',
      });
      message.success(`已创建 ${doc.document_no}`);
      setCreateOpen(false);
      setSelectedDocId(doc.id);
      await loadDocuments();
      await loadFolderTreeDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '创建文档失败');
    }
  };

  const handleSave = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const content = blocksToContent(editorBlocks);
      const payload = {
        title: editorTitle || '未命名文档',
        content,
        content_text: blocksToText(editorBlocks),
      };
      const updated = await documentsApi.update(selectedDoc.id, payload);
      await loadDetail(selectedDoc.id);
      await loadDocuments();
      await loadFolderTreeDocuments();
      message.success(`已保存 ${updated.document_no}`);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const buildPageOptionsPayload = (patch = {}) => ({
    toc_enabled: asSwitchValue(selectedDoc?.toc_enabled, true),
    width_mode: selectedDoc?.width_mode || 'standard',
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
    const logs = selectedDoc.change_logs || [];
    changeLogForm.resetFields();
    setEditingChangeLog(null);
    setChangeLogFormOpen(false);
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
    const logs = selectedDoc?.change_logs || [];
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

  const handleDelete = async () => {
    if (!selectedDoc) return;
    try {
      await documentsApi.delete(selectedDoc.id);
      message.success('文档已删除');
      setSelectedDoc(null);
      setSelectedDocId(null);
      await loadDocuments();
      await loadFolderTreeDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '删除失败');
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
      if (selectedDoc?.id === doc.id) await loadDetail(doc.id);
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
    setEditorBlocks(prev => prev.map(block => (block.id === id ? { ...block, ...patch } : block)));
  };

  const addBlockAfter = (afterId, type = 'paragraph') => {
    const nextBlock = createBlock(type);
    setEditorBlocks(prev => {
      const index = prev.findIndex(block => block.id === afterId);
      const next = [...prev];
      next.splice(index >= 0 ? index + 1 : next.length, 0, nextBlock);
      return next;
    });
    setSelectedBlockId(nextBlock.id);
    focusBlock(nextBlock.id);
  };

  const duplicateBlock = (id) => {
    const source = editorBlocks.find(block => block.id === id);
    if (!source) return;
    const nextBlock = createBlock(source.type, source.content, {
      highlight: source.highlight || '',
      checked: Boolean(source.checked),
    });
    setEditorBlocks(prev => {
      const index = prev.findIndex(block => block.id === id);
      const next = [...prev];
      next.splice(index + 1, 0, nextBlock);
      return next;
    });
    setSelectedBlockId(nextBlock.id);
    focusBlock(nextBlock.id);
  };

  const deleteBlock = (id) => {
    if (editorBlocks.length <= 1) {
      const blank = createBlock();
      setEditorBlocks([blank]);
      setSelectedBlockId(blank.id);
      focusBlock(blank.id);
      return;
    }
    const index = editorBlocks.findIndex(block => block.id === id);
    const next = editorBlocks.filter(block => block.id !== id);
    const nextSelected = next[Math.max(0, index - 1)] || next[0];
    setEditorBlocks(next);
    setSelectedBlockId(nextSelected?.id || null);
    if (nextSelected) focusBlock(nextSelected.id);
  };

  const moveBlock = (id, direction) => {
    setEditorBlocks(prev => {
      const index = prev.findIndex(block => block.id === id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const changeBlockType = (id, type) => {
    updateBlock(id, { type, content: type === 'divider' ? '' : editorBlocks.find(block => block.id === id)?.content || '' });
    setSelectedBlockId(id);
    focusBlock(id);
  };

  const addOrTransformBlock = (id, type) => {
    const current = editorBlocks.find(block => block.id === id);
    if (!current) return;
    if (isBlankBlock(current)) {
      changeBlockType(id, type);
      return;
    }
    addBlockAfter(id, type);
  };

  const handleBlockMenuAction = (block, key) => {
    if (!block) return;
    if (key.startsWith('type:')) {
      addOrTransformBlock(block.id, key.replace('type:', ''));
      return;
    }
    if (key.startsWith('highlight:')) {
      updateBlock(block.id, { highlight: key.replace('highlight:', '') });
      setSelectedBlockId(block.id);
      return;
    }
    if (key === 'duplicate') duplicateBlock(block.id);
    if (key === 'delete') deleteBlock(block.id);
    if (key === 'move-up') moveBlock(block.id, -1);
    if (key === 'move-down') moveBlock(block.id, 1);
  };

  const buildBlockMenuItems = (block) => [
    { type: 'group', label: '基础块', children: blockTypeOptions.map(item => ({ key: `type:${item.value}`, label: item.label })) },
    {
      type: 'group',
      label: '高亮',
      children: highlightOptions.map(item => ({
        key: `highlight:${item.value}`,
        label: item.value ? item.label : '清除高亮',
        icon: <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: item.color, border: `1px solid ${item.border || item.color}` }} />,
      })),
    },
    { type: 'divider' },
    { key: 'duplicate', icon: <CopyOutlined />, label: '复制当前块' },
    { key: 'move-up', icon: <UpOutlined />, label: '上移', disabled: editorBlocks.findIndex(item => item.id === block?.id) <= 0 },
    { key: 'move-down', icon: <DownOutlined />, label: '下移', disabled: editorBlocks.findIndex(item => item.id === block?.id) >= editorBlocks.length - 1 },
    { key: 'delete', danger: true, icon: <DeleteOutlined />, label: '删除当前块' },
  ];

  const handleBlockKeyDown = (event, block, index) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      addBlockAfter(block.id, block.type?.startsWith('heading') ? 'paragraph' : block.type);
      return;
    }
    if (event.key === 'Backspace' && !block.content && editorBlocks.length > 1) {
      event.preventDefault();
      const previousBlock = editorBlocks[index - 1] || editorBlocks[index + 1];
      deleteBlock(block.id);
      if (previousBlock) focusBlock(previousBlock.id);
    }
  };

  const scrollToBlock = (id) => {
    setSelectedBlockId(id);
    const node = document.getElementById(`doc-block-${id}`);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusBlock(id);
  };

  const renderDocItem = (item) => (
    <List.Item
      key={item.id}
      onClick={() => setSelectedDocId(item.id)}
      style={{
        cursor: 'pointer',
        padding: '10px 8px',
        borderRadius: 8,
        background: selectedDocId === item.id ? '#eef2ff' : 'transparent',
        border: selectedDocId === item.id ? '1px solid #c7d2fe' : '1px solid transparent',
        marginBottom: 6,
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
          <Space size={6} wrap>
            <Text strong ellipsis style={{ maxWidth: 170 }}>{item.title}</Text>
            <Tag color="blue">{docTypeLabel[item.doc_type] || item.doc_type}</Tag>
          </Space>
        }
        description={
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{item.document_no}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {item.updated_by_name || item.created_by_name || '-'} · {item.updated_at?.slice(0, 16) || '-'}
            </Text>
          </Space>
        }
      />
    </List.Item>
  );

  const renderPageMenu = () => (
    <div style={{ width: 280, padding: 14, background: '#fff', borderRadius: 8, boxShadow: '0 6px 24px rgba(15,23,42,0.16)' }}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text strong>目录抽屉</Text>
          <Switch
            size="small"
            loading={optionsSaving}
            checked={asSwitchValue(selectedDoc?.toc_enabled, true)}
            onChange={checked => savePageOptions({ toc_enabled: checked })}
          />
        </div>
        <div>
          <Text strong>编辑宽度</Text>
          <Radio.Group
            value={selectedDoc?.width_mode || 'standard'}
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
                <Text type="secondary">创建人、管理员和高管默认可访问；下方用于追加共享范围。</Text>
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
                        title="删除这条页面编辑记录？"
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
                <Text type="secondary" style={{ fontSize: 12 }}>{formatChangeLogTime(item.edited_at || item.created_at)}</Text>
              </Space>
              <ClockCircleOutlined style={{ color: '#94a3b8', marginTop: 2 }} />
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
    const logs = selectedDoc?.change_logs || [];
    const editRecords = selectedDoc?.edit_records || [];
    const allExpanded = logs.length > 0 && logs.every(item => expandedChangeLogIds.includes(item.id));
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Space>
              <Switch size="small" checked={changeLogNotifyEnabled} onChange={setChangeLogNotifyEnabled} />
              <Text>接收页面变更通知</Text>
            </Space>
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
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无页面编辑记录" /> }}
            renderItem={renderChangeLogItem}
          />
        </Space>
      </Drawer>
    );
  };

  const renderTocPanel = () => {
    if (!asSwitchValue(selectedDoc?.toc_enabled, true) || !tocOpen) return null;
    return (
      <aside style={{
        width: isMobile ? '100%' : 260,
        flex: '0 0 auto',
        borderLeft: '1px solid #e5e7eb',
        paddingLeft: isMobile ? 0 : 20,
        color: '#64748b',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong style={{ color: '#64748b' }}>标题目录</Text>
          <Button type="text" size="small" icon={<MoreOutlined />} onClick={() => setTocOpen(false)} />
        </div>
        {headingMeta.toc.length ? (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {headingMeta.toc.map(item => (
              <Button
                key={item.id}
                type="text"
                block
                onClick={() => scrollToBlock(item.id)}
                style={{
                  justifyContent: 'flex-start',
                  paddingLeft: (item.level - 1) * 14,
                  height: 'auto',
                  minHeight: 28,
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
      </aside>
    );
  };

  const renderBlockInput = (block, index, heading) => {
    const active = selectedBlockId === block.id;
    const commonProps = {
      id: `doc-block-input-${block.id}`,
      value: block.content,
      bordered: false,
      autoSize: { minRows: block.type === 'code' ? 3 : 1 },
      placeholder: active ? (block.type?.startsWith('heading') ? '输入标题' : '输入内容') : '',
      onFocus: () => setSelectedBlockId(block.id),
      onChange: event => updateBlock(block.id, { content: event.target.value }),
      onKeyDown: event => handleBlockKeyDown(event, block, index),
      style: {
        padding: 0,
        resize: 'none',
        lineHeight: block.type === 'code' ? 1.7 : 1.75,
        fontSize: selectedDoc?.small_font_enabled ? 13 : 15,
        background: 'transparent',
      },
    };

    if (block.type === 'divider') {
      return <Divider style={{ margin: '10px 0' }} />;
    }

    if (block.type?.startsWith('heading')) {
      const level = Number(block.type.replace('heading', ''));
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {heading?.number && <Text type="secondary" style={{ paddingTop: 4, minWidth: 28 }}>{heading.number}</Text>}
          <TextArea
            {...commonProps}
            autoSize={{ minRows: 1 }}
            style={{
              ...commonProps.style,
              fontSize: level === 1 ? 30 : level === 2 ? 24 : level === 3 ? 19 : 16,
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          />
        </div>
      );
    }

    if (block.type === 'bullet' || block.type === 'numbered') {
      return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Text style={{ width: 22, paddingTop: 1, textAlign: 'right' }}>{block.type === 'bullet' ? '•' : `${index + 1}.`}</Text>
          <TextArea {...commonProps} />
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
          <TextArea {...commonProps} />
        </div>
      );
    }

    if (block.type === 'quote') {
      return (
        <div style={{ borderLeft: '3px solid #94a3b8', paddingLeft: 12 }}>
          <TextArea
            {...commonProps}
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
        <TextArea
          {...commonProps}
          style={{
            ...commonProps.style,
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: 8,
            padding: 12,
          }}
        />
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
          <TextArea
            {...commonProps}
            autoSize={{ minRows: 1 }}
            placeholder={active ? '页面标题' : ''}
            style={{ ...commonProps.style, fontWeight: 600 }}
          />
        </div>
      );
    }

    return <TextArea {...commonProps} />;
  };

  const renderEditorBlock = (block, index) => {
    const menuOpen = openBlockMenuId === block.id;
    const active = menuOpen || hoveredBlockId === block.id;
    const heading = headingMeta.map.get(block.id);
    return (
      <div
        id={`doc-block-${block.id}`}
        key={block.id}
        onClick={() => setSelectedBlockId(block.id)}
        onMouseEnter={() => setHoveredBlockId(block.id)}
        onMouseLeave={() => setHoveredBlockId(prev => (prev === block.id ? null : prev))}
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '24px minmax(0, 1fr)' : '32px minmax(0, 1fr)',
          gap: 4,
          border: menuOpen ? '1px solid #c7d2fe' : '1px solid transparent',
          background: block.highlight || (menuOpen ? '#fafafa' : 'transparent'),
          borderRadius: 6,
          padding: '3px 8px 3px 0',
          marginBottom: 2,
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: block.type?.startsWith('heading') ? 5 : 3 }}>
          <Dropdown
            trigger={['click']}
            open={menuOpen}
            onOpenChange={(open) => {
              setOpenBlockMenuId(open ? block.id : (prev => (prev === block.id ? null : prev)));
            }}
            menu={{
              items: buildBlockMenuItems(block),
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                setOpenBlockMenuId(null);
                handleBlockMenuAction(block, key);
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              aria-label="添加块"
              onClick={event => {
                event.stopPropagation();
                setSelectedBlockId(block.id);
              }}
              style={{
                width: 24,
                height: 24,
                minWidth: 24,
                opacity: active ? 1 : 0,
                pointerEvents: active ? 'auto' : 'none',
                color: '#6b7280',
              }}
            />
          </Dropdown>
        </div>
        <div style={{ minWidth: 0 }}>
          {renderBlockInput(block, index, heading)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)', minHeight: 640, flexDirection: isMobile ? 'column' : 'row' }}>
      <aside style={{
        width: isMobile ? '100%' : (isFolderSidebarCollapsed ? 40 : 340),
        minWidth: isMobile ? '100%' : (isFolderSidebarCollapsed ? 40 : 320),
        borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
        paddingRight: isMobile ? 0 : (isFolderSidebarCollapsed ? 8 : 16),
        overflow: isFolderSidebarCollapsed ? 'hidden' : 'auto',
        transition: 'width 0.2s ease, min-width 0.2s ease, padding 0.2s ease',
      }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
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

          {!isFolderSidebarCollapsed && (
            <>
              <Select
                value={domainFilter}
                options={domainOptions}
                onChange={(value) => {
                  setDomainFilter(value);
                  setSelectedFolderId(null);
                  setSopOnly(false);
                }}
                style={{ width: '100%' }}
              />

              <Input.Search
                allowClear
                placeholder="搜索标题、编号、正文"
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
              />

              <Space size={8} wrap>
                <Button
                  type={sopOnly ? 'primary' : 'default'}
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => {
                    setSopOnly(!sopOnly);
                    setSelectedFolderId(null);
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
                    switcherIcon={({ expanded, isLeaf }) => {
                      if (isLeaf) return null;
                      return expanded ? <DownOutlined /> : <RightOutlined />;
                    }}
                    onExpand={(keys) => setFolderTreeExpandedKeys(keys)}
                    onSelect={(keys, info) => {
                      const key = keys[0] || info?.node?.key;
                      if (typeof key === 'string' && key.startsWith('folder-')) {
                        setSelectedFolderId(Number(key.replace('folder-', '')));
                        setSopOnly(false);
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
                        setSelectedDocId(documentId);
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
              </div>
            </>
          )}
        </Space>
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {!selectedDoc ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #d9d9d9', borderRadius: 8 }}>
            <Empty description="选择或新建一篇文档">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建文档</Button>
            </Empty>
          </div>
        ) : (
          <Spin spinning={detailLoading}>
            <div style={{
              maxWidth: getEditorShellMaxWidth(selectedDoc, asSwitchValue(selectedDoc?.toc_enabled, true) && tocOpen),
              margin: '0 auto',
              padding: isMobile ? 0 : '4px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <Space direction="vertical" size={4} style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Tag color="geekblue">{selectedDoc.document_no}</Tag>
                    <Tag>{selectedDoc.current_version || 'V1.0'}</Tag>
                    <Tag color="cyan">{selectedDoc.access_summary?.label || '仅自己'}</Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    创建人：{selectedDoc.created_by_name || '-'} · 最后编辑：{selectedDoc.updated_by_name || selectedDoc.created_by_name || '-'} · {selectedDoc.updated_at?.slice(0, 16) || '-'}
                  </Text>
                </Space>
                <Space wrap>
                  <Button
                    icon={<MenuOutlined />}
                    disabled={!asSwitchValue(selectedDoc?.toc_enabled, true)}
                    onClick={() => setTocOpen(prev => !prev)}
                  >
                    目录
                  </Button>
                  <Dropdown
                    trigger={['click']}
                    open={pageMenuOpen}
                    onOpenChange={setPageMenuOpen}
                    dropdownRender={renderPageMenu}
                  >
                    <Button icon={<MoreOutlined />}>页面</Button>
                  </Dropdown>
                  <Button icon={<ShareAltOutlined />} onClick={openShare}>
                    共享 · {selectedDoc.access_summary?.label || '仅自己'}
                  </Button>
                  <Tooltip title="页面编辑记录">
                    <Button icon={<HistoryOutlined />} onClick={openChangeLogs} aria-label="页面编辑记录" />
                  </Tooltip>
                  <Button
                    icon={selectedDoc.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
                    onClick={() => toggleFavorite(selectedDoc)}
                  />
                  <Popconfirm title="确认删除该文档？" onConfirm={handleDelete} okText="删除" cancelText="取消">
                    <Button danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                  <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存</Button>
                </Space>
              </div>

              <Input
                value={editorTitle}
                onChange={event => setEditorTitle(event.target.value)}
                placeholder="文档标题"
                style={{
                  border: 'none',
                  boxShadow: 'none',
                  fontSize: 30,
                  fontWeight: 700,
                  padding: '8px 0',
                  marginBottom: 8,
                }}
              />

              <Space size={8} wrap style={{ marginBottom: 16 }}>
                <Tag>{domainLabel[selectedDoc.domain] || selectedDoc.domain}</Tag>
                <Tag>{selectedDoc.project_group_name || selectedDoc.project_code || '未关联项目组'}</Tag>
                <Tag>{departmentLabel[selectedDoc.department_key] || selectedDoc.department_key}</Tag>
                <Tag>{docTypeLabel[selectedDoc.doc_type] || selectedDoc.doc_type}</Tag>
                {selectedDoc.folder_name && <Tag icon={<FolderOutlined />}>{selectedDoc.folder_name}</Tag>}
              </Space>

              <div style={{
                display: 'flex',
                gap: isMobile ? 16 : 32,
                alignItems: 'flex-start',
                flexDirection: isMobile ? 'column' : 'row',
              }}>
                <section style={{
                  flex: 1,
                  minWidth: 0,
                  maxWidth: getEditorMaxWidth(selectedDoc),
                  width: '100%',
                  paddingBottom: 96,
                  minHeight: 420,
                }}>
                  {editorBlocks.map((block, index) => renderEditorBlock(block, index))}
                </section>
                {renderTocPanel()}
              </div>
            </div>
          </Spin>
        )}
      </main>

      <Modal
        title="共享文档"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={saveShares}
        okText="保存共享"
        cancelText="取消"
        confirmLoading={shareSaving}
        destroyOnClose
        width={680}
      >
        {renderShareSelector()}
      </Modal>

      {renderChangeLogDrawer()}

      <Modal
        title="新建文档"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
        destroyOnClose
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
