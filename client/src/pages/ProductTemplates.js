import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, Descriptions, Drawer, Form, Grid, Input, InputNumber, List,
  message, Modal, Row, Select, Space, Table, Tabs, Tag, Typography
} from 'antd';
import {
  CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined, FileTextOutlined,
  PlusOutlined, ReloadOutlined, SettingOutlined
} from '@ant-design/icons';
import { productReleaseProxiesApi, productTemplatesApi } from '../api';
import { useAuth } from '../AuthContext';
import { useSearchParams } from 'react-router-dom';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

const budgetTypeMap = {
  zhixiao: { label: '支小', color: 'blue' },
  douxiao: { label: '抖小', color: 'orange' },
  weixiao: { label: '微小', color: 'green' },
  kuaiyingyong: { label: '快应用', color: 'volcano' },
  h5: { label: 'H5', color: 'geekblue' },
  other: { label: '其他', color: 'default' },
};

const templateTypeMap = {
  landing_page: '落地页',
  mini_program: '小程序',
  short_drama: '短剧',
  app_page: 'App 页面',
  h5: 'H5',
  other: '其他',
};

const platformMap = {
  android: 'Android',
  ios: 'iOS',
  h5: 'H5',
  mini_program: '小程序',
  quick_app: '快应用',
  other: '其他',
};

function formatTime(value) {
  return value?.replace('T', ' ').slice(0, 19) || '-';
}

function statusTag(value) {
  return <Tag color={value === 'enabled' ? 'green' : 'default'}>{value === 'enabled' ? '启用' : '停用'}</Tag>;
}

function TemplatePanel() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user, canWrite } = useAuth();
  const canEditTemplates = canWrite ? canWrite('product_assets') : true;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ name: '', template_type: '', budget_type: '', platform: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeResult, setRuntimeResult] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const data = await productTemplatesApi.list(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error(error.response?.data?.error || '产品模版加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    if (!canEditTemplates) return;
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'enabled', project_path: 'zfb-mini-tools/playlet/player-A' });
    setModalOpen(true);
  };

  const openEdit = record => {
    if (!canEditTemplates) return;
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      code: record.code || undefined,
      template_type: record.template_type,
      budget_type: record.budget_type || undefined,
      platform: record.platform || undefined,
      version: record.version || undefined,
      status: record.status,
      project_path: record.project_path,
      description: record.description || undefined,
      remark: record.remark || undefined,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!canEditTemplates) return;
    try {
      const values = await form.validateFields();
      if (editing) await productTemplatesApi.update(editing.id, values);
      else await productTemplatesApi.create(values);
      message.success(editing ? '产品模版已更新' : '产品模版已新增');
      setModalOpen(false);
      load();
      if (detail?.id) openDetail(detail.id);
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const openDetail = async id => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await productTemplatesApi.get(id));
    } catch (error) {
      message.error(error.response?.data?.error || '模版详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const preview = async record => {
    if (!canEditTemplates) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await productTemplatesApi.preview(record.id);
      setPreviewResult(result);
      message.success('模版项目已生成');
    } catch (error) {
      message.error(error.response?.data?.error || '模版预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const remove = record => {
    Modal.confirm({
      title: '删除产品模版',
      content: `确定删除「${record.name}」吗？已被提版记录引用的模版只能停用。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!canEditTemplates) return;
        try {
          await productTemplatesApi.delete(record.id);
          message.success('产品模版已删除');
          load();
        } catch (error) {
          message.error(error.response?.data?.error || '删除失败');
        }
      },
    });
  };

  const runRuntimeCheck = async () => {
    setRuntimeLoading(true);
    try {
      setRuntimeResult(await productTemplatesApi.runtimeCheck());
    } catch (error) {
      message.error(error.response?.data?.error || '运行环境检测失败');
    } finally {
      setRuntimeLoading(false);
    }
  };

  const stats = useMemo(() => ({
    total: rows.length,
    enabled: rows.filter(item => item.status === 'enabled').length,
    disabled: rows.filter(item => item.status === 'disabled').length,
    withBudget: rows.filter(item => item.budget_type).length,
  }), [rows]);

  const columns = [
    {
      title: '模版名称',
      dataIndex: 'name',
      width: 220,
      render: (value, record) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(record.id)}>{value}</Button>,
    },
    { title: '模版类型', dataIndex: 'template_type', width: 120, render: value => templateTypeMap[value] || value || '-' },
    { title: '预算类型', dataIndex: 'budget_type', width: 110, render: value => value ? <Tag color={budgetTypeMap[value]?.color}>{budgetTypeMap[value]?.label || value}</Tag> : '-' },
    { title: '平台', dataIndex: 'platform', width: 110, render: value => platformMap[value] || value || '-' },
    { title: '版本', dataIndex: 'version', width: 110, render: value => value || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: statusTag },
    { title: '版本数', dataIndex: 'version_count', width: 90, render: value => value || 0 },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, render: formatTime },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openDetail(record.id)}>详情</Button>
          {canEditTemplates && <>
            <Button type="link" size="small" icon={<EyeOutlined />} loading={previewLoading} onClick={() => preview(record)}>预览</Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(record)}>删除</Button>
          </>}
        </Space>
      ),
    },
  ];

  const canRuntimeCheck = ['admin', 'ceo', 'coo', 'cto', 'cmo'].includes(user?.role) || ['ceo', 'coo', 'cto', 'cmo'].includes(user?.executive_role);

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '全部模版', value: stats.total, color: '#4f46e5' },
          { label: '启用模版', value: stats.enabled, color: '#059669' },
          { label: '停用模版', value: stats.disabled, color: '#6b7280' },
          { label: '有预算类型', value: stats.withBudget, color: '#2563eb' },
        ].map(item => (
          <Col xs={12} md={6} key={item.label}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: item.color, lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Card style={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space wrap>
            <Input allowClear placeholder="模版名称" style={{ width: 180 }} value={filters.name} onChange={event => setFilters({ ...filters, name: event.target.value })} />
            <Select allowClear placeholder="模版类型" style={{ width: 140 }} value={filters.template_type || undefined} onChange={value => setFilters({ ...filters, template_type: value || '' })}>
              {Object.entries(templateTypeMap).map(([key, label]) => <Option key={key} value={key}>{label}</Option>)}
            </Select>
            <Select allowClear placeholder="预算类型" style={{ width: 130 }} value={filters.budget_type || undefined} onChange={value => setFilters({ ...filters, budget_type: value || '' })}>
              {Object.entries(budgetTypeMap).map(([key, value]) => <Option key={key} value={key}>{value.label}</Option>)}
            </Select>
            <Select allowClear placeholder="平台" style={{ width: 120 }} value={filters.platform || undefined} onChange={value => setFilters({ ...filters, platform: value || '' })}>
              {Object.entries(platformMap).map(([key, label]) => <Option key={key} value={key}>{label}</Option>)}
            </Select>
            <Select allowClear placeholder="状态" style={{ width: 110 }} value={filters.status || undefined} onChange={value => setFilters({ ...filters, status: value || '' })}>
              <Option value="enabled">启用</Option>
              <Option value="disabled">停用</Option>
            </Select>
          </Space>
          <Space>
            {canRuntimeCheck && <Button icon={<SettingOutlined />} loading={runtimeLoading} onClick={runRuntimeCheck}>运行环境检测</Button>}
            {canEditTemplates && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模版</Button>}
          </Space>
        </Space>

        {runtimeResult && (
          <Alert
            type={runtimeResult.git?.available && runtimeResult.node?.available && runtimeResult.minidev?.available && runtimeResult.work_directory?.available ? 'success' : 'warning'}
            showIcon
            closable
            style={{ marginBottom: 16 }}
            message="运行环境检测结果"
            description={(
              <Space wrap>
                <Tag color={runtimeResult.git?.available ? 'green' : 'red'}>Git {runtimeResult.git?.available ? '可用' : '不可用'}</Tag>
                <Tag color={runtimeResult.node?.available ? 'green' : 'red'}>Node.js {runtimeResult.node?.available ? '可用' : '不可用'}</Tag>
                <Tag color={runtimeResult.minidev?.available ? 'green' : 'red'}>minidev {runtimeResult.minidev?.available ? '可用' : '不可用'}</Tag>
                <Tag color={runtimeResult.upload_script?.available ? 'green' : 'red'}>upload.js {runtimeResult.upload_script?.available ? '可用' : '不可用'}</Tag>
                <Tag color={runtimeResult.work_directory?.available ? 'green' : 'red'}>工作目录 {runtimeResult.work_directory?.available ? '可写' : '不可写'}</Tag>
              </Space>
            )}
          />
        )}

        {previewResult && (
          <Alert
            type="success"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            message="模版项目预览目录已生成"
            description={(
              <Space wrap>
                <Text code>{previewResult.path}</Text>
                <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(previewResult.path).then(() => message.success('路径已复制'))}>复制路径</Button>
                <Text type="secondary">{previewResult.files} 个文件 · {previewResult.bytes} bytes</Text>
              </Space>
            )}
          />
        )}

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1250 }}
          pagination={{ defaultPageSize: 20, showTotal: total => `共 ${total} 条` }}
        />
      </Card>

      <Modal
        title={editing ? '编辑产品模版' : '新增产品模版'}
        open={modalOpen}
        onOk={save}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 720}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}><Form.Item name="name" label="模版名称" rules={[{ required: true, message: '请输入模版名称' }]}><Input placeholder="请输入模版名称" /></Form.Item></Col>
            <Col span={isMobile ? 24 : 12}><Form.Item name="code" label="模版编码"><Input placeholder="可选，便于系统识别" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="template_type" label="模版类型" rules={[{ required: true, message: '请选择模版类型' }]}>
                <Select placeholder="请选择模版类型">{Object.entries(templateTypeMap).map(([key, label]) => <Option key={key} value={key}>{label}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="budget_type" label="预算类型"><Select allowClear placeholder="请选择预算类型">{Object.entries(budgetTypeMap).map(([key, value]) => <Option key={key} value={key}>{value.label}</Option>)}</Select></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}><Form.Item name="platform" label="平台"><Select allowClear placeholder="请选择平台">{Object.entries(platformMap).map(([key, label]) => <Option key={key} value={key}>{label}</Option>)}</Select></Form.Item></Col>
            <Col span={isMobile ? 24 : 12}><Form.Item name="version" label="版本"><Input placeholder="展示用版本号" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}><Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}><Select><Option value="enabled">启用</Option><Option value="disabled">停用</Option></Select></Form.Item></Col>
            <Col span={isMobile ? 24 : 12}><Form.Item name="project_path" label="项目目录" rules={[{ required: true, message: '请输入项目目录' }]}><Input placeholder="相对于 Git 仓库的目录" /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="描述"><TextArea rows={3} placeholder="模版用途和使用说明" /></Form.Item>
          <Form.Item name="remark" label="备注"><TextArea rows={2} placeholder="内部备注" /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="产品模版详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={isMobile ? '100%' : 820}>
        {detailLoading ? <Text type="secondary">加载中...</Text> : detail && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Space wrap>
              {canEditTemplates && <>
                <Button type="primary" icon={<EyeOutlined />} loading={previewLoading} onClick={() => preview(detail)}>预览项目</Button>
                <Button icon={<EditOutlined />} onClick={() => openEdit(detail)}>编辑模版</Button>
              </>}
              <Button icon={<ReloadOutlined />} onClick={() => openDetail(detail.id)}>刷新</Button>
            </Space>
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 130 }}>
              <Descriptions.Item label="模版名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="模版编码">{detail.code || '-'}</Descriptions.Item>
              <Descriptions.Item label="模版类型">{templateTypeMap[detail.template_type] || detail.template_type}</Descriptions.Item>
              <Descriptions.Item label="预算类型">{budgetTypeMap[detail.budget_type]?.label || detail.budget_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="平台">{platformMap[detail.platform] || detail.platform || '-'}</Descriptions.Item>
              <Descriptions.Item label="版本">{detail.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
              <Descriptions.Item label="项目目录">{detail.project_path}</Descriptions.Item>
              <Descriptions.Item label="描述"><div style={{ whiteSpace: 'pre-wrap' }}>{detail.description || '-'}</div></Descriptions.Item>
              <Descriptions.Item label="备注"><div style={{ whiteSpace: 'pre-wrap' }}>{detail.remark || '-'}</div></Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(detail.created_at)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatTime(detail.updated_at)}</Descriptions.Item>
            </Descriptions>
            <div>
              <Text strong><FileTextOutlined /> 模版版本快照</Text>
              <List
                style={{ marginTop: 12 }}
                size="small"
                bordered
                dataSource={detail.versions || []}
                locale={{ emptyText: '暂无版本' }}
                renderItem={version => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Space><Text strong>{version.version_label || `版本 ${version.id}`}</Text>{version.is_current ? <Tag color="green">当前版本</Tag> : null}</Space>
                      <Text type="secondary">{version.project_path} · {formatTime(version.created_at)}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}

function ProxyPanel() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { canWrite } = useAuth();
  const canEditProxies = canWrite ? canWrite('product_assets') : true;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ name: '', status: '', domain_suffix: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const data = await productReleaseProxiesApi.list(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error(error.response?.data?.error || '代理配置加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    if (!canEditProxies) return;
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ protocol: 'http', port: 8080, priority: 100, status: 'enabled', domain_suffixes: ['*'] });
    setModalOpen(true);
  };

  const openEdit = record => {
    if (!canEditProxies) return;
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      protocol: record.protocol,
      host: record.host,
      port: record.port,
      username: '',
      password: '',
      domain_suffixes: record.domain_suffixes || [],
      priority: record.priority,
      status: record.status,
      remark: record.remark || '',
      clear_username: false,
      clear_password: false,
    });
    setModalOpen(true);
  };

  const openDetail = async id => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await productReleaseProxiesApi.get(id));
    } catch (error) {
      message.error(error.response?.data?.error || '代理详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const save = async () => {
    if (!canEditProxies) return;
    try {
      const values = await form.validateFields();
      const payload = { ...values };
      if (!payload.password) delete payload.password;
      if (!payload.username) delete payload.username;
      delete payload.clear_username;
      delete payload.clear_password;
      if (editing && values.clear_username) payload.clear_username = true;
      if (editing && values.clear_password) payload.clear_password = true;
      if (editing) await productReleaseProxiesApi.update(editing.id, payload);
      else await productReleaseProxiesApi.create(payload);
      message.success(editing ? '代理配置已更新' : '代理配置已新增');
      setModalOpen(false);
      load();
      if (detail?.id) openDetail(detail.id);
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.response?.data?.error || '代理配置保存失败');
    }
  };

  const remove = record => {
    if (!canEditProxies) return;
    Modal.confirm({
      title: '删除代理配置',
      content: `确定删除「${record.name}」吗？已创建的提版任务仍会使用任务快照。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await productReleaseProxiesApi.delete(record.id);
          message.success('代理配置已删除');
          load();
        } catch (error) {
          message.error(error.response?.data?.error || '代理配置删除失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '代理名称',
      dataIndex: 'name',
      width: 180,
      render: (value, record) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(record.id)}>{value}</Button>,
    },
    { title: '出口地址', key: 'endpoint', width: 220, render: (_, record) => `${record.protocol}://${record.host}:${record.port}` },
    {
      title: '域名后缀',
      dataIndex: 'domain_suffixes',
      width: 260,
      render: values => <Space wrap size={[4, 4]}>{(values || []).map(value => <Tag key={value}>{value}</Tag>)}</Space>,
    },
    { title: '优先级', dataIndex: 'priority', width: 90 },
    { title: '认证', key: 'auth', width: 90, render: (_, record) => record.has_auth ? <Tag color="blue">已配置</Tag> : <Text type="secondary">无</Text> },
    { title: '状态', dataIndex: 'status', width: 90, render: statusTag },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, render: formatTime },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openDetail(record.id)}>详情</Button>
          {canEditProxies && <>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(record)}>删除</Button>
          </>}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <Card style={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space wrap>
            <Input allowClear placeholder="代理名称" style={{ width: 180 }} value={filters.name} onChange={event => setFilters({ ...filters, name: event.target.value })} />
            <Input allowClear placeholder="域名后缀" style={{ width: 180 }} value={filters.domain_suffix} onChange={event => setFilters({ ...filters, domain_suffix: event.target.value })} />
            <Select allowClear placeholder="状态" style={{ width: 110 }} value={filters.status || undefined} onChange={value => setFilters({ ...filters, status: value || '' })}>
              <Option value="enabled">启用</Option>
              <Option value="disabled">停用</Option>
            </Select>
          </Space>
          {canEditProxies && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增代理</Button>}
        </Space>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} scroll={{ x: 1250 }} pagination={{ defaultPageSize: 20, showTotal: total => `共 ${total} 条` }} />
      </Card>

      <Modal
        title={editing ? '编辑代理配置' : '新增代理配置'}
        open={modalOpen}
        onOk={save}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 720}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}><Form.Item name="name" label="代理名称" rules={[{ required: true, message: '请输入代理名称' }]}><Input placeholder="例如：支付宝生产出口" /></Form.Item></Col>
            <Col span={isMobile ? 24 : 12}><Form.Item name="protocol" label="协议" rules={[{ required: true, message: '请选择协议' }]}><Select><Option value="http">HTTP</Option><Option value="https">HTTPS</Option></Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 16}><Form.Item name="host" label="代理主机/IP" rules={[{ required: true, message: '请输入代理主机/IP' }]}><Input placeholder="代理服务器地址" /></Form.Item></Col>
            <Col span={isMobile ? 24 : 8}><Form.Item name="port" label="端口" rules={[{ required: true, message: '请输入端口' }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}><Form.Item name="username" label="账号"><Input autoComplete="off" placeholder={editing ? '留空保持原账号' : '可选'} /></Form.Item></Col>
            <Col span={isMobile ? 24 : 12}><Form.Item name="password" label="密码"><Input.Password autoComplete="new-password" placeholder={editing ? '留空保持原密码' : '可选'} /></Form.Item></Col>
          </Row>
          {editing && <Space wrap style={{ marginBottom: 16 }}>
            <Form.Item name="clear_username" valuePropName="checked" noStyle><Checkbox>清除账号</Checkbox></Form.Item>
            <Form.Item name="clear_password" valuePropName="checked" noStyle><Checkbox>清除密码</Checkbox></Form.Item>
          </Space>}
          <Form.Item name="domain_suffixes" label="域名后缀" rules={[{ required: true, message: '至少配置一个域名后缀' }]}>
            <Select mode="tags" tokenSeparators={[',', '，', ';', '；']} placeholder="例如 example.com 或 *" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}><Form.Item name="priority" label="优先级"><InputNumber min={0} max={100000} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={isMobile ? 24 : 12}><Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}><Select><Option value="enabled">启用</Option><Option value="disabled">停用</Option></Select></Form.Item></Col>
          </Row>
          <Form.Item name="remark" label="备注"><TextArea rows={3} placeholder="代理用途或维护说明" /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="代理配置详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={isMobile ? '100%' : 620}>
        {detailLoading ? <Text type="secondary">加载中...</Text> : detail && (
          <Descriptions column={1} bordered size="small" labelStyle={{ width: 130 }}>
            <Descriptions.Item label="代理名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="协议">{detail.protocol?.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="出口地址">{detail.host}:{detail.port}</Descriptions.Item>
            <Descriptions.Item label="账号">{detail.username_mask || '未配置'}</Descriptions.Item>
            <Descriptions.Item label="密码">{detail.has_password ? '已配置' : '未配置'}</Descriptions.Item>
            <Descriptions.Item label="域名后缀"><Space wrap>{(detail.domain_suffixes || []).map(value => <Tag key={value}>{value}</Tag>)}</Space></Descriptions.Item>
            <Descriptions.Item label="优先级">{detail.priority}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
            <Descriptions.Item label="备注"><div style={{ whiteSpace: 'pre-wrap' }}>{detail.remark || '-'}</div></Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatTime(detail.updated_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}

export default function ProductTemplates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get('tab') === 'proxy' ? 'proxy' : 'template';
  const onTabChange = key => {
    const next = new URLSearchParams(searchParams);
    if (key === 'proxy') next.set('tab', 'proxy');
    else next.delete('tab');
    setSearchParams(next);
  };

  return (
    <Tabs
      activeKey={activeKey}
      onChange={onTabChange}
      items={[
        { key: 'template', label: '模版', children: <TemplatePanel /> },
        { key: 'proxy', label: '代理', children: <ProxyPanel /> },
      ]}
    />
  );
}
