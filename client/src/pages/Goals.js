import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { goalsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';

const { TextArea } = Input;
const { RangePicker } = DatePicker;
const executiveRoles = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);

const goalTypeMap = {
  quarter: { label: '季度目标', color: 'blue' },
  month: { label: '月度目标', color: 'green' },
  week: { label: '周目标', color: 'orange' },
};

const statusMap = {
  pending: { label: '未开始', color: 'default' },
  active: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  delayed: { label: '延期', color: 'warning' },
  cancelled: { label: '已取消', color: 'error' },
};

const roleMap = {
  admin: '管理员',
  ceo: 'CEO',
  coo: 'COO',
  cto: 'CTO',
  cmo: 'CMO',
  sales_director: '销售总监',
  leader: '组长',
  member: '普通成员',
  readonly: '只读',
  guest: '访客',
};

const departmentMap = {
  commercial: '商务',
  operation: '产运',
  rd: '研发',
  marketing: '市场',
  hr: '人事',
  finance: '财务',
  admin: '行政',
};

const goalTypeOptions = [
  { value: 'quarter', label: '季度目标' },
  { value: 'month', label: '月度目标' },
  { value: 'week', label: '周目标' },
];

const statusOptions = [
  { value: 'pending', label: '未开始' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'delayed', label: '延期' },
  { value: 'cancelled', label: '已取消' },
];

const ownerRoleOptions = [
  { value: 'ceo', label: 'CEO' },
  { value: 'coo', label: 'COO' },
  { value: 'cmo', label: 'CMO' },
  { value: 'cto', label: 'CTO' },
  { value: 'leader', label: '组长' },
  { value: 'member', label: '普通成员' },
];

const getDisplayName = (user) => user?.display_name || user?.username || `用户${user?.id}`;
const getRoleLabel = (role) => roleMap[role] || role || '-';
const getDepartmentLabel = (department) => departmentMap[department] || department || '-';
const isExecutive = (role) => executiveRoles.has(role);

function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [goalOptions, setGoalOptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [filters, setFilters] = useState({
    department: undefined,
    owner_id: undefined,
    goal_type: undefined,
    status: undefined,
    owner_role: undefined,
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();
  const goalType = Form.useWatch('goal_type', form);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!user || filtersReady) return;
    setFilters({
      department: undefined,
      owner_id: user.role === 'member' ? user.id : undefined,
      goal_type: undefined,
      status: undefined,
      owner_role: undefined,
    });
    setFiltersReady(true);
  }, [user, filtersReady]);

  useEffect(() => {
    if (!filtersReady) return;
    loadGoals();
  }, [filtersReady, filters]);

  useEffect(() => {
    if (!user) return;
    loadGoalOptions();
  }, [user]);

  const loadUsers = async () => {
    try {
      const data = await usersApi.listSimple();
      setUsers(data);
    } catch {
      message.error('加载用户失败');
    }
  };

  const loadGoals = async () => {
    setLoading(true);
    try {
      const data = await goalsApi.list(filters);
      setGoals(data);
    } catch {
      message.error('加载目标失败');
    } finally {
      setLoading(false);
    }
  };

  const loadGoalOptions = async () => {
    try {
      const data = await goalsApi.list();
      setGoalOptions(data);
    } catch {
      message.error('加载上级目标选项失败');
    }
  };

  const refreshGoals = async () => {
    await Promise.all([loadGoals(), loadGoalOptions()]);
  };

  const currentUserMeta = users.find(item => item.id === user?.id);

  const getVisibleUsers = () => {
    if (!user) return [];
    if (isExecutive(user.role) || user.role === 'sales_director') return users;
    if (!currentUserMeta) return users.filter(item => item.id === user.id);

    if (user.role === 'leader') {
      return users.filter(item => item.team_id === currentUserMeta?.team_id || item.id === user.id);
    }

    if (user.role === 'member') {
      const visibleIds = new Set([user.id]);
      if (currentUserMeta?.leader_id) visibleIds.add(currentUserMeta.leader_id);
      const teamLeader = users.find(item => item.role === 'leader' && item.team_id === currentUserMeta?.team_id);
      if (teamLeader?.id) visibleIds.add(teamLeader.id);
      return users.filter(item => visibleIds.has(item.id));
    }

    return users.filter(item => item.id === user.id);
  };

  const visibleUsers = getVisibleUsers();
  const ownerOptions = visibleUsers.map(item => ({
    value: item.id,
    label: getDisplayName(item),
  }));
  const departmentOptions = Array.from(new Set([
    ...visibleUsers.map(item => item.department).filter(Boolean),
    ...goals.map(item => item.department).filter(Boolean),
  ])).map(department => ({ value: department, label: getDepartmentLabel(department) }));

  const getParentOptions = () => {
    if (goalType === 'month') {
      return goalOptions
        .filter(item => item.goal_type === 'quarter' && item.id !== editing?.id)
        .map(item => ({ value: item.id, label: `${item.period} · ${item.title}` }));
    }
    if (goalType === 'week') {
      return goalOptions
        .filter(item => item.goal_type === 'month' && item.id !== editing?.id)
        .map(item => ({ value: item.id, label: `${item.period} · ${item.title}` }));
    }
    return [];
  };

  const openCreateModal = () => {
    const now = dayjs();
    const currentQuarter = Math.ceil((now.month() + 1) / 3);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      goal_type: 'quarter',
      period_year: now.year(),
      period_quarter: `Q${currentQuarter}`,
      owner_id: user?.id,
      department: currentUserMeta?.department || undefined,
      progress: 0,
      status: 'pending',
      result: '',
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    const values = {
      ...record,
      deadline: record.deadline ? dayjs(record.deadline) : null,
      status: record.status,
      progress: Number(record.progress || 0),
      result: record.result || '',
    };

    if (record.goal_type === 'quarter' && record.period) {
      const match = record.period.match(/^(\d{4})-(Q[1-4])$/);
      if (match) {
        values.period_year = Number(match[1]);
        values.period_quarter = match[2];
      }
    } else if (record.goal_type === 'month' && record.period) {
      const monthValue = dayjs(`${record.period}-01`);
      values.period_month = monthValue.isValid() ? monthValue : null;
    } else if (record.goal_type === 'week' && record.period) {
      const match = record.period.match(/^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/);
      if (match) {
        values.period_range = [dayjs(match[1]), dayjs(match[2])];
      }
    }

    setEditing(record);
    form.setFieldsValue(values);
    setModalVisible(true);
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除目标将同时删除其所有子目标，确定要删除吗？',
      onOk: async () => {
        try {
          await goalsApi.delete(record.id);
          message.success('删除成功');
          if (detailRecord?.id === record.id) {
            setDetailVisible(false);
            setDetailRecord(null);
          }
          await refreshGoals();
        } catch (error) {
          message.error(error?.response?.data?.error || '删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      let period = '';
      if (values.goal_type === 'quarter') {
        period = `${values.period_year}-${values.period_quarter}`;
      } else if (values.goal_type === 'month') {
        period = values.period_month?.format('YYYY-MM');
      } else if (values.goal_type === 'week') {
        const [start, end] = values.period_range || [];
        period = start && end ? `${start.format('YYYY-MM-DD')}~${end.format('YYYY-MM-DD')}` : '';
      }

      const payload = {
        title: values.title,
        description: values.description,
        owner_id: values.owner_id,
        department: values.department || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
        progress: values.progress || 0,
        status: values.status,
        result: values.result || '',
        goal_type: values.goal_type,
        period,
        parent_id: values.goal_type === 'quarter' ? null : values.parent_id,
      };

      if (editing) {
        await goalsApi.update(editing.id, payload);
        message.success('更新成功');
      } else {
        await goalsApi.create(payload);
        message.success('创建成功');
      }

      setModalVisible(false);
      await refreshGoals();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error || (editing ? '更新失败' : '创建失败'));
    }
  };

  const showDetail = async (record) => {
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const data = await goalsApi.get(record.id);
      setDetailRecord(data);
    } catch (error) {
      message.error(error?.response?.data?.error || '加载目标详情失败');
      setDetailVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value || undefined }));
  };

  const resetFilters = () => {
    setFilters({
      department: undefined,
      owner_id: user?.role === 'member' ? user.id : undefined,
      goal_type: undefined,
      status: undefined,
      owner_role: undefined,
    });
  };

  const columns = [
    {
      title: '目标类型',
      dataIndex: 'goal_type',
      width: 110,
      render: (value) => (
        <Tag color={(goalTypeMap[value] || { color: 'default' }).color}>
          {(goalTypeMap[value] || { label: value }).label}
        </Tag>
      ),
    },
    {
      title: '周期',
      dataIndex: 'period',
      width: 170,
    },
    {
      title: '目标标题',
      dataIndex: 'title',
      width: 220,
    },
    {
      title: '目标描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 120,
      render: (value, record) => value || getDisplayName(record),
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 120,
      render: (value) => getDepartmentLabel(value),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 160,
      render: (value) => <Progress percent={Number(value || 0)} size="small" />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value) => (
        <Tag color={(statusMap[value] || { color: 'default' }).color}>
          {(statusMap[value] || { label: value }).label}
        </Tag>
      ),
    },
    {
      title: '结果',
      dataIndex: 'result',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="目标管理"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建目标
          </Button>
        )}
      >
        <Space wrap size={[12, 12]} style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="部门"
            style={{ width: 160 }}
            value={filters.department}
            onChange={(value) => handleFilterChange('department', value)}
            options={departmentOptions}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="负责人姓名"
            style={{ width: 180 }}
            value={filters.owner_id}
            onChange={(value) => handleFilterChange('owner_id', value)}
            options={ownerOptions}
          />
          <Select
            allowClear
            placeholder="目标类型"
            style={{ width: 140 }}
            value={filters.goal_type}
            onChange={(value) => handleFilterChange('goal_type', value)}
            options={goalTypeOptions}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            value={filters.status}
            onChange={(value) => handleFilterChange('status', value)}
            options={statusOptions}
          />
          <Select
            allowClear
            placeholder="负责人角色"
            style={{ width: 160 }}
            value={filters.owner_role}
            onChange={(value) => handleFilterChange('owner_role', value)}
            options={ownerRoleOptions}
          />
          <Button onClick={resetFilters}>重置筛选</Button>
        </Space>

        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          双击目标行可查看详情
        </Typography.Text>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={goals}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 1300 }}
          onRow={(record) => ({
            onDoubleClick: () => showDetail(record),
          })}
        />
      </Card>

      <Modal
        title={editing ? '编辑目标' : '新建目标'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={680}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changedValues) => {
            if (Object.prototype.hasOwnProperty.call(changedValues, 'goal_type')) {
              form.setFieldsValue({
                parent_id: undefined,
                period_year: undefined,
                period_quarter: undefined,
                period_month: undefined,
                period_range: undefined,
              });
            }
            if (Object.prototype.hasOwnProperty.call(changedValues, 'owner_id')) {
              const selectedUser = users.find(item => item.id === changedValues.owner_id);
              form.setFieldValue('department', selectedUser?.department || undefined);
            }
          }}
        >
          <Form.Item name="goal_type" label="目标类型" rules={[{ required: true, message: '请选择目标类型' }]}>
            <Select options={goalTypeOptions} disabled={!!editing} />
          </Form.Item>

          {goalType === 'quarter' && (
            <Space style={{ width: '100%' }} size={12}>
              <Form.Item name="period_year" label="年份" rules={[{ required: true, message: '请选择年份' }]} style={{ flex: 1 }}>
                <Select
                  options={Array.from({ length: 7 }, (_, index) => {
                    const year = dayjs().year() - 2 + index;
                    return { value: year, label: `${year}年` };
                  })}
                />
              </Form.Item>
              <Form.Item name="period_quarter" label="季度" rules={[{ required: true, message: '请选择季度' }]} style={{ flex: 1 }}>
                <Select
                  options={[
                    { value: 'Q1', label: 'Q1' },
                    { value: 'Q2', label: 'Q2' },
                    { value: 'Q3', label: 'Q3' },
                    { value: 'Q4', label: 'Q4' },
                  ]}
                />
              </Form.Item>
            </Space>
          )}

          {goalType === 'month' && (
            <>
              <Form.Item
                name="parent_id"
                label="关联季度目标"
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={getParentOptions()}
                  placeholder="请选择关联季度目标"
                />
              </Form.Item>
              <Form.Item name="period_month" label="周期" rules={[{ required: true, message: '请选择月份' }]}>
                <DatePicker picker="month" style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {goalType === 'week' && (
            <>
              <Form.Item
                name="parent_id"
                label="关联月度目标"
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={getParentOptions()}
                  placeholder="请选择关联月度目标"
                />
              </Form.Item>
              <Form.Item name="period_range" label="周期" rules={[{ required: true, message: '请选择日期范围' }]}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          <Form.Item name="title" label="目标标题" rules={[{ required: true, message: '请输入目标标题' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="description" label="目标描述">
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item name="owner_id" label="负责人" rules={[{ required: true, message: '请选择负责人' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={ownerOptions}
              placeholder="请选择负责人"
            />
          </Form.Item>

          <Form.Item name="department" label="部门">
            <Select
              allowClear
              options={departmentOptions}
              placeholder="请选择部门"
            />
          </Form.Item>

          <Form.Item name="deadline" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="progress" label="进度" initialValue={0}>
            <InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="status" label="状态" initialValue="pending" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={statusOptions} />
          </Form.Item>

          <Form.Item name="result" label="目标结果">
            <TextArea rows={4} placeholder="填写目标完成得怎么样" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="目标详情"
        placement="right"
        width={680}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
      >
        {detailLoading && <div style={{ textAlign: 'center', padding: 32 }}>加载中...</div>}
        {!detailLoading && detailRecord && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="目标类型">
                <Tag color={(goalTypeMap[detailRecord.goal_type] || { color: 'default' }).color}>
                  {(goalTypeMap[detailRecord.goal_type] || { label: detailRecord.goal_type }).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="周期">{detailRecord.period}</Descriptions.Item>
              <Descriptions.Item label="目标标题">{detailRecord.title}</Descriptions.Item>
              <Descriptions.Item label="目标描述">{detailRecord.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="负责人">{detailRecord.owner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="负责人角色">{getRoleLabel(detailRecord.owner_role)}</Descriptions.Item>
              <Descriptions.Item label="部门">{getDepartmentLabel(detailRecord.department)}</Descriptions.Item>
              <Descriptions.Item label="上级目标">{detailRecord.parent_title || '-'}</Descriptions.Item>
              <Descriptions.Item label="截止日期">{detailRecord.deadline || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={(statusMap[detailRecord.status] || { color: 'default' }).color}>
                  {(statusMap[detailRecord.status] || { label: detailRecord.status }).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="进度">
                <Progress percent={Number(detailRecord.progress || 0)} />
              </Descriptions.Item>
              <Descriptions.Item label="目标结果">{detailRecord.result || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailRecord.created_at}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailRecord.updated_at}</Descriptions.Item>
            </Descriptions>

            <Card title={`下级目标（${detailRecord.children?.length || 0}）`} size="small">
              {detailRecord.children?.length ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {detailRecord.children.map(child => (
                    <div key={child.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>
                        <Tag color={(goalTypeMap[child.goal_type] || { color: 'default' }).color}>
                          {(goalTypeMap[child.goal_type] || { label: child.goal_type }).label}
                        </Tag>
                        {child.period} · {child.title}
                      </span>
                      <span>{child.owner_name || '-'}</span>
                    </div>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂无下级目标</Typography.Text>
              )}
            </Card>
          </Space>
        )}
      </Drawer>
    </div>
  );
}

export default Goals;
