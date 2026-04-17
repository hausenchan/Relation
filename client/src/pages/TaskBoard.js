import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Tag, Space, Typography, Button, DatePicker, Modal, Form, Input, Select,
  Badge, Tooltip, message, Popconfirm, Divider, Empty, Spin, Row, Col, Statistic
} from 'antd';
import {
  PlusOutlined, CheckOutlined, PlayCircleOutlined, DeleteOutlined,
  EditOutlined, FlagOutlined, ApartmentOutlined, TeamOutlined, UserOutlined
} from '@ant-design/icons';
import { tasksApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

const statusMap = {
  pending:     { label: '待处理', color: 'default',  badge: 'default' },
  in_progress: { label: '进行中', color: 'orange',   badge: 'processing' },
  done:        { label: '已完成', color: 'green',    badge: 'success' },
};

const priorityMap = {
  high:   { label: '高', color: 'red' },
  medium: { label: '中', color: 'orange' },
  low:    { label: '低', color: 'default' },
};

export default function TaskBoard() {
  const { user } = useAuth();
  const [boardData, setBoardData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [parentTask, setParentTask] = useState(null);
  const [targetMember, setTargetMember] = useState(null); // 指派给谁
  const [form] = Form.useForm();
  const [allUsers, setAllUsers] = useState([]);

  const dateStr = selectedDate.format('YYYY-MM-DD');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tasksApi.board({ date: dateStr });
      setBoardData(res);
    } catch (e) {
      message.error('加载看板失败');
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersApi.listSimple().then(setAllUsers).catch(() => {});
  }, []);

  const openAdd = (member = null, parent = null) => {
    setEditing(null);
    setParentTask(parent);
    setTargetMember(member);
    form.resetFields();
    form.setFieldsValue({
      date: selectedDate,
      priority: 'medium',
      assigned_to: member?.id || user?.id,
    });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setParentTask(null);
    setTargetMember(null);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      date: values.date?.format('YYYY-MM-DD'),
      parent_id: parentTask?.id || null,
    };
    try {
      if (editing) {
        await tasksApi.update(editing.id, payload);
        message.success('更新成功');
      } else {
        await tasksApi.create(payload);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleStatus = async (record, status) => {
    try {
      await tasksApi.update(record.id, { status });
      message.success(status === 'done' ? '已标记完成 ✓' : '已开始');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await tasksApi.delete(id);
      message.success('已删除');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  // 按小组分组
  const grouped = boardData.reduce((acc, member) => {
    const key = member.team_name || '未分组';
    if (!acc[key]) acc[key] = [];
    acc[key].push(member);
    return acc;
  }, {});

  const totalTasks = boardData.reduce((sum, m) => sum + m.tasks.length, 0);
  const doneTasks = boardData.reduce((sum, m) => sum + m.tasks.filter(t => t.status === 'done').length, 0);
  const inProgressTasks = boardData.reduce((sum, m) => sum + m.tasks.filter(t => t.status === 'in_progress').length, 0);
  const pendingTasks = totalTasks - doneTasks - inProgressTasks;

  // 统计我指派给别人的任务
  const myAssignedTasks = boardData.reduce((sum, m) => {
    return sum + m.tasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id).length;
  }, 0);

  // 统计别人指派给我的任务
  const assignedToMeTasks = boardData.reduce((sum, m) => {
    return sum + m.tasks.filter(t => t.assigned_to === user?.id && t.created_by !== user?.id).length;
  }, 0);

  return (
    <div>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space align="center">
          <DatePicker
            value={selectedDate}
            onChange={(d) => setSelectedDate(d || dayjs())}
            allowClear={false}
            style={{ width: 140 }}
          />
          <Button size="small" onClick={() => setSelectedDate(dayjs())}>今天</Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdd()}>
          新建任务
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center', background: '#f0f5ff' }}>
            <Statistic title="总任务" value={totalTasks} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center', background: '#fff7e6' }}>
            <Statistic title="进行中" value={inProgressTasks} valueStyle={{ fontSize: 20, color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center', background: '#fff1f0' }}>
            <Statistic title="待处理" value={pendingTasks} valueStyle={{ fontSize: 20, color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center', background: '#f6ffed' }}>
            <Statistic
              title="已完成"
              value={doneTasks}
              suffix={totalTasks > 0 ? `/${totalTasks}` : ''}
              valueStyle={{ fontSize: 20, color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center', background: '#e6f7ff' }}>
            <Statistic
              title="我指派的"
              value={myAssignedTasks}
              valueStyle={{ fontSize: 20, color: '#1890ff' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center', background: '#fff0f6' }}>
            <Statistic
              title="指派给我"
              value={assignedToMeTasks}
              valueStyle={{ fontSize: 20, color: '#eb2f96' }}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Spin spinning={loading}>
        {Object.keys(grouped).length === 0 && !loading ? (
          <Empty description="暂无数据" style={{ padding: 48 }} />
        ) : (
          Object.entries(grouped).map(([teamName, members]) => (
            <div key={teamName} style={{ marginBottom: 24 }}>
              {/* 小组标题 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12, padding: '6px 0',
                borderBottom: '2px solid #f0f0f0',
              }}>
                <TeamOutlined style={{ color: '#1677ff' }} />
                <Text strong style={{ fontSize: 15 }}>{teamName}</Text>
                <Tag color="blue">{members.length} 人</Tag>
                <Tag color="default">
                  {members.reduce((s, m) => s + m.tasks.filter(t => t.status === 'done').length, 0)}/
                  {members.reduce((s, m) => s + m.tasks.length, 0)} 完成
                </Tag>
              </div>

              {/* 成员卡片 */}
              <Row gutter={[12, 12]}>
                {members.map(member => {
                  const mDone = member.tasks.filter(t => t.status === 'done').length;
                  const mTotal = member.tasks.length;
                  const allDone = mTotal > 0 && mDone === mTotal;

                  return (
                    <Col key={member.id} xs={24} sm={12} lg={8} xl={6}>
                      <Card
                        size="small"
                        style={{
                          border: allDone ? '1px solid #b7eb8f' : '1px solid #d9d9d9',
                          background: allDone ? '#f6ffed' : '#fff',
                        }}
                        title={
                          <Space>
                            <UserOutlined />
                            <Text strong style={{ fontSize: 13 }}>{member.display_name}</Text>
                            {mTotal > 0 && (
                              <Badge
                                count={mTotal - mDone}
                                style={{ backgroundColor: allDone ? '#52c41a' : '#ff4d4f' }}
                                showZero={false}
                              />
                            )}
                            {allDone && mTotal > 0 && <Tag color="green" style={{ margin: 0 }}>✓ 全完成</Tag>}
                          </Space>
                        }
                        extra={
                          <Tooltip title="为该成员新建任务">
                            <Button
                              size="small"
                              type="link"
                              icon={<PlusOutlined />}
                              onClick={() => openAdd(member)}
                            />
                          </Tooltip>
                        }
                        bodyStyle={{ padding: '8px 12px', minHeight: 60 }}
                      >
                        {member.tasks.length === 0 ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>暂无任务</Text>
                        ) : (
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {member.tasks.map(task => (
                              <TaskItem
                                key={task.id}
                                task={task}
                                currentUser={user}
                                onStatus={handleStatus}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                                onAddSub={() => openAdd(member, task)}
                              />
                            ))}
                          </Space>
                        )}
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </div>
          ))
        )}
      </Spin>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={
          editing ? '编辑任务'
          : parentTask ? `拆解子任务：${parentTask.title}`
          : targetMember ? `为 ${targetMember.display_name} 新建任务`
          : '新建任务'
        }
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="任务标题" name="title" rules={[{ required: true, message: '请填写任务标题' }]}>
            <Input placeholder="简述任务内容" />
          </Form.Item>
          <Form.Item label="任务描述" name="description">
            <Input.TextArea rows={2} placeholder="详细说明（选填）" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item label="日期" name="date" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 0 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="优先级" name="priority" style={{ flex: 1, marginBottom: 0 }}>
              <Select>
                {Object.entries(priorityMap).map(([k, v]) => (
                  <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
                ))}
              </Select>
            </Form.Item>
          </Space>
          <Form.Item label="指派给" name="assigned_to" style={{ marginTop: 12 }} rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={allUsers.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Form.Item>
          <Form.Item label="完成备注" name="result" style={{ marginTop: 4 }}>
            <Input.TextArea rows={2} placeholder="完成情况或结果说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// 单个任务条目（精简版）
function TaskItem({ task, currentUser, onStatus, onEdit, onDelete, onAddSub }) {
  const p = priorityMap[task.priority] || { label: task.priority, color: 'default' };
  const s = statusMap[task.status] || { label: task.status, color: 'default', badge: 'default' };
  const isDone = task.status === 'done';

  const canEdit = task.assigned_to === currentUser?.id || task.created_by === currentUser?.id
    || ['admin', 'leader', 'sales_director'].includes(currentUser?.role);

  return (
    <div style={{
      padding: '6px 8px',
      background: isDone ? '#f9f9f9' : '#fff',
      borderRadius: 6,
      border: '1px solid #f0f0f0',
      opacity: isDone ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Tag color={p.color} icon={<FlagOutlined />} style={{ margin: 0, fontSize: 11 }}>{p.label}</Tag>
        {task.depth > 0 && <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>子</Tag>}
        <Text
          style={{ flex: 1, fontSize: 12, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#aaa' : '#333' }}
          ellipsis={{ tooltip: task.title }}
        >
          {task.title}
        </Text>
      </div>
      {task.created_by_name && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>指派人：{task.created_by_name}</div>
      )}
      {task.result && (
        <div style={{ fontSize: 11, color: '#52c41a', marginBottom: 2, whiteSpace: 'pre-wrap' }}>备注：{task.result}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <Badge status={s.badge} text={<Tag color={s.color} style={{ margin: 0, fontSize: 11 }}>{s.label}</Tag>} />
        <Space size={2}>
          {task.status === 'pending' && canEdit && (
            <Button size="small" icon={<PlayCircleOutlined />} style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              onClick={() => onStatus(task, 'in_progress')}>开始</Button>
          )}
          {task.status === 'in_progress' && canEdit && (
            <Button size="small" type="primary" icon={<CheckOutlined />} style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              onClick={() => onStatus(task, 'done')}>完成</Button>
          )}
          {!isDone && canEdit && (
            <Tooltip title="拆解子任务">
              <Button size="small" icon={<ApartmentOutlined />} style={{ height: 22, width: 22, padding: 0 }}
                onClick={() => onAddSub(task)} />
            </Tooltip>
          )}
          {!isDone && canEdit && (
            <Button size="small" icon={<EditOutlined />} style={{ height: 22, width: 22, padding: 0 }}
              onClick={() => onEdit(task)} />
          )}
          {task.created_by === currentUser?.id && task.status === 'pending' && (
            <Popconfirm title="确认删除？" onConfirm={() => onDelete(task.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} style={{ height: 22, width: 22, padding: 0 }} />
            </Popconfirm>
          )}
        </Space>
      </div>
    </div>
  );
}
