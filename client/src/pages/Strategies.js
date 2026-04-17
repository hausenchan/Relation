import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Descriptions, Tabs, Card, Row, Col, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, RiseOutlined, LinkOutlined, BranchesOutlined } from '@ant-design/icons';

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
  active: { label: '进行中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  paused: { label: '暂停', color: 'orange' },
};

export default function Strategies() {
  const [strategies, setStrategies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('all');

  // 筛选
  const [filters, setFilters] = useState({
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
        body: JSON.stringify(values),
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
    } catch (err) {
      message.error(err.message || '加载失败');
      setDrawerVisible(false);
      console.error(err);
    }
  };

  const columns = [
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
          scroll={{ x: 1200 }}
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
          <Form.Item name="owner_id" label="负责人">
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
          <Form.Item name="description" label="策略描述">
            <TextArea rows={4} placeholder="请输入策略描述" />
          </Form.Item>
          {editingStrategy && (
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态">
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
        width={720}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedStrategy && (
          <>
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
              <Descriptions.Item label="负责人">{selectedStrategy.owner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[selectedStrategy.status]?.color}>
                  {statusMap[selectedStrategy.status]?.label}
                </Tag>
              </Descriptions.Item>
              {selectedStrategy.source_title && (
                <Descriptions.Item label="来源线索">{selectedStrategy.source_title}</Descriptions.Item>
              )}
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

            {/* 关联的研发任务 */}
            {selectedStrategy.devTasks && selectedStrategy.devTasks.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>关联研发任务 ({selectedStrategy.devTasks.length})</div>
                <Table
                  dataSource={selectedStrategy.devTasks}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '任务标题', dataIndex: 'title', key: 'title', ellipsis: true },
                    { title: '负责人', dataIndex: 'assignee_name', key: 'assignee_name' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      render: (val) => {
                        const map = {
                          pending: { label: '待开始', color: 'default' },
                          in_progress: { label: '进行中', color: 'blue' },
                          testing: { label: '测试中', color: 'orange' },
                          completed: { label: '已完成', color: 'green' },
                        };
                        const cfg = map[val] || { label: val, color: 'default' };
                        return <Tag color={cfg.color}>{cfg.label}</Tag>;
                      }
                    },
                    { title: '截止日期', dataIndex: 'due_date', key: 'due_date' },
                  ]}
                />
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
