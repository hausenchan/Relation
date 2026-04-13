import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Descriptions, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, BankOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Option } = Select;

const statusMap = {
  new: { label: '新线索', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  converted: { label: '已转化', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
};

const priorityMap = {
  high: { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low: { label: '低', color: 'default' },
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [form] = Form.useForm();

  // 筛选
  const [filters, setFilters] = useState({
    status: '',
    assignee_id: '',
    priority: '',
    source_type: '',
  });

  useEffect(() => {
    fetchLeads();
    fetchUsers();
  }, [filters]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.assignee_id) params.append('assignee_id', filters.assignee_id);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.source_type) params.append('source_type', filters.source_type);

      const res = await fetch(`http://localhost:3001/api/leads?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setLeads(data);
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
    setEditingLead(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingLead(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      onOk: async () => {
        try {
          await fetch(`http://localhost:3001/api/leads/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          message.success('删除成功');
          fetchLeads();
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const url = editingLead
        ? `http://localhost:3001/api/leads/${editingLead.id}`
        : 'http://localhost:3001/api/leads';
      const method = editingLead ? 'PUT' : 'POST';

      await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(values),
      });

      message.success(editingLead ? '更新成功' : '创建成功');
      setModalVisible(false);
      fetchLeads();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const showDetail = (record) => {
    setSelectedLead(record);
    setDrawerVisible(true);
    // 加载关联数据
    fetchLeadDetail(record.id);
  };

  const fetchLeadDetail = async (id) => {
    try {
      const res = await fetch(`http://localhost:3001/api/leads/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setSelectedLead(data);
    } catch (err) {
      console.error(err);
    }
  };

  const columns = [
    {
      title: '线索标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (text, record) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => showDetail(record)}>
          {text}
        </Button>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (text, record) => {
        if (record.source_type === 'interaction') {
          return <Tag color="blue">互动记录</Tag>;
        } else if (record.source_type === 'competitor_research') {
          return <Tag color="orange">竞品研究</Tag>;
        }
        return text || '-';
      },
    },
    {
      title: '联系人',
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: 120,
      render: (text) => text ? <><UserOutlined /> {text}</> : '-',
    },
    {
      title: '公司',
      dataIndex: 'contact_company',
      key: 'contact_company',
      width: 150,
      ellipsis: true,
      render: (text) => text ? <><BankOutlined /> {text}</> : '-',
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
      title: '负责人',
      dataIndex: 'assignee_name',
      key: 'assignee_name',
      width: 100,
      render: (text) => text || '-',
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  // 按状态分组统计
  const stats = {
    new: leads.filter(l => l.status === 'new').length,
    following: leads.filter(l => l.status === 'following').length,
    converted: leads.filter(l => l.status === 'converted').length,
    closed: leads.filter(l => l.status === 'closed').length,
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="large">
          <div>新线索: <Tag color="blue">{stats.new}</Tag></div>
          <div>跟进中: <Tag color="orange">{stats.following}</Tag></div>
          <div>已转化: <Tag color="green">{stats.converted}</Tag></div>
          <div>已关闭: <Tag>{stats.closed}</Tag></div>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增线索</Button>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Select
          placeholder="状态"
          style={{ width: 150 }}
          allowClear
          value={filters.status || undefined}
          onChange={(val) => setFilters({ ...filters, status: val || '' })}
        >
          <Option value="new">新线索</Option>
          <Option value="following">跟进中</Option>
          <Option value="converted">已转化</Option>
          <Option value="closed">已关闭</Option>
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
          <Option value="interaction">互动记录</Option>
          <Option value="competitor_research">竞品研究</Option>
          <Option value="manual">手动创建</Option>
        </Select>
      </div>

      <Table
        columns={columns}
        dataSource={leads}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />

      <Modal
        title={editingLead ? '编辑线索' : '新增线索'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="线索标题" rules={[{ required: true, message: '请输入线索标题' }]}>
            <Input placeholder="请输入线索标题" />
          </Form.Item>
          <Form.Item name="source" label="来源说明">
            <Input placeholder="例如：客户推荐、展会获取等" />
          </Form.Item>
          <Form.Item name="contact_person" label="联系人">
            <Input placeholder="请输入联系人姓名" />
          </Form.Item>
          <Form.Item name="contact_company" label="公司">
            <Input placeholder="请输入公司名称" />
          </Form.Item>
          <Form.Item name="contact_info" label="联系方式">
            <Input placeholder="电话/微信/邮箱" />
          </Form.Item>
          <Form.Item name="description" label="线索描述">
            <TextArea rows={4} placeholder="请输入线索详细描述" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="new">
            <Select>
              <Option value="new">新线索</Option>
              <Option value="following">跟进中</Option>
              <Option value="converted">已转化</Option>
              <Option value="closed">已关闭</Option>
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="medium">
            <Select>
              <Option value="high">高</Option>
              <Option value="medium">中</Option>
              <Option value="low">低</Option>
            </Select>
          </Form.Item>
          <Form.Item name="assignee_id" label="负责人">
            <Select placeholder="请选择负责人" allowClear showSearch optionFilterProp="children">
              {users.map(u => <Option key={u.id} value={u.id}>{u.display_name}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="线索详情"
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={720}
      >
        {selectedLead && (
          <>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="线索标题">{selectedLead.title}</Descriptions.Item>
              <Descriptions.Item label="来源">
                {selectedLead.source_type === 'interaction' && <Tag color="blue">互动记录</Tag>}
                {selectedLead.source_type === 'competitor_research' && <Tag color="orange">竞品研究</Tag>}
                {selectedLead.source && ` - ${selectedLead.source}`}
              </Descriptions.Item>
              <Descriptions.Item label="联系人">{selectedLead.contact_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="公司">{selectedLead.contact_company || '-'}</Descriptions.Item>
              <Descriptions.Item label="联系方式">{selectedLead.contact_info || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[selectedLead.status]?.color}>{statusMap[selectedLead.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="优先级">
                <Tag color={priorityMap[selectedLead.priority]?.color}>{priorityMap[selectedLead.priority]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="负责人">{selectedLead.assignee_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{selectedLead.creator_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="线索描述">{selectedLead.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{selectedLead.created_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{selectedLead.updated_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
            </Descriptions>

            {/* 关联的策略 */}
            {selectedLead.strategies && selectedLead.strategies.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>关联策略 ({selectedLead.strategies.length})</div>
                <Table
                  dataSource={selectedLead.strategies}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '策略标题', dataIndex: 'title', key: 'title', ellipsis: true },
                    {
                      title: '维度',
                      dataIndex: 'dimension',
                      key: 'dimension',
                      render: (val) => {
                        const map = { monetization: '变现', traffic: '流量', link: '链路' };
                        return map[val] || val;
                      }
                    },
                    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      render: (val) => {
                        const map = { active: { label: '进行中', color: 'blue' }, completed: { label: '已完成', color: 'green' } };
                        const cfg = map[val] || { label: val, color: 'default' };
                        return <Tag color={cfg.color}>{cfg.label}</Tag>;
                      }
                    },
                  ]}
                />
              </div>
            )}

            {/* 关联的研发任务 */}
            {selectedLead.devTasks && selectedLead.devTasks.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>关联研发任务 ({selectedLead.devTasks.length})</div>
                <Table
                  dataSource={selectedLead.devTasks}
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
