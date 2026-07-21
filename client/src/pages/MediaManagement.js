import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
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
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { mediaManagementApi, usersApi } from '../api';
import Documents from './Documents';
import ResizableTable from '../components/ResizableTable';
import { useAuth } from '../AuthContext';
import {
  buildMediaListParams,
  isValidMediaCid,
  mediaBudgetOptions,
  mediaCategoryOptions,
  mediaDisplayStyleOptions,
  mediaImportanceOptions,
  mediaOptionMaps,
  mediaPornApiOptions,
  mediaProgressOptions,
  mediaRecordToFormValues,
  mediaYyzVersionOptions,
  normalizeMediaFormPayload,
} from '../utils/mediaManagement';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

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

function renderBudgetTags(values = []) {
  if (!values.length) return <Text type="secondary">-</Text>;
  return values.map(value => <Tag key={value}>{getOptionMeta('budget_types', value).label}</Tag>);
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
  const [form] = Form.useForm();

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
    setFormOpen(true);
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    form.resetFields();
    form.setFieldsValue(mediaRecordToFormValues(record));
    setFormOpen(true);
  };

  const saveRecord = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = normalizeMediaFormPayload(values);
      const saved = editingRecord
        ? await mediaManagementApi.update(editingRecord.id, payload)
        : await mediaManagementApi.create(payload);
      setFormOpen(false);
      message.success(editingRecord ? '媒体已更新' : '媒体已创建');
      await loadRows();
      if (detailRecord?.id === saved.id) setDetailRecord(saved);
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
    try {
      const detail = await mediaManagementApi.get(record.id);
      setDetailRecord(detail);
    } catch (error) {
      message.error(error.response?.data?.error || '加载媒体详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

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

  const columns = [
    { title: 'CID', dataIndex: 'cid', width: 100, render: value => <Text code>{value}</Text> },
    {
      title: '媒体',
      dataIndex: 'media_name',
      width: 180,
      render: (value, record) => (
        <Button type="link" onClick={() => openDetail(record)} style={{ padding: 0, height: 'auto', fontWeight: 600 }}>
          {value}
        </Button>
      ),
    },
    { title: '重要程度', dataIndex: 'importance', width: 100, render: value => renderEnumTag('importance', value) },
    { title: '类目', dataIndex: 'category', width: 120, render: value => getOptionMeta('category', value).label },
    { title: 'YYZ版本', dataIndex: 'yyz_version', width: 160, render: value => getOptionMeta('yyz_version', value).label },
    { title: '域名', dataIndex: 'domain_name', width: 180, render: renderCompactText },
    { title: '版本号', dataIndex: 'version_number', width: 110, render: renderCompactText },
    { title: '最新支持功能', dataIndex: 'latest_features', width: 220, render: renderCompactText },
    { title: '展示样式', dataIndex: 'display_style', width: 180, render: value => getOptionMeta('display_style', value).label },
    { title: '预算', dataIndex: 'budget_types', width: 230, render: renderBudgetTags },
    { title: 'UV量级', dataIndex: 'uv_scale', width: 120, render: renderCompactText },
    { title: '对接进度', dataIndex: 'integration_progress', width: 110, render: value => renderEnumTag('integration_progress', value) },
    { title: '负责人', dataIndex: 'owner_name', width: 120, render: renderCompactText },
    { title: '最新媒体发版时间', dataIndex: 'latest_release_date', width: 150, render: renderCompactText },
    { title: '上线时间', dataIndex: 'launch_date', width: 110, render: renderCompactText },
    { title: '鉴黄API', dataIndex: 'porn_api_status', width: 190, render: value => value ? getOptionMeta('porn_api_status', value).label : '-' },
    { title: 'APPID-SDK UI版', dataIndex: 'sdk_ui_appid', width: 190, render: renderCompactText },
    { title: '任务配置要求', dataIndex: 'task_config_requirements', width: 220, render: renderCompactText },
    { title: '特殊入口信息', dataIndex: 'special_entry_info', width: 220, render: renderCompactText },
    { title: '其他特殊记录', dataIndex: 'other_notes', width: 220, render: renderCompactText },
    {
      title: '操作',
      key: 'actions',
      width: 150,
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
          <Popconfirm
            title="确认删除该媒体？"
            description="关联文档将停止展示，历史和附件会保留。"
            disabled={!Number(record.can_delete)}
            onConfirm={() => deleteRecord(record)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除媒体"
              disabled={!Number(record.can_delete)}
              onClick={event => event.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
              <Text type="secondary" style={{ fontSize: 12 }}>CID {record.cid}</Text>
            </div>
            {renderEnumTag('integration_progress', record.integration_progress)}
          </div>
          <Space size={[4, 4]} wrap>
            {renderEnumTag('importance', record.importance)}
            <Tag>{getOptionMeta('category', record.category).label}</Tag>
            {renderBudgetTags(record.budget_types)}
          </Space>
          <Text type="secondary">负责人：{record.owner_name || '-'}</Text>
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
        <Space wrap size={[8, 8]} style={{ width: '100%', marginBottom: 14 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索全部字段及文档正文"
            value={filters.search}
            onChange={event => setFilter('search', event.target.value)}
            style={{ width: isMobile ? '100%' : 250 }}
          />
          <Select allowClear placeholder="重要程度" value={filters.importance || undefined} options={mediaImportanceOptions} onChange={value => setFilter('importance', value || '')} style={{ width: isMobile ? '100%' : 120 }} />
          <Select allowClear placeholder="类目" value={filters.category || undefined} options={mediaCategoryOptions} onChange={value => setFilter('category', value || '')} style={{ width: isMobile ? '100%' : 140 }} />
          <Select allowClear placeholder="YYZ版本" value={filters.yyz_version || undefined} options={mediaYyzVersionOptions} onChange={value => setFilter('yyz_version', value || '')} style={{ width: isMobile ? '100%' : 170 }} />
          <Select allowClear placeholder="展示样式" value={filters.display_style || undefined} options={mediaDisplayStyleOptions} onChange={value => setFilter('display_style', value || '')} style={{ width: isMobile ? '100%' : 180 }} />
          <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="预算" value={filters.budget_types} options={mediaBudgetOptions} onChange={value => setFilter('budget_types', value)} style={{ width: isMobile ? '100%' : 210 }} />
          <Select allowClear placeholder="对接进度" value={filters.integration_progress || undefined} options={mediaProgressOptions} onChange={value => setFilter('integration_progress', value || '')} style={{ width: isMobile ? '100%' : 130 }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="负责人" value={filters.owner_id || undefined} options={userOptions} onChange={value => setFilter('owner_id', value || '')} style={{ width: isMobile ? '100%' : 140 }} />
          <Select allowClear placeholder="鉴黄API" value={filters.porn_api_status || undefined} options={mediaPornApiOptions} onChange={value => setFilter('porn_api_status', value || '')} style={{ width: isMobile ? '100%' : 190 }} />
          <Button onClick={() => setFilters(initialFilters)}>重置筛选</Button>
        </Space>

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
            scroll={{ x: 3200 }}
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
        onCancel={() => setFormOpen(false)}
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
                  { validator: (_, value) => isValidMediaCid(value) ? Promise.resolve() : Promise.reject(new Error('CID 必须是 1-8 位数字')) },
                ]}
              >
                <Input inputMode="numeric" maxLength={8} placeholder="1-8 位数字" />
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
