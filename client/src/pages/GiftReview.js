import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Tabs,
  message, Typography, Rate, Popconfirm, Badge, Grid, List, Card
} from 'antd';
import {
  CheckOutlined, CloseOutlined, EditOutlined, GiftOutlined, AuditOutlined
} from '@ant-design/icons';
import { giftRequestsApi, giftRecordsApi } from '../api';
import { useAuth } from '../AuthContext';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const ADMIN_ROLES = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);
const isAdmin = (role) => ADMIN_ROLES.has(role);

const requestStatusMap = {
  pending:  { label: '待审核', color: 'orange' },
  approved: { label: '已通过', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
};

const recordStatusMap = {
  pending:  { label: '待送出', color: 'default' },
  sent:     { label: '已送出', color: 'blue' },
  received: { label: '已接收', color: 'green' },
  declined: { label: '已拒绝', color: 'red' },
};

// ==================== 审核Tab ====================
function ReviewTab() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [reviewAction, setReviewAction] = useState('approve');
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await giftRequestsApi.list({ status: filterStatus || undefined });
    setData(res);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openReview = (record, action) => {
    setReviewing(record);
    setReviewAction(action);
    form.resetFields();
    setReviewModal(true);
  };

  const handleReview = async () => {
    const values = await form.validateFields();
    try {
      await giftRequestsApi.review(reviewing.id, { action: reviewAction, review_note: values.review_note });
      message.success(reviewAction === 'approve' ? '已审核通过，库存已扣减，送礼记录已生成' : '已拒绝');
      setReviewModal(false);
      load();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const columns = [
    { title: '申请人', dataIndex: 'requester_name' },
    { title: '收礼人', dataIndex: 'person_name', render: (v, r) => <span>{v}<Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{r.city}</Text></span> },
    { title: '礼品', dataIndex: 'gift_name', render: (v, r) => <span>{v}<Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>x{r.quantity}{r.gift_unit}</Text></span> },
    { title: '礼品单价', dataIndex: 'gift_price', render: v => `¥${(v || 0).toFixed(2)}` },
    { title: '所属计划', dataIndex: 'plan_title', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: '申请备注', dataIndex: 'notes', ellipsis: true, render: v => v || '-' },
    { title: '申请时间', dataIndex: 'created_at', render: v => v?.slice(0, 10) },
    {
      title: '状态', dataIndex: 'status',
      render: v => { const m = requestStatusMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : v; },
    },
    { title: '审核意见', dataIndex: 'review_note', ellipsis: true, render: v => v || '-' },
    {
      title: '操作',
      render: (_, r) => r.status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openReview(r, 'approve')}>通过</Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => openReview(r, 'reject')}>拒绝</Button>
        </Space>
      ) : <Text type="secondary" style={{ fontSize: 12 }}>已处理</Text>,
    },
  ];

  const renderRequestCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginBottom: 4 }}>{record.person_name}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{record.city || '-'}</Text>
            </div>
            <Tag color={requestStatusMap[record.status]?.color}>{requestStatusMap[record.status]?.label}</Tag>
          </div>
          <Text>礼品：{record.gift_name} × {record.quantity}{record.gift_unit}</Text>
          <Text type="secondary">单价：¥{(record.gift_price || 0).toFixed(2)} · 申请人：{record.requester_name}</Text>
          {record.plan_title && <Tag>{record.plan_title}</Tag>}
          {record.notes && (
            <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
              申请备注：{record.notes}
            </Typography.Paragraph>
          )}
          {record.review_note && (
            <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
              审核意见：{record.review_note}
            </Typography.Paragraph>
          )}
          {record.status === 'pending' ? (
            <Space size="small" wrap>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openReview(record, 'approve')}>通过</Button>
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => openReview(record, 'reject')}>拒绝</Button>
            </Space>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>已处理</Text>
          )}
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Select value={filterStatus} style={{ width: isMobile ? '100%' : 120 }} onChange={setFilterStatus} allowClear placeholder="全部状态">
          {Object.entries(requestStatusMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
        </Select>
      </div>

      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 15, showSizeChanger: false }}
          locale={{ emptyText: '暂无申请数据' }}
          renderItem={renderRequestCard}
        />
      ) : (
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
          pagination={{ defaultPageSize: 15 }} scroll={{ x: 1000 }} />
      )}

      <Modal
        title={reviewAction === 'approve' ? '✅ 确认审核通过' : '❌ 确认拒绝申请'}
        open={reviewModal}
        onOk={handleReview}
        onCancel={() => setReviewModal(false)}
        okText={reviewAction === 'approve' ? '确认通过' : '确认拒绝'}
        okButtonProps={{ danger: reviewAction === 'reject' }}
        cancelText="取消"
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        {reviewing && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, fontSize: 13 }}>
            <div>收礼人：<strong>{reviewing.person_name}</strong></div>
            <div>礼品：<strong>{reviewing.gift_name}</strong> × {reviewing.quantity}{reviewing.gift_unit}</div>
            <div>申请人：{reviewing.requester_name}</div>
            {reviewAction === 'approve' && <div style={{ color: '#52c41a', marginTop: 4 }}>通过后将自动扣减库存并生成送礼记录</div>}
          </div>
        )}
        <Form form={form} layout="vertical" size="small">
          <Form.Item label={reviewAction === 'approve' ? '审核备注（选填）' : '拒绝原因'} name="review_note"
            rules={reviewAction === 'reject' ? [{ required: true, message: '请填写拒绝原因' }] : []}>
            <TextArea rows={2} placeholder={reviewAction === 'approve' ? '可填写审核备注...' : '请说明拒绝原因...'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 送礼记录Tab ====================
function RecordsTab() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPersonName, setFilterPersonName] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await giftRecordsApi.list({
      status: filterStatus || undefined,
      person_name: filterPersonName.trim() || undefined,
      company: filterCompany.trim() || undefined,
    });
    setData(res);
    setLoading(false);
  }, [filterStatus, filterPersonName, filterCompany]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({
      status: r.status,
      send_date: r.send_date,
      courier_company: r.courier_company,
      tracking_number: r.tracking_number,
      feedback: r.feedback,
      rating: r.rating,
    });
    setEditModal(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    await giftRecordsApi.update(editing.id, values);
    message.success('已更新');
    setEditModal(false);
    load();
  };

  const canEdit = (r) => r.sender_id === user.id || isAdmin(user.role) || user.role === 'leader';

  const columns = [
    { title: '送礼人', dataIndex: 'sender_name' },
	    {
	      title: '收礼人',
	      render: (_, r) => (
	        <div>
	          <Text strong>{r.person_name}</Text>
	          <div style={{ fontSize: 11, color: '#888' }}>{r.city || '-'}</div>
	        </div>
	      ),
	    },
    { title: '公司', dataIndex: 'company', render: v => v || '-' },
	    { title: '礼品', render: (_, r) => <span>{r.gift_name} × {r.quantity}{r.gift_unit}</span> },
	    { title: '礼品价值', render: (_, r) => `¥${((r.gift_price || 0) * r.quantity).toFixed(2)}` },
	    { title: '送出日期', dataIndex: 'send_date', render: v => v || '-' },
    { title: '快递公司', dataIndex: 'courier_company', render: v => v || '-' },
    { title: '快递单号', dataIndex: 'tracking_number', ellipsis: true, render: v => v || '-' },
    {
      title: '状态', dataIndex: 'status',
      render: v => { const m = recordStatusMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : v; },
    },
    {
      title: '反馈评分', dataIndex: 'rating',
      render: v => v ? <Rate disabled value={v} style={{ fontSize: 12 }} /> : <Text type="secondary" style={{ fontSize: 12 }}>未填写</Text>,
    },
    { title: '反馈内容', dataIndex: 'feedback', ellipsis: true, render: v => v || '-' },
    { title: '生成时间', dataIndex: 'created_at', render: v => v?.slice(0, 10) },
    {
      title: '操作',
      render: (_, r) => canEdit(r) ? (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>更新状态/反馈</Button>
      ) : null,
    },
  ];

  const renderRecordCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginBottom: 4 }}>{record.person_name}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{record.company || record.city || '-'}</Text>
            </div>
            <Tag color={recordStatusMap[record.status]?.color}>{recordStatusMap[record.status]?.label}</Tag>
          </div>
	          <Text>礼品：{record.gift_name} × {record.quantity}{record.gift_unit}</Text>
          <Text type="secondary">公司：{record.company || '-'}</Text>
	          <Text type="secondary">送礼人：{record.sender_name || '-'}</Text>
	          <Text type="secondary">礼品价值：¥{((record.gift_price || 0) * record.quantity).toFixed(2)}</Text>
	          {record.send_date && <Text type="secondary">送出日期：{record.send_date}</Text>}
          {(record.courier_company || record.tracking_number) && (
            <Text type="secondary">物流：{[record.courier_company, record.tracking_number].filter(Boolean).join(' / ')}</Text>
          )}
          {record.rating ? <Rate disabled value={record.rating} style={{ fontSize: 12 }} /> : <Text type="secondary" style={{ fontSize: 12 }}>未填写评分</Text>}
          {record.feedback && (
            <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
              反馈：{record.feedback}
            </Typography.Paragraph>
          )}
          {canEdit(record) && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>更新状态/反馈</Button>
          )}
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Select value={filterStatus || undefined} allowClear placeholder="全部状态" style={{ width: isMobile ? '100%' : 120 }} onChange={v => setFilterStatus(v || '')}>
            {Object.entries(recordStatusMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
          </Select>
          <Input
            allowClear
            placeholder="收礼人"
            value={filterPersonName}
            onChange={event => setFilterPersonName(event.target.value)}
            style={{ width: isMobile ? '100%' : 180 }}
          />
          <Input
            allowClear
            placeholder="公司名称"
            value={filterCompany}
            onChange={event => setFilterCompany(event.target.value)}
            style={{ width: isMobile ? '100%' : 200 }}
          />
        </Space>
      </div>

      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 15, showSizeChanger: false }}
          locale={{ emptyText: '暂无送礼记录' }}
          renderItem={renderRecordCard}
        />
      ) : (
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
          pagination={{ defaultPageSize: 15 }} scroll={{ x: 1380 }} />
      )}

      <Modal title="更新送礼状态 & 回填反馈" open={editModal}
        onOk={handleSave} onCancel={() => setEditModal(false)} okText="保存" cancelText="取消"
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}>
        <Form form={form} layout="vertical" size="small">
          <Form.Item label="送礼状态" name="status" rules={[{ required: true }]}>
            <Select>
              {Object.entries(recordStatusMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="实际送出日期" name="send_date">
            <Input placeholder="如：2026-09-29" />
          </Form.Item>
          <Form.Item label="快递公司" name="courier_company">
            <Input placeholder="如：顺丰、京东、德邦" />
          </Form.Item>
          <Form.Item label="快递单号" name="tracking_number">
            <Input placeholder="填写快递单号" />
          </Form.Item>
          <Form.Item label="收礼人满意度" name="rating">
            <Rate allowClear />
          </Form.Item>
          <Form.Item label="收礼人反馈" name="feedback">
            <TextArea rows={3} placeholder="记录收礼人的反馈、态度、后续跟进建议..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 主页面 ====================
export default function GiftReviewPage() {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    giftRequestsApi.list({ status: 'pending' }).then(res => setPendingCount(res.length)).catch(() => {});
  }, []);

  const items = [];
  if (user.role === 'leader' || isAdmin(user.role)) {
    items.push({
      key: 'review',
      label: <span><AuditOutlined /> 审核申请 {pendingCount > 0 && <Badge count={pendingCount} size="small" style={{ marginLeft: 4 }} />}</span>,
      children: <ReviewTab />,
    });
  }
  items.push({
    key: 'records',
    label: <span><GiftOutlined /> 送礼记录</span>,
    children: <RecordsTab />,
  });

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <Tabs items={items} defaultActiveKey={user.role === 'member' ? 'records' : 'review'} />
    </div>
  );
}
