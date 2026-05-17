import React, { useState, useEffect } from 'react';
import { Table, Card, Select, Space, Button, Tag, Grid, List, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

export default function ExecutiveDynamics() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
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

  const renderDynamicCard = (record) => {
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
    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <Card size="small" style={{ width: '100%' }}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <Typography.Text strong>{record.company_name || '-'}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.date || '-'}</Typography.Text>
            </div>
            <Tag color={colorMap[record.type]}>{map[record.type] || record.type}</Tag>
            <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>{record.content || '-'}</Typography.Paragraph>
            {record.impact && <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>影响：{record.impact}</Typography.Paragraph>}
            {record.source && <Typography.Text type="secondary">来源：{record.source}</Typography.Text>}
          </Space>
        </Card>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Card
        extra={!isMobile && (
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
        )}
      >
        {isMobile && (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Select
              placeholder="选择公司"
              style={{ width: '100%' }}
              allowClear
              value={selectedCompany || undefined}
              onChange={(val) => setSelectedCompany(val || '')}
              showSearch
              filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
            >
              {companies.map(c => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={fetchData} style={{ width: '100%' }}>刷新</Button>
          </Space>
        )}
        {isMobile ? (
          <List dataSource={data} rowKey="id" loading={loading} pagination={{ defaultPageSize: 20, showSizeChanger: false }} renderItem={renderDynamicCard} />
        ) : (
          <Table
            dataSource={data}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
          />
        )}
      </Card>
    </div>
  );
}
