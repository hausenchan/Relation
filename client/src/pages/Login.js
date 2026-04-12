import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';

const { Title, Text } = Typography;

export default function Login() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      window.location.href = '/';
    } catch (err) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #001529 0%, #0d2b4e 50%, #1677ff22 100%)',
    }}>
      <Card
        style={{ width: 380, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        styles={{ body: { padding: '40px 36px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🤝</div>
          <Title level={3} style={{ margin: 0, color: '#001529' }}>人脉管理助手</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>请登录以继续使用</Text>
        </div>

        <Form onFinish={handleSubmit} size="large" layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#bbb' }} />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 15 }}>
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>默认管理员账号：admin / admin123</Text>
        </div>
      </Card>
    </div>
  );
}
