import React, { useState, useEffect } from 'react';
import { Table, Card, Select, Space, Button, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

export default function ExecutiveDynamics() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');

  useEffect(() => {
    fetchCompanies();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/company-dynamics/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error('获取公司列表失败:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCompany) params.company_id = selectedCompany;

      const res = await axios.get('/api/executive/competitor-dynamics', { params });
      setData(res.data);
    } catch (err) {
      console.error('获取竞品动态失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '公司',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 150,
      render: (text) => <strong>{text}</strong>
    },
    {
      title: '动态类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (val) => {
        const map = {
          product: '产品发布',
          funding: '融资',
          partnership: '合作',
          personnel: '人事变动',
          market: '市场动态',
          other: '其他'
        };
        const colorMap = {
          product: 'blue',
          funding: 'green',
          partnership: 'cyan',
          personnel: 'orange',
          market: 'purple',
          other: 'default'
        };
        return <Tag color={colorMap[val]}>{map[val] || val}</Tag>;
      }
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true
    },
    {
      title: '影响评估',
      dataIndex: 'impact',
      key: 'impact',
      width: 150,
      ellipsis: true
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
      defaultSortOrder: 'descend'
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        extra={
          <Space>
            <Select
              placeholder="选择公司"
              style={{ width: 200 }}
              allowClear
              value={selectedCompany || undefined}
              onChange={(val) => setSelectedCompany(val || '')}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
            >
              {companies.map(c => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
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
