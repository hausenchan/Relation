import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Badge, Button, Typography, Space, Tabs, Table, Tooltip, Modal, Form, Input, Select, DatePicker, message, Popconfirm } from 'antd';
import {
  TeamOutlined, MessageOutlined, BellOutlined, CalendarOutlined,
  CheckSquareOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, PlayCircleOutlined, FlagOutlined, UserOutlined,
  RiseOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { statsApi, remindersApi, tasksApi, followUpTasksApi, opportunitiesApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const interactionTypeMap = {
  visit: '拜访', call: '通话', gift: '送礼', meal: '餐饮', wechat: '微信',
  email: '邮件', meeting: '会议', other: '其他'
};

const categoryMap = {
  business: { label: '商务圈', color: 'blue' },
  talent:   { label: '人才圈', color: 'green' },
  startup:  { label: '创业圈', color: 'orange' },
  social:   { label: '社交圈', color: 'purple' },
};

const statusMap = {
  pending:     { label: '待处理', color: 'default',  badge: 'default' },
  in_progress: { label: '进行中', color: 'orange',   badge: 'processing' },
  done:        { label: '已完成', color: 'green',    badge: 'success' },
};

const priorityMap = {
  high:   { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low:    { label: '低', color: 'default' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [followUpTasks, setFollowUpTasks] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  const canAssignOthers = ['admin', 'leader', 'sales_director'].includes(user?.role);
  const isLeaderOrAbove = ['admin', 'leader', 'sales_director'].includes(user?.role);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (canAssignOthers) {
      usersApi.listSimple().then(setUsers).catch(() => {});
    }
  }, [canAssignOthers]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 基础统计
      const statsData = await statsApi.get();
      setStats(statsData);

      // 提醒事项
      const remindersData = await remindersApi.list({ done: 0 });
      setReminders(remindersData);

      // 我的任务（今天和未来7天）
      const today = dayjs().format('YYYY-MM-DD');
      const myTasksData = await tasksApi.list({ mine: '1', parent_id: 'null' });
      const filteredMyTasks = myTasksData.filter(t => {
        const taskDate = dayjs(t.date);
        const diff = taskDate.diff(dayjs(), 'day');
        return diff >= 0 && diff <= 7 && t.status !== 'done';
      });
      setMyTasks(filteredMyTasks);

      // 我指派的任务（仅 leader 及以上）
      if (isLeaderOrAbove) {
        const allTasks = await tasksApi.list({ parent_id: 'null' });
        const assigned = allTasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id && t.status !== 'done');
        setAssignedTasks(assigned);
      }

      // 待跟进任务
      const followUpData = await followUpTasksApi.list({ status: 'pending' });
      setFollowUpTasks(followUpData.slice(0, 5));

      // 商机任务（我负责的商机）
      const oppsData = await opportunitiesApi.list({ assignee: user?.id });
      const pendingOpps = oppsData.filter(o => o.opportunity_status === 'pending' || o.opportunity_status === 'in_progress');
      setOpportunities(pendingOpps.slice(0, 5));

    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const urgentReminders = reminders.filter(r => dayjs(r.remind_date).diff(dayjs(), 'day') <= 3);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      priority: 'medium',
      assigned_to: user?.id,
    });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      date: values.date?.format('YYYY-MM-DD'),
    };
    try {
      if (editing) {
        await tasksApi.update(editing.id, payload);
        message.success('更新成功');
      } else {
        await tasksApi.create(payload);
        message.success('创建成功');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await tasksApi.update(id, { status });
      message.success('状态更新成功');
      loadData();
    } catch (err) {
      message.error('更新失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await tasksApi.delete(id);
      message.success('删除成功');
      loadData();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const taskColumns = [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>}
        </Space>
      ),
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date) => {
        const diff = dayjs(date).diff(dayjs(), 'day');
        const isToday = diff === 0;
        const isOverdue = diff < 0;
        return (
          <Tag color={isOverdue ? 'red' : isToday ? 'orange' : 'default'}>
            {isOverdue ? `逾期${Math.abs(diff)}天` : isToday ? '今天' : dayjs(date).format('MM-DD')}
          </Tag>
        );
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority) => <Tag color={priorityMap[priority]?.color}>{priorityMap[priority]?.label}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => <Badge status={statusMap[status]?.badge} text={statusMap[status]?.label} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          {record.status === 'pending' && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleUpdateStatus(record.id, 'in_progress')}
            >
              开始
            </Button>
          )}
          {record.status === 'in_progress' && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleUpdateStatus(record.id, 'done')}
            >
              完成
            </Button>
          )}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const assignedTaskColumns = [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>}
        </Space>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'assigned_to_name',
      key: 'assigned_to_name',
      width: 100,
      render: (name) => <Tag icon={<UserOutlined />}>{name}</Tag>,
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date) => dayjs(date).format('MM-DD'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => <Badge status={statusMap[status]?.badge} text={statusMap[status]?.label} />,
    },
  ];

  const tabItems = [
    {
      key: 'my-tasks',
      label: (
        <span>
          <CheckSquareOutlined /> 我的任务
          {myTasks.length > 0 && <Badge count={myTasks.length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">未来7天内的待办任务</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建任务</Button>
          </div>
          <Table
            dataSource={myTasks}
            columns={taskColumns}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="small"
          />
        </div>
      ),
    },
  ];

  if (isLeaderOrAbove) {
    tabItems.push({
      key: 'assigned-tasks',
      label: (
        <span>
          <UserOutlined /> 我指派的任务
          {assignedTasks.length > 0 && <Badge count={assignedTasks.length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">我指派给团队成员的任务</Text>
          </div>
          <Table
            dataSource={assignedTasks}
            columns={assignedTaskColumns}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="small"
          />
        </div>
      ),
    });
  }

  tabItems.push(
    {
      key: 'follow-up',
      label: (
        <span>
          <ThunderboltOutlined /> 待跟进任务
          {followUpTasks.length > 0 && <Badge count={followUpTasks.length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">商机相关的待跟进任务</Text>
            <Button type="link" onClick={() => navigate('/follow-up-tasks')}>查看全部</Button>
          </div>
          <List
            dataSource={followUpTasks}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  title={<Text strong>{item.title}</Text>}
                  description={
                    <Space>
                      <Tag color="blue">{item.person_name}</Tag>
                      {item.opportunity_title && <Tag color="orange">{item.opportunity_title}</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      ),
    },
    {
      key: 'opportunities',
      label: (
        <span>
          <RiseOutlined /> 我的商机
          {opportunities.length > 0 && <Badge count={opportunities.length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">我负责的商机</Text>
            <Button type="link" onClick={() => navigate('/opportunities')}>查看全部</Button>
          </div>
          <List
            dataSource={opportunities}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  title={<Text strong>{item.opportunity_title}</Text>}
                  description={
                    <Space>
                      <Tag color="blue">{item.person_name}</Tag>
                      <Tag color={item.opportunity_status === 'pending' ? 'orange' : 'green'}>
                        {item.opportunity_status === 'pending' ? '待处理' : '进行中'}
                      </Tag>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      ),
    }
  );

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>工作台</Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate('/persons')}>
            <Statistic title="人脉总数" value={stats?.personCount ?? '-'} prefix={<TeamOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate('/interactions')}>
            <Statistic title="互动记录" value={stats?.interactionCount ?? '-'} prefix={<MessageOutlined />} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate('/reminders')}>
            <Statistic title="待处理提醒" value={stats?.pendingReminders ?? '-'} prefix={<BellOutlined />} valueStyle={{ color: urgentReminders.length > 0 ? '#ff4d4f' : '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="我的任务" value={myTasks.length} prefix={<CheckSquareOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      {/* 任务区域 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card>
            <Tabs items={tabItems} />
          </Card>
        </Col>
      </Row>

      {/* 近期提醒 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title={<Space><BellOutlined style={{ color: '#ff4d4f' }} /> 近期提醒</Space>}
            extra={<Button type="link" onClick={() => navigate('/reminders')}>全部</Button>}>
            {reminders.length === 0 ? <Text type="secondary">暂无待处理提醒</Text> : (
              <List
                size="small"
                dataSource={reminders.slice(0, 8)}
                renderItem={item => {
                  const diff = dayjs(item.remind_date).diff(dayjs(), 'day');
                  const isOverdue = diff < 0;
                  const isUrgent = diff <= 1 && diff >= 0;
                  return (
                    <List.Item
                      extra={
                        <Badge
                          status={isOverdue ? 'error' : isUrgent ? 'warning' : 'processing'}
                          text={isOverdue ? `逾期${Math.abs(diff)}天` : diff === 0 ? '今天' : `${diff}天后`}
                        />
                      }
                    >
                      <List.Item.Meta
                        title={<Text strong>{item.title}</Text>}
                        description={
                          <Space size={4}>
                            <Tag color="blue">{item.person_name}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <CalendarOutlined /> {item.remind_date}
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 任务编辑弹窗 */}
      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="请输入任务标题" />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} placeholder="请输入任务描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
                <Select>
                  <Option value="high">高</Option>
                  <Option value="medium">中</Option>
                  <Option value="low">低</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          {canAssignOthers && (
            <Form.Item name="assigned_to" label="指派给" rules={[{ required: true, message: '请选择负责人' }]}>
              <Select placeholder="请选择负责人" showSearch optionFilterProp="children">
                {users.map(u => (
                  <Option key={u.id} value={u.id}>{u.display_name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
