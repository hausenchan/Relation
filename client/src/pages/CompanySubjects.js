import React, { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Button, Card, Col, Descriptions, Drawer, Form, Grid, Input, InputNumber,
  List, message, Modal, Row, Select, Space, Table, Tag, Typography, Upload
} from 'antd';
import {
  BankOutlined, DeleteOutlined, EditOutlined, FileProtectOutlined, PlusOutlined,
  UploadOutlined, AppstoreOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { companySubjectsApi } from '../api';
import ResizableTable from '../components/ResizableTable';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

const attachmentTypeMap = {
  legal_person_id_card_front: '法人身份证正面',
  legal_person_id_card_back: '法人身份证反面',
  business_license: '营业执照',
  icp_license: '增值电信许可证',
  network_culture_license: '网络文化经营许可证',
  radio_tv_program_license: '广电节目制作许可证',
  other: '其他',
};

function formatTime(value) {
  return value?.replace('T', ' ').slice(0, 19) || '-';
}

export default function CompanySubjects() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ group_name: '', company_entity: '', legal_person: '', email: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attachmentType, setAttachmentType] = useState('business_license');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
      const data = await companySubjectsApi.list(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      message.error(err.response?.data?.error || '主体列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ mini_program_count: 0, status: 'active' });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await companySubjectsApi.update(editing.id, values);
        message.success('主体已更新');
      } else {
        await companySubjectsApi.create(values);
        message.success('主体已新增');
      }
      setModalOpen(false);
      load();
      if (detailRecord) openDetail(detailRecord.id);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || '保存失败');
    }
  };

  const openDetail = async (recordOrId) => {
    const id = typeof recordOrId === 'object' ? recordOrId.id : recordOrId;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const data = await companySubjectsApi.get(id);
      setDetailRecord(data);
    } catch (err) {
      message.error(err.response?.data?.error || '主体详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteSubject = (record) => {
    Modal.confirm({
      title: '删除主体',
      content: `确定删除「${record.company_entity}」吗？已关联产品资产的主体不能删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await companySubjectsApi.delete(record.id);
        message.success('已删除');
        load();
      },
    });
  };

  const uploadAttachment = async (file) => {
    if (!detailRecord?.id) return Upload.LIST_IGNORE;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('attachment_type', attachmentType);
    try {
      await companySubjectsApi.uploadAttachment(detailRecord.id, formData);
      message.success('附件已上传');
      openDetail(detailRecord.id);
    } catch (err) {
      message.error(err.response?.data?.error || '附件上传失败');
    }
    return Upload.LIST_IGNORE;
  };

  const deleteAttachment = (attachment) => {
    Modal.confirm({
      title: '删除附件',
      content: `确定删除「${attachment.file_name}」吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await companySubjectsApi.deleteAttachment(attachment.id);
        message.success('附件已删除');
        openDetail(detailRecord.id);
      },
    });
  };

  const goProducts = (record = detailRecord) => {
    if (!record?.id) return;
    navigate(`/product-assets?company_subject_id=${record.id}`);
  };

  const stats = {
    total: rows.length,
    active: rows.filter(r => (r.status || 'active') === 'active').length,
    products: rows.reduce((sum, r) => sum + Number(r.product_count || 0), 0),
    attachments: rows.reduce((sum, r) => sum + Number(r.attachment_count || 0), 0),
  };

  const columns = [
    {
      title: '主体',
      key: 'subject',
      width: 280,
      render: (_, record) => (
        <Space size={10}>
          <Avatar icon={<BankOutlined />} style={{ background: '#ecfdf5', color: '#059669' }} />
          <div style={{ minWidth: 0 }}>
            <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => openDetail(record)}>
              {record.company_entity}
            </Button>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{record.group_name || '-'}</div>
          </div>
        </Space>
      ),
    },
    { title: '小程序', dataIndex: 'mini_program_count', width: 90, render: v => v ?? 0 },
    { title: '法人', dataIndex: 'legal_person', width: 110, render: v => v || '-' },
    { title: '法人电话', dataIndex: 'legal_person_phone', width: 140, render: v => v || '-' },
    { title: '邮箱', dataIndex: 'email', width: 180, render: v => v || '-' },
    { title: '产品', dataIndex: 'product_count', width: 90, render: v => <Tag icon={<AppstoreOutlined />}>{v || 0}</Tag> },
    { title: '附件', dataIndex: 'attachment_count', width: 90, render: v => <Tag icon={<FileProtectOutlined />}>{v || 0}</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={(v || 'active') === 'active' ? 'green' : 'default'}>{(v || 'active') === 'active' ? '启用' : '停用'}</Tag> },
    { title: '更新时间', dataIndex: 'updated_at', width: 150, render: formatTime },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => goProducts(record)}>产品</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteSubject(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  const renderCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <div style={{ width: '100%', padding: 14, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <div>
              <Text strong>{record.company_entity}</Text>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{record.group_name || '-'}</div>
            </div>
            <Tag color={(record.status || 'active') === 'active' ? 'green' : 'default'}>{(record.status || 'active') === 'active' ? '启用' : '停用'}</Tag>
          </Space>
          <Text type="secondary">法人：{record.legal_person || '-'}</Text>
          <Space wrap>
            <Tag icon={<AppstoreOutlined />}>{record.product_count || 0} 个产品</Tag>
            <Tag icon={<FileProtectOutlined />}>{record.attachment_count || 0} 个附件</Tag>
          </Space>
          <Space wrap>
            <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
            <Button type="link" size="small" onClick={() => goProducts(record)}>产品资产</Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          </Space>
        </Space>
      </div>
    </List.Item>
  );

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '全部主体', value: stats.total, color: '#4f46e5' },
          { label: '启用主体', value: stats.active, color: '#059669' },
          { label: '关联产品', value: stats.products, color: '#2563eb' },
          { label: '证照附件', value: stats.attachments, color: '#d97706' },
        ].map(item => (
          <Col xs={12} md={6} key={item.label}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: item.color, lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Card style={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
            <Input placeholder="集团名字" allowClear style={{ width: isMobile ? '100%' : 160 }} value={filters.group_name} onChange={e => setFilters({ ...filters, group_name: e.target.value })} />
            <Input placeholder="公司主体" allowClear style={{ width: isMobile ? '100%' : 180 }} value={filters.company_entity} onChange={e => setFilters({ ...filters, company_entity: e.target.value })} />
            <Input placeholder="法人" allowClear style={{ width: isMobile ? '100%' : 140 }} value={filters.legal_person} onChange={e => setFilters({ ...filters, legal_person: e.target.value })} />
            <Input placeholder="邮箱" allowClear style={{ width: isMobile ? '100%' : 180 }} value={filters.email} onChange={e => setFilters({ ...filters, email: e.target.value })} />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ width: isMobile ? '100%' : undefined }}>新增主体</Button>
        </div>

        {isMobile ? (
          <List dataSource={rows} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '暂无主体' }} renderItem={renderCard} />
        ) : (
          <ResizableTable
            storageKey="company-subjects-table-columns"
            columns={columns}
            dataSource={rows}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1350 }}
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条` }}
          />
        )}
      </Card>

      <Modal
        title={editing ? '编辑主体' : '新增主体'}
        open={modalOpen}
        onOk={save}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="group_name" label="集团名字">
                <Input placeholder="可选，主体所属集团或业务集团" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="company_entity" label="公司主体" rules={[{ required: true, message: '请输入公司主体' }]}>
                <Input placeholder="请输入公司主体" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="mini_program_count" label="小程序个数">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Option value="active">启用</Option>
                  <Option value="inactive">停用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="legal_person" label="法人">
                <Input placeholder="法定代表人姓名" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="legal_person_phone" label="法人电话">
                <Input placeholder="法人联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="主体常用联系邮箱" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="其他说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="主体详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={isMobile ? '100%' : 820}>
        {detailRecord && !detailLoading && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Space wrap>
              <Button type="primary" icon={<AppstoreOutlined />} onClick={() => goProducts()}>查看产品资产</Button>
              <Button icon={<EditOutlined />} onClick={() => openEdit(detailRecord)}>编辑主体</Button>
            </Space>
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 120 }}>
              <Descriptions.Item label="集团名字">{detailRecord.group_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="公司主体">{detailRecord.company_entity}</Descriptions.Item>
              <Descriptions.Item label="小程序个数">{detailRecord.mini_program_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="法人">{detailRecord.legal_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="法人电话">{detailRecord.legal_person_phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detailRecord.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="关联产品">{detailRecord.product_count || 0}</Descriptions.Item>
              <Descriptions.Item label="备注"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.remark || '-'}</div></Descriptions.Item>
            </Descriptions>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                <Text strong><FileProtectOutlined /> 主体附件</Text>
                <Space wrap>
                  <Select value={attachmentType} onChange={setAttachmentType} style={{ width: 180 }}>
                    {Object.entries(attachmentTypeMap).map(([key, label]) => <Option key={key} value={key}>{label}</Option>)}
                  </Select>
                  <Upload showUploadList={false} beforeUpload={uploadAttachment}>
                    <Button icon={<UploadOutlined />}>上传附件</Button>
                  </Upload>
                </Space>
              </div>
              <List
                dataSource={detailRecord.attachments || []}
                rowKey="id"
                locale={{ emptyText: '暂无附件' }}
                renderItem={attachment => (
                  <List.Item
                    actions={[
                      <Button key="open" type="link" size="small" href={`/uploads/${attachment.file_path}`} target="_blank">查看</Button>,
                      <Button key="delete" type="link" size="small" danger onClick={() => deleteAttachment(attachment)}>删除</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Avatar icon={<FileProtectOutlined />} style={{ background: '#fef3c7', color: '#d97706' }} />}
                      title={attachment.file_name}
                      description={`${attachmentTypeMap[attachment.attachment_type] || '其他'} · ${attachment.uploaded_by_name || '-'} · ${formatTime(attachment.created_at)}`}
                    />
                  </List.Item>
                )}
              />
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
