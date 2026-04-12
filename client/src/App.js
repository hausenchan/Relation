import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Badge, ConfigProvider, theme } from 'antd';
import {
  DashboardOutlined, TeamOutlined,
  MessageOutlined, BellOutlined, AppstoreOutlined, BankOutlined
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import Dashboard from './pages/Dashboard';
import Persons from './pages/Persons';
import Interactions from './pages/Interactions';
import Reminders from './pages/Reminders';
import Companies from './pages/Companies';
import { remindersApi } from './api';

const { Sider, Content } = Layout;

function AppLayout() {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    remindersApi.list({ done: 0 }).then(r => {
      const upcoming = r.filter(item => {
        const d = new Date(item.remind_date);
        const today = new Date();
        const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
        return diff <= 7;
      });
      setPendingCount(upcoming.length);
    });
  }, [location]);

  const menuItems = [
    {
      key: 'crm',
      icon: <AppstoreOutlined />,
      label: '人脉管理助手',
      children: [
        { key: '/', icon: <DashboardOutlined />, label: <Link to="/">工作台</Link> },
        { key: '/persons', icon: <TeamOutlined />, label: <Link to="/persons">人脉管理</Link> },
        { key: '/interactions', icon: <MessageOutlined />, label: <Link to="/interactions">互动记录</Link> },
        {
          key: '/reminders',
          icon: <BellOutlined />,
          label: (
            <span>
              <Link to="/reminders">提醒事项</Link>
              {pendingCount > 0 && <Badge count={pendingCount} size="small" style={{ marginLeft: 8 }} />}
            </span>
          ),
        },
      ],
    },
    {
      key: 'research',
      icon: <BankOutlined />,
      label: '公司研究助手',
      children: [
        { key: '/companies', icon: <BankOutlined />, label: <Link to="/companies">公司研究</Link> },
      ],
    },
  ];

  const selectedKey = '/' + location.pathname.split('/')[1];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        style={{ background: '#001529' }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: 16,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          padding: '0 16px',
        }}>
          幂动经营小组中台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['crm', 'research']}
          items={menuItems}
          style={{ marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: '16px', padding: '16px', background: '#fff', borderRadius: 8, minHeight: 280 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/persons" element={<Persons />} />
            <Route path="/interactions" element={<Interactions />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/companies" element={<Companies />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ConfigProvider>
  );
}
