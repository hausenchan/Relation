import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, Space, Tag, message, Popconfirm, Card } from 'antd';
import { PlusOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';

const { Option } = Select;

const moduleMap = {
  strategies: { label: '策略', color: 'green' },
  dev_tasks: { label: '需求', color: 'blue' },
  leads: { label: '线索', color: 'orange' },
  goals: { label: '目标', color: 'purple' },
  weekly_reports: { label: '周报', color: 'cyan' },
};

export default function CrossTeamAccess() {
  const [data, setData] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
    fetchUsers();
    fetchTeams();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cross-team-access', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('加载失败');
      const list = await res.json();
      setData(list);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users/simple', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('加载用户失败');
      const list = await res.json();
      setUsers(list);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('加载团队失败');
      const list = await res.json();
      setTeams(list);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const { user_id, target_team_id, modules } = values;

      // 循环创建多个权限记录
      let successCount = 0;
      let failCount = 0;

      for (const module of modules) {
        try {
          const res = await fetch('/api/cross-team-access', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({ user_id, target_team_id, module }),
          });
          if (res.ok) {
            successCount++;
          } else {
            const data = await res.json();
            if (!data.error?.includes('已存在')) {
              failCount++;
            }
          }
        } catch (err) {
          failCount++;
        }
      }

      if (successCount > 0) {
        message.success(`成功创建 ${successCount} 条权限`);
      }
      if (failCount > 0) {
        message.warning(`${failCount} 条权限创建失败或已存在`);
      }

      setModalOpen(false);
      fetchData();
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/cross-team-access/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('删除失败');
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const columns = [
    {
      title: '用户',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '访问小组',
      dataIndex: 'team_name',
      key: 'team_name',
      width: 150,
      render: (text) => <Tag icon={<TeamOutlined />} color="blue">{text || '-'}</Tag>,
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      render: (val) => {
        const cfg = moduleMap[val] || { label: val, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '授权人',
      dataIndex: 'granted_by_name',
      key: 'granted_by_name',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val) => val?.replace('T', ' ').substring(0, 19) || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="跨团队访问权限管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增权限
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="新增跨团队访问权限"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={500}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="user_id" label="用户" rules={[{ required: true, message: '请选择用户' }]}>
            <Select
              placeholder="请选择用户"
              showSearch
              optionFilterProp="label"
              options={users.map(u => ({
                value: u.id,
                label: u.display_name || u.username || `用户${u.id}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="target_team_id" label="目标小组" rules={[{ required: true, message: '请选择小组' }]}>
            <Select placeholder="请选择小组">
              {teams.map(t => (
                <Option key={t.id} value={t.id}>{t.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="modules" label="模块" rules={[{ required: true, message: '请选择模块' }]}>
            <Select placeholder="请选择模块（可多选）" mode="multiple">
              {Object.entries(moduleMap).map(([key, val]) => (
                <Option key={key} value={key}>{val.label}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

