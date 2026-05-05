import React, { useState, useEffect } from 'react';
import { Table, Card, Select, Space, Button, Tag, Grid, List, Typography, Watermark, message } from 'antd';
import { ReloadOutlined, RadarChartOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

export default function RecruitRadar() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [targets, setTargets] = useState([]);
  const [positions, setPositions] = useState([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchTargets();
    fetchPositions();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [filterCompany, filterPosition, page]);

  const fetchTargets = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/targets');
      setTargets(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPositions = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/positions');
      setPositions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: 50 };
      if (filterCompany) params.boss_company_id = filterCompany;
      if (filterPosition) params.position_id = filterPosition;
      const res = await axios.get('/api/boss-watcher/events', { params });
      setEvents(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await axios.post('/api/boss-watcher/trigger');
      message.success('抓取完成');
      fetchEvents();
    } catch (err) {
      message.error(err.response?.data?.error || '抓取失败');
    } finally {
      setTriggering(false);
    }
  };

  const eventTypeTag = (type) => {
    const map = { new: { label: '新出现', color: 'green' }, gone: { label: '已消失', color: 'red' }, status_change: { label: '状态变化', color: 'orange' } };
    const cfg = map[type] || { label: type, color: 'default' };
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  };

  const columns = [
    { title: '类型', dataIndex: 'event_type', key: 'event_type', width: 100, render: eventTypeTag },
    { title: '候选人', dataIndex: 'candidate_name', key: 'candidate_name', width: 100 },
    { title: '职位', dataIndex: 'candidate_title', key: 'candidate_title', width: 150, ellipsis: true },
    { title: '公司', dataIndex: 'company_name', key: 'company_name', width: 120 },
    { title: '城市', dataIndex: 'candidate_city', key: 'candidate_city', width: 80 },
    { title: '活跃状态', dataIndex: 'candidate_status', key: 'candidate_status', width: 100 },
    { title: '关联岗位', dataIndex: 'position_title', key: 'position_title', width: 150, ellipsis: true },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160 }
  ];

  const renderEventCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {eventTypeTag(record.event_type)}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.created_at}</Typography.Text>
          </div>
          <Typography.Text strong>{record.candidate_name}</Typography.Text>
          <Typography.Text>{record.candidate_title} · {record.candidate_city}</Typography.Text>
          <Typography.Text type="secondary">公司: {record.company_name}</Typography.Text>
          <Typography.Text type="secondary">关联岗位: {record.position_title}</Typography.Text>
          {record.candidate_status && <Tag>{record.candidate_status}</Tag>}
        </Space>
      </Card>
    </List.Item>
  );

  const filters = (
    <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined, marginBottom: isMobile ? 16 : 0 }}>
      <Select
        placeholder="筛选公司"
        style={{ width: isMobile ? '100%' : 180 }}
        allowClear
        value={filterCompany || undefined}
        onChange={(val) => { setFilterCompany(val || ''); setPage(1); }}
      >
        {targets.map(t => <Option key={t.boss_company_id} value={t.boss_company_id}>{t.company_name}</Option>)}
      </Select>
      <Select
        placeholder="筛选岗位"
        style={{ width: isMobile ? '100%' : 180 }}
        allowClear
        value={filterPosition || undefined}
        onChange={(val) => { setFilterPosition(val || ''); setPage(1); }}
      >
        {positions.map(p => <Option key={p.boss_position_id} value={p.boss_position_id}>{p.title}</Option>)}
      </Select>
      <Button icon={<RadarChartOutlined />} loading={triggering} onClick={handleTrigger}>
        手动抓取
      </Button>
      <Button icon={<ReloadOutlined />} onClick={fetchEvents}>刷新</Button>
    </Space>
  );

  return (
    <Watermark content="仅限内部参考">
      <div style={{ padding: isMobile ? 0 : 24 }}>
        <Card extra={!isMobile && filters}>
          {isMobile && filters}
          {isMobile ? (
            <List
              dataSource={events}
              rowKey="id"
              loading={loading}
              pagination={{ current: page, total, pageSize: 50, onChange: setPage, showSizeChanger: false }}
              renderItem={renderEventCard}
            />
          ) : (
            <Table
              dataSource={events}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
            />
          )}
        </Card>
      </div>
    </Watermark>
  );
}
