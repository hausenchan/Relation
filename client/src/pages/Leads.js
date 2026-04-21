import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Select, Modal, Form, message,
  Drawer, Descriptions, Input, Card, Row, Col, Avatar, DatePicker, Divider, Upload
} from 'antd';
import { RiseOutlined, EditOutlined, UserOutlined, PlusOutlined, BankOutlined, UploadOutlined, PaperClipOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { opportunitiesApi, usersApi, interactionsApi, competitorResearchApi, personsApi, companiesApi, attachmentsApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const opportunityStatusMap = {
  new: { label: '新商机', color: '#4F46E5', bg: '#eef2ff', border: '#c7d2fe' },
  following: { label: '跟进中', color: '#D97706', bg: '#fffbeb', border: '#fde68a' },
  won: { label: '已成交', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  lost: { label: '已关闭', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
};

const interactionTypeMap = {
  visit: '拜访', call: '通话', gift: '送礼', meal: '餐饮',
  wechat: '微信', email: '邮件', meeting: '会议', other: '其他',
};

export default function Leads() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [users, setUsers] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm] = Form.useForm();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  // 添加线索
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [addLoading, setAddLoading] = useState(false);
  const [addSourceType, setAddSourceType] = useState('interaction');
  const [persons, setPersons] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [fileList, setFileList] = useState([]);

  const allowedAttachmentExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'mp4', 'mov', 'avi'];

  const getErrorMessage = (error, fallback) => {
    return error?.response?.data?.error || error?.message || fallback;
  };

  const validateAttachment = (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedAttachmentExt.includes(ext)) {
      message.error('不支持该文件格式');
      return Upload.LIST_IGNORE;
    }
    if (file.size > 50 * 1024 * 1024) {
      message.error('单个文件不能超过 50MB');
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const uploadLeadAttachments = async (sourceType, sourceId, files) => {
    if (!files.length) return [];
    const formData = new FormData();
    formData.append('source_type', sourceType);
    formData.append('source_id', sourceId);
    files.forEach(file => formData.append('files', file.originFileObj || file));
    return attachmentsApi.upload(formData);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterAssignee) params.assignee = filterAssignee;
      const res = await opportunitiesApi.list(params);
      setData(res);
    } catch {
      message.error('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterAssignee]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersApi.listSimple().then(setUsers).catch(() => {});
    personsApi.list().then(setPersons).catch(() => {});
    companiesApi.list().then(setCompanies).catch(() => {});
  }, []);

  const openAddLead = () => {
    setEditTarget(null);
    setAddSourceType('interaction');
    addForm.resetFields();
    addForm.setFieldsValue({ source_type: 'interaction', opportunity_status: 'new', date: dayjs() });
    setFileList([]);
    setAddModalOpen(true);
  };

  const handleAddLead = async () => {
    setAddLoading(true);
    try {
      const values = await addForm.validateFields();
      const dateStr = values.date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
      const nextDateStr = values.next_action_date?.format('YYYY-MM-DD') || null;

      // 编辑模式：直接更新商机
      if (editTarget) {
        await opportunitiesApi.update(editTarget.id, {
          source_type: editTarget.source_type,
          interaction_type: values.interaction_type,
          date: dateStr,
          importance: values.importance || 'normal',
          description: values.description || '',
          outcome: values.outcome || '',
          follow_result: values.follow_result || '',
          next_action: values.next_action || '',
          next_action_date: nextDateStr,
          info_source: values.info_source || '',
          impact: values.impact || '',
          opportunity_title: values.opportunity_title,
          opportunity_status: values.opportunity_status,
          opportunity_assignee: values.opportunity_assignee,
          opportunity_note: values.opportunity_note || '',
        });

        // 上传新附件
        if (fileList.length > 0) {
          try {
            await uploadLeadAttachments(editTarget.source_type, editTarget.source_id, fileList);
          } catch (uploadError) {
            message.warning(getErrorMessage(uploadError, '附件上传失败，但记录已更新'));
          }
        }

        message.success('更新成功');
        setAddModalOpen(false);
        setEditTarget(null);
        load();
        return;
      }

      // 新增模式
      let sourceId;
      if (addSourceType === 'interaction') {
        const res = await interactionsApi.create({
          person_id: values.person_id,
          date: dateStr,
          type: values.interaction_type || 'other',
          importance: values.importance || 'normal',
          description: values.description || '',
          outcome: values.outcome || '',
          follow_result: values.follow_result || '',
          next_action: values.next_action || '',
          next_action_date: nextDateStr,
          opportunity_title: values.opportunity_title,
          opportunity_status: values.opportunity_status,
          opportunity_assignee: values.opportunity_assignee,
          opportunity_note: values.opportunity_note || '',
        });
        sourceId = res.id;
      } else {
        const res = await competitorResearchApi.create({
          company_id: values.company_id,
          date: dateStr,
          importance: values.importance || 'normal',
          title: values.opportunity_title,
          content: values.description || '',
          source: values.info_source || '',
          outcome: values.outcome || '',
          follow_result: values.follow_result || '',
          impact: values.impact || '',
          next_action: values.next_action || '',
          next_action_date: nextDateStr,
          opportunity_title: values.opportunity_title,
          opportunity_status: values.opportunity_status,
          opportunity_assignee: values.opportunity_assignee,
          opportunity_note: values.opportunity_note || '',
        });
        sourceId = res.id;
      }

      // 上传附件
      if (fileList.length > 0) {
        try {
          await uploadLeadAttachments(addSourceType, sourceId, fileList);
        } catch (uploadError) {
          message.warning(getErrorMessage(uploadError, '附件上传失败，但记录已创建'));
        }
      }

      message.success('线索添加成功');
      setAddModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return; // form validation
      message.error(getErrorMessage(err, '操作失败'));
    } finally {
      setAddLoading(false);
    }
  };

  const openEdit = (record) => {
    setEditTarget(record);
    // 复用添加线索表单，填充完整数据
    addForm.setFieldsValue({
      source_type: record.source_type,
      person_id: record.person_id,
      company_id: record.company_id,
      date: record.date ? dayjs(record.date) : null,
      interaction_type: record.type,
      description: record.description,
      outcome: record.outcome,
      follow_result: record.follow_result,
      impact: record.impact,
      next_action: record.next_action,
      next_action_date: record.next_action_date ? dayjs(record.next_action_date) : null,
      importance: record.importance,
      info_source: record.source,
      opportunity_title: record.opportunity_title,
      opportunity_status: record.opportunity_status,
      opportunity_assignee: record.opportunity_assignee,
      opportunity_note: record.opportunity_note,
    });
    setAddSourceType(record.source_type || 'interaction');
    setFileList([]);
    setAddModalOpen(true);
  };

  const handleSave = async () => {
    const values = await editForm.validateFields();
    await opportunitiesApi.update(editTarget.id, { ...values, source_type: editTarget.source_type });
    message.success('更新成功');
    setEditModalOpen(false);
    load();
  };

  const columns = [
    {
      title: '线索ID',
      dataIndex: 'source_id',
      width: 90,
      render: (value) => <Text style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{value}</Text>,
    },
    {
      title: '来源',
      dataIndex: 'source_type',
      width: 110,
      render: (v) => v === 'competitor_research'
        ? <Tag style={{ borderRadius: 6, fontSize: 12 }} color="orange">竞研</Tag>
        : <Tag style={{ borderRadius: 6, fontSize: 12 }} color="blue">互动</Tag>,
    },
    {
      title: '关联对象',
      render: (_, r) => {
        if (r.source_type === 'competitor_research') {
          return (
            <Space size={6} align="center">
              <Avatar size={24} style={{ background: '#f0f5ff', color: '#4F46E5', fontSize: 12 }} icon={<BankOutlined />} />
              <div>
                <Text strong style={{ fontSize: 13, color: '#1f2937' }}>{r.company_name || '-'}</Text>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>公司</div>
              </div>
            </Space>
          );
        }
        return (
          <Space size={6} align="center">
            <Avatar size={24} style={{ background: '#f0fdf4', color: '#059669', fontSize: 12 }} icon={<UserOutlined />} />
            <div>
              <Text strong style={{ fontSize: 13, color: '#1f2937' }}>{r.person_name}</Text>
              {(r.company || r.current_company) && (
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.company || r.current_company}</div>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: '商机标题',
      render: (_, r) => (
        <Button
          type="link"
          style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left', fontWeight: 500, fontSize: 13, color: '#4F46E5' }}
          onClick={async () => {
            setDetailRecord(r);
            setDetailOpen(true);
            setAttachmentsLoading(true);
            try {
              const atts = await attachmentsApi.list({ source_type: r.source_type, source_id: r.source_id });
              setAttachments(atts);
            } catch {
              setAttachments([]);
            } finally {
              setAttachmentsLoading(false);
            }
          }}
        >
          <RiseOutlined style={{ marginRight: 4, fontSize: 12 }} />{r.opportunity_title}
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'opportunity_status',
      width: 100,
      render: v => {
        const s = opportunityStatusMap[v] || { label: v || '-', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
        return (
          <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            color: s.color, background: s.bg, border: `1px solid ${s.border}`,
          }}>
            {s.label}
          </span>
        );
      },
    },
    {
      title: '跟进结果',
      dataIndex: 'follow_result',
      width: 180,
      ellipsis: true,
      render: (value) => <Text style={{ fontSize: 12, color: '#4b5563' }}>{value || '-'}</Text>,
    },
    {
      title: '指派给',
      dataIndex: 'assignee_name',
      width: 110,
      render: v => v
        ? <Space size={4}><Avatar size={20} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', fontSize: 10 }}>{v[0]}</Avatar><Text style={{ fontSize: 13, color: '#374151' }}>{v}</Text></Space>
        : <Text style={{ fontSize: 12, color: '#d1d5db' }}>未指派</Text>,
    },
    {
      title: '互动日期',
      dataIndex: 'date',
      width: 100,
      sorter: (a, b) => a.date?.localeCompare(b.date),
      render: v => <Text style={{ fontSize: 12, color: '#6b7280' }}>{v || '-'}</Text>,
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      width: 90,
      render: v => <Text style={{ fontSize: 12, color: '#9ca3af' }}>{v || '-'}</Text>,
    },
    {
      title: '附件',
      width: 100,
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<PaperClipOutlined />}
          style={{ fontSize: 12, color: '#6b7280' }}
          onClick={async () => {
            try {
              const atts = await attachmentsApi.list({ source_type: r.source_type, source_id: r.source_id });
              if (atts.length === 0) {
                message.info('暂无附件');
                return;
              }
              Modal.info({
                title: '附件列表',
                width: 500,
                content: (
                  <div style={{ marginTop: 16 }}>
                    {atts.map(att => (
                      <div key={att.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {att.filename}
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                              {(att.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <Button
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => attachmentsApi.download(att.id, att.filename).catch(() => message.error('下载失败'))}
                          >
                            下载
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              });
            } catch {
              message.error('加载附件失败');
            }
          }}
        >
          {r.attachment_count || 0}
        </Button>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, r) => (
        <Button type="text" size="small" icon={<EditOutlined />} style={{ color: '#4F46E5', fontSize: 12 }} onClick={() => openEdit(r)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <div>
      {/* 统计概览 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '全部线索', value: data.length, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { label: '新商机', value: data.filter(d => d.opportunity_status === 'new').length, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '跟进中', value: data.filter(d => d.opportunity_status === 'following').length, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          { label: '已成交', value: data.filter(d => d.opportunity_status === 'won').length, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
        ].map((item, idx) => (
          <Col xs={12} sm={6} key={idx}>
            <div className="stat-card" style={{
              background: item.gradient, borderRadius: 10, padding: '14px 18px',
              cursor: 'default',
            }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 筛选与表格 */}
      <Card style={{ borderRadius: 12, border: '1px solid #e8e8ed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Space wrap>
            <Select
              placeholder="商机状态"
              allowClear
              style={{ width: 130 }}
              value={filterStatus || undefined}
              onChange={v => setFilterStatus(v || '')}
            >
              {Object.entries(opportunityStatusMap).map(([k, v]) => (
                <Option key={k} value={k}>{v.label}</Option>
              ))}
            </Select>
            <Select
              placeholder="指派人"
              allowClear
              showSearch
              style={{ width: 160 }}
              value={filterAssignee || undefined}
              onChange={v => setFilterAssignee(v || '')}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddLead}>添加线索</Button>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey={(record) => `${record.source_type}-${record.source_id}`}
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: '暂无线索记录' }}
          expandable={{
            expandedRowRender: r => (
              <div style={{ padding: '12px 20px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f0f0f5' }}>
                {r.description && <div style={{ marginBottom: 6 }}><Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>互动描述：</Text><Text style={{ fontSize: 13, color: '#374151' }}>{r.description}</Text></div>}
                {r.outcome && <div style={{ marginBottom: 6 }}><Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>互动结果：</Text><Text style={{ fontSize: 13, color: '#374151' }}>{r.outcome}</Text></div>}
                {r.follow_result && <div style={{ marginBottom: 6 }}><Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>跟进结果：</Text><Text style={{ fontSize: 13, color: '#374151' }}>{r.follow_result}</Text></div>}
                {r.opportunity_note && <div><Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>商机说明：</Text><Text style={{ fontSize: 13, color: '#374151' }}>{r.opportunity_note}</Text></div>}
              </div>
            ),
            rowExpandable: r => !!(r.description || r.outcome || r.follow_result || r.opportunity_note),
          }}
        />
      </Card>

      <Modal
        title={<span style={{ fontWeight: 600, fontSize: 15, color: '#1f2937' }}>编辑商机信息</span>}
        open={editModalOpen}
        onOk={handleSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="商机标题" name="opportunity_title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="商机状态" name="opportunity_status">
            <Select>
              {Object.entries(opportunityStatusMap).map(([k, v]) => (
                <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="指派跟进人" name="opportunity_assignee">
            <Select
              allowClear
              showSearch
              placeholder="选择系统用户"
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Form.Item>
          <Form.Item label="商机补充说明" name="opportunity_note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={<span style={{ fontWeight: 600, fontSize: 16, color: '#1f2937' }}>商机详情</span>}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={520}
        extra={
          detailRecord && (
            <Button type="primary" ghost icon={<EditOutlined />} style={{ borderRadius: 8 }} onClick={() => { setDetailOpen(false); openEdit(detailRecord); }}>
              编辑
            </Button>
          )
        }
      >
        {detailRecord && (
          <div>
            {/* 顶部概览 */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: 12, marginBottom: 20, border: '1px solid #f0f0f5' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>{detailRecord.opportunity_title}</div>
              <Space size={8}>
                {(() => {
                  const s = opportunityStatusMap[detailRecord.opportunity_status] || { label: detailRecord.opportunity_status, color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
                  return <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>{s.label}</span>;
                })()}
                {detailRecord.assignee_name && <Tag style={{ borderRadius: 6 }} icon={<UserOutlined />}>{detailRecord.assignee_name}</Tag>}
              </Space>
            </div>
            <Descriptions column={1} bordered size="small" labelStyle={{ fontWeight: 500, color: '#6b7280', fontSize: 13, width: 90 }} contentStyle={{ fontSize: 13, color: '#374151' }}>
              <Descriptions.Item label="人脉">
                {detailRecord.person_name}
                {(detailRecord.company || detailRecord.current_company) &&
                  ` (${detailRecord.company || detailRecord.current_company})`}
              </Descriptions.Item>
              <Descriptions.Item label="线索ID">{detailRecord.source_id}</Descriptions.Item>
              <Descriptions.Item label="指派给">{detailRecord.assignee_name || <Text style={{ color: '#d1d5db' }}>未指派</Text>}</Descriptions.Item>
              <Descriptions.Item label="商机说明">{detailRecord.opportunity_note || '-'}</Descriptions.Item>
              <Descriptions.Item label="互动日期">{detailRecord.date}</Descriptions.Item>
              <Descriptions.Item label="互动描述">{detailRecord.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="互动结果">{detailRecord.outcome || '-'}</Descriptions.Item>
              <Descriptions.Item label="跟进结果">{detailRecord.follow_result || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{detailRecord.created_by_name || '-'}</Descriptions.Item>
            </Descriptions>

            {/* 附件列表 */}
            <Divider style={{ margin: '20px 0' }} />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 12 }}>
                <PaperClipOutlined style={{ marginRight: 6 }} />附件
              </div>
              {attachmentsLoading ? (
                <Text style={{ color: '#9ca3af' }}>加载中...</Text>
              ) : attachments.length === 0 ? (
                <Text style={{ color: '#9ca3af' }}>暂无附件</Text>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {attachments.map(att => (
                    <div key={att.id} style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.filename}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                          {(att.size / 1024).toFixed(1)} KB · {att.creator_name || '未知'}
                        </div>
                      </div>
                      <Space size={4}>
                        <Button
                          type="text"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => attachmentsApi.download(att.id, att.filename).catch(() => message.error('下载失败'))}
                        />
                        {att.created_by === JSON.parse(localStorage.getItem('user') || '{}').id && (
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={async () => {
                              try {
                                await attachmentsApi.delete(att.id);
                                message.success('删除成功');
                                const atts = await attachmentsApi.list({ source_type: detailRecord.source_type, source_id: detailRecord.source_id });
                                setAttachments(atts);
                              } catch {
                                message.error('删除失败');
                              }
                            }}
                          />
                        )}
                      </Space>
                    </div>
                  ))}
                </Space>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* 添加/编辑线索 Modal */}
      <Modal
        title={<span style={{ fontWeight: 600, fontSize: 15, color: '#1f2937' }}>{editTarget ? '编辑线索' : '添加线索'}</span>}
        open={addModalOpen}
        onOk={handleAddLead}
        onCancel={() => { setAddModalOpen(false); setEditTarget(null); }}
        confirmLoading={addLoading}
        okText="提交"
        cancelText="取消"
        width={620}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 12 }}>
          {/* 来源类型 */}
          <Form.Item label="线索来源" name="source_type" rules={[{ required: true, message: '请选择线索来源' }]}>
            <Select onChange={v => { setAddSourceType(v); addForm.setFieldsValue({ person_id: undefined, company_id: undefined }); }}>
              <Option value="interaction">互动</Option>
              <Option value="competitor_research">竞研</Option>
            </Select>
          </Form.Item>

          {/* 互动来源 - 关联人脉 + 互动类型 */}
          {addSourceType === 'interaction' && (
            <>
              <Form.Item label="关联人脉" name="person_id" rules={[{ required: true, message: '请选择关联人脉' }]}>
                <Select showSearch placeholder="搜索人脉" optionFilterProp="label"
                  options={persons.map(p => ({ value: p.id, label: `${p.name}${p.company ? ` (${p.company})` : ''}` }))}
                />
              </Form.Item>
              <Form.Item label="互动类型" name="interaction_type" rules={[{ required: true, message: '请选择互动类型' }]}>
                <Select placeholder="选择互动类型">
                  {Object.entries(interactionTypeMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </>
          )}

          {/* 竞研来源 - 关联公司 + 信息来源 */}
          {addSourceType === 'competitor_research' && (
            <>
              <Form.Item label="关联公司" name="company_id" rules={[{ required: true, message: '请选择关联公司' }]}>
                <Select showSearch placeholder="搜索公司" optionFilterProp="label"
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
              <Form.Item label="信息来源" name="info_source">
                <Input placeholder="如：官网、行业报告、客户反馈等" />
              </Form.Item>
            </>
          )}

          <Divider style={{ margin: '8px 0 16px', borderColor: '#f0f0f5' }} />

          {/* 商机信息（通用） */}
          <Form.Item label="商机标题" name="opportunity_title" rules={[{ required: true, message: '请输入商机标题' }]}>
            <Input placeholder="简要描述商机内容" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="商机状态" name="opportunity_status">
                <Select>
                  {Object.entries(opportunityStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="指派跟进人" name="opportunity_assignee">
                <Select allowClear showSearch placeholder="选择跟进人" optionFilterProp="label"
                  options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="商机说明" name="opportunity_note">
            <Input.TextArea rows={2} placeholder="背景、需求、补充说明等" />
          </Form.Item>
          <Form.Item label="跟进结果" name="follow_result">
            <Input.TextArea rows={2} placeholder="填写当前线索跟进结果" />
          </Form.Item>

          <Divider style={{ margin: '8px 0 16px', borderColor: '#f0f0f5' }} />

          {/* 记录详情（通用） */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="日期" name="date" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="重要程度" name="importance">
                <Select placeholder="选择重要程度" allowClear>
                  <Option value="high">重要</Option>
                  <Option value="medium">一般</Option>
                  <Option value="normal">普通</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="详细描述" />
          </Form.Item>
          <Form.Item label="结果" name="outcome">
            <Input.TextArea rows={2} placeholder="结果或收获" />
          </Form.Item>
          {addSourceType === 'competitor_research' && (
            <Form.Item label="影响分析" name="impact">
              <Input.TextArea rows={2} placeholder="对我方业务的影响分析" />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="下一步行动" name="next_action">
                <Input placeholder="后续跟进事项" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下一步日期" name="next_action_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="附件">
            <Upload
              fileList={fileList}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={validateAttachment}
              maxCount={10}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.mp4,.mov,.avi"
            >
              <Button icon={<UploadOutlined />}>选择文件（最多10个，单个最大50MB）</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
