import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Badge, ConfigProvider, theme, Space, Avatar, Dropdown, Typography, Modal, Form, Input, message } from 'antd';
import {
  DashboardOutlined, TeamOutlined, MessageOutlined, BellOutlined,
  AppstoreOutlined, BankOutlined, UserOutlined, LogoutOutlined, SettingOutlined,
  GiftOutlined, CalendarOutlined, AuditOutlined, CarOutlined, RiseOutlined,
  ShopOutlined, RocketOutlined, CodeOutlined, FundOutlined, ScheduleOutlined,
  BulbOutlined, CheckSquareOutlined, ClusterOutlined, ApartmentOutlined, LockOutlined,
  ThunderboltOutlined, MenuOutlined
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
import Teams from './pages/Teams';
import Gifts from './pages/Gifts';
import GiftPlans from './pages/GiftPlans';
import GiftReview from './pages/GiftReview';
import Trips from './pages/Trips';
import TripStats from './pages/TripStats';
import MenuPerms from './pages/MenuPerms';
import Opportunities from './pages/Opportunities';
import FollowUpTasks from './pages/FollowUpTasks';
import MyTasks from './pages/MyTasks';
import TaskBoard from './pages/TaskBoard';
import Budgets from './pages/Budgets';
import CompetitorResearch from './pages/CompetitorResearch';
import { remindersApi, giftRequestsApi, tripsApi, authApi, followUpTasksApi, tasksApi } from './api';

const { Sider, Content } = Layout;

const roleLabel = { admin: '管理员', leader: '组长', member: '成员', readonly: '只读', guest: '访客', sales_director: '商务总监' };
const roleColor = { admin: '#ff4d4f', leader: '#fa541c', member: '#1677ff', readonly: '#888', guest: '#fa8c16', sales_director: '#722ed1' };

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
  const { user, logout, canAccessModule, canAccessMenu } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingGiftCount, setPendingGiftCount] = useState(0);
  const [pendingTripCount, setPendingTripCount] = useState(0);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [todayTaskCount, setTodayTaskCount] = useState(0);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdForm] = Form.useForm();
  const [pwdLoading, setPwdLoading] = useState(false);

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
    if (['leader', 'admin', 'sales_director'].includes(user.role)) {
      giftRequestsApi.list({ status: 'pending' }).then(r => setPendingGiftCount(r.length)).catch(() => {});
      tripsApi.list({ status: 'pending' }).then(r => setPendingTripCount(r.length)).catch(() => {});
    }
    // 待跟进任务数量（所有角色）
    followUpTasksApi.count().then(r => setFollowUpCount(r.count)).catch(() => {});
    // 今日未完成商务任务数（所有商务角色）
    tasksApi.count().then(r => setTodayTaskCount(r.count)).catch(() => {});
  }, [location, user]);

  const handleChangePwd = async (values) => {
    setPwdLoading(true);
    try {
      await authApi.changePassword({ old_password: values.old_password, new_password: values.new_password });
      message.success('密码修改成功');
      setPwdModalOpen(false);
      pwdForm.resetFields();
    } catch (e) {
      message.error(e.response?.data?.error || '修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  const selectedKey = '/' + location.pathname.split('/')[1];

  // 人脉管理（商务部专属）
  const crmChildren = [
    canAccessMenu('/') && { key: '/', icon: <DashboardOutlined />, label: <Link to="/">工作台</Link> },
    canAccessMenu('/persons') && canAccessModule('persons') && { key: '/persons', icon: <TeamOutlined />, label: <Link to="/persons">人脉管理</Link> },
    canAccessMenu('/interactions') && canAccessModule('interactions') && { key: '/interactions', icon: <MessageOutlined />, label: <Link to="/interactions">互动记录</Link> },
    canAccessMenu('/reminders') && canAccessModule('reminders') && {
      key: '/reminders', icon: <BellOutlined />,
      label: (
        <span>
          <Link to="/reminders">提醒事项</Link>
          {pendingCount > 0 && <Badge count={pendingCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
  ].filter(Boolean);

  // 商机管理（商务部专属）
  const opportunityChildren = [
    canAccessMenu('/opportunities') && { key: '/opportunities', icon: <RiseOutlined />, label: <Link to="/opportunities">商机管理</Link> },
    {
      key: '/follow-up-tasks', icon: <ThunderboltOutlined />,
      label: (
        <span>
          <Link to="/follow-up-tasks">待跟进任务</Link>
          {followUpCount > 0 && <Badge count={followUpCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
  ].filter(Boolean);

  // 商务任务管理（商务部专属）
  const taskChildren = [
    {
      key: '/my-tasks', icon: <CheckSquareOutlined />,
      label: (
        <span>
          <Link to="/my-tasks">我的任务</Link>
          {todayTaskCount > 0 && <Badge count={todayTaskCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    ['leader', 'sales_director', 'admin'].includes(user?.role) && {
      key: '/task-board', icon: <ApartmentOutlined />,
      label: <Link to="/task-board">任务看板</Link>,
    },
  ].filter(Boolean);

  // 送礼管理（商务部专属）
  const giftChildren = [
    canAccessMenu('/gift-plans') && { key: '/gift-plans', icon: <CalendarOutlined />, label: <Link to="/gift-plans">送礼计划</Link> },
    canAccessMenu('/gift-review') && {
      key: '/gift-review', icon: <AuditOutlined />,
      label: (
        <span>
          <Link to="/gift-review">审核与记录</Link>
          {pendingGiftCount > 0 && <Badge count={pendingGiftCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    canAccessMenu('/gifts') && (user?.role === 'admin') && { key: '/gifts', icon: <GiftOutlined />, label: <Link to="/gifts">礼品库</Link> },
  ].filter(Boolean);

  // 出差管理（商务部专属）
  const tripChildren = [
    canAccessMenu('/trips') && {
      key: '/trips', icon: <CarOutlined />,
      label: (
        <span>
          <Link to="/trips">出差申请</Link>
          {pendingTripCount > 0 && <Badge count={pendingTripCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    canAccessMenu('/trip-stats') && { key: '/trip-stats', icon: <RiseOutlined />, label: <Link to="/trip-stats">费用统计</Link> },
  ].filter(Boolean);

  // 产运部功能
  const productChildren = [
    canAccessMenu('/companies') && canAccessModule('companies') && { key: '/companies', icon: <BankOutlined />, label: <Link to="/companies">公司研究</Link> },
    canAccessMenu('/competitor-research') && canAccessModule('companies') && { key: '/competitor-research', icon: <RiseOutlined />, label: <Link to="/competitor-research">竞品研究记录</Link> },
    canAccessMenu('/biz-strategy') && { key: '/biz-strategy', icon: <FundOutlined />, label: <Link to="/biz-strategy">商业化策略管理</Link> },
    canAccessMenu('/growth-goals') && { key: '/growth-goals', icon: <RiseOutlined />, label: <Link to="/growth-goals">增长目标管理</Link> },
    canAccessMenu('/plans') && { key: '/plans', icon: <ScheduleOutlined />, label: <Link to="/plans">计划管理</Link> },
  ].filter(Boolean);

  // 研发部功能
  const rdChildren = [
    canAccessMenu('/requirements') && { key: '/requirements', icon: <BulbOutlined />, label: <Link to="/requirements">需求管理</Link> },
    canAccessMenu('/weekly-tasks') && { key: '/weekly-tasks', icon: <CheckSquareOutlined />, label: <Link to="/weekly-tasks">周任务管理</Link> },
    canAccessMenu('/infrastructure') && { key: '/infrastructure', icon: <ClusterOutlined />, label: <Link to="/infrastructure">基建管理</Link> },
  ].filter(Boolean);

  const menuItems = [
    // 商务部
    (crmChildren.length > 0 || opportunityChildren.length > 0 || taskChildren.length > 0 || giftChildren.length > 0 || tripChildren.length > 0 || canAccessMenu('/companies') || canAccessMenu('/budgets')) && {
      key: 'biz', icon: <ShopOutlined />, label: '商务部',
      children: [
        crmChildren.length > 0 && { key: 'crm', icon: <AppstoreOutlined />, label: '人脉管理', children: crmChildren },
        opportunityChildren.length > 0 && { key: 'opportunity', icon: <RiseOutlined />, label: '商机管理', children: opportunityChildren },
        taskChildren.length > 0 && { key: 'tasks', icon: <CheckSquareOutlined />, label: '商务任务管理', children: taskChildren },
        canAccessMenu('/budgets') && { key: '/budgets', icon: <FundOutlined />, label: <Link to="/budgets">预算管理</Link> },
        giftChildren.length > 0 && { key: 'gift', icon: <GiftOutlined />, label: '送礼管理', children: giftChildren },
        tripChildren.length > 0 && { key: 'trip', icon: <CarOutlined />, label: '出差管理', children: tripChildren },
        canAccessMenu('/companies') && canAccessModule('companies') && { key: '/companies', icon: <BankOutlined />, label: <Link to="/companies">公司研究</Link> },
      ].filter(Boolean),
    },
    // 产运部
    productChildren.length > 0 && {
      key: 'product', icon: <RocketOutlined />, label: '产运部',
      children: productChildren,
    },
    // 研发部
    rdChildren.length > 0 && {
      key: 'rd', icon: <CodeOutlined />, label: '研发部',
      children: rdChildren,
    },
    // 系统管理
    user?.role === 'admin' && {
      key: 'system', icon: <SettingOutlined />, label: '系统管理',
      children: [
        { key: '/users', icon: <UserOutlined />, label: <Link to="/users">用户管理</Link> },
        { key: '/teams', icon: <TeamOutlined />, label: <Link to="/teams">小组管理</Link> },
        { key: '/menu-perms', icon: <MenuOutlined />, label: <Link to="/menu-perms">菜单权限管理</Link> },
      ],
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
    { key: 'change-pwd', icon: <LockOutlined />, label: '修改密码' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenu = ({ key }) => {
    if (key === 'logout') logout().then(() => { window.location.href = '/login'; });
    if (key === 'change-pwd') setPwdModalOpen(true);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); }}
        onOk={() => pwdForm.submit()}
        confirmLoading={pwdLoading}
        okText="确认修改"
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePwd} style={{ marginTop: 16 }}>
          <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password placeholder="请输入当前密码" />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '新密码至少6位' }]}>
            <Input.Password placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item name="confirm_password" label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>

      <Sider breakpoint="lg" collapsedWidth="0" style={{ background: '#0a0a1a' }}>
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 16px', gap: 10,
        }}>
          {/* 迷你 Logo SVG */}
          <svg width="28" height="28" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="slg1" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ff6a00" />
                <stop offset="50%" stopColor="#ee0979" />
                <stop offset="100%" stopColor="#1677ff" />
              </linearGradient>
            </defs>
            <circle cx="36" cy="36" r="34" fill="url(#slg1)" />
            <path d="M41 10 L24 38 L34 38 L31 62 L50 32 L39 32 Z" fill="white" opacity="0.95" />
          </svg>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: 2, lineHeight: '18px' }}>幂动小智</div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, lineHeight: '13px', background: 'linear-gradient(90deg,#ff6a00,#ee0979)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI赋能 · 协同提效</div>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['biz', 'crm', 'opportunity', 'tasks', 'gift', 'trip', 'product', 'rd', 'system']}
          items={menuItems}
          style={{ marginTop: 8, background: '#0a0a1a' }}
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
            <Route path="/competitor-research" element={<PrivateRoute module="companies"><CompetitorResearch /></PrivateRoute>} />
            <Route path="/gifts" element={<PrivateRoute><Gifts /></PrivateRoute>} />
            <Route path="/gift-plans" element={<PrivateRoute><GiftPlans /></PrivateRoute>} />
            <Route path="/gift-review" element={<PrivateRoute><GiftReview /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute><Users /></PrivateRoute>} />
            <Route path="/teams" element={<PrivateRoute><Teams /></PrivateRoute>} />
            <Route path="/trips" element={<PrivateRoute><Trips /></PrivateRoute>} />
            <Route path="/trip-stats" element={<PrivateRoute><TripStats /></PrivateRoute>} />
            <Route path="/menu-perms" element={<PrivateRoute><MenuPerms /></PrivateRoute>} />
            <Route path="/opportunities" element={<PrivateRoute><Opportunities /></PrivateRoute>} />
            <Route path="/follow-up-tasks" element={<PrivateRoute><FollowUpTasks /></PrivateRoute>} />
            <Route path="/my-tasks" element={<PrivateRoute><MyTasks /></PrivateRoute>} />
            <Route path="/task-board" element={<PrivateRoute><TaskBoard /></PrivateRoute>} />
            <Route path="/budgets" element={<PrivateRoute><Budgets /></PrivateRoute>} />
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
