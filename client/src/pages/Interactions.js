import React, { useState, useEffect, useCallback } from 'react';
import { Select, Tag, Space, Popconfirm, Button, Modal, Form, Input, DatePicker, Row, Col, message, Dropdown, Collapse, Divider, Drawer, Grid, List, Descriptions, Upload, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, CalendarOutlined, CloseCircleOutlined, FilterOutlined, RiseOutlined, UploadOutlined, LockOutlined, MoreOutlined } from '@ant-design/icons';
import { interactionsApi, personsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import ResizableTable from '../components/ResizableTable';
import AttachmentList from '../components/AttachmentList';
import { validateAttachment, uploadAttachments, ATTACHMENT_ACCEPT } from '../utils/attachments';
import { RichTextEditor, RichTextView, richTextToPlain } from '../components/RichText';
import dayjs from 'dayjs';
import { formatBusinessDateTime } from '../utils/businessTime';
import { TASK_TYPE_META, TASK_TYPE_OPTIONS } from '../utils/taskTypes';
import './Interactions.css';


const { Option } = Select;
const { useBreakpoint } = Grid;
const PRIVATE_PERSON_SCOPE = 'executive_private';
const COMPANY_PERSON_SCOPE = 'company';
const EXECUTIVE_ROLES = ['ceo', 'coo', 'cto', 'cmo'];

const isExecutiveUser = (user) =>
  EXECUTIVE_ROLES.includes(user?.role) || EXECUTIVE_ROLES.includes(user?.executive_role);

const typeMap = {
  visit: { label: '拜访', color: 'blue' },
  call: { label: '通话', color: 'green' },
  gift: { label: '送礼', color: 'gold' },
  meal: { label: '餐饮', color: 'orange' },
  wechat: { label: '微信', color: 'cyan' },
  email: { label: '邮件', color: 'purple' },
  meeting: { label: '会议', color: 'magenta' },
  other: { label: '其他', color: 'default' },
};

const importanceMap = {
  high: { label: '重要', color: 'red' },
  medium: { label: '中等', color: 'orange' },
  normal: { label: '一般', color: 'default' },
};

const personWeightMap = {
  high: { label: '高' },
  medium: { label: '中' },
  low: { label: '低' },
};

const categoryMap = {
  business: { label: '商务圈', color: 'blue' },
  talent:   { label: '人才圈', color: 'green' },
  startup:  { label: '创业圈', color: 'orange' },
  social:   { label: '社交圈', color: 'purple' },
};

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

const isPrivateInteraction = (record) =>
  (record?.person_visibility_scope || record?.visibility_scope) === PRIVATE_PERSON_SCOPE;

export default function Interactions() {
  const { user } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const canFilterVisibility = isExecutiveUser(user);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [filterImportance, setFilterImportance] = useState('');
  const [filterCreatedBy, setFilterCreatedBy] = useState(undefined);
  const [filterVisibility, setFilterVisibility] = useState('');
  const [dateRange, setDateRange] = useState(null); // { start, end, label }
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [creatorUsers, setCreatorUsers] = useState([]);

  // 快捷日期选项
  const DATE_SHORTCUTS = [
    { label: '今天',     getRange: () => { const d = dayjs().format('YYYY-MM-DD'); return { start: d, end: d }; } },
    { label: '昨天',     getRange: () => { const d = dayjs().subtract(1,'day').format('YYYY-MM-DD'); return { start: d, end: d }; } },
    { label: '最近7天',  getRange: () => ({ start: dayjs().subtract(6,'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }) },
    { label: '最近30天', getRange: () => ({ start: dayjs().subtract(29,'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }) },
    { label: '本月',     getRange: () => ({ start: dayjs().startOf('month').format('YYYY-MM-DD'), end: dayjs().endOf('month').format('YYYY-MM-DD') }) },
  ];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [actionRecord, setActionRecord] = useState(null);
  const [persons, setPersons] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();
  const interactionType = Form.useWatch('type', form);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filterSearch) params.search = filterSearch;
    if (filterType) params.type = filterType;
    if (filterCity) params.city = filterCity;
    if (filterWeight) params.weight = filterWeight;
    if (filterImportance) params.importance = filterImportance;
    if (filterCreatedBy) params.created_by = filterCreatedBy;
    if (canFilterVisibility && filterVisibility) params.visibility_scope = filterVisibility;
    if (dateRange) { params.date_start = dateRange.start; params.date_end = dateRange.end; }
    const res = await interactionsApi.list(params);
    setData(res);
    setLoading(false);
  }, [filterSearch, filterType, filterCity, filterWeight, filterImportance, filterCreatedBy, filterVisibility, canFilterVisibility, dateRange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    personsApi.list({}).then(setPersons);
    usersApi.listSimple().then(setUsers).catch(() => {});
    usersApi.listSimple({ include_readonly: true, include_departed: true })
      .then(setCreatorUsers)
      .catch(() => setCreatorUsers(user ? [user] : []));
  }, [user]);

  const handleDelete = async (id) => {
    await interactionsApi.delete(id);
    load();
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ date: dayjs() });
    setFileList([]);
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date) : null,
      next_action_date: record.next_action_date ? dayjs(record.next_action_date) : null,
      opportunity_assignee: record.opportunity_assignee || undefined,
    });
    setFileList([]);
    setModalOpen(true);
  };

  const openMobileActions = (record, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setActionRecord(record);
  };

  const editFromActions = (record) => {
    if (!record) return;
    setActionRecord(null);
    setDetailRecord(current => Number(current?.id) === Number(record.id) ? null : current);
    openEdit(record);
  };

  const confirmDeleteRecord = (record) => {
    if (!record) return;
    setActionRecord(null);
    Modal.confirm({
      title: '删除互动记录？',
      content: '删除后无法恢复，请确认是否继续。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleDelete(record.id);
        setDetailRecord(current => Number(current?.id) === Number(record.id) ? null : current);
        message.success('删除成功');
      },
    });
  };

  const actionMenuItems = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑记录' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除记录', danger: true },
  ];

  const handleActionMenuClick = (record, { key, domEvent }) => {
    domEvent?.stopPropagation?.();
    if (key === 'edit') editFromActions(record);
    if (key === 'delete') confirmDeleteRecord(record);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      opportunity_type: values.opportunity_type || null,
      date: values.date?.format('YYYY-MM-DD'),
      next_action_date: values.next_action_date?.format('YYYY-MM-DD'),
    };
    let recordId;
    if (editing) {
      await interactionsApi.update(editing.id, payload);
      recordId = editing.id;
      message.success('更新成功');
    } else {
      const res = await interactionsApi.create(payload);
      recordId = res.id;
      message.success('添加成功');
    }
    if (fileList.length > 0) {
      try {
        await uploadAttachments('interaction', recordId, fileList);
      } catch {
        message.warning('附件上传失败，但记录已保存');
      }
    }
    setModalOpen(false);
    setFileList([]);
    load();
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'person_name',
      render: (v, record) => (
        <Space size={4} wrap>
          <span>{v || '-'}</span>
          {isPrivateInteraction(record) && <Tag color="red" icon={<LockOutlined />}>私密</Tag>}
        </Space>
      ),
    },
    {
      title: '公司',
      dataIndex: 'company_name',
      ellipsis: true,
      render: (value, record) => value || record.company || record.current_company || '-',
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      render: (value, record) => {
        const creator = creatorUsers.find(item => Number(item.id) === Number(record.created_by));
        return value || creator?.display_name || creator?.username || '-';
      },
    },
    {
      title: '圈子',
      render: (_, r) => {
        const m = categoryMap[r.person_category];
        return m ? <Tag color={m.color}>{m.label}</Tag> : null;
      },
    },
    { title: '日期', dataIndex: 'date', sorter: (a, b) => a.date.localeCompare(b.date) },
    {
      title: '类型',
      dataIndex: 'type',
      render: v => <Tag color={typeMap[v]?.color}>{typeMap[v]?.label || v}</Tag>,
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: v => richTextToPlain(v) || '-' },
    {
      title: '重要程度',
      dataIndex: 'importance',
      render: v => {
        const m = importanceMap[v] || importanceMap.normal;
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    { title: '结果', dataIndex: 'outcome', ellipsis: true },
    { title: '下次跟进', dataIndex: 'next_action', ellipsis: true },
    { title: '跟进日期', dataIndex: 'next_action_date' },
    {
      title: '商机标题',
      dataIndex: 'opportunity_title',
      key: 'opportunity_title',
      width: 200,
      ellipsis: true,
      render: value => value ? (
        <Tooltip title={value}>
          <span className="interaction-opportunity-title">{value}</span>
        </Tooltip>
      ) : '-',
    },
    {
      title: '商机状态',
      dataIndex: 'opportunity_status',
      key: 'opportunity_status',
      width: 104,
      render: (value, record) => {
        if (!record.opportunity_title || !value) return '-';
        const status = opportunityStatusMap[value] || { label: value, color: 'default' };
        return <Tag className="interaction-opportunity-tag" color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: '商机类型',
      dataIndex: 'opportunity_type',
      key: 'opportunity_type',
      width: 124,
      render: value => value ? (
        <Tag className="interaction-opportunity-tag" color={TASK_TYPE_META[value]?.color || 'default'}>
          {TASK_TYPE_META[value]?.label || value}
        </Tag>
      ) : '-',
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space onDoubleClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderInteractionCard = (record) => {
    const type = typeMap[record.type] || { label: record.type, color: 'default' };
    const importance = importanceMap[record.importance] || importanceMap.normal;
    const opportunity = record.opportunity_title && record.opportunity_status
      ? (opportunityStatusMap[record.opportunity_status] || { label: record.opportunity_status, color: 'default' })
      : null;
    const companyName = record.company_name || record.company || record.current_company || '';
    const creator = creatorUsers.find(item => Number(item.id) === Number(record.created_by));
    const creatorName = record.created_by_name || creator?.display_name || creator?.username || '-';
    const weightLabel = personWeightMap[record.weight]?.label || '';
    const metadata = [
      record.city,
      `创建人 ${creatorName}`,
      weightLabel ? `人脉权重 ${weightLabel}` : '',
    ].filter(Boolean);
    const summaries = [
      { key: 'description', label: '描述', value: richTextToPlain(record.description) },
      { key: 'outcome', label: '结果', value: record.outcome },
      { key: 'next-action', label: '下次跟进', value: record.next_action },
    ].filter(item => item.value);

    const openDetail = () => setDetailRecord(record);
    const handleCardKeyDown = (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail();
      }
    };

    return (
      <List.Item className="interaction-mobile-list-item">
        <div
          className="interaction-mobile-card"
          role="button"
          tabIndex={0}
          aria-label={`查看${record.person_name || ''}的互动记录详情`}
          onClick={openDetail}
          onKeyDown={handleCardKeyDown}
        >
          <div className="interaction-mobile-card-header">
            <div className="interaction-mobile-card-identity">
              <div className="interaction-mobile-card-name">{record.person_name || '-'}</div>
              {companyName && (
                <Tooltip title={companyName}>
                  <div className="interaction-mobile-card-company">{companyName}</div>
                </Tooltip>
              )}
            </div>
            <div className="interaction-mobile-card-header-actions">
              <span className="interaction-mobile-card-date">{record.date || '-'}</span>
              <Button
                type="text"
                size="small"
                className="interaction-mobile-card-more"
                icon={<MoreOutlined />}
                aria-label={`更多操作：${record.person_name || '互动记录'}`}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => openMobileActions(record, event)}
              />
            </div>
          </div>

          <div className="interaction-mobile-card-tags">
            {isPrivateInteraction(record) && <Tag color="red" icon={<LockOutlined />}>私密</Tag>}
            {record.person_category && <Tag color={categoryMap[record.person_category]?.color}>{categoryMap[record.person_category]?.label}</Tag>}
            <Tag color={type.color}>{type.label}</Tag>
            <Tag className="interaction-mobile-card-importance" color={importance.color}>信息·{importance.label}</Tag>
          </div>

          {metadata.length > 0 && (
            <div className="interaction-mobile-card-metadata">{metadata.join(' · ')}</div>
          )}

          {summaries.length > 0 && (
            <div className="interaction-mobile-card-summaries">
              {summaries.map(item => (
                <div className="interaction-mobile-card-summary" key={item.key}>
                  <span className="interaction-mobile-card-summary-label">{item.label}</span>
                  <span className="interaction-mobile-card-summary-value">{item.value}</span>
                </div>
              ))}
            </div>
          )}

          {record.opportunity_title && (
            <div className="interaction-mobile-card-opportunity">
              <RiseOutlined className="interaction-mobile-card-opportunity-icon" />
              <Tooltip title={record.opportunity_title}>
                <span className="interaction-mobile-card-opportunity-title">{record.opportunity_title}</span>
              </Tooltip>
              {opportunity && <Tag color={opportunity.color}>{opportunity.label}</Tag>}
              {record.opportunity_type && (
                <Tag color={TASK_TYPE_META[record.opportunity_type]?.color || 'default'}>
                  {TASK_TYPE_META[record.opportunity_type]?.label || record.opportunity_type}
                </Tag>
              )}
            </div>
          )}
        </div>
      </List.Item>
    );
  };

  const activeFilterCount = [
    filterSearch,
    filterType,
    filterCity,
    filterWeight,
    filterImportance,
    filterCreatedBy,
    canFilterVisibility && filterVisibility,
    dateRange,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchDraft('');
    setFilterSearch('');
    setFilterType('');
    setCityDraft('');
    setFilterCity('');
    setFilterWeight('');
    setFilterImportance('');
    setFilterCreatedBy(undefined);
    setFilterVisibility('');
    setDateRange(null);
    setCustomPickerOpen(false);
  };

  const applyMobileFilters = () => {
    setFilterSearch(searchDraft.trim());
    setFilterCity(cityDraft.trim());
    setFilterDrawerOpen(false);
  };

  const filterControls = (
    <Space
      style={{ marginBottom: isMobile ? 0 : 16, width: isMobile ? '100%' : undefined }}
      wrap
      direction={isMobile ? 'vertical' : 'horizontal'}
    >
      <Input.Search
        placeholder="搜索公司、姓名、描述、结果"
        allowClear
        value={searchDraft}
        style={{ width: isMobile ? '100%' : 240 }}
        onSearch={value => setFilterSearch(value.trim())}
        onChange={event => {
          const value = event.target.value;
          setSearchDraft(value);
          if (!value) setFilterSearch('');
        }}
      />
      <Select
        placeholder="互动类型"
        allowClear
        style={{ width: isMobile ? '100%' : 120 }}
        value={filterType || undefined}
        onChange={value => setFilterType(value || '')}
      >
        {Object.entries(typeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
      </Select>
      <Input.Search
        placeholder="城市"
        allowClear
        value={cityDraft}
        style={{ width: isMobile ? '100%' : 120 }}
        onSearch={value => setFilterCity(value.trim())}
        onChange={event => {
          const value = event.target.value;
          setCityDraft(value);
          if (!value) setFilterCity('');
        }}
      />
      <Select placeholder="人脉权重" allowClear style={{ width: isMobile ? '100%' : 110 }} value={filterWeight || undefined} onChange={v => setFilterWeight(v || '')}>
        <Option value="high"><Tag color="red">高</Tag></Option>
        <Option value="medium"><Tag color="orange">中</Tag></Option>
        <Option value="low"><Tag color="default">低</Tag></Option>
      </Select>
      <Select placeholder="信息重要程度" allowClear style={{ width: isMobile ? '100%' : 130 }} value={filterImportance || undefined} onChange={v => setFilterImportance(v || '')}>
        {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
      </Select>
      <Select
        placeholder="创建人"
        allowClear
        showSearch
        optionFilterProp="label"
        style={{ width: isMobile ? '100%' : 140 }}
        value={filterCreatedBy}
        onChange={setFilterCreatedBy}
        options={creatorUsers.map(u => ({
          value: u.id,
          label: u.id === user?.id
            ? `${u.display_name || u.username || '我'}（我）`
            : `${u.display_name || u.username}${u.account_status === 'departed' ? '（已离职）' : ''}`,
        }))}
      />
      {canFilterVisibility && (
        <Select
          placeholder="可见范围"
          allowClear
          style={{ width: isMobile ? '100%' : 120 }}
          value={filterVisibility || undefined}
          onChange={v => setFilterVisibility(v || '')}
        >
          <Option value={COMPANY_PERSON_SCOPE}>公司共享</Option>
          <Option value={PRIVATE_PERSON_SCOPE}>个人私密</Option>
        </Select>
      )}
      <Dropdown
        trigger={['click']}
        open={customPickerOpen}
        onOpenChange={open => { if (!open) setCustomPickerOpen(false); }}
        popupRender={() => (
          <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 12, minWidth: 240 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>快捷选择</div>
            <Space wrap style={{ marginBottom: 12 }}>
              {DATE_SHORTCUTS.map(s => (
                <Button
                  key={s.label}
                  size="small"
                  type={dateRange?.label === s.label ? 'primary' : 'default'}
                  onClick={() => { setDateRange({ ...s.getRange(), label: s.label }); setCustomPickerOpen(false); }}
                >
                  {s.label}
                </Button>
              ))}
            </Space>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>自定义范围</div>
            <DatePicker.RangePicker
              size="small"
              style={{ width: '100%' }}
              onChange={(_, strs) => {
                if (strs[0] && strs[1]) {
                  setDateRange({ start: strs[0], end: strs[1], label: `${strs[0]} ~ ${strs[1]}` });
                  setCustomPickerOpen(false);
                }
              }}
            />
          </div>
        )}
      >
        <Button
          icon={<CalendarOutlined />}
          type={dateRange ? 'primary' : 'default'}
          ghost={!!dateRange}
          style={{ width: isMobile ? '100%' : undefined }}
          onClick={() => setCustomPickerOpen(v => !v)}
        >
          {dateRange ? dateRange.label : '日期范围'}
          {dateRange && (
            <CloseCircleOutlined
              style={{ marginLeft: 6, fontSize: 12 }}
              onClick={event => { event.stopPropagation(); setDateRange(null); setCustomPickerOpen(false); }}
            />
          )}
        </Button>
      </Dropdown>
    </Space>
  );

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ marginBottom: 16 }}>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加记录</Button>
          {isMobile && (
            <Button icon={<FilterOutlined />} onClick={() => setFilterDrawerOpen(true)} style={{ width: '100%' }}>
              筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          )}
        </Space>
      </div>
      {!isMobile && filterControls}
      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无互动记录' }}
          renderItem={renderInteractionCard}
        />
      ) : (
        <ResizableTable
          storageKey="interactions-table-columns"
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ defaultPageSize: 20 }}
          onRow={(record) => ({
            onDoubleClick: () => setDetailRecord(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Drawer
        title="筛选互动记录"
        placement="right"
        width="100%"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyMobileFilters}>完成</Button>
          </Space>
        }
      >
        {filterControls}
      </Drawer>

      <Drawer
        className="interaction-mobile-action-sheet"
        placement="bottom"
        height={224}
        closable={false}
        zIndex={1100}
        open={isMobile && !!actionRecord}
        onClose={() => setActionRecord(null)}
        styles={{ body: { padding: '8px 12px calc(10px + env(safe-area-inset-bottom))' } }}
      >
        <div className="interaction-mobile-action-list" role="menu" aria-label="互动记录操作">
          <Button
            type="text"
            icon={<EditOutlined />}
            role="menuitem"
            onClick={() => editFromActions(actionRecord)}
          >
            编辑记录
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            role="menuitem"
            onClick={() => confirmDeleteRecord(actionRecord)}
          >
            删除记录
          </Button>
          <Divider />
          <Button type="text" role="menuitem" onClick={() => setActionRecord(null)}>取消</Button>
        </div>
      </Drawer>

      <Modal
        title={editing ? '编辑互动记录' : '添加互动记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            {!editing && (
              <Col span={24}>
                <Form.Item label="选择人员" name="person_id" rules={[{ required: true }]}>
                  <Select
                    placeholder="选择姓名"
                    showSearch
                    filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                  >
                    {persons.map(p => (
                      <Option key={p.id} value={p.id}>
                        {p.name}
                        {(p.company || p.current_company) && ` (${p.company || p.current_company})`}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(typeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            {/* 送礼时显示礼物 */}
            {interactionType === 'gift' && (
              <Col span={isMobile ? 24 : 8}>
                <Form.Item label="礼物" name="gift_name">
                  <Input placeholder="如：茅台、月饼礼盒" />
                </Form.Item>
              </Col>
            )}
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="信息重要程度" name="importance" initialValue="normal">
                <Select>
                  {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="描述" name="description" valuePropName="value" trigger="onChange">
                <RichTextEditor placeholder="互动描述..." minHeight={120} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="结果/收获" name="outcome">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下次跟进事项" name="next_action">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="跟进日期" name="next_action_date">
                <DatePicker style={{ width: '100%' }} />
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
                        <Select.Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item label="商机类型" name="opportunity_type">
                    <Select allowClear placeholder="选择商机类型" options={TASK_TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
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
                    <Input.TextArea rows={2} placeholder="背景、需求或其他说明" />
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
              accept={ATTACHMENT_ACCEPT}
            >
              <Button icon={<UploadOutlined />}>选择文件（最多10个，单个最大100MB）</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={(
          <div className="interaction-detail-title">
            <span>互动记录详情</span>
            {detailRecord && (isMobile ? (
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label="更多互动记录操作"
                onClick={event => openMobileActions(detailRecord, event)}
              />
            ) : (
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  items: actionMenuItems,
                  onClick: info => handleActionMenuClick(detailRecord, info),
                }}
              >
                <Button type="text" size="small" icon={<MoreOutlined />} aria-label="更多互动记录操作" />
              </Dropdown>
            ))}
          </div>
        )}
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
          const cat = categoryMap[r.person_category];
          const t = typeMap[r.type] || { label: r.type, color: 'default' };
          const imp = importanceMap[r.importance] || importanceMap.normal;
          const oppStatus = r.opportunity_title && r.opportunity_status
            ? (opportunityStatusMap[r.opportunity_status] || { label: r.opportunity_status, color: 'default' })
            : null;
          const assignee = users.find(u => u.id === r.opportunity_assignee);
          const creator = creatorUsers.find(u => u.id === r.created_by) || users.find(u => u.id === r.created_by);
          return (
            <>
              <Descriptions
                size="small"
                column={isMobile ? 1 : 2}
                bordered
                styles={{ label: { width: 110 } }}
              >
                <Descriptions.Item label="圈子">
                  {cat ? <Tag color={cat.color}>{cat.label}</Tag> : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="公司">{r.company_name || r.company || r.current_company || '-'}</Descriptions.Item>
                <Descriptions.Item label="姓名">{r.person_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="日期">{r.date || '-'}</Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Tag color={t.color}>{t.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="重要程度">
                  <Tag color={imp.color}>{imp.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="城市">{r.city || '-'}</Descriptions.Item>
                <Descriptions.Item label="人脉权重">{personWeightMap[r.weight]?.label || '-'}</Descriptions.Item>
                <Descriptions.Item label="跟进日期" span={isMobile ? 1 : 2}>{r.next_action_date || '-'}</Descriptions.Item>
                <Descriptions.Item label="描述" span={isMobile ? 1 : 2}>
                  <RichTextView value={r.description} />
                </Descriptions.Item>
                <Descriptions.Item label="结果" span={isMobile ? 1 : 2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.outcome || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="下次跟进" span={isMobile ? 1 : 2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.next_action || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="商机" span={isMobile ? 1 : 2}>
                  {r.opportunity_title ? (
                    <Space size={4} wrap>
                      <Tag color="blue" icon={<RiseOutlined />}>{r.opportunity_title}</Tag>
                      {oppStatus && <Tag color={oppStatus.color}>{oppStatus.label}</Tag>}
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机跟进人">
                  {assignee ? (assignee.display_name || assignee.username) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机类型">
                  {r.opportunity_type
                    ? <Tag color={TASK_TYPE_META[r.opportunity_type]?.color || 'default'}>{TASK_TYPE_META[r.opportunity_type]?.label || r.opportunity_type}</Tag>
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机说明" span={isMobile ? 1 : 2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.opportunity_note || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="创建人">
                  {creator ? (creator.display_name || creator.username) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatBusinessDateTime(r.created_at, 'YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 20 }}>
                <AttachmentList sourceType="interaction" sourceId={r.id} />
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
