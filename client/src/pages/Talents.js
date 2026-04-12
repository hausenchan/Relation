import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Tag, Space, Modal, Form, Row, Col,
  Typography, Drawer, Descriptions, Tabs, Popconfirm, message, Badge, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  PhoneOutlined, MailOutlined, WechatOutlined, TeamOutlined
} from '@ant-design/icons';
import { talentsApi, interactionsApi, remindersApi } from '../api';
import InteractionForm from '../components/InteractionForm';
import ReminderForm from '../components/ReminderForm';
import InteractionList from '../components/InteractionList';
import ReminderList from '../components/ReminderList';

const { Title } = Typography;
const { Option } = Select;

const statusMap = {
  potential: { label: '潜在', color: 'blue' },
  contacted: { label: '已接触', color: 'orange' },
  interviewing: { label: '面试中', color: 'purple' },
  offered: { label: '已发Offer', color: 'gold' },
  joined: { label: '已入职', color: 'green' },
  passed: { label: '放弃', color: 'default' },
};

const intentMap = {
  high: { label: '高意向', color: 'red' },
  medium: { label: '中意向', color: 'orange' },
  low: { label: '低意向', color: 'blue' },
  advisor: { label: '潜在顾问', color: 'geekblue' },
  unknown: { label: '未知', color: 'default' },
};

export default function Talents() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterIntent, setFilterIntent] = useState('');
  const [filterTalentType, setFilterTalentType] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [form] = Form.useForm();
  const [talentType, setTalentType] = useState('external');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await talentsApi.list({ search, status: filterStatus, intent_level: filterIntent, talent_type: filterTalentType });
    setData(res);
    setLoading(false);
  }, [search, filterStatus, filterIntent, filterTalentType]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (record) => {
    setCurrent(record);
    setDrawerOpen(true);
    const [ints, rems] = await Promise.all([
      interactionsApi.list({ person_type: 'talent', person_id: record.id }),
      remindersApi.list({ person_type: 'talent', person_id: record.id }),
    ]);
    setInteractions(ints);
    setReminders(rems);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setTalentType(record.talent_type || 'external');
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ talent_type: 'external' });
    setTalentType('external');
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await talentsApi.update(editing.id, values);
      message.success('更新成功');
    } else {
      await talentsApi.create(values);
      message.success('添加成功');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await talentsApi.delete(id);
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
    {
      title: '类型',
      dataIndex: 'talent_type',
      render: v => <Tag color={v === 'internal' ? 'green' : 'blue'}>{v === 'internal' ? '内部' : '外部'}</Tag>,
    },
    { title: '现任公司', dataIndex: 'current_company', ellipsis: true },
    { title: '现任职位', dataIndex: 'current_position', ellipsis: true },
    {
      title: '挖掘状态',
      dataIndex: 'status',
      render: v => {
        const m = statusMap[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '意向程度',
      dataIndex: 'intent_level',
      render: v => {
        const m = intentMap[v] || { label: v, color: 'default' };
        return <Badge status={v === 'high' ? 'error' : v === 'medium' ? 'warning' : 'default'} text={m.label} />;
      },
    },
    { title: '期望薪资', dataIndex: 'expected_salary' },
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
    { title: '更新时间', dataIndex: 'updated_at', render: v => v?.slice(0, 10) },
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
        <Title level={4} style={{ margin: 0 }}>人才库</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加人才</Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索姓名、公司、技能、标签"
          allowClear
          style={{ width: 280 }}
          onSearch={setSearch}
          onChange={e => !e.target.value && setSearch('')}
        />
        <Select placeholder="人才类型" allowClear style={{ width: 120 }} onChange={v => setFilterTalentType(v || '')}>
          <Option value="external">外部</Option>
          <Option value="internal">内部</Option>
        </Select>
        <Select placeholder="挖掘状态" allowClear style={{ width: 120 }} onChange={setFilterStatus}>
          {Object.entries(statusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        <Select placeholder="意向程度" allowClear style={{ width: 120 }} onChange={setFilterIntent}>
          {Object.entries(intentMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 900 }}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={editing ? '编辑人才信息' : '添加人才'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ talent_type: 'external' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="姓名" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="人才类型" name="talent_type">
                <Select onChange={val => setTalentType(val)}>
                  <Option value="external">外部</Option>
                  <Option value="internal">内部</Option>
                </Select>
              </Form.Item>
            </Col>
            {talentType === 'external' ? (
              <>
                <Col span={12}>
                  <Form.Item label="现任公司" name="current_company">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="现任职位" name="current_position">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="目标职位" name="target_position">
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
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="邮箱" name="email">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="工作年限" name="experience_years">
                    <Input type="number" addonAfter="年" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="最高学历" name="education">
                    <Select>
                      <Option value="博士">博士</Option>
                      <Option value="硕士">硕士</Option>
                      <Option value="本科">本科</Option>
                      <Option value="大专">大专</Option>
                      <Option value="其他">其他</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="期望薪资" name="expected_salary">
                    <Input placeholder="如: 30-40K" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="挖掘状态" name="status">
                    <Select>
                      {Object.entries(statusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="意向程度" name="intent_level">
                    <Select>
                      {Object.entries(intentMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="生日" name="birthday">
                    <Input placeholder="如 1990-03-20" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="来源渠道" name="source">
                    <Input placeholder="如: 内推、LinkedIn、Boss直聘" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="技能标签" name="skills">
                    <Input placeholder="如: Python, 数据分析, 机器学习" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="标签（逗号分隔）" name="tags">
                    <Input placeholder="如: 高潜力,海归,顶级院校" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="备注" name="notes">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Col>
              </>
            ) : (
              <>
                <Col span={12}>
                  <Form.Item label="心" name="heart">
                    <Input.TextArea rows={2} placeholder="价值观、使命感" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="脑" name="brain">
                    <Input.TextArea rows={2} placeholder="思维能力、专业能力" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="口" name="mouth">
                    <Input.TextArea rows={2} placeholder="沟通表达能力" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="手" name="hand">
                    <Input.TextArea rows={2} placeholder="执行力、动手能力" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="备注" name="notes">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={current?.name}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
        extra={<Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(current); }}>编辑</Button>}
      >
        {current && (
          <Tabs defaultActiveKey="info" items={[
            {
              key: 'info', label: '基本信息',
              children: (
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="人才类型" span={2}>
                    <Tag color={current.talent_type === 'internal' ? 'green' : 'blue'}>
                      {current.talent_type === 'internal' ? '内部' : '外部'}
                    </Tag>
                  </Descriptions.Item>
                  {current.talent_type === 'internal' ? (
                    <>
                      <Descriptions.Item label="心" span={2}>{current.heart}</Descriptions.Item>
                      <Descriptions.Item label="脑" span={2}>{current.brain}</Descriptions.Item>
                      <Descriptions.Item label="口" span={2}>{current.mouth}</Descriptions.Item>
                      <Descriptions.Item label="手" span={2}>{current.hand}</Descriptions.Item>
                      <Descriptions.Item label="备注" span={2}>{current.notes}</Descriptions.Item>
                    </>
                  ) : (
                    <>
                      <Descriptions.Item label="现任公司">{current.current_company}</Descriptions.Item>
                      <Descriptions.Item label="现任职位">{current.current_position}</Descriptions.Item>
                      <Descriptions.Item label="目标职位">{current.target_position}</Descriptions.Item>
                      <Descriptions.Item label="工作年限">{current.experience_years} 年</Descriptions.Item>
                      <Descriptions.Item label="最高学历">{current.education}</Descriptions.Item>
                      <Descriptions.Item label="期望薪资">{current.expected_salary}</Descriptions.Item>
                      <Descriptions.Item label="挖掘状态">
                        <Tag color={statusMap[current.status]?.color}>{statusMap[current.status]?.label}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="意向程度">
                        <Tag color={intentMap[current.intent_level]?.color}>{intentMap[current.intent_level]?.label}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="手机">{current.phone}</Descriptions.Item>
                      <Descriptions.Item label="微信">{current.wechat}</Descriptions.Item>
                      <Descriptions.Item label="邮箱" span={2}>{current.email}</Descriptions.Item>
                      <Descriptions.Item label="生日">{current.birthday}</Descriptions.Item>
                      <Descriptions.Item label="来源">{current.source}</Descriptions.Item>
                      <Descriptions.Item label="技能" span={2}>
                        {current.skills?.split(',').filter(Boolean).map(s => <Tag key={s} color="cyan">{s.trim()}</Tag>)}
                      </Descriptions.Item>
                      <Descriptions.Item label="标签" span={2}>
                        {current.tags?.split(',').filter(Boolean).map(t => <Tag key={t}>{t.trim()}</Tag>)}
                      </Descriptions.Item>
                      <Descriptions.Item label="备注" span={2}>{current.notes}</Descriptions.Item>
                    </>
                  )}
                </Descriptions>
              )
            },
            {
              key: 'interactions', label: `互动记录 (${interactions.length})`,
              children: (
                <div>
                  <InteractionForm personType="talent" personId={current.id} onSuccess={async () => {
                    const res = await interactionsApi.list({ person_type: 'talent', person_id: current.id });
                    setInteractions(res);
                  }} />
                  <InteractionList data={interactions} onDelete={async (id) => {
                    await interactionsApi.delete(id);
                    const res = await interactionsApi.list({ person_type: 'talent', person_id: current.id });
                    setInteractions(res);
                  }} />
                </div>
              )
            },
            {
              key: 'reminders', label: `提醒 (${reminders.filter(r => !r.done).length})`,
              children: (
                <div>
                  <ReminderForm personType="talent" personId={current.id} onSuccess={async () => {
                    const res = await remindersApi.list({ person_type: 'talent', person_id: current.id });
                    setReminders(res);
                  }} />
                  <ReminderList data={reminders} onDone={async (id) => {
                    await remindersApi.done(id);
                    const res = await remindersApi.list({ person_type: 'talent', person_id: current.id });
                    setReminders(res);
                  }} onDelete={async (id) => {
                    await remindersApi.delete(id);
                    const res = await remindersApi.list({ person_type: 'talent', person_id: current.id });
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
