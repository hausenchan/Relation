import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Descriptions, Tabs, Card, Row, Col, Typography, Divider, DatePicker, AutoComplete } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, RiseOutlined, LinkOutlined, BranchesOutlined, FileSearchOutlined, FileTextOutlined, NodeIndexOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const { TextArea } = Input;
const { Option } = Select;

const dimensionMap = {
  monetization: { label: '变现策略', color: 'green', icon: <RiseOutlined /> },
  traffic: { label: '流量策略', color: 'blue', icon: <ThunderboltOutlined /> },
  link: { label: '链路策略', color: 'orange', icon: <LinkOutlined /> },
};

const roleTypeMap = {
  budget_delivery: { label: '预算交付岗', color: 'purple' },
  traffic_operation: { label: '流量运营岗', color: 'cyan' },
};

const budgetGroupTypeMap = {
  zhixiao: { label: '支小', color: 'blue' },
  douxiao: { label: '抖小', color: 'orange' },
  weixiao: { label: '微小', color: 'green' },
  taoxiao: { label: '淘小', color: 'red' },
  app: { label: 'App', color: 'purple' },
  cpa: { label: 'CPA', color: 'cyan' },
  h5: { label: 'H5', color: 'geekblue' },
  cpd: { label: 'CPD', color: 'magenta' },
  kuaiyingyong: { label: '快应用', color: 'volcano' },
};

const statusMap = {
  not_started: { label: '未开始', color: 'default' },
  active: { label: '进行中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  paused: { label: '暂停', color: 'orange' },
};

const effectJudgementMap = {
  pending: { label: '待观察', color: 'default' },
  effective: { label: '有效', color: 'green' },
  normal: { label: '一般', color: 'orange' },
  invalid: { label: '无效', color: 'red' },
};

const actionTypeMap = {
  budget_adjust: '调整预算',
  creative_adjust: '调整创意',
  landing_page_adjust: '调整落地页',
  copy_adjust: '调整文案',
  media_add: '新增媒体',
  media_remove: '下线媒体',
  ab_test: 'AB测试',
  other: '其他',
};

export default function Strategies() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState([]);
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [form] = Form.useForm();
  const [logForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('all');
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  // 筛选
  const [filters, setFilters] = useState({
    id: '',
    dimension: '',
    role_type: '',
    budget_group_type: '',
    status: '',
    media: '',
    access_method: '',
  });

  useEffect(() => {
    fetchStrategies();
    fetchUsers();
    fetchLeads();
  }, [filters]);

  const getErrorMessage = async (res, fallback) => {
    try {
      const data = await res.json();
      return data?.error || fallback;
    } catch {
      return fallback;
    }
  };

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.id) params.append('id', filters.id);
      if (filters.dimension) params.append('dimension', filters.dimension);
      if (filters.role_type) params.append('role_type', filters.role_type);
      if (filters.budget_group_type) params.append('budget_group_type', filters.budget_group_type);
      if (filters.status) params.append('status', filters.status);
      if (filters.media) params.append('media', filters.media);
      if (filters.access_method) params.append('access_method', filters.access_method);

      const res = await fetch(`/api/strategies?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '策略列表加载失败'));
      }
      const data = await res.json();
      setStrategies(Array.isArray(data) ? data : []);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '负责人列表加载失败'));
      }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsers([]);
      console.error(err);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '来源线索列表加载失败'));
      }
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      setLeads([]);
      console.error(err);
    }
  };

  const handleAdd = () => {
    setEditingStrategy(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingStrategy(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      onOk: async () => {
        try {
          await fetch(`/api/strategies/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          message.success('删除成功');
          fetchStrategies();
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const url = editingStrategy
        ? `/api/strategies/${editingStrategy.id}`
        : '/api/strategies';
      const method = editingStrategy ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          ...values,
          source_type: values.source_id ? 'lead' : null,
          source_id: values.source_id ? Number(values.source_id) : null,
        }),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, editingStrategy ? '更新失败' : '创建失败'));
      }

      message.success(editingStrategy ? '更新成功' : '创建成功');
      setModalVisible(false);
      fetchStrategies();
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  };

  const showDetail = (record) => {
    setSelectedStrategy(record);
    setDrawerVisible(true);
    // 加载关联数据
    fetchStrategyDetail(record.id);
  };

  const fetchStrategyDetail = async (id) => {
    try {
      const res = await fetch(`/api/strategies/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '策略详情加载失败'));
      }
      const data = await res.json();
      setSelectedStrategy(data);
      reviewForm.setFieldsValue({
        baseline_value: data.review?.baseline_value,
        target_value: data.review?.target_value,
        actual_value: data.review?.actual_value,
        result_summary: data.review?.result_summary,
        effect_judgement: data.review?.effect_judgement,
        review_note: data.review?.review_note,
        next_action: data.review?.next_action,
      });
    } catch (err) {
      message.error(err.message || '加载失败');
      setDrawerVisible(false);
      console.error(err);
    }
  };

  const openAddLog = () => {
    setEditingLog(null);
    logForm.resetFields();
    logForm.setFieldsValue({
      execute_date: dayjs(),
      executor_id: user?.id,
      continue_flag: 1,
    });
    setLogModalVisible(true);
  };

  const openEditLog = (record) => {
    setEditingLog(record);
    logForm.setFieldsValue({
      ...record,
      execute_date: record.execute_date ? dayjs(record.execute_date) : null,
    });
    setLogModalVisible(true);
  };

  const handleSaveLog = async () => {
    if (!selectedStrategy) return;
    try {
      const values = await logForm.validateFields();
      const payload = {
        ...values,
        execute_date: values.execute_date?.format('YYYY-MM-DD'),
      };

      const url = editingLog
        ? `/api/strategy-execution-logs/${editingLog.id}`
        : `/api/strategies/${selectedStrategy.id}/execution-logs`;
      const method = editingLog ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, editingLog ? '更新执行记录失败' : '新增执行记录失败'));
      }

      message.success(editingLog ? '执行记录已更新' : '执行记录已新增');
      setLogModalVisible(false);
      fetchStrategyDetail(selectedStrategy.id);
      fetchStrategies();
    } catch (err) {
      message.error(err.message || '保存失败');
    }
  };

  const handleDeleteLog = async (id) => {
    try {
      const res = await fetch(`/api/strategy-execution-logs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '删除执行记录失败'));
      }
      message.success('执行记录已删除');
      fetchStrategyDetail(selectedStrategy.id);
      fetchStrategies();
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const handleSaveReview = async () => {
    if (!selectedStrategy) return;
    setReviewSaving(true);
    try {
      const values = await reviewForm.validateFields();
      const res = await fetch(`/api/strategies/${selectedStrategy.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '保存复盘失败'));
      }
      message.success('策略复盘已保存');
      fetchStrategyDetail(selectedStrategy.id);
      fetchStrategies();
    } catch (err) {
      message.error(err.message || '保存失败');
    } finally {
      setReviewSaving(false);
    }
  };

  const columns = [
    {
      title: '策略ID',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '策略标题',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      ellipsis: true,
      render: (text, record) => (
        <Button type="link" style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => showDetail(record)}>
          {text}
        </Button>
      ),
    },
    {
      title: '维度',
      dataIndex: 'dimension',
      key: 'dimension',
      width: 120,
      render: (val) => {
        const cfg = dimensionMap[val] || { label: val, color: 'default', icon: null };
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      },
    },
    {
      title: '岗位类型',
      dataIndex: 'role_type',
      key: 'role_type',
      width: 120,
      render: (val) => {
        if (!val) return '-';
        const cfg = roleTypeMap[val] || { label: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '预算组类型',
      dataIndex: 'budget_group_type',
      key: 'budget_group_type',
      width: 120,
      render: (val) => {
        if (!val) return '-';
        const cfg = budgetGroupTypeMap[val] || { label: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '媒体',
      dataIndex: 'media',
      key: 'media',
      width: 120,
      render: (val) => val || '-',
    },
    {
      title: '对接方式',
      dataIndex: 'access_method',
      key: 'access_method',
      width: 120,
      render: (val) => {
        if (!val) return '-';
        const labelMap = { yyz_ui: 'YYZ-UI', yyz_api: 'YYZ-API', yyz_h5: 'YYZ-H5' };
        return labelMap[val] || val;
      },
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: '来源线索',
      dataIndex: 'source_lead_id',
      key: 'source_lead_id',
      width: 170,
      render: (_, record) => {
        if (!record.source_lead_id) return '-';
        const shortTitle = record.source_title?.length > 6
          ? `${record.source_title.slice(0, 6)}...`
          : record.source_title;
        return (
          <Space direction="vertical" size={0}>
            <Text strong>{record.source_lead_id}</Text>
            {shortTitle && <Text type="secondary" style={{ fontSize: 12 }}>{shortTitle}</Text>}
          </Space>
        );
      },
    },
    {
      title: '关联需求数',
      dataIndex: 'dev_task_count',
      key: 'dev_task_count',
      width: 100,
      render: (value) => value ?? 0,
    },
    {
      title: '关联需求详情',
      dataIndex: 'dev_task_details',
      key: 'dev_task_details',
      width: 220,
      render: (value) => {
        if (!value) return '-';
        const items = value.split('||').filter(Boolean).slice(0, 3);
        return (
          <Space direction="vertical" size={0}>
            {items.map(item => {
              const [id, ...titleParts] = item.split(':');
              const title = titleParts.join(':');
              const shortTitle = title?.length > 6 ? `${title.slice(0, 6)}...` : title;
              return <Text key={item} style={{ fontSize: 12 }}>{id} · {shortTitle}</Text>;
            })}
          </Space>
        );
      },
    },
    {
      title: '最新结果摘要',
      dataIndex: 'latest_result_summary',
      key: 'latest_result_summary',
      width: 180,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '效果结论',
      dataIndex: 'effect_judgement',
      key: 'effect_judgement',
      width: 100,
      render: (value) => {
        if (!value) return '-';
        const cfg = effectJudgementMap[value] || { label: value, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val) => {
        const cfg = statusMap[val] || { label: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val) => val?.replace('T', ' ').substring(0, 19) || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => showDetail(record)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  // 按维度分组数据
  const getFilteredData = () => {
    if (activeTab === 'all') return strategies;
    return strategies.filter(s => s.dimension === activeTab);
  };

  // 统计
  const stats = {
    total: strategies.length,
    monetization: strategies.filter(s => s.dimension === 'monetization').length,
    traffic: strategies.filter(s => s.dimension === 'traffic').length,
    link: strategies.filter(s => s.dimension === 'link').length,
  };

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '总策略数', value: stats.total, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { label: '变现策略', value: stats.monetization, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
          { label: '流量策略', value: stats.traffic, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '链路策略', value: stats.link, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
        ].map((item, idx) => (
          <Col xs={12} sm={6} key={idx}>
            <div className="stat-card" style={{
              background: item.gradient, borderRadius: 10, padding: '14px 18px',
              cursor: 'default',
            }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 筛选、Tabs与表格 */}
      <Card style={{ borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Space size={12} wrap>
          <Input
            placeholder="策略ID"
            style={{ width: 120 }}
            allowClear
            value={filters.id}
            onChange={(e) => setFilters({ ...filters, id: e.target.value })}
          />
          <Select
            placeholder="维度"
            style={{ width: 150 }}
            allowClear
            value={filters.dimension || undefined}
            onChange={(val) => setFilters({ ...filters, dimension: val || '' })}
          >
            <Option value="monetization">变现策略</Option>
            <Option value="traffic">流量策略</Option>
            <Option value="link">链路策略</Option>
          </Select>
          <Select
            placeholder="岗位类型"
            style={{ width: 150 }}
            allowClear
            value={filters.role_type || undefined}
            onChange={(val) => setFilters({ ...filters, role_type: val || '' })}
          >
            <Option value="budget_delivery">预算交付岗</Option>
            <Option value="traffic_operation">流量运营岗</Option>
          </Select>
          <Select
            placeholder="预算组类型"
            style={{ width: 150 }}
            allowClear
            value={filters.budget_group_type || undefined}
            onChange={(val) => setFilters({ ...filters, budget_group_type: val || '' })}
          >
            <Option value="zhixiao">支小</Option>
            <Option value="douxiao">抖小</Option>
            <Option value="weixiao">微小</Option>
            <Option value="taoxiao">淘小</Option>
            <Option value="app">App</Option>
            <Option value="cpa">CPA</Option>
            <Option value="h5">H5</Option>
            <Option value="cpd">CPD</Option>
            <Option value="kuaiyingyong">快应用</Option>
          </Select>
          <Select
            placeholder="状态"
            style={{ width: 150 }}
            allowClear
            value={filters.status || undefined}
            onChange={(val) => setFilters({ ...filters, status: val || '' })}
          >
            <Option value="not_started">未开始</Option>
            <Option value="active">进行中</Option>
            <Option value="completed">已完成</Option>
            <Option value="paused">暂停</Option>
          </Select>
          <Input
            placeholder="媒体"
            style={{ width: 150 }}
            allowClear
            value={filters.media}
            onChange={(e) => setFilters({ ...filters, media: e.target.value })}
            onPressEnter={fetchStrategies}
            onBlur={fetchStrategies}
          />
          <Select
            placeholder="对接方式"
            style={{ width: 150 }}
            allowClear
            value={filters.access_method || undefined}
            onChange={(val) => setFilters({ ...filters, access_method: val || '' })}
          >
            <Option value="yyz_ui">YYZ-UI</Option>
            <Option value="yyz_api">YYZ-API</Option>
            <Option value="yyz_h5">YYZ-H5</Option>
          </Select>
        </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增策略</Button>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'all', label: `全部 (${stats.total})` },
            { key: 'monetization', label: <span><RiseOutlined /> 变现策略 ({stats.monetization})</span> },
            { key: 'traffic', label: <span><ThunderboltOutlined /> 流量策略 ({stats.traffic})</span> },
            { key: 'link', label: <span><LinkOutlined /> 链路策略 ({stats.link})</span> },
          ]}
        />

        <Table
          columns={columns}
          dataSource={getFilteredData()}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1920 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Modal
        title={editingStrategy ? '编辑策略' : '新增策略'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="策略标题" rules={[{ required: true, message: '请输入策略标题' }]}>
            <Input placeholder="请输入策略标题" />
          </Form.Item>
          <Form.Item name="dimension" label="维度" rules={[{ required: true, message: '请选择维度' }]}>
            <Select placeholder="请选择维度">
              <Option value="monetization">变现策略</Option>
              <Option value="traffic">流量策略</Option>
              <Option value="link">链路策略</Option>
            </Select>
          </Form.Item>
          <Form.Item name="owner_id" label="负责人" rules={[{ required: true, message: '请选择负责人' }]}>
            <Select
              placeholder={users.length > 0 ? '请选择负责人' : '暂无可选负责人'}
              showSearch
              optionFilterProp="label"
              allowClear
              options={users.map(u => ({
                value: u.id,
                label: u.display_name || u.username || `用户${u.id}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="source_id" label="来源线索ID">
            <AutoComplete
              allowClear
              options={leads.map(lead => ({
                value: String(lead.id),
                label: `${lead.id} · ${lead.title}`,
              }))}
              placeholder="可输入线索ID，也可下拉选择"
              filterOption={(inputValue, option) => (option?.label ?? '').toLowerCase().includes(inputValue.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="role_type" label="岗位类型">
            <Select placeholder="请选择岗位类型" allowClear>
              <Option value="budget_delivery">预算交付岗</Option>
              <Option value="traffic_operation">流量运营岗</Option>
            </Select>
          </Form.Item>
          <Form.Item name="budget_group_type" label="预算组类型（如果是流量运营策略，可以不填）">
            <Select placeholder="请选择预算组类型" allowClear>
              <Option value="zhixiao">支小</Option>
              <Option value="douxiao">抖小</Option>
              <Option value="weixiao">微小</Option>
              <Option value="taoxiao">淘小</Option>
              <Option value="app">App</Option>
              <Option value="cpa">CPA</Option>
              <Option value="h5">H5</Option>
              <Option value="cpd">CPD</Option>
              <Option value="kuaiyingyong">快应用</Option>
            </Select>
          </Form.Item>
          <Form.Item name="media" label="媒体（如果是预算策略，可以不填）">
            <Input placeholder="请输入媒体" />
          </Form.Item>
          <Form.Item name="access_method" label="对接方式（如果是预算策略，可以不填）">
            <Select placeholder="请选择对接方式" allowClear>
              <Option value="yyz_ui">YYZ-UI</Option>
              <Option value="yyz_api">YYZ-API</Option>
              <Option value="yyz_h5">YYZ-H5</Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="策略描述">
            <TextArea rows={4} placeholder="请输入策略描述" />
          </Form.Item>
          {editingStrategy && (
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态">
                <Option value="not_started">未开始</Option>
                <Option value="active">进行中</Option>
                <Option value="completed">已完成</Option>
                <Option value="paused">暂停</Option>
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title="策略详情"
        placement="right"
        width={900}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedStrategy && (
          <>
            <Tabs
              items={[
                {
                  key: 'basic',
                  label: <span><FileTextOutlined /> 基本信息</span>,
                  children: (
                    <Descriptions column={1} bordered>
                      <Descriptions.Item label="策略标题">{selectedStrategy.title}</Descriptions.Item>
                      <Descriptions.Item label="维度">
                        {dimensionMap[selectedStrategy.dimension]?.label || selectedStrategy.dimension}
                      </Descriptions.Item>
                      <Descriptions.Item label="岗位类型">
                        {selectedStrategy.role_type ? roleTypeMap[selectedStrategy.role_type]?.label : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="预算组类型">
                        {selectedStrategy.budget_group_type ? budgetGroupTypeMap[selectedStrategy.budget_group_type]?.label : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="媒体">{selectedStrategy.media || '-'}</Descriptions.Item>
                      <Descriptions.Item label="对接方式">{selectedStrategy.access_method || '-'}</Descriptions.Item>
                      <Descriptions.Item label="负责人">{selectedStrategy.owner_name || '-'}</Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Tag color={statusMap[selectedStrategy.status]?.color}>
                          {statusMap[selectedStrategy.status]?.label}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="策略描述">
                        <div style={{ whiteSpace: 'pre-wrap' }}>{selectedStrategy.description || '-'}</div>
                      </Descriptions.Item>
                      <Descriptions.Item label="创建时间">
                        {selectedStrategy.created_at?.replace('T', ' ').substring(0, 19)}
                      </Descriptions.Item>
                      <Descriptions.Item label="更新时间">
                        {selectedStrategy.updated_at?.replace('T', ' ').substring(0, 19)}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'traceability',
                  label: <span><NodeIndexOutlined /> 关联追溯</span>,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                      <Card size="small" title="来源线索">
                        {selectedStrategy.source_info ? (
                          <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="线索ID">{selectedStrategy.source_info.id}</Descriptions.Item>
                            <Descriptions.Item label="线索标题">{selectedStrategy.source_info.title}</Descriptions.Item>
                            <Descriptions.Item label="线索状态">{selectedStrategy.source_info.status || '-'}</Descriptions.Item>
                            <Descriptions.Item label="优先级">{selectedStrategy.source_info.priority || '-'}</Descriptions.Item>
                          </Descriptions>
                        ) : (
                          <Text type="secondary">暂无来源线索</Text>
                        )}
                      </Card>

                      <Card size="small" title={`关联需求 (${selectedStrategy.devTasks?.length || 0})`}>
                        {selectedStrategy.devTasks && selectedStrategy.devTasks.length > 0 ? (
                          <Table
                            dataSource={selectedStrategy.devTasks}
                            rowKey="id"
                            size="small"
                            pagination={false}
                            columns={[
                              {
                                title: '需求',
                                key: 'title',
                                render: (_, row) => {
                                  const shortTitle = row.title?.length > 6 ? `${row.title.slice(0, 6)}...` : row.title;
                                  return `${row.id} · ${shortTitle || '-'}`;
                                },
                              },
                              { title: '负责人', dataIndex: 'assignee_name', key: 'assignee_name' },
                              { title: '状态', dataIndex: 'status', key: 'status', render: (val) => <Tag color={{ pending: 'default', in_progress: 'blue', testing: 'orange', completed: 'green', blocked: 'red' }[val] || 'default'}>{statusMap[val]?.label || val}</Tag> },
                              { title: '计划日期', dataIndex: 'due_date', key: 'due_date', render: (val) => val || '-' },
                              { title: '完成备注', dataIndex: 'completion_note', key: 'completion_note', ellipsis: true, render: (val) => val || '-' },
                            ]}
                          />
                        ) : (
                          <Text type="secondary">暂无关联需求</Text>
                        )}
                      </Card>
                    </Space>
                  ),
                },
                {
                  key: 'execution',
                  label: <span><FileSearchOutlined /> 执行过程</span>,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openAddLog}>新增执行记录</Button>
                      </div>
                      <Table
                        dataSource={selectedStrategy.executionLogs || []}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        columns={[
                          { title: '执行日期', dataIndex: 'execute_date', key: 'execute_date', width: 110 },
                          { title: '执行人', dataIndex: 'executor_name', key: 'executor_name', width: 100 },
                          { title: '动作类型', dataIndex: 'action_type', key: 'action_type', width: 120, render: (val) => actionTypeMap[val] || val },
                          { title: '动作说明', dataIndex: 'action_desc', key: 'action_desc', ellipsis: true },
                          { title: '观察结果', dataIndex: 'observation', key: 'observation', ellipsis: true },
                          { title: '是否继续', dataIndex: 'continue_flag', key: 'continue_flag', width: 90, render: (val) => val ? <Tag color="green">继续</Tag> : <Tag color="orange">暂停</Tag> },
                          {
                            title: '操作',
                            key: 'action',
                            width: 120,
                            render: (_, record) => (
                              <Space size="small">
                                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditLog(record)}>编辑</Button>
                                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteLog(record.id)}>删除</Button>
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'review',
                  label: <span><BranchesOutlined /> 结果复盘</span>,
                  children: (
                    <Form form={reviewForm} layout="vertical" onFinish={handleSaveReview}>
                      <Form.Item name="baseline_value" label="执行前基线">
                        <TextArea rows={3} placeholder="如：点击率 2.1%，转化率 4.8%" />
                      </Form.Item>
                      <Form.Item name="target_value" label="目标值">
                        <TextArea rows={3} placeholder="如：点击率提升到 2.3%" />
                      </Form.Item>
                      <Form.Item name="actual_value" label="实际结果">
                        <TextArea rows={3} placeholder="填写当前实际结果" />
                      </Form.Item>
                      <Form.Item name="result_summary" label="最新结果摘要">
                        <Input placeholder="如：点击率提升 12%" />
                      </Form.Item>
                      <Form.Item name="effect_judgement" label="效果结论">
                        <Select allowClear placeholder="请选择效果结论">
                          {Object.entries(effectJudgementMap).map(([key, item]) => (
                            <Option key={key} value={key}>{item.label}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item name="review_note" label="复盘总结">
                        <TextArea rows={4} placeholder="说明为什么有效/无效、遇到了什么问题" />
                      </Form.Item>
                      <Form.Item name="next_action" label="下一步动作">
                        <TextArea rows={3} placeholder="如：继续执行、扩大执行、优化后重试" />
                      </Form.Item>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" loading={reviewSaving} onClick={() => reviewForm.submit()}>
                          保存复盘
                        </Button>
                      </div>
                    </Form>
                  ),
                },
              ]}
            />
          </>
        )}
      </Drawer>

      <Modal
        title={editingLog ? '编辑执行记录' : '新增执行记录'}
        open={logModalVisible}
        onOk={handleSaveLog}
        onCancel={() => setLogModalVisible(false)}
        width={640}
        okText="保存"
        cancelText="取消"
      >
        <Form form={logForm} layout="vertical">
          <Form.Item name="execute_date" label="执行日期" rules={[{ required: true, message: '请选择执行日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="executor_id" label="执行人" rules={[{ required: true, message: '请选择执行人' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Form.Item>
          <Form.Item name="action_type" label="动作类型" rules={[{ required: true, message: '请选择动作类型' }]}>
            <Select allowClear placeholder="请选择动作类型">
              {Object.entries(actionTypeMap).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="action_desc" label="动作说明">
            <TextArea rows={3} placeholder="填写本次执行动作" />
          </Form.Item>
          <Form.Item name="observation" label="当次观察结果">
            <TextArea rows={3} placeholder="填写本次执行后的观察结果" />
          </Form.Item>
          <Form.Item name="attachments" label="附件（第一版先手动填）">
            <Input placeholder='可先填写 JSON 数组，如 ["report.xlsx","screenshot.png"]' />
          </Form.Item>
          <Form.Item name="continue_flag" label="是否继续" initialValue={1}>
            <Select>
              <Option value={1}>继续</Option>
              <Option value={0}>暂停</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
