import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm,
  message, Typography, Checkbox, Divider, Tooltip
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { usersApi, teamsApi, projectGroupsApi } from '../api';
import { useAuth } from '../AuthContext';

const { Text } = Typography;
const { Option } = Select;

const roleMap = {
  admin:          { label: '超级管理员', color: 'red' },
  sales_director: { label: '商务总监',   color: 'purple' },
  leader:         { label: '组长',       color: 'volcano' },
  member:         { label: '普通成员',   color: 'blue' },
  readonly:       { label: '只读',       color: 'default' },
  guest:          { label: '按模块授权', color: 'orange' },
  ceo:            { label: 'CEO',        color: 'gold' },
  coo:            { label: 'COO',        color: 'gold' },
  cto:            { label: 'CTO',        color: 'gold' },
  cmo:            { label: 'CMO',        color: 'gold' },
};

const departmentOptions = [
  { value: 'commercial', label: '商务' },
  { value: 'operation', label: '产运' },
  { value: 'rd', label: '研发' },
];

const MODULE_LIST = [
  { key: 'persons',      label: '人脉管理' },
  { key: 'companies',    label: '公司研究' },
  { key: 'interactions', label: '互动记录' },
  { key: 'reminders',    label: '提醒事项' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetPwdTarget, setResetPwdTarget] = useState(null);
  const [form] = Form.useForm();
  const [resetPwdForm] = Form.useForm();
  const role = Form.useWatch('role', form);
  const department = Form.useWatch('department', form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, teamList, projectGroupList] = await Promise.all([usersApi.list(), teamsApi.list(), projectGroupsApi.list()]);
      setData(users);
      setTeams(teamList);
      setProjectGroups(projectGroupList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: 'member' });
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);

    // 如果用户有 team_id / team_ids，自动设置 department 为主小组的 department
    let userDepartment = r.department;
    const primaryTeamId = r.team_id || r.team_ids?.[0];
    if (primaryTeamId && !userDepartment) {
      const userTeam = teams.find(t => t.id === primaryTeamId);
      if (userTeam) {
        userDepartment = userTeam.department;
      }
    }

    form.setFieldsValue({
      display_name: r.display_name,
      role: r.role,
      department: userDepartment,
      team_ids: r.team_ids?.length ? r.team_ids : (r.team_id ? [r.team_id] : undefined),
      project_group_ids: r.project_group_ids || undefined,
      leader_id: r.leader_id || undefined,
      modulePerms: r.modulePerms?.reduce((acc, p) => {
        acc[p.module] = { can_read: p.can_read === 1, can_write: p.can_write === 1 };
        return acc;
      }, {}),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const modulePerms = values.role === 'guest'
      ? MODULE_LIST.map(m => ({
          module: m.key,
          can_read: values.modulePerms?.[m.key]?.can_read ? 1 : 0,
          can_write: values.modulePerms?.[m.key]?.can_write ? 1 : 0,
        }))
      : [];
    const payload = {
      ...values,
      modulePerms,
      team_ids: values.team_ids || [],
      project_group_ids: values.project_group_ids || [],
      leader_id: values.leader_id || null,
      department: values.department || null,
    };
    try {
      if (editing) {
        await usersApi.update(editing.id, payload);
        message.success('已更新');
      } else {
        await usersApi.create(payload);
        message.success('已创建');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await usersApi.delete(id);
      message.success('已删除');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const handleResetPwd = async (values) => {
    try {
      await usersApi.resetPassword(resetPwdTarget.id, { new_password: values.new_password });
      message.success(`已重置 ${resetPwdTarget.display_name || resetPwdTarget.username} 的密码`);
      setResetPwdTarget(null);
      resetPwdForm.resetFields();
    } catch (e) {
      message.error(e.response?.data?.error || '重置失败');
    }
  };

  // 根据部门过滤小组
  const filteredTeams = department ? teams.filter(t => t.department === department) : teams;

  const columns = [
    { title: '用户名', dataIndex: 'username', render: v => <Text strong>{v}</Text> },
    { title: '显示名', dataIndex: 'display_name', render: v => v || '-' },
    {
      title: '角色', dataIndex: 'role',
      render: v => { const m = roleMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : v; },
    },
    {
      title: '部门',
      dataIndex: 'department',
      render: v => {
        const opt = departmentOptions.find(o => o.value === v);
        return opt ? <Tag>{opt.label}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: '所属小组',
      dataIndex: 'team_names',
      render: (_, record) => {
        const names = record.team_names?.length
          ? record.team_names
          : (record.team_name ? [record.team_name] : []);
        return names.length
          ? names.map(name => <Tag key={name} style={{ marginBottom: 2 }}>{name}</Tag>)
          : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
      },
    },
    {
      title: '所属项目组',
      dataIndex: 'project_group_names',
      render: (values) => values?.length
        ? values.map(name => <Tag key={name} color="blue" style={{ marginBottom: 2 }}>{name}</Tag>)
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    },
    { title: '最近登录', dataIndex: 'last_login', render: v => v?.slice(0, 16) || '从未登录' },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          {r.id !== currentUser?.id && (
            <Tooltip title="重置该用户密码">
              <Button size="small" icon={<LockOutlined />} onClick={() => setResetPwdTarget(r)}>重置密码</Button>
            </Tooltip>
          )}
          {r.id !== currentUser?.id && (
            <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(r.id)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建用户</Button>
      </div>

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={false} />

      {/* 新建/编辑用户 Modal */}
      <Modal
        title={editing ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical" size="small">
          {!editing && (
            <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
              <Input prefix={<UserOutlined />} placeholder="登录用，不可重复" />
            </Form.Item>
          )}
          <Form.Item label="显示名" name="display_name">
            <Input placeholder="界面显示的姓名" />
          </Form.Item>
          {!editing && (
            <Form.Item label="初始密码" name="password" rules={[{ required: true, min: 6, message: '至少6位' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select onChange={() => { form.setFieldValue('team_ids', undefined); }}>
              {Object.entries(roleMap).map(([k, v]) => (
                <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="所属部门" name="department">
            <Select
              allowClear
              placeholder="请选择部门"
              options={departmentOptions}
              onChange={() => form.setFieldValue('team_ids', undefined)}
            />
          </Form.Item>

          <Form.Item label="所属小组" name="team_ids">
            <Select
              mode="multiple"
              showSearch
              placeholder={department ? '请选择小组' : '请先选择部门'}
              disabled={!department}
              optionFilterProp="label"
              options={filteredTeams.map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>

          <Form.Item label="所属项目组" name="project_group_ids">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择所属项目组"
              options={projectGroups.map(group => ({ value: group.id, label: group.name }))}
            />
          </Form.Item>

          {role === 'guest' && (
            <>
              <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>模块授权</Divider>
              {MODULE_LIST.map(m => (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 80, fontSize: 13 }}>{m.label}</div>
                  <Form.Item name={['modulePerms', m.key, 'can_read']} valuePropName="checked" noStyle>
                    <Checkbox style={{ marginRight: 16 }}>可读</Checkbox>
                  </Form.Item>
                  <Form.Item name={['modulePerms', m.key, 'can_write']} valuePropName="checked" noStyle>
                    <Checkbox>可写</Checkbox>
                  </Form.Item>
                </div>
              ))}
            </>
          )}
        </Form>
      </Modal>

      {/* 管理员重置他人密码 Modal */}
      <Modal
        title={`重置密码 - ${resetPwdTarget?.display_name || resetPwdTarget?.username}`}
        open={!!resetPwdTarget}
        onOk={() => resetPwdForm.submit()}
        onCancel={() => { setResetPwdTarget(null); resetPwdForm.resetFields(); }}
        okText="确认重置"
        cancelText="取消"
      >
        <Form form={resetPwdForm} layout="vertical" onFinish={handleResetPwd} style={{ marginTop: 16 }}>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '至少6位' }]}>
            <Input.Password placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
