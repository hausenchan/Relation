import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Modal, Form, Input, Select,
  DatePicker, message, Drawer, Descriptions, Radio, Switch, Popconfirm
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, FlagOutlined
} from '@ant-design/icons';
import { budgetsApi } from '../api';
import { useAuth } from '../AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const statusMap = {
  new_entry: { label: '新入口', color: 'blue' },
  testing:   { label: '测试中', color: 'orange' },
  tested:    { label: '已测通', color: 'green' },
  scaled:    { label: '已放大', color: 'purple' },
};

const potentialMap = {
  low:    { label: '低', color: 'default' },
  medium: { label: '中', color: 'orange' },
  high:   { label: '高', color: 'red' },
};

export default function Budgets() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPotential, setFilterPotential] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPotential) params.potential_level = filterPotential;
      const res = await budgetsApi.list(params);
      setData(res);
    } catch (e) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPotential]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ potential_level: 'medium', status: 'new_entry', has_monetization_bd: false });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      test_start_date: record.test_start_date ? dayjs(record.test_start_date) : null,
      has_monetization_bd: !!record.has_monetization_bd,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      test_start_date: values.test_start_date?.format('YYYY-MM-DD'),
    };
    try {
      if (editing) {
        await budgetsApi.update(editing.id, payload);
        message.success('更新成功');
      } else {
        await budgetsApi.create(payload);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await budgetsApi.delete(id);
      message.success('已删除');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const showDetail = (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: '预算名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      fixed: 'left',
      render: (text, record) => (
        <a onClick={() => showDetail(record)}>{text}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val) => <Tag color={statusMap[val]?.color}>{statusMap[val]?.label}</Tag>,
    },
    {
      title: '潜力等级',
      dataIndex: 'potential_level',
      key: 'potential_level',
      width: 100,
      render: (val) => <Tag color={potentialMap[val]?.color}>{potentialMap[val]?.label}</Tag>,
    },
    { title: '预算源', dataIndex: 'source', key: 'source', width: 120 },
    { title: '对接载体', dataIndex: 'platform', key: 'platform', width: 120 },
    { title: '对接方式', dataIndex: 'method', key: 'method', width: 120 },
    { title: '广告样式', dataIndex: 'ad_format', key: 'ad_format', width: 120 },
    { title: '市场规模', dataIndex: 'market_size', key: 'market_size', width: 120 },
    { title: '竞对量级', dataIndex: 'competitor_scale', key: 'competitor_scale', width: 120 },
    {
      title: '开始测试时间',
      dataIndex: 'test_start_date',
      key: 'test_start_date',
      width: 120,
      render: (val) => val || '-',
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>详情</Button>
          {(record.created_by === user?.id || ['admin', 'sales_director'].includes(user?.role)) && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0 }}>预算管理</Title>
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            value={filterStatus || undefined}
            onChange={setFilterStatus}
          >
            {Object.entries(statusMap).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
          <Select
            placeholder="潜力等级"
            allowClear
            style={{ width: 120 }}
            value={filterPotential || undefined}
            onChange={setFilterPotential}
          >
            {Object.entries(potentialMap).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          新建预算
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1600 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editing ? '编辑预算' : '新建预算'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="预算名称" name="name" rules={[{ required: true, message: '请输入预算名称' }]}>
            <Input placeholder="请输入预算名称" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="预算源" name="source" style={{ flex: 1 }}>
              <Input placeholder="请输入预算源" />
            </Form.Item>
            <Form.Item label="对接载体" name="platform" style={{ flex: 1 }}>
              <Input placeholder="请输入对接载体" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="对接方式" name="method" style={{ flex: 1 }}>
              <Input placeholder="请输入对接方式" />
            </Form.Item>
            <Form.Item label="考核目标" name="target" style={{ flex: 1 }}>
              <Input placeholder="请输入考核目标" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="广告样式" name="ad_format" style={{ flex: 1 }}>
              <Input placeholder="请输入广告样式" />
            </Form.Item>
            <Form.Item label="市场规模" name="market_size" style={{ flex: 1 }}>
              <Input placeholder="请输入市场规模" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="竞对量级" name="competitor_scale" style={{ flex: 1 }}>
              <Input placeholder="请输入竞对量级" />
            </Form.Item>
            <Form.Item label="潜力等级" name="potential_level" style={{ flex: 1 }}>
              <Select>
                <Option value="low">低</Option>
                <Option value="medium">中</Option>
                <Option value="high">高</Option>
              </Select>
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="状态" name="status" style={{ flex: 1 }}>
              <Select>
                <Option value="new_entry">新入口</Option>
                <Option value="testing">测试中</Option>
                <Option value="tested">已测通</Option>
                <Option value="scaled">已放大</Option>
              </Select>
            </Form.Item>
            <Form.Item label="开始测试时间" name="test_start_date" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item label="是否有变现侧BD" name="has_monetization_bd" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item label="更新情况" name="update_notes">
            <TextArea rows={4} placeholder="记录预算的更新情况、进展等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title="预算详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={640}
      >
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="预算名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMap[detailRecord.status]?.color}>{statusMap[detailRecord.status]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="潜力等级">
              <Tag color={potentialMap[detailRecord.potential_level]?.color}>
                {potentialMap[detailRecord.potential_level]?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="预算源">{detailRecord.source || '-'}</Descriptions.Item>
            <Descriptions.Item label="对接载体">{detailRecord.platform || '-'}</Descriptions.Item>
            <Descriptions.Item label="对接方式">{detailRecord.method || '-'}</Descriptions.Item>
            <Descriptions.Item label="考核目标">{detailRecord.target || '-'}</Descriptions.Item>
            <Descriptions.Item label="是否有变现侧BD">
              {detailRecord.has_monetization_bd ? '是' : '否'}
            </Descriptions.Item>
            <Descriptions.Item label="广告样式">{detailRecord.ad_format || '-'}</Descriptions.Item>
            <Descriptions.Item label="市场规模">{detailRecord.market_size || '-'}</Descriptions.Item>
            <Descriptions.Item label="竞对量级">{detailRecord.competitor_scale || '-'}</Descriptions.Item>
            <Descriptions.Item label="开始测试时间">{detailRecord.test_start_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.created_by_name}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {dayjs(detailRecord.created_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {dayjs(detailRecord.updated_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="更新情况">
              <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.update_notes || '-'}</div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
