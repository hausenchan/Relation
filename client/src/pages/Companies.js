import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Tag, Space, Modal, Form, Row, Col,
  Typography, Drawer, Tabs, Popconfirm, message, Tooltip, Divider,
  Timeline, Card, Badge, Empty, Descriptions, Segmented
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined,
  UserOutlined, AppstoreOutlined, ThunderboltOutlined,
  UserAddOutlined, LinkOutlined, GlobalOutlined, TeamOutlined,
  ApartmentOutlined, UnorderedListOutlined
} from '@ant-design/icons';
import { Tree, TreeNode } from 'react-organizational-chart';
import {
  companiesApi, companyPersonnelApi, companyProductsApi, companyDynamicsApi, companyEntitiesApi, competitorResearchApi
} from '../api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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

const importanceMap = {
  high:   { label: '重要', color: 'red' },
  normal: { label: '一般', color: 'default' },
  low:    { label: '低',   color: 'default' },
};

// ==================== 子表单：添加/编辑公司 ====================
function CompanyModal({ open, editing, onClose, onSuccess }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) {
      if (editing) form.setFieldsValue(editing);
      else form.resetFields();
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    if (editing) {
      await companiesApi.update(editing.id, values);
      message.success('更新成功');
    } else {
      await companiesApi.create(values);
      message.success('添加成功');
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
      width={720}
      okText="保存"
      cancelText="取消"
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
    >
      <Form form={form} layout="vertical" size="small">
        <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>基本信息</Divider>
        <Row gutter={16}>
          <Col span={10}>
            <Form.Item label="公司名称" name="name" rules={[{ required: true }]}>
              <Input prefix={<BankOutlined />} />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item label="公司分类" name="category" initialValue="competitor" rules={[{ required: true }]}>
              <Select>
                {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item label="行业" name="industry">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="规模" name="scale">
              <Select allowClear>
                {Object.entries(scaleMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="成立年份" name="founded_year">
              <Input placeholder="如：2018" />
            </Form.Item>
          </Col>
          <Col span={8}>
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
            <Form.Item label="主营业务" name="business">
              <TextArea rows={2} placeholder="简述核心业务方向..." />
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
            <Form.Item label="备注" name="notes">
              <TextArea rows={2} />
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'list', icon: <UnorderedListOutlined />, label: '列表' },
            { value: 'org',  icon: <ApartmentOutlined />,    label: '架构图' },
          ]}
        />
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>点击"加入人脉库"可将离职骨干转为外部人才</Text>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加人员</Button>
        </Space>
      </div>

      {viewMode === 'list'
        ? <Table columns={columns} dataSource={data} rowKey="id" size="small" pagination={false} />
        : orgView
      }

      <Modal
        title={editing ? '编辑人员' : '添加人员'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={640}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="姓名" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="级别" name="level" initialValue="mid">
                <Select>
                  {Object.entries(levelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="状态" name="status" initialValue="active">
                <Select>
                  {Object.entries(personnelStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="部门" name="department">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="职位" name="title">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
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
            <Col span={12}>
              <Form.Item label="入职时间" name="join_date">
                <Input placeholder="如：2022-03" />
              </Form.Item>
            </Col>
            <Col span={12}>
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
  const [data, setData] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const params = { company_id: companyId };
    if (entityId !== undefined) params.entity_id = entityId === null ? 'null' : entityId;
    const res = await companyProductsApi.list(params);
    setData(res);
  }, [companyId, entityId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    // 如果是在某个主体下打开，预填主体
    if (entityId != null) form.setFieldsValue({ entity_id: entityId });
    setModalOpen(true);
  };
  const openEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    // entity_id 优先从表单取，不传则保留 entityId（分主体视图）
    const payload = {
      ...values,
      company_id: companyId,
      entity_id: values.entity_id ?? entityId ?? null,
    };
    if (editing) { await companyProductsApi.update(editing.id, payload); message.success('已更新'); }
    else { await companyProductsApi.create(payload); message.success('已添加'); }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await companyProductsApi.delete(id);
    load();
  };

  // entity_id -> 主体名称 map
  const entityNameMap = Object.fromEntries(entities.map(e => [e.id, e.name]));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加产品</Button>
      </div>

      {data.length === 0 ? <Empty description="暂无产品信息" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
        <Row gutter={[12, 12]}>
          {data.map(p => {
            const entityName = p.entity_id ? entityNameMap[p.entity_id] : null;
            return (
              <Col span={12} key={p.id}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <AppstoreOutlined />
                      <Text strong>{p.name}</Text>
                      {p.category && <Tag>{p.category}</Tag>}
                    </Space>
                  }
                  extra={
                    <Space>
                      {entityName && (
                        <Tag color="geekblue" style={{ fontSize: 11 }}>{entityName}</Tag>
                      )}
                      <Tag color={productStatusMap[p.status]?.color}>{productStatusMap[p.status]?.label || p.status}</Tag>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />
                      <Popconfirm title="确认删除？" onConfirm={() => handleDelete(p.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  }
                >
                  {p.launch_date && <Text type="secondary" style={{ fontSize: 12 }}>上线：{p.launch_date}</Text>}
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
        onCancel={() => setModalOpen(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item label="产品名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item label="产品类型" name="category">
                <Input placeholder="如：SaaS、APP、小程序" />
              </Form.Item>
            </Col>
            <Col span={7}>
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
            <Col span={12}>
              <Form.Item label="上线时间" name="launch_date">
                <Input placeholder="如：2023-06" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="产品描述" name="description">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
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
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 竞品研究记录 Tab ====================
function CompetitorResearchTab({ companyId }) {
  const [data, setData] = useState([]);
  const [filterImportance, setFilterImportance] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const params = { company_id: companyId };
    const res = await competitorResearchApi.list(params);
    let filtered = res;
    if (filterImportance) filtered = filtered.filter(r => r.importance === filterImportance);
    setData(filtered);
  }, [companyId, filterImportance]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs().format('YYYY-MM-DD'), importance: 'normal' }); setModalOpen(true); };
  const openEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = { ...values, company_id: companyId };
    if (editing) { await competitorResearchApi.update(editing.id, payload); message.success('已更新'); }
    else { await competitorResearchApi.create(payload); message.success('已记录'); }
    setModalOpen(false);
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
    { title: '金额', dataIndex: 'amount', width: 100, render: (v) => v ? `¥${v}` : '-' },
    { title: '结果', dataIndex: 'outcome', ellipsis: true },
    { title: '下次行动', dataIndex: 'next_action', ellipsis: true },
    { title: '下次日期', dataIndex: 'next_action_date', width: 110 },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Select
          placeholder="全部重要程度"
          allowClear
          style={{ width: 140 }}
          value={filterImportance || undefined}
          onChange={v => setFilterImportance(v || '')}
        >
          {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加记录</Button>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <Modal
        title={editing ? '编辑记录' : '添加记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="重要程度" name="importance" initialValue="normal">
                <Select>
                  {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
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
              <Form.Item label="详细内容" name="content">
                <TextArea rows={3} placeholder="详细描述..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="信息来源" name="source">
                <Input placeholder="如：官网、行业报告" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="结果" name="outcome">
                <Input placeholder="研究结果" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="影响分析" name="impact">
                <TextArea rows={2} placeholder="对我们的影响..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下次行动" name="next_action">
                <Input placeholder="后续跟进计划" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下次行动日期" name="next_action_date">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ==================== 动向 Tab ====================
function DynamicsTab({ companyId }) {
  const [data, setData] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
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
        <div style={{ marginBottom: 8 }}>
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
          <Space style={{ marginTop: 6 }} size={4}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
        <Space>
          <Select
            placeholder="全部类型"
            allowClear
            style={{ width: 120 }}
            value={filterType || undefined}
            onChange={v => setFilterType(v || '')}
          >
            {Object.entries(dynamicTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
        </Space>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>记录动向</Button>
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
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="动向类型" name="type" initialValue="talent" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(dynamicTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={8}>
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
            <Col span={12}>
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
    </div>
  );
}

// ==================== 主体管理 ====================
function EntityManager({ companyId, entities, onRefresh }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (e) => { setEditing(e); form.setFieldsValue(e); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await companyEntitiesApi.update(editing.id, values);
      message.success('已更新');
    } else {
      await companyEntitiesApi.create({ ...values, company_id: companyId });
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

  return (
    <>
      <Modal
        title={editing ? '编辑主体' : '新增主体'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="主体名称（简称）" name="name" rules={[{ required: true }]}>
                <Input placeholder="如：北京主体、电商品牌" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="注册名称" name="reg_name">
                <Input placeholder="如：XX科技（北京）有限公司" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="注册城市" name="city">
                <Input placeholder="如：北京" />
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
      {entities.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {entities.map(e => (
            <Tag
              key={e.id}
              style={{ marginBottom: 4, cursor: 'default', fontSize: 12, padding: '2px 8px' }}
            >
              {e.name}
              {e.reg_name && <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{e.reg_name}</Text>}
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                style={{ fontSize: 11, padding: '0 2px', height: 18 }}
                onClick={() => openEdit(e)}
              />
              <Popconfirm
                title="删除主体后，该主体下的人员和产品将解绑（不会删除），确认？"
                onConfirm={() => handleDelete(e.id)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ fontSize: 11, padding: '0 2px', height: 18 }}
                />
              </Popconfirm>
            </Tag>
          ))}
        </div>
      )}
    </>
  );
}

// ==================== 研究摘要卡片 ====================
function SummaryCard({ companyId }) {
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
          <Col span={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#722ed1' }}>{personnel.active}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>在册骨干</Text>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>{products.active}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>运营产品</Text>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>{products.developing}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>在研产品</Text>
            </div>
          </Col>
          <Col span={6}>
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

// ==================== 主页面 ====================
export default function Companies() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [entities, setEntities] = useState([]);
  const [activeEntity, setActiveEntity] = useState('overview'); // 'overview' | entity.id
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { search };
    if (filterCategory) params.category = filterCategory;
    const res = await companiesApi.list(params);
    setData(res);
    setLoading(false);
  }, [search, filterCategory]);

  useEffect(() => { load(); }, [load]);

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

  const columns = [
    {
      title: '公司名称',
      dataIndex: 'name',
      render: (v, r) => (
        <Button type="link" onClick={() => openDetail(r)} style={{ padding: 0 }}>
          <strong>{v}</strong>
        </Button>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      render: v => { const m = categoryMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : '-'; },
    },
    { title: '行业', dataIndex: 'industry', render: v => v || '-' },
    {
      title: '规模',
      dataIndex: 'scale',
      render: v => v ? <Text style={{ fontSize: 12 }}>{scaleMap[v] || v}</Text> : '-',
    },
    { title: '总部', dataIndex: 'hq_city', render: v => v || '-' },
    {
      title: '主营业务',
      dataIndex: 'business',
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '标签',
      dataIndex: 'tags',
      render: v => v ? v.split(',').map(t => <Tag key={t} style={{ marginBottom: 2 }}>{t.trim()}</Tag>) : '-',
    },
    { title: '更新时间', dataIndex: 'updated_at', render: v => v?.slice(0, 10) },
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><BankOutlined /> 公司研究</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加公司</Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索公司名称、行业、业务、标签"
          allowClear
          style={{ width: 280 }}
          onSearch={setSearch}
          onChange={e => !e.target.value && setSearch('')}
        />
        <Select
          placeholder="公司分类"
          allowClear
          style={{ width: 130 }}
          value={filterCategory || undefined}
          onChange={v => setFilterCategory(v || '')}
        >
          {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 15 }}
        onRow={record => ({
          onDoubleClick: () => openDetail(record),
          style: { cursor: 'pointer' },
        })}
      />

      {/* 添加/编辑弹窗 */}
      <CompanyModal
        open={modalOpen}
        editing={editing}
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
        width={860}
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
                    items={[
                      {
                        key: 'info',
                        label: '基本信息',
                        icon: <BankOutlined />,
                        children: (
                          <Descriptions column={2} size="small" bordered>
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
                              <Descriptions.Item label="主营业务" span={2}>{current.business}</Descriptions.Item>
                            )}
                            <Descriptions.Item label="商业模式">{current.business_model || '-'}</Descriptions.Item>
                            <Descriptions.Item label="营收规模">{current.revenue_scale || '-'}</Descriptions.Item>
                            {current.tags && (
                              <Descriptions.Item label="标签" span={2}>
                                {current.tags.split(',').map(t => <Tag key={t}>{t.trim()}</Tag>)}
                              </Descriptions.Item>
                            )}
                            {current.notes && (
                              <Descriptions.Item label="备注" span={2}>{current.notes}</Descriptions.Item>
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
                    <Descriptions column={3} size="small">
                      <Descriptions.Item label="主体名称"><Text strong>{entity.name}</Text></Descriptions.Item>
                      {entity.reg_name && <Descriptions.Item label="注册名称">{entity.reg_name}</Descriptions.Item>}
                      {entity.city && <Descriptions.Item label="注册城市">{entity.city}</Descriptions.Item>}
                      {entity.business && <Descriptions.Item label="主营方向" span={3}>{entity.business}</Descriptions.Item>}
                      {entity.notes && <Descriptions.Item label="备注" span={3}>{entity.notes}</Descriptions.Item>}
                    </Descriptions>
                  </Card>
                  {/* 人员 & 产品二级 Tab */}
                  <Tabs
                    size="small"
                    defaultActiveKey="personnel"
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
              type="card"
              style={{ marginTop: -8 }}
              items={entityTabItems}
            />
          );
        })()}
      </Drawer>
    </div>
  );
}
