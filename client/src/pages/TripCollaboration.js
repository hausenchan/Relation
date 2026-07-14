import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Grid,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CalendarOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { tripCollaborationApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const periods = ['上午', '中午', '下午', '晚上'];
const listCollapsedStorageKey = 'relation.tripCollaborationListCollapsed.v1';
const getUserDepartments = (user = {}) => [...new Set([
  user?.department,
  ...(Array.isArray(user?.departments) ? user.departments : []),
].filter(Boolean))];

const roleCanViewTripCollaboration = (user) => {
  const executiveRoles = new Set(['ceo', 'coo', 'cto', 'cmo']);
  return getUserDepartments(user).includes('commercial')
    || user?.role === 'sales_director'
    || user?.role === 'admin'
    || executiveRoles.has(user?.role)
    || executiveRoles.has(user?.executive_role);
};

function getStoredListCollapsed() {
  try {
    return localStorage.getItem(listCollapsedStorageKey) === '1';
  } catch {
    return false;
  }
}

function formatDate(date) {
  return date ? dayjs(date).format('YYYY-MM-DD') : undefined;
}

function getTripDays(trip) {
  if (!trip?.start_date || !trip?.end_date) return [];
  const days = [];
  let cursor = dayjs(trip.start_date);
  const end = dayjs(trip.end_date);
  while (cursor.isValid() && end.isValid() && !cursor.isAfter(end, 'day')) {
    days.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return days;
}

function employeeLabel(user) {
  return user?.display_name || user?.username || '-';
}

function buildAmapWebUrl(address) {
  const query = encodeURIComponent(address || '');
  return `https://ditu.amap.com/search?query=${query}&src=team-board&callnative=0&innersrc=uriapi`;
}

function buildAmapAppUrl(address) {
  const query = encodeURIComponent(address || '');
  return `amapuri://poi/search?query=${query}&sourceApplication=Relation`;
}

export default function TripCollaboration() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [scheduleTripId, setScheduleTripId] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(getStoredListCollapsed);
  const [keyword, setKeyword] = useState('');
  const [startFilter, setStartFilter] = useState(null);
  const [endFilter, setEndFilter] = useState(null);
  const [personFilter, setPersonFilter] = useState(undefined);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [tripForm] = Form.useForm();
  const [scheduleForm] = Form.useForm();

  const isListCollapsed = !isMobile && listCollapsed;
  const selectedTrip = useMemo(
    () => trips.find(item => Number(item.id) === Number(selectedTripId)) || null,
    [trips, selectedTripId]
  );
  const scheduleTrip = useMemo(
    () => trips.find(item => Number(item.id) === Number(scheduleTripId)) || selectedTrip,
    [trips, scheduleTripId, selectedTrip]
  );
  const tripDays = useMemo(() => getTripDays(selectedTrip), [selectedTrip]);
  const userOptions = useMemo(
    () => users.map(item => ({
      value: item.id,
      label: employeeLabel(item),
      department: item.department,
    })),
    [users]
  );
  const commercialUserOptions = useMemo(
    () => users.map(item => ({
      label: `${employeeLabel(item)}${item.department ? ` · ${item.department}` : ''}`,
      value: item.id,
    })),
    [users]
  );

  const schedulesBySlot = useMemo(() => {
    const map = new Map();
    schedules.forEach(schedule => {
      const key = `${schedule.schedule_date}|${schedule.period}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(schedule);
    });
    map.forEach(items => items.sort((a, b) => String(a.time_text || '').localeCompare(String(b.time_text || ''), 'zh-CN')));
    return map;
  }, [schedules]);

  useEffect(() => {
    try {
      localStorage.setItem(listCollapsedStorageKey, listCollapsed ? '1' : '0');
    } catch {
      // Keep in-memory state if localStorage is unavailable.
    }
  }, [listCollapsed]);

  const loadUsers = useCallback(async () => {
    const data = await usersApi.listSimple({ include_readonly: true });
    setUsers(data);
  }, []);

  const loadTrips = useCallback(async (preferredTripId) => {
    setTripLoading(true);
    setNoAccess(false);
    try {
      const params = {
        name: keyword || undefined,
        start_date_from: formatDate(startFilter),
        end_date_to: formatDate(endFilter),
        person_id: personFilter || undefined,
      };
      const data = await tripCollaborationApi.listTrips(params);
      setTrips(data);
      setSelectedTripId(prev => {
        const candidate = preferredTripId || prev;
        if (candidate && data.some(item => Number(item.id) === Number(candidate))) return Number(candidate);
        return data[0]?.id || null;
      });
    } catch (err) {
      if (err.response?.status === 403) setNoAccess(true);
      message.error(err.response?.data?.error || '加载行程失败');
    } finally {
      setTripLoading(false);
    }
  }, [endFilter, keyword, personFilter, startFilter]);

  const loadSchedules = useCallback(async () => {
    if (!selectedTripId) {
      setSchedules([]);
      return;
    }
    setScheduleLoading(true);
    try {
      const data = await tripCollaborationApi.listSchedules(selectedTripId, {
        person_id: personFilter || undefined,
      });
      setSchedules(data);
    } catch (err) {
      message.error(err.response?.data?.error || '加载日程失败');
    } finally {
      setScheduleLoading(false);
    }
  }, [personFilter, selectedTripId]);

  useEffect(() => {
    loadUsers().catch(() => message.error('加载员工列表失败'));
  }, [loadUsers]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const openTripModal = (trip = null) => {
    setEditingTrip(trip);
    tripForm.setFieldsValue({
      name: trip?.name || '',
      start_date: trip?.start_date ? dayjs(trip.start_date) : null,
      end_date: trip?.end_date ? dayjs(trip.end_date) : null,
    });
    setTripModalOpen(true);
  };

  const openScheduleModal = (schedule = null, defaults = {}, targetTrip = selectedTrip) => {
    if (!targetTrip) {
      message.warning('请先选择行程');
      return;
    }
    setScheduleTripId(targetTrip.id);
    setEditingSchedule(schedule);
    scheduleForm.setFieldsValue({
      schedule_date: schedule?.schedule_date
        ? dayjs(schedule.schedule_date)
        : dayjs(defaults.schedule_date || targetTrip.start_date),
      period: schedule?.period || defaults.period || '上午',
      time_text: schedule?.time_text || '',
      name: schedule?.name || '',
      map_address: schedule?.map_address || '',
      participant_ids: schedule?.participant_ids || (personFilter ? [personFilter] : []),
    });
    setScheduleModalOpen(true);
  };

  const saveTrip = async () => {
    const values = await tripForm.validateFields();
    const payload = {
      name: values.name,
      start_date: values.start_date.format('YYYY-MM-DD'),
      end_date: values.end_date.format('YYYY-MM-DD'),
    };
    if (payload.start_date > payload.end_date) {
      message.error('开始日期不能晚于结束日期');
      return;
    }
    setSaving(true);
    try {
      if (editingTrip) {
        await tripCollaborationApi.updateTrip(editingTrip.id, payload);
        message.success('行程已保存');
        await loadTrips(editingTrip.id);
      } else {
        const result = await tripCollaborationApi.createTrip(payload);
        message.success('行程已新增');
        await loadTrips(result.id);
      }
      setTripModalOpen(false);
    } catch (err) {
      message.error(err.response?.data?.error || '保存行程失败');
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async () => {
    const values = await scheduleForm.validateFields();
    const targetTripId = scheduleTrip?.id;
    if (!targetTripId) return;
    const payload = {
      schedule_date: values.schedule_date.format('YYYY-MM-DD'),
      period: values.period,
      time_text: values.time_text,
      name: values.name,
      map_address: values.map_address,
      participant_ids: values.participant_ids || [],
    };
    setSaving(true);
    try {
      if (editingSchedule) {
        await tripCollaborationApi.updateSchedule(editingSchedule.id, payload);
        message.success('日程已保存');
      } else {
        await tripCollaborationApi.createSchedule(targetTripId, payload);
        message.success('日程已新增');
      }
      setScheduleModalOpen(false);
      if (Number(targetTripId) !== Number(selectedTripId)) setSelectedTripId(targetTripId);
      await loadTrips(targetTripId);
      const refreshedSchedules = await tripCollaborationApi.listSchedules(targetTripId, {
        person_id: personFilter || undefined,
      });
      setSchedules(refreshedSchedules);
    } catch (err) {
      message.error(err.response?.data?.error || '保存日程失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteTrip = async (trip) => {
    try {
      await tripCollaborationApi.deleteTrip(trip.id);
      message.success('行程已删除');
      await loadTrips();
    } catch (err) {
      message.error(err.response?.data?.error || '删除行程失败');
    }
  };

  const deleteSchedule = async (schedule) => {
    try {
      await tripCollaborationApi.deleteSchedule(schedule.id);
      message.success('日程已删除');
      await loadTrips(selectedTripId);
      await loadSchedules();
    } catch (err) {
      message.error(err.response?.data?.error || '删除日程失败');
    }
  };

  const openMap = (schedule) => {
    const mapAddress = String(schedule.map_address || '').trim();
    if (!mapAddress) {
      message.warning('该日程未填写地图地址');
      return;
    }
    const webUrl = buildAmapWebUrl(mapAddress);
    const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (!isPhone) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.href = buildAmapAppUrl(mapAddress);
    window.setTimeout(() => {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }, 900);
  };

  const resetFilters = () => {
    setKeyword('');
    setStartFilter(null);
    setEndFilter(null);
    setPersonFilter(undefined);
  };

  const renderTripItem = (trip) => {
    const active = Number(trip.id) === Number(selectedTripId);
    const participantNames = trip.participant_names || [];
    return (
      <List.Item
        key={trip.id}
        onClick={() => setSelectedTripId(trip.id)}
        style={{
          cursor: 'pointer',
          padding: isMobile ? '10px 10px' : '8px 9px',
          borderRadius: 7,
          background: active ? '#eef2ff' : 'transparent',
          border: active ? '1px solid #c7d2fe' : '1px solid transparent',
          marginBottom: 5,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong ellipsis title={trip.name} style={{ maxWidth: isMobile ? 'calc(100vw - 96px)' : 210 }}>
                {trip.name}
              </Text>
              <div style={{ marginTop: 5, color: '#6b7280', fontSize: 12 }}>
                <CalendarOutlined /> {trip.start_date} 至 {trip.end_date}
              </div>
            </div>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>{trip.schedule_count || 0} 个日程</Tag>
          </div>

          <Space size={[4, 4]} wrap style={{ marginTop: 8 }}>
            {participantNames.length ? participantNames.slice(0, 4).map(name => (
              <Tag key={name} color="cyan" style={{ marginInlineEnd: 0 }}>{name}</Tag>
            )) : <Tag style={{ marginInlineEnd: 0 }}>暂无人员</Tag>}
            {participantNames.length > 4 && <Tag style={{ marginInlineEnd: 0 }}>+{participantNames.length - 4}</Tag>}
          </Space>

          <Space size={6} wrap style={{ marginTop: 9 }}>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<PlusOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedTripId(trip.id);
                openScheduleModal(null, {}, trip);
              }}
            >
              新建日程
            </Button>
            {trip.can_edit && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  openTripModal(trip);
                }}
              >
                编辑
              </Button>
            )}
            {trip.can_delete && (
              <Popconfirm title="确认删除该行程？" onConfirm={() => deleteTrip(trip)} okText="删除" cancelText="取消">
                <Button size="small" danger icon={<DeleteOutlined />} onClick={event => event.stopPropagation()}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      </List.Item>
    );
  };

  const renderScheduleCard = (schedule) => {
    const hasMapAddress = Boolean(String(schedule.map_address || '').trim());
    return (
      <div
        key={schedule.id}
        style={{
          position: 'relative',
          border: '1px solid #cfe5ff',
          borderRadius: 8,
          background: 'linear-gradient(135deg, #ffffff 0%, #f3f9ff 100%)',
          padding: '9px 10px 10px',
          minHeight: 112,
          boxShadow: '0 4px 12px rgba(22, 119, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        {schedule.can_delete && (
          <Popconfirm title="确认删除该日程？" onConfirm={() => deleteSchedule(schedule)} okText="删除" cancelText="取消">
            <Button
              size="small"
              shape="circle"
              icon={<CloseOutlined />}
              title="删除日程"
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                width: 22,
                height: 22,
                minWidth: 22,
              }}
            />
          </Popconfirm>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            paddingLeft: schedule.can_delete ? 28 : 0,
          }}
        >
          <div style={{ flex: '1 1 116px', minWidth: 0 }}>
            <div style={{ color: '#1677ff', fontSize: 12, fontWeight: 700, lineHeight: '22px' }}>
              {schedule.time_text}
            </div>
            <div
              title={schedule.name}
              style={{
                marginTop: 6,
                lineHeight: 1.45,
                fontSize: 14,
                fontWeight: 700,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              {schedule.name}
            </div>
          </div>
          <div
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '2px 8px',
              flexWrap: 'wrap',
              maxWidth: '100%',
            }}
          >
            {hasMapAddress && (
              <Button size="small" type="link" icon={<EnvironmentOutlined />} onClick={() => openMap(schedule)} style={{ padding: 0, height: 22 }}>
                查看地图
              </Button>
            )}
            {schedule.can_edit && (
              <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openScheduleModal(schedule, {}, selectedTrip)} style={{ padding: 0, height: 22 }}>
                编辑
              </Button>
            )}
          </div>
        </div>
        <Space size={[4, 4]} wrap style={{ marginTop: 10, maxWidth: '100%' }}>
          {(schedule.participant_names || []).map(name => (
            <Tag key={name} color="cyan" style={{ marginInlineEnd: 0, maxWidth: '100%', whiteSpace: 'normal' }}>{name}</Tag>
          ))}
        </Space>
      </div>
    );
  };

  const renderScheduleGrid = () => {
    if (!selectedTrip) {
      return (
        <div style={{ padding: 48 }}>
          <Empty description="请选择或新增一个行程" />
        </div>
      );
    }

    const minDayWidth = isMobile ? 168 : 190;
    const timeColWidth = isMobile ? 72 : 92;
    return (
      <Spin spinning={scheduleLoading}>
        <div style={{ overflow: 'auto', maxHeight: isMobile ? 'none' : 'calc(100vh - 236px)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${timeColWidth}px repeat(${tripDays.length}, minmax(${minDayWidth}px, 1fr))`,
              minWidth: timeColWidth + tripDays.length * minDayWidth,
            }}
          >
            <div style={{ minHeight: 76, borderRight: '1px solid #edf0f5', borderBottom: '1px solid #edf0f5', background: '#fff' }} />
            {tripDays.map(day => (
              <div
                key={day}
                style={{
                  minHeight: 76,
                  padding: '14px 16px',
                  borderRight: '1px solid #edf0f5',
                  borderBottom: '1px solid #edf0f5',
                  background: '#fff',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700 }}>{dayjs(day).format('M月D日')}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(day).format('ddd')}</Text>
              </div>
            ))}

            {periods.map(period => (
              <React.Fragment key={period}>
                <div
                  style={{
                    minHeight: 152,
                    padding: '16px 12px',
                    borderRight: '1px solid #edf0f5',
                    borderBottom: '1px solid #edf0f5',
                    background: '#fff',
                    fontWeight: 700,
                  }}
                >
                  {period}
                </div>
                {tripDays.map(day => {
                  const items = schedulesBySlot.get(`${day}|${period}`) || [];
                  return (
                    <div
                      key={`${day}-${period}`}
                      style={{
                        position: 'relative',
                        minHeight: 152,
                        padding: '44px 14px 14px',
                        borderRight: '1px solid #edf0f5',
                        borderBottom: '1px solid #edf0f5',
                        background: '#fbfdff',
                      }}
                    >
                      <Tooltip title="添加日程">
                        <Button
                          size="small"
                          shape="circle"
                          type="primary"
                          ghost
                          icon={<PlusOutlined />}
                          aria-label="添加日程"
                          onClick={() => openScheduleModal(null, { schedule_date: day, period }, selectedTrip)}
                          style={{ position: 'absolute', top: 12, right: 12 }}
                        />
                      </Tooltip>
                      {items.length ? (
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          {items.map(renderScheduleCard)}
                        </Space>
                      ) : (
                        <Text type="secondary">暂无安排</Text>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </Spin>
    );
  };

  if (!roleCanViewTripCollaboration(user) || noAccess) {
    return (
      <Alert
        type="warning"
        showIcon
        message="无权访问出差协同"
        description="该模块默认仅商务部门、管理员和 CEO / COO / CTO / CMO 可见。"
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: isMobile ? 0 : 16,
        height: isMobile ? 'auto' : 'calc(100vh - 120px)',
        minHeight: isMobile ? 'calc(100vh - 80px)' : 640,
        overflow: isMobile ? 'visible' : 'hidden',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      <aside
        style={{
          width: isMobile ? '100%' : (isListCollapsed ? 32 : 360),
          minWidth: isMobile ? '100%' : (isListCollapsed ? 32 : 340),
          borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
          paddingRight: isMobile ? 0 : (isListCollapsed ? 0 : 16),
          marginBottom: isMobile ? 16 : 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease, padding 0.2s ease',
        }}
      >
        <div style={{ flex: '0 0 auto', background: '#fff', paddingBottom: isListCollapsed ? 0 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Space size={8} align="center" style={{ minWidth: 0 }}>
              {!isMobile && (
                <Tooltip title={isListCollapsed ? '展开行程列表' : '收起行程列表'}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={isListCollapsed ? '展开行程列表' : '收起行程列表'}
                    aria-expanded={!isListCollapsed}
                    icon={isListCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => setListCollapsed(prev => !prev)}
                    style={{ width: 32, height: 32, color: '#6b7280' }}
                  />
                </Tooltip>
              )}
              {!isListCollapsed && <Title level={4} style={{ margin: 0 }}>出差协同</Title>}
            </Space>
            {!isListCollapsed && (
              <Space size={6}>
                <Tooltip title="刷新">
                  <Button icon={<ReloadOutlined />} onClick={() => { loadTrips(selectedTripId); loadSchedules(); }} />
                </Tooltip>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openTripModal()}>新增</Button>
              </Space>
            )}
          </div>
        </div>

        {!isListCollapsed && (
          <div style={{ flex: 1, minHeight: 0, overflowY: isMobile ? 'visible' : 'auto' }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input.Search
                allowClear
                placeholder="搜索行程名称"
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
              />
              <DatePicker
                allowClear
                placeholder="开始时间不早于"
                value={startFilter}
                onChange={setStartFilter}
                style={{ width: '100%' }}
              />
              <DatePicker
                allowClear
                placeholder="结束时间不晚于"
                value={endFilter}
                onChange={setEndFilter}
                style={{ width: '100%' }}
              />
              <Select
                allowClear
                showSearch
                placeholder="按人员筛选"
                optionFilterProp="label"
                value={personFilter}
                options={userOptions}
                onChange={setPersonFilter}
                style={{ width: '100%' }}
              />
              <Space size={8} wrap>
                <Button size="small" onClick={resetFilters}>清空筛选</Button>
                <Text type="secondary" style={{ fontSize: 12 }}>共 {trips.length} 个行程</Text>
              </Space>
              <Spin spinning={tripLoading}>
                <List
                  dataSource={trips}
                  renderItem={renderTripItem}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无行程" /> }}
                />
              </Spin>
            </Space>
          </div>
        )}
      </aside>

      <section style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            paddingBottom: 12,
            borderBottom: '1px solid #edf0f5',
            marginBottom: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Space size={8} wrap>
              <Title level={4} style={{ margin: 0 }}>{selectedTrip?.name || '请选择行程'}</Title>
              {selectedTrip && <Tag color="blue">{selectedTrip.start_date} 至 {selectedTrip.end_date}</Tag>}
            </Space>
            <div style={{ marginTop: 6 }}>
              <Text type="secondary">
                {selectedTrip ? `${tripDays.length} 天 · ${schedules.length} 个当前筛选日程` : '左侧选择行程后查看日程安排'}
              </Text>
            </div>
          </div>
          <Space size={8} wrap>
            <Select
              allowClear
              showSearch
              placeholder="只看人员"
              optionFilterProp="label"
              value={personFilter}
              options={userOptions}
              onChange={setPersonFilter}
              style={{ width: isMobile ? '100%' : 180 }}
            />
            {selectedTrip && selectedTrip.can_edit && (
              <Button icon={<EditOutlined />} onClick={() => openTripModal(selectedTrip)}>编辑行程</Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} disabled={!selectedTrip} onClick={() => openScheduleModal()}>
              新建日程
            </Button>
          </Space>
        </div>
        {renderScheduleGrid()}
      </section>

      <Modal
        title={editingTrip ? '编辑行程' : '新增行程'}
        open={tripModalOpen}
        onCancel={() => setTripModalOpen(false)}
        onOk={() => tripForm.submit()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 560}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={tripForm} layout="vertical" onFinish={saveTrip} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="行程名称" rules={[{ required: true, message: '请输入行程名称' }]}>
            <Input placeholder="如：北京华北渠道拜访" />
          </Form.Item>
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_date" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingSchedule ? '编辑日程' : '新建日程'}
        open={scheduleModalOpen}
        onCancel={() => setScheduleModalOpen(false)}
        onOk={() => scheduleForm.submit()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 820}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={scheduleForm} layout="vertical" onFinish={saveSchedule} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="schedule_date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => {
                  if (!current || !scheduleTrip) return false;
                  return current.isBefore(dayjs(scheduleTrip.start_date), 'day')
                    || current.isAfter(dayjs(scheduleTrip.end_date), 'day');
                }}
              />
            </Form.Item>
            <Form.Item name="period" label="时段" rules={[{ required: true, message: '请选择时段' }]}>
              <Select options={periods.map(item => ({ value: item, label: item }))} />
            </Form.Item>
            <Form.Item name="time_text" label="时间" rules={[{ required: true, message: '请输入时间' }]}>
              <Input placeholder="如：10:00 或 10:15-13:15" />
            </Form.Item>
            <Form.Item name="name" label="日程名称" rules={[{ required: true, message: '请输入日程名称' }]}>
              <Input placeholder="如：客户拜访" />
            </Form.Item>
          </div>
          <Form.Item name="map_address" label="地图地址">
            <TextArea rows={3} placeholder="如：北京市朝阳区天辰东路 1 号院亚洲金融大厦 C 座" />
          </Form.Item>
          <Form.Item
            name="participant_ids"
            label={<Space><TeamOutlined />参与人员</Space>}
            rules={[{ required: true, message: '请选择参与人员' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="按系统员工选择参与人员"
              options={commercialUserOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
