import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, Col, Descriptions, Drawer, Empty, Form, Grid, Input,
  InputNumber, List, message, Modal, Popconfirm, Row, Select, Space, Switch,
  Table, Tabs, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, EditOutlined, EyeOutlined,
  PlayCircleOutlined, PlusOutlined, ReloadOutlined, RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { agentsApi, teamsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import { formatBusinessDateTime } from '../utils/businessTime';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

const statusMap = {
  pending_review: { label: '待审核', color: 'orange' },
  needs_info: { label: '需补充', color: 'gold' },
  accepted: { label: '已采纳', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
  closed: { label: '已关闭', color: 'default' },
};

const priorityMap = {
  low: { label: '低', color: 'default' },
  medium: { label: '中', color: 'blue' },
  high: { label: '高', color: 'red' },
  urgent: { label: '紧急', color: 'magenta' },
};

const runStatusMap = {
  pending: { label: '待运行', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

const eventOptions = [
  { value: 'agent_budget_research_completed', label: '预算研究完成' },
  { value: 'agent_budget_opportunity_created', label: '新预算机会' },
  { value: 'agent_budget_opportunity_needs_info', label: '机会需补充' },
  { value: 'agent_budget_opportunity_accepted', label: '机会已采纳' },
];

const roleOptions = [
  { value: 'admin', label: '管理员' },
  { value: 'sales_director', label: '商务总监' },
  { value: 'cmo', label: 'CMO' },
  { value: 'ceo', label: 'CEO' },
  { value: 'coo', label: 'COO' },
  { value: 'cto', label: 'CTO' },
];

const departmentOptions = [
  { value: 'commercial', label: '商务部' },
  { value: 'operation', label: '产运部' },
  { value: 'rd', label: '研发部' },
  { value: 'general', label: '综合部' },
];

function formatTime(value) {
  return formatBusinessDateTime(value);
}

function statusTag(value) {
  const cfg = statusMap[value] || { label: value || '-', color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function priorityTag(value) {
  const cfg = priorityMap[value] || { label: value || '-', color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function runStatusTag(value) {
  const cfg = runStatusMap[value] || { label: value || '-', color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function percentText(value) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(Number(value) * 100)}%`;
}

function StatCard({ title, value, suffix, color }) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Text type="secondary">{title}</Text>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || '#111827', marginTop: 6 }}>
        {value ?? 0}{suffix || ''}
      </div>
    </Card>
  );
}

export default function AgentOperations() {
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { canWrite } = useAuth();
  const writable = canWrite?.();
  const [activeTab, setActiveTab] = useState('opportunities');
  const [agents, setAgents] = useState([]);
  const [runs, setRuns] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [summary, setSummary] = useState({ overview: {}, status_stats: [], priority_stats: [] });
  const [rules, setRules] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', priority: '', keyword: '' });
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewModal, setReviewModal] = useState({ open: false, action: null, record: null });
  const [reviewForm] = Form.useForm();
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm] = Form.useForm();
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm] = Form.useForm();

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRows, runRows, summaryData, opportunityRows, ruleRows] = await Promise.all([
        agentsApi.definitions(),
        agentsApi.runs({ limit: 30 }),
        agentsApi.budgetSummary(),
        agentsApi.budgetOpportunities({ ...filters, limit: 100 }),
        agentsApi.notificationRules(),
      ]);
      setAgents(agentRows);
      setRuns(runRows);
      setSummary(summaryData);
      setOpportunities(opportunityRows);
      setRules(ruleRows);
    } catch (e) {
      message.error(e.response?.data?.error || '加载 Agent 中台失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadMeta = useCallback(async () => {
    try {
      const [userRows, teamRows] = await Promise.all([
        usersApi.listSimple(),
        teamsApi.list(),
      ]);
      setUsers(userRows);
      setTeams(teamRows);
    } catch {
      // 元信息加载失败不影响主流程。
    }
  }, []);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const overview = summary.overview || {};

  const runBudgetResearch = async () => {
    setRunLoading(true);
    try {
      const result = await agentsApi.runBudgetResearch({
        run_type: 'manual',
        trigger_source: 'agent_operations_page',
      });
      message.success(result.output_summary || `已生成 ${result.created || 0} 条预算机会`);
      loadCore();
    } catch (e) {
      message.error(e.response?.data?.error || '运行失败');
    } finally {
      setRunLoading(false);
    }
  };

  const openDetail = async (record) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      setDetail(await agentsApi.getBudgetOpportunity(record.id));
    } catch (e) {
      message.error(e.response?.data?.error || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openReview = (record, action) => {
    setReviewModal({ open: true, action, record });
    reviewForm.setFieldsValue({
      assignee_id: record.assignee_id,
      create_task: true,
      review_note: action === 'accept' ? '采纳进入线索池，由商务跟进预算对接条件。' : '',
    });
  };

  const submitReview = async () => {
    const values = await reviewForm.validateFields();
    const { record, action } = reviewModal;
    try {
      await agentsApi.reviewBudgetOpportunity(record.id, { ...values, action });
      message.success('审核已保存');
      setReviewModal({ open: false, action: null, record: null });
      reviewForm.resetFields();
      setDetail(null);
      loadCore();
    } catch (e) {
      message.error(e.response?.data?.error || '审核失败');
    }
  };

  const openManual = () => {
    manualForm.resetFields();
    manualForm.setFieldsValue({
      platform_type: 'alipay_mini_program',
      acceptable_carriers: '支付宝小程序、微信小游戏、H5',
      opportunity_score: 70,
      confidence: 0.6,
      priority: 'medium',
      status: 'pending_review',
    });
    setManualModalOpen(true);
  };

  const submitManual = async () => {
    const values = await manualForm.validateFields();
    try {
      await agentsApi.createBudgetOpportunity(values);
      message.success('预算机会已进入审核台');
      setManualModalOpen(false);
      loadCore();
    } catch (e) {
      message.error(e.response?.data?.error || '保存失败');
    }
  };

  const openRule = (record = null) => {
    setEditingRule(record);
    ruleForm.resetFields();
    ruleForm.setFieldsValue(record ? { ...record, enabled: !!record.enabled } : {
      event_type: 'agent_budget_opportunity_created',
      department_scope: 'commercial',
      enabled: true,
    });
    setRuleModalOpen(true);
  };

  const submitRule = async () => {
    const values = await ruleForm.validateFields();
    try {
      if (editingRule) await agentsApi.updateNotificationRule(editingRule.id, values);
      else await agentsApi.createNotificationRule(values);
      message.success('通知规则已保存');
      setRuleModalOpen(false);
      loadCore();
    } catch (e) {
      message.error(e.response?.data?.error || '保存失败');
    }
  };

  const deleteRule = async (id) => {
    try {
      await agentsApi.deleteNotificationRule(id);
      message.success('已删除');
      loadCore();
    } catch (e) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: '预算机会',
      key: 'name',
      fixed: isMobile ? false : 'left',
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <a onClick={() => openDetail(record)} style={{ fontWeight: 600 }}>{record.budget_partner}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.budget_product || '-'}</Text>
        </Space>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 96, render: statusTag },
    { title: '优先级', dataIndex: 'priority', width: 88, render: priorityTag },
    {
      title: '评分',
      dataIndex: 'opportunity_score',
      width: 90,
      sorter: (a, b) => (a.opportunity_score || 0) - (b.opportunity_score || 0),
      render: val => <Badge color={val >= 80 ? '#ef4444' : val >= 65 ? '#f59e0b' : '#6b7280'} text={val ?? '-'} />,
    },
    { title: '置信度', dataIndex: 'confidence', width: 90, render: percentText },
    { title: '平台', dataIndex: 'platform_type', width: 140, ellipsis: true },
    { title: '广告形式', dataIndex: 'ad_format', width: 140, ellipsis: true },
    { title: '负责人', dataIndex: 'assignee_name', width: 110, render: val => val || '-' },
    { title: '创建时间', dataIndex: 'created_at', width: 140, render: formatTime },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: isMobile ? false : 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
          {writable && ['pending_review', 'needs_info'].includes(record.status) && (
            <>
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => openReview(record, 'accept')}>采纳</Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openReview(record, 'needs_info')}>补充</Button>
              <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => openReview(record, 'reject')}>拒绝</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const agentCards = useMemo(() => agents.map(agent => (
    <Col xs={24} md={12} xl={8} key={agent.id}>
      <Card size="small" style={{ height: '100%' }}>
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space align="start">
            <RobotOutlined style={{ color: '#4f46e5', fontSize: 20, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>{agent.name}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{agent.agent_type} · {agent.owner_role || '-'}</Text>
            </div>
          </Space>
          <Tag color={agent.status === 'active' ? 'green' : 'default'}>{agent.status}</Tag>
        </Space>
        <Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 12, marginBottom: 8 }}>{agent.description}</Paragraph>
        <Text type="secondary" style={{ fontSize: 12 }}>运行 {agent.run_count || 0} 次 · 最近 {formatTime(agent.last_run_at)}</Text>
      </Card>
    </Col>
  )), [agents]);

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Agent 经营中台</Typography.Title>
          <Text type="secondary">预算研究闭环 v1：Agent 产出机会，人审核后转线索和任务。</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadCore}>刷新</Button>
          <Button icon={<RobotOutlined />} onClick={() => navigate('/agents/ai-training')}>进入 AI训练台</Button>
          {writable && <Button icon={<PlusOutlined />} onClick={openManual}>手动录入机会</Button>}
          {writable && (
            <Button type="primary" icon={<PlayCircleOutlined />} loading={runLoading} onClick={runBudgetResearch}>
              运行预算研究
            </Button>
          )}
        </Space>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Text strong style={{ fontSize: 14 }}>AI训练台</Text>
            <div>
              <Text type="secondary">
                在 Agent 中台下新增 AI 会话训练入口，支持聊天留痕、优秀案例沉淀、Skill 工坊和评测中心。
              </Text>
            </div>
          </div>
          <Space wrap>
            <Tag color="blue">会话工作台</Tag>
            <Tag color="purple">案例库</Tag>
            <Tag color="gold">Skill 工坊</Tag>
            <Tag color="green">评测中心</Tag>
            <Button type="primary" icon={<RobotOutlined />} onClick={() => navigate('/agents/ai-training')}>
              打开 AI训练台
            </Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><StatCard title="预算机会" value={overview.total || 0} /></Col>
        <Col xs={12} md={6}><StatCard title="待审核" value={overview.pending_review || 0} color="#f59e0b" /></Col>
        <Col xs={12} md={6}><StatCard title="已采纳" value={overview.accepted || 0} color="#16a34a" /></Col>
        <Col xs={12} md={6}><StatCard title="平均置信度" value={Math.round((overview.avg_confidence || 0) * 100)} suffix="%" color="#4f46e5" /></Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'opportunities',
            label: '预算机会审核台',
            children: (
              <Card>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Select placeholder="状态" allowClear value={filters.status || undefined} style={{ width: 130 }} onChange={v => setFilters({ ...filters, status: v || '' })}>
                    {Object.entries(statusMap).map(([value, cfg]) => <Option key={value} value={value}>{cfg.label}</Option>)}
                  </Select>
                  <Select placeholder="优先级" allowClear value={filters.priority || undefined} style={{ width: 120 }} onChange={v => setFilters({ ...filters, priority: v || '' })}>
                    {Object.entries(priorityMap).map(([value, cfg]) => <Option key={value} value={value}>{cfg.label}</Option>)}
                  </Select>
                  <Input.Search
                    placeholder="搜索预算方/产品/证据"
                    allowClear
                    style={{ width: isMobile ? '100%' : 260 }}
                    value={filters.keyword}
                    onChange={e => setFilters({ ...filters, keyword: e.target.value })}
                    onSearch={loadCore}
                  />
                </Space>
                <Table
                  rowKey="id"
                  loading={loading}
                  columns={columns}
                  dataSource={opportunities}
                  scroll={{ x: 1280 }}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                />
              </Card>
            ),
          },
          {
            key: 'agents',
            label: 'Agent 调度中心',
            children: (
              <Row gutter={[12, 12]}>
                {agentCards}
              </Row>
            ),
          },
          {
            key: 'runs',
            label: '运行记录',
            children: (
              <Card>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={runs}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'Agent', dataIndex: 'agent_name', width: 180 },
                    { title: '状态', dataIndex: 'status', width: 100, render: runStatusTag },
                    { title: '触发', dataIndex: 'trigger_source', width: 120 },
                    { title: '输入摘要', dataIndex: 'input_summary', ellipsis: true },
                    { title: '输出摘要', dataIndex: 'output_summary', ellipsis: true },
                    { title: '开始时间', dataIndex: 'started_at', width: 150, render: formatTime },
                    { title: '结束时间', dataIndex: 'finished_at', width: 150, render: formatTime },
                  ]}
                  scroll={{ x: 1100 }}
                />
              </Card>
            ),
          },
          {
            key: 'rules',
            label: '通知规则',
            children: (
              <Card
                extra={writable && <Button icon={<SettingOutlined />} onClick={() => openRule()}>新增规则</Button>}
              >
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={rules}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: '事件', dataIndex: 'event_type', render: val => eventOptions.find(item => item.value === val)?.label || val },
                    { title: '角色', dataIndex: 'role_scope', render: val => roleOptions.find(item => item.value === val)?.label || val || '-' },
                    { title: '部门', dataIndex: 'department_scope', render: val => departmentOptions.find(item => item.value === val)?.label || val || '-' },
                    { title: '团队', dataIndex: 'team_name', render: val => val || '-' },
                    { title: '用户', dataIndex: 'user_name', render: val => val || '-' },
                    { title: '启用', dataIndex: 'enabled', render: val => <Tag color={val ? 'green' : 'default'}>{val ? '启用' : '停用'}</Tag> },
                    {
                      title: '操作',
                      render: (_, record) => writable && (
                        <Space>
                          <Button size="small" onClick={() => openRule(record)}>编辑</Button>
                          <Popconfirm title="确认删除？" onConfirm={() => deleteRule(record.id)}>
                            <Button size="small" danger>删除</Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        title="预算机会详情"
        open={!!detail}
        onClose={() => setDetail(null)}
        width={isMobile ? '100%' : 720}
        loading={detailLoading}
      >
        {detail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="预算方">{detail.budget_partner}</Descriptions.Item>
              <Descriptions.Item label="预算产品">{detail.budget_product || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
              <Descriptions.Item label="优先级">{priorityTag(detail.priority)}</Descriptions.Item>
              <Descriptions.Item label="评分/置信度">{detail.opportunity_score ?? '-'} / {percentText(detail.confidence)}</Descriptions.Item>
              <Descriptions.Item label="平台/广告">{detail.platform_type || '-'} / {detail.ad_format || '-'}</Descriptions.Item>
              <Descriptions.Item label="承接形态">{detail.acceptable_carriers || '-'}</Descriptions.Item>
              <Descriptions.Item label="目标媒体">{detail.target_media || '-'}</Descriptions.Item>
              <Descriptions.Item label="负责人">{detail.assignee_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="线索/任务">
                {detail.lead_id ? `线索 #${detail.lead_id}` : '-'} {detail.task_id ? ` / 任务 #${detail.task_id}` : ''}
              </Descriptions.Item>
            </Descriptions>
            <Card size="small" title="Agent 判断">
              <Paragraph><Text strong>证据摘要：</Text>{detail.evidence_summary || '-'}</Paragraph>
              <Paragraph><Text strong>适配理由：</Text>{detail.fit_reason || '-'}</Paragraph>
              <Paragraph><Text strong>风险提示：</Text>{detail.risk_notes || '-'}</Paragraph>
              <Paragraph><Text strong>下一步：</Text>{detail.next_action || '-'}</Paragraph>
              {detail.evidence_link_list?.length > 0 ? (
                <List
                  size="small"
                  header="证据链接"
                  dataSource={detail.evidence_link_list}
                  renderItem={item => <List.Item><a href={item} target="_blank" rel="noreferrer">{item}</a></List.Item>}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无证据链接" />}
            </Card>
            {['pending_review', 'needs_info'].includes(detail.status) && writable && (
              <Space wrap>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openReview(detail, 'accept')}>采纳并转线索</Button>
                <Button icon={<EditOutlined />} onClick={() => openReview(detail, 'needs_info')}>要求补充</Button>
                <Button danger icon={<CloseCircleOutlined />} onClick={() => openReview(detail, 'reject')}>拒绝</Button>
              </Space>
            )}
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title={reviewModal.action === 'accept' ? '采纳预算机会' : reviewModal.action === 'needs_info' ? '要求补充信息' : '拒绝预算机会'}
        open={reviewModal.open}
        onCancel={() => setReviewModal({ open: false, action: null, record: null })}
        onOk={submitReview}
        okText="确认"
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="assignee_id" label="负责人" rules={[{ required: reviewModal.action !== 'reject', message: '请选择负责人' }]}>
            <Select placeholder="选择负责人" allowClear showSearch optionFilterProp="children">
              {users.map(u => <Option key={u.id} value={u.id}>{u.display_name || u.username}</Option>)}
            </Select>
          </Form.Item>
          {reviewModal.action === 'accept' && (
            <Form.Item name="create_task" valuePropName="checked">
              <Switch checkedChildren="生成跟进任务" unCheckedChildren="不生成任务" />
            </Form.Item>
          )}
          <Form.Item name="review_note" label="审核备注">
            <TextArea rows={4} placeholder="记录采纳理由、需补充项或关闭原因" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="手动录入预算机会"
        open={manualModalOpen}
        onCancel={() => setManualModalOpen(false)}
        onOk={submitManual}
        width={isMobile ? '100%' : 760}
      >
        <Form form={manualForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="budget_partner" label="预算方" rules={[{ required: true, message: '请输入预算方' }]}>
                <Input placeholder="如：支付宝灯火广告" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="budget_product" label="预算产品">
                <Input placeholder="如：支付宝小程序任务预算" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="platform_type" label="平台类型">
                <Input placeholder="alipay_mini_program / h5 / wechat_game" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="ad_format" label="广告形式">
                <Input placeholder="激励视频 / 信息流 / 联盟广告" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="opportunity_score" label="机会评分">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="confidence" label="置信度">
                <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="priority" label="优先级">
                <Select>
                  {Object.entries(priorityMap).map(([value, cfg]) => <Option key={value} value={value}>{cfg.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="assignee_id" label="负责人">
                <Select placeholder="默认分配给商务负责人" allowClear showSearch optionFilterProp="children">
                  {users.map(u => <Option key={u.id} value={u.id}>{u.display_name || u.username}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="acceptable_carriers" label="可承接形态">
            <Input placeholder="支付宝小程序、微信小游戏、H5" />
          </Form.Item>
          <Form.Item name="evidence_links" label="证据链接">
            <TextArea rows={2} placeholder="每行一个链接" />
          </Form.Item>
          <Form.Item name="evidence_summary" label="证据摘要">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="fit_reason" label="适配理由">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="risk_notes" label="风险提示">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="next_action" label="下一步动作">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingRule ? '编辑通知规则' : '新增通知规则'}
        open={ruleModalOpen}
        onCancel={() => setRuleModalOpen(false)}
        onOk={submitRule}
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="event_type" label="事件类型" rules={[{ required: true, message: '请选择事件类型' }]}>
            <Select>
              {eventOptions.map(item => <Option key={item.value} value={item.value}>{item.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="role_scope" label="角色范围">
            <Select allowClear placeholder="按角色通知">
              {roleOptions.map(item => <Option key={item.value} value={item.value}>{item.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="department_scope" label="部门范围">
            <Select allowClear placeholder="按部门通知">
              {departmentOptions.map(item => <Option key={item.value} value={item.value}>{item.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="team_id" label="团队范围">
            <Select allowClear placeholder="按团队通知">
              {teams.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="user_id" label="指定用户">
            <Select allowClear showSearch optionFilterProp="children" placeholder="指定一个用户">
              {users.map(u => <Option key={u.id} value={u.id}>{u.display_name || u.username}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
