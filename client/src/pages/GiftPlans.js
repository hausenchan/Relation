import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm,
  message, Typography, Drawer, Tabs, Descriptions, Row, Col, InputNumber, Divider, Empty
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined,
  CalendarOutlined, GiftOutlined, UserOutlined
} from '@ant-design/icons';
import { giftPlansApi, giftRequestsApi, giftsApi, personsApi } from '../api';
import { useAuth } from '../AuthContext';

const { Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const ADMIN_ROLES = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);
const isAdmin = (role) => ADMIN_ROLES.has(role);

const planStatusMap = {
  draft:    { label: '草稿',   color: 'default' },
  active:   { label: '进行中', color: 'blue' },
  finished: { label: '已完成', color: 'green' },
};

const requestStatusMap = {
  pending:  { label: '待审核', color: 'orange' },
  approved: { label: '已通过', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
};

export default function GiftPlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm] = Form.useForm();

  // 送礼申请
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqForm] = Form.useForm();
  const [gifts, setGifts] = useState([]);
  const [persons, setPersons] = useState([]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const res = await giftPlansApi.list();
    setPlans(res);
    setLoading(false);
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  useEffect(() => {
    giftsApi.list().then(setGifts);
    personsApi.list({}).then(setPersons);
  }, []);

  const loadRequests = async (planId) => {
    const res = await giftRequestsApi.list({ plan_id: planId });
    setRequests(res);
  };

  const openPlanAdd = () => { setEditingPlan(null); planForm.resetFields(); setPlanModalOpen(true); };
  const openPlanEdit = (r) => { setEditingPlan(r); planForm.setFieldsValue(r); setPlanModalOpen(true); };

  const handlePlanSave = async () => {
    const values = await planForm.validateFields();
    if (editingPlan) {
      await giftPlansApi.update(editingPlan.id, { ...editingPlan, ...values });
      message.success('已更新');
    } else {
      await giftPlansApi.create(values);
      message.success('已创建');
    }
    setPlanModalOpen(false);
    loadPlans();
  };

  const openDrawer = async (plan) => {
    setCurrentPlan(plan);
    setDrawerOpen(true);
    await loadRequests(plan.id);
  };

  const openReqModal = () => { reqForm.resetFields(); setReqModalOpen(true); };

  const handleReqSave = async () => {
    const values = await reqForm.validateFields();
    try {
      await giftRequestsApi.create({ ...values, plan_id: currentPlan.id });
      message.success('申请已提交，等待审核');
      setReqModalOpen(false);
      loadRequests(currentPlan.id);
    } catch (err) {
      message.error(err.response?.data?.error || '提交失败');
    }
  };

  const handleWithdraw = async (id) => {
    try {
      await giftRequestsApi.delete(id);
      message.success('已撤回');
      loadRequests(currentPlan.id);
    } catch (err) {
      message.error(err.response?.data?.error || '撤回失败');
    }
  };

  const planColumns = [
    {
      title: '计划名称', dataIndex: 'title',
      render: (v, r) => <Button type="link" style={{ padding: 0 }} onClick={() => openDrawer(r)}><strong>{v}</strong></Button>,
    },
    { title: '节日/场合', dataIndex: 'occasion', render: v => v || '-' },
    { title: '计划日期', dataIndex: 'plan_date', render: v => v || '-' },
    { title: '创建人', dataIndex: 'creator_name', render: v => v || '-' },
    {
      title: '状态', dataIndex: 'status',
      render: v => { const m = planStatusMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : v; },
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<SendOutlined />} type="primary" ghost onClick={() => openDrawer(r)}>发起申请</Button>
          {(isAdmin(user.role) || r.created_by === user.id) && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openPlanEdit(r)}>编辑</Button>
              <Popconfirm title="确认删除？" onConfirm={async () => { await giftPlansApi.delete(r.id); message.success('已删除'); loadPlans(); }}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const reqColumns = [
    { title: '收礼人', dataIndex: 'person_name', render: (v, r) => <span>{v}<Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{r.company || r.city}</Text></span> },
    { title: '礼品', dataIndex: 'gift_name' },
    { title: '数量', render: (_, r) => `${r.quantity} ${r.gift_unit || ''}` },
    { title: '申请人', dataIndex: 'requester_name' },
    { title: '备注', dataIndex: 'notes', ellipsis: true, render: v => v || '-' },
    {
      title: '状态', dataIndex: 'status',
      render: v => { const m = requestStatusMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : v; },
    },
    { title: '审核意见', dataIndex: 'review_note', ellipsis: true, render: v => v || '-' },
    {
      title: '操作',
      render: (_, r) => r.status === 'pending' && r.requester_id === user.id ? (
        <Popconfirm title="确认撤回该申请？" onConfirm={() => handleWithdraw(r.id)}>
          <Button size="small" danger>撤回</Button>
        </Popconfirm>
      ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openPlanAdd}>新建计划</Button>
      </div>

      <Table columns={planColumns} dataSource={plans} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />

      {/* 计划编辑 Modal */}
      <Modal title={editingPlan ? '编辑计划' : '新建送礼计划'} open={planModalOpen}
        onOk={handlePlanSave} onCancel={() => setPlanModalOpen(false)} okText="保存" cancelText="取消" width={480}>
        <Form form={planForm} layout="vertical" size="small">
          <Form.Item label="计划名称" name="title" rules={[{ required: true }]}>
            <Input placeholder="如：2026年中秋送礼计划" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="节日/场合" name="occasion">
                <Select allowClear>
                  {['元旦', '春节', '情人节', '三八妇女节', '端午节', '中秋节', '圣诞节', '生日', '日常维护', '其他'].map(v => <Option key={v} value={v}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="计划日期" name="plan_date">
                <Input placeholder="如：2026-09-29" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="说明" name="description">
            <TextArea rows={2} placeholder="计划说明、送礼要求..." />
          </Form.Item>
          {editingPlan && (
            <Form.Item label="状态" name="status">
              <Select>
                {Object.entries(planStatusMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 计划详情 + 申请 Drawer */}
      <Drawer
        title={<Space><CalendarOutlined />{currentPlan?.title}<Tag color={planStatusMap[currentPlan?.status]?.color}>{planStatusMap[currentPlan?.status]?.label}</Tag></Space>}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={800}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openReqModal}>发起送礼申请</Button>}
      >
        {currentPlan && (
          <div>
            <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="场合">{currentPlan.occasion || '-'}</Descriptions.Item>
              <Descriptions.Item label="日期">{currentPlan.plan_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{currentPlan.creator_name || '-'}</Descriptions.Item>
              {currentPlan.description && <Descriptions.Item label="说明" span={3}>{currentPlan.description}</Descriptions.Item>}
            </Descriptions>

            <Divider orientation="left" plain style={{ fontSize: 13 }}>申请列表</Divider>
            {requests.length === 0
              ? <Empty description="暂无申请" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : <Table columns={reqColumns} dataSource={requests} rowKey="id" size="small" pagination={false} />
            }
          </div>
        )}
      </Drawer>

      {/* 发起申请 Modal */}
      <Modal title="发起送礼申请" open={reqModalOpen}
        onOk={handleReqSave} onCancel={() => setReqModalOpen(false)} okText="提交申请" cancelText="取消" width={480}>
        <Form form={reqForm} layout="vertical" size="small">
          <Form.Item label="收礼人脉" name="person_id" rules={[{ required: true, message: '请选择收礼人' }]}>
            <Select showSearch placeholder="搜索人脉姓名" optionFilterProp="children" style={{ width: '100%' }}>
              {persons.map(p => (
                <Option key={p.id} value={p.id}>
                  {p.name}
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{p.company || p.current_company || p.city}</Text>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item label="选择礼品" name="gift_id" rules={[{ required: true, message: '请选择礼品' }]}>
                <Select showSearch placeholder="搜索礼品" optionFilterProp="children">
                  {gifts.map(g => (
                    <Option key={g.id} value={g.id}>
                      {g.name}
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>¥{g.price} · 库存{g.stock}{g.unit}</Text>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="数量" name="quantity" initialValue={1} rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="备注" name="notes">
            <TextArea rows={2} placeholder="送礼原因、特殊要求..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
