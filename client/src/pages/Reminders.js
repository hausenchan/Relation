import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Space, Button, Popconfirm, Badge, Select, message, Modal, Form, Input, DatePicker, Row, Col, Tooltip } from 'antd';
import { CheckOutlined, DeleteOutlined, PlusOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { remindersApi, personsApi } from '../api';
import dayjs from 'dayjs';


const { Option } = Select;

const typeMap = {
  follow_up: { label: '跟进', color: 'blue' },
  birthday:  { label: '生日', color: 'pink' },
  gift:      { label: '送礼', color: 'gold' },
  meeting:   { label: '会议', color: 'purple' },
  other:     { label: '其他', color: 'default' },
};

export default function Reminders() {
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加提醒</Button>
          <Button onClick={() => setShowDone(v => !v)}>
            {showDone ? '仅显示未完成' : '显示全部'}
          </Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        rowClassName={r => r.done ? 'done-row' : ''}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="添加提醒"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
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
            <Col span={12}>
              <Form.Item label="提醒日期" name="remind_date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
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
