import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm,
  message, Typography, Checkbox, Divider, Tooltip
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, UserOutlined } from '@ant-design/icons';
import { usersApi, authApi } from '../api';
import { useAuth } from '../AuthContext';

const { Title, Text } = Typography;
const { Option } = Select;

const roleMap = {
  admin:    { label: '超级管理员', color: 'red' },
  member:   { label: '普通成员',   color: 'blue' },
  readonly: { label: '只读访客',   color: 'default' },
  guest:    { label: '按模块授权', color: 'orange' },
};

const MODULE_LIST = [
  { key: 'persons',      label: '人脉管理' },
  { key: 'companies',    label: '公司研究' },
  { key: 'interactions', label: '互动记录' },
  { key: 'reminders',    label: '提醒事项' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const role = Form.useWatch('role', form);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await usersApi.list();
    setData(res);
    setLoading(false);
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
    form.setFieldsValue({
      display_name: r.display_name,
      role: r.role,
      modulePerms: r.modulePerms?.reduce((acc, p) => {
        acc[p.module] = { can_read: p.can_read === 1, can_write: p.can_write === 1 };
        return acc;
      }, {}),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const modulePerms = role === 'guest'
      ? MODULE_LIST.map(m => ({
          module: m.key,
          can_read: values.modulePerms?.[m.key]?.can_read ? 1 : 0,
          can_write: values.modulePerms?.[m.key]?.can_write ? 1 : 0,
        }))
      : [];
    const payload = { ...values, modulePerms };
    if (editing) {
      await usersApi.update(editing.id, payload);
      message.success('已更新');
    } else {
      await usersApi.create(payload);
      message.success('已创建');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await usersApi.delete(id);
    message.success('已删除');
    load();
  };

  const handleChangePassword = async (values) => {
    try {
      await authApi.changePassword({ old_password: values.old_password, new_password: values.new_password });
      message.success('密码修改成功');
      setPwdModalOpen(false);
      pwdForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.error || '修改失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', render: v => <Text strong>{v}</Text> },
    { title: '显示名', dataIndex: 'display_name', render: v => v || '-' },
    {
      title: '角色', dataIndex: 'role',
      render: v => { const m = roleMap[v]; return m ? <Tag color={m.color}>{m.label}</Tag> : v; },
    },
    {
      title: '模块权限', dataIndex: 'modulePerms',
      render: (perms, r) => {
        if (r.role !== 'guest') return <Text type="secondary" style={{ fontSize: 12 }}>按角色</Text>;
        return (
          <Space size={2} wrap>
            {perms?.filter(p => p.can_read).map(p => (
              <Tag key={p.module} color={p.can_write ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                {MODULE_LIST.find(m => m.key === p.module)?.label}
                {p.can_write ? '（读写）' : '（只读）'}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    { title: '最近登录', dataIndex: 'last_login', render: v => v?.slice(0, 16) || '从未登录' },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          {r.id === currentUser?.id && (
            <Tooltip title="修改自己的密码">
              <Button size="small" icon={<KeyOutlined />} onClick={() => setPwdModalOpen(true)}>改密码</Button>
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
        <Title level={4} style={{ margin: 0 }}><UserOutlined /> 用户管理</Title>
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
            <Select>
              {Object.entries(roleMap).map(([k, v]) => (
                <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
              ))}
            </Select>
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

      {/* 修改密码 Modal */}
      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onOk={() => pwdForm.submit()}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); }}
        okText="确认修改"
        cancelText="取消"
      >
        <Form form={pwdForm} layout="vertical" size="small" onFinish={handleChangePassword}>
          <Form.Item label="旧密码" name="old_password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="新密码" name="new_password" rules={[{ required: true, min: 6, message: '至少6位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirm_password"
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject('两次密码不一致');
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
