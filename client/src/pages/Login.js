import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Grid } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { getLocationPath, getSafeInternalPath, resolveLoginRedirect } from '../utils/redirect';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

// SVG Logo —— 闪电 + 齿轮融合，充满力量与激情
function MidongLogo({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#667eea" />
          <stop offset="100%" stopColor="#764ba2" />
        </linearGradient>
        <linearGradient id="lg2" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffe" stopOpacity="0.85" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* 外圆背景 */}
      <circle cx="36" cy="36" r="34" fill="url(#lg1)" />
      {/* 内圆装饰 */}
      <circle cx="36" cy="36" r="27" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      {/* 闪电核心 */}
      <path
        d="M41 10 L24 38 L34 38 L31 62 L50 32 L39 32 Z"
        fill="url(#lg2)"
        filter="url(#glow)"
      />
      {/* 左侧小装饰弧线 */}
      <path d="M18 22 Q12 36 18 50" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 右侧小装饰弧线 */}
      <path d="M54 22 Q60 36 54 50" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Login() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const location = useLocation();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const redirectPath = getSafeInternalPath(
    searchParams.get('redirect')
    || getLocationPath(location.state?.from)
  );

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      window.location.replace(resolveLoginRedirect(redirectPath));
    } catch (err) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: 'center',
      padding: isMobile ? '32px 16px 20px' : 24,
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1145 40%, #0d1f3c 100%)',
      position: 'relative',
      overflowY: isMobile ? 'auto' : 'hidden',
      overflowX: 'hidden',
    }}>
      {/* 背景光晕装饰 */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(102,126,234,0.15) 0%, transparent 70%)',
        top: '-5%', left: '10%', pointerEvents: 'none', display: isMobile ? 'none' : 'block',
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(118,75,162,0.12) 0%, transparent 70%)',
        bottom: '10%', right: '5%', pointerEvents: 'none', display: isMobile ? 'none' : 'block',
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,172,254,0.08) 0%, transparent 70%)',
        bottom: '30%', left: '50%', pointerEvents: 'none', display: isMobile ? 'none' : 'block',
      }} />

      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: isMobile ? 16 : 24,
          boxShadow: isMobile ? '0 18px 50px rgba(0,0,0,0.36)' : '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          border: 'none',
        }}
        styles={{ body: { padding: isMobile ? '32px 22px' : '44px 40px' } }}
      >
        {/* Logo + 标题区 */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 28 : 36 }}>
          <div style={{ marginBottom: 14 }}>
            <MidongLogo size={isMobile ? 64 : 76} />
          </div>
          <Title level={2} style={{ margin: 0, fontSize: isMobile ? 24 : 28, letterSpacing: isMobile ? 2 : 4, color: '#4F46E5' }}>
            幂动小智
          </Title>
          <div style={{ marginTop: 6, fontSize: 12, letterSpacing: 3, color: '#999', fontWeight: 400 }}>
            AI 赋能 &nbsp;·&nbsp; 协同提效
          </div>
        </div>

        <Form onFinish={handleSubmit} size="large" layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#bbb' }} />} placeholder="用户名" autoComplete="username" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="密码" autoComplete="current-password" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 46, fontSize: 16, borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 4px 20px rgba(102,126,234,0.4)',
              }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
