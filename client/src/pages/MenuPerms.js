import React, { useEffect, useState } from 'react';
import {
  Card, Select, Tree, Button, Space, message, Spin, Typography, Divider, Tag
} from 'antd';
import { MenuOutlined, SaveOutlined } from '@ant-design/icons';
import { usersApi, menuPermsApi } from '../api';

const { Title, Text } = Typography;

// 与 App.js 中完全一致的菜单树定义（不含 admin-only 的系统管理）
const MENU_TREE = [
  {
    title: '商务部',
    key: 'biz',
    children: [
      {
        title: '人脉管理',
        key: 'crm',
        children: [
          { title: '工作台', key: '/' },
          { title: '人脉管理', key: '/persons' },
          { title: '互动记录', key: '/interactions' },
          { title: '提醒事项', key: '/reminders' },
        ],
      },
      {
        title: '商机管理',
        key: 'opportunity',
        children: [
          { title: '商机管理', key: '/opportunities' },
          { title: '待跟进任务', key: '/follow-up-tasks' },
        ],
      },
      {
        title: '商务任务管理',
        key: 'tasks',
        children: [
          { title: '我的任务', key: '/my-tasks' },
          { title: '任务看板', key: '/task-board' },
        ],
      },
      {
        title: '送礼管理',
        key: 'gift',
        children: [
          { title: '送礼计划', key: '/gift-plans' },
          { title: '审核与记录', key: '/gift-review' },
          { title: '礼品库', key: '/gifts' },
        ],
      },
      {
        title: '出差管理',
        key: 'trip',
        children: [
          { title: '出差申请', key: '/trips' },
          { title: '费用统计', key: '/trip-stats' },
        ],
      },
      { title: '公司研究', key: '/companies' },
    ],
  },
  {
    title: '产运部',
    key: 'product',
    children: [
      { title: '公司研究', key: '/companies' },
      { title: '商业化策略管理', key: '/biz-strategy' },
      { title: '增长目标管理', key: '/growth-goals' },
      { title: '计划管理', key: '/plans' },
    ],
  },
  {
    title: '研发部',
    key: 'rd',
    children: [
      { title: '需求管理', key: '/requirements' },
      { title: '周任务管理', key: '/weekly-tasks' },
      { title: '基建管理', key: '/infrastructure' },
    ],
  },
];

// 收集所有叶子节点的 key（以 / 开头的路由 key）
function collectLeafKeys(nodes) {
  const keys = [];
  for (const node of nodes) {
    if (node.children) {
      keys.push(...collectLeafKeys(node.children));
    } else {
      keys.push(node.key);
    }
  }
  return keys;
}

const ALL_LEAF_KEYS = collectLeafKeys(MENU_TREE);

const roleLabel = { admin: '管理员', leader: '组长', member: '成员', readonly: '只读', guest: '访客' };
const roleColor = { admin: 'red', leader: 'volcano', member: 'blue', readonly: 'default', guest: 'orange' };

export default function MenuPerms() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    usersApi.list().then(data => {
      // 排除 admin 自身（admin 不需要配置菜单权限）
      setUsers(data.filter(u => u.role !== 'admin'));
    }).catch(() => message.error('加载用户列表失败'));
  }, []);

  const loadPerms = (userId) => {
    setLoading(true);
    menuPermsApi.get(userId)
      .then(data => setCheckedKeys(data.menuKeys || []))
      .catch(() => message.error('加载权限失败'))
      .finally(() => setLoading(false));
  };

  const handleUserChange = (userId) => {
    setSelectedUserId(userId);
    setCheckedKeys([]);
    loadPerms(userId);
  };

  const handleCheck = (checked) => {
    // Tree onCheck 返回 { checked, halfChecked } 或 string[]，取叶子节点
    const keys = Array.isArray(checked) ? checked : checked.checked;
    // 只保留叶子节点 key（路由 key，以 / 开头）
    setCheckedKeys(keys.filter(k => ALL_LEAF_KEYS.includes(k)));
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await menuPermsApi.save(selectedUserId, checkedKeys);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAll = () => setCheckedKeys([...ALL_LEAF_KEYS]);
  const handleClearAll = () => setCheckedKeys([]);

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 4 }}>
        <MenuOutlined style={{ marginRight: 8 }} />
        菜单权限管理
      </Title>
      <Text type="secondary">超级管理员可为每位用户单独配置可见的菜单项，未勾选的菜单将对该用户隐藏。</Text>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {/* 用户选择 */}
          <div>
            <Text strong style={{ marginRight: 8 }}>选择用户：</Text>
            <Select
              placeholder="请选择要配置的用户"
              style={{ width: 260 }}
              onChange={handleUserChange}
              value={selectedUserId}
              options={users.map(u => ({
                value: u.id,
                label: (
                  <Space size={6}>
                    <span>{u.display_name || u.username}</span>
                    <Tag color={roleColor[u.role]} style={{ fontSize: 11, lineHeight: '18px' }}>
                      {roleLabel[u.role]}
                    </Tag>
                  </Space>
                ),
              }))}
            />
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* 菜单勾选 */}
          {selectedUser ? (
            <Spin spinning={loading}>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">
                  当前用户：<Text strong>{selectedUser.display_name || selectedUser.username}</Text>
                  &nbsp;
                  <Tag color={roleColor[selectedUser.role]}>{roleLabel[selectedUser.role]}</Tag>
                </Text>
                <Space style={{ float: 'right' }}>
                  <Button size="small" onClick={handleSelectAll}>全选</Button>
                  <Button size="small" onClick={handleClearAll}>清空</Button>
                </Space>
              </div>

              <Tree
                checkable
                checkStrictly={false}
                treeData={MENU_TREE}
                checkedKeys={checkedKeys}
                onCheck={handleCheck}
                defaultExpandAll
                style={{ background: '#fafafa', padding: 12, borderRadius: 6, border: '1px solid #f0f0f0' }}
              />

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Text type="secondary" style={{ marginRight: 16 }}>
                  已勾选 {checkedKeys.length} / {ALL_LEAF_KEYS.length} 个菜单项
                </Text>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSave}
                >
                  保存配置
                </Button>
              </div>
            </Spin>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#bbb' }}>
              请先在上方选择一个用户
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
}
