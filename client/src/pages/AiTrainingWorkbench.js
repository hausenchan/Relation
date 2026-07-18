import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Collapse, Descriptions, Empty, Form, Grid, Input, List, Modal,
  Progress, Row, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, BarChartOutlined, CheckCircleOutlined, DislikeOutlined,
  FileAddOutlined, FolderAddOutlined, LikeOutlined, MessageOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined, ReadOutlined, ReloadOutlined,
  SendOutlined, SettingOutlined, TeamOutlined, ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { aiTrainingApi } from '../api';
import { useAuth } from '../AuthContext';

const { Title, Text, Paragraph } = Typography;
const { Search, TextArea } = Input;
const { useBreakpoint } = Grid;

const TAB_OPTIONS = [
  { key: 'sessions', label: '会话工作台', icon: <MessageOutlined /> },
  { key: 'cases', label: '优秀案例库', icon: <ReadOutlined /> },
  { key: 'skills', label: 'Skill工坊', icon: <ToolOutlined /> },
  { key: 'evals', label: '评测中心', icon: <CheckCircleOutlined /> },
  { key: 'stats', label: '训练统计', icon: <BarChartOutlined /> },
];

const SCENE_OPTIONS = [
  { value: '', label: '全部场景' },
  { value: 'general_chat', label: '通用训练' },
  { value: 'business_growth', label: '业务增长' },
  { value: 'revenue_diagnosis', label: '收入异常诊断' },
  { value: 'budget_advice', label: '预算建议' },
  { value: 'daily_report', label: '日报生成' },
];

const SESSION_CREATE_SCENES = SCENE_OPTIONS.filter((item) => item.value);

const BUSINESS_LINE_OPTIONS = [
  { value: '', label: '全部业务线' },
  { value: 'zhixiao', label: '支小' },
  { value: 'weixiao', label: '微小' },
  { value: 'douxiao', label: '抖小' },
  { value: 'baidu_js', label: '百度JS' },
  { value: 'baidu_search', label: '百度搜索' },
];

const SESSION_CREATE_LINES = BUSINESS_LINE_OPTIONS.filter((item) => item.value);

const BUSINESS_SIDE_OPTIONS = [
  { value: '预算侧', label: '预算侧' },
  { value: '流量侧', label: '流量侧' },
];

const ROLE_SCOPE_OPTIONS = [
  { value: 'operation', label: '运营' },
  { value: 'strategy', label: '策略' },
  { value: 'leader', label: '负责人' },
];

const VISIBILITY_OPTIONS = [
  { value: 'private', label: '仅自己' },
  { value: 'team', label: '团队可见' },
];

const SESSION_LIST_COLLAPSED_STORAGE_KEY = 'aiTraining.sessionListCollapsed';

const SESSION_CREATE_INITIAL_VALUES = {
  title: undefined,
  scene_code: 'general_chat',
  business_line: '',
  business_side: undefined,
  budget_side: undefined,
  role_scope: undefined,
  visibility_scope: 'private',
  skill_id: undefined,
};

function formatTime(value) {
  return value ? dayjs(value).format('MM-DD HH:mm') : '-';
}

function formatAmount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLatency(ms) {
  const value = Number(ms || 0);
  if (!value) return '';
  if (value < 1000) return `${value}ms`;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function clipDisplayText(value, maxLength = 80) {
  const chars = Array.from(String(value || '').trim());
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}...` : chars.join('');
}

function qualityColor(score) {
  if (score >= 85) return '#2563eb';
  if (score >= 70) return '#f59e0b';
  return '#94a3b8';
}

function qualityTag(score) {
  if (score === null || score === undefined) return <Tag>待评分</Tag>;
  const color = score >= 85 ? 'blue' : score >= 70 ? 'gold' : 'default';
  return <Tag color={color}>质量分 {score}</Tag>;
}

function candidateStatusTag(status) {
  const map = {
    pending_review: { color: 'gold', label: '待审核' },
    approved: { color: 'green', label: '已通过' },
    rejected: { color: 'default', label: '已退回' },
  };
  const current = map[status] || { color: 'default', label: status || '未知' };
  return <Tag color={current.color}>{current.label}</Tag>;
}

function skillStatusTag(status) {
  const map = {
    draft: { color: 'default', label: '草稿' },
    testing: { color: 'blue', label: '测试中' },
    evaluating: { color: 'processing', label: '评测中' },
    pending_review: { color: 'gold', label: '待审核' },
    published: { color: 'green', label: '已发布' },
    archived: { color: 'default', label: '已归档' },
  };
  const current = map[status] || { color: 'default', label: status || '未知' };
  return <Tag color={current.color}>{current.label}</Tag>;
}

function evalRunStatusTag(status) {
  const map = {
    running: { color: 'processing', label: '运行中' },
    completed: { color: 'green', label: '已完成' },
    failed: { color: 'red', label: '失败' },
  };
  const current = map[status] || { color: 'default', label: status || '未知' };
  return <Tag color={current.color}>{current.label}</Tag>;
}

function formatScorePercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '-';
  return `${Math.round(numeric * 100)}%`;
}

function runtimeModeTag(mode) {
  const map = {
    llm: { color: 'green', label: 'LLM' },
    llm_chat: { color: 'green', label: '自由聊天' },
    agent: { color: 'purple', label: '通用 Agent' },
    agent_fallback: { color: 'gold', label: 'Agent 回退' },
    local_fact: { color: 'cyan', label: '本地事实' },
    skill_only: { color: 'blue', label: 'Skill' },
    skill_llm_hybrid: { color: 'purple', label: 'Skill + 模型' },
    skill_llm_fallback: { color: 'gold', label: 'Skill 回退' },
    deterministic: { color: 'blue', label: '规则模式' },
    deterministic_fallback: { color: 'gold', label: '模型回退' },
  };
  const current = map[mode] || { color: 'default', label: mode || 'Runtime' };
  return <Tag color={current.color}>{current.label}</Tag>;
}

function runtimeSourceLabel(source) {
  if (source === 'system') return '系统模型';
  if (source === 'user') return '个人模型';
  if (source === 'env') return '系统小模型';
  if (source === 'local_fact') return '本地事实库';
  return '规则模式';
}

function connectorStatusText(connectors = {}) {
  const parts = [];
  if (connectors.midmax?.enabled) parts.push(`Mid-Max ${connectors.midmax.source_count || 0} 个数据源`);
  if (connectors.gitee?.enabled) parts.push(`Gitee ${connectors.gitee.project_count || 0} 个项目`);
  if (connectors.mcp?.enabled) parts.push(`MCP ${connectors.mcp.server_count || 0} 个服务`);
  return parts.length > 0 ? `外部工具：${parts.join('，')}` : '外部工具尚未授权';
}

function streamEventKind(event = {}) {
  if (event.type === 'error') return { color: '#ef4444', tag: '异常', tagColor: 'error' };
  if (event.type === 'agent_fallback' || event.status === 'warning' || event.status === 'failed') {
    return { color: '#f59e0b', tag: '回退', tagColor: 'warning' };
  }
  if (event.type?.startsWith('tool_')) return { color: '#2563eb', tag: '工具', tagColor: 'blue' };
  if (event.type?.startsWith('skill_')) return { color: '#7c3aed', tag: 'Skill', tagColor: 'purple' };
  if (event.type?.startsWith('model_') || event.type?.startsWith('agent_')) {
    return { color: '#0f766e', tag: 'Agent', tagColor: 'cyan' };
  }
  if (event.type === 'completed') return { color: '#16a34a', tag: '完成', tagColor: 'success' };
  return { color: '#64748b', tag: '流程', tagColor: 'default' };
}

function AssistantProcessingBubble({ promptText, skillName = '', events = [] }) {
  const hasExplicitSkill = Boolean(skillName)
    || /@[a-z][a-z0-9_-]+|(?:使用|调用|执行|用)\s*[a-z][a-z0-9_-]+/i.test(promptText || '');
  const fallbackSteps = hasExplicitSkill
    ? ['正在识别并执行 Skill', '正在调用模型审校结果', '正在校验事实并选择最终结果']
    : ['正在理解任务并选择可用能力', '正在匹配 Skill 和工具', '正在执行工具并校验最终结果'];
  const visibleEvents = Array.isArray(events) ? events.slice(-16) : [];
  return (
    <div style={{ alignSelf: 'flex-start', width: '100%' }}>
      <Card size="small" bodyStyle={{ padding: 12, background: '#ffffff' }} style={{ borderColor: '#dbeafe' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <Tag color="purple">AI</Tag>
            <Tag color="processing">实时执行</Tag>
            {visibleEvents.length > 0 ? <Text type="secondary">{visibleEvents.length} 条进度</Text> : null}
          </Space>
          <div style={{ padding: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <Text strong>我已收到你的问题。</Text>
            <div style={{ color: '#64748b', marginTop: 6, lineHeight: 1.7 }}>
              {promptText ? clipDisplayText(promptText, 90) : '正在读取当前会话上下文。'}
            </div>
          </div>
          {visibleEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleEvents.map((event, index) => {
                const kind = streamEventKind(event);
                const isLatest = index === visibleEvents.length - 1 && event.type !== 'completed' && event.type !== 'error';
                const argumentText = event.arguments && Object.keys(event.arguments).length > 0
                  ? clipDisplayText(JSON.stringify(event.arguments), 180)
                  : '';
                return (
                  <div
                    key={`${event.type || 'progress'}-${event.index || event.created_at || index}-${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '12px minmax(0, 1fr)',
                      gap: 8,
                      alignItems: 'start',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: kind.color,
                        boxShadow: isLatest ? `0 0 0 4px ${kind.color}22` : 'none',
                        marginTop: 7,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <Space size={6} wrap>
                        <Tag color={kind.tagColor} style={{ marginInlineEnd: 0 }}>{kind.tag}</Tag>
                        <Text strong={isLatest}>{event.label || event.type || '正在处理'}</Text>
                        {event.latency_ms !== undefined ? (
                          <Text type="secondary">{formatLatency(event.latency_ms)}</Text>
                        ) : null}
                      </Space>
                      {event.detail ? (
                        <div style={{ color: '#64748b', lineHeight: 1.65, marginTop: 2 }}>
                          {clipDisplayText(event.detail, 220)}
                        </div>
                      ) : null}
                      {argumentText ? (
                        <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55, marginTop: 2, overflowWrap: 'anywhere' }}>
                          参数：{argumentText}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {fallbackSteps.map((step, index) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: index === fallbackSteps.length - 1 ? '#60a5fa' : '#93c5fd',
                      boxShadow: index === fallbackSteps.length - 1 ? '0 0 0 4px rgba(96, 165, 250, 0.16)' : 'none',
                      flex: '0 0 auto',
                    }}
                  />
                  <Text type="secondary">{step}</Text>
                </div>
              ))}
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
}

function AssistantDataTable({ columns = [], rows = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const safeColumns = (Array.isArray(columns) && columns.length > 0
    ? columns
    : Object.keys(rows[0] || {}).map((key) => ({ key, title: key }))
  ).filter((column) => column?.key);
  const tableColumns = safeColumns.map((column) => ({
    title: column.title || column.key,
    dataIndex: column.key,
    key: column.key,
    ellipsis: column.key !== 'revenue_amount',
    align: column.key === 'revenue_amount' ? 'right' : 'left',
    render: (value) => (column.key === 'revenue_amount' ? formatAmount(value) : (value || '-')),
  }));
  return (
    <Table
      size="small"
      rowKey={(row, index) => `${row.app_id || row.app_name || row.date || 'row'}-${index}`}
      columns={tableColumns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: true }}
      style={{ marginTop: 8 }}
    />
  );
}

function AssistantResult({ item }) {
  const structured = item.structured_json || {};
  const summary = structured.summary || item.content_text || '';
  const evidence = Array.isArray(item.evidence_json) && item.evidence_json.length > 0
    ? item.evidence_json
    : (structured.evidence || []);
  const actions = Array.isArray(item.actions_json) && item.actions_json.length > 0
    ? item.actions_json
    : (structured.actions || []);
  const riskReminders = Array.isArray(structured.risk_reminders) ? structured.risk_reminders : [];
  const dataRows = Array.isArray(structured.data_preview) ? structured.data_preview : [];
  const dataColumns = Array.isArray(structured.data_columns) ? structured.data_columns : [];
  const total = structured.data_total || null;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ padding: 12, border: '1px solid #dbeafe', borderRadius: 8, background: '#f8fbff' }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>已理解</Text>
        <Text strong style={{ lineHeight: 1.8 }}>{summary || '已根据当前会话上下文生成回复。'}</Text>
      </div>

      <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>正式结果</Text>
        {total?.row_count ? (
          <Text style={{ display: 'block', marginBottom: 8 }}>
            共 {total.row_count} 条明细，合计收入 {formatAmount(total.revenue_amount)} 元。
          </Text>
        ) : null}
        <AssistantDataTable columns={dataColumns} rows={dataRows} />
        {!dataRows.length ? (
          <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{item.content_text || '-'}</Text>
        ) : null}
      </div>

      {evidence.length > 0 ? (
        <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafbfd' }}>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>核心证据</Text>
          {evidence.map((text, index) => (
            <div key={`${item.id}-evidence-${index}`} style={{ color: '#475569', lineHeight: 1.8 }}>
              {index + 1}. {text}
            </div>
          ))}
        </div>
      ) : null}

      {riskReminders.length > 0 ? (
        <div style={{ padding: 12, border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb' }}>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>风险提醒</Text>
          {riskReminders.map((text, index) => (
            <div key={`${item.id}-risk-${index}`} style={{ color: '#92400e', lineHeight: 1.8 }}>
              {index + 1}. {text}
            </div>
          ))}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <Space size={[6, 6]} wrap>
          {actions.map((action, index) => (
            <Tag key={`${item.id}-action-${index}`} color="blue">{action}</Tag>
          ))}
        </Space>
      ) : null}
    </Space>
  );
}

function AssistantProcessCollapse({ item, analysisProcess }) {
  if (!analysisProcess) return null;
  const latency = formatLatency(item.latency_ms);
  const stepCount = Array.isArray(analysisProcess.steps) ? analysisProcess.steps.length : 0;
  const label = `已处理${latency ? ` ${latency}` : ''}${stepCount ? ` · ${stepCount} 步` : ''}`;
  return (
    <Collapse
      size="small"
      ghost
      items={[
        {
          key: 'analysis-process',
          label,
          children: (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {analysisProcess.summary ? (
                <Text type="secondary" style={{ lineHeight: 1.8 }}>
                  {analysisProcess.summary}
                </Text>
              ) : null}
              {Array.isArray(analysisProcess.trace_tags) && analysisProcess.trace_tags.length > 0 ? (
                <Space size={[6, 6]} wrap>
                  {analysisProcess.trace_tags.map((tag, index) => (
                    <Tag key={`${item.id}-trace-tag-${index}`}>{tag}</Tag>
                  ))}
                </Space>
              ) : null}
              {Array.isArray(analysisProcess.steps) && analysisProcess.steps.length > 0 ? (
                <div>
                  {analysisProcess.steps.map((step, index) => (
                    <div key={`${item.id}-analysis-step-${index}`} style={{ color: '#475569', lineHeight: 1.8 }}>
                      {index + 1}. {step}
                    </div>
                  ))}
                </div>
              ) : null}
              {Array.isArray(analysisProcess.tool_calls) && analysisProcess.tool_calls.length > 0 ? (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>工具执行记录</Text>
                  {analysisProcess.tool_calls.map((toolCall, index) => (
                    <div
                      key={`${item.id}-tool-call-${toolCall.index || index}`}
                      style={{
                        borderLeft: `3px solid ${toolCall.status === 'success' ? '#52c41a' : '#faad14'}`,
                        paddingLeft: 10,
                        marginBottom: index === analysisProcess.tool_calls.length - 1 ? 0 : 10,
                      }}
                    >
                      <Space size={8} wrap>
                        <Tag color={toolCall.status === 'success' ? 'success' : 'warning'}>
                          {toolCall.status === 'success' ? '成功' : '异常'}
                        </Tag>
                        <Text strong>{toolCall.display_name || toolCall.tool_name}</Text>
                        {toolCall.latency_ms !== null && toolCall.latency_ms !== undefined ? (
                          <Text type="secondary">{formatLatency(toolCall.latency_ms)}</Text>
                        ) : null}
                      </Space>
                      {toolCall.result_summary ? (
                        <div style={{ color: '#475569', lineHeight: 1.8, marginTop: 4 }}>
                          {toolCall.result_summary}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {analysisProcess.model_error ? (
                <Text type="warning">模型回退原因：{analysisProcess.model_error}</Text>
              ) : null}
              {analysisProcess.validation ? (
                <Alert
                  type={analysisProcess.validation.passed ? 'success' : 'warning'}
                  showIcon
                  message={analysisProcess.validation.passed ? '事实校验通过' : '事实校验未通过'}
                  description={analysisProcess.validation.issues?.join('；') || `已检查 ${analysisProcess.validation.checked_number_count || 0} 个数字`}
                />
              ) : null}
              {Array.isArray(analysisProcess.review_notes) && analysisProcess.review_notes.length > 0 ? (
                <div>
                  {analysisProcess.review_notes.map((note, index) => (
                    <div key={`${item.id}-review-note-${index}`} style={{ color: '#475569', lineHeight: 1.8 }}>
                      审校 {index + 1}. {note}
                    </div>
                  ))}
                </div>
              ) : null}
            </Space>
          ),
        },
      ]}
    />
  );
}

function ChatBubble({ item, writable, onFeedback, onAction }) {
  const isUser = item.message_role === 'user';
  const isAssistant = item.message_role === 'assistant';
  const bubbleBg = isUser ? '#edf4ff' : '#ffffff';
  const runtimeMeta = item.structured_json?.runtime_meta || null;
  const analysisProcess = item.structured_json?.analysis_process || null;

  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        width: isUser ? '88%' : '100%',
      }}
    >
      <Card
        size="small"
        bodyStyle={{ padding: 12, background: bubbleBg }}
        style={{ borderColor: isUser ? '#c9dcff' : '#e5e7eb' }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <Tag color={isUser ? 'blue' : 'purple'}>{isUser ? '我' : 'AI'}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatTime(item.created_at)}
            </Text>
            {isAssistant && runtimeMeta?.mode && runtimeModeTag(runtimeMeta.mode)}
            {isAssistant && runtimeMeta?.model_name ? <Tag color="green">{runtimeMeta.model_name}</Tag> : null}
            {isAssistant && runtimeMeta?.skill_name ? <Tag color="geekblue">{runtimeMeta.skill_name}</Tag> : null}
            {isAssistant && runtimeMeta?.skill_version_no ? <Tag>版本 {runtimeMeta.skill_version_no}</Tag> : null}
            {isAssistant && runtimeMeta?.candidate_selected ? (
              <Tag color={runtimeMeta.candidate_selected === 'llm_enhanced' ? 'purple' : 'blue'}>
                {runtimeMeta.candidate_selected === 'llm_enhanced'
                  ? '采用增强结果'
                  : runtimeMeta.candidate_selected === 'skill'
                    ? '采用 Skill 结果'
                    : runtimeMeta.candidate_selected === 'agent'
                      ? '采用 Agent 结果'
                      : '采用模型结果'}
              </Tag>
            ) : null}
            {!isUser && qualityTag(item.avg_rating ? Math.round(item.avg_rating * 20) : null)}
          </Space>

          {isAssistant ? (
            <>
              <AssistantProcessCollapse item={item} analysisProcess={analysisProcess} />
              <AssistantResult item={item} />
            </>
          ) : (
            <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
              {item.content_text || '-'}
            </Text>
          )}

          {isAssistant && (
            <Space wrap>
              <Button
                size="small"
                icon={<LikeOutlined />}
                type={item.my_feedback_type === 'helpful' ? 'primary' : 'default'}
                onClick={() => onFeedback(item.id, 'helpful')}
              >
                有帮助
              </Button>
              <Button
                size="small"
                icon={<DislikeOutlined />}
                type={item.my_feedback_type === 'not_helpful' ? 'primary' : 'default'}
                onClick={() => onFeedback(item.id, 'not_helpful')}
              >
                需优化
              </Button>
              {writable && (
                <>
                  <Button size="small" icon={<FolderAddOutlined />} onClick={() => onAction(item.id, 'save_as_case_candidate')}>
                    转案例候选
                  </Button>
                  <Button size="small" icon={<FileAddOutlined />} onClick={() => onAction(item.id, 'create_task_draft')}>
                    生成任务草稿
                  </Button>
                </>
              )}
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
}

export default function AiTrainingWorkbench() {
  const navigate = useNavigate();
  const { canWrite, user } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const writable = canWrite?.();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TAB_OPTIONS.some((item) => item.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'sessions';

  const [overview, setOverview] = useState({
    today_sessions: 0,
    high_quality_sessions: 0,
    published_cases: 0,
    pending_candidates: 0,
  });
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [filters, setFilters] = useState({ scene_code: '', business_line: '', keyword: '' });
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composeValue, setComposeValue] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingEvents, setPendingEvents] = useState([]);
  const [sessionListCollapsed, setSessionListCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SESSION_LIST_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [caseCandidates, setCaseCandidates] = useState([]);
  const [publishedCases, setPublishedCases] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [skillDetail, setSkillDetail] = useState(null);
  const [skillDetailLoading, setSkillDetailLoading] = useState(false);
  const [creatingSkillDraft, setCreatingSkillDraft] = useState(false);
  const [skillActionLoading, setSkillActionLoading] = useState('');
  const [evalRuns, setEvalRuns] = useState([]);
  const [evalLoading, setEvalLoading] = useState(false);
  const [statsData, setStatsData] = useState({ user_ranking: [], skill_ranking: [], scene_breakdown: [] });
  const [statsLoading, setStatsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [manualSkillModalOpen, setManualSkillModalOpen] = useState(false);
  const [manualSkillForm] = Form.useForm();

  const setTab = (key) => setSearchParams({ tab: key });

  const loadOverview = useCallback(async () => {
    const data = await aiTrainingApi.overview();
    setOverview({
      today_sessions: Number(data?.today_sessions || 0),
      high_quality_sessions: Number(data?.high_quality_sessions || 0),
      published_cases: Number(data?.published_cases || 0),
      pending_candidates: Number(data?.pending_candidates || 0),
    });
  }, []);

  const loadRuntimeStatus = useCallback(async () => {
    try {
      const data = await aiTrainingApi.getRuntimeStatus();
      setRuntimeStatus(data || null);
    } catch (error) {
      message.error(error.response?.data?.error || '加载 AI 运行状态失败');
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const rows = await aiTrainingApi.listSessions({
        status: 'active',
        scene_code: filters.scene_code || undefined,
        business_line: filters.business_line || undefined,
        keyword: filters.keyword || undefined,
        limit: 100,
      });
      setSessions(rows || []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载会话失败');
    } finally {
      setSessionsLoading(false);
    }
  }, [filters.business_line, filters.keyword, filters.scene_code]);

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    try {
      const rows = await aiTrainingApi.listMessages(sessionId);
      setMessages(rows || []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载消息失败');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const loadCaseLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const [candidateRows, caseRows] = await Promise.all([
        aiTrainingApi.listCaseCandidates({ limit: 100 }),
        aiTrainingApi.listCases(),
      ]);
      setCaseCandidates(candidateRows || []);
      setPublishedCases(caseRows || []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载案例库失败');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const rows = await aiTrainingApi.listSkills({ limit: 100 });
      setSkills(rows || []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载 Skill 列表失败');
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const loadSkillDetail = useCallback(async (skillId) => {
    if (!skillId) {
      setSkillDetail(null);
      return;
    }
    setSkillDetailLoading(true);
    try {
      const detail = await aiTrainingApi.getSkill(skillId);
      setSkillDetail(detail || null);
    } catch (error) {
      message.error(error.response?.data?.error || '加载 Skill 详情失败');
    } finally {
      setSkillDetailLoading(false);
    }
  }, []);

  const loadEvalRuns = useCallback(async () => {
    setEvalLoading(true);
    try {
      const rows = await aiTrainingApi.listEvalRuns({ limit: 50 });
      setEvalRuns(rows || []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载评测记录失败');
    } finally {
      setEvalLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await aiTrainingApi.getStats();
      setStatsData({
        user_ranking: data?.user_ranking || [],
        skill_ranking: data?.skill_ranking || [],
        scene_breakdown: data?.scene_breakdown || [],
      });
    } catch (error) {
      message.error(error.response?.data?.error || '加载训练统计失败');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const refreshCore = useCallback(async () => {
    await Promise.all([
      loadOverview(),
      loadRuntimeStatus(),
      loadSessions(),
      loadCaseLibrary(),
      loadSkills(),
      loadEvalRuns(),
      loadStats(),
      selectedSkillId ? loadSkillDetail(selectedSkillId) : Promise.resolve(),
    ]);
  }, [loadCaseLibrary, loadEvalRuns, loadOverview, loadRuntimeStatus, loadSessions, loadSkillDetail, loadSkills, loadStats, selectedSkillId]);

  useEffect(() => {
    void Promise.all([loadOverview(), loadRuntimeStatus(), loadCaseLibrary(), loadSkills(), loadEvalRuns(), loadStats()]);
  }, [loadCaseLibrary, loadEvalRuns, loadOverview, loadRuntimeStatus, loadSkills, loadStats]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SESSION_LIST_COLLAPSED_STORAGE_KEY,
        sessionListCollapsed ? '1' : '0',
      );
    } catch {}
  }, [sessionListCollapsed]);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
      return;
    }
    if (selectedSessionId && !sessions.some((item) => item.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]?.id || null);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    loadMessages(selectedSessionId);
  }, [loadMessages, selectedSessionId]);

  useEffect(() => {
    if (!selectedCandidateId && caseCandidates.length > 0) {
      setSelectedCandidateId(caseCandidates[0].id);
      return;
    }
    if (selectedCandidateId && !caseCandidates.some((item) => item.id === selectedCandidateId)) {
      setSelectedCandidateId(caseCandidates[0]?.id || null);
    }
  }, [caseCandidates, selectedCandidateId]);

  useEffect(() => {
    if (!selectedCaseId && publishedCases.length > 0) {
      setSelectedCaseId(publishedCases[0].id);
      return;
    }
    if (selectedCaseId && !publishedCases.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(publishedCases[0]?.id || null);
    }
  }, [publishedCases, selectedCaseId]);

  useEffect(() => {
    if (!selectedSkillId && skills.length > 0) {
      setSelectedSkillId(skills[0].id);
      return;
    }
    if (selectedSkillId && !skills.some((item) => item.id === selectedSkillId)) {
      setSelectedSkillId(skills[0]?.id || null);
    }
  }, [selectedSkillId, skills]);

  useEffect(() => {
    void loadSkillDetail(selectedSkillId);
  }, [loadSkillDetail, selectedSkillId]);

  const currentSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) || null,
    [selectedSessionId, sessions],
  );
  const currentCandidate = useMemo(
    () => caseCandidates.find((item) => item.id === selectedCandidateId) || null,
    [caseCandidates, selectedCandidateId],
  );
  const currentCase = useMemo(
    () => publishedCases.find((item) => item.id === selectedCaseId) || null,
    [publishedCases, selectedCaseId],
  );
  const currentSkill = useMemo(
    () => skills.find((item) => item.id === selectedSkillId) || null,
    [selectedSkillId, skills],
  );
  const publishedSkillOptions = useMemo(
    () => (skills || [])
      .filter((item) => item.status === 'published' && item.publish_version_id)
      .map((item) => ({
        value: item.id,
        label: `${item.name} · ${item.business_line || '-'} / ${item.scene_code || '-'}`,
      })),
    [skills],
  );
  const canManageCurrentSkill = Boolean(skillDetail?.skill?.can_manage || currentSkill?.can_manage);

  const topSessionQuality = currentSession?.quality_score || 0;
  const lastAssistantMessage = [...messages].reverse().find((item) => item.message_role === 'assistant');
  const currentSessionSkillName = currentSession?.skill_name || currentSession?.context_snapshot_json?.skill_name || '';
  const currentSessionSkillVersion = currentSession?.skill_version_no || currentSession?.context_snapshot_json?.skill_version_no || '';
  const lastRuntimeMeta = lastAssistantMessage?.structured_json?.runtime_meta || null;
  const lastRuntimeSource = lastRuntimeMeta?.model_config_source || runtimeStatus?.config_source;
  const runtimeDisplayName = runtimeSourceLabel(lastRuntimeSource);

  const openCreateSessionModal = useCallback((preset = {}) => {
    setCreateModalOpen(true);
    createForm.setFieldsValue({ ...SESSION_CREATE_INITIAL_VALUES, ...preset });
  }, [createForm]);

  const handleCreateSkillChange = useCallback((value) => {
    if (!value) return;
    const targetSkill = skills.find((item) => item.id === value);
    if (!targetSkill) return;
    createForm.setFieldsValue({
      scene_code: targetSkill.scene_code || SESSION_CREATE_INITIAL_VALUES.scene_code,
      business_line: targetSkill.business_line || SESSION_CREATE_INITIAL_VALUES.business_line,
      business_side: targetSkill.business_side || SESSION_CREATE_INITIAL_VALUES.business_side,
      budget_side: targetSkill.budget_side || SESSION_CREATE_INITIAL_VALUES.budget_side,
      role_scope: targetSkill.role_scope || SESSION_CREATE_INITIAL_VALUES.role_scope,
      skill_id: targetSkill.id,
    });
  }, [createForm, skills]);

  const createSession = async () => {
    const values = await createForm.validateFields();
    try {
      const session = await aiTrainingApi.createSession(values);
      message.success('训练会话已创建');
      setCreateModalOpen(false);
      createForm.resetFields();
      await Promise.all([loadOverview(), loadSessions()]);
      setSelectedSessionId(session.id);
      setActiveDraftByScene(values.scene_code);
    } catch (error) {
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const setActiveDraftByScene = (sceneCode) => {
    if (sceneCode === 'business_growth') {
      setComposeValue('请先用 zhixiao-dashboard-analysis 分析支小 2026-07-15 距离 5 万毛利的缺口和主因，再用 zhixiao-ad-ops-strategy 给出明天冲 5 万和挑战 10 万的增长策略、P0/P1/P2 动作、止损线。');
      return;
    }
    if (sceneCode === 'revenue_diagnosis') {
      setComposeValue('请先按预算侧视角，帮我判断最近 7 天收入回撤是量的问题、结构的问题，还是入口质量的问题，并补一个是否需要跨流量侧联合复盘的判断。');
      return;
    }
    if (sceneCode === 'budget_advice') {
      setComposeValue('请结合最近 7 天趋势，给我一个保守版预算回补建议，要求拆出验证动作、风险点和止损条件。');
      return;
    }
    setComposeValue('');
  };

  const sendMessage = async () => {
    const content = composeValue.trim();
    if (!content || !selectedSessionId) return;
    setSending(true);
    setPendingPrompt(content);
    setPendingEvents([]);
    setComposeValue('');
    try {
      const result = await aiTrainingApi.createMessageStream(
        selectedSessionId,
        { content_text: content },
        {
          onEvent: (event) => {
            setPendingEvents((current) => [...current, event].slice(-60));
          },
        },
      );
      setMessages(result.messages || []);
      await Promise.all([loadOverview(), loadSessions(), loadCaseLibrary()]);
    } catch (error) {
      setComposeValue(content);
      message.error(error.response?.data?.error || error.message || '发送失败');
    } finally {
      setSending(false);
      setPendingPrompt('');
      setPendingEvents([]);
    }
  };

  const handleFeedback = async (messageId, feedbackType) => {
    try {
      await aiTrainingApi.feedbackMessage(messageId, { feedback_type: feedbackType, adopted: feedbackType === 'helpful' ? 1 : 0 });
      await Promise.all([loadMessages(selectedSessionId), loadOverview(), loadSessions()]);
    } catch (error) {
      message.error(error.response?.data?.error || '保存反馈失败');
    }
  };

  const handleMessageAction = async (messageId, action) => {
    try {
      const result = await aiTrainingApi.runMessageAction(messageId, { action });
      if (action === 'save_as_case_candidate') {
        message.success('已加入案例候选');
      } else if (action === 'create_task_draft') {
        message.success(`任务草稿已生成 #${result.task_id}`);
      }
      await Promise.all([loadOverview(), loadSessions(), loadCaseLibrary(), loadMessages(selectedSessionId)]);
    } catch (error) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const reviewCandidate = async (id, action) => {
    try {
      await aiTrainingApi.reviewCaseCandidate(id, { action });
      message.success(action === 'approve' ? '案例候选已通过' : '案例候选已退回');
      await Promise.all([loadOverview(), loadCaseLibrary()]);
    } catch (error) {
      message.error(error.response?.data?.error || '审核失败');
    }
  };

  const createSkillDraftFromCase = async (caseId) => {
    if (!caseId) return;
    setCreatingSkillDraft(true);
    try {
      const result = await aiTrainingApi.createSkillDraftFromCase(caseId);
      message.success(result.reused ? '已定位到现有 Skill 草稿' : 'Skill 草稿已创建');
      await Promise.all([loadSkills(), loadEvalRuns(), loadStats()]);
      if (result.skill?.id) {
        setSelectedSkillId(result.skill.id);
      } else if (result.detail?.skill?.id) {
        setSelectedSkillId(result.detail.skill.id);
      }
      setTab('skills');
    } catch (error) {
      message.error(error.response?.data?.error || '创建 Skill 草稿失败');
    } finally {
      setCreatingSkillDraft(false);
    }
  };

  const createManualSkill = async () => {
    const values = await manualSkillForm.validateFields();
    setSkillActionLoading('create');
    try {
      const result = await aiTrainingApi.createSkill(values);
      message.success('Skill 草稿已创建');
      setManualSkillModalOpen(false);
      manualSkillForm.resetFields();
      await Promise.all([loadSkills(), loadEvalRuns(), loadStats()]);
      const nextSkillId = result?.skill?.id || result?.detail?.skill?.id;
      if (nextSkillId) {
        setSelectedSkillId(nextSkillId);
      }
      setTab('skills');
    } catch (error) {
      message.error(error.response?.data?.error || '创建 Skill 失败');
    } finally {
      setSkillActionLoading('');
    }
  };

  const evaluateCurrentSkill = async () => {
    if (!currentSkill?.id) return;
    setSkillActionLoading('evaluate');
    try {
      await aiTrainingApi.evaluateSkill(currentSkill.id);
      message.success('已发起重评测');
      await Promise.all([loadSkills(), loadEvalRuns(), loadStats(), loadSkillDetail(currentSkill.id)]);
      setTab('evals');
    } catch (error) {
      message.error(error.response?.data?.error || '发起评测失败');
    } finally {
      setSkillActionLoading('');
    }
  };

  const publishCurrentSkill = async () => {
    if (!currentSkill?.id) return;
    setSkillActionLoading('publish');
    try {
      await aiTrainingApi.publishSkill(currentSkill.id);
      message.success('Skill 已发布');
      await Promise.all([loadSkills(), loadEvalRuns(), loadStats(), loadSkillDetail(currentSkill.id)]);
    } catch (error) {
      message.error(error.response?.data?.error || '发布 Skill 失败');
    } finally {
      setSkillActionLoading('');
    }
  };

  const rollbackCurrentSkill = async () => {
    if (!currentSkill?.id) return;
    setSkillActionLoading('rollback');
    try {
      await aiTrainingApi.rollbackSkill(currentSkill.id);
      message.success('Skill 已回滚');
      await Promise.all([loadSkills(), loadEvalRuns(), loadStats(), loadSkillDetail(currentSkill.id)]);
    } catch (error) {
      message.error(error.response?.data?.error || '回滚 Skill 失败');
    } finally {
      setSkillActionLoading('');
    }
  };

  const overviewCards = [
    { title: '今日会话', value: overview.today_sessions, foot: '今日新发生的训练会话' },
    { title: '高质量会话', value: overview.high_quality_sessions, foot: '质量分大于等于 85' },
    { title: '案例库沉淀', value: overview.published_cases, foot: '已进入团队案例库' },
    { title: '待审核候选', value: overview.pending_candidates, foot: '等待负责人处理' },
  ];
  const isSessionListCollapsed = !isMobile && sessionListCollapsed;

  const sessionTab = (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          value={filters.business_line}
          style={{ width: 140 }}
          options={BUSINESS_LINE_OPTIONS}
          onChange={(value) => setFilters((prev) => ({ ...prev, business_line: value }))}
        />
        <Select
          value={filters.scene_code}
          style={{ width: 180 }}
          options={SCENE_OPTIONS}
          onChange={(value) => setFilters((prev) => ({ ...prev, scene_code: value }))}
        />
        <Search
          placeholder="搜索会话标题"
          allowClear
          style={{ width: isMobile ? '100%' : 260 }}
          value={filters.keyword}
          onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
          onSearch={loadSessions}
        />
      </Space>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={isSessionListCollapsed ? 1 : 6}>
          {isSessionListCollapsed ? (
            <div
              style={{
                minHeight: 420,
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                background: '#fff',
                display: 'flex',
                justifyContent: 'center',
                paddingTop: 10,
              }}
            >
              <Tooltip title="展开会话列表">
                <Button
                  type="text"
                  size="small"
                  aria-label="展开会话列表"
                  aria-expanded={false}
                  icon={<MenuUnfoldOutlined />}
                  onClick={() => setSessionListCollapsed(false)}
                  style={{ width: 32, height: 32 }}
                />
              </Tooltip>
            </div>
          ) : (
            <Card
              title={
                <Space size={8}>
                  {!isMobile && (
                    <Tooltip title="收起会话列表">
                      <Button
                        type="text"
                        size="small"
                        aria-label="收起会话列表"
                        aria-expanded
                        icon={<MenuFoldOutlined />}
                        onClick={() => setSessionListCollapsed(true)}
                        style={{ width: 32, height: 32 }}
                      />
                    </Tooltip>
                  )}
                  <span>会话列表</span>
                </Space>
              }
              extra={
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={loadSessions} />
                  {writable && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateSessionModal()}>新建</Button>}
                </Space>
              }
              bodyStyle={{ padding: 12 }}
            >
              <Spin spinning={sessionsLoading}>
                {sessions.length === 0 ? (
                  <Empty description="还没有训练会话" />
                ) : (
                  <List
                    dataSource={sessions}
                    renderItem={(item, index) => (
                      <List.Item style={{ padding: 0, border: 0, marginBottom: index === sessions.length - 1 ? 0 : 10 }}>
                        <Card
                          size="small"
                          hoverable
                          onClick={() => setSelectedSessionId(item.id)}
                          style={{
                            width: '100%',
                            background: item.id === selectedSessionId ? '#f7faff' : '#fff',
                            borderColor: item.id === selectedSessionId ? '#b9d1ff' : '#e5e7eb',
                          }}
                          bodyStyle={{ padding: 12 }}
                        >
                          <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            <Text strong>{item.title || '未命名会话'}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {item.owner_user_name || '我'} · {item.scene_label || '通用训练'}
                            </Text>
                            <Space size={[6, 6]} wrap>
                              <Tag>{item.business_line || '未分配业务线'}</Tag>
                              <Tag>{item.business_side || '未设视角'}</Tag>
                              {item.skill_name ? <Tag color="geekblue">{item.skill_name}</Tag> : <Tag>未绑定 Skill</Tag>}
                              <Tag>{item.message_count || 0} 条消息</Tag>
                              {qualityTag(item.quality_score)}
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              最近更新：{formatTime(item.last_message_at || item.updated_at || item.created_at)}
                            </Text>
                          </Space>
                        </Card>
                      </List.Item>
                    )}
                  />
                )}
              </Spin>
            </Card>
          )}
        </Col>

        <Col xs={24} xl={isSessionListCollapsed ? 16 : 11}>
          <Card
            title={currentSession ? currentSession.title : '聊天主窗口'}
            extra={
              currentSession ? (
                <Space wrap>
                  <Tag color="blue">{currentSession.scene_label || '通用训练'}</Tag>
                  <Tag color="purple">{currentSession.business_line || '未设置业务线'}</Tag>
                  <Tag>{currentSession.role_scope || currentSession.business_side || '未设置角色'}</Tag>
                  {currentSessionSkillName ? <Tag color="geekblue">{currentSessionSkillName}</Tag> : <Tag>未绑定 Skill</Tag>}
                  {currentSessionSkillVersion ? <Tag>版本 {currentSessionSkillVersion}</Tag> : null}
                </Space>
              ) : null
            }
            bodyStyle={{ padding: 12 }}
          >
            {!currentSession ? (
              <Empty description="先选择或新建一个训练会话" />
            ) : (
              <Spin spinning={messagesLoading}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 420 }}>
                  {messages.length === 0 && !pendingPrompt ? (
                    <Empty description="还没有对话，先发一条训练指令" />
                  ) : (
                    <>
                      {messages.map((item) => (
                        <ChatBubble
                          key={item.id}
                          item={item}
                          writable={writable}
                          onFeedback={handleFeedback}
                          onAction={handleMessageAction}
                        />
                      ))}
                      {sending && pendingPrompt ? (
                        <>
                          <ChatBubble
                            item={{
                              id: 'pending-user-message',
                              message_role: 'user',
                              content_text: pendingPrompt,
                              created_at: new Date().toISOString(),
                            }}
                            writable={false}
                            onFeedback={handleFeedback}
                            onAction={handleMessageAction}
                          />
                          <AssistantProcessingBubble
                            promptText={pendingPrompt}
                            skillName={currentSessionSkillName}
                            events={pendingEvents}
                          />
                        </>
                      ) : null}
                    </>
                  )}
                </div>

                <Card size="small" style={{ marginTop: 12 }} bodyStyle={{ padding: 12, background: '#fafbfd' }}>
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Space size={[8, 8]} wrap>
                      <Tag color="blue">场景：{currentSession.scene_label || '通用训练'}</Tag>
                      <Tag>输出：结论 / 证据 / 动作</Tag>
                      <Tag color={currentSessionSkillName ? 'geekblue' : 'default'}>
                        {currentSessionSkillName ? `Skill：${currentSessionSkillName}` : '通用 Agent：自动选择工具与 Skill'}
                      </Tag>
                      <Tag>{currentSession.visibility_scope === 'team' ? '团队可见' : '仅自己'}</Tag>
                    </Space>
                    <TextArea
                      rows={4}
                      value={composeValue}
                      onChange={(event) => setComposeValue(event.target.value)}
                      placeholder="输入消息，或使用 @skill-code 指定 Skill。"
                    />
                    <Space wrap>
                      <Button onClick={() => setActiveDraftByScene(currentSession.scene_code)}>插入推荐提问</Button>
                      <Button onClick={() => setTab('cases')}>查看案例库</Button>
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        loading={sending}
                        disabled={!writable}
                        onClick={sendMessage}
                      >
                        发送
                      </Button>
                    </Space>
                  </Space>
                </Card>
              </Spin>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={7}>
          <Card title="训练面板" bodyStyle={{ padding: 12 }}>
            {!currentSession ? (
              <Empty description="选择会话后查看上下文" />
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Text type="secondary">当前上下文</Text>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    {currentSession.business_line || '-'} · {currentSession.business_side || '-'} · {currentSession.scene_label || '-'}
                    <br />
                    Skill：{currentSessionSkillName || '未绑定，由通用 Agent 自动发现和调用'}
                    {currentSessionSkillVersion ? `（${currentSessionSkillVersion}）` : ''}
                    <br />
                    权限：{currentSession.visibility_scope === 'team' ? '团队共享' : '仅自己'}
                    <br />
                    创建人：{currentSession.owner_user_name || '我'}
                  </Paragraph>
                </Card>

                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Text type="secondary">当前运行引擎</Text>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    {lastRuntimeMeta?.model_name
                      ? `${runtimeDisplayName}：${lastRuntimeMeta.model_name}`
                      : runtimeStatus?.llm_enabled
                        ? `${runtimeSourceLabel(runtimeStatus.config_source)}待调用：${runtimeStatus.model_name || '已接通'}`
                        : `目标模型：${runtimeStatus?.target_model_name || runtimeStatus?.model_name || 'gpt-5.5'}（缺少 API Key）`}
                    <br />
                    路径：{lastRuntimeMeta?.mode || runtimeStatus?.preferred_runtime || 'deterministic'}
                    {lastRuntimeMeta?.candidate_selected ? (
                      <><br />结果：{lastRuntimeMeta.candidate_selected === 'llm_enhanced'
                        ? '模型增强结果'
                        : lastRuntimeMeta.candidate_selected === 'skill'
                          ? 'Skill 原结果'
                          : lastRuntimeMeta.candidate_selected === 'agent'
                            ? '通用 Agent 结果'
                            : '模型结果'}</>
                    ) : null}
                  </Paragraph>
                </Card>

                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Text type="secondary">会话质量分</Text>
                  <div style={{ marginTop: 10 }}>
                    <Progress percent={topSessionQuality} strokeColor={qualityColor(topSessionQuality)} />
                  </div>
                  <Text type="secondary">
                    {topSessionQuality >= 85 ? '已经接近可沉淀案例的质量。' : '继续补证据、补追问，质量会更稳。'}
                  </Text>
                </Card>

                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Text type="secondary">最近一次 AI 输出</Text>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    {lastAssistantMessage?.structured_json?.summary
                      || lastAssistantMessage?.content_text
                      || '暂时还没有 AI 回复。'}
                  </Paragraph>
                </Card>

                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Text type="secondary">下一步建议</Text>
                  <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
                    <Tag color="blue">1. 先把提问结构固定下来</Tag>
                    <Tag color="purple">2. 对高质量回复打反馈</Tag>
                    <Tag color="gold">3. 把成熟回复转成案例候选</Tag>
                  </Space>
                </Card>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );

  const casesTab = (
    <Spin spinning={libraryLoading}>
      <Tabs
        items={[
          {
            key: 'candidates',
            label: `候选池 (${caseCandidates.length})`,
            children: (
              <Row gutter={[12, 12]}>
                <Col xs={24} xl={11}>
                  <Card title="待审核案例候选" bodyStyle={{ padding: 12 }}>
                    {caseCandidates.length === 0 ? (
                      <Empty description="还没有案例候选" />
                    ) : (
                      <List
                        dataSource={caseCandidates}
                        renderItem={(item, index) => (
                          <List.Item style={{ padding: 0, border: 0, marginBottom: index === caseCandidates.length - 1 ? 0 : 10 }}>
                            <Card
                              size="small"
                              hoverable
                              onClick={() => setSelectedCandidateId(item.id)}
                              style={{
                                width: '100%',
                                background: item.id === selectedCandidateId ? '#f7faff' : '#fff',
                                borderColor: item.id === selectedCandidateId ? '#b9d1ff' : '#e5e7eb',
                              }}
                              bodyStyle={{ padding: 12 }}
                            >
                              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                <Text strong>{item.title}</Text>
                                <Text type="secondary">{item.owner_user_name || '-'} · {item.scene_code || '-'}</Text>
                                <Space size={[6, 6]} wrap>
                                  {candidateStatusTag(item.status)}
                                  {qualityTag(item.quality_score)}
                                  {(item.tags_json || []).slice(0, 3).map((tag) => <Tag key={`${item.id}-${tag}`}>{tag}</Tag>)}
                                </Space>
                              </Space>
                            </Card>
                          </List.Item>
                        )}
                      />
                    )}
                  </Card>
                </Col>

                <Col xs={24} xl={13}>
                  <Card
                    title="候选详情"
                    extra={
                      currentCandidate?.can_review && currentCandidate?.status === 'pending_review' ? (
                        <Space wrap>
                          <Button onClick={() => reviewCandidate(currentCandidate.id, 'reject')}>退回</Button>
                          <Button type="primary" onClick={() => reviewCandidate(currentCandidate.id, 'approve')}>通过入库</Button>
                        </Space>
                      ) : null
                    }
                  >
                    {!currentCandidate ? (
                      <Empty description="选择一个案例候选查看详情" />
                    ) : (
                      <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label="候选标题">{currentCandidate.title || '-'}</Descriptions.Item>
                        <Descriptions.Item label="原始提问">{currentCandidate.prompt_excerpt || '-'}</Descriptions.Item>
                        <Descriptions.Item label="回复摘要">{currentCandidate.response_excerpt || '-'}</Descriptions.Item>
                        <Descriptions.Item label="可复用方法">{currentCandidate.method_summary || '-'}</Descriptions.Item>
                        <Descriptions.Item label="业务结果">{currentCandidate.result_summary || '-'}</Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'library',
            label: `案例库 (${publishedCases.length})`,
            children: (
              <Row gutter={[12, 12]}>
                <Col xs={24} xl={11}>
                  <Card title="已发布案例" bodyStyle={{ padding: 12 }}>
                    {publishedCases.length === 0 ? (
                      <Empty description="案例库暂时为空" />
                    ) : (
                      <List
                        dataSource={publishedCases}
                        renderItem={(item, index) => (
                          <List.Item style={{ padding: 0, border: 0, marginBottom: index === publishedCases.length - 1 ? 0 : 10 }}>
                            <Card
                              size="small"
                              hoverable
                              onClick={() => setSelectedCaseId(item.id)}
                              style={{
                                width: '100%',
                                background: item.id === selectedCaseId ? '#f7faff' : '#fff',
                                borderColor: item.id === selectedCaseId ? '#b9d1ff' : '#e5e7eb',
                              }}
                              bodyStyle={{ padding: 12 }}
                            >
                              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                <Text strong>{item.title}</Text>
                                <Text type="secondary">{item.contributor_user_name || '-'} · {item.scene_label || '-'}</Text>
                                <Space size={[6, 6]} wrap>
                                  {qualityTag(item.quality_score)}
                                  {(item.tags_json || []).slice(0, 3).map((tag) => <Tag key={`${item.id}-${tag}`}>{tag}</Tag>)}
                                </Space>
                              </Space>
                            </Card>
                          </List.Item>
                        )}
                      />
                    )}
                  </Card>
                </Col>

                <Col xs={24} xl={13}>
                  <Card
                    title="案例详情"
                    extra={currentCase ? (
                      <Button
                        type="primary"
                        icon={<ToolOutlined />}
                        loading={creatingSkillDraft}
                        onClick={() => createSkillDraftFromCase(currentCase.id)}
                      >
                        生成 Skill 草稿
                      </Button>
                    ) : null}
                  >
                    {!currentCase ? (
                      <Empty description="选择一个案例查看详情" />
                    ) : (
                      <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label="案例标题">{currentCase.title || '-'}</Descriptions.Item>
                        <Descriptions.Item label="问题模板">{currentCase.prompt_text || '-'}</Descriptions.Item>
                        <Descriptions.Item label="AI答复">{currentCase.response_text || '-'}</Descriptions.Item>
                        <Descriptions.Item label="复用方法">{currentCase.reusable_method_text || '-'}</Descriptions.Item>
                        <Descriptions.Item label="业务结果">{currentCase.business_result_text || '-'}</Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </Spin>
  );

  const skillsTab = (
    <Row gutter={[12, 12]}>
      <Col xs={24} xl={10}>
        <Card
          title={`Skill 列表 (${skills.length})`}
          extra={(
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadSkills} />
              {writable && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setManualSkillModalOpen(true)}>
                  手动新建
                </Button>
              )}
            </Space>
          )}
          bodyStyle={{ padding: 12 }}
        >
          <Spin spinning={skillsLoading}>
            {skills.length === 0 ? (
              <Empty description="还没有 Skill，先从案例库生成草稿" />
            ) : (
              <List
                dataSource={skills}
                renderItem={(item, index) => (
                  <List.Item style={{ padding: 0, border: 0, marginBottom: index === skills.length - 1 ? 0 : 10 }}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => setSelectedSkillId(item.id)}
                      style={{
                        width: '100%',
                        background: item.id === selectedSkillId ? '#f7faff' : '#fff',
                        borderColor: item.id === selectedSkillId ? '#b9d1ff' : '#e5e7eb',
                      }}
                      bodyStyle={{ padding: 12 }}
                    >
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Text strong>{item.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.business_line || '-'} · {item.scene_code || '-'}
                        </Text>
                        <Space size={[6, 6]} wrap>
                          {skillStatusTag(item.status)}
                          <Tag>版本 {item.version_count || 0}</Tag>
                          <Tag>Hook {item.hook_count || 0}</Tag>
                          <Tag>评测样本 {item.example_count || 0}</Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          最近更新：{formatTime(item.updated_at)}
                        </Text>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </Spin>
        </Card>
      </Col>
      <Col xs={24} xl={14}>
        <Card
          title={currentSkill?.name || 'Skill 详情'}
          extra={currentSkill ? (
            <Space wrap>
              {currentSkill.status === 'published' ? (
                <Button
                  type="default"
                  onClick={() => openCreateSessionModal({
                    title: `${currentSkill.name} 会话`,
                    scene_code: currentSkill.scene_code || SESSION_CREATE_INITIAL_VALUES.scene_code,
                    business_line: currentSkill.business_line || SESSION_CREATE_INITIAL_VALUES.business_line,
                    business_side: currentSkill.business_side || SESSION_CREATE_INITIAL_VALUES.business_side,
                    budget_side: currentSkill.budget_side || SESSION_CREATE_INITIAL_VALUES.budget_side,
                    role_scope: currentSkill.role_scope || SESSION_CREATE_INITIAL_VALUES.role_scope,
                    skill_id: currentSkill.id,
                  })}
                >
                  用此 Skill 新建会话
                </Button>
              ) : null}
              {canManageCurrentSkill ? (
                <>
                  <Button
                    loading={skillActionLoading === 'evaluate'}
                    onClick={evaluateCurrentSkill}
                  >
                    发起重评测
                  </Button>
                  <Button
                    type="primary"
                    loading={skillActionLoading === 'publish'}
                    onClick={publishCurrentSkill}
                  >
                    发布
                  </Button>
                  <Button
                    loading={skillActionLoading === 'rollback'}
                    onClick={rollbackCurrentSkill}
                  >
                    回滚
                  </Button>
                </>
              ) : null}
            </Space>
          ) : null}
          bodyStyle={{ padding: 16 }}
        >
          <Spin spinning={skillDetailLoading}>
            {!currentSkill ? (
              <Empty description="选择一个 Skill 查看详情" />
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="状态">{skillStatusTag(skillDetail?.skill?.status || currentSkill.status)}</Descriptions.Item>
                  <Descriptions.Item label="基础信息">
                    {skillDetail?.skill?.description || currentSkill.description || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="适用范围">
                    {(skillDetail?.skill?.business_line || currentSkill.business_line || '-')} / {(skillDetail?.skill?.business_side || currentSkill.business_side || '-')} / {(skillDetail?.skill?.role_scope || currentSkill.role_scope || '-')}
                  </Descriptions.Item>
                  <Descriptions.Item label="最新版本">
                    {skillDetail?.latest_version?.version_no || currentSkill.latest_version_no || '-'}
                    {skillDetail?.latest_version?.version_label ? ` · ${skillDetail.latest_version.version_label}` : ''}
                    {skillStatusTag(skillDetail?.latest_version?.status || currentSkill.latest_version_status)}
                  </Descriptions.Item>
                  <Descriptions.Item label="系统提示词">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{skillDetail?.latest_version?.system_prompt || '-'}</div>
                  </Descriptions.Item>
                  <Descriptions.Item label="推理步骤">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{skillDetail?.latest_version?.reasoning_steps_text || '-'}</div>
                  </Descriptions.Item>
                  <Descriptions.Item label="输出模板">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{skillDetail?.latest_version?.output_template_text || '-'}</div>
                  </Descriptions.Item>
                </Descriptions>

                <div>
                  <Text strong>绑定 Hook</Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    {(skillDetail?.hooks || []).length > 0
                      ? skillDetail.hooks.map((hook) => (
                        <Tag key={hook.id} color={hook.hook_stage === 'pre' ? 'blue' : hook.hook_stage === 'mid' ? 'purple' : 'green'}>
                          {hook.name}
                        </Tag>
                      ))
                      : <Text type="secondary">暂无 Hook 绑定</Text>}
                  </Space>
                </div>

                <div>
                  <Text strong>Few-shot 示例</Text>
                  <List
                    style={{ marginTop: 8 }}
                    locale={{ emptyText: '暂无示例' }}
                    dataSource={skillDetail?.examples || []}
                    renderItem={(item) => (
                      <List.Item style={{ paddingInline: 0 }}>
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text>{item.source_case_title || item.note_text || '未命名示例'}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            输入：{item.input_text || '-'}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </div>

                <div>
                  <Text strong>版本记录</Text>
                  <List
                    style={{ marginTop: 8 }}
                    locale={{ emptyText: '暂无版本记录' }}
                    dataSource={skillDetail?.versions || []}
                    renderItem={(item) => (
                      <List.Item style={{ paddingInline: 0 }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                          <Space wrap>
                            <Text>{item.version_no}{item.version_label ? ` · ${item.version_label}` : ''}</Text>
                            {skillStatusTag(item.status)}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatTime(item.updated_at)}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </div>

                <div>
                  <Text strong>最近评测</Text>
                  <List
                    style={{ marginTop: 8 }}
                    locale={{ emptyText: '暂无评测记录' }}
                    dataSource={skillDetail?.recent_eval_runs || []}
                    renderItem={(item) => (
                      <List.Item style={{ paddingInline: 0 }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                          <Space direction="vertical" size={2}>
                            <Space wrap>
                              {evalRunStatusTag(item.run_status)}
                              <Tag>{item.skill_version_no || '-'}</Tag>
                              <Tag>通过率 {formatScorePercent(item.pass_rate)}</Tag>
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              准确性 {formatScorePercent(item.avg_accuracy)} · 结构 {formatScorePercent(item.avg_structure_score)}
                            </Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatTime(item.started_at)}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </div>
              </Space>
            )}
          </Spin>
        </Card>
      </Col>
    </Row>
  );

  const evalsTab = (
    <Spin spinning={evalLoading}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Text type="secondary">评测运行数</Text>
              <Title level={3} style={{ margin: '8px 0 0' }}>{evalRuns.length}</Title>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Text type="secondary">最近通过率</Text>
              <Title level={3} style={{ margin: '8px 0 0' }}>
                {evalRuns[0] ? formatScorePercent(evalRuns[0].pass_rate) : '-'}
              </Title>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Text type="secondary">最近准确性</Text>
              <Title level={3} style={{ margin: '8px 0 0' }}>
                {evalRuns[0] ? formatScorePercent(evalRuns[0].avg_accuracy) : '-'}
              </Title>
            </Card>
          </Col>
        </Row>

        <Card title="评测记录" extra={<Button icon={<ReloadOutlined />} onClick={loadEvalRuns} />}>
          {evalRuns.length === 0 ? (
            <Empty description="还没有评测记录，先从案例生成一个 Skill 草稿" />
          ) : (
            <List
              dataSource={evalRuns}
              renderItem={(item) => (
                <List.Item style={{ paddingInline: 0 }}>
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.skill_name || '-'}</Text>
                      <Tag>{item.skill_version_no || '-'}</Tag>
                      {evalRunStatusTag(item.run_status)}
                      <Tag>评测集：{item.eval_set_name || '-'}</Tag>
                    </Space>
                    <Space size={[8, 8]} wrap>
                      <Tag>通过率 {formatScorePercent(item.pass_rate)}</Tag>
                      <Tag>准确性 {formatScorePercent(item.avg_accuracy)}</Tag>
                      <Tag>结构 {formatScorePercent(item.avg_structure_score)}</Tag>
                      <Tag>证据 {formatScorePercent(item.avg_evidence_score)}</Tag>
                      <Tag>可执行性 {formatScorePercent(item.avg_actionability_score)}</Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      运行时间：{formatTime(item.started_at)} · 样本 {item.total_cases || 0} / 通过 {item.pass_cases || 0}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </Card>
      </Space>
    </Spin>
  );

  const statsTab = (
    <Spin spinning={statsLoading}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Card title="人员训练榜" bodyStyle={{ padding: 12 }}>
            {statsData.user_ranking.length === 0 ? (
              <Empty description="暂时还没有可统计的数据" />
            ) : (
              <List
                dataSource={statsData.user_ranking}
                renderItem={(item, index) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                      <Space direction="vertical" size={2}>
                        <Text strong>{index + 1}. {item.name || '未命名成员'}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          高质量会话 {item.high_quality_session_count || 0} · 案例 {item.published_case_count || 0} · Skill {item.skill_count || 0}
                        </Text>
                      </Space>
                      <Tag color="blue">{item.session_count || 0} 会话</Tag>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Skill 复用榜" bodyStyle={{ padding: 12 }}>
            {statsData.skill_ranking.length === 0 ? (
              <Empty description="还没有 Skill 复用数据" />
            ) : (
              <List
                dataSource={statsData.skill_ranking}
                renderItem={(item, index) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                      <Space direction="vertical" size={2}>
                        <Text strong>{index + 1}. {item.name || '-'}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          使用人数 {item.unique_user_count || 0} · 采纳 {item.adopted_count || 0}
                        </Text>
                      </Space>
                      <Tag color="purple">{item.call_count || 0} 调用</Tag>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="场景分布" bodyStyle={{ padding: 12 }}>
            <Space wrap>
              {(statsData.scene_breakdown || []).length > 0
                ? statsData.scene_breakdown.map((item) => (
                  <Tag key={item.scene_code} color="blue">
                    {item.scene_label} {item.session_count}
                  </Tag>
                ))
                : <Text type="secondary">还没有场景分布数据</Text>}
            </Space>
          </Card>
        </Col>
      </Row>
    </Spin>
  );

  const tabContentMap = {
    sessions: sessionTab,
    cases: casesTab,
    skills: skillsTab,
    evals: evalsTab,
    stats: statsTab,
  };

  return (
    <div>
      <Modal
        title="手动新建 Skill"
        open={manualSkillModalOpen}
        onCancel={() => {
          setManualSkillModalOpen(false);
          manualSkillForm.resetFields();
        }}
        onOk={createManualSkill}
        okText="创建 Skill"
        confirmLoading={skillActionLoading === 'create'}
        width={760}
      >
        <Form
          form={manualSkillForm}
          layout="vertical"
          initialValues={{
            business_line: 'zhixiao',
            business_side: '预算侧',
            budget_side: 'C端',
            scene_code: 'revenue_diagnosis',
            role_scope: 'strategy',
            visibility_scope: 'team',
          }}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="Skill 名称" name="name" rules={[{ required: true, message: '请输入 Skill 名称' }]}>
                <Input placeholder="例如：支小收入回撤排查" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="场景" name="scene_code" rules={[{ required: true, message: '请选择场景' }]}>
                <Select options={SESSION_CREATE_SCENES} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="业务线" name="business_line" rules={[{ required: true, message: '请选择业务线' }]}>
                <Select options={SESSION_CREATE_LINES} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="业务侧" name="business_side" rules={[{ required: true, message: '请选择业务侧' }]}>
                <Select options={BUSINESS_SIDE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="预算侧" name="budget_side">
                <Select options={[{ value: 'C端', label: 'C端' }, { value: 'B端', label: 'B端' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="角色" name="role_scope" rules={[{ required: true, message: '请选择角色' }]}>
                <Select options={ROLE_SCOPE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="简介" name="description">
            <TextArea rows={3} placeholder="说明这个 Skill 解决什么问题、适用于什么业务场景。" />
          </Form.Item>
          <Form.Item label="系统提示词" name="system_prompt">
            <TextArea rows={4} placeholder="例如：你是一个聚焦支小收入异常诊断的业务分析助手……" />
          </Form.Item>
          <Form.Item label="推理步骤" name="reasoning_steps_text">
            <TextArea rows={4} placeholder="例如：1.确认时间范围；2.判断量还是结构；3.补证据；4.给动作建议。" />
          </Form.Item>
          <Form.Item label="输出模板" name="output_template_text">
            <TextArea rows={4} placeholder="例如：结论摘要 / 核心证据 / 风险提醒 / 下一步建议" />
          </Form.Item>
          <Form.Item label="防呆规则" name="guardrails_text">
            <TextArea rows={3} placeholder="例如：禁止只给结论不写证据；时间范围缺失时必须追问。" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建训练会话"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={createSession}
        okText="创建"
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={SESSION_CREATE_INITIAL_VALUES}
        >
          <Form.Item label="会话标题" name="title">
            <Input placeholder="例如：分析一份业务数据，或处理一个日常任务" />
          </Form.Item>
          <Form.Item label="场景" name="scene_code" rules={[{ required: true, message: '请选择场景' }]}>
            <Select options={SESSION_CREATE_SCENES} />
          </Form.Item>
          <Form.Item label="业务线（可选）" name="business_line">
            <Select options={BUSINESS_LINE_OPTIONS} placeholder="通用任务可不限定业务线" />
          </Form.Item>
          <Form.Item label="视角（可选）" name="business_side">
            <Select allowClear options={BUSINESS_SIDE_OPTIONS} placeholder="需要业务视角时再选择" />
          </Form.Item>
          <Form.Item label="预算侧（可选）" name="budget_side">
            <Select allowClear options={[{ value: 'C端', label: 'C端' }, { value: 'B端', label: 'B端' }]} />
          </Form.Item>
          <Form.Item label="角色（可选）" name="role_scope">
            <Select allowClear options={ROLE_SCOPE_OPTIONS} placeholder="需要岗位口径时再选择" />
          </Form.Item>
          <Form.Item label="绑定已发布 Skill" name="skill_id">
            <Select
              allowClear
              placeholder="不指定则由通用 Agent 自动选择工具和 Skill"
              options={publishedSkillOptions}
              onChange={handleCreateSkillChange}
            />
          </Form.Item>
          <Form.Item label="可见范围" name="visibility_scope" rules={[{ required: true, message: '请选择可见范围' }]}>
            <Select options={VISIBILITY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <div>
          <Space align="center" size={8} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/agents')}>返回 Agent 中台</Button>
            <Title level={4} style={{ margin: 0 }}>AI训练台</Title>
            <Tag color="blue">把个人会话沉淀为组织能力</Tag>
          </Space>
          <Text type="secondary">
            先用真实业务问题训练，再把高质量问法和答法转成案例资产，后续再进阶成 Skill。
          </Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={refreshCore}>刷新</Button>
          <Button icon={<TeamOutlined />} onClick={() => setTab('cases')}>查看案例库</Button>
          {writable && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateSessionModal()}>新建训练会话</Button>}
        </Space>
      </Space>

      {runtimeStatus ? (
        <Alert
          style={{ marginBottom: 16 }}
          type={runtimeStatus.llm_enabled ? 'success' : 'warning'}
          showIcon
          message={runtimeStatus.status_text || (runtimeStatus.llm_enabled ? '已接入系统小模型' : '当前使用规则模式')}
          description={
            runtimeStatus.llm_enabled
              ? `${runtimeSourceLabel(runtimeStatus.config_source)}：${runtimeStatus.model_name || '已接通'}${runtimeStatus.base_url ? ` · ${runtimeStatus.base_url}` : ''}。未显式指定 Skill 时进入通用 Agent，由模型自主选择工具和已发布 Skill。${connectorStatusText(runtimeStatus.connectors)}。`
              : `${runtimeStatus.setup_hint || '当前未配置系统模型，训练台会先走规则模式。'} 目标模型：${runtimeStatus.target_model_name || runtimeStatus.model_name || 'gpt-5.5'}。`
          }
          action={user?.role === 'admin' ? (
            <Button size="small" icon={<SettingOutlined />} onClick={() => navigate('/system-settings')}>
              去配置
            </Button>
          ) : null}
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {overviewCards.map((item) => (
          <Col xs={12} md={6} key={item.title}>
            <Card size="small">
              <Text type="secondary">{item.title}</Text>
              <Title level={3} style={{ margin: '8px 0 4px' }}>{item.value}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.foot}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card bodyStyle={{ padding: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setTab}
          items={TAB_OPTIONS.map((item) => ({
            key: item.key,
            label: <Space size={6}>{item.icon}<span>{item.label}</span></Space>,
            children: <div style={{ marginTop: 8 }}>{tabContentMap[item.key] || <Empty />}</div>,
          }))}
        />
      </Card>
    </div>
  );
}
