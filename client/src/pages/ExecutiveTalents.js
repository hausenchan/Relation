import React, { useState, useEffect } from 'react';
import { Table, Card, Select, Space, Tag, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

export default function ExecutiveTalents() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({
    potential_rating: '',
    recruit_status: '',
    intent_level: ''
  });

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.potential_rating) params.potential_rating = filters.potential_rating;
      if (filters.recruit_status) params.recruit_status = filters.recruit_status;
      if (filters.intent_level) params.intent_level = filters.intent_level;

      const res = await axios.get('/api/executive/talents', { params });
      setData(res.data);
    } catch (err) {
      console.error('获取高级人才失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '公司', dataIndex: 'company', key: 'company', width: 150 },
    { title: '职位', dataIndex: 'position', key: 'position', width: 150 },
    {
      title: '潜力评级',
      dataIndex: 'potential_rating',
      key: 'potential_rating',
      width: 100,
      render: (val) => {
        const colorMap = { S: 'red', A: 'orange', B: 'blue', C: 'default' };
        return <Tag color={colorMap[val] || 'default'}>{val}</Tag>;
      }
    },
    {
      title: '招募状态',
      dataIndex: 'recruit_status',
      key: 'recruit_status',
      width: 120,
      render: (val) => {
        const map = {
          pending: '待接触',
          contacted: '已接触',
          negotiating: '洽谈中',
          offered: '已发offer',
          joined: '已入职',
          rejected: '已拒绝'
        };
        const colorMap = {
          pending: 'default',
          contacted: 'blue',
          negotiating: 'orange',
          offered: 'cyan',
          joined: 'green',
          rejected: 'red'
        };
        return <Tag color={colorMap[val]}>{map[val] || val}</Tag>;
      }
    },
    {
      title: '意向程度',
      dataIndex: 'intent_level',
      key: 'intent_level',
      width: 100,
      render: (val) => {
        const map = { high: '高', medium: '中', low: '低', unknown: '未知' };
        const colorMap = { high: 'green', medium: 'blue', low: 'orange', unknown: 'default' };
        return <Tag color={colorMap[val]}>{map[val] || val}</Tag>;
      }
    },
    { title: '资源', dataIndex: 'resources', key: 'resources', ellipsis: true },
    { title: '需求', dataIndex: 'demands', key: 'demands', ellipsis: true },
    { title: '备注', dataIndex: 'notes', key: 'notes', ellipsis: true }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        extra={
          <Space>
            <Select
              placeholder="潜力评级"
              style={{ width: 120 }}
              allowClear
              value={filters.potential_rating || undefined}
              onChange={(val) => setFilters({ ...filters, potential_rating: val || '' })}
            >
              <Option value="S">S级</Option>
              <Option value="A">A级</Option>
              <Option value="B">B级</Option>
              <Option value="C">C级</Option>
            </Select>
            <Select
              placeholder="招募状态"
              style={{ width: 120 }}
              allowClear
              value={filters.recruit_status || undefined}
              onChange={(val) => setFilters({ ...filters, recruit_status: val || '' })}
            >
              <Option value="pending">待接触</Option>
              <Option value="contacted">已接触</Option>
              <Option value="negotiating">洽谈中</Option>
              <Option value="offered">已发offer</Option>
              <Option value="joined">已入职</Option>
              <Option value="rejected">已拒绝</Option>
            </Select>
            <Select
              placeholder="意向程度"
              style={{ width: 120 }}
              allowClear
              value={filters.intent_level || undefined}
              onChange={(val) => setFilters({ ...filters, intent_level: val || '' })}
            >
              <Option value="high">高</Option>
              <Option value="medium">中</Option>
              <Option value="low">低</Option>
              <Option value="unknown">未知</Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          </Space>
        }
      >
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>
    </div>
  );
}
