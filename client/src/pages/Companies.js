import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Tag, Space, Modal, Form, Row, Col,
  Typography, Drawer, Tabs, Popconfirm, message, Tooltip, Divider,
  Timeline, Card, Badge, Empty, Descriptions, Segmented, InputNumber, Collapse, Grid, List, Upload, DatePicker
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined,
  UserOutlined, AppstoreOutlined, ThunderboltOutlined,
  UserAddOutlined, LinkOutlined, GlobalOutlined, TeamOutlined,
  ApartmentOutlined, UnorderedListOutlined, RiseOutlined, UploadOutlined, PaperClipOutlined
} from '@ant-design/icons';
import { Tree, TreeNode } from 'react-organizational-chart';
import {
  companiesApi, companyPersonnelApi, companyProductsApi, companyDynamicsApi, companyEntitiesApi, competitorResearchApi, usersApi, projectGroupsApi
} from '../api';
import ResizableTable from '../components/ResizableTable';
import AttachmentList from '../components/AttachmentList';
import { validateAttachment, uploadAttachments, ATTACHMENT_ACCEPT } from '../utils/attachments';
import { RichTextEditor, RichTextView, richTextToPlain } from '../components/RichText';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const categoryMap = {
  competitor: { label: '竞品公司',   color: 'red' },
  peer:       { label: '同行异业',   color: 'orange' },
  client:     { label: '客户公司',   color: 'blue' },
};

const scaleMap = {
  startup:    '初创（<50人）',
  small:      '小型（50-200人）',
  medium:     '中型（200-1000人）',
  large:      '大型（1000-5000人）',
  enterprise: '集团（>5000人）',
};

const levelMap = {
  exec:   { label: 'C级/创始人', color: 'red' },
  vp:     { label: 'VP/总监',   color: 'orange' },
  mid:    { label: '中层管理',   color: 'blue' },
  senior: { label: '高级骨干',   color: 'cyan' },
};

const personnelStatusMap = {
  active:  { label: '在职', color: 'green' },
  left:    { label: '已离职', color: 'default' },
  unknown: { label: '未知', color: 'orange' },
};

const productStatusMap = {
  active:      { label: '运营中', color: 'green' },
  beta:        { label: '内测中', color: 'blue' },
  developing:  { label: '开发中', color: 'orange' },
  discontinued:{ label: '已停止', color: 'default' },
};

const dynamicTypeMap = {
  talent:  { label: '人才动向', color: 'purple', icon: <UserOutlined /> },
  product: { label: '产品动向', color: 'blue',   icon: <AppstoreOutlined /> },
  business:{ label: '业务动向', color: 'orange', icon: <ThunderboltOutlined /> },
  other:   { label: '其他',     color: 'default', icon: <ThunderboltOutlined /> },
};

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

const importanceMap = {
  high:   { label: '重要', color: 'red' },
  normal: { label: '一般', color: 'default' },
  low:    { label: '低',   color: 'default' },
};

const companyDuplicateMatchText = {
  same_name: '名称相同',
  keyword_contains: '关键词命中',
};

const companyListEllipsisStyle = {
  display: 'block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const companyListTagStyle = {
  marginBottom: 0,
  marginRight: 4,
  maxWidth: '100%',
  verticalAlign: 'middle',
};

function renderCompanyListText(value, options = {}) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return '-';

  return (
    <Tooltip title={options.tooltip || text}>
      <span style={companyListEllipsisStyle}>{text}</span>
    </Tooltip>
  );
}

function renderCompanyListTags(items, options = {}) {
  const tags = (Array.isArray(items) ? items : [])
    .map(item => {
      if (typeof item === 'string') return { key: item, label: item };
      return item;
    })
    .map(item => ({
      ...item,
      label: item?.label === null || item?.label === undefined ? '' : String(item.label).trim(),
    }))
    .filter(item => item.label);

  if (tags.length === 0) return '-';

  const tooltip = options.tooltip || tags.map(item => item.label).join('、');
  return (
    <Tooltip title={tooltip}>
      <span style={companyListEllipsisStyle}>
        {tags.map(item => (
          <Tag
            key={item.key || item.label}
            color={item.color || options.color}
            style={companyListTagStyle}
          >
            {item.label}
          </Tag>
        ))}
      </span>
    </Tooltip>
  );
}

function splitCompanyTags(value) {
  return value ? String(value).split(',').map(tag => tag.trim()).filter(Boolean) : [];
}

function getRecordTime(value) {
  const time = value ? dayjs(value).valueOf() : 0;
  return Number.isFinite(time) ? time : 0;
}

function compareLatestRecordFirst(a = {}, b = {}) {
  const updatedDiff = getRecordTime(b.updated_at || b.created_at) - getRecordTime(a.updated_at || a.created_at);
  if (updatedDiff !== 0) return updatedDiff;
  const createdDiff = getRecordTime(b.created_at) - getRecordTime(a.created_at);
  if (createdDiff !== 0) return createdDiff;
  return Number(b.id || 0) - Number(a.id || 0);
}

function showCompanyDuplicateWarning(duplicateInfo) {
  const matches = Array.isArray(duplicateInfo?.matches) ? duplicateInfo.matches : [];
  const total = duplicateInfo?.total || matches.length;
  const hiddenCount = Math.max(total - matches.length, 0);

  return new Promise(resolve => {
    Modal.warning({
      title: '系统已存在疑似同名公司',
      content: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>为避免重复建档，请优先使用已有公司记录。</Text>
          <List
            size="small"
            dataSource={matches}
            renderItem={item => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Space size={6} wrap>
                    <Text strong>{item.name}</Text>
                    <Tag color={item.match_type === 'same_name' ? 'red' : 'orange'}>
                      {companyDuplicateMatchText[item.match_type] || '疑似重复'}
                    </Tag>
                    <Tag color={item.visible ? 'blue' : 'gold'}>{item.visible ? '你可见' : '需共享'}</Tag>
                  </Space>
                  <Text type="secondary">
                    {item.visible
                      ? '你已有权限，请到公司列表搜索后打开维护。'
                      : `由 ${item.created_by_name || '其他用户'} 创建，请联系对方共享给你。`}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
          {hiddenCount > 0 && <Text type="secondary">另有 {hiddenCount} 条疑似重复记录未展示。</Text>}
        </Space>
      ),
      okText: '知道了',
      onOk: () => resolve(),
    });
  });
}

function parseIdList(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  return String(value || '').split(',').map(Number).filter(Boolean);
}

// ==================== 子表单：添加/编辑公司 ====================
function CompanyModal({ open, editing, projectGroups = [], onClose, onSuccess }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (open) usersApi.listSimple().then(setUsers).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (open) {
      if (editing) {
        const sharedArr = editing.shared_with
          ? String(editing.shared_with).split(',').filter(Boolean).map(Number)
          : [];
        form.setFieldsValue({
          ...editing,
          shared_with: sharedArr,
          project_group_ids: parseIdList(editing.project_group_ids),
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await companiesApi.update(editing.id, values);
        message.success('更新成功');
      } else {
        const duplicateInfo = await companiesApi.duplicateCheck({ name: values.name });
        if (duplicateInfo?.blocking) {
          await showCompanyDuplicateWarning(duplicateInfo);
          return;
        }
        await companiesApi.create(values);
        message.success('添加成功');
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.duplicate) {
        await showCompanyDuplicateWarning(err.response.data.duplicate);
        return;
      }
      message.error(err.response?.data?.error || '保存失败，请重试');
      return;
    }
    onClose();
    onSuccess();
  };

  return (
    <Modal
      title={editing ? '编辑公司' : '添加公司'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      width={isMobile ? '100%' : 720}
      style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      okText="保存"
      cancelText="取消"
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
    >
      <Form form={form} layout="vertical" size="small">
        <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>基本信息</Divider>
        <Row gutter={16}>
          <Col span={isMobile ? 24 : 10}>
            <Form.Item label="公司名称" name="name" rules={[{ required: true }]}>
              <Input prefix={<BankOutlined />} />
            </Form.Item>
          </Col>
          <Col span={isMobile ? 24 : 7}>
            <Form.Item label="公司分类" name="category" initialValue="competitor" rules={[{ required: true }]}>
              <Select>
                {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col span={isMobile ? 24 : 7}>
            <Form.Item label="行业" name="industry">
              <Input />
            </Form.Item>
          </Col>
          <Col span={isMobile ? 24 : 8}>
            <Form.Item label="规模" name="scale">
              <Select allowClear>
                {Object.entries(scaleMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col span={isMobile ? 24 : 8}>
            <Form.Item label="成立年份" name="founded_year">
              <Input placeholder="如：2018" />
            </Form.Item>
          </Col>
          <Col span={isMobile ? 24 : 8}>
            <Form.Item label="总部城市" name="hq_city">
              <Input placeholder="如：上海" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="官网" name="website">
              <Input prefix={<GlobalOutlined />} placeholder="https://" />
            </Form.Item>
          </Col>
        </Row>
        <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>业务信息</Divider>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="主营业务" name="business" valuePropName="value" trigger="onChange">
              <RichTextEditor placeholder="简述核心业务方向..." minHeight={140} enableTables />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="商业模式" name="business_model">
              <Input placeholder="如：SaaS、电商、广告..." />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="营收规模" name="revenue_scale">
              <Input placeholder="如：年收入 1-5 亿" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="标签（逗号分隔）" name="tags">
              <Input placeholder="如：AI,To B,增长黑马" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注" name="notes" valuePropName="value" trigger="onChange">
              <RichTextEditor placeholder="请输入备注..." minHeight={140} enableTables />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="关联项目组" name="project_group_ids">
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="请选择关联项目组"
                options={projectGroups.map(group => ({ value: group.id, label: group.name }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="共享人" name="shared_with" tooltip="被共享的用户可查看此公司；管理员/CXO 默认可见全部">
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder="选择可查看此公司的用户"
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={users.map(u => ({
                  value: u.id,
                  label: u.display_name || u.username,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// 判断是否真实关联人脉库（person_id 存在且对应记录未被删除）
const isLinked = (r) => !!(r.person_id && r.linked_person_name);

// ==================== 组织架构图节点 ====================
function OrgNode({ person, onEdit, onToPerson }) {
  const lm = levelMap[person.level];
  const isLeft = person.status === 'left';
  return (
    <div
      style={{
        display: 'inline-block',
        background: isLeft ? '#fafafa' : '#fff',
        border: `2px solid ${isLeft ? '#d9d9d9' : (lm?.color === 'red' ? '#ff4d4f' : lm?.color === 'orange' ? '#fa8c16' : lm?.color === 'blue' ? '#1677ff' : '#52c41a')}`,
        borderRadius: 10,
        padding: '8px 14px',
        minWidth: 120,
        maxWidth: 160,
        textAlign: 'center',
        opacity: isLeft ? 0.6 : 1,
        boxShadow: isLeft ? 'none' : '0 2px 8px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
      }}
      onClick={() => onEdit(person)}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: isLeft ? '#999' : '#222', marginBottom: 2 }}>
        {person.name}
        {isLinked(person) && <LinkOutlined style={{ color: '#1677ff', fontSize: 10, marginLeft: 4 }} />}
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
        {person.title || '-'}
      </div>
      <Space size={3} wrap style={{ justifyContent: 'center' }}>
        {lm && <Tag color={lm.color} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginRight: 0 }}>{lm.label}</Tag>}
        {isLeft && <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginRight: 0 }}>已离职</Tag>}
      </Space>
      {person.department && (
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 3 }}>{person.department}</div>
      )}
      <div style={{ marginTop: 6 }}>
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            style={{ fontSize: 10, height: 20, padding: '0 6px' }}
            onClick={e => { e.stopPropagation(); onEdit(person); }}
          />
          {!isLinked(person) && (
            <Tooltip title="加入人脉库">
              <Button
                size="small"
                icon={<UserAddOutlined />}
                type="primary"
                ghost
                style={{ fontSize: 10, height: 20, padding: '0 6px' }}
                onClick={e => { e.stopPropagation(); onToPerson(person); }}
              />
            </Tooltip>
          )}
        </Space>
      </div>
    </div>
  );
}

// 构建树形结构
function buildTree(persons) {
  const map = {};
  persons.forEach(p => { map[p.id] = { ...p, children: [] }; });
  const roots = [];
  persons.forEach(p => {
    if (p.manager_id && map[p.manager_id]) {
      map[p.manager_id].children.push(map[p.id]);
    } else {
      roots.push(map[p.id]);
    }
  });
  return roots;
}

function renderTreeNodes(nodes, onEdit, onToPerson) {
  return nodes.map(node => (
    <TreeNode
      key={node.id}
      label={<OrgNode person={node} onEdit={onEdit} onToPerson={onToPerson} />}
    >
      {node.children.length > 0 && renderTreeNodes(node.children, onEdit, onToPerson)}
    </TreeNode>
  ));
}

// ==================== 人员 Tab ====================
function PersonnelTab({ companyId, companyName, entityId }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'org'
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPerson, setDetailPerson] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const params = { company_id: companyId };
    if (entityId !== undefined) params.entity_id = entityId === null ? 'null' : entityId;
    const res = await companyPersonnelApi.list(params);
    setData(res);
  }, [companyId, entityId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({ ...r, manager_id: r.manager_id || undefined });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = { ...values, company_id: companyId, manager_id: values.manager_id || null, entity_id: entityId ?? null };
    if (editing) {
      await companyPersonnelApi.update(editing.id, payload);
      message.success('已更新');
    } else {
      await companyPersonnelApi.create(payload);
      message.success('已添加');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await companyPersonnelApi.delete(id);
    load();
  };

  const handleToPerson = async (r) => {
    if (isLinked(r)) { message.info('该人员已关联人脉库'); return; }
    await companyPersonnelApi.toPerson(r.id);
    message.success(`已将 ${r.name} 添加到人脉库（外部人才）`);
    load();
  };

  // 列表视图
  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v, r) => (
        <Space>
          <Text strong>{v}</Text>
          {r.person_id && isLinked(r) && <Tooltip title="已关联人脉库"><LinkOutlined style={{ color: '#1677ff', fontSize: 12 }} /></Tooltip>}
        </Space>
      ),
    },
    { title: '级别', dataIndex: 'level', render: v => { const m = levelMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : '-'; } },
    { title: '部门', dataIndex: 'department', render: v => v || '-' },
    { title: '职位', dataIndex: 'title', render: v => v || '-' },
    {
      title: '直属上级',
      dataIndex: 'manager_id',
      render: v => {
        const mgr = data.find(p => p.id === v);
        return mgr ? <Tag>{mgr.name}</Tag> : '-';
      },
    },
    { title: '状态', dataIndex: 'status', render: v => { const m = personnelStatusMap[v]; return m ? <Badge status={v === 'active' ? 'success' : 'default'} text={m.label} /> : '-'; } },
    { title: '入职', dataIndex: 'join_date', render: v => v || '-' },
    { title: '离职', dataIndex: 'leave_date', render: v => v || '-' },
    { title: '技能', dataIndex: 'skills', ellipsis: true, render: v => v ? v.split(',').map(s => <Tag key={s} style={{ marginBottom: 2 }}>{s.trim()}</Tag>) : '-' },
    {
      title: '操作',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Tooltip title={isLinked(r) ? '已在人脉库' : '加入人脉库'}>
            <Button size="small" icon={<UserAddOutlined />} type={isLinked(r) ? 'default' : 'primary'} ghost={!isLinked(r)} onClick={() => handleToPerson(r)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 架构图视图
  const treeRoots = buildTree(data);
  const orgView = (
    <div style={{ overflowX: 'auto', padding: '16px 0', minHeight: 200 }}>
      {treeRoots.length === 0 ? (
        <Empty description="暂无人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Tree
          lineWidth="2px"
          lineColor="#d9d9d9"
          lineBorderRadius="6px"
          label={
            <div style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #1677ff, #722ed1)',
              color: '#fff',
              borderRadius: 10,
              padding: '8px 20px',
              fontWeight: 700,
              fontSize: 14,
              boxShadow: '0 4px 12px rgba(22,119,255,0.3)',
            }}>
              {companyName}
            </div>
          }
        >
          {renderTreeNodes(treeRoots, openEdit, handleToPerson)}
        </Tree>
      )}
    </div>
  );

  // 编辑时过滤掉自己，避免自己成为自己的上级
  const managerOptions = data.filter(p => !editing || p.id !== editing.id);

  const renderPersonnelCard = (person) => {
    const mgr = data.find(p => p.id === person.manager_id);
    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <Card size="small" style={{ width: '100%' }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <Space>
                <Text strong>{person.name}</Text>
                {person.person_id && isLinked(person) && <Tooltip title="已关联人脉库"><LinkOutlined style={{ color: '#1677ff', fontSize: 12 }} /></Tooltip>}
              </Space>
              <Space wrap size={[4, 4]}>
                {person.level && <Tag color={levelMap[person.level]?.color}>{levelMap[person.level]?.label || person.level}</Tag>}
                {person.status && <Tag color={person.status === 'active' ? 'green' : 'default'}>{personnelStatusMap[person.status]?.label || person.status}</Tag>}
              </Space>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Text type="secondary">部门：{person.department || '-'}</Text>
              <Text type="secondary">职位：{person.title || '-'}</Text>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Text type="secondary">直属上级：{mgr?.name || '-'}</Text>
              <Text type="secondary">入职：{person.join_date || '-'}</Text>
            </div>
            {person.skills && (
              <Space wrap size={[4, 4]}>
                {person.skills.split(',').filter(Boolean).map(skill => <Tag key={`${person.id}-${skill}`}>{skill.trim()}</Tag>)}
              </Space>
            )}
            <Space size="small" wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(person)}>编辑</Button>
              <Button size="small" icon={<UserAddOutlined />} type={isLinked(person) ? 'default' : 'primary'} ghost={!isLinked(person)} onClick={() => handleToPerson(person)}>
                {isLinked(person) ? '已关联' : '加入人脉库'}
              </Button>
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(person.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>
      </List.Item>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', marginBottom: 12, gap: 12 }}>
        <Segmented
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'list', icon: <UnorderedListOutlined />, label: '列表' },
            { value: 'org',  icon: <ApartmentOutlined />,    label: '架构图' },
          ]}
        />
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          {!isMobile && <Text type="secondary" style={{ fontSize: 12 }}>点击"加入人脉库"可将离职骨干转为外部人才</Text>}
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加人员</Button>
        </Space>
      </div>

      {viewMode === 'list'
        ? (isMobile
          ? <List dataSource={data} rowKey="id" locale={{ emptyText: '暂无人员' }} renderItem={renderPersonnelCard} />
          : <Table columns={columns} dataSource={data} rowKey="id" size="small" pagination={false} scroll={{ x: 900 }} />)
        : orgView
      }

      <Modal
        title={editing ? '编辑人员' : '添加人员'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 640}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="姓名" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="级别" name="level" initialValue="mid">
                <Select>
                  {Object.entries(levelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="状态" name="status" initialValue="active">
                <Select>
                  {Object.entries(personnelStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="部门" name="department">
                <Input />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="职位" name="title">
                <Input />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="直属上级" name="manager_id">
                <Select allowClear placeholder="不设置则为顶级节点">
                  {managerOptions.map(p => (
                    <Option key={p.id} value={p.id}>
                      {p.name}
                      {p.title && <Text type="secondary" style={{ fontSize: 11 }}> · {p.title}</Text>}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="入职时间" name="join_date">
                <Input placeholder="如：2022-03" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="离职时间" name="leave_date">
                <Input placeholder="如：2024-06（离职填写）" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="技能/专长（逗号分隔）" name="skills">
                <Input placeholder="如：增长运营,数据分析,产品策略" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="背景信息" name="background">
                <TextArea rows={2} placeholder="工作背景、过往经历、行业影响力..." />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 产品 Tab ====================
function ProductsTab({ companyId, entityId, entities = [] }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [productKeyword, setProductKeyword] = useState('');
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const params = { company_id: companyId };
    if (entityId !== undefined) params.entity_id = entityId === null ? 'null' : entityId;
    const res = await companyProductsApi.list(params);
    setData([...res].sort(compareLatestRecordFirst));
  }, [companyId, entityId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setFileList([]);
    form.resetFields();
    // 如果是在某个主体下打开，预填主体
    if (entityId != null) form.setFieldsValue({ entity_id: entityId });
    setModalOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setFileList([]);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    // entity_id 优先从表单取，不传则保留 entityId（分主体视图）
    const payload = {
      ...values,
      company_id: companyId,
      entity_id: values.entity_id ?? entityId ?? null,
    };
    setSaving(true);
    try {
      const productId = editing ? editing.id : (await companyProductsApi.create(payload)).id;
      if (editing) {
        await companyProductsApi.update(editing.id, payload);
      }
      if (fileList.length > 0) {
        try {
          await uploadAttachments('company_product', productId, fileList);
        } catch {
          message.warning('附件上传失败，但产品信息已保存');
        }
      }
      message.success(editing ? '已更新' : '已添加');
      setModalOpen(false);
      setFileList([]);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await companyProductsApi.delete(id);
    load();
  };

  // entity_id -> 主体名称 map
  const entityNameMap = Object.fromEntries(entities.map(e => [e.id, e.name]));
  const getProductEntityName = (product) => (
    product.entity_name
    || product.entity_reg_name
    || (product.entity_id ? entityNameMap[product.entity_id] : null)
  );
  const getProductEntityLabel = (product) => {
    const entityName = getProductEntityName(product);
    if (entityName) return entityName;
    return '未关联主体';
  };
  const filteredProducts = data.filter(product => {
    const keyword = productKeyword.trim().toLowerCase();
    if (!keyword) return true;
    return [
      product.name,
      getProductEntityName(product),
      getProductEntityLabel(product),
    ].some(value => String(value || '').toLowerCase().includes(keyword));
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input.Search
          placeholder="搜索产品或主体"
          allowClear
          value={productKeyword}
          onChange={event => setProductKeyword(event.target.value)}
          style={{ width: isMobile ? '100%' : 260 }}
        />
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加产品</Button>
      </div>

      {filteredProducts.length === 0 ? <Empty description={data.length ? '暂无匹配产品' : '暂无产品信息'} image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
        <Row gutter={[12, 12]}>
          {filteredProducts.map(p => {
            const entityLabel = getProductEntityLabel(p);
            const hasEntity = Boolean(getProductEntityName(p));
            return (
              <Col xs={24} md={12} key={p.id}>
                <Card
                  size="small"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <Space size={6} wrap style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <AppstoreOutlined />
                      <Text strong style={{ wordBreak: 'break-word' }}>{p.name}</Text>
                      {p.category && <Tag>{p.category}</Tag>}
                      {p.product_category && <Tag color="cyan">{p.product_category}</Tag>}
                    </Space>
                    <Space size={6} wrap style={{ justifyContent: 'flex-end', flex: '1 0 auto' }}>
                      {(p.attachment_count || 0) > 0 && (
                        <Tag icon={<PaperClipOutlined />} style={{ fontSize: 11 }}>附件 {p.attachment_count}</Tag>
                      )}
                      <Tag color={hasEntity ? 'geekblue' : 'default'} style={{ fontSize: 11 }}>{entityLabel}</Tag>
                      <Tag color={productStatusMap[p.status]?.color}>{productStatusMap[p.status]?.label || p.status}</Tag>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />
                      <Popconfirm title="确认删除？" onConfirm={() => handleDelete(p.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                  {p.launch_date && <Text type="secondary" style={{ fontSize: 12 }}>上线：{p.launch_date}</Text>}
                  {p.product_link && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <Text type="secondary">产品链接：</Text>
                      <a href={p.product_link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                        <LinkOutlined /> 打开链接
                      </a>
                    </div>
                  )}
                  {p.discovery_source && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <Text type="secondary">产品发现出处：</Text>{p.discovery_source}
                    </div>
                  )}
                  {p.contact_phone && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <Text type="secondary">联系电话：</Text>{p.contact_phone}
                    </div>
                  )}
                  {p.domain && (
                    <div style={{ marginTop: 6, fontSize: 12, wordBreak: 'break-all' }}>
                      <Text type="secondary">域名：</Text>{p.domain}
                    </div>
                  )}
                  {p.description && <Paragraph style={{ marginTop: 6, marginBottom: 4, fontSize: 13 }}>{p.description}</Paragraph>}
                  {p.target_users && <div style={{ fontSize: 12 }}><Text type="secondary">目标用户：</Text>{p.target_users}</div>}
                  {p.core_features && (
                    <div style={{ marginTop: 6 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>核心功能：</Text>
                      <Text style={{ fontSize: 12 }}>{p.core_features}</Text>
                    </div>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        title={editing ? '编辑产品' : '添加产品'}
        open={modalOpen}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => { setModalOpen(false); setFileList([]); }}
        width={isMobile ? '100%' : 600}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="产品名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="产品类型" name="category">
                <Input placeholder="如：SaaS、APP、小程序" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="产品类目" name="product_category">
                <Input placeholder="产品类目，工具，互动营销，短剧等" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="状态" name="status" initialValue="active">
                <Select>
                  {Object.entries(productStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            {entities.length > 0 && (
              <Col span={24}>
                <Form.Item label="所属主体" name="entity_id">
                  <Select allowClear placeholder="不选则不归属某个主体">
                    {entities.map(e => (
                      <Option key={e.id} value={e.id}>
                        {e.name}
                        {e.reg_name && <Text type="secondary" style={{ fontSize: 11 }}> · {e.reg_name}</Text>}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="上线时间" name="launch_date">
                <Input placeholder="如：2023-06" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="联系电话" name="contact_phone">
                <Input placeholder="客服电话，方便看集团关联" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="域名" name="domain">
                <Input placeholder="对应产品的域名，方便看集团关联" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="产品链接" name="product_link">
                <Input placeholder="请输入 H5 链接或 deeplink 链接，如：https://... 或 app://..." />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item
                label="产品发现出处"
                name="discovery_source"
                extra="发现该产品的出处，比如中青看点"
              >
                <Input placeholder="如：中青看点" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="产品描述" name="description">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="目标用户" name="target_users">
                <Input placeholder="如：中小企业HR" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="核心功能" name="core_features">
                <TextArea rows={2} placeholder="列举1-3个核心功能..." />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="附件">
                <Upload
                  fileList={fileList}
                  onChange={({ fileList: newFileList }) => setFileList(newFileList)}
                  beforeUpload={validateAttachment}
                  maxCount={10}
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                >
                  <Button icon={<UploadOutlined />} size="small">选择文件（最多10个，单个最大50MB）</Button>
                </Upload>
              </Form.Item>
            </Col>
            {editing && (
              <Col span={24}>
                <Divider style={{ margin: '8px 0 12px' }} />
                <AttachmentList sourceType="company_product" sourceId={editing.id} title="已上传附件" showPreview />
              </Col>
            )}
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 竞品研究记录 Tab ====================
function CompetitorResearchTab({ companyId }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterImportance, setFilterImportance] = useState('');
  const [filterHasOpportunity, setFilterHasOpportunity] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const params = { company_id: companyId };
    const res = await competitorResearchApi.list(params);
    let filtered = res;
    if (filterImportance) filtered = filtered.filter(r => r.importance === filterImportance);
    if (filterHasOpportunity === 'yes') filtered = filtered.filter(r => r.opportunity_title && r.opportunity_title.trim() !== '');
    if (filterHasOpportunity === 'no') filtered = filtered.filter(r => !r.opportunity_title || r.opportunity_title.trim() === '');
    setData(filtered);
  }, [companyId, filterImportance, filterHasOpportunity]);

  useEffect(() => {
    load();
    usersApi.listSimple().then(setUsers).catch(() => {});
  }, [load]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs().format('YYYY-MM-DD'), importance: 'normal', shared_with: [] }); setFileList([]); setModalOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    const sharedArr = r.shared_with ? String(r.shared_with).split(',').filter(Boolean).map(Number) : [];
    form.setFieldsValue({ ...r, shared_with: sharedArr });
    setFileList([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = { ...values, company_id: companyId };
    let recordId;
    if (editing) {
      await competitorResearchApi.update(editing.id, payload);
      recordId = editing.id;
      message.success('已更新');
    } else {
      const res = await competitorResearchApi.create(payload);
      recordId = res.id;
      message.success('已记录');
    }
    if (fileList.length > 0) {
      try {
        await uploadAttachments('competitor_research', recordId, fileList);
      } catch {
        message.warning('附件上传失败，但记录已保存');
      }
    }
    setModalOpen(false);
    setFileList([]);
    load();
  };

  const handleDelete = async (id) => {
    await competitorResearchApi.delete(id);
    load();
  };

  const columns = [
    { title: '日期', dataIndex: 'date', width: 110, sorter: (a, b) => a.date.localeCompare(b.date) },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '重要程度',
      dataIndex: 'importance',
      width: 90,
      render: (v) => {
        const m = importanceMap[v] || importanceMap.normal;
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '是否有商机',
      dataIndex: 'opportunity_title',
      width: 100,
      align: 'center',
      render: (v) => v && v.trim() !== '' ? <Tag color="green">✓</Tag> : <Tag color="default">-</Tag>,
    },
    { title: '金额', dataIndex: 'amount', width: 100, render: (v) => v ? `¥${v}` : '-' },
    { title: '结果', dataIndex: 'outcome', ellipsis: true },
    { title: '下次行动', dataIndex: 'next_action', ellipsis: true },
    { title: '下次日期', dataIndex: 'next_action_date', width: 110 },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 90,
      render: (v) => {
        if (!v) return '-';
        const u = users.find(x => x.id === v);
        return u ? (u.display_name || u.username) : '-';
      },
    },
    {
      title: '共享人',
      dataIndex: 'shared_with',
      width: 160,
      render: (v) => {
        const ids = v ? String(v).split(',').filter(Boolean).map(Number) : [];
        if (ids.length === 0) return '-';
        const named = ids.map(id => {
          const u = users.find(x => x.id === id);
          return u ? (u.display_name || u.username) : `#${id}`;
        });
        const visible = named.slice(0, 2);
        const extra = named.slice(2);
        return (
          <Space size={4} wrap>
            {visible.map((name, i) => <Tag key={i} style={{ margin: 0 }}>{name}</Tag>)}
            {extra.length > 0 && (
              <Tooltip title={extra.join('、')}>
                <Tag style={{ margin: 0 }}>+{extra.length}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space size="small" onDoubleClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderResearchCard = (record) => {
    const importance = importanceMap[record.importance] || importanceMap.normal;
    const hasOpportunity = record.opportunity_title && record.opportunity_title.trim() !== '';
    const sharedIds = record.shared_with ? String(record.shared_with).split(',').filter(Boolean).map(Number) : [];
    const sharedUsers = sharedIds.map(id => users.find(u => u.id === id)).filter(Boolean);
    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          style={{ width: '100%', padding: 14, border: '1px solid #f0f0f0', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer' }}
          onClick={() => setDetailRecord(record)}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>{record.title}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>{record.date || '-'}</Text>
              </div>
              <Space direction="vertical" size={4} align="end">
                <Tag color={importance.color}>{importance.label}</Tag>
                {hasOpportunity ? <Tag color="green">有商机</Tag> : <Tag>无商机</Tag>}
              </Space>
            </div>
            <Space wrap size={[8, 6]}>
              <Text type="secondary">金额：{record.amount ? `¥${record.amount}` : '-'}</Text>
              <Text type="secondary">下次日期：{record.next_action_date || '-'}</Text>
            </Space>
            {record.content && (
              <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                内容：{richTextToPlain(record.content)}
              </Paragraph>
            )}
            {record.outcome && (
              <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                结果：{record.outcome}
              </Paragraph>
            )}
            {record.next_action && (
              <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                下次行动：{record.next_action}
              </Paragraph>
            )}
            {hasOpportunity && (
              <Space wrap size={[6, 6]}>
                <Tag color="blue" icon={<RiseOutlined />}>{record.opportunity_title}</Tag>
                {record.opportunity_status && <Tag color={opportunityStatusMap[record.opportunity_status]?.color}>{opportunityStatusMap[record.opportunity_status]?.label || record.opportunity_status}</Tag>}
              </Space>
            )}
            {sharedUsers.length > 0 && (
              <Space wrap size={[4, 4]}>
                <Text type="secondary" style={{ fontSize: 12 }}>共享：</Text>
                {sharedUsers.map(u => (
                  <Tag key={u.id}>{u.display_name || u.username}</Tag>
                ))}
              </Space>
            )}
            <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Select
            placeholder="全部重要程度"
            allowClear
            style={{ width: isMobile ? '100%' : 140 }}
            value={filterImportance || undefined}
            onChange={v => setFilterImportance(v || '')}
          >
            {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
          <Select
            placeholder="是否有商机"
            allowClear
            style={{ width: isMobile ? '100%' : 140 }}
            value={filterHasOpportunity || undefined}
            onChange={v => setFilterHasOpportunity(v || '')}
          >
            <Option value="yes">有商机</Option>
            <Option value="no">无商机</Option>
          </Select>
        </Space>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加记录</Button>
      </div>

      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          locale={{ emptyText: '暂无研究记录' }}
          pagination={{ defaultPageSize: 10, showSizeChanger: false }}
          renderItem={renderResearchCard}
        />
      ) : (
        <ResizableTable
          storageKey="competitor-research-table-columns"
          dataSource={data}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ defaultPageSize: 10, showSizeChanger: false }}
          scroll={{ x: 860 }}
          onRow={(record) => ({
            onDoubleClick: () => setDetailRecord(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Modal
        title={editing ? '编辑记录' : '添加记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 700}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="重要程度" name="importance" initialValue="normal">
                <Select>
                  {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="金额" name="amount">
                <InputNumber style={{ width: '100%' }} placeholder="选填" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="标题" name="title" rules={[{ required: true }]}>
                <Input placeholder="简述研究内容" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="详细内容" name="content" valuePropName="value" trigger="onChange">
                <RichTextEditor placeholder="详细描述..." minHeight={140} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="信息来源" name="source">
                <Input placeholder="如：官网、行业报告" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="结果" name="outcome">
                <Input placeholder="研究结果" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="影响分析" name="impact">
                <TextArea rows={2} placeholder="对我们的影响..." />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="下次行动" name="next_action">
                <Input placeholder="后续跟进计划" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="下次行动日期" name="next_action_date">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="共享人" name="shared_with" tooltip="被共享的用户可查看此记录">
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  placeholder="选择可查看此记录的用户"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={users.map(u => ({
                    value: u.id,
                    label: u.display_name || u.username,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0' }} />
          <Collapse ghost>
            <Collapse.Panel key="opp" header={<span style={{ color: '#1677ff', fontWeight: 500 }}><RiseOutlined /> 商机信息（可选）</span>}>
              <Row gutter={16}>
                  <Col span={isMobile ? 24 : 12}>
                    <Form.Item label="商机标题" name="opportunity_title">
                      <Input placeholder="简述商机，如：XX采购合作意向" />
                    </Form.Item>
                  </Col>
                  <Col span={isMobile ? 24 : 12}>
                    <Form.Item label="商机状态" name="opportunity_status" initialValue="new">
                      <Select allowClear placeholder="选择状态">
                        {Object.entries(opportunityStatusMap).map(([k, v]) => (
                          <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="指派跟进人" name="opportunity_assignee">
                      <Select
                        allowClear
                        showSearch
                        placeholder="选择系统用户（指派后对方会收到跟进任务）"
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={users.map(u => ({
                          value: u.id,
                          label: `${u.display_name || u.username}`,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="商机补充说明" name="opportunity_note">
                      <TextArea rows={2} placeholder="背景、需求或其他说明" />
                    </Form.Item>
                  </Col>
                </Row>
            </Collapse.Panel>
          </Collapse>

          <Form.Item label="附件">
            <Upload
              fileList={fileList}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={validateAttachment}
              maxCount={10}
              multiple
              accept={ATTACHMENT_ACCEPT}
            >
              <Button icon={<UploadOutlined />} size="small">选择文件（最多10个，单个最大50MB）</Button>
            </Upload>
          </Form.Item>
          {editing && (
            <>
              <Divider style={{ margin: '8px 0 12px' }} />
              <AttachmentList sourceType="competitor_research" sourceId={editing.id} title="已上传附件" showPreview />
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title="竞品研究记录详情"
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        width={isMobile ? '100%' : 720}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        footer={[
          <Button key="close" onClick={() => setDetailRecord(null)}>关闭</Button>,
        ]}
      >
        {detailRecord && (() => {
          const r = detailRecord;
          const imp = importanceMap[r.importance] || importanceMap.normal;
          const hasOpp = r.opportunity_title && r.opportunity_title.trim() !== '';
          const oppStatus = hasOpp
            ? (opportunityStatusMap[r.opportunity_status] || { label: r.opportunity_status, color: 'default' })
            : null;
          const assignee = users.find(u => u.id === r.opportunity_assignee);
          const creator = users.find(u => u.id === r.created_by);
          const sharedIds = r.shared_with ? String(r.shared_with).split(',').filter(Boolean).map(Number) : [];
          const sharedUsers = sharedIds.map(id => users.find(u => u.id === id)).filter(Boolean);
          return (
            <>
              <Descriptions size="small" column={isMobile ? 1 : 2} bordered labelStyle={{ width: 110 }}>
                <Descriptions.Item label="日期">{r.date || '-'}</Descriptions.Item>
                <Descriptions.Item label="重要程度"><Tag color={imp.color}>{imp.label}</Tag></Descriptions.Item>
                <Descriptions.Item label="标题" span={2}>{r.title || '-'}</Descriptions.Item>
                <Descriptions.Item label="金额">{r.amount ? `¥${r.amount}` : '-'}</Descriptions.Item>
                <Descriptions.Item label="信息来源">{r.source || '-'}</Descriptions.Item>
                <Descriptions.Item label="详细内容" span={2}>
                  <RichTextView value={r.content} />
                </Descriptions.Item>
                <Descriptions.Item label="结果" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.outcome || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="影响分析" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.impact || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="下次行动" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.next_action || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="下次日期">{r.next_action_date || '-'}</Descriptions.Item>
                <Descriptions.Item label="跟进结果">{r.follow_result || '-'}</Descriptions.Item>
                <Descriptions.Item label="商机" span={2}>
                  {hasOpp ? (
                    <Space size={4} wrap>
                      <Tag color="blue" icon={<RiseOutlined />}>{r.opportunity_title}</Tag>
                      {oppStatus && <Tag color={oppStatus.color}>{oppStatus.label}</Tag>}
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机跟进人">
                  {assignee ? (assignee.display_name || assignee.username) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机说明">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.opportunity_note || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="创建人">
                  {creator ? (creator.display_name || creator.username) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{r.created_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="共享人" span={2}>
                  {sharedUsers.length
                    ? sharedUsers.map(u => (
                        <Tag key={u.id}>{u.display_name || u.username}</Tag>
                      ))
                    : '-'}
                </Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 20 }}>
                <AttachmentList sourceType="competitor_research" sourceId={r.id} showPreview />
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

// ==================== 动向 Tab ====================
function DynamicsTab({ companyId }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const params = { company_id: companyId };
    if (filterType) params.type = filterType;
    const res = await companyDynamicsApi.list(params);
    setData(res);
  }, [companyId, filterType]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs().format('YYYY-MM-DD') }); setModalOpen(true); };
  const openEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = { ...values, company_id: companyId };
    if (editing) { await companyDynamicsApi.update(editing.id, payload); message.success('已更新'); }
    else { await companyDynamicsApi.create(payload); message.success('已记录'); }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await companyDynamicsApi.delete(id);
    load();
  };

  const timelineItems = data.map(d => {
    const tm = dynamicTypeMap[d.type] || dynamicTypeMap.other;
    const im = importanceMap[d.importance] || importanceMap.normal;
    return {
      key: d.id,
      color: d.importance === 'high' ? 'red' : d.type === 'talent' ? 'purple' : d.type === 'product' ? 'blue' : 'gray',
      dot: tm.icon,
      children: (
        <div
          style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={isMobile ? () => setDetailRecord(d) : undefined}
          onDoubleClick={isMobile ? undefined : () => setDetailRecord(d)}
        >
          <Space style={{ marginBottom: 4 }} wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>{d.date}</Text>
            <Tag color={tm.color}>{tm.label}</Tag>
            {d.importance === 'high' && <Tag color={im.color}>{im.label}</Tag>}
            <Text strong style={{ fontSize: 13 }}>{d.title}</Text>
          </Space>
          {d.content && <Paragraph style={{ margin: '2px 0 4px', fontSize: 12, color: '#555' }}>{d.content}</Paragraph>}
          {d.source && <Text type="secondary" style={{ fontSize: 11 }}>来源：{d.source}</Text>}
          {d.impact && (
            <div style={{ marginTop: 4, padding: '4px 8px', background: '#fffbe6', borderRadius: 4, fontSize: 12 }}>
              <Text type="warning">影响分析：</Text>{d.impact}
            </div>
          )}
          <Space style={{ marginTop: 6 }} size={4} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(d)} />
            <Popconfirm title="确认删除？" onConfirm={() => handleDelete(d.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>
      ),
    };
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Select
            placeholder="全部类型"
            allowClear
            style={{ width: isMobile ? '100%' : 120 }}
            value={filterType || undefined}
            onChange={v => setFilterType(v || '')}
          >
            {Object.entries(dynamicTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
        </Space>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>记录动向</Button>
      </div>

      {data.length === 0
        ? <Empty description="暂无动向记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        : <Timeline items={timelineItems} />
      }

      <Modal
        title={editing ? '编辑动向' : '记录动向'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 600}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="动向类型" name="type" initialValue="talent" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(dynamicTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="重要程度" name="importance" initialValue="normal">
                <Select>
                  {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="动向标题" name="title" rules={[{ required: true }]}>
                <Input placeholder="简述动向，如：CMO 李xx 离职加入竞品" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="详细内容" name="content">
                <TextArea rows={3} placeholder="详细描述这条动向的内容..." />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="信息来源" name="source">
                <Input placeholder="如：LinkedIn、内部消息、公众号" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="影响分析" name="impact">
                <TextArea rows={2} placeholder="这条动向对我们意味着什么？" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="动向记录详情"
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        footer={[
          <Button key="close" onClick={() => setDetailRecord(null)}>关闭</Button>,
        ]}
      >
        {detailRecord && (() => {
          const r = detailRecord;
          const tm = dynamicTypeMap[r.type] || dynamicTypeMap.other;
          const im = importanceMap[r.importance] || importanceMap.normal;
          return (
            <Descriptions size="small" column={isMobile ? 1 : 2} bordered labelStyle={{ width: 110 }}>
              <Descriptions.Item label="日期">{r.date || '-'}</Descriptions.Item>
              <Descriptions.Item label="类型"><Tag color={tm.color}>{tm.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="重要程度"><Tag color={im.color}>{im.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="信息来源">{r.source || '-'}</Descriptions.Item>
              <Descriptions.Item label="标题" span={2}>{r.title || '-'}</Descriptions.Item>
              <Descriptions.Item label="详细内容" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{r.content || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="影响分析" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{r.impact || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{r.created_at || '-'}</Descriptions.Item>
            </Descriptions>
          );
        })()}
      </Modal>
    </div>
  );
}

// ==================== 主体管理 ====================
function EntityManager({ companyId, entities, onRefresh }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [form] = Form.useForm();

  const loadCompanyOptions = useCallback(async () => {
    setCompanyLoading(true);
    try {
      const rows = await companiesApi.list();
      setCompanyOptions(rows);
    } catch (err) {
      message.error(err.response?.data?.error || '公司列表加载失败');
    } finally {
      setCompanyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanyOptions();
  }, [loadCompanyOptions]);

  const normalizeOptionalCount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ company_id: companyId });
    setModalOpen(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    form.setFieldsValue({
      ...e,
      company_id: e.company_id || companyId,
      established_date: e.established_date ? dayjs(e.established_date) : undefined,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      established_date: values.established_date ? dayjs(values.established_date).format('YYYY-MM-DD') : null,
      social_security_count: normalizeOptionalCount(values.social_security_count),
      software_copyright_count: normalizeOptionalCount(values.software_copyright_count),
    };
    if (editing) {
      await companyEntitiesApi.update(editing.id, payload);
      message.success('已更新');
    } else {
      await companyEntitiesApi.create(payload);
      message.success('已添加');
    }
    setModalOpen(false);
    onRefresh();
  };

  const handleDelete = async (id) => {
    await companyEntitiesApi.delete(id);
    message.success('已删除，该主体下人员和产品已解绑');
    onRefresh();
  };

  const companyNameMap = Object.fromEntries(companyOptions.map(company => [company.id, company.name]));
  const entityColumns = [
    {
      title: '所属公司',
      dataIndex: 'company_id',
      width: 150,
      render: value => companyNameMap[value] || (Number(value) === Number(companyId) ? '当前公司' : value || '-'),
    },
    {
      title: '主体名称',
      dataIndex: 'name',
      width: 150,
      fixed: isMobile ? undefined : 'left',
      render: value => <Text strong>{value || '-'}</Text>,
    },
    { title: '注册名称', dataIndex: 'reg_name', width: 220, render: value => value || '-' },
    { title: '注册城市', dataIndex: 'city', width: 100, render: value => value || '-' },
    { title: '地址', dataIndex: 'address', width: 240, render: value => value || '-' },
    { title: '成立日期', dataIndex: 'established_date', width: 120, render: value => value || '-' },
    { title: '法人代表', dataIndex: 'legal_representative', width: 120, render: value => value || '-' },
    { title: '主营方向', dataIndex: 'business', width: 220, render: value => value || '-' },
    { title: '备注', dataIndex: 'notes', width: 220, render: value => value || '-' },
    {
      title: '社保人数',
      dataIndex: 'social_security_count',
      width: 100,
      render: value => (value === null || value === undefined || value === '') ? '-' : value,
    },
    {
      title: '软著数量',
      dataIndex: 'software_copyright_count',
      width: 100,
      render: value => (value === null || value === undefined || value === '') ? '-' : value,
    },
    {
      title: '联系电话',
      dataIndex: 'contact_phone',
      width: 140,
      render: value => value || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      fixed: isMobile ? undefined : 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑主体">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label="编辑主体"
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="删除主体后，该主体下的人员和产品将解绑（不会删除），确认？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除主体"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={editing ? '编辑主体' : '新增主体'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 500}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="所属公司" name="company_id" rules={[{ required: true, message: '请选择所属公司' }]}>
                <Select
                  showSearch
                  loading={companyLoading}
                  placeholder="请选择所属公司"
                  optionFilterProp="label"
                  options={companyOptions.map(c => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="主体名称（简称）" name="name" rules={[{ required: true }]}>
                <Input placeholder="如：北京主体、电商品牌" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="注册名称" name="reg_name">
                <Input placeholder="如：XX科技（北京）有限公司" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="注册城市" name="city">
                <Input placeholder="如：北京" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="地址" name="address">
                <Input placeholder="请输入注册地址或办公地址" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="成立日期" name="established_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="法人代表" name="legal_representative">
                <Input placeholder="请输入法人代表" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="社保人数" name="social_security_count">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="请输入社保人数" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="软著数量" name="software_copyright_count">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="请输入软著数量" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="联系电话" name="contact_phone">
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="主营方向" name="business">
                <Input placeholder="该主体的核心业务方向" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
      {/* 内联操作行，嵌入 Tab 顶部 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={openAdd}>新增主体</Button>
      </div>
      <Table
        size="small"
        rowKey="id"
        dataSource={entities}
        columns={entityColumns}
        pagination={false}
        scroll={{ x: 1960 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无主体" /> }}
      />
    </>
  );
}

// ==================== 研究摘要卡片 ====================
function SummaryCard({ companyId }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (companyId) companiesApi.summary(companyId).then(setSummary);
  }, [companyId]);

  if (!summary) return null;

  const { personnel, products, dynamics } = summary;
  const hasActivity = dynamics.total > 0 || personnel.recentLeft.length > 0 || personnel.recentJoined.length > 0;

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0f5ff 0%, #fff7e6 100%)', border: '1px solid #d6e4ff' }}
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#fa8c16' }} />
          <Text strong style={{ fontSize: 13 }}>近30天研究摘要</Text>
          {dynamics.highImportance > 0 && <Badge count={`${dynamics.highImportance}条重要`} style={{ backgroundColor: '#ff4d4f' }} />}
        </Space>
      }
    >
      {!hasActivity ? (
        <Text type="secondary" style={{ fontSize: 12 }}>近30天暂无新动向，建议关注更新</Text>
      ) : (
        <Row gutter={[16, 8]}>
          {/* 指标行 */}
          <Col xs={12} md={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#722ed1' }}>{personnel.active}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>在册骨干</Text>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>{products.active}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>运营产品</Text>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>{products.developing}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>在研产品</Text>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{dynamics.total}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>30天动向</Text>
            </div>
          </Col>

          {/* 人才变动 */}
          {(personnel.recentLeft.length > 0 || personnel.recentJoined.length > 0) && (
            <Col span={24}>
              <div style={{ background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #f0f0f0' }}>
                <Text strong style={{ fontSize: 12, color: '#722ed1' }}><UserOutlined /> 人才变动</Text>
                {personnel.recentLeft.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {personnel.recentLeft.map(p => (
                      <Tag key={p.id} color="red" style={{ marginBottom: 4 }}>
                        {p.name}（{levelMap[p.level]?.label || p.level}）离职 {p.leave_date}
                      </Tag>
                    ))}
                  </div>
                )}
                {personnel.recentJoined.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {personnel.recentJoined.map(p => (
                      <Tag key={p.id} color="green" style={{ marginBottom: 4 }}>
                        {p.name}（{levelMap[p.level]?.label || p.level}）新入职 {p.join_date}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            </Col>
          )}

          {/* 最新动向 */}
          {dynamics.recent.length > 0 && (
            <Col span={24}>
              <div style={{ background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #f0f0f0' }}>
                <Text strong style={{ fontSize: 12, color: '#1677ff' }}><ThunderboltOutlined /> 最新动向</Text>
                {dynamics.recent.map(d => {
                  const tm = dynamicTypeMap[d.type] || dynamicTypeMap.other;
                  return (
                    <div key={d.id} style={{ marginTop: 4, fontSize: 12 }}>
                      <Space size={4}>
                        <Text type="secondary">{d.date}</Text>
                        <Tag color={tm.color} style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>{tm.label}</Tag>
                        {d.importance === 'high' && <Tag color="red" style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>重要</Tag>}
                        <Text>{d.title}</Text>
                      </Space>
                    </div>
                  );
                })}
              </div>
            </Col>
          )}
        </Row>
      )}
    </Card>
  );
}

// ==================== 全部产品视图 ====================
function AllProductsView() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await companyProductsApi.list();
      setData(rows);
    } catch (err) {
      message.error(err.response?.data?.error || '产品列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productTypes = Array.from(new Set(data.map(p => p.category).filter(Boolean)));
  const filteredData = data.filter(p => {
    const keyword = search.trim().toLowerCase();
    const hit = !keyword || [
      p.name,
      p.product_link,
      p.company_name,
      p.entity_reg_name,
      p.entity_name,
      p.category,
      p.product_category,
      p.contact_phone,
      p.domain,
      p.discovery_source,
      p.notes,
    ].some(v => String(v || '').toLowerCase().includes(keyword));
    const typeHit = !filterType || p.category === filterType;
    return hit && typeHit;
  });

  const openProductDetail = async (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const detail = await companyProductsApi.get(record.id);
      setDetailRecord(detail);
    } catch (err) {
      message.error(err.response?.data?.error || '产品详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openProductEdit = async (record) => {
    setEditingProduct(record);
    editForm.setFieldsValue(record);
    setEditOpen(true);
    try {
      const detail = await companyProductsApi.get(record.id);
      setEditingProduct(detail);
      editForm.setFieldsValue(detail);
    } catch (err) {
      message.warning(err.response?.data?.error || '产品详情加载失败，已使用列表数据编辑');
    }
  };

  const handleEditSave = async () => {
    const values = await editForm.validateFields();
    if (!editingProduct?.id) return;
    setSavingEdit(true);
    try {
      await companyProductsApi.update(editingProduct.id, values);
      message.success('已更新');
      setEditOpen(false);
      setEditingProduct(null);
      editForm.resetFields();
      await load();
      if (detailOpen && detailRecord?.id === editingProduct.id) {
        const detail = await companyProductsApi.get(editingProduct.id);
        setDetailRecord(detail);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const renderProductLink = (link) => {
    if (!link) return '-';
    return (
      <a href={link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }} onClick={e => e.stopPropagation()}>
        <LinkOutlined /> 打开链接
      </a>
    );
  };

  const renderSubject = (record) => record.entity_reg_name || record.entity_name || '-';
  const renderSubjectTag = (record) => {
    const subject = renderSubject(record);
    return subject && subject !== '-' ? <Tag color="geekblue">{subject}</Tag> : null;
  };

  const columns = [
    {
      title: '产品名称',
      dataIndex: 'name',
      width: 180,
      sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'),
      render: (v, r) => (
        <Button type="link" onClick={() => openProductDetail(r)} style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}>
          <Text strong style={{ color: '#1677ff' }}>{v}</Text>
        </Button>
      ),
    },
    {
      title: '产品链接',
      dataIndex: 'product_link',
      width: 150,
      ellipsis: true,
      render: renderProductLink,
    },
    {
      title: '公司主体',
      width: 180,
      render: (_, r) => renderSubject(r),
    },
    {
      title: '集团名字',
      dataIndex: 'company_name',
      width: 160,
      render: v => v || '-',
    },
    {
      title: '产品类型',
      dataIndex: 'category',
      width: 110,
      render: v => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: '产品类目',
      dataIndex: 'product_category',
      width: 110,
      render: v => v ? <Tag color="cyan">{v}</Tag> : '-',
    },
    {
      title: '联系电话',
      dataIndex: 'contact_phone',
      width: 130,
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '域名',
      dataIndex: 'domain',
      width: 160,
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: v => <Tag color={productStatusMap[v]?.color}>{productStatusMap[v]?.label || v || '-'}</Tag>,
    },
    {
      title: '发现出处',
      dataIndex: 'discovery_source',
      width: 130,
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '备注',
      dataIndex: 'notes',
      width: 180,
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 110,
      render: v => v?.slice(0, 10) || '-',
    },
    {
      title: '操作',
      width: 90,
      render: (_, r) => (
        <Button size="small" onClick={(e) => { e.stopPropagation(); openProductEdit(r); }}>
          编辑
        </Button>
      ),
    },
  ];

  const renderProductCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%', cursor: 'pointer' }} onClick={() => openProductDetail(record)}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text strong style={{ color: '#1677ff', fontSize: 15, wordBreak: 'break-word' }}>{record.name}</Text>
              {renderSubjectTag(record)}
              <div style={{ marginTop: 6 }}>
                <Text type="secondary">集团：{record.company_name || '-'}</Text>
              </div>
            </div>
            {record.category && <Tag>{record.category}</Tag>}
          </div>
          <Text type="secondary">公司主体：{renderSubject(record)}</Text>
          {record.product_category && <Tag color="cyan" style={{ width: 'fit-content' }}>{record.product_category}</Tag>}
          {record.product_link && <div onClick={e => e.stopPropagation()}>{renderProductLink(record.product_link)}</div>}
          {record.contact_phone && <Text type="secondary">联系电话：{record.contact_phone}</Text>}
          {record.domain && <Text type="secondary" style={{ wordBreak: 'break-all' }}>域名：{record.domain}</Text>}
          <Space size={[6, 6]} wrap>
            <Tag color={productStatusMap[record.status]?.color}>{productStatusMap[record.status]?.label || record.status || '-'}</Tag>
            {(record.attachment_count || 0) > 0 && <Tag icon={<PaperClipOutlined />}>附件 {record.attachment_count}</Tag>}
            {record.updated_at && <Text type="secondary">更新：{record.updated_at.slice(0, 10)}</Text>}
          </Space>
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div>
      <Space style={{ marginBottom: 16, width: isMobile ? '100%' : undefined }} wrap direction={isMobile ? 'vertical' : 'horizontal'}>
        <Input.Search
          placeholder="搜索产品、链接、集团、主体、类型"
          allowClear
          style={{ width: isMobile ? '100%' : 320 }}
          onSearch={setSearch}
          onChange={e => !e.target.value && setSearch('')}
        />
        <Select
          placeholder="产品类型"
          allowClear
          style={{ width: isMobile ? '100%' : 160 }}
          value={filterType || undefined}
          onChange={v => setFilterType(v || '')}
        >
          {productTypes.map(type => <Option key={type} value={type}>{type}</Option>)}
        </Select>
        <Text type="secondary">共 {filteredData.length} 个产品</Text>
      </Space>

      {isMobile ? (
        <List
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 15, showSizeChanger: false }}
          locale={{ emptyText: '暂无产品数据' }}
          renderItem={renderProductCard}
        />
      ) : (
        <ResizableTable
          storageKey="company-products-overview-table-columns"
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1380 }}
          pagination={{ defaultPageSize: 15 }}
          onRow={record => ({
            onDoubleClick: () => openProductDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Drawer
        title={
          <Space>
            <AppstoreOutlined />
            <span>{detailRecord?.name || '产品详情'}</span>
            {detailRecord?.category && <Tag>{detailRecord.category}</Tag>}
          </Space>
        }
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 720}
        bodyStyle={isMobile ? { padding: 12 } : undefined}
      >
        {detailRecord && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
              <Descriptions.Item label="产品名称" span={2}>{detailRecord.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="产品链接" span={2}>{renderProductLink(detailRecord.product_link)}</Descriptions.Item>
              <Descriptions.Item label="公司主体">{renderSubject(detailRecord)}</Descriptions.Item>
              <Descriptions.Item label="集团名字">{detailRecord.company_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="产品类型">{detailRecord.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="产品类目">{detailRecord.product_category || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={productStatusMap[detailRecord.status]?.color}>{productStatusMap[detailRecord.status]?.label || detailRecord.status || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="上线时间">{detailRecord.launch_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="发现出处">{detailRecord.discovery_source || '-'}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{detailRecord.contact_phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="域名" span={2}>{detailRecord.domain || '-'}</Descriptions.Item>
              <Descriptions.Item label="产品描述" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.description || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="目标用户" span={2}>{detailRecord.target_users || '-'}</Descriptions.Item>
              <Descriptions.Item label="核心功能" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.core_features || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.notes || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailRecord.created_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailRecord.updated_at || '-'}</Descriptions.Item>
            </Descriptions>

            {detailLoading && <Text type="secondary">正在刷新详情...</Text>}
            <AttachmentList sourceType="company_product" sourceId={detailRecord.id} title="产品附件" showPreview />
          </Space>
        )}
      </Drawer>

      <Modal
        title={editingProduct ? '编辑产品' : '编辑产品'}
        open={editOpen}
        onOk={handleEditSave}
        confirmLoading={savingEdit}
        onCancel={() => {
          setEditOpen(false);
          setEditingProduct(null);
          editForm.resetFields();
        }}
        width={isMobile ? '100%' : 640}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="产品名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="产品类型" name="category">
                <Input placeholder="如：SaaS、APP、小程序" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="产品类目" name="product_category">
                <Input placeholder="产品类目，工具，互动营销，短剧等" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="状态" name="status">
                <Select>
                  {Object.entries(productStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="上线时间" name="launch_date">
                <Input placeholder="如：2023-06" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="联系电话" name="contact_phone">
                <Input placeholder="客服电话，方便看集团关联" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="域名" name="domain">
                <Input placeholder="对应产品的域名，方便看集团关联" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="产品链接" name="product_link">
                <Input placeholder="请输入 H5 链接或 deeplink 链接，如：https://... 或 app://..." />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="产品发现出处" name="discovery_source">
                <Input placeholder="如：中青看点" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="产品描述" name="description">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="目标用户" name="target_users">
                <Input placeholder="如：中小企业HR" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="核心功能" name="core_features">
                <TextArea rows={2} placeholder="列举1-3个核心功能..." />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 主页面 ====================
export default function Companies() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProjectGroups, setFilterProjectGroups] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [entities, setEntities] = useState([]);
  const [activeEntity, setActiveEntity] = useState('overview'); // 'overview' | entity.id
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [users, setUsers] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { search };
    if (filterCategory) params.category = filterCategory;
    if (filterProjectGroups.length > 0) params.project_group_ids = filterProjectGroups.join(',');
    const res = await companiesApi.list(params);
    setData(res);
    setLoading(false);
  }, [search, filterCategory, filterProjectGroups]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersApi.listSimple().then(setUsers).catch(() => {});
    projectGroupsApi.list().then(setProjectGroups).catch(() => {});
  }, []);

  const loadEntities = useCallback(async (companyId) => {
    const res = await companyEntitiesApi.list({ company_id: companyId });
    setEntities(res);
  }, []);

  const openDetail = (record) => {
    setCurrent(record);
    setActiveEntity('overview');
    setEntities([]);
    setDrawerOpen(true);
    loadEntities(record.id);
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (r) => { setEditing(r); setModalOpen(true); };

  const handleDelete = async (id) => {
    await companiesApi.delete(id);
    message.success('删除成功');
    load();
  };

  const getProjectGroupTags = (projectGroupIds) => {
    const ids = parseIdList(projectGroupIds);
    if (ids.length === 0) return null;
    const groups = ids.map(id => projectGroups.find(group => Number(group.id) === Number(id))).filter(Boolean);
    if (groups.length === 0) return null;
    return (
      <Space size={[4, 4]} wrap>
        {groups.map(group => <Tag key={group.id} color="geekblue">{group.name}</Tag>)}
      </Space>
    );
  };

  const getProjectGroupListTags = (projectGroupIds) => {
    const ids = parseIdList(projectGroupIds);
    if (ids.length === 0) return null;
    const groups = ids.map(id => projectGroups.find(group => Number(group.id) === Number(id))).filter(Boolean);
    if (groups.length === 0) return null;
    return renderCompanyListTags(
      groups.map(group => ({ key: group.id, label: group.name, color: 'geekblue' })),
    );
  };

  const columns = [
    {
      title: '公司名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (v, r) => (
        <Button
          type="link"
          onClick={() => openDetail(r)}
          title={v || ''}
          style={{ padding: 0, maxWidth: '100%' }}
        >
          <strong style={companyListEllipsisStyle}>{v}</strong>
        </Button>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      ellipsis: true,
      render: v => {
        const m = categoryMap[v];
        return m ? renderCompanyListTags([{ key: v, label: m.label, color: m.color }]) : '-';
      },
    },
    { title: '行业', dataIndex: 'industry', ellipsis: true, render: v => renderCompanyListText(v) },
    {
      title: '规模',
      dataIndex: 'scale',
      ellipsis: true,
      render: v => renderCompanyListText(scaleMap[v] || v),
    },
    { title: '总部', dataIndex: 'hq_city', ellipsis: true, render: v => renderCompanyListText(v) },
    {
      title: '主营业务',
      dataIndex: 'business',
      ellipsis: true,
      render: v => renderCompanyListText(richTextToPlain(v)),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      ellipsis: true,
      render: v => renderCompanyListTags(splitCompanyTags(v)),
    },
    {
      title: '关联项目组',
      dataIndex: 'project_group_ids',
      width: 180,
      ellipsis: true,
      render: v => getProjectGroupListTags(v) || '-',
    },
    { title: '更新时间', dataIndex: 'updated_at', ellipsis: true, render: v => renderCompanyListText(v?.slice(0, 10)) },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 90,
      ellipsis: true,
      render: (v) => {
        if (!v) return '-';
        const u = users.find(x => x.id === v);
        return renderCompanyListText(u ? (u.display_name || u.username) : '');
      },
    },
    {
      title: '共享人',
      dataIndex: 'shared_with',
      width: 160,
      ellipsis: true,
      render: (v) => {
        const ids = v ? String(v).split(',').filter(Boolean).map(Number) : [];
        if (ids.length === 0) return '-';
        const named = ids.map(id => {
          const u = users.find(x => x.id === id);
          return u ? (u.display_name || u.username) : `#${id}`;
        });
        return renderCompanyListTags(named.map((name, index) => ({ key: `${index}-${name}`, label: name })));
      },
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？该公司所有人员、产品、动向将同步删除。" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderCompanyCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card
        size="small"
        style={{ width: '100%', cursor: 'pointer' }}
        onClick={() => openDetail(record)}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#1677ff' }}>{record.name}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                <Text type="secondary">行业：{record.industry || '-'}</Text>
                <Text type="secondary">总部：{record.hq_city || '-'}</Text>
              </div>
            </div>
            {record.category && <Tag color={categoryMap[record.category]?.color}>{categoryMap[record.category]?.label}</Tag>}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Text type="secondary">规模：{scaleMap[record.scale] || record.scale || '-'}</Text>
            <Text type="secondary">更新：{record.updated_at?.slice(0, 10) || '-'}</Text>
          </div>
          {record.business && (
            <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
              主营业务：{richTextToPlain(record.business)}
            </Paragraph>
          )}
          {record.tags && (
            <Space wrap size={[4, 4]}>
              {record.tags.split(',').filter(Boolean).map(tag => <Tag key={`${record.id}-${tag}`}>{tag.trim()}</Tag>)}
            </Space>
          )}
          {getProjectGroupTags(record.project_group_ids) && (
            <div>
              <Text type="secondary">关联项目组：</Text>
              {getProjectGroupTags(record.project_group_ids)}
            </div>
          )}
          <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
            <Popconfirm title="确认删除？该公司所有人员、产品、动向将同步删除。" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </Space>
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <Tabs
        defaultActiveKey="companies"
        tabBarGutter={isMobile ? 12 : 20}
        items={[
          {
            key: 'companies',
            label: <span><BankOutlined /> 公司</span>,
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加公司</Button>
                </div>

                <Space style={{ marginBottom: 16, width: isMobile ? '100%' : undefined }} wrap direction={isMobile ? 'vertical' : 'horizontal'}>
                  <Input.Search
                    placeholder="搜索公司名称、行业、业务、标签"
                    allowClear
                    style={{ width: isMobile ? '100%' : 280 }}
                    onSearch={setSearch}
                    onChange={e => !e.target.value && setSearch('')}
                  />
                  <Select
                    placeholder="公司分类"
                    allowClear
                    style={{ width: isMobile ? '100%' : 130 }}
                    value={filterCategory || undefined}
                    onChange={v => setFilterCategory(v || '')}
                  >
                    {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                  </Select>
                  <Select
                    placeholder="关联项目组"
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ width: isMobile ? '100%' : 180 }}
                    value={filterProjectGroups}
                    onChange={value => setFilterProjectGroups(value)}
                    options={projectGroups.map(group => ({ value: group.id, label: group.name }))}
                  />
                </Space>

                {isMobile ? (
                  <List
                    dataSource={data}
                    rowKey="id"
                    loading={loading}
                    pagination={{ defaultPageSize: 15, showSizeChanger: false }}
                    locale={{ emptyText: '暂无公司数据' }}
                    renderItem={renderCompanyCard}
                  />
                ) : (
                  <ResizableTable
                    storageKey="companies-table-columns"
                    columns={columns}
                    dataSource={data}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    scroll={{ x: 1180 }}
                    pagination={{ defaultPageSize: 15 }}
                    onRow={record => ({
                      onDoubleClick: () => openDetail(record),
                      style: { cursor: 'pointer' },
                    })}
                  />
                )}
              </>
            ),
          },
          {
            key: 'products',
            label: <span><AppstoreOutlined /> 产品</span>,
            children: <AllProductsView />,
          },
        ]}
      />

      {/* 添加/编辑弹窗 */}
      <CompanyModal
        open={modalOpen}
        editing={editing}
        projectGroups={projectGroups}
        onClose={() => setModalOpen(false)}
        onSuccess={load}
      />

      {/* 详情 Drawer */}
      <Drawer
        title={
          <Space>
            <BankOutlined />
            <span>{current?.name}</span>
            {current && <Tag color={categoryMap[current.category]?.color}>{categoryMap[current.category]?.label}</Tag>}
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={isMobile ? '100%' : '66vw'}
        bodyStyle={isMobile ? { padding: 12 } : undefined}
        extra={
          <Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(current); }}>
            编辑公司信息
          </Button>
        }
      >
        {current && (() => {
          // 构建外层主体 Tab 列表
          const entityTabItems = [
            // ---- 集团总览 ----
            {
              key: 'overview',
              label: <span><BankOutlined /> 集团总览</span>,
              children: (
                <div>
                  <SummaryCard companyId={current.id} />
                  <Tabs
                    size="small"
                    defaultActiveKey="info"
                    tabBarGutter={isMobile ? 8 : 16}
                    moreIcon={<span style={{ fontSize: 14 }}>⋯</span>}
                    items={[
                      {
                        key: 'info',
                        label: '基本信息',
                        icon: <BankOutlined />,
                        children: (
                          <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
                            <Descriptions.Item label="公司分类">
                              <Tag color={categoryMap[current.category]?.color}>{categoryMap[current.category]?.label}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="行业">{current.industry || '-'}</Descriptions.Item>
                            <Descriptions.Item label="规模">{scaleMap[current.scale] || current.scale || '-'}</Descriptions.Item>
                            <Descriptions.Item label="成立年份">{current.founded_year || '-'}</Descriptions.Item>
                            <Descriptions.Item label="总部城市">{current.hq_city || '-'}</Descriptions.Item>
                            {current.website && (
                              <Descriptions.Item label="官网" span={2}>
                                <a href={current.website} target="_blank" rel="noreferrer">{current.website}</a>
                              </Descriptions.Item>
                            )}
                            {current.business && (
                              <Descriptions.Item label="主营业务" span={2}>
                                <RichTextView value={current.business} />
                              </Descriptions.Item>
                            )}
                            <Descriptions.Item label="商业模式">{current.business_model || '-'}</Descriptions.Item>
                            <Descriptions.Item label="营收规模">{current.revenue_scale || '-'}</Descriptions.Item>
                            {current.tags && (
                              <Descriptions.Item label="标签" span={2}>
                                {current.tags.split(',').map(t => <Tag key={t}>{t.trim()}</Tag>)}
                              </Descriptions.Item>
                            )}
                            {current.notes && (
                              <Descriptions.Item label="备注" span={2}>
                                <RichTextView value={current.notes} />
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                        ),
                      },
                      {
                        key: 'personnel',
                        label: <span><TeamOutlined /> 全员架构</span>,
                        children: <PersonnelTab companyId={current.id} companyName={current.name} />,
                      },
                      {
                        key: 'products',
                        label: <span><AppstoreOutlined /> 全部产品</span>,
                        children: <ProductsTab companyId={current.id} entities={entities} />,
                      },
                      {
                        key: 'competitor_research',
                        label: <span><RiseOutlined /> 竞品研究记录</span>,
                        children: <CompetitorResearchTab companyId={current.id} />,
                      },
                      {
                        key: 'dynamics',
                        label: <span><ThunderboltOutlined /> 动向记录</span>,
                        children: <DynamicsTab companyId={current.id} />,
                      },
                      {
                        key: 'entities_mgr',
                        label: <span style={{ color: '#1677ff' }}>⚙ 管理主体</span>,
                        children: (
                          <EntityManager
                            companyId={current.id}
                            entities={entities}
                            onRefresh={() => loadEntities(current.id)}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            // ---- 各主体 Tab ----
            ...entities.map(entity => ({
              key: String(entity.id),
              label: (
                <span>
                  <ApartmentOutlined style={{ marginRight: 4 }} />
                  {entity.name}
                </span>
              ),
              children: (
                <div>
                  {/* 主体基本信息 */}
                  <Card
                    size="small"
                    style={{ marginBottom: 12, background: '#f9f9ff', border: '1px solid #e0e0ff' }}
                  >
                    <Descriptions column={isMobile ? 1 : 3} size="small">
                      <Descriptions.Item label="主体名称"><Text strong>{entity.name}</Text></Descriptions.Item>
                      {entity.reg_name && <Descriptions.Item label="注册名称">{entity.reg_name}</Descriptions.Item>}
                      {entity.city && <Descriptions.Item label="注册城市">{entity.city}</Descriptions.Item>}
                      {entity.address && <Descriptions.Item label="地址" span={3}>{entity.address}</Descriptions.Item>}
                      {entity.established_date && <Descriptions.Item label="成立日期">{entity.established_date}</Descriptions.Item>}
                      {entity.legal_representative && <Descriptions.Item label="法人代表">{entity.legal_representative}</Descriptions.Item>}
                      {(entity.social_security_count !== null && entity.social_security_count !== undefined && entity.social_security_count !== '') && (
                        <Descriptions.Item label="社保人数">{entity.social_security_count}</Descriptions.Item>
                      )}
                      {(entity.software_copyright_count !== null && entity.software_copyright_count !== undefined && entity.software_copyright_count !== '') && (
                        <Descriptions.Item label="软著数量">{entity.software_copyright_count}</Descriptions.Item>
                      )}
                      {entity.contact_phone && <Descriptions.Item label="联系电话">{entity.contact_phone}</Descriptions.Item>}
                      {entity.business && <Descriptions.Item label="主营方向" span={3}>{entity.business}</Descriptions.Item>}
                      {entity.notes && <Descriptions.Item label="备注" span={3}>{entity.notes}</Descriptions.Item>}
                    </Descriptions>
                  </Card>
                  {/* 人员 & 产品二级 Tab */}
                  <Tabs
                    size="small"
                    defaultActiveKey="personnel"
                    tabBarGutter={isMobile ? 8 : 16}
                    moreIcon={<span style={{ fontSize: 14 }}>⋯</span>}
                    items={[
                      {
                        key: 'personnel',
                        label: <span><TeamOutlined /> 人员架构</span>,
                        children: (
                          <PersonnelTab
                            companyId={current.id}
                            companyName={entity.name}
                            entityId={entity.id}
                          />
                        ),
                      },
                      {
                        key: 'products',
                        label: <span><AppstoreOutlined /> 产品矩阵</span>,
                        children: (
                          <ProductsTab
                            companyId={current.id}
                            entityId={entity.id}
                            entities={entities}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            })),
          ];

          return (
            <Tabs
              activeKey={activeEntity}
              onChange={setActiveEntity}
              type={isMobile ? 'line' : 'card'}
              size={isMobile ? 'small' : undefined}
              tabBarGutter={isMobile ? 8 : 16}
              moreIcon={<span style={{ fontSize: 14 }}>⋯</span>}
              style={{ marginTop: -8 }}
              items={entityTabItems}
            />
          );
        })()}
      </Drawer>
    </div>
  );
}
