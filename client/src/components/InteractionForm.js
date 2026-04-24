import React, { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Button, Space, message, Card, Collapse, Tag, Row, Col } from 'antd';
import { PlusOutlined, RiseOutlined } from '@ant-design/icons';
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

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

export default function InteractionForm({ personId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (open) fetchUsers();
  }, [open]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      await interactionsApi.create({
        person_id: personId,
        ...values,
        date: values.date?.format('YYYY-MM-DD'),
        next_action_date: values.next_action_date?.format('YYYY-MM-DD'),
      });
      message.success('记录已添加');
      form.resetFields();
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      message.error('添加失败');
    } finally {
      setLoading(false);
    }
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

        <Collapse ghost style={{ marginBottom: 8 }}>
          <Collapse.Panel key="opp" header={<span style={{ color: '#1677ff', fontWeight: 500 }}><RiseOutlined /> 商机信息（可选）</span>}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="商机标题" name="opportunity_title">
                  <Input placeholder="简述商机，如：XX采购合作意向" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="商机状态" name="opportunity_status" initialValue="new">
                  <Select allowClear placeholder="选择状态">
                    {Object.entries(opportunityStatusMap).map(([k, v]) => (
                      <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="指派跟进人" name="opportunity_assignee">
                  <Select
                    allowClear
                    showSearch
                    placeholder="选择系统用户（指派后对方会收到跟进任务）"
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={users.map(u => ({
                      value: u.id,
                      label: u.display_name || u.username,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="商机补充说明" name="opportunity_note">
                  <Input.TextArea rows={2} placeholder="背景、需求或其他说明" />
                </Form.Item>
              </Col>
            </Row>
          </Collapse.Panel>
        </Collapse>

        <Space>
          <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
          <Button onClick={() => { setOpen(false); form.resetFields(); }}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
