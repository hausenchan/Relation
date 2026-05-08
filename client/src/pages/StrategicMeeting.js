import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Modal, Form, Input, DatePicker, Select, message, Grid, List, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import ResizableTable from '../components/ResizableTable';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

const getAuthConfig = (config = {}) => {
  const token = localStorage.getItem('token');
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
};

const getErrorMessage = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

export default function StrategicMeeting() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
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
        params: { report_type: 'strategic_monthly' },
        ...getAuthConfig(),
      });
      setData(res.data);
    } catch (err) {
      console.error('获取战略月会记录失败:', err);
      message.error(getErrorMessage(err, '获取战略月会记录失败'));
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
          await axios.delete(`/api/executive/reports/${id}`, getAuthConfig());
          message.success('删除成功');
          fetchData();
        } catch (err) {
          message.error(getErrorMessage(err, '删除失败'));
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
        last_edited_by: user?.username
      };

      if (editingRecord) {
        await axios.put(`/api/executive/reports/${editingRecord.id}`, payload, getAuthConfig());
        message.success('更新成功');
      } else {
        await axios.post('/api/executive/reports', payload, getAuthConfig());
        message.success('创建成功');
      }

      setModalVisible(false);
      fetchData();
    } catch (err) {
      console.error('提交失败:', err);
      message.error(getErrorMessage(err, '提交失败'));
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

  const renderMeetingCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Typography.Text strong>{record.year}年{record.month}月战略月会</Typography.Text>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{record.meeting_date || '-'}</div>
            </div>
          </div>
          {record.strategic_direction && <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>战略方向：{record.strategic_direction}</Typography.Paragraph>}
          {record.key_focus && <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>重点关注：{record.key_focus}</Typography.Paragraph>}
          {record.monthly_summary && <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>月度总结：{record.monthly_summary}</Typography.Paragraph>}
          <Typography.Text type="secondary">参会人员：{record.attendees || '-'}</Typography.Text>
          <Space size="small" wrap>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>删除</Button>
          </Space>
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Card
        extra={!isMobile && (
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新建记录
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          </Space>
        )}
      >
        {isMobile && (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} style={{ width: '100%' }}>新建记录</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData} style={{ width: '100%' }}>刷新</Button>
          </Space>
        )}
        {isMobile ? (
          <List dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} renderItem={renderMeetingCard} />
        ) : (
          <ResizableTable
            storageKey="strategic-meeting-table-columns"
            dataSource={data}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
          />
        )}
      </Card>

      <Modal
        title={editingRecord ? '编辑战略月会记录' : '新建战略月会记录'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={isMobile ? '100%' : 800}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="会议日期" name="meeting_date" rules={[{ required: true, message: '请选择会议日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Space style={{ width: '100%', flexDirection: isMobile ? 'column' : 'row' }}>
            <Form.Item label="年份" name="year" rules={[{ required: true, message: '请输入年份' }]} style={{ width: isMobile ? '100%' : undefined }}>
              <Input type="number" placeholder="2026" style={{ width: isMobile ? '100%' : 120 }} />
            </Form.Item>
            <Form.Item label="月份" name="month" rules={[{ required: true, message: '请输入月份' }]} style={{ width: isMobile ? '100%' : undefined }}>
              <Select style={{ width: isMobile ? '100%' : 120 }}>
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
