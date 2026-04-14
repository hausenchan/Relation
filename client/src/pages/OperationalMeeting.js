import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Modal, Form, Input, DatePicker, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

export default function OperationalMeeting() {
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
        params: { report_type: 'operational_weekly' }
      });
      setData(res.data);
    } catch (err) {
      console.error('获取经营周会记录失败:', err);
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
      month: dayjs().month() + 1,
      week: Math.ceil(dayjs().date() / 7)
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
      content: '确定要删除这条经营周会记录吗？',
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
        report_type: 'operational_weekly',
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
      title: '年月周',
      key: 'year_month_week',
      width: 120,
      render: (_, record) => `${record.year}年${record.month}月第${record.week}周`
    },
    {
      title: '本周成果',
      dataIndex: 'weekly_results',
      key: 'weekly_results',
      ellipsis: true
    },
    {
      title: '关键判断',
      dataIndex: 'key_judgment',
      key: 'key_judgment',
      ellipsis: true
    },
    {
      title: '需决策事项',
      dataIndex: 'decision_needed',
      key: 'decision_needed',
      ellipsis: true
    },
    {
      title: '下周行动',
      dataIndex: 'next_week_actions',
      key: 'next_week_actions',
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
        title="经营周会"
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
        title={editingRecord ? '编辑经营周会记录' : '新建经营周会记录'}
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
              <Input type="number" placeholder="2026" style={{ width: 100 }} />
            </Form.Item>
            <Form.Item label="月份" name="month" rules={[{ required: true, message: '请输入月份' }]}>
              <Select style={{ width: 100 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <Option key={m} value={m}>{m}月</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="周次" name="week" rules={[{ required: true, message: '请输入周次' }]}>
              <Select style={{ width: 100 }}>
                {[1, 2, 3, 4, 5].map(w => (
                  <Option key={w} value={w}>第{w}周</Option>
                ))}
              </Select>
            </Form.Item>
          </Space>

          <Form.Item label="本周成果" name="weekly_results">
            <TextArea rows={3} placeholder="本周主要成果和进展" />
          </Form.Item>

          <Form.Item label="关键判断" name="key_judgment">
            <TextArea rows={3} placeholder="对当前形势的关键判断" />
          </Form.Item>

          <Form.Item label="需决策事项" name="decision_needed">
            <TextArea rows={3} placeholder="需要高管层决策的事项" />
          </Form.Item>

          <Form.Item label="下周行动" name="next_week_actions">
            <TextArea rows={3} placeholder="下周重点行动计划" />
          </Form.Item>

          <Form.Item label="参会人员" name="attendees">
            <Input placeholder="CEO, COO, CTO, CMO" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
