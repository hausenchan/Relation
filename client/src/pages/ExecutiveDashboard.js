import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Alert, Spin, Grid, List, Typography, Space } from 'antd';
import { UserOutlined, TeamOutlined, ShopOutlined, FileTextOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';

export default function ExecutiveDashboard() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/executive/overview');
      setData(res.data);
    } catch (err) {
      console.error('获取经营概览失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <Alert message="加载失败" type="error" />;

  const talentColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '公司', dataIndex: 'company', key: 'company' },
    { title: '职位', dataIndex: 'position', key: 'position' },
    {
      title: '潜力评级',
      dataIndex: 'potential_rating',
      key: 'potential_rating',
      render: (val) => <Tag color={val === 'S' ? 'red' : val === 'A' ? 'orange' : 'blue'}>{val}</Tag>
    },
    {
      title: '招募状态',
      dataIndex: 'recruit_status',
      key: 'recruit_status',
      render: (val) => {
        const map = { pending: '待接触', contacted: '已接触', negotiating: '洽谈中', offered: '已发offer', joined: '已入职', rejected: '已拒绝' };
        return map[val] || val;
      }
    }
  ];

  const dynamicsColumns = [
    { title: '公司', dataIndex: 'company_name', key: 'company_name' },
    { title: '动态类型', dataIndex: 'type', key: 'type' },
    { title: '内容', dataIndex: 'content', key: 'content', ellipsis: true },
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 }
  ];

  const customerColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '公司', dataIndex: 'company', key: 'company' },
    { title: '职位', dataIndex: 'position', key: 'position' },
    {
      title: '未联系天数',
      dataIndex: 'days_since_last_contact',
      key: 'days_since_last_contact',
      render: (val) => <span style={{ color: val > 30 ? 'red' : val > 14 ? 'orange' : 'inherit' }}>{val}天</span>
    },
    { title: '最后互动', dataIndex: 'last_contact_date', key: 'last_contact_date', width: 120 }
  ];

  const renderTalentCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 10, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Typography.Text strong>{record.name}</Typography.Text>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{record.company || '-'} · {record.position || '-'}</div>
            </div>
            <Tag color={record.potential_rating === 'S' ? 'red' : record.potential_rating === 'A' ? 'orange' : 'blue'}>{record.potential_rating}</Tag>
          </div>
          <Typography.Text type="secondary">招募状态：{({ pending: '待接触', contacted: '已接触', negotiating: '洽谈中', offered: '已发offer', joined: '已入职', rejected: '已拒绝' }[record.recruit_status] || record.recruit_status || '-')}</Typography.Text>
        </Space>
      </Card>
    </List.Item>
  );

  const renderDynamicCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 10, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Typography.Text strong>{record.company_name || '-'}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.date || '-'}</Typography.Text>
          </div>
          <Tag>{record.type || '-'}</Tag>
          <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>{record.content || '-'}</Typography.Paragraph>
        </Space>
      </Card>
    </List.Item>
  );

  const renderCustomerCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 10, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Typography.Text strong>{record.name}</Typography.Text>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{record.company || '-'} · {record.position || '-'}</div>
            </div>
            <span style={{ color: record.days_since_last_contact > 30 ? 'red' : record.days_since_last_contact > 14 ? 'orange' : 'inherit' }}>
              {record.days_since_last_contact}天
            </span>
          </div>
          <Typography.Text type="secondary">最后互动：{record.last_contact_date || '-'}</Typography.Text>
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="高潜人才"
              value={data.stats.high_potential_talents}
              prefix={<UserOutlined />}
              suffix="人"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="招募中人才"
              value={data.stats.recruiting_talents}
              prefix={<TeamOutlined />}
              suffix="人"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="竞品动态"
              value={data.stats.recent_competitor_dynamics}
              prefix={<ShopOutlined />}
              suffix="条"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="待跟进客户"
              value={data.stats.customers_need_followup}
              prefix={<FileTextOutlined />}
              suffix="人"
            />
          </Card>
        </Col>
      </Row>

      {data.alerts.length > 0 && (
        <Alert
          message="重要提醒"
          description={
            <ul style={{ marginBottom: 0 }}>
              {data.alerts.map((alert, idx) => (
                <li key={idx}>{alert}</li>
              ))}
            </ul>
          }
          type="warning"
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={16}>
        <Col span={24}>
          <Card title="高潜人才动态" style={{ marginBottom: 16 }}>
            {isMobile ? <List dataSource={data.recent_talents} rowKey="id" renderItem={renderTalentCard} /> : (
              <Table dataSource={data.recent_talents} columns={talentColumns} rowKey="id" pagination={false} size="small" />
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="竞品最新动态" style={{ marginBottom: 16 }}>
            {isMobile ? <List dataSource={data.recent_dynamics} rowKey="id" renderItem={renderDynamicCard} /> : (
              <Table dataSource={data.recent_dynamics} columns={dynamicsColumns} rowKey="id" pagination={false} size="small" />
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="重点客户待跟进">
            {isMobile ? <List dataSource={data.customers_need_followup} rowKey="id" renderItem={renderCustomerCard} /> : (
              <Table dataSource={data.customers_need_followup} columns={customerColumns} rowKey="id" pagination={false} size="small" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
