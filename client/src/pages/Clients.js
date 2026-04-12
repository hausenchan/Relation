import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Tag, Space, Modal, Form, Row, Col,
  Typography, Drawer, Descriptions, Tabs, Popconfirm, message, Badge, Tooltip
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  PhoneOutlined, MailOutlined, WechatOutlined, UserOutlined
} from '@ant-design/icons';
import { clientsApi, interactionsApi, remindersApi } from '../api';
import InteractionForm from '../components/InteractionForm';
import ReminderForm from '../components/ReminderForm';
import InteractionList from '../components/InteractionList';
import ReminderList from '../components/ReminderList';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const levelMap = {
  vip: { label: 'VIP', color: 'gold' },
  key: { label: '重要', color: 'red' },
  normal: { label: '普通', color: 'blue' },
  potential: { label: '潜在', color: 'green' },
};

const statusMap = {
  active: { label: '活跃', color: 'success' },
  inactive: { label: '不活跃', color: 'default' },
  lost: { label: '流失', color: 'error' },
};

export default function Clients() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await clientsApi.list({ search, level: filterLevel });
    setData(res);
    setLoading(false);
  }, [search, filterLevel]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (record) => {
    setCurrent(record);
    setDrawerOpen(true);
    const [ints, rems] = await Promise.all([
      interactionsApi.list({ person_type: 'client', person_id: record.id }),
      remindersApi.list({ person_type: 'client', person_id: record.id }),
    ]);
    setInteractions(ints);
    setReminders(rems);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await clientsApi.update(editing.id, values);
      message.success('更新成功');
    } else {
      await clientsApi.create(values);
      message.success('添加成功');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await clientsApi.delete(id);
    message.success('删除成功');
    load();
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v, r) => (
        <Button type="link" onClick={() => openDetail(r)} style={{ padding: 0 }}>
          <strong>{v}</strong>
        </Button>
      ),
    },
    { title: '公司', dataIndex: 'company', ellipsis: true },
    { title: '职位', dataIndex: 'position', ellipsis: true },
    {
      title: '关系等级',
      dataIndex: 'relationship_level',
      render: v => {
        const m = levelMap[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: v => {
        const m = statusMap[v] || { label: v, color: 'default' };
        return <Badge status={m.color} text={m.label} />;
      },
    },
    {
      title: '联系方式',
      render: (_, r) => (
        <Space size={4}>
          {r.phone && <Tooltip title={r.phone}><PhoneOutlined style={{ color: '#1677ff' }} /></Tooltip>}
          {r.wechat && <Tooltip title={r.wechat}><WechatOutlined style={{ color: '#07C160' }} /></Tooltip>}
          {r.email && <Tooltip title={r.email}><MailOutlined style={{ color: '#722ed1' }} /></Tooltip>}
        </Space>
      ),
    },
    { title: '更新时间', dataIndex: 'updated_at', render: v => v?.slice(0, 10), sorter: true },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>客户管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加客户</Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索姓名、公司、手机、标签"
          allowClear
          style={{ width: 280 }}
          onSearch={setSearch}
          onChange={e => !e.target.value && setSearch('')}
        />
        <Select placeholder="关系等级" allowClear style={{ width: 120 }} onChange={setFilterLevel}>
          <Option value="vip">VIP</Option>
          <Option value="key">重要</Option>
          <Option value="normal">普通</Option>
          <Option value="potential">潜在</Option>
        </Select>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 800 }}
        pagination={{ pageSize: 15 }}
      />

      {/* 编辑/新增弹窗 */}
      <Modal
        title={editing ? '编辑客户' : '添加客户'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={680}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="姓名" name="name" rules={[{ required: true }]}>
                <Input prefix={<UserOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="公司" name="company">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="职位" name="position">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="行业" name="industry">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="手机" name="phone">
                <Input prefix={<PhoneOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="微信" name="wechat">
                <Input prefix={<WechatOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="邮箱" name="email">
                <Input prefix={<MailOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="生日" name="birthday">
                <Input placeholder="如 1985-06-15" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="关系等级" name="relationship_level">
                <Select>
                  <Option value="vip">VIP</Option>
                  <Option value="key">重要</Option>
                  <Option value="normal">普通</Option>
                  <Option value="potential">潜在</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="状态" name="status">
                <Select>
                  <Option value="active">活跃</Option>
                  <Option value="inactive">不活跃</Option>
                  <Option value="lost">流失</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="地址" name="address">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="标签（逗号分隔）" name="tags">
                <Input placeholder="如: 大客户,互联网,重点维护" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title={current?.name}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
        extra={<Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(current); }}>编辑</Button>}
      >
        {current && (
          <Tabs defaultActiveKey="info" items={[
            {
              key: 'info', label: '基本信息',
              children: (
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="公司">{current.company}</Descriptions.Item>
                  <Descriptions.Item label="职位">{current.position}</Descriptions.Item>
                  <Descriptions.Item label="行业">{current.industry}</Descriptions.Item>
                  <Descriptions.Item label="关系等级">
                    {current.relationship_level && <Tag color={levelMap[current.relationship_level]?.color}>{levelMap[current.relationship_level]?.label}</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="手机">{current.phone}</Descriptions.Item>
                  <Descriptions.Item label="微信">{current.wechat}</Descriptions.Item>
                  <Descriptions.Item label="邮箱" span={2}>{current.email}</Descriptions.Item>
                  <Descriptions.Item label="生日">{current.birthday}</Descriptions.Item>
                  <Descriptions.Item label="地址" span={2}>{current.address}</Descriptions.Item>
                  <Descriptions.Item label="标签" span={2}>
                    {current.tags?.split(',').filter(Boolean).map(t => <Tag key={t}>{t.trim()}</Tag>)}
                  </Descriptions.Item>
                  <Descriptions.Item label="备注" span={2}>{current.notes}</Descriptions.Item>
                </Descriptions>
              )
            },
            {
              key: 'interactions', label: `互动记录 (${interactions.length})`,
              children: (
                <div>
                  <InteractionForm personType="client" personId={current.id} onSuccess={async () => {
                    const res = await interactionsApi.list({ person_type: 'client', person_id: current.id });
                    setInteractions(res);
                  }} />
                  <InteractionList data={interactions} onDelete={async (id) => {
                    await interactionsApi.delete(id);
                    const res = await interactionsApi.list({ person_type: 'client', person_id: current.id });
                    setInteractions(res);
                  }} />
                </div>
              )
            },
            {
              key: 'reminders', label: `提醒 (${reminders.filter(r => !r.done).length})`,
              children: (
                <div>
                  <ReminderForm personType="client" personId={current.id} onSuccess={async () => {
                    const res = await remindersApi.list({ person_type: 'client', person_id: current.id });
                    setReminders(res);
                  }} />
                  <ReminderList data={reminders} onDone={async (id) => {
                    await remindersApi.done(id);
                    const res = await remindersApi.list({ person_type: 'client', person_id: current.id });
                    setReminders(res);
                  }} onDelete={async (id) => {
                    await remindersApi.delete(id);
                    const res = await remindersApi.list({ person_type: 'client', person_id: current.id });
                    setReminders(res);
                  }} />
                </div>
              )
            },
          ]} />
        )}
      </Drawer>
    </div>
  );
}
