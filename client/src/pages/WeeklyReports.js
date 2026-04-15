import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, DatePicker, message, Drawer, Select, Tag, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useAuth } from '../AuthContext';

dayjs.extend(isoWeek);

const { TextArea } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;

const ADMIN_ROLES = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);
const isAdmin = (role) => ADMIN_ROLES.has(role);

export default function WeeklyReports() {
  const { user: currentUser } = useAuth();
  const [reports, setReports] = useState([]);
  const [writers, setWriters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [writerModalVisible, setWriterModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [form] = Form.useForm();

  // 筛选
  const [filters, setFilters] = useState({
    week_start: '',
    department: '',
  });

  useEffect(() => {
    fetchReports();
  }, [filters]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.week_start) params.append('week_start', filters.week_start);
      if (filters.department) params.append('department', filters.department);

      const res = await fetch(`http://localhost:3001/api/weekly-reports?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setReports(data);
    } catch (err) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchWriters = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/weekly-reports/writers', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setWriters(data);
    } catch (err) {
      message.error('加载失败');
    }
  };

  const handleAdd = () => {
    const thisMonday = dayjs().startOf('isoWeek');
    const thisSunday = dayjs().endOf('isoWeek');

    form.resetFields();
    form.setFieldsValue({
      user_id: currentUser?.id,
      week_range: [thisMonday, thisSunday],
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    form.setFieldsValue({
      ...record,
      week_range: [dayjs(record.week_start), dayjs(record.week_end)],
    });
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      onOk: async () => {
        try {
          await fetch(`http://localhost:3001/api/weekly-reports/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          message.success('删除成功');
          fetchReports();
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        user_id: values.user_id,
        week_start: values.week_range[0].format('YYYY-MM-DD'),
        week_end: values.week_range[1].format('YYYY-MM-DD'),
        completed: values.completed,
        next_week_plan: values.next_week_plan,
        risks: values.risks,
      };

      await fetch('http://localhost:3001/api/weekly-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      message.success('保存成功');
      setModalVisible(false);
      fetchReports();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const showDetail = (record) => {
    setSelectedReport(record);
    setDrawerVisible(true);
  };

  const handleManageWriters = async () => {
    await fetchWriters();
    setWriterModalVisible(true);
  };

  const toggleWriter = async (userId, currentValue) => {
    try {
      await fetch(`http://localhost:3001/api/users/${userId}/weekly-report`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ need_weekly_report: !currentValue }),
      });
      message.success('更新成功');
      fetchWriters();
    } catch (err) {
      message.error('更新失败');
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'user_name', key: 'user_name', width: 100 },
    { title: '部门', dataIndex: 'department', key: 'department', width: 100 },
    {
      title: '角色',
      dataIndex: 'user_role',
      key: 'user_role',
      width: 100,
      render: (val) => {
        const map = {
          admin: '管理员',
          leader: '组长',
          sales_director: '总监',
          member: '成员',
        };
        return map[val] || val;
      },
    },
    {
      title: '周期',
      key: 'week',
      width: 200,
      render: (_, record) => `${record.week_start} ~ ${record.week_end}`,
    },
    {
      title: '本周完成',
      dataIndex: 'completed',
      key: 'completed',
      width: 200,
      ellipsis: true,
    },
    {
      title: '下周计划',
      dataIndex: 'next_week_plan',
      key: 'next_week_plan',
      width: 200,
      ellipsis: true,
    },
    {
      title: '风险',
      dataIndex: 'risks',
      key: 'risks',
      width: 150,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => showDetail(record)}>详情</Button>
          {(isAdmin(currentUser?.role) || record.user_id === currentUser?.id) && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
              {isAdmin(currentUser?.role) && (
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>删除</Button>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];

  const writerColumns = [
    { title: '姓名', dataIndex: 'display_name', key: 'display_name', width: 120 },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 100,
      render: (val) => {
        const map = { commercial: '商务部', operation: '产运部', product: '产运部', business: '商务部', rd: '研发部', '商务部': '商务部', '产运部': '产运部', '研发部': '研发部' };
        return map[val] || val || '-';
      },
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (val) => {
        const map = { leader: '组长', sales_director: '总监', member: '成员' };
        return map[val] || val;
      },
    },
    {
      title: '周报状态',
      dataIndex: 'need_weekly_report',
      key: 'need_weekly_report',
      width: 120,
      render: (val, record) => {
        if (['leader', 'sales_director'].includes(record.role)) {
          return <Tag color="blue">默认需要</Tag>;
        }
        return val ? <Tag color="green">需要</Tag> : <Tag>不需要</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => {
        if (['leader', 'sales_director'].includes(record.role)) {
          return <span style={{ color: '#999' }}>-</span>;
        }
        return (
          <Button
            type="link"
            size="small"
            onClick={() => toggleWriter(record.id, record.need_weekly_report)}
          >
            {record.need_weekly_report ? '取消' : '指定'}
          </Button>
        );
      },
    },
  ];

  // 快速选择周
  const quickWeeks = [];
  for (let i = 0; i < 8; i++) {
    const monday = dayjs().subtract(i, 'week').startOf('isoWeek');
    quickWeeks.push({
      label: i === 0 ? '本周' : `${i}周前`,
      value: monday.format('YYYY-MM-DD'),
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          placeholder="选择周"
          style={{ width: 200 }}
          allowClear
          value={filters.week_start || undefined}
          onChange={(val) => setFilters({ ...filters, week_start: val || '' })}
        >
          {quickWeeks.map((w) => (
            <Option key={w.value} value={w.value}>{w.label} ({w.value})</Option>
          ))}
        </Select>
        <Select
          placeholder="部门"
          style={{ width: 150 }}
          allowClear
          value={filters.department || undefined}
          onChange={(val) => setFilters({ ...filters, department: val || '' })}
        >
          <Option value="商务部">商务部</Option>
          <Option value="产运部">产运部</Option>
          <Option value="研发部">研发部</Option>
        </Select>
        <div style={{ flex: 1 }} />
        {isAdmin(currentUser?.role) && (
          <Button icon={<SettingOutlined />} onClick={handleManageWriters}>
            管理周报人员
          </Button>
        )}
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          写周报
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={reports}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="周报"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="user_id" label="用户" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="week_range" label="周期" rules={[{ required: true, message: '请选择周期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="completed" label="本周完成" rules={[{ required: true, message: '请填写本周完成内容' }]}>
            <TextArea rows={4} placeholder="本周完成的主要工作..." />
          </Form.Item>
          <Form.Item name="next_week_plan" label="下周计划" rules={[{ required: true, message: '请填写下周计划' }]}>
            <TextArea rows={4} placeholder="下周计划的主要工作..." />
          </Form.Item>
          <Form.Item name="risks" label="风险与问题">
            <TextArea rows={3} placeholder="遇到的风险、问题或需要协调的事项..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="管理周报人员"
        open={writerModalVisible}
        onCancel={() => setWriterModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setWriterModalVisible(false)}>关闭</Button>,
        ]}
        width={700}
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          组长和总监默认需要写周报。老板可以指定普通成员写周报。
        </div>
        <Table
          columns={writerColumns}
          dataSource={writers}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>

      <Drawer
        title="周报详情"
        placement="right"
        width={600}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedReport && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>姓名</div>
              <div style={{ fontSize: 15 }}>{selectedReport.user_name}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>部门</div>
              <div style={{ fontSize: 15 }}>{selectedReport.department || '-'}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>周期</div>
              <div style={{ fontSize: 15 }}>{selectedReport.week_start} ~ {selectedReport.week_end}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>本周完成</div>
              <div style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{selectedReport.completed}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>下周计划</div>
              <div style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{selectedReport.next_week_plan}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>风险与问题</div>
              <div style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{selectedReport.risks || '-'}</div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
