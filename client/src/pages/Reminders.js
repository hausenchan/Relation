import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Space, Button, Popconfirm, Badge, Select, message, Modal, Form, Input, DatePicker, Row, Col, Tooltip, Grid, List, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined, PlusOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { remindersApi, personsApi } from '../api';
import dayjs from 'dayjs';


const { Option } = Select;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const typeMap = {
  follow_up: { label: '跟进', color: 'blue' },
  birthday:  { label: '生日', color: 'pink' },
  gift:      { label: '送礼', color: 'gold' },
  meeting:   { label: '会议', color: 'purple' },
  other:     { label: '其他', color: 'default' },
};

export default function Reminders() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [persons, setPersons] = useState([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await remindersApi.list({ done: showDone ? undefined : 0 });
    setData(res);
    setLoading(false);
  }, [showDone]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    personsApi.list({}).then(setPersons);
  }, []);

  const handleDone = async (id) => {
    await remindersApi.done(id);
    message.success('已完成');
    load();
  };

  const handleDelete = async (id) => {
    await remindersApi.delete(id);
    load();
  };

  const openAdd = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    await remindersApi.create({
      ...values,
      remind_date: values.remind_date?.format('YYYY-MM-DD'),
    });
    message.success('提醒已添加');
    setModalOpen(false);
    load();
  };

  const columns = [
    {
      title: '状态',
      dataIndex: 'remind_date',
      render: (v, r) => {
        if (r.done) return <Badge status="default" text="已完成" />;
        const targetDate = r.actual_date || v;
        const diff = dayjs(targetDate).startOf('day').diff(dayjs().startOf('day'), 'day');
        if (diff < 0) return <Badge status="error" text={`逾期${Math.abs(diff)}天`} />;
        if (diff === 0) return <Badge status="warning" text="今天" />;
        if (diff <= 3) return <Badge status="processing" text={`${diff}天后`} />;
        return <Badge status="default" text={`${diff}天后`} />;
      },
    },
    {
      title: (
        <span>
          提醒日期{' '}
          <Tooltip title="提前3天提醒">
            <InfoCircleOutlined style={{ color: '#1890ff', fontSize: 12 }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'remind_date'
    },
    {
      title: '实际跟进日期',
      dataIndex: 'actual_date',
      render: v => v || '-'
    },
    {
      title: '对象',
      render: (_, r) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{r.person_name}</span>
          {(r.person_company || r.current_company) && (
            <span style={{ color: '#999', fontSize: 12 }}>({r.person_company || r.current_company})</span>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: v => <Tag color={typeMap[v]?.color}>{typeMap[v]?.label || v}</Tag>,
    },
    { title: '提醒事项', dataIndex: 'title', ellipsis: true },
    { title: '备注', dataIndex: 'note', ellipsis: true },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          {!r.done && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleDone(r.id)}>
              完成
            </Button>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderReminderCard = (record) => {
    const targetDate = record.actual_date || record.remind_date;
    const diff = dayjs(targetDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    const statusNode = record.done
      ? <Badge status="default" text="已完成" />
      : diff < 0
        ? <Badge status="error" text={`逾期${Math.abs(diff)}天`} />
        : diff === 0
          ? <Badge status="warning" text="今天" />
          : diff <= 3
            ? <Badge status="processing" text={`${diff}天后`} />
            : <Badge status="default" text={`${diff}天后`} />;
    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          style={{
            width: '100%',
            padding: 14,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            opacity: record.done ? 0.65 : 1,
          }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginBottom: 4, overflowWrap: 'anywhere' }}>{record.title}</div>
                <Space size={6} align="center" wrap>
                  <Text strong>{record.person_name}</Text>
                  {(record.person_company || record.current_company) && (
                    <Text type="secondary" style={{ fontSize: 12 }}>({record.person_company || record.current_company})</Text>
                  )}
                </Space>
              </div>
              <div style={{ alignSelf: isMobile ? 'flex-start' : undefined }}>{statusNode}</div>
            </div>

            <Space wrap size={[6, 6]}>
              <Tag color={typeMap[record.type]?.color}>{typeMap[record.type]?.label || record.type}</Tag>
              <Tag>提醒：{record.remind_date || '-'}</Tag>
              {record.actual_date && <Tag color="green">实际跟进：{record.actual_date}</Tag>}
            </Space>

            {record.note && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                备注：{record.note}
              </Typography.Paragraph>
            )}

            <Space size="small" wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
              {!record.done && (
                <Button size="small" type="primary" icon={<CheckOutlined />} style={{ width: isMobile ? '100%' : undefined }} onClick={() => handleDone(record.id)}>
                  完成
                </Button>
              )}
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} style={{ width: isMobile ? '100%' : undefined }}>删除</Button>
              </Popconfirm>
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加提醒</Button>
          <Button onClick={() => setShowDone(v => !v)} style={{ width: isMobile ? '100%' : undefined }}>
            {showDone ? '仅显示未完成' : '显示全部'}
          </Button>
        </Space>
      </div>
      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false, simple: isMobile }}
          locale={{ emptyText: '暂无提醒' }}
          renderItem={renderReminderCard}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          rowClassName={r => r.done ? 'done-row' : ''}
          pagination={{ pageSize: 20 }}
        />
      )}

      <Modal
        title="添加提醒"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 600}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="选择人员" name="person_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择具体对象"
                  showSearch
                  filterOption={(input, option) =>
                    option.children.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {persons.map(p => (
                    <Option key={p.id} value={p.id}>
                      {p.name}{(p.company || p.current_company) && ` (${p.company || p.current_company})`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="提醒日期" name="remind_date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="类型" name="type" initialValue="follow_up">
                <Select>
                  <Option value="follow_up">跟进</Option>
                  <Option value="birthday">生日</Option>
                  <Option value="gift">送礼</Option>
                  <Option value="meeting">会议</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="提醒事项" name="title" rules={[{ required: true }]}>
                <Input placeholder="提醒内容" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="note">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <style>{`.done-row { opacity: 0.5; }`}</style>
    </div>
  );
}
