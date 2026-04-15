import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Select, Modal, Form, message,
  Drawer, Descriptions, Tooltip, Input, Card, Row, Col
} from 'antd';
import { RiseOutlined, EditOutlined, UserOutlined, FunnelPlotOutlined } from '@ant-design/icons';
import { opportunitiesApi, usersApi } from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

export default function Leads() {
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

  return (
    <div>
      {/* 页面头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18,
          }}>
            <FunnelPlotOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1f2937' }}>线索池</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>管理商机线索，跟踪转化进度</Text>
          </div>
        </div>
      </div>

      {/* 统计概览 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '全部线索', value: data.length, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { label: '新商机', value: data.filter(d => d.opportunity_status === 'new').length, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '跟进中', value: data.filter(d => d.opportunity_status === 'following').length, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          { label: '已成交', value: data.filter(d => d.opportunity_status === 'won').length, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
        ].map((item, idx) => (
          <Col xs={12} sm={6} key={idx}>
            <div className="stat-card" style={{
              background: item.gradient, borderRadius: 10, padding: '14px 18px',
              cursor: 'default',
            }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 筛选与表格 */}
      <Card style={{ borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="商机状态"
            allowClear
            style={{ width: 130 }}
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
            style={{ width: 160 }}
            value={filterAssignee || undefined}
            onChange={v => setFilterAssignee(v || '')}
            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
          />
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: '暂无线索记录' }}
          expandable={{
            expandedRowRender: r => (
              <div style={{ padding: '8px 16px', background: '#f8fafc', borderRadius: 8 }}>
                {r.description && <div><Text type="secondary">互动描述：</Text>{r.description}</div>}
                {r.outcome && <div><Text type="secondary">互动结果：</Text>{r.outcome}</div>}
                {r.opportunity_note && <div><Text type="secondary">商机说明：</Text>{r.opportunity_note}</div>}
              </div>
            ),
            rowExpandable: r => !!(r.description || r.outcome || r.opportunity_note),
          }}
        />
      </Card>

      <Modal
        title="编辑商机信息"
        open={editModalOpen}
        onOk={handleSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
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

      <Drawer
        title="商机详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={480}
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
            <Descriptions.Item label="商机说明">{detailRecord.opportunity_note || '-'}</Descriptions.Item>
            <Descriptions.Item label="互动日期">{detailRecord.date}</Descriptions.Item>
            <Descriptions.Item label="互动描述">{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="互动结果">{detailRecord.outcome || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.created_by_name || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
