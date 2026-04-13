import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Tag, Space, Modal, Form, Row, Col,
  Typography, Drawer, Descriptions, Tabs, Popconfirm, message, Tooltip, Divider,
  Upload, Alert
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  PhoneOutlined, MailOutlined, WechatOutlined, EnvironmentOutlined, MessageOutlined,
  UploadOutlined, DownloadOutlined, SwapOutlined
} from '@ant-design/icons';
import { personsApi, interactionsApi, remindersApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import InteractionForm from '../components/InteractionForm';
import ReminderForm from '../components/ReminderForm';
import InteractionList from '../components/InteractionList';
import ReminderList from '../components/ReminderList';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export const categoryMap = {
  business: { label: '商务圈', color: 'blue' },
  talent:   { label: '人才圈', color: 'green' },
  startup:  { label: '创业圈', color: 'orange' },
  social:   { label: '社交圈', color: 'purple' },
};

export const relationTypeMap = {
  client_potential: { label: '潜在客户',    color: 'cyan',     category: 'business' },
  client_active:    { label: '合作客户',    color: 'blue',     category: 'business' },
  talent_external:  { label: '外部人才',    color: 'green',    category: 'talent' },
  talent_internal:  { label: '内部人才',    color: 'lime',     category: 'talent' },
  partner:          { label: '创业伙伴',    color: 'orange',   category: 'startup' },
  investor:         { label: '投资人/顾问', color: 'gold',     category: 'startup' },
  family:           { label: '家人亲戚',    color: 'magenta',  category: 'social' },
  friend:           { label: '朋友',        color: 'purple',   category: 'social' },
  other:            { label: '其他',        color: 'default',  category: null },
};

// 外部人才：转化阶段
const recruitStatusMap = {
  potential:    { label: '待挖掘',   color: 'default' },
  contacted:    { label: '已接触',   color: 'blue' },
  interviewing: { label: '面试中',   color: 'purple' },
  offered:      { label: '已发Offer', color: 'gold' },
  joined:       { label: '已入职',   color: 'green' },
  passed:       { label: '放弃',     color: 'default' },
};

// 外部人才：潜力评级
const potentialLevelMap = {
  high:   { label: '高潜力', color: 'red' },
  medium: { label: '中潜力', color: 'orange' },
  low:    { label: '低潜力', color: 'default' },
};

const intentMap = {
  high:    { label: '高意向', color: 'red' },
  medium:  { label: '中意向', color: 'orange' },
  low:     { label: '低意向', color: 'blue' },
  advisor: { label: '潜在顾问', color: 'geekblue' },
  unknown: { label: '未知',   color: 'default' },
};

const levelMap = {
  vip:      { label: 'VIP',  color: 'gold' },
  key:      { label: '重要', color: 'red' },
  normal:   { label: '普通', color: 'blue' },
  potential:{ label: '潜在', color: 'default' },
};

const weightMap = {
  high:   { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low:    { label: '低', color: 'default' },
};

const parseRelationTypes = (str) =>
  str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

function RelationTags({ value }) {
  const types = parseRelationTypes(value);
  return (
    <Space size={2} wrap>
      {types.map(t => {
        const m = relationTypeMap[t];
        return m ? <Tag key={t} color={m.color}>{m.label}</Tag> : null;
      })}
    </Space>
  );
}

// 通用字段分区（所有人都有）
function commonFields() {
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>基本信息</Divider>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="圈子分类" name="person_category" rules={[{ required: true }]}>
            <Select>
              {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="关系类型（可多选）"
            shouldUpdate={(prev, cur) => prev.person_category !== cur.person_category}
          >
            {({ getFieldValue }) => {
              const cat = getFieldValue('person_category');
              const opts = Object.entries(relationTypeMap).filter(([, v]) => !cat || v.category === cat || !v.category);
              return (
                <Form.Item name="relation_types" noStyle>
                  <Select mode="multiple" placeholder="选择关系类型">
                    {opts.map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="手机" name="phone">
            <Input prefix={<PhoneOutlined />} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="微信" name="wechat">
            <Input prefix={<WechatOutlined />} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="邮箱" name="email">
            <Input prefix={<MailOutlined />} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="城市" name="city">
            <Input prefix={<EnvironmentOutlined />} placeholder="如：北京" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="公司/单位" name="company">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="职位" name="position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="生日" name="birthday">
            <Input placeholder="如 1990-01-01" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="地址" name="address">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="标签（逗号分隔）" name="tags">
            <Input placeholder="如：重点维护,高潜力" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="权重" name="weight">
            <Select>
              {Object.entries(weightMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>资源与诉求</Divider>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="拥有资源" name="resources">
            <TextArea rows={2} placeholder="他/她掌握哪些资源、人脉、能力..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="诉求" name="demands">
            <TextArea rows={2} placeholder="他/她当前的需求、痛点、目标..." />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// 商务圈扩展字段
function businessFields() {
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>商务信息</Divider>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item label="行业" name="industry">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="关系等级" name="relationship_level">
            <Select>
              {Object.entries(levelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="客户状态" name="client_status">
            <Select>
              <Option value="active">活跃</Option>
              <Option value="inactive">不活跃</Option>
              <Option value="lost">流失</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// 外部人才扩展字段
function externalTalentFields() {
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>人才信息</Divider>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item label="现任公司" name="current_company">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="现任职位" name="current_position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="目标职位" name="target_position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="工作年限" name="experience_years">
            <Input type="number" addonAfter="年" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="最高学历" name="education">
            <Select>
              {['博士','硕士','本科','大专','其他'].map(v => <Option key={v} value={v}>{v}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="期望薪资" name="expected_salary">
            <Input placeholder="如：30-40K" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="来源渠道" name="source">
            <Input placeholder="如：内推、LinkedIn" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="技能标签" name="skills">
            <Input placeholder="如：Python, 数据分析, 增长" />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>潜力 & 转化阶段</Divider>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item label="潜力评级" name="potential_level">
            <Select allowClear placeholder="评估潜力">
              {Object.entries(potentialLevelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="转化阶段" name="recruit_status">
            <Select>
              {Object.entries(recruitStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="意向程度" name="intent_level">
            <Select>
              {Object.entries(intentMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// 内部人才扩展字段（员工评估：心脑口手）
function internalTalentFields() {
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>员工信息</Divider>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item label="现任公司" name="current_company">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="部门/职位" name="current_position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="入职时间" name="source">
            <Input placeholder="如：2023-06" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="工作年限" name="experience_years">
            <Input type="number" addonAfter="年" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="最高学历" name="education">
            <Select>
              {['博士','硕士','本科','大专','其他'].map(v => <Option key={v} value={v}>{v}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="技能标签" name="skills">
            <Input placeholder="如：Python, 数据分析, 增长" />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>员工评估（心·脑·口·手）</Divider>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={<span style={{ color: '#e64980', fontWeight: 600 }}>❤️ 心（价值观·使命感·忠诚度）</span>}
            name="heart"
          >
            <TextArea rows={3} placeholder="对公司使命的认同感、价值观匹配度、忠诚度..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={<span style={{ color: '#1677ff', fontWeight: 600 }}>🧠 脑（思维·专业·判断力）</span>}
            name="brain"
          >
            <TextArea rows={3} placeholder="专业能力、思维方式、学习能力、决策判断力..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={<span style={{ color: '#fa8c16', fontWeight: 600 }}>🗣️ 口（沟通·表达·影响力）</span>}
            name="mouth"
          >
            <TextArea rows={3} placeholder="沟通表达能力、汇报能力、对外影响力..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={<span style={{ color: '#52c41a', fontWeight: 600 }}>🙌 手（执行·落地·结果导向）</span>}
            name="hand"
          >
            <TextArea rows={3} placeholder="执行力、落地能力、完成结果的质量..." />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

export default function Persons() {
  const { user: currentUser, canAssign } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRelationType, setFilterRelationType] = useState('');
  const [filterPotentialLevel, setFilterPotentialLevel] = useState('');
  const [filterRecruitStatus, setFilterRecruitStatus] = useState('');
  const [filterIntentLevel, setFilterIntentLevel] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [intDrawerOpen, setIntDrawerOpen] = useState(false);
  const [intPerson, setIntPerson] = useState(null);
  const [intPersonInteractions, setIntPersonInteractions] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignUserId, setAssignUserId] = useState(undefined);
  const [teamMembers, setTeamMembers] = useState([]);
  const [form] = Form.useForm();
  const category = Form.useWatch('person_category', form);
  const relationTypes = Form.useWatch('relation_types', form) || [];
  const isExternalTalent = category === 'talent' && !relationTypes.includes('talent_internal');
  const isInternalTalent = category === 'talent' && relationTypes.includes('talent_internal');

  const load = useCallback(async () => {
    setLoading(true);
    const params = { search };
    if (filterCategory) params.person_category = filterCategory;
    if (filterRelationType) params.relation_type = filterRelationType;
    if (filterPotentialLevel) params.potential_level = filterPotentialLevel;
    if (filterRecruitStatus) params.recruit_status = filterRecruitStatus;
    if (filterIntentLevel) params.intent_level = filterIntentLevel;
    if (filterCity) params.city = filterCity;
    if (filterWeight) params.weight = filterWeight;
    const res = await personsApi.list(params);
    setData(res);
    setLoading(false);
  }, [search, filterCategory, filterRelationType, filterPotentialLevel, filterRecruitStatus, filterIntentLevel, filterCity, filterWeight]);

  useEffect(() => { load(); }, [load]);

  const openAssign = async (record) => {
    setAssignTarget(record);
    setAssignUserId(record.assigned_to || undefined);
    // 加载可见用户列表（同组成员）
    try {
      const users = await usersApi.list();
      setTeamMembers(users.filter(u => u.role !== 'admin'));
    } catch {
      setTeamMembers([]);
    }
  };

  const handleAssign = async () => {
    try {
      await personsApi.assign(assignTarget.id, { assigned_to: assignUserId || null });
      message.success('指派成功');
      setAssignTarget(null);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '指派失败');
    }
  };

  const openDetail = async (record) => {
    setCurrent(record);
    setDrawerOpen(true);
    const [ints, rems] = await Promise.all([
      interactionsApi.list({ person_id: record.id }),
      remindersApi.list({ person_id: record.id }),
    ]);
    setInteractions(ints);
    setReminders(rems);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      relation_types: parseRelationTypes(record.relation_types),
    });
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ person_category: 'social', relation_types: [], weight: 'medium' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      relation_types: Array.isArray(values.relation_types)
        ? values.relation_types.join(',')
        : (values.relation_types || ''),
    };
    if (editing) {
      await personsApi.update(editing.id, payload);
      message.success('更新成功');
      // 同步更新 current（详情 Drawer 的数据源）
      if (current && current.id === editing.id) {
        setCurrent({ ...editing, ...payload });
      }
    } else {
      await personsApi.create(payload);
      message.success('添加成功');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await personsApi.delete(id);
    message.success('删除成功');
    load();
  };

  const openIntDrawer = async (record) => {
    setIntPerson(record);
    setIntDrawerOpen(true);
    const res = await interactionsApi.list({ person_id: record.id });
    setIntPersonInteractions(res);
  };

  const reloadIntPersonInteractions = async () => {
    const res = await interactionsApi.list({ person_id: intPerson.id });
    setIntPersonInteractions(res);
  };

  // CSV 列头与字段的映射（支持中英文列名）
  const CSV_COLUMNS = [
    { key: 'name',              labels: ['姓名', 'name'] },
    { key: 'person_category',   labels: ['圈子分类', 'person_category'] },
    { key: 'relation_types',    labels: ['关系类型', 'relation_types'] },
    { key: 'phone',             labels: ['手机', 'phone'] },
    { key: 'wechat',            labels: ['微信', 'wechat'] },
    { key: 'email',             labels: ['邮箱', 'email'] },
    { key: 'city',              labels: ['城市', 'city'] },
    { key: 'company',           labels: ['公司', 'company'] },
    { key: 'position',          labels: ['职位', 'position'] },
    { key: 'industry',          labels: ['行业', 'industry'] },
    { key: 'birthday',          labels: ['生日', 'birthday'] },
    { key: 'address',           labels: ['地址', 'address'] },
    { key: 'tags',              labels: ['标签', 'tags'] },
    { key: 'resources',         labels: ['拥有资源', 'resources'] },
    { key: 'demands',           labels: ['诉求', 'demands'] },
    { key: 'notes',             labels: ['备注', 'notes'] },
    { key: 'weight',            labels: ['权重', 'weight'] },
  ];

  const parseCsv = (text) => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) return [];
    // 解析带引号的 CSV 字段
    const parseRow = (line) => {
      const fields = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === ',' && !inQ) {
          fields.push(cur.trim()); cur = '';
        } else {
          cur += c;
        }
      }
      fields.push(cur.trim());
      return fields;
    };
    const headers = parseRow(lines[0]);
    // 建立 header → field key 映射
    const colMap = headers.map(h => {
      const col = CSV_COLUMNS.find(c => c.labels.some(l => l === h.trim()));
      return col ? col.key : null;
    });
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseRow(lines[i]);
      const obj = {};
      colMap.forEach((key, idx) => { if (key) obj[key] = vals[idx] || ''; });
      if (obj.name) rows.push(obj);
    }
    return rows;
  };

  const handleCsvFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCsv(e.target.result);
        if (rows.length === 0) {
          message.error('未解析到有效数据，请检查文件格式');
          return;
        }
        setImportRows(rows);
      } catch {
        message.error('文件解析失败');
      }
    };
    reader.readAsText(file, 'UTF-8');
    return false; // 阻止 antd Upload 自动上传
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setImportLoading(true);
    try {
      const result = await personsApi.import(importRows);
      message.success(`导入成功 ${result.ok} 条${result.skip ? `，跳过 ${result.skip} 条（缺少姓名）` : ''}`);
      setImportOpen(false);
      setImportRows([]);
      load();
    } catch {
      message.error('导入失败，请重试');
    } finally {
      setImportLoading(false);
    }
  };

  const downloadTemplate = () => {
    const header = CSV_COLUMNS.map(c => c.labels[0]).join(',');
    const example = '张三,business,client_potential,13800138000,zhang3,zhang3@example.com,北京,示例公司,销售总监,互联网,1990-01-01,,重点客户,行业资源丰富,寻求融资对接,首次见面于行业峰会';
    const content = '\uFEFF' + header + '\n' + example; // BOM 让 Excel 正确识别 UTF-8
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '人脉导入模板.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // 检查是否有外部人才数据
  const hasExternalTalent = data.some(r => {
    const types = parseRelationTypes(r.relation_types);
    return r.person_category === 'talent' && types.includes('talent_external');
  });

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v, r) => (
        <Button type="link" onClick={() => openDetail(r)} style={{ padding: 0 }}>
          <strong>{v}</strong>
        </Button>
      ),
    },
    {
      title: '圈子',
      dataIndex: 'person_category',
      render: v => {
        const m = categoryMap[v];
        return m ? <Tag color={m.color}>{m.label}</Tag> : null;
      },
    },
    {
      title: '关系类型',
      dataIndex: 'relation_types',
      render: v => <RelationTags value={v} />,
    },
    {
      title: '权重',
      dataIndex: 'weight',
      width: 70,
      render: v => {
        const m = weightMap[v];
        return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>中</Tag>;
      },
    },
    // 外部人才专属列（动态显示）
    ...(hasExternalTalent ? [
      {
        title: '潜力评级',
        dataIndex: 'potential_level',
        render: (v, r) => {
          const types = parseRelationTypes(r.relation_types);
          if (r.person_category !== 'talent' || !types.includes('talent_external')) return null;
          const m = potentialLevelMap[v];
          return m ? <Tag color={m.color}>{m.label}</Tag> : <Text type="secondary">-</Text>;
        },
      },
      {
        title: '转化阶段',
        dataIndex: 'recruit_status',
        render: (v, r) => {
          const types = parseRelationTypes(r.relation_types);
          if (r.person_category !== 'talent' || !types.includes('talent_external')) return null;
          const m = recruitStatusMap[v];
          return m ? <Tag color={m.color}>{m.label}</Tag> : <Text type="secondary">-</Text>;
        },
      },
      {
        title: '意向程度',
        dataIndex: 'intent_level',
        render: (v, r) => {
          const types = parseRelationTypes(r.relation_types);
          if (r.person_category !== 'talent' || !types.includes('talent_external')) return null;
          const m = intentMap[v];
          return m ? <Tag color={m.color}>{m.label}</Tag> : <Text type="secondary">-</Text>;
        },
      },
    ] : []),
    {
      title: '城市',
      dataIndex: 'city',
      render: v => v || '-',
    },
    {
      title: '详细地址',
      dataIndex: 'address',
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '公司/单位',
      render: (_, r) => r.company || r.current_company || '-',
      ellipsis: true,
    },
    {
      title: '职位',
      render: (_, r) => r.position || r.current_position || '-',
      ellipsis: true,
    },
    {
      title: '联系方式',
      render: (_, r) => (
        <Space size={4}>
          {r.phone && <Tooltip title={r.phone}><PhoneOutlined style={{ color: '#1677ff' }} /></Tooltip>}
          {r.wechat && <Tooltip title={r.wechat}><WechatOutlined style={{ color: '#07C160' }} /></Tooltip>}
          {r.email && <Tooltip title={r.email}><MailOutlined style={{ color: '#722ed1' }} /></Tooltip>}
        </Space>
      ),
    },
    { title: '更新时间', dataIndex: 'updated_at', render: v => v?.slice(0, 10) },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<MessageOutlined />} onClick={() => openIntDrawer(r)}>互动记录</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          {canAssign() && (
            <Tooltip title="指派负责人">
              <Button size="small" icon={<SwapOutlined />} onClick={() => openAssign(r)}>指派</Button>
            </Tooltip>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const currentRelTypes = parseRelationTypes(current?.relation_types);
  const currentIsExternal = current?.person_category === 'talent' && !currentRelTypes.includes('talent_internal');
  const currentIsInternal = current?.person_category === 'talent' && currentRelTypes.includes('talent_internal');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>人脉管理</Title>
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => { setImportRows([]); setImportOpen(true); }}>导入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加人脉</Button>
        </Space>
      </div>

      {/* 第一行：通用筛选 */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="搜索姓名、公司、技能、标签"
          allowClear
          style={{ width: 280 }}
          onSearch={setSearch}
          onChange={e => !e.target.value && setSearch('')}
        />
        <Select
          placeholder="圈子分类"
          allowClear
          style={{ width: 120 }}
          value={filterCategory || undefined}
          onChange={v => {
            setFilterCategory(v || '');
            setFilterRelationType('');
            // 清空人才专属筛选
            if (v !== 'talent') {
              setFilterPotentialLevel('');
              setFilterRecruitStatus('');
              setFilterIntentLevel('');
            }
          }}
        >
          {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        <Select
          placeholder="关系类型"
          allowClear
          style={{ width: 140 }}
          value={filterRelationType || undefined}
          onChange={v => setFilterRelationType(v || '')}
        >
          {Object.entries(relationTypeMap)
            .filter(([, v]) => !filterCategory || v.category === filterCategory || !v.category)
            .map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        <Input.Search
          placeholder="城市"
          allowClear
          style={{ width: 120 }}
          onSearch={setFilterCity}
          onChange={e => !e.target.value && setFilterCity('')}
        />
        <Select
          placeholder="权重"
          allowClear
          style={{ width: 100 }}
          value={filterWeight || undefined}
          onChange={v => setFilterWeight(v || '')}
        >
          {Object.entries(weightMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
        </Select>
      </Space>

      {/* 第二行：人才专属筛选（仅在选择人才圈时显示） */}
      {filterCategory === 'talent' && (
        <Space style={{ marginBottom: 12, paddingLeft: 8, borderLeft: '3px solid #52c41a' }} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>人才筛选：</Text>
          <Select
            placeholder="潜力评级"
            allowClear
            style={{ width: 110 }}
            value={filterPotentialLevel || undefined}
            onChange={v => setFilterPotentialLevel(v || '')}
          >
            {Object.entries(potentialLevelMap).map(([k, v]) => (
              <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
            ))}
          </Select>
          <Select
            placeholder="转化阶段"
            allowClear
            style={{ width: 120 }}
            value={filterRecruitStatus || undefined}
            onChange={v => setFilterRecruitStatus(v || '')}
          >
            {Object.entries(recruitStatusMap).map(([k, v]) => (
              <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
            ))}
          </Select>
          <Select
            placeholder="意向程度"
            allowClear
            style={{ width: 110 }}
            value={filterIntentLevel || undefined}
            onChange={v => setFilterIntentLevel(v || '')}
          >
            {Object.entries(intentMap).map(([k, v]) => (
              <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
            ))}
          </Select>
        </Space>
      )}

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 15 }}
        onRow={(record) => ({
          onDoubleClick: () => openEdit(record),
          style: { cursor: 'pointer' }
        })}
        expandable={{
          rowExpandable: r => parseRelationTypes(r.relation_types).includes('talent_internal'),
          expandedRowRender: r => (
            <Row gutter={[12, 8]} style={{ padding: '4px 8px' }}>
              {[
                { key: 'heart', label: '❤️ 心', desc: '价值观·使命感·忠诚度', color: '#fff0f6', border: '#e64980' },
                { key: 'brain', label: '🧠 脑', desc: '思维·专业·判断力',    color: '#e6f4ff', border: '#1677ff' },
                { key: 'mouth', label: '🗣️ 口', desc: '沟通·表达·影响力',    color: '#fff7e6', border: '#fa8c16' },
                { key: 'hand',  label: '🙌 手', desc: '执行·落地·结果导向',  color: '#f6ffed', border: '#52c41a' },
              ].map(({ key, label, desc, color, border }) => (
                <Col span={6} key={key}>
                  <div style={{ background: color, border: `1px solid ${border}`, borderRadius: 6, padding: '8px 12px', minHeight: 60 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                      {label} <Text type="secondary" style={{ fontSize: 11 }}>{desc}</Text>
                    </div>
                    <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>
                      {r[key] || <Text type="secondary">暂无评估</Text>}
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          ),
        }}
      />

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editing ? '编辑人脉' : '添加人脉'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={760}
        okText="保存"
        cancelText="取消"
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 }}
      >
        <Form form={form} layout="vertical" size="small">
          {/* 通用字段 */}
          {commonFields()}

          {/* 商务圈字段 */}
          {category === 'business' && businessFields()}

          {/* 外部人才字段 */}
          {isExternalTalent && externalTalentFields()}

          {/* 内部人才字段 */}
          {isInternalTalent && internalTalentFields()}

          {/* 创业/社交圈补充 */}
          {(category === 'startup' || category === 'social') && (
            <>
              <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>补充信息</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="行业" name="industry"><Input /></Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>备注</Divider>
          <Form.Item name="notes">
            <TextArea rows={3} placeholder="其他备注..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 互动记录快速抽屉 */}
      <Drawer
        title={<Space><MessageOutlined />{intPerson?.name} 的互动记录</Space>}
        open={intDrawerOpen}
        onClose={() => setIntDrawerOpen(false)}
        width={560}
      >
        {intPerson && (
          <>
            <InteractionForm personId={intPerson.id} onSuccess={reloadIntPersonInteractions} />
            <InteractionList
              data={intPersonInteractions}
              onDelete={async (id) => {
                await interactionsApi.delete(id);
                reloadIntPersonInteractions();
              }}
            />
          </>
        )}
      </Drawer>

      {/* 详情抽屉 */}
      <Drawer
        title={
          <Space>
            {current?.name}
            {current && <Tag color={categoryMap[current.person_category]?.color}>{categoryMap[current.person_category]?.label}</Tag>}
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={660}
        extra={<Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(current); }}>编辑</Button>}
      >
        {current && (
          <Tabs defaultActiveKey="info" items={[
            {
              key: 'info', label: '基本信息',
              children: (
                <>
                  {/* 关系信息 */}
                  <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="关系类型" span={2}>
                      <RelationTags value={current.relation_types} />
                    </Descriptions.Item>
                    <Descriptions.Item label="城市">{current.city || '-'}</Descriptions.Item>
                    <Descriptions.Item label="生日">{current.birthday || '-'}</Descriptions.Item>
                    {(current.company || current.current_company) && (
                      <Descriptions.Item label="公司">{current.company || current.current_company}</Descriptions.Item>
                    )}
                    {(current.position || current.current_position) && (
                      <Descriptions.Item label="职位">{current.position || current.current_position}</Descriptions.Item>
                    )}
                    {current.industry && <Descriptions.Item label="行业" span={2}>{current.industry}</Descriptions.Item>}
                    {current.phone && <Descriptions.Item label="手机">{current.phone}</Descriptions.Item>}
                    {current.wechat && <Descriptions.Item label="微信">{current.wechat}</Descriptions.Item>}
                    {current.email && <Descriptions.Item label="邮箱" span={2}>{current.email}</Descriptions.Item>}
                    {current.address && <Descriptions.Item label="地址" span={2}>{current.address}</Descriptions.Item>}
                    {current.tags && (
                      <Descriptions.Item label="标签" span={2}>
                        {current.tags.split(',').filter(Boolean).map(t => <Tag key={t}>{t.trim()}</Tag>)}
                      </Descriptions.Item>
                    )}
                  </Descriptions>

                  {/* 资源与诉求 */}
                  {(current.resources || current.demands) && (
                    <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }} title="资源与诉求">
                      {current.resources && <Descriptions.Item label="拥有资源">{current.resources}</Descriptions.Item>}
                      {current.demands && <Descriptions.Item label="诉求">{current.demands}</Descriptions.Item>}
                    </Descriptions>
                  )}

                  {/* 商务圈专属 */}
                  {current.person_category === 'business' && (current.relationship_level || current.client_status) && (
                    <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }} title="商务信息">
                      {current.relationship_level && (
                        <Descriptions.Item label="关系等级">
                          <Tag color={levelMap[current.relationship_level]?.color}>{levelMap[current.relationship_level]?.label}</Tag>
                        </Descriptions.Item>
                      )}
                      {current.client_status && (
                        <Descriptions.Item label="客户状态">{current.client_status === 'active' ? '活跃' : current.client_status === 'inactive' ? '不活跃' : '流失'}</Descriptions.Item>
                      )}
                    </Descriptions>
                  )}

                  {/* 外部人才专属 */}
                  {currentIsExternal && (
                    <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }} title="人才信息">
                      {current.target_position && <Descriptions.Item label="目标职位">{current.target_position}</Descriptions.Item>}
                      {current.experience_years && <Descriptions.Item label="工作年限">{current.experience_years} 年</Descriptions.Item>}
                      {current.education && <Descriptions.Item label="学历">{current.education}</Descriptions.Item>}
                      {current.expected_salary && <Descriptions.Item label="期望薪资">{current.expected_salary}</Descriptions.Item>}
                      {current.potential_level && (
                        <Descriptions.Item label="潜力评级">
                          <Tag color={potentialLevelMap[current.potential_level]?.color}>{potentialLevelMap[current.potential_level]?.label}</Tag>
                        </Descriptions.Item>
                      )}
                      {current.recruit_status && (
                        <Descriptions.Item label="转化阶段">
                          <Tag color={recruitStatusMap[current.recruit_status]?.color}>{recruitStatusMap[current.recruit_status]?.label}</Tag>
                        </Descriptions.Item>
                      )}
                      {current.intent_level && (
                        <Descriptions.Item label="意向程度">
                          <Tag color={intentMap[current.intent_level]?.color}>{intentMap[current.intent_level]?.label}</Tag>
                        </Descriptions.Item>
                      )}
                      {current.source && <Descriptions.Item label="来源">{current.source}</Descriptions.Item>}
                      {current.skills && (
                        <Descriptions.Item label="技能" span={2}>
                          {current.skills.split(',').filter(Boolean).map(s => <Tag key={s} color="cyan">{s.trim()}</Tag>)}
                        </Descriptions.Item>
                      )}
                    </Descriptions>
                  )}

                  {/* 内部人才（员工）专属：心脑口手 */}
                  {currentIsInternal && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#333' }}>员工评估</div>
                      <Row gutter={[12, 12]}>
                        {[
                          { key: 'heart', label: '❤️ 心', desc: '价值观·使命感·忠诚度', color: '#fff0f6', border: '#e64980' },
                          { key: 'brain', label: '🧠 脑', desc: '思维·专业·判断力',    color: '#e6f4ff', border: '#1677ff' },
                          { key: 'mouth', label: '🗣️ 口', desc: '沟通·表达·影响力',    color: '#fff7e6', border: '#fa8c16' },
                          { key: 'hand',  label: '🙌 手', desc: '执行·落地·结果导向',  color: '#f6ffed', border: '#52c41a' },
                        ].map(({ key, label, desc, color, border }) => (
                          <Col span={12} key={key}>
                            <div style={{ background: color, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 14px' }}>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{label} <Text type="secondary" style={{ fontSize: 11 }}>{desc}</Text></div>
                              <div style={{ fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>
                                {current[key] || <Text type="secondary">暂无评估</Text>}
                              </div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  )}

                  {current.notes && (
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="备注">{current.notes}</Descriptions.Item>
                    </Descriptions>
                  )}
                </>
              )
            },
            {
              key: 'interactions', label: `互动记录 (${interactions.length})`,
              children: (
                <div>
                  <InteractionForm personId={current.id} onSuccess={async () => {
                    const res = await interactionsApi.list({ person_id: current.id });
                    setInteractions(res);
                  }} />
                  <InteractionList data={interactions} onDelete={async (id) => {
                    await interactionsApi.delete(id);
                    const res = await interactionsApi.list({ person_id: current.id });
                    setInteractions(res);
                  }} />
                </div>
              )
            },
            {
              key: 'reminders', label: `提醒 (${reminders.filter(r => !r.done).length})`,
              children: (
                <div>
                  <ReminderForm personId={current.id} onSuccess={async () => {
                    const res = await remindersApi.list({ person_id: current.id });
                    setReminders(res);
                  }} />
                  <ReminderList data={reminders} onDone={async (id) => {
                    await remindersApi.done(id);
                    const res = await remindersApi.list({ person_id: current.id });
                    setReminders(res);
                  }} onDelete={async (id) => {
                    await remindersApi.delete(id);
                    const res = await remindersApi.list({ person_id: current.id });
                    setReminders(res);
                  }} />
                </div>
              )
            },
          ]} />
        )}
      </Drawer>

      {/* 导入 Modal */}
      <Modal
        title="从 CSV/Excel 导入人脉"
        open={importOpen}
        onCancel={() => { setImportOpen(false); setImportRows([]); }}
        onOk={handleImport}
        okText={`确认导入 ${importRows.length} 条`}
        okButtonProps={{ disabled: importRows.length === 0, loading: importLoading }}
        cancelText="取消"
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="info"
            showIcon
            message="操作说明"
            description={
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                <li>请先下载模板，按格式填写后保存为 <b>CSV（UTF-8）</b> 格式</li>
                <li>Excel 用户：填写完毕后 → 另存为 → CSV UTF-8（逗号分隔）</li>
                <li><b>圈子分类</b>填英文值：business / talent / startup / social</li>
                <li><b>关系类型</b>填英文值（多个用逗号分隔）：client_potential / client_active / talent_external / talent_internal / partner / investor / family / friend / other</li>
              </ul>
            }
          />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载导入模板</Button>
            <Upload
              accept=".csv"
              showUploadList={false}
              beforeUpload={handleCsvFile}
            >
              <Button icon={<UploadOutlined />} type="primary" ghost>选择 CSV 文件</Button>
            </Upload>
          </Space>

          {importRows.length > 0 && (
            <>
              <div style={{ color: '#52c41a', fontSize: 13 }}>
                已解析 <b>{importRows.length}</b> 条记录，预览如下（最多显示 5 条）：
              </div>
              <Table
                size="small"
                pagination={false}
                dataSource={importRows.slice(0, 5).map((r, i) => ({ ...r, _key: i }))}
                rowKey="_key"
                scroll={{ x: 600 }}
                columns={[
                  { title: '姓名', dataIndex: 'name', width: 90 },
                  { title: '圈子', dataIndex: 'person_category', width: 80 },
                  { title: '关系类型', dataIndex: 'relation_types', ellipsis: true },
                  { title: '手机', dataIndex: 'phone', width: 120 },
                  { title: '公司', dataIndex: 'company', ellipsis: true },
                  { title: '职位', dataIndex: 'position', ellipsis: true },
                ]}
              />
              {importRows.length > 5 && (
                <div style={{ color: '#888', fontSize: 12 }}>...还有 {importRows.length - 5} 条</div>
              )}
            </>
          )}
        </Space>
      </Modal>

      {/* 指派负责人 Modal */}
      <Modal
        title={`指派负责人 - ${assignTarget?.name}`}
        open={!!assignTarget}
        onCancel={() => setAssignTarget(null)}
        onOk={handleAssign}
        okText="确认指派"
      >
        <div style={{ marginBottom: 8, color: '#888', fontSize: 13 }}>
          原录入人始终保留编辑权限，被指派人获得额外编辑权限。
        </div>
        <Select
          style={{ width: '100%' }}
          allowClear
          showSearch
          placeholder="选择负责人（清空则取消指派）"
          value={assignUserId}
          onChange={setAssignUserId}
          optionFilterProp="label"
          options={teamMembers.map(u => ({ value: u.id, label: `${u.display_name || u.username}${u.team_name ? ` (${u.team_name})` : ''}` }))}
        />
      </Modal>
    </div>
  );
}
