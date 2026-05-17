import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, Grid, List, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { resizableTableComponents, useResizableColumns } from '../components/ResizableTable';

export default function ExecutiveCustomers() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
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
  const { columns: resizableColumns, scrollX } = useResizableColumns('executive-customers-table-columns', columns, {
    defaultWidth: 150,
    minWidths: { resources: 150, demands: 150, notes: 150 },
  });

  const renderCustomerCard = (record) => {
    const levelMap = { A: 'A级', B: 'B级', C: 'C级' };
    const levelColorMap = { A: 'red', B: 'orange', C: 'blue' };
    const contactColor = record.days_since_last_contact > 30 ? 'red' : record.days_since_last_contact > 14 ? 'orange' : 'inherit';
    const contactTypeMap = {
      meeting: '会面',
      call: '电话',
      wechat: '微信',
      email: '邮件',
      dinner: '饭局',
      gift: '送礼',
      other: '其他'
    };
    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <Card size="small" style={{ width: '100%' }}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text strong>{record.name}</Typography.Text>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{record.company || '-'} · {record.position || '-'}</div>
              </div>
              <Tag color={levelColorMap[record.relationship_level]}>{levelMap[record.relationship_level] || record.relationship_level}</Tag>
            </div>
            <Space wrap size={[8, 6]}>
              <span style={{ color: contactColor, fontWeight: record.days_since_last_contact > 30 ? 'bold' : 'normal' }}>
                未联系 {record.days_since_last_contact}天
              </span>
              <Typography.Text type="secondary">最后互动：{record.last_contact_date || '-'}</Typography.Text>
              <Typography.Text type="secondary">类型：{contactTypeMap[record.last_contact_type] || record.last_contact_type || '-'}</Typography.Text>
            </Space>
            {record.resources && <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>资源：{record.resources}</Typography.Paragraph>}
            {record.demands && <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>需求：{record.demands}</Typography.Paragraph>}
          </Space>
        </Card>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Card
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} style={{ width: isMobile ? '100%' : undefined }}>刷新</Button>
          </Space>
        }
      >
        {isMobile ? (
          <List dataSource={data} rowKey="id" loading={loading} pagination={{ defaultPageSize: 20, showSizeChanger: false }} renderItem={renderCustomerCard} />
        ) : (
          <Table
            dataSource={data}
            columns={resizableColumns}
            rowKey="id"
            loading={loading}
            components={resizableTableComponents}
            scroll={{ x: scrollX }}
            tableLayout="fixed"
            pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
          />
        )}
      </Card>
    </div>
  );
}
