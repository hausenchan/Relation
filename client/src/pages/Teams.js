import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm, message, Card, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import { teamsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';

const { Title } = Typography;

const departmentOptions = [
  { value: 'commercial', label: '商务' },
  { value: 'operation', label: '产运' },
  { value: 'rd', label: '研发' },
];

const departmentLabel = { commercial: '商务', operation: '产运', rd: '研发' };
const departmentColor = { commercial: 'blue', operation: 'green', rd: 'purple' };

export default function Teams() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  if (user?.role !== 'admin') {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>仅管理员可访问</div>;
  }

  const load = async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([teamsApi.list(), usersApi.list()]);
      setTeams(t);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({ name: record.name, department: record.department, leader_id: record.leader_id });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    try {
      if (editing) {
        await teamsApi.update(editing.id, values);
        message.success('更新成功');
      } else {
        await teamsApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await teamsApi.delete(id);
      message.success('删除成功');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: '小组名称',
      dataIndex: 'name',
      render: (text) => <Space><TeamOutlined />{text}</Space>,
    },
    {
      title: '所属部门',
      dataIndex: 'department',
      render: (v) => <Tag color={departmentColor[v]}>{departmentLabel[v] || v}</Tag>,
    },
    {
      title: '组长',
      dataIndex: 'leader_name',
      render: (v) => v || <span style={{ color: '#aaa' }}>未设置</span>,
    },
    {
      title: '成员数',
      key: 'members',
      render: (_, record) => {
        const count = users.filter(u => u.team_id === record.id).length;
        return count;
      },
    },
    {
      title: '成员列表',
      key: 'member_list',
      render: (_, record) => {
        const members = users.filter(u => u.team_id === record.id);
        return members.length > 0
          ? members.map(m => <Tag key={m.id} style={{ marginBottom: 2 }}>{m.display_name || m.username}</Tag>)
          : <span style={{ color: '#aaa' }}>暂无成员</span>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除该小组？删除后成员的小组归属将清空。" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 按部门分组显示
  const departments = ['commercial', 'operation', 'rd'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>小组管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增小组</Button>
      </div>

      {departments.map(dept => {
        const deptTeams = teams.filter(t => t.department === dept);
        if (deptTeams.length === 0) return null;
        return (
          <Card
            key={dept}
            title={<Space><Tag color={departmentColor[dept]}>{departmentLabel[dept]}部</Tag></Space>}
            style={{ marginBottom: 16 }}
            size="small"
          >
            <Table
              rowKey="id"
              dataSource={deptTeams}
              columns={columns}
              pagination={false}
              size="small"
              loading={loading}
            />
          </Card>
        );
      })}

      {teams.length === 0 && !loading && (
        <Card>
          <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>暂无小组，点击右上角新增</div>
        </Card>
      )}

      <Modal
        title={editing ? '编辑小组' : '新增小组'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="小组名称" rules={[{ required: true, message: '请输入小组名称' }]}>
            <Input placeholder="如：商务1组、商务2组" />
          </Form.Item>
          <Form.Item name="department" label="所属部门" rules={[{ required: true, message: '请选择部门' }]}>
            <Select options={departmentOptions} placeholder="请选择部门" />
          </Form.Item>
          <Form.Item name="leader_id" label="组长">
            <Select
              allowClear
              showSearch
              placeholder="请选择组长（可不设置）"
              optionFilterProp="label"
              options={users
                .filter(u => ['leader', 'sales_director', 'member'].includes(u.role))
                .map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
