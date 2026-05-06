import React, { useState, useEffect, useRef } from 'react';
import { Table, Card, Select, Space, Button, Tag, Grid, List, Typography, Watermark, Row, Col, Statistic, Alert, Drawer, Descriptions, Switch, Popconfirm, Empty, Segmented, message } from 'antd';
import { ReloadOutlined, RadarChartOutlined, SettingOutlined, CheckOutlined, StopOutlined, UndoOutlined, UserAddOutlined, DownloadOutlined, LineChartOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { Line } from '@ant-design/plots';
import axios from 'axios';

const { Option } = Select;

const EVENT_TYPE_MAP = {
  new: { label: '新出现', color: 'green' },
  gone: { label: '已消失', color: 'red' },
  status_change: { label: '状态变化', color: 'orange' }
};

const HANDLE_STATUS_MAP = {
  new: { label: '未处理', color: 'blue' },
  viewed: { label: '已查看', color: 'default' },
  followed: { label: '已跟进', color: 'green' },
  ignored: { label: '已忽略', color: 'default' }
};

export default function RecruitRadar() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [targets, setTargets] = useState([]);
  const [positions, setPositions] = useState([]);
  const [filterCompany, setFilterCompany] = useState(searchParams.get('company') || '');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterType, setFilterType] = useState(searchParams.get('type') || '');
  const [filterHandle, setFilterHandle] = useState('');
  const [showIgnored, setShowIgnored] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grouped'
  const [groups, setGroups] = useState([]);
  const [stats, setStats] = useState(null);
  const [runningJob, setRunningJob] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [related, setRelated] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [overlap, setOverlap] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [trendOpen, setTrendOpen] = useState(false);
  const [trendDays, setTrendDays] = useState(30);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchTargets();
    fetchPositions();
    fetchStats();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (viewMode === 'grouped') fetchGrouped();
    else fetchEvents();
  }, [filterCompany, filterPosition, filterType, filterHandle, showIgnored, page, viewMode]);

  const fetchTargets = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/targets');
      setTargets(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchPositions = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/positions');
      setPositions(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/stats');
      setStats(res.data);
      if (res.data.runningJob) {
        setRunningJob(res.data.runningJob);
        startPolling(res.data.runningJob.id);
      }
    } catch (err) { console.error(err); }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 50 };
      if (filterCompany) params.boss_company_id = filterCompany;
      if (filterPosition) params.position_id = filterPosition;
      if (filterType) params.event_type = filterType;
      if (filterHandle) params.handle_status = filterHandle;
      if (showIgnored) params.include_ignored = 1;
      const res = await axios.get('/api/boss-watcher/events', { params });
      setEvents(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGrouped = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCompany) params.boss_company_id = filterCompany;
      if (filterPosition) params.position_id = filterPosition;
      if (filterType) params.event_type = filterType;
      if (filterHandle) params.handle_status = filterHandle;
      if (showIgnored) params.include_ignored = 1;
      const res = await axios.get('/api/boss-watcher/events/grouped', { params });
      setGroups(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
    setRelated([]);
    setOverlap([]);
    if ((record.handle_status || 'new') === 'new') {
      try {
        await axios.patch(`/api/boss-watcher/events/${record.id}/status`, { handle_status: 'viewed' });
        setEvents(prev => prev.map(e => e.id === record.id ? { ...e, handle_status: 'viewed' } : e));
      } catch {}
    }
    setRelatedLoading(true);
    try {
      const [relRes, ovRes] = await Promise.all([
        axios.get(`/api/boss-watcher/events/${record.id}/related`),
        axios.get(`/api/boss-watcher/events/${record.id}/overlap`)
      ]);
      setRelated(relRes.data.events || []);
      setOverlap(ovRes.data.matches || []);
    } catch (err) { console.error(err); }
    finally { setRelatedLoading(false); }
  };

  const updateHandleStatus = async (record, handle_status) => {
    try {
      await axios.patch(`/api/boss-watcher/events/${record.id}/status`, { handle_status });
      setEvents(prev => prev.map(e => e.id === record.id ? { ...e, handle_status } : e));
      if (detailRecord?.id === record.id) {
        setDetailRecord({ ...detailRecord, handle_status });
      }
      message.success('已更新');
    } catch (err) {
      message.error(err.response?.data?.error || '更新失败');
    }
  };

  const handleImport = async (record) => {
    try {
      const res = await axios.post(`/api/boss-watcher/events/${record.id}/import-to-persons`);
      const personId = res.data.person_id;
      setEvents(prev => prev.map(e => e.id === record.id ? { ...e, person_id: personId, handle_status: 'followed' } : e));
      if (detailRecord?.id === record.id) {
        setDetailRecord({ ...detailRecord, person_id: personId, handle_status: 'followed' });
      }
      message.success(`已加入人才库 #${personId}`);
    } catch (err) {
      if (err.response?.status === 409) {
        message.warning(`已在人才库 #${err.response.data.person_id}`);
      } else {
        message.error(err.response?.data?.error || '入库失败');
      }
    }
  };

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/api/boss-watcher/jobs/${jobId}`);
        const job = res.data;
        setRunningJob(job);
        if (job.status !== 'running') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRunningJob(null);
          if (job.status === 'success') {
            message.success(`抓取完成：命中 ${job.matched_count} 人，新增 ${job.event_count} 条事件`);
          } else if (job.status === 'skipped') {
            message.warning(`抓取已跳过：${job.error || '未知原因'}`);
          } else {
            message.error(`抓取失败：${job.error || '未知错误'}`);
          }
          fetchEvents();
          fetchStats();
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
  };

  const handleTrigger = async () => {
    try {
      const res = await axios.post('/api/boss-watcher/trigger');
      if (res.data.alreadyRunning) {
        message.info('已有抓取任务在进行中');
      } else {
        message.success('抓取任务已启动');
      }
      const jobRes = await axios.get(`/api/boss-watcher/jobs/${res.data.jobId}`);
      setRunningJob(jobRes.data);
      startPolling(res.data.jobId);
    } catch (err) {
      message.error(err.response?.data?.error || '触发失败');
    }
  };

  const fetchTrend = async (days = trendDays) => {
    try {
      const params = { days };
      if (filterCompany) params.boss_company_id = filterCompany;
      const res = await axios.get('/api/boss-watcher/stats/trend', { params });
      setTrendData(res.data.data || []);
    } catch (err) { console.error(err); }
  };

  const openTrend = () => {
    setTrendOpen(true);
    fetchTrend(trendDays);
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filterCompany) params.set('boss_company_id', filterCompany);
      if (filterPosition) params.set('position_id', filterPosition);
      if (filterType) params.set('event_type', filterType);
      if (filterHandle) params.set('handle_status', filterHandle);
      if (showIgnored) params.set('include_ignored', '1');
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/boss-watcher/events/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '导出失败');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = m ? decodeURIComponent(m[1]) : `招聘雷达_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      message.success('导出完成');
    } catch (err) {
      message.error(err.message || '导出失败');
    }
  };

  const eventTypeTag = (type) => {
    const cfg = EVENT_TYPE_MAP[type] || { label: type, color: 'default' };
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  };

  const renderStatusCell = (record) => {
    if (record.event_type !== 'status_change') return record.candidate_status || '-';
    try {
      const detail = JSON.parse(record.detail_json || '{}');
      return (
        <Typography.Text style={{ fontSize: 12 }}>
          {detail.prev_status || '-'} <span style={{ color: '#999' }}>→</span> {detail.new_status || '-'}
        </Typography.Text>
      );
    } catch {
      return record.candidate_status || '-';
    }
  };

  const handleStatusTag = (record) => {
    const cfg = HANDLE_STATUS_MAP[record.handle_status || 'new'] || HANDLE_STATUS_MAP.new;
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  };

  const renderActions = (record) => {
    const status = record.handle_status || 'new';
    const stop = (e) => e.stopPropagation();
    if (status === 'ignored') {
      return (
        <Button type="link" size="small" icon={<UndoOutlined />} onClick={(e) => { stop(e); updateHandleStatus(record, 'new'); }}>恢复</Button>
      );
    }
    return (
      <Space size={0} onClick={stop}>
        {status !== 'followed' && (
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => updateHandleStatus(record, 'followed')}>跟进</Button>
        )}
        <Popconfirm title="忽略此事件？" onConfirm={() => updateHandleStatus(record, 'ignored')} onCancel={stop}>
          <Button type="link" size="small" danger icon={<StopOutlined />} onClick={stop}>忽略</Button>
        </Popconfirm>
      </Space>
    );
  };

  const groupColumns = [
    { title: '候选人', key: 'name', width: 140, render: (_, g) => (
      <Space size={4}>
        <strong>{g.latest.candidate_name}</strong>
        {g.latest.person_id && <Tag color="success" style={{ marginInlineEnd: 0 }}>已入库</Tag>}
      </Space>
    ) },
    { title: '最新职位', key: 'title', width: 160, ellipsis: true, render: (_, g) => g.latest.candidate_title },
    { title: '公司', key: 'company', width: 130, render: (_, g) => g.latest.company_name },
    { title: '城市', key: 'city', width: 80, render: (_, g) => g.latest.candidate_city },
    { title: '事件总数', key: 'total', width: 90, render: (_, g) => g.total },
    { title: '类型分布', key: 'counts', width: 200, render: (_, g) => (
      <Space size={4} wrap>
        {g.counts.new > 0 && <Tag color="green">新 {g.counts.new}</Tag>}
        {g.counts.status_change > 0 && <Tag color="orange">变 {g.counts.status_change}</Tag>}
        {g.counts.gone > 0 && <Tag color="red">走 {g.counts.gone}</Tag>}
      </Space>
    ) },
    { title: '最新动态', key: 'latest', width: 160, render: (_, g) => (
      <Space direction="vertical" size={0}>
        {eventTypeTag(g.latest.event_type)}
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>{g.latest.created_at}</Typography.Text>
      </Space>
    ) }
  ];

  const columns = [
    { title: '类型', dataIndex: 'event_type', key: 'event_type', width: 100, render: eventTypeTag },
    { title: '候选人', dataIndex: 'candidate_name', key: 'candidate_name', width: 120,
      render: (val, r) => (
        <Space size={4}>
          {r.alert_hit ? <Tag color="red" style={{ marginInlineEnd: 0 }}>⚠️</Tag> : null}
          <span>{val}</span>
          {r.person_id && <Tag color="success" style={{ marginInlineEnd: 0 }}>已入库</Tag>}
        </Space>
      )
    },
    { title: '职位', dataIndex: 'candidate_title', key: 'candidate_title', width: 150, ellipsis: true },
    { title: '公司', dataIndex: 'company_name', key: 'company_name', width: 120 },
    { title: '城市', dataIndex: 'candidate_city', key: 'candidate_city', width: 80 },
    { title: '活跃状态', key: 'candidate_status', width: 160, render: (_, r) => renderStatusCell(r) },
    { title: '关联岗位', dataIndex: 'position_title', key: 'position_title', width: 150, ellipsis: true },
    { title: '处理', key: 'handle_status', width: 90, render: (_, r) => handleStatusTag(r) },
    { title: '操作', key: 'action', width: 130, render: (_, r) => renderActions(r) },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160 }
  ];

  const renderEventCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }} onClick={() => openDetail(record)}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={4}>{eventTypeTag(record.event_type)}{handleStatusTag(record)}</Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.created_at}</Typography.Text>
          </div>
          <Typography.Text strong>{record.candidate_name}</Typography.Text>
          <Typography.Text>{record.candidate_title} · {record.candidate_city}</Typography.Text>
          <Typography.Text type="secondary">公司: {record.company_name}</Typography.Text>
          <Typography.Text type="secondary">关联岗位: {record.position_title}</Typography.Text>
          <div>活跃: {renderStatusCell(record)}</div>
          <div>{renderActions(record)}</div>
        </Space>
      </Card>
    </List.Item>
  );

  const filters = (
    <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined, marginBottom: isMobile ? 16 : 0 }}>
      <Select
        placeholder="筛选公司" style={{ width: isMobile ? '100%' : 180 }} allowClear
        value={filterCompany || undefined}
        onChange={(val) => { setFilterCompany(val || ''); setPage(1); }}
      >
        {targets.map(t => <Option key={t.boss_company_id} value={t.boss_company_id}>{t.company_name}</Option>)}
      </Select>
      <Select
        placeholder="筛选岗位" style={{ width: isMobile ? '100%' : 180 }} allowClear
        value={filterPosition || undefined}
        onChange={(val) => { setFilterPosition(val || ''); setPage(1); }}
      >
        {positions.map(p => <Option key={p.boss_position_id} value={p.boss_position_id}>{p.title}</Option>)}
      </Select>
      <Select
        placeholder="筛选类型" style={{ width: isMobile ? '100%' : 140 }} allowClear
        value={filterType || undefined}
        onChange={(val) => { setFilterType(val || ''); setPage(1); }}
      >
        {Object.entries(EVENT_TYPE_MAP).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
      </Select>
      <Select
        placeholder="处理状态" style={{ width: isMobile ? '100%' : 140 }} allowClear
        value={filterHandle || undefined}
        onChange={(val) => { setFilterHandle(val || ''); setPage(1); }}
      >
        {Object.entries(HANDLE_STATUS_MAP).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
      </Select>
      <Space size={4}>
        <Switch size="small" checked={showIgnored} onChange={(v) => { setShowIgnored(v); setPage(1); }} />
        <Typography.Text style={{ fontSize: 12 }}>显示已忽略</Typography.Text>
      </Space>
      <Segmented
        size="small"
        value={viewMode}
        onChange={(v) => { setViewMode(v); setPage(1); }}
        options={[
          { label: '明细', value: 'list' },
          { label: '按人合并', value: 'grouped' }
        ]}
      />
      <Button icon={<RadarChartOutlined />} loading={!!runningJob} onClick={handleTrigger}>
        {runningJob ? '抓取中...' : '手动抓取'}
      </Button>
      <Button icon={<DownloadOutlined />} onClick={handleExport}>导出 CSV</Button>
      <Button icon={<LineChartOutlined />} onClick={openTrend}>趋势</Button>
      <Button icon={<ReloadOutlined />} onClick={() => { fetchEvents(); fetchStats(); }}>刷新</Button>
      <Link to="/executive/recruit-radar/config">
        <Button icon={<SettingOutlined />}>配置</Button>
      </Link>
    </Space>
  );

  const latest = stats?.latestJob;
  const statusText = (() => {
    if (!latest) return '暂无记录';
    if (latest.status === 'success') return '成功';
    if (latest.status === 'failed') return `失败(${latest.error || '未知'})`;
    if (latest.status === 'skipped') return `跳过(${latest.error || '已跳过'})`;
    return '进行中';
  })();
  const lastRunText = latest ? `${latest.finished_at || latest.started_at} · ${statusText}` : '暂无记录';

  return (
    <Watermark content="仅限内部参考">
      <div style={{ padding: isMobile ? 0 : 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {runningJob && (
            <Alert
              type="info"
              showIcon
              message={`抓取进行中：${runningJob.progress || '启动中'}`}
              description={`任务 #${runningJob.id} 于 ${runningJob.started_at} 开始`}
            />
          )}

          <Card size="small">
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}><Statistic title="监控公司" value={stats?.targetCount ?? 0} /></Col>
              <Col xs={12} md={6}><Statistic title="在抓岗位" value={stats?.positionCount ?? 0} /></Col>
              <Col xs={12} md={6}><Statistic title="今日事件" value={stats?.todayEvents ?? 0} /></Col>
              <Col xs={12} md={6}><Statistic title="累计事件" value={stats?.totalEvents ?? 0} /></Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  上次抓取：{lastRunText}
                  {latest && ` · 总 ${latest.total_count || 0} / 命中 ${latest.matched_count || 0} / 事件 ${latest.event_count || 0}`}
                </Typography.Text>
              </Col>
            </Row>
          </Card>

          <Card extra={!isMobile && filters}>
            {isMobile && filters}
            {viewMode === 'grouped' ? (
              <Table
                dataSource={groups}
                columns={groupColumns}
                rowKey={(g) => g.geek_id || `_${g.latest.id}`}
                loading={loading}
                onRow={(g) => ({ onClick: () => openDetail(g.latest), style: { cursor: 'pointer' } })}
                pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 人` }}
                scroll={isMobile ? { x: 800 } : undefined}
              />
            ) : isMobile ? (
              <List
                dataSource={events}
                rowKey="id"
                loading={loading}
                pagination={{ current: page, total, pageSize: 50, onChange: setPage, showSizeChanger: false }}
                renderItem={renderEventCard}
              />
            ) : (
              <Table
                dataSource={events}
                columns={columns}
                rowKey="id"
                loading={loading}
                onRow={(record) => ({ onClick: () => openDetail(record), style: { cursor: 'pointer' } })}
                pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
              />
            )}
          </Card>
        </Space>

        <Drawer
          title="事件详情"
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          width={isMobile ? '100%' : 560}
          extra={detailRecord && (
            <Space>
              {detailRecord.person_id ? (
                <Link to={`/persons?highlight=${detailRecord.person_id}`}>
                  <Tag color="success" icon={<UserAddOutlined />}>已入库 #{detailRecord.person_id}</Tag>
                </Link>
              ) : (
                <Button type="primary" size="small" icon={<UserAddOutlined />} onClick={() => handleImport(detailRecord)}>
                  加入人才库
                </Button>
              )}
              {renderActions(detailRecord)}
            </Space>
          )}
        >
          {detailRecord && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="类型">{eventTypeTag(detailRecord.event_type)}</Descriptions.Item>
                {detailRecord.alert_hit ? (
                  <Descriptions.Item label="关键词命中">
                    <Space size={4} wrap>
                      {(detailRecord.alert_keywords || '').split(',').filter(Boolean).map(k => (
                        <Tag key={k} color="red">⚠️ {k}</Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                ) : null}
                <Descriptions.Item label="处理状态">
                  {handleStatusTag(detailRecord)}
                  {detailRecord.handled_by_name && (
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      by {detailRecord.handled_by_name} · {detailRecord.handled_at}
                    </Typography.Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="候选人">{detailRecord.candidate_name}</Descriptions.Item>
                <Descriptions.Item label="职位">{detailRecord.candidate_title}</Descriptions.Item>
                <Descriptions.Item label="公司">{detailRecord.company_name}</Descriptions.Item>
                <Descriptions.Item label="城市">{detailRecord.candidate_city}</Descriptions.Item>
                <Descriptions.Item label="活跃状态">{renderStatusCell(detailRecord)}</Descriptions.Item>
                <Descriptions.Item label="关联岗位">{detailRecord.position_title}</Descriptions.Item>
                <Descriptions.Item label="抓取时间">{detailRecord.created_at}</Descriptions.Item>
                <Descriptions.Item label="原始数据">
                  <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {(() => { try { return JSON.stringify(JSON.parse(detailRecord.detail_json || '{}'), null, 2); } catch { return detailRecord.detail_json; } })()}
                  </pre>
                </Descriptions.Item>
              </Descriptions>

              {overlap.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`此候选人姓名与人才库中 ${overlap.length} 条记录同名`}
                  description={
                    <List
                      size="small"
                      dataSource={overlap}
                      renderItem={p => (
                        <List.Item style={{ padding: '4px 0' }}>
                          <Space size={6} wrap>
                            <Link to={`/persons?highlight=${p.id}`}>#{p.id} {p.name}</Link>
                            {p.current_company && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{p.current_company}</Typography.Text>}
                            {p.current_position && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{p.current_position}</Typography.Text>}
                            {p.weight && <Tag>{p.weight}</Tag>}
                          </Space>
                        </List.Item>
                      )}
                    />
                  }
                />
              )}

              <Card size="small" title={`同候选人历史事件 (${related.length})`} loading={relatedLoading}>
                {related.length === 0 && !relatedLoading ? <Empty description="暂无更多记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <List
                    size="small"
                    dataSource={related}
                    renderItem={item => (
                      <List.Item>
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Space size={6}>
                            {eventTypeTag(item.event_type)}
                            <Typography.Text style={{ fontSize: 12 }}>{item.created_at}</Typography.Text>
                            {item.id === detailRecord.id && <Tag color="blue">当前</Tag>}
                          </Space>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {item.position_title} · {item.candidate_status || '-'}
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Space>
          )}
        </Drawer>

        <Drawer
          title="事件趋势"
          open={trendOpen}
          onClose={() => setTrendOpen(false)}
          width={isMobile ? '100%' : 720}
          extra={
            <Space>
              <Select
                size="small"
                value={trendDays}
                onChange={(v) => { setTrendDays(v); fetchTrend(v); }}
                options={[7, 14, 30, 60, 90].map(d => ({ value: d, label: `近 ${d} 天` }))}
                style={{ width: 110 }}
              />
            </Space>
          }
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {filterCompany && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                已应用公司过滤：{targets.find(t => t.boss_company_id === filterCompany)?.company_name || filterCompany}
              </Typography.Text>
            )}
            <div style={{ height: 360 }}>
              <Line
                data={trendData}
                xField="day"
                yField="count"
                seriesField="type"
                smooth
                point={{ size: 3 }}
                color={['#52c41a', '#fa8c16', '#f5222d']}
                xAxis={{ tickCount: 8 }}
                legend={{ position: 'top' }}
                tooltip={{ shared: true }}
              />
            </div>
          </Space>
        </Drawer>
      </div>
    </Watermark>
  );
}
