import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Modal, Form, Input, DatePicker, Select, message, Collapse, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;
const { Panel } = Collapse;

const EXECUTIVE_ROLES = [
  { key: 'ceo', label: 'CEO' },
  { key: 'coo', label: 'COO' },
  { key: 'cto', label: 'CTO' },
  { key: 'cmo', label: 'CMO' }
];

export default function OperationalMeeting() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();
  const [decisions, setDecisions] = useState([]);

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
    setDecisions([]);
    form.setFieldsValue({
      meeting_date: dayjs(),
      year: dayjs().year(),
      month: dayjs().month() + 1,
      week: Math.ceil(dayjs().date() / 7),
      weekly_results: {},
      key_judgment: {},
      decision_needed: {},
      next_week_actions: {}
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingRecord(record);

    // 解析 JSON 字段
    const parseJSON = (str) => {
      try {
        return str ? JSON.parse(str) : {};
      } catch {
        return {};
      }
    };

    const parsedDecisions = parseJSON(record.decisions);
    setDecisions(Array.isArray(parsedDecisions) ? parsedDecisions : []);

    form.setFieldsValue({
      meeting_date: record.meeting_date ? dayjs(record.meeting_date) : null,
      year: record.year,
      month: record.month,
      week: record.week,
      attendees: record.attendees,
      weekly_results: parseJSON(record.weekly_results),
      key_judgment: parseJSON(record.key_judgment),
      decision_needed: parseJSON(record.decision_needed),
      next_week_actions: parseJSON(record.next_week_actions)
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

  const handleAddDecision = () => {
    const newId = decisions.length > 0 ? Math.max(...decisions.map(d => d.id)) + 1 : 1;
    setDecisions([...decisions, { id: newId, content: '' }]);
  };

  const handleRemoveDecision = (id) => {
    setDecisions(decisions.filter(d => d.id !== id));
  };

  const handleDecisionChange = (id, value) => {
    setDecisions(decisions.map(d => d.id === id ? { ...d, content: value } : d));
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload = {
        report_type: 'operational_weekly',
        meeting_date: values.meeting_date ? values.meeting_date.format('YYYY-MM-DD') : null,
        year: values.year,
        month: values.month,
        week: values.week,
        attendees: values.attendees,
        decisions: JSON.stringify(decisions.filter(d => d.content.trim())),
        weekly_results: JSON.stringify(values.weekly_results || {}),
        key_judgment: JSON.stringify(values.key_judgment || {}),
        decision_needed: JSON.stringify(values.decision_needed || {}),
        next_week_actions: JSON.stringify(values.next_week_actions || {}),
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

  const renderSummary = (record) => {
    const parseJSON = (str) => {
      try {
        return str ? JSON.parse(str) : {};
      } catch {
        return {};
      }
    };

    const results = parseJSON(record.weekly_results);
    const judgment = parseJSON(record.key_judgment);
    const needed = parseJSON(record.decision_needed);
    const actions = parseJSON(record.next_week_actions);

    const parts = [];
    EXECUTIVE_ROLES.forEach(role => {
      if (results[role.key] || judgment[role.key] || needed[role.key] || actions[role.key]) {
        parts.push(`${role.label}: ${results[role.key] || judgment[role.key] || needed[role.key] || actions[role.key]}`);
      }
    });

    return parts.slice(0, 2).join(' | ') || '暂无内容';
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
      title: '简报摘要',
      key: 'summary',
      ellipsis: true,
      render: (_, record) => renderSummary(record)
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
        title={editingRecord ? '编辑经营周会记录' : '新建经营周会记录'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={900}
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

          <Divider orientation="left">决策事项</Divider>
          <div style={{ marginBottom: 16 }}>
            {decisions.map((decision, index) => (
              <Space key={decision.id} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <span style={{ minWidth: 60 }}>决策{index + 1}:</span>
                <Input
                  value={decision.content}
                  onChange={(e) => handleDecisionChange(decision.id, e.target.value)}
                  placeholder="请输入决策内容"
                  style={{ flex: 1 }}
                />
                <Button
                  type="text"
                  danger
                  icon={<MinusCircleOutlined />}
                  onClick={() => handleRemoveDecision(decision.id)}
                />
              </Space>
            ))}
            <Button type="dashed" onClick={handleAddDecision} block icon={<PlusOutlined />}>
              添加决策
            </Button>
          </div>

          <Divider orientation="left">简报模块</Divider>
          <Collapse defaultActiveKey={['1', '2', '3', '4']} style={{ marginBottom: 16 }}>
            <Panel header="本周成果" key="1">
              {EXECUTIVE_ROLES.map(role => (
                <Form.Item key={role.key} label={role.label} name={['weekly_results', role.key]}>
                  <TextArea rows={2} placeholder={`${role.label}的本周成果`} />
                </Form.Item>
              ))}
            </Panel>

            <Panel header="关键判断" key="2">
              {EXECUTIVE_ROLES.map(role => (
                <Form.Item key={role.key} label={role.label} name={['key_judgment', role.key]}>
                  <TextArea rows={2} placeholder={`${role.label}的关键判断`} />
                </Form.Item>
              ))}
            </Panel>

            <Panel header="需决策事项" key="3">
              {EXECUTIVE_ROLES.map(role => (
                <Form.Item key={role.key} label={role.label} name={['decision_needed', role.key]}>
                  <TextArea rows={2} placeholder={`${role.label}提出的需决策事项`} />
                </Form.Item>
              ))}
            </Panel>

            <Panel header="下周行动" key="4">
              {EXECUTIVE_ROLES.map(role => (
                <Form.Item key={role.key} label={role.label} name={['next_week_actions', role.key]}>
                  <TextArea rows={2} placeholder={`${role.label}的下周行动计划`} />
                </Form.Item>
              ))}
            </Panel>
          </Collapse>

          <Form.Item label="参会人员" name="attendees">
            <Input placeholder="CEO, COO, CTO, CMO" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
