import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Table, Button, Tag, Space, Typography, Drawer, Tabs, Modal, Form, Input,
  Select, DatePicker, InputNumber, Row, Col, Popconfirm, message, Alert,
  Descriptions, Steps, Divider, Empty, Badge
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined,
  CheckOutlined, CloseOutlined, CarOutlined, DollarOutlined,
  FileTextOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { tripsApi, expensesApi, reportsApi, personsApi } from '../api';
import { useAuth } from '../AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const statusMap = {
  draft:     { label: '草稿',   color: 'default',  step: 0 },
  pending:   { label: '待审批', color: 'processing', step: 1 },
  approved:  { label: '已批准', color: 'success',   step: 2 },
  rejected:  { label: '已拒绝', color: 'error',     step: 1 },
  completed: { label: '已完成', color: 'blue',      step: 3 },
};

const reportStatusMap = {
  draft:   { label: '报销草稿', color: 'default' },
  pending: { label: '报销审批中', color: 'processing' },
  paid:    { label: '已报销', color: 'success' },
  rejected:{ label: '报销被拒', color: 'error' },
};

const expenseTypeMap = {
  meal:    { label: '餐饮', color: 'orange' },
  hotel:   { label: '住宿', color: 'blue' },
  flight:  { label: '机票', color: 'purple' },
  train:   { label: '火车票', color: 'cyan' },
  taxi:    { label: '打车', color: 'green' },
  other:   { label: '其他', color: 'default' },
};

// ==================== 费用明细组件 ====================
function ExpensePanel({ tripId, tripStatus, isOwner }) {
  const [expenses, setExpenses] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const res = await tripsApi.getExpenses(tripId);
    setExpenses(res);
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  const canEdit = isOwner && ['approved', 'completed'].includes(tripStatus);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs().format('YYYY-MM-DD') }); setModalOpen(true); };
  const openEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await expensesApi.update(editing.id, values);
      message.success('已更新');
    } else {
      await tripsApi.addExpense(tripId, values);
      message.success('已添加');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await expensesApi.delete(id);
    load();
  };

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加明细</Button>
        </div>
      )}
      {expenses.length === 0 ? <Empty description="暂无费用明细" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
        <Table
          size="small"
          pagination={false}
          dataSource={expenses}
          rowKey="id"
          columns={[
            { title: '日期', dataIndex: 'date', width: 100 },
            { title: '类型', dataIndex: 'type', width: 80, render: v => <Tag color={expenseTypeMap[v]?.color}>{expenseTypeMap[v]?.label || v}</Tag> },
            { title: '金额', dataIndex: 'amount', width: 90, render: v => <Text strong style={{ color: '#fa8c16' }}>¥{v?.toFixed(2)}</Text> },
            { title: '说明', dataIndex: 'description', ellipsis: true },
            canEdit ? {
              title: '操作', width: 80,
              render: (_, r) => (
                <Space size={4}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                  <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              )
            } : {}
          ].filter(c => Object.keys(c).length > 0)}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell colSpan={2}><Text strong>合计</Text></Table.Summary.Cell>
              <Table.Summary.Cell><Text strong style={{ color: '#ff4d4f' }}>¥{total.toFixed(2)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell colSpan={2} />
            </Table.Summary.Row>
          )}
        />
      )}

      <Modal title={editing ? '编辑明细' : '添加费用明细'} open={modalOpen} onOk={handleSave}
        onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消" width={480}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select>{Object.entries(expenseTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="金额（元）" name="amount" rules={[{ required: true }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="说明" name="description">
                <Input placeholder="如：客户晚宴、高铁G123..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 报销单组件 ====================
function ReportPanel({ tripId, tripStatus, isOwner, onRefresh }) {
  const [report, setReport] = useState(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveAction, setApproveAction] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const { user } = useAuth();

  const load = useCallback(async () => {
    try { const r = await tripsApi.getReport(tripId); setReport(r); } catch { setReport(null); }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  const canApprove = user?.role === 'admin' || user?.role === 'leader';

  const handleCreate = async () => {
    await tripsApi.createReport(tripId);
    message.success('报销单已创建');
    load();
  };

  const handleSubmit = async () => {
    await reportsApi.submit(report.id);
    message.success('已提交审批');
    load(); onRefresh();
  };

  const handleApprove = async () => {
    await reportsApi.approve(report.id, { action: approveAction, note: approveNote });
    message.success(approveAction === 'approved' ? '已批准报销' : '已拒绝');
    setApproveOpen(false);
    load(); onRefresh();
  };

  if (tripStatus !== 'completed') {
    return <Alert message="出差完成后才能提交报销" type="info" showIcon />;
  }

  if (!report) {
    return isOwner ? (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Button type="primary" icon={<FileTextOutlined />} onClick={handleCreate}>创建报销单</Button>
      </div>
    ) : <Empty description="暂无报销单" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div>
      <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="报销状态">
          <Tag color={reportStatusMap[report.status]?.color}>{reportStatusMap[report.status]?.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="报销总额">
          <Text strong style={{ color: '#ff4d4f', fontSize: 16 }}>¥{report.total_amount?.toFixed(2)}</Text>
        </Descriptions.Item>
        {report.approve_note && <Descriptions.Item label="审批意见" span={2}>{report.approve_note}</Descriptions.Item>}
      </Descriptions>

      <Space>
        {isOwner && report.status === 'draft' && (
          <Button type="primary" icon={<SendOutlined />} onClick={handleSubmit}>提交报销审批</Button>
        )}
        {canApprove && report.status === 'pending' && (
          <>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => { setApproveAction('approved'); setApproveNote(''); setApproveOpen(true); }}>批准报销</Button>
            <Button danger icon={<CloseOutlined />} onClick={() => { setApproveAction('rejected'); setApproveNote(''); setApproveOpen(true); }}>拒绝</Button>
          </>
        )}
      </Space>

      <Modal title={approveAction === 'approved' ? '批准报销' : '拒绝报销'} open={approveOpen}
        onOk={handleApprove} onCancel={() => setApproveOpen(false)} okText="确认" cancelText="取消">
        <Form layout="vertical" size="small">
          <Form.Item label="审批意见">
            <TextArea rows={3} value={approveNote} onChange={e => setApproveNote(e.target.value)} placeholder="选填..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 出差详情抽屉 ====================
function TripDrawer({ trip, open, onClose, onRefresh }) {
  const { user } = useAuth();
  const isOwner = trip?.user_id === user?.id;
  const canApprove = user?.role === 'admin' || user?.role === 'leader';
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveAction, setApproveAction] = useState('');
  const [approveNote, setApproveNote] = useState('');

  if (!trip) return null;

  const status = statusMap[trip.status] || statusMap.draft;

  const handleApprove = async () => {
    await tripsApi.approve(trip.id, { action: approveAction, note: approveNote });
    message.success(approveAction === 'approved' ? '已批准' : '已拒绝');
    setApproveOpen(false);
    onClose(); onRefresh();
  };

  const handleComplete = async () => {
    await tripsApi.complete(trip.id);
    message.success('已标记完成');
    onClose(); onRefresh();
  };

  return (
    <Drawer
      title={<Space><CarOutlined /><span>{trip.destinations}</span><Tag color={status.color}>{status.label}</Tag></Space>}
      open={open} onClose={onClose} width={720}
    >
      <Steps
        size="small"
        current={trip.status === 'rejected' ? 1 : status.step}
        status={trip.status === 'rejected' ? 'error' : 'process'}
        style={{ marginBottom: 24 }}
        items={[
          { title: '创建', icon: <FileTextOutlined /> },
          { title: '审批', icon: <CheckCircleOutlined /> },
          { title: '出差中', icon: <CarOutlined /> },
          { title: '已完成', icon: <CheckOutlined /> },
        ]}
      />

      <Tabs items={[
        {
          key: 'info', label: '申请信息',
          children: (
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="申请人">{trip.user_name}</Descriptions.Item>
              <Descriptions.Item label="所属小组">{trip.group_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="目的地（多城市）" span={2}>{trip.destinations}</Descriptions.Item>
              <Descriptions.Item label="出差时间" span={2}>{trip.start_date} 至 {trip.end_date}</Descriptions.Item>
              <Descriptions.Item label="事由" span={2}>{trip.purpose || '-'}</Descriptions.Item>
              <Descriptions.Item label="预计费用">{trip.estimated_cost ? `¥${trip.estimated_cost}` : '-'}</Descriptions.Item>
              {trip.approve_note && <Descriptions.Item label="审批意见" span={2}>{trip.approve_note}</Descriptions.Item>}
              {trip.approver_name && <Descriptions.Item label="审批人">{trip.approver_name}</Descriptions.Item>}
            </Descriptions>
          ),
        },
        {
          key: 'expenses', label: <span><DollarOutlined /> 费用明细</span>,
          children: <ExpensePanel tripId={trip.id} tripStatus={trip.status} isOwner={isOwner} />,
        },
        {
          key: 'report', label: <span><FileTextOutlined /> 报销单</span>,
          children: <ReportPanel tripId={trip.id} tripStatus={trip.status} isOwner={isOwner} onRefresh={onRefresh} />,
        },
      ]} />

      <Divider />
      <Space>
        {canApprove && trip.status === 'pending' && (
          <>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => { setApproveAction('approved'); setApproveNote(''); setApproveOpen(true); }}>批准出差</Button>
            <Button danger icon={<CloseOutlined />} onClick={() => { setApproveAction('rejected'); setApproveNote(''); setApproveOpen(true); }}>拒绝</Button>
          </>
        )}
        {isOwner && trip.status === 'approved' && (
          <Button icon={<CheckCircleOutlined />} onClick={handleComplete}>标记出差完成</Button>
        )}
      </Space>

      <Modal title={approveAction === 'approved' ? '批准出差申请' : '拒绝出差申请'} open={approveOpen}
        onOk={handleApprove} onCancel={() => setApproveOpen(false)} okText="确认" cancelText="取消">
        <Form layout="vertical" size="small">
          <Form.Item label="审批意见">
            <TextArea rows={3} value={approveNote} onChange={e => setApproveNote(e.target.value)} placeholder="选填..." />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

// ==================== 主页面 ====================
export default function Trips() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [drawerTrip, setDrawerTrip] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [persons, setPersons] = useState([]);
  const [form] = Form.useForm();
  const { user } = useAuth();
  const canApprove = user?.role === 'admin' || user?.role === 'leader';

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filterStatus) params.status = filterStatus;
    const res = await tripsApi.list(params);
    setData(res);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { personsApi.list({}).then(setPersons); }, []);

  const openDetail = async (record) => {
    const detail = await tripsApi.get(record.id);
    setDrawerTrip(detail);
    setDrawerOpen(true);
  };

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      dates: [dayjs(r.start_date), dayjs(r.end_date)],
      related_persons: r.related_persons ? r.related_persons.split(',').map(Number).filter(Boolean) : [],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      start_date: values.dates[0].format('YYYY-MM-DD'),
      end_date: values.dates[1].format('YYYY-MM-DD'),
      related_persons: (values.related_persons || []).join(','),
    };
    delete payload.dates;
    if (editing) {
      await tripsApi.update(editing.id, payload);
      message.success('已更新');
    } else {
      await tripsApi.create(payload);
      message.success('申请已创建');
    }
    setModalOpen(false);
    load();
  };

  const handleSubmit = async (id) => {
    await tripsApi.submit(id);
    message.success('已提交审批');
    load();
  };

  const handleDelete = async (id) => {
    await tripsApi.delete(id);
    message.success('已删除');
    load();
  };

  const columns = [
    {
      title: '目的地',
      dataIndex: 'destinations',
      render: (v, r) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(r)}><strong>{v}</strong></Button>,
    },
    { title: '申请人', dataIndex: 'user_name', render: v => v || '-' },
    { title: '小组', dataIndex: 'group_name', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: '出发', dataIndex: 'start_date' },
    { title: '返回', dataIndex: 'end_date' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v, r) => (
        <Space>
          <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag>
          {r.report_status && <Tag color={reportStatusMap[r.report_status]?.color} style={{ fontSize: 11 }}>{reportStatusMap[r.report_status]?.label}</Tag>}
        </Space>
      ),
    },
    {
      title: '报销金额',
      dataIndex: 'total_amount',
      render: v => v ? <Text style={{ color: '#ff4d4f' }}>¥{v.toFixed(2)}</Text> : '-',
    },
    {
      title: '操作',
      render: (_, r) => {
        const isOwner = r.user_id === user?.id;
        return (
          <Space size={4}>
            {isOwner && ['draft', 'rejected'].includes(r.status) && (
              <>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Button size="small" type="primary" ghost icon={<SendOutlined />} onClick={() => handleSubmit(r.id)}>提交</Button>
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </>
            )}
            {canApprove && r.status === 'pending' && (
              <Badge dot><Button size="small" onClick={() => openDetail(r)}>审批</Button></Badge>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><CarOutlined /> 出差管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建出差申请</Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select placeholder="全部状态" allowClear style={{ width: 130 }} value={filterStatus || undefined} onChange={v => setFilterStatus(v || '')}>
          {Object.entries(statusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        {canApprove && (
          <Tag color="orange" style={{ cursor: 'pointer', padding: '4px 12px' }} onClick={() => setFilterStatus('pending')}>
            待审批：{data.filter(t => t.status === 'pending').length} 条
          </Tag>
        )}
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 15 }}
        onRow={r => ({ onDoubleClick: () => openDetail(r), style: { cursor: 'pointer' } })}
      />

      {/* 新建/编辑弹窗 */}
      <Modal title={editing ? '编辑出差申请' : '新建出差申请'} open={modalOpen} onOk={handleSave}
        onCancel={() => setModalOpen(false)} width={640} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="目的地（多城市用逗号分隔）" name="destinations" rules={[{ required: true }]}>
                <Input placeholder="如：上海、北京、深圳" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="出差时间" name="dates" rules={[{ required: true }]}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="出差事由" name="purpose">
                <TextArea rows={2} placeholder="拜访客户、参加展会..." />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="拜访对象（关联人脉）" name="related_persons">
                <Select mode="multiple" showSearch placeholder="选择拜访的人脉"
                  filterOption={(input, option) => option.children.toString().toLowerCase().includes(input.toLowerCase())}>
                  {persons.map(p => (
                    <Option key={p.id} value={p.id}>
                      {p.name}{(p.company || p.current_company) && ` (${p.company || p.current_company})`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="预计费用（元）" name="estimated_cost">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <TripDrawer
        trip={drawerTrip}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={load}
      />
    </div>
  );
}
