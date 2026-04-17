import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Row, Col, List, Tag, Badge, Button, Typography, Space, Tabs, Table, Tooltip, Modal, Form, Input, Select, DatePicker, message, Popconfirm } from 'antd';
import {
  TeamOutlined, MessageOutlined, BellOutlined, CalendarOutlined,
  CheckSquareOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, PlayCircleOutlined, FlagOutlined, UserOutlined,
  RiseOutlined, ThunderboltOutlined, FilterOutlined
} from '@ant-design/icons';
import { statsApi, remindersApi, tasksApi, followUpTasksApi, opportunitiesApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

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
  pending:     { label: '未开始', color: 'default',  badge: 'default' },
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

  // 筛选条件 - 我的任务
  const [myTaskStatusFilter, setMyTaskStatusFilter] = useState(['pending', 'in_progress', 'done']);
  const [myTaskDateRange, setMyTaskDateRange] = useState(null);

  // 筛选条件 - 我指派的任务
  const [assignedTaskStatusFilter, setAssignedTaskStatusFilter] = useState(['pending', 'in_progress', 'done']);
  const [assignedTaskDateRange, setAssignedTaskDateRange] = useState(null);

  const canAssignOthers = true; // 所有角色都可以跨组指派任务
  const canViewAssignedTasks = canAssignOthers;

  useEffect(() => {
    loadData();
  }, []);

  // 每30秒自动刷新商机任务状态
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const followUpData = await followUpTasksApi.list({ status: 'pending' });
        setFollowUpTasks(followUpData.slice(0, 5));
        const allFollowUpData = await followUpTasksApi.list({});
        setOpportunities(allFollowUpData);
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
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

      // 我的任务（获取所有分配给我的任务）
      const myTasksData = await tasksApi.list({ mine: '1', parent_id: 'null' });
      setMyTasks(myTasksData);

      // 我指派的任务（所有可指派角色都可查看）
      if (canViewAssignedTasks) {
        const allTasks = await tasksApi.list({ parent_id: 'null' });
        const assigned = allTasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id);
        setAssignedTasks(assigned);
      }

      // 待跟进任务（商机任务）
      const followUpData = await followUpTasksApi.list({ status: 'pending' });
      setFollowUpTasks(followUpData.slice(0, 5));

      // 商机任务（分配给我 + 我指派的）
      const allFollowUpData = await followUpTasksApi.list({});
      setOpportunities(allFollowUpData);

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
      result: '',
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

  // 筛选我的任务
  const filteredMyTasks = myTasks.filter(t => {
    // 状态筛选
    if (!myTaskStatusFilter.includes(t.status)) return false;

    // 时间范围筛选
    if (myTaskDateRange && myTaskDateRange.length === 2) {
      const taskDate = dayjs(t.date);
      if (taskDate.isBefore(myTaskDateRange[0], 'day') || taskDate.isAfter(myTaskDateRange[1], 'day')) {
        return false;
      }
    }

    return true;
  });

  // 筛选我指派的任务
  const filteredAssignedTasks = assignedTasks.filter(t => {
    // 状态筛选
    if (!assignedTaskStatusFilter.includes(t.status)) return false;

    // 时间范围筛选
    if (assignedTaskDateRange && assignedTaskDateRange.length === 2) {
      const taskDate = dayjs(t.date);
      if (taskDate.isBefore(assignedTaskDateRange[0], 'day') || taskDate.isAfter(assignedTaskDateRange[1], 'day')) {
        return false;
      }
    }

    return true;
  });

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
      title: '指派人',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 100,
      render: (name, record) => (
        record.created_by === user?.id
          ? <Text type="secondary">自建</Text>
          : <Text>{name || '-'}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => <Badge status={statusMap[status]?.badge} text={statusMap[status]?.label} />,
    },
    {
      title: '任务进度/结果',
      dataIndex: 'result',
      key: 'result',
      width: 220,
      ellipsis: true,
      render: (value) => value || <Text type="secondary">-</Text>,
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
      title: '任务进度/结果',
      dataIndex: 'result',
      key: 'result',
      width: 220,
      ellipsis: true,
      render: (value) => value || <Text type="secondary">-</Text>,
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
          {filteredMyTasks.length > 0 && <Badge count={filteredMyTasks.length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap>
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={myTaskStatusFilter}
                onChange={setMyTaskStatusFilter}
                style={{ minWidth: 200 }}
                options={[
                  { label: '未开始', value: 'pending' },
                  { label: '进行中', value: 'in_progress' },
                  { label: '已完成', value: 'done' },
                ]}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={myTaskDateRange}
                onChange={setMyTaskDateRange}
                style={{ width: 240 }}
              />
              {(myTaskStatusFilter.length !== 3 || myTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setMyTaskStatusFilter(['pending', 'in_progress', 'done']);
                    setMyTaskDateRange(null);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建任务</Button>
          </div>
          <Table
            dataSource={filteredMyTasks}
            columns={taskColumns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            size="small"
          />
        </div>
      ),
    },
  ];

  if (canViewAssignedTasks) {
    tabItems.push({
      key: 'assigned-tasks',
      label: (
        <span>
          <UserOutlined /> 我指派的任务
          {filteredAssignedTasks.length > 0 && <Badge count={filteredAssignedTasks.length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap>
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={assignedTaskStatusFilter}
                onChange={setAssignedTaskStatusFilter}
                style={{ minWidth: 200 }}
                options={[
                  { label: '未开始', value: 'pending' },
                  { label: '进行中', value: 'in_progress' },
                  { label: '已完成', value: 'done' },
                ]}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={assignedTaskDateRange}
                onChange={setAssignedTaskDateRange}
                style={{ width: 240 }}
              />
              {(assignedTaskStatusFilter.length !== 3 || assignedTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setAssignedTaskStatusFilter(['pending', 'in_progress', 'done']);
                    setAssignedTaskDateRange(null);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
          </div>
          <Table
            dataSource={filteredAssignedTasks}
            columns={assignedTaskColumns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
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
                      <Tag color="blue">{item.person_name || item.company_name || '-'}</Tag>
                      {item.opportunity_title && <Tag color="orange">{item.opportunity_title}</Tag>}
                    </Space>
                  }
                />
                <Space>
                  <Button type="link" size="small" onClick={() => navigate('/follow-up-tasks')}>处理</Button>
                </Space>
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
          <RiseOutlined /> 商机任务
          {opportunities.filter(t => t.status !== 'done').length > 0 && <Badge count={opportunities.filter(t => t.status !== 'done').length} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">分配给我的商机任务</Text>
            <Button type="link" onClick={() => navigate('/follow-up-tasks')}>查看全部</Button>
          </div>
          <List
            dataSource={opportunities}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  title={<Text strong>{item.title}</Text>}
                  description={
                    <Space wrap>
                      {item.assigned_by === user?.id && item.assigned_to !== user?.id
                        ? <Tag color="purple">我指派 → {item.assigned_to_name}</Tag>
                        : <Tag color="cyan">指派给我</Tag>}
                      <Tag color="blue">{item.person_name || item.company_name || '-'}</Tag>
                      {item.opportunity_title && <Tag color="orange">{item.opportunity_title}</Tag>}
                      <Tag color={item.status === 'done' ? 'green' : item.status === 'pending' ? 'default' : 'orange'}>
                        {item.status === 'pending' ? '待处理' : item.status === 'done' ? '已完成' : '进行中'}
                      </Tag>
                    </Space>
                  }
                />
                <Space>
                  {item.due_date && <Text type="secondary">{dayjs(item.due_date).format('MM-DD')}</Text>}
                  <Button type="link" size="small" onClick={() => navigate('/follow-up-tasks')}>查看</Button>
                </Space>
              </List.Item>
            )}
          />
        </div>
      ),
    }
  );

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: '人脉总数', value: stats?.personCount || 0, icon: <TeamOutlined />, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { title: '本月互动', value: stats?.monthlyInteractions || 0, icon: <MessageOutlined />, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { title: '待办提醒', value: stats?.pendingReminders || 0, icon: <BellOutlined />, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          { title: '本周任务', value: myTasks.filter(t => { const diff = dayjs(t.date).diff(dayjs(), 'day'); return diff <= 7 && t.status !== 'done'; }).length, icon: <CalendarOutlined />, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
        ].map((card, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card
              className="stat-card"
              style={{ background: card.gradient, borderRadius: 12, border: 'none', cursor: 'default' }}
              styles={{ body: { padding: '20px 24px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontWeight: 500 }}>{card.title}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{card.value}</div>
                </div>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff' }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 任务管理 Tabs */}
      <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <Tabs items={tabItems} />
      </Card>

      {/* 近期提醒 */}
      {urgentReminders.length > 0 && (
        <Card title="近期提醒" extra={<Button type="link" onClick={() => navigate('/reminders')}>查看全部</Button>} style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <List
            dataSource={urgentReminders.slice(0, 5)}
            renderItem={item => {
              const daysLeft = dayjs(item.remind_date).diff(dayjs(), 'day');
              const isUrgent = daysLeft <= 1;
              return (
                <List.Item>
                  <List.Item.Meta
                    title={<Text strong>{item.title}</Text>}
                    description={
                      <Space>
                        {item.person_name && <Tag color="blue">{item.person_name}</Tag>}
                        {item.category && <Tag color={categoryMap[item.category]?.color}>{categoryMap[item.category]?.label}</Tag>}
                      </Space>
                    }
                  />
                  <Space>
                    <Tag color={isUrgent ? 'red' : 'orange'}>
                      {daysLeft === 0 ? '今天' : daysLeft < 0 ? `逾期${Math.abs(daysLeft)}天` : `${daysLeft}天后`}
                    </Tag>
                    <Button type="link" size="small" onClick={() => navigate('/reminders')}>查看</Button>
                  </Space>
                </List.Item>
              );
            }}
          />
        </Card>
      )}

      {/* 最近互动 */}
      {stats?.recentInteractions && stats.recentInteractions.length > 0 && (
        <Card title="最近互动" extra={<Button type="link" onClick={() => navigate('/interactions')}>查看全部</Button>} style={{ borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <List
            dataSource={stats.recentInteractions.slice(0, 5)}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  title={<Text strong>{item.person_name}</Text>}
                  description={
                    <Space>
                      <Tag color="blue">{interactionTypeMap[item.interaction_type]}</Tag>
                      <Text type="secondary">{item.notes}</Text>
                    </Space>
                  }
                />
                <Text type="secondary">{dayjs(item.interaction_date).format('MM-DD')}</Text>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* 任务编辑 Modal */}
      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="任务标题" name="title" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="任务标题" />
          </Form.Item>
          <Form.Item label="任务描述" name="description">
            <Input.TextArea rows={3} placeholder="任务描述" />
          </Form.Item>
          <Form.Item label="任务进度/任务结果" name="result">
            <Input.TextArea rows={3} placeholder="填写当前进度、执行情况或最终结果" />
          </Form.Item>
          <Form.Item label="日期" name="date" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="优先级" name="priority" rules={[{ required: true }]}>
            <Select>
              <Option value="high"><Tag color="red">高</Tag></Option>
              <Option value="medium"><Tag color="orange">中</Tag></Option>
              <Option value="low"><Tag color="default">低</Tag></Option>
            </Select>
          </Form.Item>
          {canAssignOthers && (
            <Form.Item label="指派给" name="assigned_to" rules={[{ required: true, message: '请选择负责人' }]}>
              <Select
                showSearch
                placeholder="选择负责人"
                optionFilterProp="label"
                options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
