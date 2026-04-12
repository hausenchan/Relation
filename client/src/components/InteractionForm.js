import React, { useState } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Button, Space, message, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { interactionsApi } from '../api';
import dayjs from 'dayjs';

const { Option } = Select;

const typeOptions = [
  { value: 'visit', label: '拜访' },
  { value: 'call', label: '通话' },
  { value: 'gift', label: '送礼' },
  { value: 'meal', label: '餐饮' },
  { value: 'wechat', label: '微信' },
  { value: 'email', label: '邮件' },
  { value: 'meeting', label: '会议' },
  { value: 'other', label: '其他' },
];

export default function InteractionForm({ personId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const values = await form.validateFields();
    setLoading(true);
    await interactionsApi.create({
      person_id: personId,
      ...values,
      date: values.date?.format('YYYY-MM-DD'),
      next_action_date: values.next_action_date?.format('YYYY-MM-DD'),
    });
    message.success('记录已添加');
    form.resetFields();
    setOpen(false);
    setLoading(false);
    onSuccess?.();
  };

  if (!open) {
    return (
      <Button icon={<PlusOutlined />} type="dashed" block onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>
        添加互动记录
      </Button>
    );
  }

  return (
    <Card size="small" style={{ marginBottom: 12 }} title="新增互动记录">
      <Form form={form} layout="vertical" size="small">
        <Space style={{ width: '100%' }} wrap>
          <Form.Item label="日期" name="date" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
            <DatePicker defaultValue={dayjs()} />
          </Form.Item>
          <Form.Item label="类型" name="type" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
            <Select style={{ width: 100 }}>
              {typeOptions.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="金额(元)" name="amount" style={{ marginBottom: 8 }}>
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
        </Space>
        <Form.Item label="描述" name="description" style={{ marginBottom: 8 }}>
          <Input.TextArea rows={2} placeholder="本次互动内容..." />
        </Form.Item>
        <Form.Item label="结果/收获" name="outcome" style={{ marginBottom: 8 }}>
          <Input placeholder="此次互动的结果" />
        </Form.Item>
        <Space wrap>
          <Form.Item label="下次跟进事项" name="next_action" style={{ marginBottom: 8 }}>
            <Input style={{ width: 200 }} placeholder="如: 发送方案" />
          </Form.Item>
          <Form.Item label="跟进日期" name="next_action_date" style={{ marginBottom: 8 }}>
            <DatePicker />
          </Form.Item>
        </Space>
        <Space>
          <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
          <Button onClick={() => { setOpen(false); form.resetFields(); }}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
