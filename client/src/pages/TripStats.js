import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Select, Typography, Tag, Table, Alert, Space, Statistic, Badge } from 'antd';
import { WarningOutlined, RiseOutlined, TeamOutlined, CarOutlined } from '@ant-design/icons';
import { tripsApi, groupsApi } from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

const expenseTypeMap = {
  meal: '餐饮', hotel: '住宿', flight: '机票', train: '火车票', taxi: '打车', other: '其他',
};

const typeColors = {
  meal: '#fa8c16', hotel: '#1677ff', flight: '#722ed1', train: '#13c2c2', taxi: '#52c41a', other: '#bfbfbf',
};

// 简单条形图
function BarChart({ data, valueKey, labelKey, color = '#1677ff', unit = '¥' }) {
  if (!data || data.length === 0) return <Text type="secondary">暂无数据</Text>;
  const max = Math.max(...data.map(d => d[valueKey] || 0));
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
            <Text>{d[labelKey]}</Text>
            <Text strong>{unit}{(d[valueKey] || 0).toFixed(0)}</Text>
          </div>
          <div style={{ background: '#f5f5f5', borderRadius: 4, height: 10 }}>
            <div style={{
              background: color,
              width: `${max > 0 ? ((d[valueKey] || 0) / max * 100) : 0}%`,
              height: 10, borderRadius: 4, transition: 'width 0.5s',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// 饼图（用色块模拟）
function PieChart({ data }) {
  if (!data || data.length === 0) return <Text type="secondary">暂无数据</Text>;
  const total = data.reduce((s, d) => s + (d.total || 0), 0);
  return (
    <div>
      {data.map((d, i) => {
        const pct = total > 0 ? ((d.total || 0) / total * 100).toFixed(1) : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: typeColors[d.type] || '#bfbfbf', marginRight: 8, flexShrink: 0 }} />
            <Text style={{ flex: 1, fontSize: 12 }}>{expenseTypeMap[d.type] || d.type}</Text>
            <Text style={{ fontSize: 12, color: '#666' }}>¥{(d.total || 0).toFixed(0)}</Text>
            <Text style={{ fontSize: 12, color: '#999', marginLeft: 8, width: 40, textAlign: 'right' }}>{pct}%</Text>
          </div>
        );
      })}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
        <Text strong>合计</Text>
        <Text strong style={{ color: '#ff4d4f' }}>¥{total.toFixed(0)}</Text>
      </div>
    </div>
  );
}

export default function TripStats() {
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [groupId, setGroupId] = useState('');

  const load = async () => {
    const params = { year };
    if (groupId) params.group_id = groupId;
    const res = await tripsApi.stats(params);
    setStats(res);
  };

  useEffect(() => { groupsApi.list().then(setGroups); }, []);
  useEffect(() => { load(); }, [year, groupId]);

  const totalAmount = stats?.monthly?.reduce((s, m) => s + (m.total_amount || 0), 0) || 0;
  const totalTrips = stats?.monthly?.reduce((s, m) => s + (m.trip_count || 0), 0) || 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><RiseOutlined /> 出差费用统计</Title>
        <Space>
          <Select value={year} onChange={setYear} style={{ width: 90 }}>
            {[2024, 2025, 2026, 2027].map(y => <Option key={y} value={String(y)}>{y}年</Option>)}
          </Select>
          <Select placeholder="全部小组" allowClear style={{ width: 130 }} value={groupId || undefined} onChange={v => setGroupId(v || '')}>
            {groups.map(g => <Option key={g.id} value={g.id}>{g.name}</Option>)}
          </Select>
        </Space>
      </div>

      {/* 汇总指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="年度出差总次数" value={totalTrips} prefix={<CarOutlined />} valueStyle={{ color: '#1677ff' }} suffix="次" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="年度报销总额" value={totalAmount.toFixed(0)} prefix="¥" valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="人均出差费用" value={totalTrips > 0 ? (totalAmount / totalTrips).toFixed(0) : 0} prefix="¥/次" valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="重要客户预警" value={stats?.alerts?.length || 0} prefix={<WarningOutlined />} valueStyle={{ color: stats?.alerts?.length > 0 ? '#ff4d4f' : '#52c41a' }} suffix="人" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 月度趋势 */}
        <Col xs={24} lg={14}>
          <Card title="月度出差费用趋势" size="small">
            {stats?.monthly?.length > 0 ? (
              <div>
                <BarChart
                  data={stats.monthly}
                  valueKey="total_amount"
                  labelKey="month"
                  color="#1677ff"
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  {stats.monthly.map(m => (
                    <span key={m.month} style={{ marginRight: 16 }}>
                      {m.month}：{m.trip_count}次出差
                    </span>
                  ))}
                </div>
              </div>
            ) : <Text type="secondary">暂无数据</Text>}
          </Card>
        </Col>

        {/* 费用类型分布 */}
        <Col xs={24} lg={10}>
          <Card title="费用类型分布" size="small">
            <PieChart data={stats?.byType} />
          </Card>
        </Col>

        {/* 人员排行 */}
        <Col xs={24} lg={12}>
          <Card title={<Space><TeamOutlined />人员费用排行</Space>} size="small">
            <BarChart
              data={stats?.byUser || []}
              valueKey="total_amount"
              labelKey="display_name"
              color="#722ed1"
            />
          </Card>
        </Col>

        {/* 小组对比 */}
        <Col xs={24} lg={12}>
          <Card title="小组费用对比" size="small">
            <BarChart
              data={stats?.byGroup || []}
              valueKey="total_amount"
              labelKey="group_name"
              color="#fa8c16"
            />
          </Card>
        </Col>

        {/* 重要客户预警 */}
        <Col xs={24}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: '#ff4d4f' }} />
                <span>重要客户出差预警</span>
                <Text type="secondary" style={{ fontSize: 12 }}>（VIP/重要客户超过60天未出差拜访）</Text>
              </Space>
            }
            size="small"
          >
            {stats?.alerts?.length === 0
              ? <Alert message="所有重要客户均在60天内有出差拜访记录，保持良好！" type="success" showIcon />
              : (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={stats?.alerts || []}
                  rowKey="id"
                  columns={[
                    {
                      title: '客户',
                      dataIndex: 'name',
                      render: (v, r) => (
                        <Space>
                          <Text strong>{v}</Text>
                          <Tag color={r.relationship_level === 'vip' ? 'gold' : 'red'}>
                            {r.relationship_level === 'vip' ? 'VIP' : '重要'}
                          </Tag>
                        </Space>
                      ),
                    },
                    {
                      title: '公司',
                      render: (_, r) => r.company || r.current_company || '-',
                    },
                    {
                      title: '上次出差拜访',
                      dataIndex: 'last_trip_date',
                      render: v => v || '从未',
                    },
                    {
                      title: '已超过',
                      dataIndex: 'days_since',
                      render: (v, r) => (
                        <Badge
                          color={!r.last_trip_date ? '#ff4d4f' : v > 90 ? '#ff4d4f' : '#fa8c16'}
                          text={
                            <Text style={{ color: !r.last_trip_date ? '#ff4d4f' : v > 90 ? '#ff4d4f' : '#fa8c16', fontWeight: 600 }}>
                              {r.last_trip_date ? `${v}天` : '从未拜访'}
                            </Text>
                          }
                        />
                      ),
                    },
                    {
                      title: '建议',
                      render: (_, r) => (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {!r.last_trip_date ? '尚未建立出差拜访记录，建议尽快安排' :
                           r.days_since > 90 ? '已超过90天，强烈建议安排拜访' :
                           '已超过60天，建议近期安排拜访'}
                        </Text>
                      ),
                    },
                  ]}
                />
              )
            }
          </Card>
        </Col>
      </Row>
    </div>
  );
}
