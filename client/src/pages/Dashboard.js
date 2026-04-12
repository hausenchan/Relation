import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Badge, Button, Typography, Space } from 'antd';
import { TeamOutlined, MessageOutlined, BellOutlined, CalendarOutlined } from '@ant-design/icons';
import { statsApi, remindersApi } from '../api';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const interactionTypeMap = {
  visit: '拜访', call: '通话', gift: '送礼', meal: '餐饮', wechat: '微信',
  email: '邮件', meeting: '会议', other: '其他'
};

const categoryMap = {
  business: { label: '商务圈', color: 'blue' },
  talent:   { label: '人才圈', color: 'green' },
  startup:  { label: '创业圈', color: 'orange' },
  social:   { label: '社交圈', color: 'purple' },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    statsApi.get().then(setStats);
    remindersApi.list({ done: 0 }).then(setReminders);
  }, []);

  const urgentReminders = reminders.filter(r => dayjs(r.remind_date).diff(dayjs(), 'day') <= 3);
  const upcomingReminders = reminders.filter(r => {
    const diff = dayjs(r.remind_date).diff(dayjs(), 'day');
    return diff > 3 && diff <= 7;
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>工作台</Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate('/persons')}>
            <Statistic title="人脉总数" value={stats?.personCount ?? '-'} prefix={<TeamOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate('/interactions')}>
            <Statistic title="互动记录" value={stats?.interactionCount ?? '-'} prefix={<MessageOutlined />} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => navigate('/reminders')}>
            <Statistic title="待处理提醒" value={stats?.pendingReminders ?? '-'} prefix={<BellOutlined />} valueStyle={{ color: urgentReminders.length > 0 ? '#ff4d4f' : '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="圈子分布" value={stats?.categoryStats?.length ?? '-'} valueStyle={{ color: '#52c41a' }} />
            {stats?.categoryStats?.map(c => (
              <Tag key={c.person_category} color={categoryMap[c.person_category]?.color} style={{ marginTop: 8 }}>
                {categoryMap[c.person_category]?.label}: {c.cnt}
              </Tag>
            ))}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={<Space><BellOutlined style={{ color: '#ff4d4f' }} /> 近期提醒</Space>}
            extra={<Button type="link" onClick={() => navigate('/reminders')}>全部</Button>}>
            {reminders.length === 0 ? <Text type="secondary">暂无待处理提醒</Text> : (
              <List
                size="small"
                dataSource={reminders.slice(0, 8)}
                renderItem={item => {
                  const diff = dayjs(item.remind_date).diff(dayjs(), 'day');
                  const isOverdue = diff < 0;
                  const isUrgent = diff <= 1 && diff >= 0;
                  return (
                    <List.Item
                      extra={
                        <Badge
                          status={isOverdue ? 'error' : isUrgent ? 'warning' : 'processing'}
                          text={isOverdue ? `逾期${Math.abs(diff)}天` : diff === 0 ? '今天' : `${diff}天后`}
                        />
                      }
                    >
                      <List.Item.Meta
                        title={<Text strong>{item.title}</Text>}
                        description={
                          <Space size={4}>
                            <Tag color="blue">{item.person_name}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <CalendarOutlined /> {item.remind_date}
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<Space><MessageOutlined style={{ color: '#722ed1' }} /> 最近互动</Space>}
            extra={<Button type="link" onClick={() => navigate('/interactions')}>全部</Button>}>
            {!stats?.recentInteractions?.length ? <Text type="secondary">暂无互动记录</Text> : (
              <List
                size="small"
                dataSource={stats.recentInteractions}
                renderItem={item => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color={categoryMap[item.person_category]?.color}>
                            {categoryMap[item.person_category]?.label || '其他'}
                          </Tag>
                          <Text strong>{item.person_name}</Text>
                          <Tag>{interactionTypeMap[item.type] || item.type}</Tag>
                        </Space>
                      }
                      description={
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <CalendarOutlined /> {item.date}
                          </Text>
                          {item.description && <Text type="secondary" style={{ fontSize: 12 }} ellipsis style={{ maxWidth: 180 }}>{item.description}</Text>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
