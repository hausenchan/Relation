import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

export default function ExecutiveCustomers() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/executive/key-customers');
      setData(res.data);
    } catch (err) {
      console.error('获取重点客户失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '公司', dataIndex: 'company', key: 'company', width: 150 },
    { title: '职位', dataIndex: 'position', key: 'position', width: 150 },
    {
      title: '关系等级',
      dataIndex: 'relationship_level',
      key: 'relationship_level',
      width: 100,
      render: (val) => {
        const map = { A: 'A级', B: 'B级', C: 'C级' };
        const colorMap = { A: 'red', B: 'orange', C: 'blue' };
        return <Tag color={colorMap[val]}>{map[val] || val}</Tag>;
      }
    },
    {
      title: '未联系天数',
      dataIndex: 'days_since_last_contact',
      key: 'days_since_last_contact',
      width: 120,
      sorter: (a, b) => a.days_since_last_contact - b.days_since_last_contact,
      defaultSortOrder: 'descend',
      render: (val) => {
        let color = 'inherit';
        if (val > 30) color = 'red';
        else if (val > 14) color = 'orange';
        return <span style={{ color, fontWeight: val > 30 ? 'bold' : 'normal' }}>{val}天</span>;
      }
    },
    {
      title: '最后互动日期',
      dataIndex: 'last_contact_date',
      key: 'last_contact_date',
      width: 120
    },
    {
      title: '最后互动类型',
      dataIndex: 'last_contact_type',
      key: 'last_contact_type',
      width: 120,
      render: (val) => {
        const map = {
          meeting: '会面',
          call: '电话',
          wechat: '微信',
          email: '邮件',
          dinner: '饭局',
          gift: '送礼',
          other: '其他'
        };
        return map[val] || val;
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
