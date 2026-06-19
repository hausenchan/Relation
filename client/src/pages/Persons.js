import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Tag, Space, Modal, Form, Row, Col, Grid, List,
  Typography, Drawer, Descriptions, Tabs, Popconfirm, message, Tooltip, Divider,
  Upload, Alert, Segmented, Checkbox, Radio
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  PhoneOutlined, MailOutlined, WechatOutlined, MessageOutlined,
  UploadOutlined, DownloadOutlined, FilterOutlined, LockOutlined, GlobalOutlined
} from '@ant-design/icons';
import { personsApi, interactionsApi, remindersApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import InteractionForm from '../components/InteractionForm';
import ReminderForm from '../components/ReminderForm';
import InteractionList from '../components/InteractionList';
import ReminderList from '../components/ReminderList';
import PersonsMap from '../components/PersonsMap';
import ResizableTable from '../components/ResizableTable';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const PERSON_NAME_MAX_LENGTH = 30;
const PRIVATE_PERSON_SCOPE = 'executive_private';
const COMPANY_PERSON_SCOPE = 'company';
const EXECUTIVE_ROLES = ['ceo', 'coo', 'cto', 'cmo'];

const CHINA_CITIES = [
  '北京','上海','广州','深圳','杭州','成都','重庆','武汉','南京','西安',
  '苏州','天津','郑州','长沙','东莞','青岛','合肥','宁波','佛山','昆明',
  '沈阳','无锡','大连','济南','厦门','哈尔滨','福州','温州','石家庄','南宁',
  '长春','泉州','贵阳','常州','珠海','南通','嘉兴','中山','惠州','太原',
  '烟台','兰州','绍兴','海口','扬州','徐州','台州','金华','潍坊','保定',
  '镇江','洛阳','呼和浩特','乌鲁木齐','银川','西宁','拉萨','三亚',
  '香港','澳门','台北',
];

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

const counterpartyBudgetCategoryOptions = [
  { value: 'h5', label: 'H5' },
  { value: 'api', label: 'api' },
  { value: 'assist', label: '助力' },
  { value: 'acquisition', label: '拉新' },
  { value: 'reactivation', label: '拉活' },
  { value: 'sdk', label: 'SDK' },
  { value: 'other', label: '其他' },
];

const trafficScenarioOptions = [
  { value: 'app', label: 'APP' },
  { value: 'h5', label: 'H5' },
  { value: 'wechat_mini_program', label: '微信小程序' },
  { value: 'alipay_mini_program', label: '支付宝小程序' },
  { value: 'quick_app', label: '快应用' },
  { value: 'wechat_group', label: '微信社群' },
  { value: 'alipay_group', label: '支付宝社群' },
  { value: 'douyin_mini_program', label: '抖音小程序' },
  { value: 'adx', label: 'Adx' },
  { value: 'account_launch', label: '开户投放' },
  { value: 'other', label: '其他' },
];

const counterpartyBudgetCategoryMap = Object.fromEntries(
  counterpartyBudgetCategoryOptions.map(option => [option.value, option])
);
const trafficScenarioMap = Object.fromEntries(
  trafficScenarioOptions.map(option => [option.value, option])
);

const parseRelationTypes = (str) =>
  str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

const parseMultiSelectValues = (str) =>
  str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

const formatMultiSelectValues = (values) =>
  Array.isArray(values)
    ? [...new Set(values.map(item => String(item || '').trim()).filter(Boolean))].join(',')
    : (values || '');

const isExecutiveUser = (user) =>
  EXECUTIVE_ROLES.includes(user?.role) || EXECUTIVE_ROLES.includes(user?.executive_role);

const isPrivatePerson = (record) => record?.visibility_scope === PRIVATE_PERSON_SCOPE;

const personDuplicateReasonText = {
  same_full_name: '姓名相同',
  same_given_name: '名字相同',
};

function confirmPersonDuplicateInsert(duplicateInfo) {
  const matches = Array.isArray(duplicateInfo?.matches) ? duplicateInfo.matches : [];
  const total = duplicateInfo?.total || matches.length;
  const hiddenCount = Math.max(total - matches.length, 0);

  return new Promise(resolve => {
    Modal.confirm({
      title: '发现疑似同名人脉',
      content: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>系统中已有疑似同名人脉，请确认是否仍然添加。</Text>
          <List
            size="small"
            dataSource={matches}
            renderItem={item => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Space size={6} wrap>
                    <Text strong>{item.name}</Text>
                    <Tag color={item.reason === 'same_given_name' ? 'orange' : 'red'}>
                      {personDuplicateReasonText[item.reason] || '疑似同名'}
                    </Tag>
                  </Space>
                  {(item.company || item.position) && (
                    <Text type="secondary">
                      {[item.company, item.position].filter(Boolean).join(' / ')}
                    </Text>
                  )}
                </Space>
              </List.Item>
            )}
          />
          {hiddenCount > 0 && <Text type="secondary">另有 {hiddenCount} 条疑似同名记录未展示。</Text>}
        </Space>
      ),
      okText: '仍然添加',
      cancelText: '返回修改',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

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

function MultiValueTags({ value, optionMap, color = 'blue' }) {
  const items = parseMultiSelectValues(value);
  if (items.length === 0) return <Text type="secondary">-</Text>;
  return (
    <Space size={[4, 4]} wrap>
      {items.map(item => (
        <Tag key={item} color={optionMap[item]?.color || color}>
          {optionMap[item]?.label || item}
        </Tag>
      ))}
    </Space>
  );
}

// 通用字段分区（所有人都有）
function commonFields({ isMobile }) {
  const thirdSpan = isMobile ? 24 : 8;
  const halfSpan = isMobile ? 24 : 12;
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>基本信息</Divider>
      <Row gutter={16}>
        <Col span={thirdSpan}>
          <Form.Item
            label="姓名"
            name="name"
            rules={[
              { required: true, whitespace: true, message: '请输入姓名' },
              { max: PERSON_NAME_MAX_LENGTH, message: `姓名最多 ${PERSON_NAME_MAX_LENGTH} 个字符` },
            ]}
          >
            <Input maxLength={PERSON_NAME_MAX_LENGTH} showCount placeholder="建议只填姓名，不填公司或职位" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="圈子分类" name="person_category" rules={[{ required: true }]}>
            <Select>
              {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
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
        <Col span={thirdSpan}>
          <Form.Item label="手机" name="phone">
            <Input prefix={<PhoneOutlined />} />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="微信" name="wechat">
            <Input prefix={<WechatOutlined />} />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="邮箱" name="email">
            <Input prefix={<MailOutlined />} />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="城市" name="city">
            <Select
              mode="tags"
              placeholder="输入或选择城市"
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
              tokenSeparators={[',']}
              style={{ width: '100%' }}
            >
              {CHINA_CITIES.map(c => <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="公司" name="company">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="职位" name="position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="生日" name="birthday">
            <Input placeholder="如 1990-01-01" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="地址" name="address">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="标签（逗号分隔）" name="tags">
            <Input placeholder="如：重点维护,高潜力" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="权重" name="weight">
            <Select>
              {Object.entries(weightMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>资源与诉求</Divider>
      <Row gutter={16}>
        <Col span={halfSpan}>
          <Form.Item label="拥有资源" name="resources">
            <TextArea rows={2} placeholder="他/她掌握哪些资源、人脉、能力..." />
          </Form.Item>
        </Col>
        <Col span={halfSpan}>
          <Form.Item label="诉求" name="demands">
            <TextArea rows={2} placeholder="他/她当前的需求、痛点、目标..." />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="关键成事特质" name="success_traits">
            <TextArea rows={3} placeholder="提炼其拿到大结果背后的核心特质、行为模式和可观察证据，用于对标识别优秀人才" />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// 商务圈扩展字段
function businessFields({ isMobile }) {
  const thirdSpan = isMobile ? 24 : 8;
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>商务信息</Divider>
      <Row gutter={16}>
        <Col span={thirdSpan}>
          <Form.Item label="行业" name="industry">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="关系等级" name="relationship_level">
            <Select>
              {Object.entries(levelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="客户状态" name="client_status">
            <Select>
              <Option value="active">活跃</Option>
              <Option value="inactive">不活跃</Option>
              <Option value="lost">流失</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="对方预算分类" name="counterparty_budget_categories">
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择对方预算分类"
              optionFilterProp="label"
              maxTagCount="responsive"
              style={{ width: '100%' }}
              options={counterpartyBudgetCategoryOptions}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="自有流量场景" name="owned_traffic_scenarios">
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择自有流量场景"
              optionFilterProp="label"
              maxTagCount="responsive"
              style={{ width: '100%' }}
              options={trafficScenarioOptions}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="代理流量场景" name="agency_traffic_scenarios">
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择代理流量场景"
              optionFilterProp="label"
              maxTagCount="responsive"
              style={{ width: '100%' }}
              options={trafficScenarioOptions}
            />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// 外部人才扩展字段
function externalTalentFields({ isMobile }) {
  const thirdSpan = isMobile ? 24 : 8;
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>人才信息</Divider>
      <Row gutter={16}>
        <Col span={thirdSpan}>
          <Form.Item label="现任公司" name="current_company">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="现任职位" name="current_position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="目标职位" name="target_position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="工作年限" name="experience_years">
            <Input type="number" addonAfter="年" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="最高学历" name="education">
            <Select>
              {['博士','硕士','本科','大专','其他'].map(v => <Option key={v} value={v}>{v}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="期望薪资" name="expected_salary">
            <Input placeholder="如：30-40K" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
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
        <Col span={thirdSpan}>
          <Form.Item label="潜力评级" name="potential_level">
            <Select allowClear placeholder="评估潜力">
              {Object.entries(potentialLevelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="转化阶段" name="recruit_status">
            <Select>
              {Object.entries(recruitStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
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
function internalTalentFields({ isMobile }) {
  const thirdSpan = isMobile ? 24 : 8;
  const halfSpan = isMobile ? 24 : 12;
  return (
    <>
      <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>员工信息</Divider>
      <Row gutter={16}>
        <Col span={thirdSpan}>
          <Form.Item label="现任公司" name="current_company">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="部门/职位" name="current_position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="入职时间" name="source">
            <Input placeholder="如：2023-06" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
          <Form.Item label="工作年限" name="experience_years">
            <Input type="number" addonAfter="年" />
          </Form.Item>
        </Col>
        <Col span={thirdSpan}>
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
        <Col span={halfSpan}>
          <Form.Item
            label={<span style={{ color: '#e64980', fontWeight: 600 }}>❤️ 心（价值观·使命感·忠诚度）</span>}
            name="heart"
          >
            <TextArea rows={3} placeholder="对公司使命的认同感、价值观匹配度、忠诚度..." />
          </Form.Item>
        </Col>
        <Col span={halfSpan}>
          <Form.Item
            label={<span style={{ color: '#1677ff', fontWeight: 600 }}>🧠 脑（思维·专业·判断力）</span>}
            name="brain"
          >
            <TextArea rows={3} placeholder="专业能力、思维方式、学习能力、决策判断力..." />
          </Form.Item>
        </Col>
        <Col span={halfSpan}>
          <Form.Item
            label={<span style={{ color: '#fa8c16', fontWeight: 600 }}>🗣️ 口（沟通·表达·影响力）</span>}
            name="mouth"
          >
            <TextArea rows={3} placeholder="沟通表达能力、汇报能力、对外影响力..." />
          </Form.Item>
        </Col>
        <Col span={halfSpan}>
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
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user: currentUser } = useAuth();
  const canUsePrivatePersons = isExecutiveUser(currentUser);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRelationType, setFilterRelationType] = useState('');
  const [filterPotentialLevel, setFilterPotentialLevel] = useState('');
  const [filterRecruitStatus, setFilterRecruitStatus] = useState('');
  const [filterIntentLevel, setFilterIntentLevel] = useState('');
  const [filterCounterpartyBudgetCategories, setFilterCounterpartyBudgetCategories] = useState('');
  const [filterOwnedTrafficScenarios, setFilterOwnedTrafficScenarios] = useState('');
  const [filterAgencyTrafficScenarios, setFilterAgencyTrafficScenarios] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [filterCreatedBy, setFilterCreatedBy] = useState(undefined);
  const [filterVisibility, setFilterVisibility] = useState('');
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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importDuplicateMode, setImportDuplicateMode] = useState('skip');
  const [commercialUsers, setCommercialUsers] = useState([]);
  const [creatorUsers, setCreatorUsers] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();
  const category = Form.useWatch('person_category', form);
  const relationTypes = Form.useWatch('relation_types', form) || [];
  const visibilityScope = Form.useWatch('visibility_scope', form) || COMPANY_PERSON_SCOPE;
  const batchFields = Form.useWatch('fields', batchForm) || [];
  const batchVisibilityScope = Form.useWatch('visibility_scope', batchForm) || COMPANY_PERSON_SCOPE;
  const isExternalTalent = category === 'talent' && !relationTypes.includes('talent_internal');
  const isInternalTalent = category === 'talent' && relationTypes.includes('talent_internal');
  const isPrivateScope = visibilityScope === PRIVATE_PERSON_SCOPE;
  const isBatchPrivateScope = batchFields.includes('visibility_scope') && batchVisibilityScope === PRIVATE_PERSON_SCOPE;

  const load = useCallback(async () => {
    setLoading(true);
    const params = { search };
    if (filterCategory) params.person_category = filterCategory;
    if (filterRelationType) params.relation_type = filterRelationType;
    if (filterPotentialLevel) params.potential_level = filterPotentialLevel;
    if (filterRecruitStatus) params.recruit_status = filterRecruitStatus;
    if (filterIntentLevel) params.intent_level = filterIntentLevel;
    if (filterCounterpartyBudgetCategories) params.counterparty_budget_categories = filterCounterpartyBudgetCategories;
    if (filterOwnedTrafficScenarios) params.owned_traffic_scenarios = filterOwnedTrafficScenarios;
    if (filterAgencyTrafficScenarios) params.agency_traffic_scenarios = filterAgencyTrafficScenarios;
    if (filterCity) params.city = filterCity;
    if (filterWeight) params.weight = filterWeight;
    if (filterCreatedBy) params.created_by = filterCreatedBy;
    if (canUsePrivatePersons && filterVisibility) params.visibility_scope = filterVisibility;
    const res = await personsApi.list(params);
    setData(res);
    setSelectedRowKeys(prev => prev.filter(id => res.some(r => Number(r.id) === Number(id))));
    setLoading(false);
  }, [
    search,
    filterCategory,
    filterRelationType,
    filterPotentialLevel,
    filterRecruitStatus,
    filterIntentLevel,
    filterCounterpartyBudgetCategories,
    filterOwnedTrafficScenarios,
    filterAgencyTrafficScenarios,
    filterCity,
    filterWeight,
    filterCreatedBy,
    filterVisibility,
    canUsePrivatePersons,
  ]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersApi.listSimple({ include_readonly: true, include_departed: true })
      .then(setCreatorUsers)
      .catch(() => {
        setCreatorUsers(currentUser ? [currentUser] : []);
      });
  }, [currentUser]);

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

  const loadCommercialUsers = async () => {
    try {
      const users = await usersApi.listSimple({ department: 'commercial', include_readonly: true });
      setCommercialUsers(users);
    } catch {
      setCommercialUsers([]);
    }
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      relation_types: parseRelationTypes(record.relation_types),
      city: record.city ? record.city.split(',').map(s => s.trim()).filter(Boolean) : [],
      counterparty_budget_categories: parseMultiSelectValues(record.counterparty_budget_categories),
      owned_traffic_scenarios: parseMultiSelectValues(record.owned_traffic_scenarios),
      agency_traffic_scenarios: parseMultiSelectValues(record.agency_traffic_scenarios),
      visibility_scope: record.visibility_scope || COMPANY_PERSON_SCOPE,
      shared_to: record.shared_to_ids
        ? record.shared_to_ids.split(',').map(Number).filter(Boolean)
        : [],
    });
    loadCommercialUsers();
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      person_category: 'business',
      relation_types: [],
      counterparty_budget_categories: [],
      owned_traffic_scenarios: [],
      agency_traffic_scenarios: [],
      relationship_level: 'normal',
      client_status: 'active',
      weight: 'medium',
      visibility_scope: COMPANY_PERSON_SCOPE,
      shared_to: [],
    });
    loadCommercialUsers();
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      name: (values.name || '').trim(),
      relation_types: Array.isArray(values.relation_types)
        ? values.relation_types.join(',')
        : (values.relation_types || ''),
      city: Array.isArray(values.city)
        ? values.city.join(',')
        : (values.city || ''),
      counterparty_budget_categories: formatMultiSelectValues(values.counterparty_budget_categories),
      owned_traffic_scenarios: formatMultiSelectValues(values.owned_traffic_scenarios),
      agency_traffic_scenarios: formatMultiSelectValues(values.agency_traffic_scenarios),
      visibility_scope: canUsePrivatePersons ? (values.visibility_scope || COMPANY_PERSON_SCOPE) : COMPANY_PERSON_SCOPE,
      shared_to: values.visibility_scope === PRIVATE_PERSON_SCOPE ? [] : values.shared_to,
    };
    if (editing) {
      await personsApi.update(editing.id, payload);
      message.success('更新成功');
      // 同步更新 current（详情 Drawer 的数据源）
      if (current && current.id === editing.id) {
        setCurrent({ ...editing, ...payload });
      }
    } else {
      try {
        const duplicateInfo = await personsApi.duplicateCheck({ name: payload.name });
        if ((duplicateInfo?.total || 0) > 0) {
          const shouldContinue = await confirmPersonDuplicateInsert(duplicateInfo);
          if (!shouldContinue) return;
        }
      } catch {
        message.warning('重名检查失败，将继续保存当前人脉');
      }
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

  const canEditPerson = (record) => {
    if (!currentUser || !record) return false;
    if (['readonly', 'guest'].includes(currentUser.role)) return false;
    if (currentUser.role === 'member') {
      return record.created_by === currentUser.id || record.assigned_to === currentUser.id;
    }
    return true;
  };

  const canDeletePerson = (record) => {
    if (!currentUser || !record) return false;
    if (['readonly', 'guest'].includes(currentUser.role)) return false;
    if (currentUser.role === 'member') {
      return record.created_by === currentUser.id;
    }
    return true;
  };

  const selectedRecords = data.filter(record => selectedRowKeys.some(id => Number(id) === Number(record.id)));
  const editableSelectedRecords = selectedRecords.filter(canEditPerson);

  const toggleMobileSelection = (record, checked) => {
    if (!canEditPerson(record)) return;
    setSelectedRowKeys(prev => {
      const key = record.id;
      if (checked) return prev.some(id => Number(id) === Number(key)) ? prev : [...prev, key];
      return prev.filter(id => Number(id) !== Number(key));
    });
  };

  const openBatchEdit = () => {
    if (editableSelectedRecords.length === 0) {
      message.warning('请先选择可编辑的人脉');
      return;
    }
    if (editableSelectedRecords.length !== selectedRecords.length) {
      setSelectedRowKeys(editableSelectedRecords.map(record => record.id));
    }
    batchForm.resetFields();
    batchForm.setFieldsValue({
      fields: ['weight'],
      weight: 'medium',
      tags_mode: 'append',
      shared_to_mode: 'append',
      visibility_scope: COMPANY_PERSON_SCOPE,
    });
    loadCommercialUsers();
    setBatchModalOpen(true);
  };

  const handleBatchSave = async () => {
    const values = await batchForm.validateFields();
    const fields = values.fields || [];
    const ids = editableSelectedRecords.map(record => record.id);
    if (ids.length === 0) {
      message.warning('请先选择可编辑的人脉');
      return;
    }

    const patch = {};
    if (fields.includes('weight')) patch.weight = values.weight;
    if (fields.includes('tags')) {
      const tagValue = (values.tags || '').trim();
      if (values.tags_mode !== 'replace' && !tagValue) {
        message.warning('请填写要处理的标签');
        return;
      }
      patch.tags = { mode: values.tags_mode, value: tagValue };
    }
    if (fields.includes('potential_level')) patch.potential_level = values.potential_level || '';
    if (fields.includes('recruit_status')) patch.recruit_status = values.recruit_status;
    if (fields.includes('intent_level')) patch.intent_level = values.intent_level;
    if (fields.includes('visibility_scope')) {
      if (!canUsePrivatePersons) {
        message.warning('当前账号不能批量修改可见范围');
        return;
      }
      patch.visibility_scope = values.visibility_scope || COMPANY_PERSON_SCOPE;
    }
    if (fields.includes('shared_to')) {
      const userIds = values.shared_to || [];
      if (patch.visibility_scope === PRIVATE_PERSON_SCOPE) {
        message.warning('个人私密人脉不支持设置共享人');
        return;
      }
      if (values.shared_to_mode !== 'replace' && userIds.length === 0) {
        message.warning('请选择要处理的共享人');
        return;
      }
      patch.shared_to = { mode: values.shared_to_mode, user_ids: userIds };
    }

    if (Object.keys(patch).length === 0) {
      message.warning('请至少选择一个批量修改项');
      return;
    }

    setBatchLoading(true);
    try {
      const result = await personsApi.batchUpdate({ ids, patch });
      if (result.failed > 0) {
        message.warning(`批量编辑完成：成功 ${result.success} 条，失败 ${result.failed} 条`);
      } else {
        message.success(`批量编辑成功 ${result.success} 条`);
      }
      setBatchModalOpen(false);
      setSelectedRowKeys([]);
      load();
    } catch (err) {
      message.error(err.response?.data?.error || '批量编辑失败，请重试');
    } finally {
      setBatchLoading(false);
    }
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

  const categoryImportOptionsText = Object.values(categoryMap).map(v => v.label).join('、');
  const relationTypeImportOptionsText = Object.values(relationTypeMap).map(v => v.label).join('、');
  const weightImportOptionsText = Object.values(weightMap).map(v => v.label).join('、');

  // CSV 列头与字段的映射（下载模板显示中文说明，同时兼容旧表头和历史英文列名）
  const CSV_COLUMNS = [
    { key: 'name',              labels: ['姓名', 'name'], templateLabel: `姓名（建议只填姓名，最长${PERSON_NAME_MAX_LENGTH}字）` },
    { key: 'person_category',   labels: ['圈子分类', 'person_category'], templateLabel: `圈子分类（可填：${categoryImportOptionsText}）` },
    { key: 'relation_types',    labels: ['关系类型', 'relation_types'], templateLabel: `关系类型（可填：${relationTypeImportOptionsText}；多个用中文逗号分隔）` },
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
    { key: 'success_traits',    labels: ['关键成事特质', 'success_traits'] },
    { key: 'notes',             labels: ['备注', 'notes'] },
    { key: 'weight',            labels: ['权重', 'weight'], templateLabel: `权重（可填：${weightImportOptionsText}；留空默认中）` },
  ];

  const categoryImportMap = {
    商务圈: 'business', 商务: 'business', business: 'business',
    人才圈: 'talent', 人才: 'talent', talent: 'talent',
    创业圈: 'startup', 创业: 'startup', startup: 'startup',
    社交圈: 'social', 社交: 'social', social: 'social',
  };

  const relationTypeImportMap = Object.fromEntries([
    ...Object.entries(relationTypeMap).flatMap(([key, value]) => [[key, key], [value.label, key]]),
    ['潜在客户', 'client_potential'],
    ['合作客户', 'client_active'],
    ['外部人才', 'talent_external'],
    ['内部人才', 'talent_internal'],
    ['创业伙伴', 'partner'],
    ['投资人/顾问', 'investor'],
    ['家人亲戚', 'family'],
    ['朋友', 'friend'],
    ['其他', 'other'],
  ]);

  const weightImportMap = {
    高: 'high', 高权重: 'high', high: 'high',
    中: 'medium', 中权重: 'medium', medium: 'medium',
    低: 'low', 低权重: 'low', low: 'low',
  };

  const normalizeImportText = (value) => String(value || '').trim();
  const normalizeImportHeader = (value) =>
    normalizeImportText(value)
      .replace(/^\uFEFF/, '')
      .replace(/[（(].*$/, '')
      .trim();
  const findCsvColumnKey = (headerName) => {
    const text = normalizeImportText(headerName).replace(/^\uFEFF/, '');
    const shortText = normalizeImportHeader(text);
    const col = CSV_COLUMNS.find(c =>
      c.templateLabel === text ||
      c.labels.some(label => label === text || label === shortText)
    );
    return col ? col.key : null;
  };
  const normalizeImportCategory = (value) => {
    const text = normalizeImportText(value);
    return categoryImportMap[text] || text;
  };
  const normalizeImportWeight = (value) => {
    const text = normalizeImportText(value);
    return weightImportMap[text] || text;
  };
  const normalizeImportRelationTypes = (value) => {
    const parts = normalizeImportText(value)
      .split(/[,，;；、]/)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.map(part => relationTypeImportMap[part] || part).join(',');
  };
  const normalizeImportRow = (row) => ({
    ...row,
    person_category: row.person_category ? normalizeImportCategory(row.person_category) : row.person_category,
    relation_types: row.relation_types ? normalizeImportRelationTypes(row.relation_types) : row.relation_types,
    weight: row.weight ? normalizeImportWeight(row.weight) : row.weight,
  });
  const displayImportCategory = (value) => categoryMap[value]?.label || value || '-';
  const displayImportRelationTypes = (value) =>
    parseRelationTypes(value).map(type => relationTypeMap[type]?.label || type).join('、') || '-';
  const displayImportWeight = (value) => weightMap[value]?.label || value || '-';
  const importStatusMap = {
    updateable: { label: '可更新', color: 'orange' },
    same: { label: '无差异', color: 'default' },
    ambiguous: { label: '多条同名', color: 'red' },
    no_permission: { label: '无权限', color: 'red' },
    file_duplicate: { label: '文件内重复', color: 'purple' },
    invalid: { label: '无效', color: 'red' },
  };

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
    const colMap = headers.map(findCsvColumnKey);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseRow(lines[i]);
      const obj = {};
      colMap.forEach((key, idx) => { if (key) obj[key] = vals[idx] || ''; });
      if (obj.name) rows.push(normalizeImportRow(obj));
    }
    return rows;
  };

  const resetImportState = () => {
    setImportRows([]);
    setImportPreview(null);
    setImportPreviewLoading(false);
    setImportDuplicateMode('skip');
  };

  const loadImportPreview = async (rows) => {
    setImportPreviewLoading(true);
    try {
      const preview = await personsApi.importPreview(rows);
      setImportPreview(preview);
    } catch (err) {
      setImportPreview(null);
      message.error(err.response?.data?.error || '导入预检失败，请重试');
    } finally {
      setImportPreviewLoading(false);
    }
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
        setImportPreview(null);
        setImportDuplicateMode('skip');
        loadImportPreview(rows);
      } catch {
        message.error('文件解析失败');
      }
    };
    reader.readAsText(file, 'UTF-8');
    return false; // 阻止 antd Upload 自动上传
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    if (importPreviewLoading) {
      message.warning('正在检查重名，请稍候');
      return;
    }
    setImportLoading(true);
    try {
      const result = await personsApi.import({ rows: importRows, duplicate_mode: importDuplicateMode });
      const skipParts = [];
      if (result.updated) skipParts.push(`更新 ${result.updated} 条`);
      if (result.skipped_existing) skipParts.push(`重名保留 ${result.skipped_existing} 条`);
      if (result.skipped_no_change) skipParts.push(`无差异 ${result.skipped_no_change} 条`);
      if (result.skipped_file_duplicate) skipParts.push(`文件内重复 ${result.skipped_file_duplicate} 条`);
      if (result.skipped_ambiguous) skipParts.push(`系统多条同名 ${result.skipped_ambiguous} 条`);
      if (result.skipped_no_permission) skipParts.push(`无权限 ${result.skipped_no_permission} 条`);
      if (result.skip_empty_name) skipParts.push(`${result.skip_empty_name} 条缺少姓名`);
      if (result.skip_name_too_long) skipParts.push(`${result.skip_name_too_long} 条姓名超过 ${PERSON_NAME_MAX_LENGTH} 字`);
      message.success(`导入完成：新增 ${result.created ?? result.ok ?? 0} 条${skipParts.length ? `，${skipParts.join('，')}` : ''}`);
      setImportOpen(false);
      resetImportState();
      load();
    } catch (err) {
      message.error(err.response?.data?.error || '导入失败，请重试');
    } finally {
      setImportLoading(false);
    }
  };

  const downloadTemplate = () => {
    const header = CSV_COLUMNS.map(c => c.templateLabel || c.labels[0]);
    const csvCell = (value) => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const toCsvRow = (row) => row.map(csvCell).join(',');
    const examples = [
      ['张三', '商务圈', '潜在客户', '13800138000', '张三微信', '', '北京', '星河科技', '销售总监', '互联网', '1990-01-01', '', '重点客户', '行业资源丰富', '寻求融资对接', '目标感强，能抓关键客户并长期推进', '首次见面于行业峰会', '高'],
      ['李四', '商务圈', '合作客户', '13800138001', '李四微信', '', '上海', '明舟传媒', '市场负责人', '广告营销', '', '', '长期维护', '渠道资源', '联合项目', '资源整合能力强，能把多方诉求转成项目机会', '已建立合作', '中'],
      ['王五', '人才圈', '外部人才', '13800138002', '王五微信', '', '深圳', '云启智能', '算法专家', '人工智能', '', '', '高潜人才', '技术能力强', '职业机会', '复杂问题拆解能力强，能持续交付关键结果', '朋友推荐', '高'],
      ['赵六', '人才圈', '内部人才', '13800138003', '赵六微信', '', '杭州', '本公司', '产品经理', '互联网', '', '', '核心员工', '产品经验', '成长通道', '用户洞察敏锐，能把模糊需求推进到上线结果', '内部盘点', '中'],
      ['钱七', '创业圈', '创业伙伴', '13800138004', '钱七微信', '', '广州', '新芽项目', '联合创始人', '电商', '', '', '潜在伙伴', '项目资源', '寻找合作', '抗压和破局能力强，能在资源不足时推进增长', '创业活动认识', '高'],
      ['孙八', '创业圈', '投资人/顾问', '13800138005', '孙八微信', '', '北京', '远山资本', '合伙人', '投资', '', '', '顾问资源', '资本与行业判断', '项目储备', '判断关键变量快，能识别长期价值和风险', '路演认识', '高'],
      ['周九', '社交圈', '家人亲戚', '13800138006', '周九微信', '', '成都', '', '', '', '', '', '亲友', '本地资源', '日常联系', '稳定可靠，关键时刻愿意协调资源', '家庭关系', '中'],
      ['吴十', '社交圈', '朋友', '13800138007', '吴十微信', '', '南京', '青禾文化', '运营负责人', '内容运营', '', '', '朋友', '社群资源', '信息交流', '沟通亲和，擅长建立信任和维护社群关系', '朋友聚会认识', '低'],
      ['郑十一', '社交圈', '其他', '13800138008', '郑十一微信', '', '武汉', '', '', '', '', '', '待分类', '暂未明确', '待补充', '待观察', '临时记录', '低'],
      ['冯十二', '商务圈', '潜在客户，合作客户', '13800138009', '冯十二微信', '', '苏州', '共创科技', '商务负责人', '企业服务', '', '', '多关系示例', '客户资源', '资源互换', '既能拿资源，也能推动合作闭环', '关系类型可填写多个中文值', '中'],
    ];
    const content = '\uFEFF' + [header, ...examples].map(toCsvRow).join('\n'); // BOM 让 Excel 正确识别 UTF-8
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
      width: 168,
      render: (v, r) => (
        <Tooltip title={v}>
          <Button
            type="link"
            onClick={() => openDetail(r)}
            style={{
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              width: '100%',
              height: 'auto',
              textAlign: 'left',
            }}
          >
            <strong
              style={{
                flex: 1,
                minWidth: 0,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                wordBreak: 'break-all',
              }}
            >
              {v}
            </strong>
            {isPrivatePerson(r) && (
              <Tag color="red" icon={<LockOutlined />} style={{ flex: 'none', marginInlineEnd: 0 }}>
                私密
              </Tag>
            )}
          </Button>
        </Tooltip>
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
      title: '公司',
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
    { title: '创建人', dataIndex: 'created_by_name', render: v => v || '-' },
    {
      title: '共享人',
      dataIndex: 'shared_to_names',
      render: (v, r) => isPrivatePerson(r)
        ? <Tag color="red" icon={<LockOutlined />}>仅本人</Tag>
        : (v ? v.split(',').map((name, i) => <Tag key={i} color="cyan">{name}</Tag>) : '-'),
    },
    { title: '更新时间', dataIndex: 'updated_at', render: v => v?.slice(0, 10) },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<MessageOutlined />} onClick={() => openIntDrawer(r)}>互动记录</Button>
          {canEditPerson(r) && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          )}
          {canDeletePerson(r) && (
            <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: record => ({
      disabled: !canEditPerson(record),
      title: canEditPerson(record) ? '选择' : '无编辑权限',
    }),
  };

  const currentRelTypes = parseRelationTypes(current?.relation_types);
  const currentIsExternal = current?.person_category === 'talent' && !currentRelTypes.includes('talent_internal');
  const currentIsInternal = current?.person_category === 'talent' && currentRelTypes.includes('talent_internal');

  const renderPersonCard = (record) => {
    const relationTags = parseRelationTypes(record.relation_types);
    const isExternal = record.person_category === 'talent' && relationTags.includes('talent_external');

    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => openDetail(record)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openDetail(record);
          }}
          style={{
            width: '100%',
            padding: 14,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 8, minWidth: 0, flex: 1, alignItems: 'flex-start' }}>
                {canEditPerson(record) && (
                  <Checkbox
                    checked={selectedRowKeys.some(id => Number(id) === Number(record.id))}
                    onClick={event => event.stopPropagation()}
                    onChange={event => toggleMobileSelection(record, event.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.name}</div>
                    {isPrivatePerson(record) && <Tag color="red" icon={<LockOutlined />} style={{ flex: 'none', marginInlineEnd: 0 }}>私密</Tag>}
                  </div>
                  <Space wrap size={[6, 6]}>
                    <Tag color={categoryMap[record.person_category]?.color}>{categoryMap[record.person_category]?.label}</Tag>
                    {record.weight && <Tag color={weightMap[record.weight]?.color}>{weightMap[record.weight]?.label}</Tag>}
                  </Space>
                </div>
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {record.updated_at?.slice(0, 10) || '-'}
              </Typography.Text>
            </div>

            <RelationTags value={record.relation_types} />

            <Typography.Text type="secondary">
              {(record.company || record.current_company || '未填写公司')} · {(record.position || record.current_position || '未填写职位')}
            </Typography.Text>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Typography.Text type="secondary">城市：{record.city || '-'}</Typography.Text>
              <Typography.Text type="secondary">创建人：{record.created_by_name || '-'}</Typography.Text>
            </div>

            {(record.phone || record.wechat || record.email) && (
              <Space size={10} wrap>
                {record.phone && <Typography.Text copyable={{ text: record.phone }}>手机</Typography.Text>}
                {record.wechat && <Typography.Text copyable={{ text: record.wechat }}>微信</Typography.Text>}
                {record.email && <Typography.Text copyable={{ text: record.email }}>邮箱</Typography.Text>}
              </Space>
            )}

            {isExternal && (
              <Space wrap size={[6, 6]}>
                {record.potential_level && <Tag color={potentialLevelMap[record.potential_level]?.color}>{potentialLevelMap[record.potential_level]?.label}</Tag>}
                {record.recruit_status && <Tag color={recruitStatusMap[record.recruit_status]?.color}>{recruitStatusMap[record.recruit_status]?.label}</Tag>}
                {record.intent_level && <Tag color={intentMap[record.intent_level]?.color}>{intentMap[record.intent_level]?.label}</Tag>}
              </Space>
            )}

            {isPrivatePerson(record) ? (
              <div>
                <Tag color="red" icon={<LockOutlined />}>仅本人可见</Tag>
              </div>
            ) : record.shared_to_names && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>共享人：</Typography.Text>
                <Space wrap size={[6, 6]}>
                  {record.shared_to_names.split(',').map((name, index) => (
                    <Tag key={`${record.id}-shared-${index}`} color="cyan">{name.trim()}</Tag>
                  ))}
                </Space>
              </div>
            )}

            <Space size="small" wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
              <Button
                size="small"
                icon={<MessageOutlined />}
                style={{ width: isMobile ? '100%' : undefined }}
                onClick={(event) => {
                  event.stopPropagation();
                  openIntDrawer(record);
                }}
              >
                互动记录
              </Button>
              {canEditPerson(record) && (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  style={{ width: isMobile ? '100%' : undefined }}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEdit(record);
                  }}
                >
                  编辑
                </Button>
              )}
              {canDeletePerson(record) && (
                <Popconfirm
                  title="确认删除？"
                  onConfirm={(event) => {
                    event?.stopPropagation?.();
                    handleDelete(record.id);
                  }}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    style={{ width: isMobile ? '100%' : undefined }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    删除
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  const activeFilterCount = [
    search,
    filterCategory,
    filterRelationType,
    filterPotentialLevel,
    filterRecruitStatus,
    filterIntentLevel,
    filterCounterpartyBudgetCategories,
    filterOwnedTrafficScenarios,
    filterAgencyTrafficScenarios,
    filterCity,
    filterWeight,
    filterCreatedBy,
    canUsePrivatePersons && filterVisibility,
  ].filter(Boolean).length;
  const resetFilters = () => {
    setSearch('');
    setFilterCategory('');
    setFilterRelationType('');
    setFilterPotentialLevel('');
    setFilterRecruitStatus('');
    setFilterIntentLevel('');
    setFilterCounterpartyBudgetCategories('');
    setFilterOwnedTrafficScenarios('');
    setFilterAgencyTrafficScenarios('');
    setFilterCity('');
    setFilterWeight('');
    setFilterCreatedBy(undefined);
    setFilterVisibility('');
  };
  const filterGridStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile
      ? '1fr'
      : 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  };
  const filterControls = (
    <>
      <div style={filterGridStyle}>
        <Input.Search
          placeholder="搜索姓名、公司、技能、标签"
          allowClear
          style={{ width: '100%', gridColumn: isMobile ? undefined : 'span 2' }}
          value={search}
          onSearch={setSearch}
          onChange={e => setSearch(e.target.value)}
        />
        <Select
          placeholder="圈子分类"
          allowClear
          style={{ width: '100%' }}
          value={filterCategory || undefined}
          onChange={v => {
            setFilterCategory(v || '');
            setFilterRelationType('');
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
          style={{ width: '100%' }}
          value={filterRelationType || undefined}
          onChange={v => setFilterRelationType(v || '')}
        >
          {Object.entries(relationTypeMap)
            .filter(([, v]) => !filterCategory || v.category === filterCategory || !v.category)
            .map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        <Select
          mode="multiple"
          placeholder="对方预算"
          allowClear
          style={{ width: '100%' }}
          value={filterCounterpartyBudgetCategories ? filterCounterpartyBudgetCategories.split(',') : []}
          onChange={v => setFilterCounterpartyBudgetCategories(v.join(','))}
          maxTagCount={1}
          maxTagTextLength={6}
          options={counterpartyBudgetCategoryOptions}
        />
        <Select
          mode="multiple"
          placeholder="自有流量场景"
          allowClear
          style={{ width: '100%' }}
          value={filterOwnedTrafficScenarios ? filterOwnedTrafficScenarios.split(',') : []}
          onChange={v => setFilterOwnedTrafficScenarios(v.join(','))}
          maxTagCount={1}
          maxTagTextLength={6}
          options={trafficScenarioOptions}
        />
        <Select
          mode="multiple"
          placeholder="代理流量场景"
          allowClear
          style={{ width: '100%' }}
          value={filterAgencyTrafficScenarios ? filterAgencyTrafficScenarios.split(',') : []}
          onChange={v => setFilterAgencyTrafficScenarios(v.join(','))}
          maxTagCount={1}
          maxTagTextLength={6}
          options={trafficScenarioOptions}
        />
        <Select
          mode="multiple"
          placeholder="城市"
          allowClear
          style={{ width: '100%' }}
          value={filterCity ? filterCity.split(',') : []}
          onChange={v => setFilterCity(v.join(','))}
          filterOption={(input, option) =>
            option.children.toLowerCase().includes(input.toLowerCase())
          }
          maxTagCount={2}
          maxTagTextLength={4}
        >
          {CHINA_CITIES.map(c => <Option key={c} value={c}>{c}</Option>)}
        </Select>
        <Select
          placeholder="创建人"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          value={filterCreatedBy}
          onChange={setFilterCreatedBy}
          options={creatorUsers.map(u => ({
            value: u.id,
            label: u.id === currentUser?.id
              ? `${u.display_name || u.username || '我'}（我）`
              : `${u.display_name || u.username}${u.account_status === 'departed' ? '（已离职）' : ''}`,
          }))}
        />
        <Select
          placeholder="权重"
          allowClear
          style={{ width: '100%' }}
          value={filterWeight || undefined}
          onChange={v => setFilterWeight(v || '')}
        >
          {Object.entries(weightMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
        </Select>
        {canUsePrivatePersons && (
          <Select
            placeholder="可见范围"
            allowClear
            style={{ width: '100%' }}
            value={filterVisibility || undefined}
            onChange={v => setFilterVisibility(v || '')}
          >
            <Option value={COMPANY_PERSON_SCOPE}>公司共享</Option>
            <Option value={PRIVATE_PERSON_SCOPE}>个人私密</Option>
          </Select>
        )}
      </div>

      {filterCategory === 'talent' && (
        <Space style={{ marginBottom: 12, paddingLeft: 8, borderLeft: '3px solid #52c41a', width: isMobile ? '100%' : undefined }} wrap direction={isMobile ? 'vertical' : 'horizontal'}>
          <Text type="secondary" style={{ fontSize: 12 }}>人才筛选：</Text>
          <Select placeholder="潜力评级" allowClear style={{ width: isMobile ? '100%' : 110 }} value={filterPotentialLevel || undefined} onChange={v => setFilterPotentialLevel(v || '')}>
            {Object.entries(potentialLevelMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
          </Select>
          <Select placeholder="转化阶段" allowClear style={{ width: isMobile ? '100%' : 120 }} value={filterRecruitStatus || undefined} onChange={v => setFilterRecruitStatus(v || '')}>
            {Object.entries(recruitStatusMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
          </Select>
          <Select placeholder="意向程度" allowClear style={{ width: isMobile ? '100%' : 110 }} value={filterIntentLevel || undefined} onChange={v => setFilterIntentLevel(v || '')}>
            {Object.entries(intentMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
          </Select>
        </Space>
      )}

    </>
  );
  const importSummary = importPreview?.summary;
  const importExistingCount = importSummary?.existing || 0;
  const importUpdateableCount = importSummary?.updateable || 0;
  const importDuplicateRows = (importPreview?.items || []).filter(item =>
    ['updateable', 'same', 'ambiguous', 'no_permission', 'file_duplicate', 'invalid'].includes(item.status)
  );
  const importOkText = importSummary
    ? (importDuplicateMode === 'update'
        ? `新增 ${importSummary.new || 0} / 更新 ${importUpdateableCount}`
        : `新增 ${importSummary.new || 0} / 跳过重名 ${importExistingCount}`)
    : `确认导入 ${importRows.length} 条`;
  const personPagination = {
    defaultPageSize: 15,
    showTotal: total => `共 ${total} 条记录`,
  };

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Button icon={<UploadOutlined />} onClick={() => { resetImportState(); setImportOpen(true); }} style={{ width: isMobile ? '100%' : undefined }}>导入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加人脉</Button>
          <Button
            icon={<EditOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={openBatchEdit}
            style={{ width: isMobile ? '100%' : undefined }}
          >
            批量编辑{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
          </Button>
          {selectedRowKeys.length > 0 && (
            <Button onClick={() => setSelectedRowKeys([])} style={{ width: isMobile ? '100%' : undefined }}>清空选择</Button>
          )}
          {isMobile && (
            <Button icon={<FilterOutlined />} onClick={() => setFilterDrawerOpen(true)} style={{ width: '100%' }}>
              筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          )}
        </Space>
      </div>

      <Tabs defaultActiveKey="list" tabBarGutter={isMobile ? 12 : undefined} items={[
        {
          key: 'list',
          label: '列表视图',
          children: (
            <>
      {!isMobile && filterControls}

      {isMobile ? (
        <List
          loading={loading}
          dataSource={data}
          locale={{ emptyText: '暂无人脉数据' }}
          pagination={{ ...personPagination, showSizeChanger: false, simple: isMobile }}
          renderItem={renderPersonCard}
        />
      ) : (
        <ResizableTable
          storageKey="persons-table-columns"
          columns={columns}
          dataSource={data}
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          size="small"
          scroll={{ x: 1000 }}
          pagination={personPagination}
          onRow={(record) => ({
            onDoubleClick: () => (canEditPerson(record) ? openEdit(record) : openDetail(record)),
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
      )}
            </>
          ),
        },
        {
          key: 'map',
          label: '地图视图',
          children: <PersonsMap />,
        },
      ]} />

      <Drawer
        title="筛选人脉"
        placement="right"
        width="100%"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={() => setFilterDrawerOpen(false)}>完成</Button>
          </Space>
        }
      >
        {filterControls}
      </Drawer>

      <Modal
        title="批量编辑人脉"
        open={batchModalOpen}
        onOk={handleBatchSave}
        onCancel={() => setBatchModalOpen(false)}
        confirmLoading={batchLoading}
        okText="确认修改"
        cancelText="取消"
        width={isMobile ? '100%' : 620}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="info"
            showIcon
            message={`将修改 ${editableSelectedRecords.length} 条人脉`}
            description={editableSelectedRecords.length > 0
              ? `${editableSelectedRecords.slice(0, 5).map(record => record.name).join('、')}${editableSelectedRecords.length > 5 ? ` 等 ${editableSelectedRecords.length} 人` : ''}`
              : '暂无可编辑的人脉'}
          />
          <Form form={batchForm} layout="vertical" size="small">
            <Form.Item
              label="修改内容"
              name="fields"
              rules={[{ required: true, message: '请选择要批量修改的内容' }]}
            >
              <Checkbox.Group style={{ width: '100%' }}>
                <Row gutter={[8, 8]}>
                  <Col span={isMobile ? 24 : 8}><Checkbox value="weight">权重</Checkbox></Col>
                  <Col span={isMobile ? 24 : 8}><Checkbox value="tags">标签</Checkbox></Col>
                  <Col span={isMobile ? 24 : 8}><Checkbox value="shared_to" disabled={isBatchPrivateScope}>共享人</Checkbox></Col>
                  {canUsePrivatePersons && (
                    <Col span={isMobile ? 24 : 8}><Checkbox value="visibility_scope">可见范围</Checkbox></Col>
                  )}
                  <Col span={isMobile ? 24 : 8}><Checkbox value="potential_level">潜力评级</Checkbox></Col>
                  <Col span={isMobile ? 24 : 8}><Checkbox value="recruit_status">转化阶段</Checkbox></Col>
                  <Col span={isMobile ? 24 : 8}><Checkbox value="intent_level">意向程度</Checkbox></Col>
                </Row>
              </Checkbox.Group>
            </Form.Item>

            {batchFields.includes('weight') && (
              <Form.Item label="权重" name="weight" rules={[{ required: true, message: '请选择权重' }]}>
                <Select>
                  {Object.entries(weightMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            )}

            {batchFields.includes('tags') && (
              <Row gutter={12}>
                <Col span={isMobile ? 24 : 8}>
                  <Form.Item label="标签操作" name="tags_mode" rules={[{ required: true, message: '请选择标签操作' }]}>
                    <Select>
                      <Option value="append">追加</Option>
                      <Option value="remove">移除</Option>
                      <Option value="replace">替换</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 16}>
                  <Form.Item label="标签" name="tags">
                    <Input placeholder="多个标签用逗号分隔" />
                  </Form.Item>
                </Col>
              </Row>
            )}

            {batchFields.includes('shared_to') && (
              <Row gutter={12}>
                <Col span={isMobile ? 24 : 8}>
                  <Form.Item label="共享人操作" name="shared_to_mode" rules={[{ required: true, message: '请选择共享人操作' }]}>
                    <Select>
                      <Option value="append">追加</Option>
                      <Option value="remove">移除</Option>
                      <Option value="replace">替换</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 16}>
                  <Form.Item label="共享人" name="shared_to">
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="选择商务部门成员"
                      optionFilterProp="label"
                      options={commercialUsers.map(u => ({
                        value: u.id,
                        label: u.display_name || u.username,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            {batchFields.includes('visibility_scope') && (
              <>
                <Form.Item label="可见范围" name="visibility_scope" rules={[{ required: true, message: '请选择可见范围' }]}>
                  <Segmented
                    block
                    options={[
                      { label: <Space size={4}><GlobalOutlined />公司共享</Space>, value: COMPANY_PERSON_SCOPE },
                      { label: <Space size={4}><LockOutlined />个人私密</Space>, value: PRIVATE_PERSON_SCOPE },
                    ]}
                    onChange={(value) => {
                      if (value === PRIVATE_PERSON_SCOPE) {
                        batchForm.setFieldsValue({
                          fields: (batchForm.getFieldValue('fields') || []).filter(field => field !== 'shared_to'),
                          shared_to: [],
                        });
                      }
                    }}
                  />
                </Form.Item>
                {batchVisibilityScope === PRIVATE_PERSON_SCOPE && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="个人私密仅本人可见，会清空共享人；只能将自己创建的人脉转为私密"
                  />
                )}
              </>
            )}

            {batchFields.includes('potential_level') && (
              <Form.Item label="潜力评级" name="potential_level">
                <Select allowClear placeholder="清空或选择潜力评级">
                  {Object.entries(potentialLevelMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            )}

            {batchFields.includes('recruit_status') && (
              <Form.Item label="转化阶段" name="recruit_status" rules={[{ required: true, message: '请选择转化阶段' }]}>
                <Select>
                  {Object.entries(recruitStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            )}

            {batchFields.includes('intent_level') && (
              <Form.Item label="意向程度" name="intent_level" rules={[{ required: true, message: '请选择意向程度' }]}>
                <Select>
                  {Object.entries(intentMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            )}
          </Form>
        </Space>
      </Modal>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editing ? '编辑人脉' : '添加人脉'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 760}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
        styles={{ body: { maxHeight: isMobile ? 'calc(100vh - 120px)' : '70vh', overflowY: 'auto', paddingRight: 8 } }}
      >
        <Form form={form} layout="vertical" size="small">
          {/* 通用字段 */}
          {commonFields({ isMobile })}

          {/* 商务圈字段 */}
          {category === 'business' && businessFields({ isMobile })}

          {/* 外部人才字段 */}
          {isExternalTalent && externalTalentFields({ isMobile })}

          {/* 内部人才字段 */}
          {isInternalTalent && internalTalentFields({ isMobile })}

          {/* 创业/社交圈补充 */}
          {(category === 'startup' || category === 'social') && (
            <>
              <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>补充信息</Divider>
              <Row gutter={16}>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item label="行业" name="industry"><Input /></Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>备注</Divider>
          <Form.Item name="notes">
            <TextArea rows={3} placeholder="其他备注..." />
          </Form.Item>
          {canUsePrivatePersons && (
            <>
              <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>可见范围</Divider>
              <Form.Item label="可见范围" name="visibility_scope">
                <Segmented
                  block
                  options={[
                    { label: <Space size={4}><GlobalOutlined />公司共享</Space>, value: COMPANY_PERSON_SCOPE },
                    { label: <Space size={4}><LockOutlined />个人私密</Space>, value: PRIVATE_PERSON_SCOPE },
                  ]}
                  onChange={(value) => {
                    if (value === PRIVATE_PERSON_SCOPE) form.setFieldValue('shared_to', []);
                  }}
                />
              </Form.Item>
              {isPrivateScope && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="仅本人可见，不支持共享或指派"
                />
              )}
            </>
          )}
          <Form.Item shouldUpdate={(prev, cur) => prev.visibility_scope !== cur.visibility_scope} noStyle>
            {({ getFieldValue }) => {
              const privateSelected = getFieldValue('visibility_scope') === PRIVATE_PERSON_SCOPE;
              return (
                <Form.Item label="共享人" name="shared_to">
                  <Select
                    mode="multiple"
                    allowClear
                    disabled={privateSelected}
                    placeholder={privateSelected ? '私密人脉不共享' : '可选择商务部门成员共享此人脉'}
                    optionFilterProp="label"
                    options={commercialUsers.map(u => ({
                      value: u.id,
                      label: u.display_name || u.username,
                    }))}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 互动记录快速抽屉 */}
      <Drawer
        title={<Space><MessageOutlined />{intPerson?.name} 的互动记录</Space>}
        open={intDrawerOpen}
        onClose={() => setIntDrawerOpen(false)}
        width={isMobile ? '100%' : 560}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 56px)', overflowY: 'auto' } } : undefined}
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
          <Space wrap size={[6, 4]} style={{ maxWidth: isMobile ? 'calc(100vw - 120px)' : undefined }}>
            <Text strong ellipsis={{ tooltip: current?.name }} style={{ maxWidth: isMobile ? 160 : 260 }}>
              {current?.name}
            </Text>
            {current && <Tag color={categoryMap[current.person_category]?.color}>{categoryMap[current.person_category]?.label}</Tag>}
            {isPrivatePerson(current) && <Tag color="red" icon={<LockOutlined />}>私密</Tag>}
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={isMobile ? '100%' : 660}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 56px)', overflowY: 'auto' } } : undefined}
        extra={canEditPerson(current)
          ? <Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(current); }}>编辑</Button>
          : null}
      >
        {current && (
          <Tabs defaultActiveKey="info" tabBarGutter={isMobile ? 12 : undefined} items={[
            {
              key: 'info', label: '基本信息',
              children: (
                <>
                  {/* 关系信息 */}
                  <Descriptions column={isMobile ? 1 : 2} size="small" bordered style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="关系类型" span={2}>
                      <RelationTags value={current.relation_types} />
                    </Descriptions.Item>
                    <Descriptions.Item label="可见范围">
                      {isPrivatePerson(current)
                        ? <Tag color="red" icon={<LockOutlined />}>仅本人</Tag>
                        : <Tag color="blue" icon={<GlobalOutlined />}>公司共享</Tag>}
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
                  {(current.resources || current.demands || current.success_traits) && (
                    <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }} title="资源与诉求">
                      {current.resources && <Descriptions.Item label="拥有资源">{current.resources}</Descriptions.Item>}
                      {current.demands && <Descriptions.Item label="诉求">{current.demands}</Descriptions.Item>}
                      {current.success_traits && (
                        <Descriptions.Item label="关键成事特质">
                          <span style={{ whiteSpace: 'pre-wrap' }}>{current.success_traits}</span>
                        </Descriptions.Item>
                      )}
                    </Descriptions>
                  )}

                  {/* 商务圈专属 */}
                  {current.person_category === 'business' && (current.relationship_level || current.client_status) && (
                    <Descriptions column={isMobile ? 1 : 2} size="small" bordered style={{ marginBottom: 16 }} title="商务信息">
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

                  {current.person_category === 'business' && (
                    <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }} title="预算与流量场景">
                      <Descriptions.Item label="对方预算分类">
                        <MultiValueTags value={current.counterparty_budget_categories} optionMap={counterpartyBudgetCategoryMap} />
                      </Descriptions.Item>
                      <Descriptions.Item label="自有流量场景">
                        <MultiValueTags value={current.owned_traffic_scenarios} optionMap={trafficScenarioMap} />
                      </Descriptions.Item>
                      <Descriptions.Item label="代理流量场景">
                        <MultiValueTags value={current.agency_traffic_scenarios} optionMap={trafficScenarioMap} />
                      </Descriptions.Item>
                    </Descriptions>
                  )}

                  {/* 外部人才专属 */}
                  {currentIsExternal && (
                    <Descriptions column={isMobile ? 1 : 2} size="small" bordered style={{ marginBottom: 16 }} title="人才信息">
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
                          <Col span={isMobile ? 24 : 12} key={key}>
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
        onCancel={() => { setImportOpen(false); resetImportState(); }}
        onOk={handleImport}
        okText={importOkText}
        okButtonProps={{ disabled: importRows.length === 0 || importPreviewLoading, loading: importLoading }}
        cancelText="取消"
        width={isMobile ? '100%' : 760}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
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
                <li><b>姓名</b>建议只填姓名，最长 {PERSON_NAME_MAX_LENGTH} 个字符</li>
                <li><b>圈子分类</b>可填：{categoryImportOptionsText}</li>
                <li><b>关系类型</b>可填：{relationTypeImportOptionsText}；多个用中文逗号隔开</li>
                <li><b>权重</b>可填：{weightImportOptionsText}，留空默认中</li>
                <li>模板表头已写明可填项，示例已覆盖上述圈子分类、关系类型和权重，可直接按中文填写</li>
              </ul>
            }
          />
          <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate} style={{ width: isMobile ? '100%' : undefined }}>下载导入模板</Button>
            <Upload
              accept=".csv"
              showUploadList={false}
              beforeUpload={handleCsvFile}
            >
              <Button icon={<UploadOutlined />} type="primary" ghost style={{ width: isMobile ? '100%' : undefined }}>选择 CSV 文件</Button>
            </Upload>
          </Space>

          {importPreviewLoading && (
            <Alert type="info" showIcon message="正在检查重名和差异字段..." />
          )}

          {importSummary && (
            <Alert
              type={importExistingCount > 0 ? 'warning' : 'success'}
              showIcon
              message={`已解析 ${importSummary.total} 条：新增 ${importSummary.new || 0} 条，系统重名 ${importExistingCount} 条`}
              description={`可更新 ${importSummary.updateable || 0} 条，无差异 ${importSummary.no_change || 0} 条，多条同名 ${importSummary.ambiguous || 0} 条，文件内重复 ${importSummary.file_duplicate || 0} 条，无效 ${importSummary.invalid || 0} 条。`}
            />
          )}

          {importExistingCount > 0 && (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <div style={{ fontWeight: 600 }}>重名处理方式</div>
              <Radio.Group value={importDuplicateMode} onChange={e => setImportDuplicateMode(e.target.value)}>
                <Space direction="vertical">
                  <Radio value="skip">保留系统原记录，跳过重名数据</Radio>
                  <Radio value="update">用导入内容更新已有记录</Radio>
                </Space>
              </Radio.Group>
              <Alert
                type="info"
                showIcon
                message={importDuplicateMode === 'update'
                  ? '仅更新导入文件中非空且与系统不同的字段，空字段不会清空原值'
                  : '重名数据不会写入系统，已有互动记录、提醒和共享关系保持不变'}
              />
              {importDuplicateRows.length > 0 && (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={importDuplicateRows.slice(0, 8).map(row => ({ ...row, _key: row.line }))}
                  rowKey="_key"
                  scroll={{ x: 760 }}
                  columns={[
                    { title: '行号', dataIndex: 'line', width: 64 },
                    { title: '姓名', dataIndex: 'name', width: 100 },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 90,
                      render: status => {
                        const meta = importStatusMap[status] || { label: status, color: 'default' };
                        return <Tag color={meta.color}>{meta.label}</Tag>;
                      },
                    },
                    {
                      title: '系统记录',
                      dataIndex: 'existing',
                      render: existing => existing
                        ? `${existing.company || '未填公司'} / ${existing.position || '未填职位'} / ${displayImportWeight(existing.weight)}`
                        : '-',
                    },
                    {
                      title: '导入内容',
                      dataIndex: 'incoming',
                      render: incoming => incoming
                        ? `${incoming.company || '未填公司'} / ${incoming.position || '未填职位'} / ${displayImportWeight(incoming.weight)}`
                        : '-',
                    },
                    {
                      title: '差异字段',
                      dataIndex: 'diff_labels',
                      render: labels => labels?.length
                        ? labels.map(label => <Tag key={label} color="orange">{label}</Tag>)
                        : <Text type="secondary">-</Text>,
                    },
                  ]}
                />
              )}
              {importDuplicateRows.length > 8 && (
                <div style={{ color: '#888', fontSize: 12 }}>...还有 {importDuplicateRows.length - 8} 条重名/异常记录</div>
              )}
            </Space>
          )}

          {importRows.length > 0 && (
            <>
              <div style={{ color: '#52c41a', fontSize: 13 }}>
                已解析 <b>{importRows.length}</b> 条记录，预览如下（最多显示 5 条）：
              </div>
              {isMobile ? (
                <List
                  dataSource={importRows.slice(0, 5).map((r, i) => ({ ...r, _key: i }))}
                  rowKey="_key"
                  renderItem={(row) => (
                    <List.Item style={{ padding: 0, marginBottom: 8, border: 'none' }}>
                      <div style={{ width: '100%', padding: 12, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}>
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          <Text strong>{row.name || '未填写姓名'}</Text>
                          <Space wrap size={[6, 6]}>
                            {row.person_category && <Tag>{displayImportCategory(row.person_category)}</Tag>}
                            {row.relation_types && <Tag color="blue">{displayImportRelationTypes(row.relation_types)}</Tag>}
                          </Space>
                          <Typography.Text type="secondary">
                            {(row.company || '未填写公司')} · {(row.position || '未填写职位')}
                          </Typography.Text>
                          {row.phone && <Typography.Text type="secondary">手机：{row.phone}</Typography.Text>}
                          {row.weight && <Typography.Text type="secondary">权重：{displayImportWeight(row.weight)}</Typography.Text>}
                        </Space>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={importRows.slice(0, 5).map((r, i) => ({ ...r, _key: i }))}
                  rowKey="_key"
                  scroll={{ x: 600 }}
                  columns={[
                    { title: '姓名', dataIndex: 'name', width: 90 },
                    { title: '圈子', dataIndex: 'person_category', width: 90, render: displayImportCategory },
                    { title: '关系类型', dataIndex: 'relation_types', ellipsis: true, render: displayImportRelationTypes },
                    { title: '手机', dataIndex: 'phone', width: 120 },
                    { title: '公司', dataIndex: 'company', ellipsis: true },
                    { title: '职位', dataIndex: 'position', ellipsis: true },
                    { title: '权重', dataIndex: 'weight', width: 70, render: displayImportWeight },
                  ]}
                />
              )}
              {importRows.length > 5 && (
                <div style={{ color: '#888', fontSize: 12 }}>...还有 {importRows.length - 5} 条</div>
              )}
            </>
          )}
        </Space>
      </Modal>
    </div>
  );
}
