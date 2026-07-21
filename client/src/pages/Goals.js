import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, FilterOutlined, HistoryOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { goalsApi, usersApi, projectGroupsApi, teamsApi } from '../api';
import { useAuth } from '../AuthContext';
import ContentHistoryDrawer from '../components/ContentHistoryDrawer';
import ContentShareEditor from '../components/ContentShareEditor';
import DocumentBodyEditor from '../components/DocumentBodyEditor';
import { resizableTableComponents, useResizableColumns } from '../components/ResizableTable';
import {
  goalDocumentContentToPlain,
  normalizeGoalDocumentContent,
  serializeGoalDocumentContent,
} from '../utils/goalDocumentContent';
import {
  getDocumentBodyValueSignature,
  mergeCollaborativeDocumentBodies,
} from '../utils/collaborativeDocument';
import { getDefaultDocumentCxoUsers } from '../utils/documentDefaultShares';
import {
  createEmptyShareDraft,
  draftToShares,
  ORGANIZATION_DEPARTMENT_OPTIONS,
  sharesToDraft,
} from '../utils/contentShares';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;
const GOAL_CONTENT_AUTO_SAVE_DELAY = 2000;
const executiveRoles = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);

const goalTypeMap = {
  quarter: { label: '季度目标', color: 'blue' },
  month: { label: '月度目标', color: 'green' },
  week: { label: '周目标', color: 'orange' },
};

const statusMap = {
  pending: { label: '未开始', color: 'default' },
  active: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  delayed: { label: '延期', color: 'warning' },
  cancelled: { label: '已取消', color: 'error' },
};

const roleMap = {
  admin: '管理员',
  ceo: 'CEO',
  coo: 'COO',
  cto: 'CTO',
  cmo: 'CMO',
  sales_director: '销售总监',
  leader: '组长',
  member: '普通成员',
  readonly: '只读',
  guest: '访客',
};

const departmentMap = {
  commercial: '商务',
  operation: '产运',
  rd: '研发',
  general: '综合',
  ad_delivery: '投放',
  marketing: '市场',
  hr: '人事',
  finance: '财务',
  admin: '行政',
};

const goalTypeOptions = [
  { value: 'quarter', label: '季度目标' },
  { value: 'month', label: '月度目标' },
  { value: 'week', label: '周目标' },
];

const scopeTypeOptions = [
  { value: 'project_group', label: '项目组' },
  { value: 'department', label: '部门' },
  { value: 'team', label: '小组' },
  { value: 'personal', label: '个人' },
];

const scopeTypeMap = {
  project_group: { label: '项目组', color: 'geekblue' },
  department: { label: '部门', color: 'cyan' },
  team: { label: '小组', color: 'purple' },
  personal: { label: '个人', color: 'gold' },
};

const statusOptions = [
  { value: 'pending', label: '未开始' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'delayed', label: '延期' },
  { value: 'cancelled', label: '已取消' },
];

const ownerRoleOptions = [
  { value: 'ceo', label: 'CEO' },
  { value: 'coo', label: 'COO' },
  { value: 'cmo', label: 'CMO' },
  { value: 'cto', label: 'CTO' },
  { value: 'leader', label: '组长' },
  { value: 'member', label: '普通成员' },
];

const getDisplayName = (user) => user?.display_name || user?.username || `用户${user?.id}`;
const getRoleLabel = (role) => roleMap[role] || role || '-';
const getDepartmentLabel = (department) => departmentMap[department] || department || '-';
const isExecutive = (role) => executiveRoles.has(role);
const detailTextStyle = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  lineHeight: 1.75,
  color: '#1f1f1f',
};

function getGoalEditorValues(record) {
  const values = {
    ...record,
    deadline: record?.deadline ? dayjs(record.deadline) : null,
    status: record?.status,
    scope_type: record?.scope_type || 'personal',
    progress: Number(record?.progress || 0),
    description: normalizeGoalDocumentContent(record?.description || ''),
    result: normalizeGoalDocumentContent(record?.result || ''),
  };
  if (record?.goal_type === 'quarter' && record.period) {
    const match = record.period.match(/^(\d{4})-(Q[1-4])$/);
    if (match) {
      values.period_year = Number(match[1]);
      values.period_quarter = match[2];
    }
  } else if (record?.goal_type === 'month' && record.period) {
    const monthValue = dayjs(`${record.period}-01`);
    values.period_month = monthValue.isValid() ? monthValue : null;
  } else if (record?.goal_type === 'week' && record.period) {
    const match = record.period.match(/^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/);
    if (match) values.period_range = [dayjs(match[1]), dayjs(match[2])];
  }
  return values;
}

function buildGoalContentSnapshot(record) {
  if (!record) return null;
  return {
    title: record.title || '',
    description: normalizeGoalDocumentContent(record.description || ''),
    result: normalizeGoalDocumentContent(record.result || ''),
    updated_at: record.updated_at || '',
  };
}

function getGoalContentSignature(values = {}) {
  return JSON.stringify({
    title: values.title || '',
    description: getDocumentBodyValueSignature(values.description),
    result: getDocumentBodyValueSignature(values.result),
  });
}

function Goals() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [goalOptions, setGoalOptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);
  const [teams, setTeams] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareDraft, setShareDraft] = useState(createEmptyShareDraft());
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [filters, setFilters] = useState({
    department: undefined,
    team_id: undefined,
    project_group_id: undefined,
    owner_id: undefined,
    goal_type: undefined,
    scope_type: undefined,
    status: undefined,
    owner_role: undefined,
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [goalSaveState, setGoalSaveState] = useState({ phase: 'idle', savedAt: null, error: '' });
  const [remoteUpdateHint, setRemoteUpdateHint] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyGoalId, setHistoryGoalId] = useState(null);
  const [historyCanRestore, setHistoryCanRestore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRevisions, setHistoryRevisions] = useState([]);
  const [restoringRevisionId, setRestoringRevisionId] = useState(null);
  const [form] = Form.useForm();
  const goalAutoSaveTimerRef = useRef(null);
  const goalPendingSaveRef = useRef(null);
  const goalBaseSnapshotRef = useRef(null);
  const goalLastSavedSignatureRef = useRef('');
  const goalDirtyRef = useRef(false);
  const goalLiveSyncPendingRef = useRef(false);
  const persistGoalContentRef = useRef(null);
  const goalType = Form.useWatch('goal_type', form);
  const scopeType = Form.useWatch('scope_type', form);
  const defaultShareUsers = useMemo(() => getDefaultDocumentCxoUsers(users), [users]);
  const canManageEditingGoal = !editing || Boolean(Number(editing.can_manage));

  useEffect(() => {
    loadUsers();
    loadProjectGroups();
    loadTeams();
  }, []);

  useEffect(() => {
    if (!user || filtersReady) return;
    setFilters({
      department: undefined,
      team_id: undefined,
      project_group_id: undefined,
      owner_id: user.role === 'member' ? user.id : undefined,
      goal_type: undefined,
      scope_type: undefined,
      status: undefined,
      owner_role: undefined,
    });
    setFiltersReady(true);
  }, [user, filtersReady]);

  useEffect(() => {
    if (!filtersReady) return;
    loadGoals();
  }, [filtersReady, filters]);

  useEffect(() => {
    if (!user) return;
    loadGoalOptions();
  }, [user]);

  const loadUsers = async () => {
    try {
      const data = await usersApi.listSimple();
      setUsers(data);
    } catch {
      message.error('加载用户失败');
    }
  };

  const loadProjectGroups = async () => {
    try {
      const data = await projectGroupsApi.list();
      setProjectGroups(data);
    } catch {
      message.error('加载项目组失败');
    }
  };

  const loadTeams = async () => {
    try {
      const data = await teamsApi.list();
      setTeams(data);
    } catch {
      message.error('加载小组失败');
    }
  };

  const loadGoals = async () => {
    setLoading(true);
    try {
      const data = await goalsApi.list(filters);
      setGoals(data);
    } catch {
      message.error('加载目标失败');
    } finally {
      setLoading(false);
    }
  };

  const loadGoalOptions = async () => {
    try {
      const data = await goalsApi.list();
      setGoalOptions(data);
    } catch {
      message.error('加载上级目标选项失败');
    }
  };

  const refreshGoals = async () => {
    await Promise.all([loadGoals(), loadGoalOptions()]);
  };

  const currentUserMeta = users.find(item => item.id === user?.id);

  const getVisibleUsers = () => {
    if (!user) return [];
    if (isExecutive(user.role) || user.role === 'sales_director') return users;
    if (!currentUserMeta) return users.filter(item => item.id === user.id);
    const currentTeamIds = currentUserMeta.team_ids || (currentUserMeta.team_id ? [currentUserMeta.team_id] : []);

    if (user.role === 'leader') {
      return users.filter(item => {
        const itemTeamIds = item.team_ids || (item.team_id ? [item.team_id] : []);
        return item.id === user.id || itemTeamIds.some(teamId => currentTeamIds.includes(teamId));
      });
    }

    if (user.role === 'member') {
      const visibleIds = new Set([user.id]);
      if (currentUserMeta?.leader_id) visibleIds.add(currentUserMeta.leader_id);
      users
        .filter(item => item.role === 'leader')
        .forEach(item => {
          const itemTeamIds = item.team_ids || (item.team_id ? [item.team_id] : []);
          if (itemTeamIds.some(teamId => currentTeamIds.includes(teamId))) {
            visibleIds.add(item.id);
          }
        });
      return users.filter(item => visibleIds.has(item.id));
    }

    return users.filter(item => item.id === user.id);
  };

  const visibleUsers = getVisibleUsers();
  const ownerOptions = visibleUsers.map(item => ({
    value: item.id,
    label: getDisplayName(item),
  }));
  const departmentOptions = Array.from(new Set([
    ...visibleUsers.map(item => item.department).filter(Boolean),
    ...goals.map(item => item.department).filter(Boolean),
  ])).map(department => ({ value: department, label: getDepartmentLabel(department) }));

  const getParentOptions = () => {
    if (goalType === 'month') {
      return goalOptions
        .filter(item => item.goal_type === 'quarter' && item.id !== editing?.id)
        .map(item => ({ value: item.id, label: `${item.period} · ${item.title}` }));
    }
    if (goalType === 'week') {
      return goalOptions
        .filter(item => item.goal_type === 'month' && item.id !== editing?.id)
        .map(item => ({ value: item.id, label: `${item.period} · ${item.title}` }));
    }
    return [];
  };

  const openCreateModal = () => {
    const now = dayjs();
    const currentQuarter = Math.ceil((now.month() + 1) / 3);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      goal_type: 'quarter',
      period_year: now.year(),
      period_quarter: `Q${currentQuarter}`,
      owner_id: user?.id,
      department: currentUserMeta?.department || undefined,
      progress: 0,
      status: 'pending',
      scope_type: 'personal',
      description: normalizeGoalDocumentContent(''),
      result: normalizeGoalDocumentContent(''),
    });
    goalBaseSnapshotRef.current = null;
    goalLastSavedSignatureRef.current = '';
    goalDirtyRef.current = false;
    setGoalSaveState({ phase: 'idle', savedAt: null, error: '' });
    setRemoteUpdateHint('');
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    if (!Number(record?.can_edit)) {
      message.warning('你没有编辑该目标的权限');
      return;
    }
    const values = getGoalEditorValues(record);
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(values);
    goalBaseSnapshotRef.current = buildGoalContentSnapshot(record);
    goalLastSavedSignatureRef.current = getGoalContentSignature(values);
    goalDirtyRef.current = false;
    setGoalSaveState({ phase: 'saved', savedAt: record.updated_at || null, error: '' });
    setRemoteUpdateHint('');
    setModalVisible(true);
  };

  const openGoalShare = async (record) => {
    if (!Number(record?.can_share)) {
      message.warning('你没有调整该目标共享范围的权限');
      return;
    }
    setShareTarget(record);
    setShareDraft(createEmptyShareDraft());
    setShareOpen(true);
    setShareLoading(true);
    try {
      const shares = await goalsApi.listShares(record.id);
      setShareDraft(sharesToDraft(shares));
    } catch (error) {
      message.error(error?.response?.data?.error || '加载共享范围失败');
      setShareOpen(false);
    } finally {
      setShareLoading(false);
    }
  };

  const saveGoalShares = async () => {
    if (!shareTarget?.id) return;
    setShareSaving(true);
    try {
      await goalsApi.saveShares(shareTarget.id, draftToShares(shareDraft));
      message.success('共享范围已保存');
      setShareOpen(false);
    } catch (error) {
      message.error(error?.response?.data?.error || '保存共享范围失败');
    } finally {
      setShareSaving(false);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除目标将同时删除其所有子目标，确定要删除吗？',
      onOk: async () => {
        try {
          await goalsApi.delete(record.id);
          message.success('删除成功');
          if (detailRecord?.id === record.id) {
            setDetailVisible(false);
            setDetailRecord(null);
          }
          await refreshGoals();
        } catch (error) {
          message.error(error?.response?.data?.error || '删除失败');
        }
      },
    });
  };

  const applyRemoteGoalContent = useCallback((remoteRecord, { mergeLocal = true } = {}) => {
    if (!remoteRecord) return { dirty: goalDirtyRef.current, hadConflicts: false };
    const remote = buildGoalContentSnapshot(remoteRecord);
    const base = goalBaseSnapshotRef.current || remote;
    const localValues = form.getFieldsValue(true);
    let nextTitle = remote.title;
    let description = { value: remote.description, hadConflicts: false };
    let result = { value: remote.result, hadConflicts: false };
    let titleConflict = false;
    if (mergeLocal && goalDirtyRef.current) {
      description = mergeCollaborativeDocumentBodies(base.description, localValues.description, remote.description);
      result = mergeCollaborativeDocumentBodies(base.result, localValues.result, remote.result);
      const localTitle = localValues.title || '';
      const localTitleChanged = localTitle !== (base.title || '');
      const remoteTitleChanged = remote.title !== (base.title || '');
      if (localTitleChanged) nextTitle = localTitle;
      titleConflict = localTitleChanged && remoteTitleChanged && localTitle !== remote.title;
    }
    const nextValues = { title: nextTitle, description: description.value, result: result.value };
    form.setFieldsValue(nextValues);
    goalBaseSnapshotRef.current = remote;
    goalLastSavedSignatureRef.current = getGoalContentSignature(remote);
    const dirty = getGoalContentSignature(nextValues) !== goalLastSavedSignatureRef.current;
    goalDirtyRef.current = dirty;
    const hadConflicts = titleConflict || description.hadConflicts || result.hadConflicts;
    setGoalSaveState({
      phase: dirty ? 'dirty' : 'saved',
      savedAt: remote.updated_at || new Date().toISOString(),
      error: '',
    });
    setRemoteUpdateHint(hadConflicts
      ? '检测到同一内容被多人修改，已保留本地版本并合并其他块'
      : '已同步协作者的最新修改');
    return { dirty, hadConflicts };
  }, [form]);

  const persistGoalContent = async ({ silent = true, retryOnConflict = true } = {}) => {
    if (!editing?.id || !modalVisible) return false;
    if (goalPendingSaveRef.current) {
      await goalPendingSaveRef.current.catch(() => null);
      return persistGoalContentRef.current?.({ silent, retryOnConflict }) || false;
    }
    const values = form.getFieldsValue(true);
    if (!String(values.title || '').trim()) return false;
    const signature = getGoalContentSignature(values);
    if (signature === goalLastSavedSignatureRef.current) {
      goalDirtyRef.current = false;
      setGoalSaveState(prev => ({ ...prev, phase: 'saved', error: '' }));
      return true;
    }
    setGoalSaveState(prev => ({ ...prev, phase: 'saving', error: '' }));
    const payload = {
      title: values.title,
      description: serializeGoalDocumentContent(values.description),
      result: serializeGoalDocumentContent(values.result),
      ...(goalBaseSnapshotRef.current?.updated_at
        ? { base_updated_at: goalBaseSnapshotRef.current.updated_at }
        : {}),
      revision_action: silent ? 'save' : 'manual_save',
    };
    const savePromise = goalsApi.update(editing.id, payload);
    goalPendingSaveRef.current = savePromise;
    try {
      const saved = await savePromise;
      goalLastSavedSignatureRef.current = signature;
      goalBaseSnapshotRef.current = {
        title: values.title || '',
        description: normalizeGoalDocumentContent(values.description),
        result: normalizeGoalDocumentContent(values.result),
        updated_at: saved.updated_at || new Date().toISOString(),
      };
      const dirty = getGoalContentSignature(form.getFieldsValue(true)) !== signature;
      goalDirtyRef.current = dirty;
      setGoalSaveState({ phase: dirty ? 'dirty' : 'saved', savedAt: saved.updated_at, error: '' });
      setEditing(prev => (prev ? { ...prev, ...saved } : prev));
      setGoals(prev => prev.map(item => (Number(item.id) === Number(saved.id) ? { ...item, ...saved } : item)));
      setGoalOptions(prev => prev.map(item => (Number(item.id) === Number(saved.id) ? { ...item, ...saved } : item)));
      setDetailRecord(prev => (Number(prev?.id) === Number(saved.id) ? { ...prev, ...saved } : prev));
      if (!silent) message.success('目标内容已保存');
      return true;
    } catch (error) {
      if (error?.response?.status === 409 && error.response?.data?.latest) {
        if (goalPendingSaveRef.current === savePromise) goalPendingSaveRef.current = null;
        const merged = applyRemoteGoalContent(error.response.data.latest, { mergeLocal: true });
        if (!merged.dirty) return true;
        if (retryOnConflict && merged.dirty) {
          return persistGoalContentRef.current?.({ silent, retryOnConflict: false }) || false;
        }
      }
      const errorText = error.response?.data?.error || error.message || '目标内容保存失败';
      setGoalSaveState(prev => ({ ...prev, phase: 'error', error: errorText }));
      if (!silent) message.error(errorText);
      return false;
    } finally {
      if (goalPendingSaveRef.current === savePromise) goalPendingSaveRef.current = null;
    }
  };

  persistGoalContentRef.current = persistGoalContent;

  const scheduleGoalContentAutoSave = () => {
    if (!editing?.id || !modalVisible) return;
    goalDirtyRef.current = true;
    setGoalSaveState(prev => ({ ...prev, phase: 'dirty', error: '' }));
    if (goalAutoSaveTimerRef.current) window.clearTimeout(goalAutoSaveTimerRef.current);
    goalAutoSaveTimerRef.current = window.setTimeout(() => {
      persistGoalContentRef.current?.({ silent: true }).catch(() => {});
    }, GOAL_CONTENT_AUTO_SAVE_DELAY);
  };

  const syncGoalFromRemote = useCallback(async () => {
    const goalId = editing?.id;
    const base = goalBaseSnapshotRef.current;
    if (!modalVisible || !goalId || !base?.updated_at || goalLiveSyncPendingRef.current || goalPendingSaveRef.current) return;
    goalLiveSyncPendingRef.current = true;
    try {
      const remote = await goalsApi.live(goalId, { since: base.updated_at });
      if (!remote?.has_changes) return;
      const merged = applyRemoteGoalContent(remote, { mergeLocal: true });
      setEditing(prev => (prev ? { ...prev, ...remote } : prev));
      setGoals(prev => prev.map(item => (Number(item.id) === Number(remote.id) ? { ...item, ...remote } : item)));
      if (merged.dirty) scheduleGoalContentAutoSave();
    } catch (error) {
      if (![403, 404].includes(error?.response?.status)) console.error(error);
    } finally {
      goalLiveSyncPendingRef.current = false;
    }
  }, [applyRemoteGoalContent, editing?.id, modalVisible]);

  useEffect(() => {
    if (!modalVisible || !editing?.id) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') syncGoalFromRemote();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [editing?.id, modalVisible, syncGoalFromRemote]);

  useEffect(() => {
    if (!remoteUpdateHint) return undefined;
    const timer = window.setTimeout(() => setRemoteUpdateHint(''), 5000);
    return () => window.clearTimeout(timer);
  }, [remoteUpdateHint]);

  const loadGoalHistory = async (goalId = editing?.id || detailRecord?.id) => {
    if (!goalId) return;
    setHistoryLoading(true);
    try {
      const result = await goalsApi.history(goalId);
      setHistoryCanRestore(Boolean(result?.can_restore));
      setHistoryRevisions(Array.isArray(result?.revisions) ? result.revisions : []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载历史版本失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openGoalHistory = async (goalId = editing?.id || detailRecord?.id) => {
    if (!goalId) return;
    setHistoryGoalId(Number(goalId));
    setHistoryOpen(true);
    await loadGoalHistory(goalId);
  };

  const restoreGoalHistory = async (revision) => {
    const goalId = historyGoalId;
    if (!goalId || !revision?.id) return;
    setRestoringRevisionId(revision.id);
    try {
      if (Number(editing?.id) === Number(goalId)) {
        if (goalAutoSaveTimerRef.current) window.clearTimeout(goalAutoSaveTimerRef.current);
        if (goalPendingSaveRef.current || goalDirtyRef.current) {
          const saved = await persistGoalContent({ silent: true });
          if (!saved) {
            message.error('当前目标内容保存失败，未执行历史恢复');
            return;
          }
        }
      }
      const restored = await goalsApi.restoreHistory(goalId, revision.id);
      if (Number(editing?.id) === Number(goalId)) {
        form.setFieldsValue(getGoalEditorValues(restored));
        setEditing(prev => ({ ...prev, ...restored }));
        goalBaseSnapshotRef.current = buildGoalContentSnapshot(restored);
        goalLastSavedSignatureRef.current = getGoalContentSignature(getGoalEditorValues(restored));
        goalDirtyRef.current = false;
        setGoalSaveState({ phase: 'saved', savedAt: restored.updated_at, error: '' });
      }
      if (Number(detailRecord?.id) === Number(goalId)) {
        const detail = await goalsApi.get(goalId);
        setDetailRecord(detail);
      }
      await Promise.all([refreshGoals(), loadGoalHistory(goalId)]);
      message.success('已恢复目标历史版本');
    } catch (error) {
      message.error(error.response?.data?.error || '恢复历史版本失败');
    } finally {
      setRestoringRevisionId(null);
    }
  };

  const submitGoalForm = async (retryOnConflict = true) => {
    try {
      if (goalAutoSaveTimerRef.current) window.clearTimeout(goalAutoSaveTimerRef.current);
      if (goalPendingSaveRef.current) await goalPendingSaveRef.current.catch(() => null);
      const values = await form.validateFields();
      let period = '';
      if (values.goal_type === 'quarter') {
        period = `${values.period_year}-${values.period_quarter}`;
      } else if (values.goal_type === 'month') {
        period = values.period_month?.format('YYYY-MM');
      } else if (values.goal_type === 'week') {
        const [start, end] = values.period_range || [];
        period = start && end ? `${start.format('YYYY-MM-DD')}~${end.format('YYYY-MM-DD')}` : '';
      }

      const payload = {
        title: values.title,
        description: serializeGoalDocumentContent(values.description),
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
        progress: values.progress || 0,
        status: values.status,
        result: serializeGoalDocumentContent(values.result),
        ...(!editing || canManageEditingGoal ? {
          owner_id: values.owner_id,
          project_group_id: values.project_group_id || null,
          department: values.department || undefined,
          team_id: values.team_id || null,
          scope_type: values.scope_type,
          goal_type: values.goal_type,
          period,
          parent_id: values.goal_type === 'quarter' ? null : values.parent_id,
        } : {}),
        ...(editing?.id && goalBaseSnapshotRef.current?.updated_at
          ? { base_updated_at: goalBaseSnapshotRef.current.updated_at }
          : {}),
        revision_action: 'manual_save',
      };

      if (editing) {
        const saved = await goalsApi.update(editing.id, payload);
        goalBaseSnapshotRef.current = buildGoalContentSnapshot(saved);
        goalLastSavedSignatureRef.current = getGoalContentSignature(getGoalEditorValues(saved));
        goalDirtyRef.current = false;
        message.success('更新成功');
      } else {
        await goalsApi.create(payload);
        message.success('创建成功');
      }

      setModalVisible(false);
      await refreshGoals();
    } catch (error) {
      if (error?.errorFields) return;
      if (editing?.id && error?.response?.status === 409 && error.response?.data?.latest) {
        applyRemoteGoalContent(error.response.data.latest, { mergeLocal: true });
        if (retryOnConflict) return submitGoalForm(false);
      }
      message.error(error?.response?.data?.error || (editing ? '更新失败' : '创建失败'));
    }
  };

  const handleSubmit = () => submitGoalForm(true);

  const closeGoalEditor = async () => {
    if (goalAutoSaveTimerRef.current) window.clearTimeout(goalAutoSaveTimerRef.current);
    if (editing?.id && goalDirtyRef.current) {
      const saved = await persistGoalContent({ silent: true });
      if (!saved) {
        message.error('目标内容尚未保存，请重试后再关闭');
        return;
      }
    }
    setModalVisible(false);
  };

  useEffect(() => () => {
    if (goalAutoSaveTimerRef.current) window.clearTimeout(goalAutoSaveTimerRef.current);
  }, []);

  const showDetail = async (record) => {
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const data = await goalsApi.get(record.id);
      setDetailRecord(data);
    } catch (error) {
      message.error(error?.response?.data?.error || '加载目标详情失败');
      setDetailVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value || undefined }));
  };

  const resetFilters = () => {
    setFilters({
      department: undefined,
      team_id: undefined,
      project_group_id: undefined,
      owner_id: user?.role === 'member' ? user.id : undefined,
      goal_type: undefined,
      scope_type: undefined,
      status: undefined,
      owner_role: undefined,
    });
  };

  const columns = [
    {
      title: '目标类型',
      dataIndex: 'goal_type',
      width: 110,
      render: (value) => (
        <Tag color={(goalTypeMap[value] || { color: 'default' }).color}>
          {(goalTypeMap[value] || { label: value }).label}
        </Tag>
      ),
    },
    {
      title: '周期',
      dataIndex: 'period',
      width: 170,
    },
    {
      title: '归属颗粒度',
      dataIndex: 'scope_type',
      width: 120,
      render: (value) => (
        <Tag color={(scopeTypeMap[value] || { color: 'default' }).color}>
          {(scopeTypeMap[value] || { label: value }).label}
        </Tag>
      ),
    },
    {
      title: '目标标题',
      dataIndex: 'title',
      width: 220,
    },
    {
      title: '目标描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (value) => goalDocumentContentToPlain(value) || '-',
    },
    {
      title: '项目组',
      dataIndex: 'project_group_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 120,
      render: (value, record) => value || getDisplayName(record),
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 120,
      render: (value) => getDepartmentLabel(value),
    },
    {
      title: '小组',
      dataIndex: 'team_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 160,
      render: (value) => <Progress percent={Number(value || 0)} size="small" />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value) => (
        <Tag color={(statusMap[value] || { color: 'default' }).color}>
          {(statusMap[value] || { label: value }).label}
        </Tag>
      ),
    },
    {
      title: '结果',
      dataIndex: 'result',
      ellipsis: true,
      render: (value) => goalDocumentContentToPlain(value) || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>
            详情
          </Button>
          {Number(record.can_edit) > 0 && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
          )}
          {Number(record.can_share) > 0 && (
            <Button type="link" size="small" icon={<UserAddOutlined />} onClick={() => openGoalShare(record)}>
              共享
            </Button>
          )}
          {Number(record.can_delete) > 0 && (
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];
  const { columns: resizableColumns, scrollX } = useResizableColumns('goals-table-columns', columns, {
    defaultWidth: 160,
    minWidths: { title: 180, description: 180, result: 160, actions: 140 },
  });

  const renderGoalCard = (record) => (
    <Card
      key={record.id}
      size="small"
      hoverable
      bodyStyle={{ padding: 14 }}
      onClick={() => showDetail(record)}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Space wrap size={[6, 6]}>
          <Tag color={(goalTypeMap[record.goal_type] || { color: 'default' }).color}>
            {(goalTypeMap[record.goal_type] || { label: record.goal_type }).label}
          </Tag>
          <Tag color={(scopeTypeMap[record.scope_type] || { color: 'default' }).color}>
            {(scopeTypeMap[record.scope_type] || { label: record.scope_type }).label}
          </Tag>
          <Tag color={(statusMap[record.status] || { color: 'default' }).color}>
            {(statusMap[record.status] || { label: record.status }).label}
          </Tag>
        </Space>

        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 4, overflowWrap: 'anywhere' }}>{record.title}</div>
          <Typography.Text type="secondary">{record.period || '-'}</Typography.Text>
        </div>

        <Typography.Text type="secondary">
          {record.owner_name || getDisplayName(record)} · {getDepartmentLabel(record.department)}
        </Typography.Text>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary">项目组：{record.project_group_name || '-'}</Typography.Text>
          <Typography.Text type="secondary">小组：{record.team_name || '-'}</Typography.Text>
        </div>

        <Progress percent={Number(record.progress || 0)} size="small" />

        <Typography.Paragraph
          style={{ marginBottom: 0 }}
          type={goalDocumentContentToPlain(record.description) ? undefined : 'secondary'}
          ellipsis={{ rows: 2, expandable: false }}
        >
          {goalDocumentContentToPlain(record.description) || '暂无目标描述'}
        </Typography.Paragraph>

        <Space size="small" wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Button
            type={isMobile ? 'default' : 'link'}
            size="small"
            icon={<EyeOutlined />}
            style={{ width: isMobile ? '100%' : undefined }}
            onClick={(event) => {
              event.stopPropagation();
              showDetail(record);
            }}
          >
            详情
          </Button>
          {Number(record.can_edit) > 0 && (
            <Button
              type={isMobile ? 'default' : 'link'}
              size="small"
              icon={<EditOutlined />}
              style={{ width: isMobile ? '100%' : undefined }}
              onClick={(event) => {
                event.stopPropagation();
                handleEdit(record);
              }}
            >
              编辑
            </Button>
          )}
          {Number(record.can_share) > 0 && (
            <Button
              type={isMobile ? 'default' : 'link'}
              size="small"
              icon={<UserAddOutlined />}
              style={{ width: isMobile ? '100%' : undefined }}
              onClick={(event) => {
                event.stopPropagation();
                openGoalShare(record);
              }}
            >
              共享
            </Button>
          )}
          {Number(record.can_delete) > 0 && (
            <Button
              type={isMobile ? 'default' : 'link'}
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ width: isMobile ? '100%' : undefined }}
              onClick={(event) => {
                event.stopPropagation();
                handleDelete(record);
              }}
            >
              删除
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  );

  const activeFilterCount = Object.values(filters).filter(value => value !== undefined && value !== null && value !== '').length;
  const filterControls = (
    <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} size={[12, 12]} style={{ marginBottom: isMobile ? 0 : 16, width: isMobile ? '100%' : undefined }}>
      <Select allowClear placeholder="部门" style={{ width: isMobile ? '100%' : 160 }} value={filters.department} onChange={(value) => handleFilterChange('department', value)} options={departmentOptions} />
      <Select allowClear placeholder="项目组" style={{ width: isMobile ? '100%' : 160 }} value={filters.project_group_id} onChange={(value) => handleFilterChange('project_group_id', value)} options={projectGroups.map(group => ({ value: group.id, label: group.name }))} />
      <Select allowClear placeholder="小组" style={{ width: isMobile ? '100%' : 160 }} value={filters.team_id} onChange={(value) => handleFilterChange('team_id', value)} options={teams.map(team => ({ value: team.id, label: team.name }))} />
      <Select allowClear showSearch optionFilterProp="label" placeholder="负责人姓名" style={{ width: isMobile ? '100%' : 180 }} value={filters.owner_id} onChange={(value) => handleFilterChange('owner_id', value)} options={ownerOptions} />
      <Select allowClear placeholder="目标类型" style={{ width: isMobile ? '100%' : 140 }} value={filters.goal_type} onChange={(value) => handleFilterChange('goal_type', value)} options={goalTypeOptions} />
      <Select allowClear placeholder="归属颗粒度" style={{ width: isMobile ? '100%' : 160 }} value={filters.scope_type} onChange={(value) => handleFilterChange('scope_type', value)} options={scopeTypeOptions} />
      <Select allowClear placeholder="状态" style={{ width: isMobile ? '100%' : 140 }} value={filters.status} onChange={(value) => handleFilterChange('status', value)} options={statusOptions} />
      <Select allowClear placeholder="负责人角色" style={{ width: isMobile ? '100%' : 160 }} value={filters.owner_role} onChange={(value) => handleFilterChange('owner_role', value)} options={ownerRoleOptions} />
      <Button onClick={resetFilters} style={{ width: isMobile ? '100%' : undefined }}>重置筛选</Button>
    </Space>
  );
  const goalSaveMeta = {
    idle: { color: 'default', text: '尚未保存' },
    dirty: { color: 'default', text: '待自动保存' },
    saving: { color: 'processing', text: '自动保存中' },
    saved: { color: 'success', text: '已保存' },
    error: { color: 'error', text: '自动保存失败' },
  }[goalSaveState.phase] || { color: 'default', text: '尚未保存' };

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <Card
        title="目标管理"
        extra={!isMobile && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建目标
          </Button>
        )}
      >
        {isMobile && (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} style={{ width: '100%' }}>
              新建目标
            </Button>
            <Button icon={<FilterOutlined />} onClick={() => setFilterDrawerVisible(true)} style={{ width: '100%' }}>
              筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </Space>
        )}
        {!isMobile && filterControls}
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {isMobile ? '点击卡片可查看详情' : '双击目标行可查看详情'}
        </Typography.Text>

        {isMobile ? (
          <List
            loading={loading}
            dataSource={goals}
            locale={{ emptyText: '暂无目标数据' }}
            pagination={{ defaultPageSize: 10, showSizeChanger: false, simple: isMobile }}
            renderItem={(record) => (
              <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
                {renderGoalCard(record)}
              </List.Item>
            )}
          />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            columns={resizableColumns}
            dataSource={goals}
            components={resizableTableComponents}
            pagination={{ defaultPageSize: 10, showSizeChanger: true }}
            scroll={{ x: scrollX }}
            tableLayout="fixed"
            onRow={(record) => ({
              onDoubleClick: () => showDetail(record),
            })}
          />
        )}
      </Card>

      <Drawer
        title="筛选目标"
        placement="right"
        width="100%"
        open={filterDrawerVisible}
        onClose={() => setFilterDrawerVisible(false)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={() => setFilterDrawerVisible(false)}>完成</Button>
          </Space>
        }
      >
        {filterControls}
      </Drawer>

      <Modal
        title={(
          <Space size={8} wrap>
            <span>{editing ? '编辑目标' : '新建目标'}</span>
            {editing && <Tag color={goalSaveMeta.color}>{goalSaveMeta.text}</Tag>}
            {editing && (
              <Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => openGoalHistory()}>
                历史
              </Button>
            )}
          </Space>
        )}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={closeGoalEditor}
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
        destroyOnClose
      >
        {remoteUpdateHint && (
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {remoteUpdateHint}
          </Typography.Text>
        )}
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changedValues) => {
            if (Object.prototype.hasOwnProperty.call(changedValues, 'goal_type')) {
              form.setFieldsValue({
                parent_id: undefined,
                period_year: undefined,
                period_quarter: undefined,
                period_month: undefined,
                period_range: undefined,
              });
            }
            if (Object.prototype.hasOwnProperty.call(changedValues, 'scope_type')) {
              form.setFieldsValue({
                project_group_id: undefined,
                department: undefined,
                team_id: undefined,
              });
            }
            if (Object.prototype.hasOwnProperty.call(changedValues, 'owner_id')) {
              const selectedUser = users.find(item => item.id === changedValues.owner_id);
              if (!form.getFieldValue('department')) {
                form.setFieldValue('department', selectedUser?.department || undefined);
              }
            }
            if (['title', 'description', 'result'].some(field => Object.prototype.hasOwnProperty.call(changedValues, field))) {
              scheduleGoalContentAutoSave();
            }
          }}
        >
          <Form.Item name="goal_type" label="目标类型" rules={[{ required: true, message: '请选择目标类型' }]}>
            <Select options={goalTypeOptions} disabled={!!editing} />
          </Form.Item>

          <Form.Item name="scope_type" label="归属颗粒度" rules={[{ required: true, message: '请选择归属颗粒度' }]}>
            <Select options={scopeTypeOptions} disabled={!!editing && !canManageEditingGoal} />
          </Form.Item>

          {goalType === 'quarter' && (
            <Space style={{ width: '100%', flexDirection: isMobile ? 'column' : 'row' }} size={12}>
              <Form.Item name="period_year" label="年份" rules={[{ required: true, message: '请选择年份' }]} style={{ flex: 1 }}>
                <Select
                  disabled={!!editing && !canManageEditingGoal}
                  options={Array.from({ length: 7 }, (_, index) => {
                    const year = dayjs().year() - 2 + index;
                    return { value: year, label: `${year}年` };
                  })}
                />
              </Form.Item>
              <Form.Item name="period_quarter" label="季度" rules={[{ required: true, message: '请选择季度' }]} style={{ flex: 1 }}>
                <Select
                  disabled={!!editing && !canManageEditingGoal}
                  options={[
                    { value: 'Q1', label: 'Q1' },
                    { value: 'Q2', label: 'Q2' },
                    { value: 'Q3', label: 'Q3' },
                    { value: 'Q4', label: 'Q4' },
                  ]}
                />
              </Form.Item>
            </Space>
          )}

          {goalType === 'month' && (
            <>
              <Form.Item
                name="parent_id"
                label="关联季度目标"
              >
                <Select
                  allowClear
                  disabled={!!editing && !canManageEditingGoal}
                  showSearch
                  optionFilterProp="label"
                  options={getParentOptions()}
                  placeholder="请选择关联季度目标"
                />
              </Form.Item>
              <Form.Item name="period_month" label="周期" rules={[{ required: true, message: '请选择月份' }]}>
                <DatePicker picker="month" style={{ width: '100%' }} disabled={!!editing && !canManageEditingGoal} />
              </Form.Item>
            </>
          )}

          {goalType === 'week' && (
            <>
              <Form.Item
                name="parent_id"
                label="关联月度目标"
              >
                <Select
                  allowClear
                  disabled={!!editing && !canManageEditingGoal}
                  showSearch
                  optionFilterProp="label"
                  options={getParentOptions()}
                  placeholder="请选择关联月度目标"
                />
              </Form.Item>
              <Form.Item name="period_range" label="周期" rules={[{ required: true, message: '请选择日期范围' }]}>
                <RangePicker style={{ width: '100%' }} disabled={!!editing && !canManageEditingGoal} />
              </Form.Item>
            </>
          )}

          <Form.Item name="title" label="目标标题" rules={[{ required: true, message: '请输入目标标题' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="description" label="目标描述" valuePropName="value" trigger="onChange">
            <DocumentBodyEditor
              placeholder="请输入目标描述..."
              minHeight={180}
              onSave={() => persistGoalContent({ silent: false })}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 8px 14px' }}
            />
          </Form.Item>

          <Form.Item name="owner_id" label="负责人" rules={[{ required: true, message: '请选择负责人' }]}>
            <Select
              showSearch
              disabled={!!editing && !canManageEditingGoal}
              optionFilterProp="label"
              options={ownerOptions}
              placeholder="请选择负责人"
            />
          </Form.Item>

          <Form.Item
            name="project_group_id"
            label="项目组"
            rules={scopeType !== undefined ? [{ required: ['project_group', 'department', 'team', 'personal'].includes(scopeType), message: '请选择项目组' }] : []}
          >
            <Select
              allowClear
              disabled={!!editing && !canManageEditingGoal}
              showSearch
              optionFilterProp="label"
              options={projectGroups.map(group => ({ value: group.id, label: group.name }))}
              placeholder="请选择项目组"
            />
          </Form.Item>

          <Form.Item
            name="department"
            label="部门"
            rules={scopeType !== undefined ? [{ required: ['department', 'team', 'personal'].includes(scopeType), message: '请选择部门' }] : []}
          >
            <Select
              allowClear
              disabled={!!editing && !canManageEditingGoal}
              options={departmentOptions}
              placeholder="请选择部门"
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.department !== currentValues.department || prevValues.scope_type !== currentValues.scope_type}
          >
            {({ getFieldValue }) => {
              const selectedDepartment = getFieldValue('department');
              const filteredTeams = selectedDepartment ? teams.filter(team => team.department === selectedDepartment) : teams;
              return (
                <Form.Item
                  name="team_id"
                  label="小组"
                  rules={scopeType !== undefined ? [{ required: ['team', 'personal'].includes(scopeType), message: '请选择小组' }] : []}
                >
                  <Select
                    allowClear
                    disabled={!selectedDepartment || (!!editing && !canManageEditingGoal)}
                    showSearch
                    optionFilterProp="label"
                    options={filteredTeams.map(team => ({ value: team.id, label: team.name }))}
                    placeholder={selectedDepartment ? '请选择小组' : '请先选择部门'}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item name="deadline" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="progress" label="进度" initialValue={0}>
            <InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="status" label="状态" initialValue="pending" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={statusOptions} />
          </Form.Item>

          <Form.Item name="result" label="目标结果" valuePropName="value" trigger="onChange">
            <DocumentBodyEditor
              placeholder="填写目标完成得怎么样..."
              minHeight={180}
              onSave={() => persistGoalContent({ silent: false })}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 8px 14px' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`共享目标${shareTarget?.title ? ` · ${shareTarget.title}` : ''}`}
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={saveGoalShares}
        okText="保存"
        cancelText="取消"
        confirmLoading={shareSaving}
        okButtonProps={{ disabled: shareLoading }}
        width={isMobile ? '100%' : 560}
        destroyOnClose
      >
        <ContentShareEditor
          draft={shareDraft}
          onChange={setShareDraft}
          loading={shareLoading}
          users={users}
          defaultUsers={defaultShareUsers}
          projectGroups={projectGroups}
          departments={ORGANIZATION_DEPARTMENT_OPTIONS}
          teams={teams}
        />
      </Modal>

      <Drawer
        title="目标详情"
        placement="right"
        width={isMobile ? '100%' : 760}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 56px)', overflowY: 'auto' } } : undefined}
        extra={detailRecord ? (
          <Space size={8}>
            <Button size="small" icon={<HistoryOutlined />} onClick={() => openGoalHistory(detailRecord.id)}>
              历史
            </Button>
            {Number(detailRecord.can_share) > 0 && (
              <Button size="small" icon={<UserAddOutlined />} onClick={() => openGoalShare(detailRecord)}>
                共享
              </Button>
            )}
            {Number(detailRecord.can_edit) > 0 && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setDetailVisible(false);
                  handleEdit(detailRecord);
                }}
              >
                编辑目标
              </Button>
            )}
          </Space>
        ) : null}
      >
        {detailLoading && <div style={{ textAlign: 'center', padding: 32 }}>加载中...</div>}
        {!detailLoading && detailRecord && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Space wrap size={[8, 8]}>
                  <Tag color={(goalTypeMap[detailRecord.goal_type] || { color: 'default' }).color}>
                    {(goalTypeMap[detailRecord.goal_type] || { label: detailRecord.goal_type }).label}
                  </Tag>
                  <Tag color={(scopeTypeMap[detailRecord.scope_type] || { color: 'default' }).color}>
                    {(scopeTypeMap[detailRecord.scope_type] || { label: detailRecord.scope_type }).label}
                  </Tag>
                  <Tag color={(statusMap[detailRecord.status] || { color: 'default' }).color}>
                    {(statusMap[detailRecord.status] || { label: detailRecord.status }).label}
                  </Tag>
                </Space>

                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {detailRecord.title}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {detailRecord.period || '-'}
                  </Typography.Text>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <Typography.Text type="secondary">
                      负责人：{detailRecord.owner_name || '-'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      上级目标：{detailRecord.parent_title || '-'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      截止日期：{detailRecord.deadline || '-'}
                    </Typography.Text>
                  </div>
                  <Progress percent={Number(detailRecord.progress || 0)} />
                </div>
              </Space>
            </Card>

            <Descriptions column={isMobile ? 1 : 2} bordered size="small">
              <Descriptions.Item label="负责人">{detailRecord.owner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="负责人角色">{getRoleLabel(detailRecord.owner_role)}</Descriptions.Item>
              <Descriptions.Item label="项目组">{detailRecord.project_group_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="部门">{getDepartmentLabel(detailRecord.department)}</Descriptions.Item>
              <Descriptions.Item label="小组">{detailRecord.team_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="上级目标">{detailRecord.parent_title || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailRecord.created_at}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailRecord.updated_at}</Descriptions.Item>
            </Descriptions>

            <Card title="目标描述" size="small">
              <DocumentBodyEditor value={normalizeGoalDocumentContent(detailRecord.description)} readOnly minHeight={60} />
            </Card>

            <Card title="目标结果" size="small">
              <DocumentBodyEditor value={normalizeGoalDocumentContent(detailRecord.result)} readOnly minHeight={60} />
            </Card>

            <Card title={`下级目标（${detailRecord.children?.length || 0}）`} size="small">
              {detailRecord.children?.length ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {detailRecord.children.map((child, index) => (
                    <div
                      key={child.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: 16,
                        paddingBottom: index === detailRecord.children.length - 1 ? 0 : 12,
                        borderBottom: index === detailRecord.children.length - 1 ? 'none' : '1px solid #f0f0f0',
                      }}
                    >
                      <Space direction="vertical" size={6} style={{ flex: 1 }}>
                        <Space wrap size={[6, 6]}>
                          <Tag color={(goalTypeMap[child.goal_type] || { color: 'default' }).color}>
                            {(goalTypeMap[child.goal_type] || { label: child.goal_type }).label}
                          </Tag>
                          <Tag color={(statusMap[child.status] || { color: 'default' }).color}>
                            {(statusMap[child.status] || { label: child.status }).label}
                          </Tag>
                        </Space>
                        <Button
                          type="link"
                          style={{ padding: 0, height: 'auto', textAlign: 'left' }}
                          onClick={() => showDetail(child)}
                        >
                          {child.period} · {child.title}
                        </Button>
                        <Typography.Text type="secondary">
                          {child.owner_name || '-'} · {getDepartmentLabel(child.department)}
                        </Typography.Text>
                      </Space>

                      <div style={{ minWidth: isMobile ? 0 : 120, width: isMobile ? '100%' : undefined }}>
                        <Progress percent={Number(child.progress || 0)} size="small" />
                      </div>
                    </div>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂无下级目标</Typography.Text>
              )}
            </Card>
          </Space>
        )}
      </Drawer>

      <ContentHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="目标历史版本"
        revisions={historyRevisions}
        loading={historyLoading}
        restoringId={restoringRevisionId}
        canRestore={historyCanRestore}
        onRestore={restoreGoalHistory}
        width={isMobile ? '100%' : 460}
      />
    </div>
  );
}

export default Goals;
