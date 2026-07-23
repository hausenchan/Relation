import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Grid,
  Input,
  List,
  Modal,
  Popconfirm,
  Popover,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  ColumnHeightOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { documentsApi, mediaManagementApi, usersApi } from '../api';
import Documents from './Documents';
import ResizableTable from '../components/ResizableTable';
import { useAuth } from '../AuthContext';
import { ATTACHMENT_ACCEPT, validateAttachment } from '../utils/attachments';
import {
  buildMediaListParams,
  canShowMediaDelete,
  isValidMediaCid,
  mediaBudgetOptions,
  mediaCategoryOptions,
  mediaDisplayStyleOptions,
  mediaImportanceOptions,
  MEDIA_CID_MAX_LENGTH,
  mediaOptionMaps,
  mediaPornApiOptions,
  mediaProgressOptions,
  mediaRecordToFormValues,
  mediaYyzVersionOptions,
  normalizeMediaFormPayload,
} from '../utils/mediaManagement';
import { formatBusinessDateTime } from '../utils/businessTime';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const visibleColumnsStorageKey = 'media-management-visible-columns-v2';
const densityStorageKey = 'media-management-table-density';

const requiredColumnKeys = ['cid', 'media_name'];
const defaultVisibleColumnKeys = [
  'cid',
  'media_name',
  'importance',
  'category',
  'yyz_version',
  'display_style',
  'budget_types',
  'integration_progress',
  'owner_name',
  'updated_at',
  'launch_date',
];

const columnSettingOptions = [
  { label: 'CID', value: 'cid', disabled: true },
  { label: '媒体', value: 'media_name', disabled: true },
  { label: '重要程度', value: 'importance' },
  { label: '类目', value: 'category' },
  { label: 'YYZ版本', value: 'yyz_version' },
  { label: '展示样式', value: 'display_style' },
  { label: '预算', value: 'budget_types' },
  { label: '对接进度', value: 'integration_progress' },
  { label: '负责人', value: 'owner_name' },
  { label: '更新时间', value: 'updated_at' },
  { label: '上线时间', value: 'launch_date' },
  { label: '域名', value: 'domain_name' },
  { label: '版本号', value: 'version_number' },
  { label: '最新媒体发版时间', value: 'latest_release_date' },
  { label: '合同有效期', value: 'contract_valid_until' },
  { label: '最新支持功能', value: 'latest_features' },
  { label: 'UV量级', value: 'uv_scale' },
  { label: '鉴黄API', value: 'porn_api_status' },
  { label: 'APPID-SDK UI版', value: 'sdk_ui_appid' },
  { label: '任务配置要求', value: 'task_config_requirements' },
  { label: '特殊入口信息', value: 'special_entry_info' },
  { label: '其他特殊记录', value: 'other_notes' },
];

const initialFilters = {
  search: '',
  importance: '',
  category: '',
  yyz_version: '',
  display_style: '',
  budget_types: [],
  integration_progress: '',
  owner_id: '',
  porn_api_status: '',
};

function getOptionMeta(group, value) {
  return mediaOptionMaps[group]?.[value] || { label: value || '-', color: 'default' };
}

function renderEnumTag(group, value) {
  if (!value) return <Text type="secondary">-</Text>;
  const meta = getOptionMeta(group, value);
  return <Tag color={meta.color || 'default'}>{meta.label}</Tag>;
}

function renderBudgetTags(values = [], options = {}) {
  if (!values.length) return <Text type="secondary">-</Text>;
  const maxCount = options.maxCount || values.length;
  const visibleValues = values.slice(0, maxCount);
  const hiddenValues = values.slice(maxCount);
  const content = (
    <Space size={[4, 4]} wrap={options.wrap !== false} style={{ maxWidth: '100%', rowGap: 4 }}>
      {visibleValues.map(value => <Tag key={value} style={{ marginInlineEnd: 0 }}>{getOptionMeta('budget_types', value).label}</Tag>)}
      {hiddenValues.length > 0 && (
        <Tag color="default" style={{ marginInlineEnd: 0 }}>
          +{hiddenValues.length}
        </Tag>
      )}
    </Space>
  );

  if (!hiddenValues.length) return content;
  return (
    <Tooltip title={values.map(value => getOptionMeta('budget_types', value).label).join('、')}>
      {content}
    </Tooltip>
  );
}

function displayText(value) {
  return value === undefined || value === null || value === '' ? '-' : value;
}

function renderCompactText(value) {
  const text = displayText(value);
  if (text === '-') return <Text type="secondary">-</Text>;
  return (
    <Text ellipsis={{ tooltip: text }} style={{ display: 'block', maxWidth: '100%' }}>
      {text}
    </Text>
  );
}

function formatShortDateTime(value) {
  return formatBusinessDateTime(value);
}

function readStoredVisibleColumns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(visibleColumnsStorageKey) || '[]');
    const optionValues = new Set(columnSettingOptions.map(option => option.value));
    const stored = Array.isArray(parsed) ? parsed.filter(key => optionValues.has(key)) : [];
    return Array.from(new Set([...requiredColumnKeys, ...(stored.length ? stored : defaultVisibleColumnKeys)]));
  } catch {
    return defaultVisibleColumnKeys;
  }
}

function readStoredDensity() {
  try {
    const stored = localStorage.getItem(densityStorageKey);
    return stored === 'small' ? 'small' : 'middle';
  } catch {
    return 'middle';
  }
}

export default function MediaManagement() {
  const { user, canWrite } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const canCreateMedia = canWrite('product_assets') && !['readonly', 'guest'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAttachments, setDetailAttachments] = useState([]);
  const [detailAttachmentsLoading, setDetailAttachmentsLoading] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readStoredVisibleColumns);
  const [tableDensity, setTableDensity] = useState(readStoredDensity);
  const [mediaAttachmentFileList, setMediaAttachmentFileList] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    try {
      localStorage.setItem(visibleColumnsStorageKey, JSON.stringify(visibleColumnKeys));
    } catch {
      // ignore storage failures in restricted browsers
    }
  }, [visibleColumnKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(densityStorageKey, tableDensity);
    } catch {
      // ignore storage failures in restricted browsers
    }
  }, [tableDensity]);

  useEffect(() => {
    usersApi.listSimple()
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => message.error('加载负责人列表失败'));
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mediaManagementApi.list(buildMediaListParams(filters));
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载媒体列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(loadRows, 220);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const userOptions = useMemo(() => users.map(user => ({
    value: Number(user.id),
    label: user.display_name || user.username,
  })), [users]);

  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({
      importance: 'general',
      integration_progress: 'pending',
      budget_types: [],
    });
    setMediaAttachmentFileList([]);
    setFormOpen(true);
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    form.resetFields();
    form.setFieldsValue(mediaRecordToFormValues(record));
    setMediaAttachmentFileList([]);
    setFormOpen(true);
  };

  const loadDetailAttachments = useCallback(async (documentId) => {
    if (!documentId) {
      setDetailAttachments([]);
      return;
    }
    setDetailAttachmentsLoading(true);
    try {
      const rows = await documentsApi.listAttachments(documentId);
      setDetailAttachments(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setDetailAttachments([]);
      message.error(error.response?.data?.error || '加载媒体附件失败');
    } finally {
      setDetailAttachmentsLoading(false);
    }
  }, []);

  const saveRecord = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = normalizeMediaFormPayload(values);
      const saved = editingRecord
        ? await mediaManagementApi.update(editingRecord.id, payload)
        : await mediaManagementApi.create(payload);
      if (!editingRecord && mediaAttachmentFileList.length && saved?.document_id) {
        try {
          for (const file of mediaAttachmentFileList) {
            const formData = new FormData();
            formData.append('file', file.originFileObj || file);
            await documentsApi.uploadAttachment(saved.document_id, formData);
          }
        } catch (error) {
          message.warning(error.response?.data?.error || '媒体已创建，但附件上传失败');
        }
      }
      setFormOpen(false);
      setMediaAttachmentFileList([]);
      message.success(editingRecord ? '媒体已更新' : '媒体已创建');
      await loadRows();
      if (detailRecord?.id === saved.id) {
        setDetailRecord(saved);
        await loadDetailAttachments(saved.document_id);
      }
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.response?.data?.error || error.message || '保存媒体失败');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailAttachments([]);
    try {
      const detail = await mediaManagementApi.get(record.id);
      setDetailRecord(detail);
      await loadDetailAttachments(detail.document_id);
    } catch (error) {
      message.error(error.response?.data?.error || '加载媒体详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const renderMediaAttachments = () => (
    <div style={{ marginTop: 8 }}>
      {detailAttachmentsLoading ? (
        <Text type="secondary">附件加载中...</Text>
      ) : detailAttachments.length ? (
        <List
          size="small"
          dataSource={detailAttachments}
          rowKey="id"
          renderItem={attachment => {
            const displayName = attachment.display_name || attachment.filename;
            return (
              <List.Item
                actions={[
                  <Button
                    key="download"
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => documentsApi.downloadAttachment(attachment.id, displayName).catch(() => message.error('下载失败'))}
                  >
                    下载
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<PaperClipOutlined style={{ color: '#64748b' }} />}
                  title={<Text ellipsis={{ tooltip: displayName }}>{displayName}</Text>}
                  description={`${attachment.file_ext || '文件'} · ${((Number(attachment.size) || 0) / 1024).toFixed(1)} KB`}
                />
              </List.Item>
            );
          }}
        />
      ) : (
        <Text type="secondary">暂无附件</Text>
      )}
    </div>
  );

  const deleteRecord = async (record) => {
    try {
      await mediaManagementApi.delete(record.id);
      if (detailRecord?.id === record.id) {
        setDetailOpen(false);
        setDetailRecord(null);
      }
      message.success('媒体已删除');
      await loadRows();
    } catch (error) {
      message.error(error.response?.data?.error || '删除媒体失败');
    }
  };

  const allColumns = [
    { title: 'CID', dataIndex: 'cid', key: 'cid', width: 96, render: value => <Text code>{value}</Text> },
    {
      title: '媒体',
      dataIndex: 'media_name',
      key: 'media_name',
      width: 230,
      render: (value, record) => (
        <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
          <Button
            type="link"
            onClick={() => openDetail(record)}
            style={{ padding: 0, height: 'auto', maxWidth: '100%', fontWeight: 600 }}
          >
            <Text ellipsis={{ tooltip: value }} style={{ maxWidth: 198 }}>{value}</Text>
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            文档 #{record.document_id || '-'}
          </Text>
        </Space>
      ),
    },
    { title: '重要程度', dataIndex: 'importance', key: 'importance', width: 100, render: value => renderEnumTag('importance', value) },
    { title: '类目', dataIndex: 'category', key: 'category', width: 104, render: value => getOptionMeta('category', value).label },
    { title: 'YYZ版本', dataIndex: 'yyz_version', key: 'yyz_version', width: 156, render: value => renderCompactText(getOptionMeta('yyz_version', value).label) },
    { title: '展示样式', dataIndex: 'display_style', key: 'display_style', width: 160, render: value => renderCompactText(getOptionMeta('display_style', value).label) },
    { title: '预算', dataIndex: 'budget_types', key: 'budget_types', width: 172, render: values => renderBudgetTags(values, { maxCount: 2, wrap: false }) },
    { title: '对接进度', dataIndex: 'integration_progress', key: 'integration_progress', width: 112, render: value => renderEnumTag('integration_progress', value) },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 118, render: renderCompactText },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 140, render: (value, record) => renderCompactText(formatShortDateTime(value || record.document_updated_at)) },
    { title: '上线时间', dataIndex: 'launch_date', key: 'launch_date', width: 112, render: renderCompactText },
    { title: '域名', dataIndex: 'domain_name', key: 'domain_name', width: 168, render: renderCompactText },
    { title: '版本号', dataIndex: 'version_number', key: 'version_number', width: 110, render: renderCompactText },
    { title: '最新媒体发版时间', dataIndex: 'latest_release_date', key: 'latest_release_date', width: 150, render: renderCompactText },
    { title: '合同有效期', dataIndex: 'contract_valid_until', key: 'contract_valid_until', width: 128, render: renderCompactText },
    { title: '最新支持功能', dataIndex: 'latest_features', key: 'latest_features', width: 230, render: renderCompactText },
    { title: 'UV量级', dataIndex: 'uv_scale', key: 'uv_scale', width: 120, render: renderCompactText },
    { title: '鉴黄API', dataIndex: 'porn_api_status', key: 'porn_api_status', width: 190, render: value => value ? renderCompactText(getOptionMeta('porn_api_status', value).label) : <Text type="secondary">-</Text> },
    { title: 'APPID-SDK UI版', dataIndex: 'sdk_ui_appid', key: 'sdk_ui_appid', width: 190, render: renderCompactText },
    { title: '任务配置要求', dataIndex: 'task_config_requirements', key: 'task_config_requirements', width: 230, render: renderCompactText },
    { title: '特殊入口信息', dataIndex: 'special_entry_info', key: 'special_entry_info', width: 230, render: renderCompactText },
    { title: '其他特殊记录', dataIndex: 'other_notes', key: 'other_notes', width: 230, render: renderCompactText },
    {
      title: '操作',
      key: 'actions',
      width: 104,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label="编辑媒体"
            disabled={!Number(record.can_edit)}
            onClick={event => { event.stopPropagation(); openEdit(record); }}
          />
          {canShowMediaDelete(record) && (
            <Popconfirm
              title="确认删除该媒体？"
              description="关联文档将停止展示，历史和附件会保留。"
              onConfirm={() => deleteRecord(record)}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除媒体"
                onClick={event => event.stopPropagation()}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];
  const visibleColumnSet = new Set(visibleColumnKeys);
  const columns = allColumns.filter(column => column.key === 'actions' || visibleColumnSet.has(column.key));
  const tableScrollX = Math.max(1180, columns.reduce((sum, column) => sum + (Number(column.width) || 160), 0));

  const handleVisibleColumnsChange = (keys) => {
    setVisibleColumnKeys(Array.from(new Set([...requiredColumnKeys, ...keys])));
  };

  const columnSettingsMenu = (
    <div style={{ width: 300, maxWidth: 'calc(100vw - 32px)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <Text strong>列表字段</Text>
        <Button type="link" size="small" onClick={() => setVisibleColumnKeys(defaultVisibleColumnKeys)}>
          恢复默认
        </Button>
      </div>
      <Checkbox.Group
        value={visibleColumnKeys}
        options={columnSettingOptions}
        onChange={handleVisibleColumnsChange}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
      />
    </div>
  );

  const renderMobileRecord = record => (
    <List.Item style={{ padding: 0, marginBottom: 10, border: 'none' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => openDetail(record)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') openDetail(record);
        }}
        style={{ width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong ellipsis style={{ display: 'block' }}>{record.media_name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                CID {record.cid} · {getOptionMeta('category', record.category).label} · {record.owner_name || '-'}
              </Text>
            </div>
            {renderEnumTag('integration_progress', record.integration_progress)}
          </div>
          <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
            {getOptionMeta('yyz_version', record.yyz_version).label} · {getOptionMeta('display_style', record.display_style).label}
          </Text>
          <Space size={[4, 4]} wrap>
            {renderEnumTag('importance', record.importance)}
            {renderBudgetTags(record.budget_types, { maxCount: 2 })}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            更新：{formatShortDateTime(record.updated_at || record.document_updated_at)}
          </Text>
        </Space>
      </div>
    </List.Item>
  );

  const fieldCol = isMobile ? 24 : 12;

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <Space size={10}>
          <AppstoreOutlined style={{ color: '#1677ff', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>媒体管理</Title>
          <Tag>{rows.length} 条</Tag>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} aria-label="刷新" onClick={loadRows} />
          <Button type="primary" icon={<PlusOutlined />} disabled={!canCreateMedia} onClick={openCreate}>新增媒体</Button>
        </Space>
      </div>

      <Card size="small" style={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <Space wrap size={[8, 8]} style={{ width: isMobile ? '100%' : 'auto', flex: 1 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索全部字段及文档正文"
              value={filters.search}
              onChange={event => setFilter('search', event.target.value)}
              style={{ width: isMobile ? '100%' : 260 }}
            />
            <Select allowClear placeholder="重要程度" value={filters.importance || undefined} options={mediaImportanceOptions} onChange={value => setFilter('importance', value || '')} style={{ width: isMobile ? '100%' : 120 }} />
            <Select allowClear placeholder="类目" value={filters.category || undefined} options={mediaCategoryOptions} onChange={value => setFilter('category', value || '')} style={{ width: isMobile ? '100%' : 140 }} />
            <Select allowClear placeholder="YYZ版本" value={filters.yyz_version || undefined} options={mediaYyzVersionOptions} onChange={value => setFilter('yyz_version', value || '')} style={{ width: isMobile ? '100%' : 170 }} />
            <Select allowClear placeholder="展示样式" value={filters.display_style || undefined} options={mediaDisplayStyleOptions} onChange={value => setFilter('display_style', value || '')} style={{ width: isMobile ? '100%' : 180 }} />
            <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="预算" value={filters.budget_types} options={mediaBudgetOptions} onChange={value => setFilter('budget_types', value)} style={{ width: isMobile ? '100%' : 210 }} />
            <Select allowClear placeholder="对接进度" value={filters.integration_progress || undefined} options={mediaProgressOptions} onChange={value => setFilter('integration_progress', value || '')} style={{ width: isMobile ? '100%' : 130 }} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="负责人" value={filters.owner_id || undefined} options={userOptions} onChange={value => setFilter('owner_id', value || '')} style={{ width: isMobile ? '100%' : 140 }} />
            <Select allowClear placeholder="鉴黄API" value={filters.porn_api_status || undefined} options={mediaPornApiOptions} onChange={value => setFilter('porn_api_status', value || '')} style={{ width: isMobile ? '100%' : 190 }} />
          </Space>

          <Space wrap size={[8, 8]} style={{ width: isMobile ? '100%' : undefined, justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            {!isMobile && (
              <Segmented
                size="small"
                value={tableDensity}
                onChange={setTableDensity}
                options={[
                  { value: 'middle', label: <Tooltip title="标准密度"><ColumnHeightOutlined /></Tooltip> },
                  { value: 'small', label: <Tooltip title="紧凑密度"><ColumnHeightOutlined rotate={90} /></Tooltip> },
                ]}
              />
            )}
            {!isMobile && (
              <Popover trigger="click" placement="bottomRight" content={columnSettingsMenu}>
                <Button icon={<SettingOutlined />}>列设置</Button>
              </Popover>
            )}
            <Button onClick={() => setFilters(initialFilters)} style={{ width: isMobile ? '100%' : undefined }}>
              重置筛选
            </Button>
          </Space>
        </div>

        {isMobile ? (
          <List
            loading={loading}
            dataSource={rows}
            rowKey="id"
            renderItem={renderMobileRecord}
            locale={{ emptyText: '暂无媒体记录' }}
          />
        ) : (
          <ResizableTable
            storageKey="media-management-table-columns"
            columns={columns}
            dataSource={rows}
            rowKey="id"
            loading={loading}
            size={tableDensity}
            scroll={{ x: tableScrollX }}
            onRow={record => ({
              onDoubleClick: event => {
                if (event.target?.closest?.('button, a, input, [role="button"]')) return;
                openDetail(record);
              },
              style: { cursor: 'pointer' },
            })}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: total => `共 ${total} 条` }}
          />
        )}
      </Card>

      <Modal
        title={editingRecord ? '编辑媒体' : '新增媒体'}
        open={formOpen}
        onOk={saveRecord}
        onCancel={() => {
          setFormOpen(false);
          setMediaAttachmentFileList([]);
        }}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 960}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={{ body: { maxHeight: isMobile ? 'calc(100vh - 150px)' : '70vh', overflowY: 'auto' } }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={fieldCol}>
              <Form.Item
                name="cid"
                label="CID"
                rules={[
                  { required: true, message: '请输入 CID' },
                  { validator: (_, value) => isValidMediaCid(value) ? Promise.resolve() : Promise.reject(new Error(`CID 必须是 1-${MEDIA_CID_MAX_LENGTH} 位数字`)) },
                ]}
              >
                <Input inputMode="numeric" maxLength={MEDIA_CID_MAX_LENGTH} placeholder={`1-${MEDIA_CID_MAX_LENGTH} 位数字`} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="media_name" label="媒体" rules={[{ required: true, whitespace: true, message: '请输入媒体名称' }]}>
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="importance" label="重要程度" rules={[{ required: true, message: '请选择重要程度' }]}>
                <Select options={mediaImportanceOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="category" label="类目" rules={[{ required: true, message: '请选择类目' }]}>
                <Select showSearch optionFilterProp="label" options={mediaCategoryOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="yyz_version" label="YYZ版本" rules={[{ required: true, message: '请选择 YYZ 版本' }]}>
                <Select options={mediaYyzVersionOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="display_style" label="展示样式" rules={[{ required: true, message: '请选择展示样式' }]}>
                <Select options={mediaDisplayStyleOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="domain_name" label="域名">
                <Input maxLength={255} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="version_number" label="版本号">
                <Input maxLength={80} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="latest_release_date" label="最新媒体发版时间">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="contract_valid_until" label="合同有效期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="launch_date" label="上线时间">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="latest_features" label="最新支持功能">
                <TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={5000} showCount />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="budget_types" label="预算">
                <Select mode="multiple" allowClear options={mediaBudgetOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="uv_scale" label="UV量级">
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="integration_progress" label="对接进度" rules={[{ required: true, message: '请选择对接进度' }]}>
                <Select options={mediaProgressOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="owner_id" label="负责人">
                <Select allowClear showSearch optionFilterProp="label" options={userOptions} />
              </Form.Item>
            </Col>
            <Col span={fieldCol}>
              <Form.Item name="porn_api_status" label="是否有鉴黄API功能">
                <Select allowClear options={mediaPornApiOptions} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="sdk_ui_appid" label="APPID-SDK UI版" rules={[{ max: 32, message: '最多 32 个字符' }]}>
                <Input maxLength={32} showCount />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="task_config_requirements" label="任务配置要求">
                <TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={20000} showCount />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="special_entry_info" label="特殊入口信息">
                <TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={20000} showCount />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="other_notes" label="其他特殊记录">
                <TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={20000} showCount />
              </Form.Item>
            </Col>
            {!editingRecord && (
              <Col span={24}>
                <Form.Item label="附件">
                  <Upload
                    fileList={mediaAttachmentFileList}
                    onChange={({ fileList: nextFileList }) => setMediaAttachmentFileList(nextFileList)}
                    beforeUpload={validateAttachment}
                    maxCount={10}
                    accept={ATTACHMENT_ACCEPT}
                  >
                    <Button icon={<UploadOutlined />}>选择文件（最多10个，单个最大100MB）</Button>
                  </Upload>
                </Form.Item>
              </Col>
            )}
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={detailRecord?.media_name || '媒体详情'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : '66.67vw'}
        loading={detailLoading}
        styles={{ body: { padding: isMobile ? 14 : 24 } }}
        extra={detailRecord && Number(detailRecord.can_edit) ? (
          <Button icon={<EditOutlined />} onClick={() => openEdit(detailRecord)}>编辑信息</Button>
        ) : null}
      >
        {detailRecord && (
          <>
            <Descriptions bordered size="small" column={isMobile ? 1 : 3} labelStyle={{ width: isMobile ? 110 : 128 }}>
              <Descriptions.Item label="CID"><Text code>{detailRecord.cid}</Text></Descriptions.Item>
              <Descriptions.Item label="重要程度">{renderEnumTag('importance', detailRecord.importance)}</Descriptions.Item>
              <Descriptions.Item label="对接进度">{renderEnumTag('integration_progress', detailRecord.integration_progress)}</Descriptions.Item>
              <Descriptions.Item label="类目">{getOptionMeta('category', detailRecord.category).label}</Descriptions.Item>
              <Descriptions.Item label="YYZ版本">{getOptionMeta('yyz_version', detailRecord.yyz_version).label}</Descriptions.Item>
              <Descriptions.Item label="展示样式">{getOptionMeta('display_style', detailRecord.display_style).label}</Descriptions.Item>
              <Descriptions.Item label="域名">{displayText(detailRecord.domain_name)}</Descriptions.Item>
              <Descriptions.Item label="版本号">{displayText(detailRecord.version_number)}</Descriptions.Item>
              <Descriptions.Item label="负责人">{displayText(detailRecord.owner_name)}</Descriptions.Item>
              <Descriptions.Item label="最新媒体发版时间">{displayText(detailRecord.latest_release_date)}</Descriptions.Item>
              <Descriptions.Item label="合同有效期">{displayText(detailRecord.contract_valid_until)}</Descriptions.Item>
              <Descriptions.Item label="上线时间">{displayText(detailRecord.launch_date)}</Descriptions.Item>
              <Descriptions.Item label="UV量级">{displayText(detailRecord.uv_scale)}</Descriptions.Item>
              <Descriptions.Item label="预算" span={isMobile ? 1 : 3}>{renderBudgetTags(detailRecord.budget_types)}</Descriptions.Item>
              <Descriptions.Item label="最新支持功能" span={isMobile ? 1 : 3}>{displayText(detailRecord.latest_features)}</Descriptions.Item>
              <Descriptions.Item label="是否有鉴黄API功能">{detailRecord.porn_api_status ? getOptionMeta('porn_api_status', detailRecord.porn_api_status).label : '-'}</Descriptions.Item>
              <Descriptions.Item label="APPID-SDK UI版" span={isMobile ? 1 : 2}><Text copyable={Boolean(detailRecord.sdk_ui_appid)}>{displayText(detailRecord.sdk_ui_appid)}</Text></Descriptions.Item>
              <Descriptions.Item label="任务配置要求" span={isMobile ? 1 : 3}><div style={{ whiteSpace: 'pre-wrap' }}>{displayText(detailRecord.task_config_requirements)}</div></Descriptions.Item>
              <Descriptions.Item label="特殊入口信息" span={isMobile ? 1 : 3}><div style={{ whiteSpace: 'pre-wrap' }}>{displayText(detailRecord.special_entry_info)}</div></Descriptions.Item>
              <Descriptions.Item label="其他特殊记录" span={isMobile ? 1 : 3}><div style={{ whiteSpace: 'pre-wrap' }}>{displayText(detailRecord.other_notes)}</div></Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ marginTop: 28 }}>媒体附件</Divider>
            {renderMediaAttachments()}

            <Divider orientation="left" style={{ marginTop: 28 }}>媒体文档</Divider>
            {detailRecord.document_id ? (
              <Documents
                key={detailRecord.document_id}
                embedded
                embeddedDocumentId={detailRecord.document_id}
              />
            ) : (
              <Text type="secondary">关联文档尚未创建</Text>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
