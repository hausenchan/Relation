import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Descriptions, DatePicker, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined, FunnelPlotOutlined, BranchesOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

const statusMap = {
  pending: { label: '待开始', color: 'default' },
  in_progress: { label: '进行中', color: 'blue' },
  testing: { label: '测试中', color: 'orange' },
  completed: { label: '已完成', color: 'green' },
  blocked: { label: '阻塞', color: 'red' },
};

const priorityMap = {
  high: { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low: { label: '低', color: 'default' },
};

const sourceTypeMap = {
  lead: { label: '线索', color: 'blue', icon: <FunnelPlotOutlined /> },
  strategy: { label: '策略', color: 'green', icon: <BranchesOutlined /> },
  manual: { label: '手动创建', color: 'default', icon: <CodeOutlined /> },
};

export default function DevTasks() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [form] = Form.useForm();

  // 筛选
  const [filters, setFilters] = useState({
    status: '',
    assignee_id: '',
    priority: '',
    source_type: '',
  });

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    fetchLeads();
    fetchStrategies();
  }, [filters]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.assignee_id) params.append('assignee_id', filters.assignee_id);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.source_type) params.append('source_type', filters.source_type);

      const res = await fetch(`http://localhost:3001/api/dev-tasks?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setTasks(data);
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

  const fetchLeads = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/leads/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStrategies = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/strategies/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setStrategies(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = () => {
    setEditingTask(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingTask(record);
    form.setFieldsValue({
      ...record,
      start_date: record.start_date ? dayjs(record.start_date) : null,
      due_date: record.due_date ? dayjs(record.due_date) : null,
      completed_date: record.completed_date ? dayjs(record.completed_date) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      onOk: async () => {
        try {
          await fetch(`http://localhost:3001/api/dev-tasks/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          message.success('删除成功');
          fetchTasks();
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
        start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        completed_date: values.completed_date ? values.completed_date.format('YYYY-MM-DD') : null,
      };

      const url = editingTask
        ? `http://localhost:3001/api/dev-tasks/${editingTask.id}`
        : 'http://localhost:3001/api/dev-tasks';
      const method = editingTask ? 'PUT' : 'POST';

      await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      message.success(editingTask ? '更新成功' : '创建成功');
      setModalVisible(false);
      fetchTasks();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const showDetail = (record) => {
    setSelectedTask(record);
    setDrawerVisible(true);
  };

  const columns = [
    {
      title: '任务标题',
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
      title: '来源',
      key: 'source',
      width: 150,
      render: (_, record) => {
        if (!record.source_type) return '-';
        const cfg = sourceTypeMap[record.source_type] || { label: record.source_type, color: 'default', icon: null };
        return (
          <Space size={4}>
            <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
            {record.source_title && <span style={{ fontSize: 12, color: '#888' }}>({record.source_title})</span>}
          </Space>
        );
      },
    },
    {
      title: '负责人',
      dataIndex: 'assignee_name',
      key: 'assignee_name',
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
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (val) => {
        const cfg = priorityMap[val] || { label: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '预估工时',
      dataIndex: 'estimated_hours',
      key: 'estimated_hours',
      width: 100,
      render: (val) => val ? `${val}h` : '-',
    },
    {
      title: '实际工时',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 100,
      render: (val) => val ? `${val}h` : '-',
    },
    {
      title: '截止日期',
      dataIndex: 'due_date',
      key: 'due_date',
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  // 统计
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    testing: tasks.filter(t => t.status === 'testing').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="large">
          <div>待开始: <Tag>{stats.pending}</Tag></div>
          <div>进行中: <Tag color="blue">{stats.in_progress}</Tag></div>
          <div>测试中: <Tag color="orange">{stats.testing}</Tag></div>
          <div>已完成: <Tag color="green">{stats.completed}</Tag></div>
          <div>阻塞: <Tag color="red">{stats.blocked}</Tag></div>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增任务</Button>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Select
          placeholder="状态"
          style={{ width: 150 }}
          allowClear
          value={filters.status || undefined}
          onChange={(val) => setFilters({ ...filters, status: val || '' })}
        >
          <Option value="pending">待开始</Option>
          <Option value="in_progress">进行中</Option>
          <Option value="testing">测试中</Option>
          <Option value="completed">已完成</Option>
          <Option value="blocked">阻塞</Option>
        </Select>
        <Select
          placeholder="优先级"
          style={{ width: 150 }}
          allowClear
          value={filters.priority || undefined}
          onChange={(val) => setFilters({ ...filters, priority: val || '' })}
        >
          <Option value="high">高</Option>
          <Option value="medium">中</Option>
          <Option value="low">低</Option>
        </Select>
        <Select
          placeholder="负责人"
          style={{ width: 150 }}
          allowClear
          showSearch
          optionFilterProp="children"
          value={filters.assignee_id || undefined}
          onChange={(val) => setFilters({ ...filters, assignee_id: val || '' })}
        >
          {users.map(u => <Option key={u.id} value={u.id}>{u.display_name}</Option>)}
        </Select>
        <Select
          placeholder="来源类型"
          style={{ width: 150 }}
          allowClear
          value={filters.source_type || undefined}
          onChange={(val) => setFilters({ ...filters, source_type: val || '' })}
        >
          <Option value="lead">线索</Option>
          <Option value="strategy">策略</Option>
          <Option value="manual">手动创建</Option>
        </Select>
      </div>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />

      <Modal
        title={editingTask ? '编辑任务' : '新增任务'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="请输入任务标题" />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <TextArea rows={4} placeholder="请输入任务描述" />
          </Form.Item>
          <Form.Item name="source_type" label="来源类型">
            <Select placeholder="请选择来源类型" allowClear>
              <Option value="lead">线索</Option>
              <Option value="strategy">策略</Option>
              <Option value="manual">手动创建</Option>
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.source_type !== currentValues.source_type}
          >
            {({ getFieldValue }) => {
              const sourceType = getFieldValue('source_type');
              if (sourceType === 'lead') {
                return (
                  <Form.Item name="source_id" label="关联线索">
                    <Select placeholder="请选择线索" allowClear showSearch optionFilterProp="children">
                      {leads.map(l => <Option key={l.id} value={l.id}>{l.title}</Option>)}
                    </Select>
                  </Form.Item>
                );
              }
              if (sourceType === 'strategy') {
                return (
                  <Form.Item name="source_id" label="关联策略">
                    <Select placeholder="请选择策略" allowClear showSearch optionFilterProp="children">
                      {strategies.map(s => <Option key={s.id} value={s.id}>{s.title}</Option>)}
                    </Select>
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
          <Form.Item name="assignee_id" label="负责人">
            <Select placeholder="请选择负责人" allowClear showSearch optionFilterProp="children">
              {users.map(u => <Option key={u.id} value={u.id}>{u.display_name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="pending">
            <Select>
              <Option value="pending">待开始</Option>
              <Option value="in_progress">进行中</Option>
              <Option value="testing">测试中</Option>
              <Option value="completed">已完成</Option>
              <Option value="blocked">阻塞</Option>
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="medium">
            <Select>
              <Option value="high">高</Option>
              <Option value="medium">中</Option>
              <Option value="low">低</Option>
            </Select>
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="estimated_hours" label="预估工时（小时）" style={{ marginBottom: 0 }}>
              <InputNumber min={0} step={0.5} placeholder="0" style={{ width: 150 }} />
            </Form.Item>
            {editingTask && (
              <Form.Item name="actual_hours" label="实际工时（小时）" style={{ marginBottom: 0 }}>
                <InputNumber min={0} step={0.5} placeholder="0" style={{ width: 150 }} />
              </Form.Item>
            )}
          </Space>
          <Space style={{ width: '100%', marginTop: 16 }} size="large">
            <Form.Item name="start_date" label="开始日期" style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="due_date" label="截止日期" style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
          </Space>
          {editingTask && (
            <Form.Item name="completed_date" label="完成日期" style={{ marginTop: 16 }}>
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title="任务详情"
        placement="right"
        width={600}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedTask && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="任务标题">{selectedTask.title}</Descriptions.Item>
            <Descriptions.Item label="来源">
              {selectedTask.source_type ? (
                <>
                  <Tag color={sourceTypeMap[selectedTask.source_type]?.color} icon={sourceTypeMap[selectedTask.source_type]?.icon}>
                    {sourceTypeMap[selectedTask.source_type]?.label}
                  </Tag>
                  {selectedTask.source_title && <span style={{ marginLeft: 8 }}>{selectedTask.source_title}</span>}
                </>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="负责人">{selectedTask.assignee_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedTask.creator_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMap[selectedTask.status]?.color}>{statusMap[selectedTask.status]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="优先级">
              <Tag color={priorityMap[selectedTask.priority]?.color}>{priorityMap[selectedTask.priority]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="预估工时">{selectedTask.estimated_hours ? `${selectedTask.estimated_hours}h` : '-'}</Descriptions.Item>
            <Descriptions.Item label="实际工时">{selectedTask.actual_hours ? `${selectedTask.actual_hours}h` : '-'}</Descriptions.Item>
            <Descriptions.Item label="开始日期">{selectedTask.start_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="截止日期">{selectedTask.due_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="完成日期">{selectedTask.completed_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="任务描述">
              <div style={{ whiteSpace: 'pre-wrap' }}>{selectedTask.description || '-'}</div>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{selectedTask.created_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{selectedTask.updated_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
