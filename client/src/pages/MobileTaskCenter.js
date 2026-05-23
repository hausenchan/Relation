import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, Col, Descriptions, Drawer, Empty, Form, Grid, Input,
  InputNumber, List, message, Modal, Popconfirm, Row, Select, Space, Switch,
  Table, Tabs, Tag, Typography,
} from 'antd';
import {
  CheckOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { mobileTaskCenterApi } from '../api';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

const statusMap = {
  matched: { label: '已匹配', color: 'green' },
  unknown: { label: '未知公司', color: 'orange' },
  skipped: { label: '已跳过', color: 'default' },
  failed: { label: '失败', color: 'red' },
};

const reviewStatusMap = {
  none: { label: '无需复核', color: 'default' },
  pending: { label: '待复核', color: 'orange' },
  reviewed: { label: '已复核', color: 'green' },
};

function formatTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function statusTag(value) {
  const cfg = statusMap[value] || { label: value || '-', color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function reviewTag(value) {
  const cfg = reviewStatusMap[value || 'none'] || { label: value || '-', color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function safeParseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatJson(value) {
  const parsed = safeParseJson(value, value);
  if (typeof parsed === 'string') return parsed;
  return JSON.stringify(parsed, null, 2);
}

function parseAttachmentIds(value) {
  const parsed = safeParseJson(value, value);
  const raw = Array.isArray(parsed) ? parsed : String(parsed || '').split(',');
  return raw.map(id => Number(id)).filter(Boolean);
}

function normalizeEntryForEdit(value) {
  if (!value) return '[]';
  const parsed = safeParseJson(value, null);
  if (parsed) return JSON.stringify(parsed, null, 2);
  return String(value);
}

function normalizeObjectForEdit(value) {
  if (!value) return '{}';
  const parsed = safeParseJson(value, null);
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
  return String(value);
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function MobileTaskCenter() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [activeTab, setActiveTab] = useState('records');
  const [apps, setApps] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [appsLoading, setAppsLoading] = useState(false);
  const [filters, setFilters] = useState({ limit: 100 });
  const [detail, setDetail] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [savingApp, setSavingApp] = useState(false);
  const [appForm] = Form.useForm();

  const loadApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      setApps(await mobileTaskCenterApi.listApps());
    } catch (e) {
      message.error(e.response?.data?.error || '加载采集 App 失败');
    } finally {
      setAppsLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      setRecords(await mobileTaskCenterApi.listRecords(filters));
    } catch (e) {
      message.error(e.response?.data?.error || '加载采集日志失败');
    } finally {
      setRecordsLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadApps(); }, [loadApps]);
  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { setReviewNote(detail?.review_note || ''); }, [detail]);

  const stats = useMemo(() => {
    const total = records.length;
    return {
      total,
      effective: records.filter(r => ['matched', 'unknown'].includes(r.status)).length,
      skipped: records.filter(r => r.status === 'skipped').length,
      failed: records.filter(r => r.status === 'failed').length,
      pendingReview: records.filter(r => r.review_status === 'pending').length,
    };
  }, [records]);

  const updateFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === undefined || value === null || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const openAddApp = () => {
    setEditingApp(null);
    appForm.setFieldsValue({
      enabled: true,
      sort_order: (apps[apps.length - 1]?.sort_order || 0) + 1,
      task_center_entry: '[]',
      collector_config: '{}',
    });
    setAppModalOpen(true);
  };

  const openEditApp = (record) => {
    setEditingApp(record);
    appForm.setFieldsValue({
      ...record,
      enabled: record.enabled !== 0,
      task_center_entry: normalizeEntryForEdit(record.task_center_entry),
      collector_config: normalizeObjectForEdit(record.collector_config),
    });
    setAppModalOpen(true);
  };

  const saveApp = async () => {
    const values = await appForm.validateFields();
    let entry = [];
    try {
      entry = values.task_center_entry ? JSON.parse(values.task_center_entry) : [];
      if (!Array.isArray(entry)) throw new Error('任务中心入口规则必须是 JSON 数组');
    } catch (err) {
      message.error(err.message || '任务中心入口规则不是有效 JSON');
      return;
    }
    let collectorConfig = {};
    try {
      collectorConfig = values.collector_config ? JSON.parse(values.collector_config) : {};
      if (!collectorConfig || Array.isArray(collectorConfig) || typeof collectorConfig !== 'object') {
        throw new Error('高级采集配置必须是 JSON 对象');
      }
    } catch (err) {
      message.error(err.message || '高级采集配置不是有效 JSON');
      return;
    }

    setSavingApp(true);
    try {
      const payload = {
        ...values,
        task_center_entry: JSON.stringify(entry),
        collector_config: JSON.stringify(collectorConfig),
        enabled: values.enabled ? 1 : 0,
      };
      if (editingApp) await mobileTaskCenterApi.updateApp(editingApp.id, payload);
      else await mobileTaskCenterApi.createApp(payload);
      message.success(editingApp ? '已更新采集 App' : '已新增采集 App');
      setAppModalOpen(false);
      setEditingApp(null);
      appForm.resetFields();
      loadApps();
    } catch (e) {
      message.error(e.response?.data?.error || '保存失败');
    } finally {
      setSavingApp(false);
    }
  };

  const deleteApp = async (id) => {
    await mobileTaskCenterApi.deleteApp(id);
    message.success('已删除');
    loadApps();
  };

  const updateRecordReview = async (reviewStatus) => {
    if (!detail) return;
    setReviewSaving(true);
    try {
      await mobileTaskCenterApi.updateRecordReview(detail.id, {
        review_status: reviewStatus,
        review_note: reviewNote,
      });
      message.success(reviewStatus === 'reviewed' ? '已标记复核完成' : '已标记待复核');
      setDetail(prev => prev ? { ...prev, review_status: reviewStatus, review_note: reviewNote } : prev);
      loadRecords();
    } catch (e) {
      message.error(e.response?.data?.error || '更新复核状态失败');
    } finally {
      setReviewSaving(false);
    }
  };

  const downloadAttachment = async (attachment) => {
    try {
      await mobileTaskCenterApi.downloadAttachment(attachment.id, attachment.filename || `attachment-${attachment.id}`);
    } catch (e) {
      message.error(e.message || '下载附件失败');
    }
  };

  const exportRecords = () => {
    const header = ['ID', '采集时间', '来源 App', '小程序', '主体', '状态', '复核状态', '产品', '公司', '产品链接', '捕获方式', '置信度', '跳过/错误', '复核备注'];
    const rows = records.map(record => [
      record.id,
      formatTime(record.collected_at),
      record.source_app,
      record.mini_program_name,
      record.company_entity_name,
      statusMap[record.status]?.label || record.status,
      reviewStatusMap[record.review_status || 'none']?.label || record.review_status,
      record.product_name || record.product_id,
      record.company_name || record.company_id,
      record.product_link,
      record.product_link_capture_method,
      record.confidence,
      record.skip_reason || record.error_message,
      record.review_note,
    ]);
    const csv = [header, ...rows].map(row => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `手机采集日志_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const recordColumns = [
    { title: '采集时间', dataIndex: 'collected_at', width: 170, fixed: 'left', render: formatTime },
    { title: '来源 App', dataIndex: 'source_app', width: 110 },
    {
      title: '小程序',
      dataIndex: 'mini_program_name',
      width: 180,
      render: value => value || <Text type="secondary">-</Text>,
    },
    {
      title: '主体',
      dataIndex: 'company_entity_name',
      width: 190,
      render: value => <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{value || '-'}</Paragraph>,
    },
    { title: '状态', dataIndex: 'status', width: 100, render: statusTag },
    { title: '复核', dataIndex: 'review_status', width: 110, render: reviewTag },
    {
      title: '产品',
      dataIndex: 'product_name',
      width: 160,
      render: (value, record) => value || (record.product_id ? `#${record.product_id}` : <Text type="secondary">-</Text>),
    },
    {
      title: '产品链接',
      dataIndex: 'product_link',
      width: 220,
      render: value => value
        ? <a href={value} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>打开链接</a>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      width: 90,
      render: value => value === null || value === undefined ? '-' : Number(value).toFixed(2),
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_, record) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>详情</Button>,
    },
  ];

  const appColumns = [
    { title: '顺序', dataIndex: 'sort_order', width: 70 },
    { title: 'App 名称', dataIndex: 'app_name', width: 130, fixed: 'left' },
    { title: '包名', dataIndex: 'package_name', width: 220 },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 90,
      render: value => value !== 0 ? <Badge status="success" text="启用" /> : <Badge status="default" text="停用" />,
    },
    {
      title: '入口规则',
      dataIndex: 'task_center_entry',
      width: 260,
      render: value => <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{formatJson(value)}</Paragraph>,
    },
    {
      title: '高级配置',
      dataIndex: 'collector_config',
      width: 220,
      render: value => value ? <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{formatJson(value)}</Paragraph> : <Text type="secondary">-</Text>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 180,
      render: value => value || <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditApp(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => deleteApp(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderRecordMobileItem = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Text strong style={{ wordBreak: 'break-word' }}>{record.mini_program_name || record.task_title || '未抓到小程序名'}</Text>
            <Space size={4}>{statusTag(record.status)}{reviewTag(record.review_status)}</Space>
          </div>
          <Text type="secondary">{record.source_app} · {formatTime(record.collected_at)}</Text>
          <Text>主体：{record.company_entity_name || '-'}</Text>
          {record.product_link && <a href={record.product_link} target="_blank" rel="noreferrer">打开产品链接</a>}
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>详情</Button>
        </Space>
      </Card>
    </List.Item>
  );

  const renderAppMobileItem = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Text strong>{record.app_name}</Text>
            {record.enabled !== 0 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>}
          </div>
          <Text type="secondary" style={{ wordBreak: 'break-all' }}>{record.package_name || '-'}</Text>
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditApp(record)}>编辑</Button>
            <Popconfirm title="确认删除？" onConfirm={() => deleteApp(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </Space>
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'records',
            label: '采集日志',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Row gutter={[12, 12]}>
                  <Col xs={12} md={4}><Card size="small"><Text type="secondary">全部记录</Text><div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total}</div></Card></Col>
                  <Col xs={12} md={5}><Card size="small"><Text type="secondary">有效入库</Text><div style={{ fontSize: 24, fontWeight: 700, color: '#10B981' }}>{stats.effective}</div></Card></Col>
                  <Col xs={12} md={5}><Card size="small"><Text type="secondary">待复核</Text><div style={{ fontSize: 24, fontWeight: 700, color: '#FA8C16' }}>{stats.pendingReview}</div></Card></Col>
                  <Col xs={12} md={5}><Card size="small"><Text type="secondary">跳过</Text><div style={{ fontSize: 24, fontWeight: 700 }}>{stats.skipped}</div></Card></Col>
                  <Col xs={12} md={5}><Card size="small"><Text type="secondary">失败</Text><div style={{ fontSize: 24, fontWeight: 700, color: '#EF4444' }}>{stats.failed}</div></Card></Col>
                </Row>

                <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space wrap>
                    <Select allowClear placeholder="状态" style={{ width: 130 }} value={filters.status} onChange={value => updateFilter('status', value)}>
                      {Object.entries(statusMap).map(([key, cfg]) => <Option key={key} value={key}>{cfg.label}</Option>)}
                    </Select>
                    <Select allowClear placeholder="来源 App" style={{ width: 150 }} value={filters.source_app} onChange={value => updateFilter('source_app', value)}>
                      {apps.map(app => <Option key={app.app_name} value={app.app_name}>{app.app_name}</Option>)}
                    </Select>
                    <Select allowClear placeholder="复核状态" style={{ width: 130 }} value={filters.review_status} onChange={value => updateFilter('review_status', value)}>
                      {Object.entries(reviewStatusMap).map(([key, cfg]) => <Option key={key} value={key}>{cfg.label}</Option>)}
                    </Select>
                    <Select value={filters.limit || 100} style={{ width: 110 }} onChange={value => updateFilter('limit', value)}>
                      <Option value={50}>50 条</Option>
                      <Option value={100}>100 条</Option>
                      <Option value={200}>200 条</Option>
                      <Option value={500}>500 条</Option>
                    </Select>
                  </Space>
                  <Space>
                    <Button icon={<DownloadOutlined />} onClick={exportRecords} disabled={!records.length}>导出</Button>
                    <Button icon={<ReloadOutlined />} onClick={loadRecords} loading={recordsLoading}>刷新</Button>
                  </Space>
                </Space>

                {isMobile ? (
                  records.length ? <List dataSource={records} renderItem={renderRecordMobileItem} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Table
                    size="small"
                    rowKey="id"
                    columns={recordColumns}
                    dataSource={records}
                    loading={recordsLoading}
                    scroll={{ x: 1410 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                  />
                )}
              </Space>
            ),
          },
          {
            key: 'apps',
            label: 'App 配置',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text type="secondary">入口规则保存为 JSON 数组；后台配置可用 `npm run mobile-task:collect -- --config-source api` 直接读取。</Text>
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={loadApps} loading={appsLoading}>刷新</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openAddApp}>新增 App</Button>
                  </Space>
                </Space>
                {isMobile ? (
                  apps.length ? <List dataSource={apps} renderItem={renderAppMobileItem} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Table
                    size="small"
                    rowKey="id"
                    columns={appColumns}
                    dataSource={apps}
                    loading={appsLoading}
                    scroll={{ x: 1320 }}
                    pagination={false}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title="采集详情"
        open={!!detail}
        onClose={() => setDetail(null)}
        width={isMobile ? '100%' : 620}
      >
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
              <Descriptions.Item label="复核状态">{reviewTag(detail.review_status)}</Descriptions.Item>
              <Descriptions.Item label="来源 App">{detail.source_app || '-'}</Descriptions.Item>
              <Descriptions.Item label="小程序">{detail.mini_program_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="主体">{detail.company_entity_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="产品">{detail.product_name || detail.product_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="公司">{detail.company_name || detail.company_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="产品链接">
                {detail.product_link ? <a href={detail.product_link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{detail.product_link}</a> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="捕获方式">{detail.product_link_capture_method || '-'}</Descriptions.Item>
              <Descriptions.Item label="采集时间">{formatTime(detail.collected_at)}</Descriptions.Item>
              <Descriptions.Item label="跳过/错误">{detail.skip_reason || detail.error_message || '-'}</Descriptions.Item>
              <Descriptions.Item label="复核人">{detail.reviewed_by_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="复核时间">{formatTime(detail.reviewed_at)}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="复核处理">
              <Space direction="vertical" style={{ width: '100%' }}>
                <TextArea
                  rows={3}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="记录处理结论，如链接冲突已确认、采集规则需调整..."
                />
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={reviewSaving}
                    onClick={() => updateRecordReview('reviewed')}
                  >
                    标记已复核
                  </Button>
                  <Button loading={reviewSaving} onClick={() => updateRecordReview('pending')}>
                    标记待复核
                  </Button>
                </Space>
              </Space>
            </Card>
            <Card size="small" title="任务内容">
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{detail.task_description || detail.task_title || '-'}</Paragraph>
            </Card>
            <Card size="small" title="截图证据">
              {(detail.screenshot_attachments?.length || parseAttachmentIds(detail.screenshot_attachment_ids).length) ? (
                <Space wrap>
                  {(detail.screenshot_attachments?.length
                    ? detail.screenshot_attachments
                    : parseAttachmentIds(detail.screenshot_attachment_ids).map(id => ({ id, filename: `截图附件 #${id}` }))
                  ).map(attachment => (
                    <Button
                      key={attachment.id}
                      icon={<PaperClipOutlined />}
                      onClick={() => downloadAttachment(attachment)}
                    >
                      {attachment.filename || `附件 #${attachment.id}`}
                    </Button>
                  ))}
                </Space>
              ) : <Text type="secondary">-</Text>}
            </Card>
            <Card size="small" title="原始载荷">
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{formatJson(detail.raw_payload)}</pre>
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        title={editingApp ? '编辑采集 App' : '新增采集 App'}
        open={appModalOpen}
        onOk={saveApp}
        onCancel={() => { setAppModalOpen(false); setEditingApp(null); appForm.resetFields(); }}
        confirmLoading={savingApp}
        okText="保存"
        width={isMobile ? '100%' : 720}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={appForm} layout="vertical" style={{ marginTop: 12 }}>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="App 名称" name="app_name" rules={[{ required: true, message: '请输入 App 名称' }]}>
                <Input placeholder="如：趣头条" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="安卓包名" name="package_name">
                <Input placeholder="如：com.jifen.qukan" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="执行顺序" name="sort_order">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="启用" name="enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="任务中心入口规则" name="task_center_entry" extra="JSON 数组，例如 wait、tap、text、swipe、keyevent 步骤。">
                <TextArea rows={8} spellCheck={false} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                label="高级采集配置"
                name="collector_config"
                extra="JSON 对象，可配置 task_button_texts、max_scan_pages、alipay_more_menu_steps、company_entity_patterns 等采集器参数。"
              >
                <TextArea rows={6} spellCheck={false} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="remark">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
