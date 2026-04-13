import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, Tag, Space, Typography, Popconfirm, Button, Modal, Form, Input, InputNumber, DatePicker, Row, Col, message, Dropdown, Collapse, Divider } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, CalendarOutlined, CloseCircleOutlined, RiseOutlined } from '@ant-design/icons';
import { competitorResearchApi, companiesApi } from '../api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const importanceMap = {
  high: { label: '重要', color: 'red' },
  medium: { label: '中等', color: 'orange' },
  normal: { label: '一般', color: 'default' },
};

export default function CompetitorResearch() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterImportance, setFilterImportance] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);

  const DATE_SHORTCUTS = [
    { label: '今天',     getRange: () => { const d = dayjs().format('YYYY-MM-DD'); return { start: d, end: d }; } },
    { label: '昨天',     getRange: () => { const d = dayjs().subtract(1,'day').format('YYYY-MM-DD'); return { start: d, end: d }; } },
    { label: '最近7天',  getRange: () => ({ start: dayjs().subtract(6,'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }) },
    { label: '最近30天', getRange: () => ({ start: dayjs().subtract(29,'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }) },
    { label: '本月',     getRange: () => ({ start: dayjs().startOf('month').format('YYYY-MM-DD'), end: dayjs().endOf('month').format('YYYY-MM-DD') }) },
  ];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!selectedCompany) {
      setData([]);
      return;
    }
    setLoading(true);
    const params = { company_id: selectedCompany };
    const res = await competitorResearchApi.list(params);

    let filtered = res;
    if (filterImportance) filtered = filtered.filter(r => r.importance === filterImportance);
    if (dateRange) {
      filtered = filtered.filter(r => r.date >= dateRange.start && r.date <= dateRange.end);
    }

    setData(filtered);
    setLoading(false);
  }, [selectedCompany, filterImportance, dateRange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    companiesApi.list({}).then(setCompanies);
  }, []);

  const handleDelete = async (id) => {
    await competitorResearchApi.delete(id);
    load();
  };

  const openAdd = () => {
    if (!selectedCompany) {
      message.warning('请先选择公司');
      return;
    }
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ date: dayjs() });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date) : null,
      next_action_date: record.next_action_date ? dayjs(record.next_action_date) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      company_id: selectedCompany,
      date: values.date ? dayjs(values.date).format('YYYY-MM-DD') : null,
      next_action_date: values.next_action_date ? dayjs(values.next_action_date).format('YYYY-MM-DD') : null,
    };
    if (editing) {
      await competitorResearchApi.update(editing.id, payload);
      message.success('更新成功');
    } else {
      await competitorResearchApi.create(payload);
      message.success('添加成功');
    }
    setModalOpen(false);
    load();
  };

  const columns = [
    { title: '日期', dataIndex: 'date', width: 110, sorter: (a, b) => a.date.localeCompare(b.date) },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '重要程度',
      dataIndex: 'importance',
      width: 90,
      render: (v) => {
        const m = importanceMap[v] || importanceMap.normal;
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    { title: '金额', dataIndex: 'amount', width: 100, render: (v) => v ? `¥${v}` : '-' },
    { title: '结果', dataIndex: 'outcome', ellipsis: true },
    { title: '下次行动', dataIndex: 'next_action', ellipsis: true },
    { title: '下次日期', dataIndex: 'next_action_date', width: 110 },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const dateMenuItems = [
    ...DATE_SHORTCUTS.map((s, i) => ({
      key: `shortcut-${i}`,
      label: s.label,
      onClick: () => {
        const range = s.getRange();
        setDateRange({ ...range, label: s.label });
      },
    })),
    { type: 'divider' },
    {
      key: 'custom',
      label: '自定义日期',
      onClick: () => setCustomPickerOpen(true),
    },
    dateRange && { type: 'divider' },
    dateRange && {
      key: 'clear',
      label: <span style={{ color: '#ff4d4f' }}><CloseCircleOutlined /> 清除筛选</span>,
      onClick: () => setDateRange(null),
    },
  ].filter(Boolean);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>竞品研究记录</Title>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Select
          placeholder="选择公司"
          style={{ width: 200 }}
          value={selectedCompany}
          onChange={setSelectedCompany}
          allowClear
          showSearch
          filterOption={(input, option) =>
            option.children.toLowerCase().includes(input.toLowerCase())
          }
        >
          {companies.map(c => (
            <Option key={c.id} value={c.id}>{c.name}</Option>
          ))}
        </Select>

        <Select
          placeholder="重要程度"
          allowClear
          style={{ width: 120 }}
          value={filterImportance || undefined}
          onChange={v => setFilterImportance(v || '')}
        >
          {Object.entries(importanceMap).map(([k, v]) => (
            <Option key={k} value={k}>{v.label}</Option>
          ))}
        </Select>

        <Dropdown menu={{ items: dateMenuItems }} trigger={['click']}>
          <Button icon={<CalendarOutlined />}>
            {dateRange ? dateRange.label || `${dateRange.start} ~ ${dateRange.end}` : '日期筛选'}
          </Button>
        </Dropdown>

        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          添加记录
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      />

      <Modal
        title={editing ? '编辑记录' : '添加记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={720}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="日期" name="date" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="重要程度" name="importance" initialValue="normal">
                <Select>
                  {Object.entries(importanceMap).map(([k, v]) => (
                    <Option key={k} value={k}>{v.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="金额" name="amount">
                <InputNumber style={{ width: '100%' }} placeholder="选填" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
                <Input placeholder="简要描述本次研究内容" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="详细内容" name="content">
                <Input.TextArea rows={3} placeholder="详细记录..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="信息来源" name="source">
                <Input placeholder="如：官网、行业报告" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="影响分析" name="impact">
                <Input.TextArea rows={2} placeholder="对我们的影响..." />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="结果" name="outcome">
                <Input.TextArea rows={2} placeholder="本次研究的结果..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下次行动" name="next_action">
                <Input placeholder="下一步计划..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下次行动日期" name="next_action_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="自定义日期范围"
        open={customPickerOpen}
        onCancel={() => setCustomPickerOpen(false)}
        onOk={() => {
          const start = form.getFieldValue('custom_start');
          const end = form.getFieldValue('custom_end');
          if (start && end) {
            setDateRange({
              start: dayjs(start).format('YYYY-MM-DD'),
              end: dayjs(end).format('YYYY-MM-DD'),
            });
          }
          setCustomPickerOpen(false);
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="开始日期" name="custom_start">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="结束日期" name="custom_end">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
