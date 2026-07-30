import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  DatePicker,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  List,
  Modal,
  Progress,
  Select,
  Skeleton,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  TreeSelect,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RestOutlined,
  SaveOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { businessDailyReportsApi } from '../api';
import { useAuth } from '../AuthContext';
import { formatBusinessDateTime } from '../utils/businessTime';
import '../styles/businessPage.css';
import './BusinessDailyReports.css';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const ACTIVE_STATUSES = new Set([
  'queued',
  'collecting',
  'validating_source',
  'normalizing',
  'reconciling',
  'analyzing',
  'rendering',
]);

const STATUS_META = {
  queued: { label: '排队中', status: 'default' },
  collecting: { label: '采集中', status: 'processing' },
  validating_source: { label: '校验来源', status: 'processing' },
  normalizing: { label: '清洗中', status: 'processing' },
  reconciling: { label: '对账中', status: 'processing' },
  analyzing: { label: '分析中', status: 'processing' },
  rendering: { label: '生成报告', status: 'processing' },
  completed: { label: '已完成', status: 'success' },
  partial: { label: '部分完成', status: 'warning' },
  failed: { label: '失败', status: 'error' },
};

const STAGE_STATUS_META = {
  pending: { status: 'wait', label: '待执行' },
  running: { status: 'process', label: '执行中' },
  completed: { status: 'finish', label: '已完成' },
  failed: { status: 'error', label: '失败' },
  skipped: { status: 'wait', label: '已跳过' },
};

const REVISION_STATUS_META = {
  machine: { color: 'default', label: '机器原稿' },
  draft: { color: 'blue', label: '草稿' },
  submitted: { color: 'gold', label: '待审核' },
  approved: { color: 'green', label: '已采用' },
  rejected: { color: 'default', label: '已退回' },
};

const NARRATIVE_FIELDS = [
  { name: 'summary', label: '执行摘要', rows: 4 },
  { name: 'judgment', label: '经营判断', rows: 4 },
  { name: 'causes', label: '原因与证据', rows: 5 },
  { name: 'risks', label: '风险与数据限制', rows: 4 },
  { name: 'strategies', label: '增长策略', rows: 6 },
  { name: 'actions', label: '行动项', rows: 6 },
  { name: 'notes', label: '人工备注', rows: 3 },
];

const DEFAULT_REPORT_SCOPE = {
  key: 'project:YYZ',
  scope_type: 'project',
  scope_code: 'YYZ',
  scope_name: 'YYZ项目总览',
  path_labels: ['YYZ项目组', '项目总览'],
  selectable: true,
};

function flattenReportScopes(nodes = []) {
  return nodes.flatMap(node => [
    ...(node.selectable ? [node] : []),
    ...flattenReportScopes(node.children || []),
  ]);
}

function scopeTreeIcon(node) {
  if (!node.selectable) return <ApartmentOutlined />;
  if (node.scope_type === 'media') return <TeamOutlined />;
  return <FileTextOutlined />;
}

function buildScopeTreeData(nodes = []) {
  return nodes.map(node => ({
    key: node.key,
    value: node.key,
    selectable: node.selectable !== false,
    disabled: node.selectable === false,
    scope: node.selectable ? node : null,
    title: (
      <span className={node.selectable ? 'daily-report-scope-title' : 'daily-report-scope-group-title'}>
        {scopeTreeIcon(node)}
        <span>{node.scope_name}</span>
      </span>
    ),
    children: buildScopeTreeData(node.children || []),
  }));
}

function scopeQuery(scope) {
  const params = new URLSearchParams();
  params.set('scope_type', scope?.scope_type || 'project');
  params.set('scope_code', scope?.scope_code || 'YYZ');
  return params.toString();
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function formatReportDate(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : String(value).slice(0, 10);
}

function reportStatusBadge(status) {
  const current = STATUS_META[status] || { label: status || '未知', status: 'default' };
  return <Badge status={current.status} text={current.label} />;
}

function revisionStatusTag(status) {
  const current = REVISION_STATUS_META[status] || { color: 'default', label: status || '未知' };
  return <Tag color={current.color}>{current.label}</Tag>;
}

function qualityTag(status) {
  const meta = {
    pending: { color: 'default', label: '待校验' },
    passed: { color: 'green', label: '通过' },
    warning: { color: 'gold', label: '有缺口' },
    blocked: { color: 'red', label: '已阻断' },
  }[status] || { color: 'default', label: status || '待校验' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function secureHtmlDocument(html) {
  const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const source = String(html || '');
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, match => `${match}${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${source}</body></html>`;
}

function secureInteractiveHtmlDocument(html) {
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const source = String(html || '');
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, match => `${match}${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${source}</body></html>`;
}

function ReportHtmlFrame({ reportId, machine = false, revisionId = null }) {
  const [state, setState] = useState({ loading: true, html: '', error: '' });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, html: '', error: '' });
    businessDailyReportsApi.html(reportId, {
      machine: machine ? 1 : undefined,
      revision_id: revisionId || undefined,
    }).then(html => {
      if (alive) setState({ loading: false, html: secureHtmlDocument(html), error: '' });
    }).catch(error => {
      if (alive) setState({ loading: false, html: '', error: getErrorMessage(error, '日报正文加载失败') });
    });
    return () => { alive = false; };
  }, [machine, reportId, revisionId]);

  if (state.loading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (state.error) return <Empty description={state.error} />;
  return (
    <iframe
      className="daily-report-frame"
      title={machine ? '业务日报机器原稿' : '业务日报'}
      sandbox=""
      srcDoc={state.html}
    />
  );
}

function ArtifactHtmlFrame({ reportId, artifactType, title }) {
  const [state, setState] = useState({ loading: true, html: '', error: '' });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, html: '', error: '' });
    businessDailyReportsApi.artifactText(reportId, artifactType).then(html => {
      if (alive) setState({ loading: false, html: secureInteractiveHtmlDocument(html), error: '' });
    }).catch(error => {
      if (alive) setState({ loading: false, html: '', error: getErrorMessage(error, '日报产物加载失败') });
    });
    return () => { alive = false; };
  }, [artifactType, reportId]);

  if (state.loading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (state.error) return <Empty description={state.error} />;
  return (
    <iframe
      className="daily-report-frame daily-report-frame-interactive"
      title={title}
      sandbox="allow-scripts"
      srcDoc={state.html}
    />
  );
}

function DeleteReportModal({ report, open, onCancel, onDeleted }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await businessDailyReportsApi.delete(report.id, values);
      message.success('日报已移入回收站');
      onDeleted?.();
    } catch (error) {
      if (!error?.errorFields) message.error(getErrorMessage(error, '删除日报失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="删除业务日报"
      open={open}
      okText="删除"
      okButtonProps={{ danger: true, loading: saving }}
      onOk={submit}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="删除原因"
          rules={[{ required: true, message: '请填写删除原因' }]}
        >
          <TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RuntimeAlert({ runtime }) {
  if (!runtime || runtime.available) return null;
  const first = runtime.blockers?.[0];
  if (!first) return null;
  return (
    <Alert
      className="daily-report-runtime-alert"
      type="warning"
      showIcon
      message={first.message}
      description={(runtime.blockers || []).slice(1).map(item => item.message).join('；') || undefined}
    />
  );
}

function BusinessDailyReportList() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const showScopeSidebar = Boolean(screens.lg);
  const { user, canWrite } = useAuth();
  const writable = canWrite?.();
  const canManage = Boolean(
    ['admin', 'ceo', 'coo', 'cto', 'cmo'].includes(user?.role)
    || ['ceo', 'coo', 'cto', 'cmo'].includes(user?.executive_role)
    || user?.sensitiveModules?.some(item => (
      item?.module_key === 'business_daily_report' && item?.permission_level === 'manage'
    )),
  );
  const [state, setState] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [runtime, setRuntime] = useState(null);
  const [scopeCatalog, setScopeCatalog] = useState([]);
  const [selectedScope, setSelectedScope] = useState(DEFAULT_REPORT_SCOPE);
  const [generating, setGenerating] = useState(false);
  const [reportDate, setReportDate] = useState(dayjs().subtract(1, 'day'));
  const [filters, setFilters] = useState({ status: '', report_date: '', deleted: false });
  const [deleteReport, setDeleteReport] = useState(null);

  const scopeTreeData = useMemo(() => buildScopeTreeData(scopeCatalog), [scopeCatalog]);
  const selectableScopes = useMemo(() => flattenReportScopes(scopeCatalog), [scopeCatalog]);

  const load = useCallback(async ({ page = 1, pageSize = 20, quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const data = await businessDailyReportsApi.list({
        page,
        page_size: pageSize,
        status: filters.status || undefined,
        report_date: filters.report_date || undefined,
        deleted: filters.deleted ? 1 : undefined,
        scope_type: selectedScope.scope_type,
        scope_code: selectedScope.scope_code,
      });
      setState({ items: data.items || [], total: data.total || 0, page: data.page || page, pageSize: data.page_size || pageSize });
    } catch (error) {
      message.error(getErrorMessage(error, '加载业务日报失败'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [filters.deleted, filters.report_date, filters.status, selectedScope.scope_code, selectedScope.scope_type]);

  useEffect(() => { load({ page: 1 }); }, [filters, load]);
  useEffect(() => {
    businessDailyReportsApi.scopes().then(data => {
      setScopeCatalog(data.items || []);
    }).catch(error => {
      message.error(getErrorMessage(error, '加载日报分析范围失败'));
      setScopeCatalog([DEFAULT_REPORT_SCOPE]);
    });
  }, []);
  useEffect(() => {
    setRuntime(null);
    businessDailyReportsApi.runtimeStatus({
      scope_type: selectedScope.scope_type,
      scope_code: selectedScope.scope_code,
    }).then(setRuntime).catch(() => setRuntime(null));
  }, [selectedScope.scope_code, selectedScope.scope_type]);
  useEffect(() => {
    if (!selectableScopes.length) return;
    const params = new URLSearchParams(location.search);
    const requestedType = params.get('scope_type') || 'project';
    const requestedCode = params.get('scope_code') || 'YYZ';
    const nextScope = selectableScopes.find(scope => (
      scope.scope_type === requestedType && scope.scope_code === requestedCode
    )) || selectableScopes[0] || DEFAULT_REPORT_SCOPE;
    if (nextScope.key !== selectedScope.key) setSelectedScope(nextScope);
  }, [location.search, selectableScopes, selectedScope.key]);
  useEffect(() => {
    if (!state.items.some(item => ACTIVE_STATUSES.has(item.status))) return undefined;
    const timer = window.setInterval(() => load({
      page: state.page,
      pageSize: state.pageSize,
      quiet: true,
    }), 3000);
    return () => window.clearInterval(timer);
  }, [load, state.items, state.page, state.pageSize]);

  const generate = async () => {
    if (!reportDate) return message.warning('请选择日报日期');
    setGenerating(true);
    try {
      const result = await businessDailyReportsApi.create({
        report_date: reportDate.format('YYYY-MM-DD'),
        scope_type: selectedScope.scope_type,
        scope_code: selectedScope.scope_code,
      });
      navigate(`/agents/business-daily-reports/${result.id}`);
    } catch (error) {
      message.error(getErrorMessage(error, '创建日报任务失败'));
    } finally {
      setGenerating(false);
    }
  };

  const selectScope = scope => {
    if (!scope?.selectable || scope.key === selectedScope.key) return;
    setSelectedScope(scope);
    setState(current => ({ ...current, items: [], total: 0, page: 1 }));
    navigate(`${location.pathname}?${scopeQuery(scope)}`, { replace: true });
  };

  const restore = async report => {
    try {
      await businessDailyReportsApi.restore(report.id);
      message.success('日报已恢复');
      load({ page: state.page, pageSize: state.pageSize });
    } catch (error) {
      message.error(getErrorMessage(error, '恢复日报失败'));
    }
  };

  const rowMenu = report => ({
    items: [
      { key: 'view', icon: <EyeOutlined />, label: '查看详情' },
      !report.deleted_at && writable && ['completed', 'partial'].includes(report.status)
        ? { key: 'edit', icon: <EditOutlined />, label: '创建修订' }
        : null,
      report.deleted_at && canManage
        ? { key: 'restore', icon: <RestOutlined />, label: '恢复' }
        : !report.deleted_at && writable
          && (Number(report.created_by) === Number(user?.id) || canManage)
          && !ACTIVE_STATUSES.has(report.status)
          ? { key: 'delete', icon: <DeleteOutlined />, danger: true, label: '删除' }
          : null,
    ].filter(Boolean),
    onClick: ({ key, domEvent }) => {
      domEvent?.stopPropagation();
      if (key === 'view') navigate(`/agents/business-daily-reports/${report.id}`);
      if (key === 'edit') navigate(`/agents/business-daily-reports/${report.id}/edit`);
      if (key === 'delete') setDeleteReport(report);
      if (key === 'restore') restore(report);
    },
  });

  const columns = [
    {
      title: '日报',
      dataIndex: 'title',
      width: 260,
      render: (value, record) => (
        <div>
          <span className="business-primary-link" onClick={() => navigate(`/agents/business-daily-reports/${record.id}`)}>{value}</span>
          <span className="business-secondary-text">第 {record.scope_generation_no} 次生成 · {record.scope_name}</span>
        </div>
      ),
    },
    { title: '日期', dataIndex: 'report_date', width: 118, render: formatReportDate },
    { title: '状态', dataIndex: 'status', width: 116, render: reportStatusBadge },
    {
      title: '进度',
      dataIndex: 'progress_percent',
      width: 150,
      render: value => <Progress percent={Number(value || 0)} size="small" status={value < 100 ? 'active' : 'normal'} />,
    },
    { title: '数据质量', dataIndex: 'quality_status', width: 96, render: qualityTag },
    {
      title: 'Skill版本',
      dataIndex: 'skill_version_no',
      width: 120,
      render: value => value || <span className="business-empty-text">未发布</span>,
    },
    {
      title: '发起人',
      dataIndex: 'created_by_name',
      width: 108,
      render: value => value || '-',
    },
    {
      title: '发起时间',
      dataIndex: 'created_at',
      width: 150,
      render: value => formatBusinessDateTime(value, 'MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      fixed: 'right',
      className: 'business-row-action-cell',
      render: (_, record) => (
        <Dropdown menu={rowMenu(record)} trigger={['click']}>
          <Button className="business-row-more" type="text" icon={<MoreOutlined />} onClick={event => event.stopPropagation()} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div className="business-page daily-report-page">
      <div className="business-page-header">
        <div className="business-page-title">
          <FileTextOutlined />
          <h1 className="business-page-title-text">业务日报</h1>
        </div>
      </div>

      <div className={`daily-report-workspace${showScopeSidebar ? ' daily-report-workspace-with-sidebar' : ''}`}>
        {showScopeSidebar && (
          <aside className="daily-report-scope-panel">
            <div className="daily-report-scope-panel-title">分析范围</div>
            <Tree
              blockNode
              defaultExpandAll
              treeData={scopeTreeData}
              selectedKeys={[selectedScope.key]}
              onSelect={(keys, info) => {
                if (keys.length && info.node.scope) selectScope(info.node.scope);
              }}
            />
          </aside>
        )}

        <main className="daily-report-workspace-main">
          <div className="daily-report-scope-toolbar">
            <div className="daily-report-scope-current">
              {!showScopeSidebar && (
                <TreeSelect
                  className="daily-report-scope-select"
                  value={selectedScope.key}
                  treeData={scopeTreeData}
                  treeDefaultExpandAll
                  popupMatchSelectWidth={false}
                  onChange={(value, label, extra) => {
                    const scope = extra?.triggerNode?.props?.scope
                      || selectableScopes.find(item => item.key === value);
                    selectScope(scope);
                  }}
                />
              )}
              <div>
                <div className="daily-report-scope-heading">
                  {selectedScope.scope_name}
                  <span className="business-page-count">{state.total}</span>
                </div>
                <div className="daily-report-scope-path">{(selectedScope.path_labels || []).join(' / ')}</div>
              </div>
            </div>
            <div className="business-page-actions daily-report-generate-controls">
              <DatePicker
                value={reportDate}
                onChange={setReportDate}
                disabledDate={current => current && current.startOf('day').isAfter(dayjs().startOf('day'))}
                allowClear={false}
                inputReadOnly={isMobile}
              />
              <Button type="primary" icon={<PlayCircleOutlined />} loading={generating} disabled={!writable} onClick={generate}>
                生成日报
              </Button>
            </div>
          </div>

          <RuntimeAlert runtime={runtime} />

          <div className="business-table-panel">
        <div className="business-filter-bar">
          <div className="business-filter-controls">
            <Select
              className="business-filter-control"
              allowClear
              placeholder="生成状态"
              value={filters.status || undefined}
              onChange={value => setFilters(current => ({ ...current, status: value || '' }))}
              options={[
                { value: 'completed', label: '已完成' },
                { value: 'failed', label: '失败' },
                { value: 'collecting', label: '采集中' },
                { value: 'analyzing', label: '分析中' },
                { value: 'rendering', label: '生成报告' },
              ]}
            />
            <DatePicker
              className="business-filter-control"
              placeholder="日报日期"
              value={filters.report_date ? dayjs(filters.report_date) : null}
              onChange={value => setFilters(current => ({ ...current, report_date: value ? value.format('YYYY-MM-DD') : '' }))}
              inputReadOnly={isMobile}
            />
            <Select
              className="business-filter-control"
              value={filters.deleted ? 'deleted' : 'active'}
              onChange={value => setFilters(current => ({ ...current, deleted: value === 'deleted' }))}
              options={[{ value: 'active', label: '当前日报' }, { value: 'deleted', label: '回收站' }]}
            />
          </div>
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={() => load({ page: state.page, pageSize: state.pageSize })} />
          </Tooltip>
        </div>

        {isMobile ? (
          <List
            className="daily-report-mobile-list"
            loading={loading}
            dataSource={state.items}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无业务日报" /> }}
            renderItem={item => (
              <List.Item className="business-mobile-list-item">
                <div className="business-mobile-card" role="button" tabIndex={0} onClick={() => navigate(`/agents/business-daily-reports/${item.id}`)}>
                  <div className="daily-report-mobile-head">
                    <div>
                      <div className="business-primary-link">{item.title}</div>
                      <div className="business-secondary-text">第 {item.scope_generation_no} 次生成 · {item.created_by_name || '-'}</div>
                    </div>
                    <Dropdown menu={rowMenu(item)} trigger={['click']}>
                      <Button type="text" icon={<MoreOutlined />} onClick={event => event.stopPropagation()} />
                    </Dropdown>
                  </div>
                  <div className="daily-report-mobile-meta">
                    {reportStatusBadge(item.status)}
                    {qualityTag(item.quality_status)}
                    <Text type="secondary">{formatReportDate(item.report_date)}</Text>
                  </div>
                  <Progress percent={Number(item.progress_percent || 0)} size="small" showInfo={false} />
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Table
            className="business-data-table"
            rowKey="id"
            loading={loading}
            dataSource={state.items}
            columns={columns}
            scroll={{ x: 1160 }}
            onRow={record => ({ onDoubleClick: () => navigate(`/agents/business-daily-reports/${record.id}`) })}
            pagination={{
              current: state.page,
              pageSize: state.pageSize,
              total: state.total,
              showSizeChanger: true,
              onChange: (page, pageSize) => load({ page, pageSize }),
            }}
          />
        )}
          </div>
        </main>
      </div>

      <DeleteReportModal
        report={deleteReport}
        open={Boolean(deleteReport)}
        onCancel={() => setDeleteReport(null)}
        onDeleted={() => { setDeleteReport(null); load({ page: state.page, pageSize: state.pageSize }); }}
      />
    </div>
  );
}

function BusinessDailyReportDetail({ reportId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('current');
  const [working, setWorking] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setDetail(await businessDailyReportsApi.get(reportId));
    } catch (error) {
      message.error(getErrorMessage(error, '加载日报详情失败'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!ACTIVE_STATUSES.has(detail?.report?.status)) return undefined;
    const timer = window.setInterval(() => load({ quiet: true }), 2500);
    return () => window.clearInterval(timer);
  }, [detail?.report?.status, load]);

  const report = detail?.report;
  const regenerate = async () => {
    setWorking(true);
    try {
      const result = await businessDailyReportsApi.regenerate(reportId);
      navigate(`/agents/business-daily-reports/${result.id}`);
    } catch (error) {
      message.error(getErrorMessage(error, '重新生成日报失败'));
    } finally {
      setWorking(false);
    }
  };

  const restore = async () => {
    setWorking(true);
    try {
      await businessDailyReportsApi.restore(reportId);
      message.success('日报已恢复');
      load();
    } catch (error) {
      message.error(getErrorMessage(error, '恢复日报失败'));
    } finally {
      setWorking(false);
    }
  };

  const submitRevision = async revision => {
    try {
      await businessDailyReportsApi.submitRevision(reportId, revision.id);
      message.success('修订已提交审核');
      load();
    } catch (error) {
      message.error(getErrorMessage(error, '提交修订失败'));
    }
  };

  const reviewRevision = async (revision, action) => {
    try {
      await businessDailyReportsApi.reviewRevision(reportId, revision.id, { action });
      message.success(action === 'approve' ? '修订已采用' : '修订已退回');
      load();
    } catch (error) {
      message.error(getErrorMessage(error, '审核修订失败'));
    }
  };

  if (loading) return <div className="business-page"><Skeleton active /></div>;
  if (!report) return <div className="business-page"><Empty description="日报不存在" /></div>;

  const reportReady = ['completed', 'partial'].includes(report.status);
  const hasZhixiaoHtmlReport = (detail.artifacts || [])
    .some(artifact => artifact.artifact_type === 'zhixiao_html_report');
  const revisionColumns = [
    { title: '版本', dataIndex: 'revision_no', width: 88, render: value => value === 0 ? '原稿' : `v${value}` },
    { title: '状态', dataIndex: 'status', width: 100, render: revisionStatusTag },
    { title: '修改摘要', dataIndex: 'change_summary', ellipsis: true, render: value => value || '-' },
    { title: '创建人', dataIndex: 'created_by_name', width: 108, render: value => value || '-' },
    { title: '更新时间', dataIndex: 'updated_at', width: 150, render: value => formatBusinessDateTime(value, 'MM-DD HH:mm') },
    {
      title: '',
      key: 'actions',
      width: 176,
      render: (_, revision) => (
        <Space size={4}>
          {revision.rendered_html_artifact_id && (
            <Button type="link" size="small" onClick={() => setActiveTab(`revision-${revision.id}`)}>查看</Button>
          )}
          {revision.status === 'draft' && detail.permissions?.can_write
            && Number(revision.created_by) === Number(user?.id) && (
            <Button type="link" size="small" onClick={() => navigate(`/agents/business-daily-reports/${reportId}/edit`)}>编辑</Button>
          )}
          {revision.status === 'draft' && detail.permissions?.can_write
            && Number(revision.created_by) === Number(user?.id) && (
            <Button type="link" size="small" onClick={() => submitRevision(revision)}>提交</Button>
          )}
          {revision.status === 'submitted' && detail.permissions?.can_manage && (
            <Button type="link" size="small" onClick={() => reviewRevision(revision, 'approve')}>采用</Button>
          )}
          {revision.status === 'submitted' && detail.permissions?.can_manage && (
            <Button type="link" danger size="small" onClick={() => reviewRevision(revision, 'reject')}>退回</Button>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'current',
      label: '当前日报',
      children: reportReady ? <ReportHtmlFrame reportId={reportId} /> : <Empty description="日报正文尚未生成" />,
    },
    {
      key: 'machine',
      label: '机器原稿',
      children: reportReady ? <ReportHtmlFrame reportId={reportId} machine /> : <Empty description="机器原稿尚未生成" />,
    },
    ...(hasZhixiaoHtmlReport ? [{
      key: 'zhixiao',
      label: '支小业务',
      children: (
        <ArtifactHtmlFrame
          reportId={reportId}
          artifactType="zhixiao_html_report"
          title="支小业务日报"
        />
      ),
    }] : []),
    {
      key: 'revisions',
      label: `修订历史 ${detail.revisions?.length || 0}`,
      children: (
        <Table
          rowKey="id"
          size="small"
          dataSource={detail.revisions || []}
          columns={revisionColumns}
          pagination={false}
          scroll={{ x: 760 }}
        />
      ),
    },
    {
      key: 'execution',
      label: '数据与执行',
      children: (
        <div className="daily-report-execution-grid">
          <section className="daily-report-section">
            <h2>执行步骤</h2>
            <Steps
              direction="vertical"
              size="small"
              items={(detail.runs || []).map(run => ({
                title: run.stage_label,
                status: STAGE_STATUS_META[run.stage_status]?.status || 'wait',
                description: run.error_message || STAGE_STATUS_META[run.stage_status]?.label || run.stage_status,
              }))}
            />
          </section>
          <section className="daily-report-section">
            <h2>生成契约</h2>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Skill">{report.skill_code}</Descriptions.Item>
              <Descriptions.Item label="Skill版本">{report.skill_version_no || '未发布'}</Descriptions.Item>
              <Descriptions.Item label="指标契约">{report.metric_contract_version}</Descriptions.Item>
              <Descriptions.Item label="渲染器">{report.renderer_version}</Descriptions.Item>
              <Descriptions.Item label="连接器">{report.connector_version}</Descriptions.Item>
              <Descriptions.Item label="来源哈希">{report.source_hash || '-'}</Descriptions.Item>
              <Descriptions.Item label="标准化哈希">{report.normalized_hash || '-'}</Descriptions.Item>
            </Descriptions>
          </section>
          <section className="daily-report-section daily-report-artifacts">
            <h2>产物</h2>
            {(detail.artifacts || []).length ? (
              <List
                size="small"
                dataSource={detail.artifacts}
                renderItem={artifact => (
                  <List.Item extra={<Text type="secondary">{Math.max(1, Math.round((artifact.content_size || 0) / 1024))} KB</Text>}>
                    <Text>{artifact.artifact_type}</Text>
                  </List.Item>
                )}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无产物" />}
          </section>
        </div>
      ),
    },
    ...(detail.revisions || []).filter(item => item.rendered_html_artifact_id).map(revision => ({
      key: `revision-${revision.id}`,
      label: revision.revision_no === 0 ? '原稿预览' : `v${revision.revision_no} 预览`,
      children: <ReportHtmlFrame reportId={reportId} revisionId={revision.id} />,
    })),
  ];

  return (
    <div className="business-page daily-report-page">
      <div className="business-page-header daily-report-detail-header">
        <div className="business-page-title">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/agents/business-daily-reports?${scopeQuery(report)}`)}
          />
          <div>
            <h1 className="business-page-title-text">{report.title}</h1>
            <div className="business-secondary-text">第 {report.scope_generation_no} 次生成 · {formatReportDate(report.report_date)}</div>
          </div>
        </div>
        <div className="business-page-actions">
          {!report.deleted_at && detail.permissions?.can_write && (
            <Button icon={<ReloadOutlined />} loading={working} onClick={regenerate}>重新生成</Button>
          )}
          {!report.deleted_at && reportReady && detail.permissions?.can_write && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/agents/business-daily-reports/${reportId}/edit`)}>创建修订</Button>
          )}
          {report.deleted_at && detail.permissions?.can_restore && (
            <Button icon={<RestOutlined />} loading={working} onClick={restore}>恢复</Button>
          )}
          {!report.deleted_at && detail.permissions?.can_delete && !ACTIVE_STATUSES.has(report.status) && (
            <Tooltip title="删除">
              <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)} />
            </Tooltip>
          )}
        </div>
      </div>

      <div className="daily-report-detail-meta">
        {reportStatusBadge(report.status)}
        {qualityTag(report.quality_status)}
        <Tag>{report.scope_name}</Tag>
        <Tag>Skill {report.skill_version_no || '未发布'}</Tag>
        <Text type="secondary">{report.created_by_name || '-'} · {formatBusinessDateTime(report.created_at)}</Text>
      </div>
      <div className="daily-report-detail-path">{(report.scope_path_labels || []).join(' / ')}</div>

      {report.error_message && (
        <Alert
          className="daily-report-error-alert"
          type="error"
          showIcon
          message={report.error_message}
          description={report.error_code || undefined}
        />
      )}

      <div className="daily-report-detail-panel">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </div>

      <DeleteReportModal
        report={report}
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onDeleted={() => navigate(`/agents/business-daily-reports?${scopeQuery(report)}`)}
      />
    </div>
  );
}

function narrativeInitialValue(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

function BusinessDailyReportEdit({ reportId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailData, revisions] = await Promise.all([
        businessDailyReportsApi.get(reportId),
        businessDailyReportsApi.revisions(reportId, { include_model: 1 }),
      ]);
      const editableDraft = revisions.find(item => item.status === 'draft' && Number(item.created_by) === Number(user?.id)) || null;
      const sourceRevision = editableDraft
        || revisions.find(item => Number(item.id) === Number(detailData.report.current_revision_id))
        || revisions.find(item => item.revision_no === 0)
        || null;
      const narrative = sourceRevision?.report_model?.narrative || {};
      form.setFieldsValue({
        change_summary: editableDraft?.change_summary || '',
        ...Object.fromEntries(NARRATIVE_FIELDS.map(field => [field.name, narrativeInitialValue(narrative[field.name])])),
      });
      setDraft(editableDraft);
      setDetail(detailData);
    } catch (error) {
      message.error(getErrorMessage(error, '加载日报编辑数据失败'));
    } finally {
      setLoading(false);
    }
  }, [form, reportId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async ({ submit = false } = {}) => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const narrative = Object.fromEntries(NARRATIVE_FIELDS.map(field => [field.name, values[field.name] || '']));
      let saved;
      if (draft) {
        const result = await businessDailyReportsApi.updateRevision(reportId, draft.id, {
          narrative,
          change_summary: values.change_summary,
          base_revision_no: draft.base_revision_no,
          lock_version: draft.lock_version,
        });
        saved = result.revision;
      } else {
        const result = await businessDailyReportsApi.createRevision(reportId, {
          narrative,
          change_summary: values.change_summary,
        });
        saved = result.revision;
      }
      if (submit) {
        await businessDailyReportsApi.submitRevision(reportId, saved.id);
        message.success('修订已保存并提交审核');
        navigate(`/agents/business-daily-reports/${reportId}`);
      } else {
        message.success('修订草稿已保存');
        setDraft(saved);
      }
    } catch (error) {
      if (!error?.errorFields) message.error(getErrorMessage(error, '保存日报修订失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="business-page"><Skeleton active /></div>;
  if (!detail?.report) return <div className="business-page"><Empty description="日报不存在" /></div>;

  return (
    <div className="business-page daily-report-page">
      <div className="business-page-header">
        <div className="business-page-title">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/agents/business-daily-reports/${reportId}`)} />
          <div>
            <h1 className="business-page-title-text">编辑日报修订</h1>
            <div className="business-secondary-text">{detail.report.title} · {draft ? `v${draft.revision_no} 草稿` : '新修订'}</div>
          </div>
        </div>
        <div className="business-page-actions">
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => save()}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={() => save({ submit: true })}>提交审核</Button>
        </div>
      </div>

      <div className="daily-report-editor-layout">
        <Form form={form} layout="vertical" className="daily-report-editor-form">
          <Form.Item
            name="change_summary"
            label="修改摘要"
            rules={[{ required: true, message: '请填写修改摘要' }]}
          >
            <Input maxLength={200} showCount />
          </Form.Item>
          {NARRATIVE_FIELDS.map(field => (
            <Form.Item key={field.name} name={field.name} label={field.label}>
              <TextArea rows={field.rows} maxLength={20000} />
            </Form.Item>
          ))}
        </Form>
        <aside className="daily-report-editor-reference">
          <Title level={2}>机器原稿</Title>
          <ReportHtmlFrame reportId={reportId} machine />
        </aside>
      </div>
    </div>
  );
}

export default function BusinessDailyReports() {
  const { reportId } = useParams();
  const location = useLocation();
  const editMode = Boolean(reportId && location.pathname.endsWith('/edit'));
  if (!reportId) return <BusinessDailyReportList />;
  if (editMode) return <BusinessDailyReportEdit reportId={reportId} />;
  return <BusinessDailyReportDetail reportId={reportId} />;
}
