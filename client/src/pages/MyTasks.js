import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Modal, Form, Input, Select,
  DatePicker, Popconfirm, message, Badge, Tooltip, Drawer, Descriptions, Tree
} from 'antd';
import {
  PlusOutlined, CheckOutlined, PlayCircleOutlined, DeleteOutlined,
  EditOutlined, FlagOutlined, ApartmentOutlined, UserOutlined
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

const DATE_TABS = [
  { label: '今天',   getDate: () => dayjs().format('YYYY-MM-DD') },
  { label: '明天',   getDate: () => dayjs().add(1, 'day').format('YYYY-MM-DD') },
  { label: '后天',   getDate: () => dayjs().add(2, 'day').format('YYYY-MM-DD') },
];

export default function MyTasks() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [customDate, setCustomDate] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [parentTask, setParentTask] = useState(null); // 子任务时的父任务
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [children, setChildren] = useState([]); // 子任务列表

  const canAssignOthers = true; // 新规则：所有角色都可以给任何人创建任务

  const activeDate = customDate || selectedDate;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await tasksApi.list({ date: activeDate, mine: '1', parent_id: 'null' });
    setData(res);
    setLoading(false);
  }, [activeDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (canAssignOthers) {
      usersApi.listSimple().then(setUsers).catch(() => {});
    }
  }, [canAssignOthers]);

  const openAdd = (parent = null) => {
    setEditing(null);
    setParentTask(parent);
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(activeDate),
      priority: 'medium',
      assigned_to: user?.id,
      result: '',
    });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setParentTask(null);
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
    if (editing) {
      await tasksApi.update(editing.id, payload);
      message.success('更新成功');
    } else {
      await tasksApi.create(payload);
      message.success('创建成功');
    }
    setModalOpen(false);
    load();
  };

  const handleStatus = async (record, status) => {
    await tasksApi.update(record.id, { status });
    message.success(status === 'done' ? '已完成 ✓' : '已开始');
    load();
  };

  const handleDelete = async (id) => {
    await tasksApi.delete(id);
    message.success('已删除');
    load();
  };

  const openDetail = async (record) => {
    setDetailRecord(record);
    // 加载子任务
    const subs = await tasksApi.list({ parent_id: record.id });
    setChildren(subs);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 70,
      render: v => {
        const p = priorityMap[v] || { label: v, color: 'default' };
        return <Tag color={p.color} icon={<FlagOutlined />}>{p.label}</Tag>;
      },
    },
    {
      title: '任务标题',
      dataIndex: 'title',
      render: (v, r) => (
        <Space>
          <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => openDetail(r)}>
            {r.parent_id && <ApartmentOutlined style={{ marginRight: 4, color: '#aaa' }} />}
            {v}
          </Button>
          {r.depth > 0 && <Tag color="purple" style={{ fontSize: 11 }}>子任务</Tag>}
        </Space>
      ),
    },
    {
      title: '指派人',
      dataIndex: 'created_by_name',
      width: 90,
      render: (v, r) => r.created_by === user?.id
        ? <Text type="secondary" style={{ fontSize: 12 }}>自建</Text>
        : <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: v => {
        const s = statusMap[v] || { label: v, color: 'default', badge: 'default' };
        return <Badge status={s.badge} text={<Tag color={s.color} style={{ margin: 0 }}>{s.label}</Tag>} />;
      },
    },
    {
      title: '操作',
      width: 180,
      render: (_, r) => (
        <Space size={4}>
          {r.status === 'pending' && (
            <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleStatus(r, 'in_progress')}>开始</Button>
          )}
          {r.status === 'in_progress' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleStatus(r, 'done')}>完成</Button>
          )}
          {r.status === 'done' && (
            <Tag color="green">✓ {r.done_at ? dayjs(r.done_at).format('HH:mm') : ''}</Tag>
          )}
          {r.status !== 'done' && (
            <Tooltip title="拆解子任务">
              <Button size="small" icon={<ApartmentOutlined />} onClick={() => openAdd(r)} />
            </Tooltip>
          )}
          {r.status !== 'done' && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          )}
          {r.created_by === user?.id && r.status === 'pending' && (
            <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const todayStr = dayjs().format('YYYY-MM-DD');
  const done = data.filter(d => d.status === 'done').length;
  const total = data.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space align="center">
          {total > 0 && (
            <Tag color={done === total ? 'green' : 'blue'}>
              {done}/{total} 已完成
            </Tag>
          )}
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdd()}>新建任务</Button>
      </div>

      {/* 日期快速切换 */}
      <Space style={{ marginBottom: 16 }} wrap>
        {DATE_TABS.map(t => {
          const d = t.getDate();
          const active = !customDate && d === selectedDate;
          return (
            <Button
              key={t.label}
              type={active ? 'primary' : 'default'}
              size="small"
              onClick={() => { setSelectedDate(d); setCustomDate(null); }}
            >
              {t.label}
              {d === todayStr ? '' : ` (${d.slice(5)})`}
            </Button>
          );
        })}
        <DatePicker
          size="small"
          placeholder="自定义日期"
          value={customDate ? dayjs(customDate) : null}
          onChange={(_, str) => { setCustomDate(str || null); }}
          allowClear
        />
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 30 }}
        rowClassName={r => r.status === 'done' ? 'task-done-row' : ''}
      />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editing ? '编辑任务' : parentTask ? `拆解子任务：${parentTask.title}` : '新建任务'}
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
          <Form.Item label="任务进度/任务结果" name="result">
            <Input.TextArea rows={3} placeholder="填写当前进度、执行情况或最终结果（选填）" />
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
          {canAssignOthers && !editing && (
            <Form.Item label="指派给" name="assigned_to" style={{ marginTop: 12 }} rules={[{ required: true }]}>
              <Select
                showSearch
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={[
                  { value: user?.id, label: `${user?.display_name || user?.username}（我自己）` },
                  ...users.filter(u => u.id !== user?.id).map(u => ({ value: u.id, label: u.display_name || u.username })),
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 任务详情抽屉 */}
      <Drawer
        title="任务详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={480}
        extra={
          detailRecord?.status !== 'done' && (
            <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detailRecord); }}>编辑</Button>
          )
        }
      >
        {detailRecord && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="标题">{detailRecord.title}</Descriptions.Item>
              <Descriptions.Item label="描述">{detailRecord.description || '-'}</Descriptions.Item>
              {detailRecord.result && (
                <Descriptions.Item label="任务进度/任务结果">{detailRecord.result}</Descriptions.Item>
              )}
              <Descriptions.Item label="日期">{detailRecord.date}</Descriptions.Item>
              <Descriptions.Item label="优先级">
                <Tag color={priorityMap[detailRecord.priority]?.color}>{priorityMap[detailRecord.priority]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detailRecord.status]?.color}>{statusMap[detailRecord.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="指派人">{detailRecord.created_by_name || '自建'}</Descriptions.Item>
              {detailRecord.parent_title && (
                <Descriptions.Item label="上级任务">{detailRecord.parent_title}</Descriptions.Item>
              )}
              {detailRecord.done_at && (
                <Descriptions.Item label="完成时间">{dayjs(detailRecord.done_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              )}
            </Descriptions>

            {children.length > 0 && (
              <div style={{ background: '#fafafa', borderRadius: 8, padding: 12, border: '1px solid #f0f0f0' }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>子任务（{children.length}）</Text>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {children.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space>
                        <Tag color={priorityMap[c.priority]?.color}>{priorityMap[c.priority]?.label}</Tag>
                        <Text>{c.title}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{c.assigned_to_name}</Text>
                      </Space>
                      <Tag color={statusMap[c.status]?.color}>{statusMap[c.status]?.label}</Tag>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
