import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Select, Modal, Form, message,
  Drawer, Descriptions, Tooltip, Input, Grid, List
} from 'antd';
import { RiseOutlined, EditOutlined, UserOutlined } from '@ant-design/icons';
import { opportunitiesApi, usersApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

export default function Opportunities() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [users, setUsers] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm] = Form.useForm();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterAssignee) params.assignee = filterAssignee;
      const res = await opportunitiesApi.list(params);
      setData(res);
    } catch {
      message.error('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterAssignee]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersApi.listSimple().then(setUsers).catch(() => {});
  }, []);

  const openEdit = (record) => {
    setEditTarget(record);
    editForm.setFieldsValue({
      opportunity_title: record.opportunity_title,
      opportunity_status: record.opportunity_status,
      opportunity_assignee: record.opportunity_assignee || undefined,
      opportunity_note: record.opportunity_note,
    });
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    const values = await editForm.validateFields();
    await opportunitiesApi.update(editTarget.id, { ...values, source_type: editTarget.source_type });
    message.success('更新成功');
    setEditModalOpen(false);
    load();
  };

  const columns = [
    {
      title: '来源',
      dataIndex: 'source_type',
      width: 120,
      render: (v) => v === 'competitor_research' ? <Tag color="orange">竞品研究记录</Tag> : <Tag color="blue">互动记录</Tag>,
    },
    {
      title: '关联对象',
      render: (_, r) => {
        if (r.source_type === 'competitor_research') {
          return (
            <Space size={4}>
              <Text strong>{r.company_name || '-'}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>(公司)</Text>
            </Space>
          );
        }
        return (
          <Space size={4}>
            <UserOutlined style={{ color: '#888' }} />
            <Text strong>{r.person_name}</Text>
            {(r.company || r.current_company) && (
              <Text type="secondary" style={{ fontSize: 12 }}>({r.company || r.current_company})</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '商机标题',
      render: (_, r) => (
        <Button type="link" style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => { setDetailRecord(r); setDetailOpen(true); }}>
          <RiseOutlined style={{ marginRight: 4 }} />{r.opportunity_title}
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'opportunity_status',
      render: v => {
        const s = opportunityStatusMap[v] || { label: v || '-', color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '指派给',
      dataIndex: 'assignee_name',
      render: v => v ? <Tag icon={<UserOutlined />}>{v}</Tag> : <Text type="secondary">未指派</Text>,
    },
    {
      title: '互动日期',
      dataIndex: 'date',
      sorter: (a, b) => a.date?.localeCompare(b.date),
      render: v => v || '-',
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      render: v => <Text type="secondary">{v || '-'}</Text>,
    },
    {
      title: '操作',
      render: (_, r) => (
        <Tooltip title="编辑商机">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
        </Tooltip>
      ),
    },
  ];

  const renderOpportunityCard = (record) => {
    const status = opportunityStatusMap[record.opportunity_status] || { label: record.opportunity_status || '-', color: 'default' };
    const subject = record.source_type === 'competitor_research'
      ? `${record.company_name || '-'} (公司)`
      : `${record.person_name || '-'}${(record.company || record.current_company) ? ` (${record.company || record.current_company})` : ''}`;

    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setDetailRecord(record); setDetailOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setDetailRecord(record);
              setDetailOpen(true);
            }
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
                  <RiseOutlined style={{ marginRight: 4 }} />{record.opportunity_title}
                </div>
                <Text type="secondary">{subject}</Text>
              </div>
              <Tag color={status.color}>{status.label}</Tag>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Text type="secondary">来源：{record.source_type === 'competitor_research' ? '竞品研究记录' : '互动记录'}</Text>
              <Text type="secondary">日期：{record.date || '-'}</Text>
              <Text type="secondary">创建人：{record.created_by_name || '-'}</Text>
            </div>

            <Text type="secondary">指派给：{record.assignee_name || '未指派'}</Text>

            {record.opportunity_note && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                商机说明：{record.opportunity_note}
              </Typography.Paragraph>
            )}

            <Space size="small" wrap>
              <Button size="small" icon={<EditOutlined />} onClick={(event) => { event.stopPropagation(); openEdit(record); }}>编辑</Button>
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>商机管理</Title>
      </div>

      <Space style={{ marginBottom: 16, width: isMobile ? '100%' : undefined }} wrap direction={isMobile ? 'vertical' : 'horizontal'}>
        <Select
          placeholder="商机状态"
          allowClear
          style={{ width: isMobile ? '100%' : 130 }}
          value={filterStatus || undefined}
          onChange={v => setFilterStatus(v || '')}
        >
          {Object.entries(opportunityStatusMap).map(([k, v]) => (
            <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
          ))}
        </Select>
        <Select
          placeholder="指派人"
          allowClear
          showSearch
          style={{ width: isMobile ? '100%' : 160 }}
          value={filterAssignee || undefined}
          onChange={v => setFilterAssignee(v || '')}
          filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
        />
      </Space>

      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无商机记录' }}
          renderItem={renderOpportunityCard}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: '暂无商机记录' }}
          expandable={{
            expandedRowRender: r => (
              <div style={{ padding: '8px 16px', background: '#fafafa', borderRadius: 6 }}>
                {r.description && <div><Text type="secondary">互动描述：</Text>{r.description}</div>}
                {r.outcome && <div><Text type="secondary">互动结果：</Text>{r.outcome}</div>}
                {r.opportunity_note && <div><Text type="secondary">商机说明：</Text>{r.opportunity_note}</div>}
              </div>
            ),
            rowExpandable: r => !!(r.description || r.outcome || r.opportunity_note),
          }}
        />
      )}

      {/* 编辑商机弹窗 */}
      <Modal
        title="编辑商机信息"
        open={editModalOpen}
        onOk={handleSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="商机标题" name="opportunity_title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="商机状态" name="opportunity_status">
            <Select>
              {Object.entries(opportunityStatusMap).map(([k, v]) => (
                <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="指派跟进人" name="opportunity_assignee">
            <Select
              allowClear
              showSearch
              placeholder="选择系统用户"
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Form.Item>
          <Form.Item label="商机补充说明" name="opportunity_note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title="商机详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 480}
        extra={
          detailRecord && (
            <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detailRecord); }}>
              编辑
            </Button>
          )
        }
      >
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="人脉">
              {detailRecord.person_name}
              {(detailRecord.company || detailRecord.current_company) &&
                ` (${detailRecord.company || detailRecord.current_company})`}
            </Descriptions.Item>
            <Descriptions.Item label="商机标题">{detailRecord.opportunity_title}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={opportunityStatusMap[detailRecord.opportunity_status]?.color}>
                {opportunityStatusMap[detailRecord.opportunity_status]?.label || detailRecord.opportunity_status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="指派给">{detailRecord.assignee_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="商机说明"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.opportunity_note || '-'}</div></Descriptions.Item>
            <Descriptions.Item label="互动日期">{detailRecord.date}</Descriptions.Item>
            <Descriptions.Item label="互动描述"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.description || '-'}</div></Descriptions.Item>
            <Descriptions.Item label="互动结果"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.outcome || '-'}</div></Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.created_by_name || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
