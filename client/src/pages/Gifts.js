import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space,
  Tag, Popconfirm, message, Typography, Divider, Row, Col, Grid, List, Card, Upload
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, PaperClipOutlined } from '@ant-design/icons';
import { giftsApi } from '../api';
import AttachmentList from '../components/AttachmentList';
import { validateAttachment, uploadAttachments, ATTACHMENT_ACCEPT } from '../utils/attachments';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const CATEGORIES = ['节日礼品', '日常维护', '高端礼品', '食品饮料', '文创周边', '其他'];

export default function GiftsPage() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await giftsApi.list();
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setFileList([]);
    form.resetFields();
    form.setFieldsValue({ unit: '个', stock: 0 });
    setModalOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setFileList([]);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const giftId = editing ? editing.id : (await giftsApi.create(values)).id;
      if (editing) {
        await giftsApi.update(editing.id, values);
      }
      if (fileList.length > 0) {
        try {
          await uploadAttachments('gift', giftId, fileList);
        } catch {
          message.warning('附件上传失败，但礼品信息已保存');
        }
      }
      message.success(editing ? '已更新' : '已添加');
      setFileList([]);
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
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
    { title: '附件', dataIndex: 'attachment_count', width: 90, render: v => <Tag icon={<PaperClipOutlined />}>{v || 0}</Tag> },
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

  const renderGiftCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginBottom: 4 }}>{record.name}</div>
              <Space wrap size={[6, 6]}>
                {record.category && <Tag>{record.category}</Tag>}
                <Tag color={record.stock <= 5 ? 'red' : record.stock <= 20 ? 'orange' : 'green'}>
                  库存 {record.stock} {record.unit}
                </Tag>
                <Tag icon={<PaperClipOutlined />}>附件 {record.attachment_count || 0}</Tag>
              </Space>
            </div>
            <Text strong style={{ color: '#fa8c16' }}>¥{(record.price || 0).toFixed(2)}</Text>
          </div>

          {record.description && (
            <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
              描述：{record.description}
            </Typography.Paragraph>
          )}
          {record.notes && (
            <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
              备注：{record.notes}
            </Typography.Paragraph>
          )}

          <Space size="small" wrap>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
            <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </Space>
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加礼品</Button>
      </div>

      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ defaultPageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无礼品数据' }}
          renderItem={renderGiftCard}
        />
      ) : (
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small" pagination={{ defaultPageSize: 20 }} />
      )}

      <Modal
        title={editing ? '编辑礼品' : '添加礼品'}
        open={modalOpen}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => { setModalOpen(false); setFileList([]); }}
        okText="保存" cancelText="取消"
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 16}>
              <Form.Item label="礼品名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="分类" name="category">
                <Select allowClear>
                  {CATEGORIES.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="单价（元）" name="price">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="库存数量" name="stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
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
            <Col span={24}>
              <Form.Item label="附件">
                <Upload
                  fileList={fileList}
                  onChange={({ fileList: nextFileList }) => setFileList(nextFileList)}
                  beforeUpload={validateAttachment}
                  maxCount={10}
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                >
                  <Button icon={<UploadOutlined />}>选择文件（最多10个，单个最大100MB）</Button>
                </Upload>
              </Form.Item>
            </Col>
            {editing && (
              <Col span={24}>
                <Divider style={{ margin: '8px 0 12px' }} />
                <AttachmentList sourceType="gift" sourceId={editing.id} title="已上传附件" />
              </Col>
            )}
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
