import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Modal, Form, Input,
  Tabs, message, Tooltip, Drawer, Descriptions, Badge, Grid, List
} from 'antd';
import {
  CheckOutlined, PlayCircleOutlined, RiseOutlined, UserOutlined, CalendarOutlined
} from '@ant-design/icons';
import { followUpTasksApi } from '../api';
import { useAuth } from '../AuthContext';
import dayjs from 'dayjs';

const { Text } = Typography;
const { useBreakpoint } = Grid;

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
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user } = useAuth();
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
    try {
      await followUpTasksApi.update(record.id, { status: 'in_progress' });
      message.success('已开始跟进');
      load();
    } catch (err) {
      message.error(err.response?.data?.error || '开始跟进失败');
    }
  };

  const openDone = (record) => {
    setDoneTarget(record);
    doneForm.resetFields();
    setDoneModalOpen(true);
  };

  const handleDone = async () => {
    try {
      const values = await doneForm.validateFields();
      await followUpTasksApi.update(doneTarget.id, { status: 'done', done_note: values.done_note });
      message.success('已标记为完成');
      setDoneModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || '更新失败');
    }
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
      render: (_, r) => {
        const canOperate = r.assigned_to === user?.id;
        return (
        <Space>
          {canOperate && r.status === 'pending' && (
            <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(r)}>
              开始跟进
            </Button>
          )}
          {canOperate && r.status === 'in_progress' && (
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
      );
      },
    },
  ];

  const tabItems = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: <Badge status="default" text="待处理" /> },
    { key: 'in_progress', label: <Badge status="processing" text="跟进中" /> },
    { key: 'done', label: <Badge status="success" text="已完成" /> },
  ];

  const renderTaskCard = (record) => {
    const canOperate = record.assigned_to === user?.id;
    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => openDetail(record)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openDetail(record);
          }}
          style={{
            width: '100%',
            padding: 14,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
          }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginBottom: 4 }}>
                  <RiseOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                  {record.title}
                </div>
                <Typography.Text type="secondary">
                  {record.person_name || record.company_name || '-'}
                  {record.person_name && (record.company || record.current_company) ? ` (${record.company || record.current_company})` : ''}
                  {!record.person_name && record.company_name ? ' (公司)' : ''}
                </Typography.Text>
              </div>
              <Space direction="vertical" size={4} align="end">
                <Badge status={statusMap[record.status]?.badge} text={statusMap[record.status]?.label} />
                {record.due_date && (
                  <Tag color={dayjs(record.due_date).isBefore(dayjs(), 'day') ? 'red' : 'default'}>
                    <CalendarOutlined /> {record.due_date}
                  </Tag>
                )}
              </Space>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Typography.Text type="secondary">指派人：{record.assigned_by_name || '-'}</Typography.Text>
              <Typography.Text type="secondary">商机：{record.opportunity_title || '-'}</Typography.Text>
            </div>

            {record.opportunity_note && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                说明：{record.opportunity_note}
              </Typography.Paragraph>
            )}

            <Space size="small" wrap>
              {canOperate && record.status === 'pending' && (
                <Button size="small" icon={<PlayCircleOutlined />} onClick={(event) => { event.stopPropagation(); handleStart(record); }}>
                  开始跟进
                </Button>
              )}
              {canOperate && record.status === 'in_progress' && (
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={(event) => { event.stopPropagation(); openDone(record); }}>
                  完成
                </Button>
              )}
              {record.status === 'done' && (
                <Tooltip title={record.done_note || '无备注'}>
                  <Tag color="green">已完成 {record.done_at ? dayjs(record.done_at).format('MM-DD') : ''}</Tag>
                </Tooltip>
              )}
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  const pendingCount = data.filter(d => d.status !== 'done').length;

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      {pendingCount > 0 && <div style={{ marginBottom: 16 }}><Tag color="orange">{pendingCount} 条未完成</Tag></div>}

      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key)}
        items={tabItems}
        style={{ marginBottom: 12 }}
      />

      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无跟进任务' }}
          renderItem={renderTaskCard}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20 }}
          rowClassName={r => r.status === 'done' ? 'opacity-50' : ''}
        />
      )}

      {/* 完成确认弹窗 */}
      <Modal
        title="标记为完成"
        open={doneModalOpen}
        onOk={handleDone}
        onCancel={() => setDoneModalOpen(false)}
        okText="确认完成"
        cancelText="取消"
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
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
        width={isMobile ? '100%' : 480}
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
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.opportunity_note || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="指派人">{detailRecord.assigned_by_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="期望跟进日期">{detailRecord.due_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detailRecord.status]?.color}>{statusMap[detailRecord.status]?.label}</Tag>
              </Descriptions.Item>
              {detailRecord.done_note && (
                <Descriptions.Item label="完成备注"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.done_note}</div></Descriptions.Item>
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
                  <Text style={{ display: 'block', whiteSpace: 'pre-wrap' }}>描述：{detailRecord.interaction_desc}</Text>
                )}
                {detailRecord.interaction_outcome && (
                  <Text style={{ display: 'block', whiteSpace: 'pre-wrap' }} type="secondary">结果：{detailRecord.interaction_outcome}</Text>
                )}
              </Space>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
