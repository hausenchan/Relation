import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, List, Tag, Badge, Button, Typography, Space, Tabs, Table, Tooltip, Modal, Form, Input, Select, DatePicker, message, Popconfirm } from 'antd';
import {
  TeamOutlined, MessageOutlined, BellOutlined, CalendarOutlined,
  CheckSquareOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, PlayCircleOutlined, FlagOutlined, UserOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { statsApi, remindersApi, tasksApi, followUpTasksApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Text } = Typography;
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
  const { user, isExecutive } = useAuth();
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [executionTasks, setExecutionTasks] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  // 筛选条件 - 我指派给别人的任务
  const [assignedTaskStatusFilter, setAssignedTaskStatusFilter] = useState(['pending', 'in_progress', 'done']);
  const [assignedTaskDateRange, setAssignedTaskDateRange] = useState(null);

  // 筛选条件 - 需我执行的任务
  const [executionTaskStatusFilter, setExecutionTaskStatusFilter] = useState(['pending', 'in_progress', 'done']);
  const [executionTaskDateRange, setExecutionTaskDateRange] = useState(null);

  // 筛选条件 - 团队任务
  const [teamTaskStatusFilter, setTeamTaskStatusFilter] = useState(['pending', 'in_progress', 'done']);
  const [teamTaskDateRange, setTeamTaskDateRange] = useState(null);

  const canAssignOthers = true; // 所有角色都可以跨组指派任务
  const canViewAssignedTasks = canAssignOthers;
  const canViewTeamTasks = isExecutive();
  const hideRelationshipPanels = stats?.showRelationshipPanels === false || ['operation', 'rd'].includes(user?.department);

  useEffect(() => {
    loadData();
  }, []);

  // 每30秒自动刷新任务相关状态
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const allTasks = await tasksApi.list({ parent_id: 'null' });
        const allFollowUpData = await followUpTasksApi.list(canViewTeamTasks ? { all: '1' } : {});
        setAssignedTasks(buildAssignedTasks(allTasks, allFollowUpData));
        setExecutionTasks(buildExecutionTasks(allTasks, allFollowUpData));
        if (canViewTeamTasks) {
          setTeamTasks(buildTeamTasks(allTasks, allFollowUpData));
        }
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [canViewTeamTasks]);

  useEffect(() => {
    if (canAssignOthers) {
      usersApi.listSimple().then(setUsers).catch(() => {});
    }
  }, [canAssignOthers]);

  const toDisplayStatus = (status) => {
    if (status === 'pending') return 'pending';
    if (status === 'in_progress') return 'in_progress';
    return 'done';
  };

  const buildAssignedTasks = (allTasks, allFollowUpData) => {
    const normalTasks = allTasks
      .filter(t => t.created_by === user?.id && t.assigned_to !== user?.id)
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '日常指派',
        plan_date: t.date,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.result || '',
      }));

    const followUpItems = allFollowUpData
      .filter(t => t.assigned_by === user?.id && t.assigned_to !== user?.id)
      .map(t => ({
        ...t,
        id: `follow_up_${t.id}`,
        task_source: 'opportunity',
        task_source_label: '商机',
        assigned_to_name: t.assigned_to_name,
        created_by_name: t.assigned_by_name,
        plan_date: t.due_date || null,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.done_note || '',
      }));

    return [...normalTasks, ...followUpItems].sort((a, b) => dayjs(b.plan_date || b.created_at).valueOf() - dayjs(a.plan_date || a.created_at).valueOf());
  };

  const buildExecutionTasks = (allTasks, allFollowUpData) => {
    const normalTasks = allTasks
      .filter(t => t.assigned_to === user?.id)
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '日常指派',
        plan_date: t.date,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.result || '',
      }));

    const followUpItems = allFollowUpData
      .filter(t => t.assigned_to === user?.id)
      .map(t => ({
        ...t,
        id: `follow_up_${t.id}`,
        task_source: 'opportunity',
        task_source_label: '商机',
        assigned_to_name: t.assigned_to_name,
        created_by_name: t.assigned_by_name,
        plan_date: t.due_date || null,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.done_note || '',
      }));

    return [...normalTasks, ...followUpItems].sort((a, b) => dayjs(b.plan_date || b.created_at).valueOf() - dayjs(a.plan_date || a.created_at).valueOf());
  };

  const buildTeamTasks = (allTasks, allFollowUpData) => {
    const normalTasks = allTasks
      .filter(t => t.created_by !== user?.id && t.assigned_to !== user?.id)
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '日常指派',
        plan_date: t.date,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.result || '',
        assigner_name: t.created_by_name,
        follower_name: t.assigned_to_name,
      }));

    const followUpItems = allFollowUpData
      .filter(t => t.assigned_by !== user?.id && t.assigned_to !== user?.id)
      .map(t => ({
        ...t,
        id: `follow_up_${t.id}`,
        task_source: 'opportunity',
        task_source_label: '商机',
        plan_date: t.due_date || null,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.done_note || '',
        assigner_name: t.assigned_by_name,
        follower_name: t.assigned_to_name,
      }));

    return [...normalTasks, ...followUpItems].sort((a, b) => dayjs(b.plan_date || b.created_at).valueOf() - dayjs(a.plan_date || a.created_at).valueOf());
  };

  const countUnfinished = (items) => items.filter(item => ['pending', 'in_progress'].includes(item.display_status || item.status)).length;

  const isWithinRange = (date, range) => {
    if (!range || range.length !== 2) return true;
    if (!date) return false;
    const value = dayjs(date);
    return !value.isBefore(range[0], 'day') && !value.isAfter(range[1], 'day');
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 基础统计
      const statsData = await statsApi.get();
      setStats(statsData);

      // 提醒事项
      const remindersData = await remindersApi.list({ done: 0 });
      setReminders(remindersData);

      const allTasks = await tasksApi.list({ parent_id: 'null' });
      const allFollowUpData = await followUpTasksApi.list(canViewTeamTasks ? { all: '1' } : {});
      setAssignedTasks(buildAssignedTasks(allTasks, allFollowUpData));
      setExecutionTasks(buildExecutionTasks(allTasks, allFollowUpData));
      if (canViewTeamTasks) {
        setTeamTasks(buildTeamTasks(allTasks, allFollowUpData));
      } else {
        setTeamTasks([]);
      }

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

  const filteredAssignedTasks = assignedTasks.filter(t => {
    if (!assignedTaskStatusFilter.includes(t.display_status)) return false;
    return isWithinRange(t.plan_date, assignedTaskDateRange);
  });

  const filteredExecutionTasks = executionTasks.filter(t => {
    if (!executionTaskStatusFilter.includes(t.display_status)) return false;
    return isWithinRange(t.plan_date, executionTaskDateRange);
  });

  const filteredTeamTasks = teamTasks.filter(t => {
    if (!teamTaskStatusFilter.includes(t.display_status)) return false;
    return isWithinRange(t.plan_date, teamTaskDateRange);
  });

  const executionTaskColumns = [
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
      title: '任务来源',
      dataIndex: 'task_source_label',
      key: 'task_source_label',
      width: 100,
      render: (value, record) => <Tag color={record.task_source === 'opportunity' ? 'purple' : 'blue'}>{value}</Tag>,
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
      title: '计划日期',
      dataIndex: 'plan_date',
      key: 'plan_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '开始日期',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '完成日期',
      dataIndex: 'complete_date',
      key: 'complete_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '状态',
      dataIndex: 'display_status_label',
      key: 'display_status_label',
      width: 100,
      render: (_, record) => <Badge status={record.display_status_badge} text={record.display_status_label} />,
    },
    {
      title: '任务进度/结果',
      dataIndex: 'display_result',
      key: 'display_result',
      width: 220,
      ellipsis: true,
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space size={2} wrap={false}>
          {record.task_source === 'normal' && record.status === 'pending' && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleUpdateStatus(record.id, 'in_progress')}
            >
              开始
            </Button>
          )}
          {record.task_source === 'normal' && record.status === 'in_progress' && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleUpdateStatus(record.id, 'done')}
            >
              完成
            </Button>
          )}
          {record.task_source === 'normal' && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
          {record.task_source === 'opportunity' && (
            <Button type="link" size="small" onClick={() => navigate('/follow-up-tasks')}>查看</Button>
          )}
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
      title: '任务来源',
      dataIndex: 'task_source_label',
      key: 'task_source_label',
      width: 100,
      render: (value, record) => <Tag color={record.task_source === 'opportunity' ? 'purple' : 'blue'}>{value}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'assigned_to_name',
      key: 'assigned_to_name',
      width: 100,
      render: (name) => <Tag icon={<UserOutlined />}>{name}</Tag>,
    },
    {
      title: '计划日期',
      dataIndex: 'plan_date',
      key: 'plan_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '开始日期',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '完成日期',
      dataIndex: 'complete_date',
      key: 'complete_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '任务进度/结果',
      dataIndex: 'display_result',
      key: 'display_result',
      width: 220,
      ellipsis: true,
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          {record.task_source === 'normal' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {record.task_source === 'opportunity' && (
            <Button type="link" size="small" onClick={() => navigate('/follow-up-tasks')}>
              查看
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'display_status_label',
      key: 'display_status_label',
      width: 100,
      render: (_, record) => <Badge status={record.display_status_badge} text={record.display_status_label} />,
    },
  ];

  const teamTaskColumns = [
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
      title: '任务来源',
      dataIndex: 'task_source_label',
      key: 'task_source_label',
      width: 100,
      render: (value, record) => <Tag color={record.task_source === 'opportunity' ? 'purple' : 'blue'}>{value}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority) => priority ? <Tag color={priorityMap[priority]?.color}>{priorityMap[priority]?.label}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '指派人',
      dataIndex: 'assigner_name',
      key: 'assigner_name',
      width: 110,
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '跟进人',
      dataIndex: 'follower_name',
      key: 'follower_name',
      width: 110,
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '计划日期',
      dataIndex: 'plan_date',
      key: 'plan_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '开始日期',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '完成日期',
      dataIndex: 'complete_date',
      key: 'complete_date',
      width: 110,
      render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: '状态',
      dataIndex: 'display_status_label',
      key: 'display_status_label',
      width: 100,
      render: (_, record) => <Badge status={record.display_status_badge} text={record.display_status_label} />,
    },
    {
      title: '任务进度/结果',
      dataIndex: 'display_result',
      key: 'display_result',
      width: 220,
      ellipsis: true,
      render: (value) => value || <Text type="secondary">-</Text>,
    },
  ];

  const tabItems = [];

  if (canViewAssignedTasks) {
    tabItems.push({
      key: 'assigned-tasks',
      label: (
        <span>
          <UserOutlined /> 我指派给别人的任务
          {countUnfinished(assignedTasks) > 0 && <Badge count={countUnfinished(assignedTasks)} style={{ marginLeft: 8 }} />}
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
            scroll={{ x: 1120 }}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            size="small"
          />
        </div>
      ),
    });
  }

  tabItems.push(
    {
      key: 'execution-tasks',
      label: (
        <span>
          <ThunderboltOutlined /> 需我执行的任务
          {countUnfinished(executionTasks) > 0 && <Badge count={countUnfinished(executionTasks)} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap>
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={executionTaskStatusFilter}
                onChange={setExecutionTaskStatusFilter}
                style={{ minWidth: 200 }}
                options={[
                  { label: '未开始', value: 'pending' },
                  { label: '进行中', value: 'in_progress' },
                  { label: '已完成', value: 'done' },
                ]}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={executionTaskDateRange}
                onChange={setExecutionTaskDateRange}
                style={{ width: 240 }}
              />
              {(executionTaskStatusFilter.length !== 3 || executionTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setExecutionTaskStatusFilter(['pending', 'in_progress', 'done']);
                    setExecutionTaskDateRange(null);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
          </div>
          <Table
            dataSource={filteredExecutionTasks}
            columns={executionTaskColumns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1220 }}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            size="small"
          />
        </div>
      ),
    }
  );

  if (canViewTeamTasks) {
    tabItems.push({
      key: 'team-tasks',
      label: (
        <span>
          <TeamOutlined /> 团队任务
          {countUnfinished(teamTasks) > 0 && <Badge count={countUnfinished(teamTasks)} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap>
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={teamTaskStatusFilter}
                onChange={setTeamTaskStatusFilter}
                style={{ minWidth: 200 }}
                options={[
                  { label: '未开始', value: 'pending' },
                  { label: '进行中', value: 'in_progress' },
                  { label: '已完成', value: 'done' },
                ]}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={teamTaskDateRange}
                onChange={setTeamTaskDateRange}
                style={{ width: 240 }}
              />
              {(teamTaskStatusFilter.length !== 3 || teamTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setTeamTaskStatusFilter(['pending', 'in_progress', 'done']);
                    setTeamTaskDateRange(null);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
          </div>
          <Table
            dataSource={filteredTeamTasks}
            columns={teamTaskColumns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1380 }}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            size="small"
          />
        </div>
      ),
    });
  }

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          !hideRelationshipPanels && { title: '人脉总数', value: stats?.personCount || 0, icon: <TeamOutlined />, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          !hideRelationshipPanels && { title: '本月互动', value: stats?.monthlyInteractions || 0, icon: <MessageOutlined />, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { title: '待办提醒', value: stats?.pendingReminders || 0, icon: <BellOutlined />, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          {
            title: '本周任务',
            value: [...assignedTasks, ...executionTasks].filter(t => {
              if (!t.plan_date) return false;
              const planDate = dayjs(t.plan_date);
              return planDate.isSame(dayjs(), 'week');
            }).length,
            icon: <CalendarOutlined />,
            gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
          },
        ].filter(Boolean).map((card, idx) => (
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
        <Tabs
          items={tabItems}
          tabBarExtraContent={{
            right: <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建任务</Button>,
          }}
        />
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
      {!hideRelationshipPanels && stats?.recentInteractions && stats.recentInteractions.length > 0 && (
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
          <Form.Item label="计划日期" name="date" rules={[{ required: true, message: '请选择计划日期' }]}>
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
