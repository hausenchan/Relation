import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Modal, Form, Input,
  Tabs, message, Tooltip, Drawer, Descriptions, Badge
} from 'antd';
import {
  CheckOutlined, PlayCircleOutlined, RiseOutlined, UserOutlined, CalendarOutlined
} from '@ant-design/icons';
import { followUpTasksApi } from '../api';
import dayjs from 'dayjs';

const { Text } = Typography;

const statusMap = {
  pending: { label: '待处理', color: 'default', badge: 'default' },
  in_progress: { label: '跟进中', color: 'orange', badge: 'processing' },
  done: { label: '已完成', color: 'green', badge: 'success' },
};

const interactionTypeMap = {
  visit: '拜访', call: '通话', gift: '送礼', meal: '餐饮',
  wechat: '微信', email: '邮件', meeting: '会议', other: '其他',
};

export default function FollowUpTasks() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [doneModalOpen, setDoneModalOpen] = useState(false);
  const [doneTarget, setDoneTarget] = useState(null);
  const [doneForm] = Form.useForm();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (activeTab !== 'all') params.status = activeTab;
    const res = await followUpTasksApi.list(params);
    setData(res);
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleStart = async (record) => {
    await followUpTasksApi.update(record.id, { status: 'in_progress' });
    message.success('已开始跟进');
    load();
  };

  const openDone = (record) => {
    setDoneTarget(record);
    doneForm.resetFields();
    setDoneModalOpen(true);
  };

  const handleDone = async () => {
    const values = await doneForm.validateFields();
    await followUpTasksApi.update(doneTarget.id, { status: 'done', done_note: values.done_note });
    message.success('已标记为完成');
    setDoneModalOpen(false);
    load();
  };

  const openDetail = (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: '任务',
      dataIndex: 'title',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0, textAlign: 'left', height: 'auto', whiteSpace: 'normal' }} onClick={() => openDetail(r)}>
          <RiseOutlined style={{ marginRight: 4, color: '#1677ff' }} />{v}
        </Button>
      ),
    },
    {
      title: '关联对象',
      render: (_, r) => (
        <Space size={4}>
          <UserOutlined style={{ color: '#888' }} />
          <Text>{r.person_name || r.company_name || '-'}</Text>
          {r.person_name && (r.company || r.current_company) && <Text type="secondary" style={{ fontSize: 12 }}>({r.company || r.current_company})</Text>}
          {!r.person_name && r.company_name && <Text type="secondary" style={{ fontSize: 12 }}>(公司)</Text>}
        </Space>
      ),
    },
    {
      title: '指派人',
      dataIndex: 'assigned_by_name',
      render: v => <Text type="secondary">{v || '-'}</Text>,
    },
    {
      title: '期望日期',
      dataIndex: 'due_date',
      render: v => {
        if (!v) return '-';
        const isOverdue = dayjs(v).isBefore(dayjs(), 'day');
        return <Tag color={isOverdue ? 'red' : 'default'}><CalendarOutlined /> {v}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: v => {
        const s = statusMap[v] || { label: v, color: 'default' };
        return <Badge status={statusMap[v]?.badge || 'default'} text={<Tag color={s.color}>{s.label}</Tag>} />;
      },
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          {r.status === 'pending' && (
            <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(r)}>
              开始跟进
            </Button>
          )}
          {r.status === 'in_progress' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openDone(r)}>
              完成
            </Button>
          )}
          {r.status === 'done' && (
            <Tooltip title={r.done_note || '无备注'}>
              <Tag color="green">已完成 {r.done_at ? dayjs(r.done_at).format('MM-DD') : ''}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: <Badge status="default" text="待处理" /> },
    { key: 'in_progress', label: <Badge status="processing" text="跟进中" /> },
    { key: 'done', label: <Badge status="success" text="已完成" /> },
  ];

  const pendingCount = data.filter(d => d.status !== 'done').length;

  return (
    <div>
      {pendingCount > 0 && <div style={{ marginBottom: 16 }}><Tag color="orange">{pendingCount} 条未完成</Tag></div>}

      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key)}
        items={tabItems}
        style={{ marginBottom: 12 }}
      />

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        rowClassName={r => r.status === 'done' ? 'opacity-50' : ''}
      />

      {/* 完成确认弹窗 */}
      <Modal
        title="标记为完成"
        open={doneModalOpen}
        onOk={handleDone}
        onCancel={() => setDoneModalOpen(false)}
        okText="确认完成"
        cancelText="取消"
      >
        <Form form={doneForm} layout="vertical">
          <Form.Item label="完成备注（跟进结果）" name="done_note" rules={[{ required: true, message: '请填写跟进结果' }]}>
            <Input.TextArea rows={3} placeholder="请描述跟进结果，如：已沟通完毕，对方有意向，下周安排演示..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title="跟进任务详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={480}
      >
        {detailRecord && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务标题">{detailRecord.title}</Descriptions.Item>
              <Descriptions.Item label="关联对象">
                {detailRecord.person_name || detailRecord.company_name || '-'}
                {detailRecord.person_name && (detailRecord.company || detailRecord.current_company) &&
                  ` (${detailRecord.company || detailRecord.current_company})`}
                {!detailRecord.person_name && detailRecord.company_name && ' (公司)'}
              </Descriptions.Item>
              <Descriptions.Item label="商机标题">
                {detailRecord.opportunity_title || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="商机说明">
                {detailRecord.opportunity_note || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="指派人">{detailRecord.assigned_by_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="期望跟进日期">{detailRecord.due_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detailRecord.status]?.color}>{statusMap[detailRecord.status]?.label}</Tag>
              </Descriptions.Item>
              {detailRecord.done_note && (
                <Descriptions.Item label="完成备注">{detailRecord.done_note}</Descriptions.Item>
              )}
              {detailRecord.done_at && (
                <Descriptions.Item label="完成时间">{dayjs(detailRecord.done_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              )}
            </Descriptions>

            <div style={{ background: '#fafafa', borderRadius: 8, padding: 12, border: '1px solid #f0f0f0' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>来源互动记录</Text>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space>
                  <Tag>{interactionTypeMap[detailRecord.interaction_type] || detailRecord.interaction_type}</Tag>
                  <Text type="secondary">{detailRecord.interaction_date}</Text>
                </Space>
                {detailRecord.interaction_desc && (
                  <Text style={{ display: 'block' }}>描述：{detailRecord.interaction_desc}</Text>
                )}
                {detailRecord.interaction_outcome && (
                  <Text style={{ display: 'block' }} type="secondary">结果：{detailRecord.interaction_outcome}</Text>
                )}
              </Space>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
