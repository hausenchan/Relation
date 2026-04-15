import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Modal, Form, Input, DatePicker, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

export default function StrategicMeeting() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/executive/reports', {
        params: { report_type: 'strategic_monthly' }
      });
      setData(res.data);
    } catch (err) {
      console.error('获取战略月会记录失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({
      meeting_date: dayjs(),
      year: dayjs().year(),
      month: dayjs().month() + 1
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      meeting_date: record.meeting_date ? dayjs(record.meeting_date) : null
    });
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这条战略月会记录吗？',
      onOk: async () => {
        try {
          await axios.delete(`/api/executive/reports/${id}`);
          message.success('删除成功');
          fetchData();
        } catch (err) {
          message.error('删除失败');
        }
      }
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        report_type: 'strategic_monthly',
        meeting_date: values.meeting_date ? values.meeting_date.format('YYYY-MM-DD') : null,
        last_edited_by: user.username
      };

      if (editingRecord) {
        await axios.put(`/api/executive/reports/${editingRecord.id}`, payload);
        message.success('更新成功');
      } else {
        await axios.post('/api/executive/reports', payload);
        message.success('创建成功');
      }

      setModalVisible(false);
      fetchData();
    } catch (err) {
      console.error('提交失败:', err);
      message.error('提交失败');
    }
  };

  const columns = [
    {
      title: '会议日期',
      dataIndex: 'meeting_date',
      key: 'meeting_date',
      width: 120
    },
    {
      title: '年月',
      key: 'year_month',
      width: 100,
      render: (_, record) => `${record.year}年${record.month}月`
    },
    {
      title: '战略方向',
      dataIndex: 'strategic_direction',
      key: 'strategic_direction',
      ellipsis: true
    },
    {
      title: '重点关注',
      dataIndex: 'key_focus',
      key: 'key_focus',
      ellipsis: true
    },
    {
      title: '月度总结',
      dataIndex: 'monthly_summary',
      key: 'monthly_summary',
      ellipsis: true
    },
    {
      title: '参会人员',
      dataIndex: 'attendees',
      key: 'attendees',
      width: 150
    },
    {
      title: '最后编辑',
      key: 'last_edit',
      width: 150,
      render: (_, record) => `${record.last_edited_by || ''} ${record.last_edited_at || ''}`
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新建记录
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          </Space>
        }
      >
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Modal
        title={editingRecord ? '编辑战略月会记录' : '新建战略月会记录'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="会议日期" name="meeting_date" rules={[{ required: true, message: '请选择会议日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Space style={{ width: '100%' }}>
            <Form.Item label="年份" name="year" rules={[{ required: true, message: '请输入年份' }]}>
              <Input type="number" placeholder="2026" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item label="月份" name="month" rules={[{ required: true, message: '请输入月份' }]}>
              <Select style={{ width: 120 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <Option key={m} value={m}>{m}月</Option>
                ))}
              </Select>
            </Form.Item>
          </Space>

          <Form.Item label="战略方向" name="strategic_direction">
            <TextArea rows={3} placeholder="本月战略方向和重点布局" />
          </Form.Item>

          <Form.Item label="重点关注" name="key_focus">
            <TextArea rows={3} placeholder="需要重点关注的事项" />
          </Form.Item>

          <Form.Item label="月度总结" name="monthly_summary">
            <TextArea rows={4} placeholder="本月工作总结和成果" />
          </Form.Item>

          <Form.Item label="参会人员" name="attendees">
            <Input placeholder="CEO, COO, CTO, CMO" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
