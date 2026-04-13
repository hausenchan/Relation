import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, InputNumber, message, Drawer } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [form] = Form.useForm();

  // 筛选
  const [filters, setFilters] = useState({
    department: '',
    quarter: '',
    status: '',
  });

  useEffect(() => {
    fetchGoals();
    fetchUsers();
  }, [filters]);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.department) params.append('department', filters.department);
      if (filters.quarter) params.append('quarter', filters.quarter);
      if (filters.status) params.append('status', filters.status);

      const res = await fetch(`http://localhost:3001/api/goals?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setGoals(data);
    } catch (err) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/users/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = () => {
    setEditingGoal(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingGoal(record);
    form.setFieldsValue({
      ...record,
      deadline: record.deadline ? dayjs(record.deadline) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      onOk: async () => {
        try {
          await fetch(`http://localhost:3001/api/goals/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          message.success('删除成功');
          fetchGoals();
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
      };

      const url = editingGoal
        ? `http://localhost:3001/api/goals/${editingGoal.id}`
        : 'http://localhost:3001/api/goals';
      const method = editingGoal ? 'PUT' : 'POST';

      await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      message.success(editingGoal ? '更新成功' : '创建成功');
      setModalVisible(false);
      fetchGoals();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const showDetail = (record) => {
    setSelectedGoal(record);
    setDrawerVisible(true);
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', width: 200, ellipsis: true },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 100 },
    { title: '部门', dataIndex: 'department', key: 'department', width: 100 },
    { title: '季度', dataIndex: 'quarter', key: 'quarter', width: 100 },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 100,
      render: (val) => `${val || 0}%`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val) => {
        const map = { active: { text: '进行中', color: 'blue' }, completed: { text: '已完成', color: 'green' }, paused: { text: '暂停', color: 'orange' } };
        const cfg = map[val] || { text: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
      render: (val) => val || '-',
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Select
          placeholder="部门"
          style={{ width: 150 }}
          allowClear
          value={filters.department || undefined}
          onChange={(val) => setFilters({ ...filters, department: val || '' })}
        >
          <Option value="商务部">商务部</Option>
          <Option value="产运部">产运部</Option>
          <Option value="研发部">研发部</Option>
        </Select>
        <Select
          placeholder="季度"
          style={{ width: 150 }}
          allowClear
          value={filters.quarter || undefined}
          onChange={(val) => setFilters({ ...filters, quarter: val || '' })}
        >
          <Option value="2026Q1">2026Q1</Option>
          <Option value="2026Q2">2026Q2</Option>
          <Option value="2026Q3">2026Q3</Option>
          <Option value="2026Q4">2026Q4</Option>
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
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建目标</Button>
      </div>

      <Table
        columns={columns}
        dataSource={goals}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingGoal ? '编辑目标' : '新建目标'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="目标标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：Q2 商务部新增客户 50 家" />
          </Form.Item>
          <Form.Item name="description" label="目标描述">
            <TextArea rows={4} placeholder="详细描述目标内容、衡量标准等" />
          </Form.Item>
          <Form.Item name="owner_id" label="负责人" rules={[{ required: true, message: '请选择负责人' }]}>
            <Select placeholder="选择负责人" showSearch optionFilterProp="children">
              {users.map((u) => (
                <Option key={u.id} value={u.id}>{u.display_name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Select placeholder="选择部门">
              <Option value="商务部">商务部</Option>
              <Option value="产运部">产运部</Option>
              <Option value="研发部">研发部</Option>
            </Select>
          </Form.Item>
          <Form.Item name="quarter" label="季度">
            <Select placeholder="选择季度">
              <Option value="2026Q1">2026Q1</Option>
              <Option value="2026Q2">2026Q2</Option>
              <Option value="2026Q3">2026Q3</Option>
              <Option value="2026Q4">2026Q4</Option>
            </Select>
          </Form.Item>
          <Form.Item name="deadline" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          {editingGoal && (
            <>
              <Form.Item name="progress" label="进度（%）">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="status" label="状态">
                <Select>
                  <Option value="active">进行中</Option>
                  <Option value="completed">已完成</Option>
                  <Option value="paused">暂停</Option>
                </Select>
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Drawer
        title="目标详情"
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={500}
      >
        {selectedGoal && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>标题</div>
              <div>{selectedGoal.title}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>描述</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{selectedGoal.description || '-'}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>负责人</div>
              <div>{selectedGoal.owner_name}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>部门</div>
              <div>{selectedGoal.department || '-'}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>季度</div>
              <div>{selectedGoal.quarter || '-'}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>截止日期</div>
              <div>{selectedGoal.deadline || '-'}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>进度</div>
              <div>{selectedGoal.progress || 0}%</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>状态</div>
              <div>
                {selectedGoal.status === 'active' && <Tag color="blue">进行中</Tag>}
                {selectedGoal.status === 'completed' && <Tag color="green">已完成</Tag>}
                {selectedGoal.status === 'paused' && <Tag color="orange">暂停</Tag>}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
