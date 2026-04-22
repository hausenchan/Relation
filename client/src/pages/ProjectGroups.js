import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm, message, Card } from 'antd';
import { AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { projectGroupsApi, usersApi } from '../api';
import { useAuth } from '../AuthContext';

const statusMap = {
  active: { label: '启用中', color: 'green' },
  inactive: { label: '已停用', color: 'default' },
};

export default function ProjectGroups() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
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
      const [groupList, userList] = await Promise.all([projectGroupsApi.list(), usersApi.listSimple()]);
      setRows(groupList);
      setUsers(userList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active' });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await projectGroupsApi.update(editing.id, values);
        message.success('更新成功');
      } else {
        await projectGroupsApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await projectGroupsApi.delete(id);
      message.success('删除成功');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: '项目组名称',
      dataIndex: 'name',
      render: (value) => <Space><AppstoreOutlined />{value}</Space>,
    },
    {
      title: '编码',
      dataIndex: 'code',
      render: (value) => value || '-',
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      render: (value) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value) => {
        const config = statusMap[value] || { label: value, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      render: (value) => value || '-',
    },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除该项目组？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增项目组</Button>
      </div>

      <Card>
        <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} />
      </Card>

      <Modal
        title={editing ? '编辑项目组' : '新增项目组'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="项目组名称" rules={[{ required: true, message: '请输入项目组名称' }]}>
            <Input placeholder="如：国内项目、海外项目" />
          </Form.Item>
          <Form.Item name="code" label="项目组编码">
            <Input placeholder="如：domestic、overseas" />
          </Form.Item>
          <Form.Item name="owner_id" label="负责人">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={users.map(item => ({ value: item.id, label: item.display_name || item.username }))}
              placeholder="请选择项目组负责人"
            />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { value: 'active', label: '启用中' },
                { value: 'inactive', label: '已停用' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} placeholder="请输入项目组说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
