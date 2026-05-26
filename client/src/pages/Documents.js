import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Grid,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  FileTextOutlined,
  FolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { documentsApi, projectGroupsApi } from '../api';

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

const domainLabel = Object.fromEntries(domainOptions.map(item => [item.value, item.label]));
const departmentLabel = Object.fromEntries(departmentOptions.map(item => [item.value, item.label]));
const docTypeLabel = Object.fromEntries(docTypeOptions.map(item => [item.value, item.label]));

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

function contentToText(content) {
  if (!content) return '';
  try {
    return collectText(JSON.parse(content)).join('\n');
  } catch {
    return String(content || '');
  }
}

function textToBlocks(text) {
  const lines = String(text || '').split('\n');
  return {
    blocks: lines.map((line, index) => ({
      id: `b_${Date.now()}_${index}`,
      type: 'paragraph',
      content: line,
    })),
  };
}

function buildFolderTree(folders, activeDomain) {
  const scopedFolders = activeDomain === 'all'
    ? folders
    : folders.filter(folder => folder.domain === activeDomain);
  const domainMap = new Map();

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
    projectNode.deptMap.get(deptKey).children.push({
      title: folder.name,
      key: `folder-${folder.id}`,
      icon: <FolderOutlined />,
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

export default function Documents() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [folders, setFolders] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorText, setEditorText] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [sopOnly, setSopOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [templateForm] = Form.useForm();

  const selectedFolder = useMemo(
    () => folders.find(folder => Number(folder.id) === Number(selectedFolderId)),
    [folders, selectedFolderId]
  );

  const folderTree = useMemo(() => buildFolderTree(folders, domainFilter), [folders, domainFilter]);

  const loadFolders = async () => {
    const rows = await documentsApi.listFolders();
    setFolders(rows);
  };

  const loadProjectGroups = async () => {
    const rows = await projectGroupsApi.list();
    setProjectGroups(rows.filter(item => item.status !== 'inactive'));
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const params = {};
      if (domainFilter !== 'all') params.domain = domainFilter;
      if (keyword.trim()) params.search = keyword.trim();
      if (selectedFolderId) params.folder_id = selectedFolderId;
      if (sopOnly) params.sop_only = true;
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
      setSelectedDoc(detail);
      setEditorTitle(detail.title || '');
      setEditorText(contentToText(detail.content));
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '加载文档详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadFolders().catch(err => message.error(err.response?.data?.error || err.message || '加载目录失败'));
    loadProjectGroups().catch(err => message.error(err.response?.data?.error || err.message || '加载项目组失败'));
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [domainFilter, selectedFolderId, sopOnly]);

  useEffect(() => {
    const timer = setTimeout(() => loadDocuments(), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (selectedDocId) loadDetail(selectedDocId);
  }, [selectedDocId]);

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({
      title: '未命名文档',
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
      const doc = await documentsApi.create(values);
      message.success(`已创建 ${doc.document_no}`);
      setCreateOpen(false);
      setSelectedDocId(doc.id);
      await loadDocuments();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '创建文档失败');
    }
  };

  const handleSave = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const payload = {
        title: editorTitle || '未命名文档',
        content: textToBlocks(editorText),
        content_text: editorText,
      };
      const updated = await documentsApi.update(selectedDoc.id, payload);
      await loadDetail(selectedDoc.id);
      await loadDocuments();
      message.success(`已保存 ${updated.document_no}`);
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '保存失败');
    } finally {
      setSaving(false);
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

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)', minHeight: 640, flexDirection: isMobile ? 'column' : 'row' }}>
      <aside style={{
        width: isMobile ? '100%' : 340,
        minWidth: isMobile ? '100%' : 320,
        borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
        paddingRight: isMobile ? 0 : 16,
        overflow: 'auto',
      }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Title level={4} style={{ margin: 0 }}>文档中心</Title>
            <Space size={6}>
              <Tooltip title="刷新">
                <Button icon={<ReloadOutlined />} onClick={() => { loadFolders(); loadDocuments(); }} />
              </Tooltip>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建</Button>
            </Space>
          </div>

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
                defaultExpandAll
                selectedKeys={selectedFolderId ? [`folder-${selectedFolderId}`] : []}
                treeData={folderTree}
                onSelect={(keys) => {
                  const key = keys[0];
                  if (typeof key === 'string' && key.startsWith('folder-')) {
                    setSelectedFolderId(Number(key.replace('folder-', '')));
                    setSopOnly(false);
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
            <div style={{ maxWidth: selectedDoc.width_mode === 'wide' ? 1080 : 860, margin: '0 auto', padding: isMobile ? 0 : '4px 12px' }}>
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
                <Space>
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
                  fontSize: 28,
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

              <TextArea
                value={editorText}
                onChange={event => setEditorText(event.target.value)}
                placeholder="开始沉淀文档内容..."
                autoSize={{ minRows: 18 }}
                style={{
                  borderRadius: 8,
                  fontSize: selectedDoc.small_font_enabled ? 13 : 15,
                  lineHeight: 1.8,
                  resize: 'none',
                }}
              />
            </div>
          </Spin>
        )}
      </main>

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
