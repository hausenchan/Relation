import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space,
  Tag, Popconfirm, message, Typography, Divider, Row, Col
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { giftsApi } from '../api';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const CATEGORIES = ['节日礼品', '日常维护', '高端礼品', '食品饮料', '文创周边', '其他'];

export default function GiftsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await giftsApi.list();
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ unit: '个', stock: 0 }); setModalOpen(true); };
  const openEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await giftsApi.update(editing.id, values);
      message.success('已更新');
    } else {
      await giftsApi.create(values);
      message.success('已添加');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await giftsApi.delete(id);
    message.success('已删除');
    load();
  };

  const columns = [
    { title: '礼品名称', dataIndex: 'name', render: v => <Text strong>{v}</Text> },
    { title: '分类', dataIndex: 'category', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: '单价', dataIndex: 'price', render: v => `¥${(v || 0).toFixed(2)}` },
    {
      title: '库存',
      render: (_, r) => (
        <Text style={{ color: r.stock <= 5 ? '#ff4d4f' : r.stock <= 20 ? '#fa8c16' : '#52c41a', fontWeight: 600 }}>
          {r.stock} {r.unit}
        </Text>
      ),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: v => v || '-' },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加礼品</Button>
      </div>

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal
        title={editing ? '编辑礼品' : '添加礼品'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存" cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item label="礼品名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="分类" name="category">
                <Select allowClear>
                  {CATEGORIES.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="单价（元）" name="price">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="库存数量" name="stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="单位" name="unit">
                <Select>
                  {['个', '套', '盒', '瓶', '份', '张'].map(u => <Option key={u} value={u}>{u}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="描述" name="description">
                <TextArea rows={2} placeholder="礼品规格、适用场景..." />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
