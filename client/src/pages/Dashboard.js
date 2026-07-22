import React, { useState, useEffect, useCallback } from 'react';
import { Card, List, Tag, Badge, Button, Typography, Space, Tabs, Table, Tooltip, Modal, Form, Input, Select, DatePicker, message, Popconfirm, Grid, Drawer, Descriptions, Empty } from 'antd';
import {
  TeamOutlined, BellOutlined, CalendarOutlined,
  CheckSquareOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, PlayCircleOutlined, FlagOutlined, UserOutlined,
  ThunderboltOutlined, ScheduleOutlined, LikeFilled, CheckCircleFilled,
  RobotOutlined, BulbOutlined, BarChartOutlined, FundOutlined, EyeOutlined
} from '@ant-design/icons';
import { statsApi, remindersApi, tasksApi, followUpTasksApi, usersApi, aiSuggestionsApi } from '../api';
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
const TASK_TAB_KEYS = {
  execution: 'execution-tasks',
  assigned: 'assigned-tasks',
  watched: 'watched-tasks',
  team: 'team-tasks',
  ai: 'ai-suggestions',
};
const TASK_STAT_FILTERS = {
  month: 'month',
  week: 'week',
  weekTodo: 'weekTodo',
  today: 'today',
  todayDone: 'todayDone',
};
const getUserDepartments = (user = {}) => [...new Set([
  user?.department,
  ...(Array.isArray(user?.departments) ? user.departments : []),
].filter(Boolean))];

const aiSuggestionStatusMap = {
  pending_review: { label: '待确认', color: 'gold', badge: 'warning' },
  ready_to_execute: { label: '可执行', color: 'blue', badge: 'processing' },
  observing: { label: '建议观察', color: 'default', badge: 'default' },
};

const aiSuggestionTypeMap = {
  revenue_diagnosis: { label: '收入诊断', color: 'volcano' },
  budget_adjustment: { label: '预算调整', color: 'geekblue' },
  media_mix: { label: '媒体结构', color: 'cyan' },
  collaboration: { label: '协同提醒', color: 'purple' },
};

const priorityMap = {
  high:   { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low:    { label: '低', color: 'default' },
};
const AI_SUGGESTION_PRIORITY_VALUES = ['high', 'medium', 'low'];
const AI_SUGGESTION_STATUS_VALUES = Object.keys(aiSuggestionStatusMap);

function CompletedBoostIcon() {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <LikeFilled style={{ fontSize: 22 }} />
      <CheckCircleFilled
        style={{
          position: 'absolute',
          right: -8,
          top: -8,
          fontSize: 12,
          color: '#dcfce7',
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))',
        }}
      />
    </span>
  );
}

const taskPrioritySortRank = { high: 0, medium: 1, low: 2 };
const taskStatusSortRank = { pending: 0, in_progress: 1, suspended: 2, done: 3 };
const taskDateColumnKeys = new Set(['plan_date', 'estimated_completion_date', 'start_date', 'complete_date']);
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
  'estimated_completion_date',
  'start_date',
  'complete_date',
  'display_status_label',
  'display_result',
]);

const normalizeTaskSortText = (value) => String(value ?? '').trim().toLowerCase();

const sameId = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left === right;
  return String(a) === String(b);
};

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
    estimated_completion_date: 130,
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
    estimated_completion_date: 130,
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
    estimated_completion_date: 130,
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
    estimated_completion_date: 130,
    start_date: 110,
    complete_date: 110,
    display_status_label: 100,
    display_result: 220,
  },
};

const taskTableMinWidths = {
  title: 180,
  shared_to_names: 100,
  estimated_completion_date: 112,
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

const taskTitleCellStyle = {
  width: '100%',
  minWidth: 0,
  overflow: 'hidden',
};

const taskTitleLineStyle = {
  display: 'block',
  maxWidth: '100%',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
};

const taskDescriptionLineStyle = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  fontSize: 12,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const renderTaskDescriptionLine = (description) => (
  description ? (
    <Text
      type="secondary"
      ellipsis={{ tooltip: description }}
      style={taskDescriptionLineStyle}
    >
      {description}
    </Text>
  ) : null
);

const renderTaskTitleCell = (title, description) => (
  <div style={taskTitleCellStyle}>
    <Text strong style={taskTitleLineStyle}>{title}</Text>
    {renderTaskDescriptionLine(description)}
  </div>
);

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
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiSuggestionMeta, setAiSuggestionMeta] = useState(null);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiSuggestionLoadError, setAiSuggestionLoadError] = useState('');
  const [aiSuggestionStatusFilter, setAiSuggestionStatusFilter] = useState(AI_SUGGESTION_STATUS_VALUES);
  const [aiSuggestionPriorityFilter, setAiSuggestionPriorityFilter] = useState(AI_SUGGESTION_PRIORITY_VALUES);
  const [aiSuggestionBusinessLineFilter, setAiSuggestionBusinessLineFilter] = useState([]);
  const [aiSuggestionTypeFilter, setAiSuggestionTypeFilter] = useState([]);
  const [aiSuggestionSearch, setAiSuggestionSearch] = useState('');
  const [aiSuggestionDrawerOpen, setAiSuggestionDrawerOpen] = useState(false);
  const [activeAiSuggestion, setActiveAiSuggestion] = useState(null);
  const [activeTaskTab, setActiveTaskTab] = useState(TASK_TAB_KEYS.execution);
  const [taskStatFilterByTab, setTaskStatFilterByTab] = useState({});

  const canAssignOthers = true; // 所有角色都可以跨组指派任务
  const canViewAssignedTasks = canAssignOthers;
  const canViewAiSuggestions = isExecutive();
  const canManageTeamTasks = ['admin', 'leader', 'sales_director'].includes(user?.role) || canViewAiSuggestions;
  const canViewTeamScope = canManageTeamTasks || (user?.team_ids?.length > 0) || (user?.managed_team_ids?.length > 0);
  const canViewTeamTasks = canViewTeamScope || teamTasks.length > 0;
  const hideRelationshipPanels = stats?.showRelationshipPanels === false
    || getUserDepartments(user).some(department => ['operation', 'rd'].includes(department));
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

  useEffect(() => {
    if (activeTaskTab === TASK_TAB_KEYS.team && !canViewTeamTasks) {
      setActiveTaskTab(TASK_TAB_KEYS.execution);
    }
    if (activeTaskTab === TASK_TAB_KEYS.ai && !canViewAiSuggestions) {
      setActiveTaskTab(TASK_TAB_KEYS.execution);
    }
  }, [activeTaskTab, canViewAiSuggestions, canViewTeamTasks]);

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

  const loadAiSuggestions = useCallback(async ({ silent = false } = {}) => {
    if (!canViewAiSuggestions) return null;
    if (!silent) setAiSuggestionsLoading(true);
    try {
      const data = await aiSuggestionsApi.list({ business_line: 'zhixiao' });
      setAiSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      setAiSuggestionMeta(data?.meta || null);
      setAiSuggestionLoadError('');
      return data;
    } catch (err) {
      console.error('加载 AI 建议失败:', err);
      setAiSuggestions([]);
      setAiSuggestionMeta(null);
      setAiSuggestionLoadError(err.response?.data?.error || err.message || 'AI 建议暂不可用');
      return null;
    } finally {
      if (!silent) setAiSuggestionsLoading(false);
    }
  }, [canViewAiSuggestions]);

  useEffect(() => {
    if (!canViewAiSuggestions) {
      setAiSuggestions([]);
      setAiSuggestionMeta(null);
      setAiSuggestionLoadError('');
      setAiSuggestionsLoading(false);
      return;
    }
    loadAiSuggestions();
  }, [canViewAiSuggestions, loadAiSuggestions]);

  useEffect(() => {
    if (!canViewAiSuggestions || activeTaskTab !== TASK_TAB_KEYS.ai) return undefined;
    const timer = setInterval(() => {
      loadAiSuggestions({ silent: true });
    }, 300000);
    return () => clearInterval(timer);
  }, [activeTaskTab, canViewAiSuggestions, loadAiSuggestions]);

  const buildAssignedTasks = (allTasks, allFollowUpData) => {
    const normalTasks = allTasks
      .filter(t => sameId(t.created_by, user?.id) && !sameId(t.assigned_to, user?.id))
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '日常指派',
        plan_date: t.date,
        estimated_completion_date: t.estimated_completion_date,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.result || '',
      }));

    const followUpItems = allFollowUpData
      .filter(t => sameId(t.assigned_by, user?.id) && !sameId(t.assigned_to, user?.id))
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
      .filter(t => sameId(t.assigned_to, user?.id))
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '日常指派',
        plan_date: t.date,
        estimated_completion_date: t.estimated_completion_date,
        start_date: t.started_at ? dayjs(t.started_at).format('YYYY-MM-DD') : null,
        complete_date: t.done_at ? dayjs(t.done_at).format('YYYY-MM-DD') : null,
        display_status: toDisplayStatus(t.status),
        display_status_label: statusMap[toDisplayStatus(t.status)]?.label || t.status,
        display_status_badge: statusMap[toDisplayStatus(t.status)]?.badge || 'default',
        display_result: t.result || '',
      }));

    const followUpItems = allFollowUpData
      .filter(t => sameId(t.assigned_to, user?.id))
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
        estimated_completion_date: t.estimated_completion_date,
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
      .filter(t => Number(t.shared_to_me) === 1 && !sameId(t.assigned_to, user?.id))
      .map(t => ({
        ...t,
        task_source: 'normal',
        task_source_label: '共享任务',
        plan_date: t.date,
        estimated_completion_date: t.estimated_completion_date,
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

  const isTodayWithinTaskPlanRange = (task) => {
    const startDate = task.plan_date || task.estimated_completion_date;
    const endDate = task.estimated_completion_date || task.plan_date;
    if (!startDate || !endDate) return false;
    const start = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).endOf('day');
    const today = dayjs();
    return !today.isBefore(start) && !today.isAfter(end);
  };

  const isTitleSearchHit = (task, keyword) => {
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
    if (!normalizedKeyword) return true;
    return String(task.title || '').toLowerCase().includes(normalizedKeyword);
  };

  const clearTaskStatFilterForTab = (tabKey) => {
    setTaskStatFilterByTab(prev => {
      if (!prev[tabKey]) return prev;
      const next = { ...prev };
      delete next[tabKey];
      return next;
    });
  };

  const setTaskStatusFilterForTab = (tabKey, statuses) => {
    if (tabKey === TASK_TAB_KEYS.assigned) {
      setAssignedTaskStatusFilter(statuses);
    } else if (tabKey === TASK_TAB_KEYS.watched) {
      setWatchedTaskStatusFilter(statuses);
    } else if (tabKey === TASK_TAB_KEYS.team) {
      setTeamTaskStatusFilter(statuses);
    } else {
      setExecutionTaskStatusFilter(statuses);
    }
  };

  const setTaskDateRangeForTab = (tabKey, dateRange) => {
    if (tabKey === TASK_TAB_KEYS.assigned) {
      setAssignedTaskDateRange(dateRange);
    } else if (tabKey === TASK_TAB_KEYS.watched) {
      setWatchedTaskDateRange(dateRange);
    } else if (tabKey === TASK_TAB_KEYS.team) {
      setTeamTaskDateRange(dateRange);
    } else {
      setExecutionTaskDateRange(dateRange);
    }
  };

  const clearSecondaryTaskFiltersForTab = (tabKey) => {
    if (tabKey === TASK_TAB_KEYS.assigned) {
      setAssignedTaskTitleSearch('');
    } else if (tabKey === TASK_TAB_KEYS.watched) {
      setWatchedTaskTitleSearch('');
    } else if (tabKey === TASK_TAB_KEYS.team) {
      setTeamTaskTitleSearch('');
      setTeamTaskAssignerFilter([]);
      setTeamTaskFollowerFilter([]);
    } else {
      setExecutionTaskTitleSearch('');
    }
  };

  const getDateRangeForTaskStatFilter = (filterKey) => {
    const today = dayjs();
    if (filterKey === TASK_STAT_FILTERS.month) {
      return [today.startOf('month'), today.endOf('month')];
    }
    if (filterKey === TASK_STAT_FILTERS.week || filterKey === TASK_STAT_FILTERS.weekTodo) {
      return [today.startOf('week'), today.endOf('week')];
    }
    if (filterKey === TASK_STAT_FILTERS.today) {
      return [today.startOf('day'), today.endOf('day')];
    }
    return null;
  };

  const getStatusFilterForTaskStatFilter = (filterKey) => {
    if (filterKey === TASK_STAT_FILTERS.weekTodo) {
      return [...ACTIVE_TASK_STATUSES];
    }
    if (filterKey === TASK_STAT_FILTERS.todayDone) {
      return ['done'];
    }
    return [...TASK_STATUS_VALUES];
  };

  const applyTaskStatFilter = (filterKey, tabKey) => {
    const nextDateRange = getDateRangeForTaskStatFilter(filterKey);
    const nextStatusFilter = getStatusFilterForTaskStatFilter(filterKey);
    clearSecondaryTaskFiltersForTab(tabKey);
    setTaskDateRangeForTab(tabKey, nextDateRange);
    setTaskStatusFilterForTab(tabKey, nextStatusFilter);
    setTaskStatFilterByTab(prev => ({
      ...prev,
      [tabKey]: filterKey,
    }));
  };

  const handleTaskStatCardKeyDown = (event, filterKey, tabKey) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    applyTaskStatFilter(filterKey, tabKey);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        statsResult,
        remindersResult,
        tasksResult,
        followUpResult,
        watchedFollowUpResult,
      ] = await Promise.allSettled([
        statsApi.get(),
        remindersApi.list({ done: 0, limit: 120 }),
        tasksApi.list({ parent_id: 'null', limit: 300 }),
        followUpTasksApi.list(canManageTeamTasks ? { all: '1', limit: 300 } : { limit: 300 }),
        followUpTasksApi.watch({ limit: 200 }),
      ]);

      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      if (remindersResult.status === 'fulfilled') setReminders(remindersResult.value);

      const allTasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
      const allFollowUpData = followUpResult.status === 'fulfilled' ? followUpResult.value : [];
      const watchedFollowUpData = watchedFollowUpResult.status === 'fulfilled' ? watchedFollowUpResult.value : [];
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
      estimated_completion_date: dayjs(),
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
      estimated_completion_date: record.estimated_completion_date ? dayjs(record.estimated_completion_date) : null,
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
      estimated_completion_date: values.estimated_completion_date?.format('YYYY-MM-DD'),
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
    && (sameId(record.created_by, user?.id) || sameId(record.assigned_to, user?.id) || ['admin', 'sales_director'].includes(user?.role))
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
      <Form.Item label="预估完成日期" name="estimated_completion_date" rules={[{ required: true, message: '请选择预估完成日期' }]}>
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

  const dashboardPersonalTasks = [...assignedTasks, ...executionTasks];
  const isCurrentMonthTask = (task) => task.plan_date && dayjs(task.plan_date).isSame(dayjs(), 'month');
  const isCurrentWeekTask = (task) => task.plan_date && dayjs(task.plan_date).isSame(dayjs(), 'week');
  const isTodayTask = (task) => isTodayWithinTaskPlanRange(task);
  const isCompletedTodayTask = (task) => (
    (task.display_status || task.status) === 'done'
    && (task.done_at || task.complete_date)
    && dayjs(task.done_at || task.complete_date).isSame(dayjs(), 'day')
  );
  const monthlyTaskCount = new Set(dashboardPersonalTasks.filter(isCurrentMonthTask).map(task => task.id)).size;
  const todayTaskCount = new Set(dashboardPersonalTasks.filter(isTodayTask).map(task => task.id)).size;
  const todayCompletedTaskCount = new Set(dashboardPersonalTasks.filter(isCompletedTodayTask).map(task => task.id)).size;
  const weeklyTaskCount = dashboardPersonalTasks.filter(isCurrentWeekTask).length;
  const weeklyUnfinishedTaskCount = dashboardPersonalTasks.filter(task => (
    isCurrentWeekTask(task) && ACTIVE_TASK_STATUSES.has(task.display_status || task.status)
  )).length;

  const isTaskStatFilterHit = (task, tabKey) => {
    const filterKey = taskStatFilterByTab[tabKey];
    if (filterKey === TASK_STAT_FILTERS.today) {
      return isTodayTask(task);
    }
    if (filterKey === TASK_STAT_FILTERS.todayDone) {
      return isCompletedTodayTask(task);
    }
    return true;
  };

  const shouldUseTaskStatDateFilter = (tabKey) => (
    [TASK_STAT_FILTERS.today, TASK_STAT_FILTERS.todayDone].includes(taskStatFilterByTab[tabKey])
  );

  const filteredAssignedTasks = assignedTasks.filter(t => {
    if (!isTitleSearchHit(t, assignedTaskTitleSearch)) return false;
    if (!assignedTaskStatusFilter.includes(t.display_status)) return false;
    if (!shouldUseTaskStatDateFilter(TASK_TAB_KEYS.assigned) && !isWithinRange(t.plan_date, assignedTaskDateRange)) return false;
    return isTaskStatFilterHit(t, TASK_TAB_KEYS.assigned);
  });

  const filteredExecutionTasks = executionTasks.filter(t => {
    if (!isTitleSearchHit(t, executionTaskTitleSearch)) return false;
    if (!executionTaskStatusFilter.includes(t.display_status)) return false;
    if (!shouldUseTaskStatDateFilter(TASK_TAB_KEYS.execution) && !isWithinRange(t.plan_date, executionTaskDateRange)) return false;
    return isTaskStatFilterHit(t, TASK_TAB_KEYS.execution);
  });

  const filteredWatchedTasks = watchedTasks.filter(t => {
    if (!isTitleSearchHit(t, watchedTaskTitleSearch)) return false;
    if (!watchedTaskStatusFilter.includes(t.display_status)) return false;
    if (!shouldUseTaskStatDateFilter(TASK_TAB_KEYS.watched) && !isWithinRange(t.plan_date, watchedTaskDateRange)) return false;
    return isTaskStatFilterHit(t, TASK_TAB_KEYS.watched);
  });

  const filteredTeamTasks = teamTasks.filter(t => {
    if (!isTitleSearchHit(t, teamTaskTitleSearch)) return false;
    if (!teamTaskStatusFilter.includes(t.display_status)) return false;
    if (teamTaskAssignerFilter.length > 0 && !teamTaskAssignerFilter.includes(t.assigner_name)) return false;
    if (teamTaskFollowerFilter.length > 0 && !teamTaskFollowerFilter.includes(t.follower_name)) return false;
    if (!shouldUseTaskStatDateFilter(TASK_TAB_KEYS.team) && !isWithinRange(t.plan_date, teamTaskDateRange)) return false;
    return isTaskStatFilterHit(t, TASK_TAB_KEYS.team);
  });

  const normalizedAiSuggestionKeyword = String(aiSuggestionSearch || '').trim().toLowerCase();
  const filteredAiSuggestions = aiSuggestions.filter(item => {
    if (!aiSuggestionStatusFilter.includes(item.status)) return false;
    if (!aiSuggestionPriorityFilter.includes(item.priority)) return false;
    if (aiSuggestionBusinessLineFilter.length > 0 && !aiSuggestionBusinessLineFilter.includes(item.business_line)) return false;
    if (aiSuggestionTypeFilter.length > 0 && !aiSuggestionTypeFilter.includes(item.type)) return false;
    if (!normalizedAiSuggestionKeyword) return true;
    return [
      item.title,
      item.summary,
      item.recommendation,
      item.business_side,
      item.business_line,
      item.owner_role,
      ...(item.scope_tags || []),
      ...(item.evidence_sources || []),
    ].some(value => String(value || '').toLowerCase().includes(normalizedAiSuggestionKeyword));
  });
  const aiSuggestionBusinessLineOptions = [...new Set(aiSuggestions.map(item => item.business_line).filter(Boolean))]
    .map(value => ({ value, label: value }));
  const aiSuggestionWindowText = aiSuggestionMeta?.window_start && aiSuggestionMeta?.window_end
    ? `最近训练窗：${aiSuggestionMeta.business_line_label || '支小'} ${aiSuggestionMeta.window_start.slice(0, 7)} ~ ${aiSuggestionMeta.window_end.slice(0, 7)}`
    : '最近训练窗：支小';
  const aiSuggestionMetaText = aiSuggestionLoadError
    || (
      aiSuggestionMeta?.eval_total_cases && aiSuggestionMeta?.eval_pass_count
        ? `评测通过 ${aiSuggestionMeta.eval_pass_count}/${aiSuggestionMeta.eval_total_cases}${aiSuggestionMeta.eval_pass_rate ? `，通过率 ${aiSuggestionMeta.eval_pass_rate}` : ''}`
        : '蒸馏输出已按建议卡片整理，可直接转任务'
    );
  const activeAiSuggestionActions = Array.isArray(activeAiSuggestion?.actions) ? activeAiSuggestion.actions : [];
  const activeAiSuggestionEvidenceSources = Array.isArray(activeAiSuggestion?.evidence_sources) ? activeAiSuggestion.evidence_sources : [];
  const activeAiSuggestionEvidenceHighlights = Array.isArray(activeAiSuggestion?.evidence_highlights) ? activeAiSuggestion.evidence_highlights : [];

  const aiSuggestionSummaryCards = [
    {
      title: 'AI建议',
      value: filteredAiSuggestions.length,
      icon: <RobotOutlined />,
      gradient: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)',
    },
    {
      title: '待确认',
      value: filteredAiSuggestions.filter(item => item.status === 'pending_review').length,
      icon: <BulbOutlined />,
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
    },
    {
      title: '高优先',
      value: filteredAiSuggestions.filter(item => item.priority === 'high').length,
      icon: <FlagOutlined />,
      gradient: 'linear-gradient(135deg, #ef4444 0%, #fb7185 100%)',
    },
    {
      title: '预算侧',
      value: filteredAiSuggestions.filter(item => item.business_side === '预算侧').length,
      icon: <FundOutlined />,
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)',
    },
    {
      title: '流量侧',
      value: filteredAiSuggestions.filter(item => item.business_side === '流量侧').length,
      icon: <BarChartOutlined />,
      gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    },
  ];

  const taskStatCards = [
    {
      title: '本月任务',
      value: monthlyTaskCount,
      icon: <ScheduleOutlined />,
      gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      filterKey: TASK_STAT_FILTERS.month,
    },
    {
      title: '本周任务',
      value: weeklyTaskCount,
      icon: <CalendarOutlined />,
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      filterKey: TASK_STAT_FILTERS.week,
    },
    {
      title: '本周待办',
      value: weeklyUnfinishedTaskCount,
      icon: <BellOutlined />,
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
      filterKey: TASK_STAT_FILTERS.weekTodo,
    },
    {
      title: '今日任务',
      value: todayTaskCount,
      icon: <FlagOutlined />,
      gradient: 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)',
      filterKey: TASK_STAT_FILTERS.today,
    },
    {
      title: '今日已完成',
      value: todayCompletedTaskCount,
      icon: <CompletedBoostIcon />,
      gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      filterKey: TASK_STAT_FILTERS.todayDone,
    },
  ].filter(Boolean);

  const renderSharedToNames = (value) => (
    value
      ? <Tooltip title={value}>{value}</Tooltip>
      : <Text type="secondary">-</Text>
  );

  const openAiSuggestionDrawer = (suggestion) => {
    setActiveAiSuggestion(suggestion);
    setAiSuggestionDrawerOpen(true);
  };

  const handleCreateTaskFromSuggestion = (suggestion) => {
    if (!suggestion) return;
    const actions = Array.isArray(suggestion.actions) ? suggestion.actions : [];
    const evidenceSources = Array.isArray(suggestion.evidence_sources) ? suggestion.evidence_sources : [];
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      title: `[AI建议] ${suggestion.title}`,
      description: [
        suggestion.summary,
        '',
        '建议动作：',
        ...actions.map((item, index) => `${index + 1}. ${item}`),
        '',
        '证据来源：',
        ...evidenceSources.map((item, index) => `${index + 1}. ${item}`),
      ].join('\n'),
      result: '',
      date: dayjs(),
      estimated_completion_date: dayjs().add(suggestion.priority === 'high' ? 1 : suggestion.priority === 'medium' ? 2 : 3, 'day'),
      priority: suggestion.priority,
      assigned_to: user?.id,
      shared_to: [],
      status: 'pending',
    });
    setAiSuggestionDrawerOpen(false);
    setModalOpen(true);
  };

  const renderAiSuggestionConfidence = (confidence) => {
    const color = confidence >= 88 ? '#16a34a' : confidence >= 80 ? '#2563eb' : '#d97706';
    return (
      <div style={{ minWidth: 92 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#64748b' }}>
          <span>置信度</span>
          <span style={{ color }}>{confidence}%</span>
        </div>
        <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999 }}>
          <div style={{ width: `${confidence}%`, height: '100%', borderRadius: 999, background: color }} />
        </div>
      </div>
    );
  };

  const sharedTaskColumn = {
    title: '共享人',
    dataIndex: 'shared_to_names',
    key: 'shared_to_names',
    width: 140,
    ellipsis: true,
    render: renderSharedToNames,
  };

  const estimatedCompletionDateColumn = {
    title: '预估完成日期',
    dataIndex: 'estimated_completion_date',
    key: 'estimated_completion_date',
    width: 130,
    render: (value) => value ? dayjs(value).format('MM-DD') : <Text type="secondary">-</Text>,
  };

  const taskStatusColumn = {
    title: '状态',
    dataIndex: 'display_status_label',
    key: 'display_status_label',
    width: 100,
    render: (_, record) => <Badge status={record.display_status_badge} text={record.display_status_label} />,
  };

  const executionTaskColumns = [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => renderTaskTitleCell(text, record.description),
    },
    taskStatusColumn,
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
        sameId(record.created_by, user?.id)
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
    estimatedCompletionDateColumn,
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
      render: (text, record) => renderTaskTitleCell(text, record.description),
    },
    taskStatusColumn,
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
    estimatedCompletionDateColumn,
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
  ];

  const watchedTaskColumns = [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => renderTaskTitleCell(text, record.description || record.opportunity_note),
    },
    taskStatusColumn,
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
    estimatedCompletionDateColumn,
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
      render: (text, record) => renderTaskTitleCell(text, record.description),
    },
    taskStatusColumn,
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
    estimatedCompletionDateColumn,
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
              {record.estimated_completion_date && <Tag>预估完成 {dayjs(record.estimated_completion_date).format('MM-DD')}</Tag>}
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

  const renderAiSuggestionCard = (record) => {
    const typeMeta = aiSuggestionTypeMap[record.type] || { label: record.type, color: 'default' };
    const statusMeta = aiSuggestionStatusMap[record.status] || { label: record.status, badge: 'default' };
    const actions = Array.isArray(record.actions) ? record.actions : [];
    const evidenceSources = Array.isArray(record.evidence_sources) ? record.evidence_sources : [];
    const scopeTags = Array.isArray(record.scope_tags) ? record.scope_tags : [];

    return (
      <Card
        key={record.id}
        hoverable
        style={{
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        }}
        styles={{ body: { padding: isMobile ? 16 : 18 } }}
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space wrap size={[8, 8]} style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap size={[8, 8]}>
              <Tag color={typeMeta.color}>{typeMeta.label}</Tag>
              <Tag color={priorityMap[record.priority]?.color}>{priorityMap[record.priority]?.label || record.priority}</Tag>
              <Tag>{record.business_side}</Tag>
              <Tag>{record.business_line}</Tag>
            </Space>
            <Badge status={statusMeta.badge} text={statusMeta.label} />
          </Space>

          <div>
            <Text strong style={{ display: 'block', fontSize: 16, marginBottom: 6, lineHeight: 1.5 }}>
              {record.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.window_label} · 建议对象：{record.owner_role}
            </Text>
          </div>

          <Typography.Paragraph
            ellipsis={{ rows: 3, expandable: false }}
            style={{ marginBottom: 0, color: '#1f2937' }}
          >
            {record.summary}
          </Typography.Paragraph>

          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <Text style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 8 }}>建议动作</Text>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {actions.slice(0, 2).map((action, index) => (
                <Text key={action} style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {index + 1}. {action}
                </Text>
              ))}
            </Space>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Space direction="vertical" size={8} style={{ flex: 1, minWidth: 220 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                预期效果：{record.expected_impact}
              </Text>
              <Space wrap size={[8, 8]}>
                {evidenceSources.map(source => (
                  <Tag key={source} style={{ marginInlineEnd: 0 }}>{source}</Tag>
                ))}
              </Space>
            </Space>
            {renderAiSuggestionConfidence(record.confidence)}
          </div>

          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap size={[8, 8]}>
              {scopeTags.map(tag => (
                <Tag key={tag} color="default" style={{ marginInlineEnd: 0 }}>{tag}</Tag>
              ))}
            </Space>
            <Space wrap>
              <Button size="small" icon={<EyeOutlined />} onClick={() => openAiSuggestionDrawer(record)}>
                查看证据
              </Button>
              <Button size="small" type="primary" onClick={() => handleCreateTaskFromSuggestion(record)}>
                转任务
              </Button>
            </Space>
          </Space>
        </Space>
      </Card>
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
                onChange={event => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.execution);
                  setExecutionTaskTitleSearch(event.target.value);
                }}
                style={isMobile ? { width: '100%' } : { width: 220 }}
              />
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={executionTaskStatusFilter}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.execution);
                  setExecutionTaskStatusFilter(value);
                }}
                style={isMobile ? { width: '100%' } : { minWidth: 200 }}
                options={TASK_STATUS_OPTIONS}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={executionTaskDateRange}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.execution);
                  setExecutionTaskDateRange(value);
                }}
                style={isMobile ? { width: '100%' } : { width: 240 }}
              />
              {(executionTaskTitleSearch.trim() || executionTaskStatusFilter.length !== TASK_STATUS_VALUES.length || executionTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setExecutionTaskTitleSearch('');
                    setExecutionTaskStatusFilter([...TASK_STATUS_VALUES]);
                    setExecutionTaskDateRange(null);
                    clearTaskStatFilterForTab(TASK_TAB_KEYS.execution);
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
                onChange={event => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.assigned);
                  setAssignedTaskTitleSearch(event.target.value);
                }}
                style={isMobile ? { width: '100%' } : { width: 220 }}
              />
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={assignedTaskStatusFilter}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.assigned);
                  setAssignedTaskStatusFilter(value);
                }}
                style={isMobile ? { width: '100%' } : { minWidth: 200 }}
                options={TASK_STATUS_OPTIONS}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={assignedTaskDateRange}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.assigned);
                  setAssignedTaskDateRange(value);
                }}
                style={isMobile ? { width: '100%' } : { width: 240 }}
              />
              {(assignedTaskTitleSearch.trim() || assignedTaskStatusFilter.length !== TASK_STATUS_VALUES.length || assignedTaskDateRange) && (
                <Button
                  size="small"
                  onClick={() => {
                    setAssignedTaskTitleSearch('');
                    setAssignedTaskStatusFilter([...TASK_STATUS_VALUES]);
                    setAssignedTaskDateRange(null);
                    clearTaskStatFilterForTab(TASK_TAB_KEYS.assigned);
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
              onChange={event => {
                clearTaskStatFilterForTab(TASK_TAB_KEYS.watched);
                setWatchedTaskTitleSearch(event.target.value);
              }}
              style={isMobile ? { width: '100%' } : { width: 220 }}
            />
            <Select
              mode="multiple"
              placeholder="状态筛选"
              value={watchedTaskStatusFilter}
              onChange={value => {
                clearTaskStatFilterForTab(TASK_TAB_KEYS.watched);
                setWatchedTaskStatusFilter(value);
              }}
              style={isMobile ? { width: '100%' } : { minWidth: 200 }}
              options={TASK_STATUS_OPTIONS}
            />
            <RangePicker
              placeholder={['开始日期', '结束日期']}
              value={watchedTaskDateRange}
              onChange={value => {
                clearTaskStatFilterForTab(TASK_TAB_KEYS.watched);
                setWatchedTaskDateRange(value);
              }}
              style={isMobile ? { width: '100%' } : { width: 240 }}
            />
            {(watchedTaskTitleSearch.trim() || watchedTaskStatusFilter.length !== TASK_STATUS_VALUES.length || watchedTaskDateRange) && (
              <Button
                size="small"
                onClick={() => {
                  setWatchedTaskTitleSearch('');
                  setWatchedTaskStatusFilter([...TASK_STATUS_VALUES]);
                  setWatchedTaskDateRange(null);
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.watched);
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
                onChange={event => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.team);
                  setTeamTaskTitleSearch(event.target.value);
                }}
                style={isMobile ? { width: '100%' } : { width: 220 }}
              />
              <Select
                mode="multiple"
                placeholder="状态筛选"
                value={teamTaskStatusFilter}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.team);
                  setTeamTaskStatusFilter(value);
                }}
                style={isMobile ? { width: '100%' } : { minWidth: 200 }}
                options={TASK_STATUS_OPTIONS}
              />
              <Select
                mode="multiple"
                placeholder="指派人筛选"
                value={teamTaskAssignerFilter}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.team);
                  setTeamTaskAssignerFilter(value);
                }}
                style={isMobile ? { width: '100%' } : { minWidth: 160 }}
                options={[...new Set(teamTasks.map(t => t.assigner_name).filter(Boolean))].map(n => ({ label: n, value: n }))}
              />
              <Select
                mode="multiple"
                placeholder="跟进人筛选"
                value={teamTaskFollowerFilter}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.team);
                  setTeamTaskFollowerFilter(value);
                }}
                style={isMobile ? { width: '100%' } : { minWidth: 160 }}
                options={[...new Set(teamTasks.map(t => t.follower_name).filter(Boolean))].map(n => ({ label: n, value: n }))}
              />
              <RangePicker
                placeholder={['开始日期', '结束日期']}
                value={teamTaskDateRange}
                onChange={value => {
                  clearTaskStatFilterForTab(TASK_TAB_KEYS.team);
                  setTeamTaskDateRange(value);
                }}
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
                    clearTaskStatFilterForTab(TASK_TAB_KEYS.team);
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

  if (canViewAiSuggestions) {
    tabItems.push({
      key: TASK_TAB_KEYS.ai,
      label: (
        <span>
          <RobotOutlined /> AI建议
          {filteredAiSuggestions.filter(item => item.status === 'pending_review').length > 0 && (
            <Badge count={filteredAiSuggestions.filter(item => item.status === 'pending_review').length} style={{ marginLeft: 8 }} />
          )}
        </span>
      ),
      children: (
        <div>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
            <Input
              allowClear
              placeholder="搜索建议标题、摘要、证据来源"
              value={aiSuggestionSearch}
              onChange={event => setAiSuggestionSearch(event.target.value)}
              style={isMobile ? { width: '100%' } : { width: 260 }}
            />
            <Select
              mode="multiple"
              placeholder="建议类型"
              value={aiSuggestionTypeFilter}
              onChange={setAiSuggestionTypeFilter}
              style={isMobile ? { width: '100%' } : { minWidth: 180 }}
              options={Object.entries(aiSuggestionTypeMap).map(([value, meta]) => ({ value, label: meta.label }))}
            />
            <Select
              mode="multiple"
              placeholder="业务线"
              value={aiSuggestionBusinessLineFilter}
              onChange={setAiSuggestionBusinessLineFilter}
              style={isMobile ? { width: '100%' } : { minWidth: 140 }}
              options={aiSuggestionBusinessLineOptions}
            />
            <Select
              mode="multiple"
              placeholder="优先级"
              value={aiSuggestionPriorityFilter}
              onChange={setAiSuggestionPriorityFilter}
              style={isMobile ? { width: '100%' } : { minWidth: 140 }}
              options={['high', 'medium', 'low'].map(value => ({ value, label: priorityMap[value]?.label || value }))}
            />
            <Select
              mode="multiple"
              placeholder="建议状态"
              value={aiSuggestionStatusFilter}
              onChange={setAiSuggestionStatusFilter}
              style={isMobile ? { width: '100%' } : { minWidth: 180 }}
              options={Object.entries(aiSuggestionStatusMap).map(([value, meta]) => ({ value, label: meta.label }))}
            />
            {(aiSuggestionSearch.trim()
              || aiSuggestionTypeFilter.length > 0
              || aiSuggestionBusinessLineFilter.length > 0
              || aiSuggestionPriorityFilter.length !== AI_SUGGESTION_PRIORITY_VALUES.length
              || aiSuggestionStatusFilter.length !== AI_SUGGESTION_STATUS_VALUES.length) && (
              <Button
                size="small"
                onClick={() => {
                  setAiSuggestionSearch('');
                  setAiSuggestionTypeFilter([]);
                  setAiSuggestionBusinessLineFilter([]);
                  setAiSuggestionPriorityFilter(AI_SUGGESTION_PRIORITY_VALUES);
                  setAiSuggestionStatusFilter(AI_SUGGESTION_STATUS_VALUES);
                }}
              >
                重置筛选
              </Button>
            )}
          </Space>
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: isMobile ? 14 : 16,
            borderRadius: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <Space direction={isMobile ? 'vertical' : 'horizontal'} size={isMobile ? 6 : 12} style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text strong>{aiSuggestionWindowText}</Text>
            <Text type="secondary">{aiSuggestionMetaText}</Text>
          </Space>
        </div>

        {aiSuggestionsLoading ? (
          <Card loading style={{ borderRadius: 12 }} />
        ) : filteredAiSuggestions.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 16,
            }}
          >
            {filteredAiSuggestions.map(renderAiSuggestionCard)}
          </div>
        ) : (
          <Card style={{ borderRadius: 12 }}>
            <Empty description="当前筛选条件下暂无 AI 建议" />
          </Card>
        )}
        </div>
      ),
    });
  }

  const topSummaryCards = canViewAiSuggestions && activeTaskTab === TASK_TAB_KEYS.ai
    ? aiSuggestionSummaryCards
    : taskStatCards;

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      {/* 统计卡片 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.min(topSummaryCards.length, 5)}, minmax(0, 1fr))`,
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 16 : 24,
          width: '100%',
        }}
      >
        {topSummaryCards.map(card => {
          const isFilterCard = Boolean(card.filterKey);
          const isActiveFilterCard = isFilterCard && taskStatFilterByTab[activeTaskTab] === card.filterKey;
          return (
          <div
            key={card.title}
            role={isFilterCard ? 'button' : undefined}
            tabIndex={isFilterCard ? 0 : undefined}
            aria-label={isFilterCard ? `${card.title}筛选当前任务列表` : undefined}
            onClick={isFilterCard ? () => applyTaskStatFilter(card.filterKey, activeTaskTab) : undefined}
            onKeyDown={isFilterCard ? event => handleTaskStatCardKeyDown(event, card.filterKey, activeTaskTab) : undefined}
            style={{ minWidth: 0 }}
          >
            <Card
              className="stat-card"
              style={{
                background: card.gradient,
                borderRadius: 12,
                border: 'none',
                cursor: isFilterCard ? 'pointer' : 'default',
                outline: isActiveFilterCard ? '2px solid rgba(255,255,255,0.95)' : 'none',
                outlineOffset: isActiveFilterCard ? -6 : 0,
                boxShadow: isActiveFilterCard ? '0 10px 24px rgba(15,23,42,0.16)' : undefined,
              }}
              styles={{ body: { padding: isMobile ? '16px 18px' : '18px 18px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: isMobile ? 12 : 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontWeight: 500, whiteSpace: 'nowrap' }}>{card.title}</div>
                  <div style={{ fontSize: isMobile ? 28 : 32, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{card.value}</div>
                </div>
                <div style={{ width: isMobile ? 34 : 42, height: isMobile ? 34 : 42, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 20, color: '#fff' }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </div>
          );
        })}
      </div>

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
          activeKey={activeTaskTab}
          onChange={setActiveTaskTab}
          items={tabItems}
          tabBarGutter={isMobile ? 12 : undefined}
          tabBarExtraContent={isMobile ? undefined : {
            right: canViewAiSuggestions && activeTaskTab === TASK_TAB_KEYS.ai
              ? <Text type="secondary" style={{ fontSize: 12 }}>{aiSuggestionMetaText}</Text>
              : <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建任务</Button>,
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
        title="AI建议详情"
        open={aiSuggestionDrawerOpen}
        onClose={() => setAiSuggestionDrawerOpen(false)}
        width={isMobile ? '100%' : 560}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 56px)', overflowY: 'auto' } } : undefined}
        extra={(
          <Button type="primary" onClick={() => handleCreateTaskFromSuggestion(activeAiSuggestion)}>
            转任务
          </Button>
        )}
      >
        {activeAiSuggestion && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap size={[8, 8]}>
              <Tag color={aiSuggestionTypeMap[activeAiSuggestion.type]?.color}>{aiSuggestionTypeMap[activeAiSuggestion.type]?.label}</Tag>
              <Tag color={priorityMap[activeAiSuggestion.priority]?.color}>{priorityMap[activeAiSuggestion.priority]?.label}</Tag>
              <Tag>{activeAiSuggestion.business_side}</Tag>
              <Tag>{activeAiSuggestion.business_line}</Tag>
              <Badge status={aiSuggestionStatusMap[activeAiSuggestion.status]?.badge} text={aiSuggestionStatusMap[activeAiSuggestion.status]?.label} />
            </Space>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="建议标题">{activeAiSuggestion.title}</Descriptions.Item>
              <Descriptions.Item label="建议对象">{activeAiSuggestion.owner_role}</Descriptions.Item>
              <Descriptions.Item label="蒸馏窗口">{activeAiSuggestion.window_label}</Descriptions.Item>
              <Descriptions.Item label="建议摘要">
                <div style={{ whiteSpace: 'pre-wrap' }}>{activeAiSuggestion.summary}</div>
              </Descriptions.Item>
              <Descriptions.Item label="建议输出">
                <div style={{ whiteSpace: 'pre-wrap' }}>{activeAiSuggestion.recommendation}</div>
              </Descriptions.Item>
              <Descriptions.Item label="预期效果">{activeAiSuggestion.expected_impact}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="建议动作" style={{ borderRadius: 10 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {activeAiSuggestionActions.map((action, index) => (
                  <Text key={action}>{index + 1}. {action}</Text>
                ))}
              </Space>
            </Card>

            <Card size="small" title="证据摘要" style={{ borderRadius: 10 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap size={[8, 8]}>
                  {activeAiSuggestionEvidenceSources.map(source => (
                    <Tag key={source}>{source}</Tag>
                  ))}
                </Space>
                {activeAiSuggestionEvidenceHighlights.map((item, index) => (
                  <Text key={item}>{index + 1}. {item}</Text>
                ))}
              </Space>
            </Card>

            <Card size="small" style={{ borderRadius: 10, background: '#f8fafc' }}>
              {renderAiSuggestionConfidence(activeAiSuggestion.confidence)}
            </Card>
          </Space>
        )}
      </Drawer>

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
              <Descriptions.Item label="预估完成日期">{detailRecord.estimated_completion_date || '-'}</Descriptions.Item>
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
