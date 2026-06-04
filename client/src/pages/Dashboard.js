import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, List, Tag, Badge, Button, Typography, Space, Tabs, Table, Tooltip, Modal, Form, Input, Select, DatePicker, message, Popconfirm, Grid, Drawer, Descriptions } from 'antd';
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
const { useBreakpoint } = Grid;

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
  suspended:   { label: '挂起',   color: 'gold',     badge: 'warning' },
  done:        { label: '已完成', color: 'green',    badge: 'success' },
};

const TASK_STATUS_VALUES = Object.keys(statusMap);
const TASK_STATUS_OPTIONS = TASK_STATUS_VALUES.map(value => ({
  value,
  label: statusMap[value].label,
}));
const ACTIVE_TASK_STATUSES = new Set(['pending', 'in_progress']);

const priorityMap = {
  high:   { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low:    { label: '低', color: 'default' },
};

const taskPrioritySortRank = { high: 0, medium: 1, low: 2 };
const taskStatusSortRank = { pending: 0, in_progress: 1, suspended: 2, done: 3 };
const taskDateColumnKeys = new Set(['plan_date', 'start_date', 'complete_date']);
const taskSortableColumnKeys = new Set([
  'title',
  'task_source_label',
  'priority',
  'assigned_to_name',
  'created_by_name',
  'assigned_by_name',
  'assigner_name',
  'follower_name',
  'shared_to_names',
  'plan_date',
  'start_date',
  'complete_date',
  'display_status_label',
  'display_result',
]);

const normalizeTaskSortText = (value) => String(value ?? '').trim().toLowerCase();

const getTaskDateSortValue = (value) => {
  if (!value) return 0;
  const timestamp = dayjs(value).valueOf();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const compareTaskTextValue = (a, b) => (
  normalizeTaskSortText(a).localeCompare(normalizeTaskSortText(b), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  })
);

const compareTaskRankValue = (a, b, rankMap) => {
  const aRank = rankMap[a] ?? Number.MAX_SAFE_INTEGER;
  const bRank = rankMap[b] ?? Number.MAX_SAFE_INTEGER;
  return aRank - bRank;
};

const getTaskColumnSorter = (columnKey) => {
  if (!taskSortableColumnKeys.has(columnKey)) return null;

  return (a, b) => {
    if (columnKey === 'priority') {
      return compareTaskRankValue(a.priority, b.priority, taskPrioritySortRank);
    }
    if (columnKey === 'display_status_label') {
      return compareTaskRankValue(a.display_status || a.status, b.display_status || b.status, taskStatusSortRank);
    }
    if (taskDateColumnKeys.has(columnKey)) {
      return getTaskDateSortValue(a[columnKey]) - getTaskDateSortValue(b[columnKey]);
    }
    return compareTaskTextValue(a[columnKey], b[columnKey]);
  };
};

const taskTableDefaultWidths = {
  assigned: {
    title: 360,
    task_source_label: 100,
    priority: 80,
    assigned_to_name: 100,
    shared_to_names: 140,
    plan_date: 110,
    start_date: 110,
    complete_date: 110,
    display_result: 220,
    action: 120,
    display_status_label: 100,
  },
  execution: {
    title: 360,
    task_source_label: 100,
    priority: 80,
    created_by_name: 100,
    shared_to_names: 140,
    plan_date: 110,
    start_date: 110,
    complete_date: 110,
    display_status_label: 100,
    display_result: 220,
    action: 160,
  },
  watched: {
    title: 360,
    task_source_label: 100,
    priority: 80,
    assigned_by_name: 110,
    assigned_to_name: 110,
    shared_to_names: 140,
    plan_date: 110,
    start_date: 110,
    complete_date: 110,
    display_status_label: 100,
    display_result: 220,
    action: 100,
  },
  team: {
    title: 360,
    task_source_label: 100,
    priority: 80,
    assigner_name: 110,
    follower_name: 110,
    shared_to_names: 140,
    plan_date: 110,
    start_date: 110,
    complete_date: 110,
    display_status_label: 100,
    display_result: 220,
  },
};

const taskTableMinWidths = {
  title: 180,
  shared_to_names: 100,
  display_result: 140,
  action: 90,
};

const resizableTableComponents = {
  header: {
    cell: ResizableTitle,
  },
};

function ResizableTitle({ onResize, width, minWidth = 72, children, ...restProps }) {
  if (!width || !onResize) {
    return <th {...restProps}>{children}</th>;
  }

  const handleMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      const nextWidth = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      onResize(nextWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <th {...restProps} style={{ ...restProps.style, position: 'relative' }}>
      {children}
      <span
        role="separator"
        aria-orientation="vertical"
        title="拖动调整列宽"
        onMouseDown={handleMouseDown}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: -4,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          userSelect: 'none',
          zIndex: 2,
        }}
      />
    </th>
  );
}

export default function Dashboard() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user, isExecutive } = useAuth();
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [executionTasks, setExecutionTasks] = useState([]);
  const [watchedTasks, setWatchedTasks] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeSaving, setCompleteSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [taskColumnWidths, setTaskColumnWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashboardTaskColumnWidths') || '{}');
      return {
        assigned: { ...taskTableDefaultWidths.assigned, ...(saved.assigned || {}) },
        execution: { ...taskTableDefaultWidths.execution, ...(saved.execution || {}) },
        watched: { ...taskTableDefaultWidths.watched, ...(saved.watched || {}) },
        team: { ...taskTableDefaultWidths.team, ...(saved.team || {}) },
      };
    } catch {
      return taskTableDefaultWidths;
    }
  });
  const [form] = Form.useForm();
  const [completeForm] = Form.useForm();
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  // 筛选条件 - 我指派
  const [assignedTaskStatusFilter, setAssignedTaskStatusFilter] = useState([...TASK_STATUS_VALUES]);
  const [assignedTaskDateRange, setAssignedTaskDateRange] = useState(null);
  const [assignedTaskTitleSearch, setAssignedTaskTitleSearch] = useState('');

  // 筛选条件 - 待执行
  const [executionTaskStatusFilter, setExecutionTaskStatusFilter] = useState([...TASK_STATUS_VALUES]);
  const [executionTaskDateRange, setExecutionTaskDateRange] = useState(null);
  const [executionTaskTitleSearch, setExecutionTaskTitleSearch] = useState('');

  // 筛选条件 - 需关注
  const [watchedTaskStatusFilter, setWatchedTaskStatusFilter] = useState([...TASK_STATUS_VALUES]);
  const [watchedTaskDateRange, setWatchedTaskDateRange] = useState(null);
  const [watchedTaskTitleSearch, setWatchedTaskTitleSearch] = useState('');

  // 筛选条件 - 团队
  const [teamTaskStatusFilter, setTeamTaskStatusFilter] = useState([...TASK_STATUS_VALUES]);
  const [teamTaskDateRange, setTeamTaskDateRange] = useState(null);
  const [teamTaskAssignerFilter, setTeamTaskAssignerFilter] = useState([]);
  const [teamTaskFollowerFilter, setTeamTaskFollowerFilter] = useState([]);
  const [teamTaskTitleSearch, setTeamTaskTitleSearch] = useState('');

  const canAssignOthers = true; // 所有角色都可以跨组指派任务
  const canViewAssignedTasks = canAssignOthers;
  const canManageTeamTasks = ['admin', 'leader', 'sales_director'].includes(user?.role) || isExecutive();
  const canViewTeamScope = canManageTeamTasks || (user?.team_ids?.length > 0) || (user?.managed_team_ids?.length > 0);
  const canViewTeamTasks = canViewTeamScope || teamTasks.length > 0;
  const hideRelationshipPanels = stats?.showRelationshipPanels === false || ['operation', 'rd'].includes(user?.department);
  const userOptions = users.map(u => ({ value: u.id, label: u.display_name || u.username }));
  const taskUserOptions = user?.id && !userOptions.some(option => Number(option.value) === Number(user.id))
    ? [{ value: user.id, label: user.display_name || user.username || '我' }, ...userOptions]
    : userOptions;

  useEffect(() => {
    loadData();
  }, []);

  // 每30秒自动刷新任务相关状态
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const allTasks = await tasksApi.list({ parent_id: 'null' });
        const allFollowUpData = await followUpTasksApi.list(canManageTeamTasks ? { all: '1' } : {});
        const watchedFollowUpData = await followUpTasksApi.watch();
        setAssignedTasks(buildAssignedTasks(allTasks, allFollowUpData));
        setExecutionTasks(buildExecutionTasks(allTasks, allFollowUpData));
        setWatchedTasks(buildWatchedTasks(allTasks, watchedFollowUpData));
        setTeamTasks(buildTeamTasks(allTasks, allFollowUpData));
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [canManageTeamTasks]);

  useEffect(() => {
    if (canAssignOthers) {
      usersApi.listSimple().then(setUsers).catch(() => {});
    }
  }, [canAssignOthers]);

  useEffect(() => {
    localStorage.setItem('dashboardTaskColumnWidths', JSON.stringify(taskColumnWidths));
  }, [taskColumnWidths]);

  const toDisplayStatus = (status) => {
    return statusMap[status] ? status : 'done';
  };

  const priorityRank = (priority) => ({ high: 0, medium: 1, low: 2 }[priority] ?? 3);
  const taskSortTime = (task) => {
    const date = task.plan_date || task.created_at;
    const value = date ? dayjs(date).valueOf() : 0;
    return Number.isFinite(value) ? value : 0;
  };
  const taskSortBucket = (task) => {
    const status = task.display_status || task.status;
    const active = ACTIVE_TASK_STATUSES.has(status);
    const inThisWeek = task.plan_date && dayjs(task.plan_date).isSame(dayjs(), 'week');
    if (active && inThisWeek) return 0;
    if (active) return 1;
    if (status === 'suspended') return 2;
    return 3;
  };
  const sortDashboardTasks = (tasks) => [...tasks].sort((a, b) => {
    const bucketDiff = taskSortBucket(a) - taskSortBucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    const timeDiff = taskSortTime(b) - taskSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    return priorityRank(a.priority) - priorityRank(b.priority);
  });

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

    return sortDashboardTasks([...normalTasks, ...followUpItems]);
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

    return sortDashboardTasks([...normalTasks, ...followUpItems]);
  };

  const buildTeamTasks = (allTasks, allFollowUpData) => {
    const normalTasks = allTasks
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: Number(t.shared_to_me) === 1 && !canManageTeamTasks ? '共享任务' : '日常指派',
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

    const followUpItems = canManageTeamTasks ? allFollowUpData
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
      })) : [];

    return sortDashboardTasks([...normalTasks, ...followUpItems]);
  };

  const buildWatchedTasks = (allTasks, watchData) => {
    const sharedNormalTasks = allTasks
      .filter(t => Number(t.shared_to_me) === 1 && t.assigned_to !== user?.id)
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '共享任务',
        plan_date: t.date,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.result || '',
      }));

    const watchedItems = watchData.map(t => ({
      ...t,
      id: `watch_${t.id}`,
      task_source: 'opportunity',
      task_source_label: '商机',
      plan_date: t.due_date || null,
      start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
      complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
      display_status: toDisplayStatus(t.status),
      display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
      display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
      display_result: t.done_note || '',
      created_by_name: t.assigned_by_name,
    }));
    return sortDashboardTasks([...sharedNormalTasks, ...watchedItems]);
  };

  const countUnfinished = (items) => items.filter(item => ACTIVE_TASK_STATUSES.has(item.display_status || item.status)).length;

  const isWithinRange = (date, range) => {
    if (!range || range.length !== 2) return true;
    if (!date) return false;
    const value = dayjs(date);
    return !value.isBefore(range[0], 'day') && !value.isAfter(range[1], 'day');
  };

  const isTitleSearchHit = (task, keyword) => {
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
    if (!normalizedKeyword) return true;
    return String(task.title || '').toLowerCase().includes(normalizedKeyword);
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
      const allFollowUpData = await followUpTasksApi.list(canManageTeamTasks ? { all: '1' } : {});
      const watchedFollowUpData = await followUpTasksApi.watch();
      setAssignedTasks(buildAssignedTasks(allTasks, allFollowUpData));
      setExecutionTasks(buildExecutionTasks(allTasks, allFollowUpData));
      setWatchedTasks(buildWatchedTasks(allTasks, watchedFollowUpData));
      setTeamTasks(buildTeamTasks(allTasks, allFollowUpData));

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
      shared_to: [],
      status: 'pending',
      result: '',
    });
    setModalOpen(true);
  };

  const closeTaskEditor = () => {
    if (taskSaving) return;
    setModalOpen(false);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date) : null,
      shared_to: record.shared_to_ids
        ? String(record.shared_to_ids).split(',').map(Number).filter(Boolean)
        : [],
    });
    setModalOpen(true);
  };

  const openTaskDetail = (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  const ignoreTaskRowEvent = (event) => {
    return event.target.closest('button, a, input, textarea, .ant-select, .ant-picker, .ant-dropdown-trigger, .ant-popover, .ant-modal');
  };

  const taskRowProps = (record) => ({
    onDoubleClick: (event) => {
      if (ignoreTaskRowEvent(event)) return;
      openTaskDetail(record);
    },
    style: { cursor: 'pointer' },
  });

  const resizeTaskColumn = (tableKey, columnKey, width) => {
    setTaskColumnWidths(prev => ({
      ...prev,
      [tableKey]: {
        ...prev[tableKey],
        [columnKey]: Math.round(width),
      },
    }));
  };

  const withResizableTaskColumns = (tableKey, columns) => {
    const widths = taskColumnWidths[tableKey] || {};
    return columns.map(column => {
      const columnKey = column.key || column.dataIndex;
      const width = widths[columnKey] || column.width;
      const minWidth = taskTableMinWidths[columnKey] || 72;
      const sorter = column.sorter ?? getTaskColumnSorter(columnKey);
      return {
        ...column,
        width,
        ...(sorter ? {
          sorter,
          sortDirections: ['ascend', 'descend'],
          showSorterTooltip: { title: '点击切换排序' },
        } : {}),
        onHeaderCell: () => ({
          width,
          minWidth,
          onResize: (nextWidth) => resizeTaskColumn(tableKey, columnKey, nextWidth),
        }),
      };
    });
  };

  const getTaskTableScrollX = (tableKey) => {
    const widths = taskColumnWidths[tableKey] || {};
    return Object.values(widths).reduce((sum, width) => sum + width, 0);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload = {
      ...values,
      date: values.date?.format('YYYY-MM-DD'),
    };
    setTaskSaving(true);
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
      message.error(err.response?.data?.error || err.message || '操作失败');
    } finally {
      setTaskSaving(false);
    }
  };

  const canEditTaskRecord = (record) => (
    record?.task_source === 'normal'
    && (record.created_by === user?.id || record.assigned_to === user?.id || ['admin', 'sales_director'].includes(user?.role))
  );

  const handleUpdateStatus = async (id, status) => {
    try {
      await tasksApi.update(id, { status });
      message.success('状态更新成功');
      loadData();
    } catch (err) {
      message.error('更新失败');
    }
  };

  const openCompleteTask = (record) => {
    setCompleteTarget(record);
    completeForm.setFieldsValue({
      result: record?.display_result || record?.result || '',
    });
    setCompleteModalOpen(true);
  };

  const closeCompleteTask = () => {
    if (completeSaving) return;
    setCompleteModalOpen(false);
    setCompleteTarget(null);
    completeForm.resetFields();
  };

  const handleCompleteTask = async () => {
    if (!completeTarget?.id) return;
    let values;
    try {
      values = await completeForm.validateFields();
    } catch {
      return;
    }
    setCompleteSaving(true);
    try {
      await tasksApi.update(completeTarget.id, {
        status: 'done',
        result: values.result,
      });
      message.success('任务已完成');
      setCompleteModalOpen(false);
      setCompleteTarget(null);
      completeForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || err.message || '更新失败');
    } finally {
      setCompleteSaving(false);
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

  const renderTaskEditorForm = () => (
    <Form
      form={form}
      layout="vertical"
      style={{ marginTop: isMobile ? 0 : 16 }}
    >
      <Form.Item label="任务标题" name="title" rules={[{ required: true, message: '请输入任务标题' }]}>
        <Input size={isMobile ? 'large' : undefined} placeholder="任务标题" />
      </Form.Item>
      <Form.Item label="任务描述" name="description">
        <Input.TextArea rows={isMobile ? 4 : 3} placeholder="任务描述" />
      </Form.Item>
      <Form.Item label="任务进度/任务结果" name="result">
        <Input.TextArea rows={isMobile ? 4 : 3} placeholder="填写当前进度、执行情况或最终结果" />
      </Form.Item>
      <Form.Item label="计划日期" name="date" rules={[{ required: true, message: '请选择计划日期' }]}>
        <DatePicker
          inputReadOnly={isMobile}
          size={isMobile ? 'large' : undefined}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="优先级" name="priority" rules={[{ required: true }]}>
        <Select size={isMobile ? 'large' : undefined}>
          <Option value="high"><Tag color="red">高</Tag></Option>
          <Option value="medium"><Tag color="orange">中</Tag></Option>
          <Option value="low"><Tag color="default">低</Tag></Option>
        </Select>
      </Form.Item>
      {editing && (
        <Form.Item label="任务状态" name="status" rules={[{ required: true, message: '请选择任务状态' }]}>
          <Select size={isMobile ? 'large' : undefined}>
            {TASK_STATUS_VALUES.map(value => (
              <Option key={value} value={value}>
                <Tag color={statusMap[value].color}>{statusMap[value].label}</Tag>
              </Option>
            ))}
          </Select>
        </Form.Item>
      )}
      {canAssignOthers && (
        <Form.Item label="指派给" name="assigned_to" rules={[{ required: true, message: '请选择负责人' }]}>
          <Select
            showSearch
            size={isMobile ? 'large' : undefined}
            placeholder="选择负责人"
            optionFilterProp="label"
            options={taskUserOptions}
          />
        </Form.Item>
      )}
      <Form.Item label="共享给" name="shared_to">
        <Select
          mode="multiple"
          allowClear
          showSearch
          size={isMobile ? 'large' : undefined}
          placeholder="选择可在团队任务中查看此任务的成员"
          optionFilterProp="label"
          options={userOptions}
        />
      </Form.Item>
    </Form>
  );

  const filteredAssignedTasks = assignedTasks.filter(t => {
    if (!isTitleSearchHit(t, assignedTaskTitleSearch)) return false;
    if (!assignedTaskStatusFilter.includes(t.display_status)) return false;
    return isWithinRange(t.plan_date, assignedTaskDateRange);
  });

  const filteredExecutionTasks = executionTasks.filter(t => {
    if (!isTitleSearchHit(t, executionTaskTitleSearch)) return false;
    if (!executionTaskStatusFilter.includes(t.display_status)) return false;
    return isWithinRange(t.plan_date, executionTaskDateRange);
  });

  const filteredWatchedTasks = watchedTasks.filter(t => {
    if (!isTitleSearchHit(t, watchedTaskTitleSearch)) return false;
    if (!watchedTaskStatusFilter.includes(t.display_status)) return false;
    return isWithinRange(t.plan_date, watchedTaskDateRange);
  });

  const filteredTeamTasks = teamTasks.filter(t => {
    if (!isTitleSearchHit(t, teamTaskTitleSearch)) return false;
    if (!teamTaskStatusFilter.includes(t.display_status)) return false;
    if (teamTaskAssignerFilter.length > 0 && !teamTaskAssignerFilter.includes(t.assigner_name)) return false;
    if (teamTaskFollowerFilter.length > 0 && !teamTaskFollowerFilter.includes(t.follower_name)) return false;
    return isWithinRange(t.plan_date, teamTaskDateRange);
  });

  const dashboardPersonalTasks = [...assignedTasks, ...executionTasks];
  const isCurrentMonthTask = (task) => task.plan_date && dayjs(task.plan_date).isSame(dayjs(), 'month');
  const isCurrentWeekTask = (task) => task.plan_date && dayjs(task.plan_date).isSame(dayjs(), 'week');
  const isTodayTask = (task) => task.plan_date && dayjs(task.plan_date).isSame(dayjs(), 'day');
  const monthlyTaskCount = new Set(dashboardPersonalTasks.filter(isCurrentMonthTask).map(task => task.id)).size;
  const todayTaskCount = new Set(dashboardPersonalTasks.filter(isTodayTask).map(task => task.id)).size;
  const weeklyTaskCount = dashboardPersonalTasks.filter(isCurrentWeekTask).length;
  const weeklyUnfinishedTaskCount = dashboardPersonalTasks.filter(task => (
    isCurrentWeekTask(task) && (task.display_status || task.status) !== 'done'
  )).length;

  const renderSharedToNames = (value) => (
    value
      ? <Tooltip title={value}>{value}</Tooltip>
      : <Text type="secondary">-</Text>
  );

  const sharedTaskColumn = {
    title: '共享人',
    dataIndex: 'shared_to_names',
    key: 'shared_to_names',
    width: 140,
    ellipsis: true,
    render: renderSharedToNames,
  };

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
      render: (value, record) => <Tag color={record.task_source === 'opportunity' ? 'purple' : Number(record.shared_to_me) === 1 ? 'cyan' : 'blue'}>{value}</Tag>,
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
    sharedTaskColumn,
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
              onClick={() => openCompleteTask(record)}
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
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority) => priority ? <Tag color={priorityMap[priority]?.color}>{priorityMap[priority]?.label}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '负责人',
      dataIndex: 'assigned_to_name',
      key: 'assigned_to_name',
      width: 100,
      render: (name) => <Tag icon={<UserOutlined />}>{name}</Tag>,
    },
    sharedTaskColumn,
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

  const watchedTaskColumns = [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {(record.description || record.opportunity_note) && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.description || record.opportunity_note}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '任务来源',
      dataIndex: 'task_source_label',
      key: 'task_source_label',
      width: 100,
      render: (value, record) => <Tag color={record.task_source === 'opportunity' ? 'purple' : 'cyan'}>{value}</Tag>,
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
      dataIndex: 'assigned_by_name',
      key: 'assigned_by_name',
      width: 110,
      render: (value, record) => value || record.created_by_name || <Text type="secondary">-</Text>,
    },
    {
      title: '执行人',
      dataIndex: 'assigned_to_name',
      key: 'assigned_to_name',
      width: 110,
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    sharedTaskColumn,
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
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => (record.task_source === 'opportunity' ? navigate('/follow-up-tasks') : openTaskDetail(record))}
        >
          查看
        </Button>
      ),
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
    sharedTaskColumn,
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

  const renderTaskCard = (record, section) => {
    const showViewButton = record.task_source === 'opportunity' || section === 'watched' || section === 'team';
    const canEdit = section !== 'team' && section !== 'watched' && canEditTaskRecord(record);
    const canDelete = record.task_source === 'normal' && section === 'execution';
    const canStart = record.task_source === 'normal' && section === 'execution' && record.status === 'pending';
    const canDone = record.task_source === 'normal' && section === 'execution' && record.status === 'in_progress';

    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          onDoubleClick={(event) => {
            if (ignoreTaskRowEvent(event)) return;
            openTaskDetail(record);
          }}
          style={{
            width: '100%',
            padding: 14,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 4, overflowWrap: 'anywhere' }}>{record.title}</div>
                {(record.description || record.opportunity_note) && (
                  <Typography.Paragraph
                    ellipsis={{ rows: 2, expandable: false }}
                    type="secondary"
                    style={{ marginBottom: 0 }}
                  >
                    {record.description || record.opportunity_note}
                  </Typography.Paragraph>
                )}
              </div>
              <Space direction={isMobile ? 'horizontal' : 'vertical'} size={4} align={isMobile ? 'start' : 'end'} wrap={isMobile} style={{ width: isMobile ? '100%' : undefined }}>
                <Tag color={record.task_source === 'opportunity' ? 'purple' : 'blue'}>{record.task_source_label}</Tag>
                <Badge status={record.display_status_badge} text={record.display_status_label} />
              </Space>
            </div>

            <Space wrap size={[6, 6]}>
              {record.priority && <Tag color={priorityMap[record.priority]?.color}>{priorityMap[record.priority]?.label}</Tag>}
              {Number(record.shared_to_me) === 1 && <Tag color="cyan">共享给我</Tag>}
              {record.plan_date && <Tag>计划 {dayjs(record.plan_date).format('MM-DD')}</Tag>}
              {record.start_date && <Tag color="processing">开始 {dayjs(record.start_date).format('MM-DD')}</Tag>}
              {record.complete_date && <Tag color="success">完成 {dayjs(record.complete_date).format('MM-DD')}</Tag>}
            </Space>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {record.created_by_name && <Typography.Text type="secondary">指派人：{record.created_by_name}</Typography.Text>}
              {record.assigned_to_name && <Typography.Text type="secondary">执行人：{record.assigned_to_name}</Typography.Text>}
              {record.assigner_name && <Typography.Text type="secondary">指派人：{record.assigner_name}</Typography.Text>}
              {record.follower_name && <Typography.Text type="secondary">跟进人：{record.follower_name}</Typography.Text>}
              {record.shared_to_names && <Typography.Text type="secondary">共享给：{record.shared_to_names}</Typography.Text>}
            </div>

            {record.display_result && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                结果：{record.display_result}
              </Typography.Paragraph>
            )}

            <Space size="small" wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
              {canStart && (
                <Button type={isMobile ? 'default' : 'link'} size="small" icon={<PlayCircleOutlined />} style={{ width: isMobile ? '100%' : undefined }} onClick={() => handleUpdateStatus(record.id, 'in_progress')}>
                  开始
                </Button>
              )}
              {canDone && (
                <Button type={isMobile ? 'primary' : 'link'} size="small" icon={<CheckOutlined />} style={{ width: isMobile ? '100%' : undefined }} onClick={() => openCompleteTask(record)}>
                  完成
                </Button>
              )}
              {canEdit && (
                <Button type={isMobile ? 'default' : 'link'} size="small" icon={<EditOutlined />} style={{ width: isMobile ? '100%' : undefined }} onClick={() => openEdit(record)}>
                  编辑
                </Button>
              )}
              {canDelete && (
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                  <Button type={isMobile ? 'default' : 'link'} size="small" danger icon={<DeleteOutlined />} style={{ width: isMobile ? '100%' : undefined }}>删除</Button>
                </Popconfirm>
              )}
              {showViewButton && (
                <Button
                  type={isMobile ? 'default' : 'link'}
                  size="small"
                  style={{ width: isMobile ? '100%' : undefined }}
                  onClick={() => (record.task_source === 'opportunity' ? navigate('/follow-up-tasks') : openTaskDetail(record))}
                >
                  查看
                </Button>
              )}
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  const tabItems = [];

  tabItems.push(
    {
      key: 'execution-tasks',
      label: (
        <span>
          <ThunderboltOutlined /> 待执行
          {countUnfinished(executionTasks) > 0 && <Badge count={countUnfinished(executionTasks)} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
              <Input
                allowClear
                placeholder="搜索任务标题"
                value={executionTaskTitleSearch}
                onChange={event => setExecutionTaskTitleSearch(event.target.value)}
                style={isMobile ? { width: '100%' } : { width: 220 }}
              />
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={executionTaskStatusFilter}
                onChange={setExecutionTaskStatusFilter}
                style={isMobile ? { width: '100%' } : { minWidth: 200 }}
                options={TASK_STATUS_OPTIONS}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={executionTaskDateRange}
                onChange={setExecutionTaskDateRange}
                style={isMobile ? { width: '100%' } : { width: 240 }}
              />
              {(executionTaskTitleSearch.trim() || executionTaskStatusFilter.length !== TASK_STATUS_VALUES.length || executionTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setExecutionTaskTitleSearch('');
                    setExecutionTaskStatusFilter([...TASK_STATUS_VALUES]);
                    setExecutionTaskDateRange(null);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
          </div>
          {isMobile ? (
            <List
              dataSource={filteredExecutionTasks}
              rowKey="id"
              loading={loading}
              pagination={{ defaultPageSize: 20, showSizeChanger: false, simple: isMobile }}
              locale={{ emptyText: '暂无任务数据' }}
              renderItem={(record) => renderTaskCard(record, 'execution')}
            />
          ) : (
            <Table
              dataSource={filteredExecutionTasks}
              columns={withResizableTaskColumns('execution', executionTaskColumns)}
              rowKey="id"
              onRow={taskRowProps}
              components={resizableTableComponents}
              loading={loading}
              scroll={{ x: getTaskTableScrollX('execution') }}
              tableLayout="fixed"
              pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
              size="small"
            />
          )}
        </div>
      ),
    }
  );

  if (canViewAssignedTasks) {
    tabItems.push({
      key: 'assigned-tasks',
      label: (
        <span>
          <UserOutlined /> 我指派
          {countUnfinished(assignedTasks) > 0 && <Badge count={countUnfinished(assignedTasks)} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
              <Input
                allowClear
                placeholder="搜索任务标题"
                value={assignedTaskTitleSearch}
                onChange={event => setAssignedTaskTitleSearch(event.target.value)}
                style={isMobile ? { width: '100%' } : { width: 220 }}
              />
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={assignedTaskStatusFilter}
                onChange={setAssignedTaskStatusFilter}
                style={isMobile ? { width: '100%' } : { minWidth: 200 }}
                options={TASK_STATUS_OPTIONS}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={assignedTaskDateRange}
                onChange={setAssignedTaskDateRange}
                style={isMobile ? { width: '100%' } : { width: 240 }}
              />
              {(assignedTaskTitleSearch.trim() || assignedTaskStatusFilter.length !== TASK_STATUS_VALUES.length || assignedTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setAssignedTaskTitleSearch('');
                    setAssignedTaskStatusFilter([...TASK_STATUS_VALUES]);
                    setAssignedTaskDateRange(null);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
          </div>
          {isMobile ? (
            <List
              dataSource={filteredAssignedTasks}
              rowKey="id"
              loading={loading}
              pagination={{ defaultPageSize: 20, showSizeChanger: false, simple: isMobile }}
              locale={{ emptyText: '暂无任务数据' }}
              renderItem={(record) => renderTaskCard(record, 'assigned')}
            />
          ) : (
            <Table
              dataSource={filteredAssignedTasks}
              columns={withResizableTaskColumns('assigned', assignedTaskColumns)}
              rowKey="id"
              onRow={taskRowProps}
              components={resizableTableComponents}
              loading={loading}
              scroll={{ x: getTaskTableScrollX('assigned') }}
              tableLayout="fixed"
              pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
              size="small"
            />
          )}
        </div>
      ),
    });
  }

  tabItems.push({
    key: 'watched-tasks',
    label: (
      <span>
        <BellOutlined /> 需关注
        {countUnfinished(watchedTasks) > 0 && <Badge count={countUnfinished(watchedTasks)} style={{ marginLeft: 8 }} />}
      </span>
    ),
    children: (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
            <Input
              allowClear
              placeholder="搜索任务标题"
              value={watchedTaskTitleSearch}
              onChange={event => setWatchedTaskTitleSearch(event.target.value)}
              style={isMobile ? { width: '100%' } : { width: 220 }}
            />
            <Select
              mode="multiple"
              placeholder="状态筛选"
              value={watchedTaskStatusFilter}
              onChange={setWatchedTaskStatusFilter}
              style={isMobile ? { width: '100%' } : { minWidth: 200 }}
              options={TASK_STATUS_OPTIONS}
            />
            <RangePicker
              placeholder={['开始日期', '结束日期']}
              value={watchedTaskDateRange}
              onChange={setWatchedTaskDateRange}
              style={isMobile ? { width: '100%' } : { width: 240 }}
            />
            {(watchedTaskTitleSearch.trim() || watchedTaskStatusFilter.length !== TASK_STATUS_VALUES.length || watchedTaskDateRange) && (
              <Button
                size="small"
                onClick={() => {
                  setWatchedTaskTitleSearch('');
                  setWatchedTaskStatusFilter([...TASK_STATUS_VALUES]);
                  setWatchedTaskDateRange(null);
                }}
              >
                重置筛选
              </Button>
            )}
          </Space>
        </div>
        {isMobile ? (
          <List
            dataSource={filteredWatchedTasks}
            rowKey="id"
            loading={loading}
            pagination={{ defaultPageSize: 20, showSizeChanger: false, simple: isMobile }}
            locale={{ emptyText: '暂无任务数据' }}
            renderItem={(record) => renderTaskCard(record, 'watched')}
          />
        ) : (
          <Table
            dataSource={filteredWatchedTasks}
            columns={withResizableTaskColumns('watched', watchedTaskColumns)}
            rowKey="id"
            onRow={taskRowProps}
            components={resizableTableComponents}
            loading={loading}
            scroll={{ x: getTaskTableScrollX('watched') }}
            tableLayout="fixed"
            pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            size="small"
          />
        )}
      </div>
    ),
  });

  if (canViewTeamTasks) {
    tabItems.push({
      key: 'team-tasks',
      label: (
        <span>
          <TeamOutlined /> 团队
          {countUnfinished(teamTasks) > 0 && <Badge count={countUnfinished(teamTasks)} style={{ marginLeft: 8 }} />}
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
              <Input
                allowClear
                placeholder="搜索任务标题"
                value={teamTaskTitleSearch}
                onChange={event => setTeamTaskTitleSearch(event.target.value)}
                style={isMobile ? { width: '100%' } : { width: 220 }}
              />
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={teamTaskStatusFilter}
                onChange={setTeamTaskStatusFilter}
                style={isMobile ? { width: '100%' } : { minWidth: 200 }}
                options={TASK_STATUS_OPTIONS}
              />
              <Select
                mode="multiple"
                placeholder="指派人筛选"
                value={teamTaskAssignerFilter}
                onChange={setTeamTaskAssignerFilter}
                style={isMobile ? { width: '100%' } : { minWidth: 160 }}
                options={[...new Set(teamTasks.map(t => t.assigner_name).filter(Boolean))].map(n => ({ label: n, value: n }))}
              />
              <Select
                mode="multiple"
                placeholder="跟进人筛选"
                value={teamTaskFollowerFilter}
                onChange={setTeamTaskFollowerFilter}
                style={isMobile ? { width: '100%' } : { minWidth: 160 }}
                options={[...new Set(teamTasks.map(t => t.follower_name).filter(Boolean))].map(n => ({ label: n, value: n }))}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={teamTaskDateRange}
                onChange={setTeamTaskDateRange}
                style={isMobile ? { width: '100%' } : { width: 240 }}
              />
              {(teamTaskTitleSearch.trim() || teamTaskStatusFilter.length !== TASK_STATUS_VALUES.length || teamTaskDateRange || teamTaskAssignerFilter.length > 0 || teamTaskFollowerFilter.length > 0) && (
                <Button
                  size="small"
                  onClick={() => {
                    setTeamTaskTitleSearch('');
                    setTeamTaskStatusFilter([...TASK_STATUS_VALUES]);
                    setTeamTaskDateRange(null);
                    setTeamTaskAssignerFilter([]);
                    setTeamTaskFollowerFilter([]);
                  }}
                >
                  重置筛选
                </Button>
              )}
            </Space>
          </div>
          {isMobile ? (
            <List
              dataSource={filteredTeamTasks}
              rowKey="id"
              loading={loading}
              pagination={{ defaultPageSize: 20, showSizeChanger: false, simple: isMobile }}
              locale={{ emptyText: '暂无任务数据' }}
              renderItem={(record) => renderTaskCard(record, 'team')}
            />
          ) : (
            <Table
              dataSource={filteredTeamTasks}
              columns={withResizableTaskColumns('team', teamTaskColumns)}
              rowKey="id"
              onRow={taskRowProps}
              components={resizableTableComponents}
              loading={loading}
              scroll={{ x: getTaskTableScrollX('team') }}
              tableLayout="fixed"
              pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
              size="small"
            />
          )}
        </div>
      ),
    });
  }

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      {/* 统计卡片 */}
      <Row gutter={[isMobile ? 10 : 16, isMobile ? 10 : 16]} style={{ marginBottom: isMobile ? 16 : 24 }}>
        {[
          {
            title: '本月任务',
            value: monthlyTaskCount,
            icon: <CheckSquareOutlined />,
            gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
          },
          {
            title: '本周任务',
            value: weeklyTaskCount,
            icon: <CalendarOutlined />,
            gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
          },
          {
            title: '本周待办',
            value: weeklyUnfinishedTaskCount,
            icon: <BellOutlined />,
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
          },
          {
            title: '今日任务',
            value: todayTaskCount,
            icon: <CheckSquareOutlined />,
            gradient: 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)'
          },
          !hideRelationshipPanels && { title: '人脉总数', value: stats?.personCount || 0, icon: <TeamOutlined />, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          !hideRelationshipPanels && { title: '本月互动', value: stats?.monthlyInteractions || 0, icon: <MessageOutlined />, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
        ].filter(Boolean).map((card, idx) => (
          <Col xs={12} sm={12} lg={6} key={idx}>
            <Card
              className="stat-card"
              style={{ background: card.gradient, borderRadius: 12, border: 'none', cursor: 'default' }}
              styles={{ body: { padding: isMobile ? '16px 18px' : '20px 24px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: isMobile ? 12 : 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontWeight: 500, whiteSpace: 'nowrap' }}>{card.title}</div>
                  <div style={{ fontSize: isMobile ? 28 : 32, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{card.value}</div>
                </div>
                <div style={{ width: isMobile ? 34 : 48, height: isMobile ? 34 : 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 22, color: '#fff' }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 任务管理 Tabs */}
      <Card style={{ marginBottom: isMobile ? 16 : 24, borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {isMobile && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={openAdd}
            style={{ width: '100%', marginBottom: 12 }}
          >
            新建任务
          </Button>
        )}
        <Tabs
          items={tabItems}
          tabBarGutter={isMobile ? 12 : undefined}
          tabBarExtraContent={isMobile ? undefined : {
            right: <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建任务</Button>,
          }}
        />
      </Card>

      {/* 近期提醒 */}
      {urgentReminders.length > 0 && (
        <Card title="近期提醒" extra={<Button type="link" onClick={() => navigate('/reminders')}>查看全部</Button>} style={{ marginBottom: isMobile ? 16 : 24, borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <List
            dataSource={urgentReminders.slice(0, 5)}
            renderItem={item => {
              const daysLeft = dayjs(item.remind_date).diff(dayjs(), 'day');
              const isUrgent = daysLeft <= 1;
              return (
                <List.Item style={isMobile ? { alignItems: 'stretch', flexDirection: 'column', gap: 8 } : undefined}>
                  <List.Item.Meta
                    title={<Text strong>{item.title}</Text>}
                    description={
                      <Space wrap>
                        {item.person_name && <Tag color="blue">{item.person_name}</Tag>}
                        {item.category && <Tag color={categoryMap[item.category]?.color}>{categoryMap[item.category]?.label}</Tag>}
                      </Space>
                    }
                  />
                  <Space style={{ width: isMobile ? '100%' : undefined, justifyContent: isMobile ? 'space-between' : undefined }}>
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
              <List.Item style={isMobile ? { alignItems: 'stretch', flexDirection: 'column', gap: 8 } : undefined}>
                <List.Item.Meta
                  title={<Text strong>{item.person_name}</Text>}
                  description={
                    <Space wrap>
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

      {isMobile ? (
        <Drawer
          title={editing ? '编辑任务' : '新建任务'}
          open={modalOpen}
          onClose={closeTaskEditor}
          width="100%"
          placement="right"
          destroyOnClose={false}
          styles={{
            body: {
              padding: '16px 16px 88px',
              overflowY: 'auto',
            },
            footer: {
              padding: 12,
              background: '#fff',
              boxShadow: '0 -8px 20px rgba(15,23,42,0.08)',
            },
          }}
          footer={
            <Space style={{ width: '100%' }} size={8}>
              <Button block size="large" onClick={closeTaskEditor} disabled={taskSaving}>
                取消
              </Button>
              <Button block size="large" type="primary" icon={<CheckOutlined />} loading={taskSaving} onClick={handleSave}>
                保存
              </Button>
            </Space>
          }
        >
          {renderTaskEditorForm()}
        </Drawer>
      ) : (
        <Modal
          title={editing ? '编辑任务' : '新建任务'}
          open={modalOpen}
          onOk={handleSave}
          onCancel={closeTaskEditor}
          confirmLoading={taskSaving}
          okText="保存"
          cancelText="取消"
        >
          {renderTaskEditorForm()}
        </Modal>
      )}

      <Modal
        title="完成任务"
        open={completeModalOpen}
        onOk={handleCompleteTask}
        onCancel={closeCompleteTask}
        confirmLoading={completeSaving}
        okText="确认完成"
        cancelText="取消"
        destroyOnClose={false}
      >
        <Form form={completeForm} layout="vertical">
          <Form.Item
            label="任务进度/任务结果"
            name="result"
            rules={[{ required: true, whitespace: true, message: '请填写任务进度/任务结果' }]}
          >
            <Input.TextArea
              rows={isMobile ? 5 : 4}
              placeholder="填写任务完成情况、关键进展或最终结果"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="任务详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 520}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 56px)', overflowY: 'auto' } } : undefined}
        extra={
          canEditTaskRecord(detailRecord) && (
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                setDetailOpen(false);
                openEdit(detailRecord);
              }}
            >
              编辑
            </Button>
          )
        }
      >
        {detailRecord && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务标题">{detailRecord.title || '-'}</Descriptions.Item>
              <Descriptions.Item label="任务来源">
                <Tag color={detailRecord.task_source === 'opportunity' ? 'purple' : 'blue'}>
                  {detailRecord.task_source_label || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={detailRecord.display_status_badge} text={detailRecord.display_status_label || '-'} />
              </Descriptions.Item>
              {detailRecord.priority && (
                <Descriptions.Item label="优先级">
                  <Tag color={priorityMap[detailRecord.priority]?.color}>{priorityMap[detailRecord.priority]?.label || detailRecord.priority}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="计划日期">{detailRecord.plan_date || detailRecord.date || '-'}</Descriptions.Item>
              <Descriptions.Item label="开始日期">{detailRecord.start_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="完成日期">{detailRecord.complete_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="指派人">
                {detailRecord.created_by_name || detailRecord.assigned_by_name || detailRecord.assigner_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="执行人">
                {detailRecord.assigned_to_name || detailRecord.follower_name || '-'}
              </Descriptions.Item>
              {detailRecord.shared_to_names && (
                <Descriptions.Item label="共享给">
                  {detailRecord.shared_to_names}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="任务描述">
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.description || detailRecord.opportunity_note || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="任务进度/结果">
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.display_result || detailRecord.result || detailRecord.done_note || '-'}</div>
              </Descriptions.Item>
              {detailRecord.task_source === 'opportunity' && (
                <>
                  <Descriptions.Item label="商机标题">{detailRecord.opportunity_title || '-'}</Descriptions.Item>
                  <Descriptions.Item label="关联对象">
                    {detailRecord.person_name || detailRecord.company_name || '-'}
                    {detailRecord.person_name && (detailRecord.company || detailRecord.current_company)
                      ? ` (${detailRecord.company || detailRecord.current_company})`
                      : ''}
                    {!detailRecord.person_name && detailRecord.company_name ? ' (公司)' : ''}
                  </Descriptions.Item>
                  <Descriptions.Item label="期望跟进日期">{detailRecord.due_date || detailRecord.plan_date || '-'}</Descriptions.Item>
                  {detailRecord.done_at && (
                    <Descriptions.Item label="完成时间">{dayjs(detailRecord.done_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                  )}
                </>
              )}
            </Descriptions>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
