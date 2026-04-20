import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Modal, Form, Input, Select, DatePicker, message, Tag, Progress, Space, Descriptions, Drawer } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { goalsApi, usersApi } from '../api';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const goalTypeMap = {
  quarter: { label: '季度目标', color: 'blue' },
  month: { label: '月度目标', color: 'green' },
  week: { label: '周目标', color: 'orange' },
};

const statusMap = {
  active: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  delayed: { label: '延期', color: 'warning' },
  cancelled: { label: '已取消', color: 'default' },
};

function Goals() {
  const [quarterGoals, setQuarterGoals] = useState([]);
  const [expandedQuarters, setExpandedQuarters] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});
  const [monthGoals, setMonthGoals] = useState({});
  const [weekGoals, setWeekGoals] = useState({});
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();
  const goalType = Form.useWatch('goal_type', form);

  useEffect(() => {
    loadQuarterGoals();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await usersApi.listSimple();
      setUsers(data);
    } catch (err) {
      message.error('加载用户失败');
    }
  };

  const loadQuarterGoals = async () => {
    setLoading(true);
    try {
      const data = await goalsApi.list({ goal_type: 'quarter', parent_id: 'null' });
      setQuarterGoals(data);
    } catch (err) {
      message.error('加载季度目标失败');
    } finally {
      setLoading(false);
    }
  };

  const loadMonthGoals = async (quarterId) => {
    try {
      const data = await goalsApi.list({ goal_type: 'month', parent_id: quarterId });
      setMonthGoals(prev => ({ ...prev, [quarterId]: data }));
    } catch (err) {
      message.error('加载月度目标失败');
    }
  };

  const loadWeekGoals = async (monthId) => {
    try {
      const data = await goalsApi.list({ goal_type: 'week', parent_id: monthId });
      setWeekGoals(prev => ({ ...prev, [monthId]: data }));
    } catch (err) {
      message.error('加载周目标失败');
    }
  };

  const toggleQuarter = (quarterId) => {
    const isExpanded = expandedQuarters[quarterId];
    setExpandedQuarters(prev => ({ ...prev, [quarterId]: !isExpanded }));
    if (!isExpanded && !monthGoals[quarterId]) {
      loadMonthGoals(quarterId);
    }
  };

  const toggleMonth = (monthId) => {
    const isExpanded = expandedMonths[monthId];
    setExpandedMonths(prev => ({ ...prev, [monthId]: !isExpanded }));
    if (!isExpanded && !weekGoals[monthId]) {
      loadWeekGoals(monthId);
    }
  };

  const handleCreate = (goalType, parentId = null, parentPeriod = null) => {
    setEditing(null);
    form.resetFields();
    const now = dayjs();
    let defaultValues = {};
    if (goalType === 'quarter') {
      const year = now.year();
      const quarter = Math.ceil((now.month() + 1) / 3);
      defaultValues = {
        period_year: year,
        period_quarter: `Q${quarter}`,
      };
    } else if (goalType === 'month') {
      let monthValue = now;
      if (parentPeriod && /^\d{4}-Q[1-4]$/.test(parentPeriod)) {
        const year = Number(parentPeriod.slice(0, 4));
        monthValue = dayjs(`${year}-${String(now.month() + 1).padStart(2, '0')}-01`);
      }
      defaultValues = {
        period_month: monthValue,
      };
    } else if (goalType === 'week') {
      defaultValues = {
        period_range: [now.startOf('week'), now.endOf('week')],
      };
    }

    form.setFieldsValue({
      goal_type: goalType,
      parent_id: parentId,
      period: '',
      ...defaultValues,
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditing(record);
    const values = {
      ...record,
      deadline: record.deadline ? dayjs(record.deadline) : null,
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

    form.setFieldsValue(values);
    setModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除目标将同时删除其所有子目标，确定要删除吗？',
      onOk: async () => {
        try {
          await goalsApi.delete(id);
          message.success('删除成功');
          loadQuarterGoals();
          setMonthGoals({});
          setWeekGoals({});
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      let normalizedPeriod = values.period;

      if (values.goal_type === 'quarter') {
        normalizedPeriod = `${values.period_year}-${values.period_quarter}`;
      } else if (values.goal_type === 'month') {
        normalizedPeriod = values.period_month?.format('YYYY-MM');
      } else if (values.goal_type === 'week') {
        const [start, end] = values.period_range || [];
        normalizedPeriod = start && end
          ? `${start.format('YYYY-MM-DD')}~${end.format('YYYY-MM-DD')}`
          : '';
      }

      const payload = {
        ...values,
        period: normalizedPeriod,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
      };
      delete payload.period_year;
      delete payload.period_quarter;
      delete payload.period_month;
      delete payload.period_range;

      if (editing) {
        await goalsApi.update(editing.id, payload);
        message.success('更新成功');
      } else {
        await goalsApi.create(payload);
        message.success('创建成功');
      }

      setModalVisible(false);
      loadQuarterGoals();
      setMonthGoals({});
      setWeekGoals({});
    } catch (err) {
      message.error(editing ? '更新失败' : '创建失败');
    }
  };

  const showDetail = (record) => {
    setDetailRecord(record);
    setDetailVisible(true);
  };

  const renderGoalCard = (goal, level = 0) => {
    const isQuarter = goal.goal_type === 'quarter';
    const isMonth = goal.goal_type === 'month';
    const isExpanded = isQuarter ? expandedQuarters[goal.id] : expandedMonths[goal.id];
    const hasChildren = goal.child_count > 0;
    const children = isQuarter ? monthGoals[goal.id] : weekGoals[goal.id];

    return (
      <div key={goal.id} style={{ marginLeft: level * 40, marginBottom: 16 }}>
        <Card
          size="small"
          style={{ borderLeft: `4px solid ${(goalTypeMap[goal.goal_type] || goalTypeMap.quarter).color}` }}
          title={
            <Space>
              {hasChildren && (
                <Button
                  type="text"
                  size="small"
                  icon={isExpanded ? <DownOutlined /> : <RightOutlined />}
                  onClick={() => isQuarter ? toggleQuarter(goal.id) : toggleMonth(goal.id)}
                />
              )}
              <Tag color={(goalTypeMap[goal.goal_type] || { color: 'default' }).color}>{(goalTypeMap[goal.goal_type] || { label: goal.goal_type }).label}</Tag>
              <span>{goal.period}</span>
              <span style={{ fontWeight: 'bold' }}>{goal.title}</span>
              {hasChildren && <Tag>{goal.child_count} 个子目标</Tag>}
            </Space>
          }
          extra={
            <Space>
              <Tag color={(statusMap[goal.status] || { color: 'default' }).color}>{(statusMap[goal.status] || { label: goal.status }).label}</Tag>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => showDetail(goal)}>详情</Button>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(goal)}>编辑</Button>
              {(isQuarter || isMonth) && (
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => handleCreate(
                    isQuarter ? 'month' : 'week',
                    goal.id,
                    goal.period
                  )}
                >
                  添加{isQuarter ? '月度' : '周'}目标
                </Button>
              )}
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(goal.id)}>删除</Button>
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>负责人: {goal.owner_name}</div>
            {goal.department && <div>部门: {goal.department}</div>}
            {goal.deadline && <div>截止日期: {goal.deadline}</div>}
            {goal.description && <div>描述: {goal.description}</div>}
            <div>
              <span>进度: </span>
              <Progress percent={goal.progress} style={{ width: 200, display: 'inline-block' }} />
            </div>
          </Space>
        </Card>

        {isExpanded && children && children.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {children.map(child => renderGoalCard(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleCreate('quarter')}>
            新建目标
          </Button>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
        ) : quarterGoals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无季度目标</div>
        ) : (
          quarterGoals.map(goal => renderGoalCard(goal, 0))
        )}
      </Card>

      <Modal
        title={editing ? '编辑目标' : '新建目标'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="goal_type" label="目标类型" rules={[{ required: true }]}>
            <Select disabled={!!editing}>
              <Option value="quarter">季度目标</Option>
              <Option value="month">月度目标</Option>
              <Option value="week">周目标</Option>
            </Select>
          </Form.Item>

          {goalType === 'quarter' && (
            <Space style={{ width: '100%' }} size={12}>
              <Form.Item name="period_year" label="年份" rules={[{ required: true, message: '请选择年份' }]} style={{ flex: 1 }}>
                <Select
                  options={Array.from({ length: 7 }, (_, i) => {
                    const year = dayjs().year() - 2 + i;
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
            <Form.Item name="period_month" label="周期" rules={[{ required: true, message: '请选择月份' }]}>
              <DatePicker picker="month" style={{ width: '100%' }} />
            </Form.Item>
          )}

          {goalType === 'week' && (
            <Form.Item name="period_range" label="周期" rules={[{ required: true, message: '请选择日期范围' }]}>
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
          )}

          <Form.Item name="parent_id" label="父目标ID" hidden>
            <Input />
          </Form.Item>

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
              options={users.map(u => ({
                value: u.id,
                label: u.display_name || u.username || `用户${u.id}`,
              }))}
            />
          </Form.Item>

          <Form.Item name="department" label="部门">
            <Input />
          </Form.Item>

          <Form.Item name="deadline" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="progress" label="进度" initialValue={0}>
            <Input type="number" min={0} max={100} addonAfter="%" />
          </Form.Item>

          <Form.Item name="status" label="状态" initialValue="active">
            <Select>
              <Option value="active">进行中</Option>
              <Option value="completed">已完成</Option>
              <Option value="delayed">延期</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="目标详情"
        placement="right"
        width={600}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
      >
        {detailRecord && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="目标类型">
              <Tag color={(goalTypeMap[detailRecord.goal_type] || { color: 'default' }).color}>
                {(goalTypeMap[detailRecord.goal_type] || { label: detailRecord.goal_type }).label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="周期">{detailRecord.period}</Descriptions.Item>
            <Descriptions.Item label="标题">{detailRecord.title}</Descriptions.Item>
            <Descriptions.Item label="描述">{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="负责人">{detailRecord.owner_name}</Descriptions.Item>
            <Descriptions.Item label="部门">{detailRecord.department || '-'}</Descriptions.Item>
            <Descriptions.Item label="截止日期">{detailRecord.deadline || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={(statusMap[detailRecord.status] || { color: 'default' }).color}>
                {(statusMap[detailRecord.status] || { label: detailRecord.status }).label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="进度">
              <Progress percent={detailRecord.progress} />
            </Descriptions.Item>
            <Descriptions.Item label="子目标数量">{detailRecord.child_count}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.created_at}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{detailRecord.updated_at}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}

export default Goals;
