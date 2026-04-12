import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Badge, ConfigProvider, theme, Space, Avatar, Dropdown, Typography } from 'antd';
import {
  DashboardOutlined, TeamOutlined, MessageOutlined, BellOutlined,
  AppstoreOutlined, BankOutlined, UserOutlined, LogoutOutlined, KeyOutlined, SettingOutlined
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Persons from './pages/Persons';
import Interactions from './pages/Interactions';
import Reminders from './pages/Reminders';
import Companies from './pages/Companies';
import Users from './pages/Users';
import { remindersApi } from './api';

const { Sider, Content } = Layout;
const { Text } = Typography;

const roleLabel = { admin: '管理员', member: '成员', readonly: '只读', guest: '访客' };
const roleColor = { admin: '#ff4d4f', member: '#1677ff', readonly: '#888', guest: '#fa8c16' };

// 路由守卫
function PrivateRoute({ children, module }) {
  const { user, loading, canAccessModule } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (module && !canAccessModule(module)) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div>您没有访问该模块的权限，请联系管理员</div>
      </div>
    );
  }
  return children;
}

function AppLayout() {
  const location = useLocation();
  const { user, logout, canAccessModule } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    remindersApi.list({ done: 0 }).then(r => {
      const upcoming = r.filter(item => {
        const d = new Date(item.remind_date);
        const today = new Date();
        const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
        return diff <= 7;
      });
      setPendingCount(upcoming.length);
    }).catch(() => {});
  }, [location, user]);

  const selectedKey = '/' + location.pathname.split('/')[1];

  // 按权限构建菜单
  const crmChildren = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">工作台</Link> },
    canAccessModule('persons') && { key: '/persons', icon: <TeamOutlined />, label: <Link to="/persons">人脉管理</Link> },
    canAccessModule('interactions') && { key: '/interactions', icon: <MessageOutlined />, label: <Link to="/interactions">互动记录</Link> },
    canAccessModule('reminders') && {
      key: '/reminders', icon: <BellOutlined />,
      label: (
        <span>
          <Link to="/reminders">提醒事项</Link>
          {pendingCount > 0 && <Badge count={pendingCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
  ].filter(Boolean);

  const menuItems = [
    { key: 'crm', icon: <AppstoreOutlined />, label: '人脉管理助手', children: crmChildren },
    canAccessModule('companies') && {
      key: 'research', icon: <BankOutlined />, label: '公司研究助手',
      children: [{ key: '/companies', icon: <BankOutlined />, label: <Link to="/companies">公司研究</Link> }],
    },
    user?.role === 'admin' && {
      key: 'system', icon: <SettingOutlined />, label: '系统管理',
      children: [{ key: '/users', icon: <UserOutlined />, label: <Link to="/users">用户管理</Link> }],
    },
  ].filter(Boolean);

  const userMenuItems = [
    {
      key: 'info', disabled: true,
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600 }}>{user?.display_name || user?.username}</div>
          <div style={{ fontSize: 11, color: roleColor[user?.role] }}>{roleLabel[user?.role]}</div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenu = ({ key }) => {
    if (key === 'logout') logout().then(() => { window.location.href = '/login'; });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" style={{ background: '#001529' }}>
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 'bold', fontSize: 16,
          borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 16px',
        }}>
          增长中台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['crm', 'research', 'system']}
          items={menuItems}
          style={{ marginTop: 8 }}
        />

        {/* 底部用户信息 */}
        <div style={{ position: 'absolute', bottom: 0, width: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }} placement="topLeft" trigger={['click']}>
            <Space style={{ cursor: 'pointer', width: '100%' }}>
              <Avatar size={30} style={{ background: roleColor[user?.role], fontSize: 13 }}>
                {(user?.display_name || user?.username || '?')[0].toUpperCase()}
              </Avatar>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ color: '#fff', fontSize: 13, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.display_name || user?.username}
                </div>
                <div style={{ fontSize: 11, color: roleColor[user?.role], lineHeight: '14px' }}>
                  {roleLabel[user?.role]}
                </div>
              </div>
            </Space>
          </Dropdown>
        </div>
      </Sider>

      <Layout>
        <Content style={{ margin: '16px', padding: '16px', background: '#fff', borderRadius: 8, minHeight: 280 }}>
          <Routes>
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/persons" element={<PrivateRoute module="persons"><Persons /></PrivateRoute>} />
            <Route path="/interactions" element={<PrivateRoute module="interactions"><Interactions /></PrivateRoute>} />
            <Route path="/reminders" element={<PrivateRoute module="reminders"><Reminders /></PrivateRoute>} />
            <Route path="/companies" element={<PrivateRoute module="companies"><Companies /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute><Users /></PrivateRoute>} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginGuard />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

// 已登录则跳首页
function LoginGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}
