import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Badge, ConfigProvider, theme, Space, Avatar, Dropdown, Modal, Form, Input, message, Watermark, Drawer, Grid } from 'antd';
import {
  DashboardOutlined, TeamOutlined, MessageOutlined, BellOutlined,
  BankOutlined, UserOutlined, LogoutOutlined, SettingOutlined,
  GiftOutlined, CalendarOutlined, AuditOutlined, CarOutlined, RiseOutlined,
  ApartmentOutlined, LockOutlined, ThunderboltOutlined, MenuOutlined,
  CheckSquareOutlined, FileTextOutlined, AimOutlined, FunnelPlotOutlined,
  BranchesOutlined, SolutionOutlined, ToolOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined,
  AppstoreOutlined, HistoryOutlined
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './AuthContext';

const ADMIN_ROLES = new Set(['admin', 'ceo', 'coo', 'cto', 'cmo']);
const isAdmin = (user) => ADMIN_ROLES.has(user?.role || user) || ADMIN_ROLES.has(user?.executive_role);

// ── Design system constants ──────────────────────────
const DS = {
  sidebar: { bg: '#0f0f23', width: 180, collapsedWidth: 64, accentColor: '#a5b4fc' },
  header: { height: 56, bg: '#ffffff', border: '#e8e8ed' },
  content: { bg: '#f0f2f5', padding: 24 },
};

const appTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#4F46E5',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorInfo: '#3B82F6',
    colorBgLayout: '#f0f2f5',
    colorBgContainer: '#ffffff',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif",
    fontSize: 14,
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
    boxShadowSecondary: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
    controlHeight: 36,
    controlHeightLG: 44,
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(79,70,229,0.25)',
      darkItemHoverBg: 'rgba(255,255,255,0.06)',
      darkItemSelectedColor: '#a5b4fc',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: 'rgba(255,255,255,0.95)',
      darkGroupTitleColor: 'rgba(255,255,255,0.35)',
      itemMarginInline: 4,
      itemPaddingInline: 8,
      itemBorderRadius: 8,
    },
    Card: { paddingLG: 20, borderRadiusLG: 12 },
    Table: { headerBg: '#fafafa', headerColor: '#374151', rowHoverBg: '#f8fafc', borderRadius: 8 },
    Button: { borderRadius: 8, controlHeight: 36 },
    Input: { borderRadius: 8 },
    Select: { borderRadius: 8 },
    Modal: { borderRadiusLG: 16 },
    Tabs: { inkBarColor: '#4F46E5', itemActiveColor: '#4F46E5', itemSelectedColor: '#4F46E5', itemHoverColor: '#6366F1' },
  },
};

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Persons from './pages/Persons';
import Interactions from './pages/Interactions';
import Reminders from './pages/Reminders';
import Companies from './pages/Companies';
import Users from './pages/Users';
import Teams from './pages/Teams';
import ProjectGroups from './pages/ProjectGroups';
import Gifts from './pages/Gifts';
import GiftPlans from './pages/GiftPlans';
import GiftReview from './pages/GiftReview';
import Trips from './pages/Trips';
import TripStats from './pages/TripStats';
import Budgets from './pages/Budgets';
import MenuPerms from './pages/MenuPerms';
import CrossTeamAccess from './pages/CrossTeamAccess';
import OperationLogs from './pages/OperationLogs';
import MobileTaskCenter from './pages/MobileTaskCenter';
import FollowUpTasks from './pages/FollowUpTasks';
import MyTasks from './pages/MyTasks';
import TaskBoard from './pages/TaskBoard';
import Goals from './pages/Goals';
import WeeklyReports from './pages/WeeklyReports';
import Leads from './pages/Leads';
import Strategies from './pages/Strategies';
import DevTasks from './pages/DevTasks';
import ProductAssets from './pages/ProductAssets';
import CompanySubjects from './pages/CompanySubjects';
import Documents from './pages/Documents';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import ExecutiveTalents from './pages/ExecutiveTalents';
import ExecutiveDynamics from './pages/ExecutiveDynamics';
import ExecutiveCustomers from './pages/ExecutiveCustomers';
import StrategicMeeting from './pages/StrategicMeeting';
import OperationalMeeting from './pages/OperationalMeeting';
import RecruitRadar from './pages/RecruitRadar';
import RecruitRadarConfig from './pages/RecruitRadarConfig';
import NotificationBell from './components/NotificationBell';
import { remindersApi, giftRequestsApi, tripsApi, authApi, followUpTasksApi, tasksApi } from './api';
import { buildLoginPath, getAuthorizedRedirectPath, getLocationPath, getSafeInternalPath } from './utils/redirect';

const roleLabel = { admin: '管理员', leader: '组长', member: '成员', readonly: '只读', guest: '访客', sales_director: '商务总监' };
const roleColor = { admin: '#EF4444', leader: '#F97316', member: '#4F46E5', readonly: '#9CA3AF', guest: '#F59E0B', sales_director: '#8B5CF6' };

// 路由守卫
function PrivateRoute({ children, module, executiveOnly, adminOnly }) {
  const location = useLocation();
  const { user, loading, canAccessModule, isExecutive } = useAuth();
  if (loading) return null;
  if (!user) {
    const redirectPath = getLocationPath(location);
    return <Navigate to={buildLoginPath(redirectPath)} replace state={{ from: location }} />;
  }
  if (adminOnly && user.role !== 'admin') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div>该页面仅限管理员访问</div>
      </div>
    );
  }
  if (executiveOnly && !isExecutive()) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div>该页面仅限老板访问</div>
      </div>
    );
  }
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

function MobileOverlayBackHandler({ enabled }) {
  const overlayCountRef = React.useRef(0);
  const handlingPopRef = React.useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    const isVisibleElement = (node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const getVisibleOverlays = () => {
      const modals = Array.from(document.querySelectorAll('.ant-modal-wrap'))
        .filter(isVisibleElement);
      const drawers = Array.from(document.querySelectorAll('.ant-drawer:not(.app-mobile-menu-drawer)'))
        .filter(node => node.classList.contains('ant-drawer-open') && isVisibleElement(node));
      return [...modals, ...drawers];
    };

    const closeTopOverlay = () => {
      const overlays = getVisibleOverlays();
      const top = overlays[overlays.length - 1];
      const closeButton = top?.querySelector(
        '.ant-modal-close, .ant-drawer-close, .ant-modal-confirm-btns .ant-btn-default, .ant-modal-footer .ant-btn-default'
      );
      if (closeButton) {
        closeButton.click();
        return true;
      }
      return false;
    };

    const syncOverlayHistory = () => {
      const nextCount = getVisibleOverlays().length;
      const prevCount = overlayCountRef.current;

      if (nextCount > prevCount) {
        for (let i = prevCount; i < nextCount; i += 1) {
          window.history.pushState(
            { ...(window.history.state || {}), __mobileOverlayBack: true },
            '',
            window.location.href
          );
        }
      } else if (nextCount < prevCount && !handlingPopRef.current && window.history.state?.__mobileOverlayBack) {
        window.history.back();
      }

      overlayCountRef.current = nextCount;
    };

    const onPopState = () => {
      if (getVisibleOverlays().length === 0) return;
      handlingPopRef.current = true;
      closeTopOverlay();
      window.setTimeout(() => {
        overlayCountRef.current = getVisibleOverlays().length;
        handlingPopRef.current = false;
      }, 80);
    };

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(syncOverlayHistory);
    });

    overlayCountRef.current = getVisibleOverlays().length;
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('popstate', onPopState);

    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', onPopState);
    };
  }, [enabled]);

  return null;
}

function AppLayout() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const location = useLocation();
  const { user, logout, canAccessModule, canAccessMenu, isExecutive } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingGiftCount, setPendingGiftCount] = useState(0);
  const [pendingTripCount, setPendingTripCount] = useState(0);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [todayTaskCount, setTodayTaskCount] = useState(0);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdForm] = Form.useForm();
  const [pwdLoading, setPwdLoading] = useState(false);
  const menuScrollRef = React.useRef(null);
  const [collapsed, setCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [menuOpenKeys, setMenuOpenKeys] = useState(['goal-plan', 'biz-flow', 'asset-mgmt', 'biz-coop', 'team-mgmt', 'system']);

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isMobile) {
      setCollapsed(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileMenuOpen) return undefined;

    const openedPath = window.location.pathname;
    const marker = { ...(window.history.state || {}), __mobileMenuBack: true };
    window.history.pushState(marker, '', window.location.href);

    const onPopState = () => {
      setMobileMenuOpen(false);
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (window.location.pathname === openedPath && window.history.state?.__mobileMenuBack) {
        window.history.back();
      }
    };
  }, [isMobile, mobileMenuOpen]);

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
  const desktopSiderWidth = isMobile ? 0 : (collapsed ? DS.sidebar.collapsedWidth : DS.sidebar.width);

  // 路由 → 页面标题映射
  const pageTitleMap = {
    '/': '工作台',
    '/goals': '目标管理',
    '/weekly-reports': '周报管理',
    '/leads': '商机',
    '/strategies': '策略',
    '/dev-tasks': '需求',
    '/company-subjects': '主体管理',
    '/product-assets': '产品资产',
    '/documents': '文档中心',
    '/persons': '人脉管理',
    '/interactions': '互动记录',
    '/reminders': '提醒事项',
    '/companies': '公司研究',
    '/follow-up-tasks': '待跟进任务',
    '/my-tasks': '我的任务',
    '/task-board': '任务看板',
    '/gift-plans': '客户答谢',
    '/gift-review': '审核与记录',
    '/gifts': '礼品库',
    '/trips': '出差申请',
    '/trip-stats': '费用统计',
    '/budgets': '预算管理',
    '/executive': '经营概览',
    '/executive/talents': '高级人才',
    '/executive/dynamics': '竞品动态',
    '/executive/recruit-radar': '招聘雷达',
    '/executive/recruit-radar/config': '雷达配置',
    '/executive/customers': '重点客户',
    '/executive/strategic': '战略月会',
    '/executive/operational': '经营周会',
    '/users': '用户管理',
    '/teams': '小组管理',
    '/project-groups': '项目组管理',
    '/menu-perms': '菜单权限管理',
    '/cross-team-access': '跨团队权限',
    '/operation-logs': '操作日志',
    '/mobile-task-center': '手机采集',
  };
  const currentPageTitle = pageTitleMap[location.pathname] || '';

  // ── 目标与计划 ──────────────────────────────────────────────
  const goalChildren = [
    canAccessMenu('/goals') && { key: '/goals', icon: <AimOutlined />, label: <Link to="/goals">目标管理</Link> },
    canAccessMenu('/weekly-reports') && { key: '/weekly-reports', icon: <FileTextOutlined />, label: <Link to="/weekly-reports">周报管理</Link> },
  ].filter(Boolean);

  // ── 业务流转 ────────────────────────────────────────────────
  const bizFlowChildren = [
    canAccessMenu('/leads') && { key: '/leads', icon: <FunnelPlotOutlined />, label: <Link to="/leads">商机</Link> },
    canAccessMenu('/strategies') && { key: '/strategies', icon: <BranchesOutlined />, label: <Link to="/strategies">策略</Link> },
    canAccessMenu('/dev-tasks') && { key: '/dev-tasks', icon: <ToolOutlined />, label: <Link to="/dev-tasks">需求</Link> },
  ].filter(Boolean);

  // ── 资产管理 ────────────────────────────────────────────────
  const assetMgmtChildren = [
    canAccessMenu('/company-subjects') && {
      key: '/company-subjects', icon: <BankOutlined />, label: <Link to="/company-subjects">主体管理</Link>,
    },
    canAccessMenu('/product-assets') && {
      key: '/product-assets', icon: <AppstoreOutlined />, label: <Link to="/product-assets">产品资产</Link>,
    },
    canAccessMenu('/documents') && {
      key: '/documents', icon: <FileTextOutlined />, label: <Link to="/documents">文档中心</Link>,
    },
    // 预算管理（高管或 menuPerms 配置的用户可见）
    (isAdmin(user) || canAccessMenu('/budgets')) && {
      key: '/budgets', icon: <FileTextOutlined />, label: <Link to="/budgets">预算管理</Link>,
    },
  ].filter(Boolean);

  // ── 商务协作 ────────────────────────────────────────────────
  const bizCoopChildren = [
    canAccessMenu('/companies') && canAccessModule('companies') && {
      key: '/companies', icon: <BankOutlined />, label: <Link to="/companies">公司研究</Link>,
    },
    canAccessMenu('/persons') && canAccessModule('persons') && {
      key: '/persons', icon: <TeamOutlined />, label: <Link to="/persons">人脉管理</Link>,
    },
    canAccessMenu('/interactions') && canAccessModule('interactions') && {
      key: '/interactions', icon: <MessageOutlined />, label: <Link to="/interactions">互动记录</Link>,
    },
    canAccessMenu('/reminders') && canAccessModule('reminders') && {
      key: '/reminders', icon: <BellOutlined />,
      label: (
        <span>
          <Link to="/reminders">提醒事项</Link>
          {pendingCount > 0 && <Badge count={pendingCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    canAccessMenu('/follow-up-tasks') && {
      key: '/follow-up-tasks', icon: <ThunderboltOutlined />,
      label: (
        <span>
          <Link to="/follow-up-tasks">待跟进任务</Link>
          {followUpCount > 0 && <Badge count={followUpCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
  ].filter(Boolean);

  // ── 团队管理 ────────────────────────────────────────────────
  const canViewTaskBoard = ['leader', 'sales_director', 'admin'].includes(user?.role) || (user?.managed_team_ids?.length > 0);
  const teamChildren = [
    canAccessMenu('/task-board') && canViewTaskBoard && {
      key: '/task-board', icon: <ApartmentOutlined />, label: <Link to="/task-board">任务看板</Link>,
    },
    // 客户答谢子菜单
    canAccessMenu('/gift-plans') && {
      key: '/gift-plans', icon: <CalendarOutlined />, label: <Link to="/gift-plans">客户答谢</Link>,
    },
    canAccessMenu('/gift-review') && {
      key: '/gift-review', icon: <AuditOutlined />,
      label: (
        <span>
          <Link to="/gift-review">审核与记录</Link>
          {pendingGiftCount > 0 && <Badge count={pendingGiftCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    canAccessMenu('/gifts') && {
      key: '/gifts', icon: <GiftOutlined />, label: <Link to="/gifts">礼品库</Link>,
    },
    // 出差管理
    canAccessMenu('/trips') && {
      key: '/trips', icon: <CarOutlined />,
      label: (
        <span>
          <Link to="/trips">出差申请</Link>
          {pendingTripCount > 0 && <Badge count={pendingTripCount} size="small" style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    canAccessMenu('/trip-stats') && {
      key: '/trip-stats', icon: <RiseOutlined />, label: <Link to="/trip-stats">费用统计</Link>,
    },
  ].filter(Boolean);

  const menuItems = [
    // 工作台
    canAccessMenu('/') && { key: '/', icon: <DashboardOutlined />, label: <Link to="/">工作台</Link> },
    // 目标与计划
    goalChildren.length > 0 && {
      key: 'goal-plan', icon: <AimOutlined />, label: '目标计划',
      children: goalChildren,
    },
    // 业务流转
    bizFlowChildren.length > 0 && {
      key: 'biz-flow', icon: <BranchesOutlined />, label: '业务流转',
      children: bizFlowChildren,
    },
    // 资产管理
    assetMgmtChildren.length > 0 && {
      key: 'asset-mgmt', icon: <AppstoreOutlined />, label: '资产管理',
      children: assetMgmtChildren,
    },
    // 商务协作
    bizCoopChildren.length > 0 && {
      key: 'biz-coop', icon: <SolutionOutlined />, label: '商务协作',
      children: bizCoopChildren,
    },
    // 团队管理
    teamChildren.length > 0 && {
      key: 'team-mgmt', icon: <TeamOutlined />, label: '团队管理',
      children: teamChildren,
    },
    // 系统管理（仅 admin）
    isAdmin(user) && {
      key: 'system', icon: <SettingOutlined />, label: '系统管理',
      children: [
        { key: '/users', icon: <UserOutlined />, label: <Link to="/users">用户管理</Link> },
        { key: '/teams', icon: <TeamOutlined />, label: <Link to="/teams">小组管理</Link> },
        { key: '/project-groups', icon: <ApartmentOutlined />, label: <Link to="/project-groups">项目组管理</Link> },
        { key: '/menu-perms', icon: <MenuOutlined />, label: <Link to="/menu-perms">菜单权限管理</Link> },
        { key: '/cross-team-access', icon: <TeamOutlined />, label: <Link to="/cross-team-access">跨团队权限</Link> },
        { key: '/mobile-task-center', icon: <AppstoreOutlined />, label: <Link to="/mobile-task-center">手机采集</Link> },
        user?.role === 'admin' && { key: '/operation-logs', icon: <HistoryOutlined />, label: <Link to="/operation-logs">操作日志</Link> },
      ].filter(Boolean),
    },
  ].filter(Boolean);

  // ── 菜单搜索过滤 ────────────────────────────────────────────
  const getMenuText = (label) => {
    if (!label) return '';
    if (typeof label === 'string') return label;
    if (label.props) {
      const { children } = label.props;
      if (typeof children === 'string') return children;
      if (Array.isArray(children)) return children.map(c => (typeof c === 'string' ? c : (c?.props?.children || ''))).join('');
      if (children?.props?.children) return typeof children.props.children === 'string' ? children.props.children : '';
    }
    return '';
  };

  const filteredMenuItems = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return menuItems;
    return menuItems.map(item => {
      if (!item.children) {
        const text = getMenuText(item.label).toLowerCase();
        return text.includes(kw) ? item : null;
      }
      const matched = item.children.filter(child => {
        const text = getMenuText(child.label).toLowerCase();
        return text.includes(kw);
      });
      if (matched.length > 0) return { ...item, children: matched };
      const groupText = getMenuText(item.label).toLowerCase();
      if (groupText.includes(kw)) return item;
      return null;
    }).filter(Boolean);
  }, [menuItems, searchKeyword]);

  const effectiveOpenKeys = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (kw) return filteredMenuItems.filter(i => i.children).map(i => i.key);
    return menuOpenKeys;
  }, [filteredMenuItems, searchKeyword, menuOpenKeys]);

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

  const handleMenuIconClick = () => {
    if (isMobile) {
      setMobileMenuOpen(true);
      return;
    }
    setCollapsed(prev => {
      const next = !prev;
      if (prev) return next;
      setSearchKeyword('');
      return next;
    });
  };

  const menuContent = (
    <>
      <div style={{
        height: DS.header.height, display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
        borderBottom: '1px solid rgba(255,255,255,0.04)', padding: isMobile ? '0 16px' : '0 12px', gap: 8, flexShrink: 0,
      }}>
        <svg width="24" height="24" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="slg1" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#667eea" />
              <stop offset="100%" stopColor="#764ba2" />
            </linearGradient>
          </defs>
          <circle cx="36" cy="36" r="34" fill="url(#slg1)" />
          <path d="M41 10 L24 38 L34 38 L31 62 L50 32 L39 32 Z" fill="white" opacity="0.95" />
        </svg>
        {(!collapsed || isMobile) && (
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 1.5, lineHeight: '16px' }}>幂动小智</div>
            <div style={{ fontSize: 9, letterSpacing: 1, lineHeight: '12px', color: DS.sidebar.accentColor }}>AI赋能 · 协同提效</div>
          </div>
        )}
      </div>
      {(!collapsed || isMobile) && (
        <div style={{ padding: isMobile ? '12px 12px 6px' : '8px 10px 4px', flexShrink: 0 }} className="sider-search">
          <Input
            placeholder="搜索菜单..."
            prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.35)' }} />}
            allowClear
            size="small"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            style={{ borderRadius: 6 }}
          />
        </div>
      )}
      <div
        ref={menuScrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: isMobile ? 24 : 16,
          scrollBehavior: 'smooth',
        }}
        className="menu-scroll-container"
      >
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={collapsed && !isMobile ? [] : effectiveOpenKeys}
          items={filteredMenuItems}
          inlineCollapsed={collapsed && !isMobile}
          style={{ marginTop: 4, background: 'transparent', border: 'none', height: 'auto' }}
          onClick={() => {
            if (isMobile) setMobileMenuOpen(false);
          }}
          onOpenChange={(openKeys) => {
            if (!searchKeyword.trim()) {
              setMenuOpenKeys(openKeys);
            }
            if (openKeys.length > 0 && menuScrollRef.current) {
              setTimeout(() => {
                const lastOpenKey = openKeys[openKeys.length - 1];
                const menuItem = document.querySelector(`[data-menu-id$="${lastOpenKey}"]`);
                if (menuItem) {
                  menuItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              }, 100);
            }
          }}
        />
      </div>
    </>
  );

  return (
    <Watermark content={user?.display_name || user?.username} gap={isMobile ? [140, 160] : [200, 200]} font={{ color: 'rgba(0,0,0,0.06)', fontSize: isMobile ? 12 : 14 }} style={{ minHeight: '100vh' }}>
    <MobileOverlayBackHandler enabled={isMobile} />
    <Layout style={{ minHeight: '100vh', width: '100vw', maxWidth: '100vw', overflowX: 'hidden' }}>
      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); }}
        onOk={() => pwdForm.submit()}
        confirmLoading={pwdLoading}
        okText="确认修改"
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' } } : undefined}
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

      {!isMobile && (
        <Sider
          collapsed={collapsed}
          collapsedWidth={DS.sidebar.collapsedWidth}
          width={DS.sidebar.width}
          style={{ background: DS.sidebar.bg, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden', position: 'sticky', top: 0, left: 0, borderRight: '1px solid rgba(255,255,255,0.04)', alignSelf: 'stretch' }}
        >
          {menuContent}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          closable={false}
          rootClassName="app-mobile-menu-drawer"
          width={280}
          styles={{ body: { padding: 0, background: DS.sidebar.bg }, content: { background: DS.sidebar.bg } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            {menuContent}
          </div>
        </Drawer>
      )}

      <Layout
        style={{
          flex: '0 0 auto',
          width: isMobile ? '100%' : `calc(100vw - ${desktopSiderWidth}px)`,
          maxWidth: isMobile ? '100%' : `calc(100vw - ${desktopSiderWidth}px)`,
          minWidth: 0,
          overflowX: 'hidden',
        }}
      >
        <Header style={{
          background: DS.header.bg, padding: isMobile ? '0 12px' : '0 24px', height: DS.header.height, lineHeight: `${DS.header.height}px`,
          display: 'flex', alignItems: 'center', borderBottom: `1px solid ${DS.header.border}`,
          boxShadow: 'none', position: 'sticky', top: 0, zIndex: 10,
          minWidth: 0,
        }}>
          <span
            onClick={handleMenuIconClick}
            style={{
              fontSize: 18, cursor: 'pointer', color: '#6b7280', marginRight: isMobile ? 8 : 12,
              width: 32, height: 32, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
          >
            {isMobile ? <MenuOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
          </span>
          {currentPageTitle && (
            <span
              style={{
                fontSize: isMobile ? 14 : 15,
                fontWeight: 600,
                color: '#1f2937',
                marginRight: 'auto',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentPageTitle}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16 }}>
            <NotificationBell />
            {!isMobile && <div style={{ width: 1, height: 20, background: '#e8e8ed' }} />}
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }} placement="bottomRight" trigger={['click']}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size={28} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', fontSize: 12, fontWeight: 600 }}>
                  {(user?.display_name || user?.username || '?')[0].toUpperCase()}
                </Avatar>
                {!isMobile && <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{user?.display_name || user?.username}</span>}
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: isMobile ? 0 : 12,
            padding: isMobile ? 12 : 20,
            background: '#fff',
            borderRadius: isMobile ? 0 : 12,
            minHeight: `calc(100vh - ${DS.header.height}px)`,
            boxShadow: isMobile ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            width: 'auto',
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowX: 'hidden',
          }}
        >
          <Routes>
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/persons" element={<PrivateRoute module="persons"><Persons /></PrivateRoute>} />
            <Route path="/interactions" element={<PrivateRoute module="interactions"><Interactions /></PrivateRoute>} />
            <Route path="/reminders" element={<PrivateRoute module="reminders"><Reminders /></PrivateRoute>} />
            <Route path="/companies" element={<PrivateRoute module="companies"><Companies /></PrivateRoute>} />
            <Route path="/gifts" element={<PrivateRoute><Gifts /></PrivateRoute>} />
            <Route path="/gift-plans" element={<PrivateRoute><GiftPlans /></PrivateRoute>} />
            <Route path="/gift-review" element={<PrivateRoute><GiftReview /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute adminOnly><Users /></PrivateRoute>} />
            <Route path="/teams" element={<PrivateRoute adminOnly><Teams /></PrivateRoute>} />
            <Route path="/project-groups" element={<PrivateRoute adminOnly><ProjectGroups /></PrivateRoute>} />
            <Route path="/trips" element={<PrivateRoute><Trips /></PrivateRoute>} />
            <Route path="/trip-stats" element={<PrivateRoute><TripStats /></PrivateRoute>} />
            <Route path="/budgets" element={<PrivateRoute><Budgets /></PrivateRoute>} />
            <Route path="/menu-perms" element={<PrivateRoute adminOnly><MenuPerms /></PrivateRoute>} />
            <Route path="/cross-team-access" element={<PrivateRoute adminOnly><CrossTeamAccess /></PrivateRoute>} />
            <Route path="/mobile-task-center" element={<PrivateRoute adminOnly><MobileTaskCenter /></PrivateRoute>} />
            <Route path="/operation-logs" element={<PrivateRoute adminOnly><OperationLogs /></PrivateRoute>} />
            <Route path="/follow-up-tasks" element={<PrivateRoute><FollowUpTasks /></PrivateRoute>} />
            <Route path="/my-tasks" element={<PrivateRoute><MyTasks /></PrivateRoute>} />
            <Route path="/task-board" element={<PrivateRoute><TaskBoard /></PrivateRoute>} />
            {/* 待开发模块占位 */}
            <Route path="/goals" element={<PrivateRoute><Goals /></PrivateRoute>} />
            <Route path="/weekly-reports" element={<PrivateRoute><WeeklyReports /></PrivateRoute>} />
            <Route path="/leads" element={<PrivateRoute><Leads /></PrivateRoute>} />
            <Route path="/strategies" element={<PrivateRoute><Strategies /></PrivateRoute>} />
            <Route path="/dev-tasks" element={<PrivateRoute><DevTasks /></PrivateRoute>} />
            <Route path="/company-subjects" element={<PrivateRoute module="product_assets"><CompanySubjects /></PrivateRoute>} />
            <Route path="/product-assets" element={<PrivateRoute module="product_assets"><ProductAssets /></PrivateRoute>} />
            <Route path="/documents" element={<PrivateRoute><Documents /></PrivateRoute>} />
            {/* 公司经营模块（仅高管） */}
            <Route path="/executive" element={<PrivateRoute><ExecutiveDashboard /></PrivateRoute>} />
            <Route path="/executive/talents" element={<PrivateRoute><ExecutiveTalents /></PrivateRoute>} />
            <Route path="/executive/dynamics" element={<PrivateRoute><ExecutiveDynamics /></PrivateRoute>} />
            <Route path="/executive/recruit-radar" element={<PrivateRoute executiveOnly><RecruitRadar /></PrivateRoute>} />
            <Route path="/executive/recruit-radar/config" element={<PrivateRoute executiveOnly><RecruitRadarConfig /></PrivateRoute>} />
            <Route path="/executive/customers" element={<PrivateRoute><ExecutiveCustomers /></PrivateRoute>} />
            <Route path="/executive/strategic" element={<PrivateRoute><StrategicMeeting /></PrivateRoute>} />
            <Route path="/executive/operational" element={<PrivateRoute><OperationalMeeting /></PrivateRoute>} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
    </Watermark>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
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

// 已登录则跳转到目标页
function LoginGuard() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const redirectPath = getSafeInternalPath(new URLSearchParams(location.search).get('redirect'));
  if (loading) return null;
  if (user) return <Navigate to={getAuthorizedRedirectPath(redirectPath, user)} replace />;
  return <Login />;
}
