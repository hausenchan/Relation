import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Descriptions, DatePicker, InputNumber, Card, Row, Col, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined, FunnelPlotOutlined, BranchesOutlined, ToolOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';

const { Title, Text } = Typography;
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
  const { user } = useAuth();
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

  const getErrorMessage = async (res, fallback) => {
    try {
      const data = await res.json();
      return data?.error || fallback;
    } catch {
      return fallback;
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.assignee_id) params.append('assignee_id', filters.assignee_id);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.source_type) params.append('source_type', filters.source_type);

      const res = await fetch(`/api/dev-tasks?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '需求列表加载失败'));
      }
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
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
        throw new Error(await getErrorMessage(res, '线索列表加载失败'));
      }
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      setLeads([]);
      console.error(err);
    }
  };

  const fetchStrategies = async () => {
    try {
      const res = await fetch('/api/strategies/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '策略列表加载失败'));
      }
      const data = await res.json();
      setStrategies(Array.isArray(data) ? data : []);
    } catch (err) {
      setStrategies([]);
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
          await fetch(`/api/dev-tasks/${id}`, {
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
        ? `/api/dev-tasks/${editingTask.id}`
        : '/api/dev-tasks';
      const method = editingTask ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, editingTask ? '更新失败' : '创建失败'));
      }

      message.success(editingTask ? '更新成功' : '创建成功');
      setModalVisible(false);
      fetchTasks();
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  };

  const showDetail = (record) => {
    setSelectedTask(record);
    setDrawerVisible(true);
    fetchTaskDetail(record.id);
  };

  const fetchTaskDetail = async (id) => {
    try {
      const res = await fetch(`/api/dev-tasks/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '需求详情加载失败'));
      }
      const data = await res.json();
      setSelectedTask(data);
    } catch (err) {
      message.error(err.message || '加载失败');
    }
  };

  const columns = [
    {
      title: '需求标题',
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
    <div>
      {/* 状态统计 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '待开始', value: stats.pending, gradient: 'linear-gradient(135deg, #a8b8d8 0%, #8e9ebc 100%)' },
          { label: '进行中', value: stats.in_progress, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '测试中', value: stats.testing, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          { label: '已完成', value: stats.completed, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
          { label: '阻塞', value: stats.blocked, gradient: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)' },
        ].map((item, idx) => (
          <Col xs={12} sm={4} key={idx}>
            <div className="stat-card" style={{
              background: item.gradient, borderRadius: 10, padding: '12px 16px',
              cursor: 'default',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 筛选与表格 */}
      <Card style={{ borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Space size={12} wrap>
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
            optionFilterProp="label"
            value={filters.assignee_id || undefined}
            onChange={(val) => setFilters({ ...filters, assignee_id: val || '' })}
            options={users.map(u => ({
              value: u.id,
              label: u.display_name || u.username || `用户${u.id}`,
            }))}
          />
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
        </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增需求</Button>
        </div>

        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Modal
        title={editingTask ? '编辑任务' : '新增需求'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]}>
            <Input placeholder="请输入需求标题" />
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
                    <Select
                      placeholder={leads.length > 0 ? '请选择线索' : '暂无可选线索'}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={leads.map(l => ({
                        value: l.id,
                        label: l.title || `线索${l.id}`,
                      }))}
                    />
                  </Form.Item>
                );
              }
              if (sourceType === 'strategy') {
                return (
                  <Form.Item name="source_id" label="关联策略">
                    <Select
                      placeholder={strategies.length > 0 ? '请选择策略' : '暂无可选策略'}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={strategies.map(s => ({
                        value: s.id,
                        label: s.title || `策略${s.id}`,
                      }))}
                    />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
          <Form.Item name="assignee_id" label="负责人">
            <Select
              placeholder={users.length > 0 ? '请选择负责人' : '暂无可选负责人'}
              allowClear
              showSearch
              optionFilterProp="label"
              options={(user?.role === 'member' ? users.filter(u => u.id === user.id) : users).map(u => ({
                value: u.id,
                label: u.display_name || u.username || `用户${u.id}`,
              }))}
            />
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
          <Form.Item name="completion_note" label="完成备注" style={{ marginTop: 16 }}>
            <TextArea rows={3} placeholder="请填写完成情况或结果说明" />
          </Form.Item>
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
          <>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="需求标题">{selectedTask.title}</Descriptions.Item>
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
              <Descriptions.Item label="指派人">{selectedTask.creator_name || '-'}</Descriptions.Item>
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
              <Descriptions.Item label="完成备注">
                <div style={{ whiteSpace: 'pre-wrap' }}>{selectedTask.completion_note || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{selectedTask.created_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{selectedTask.updated_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
            </Descriptions>

            {selectedTask.source_strategy && (
              <Card size="small" title="关联策略" style={{ marginTop: 16 }}>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="策略标题">{selectedTask.source_strategy.title}</Descriptions.Item>
                  <Descriptions.Item label="维度">{selectedTask.source_strategy.dimension || '-'}</Descriptions.Item>
                  <Descriptions.Item label="负责人">{selectedTask.source_strategy.owner_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="状态">{selectedTask.source_strategy.status || '-'}</Descriptions.Item>
                  <Descriptions.Item label="效果结论">{selectedTask.source_strategy.effect_judgement || '-'}</Descriptions.Item>
                  <Descriptions.Item label="最新结果摘要">{selectedTask.source_strategy.latest_result_summary || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
