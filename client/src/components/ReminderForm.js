import React, { useState } from 'react';
import { Form, Input, Select, DatePicker, Button, Space, message, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { remindersApi } from '../api';

const { Option } = Select;

export default function ReminderForm({ personId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const values = await form.validateFields();
    setLoading(true);
    await remindersApi.create({
      person_id: personId,
      ...values,
      remind_date: values.remind_date?.format('YYYY-MM-DD'),
    });
    message.success('提醒已添加');
    form.resetFields();
    setOpen(false);
    setLoading(false);
    onSuccess?.();
  };

  if (!open) {
    return (
      <Button icon={<PlusOutlined />} type="dashed" block onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>
        添加提醒
      </Button>
    );
  }

  return (
    <Card size="small" style={{ marginBottom: 12 }} title="新增提醒">
      <Form form={form} layout="vertical" size="small">
        <Space wrap>
          <Form.Item label="提醒日期" name="remind_date" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
            <DatePicker />
          </Form.Item>
          <Form.Item label="类型" name="type" initialValue="follow_up" style={{ marginBottom: 8 }}>
            <Select style={{ width: 110 }}>
              <Option value="follow_up">跟进</Option>
              <Option value="birthday">生日</Option>
              <Option value="gift">送礼</Option>
              <Option value="meeting">会议</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>
        </Space>
        <Form.Item label="提醒事项" name="title" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
          <Input placeholder="提醒内容" />
        </Form.Item>
        <Form.Item label="备注" name="note" style={{ marginBottom: 8 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
          <Button onClick={() => { setOpen(false); form.resetFields(); }}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
