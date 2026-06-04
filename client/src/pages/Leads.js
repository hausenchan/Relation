import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Space, Typography, Button, Select, Modal, Form, message, Badge,
  Drawer, Descriptions, Input, Card, Row, Col, Avatar, DatePicker, Divider, Upload, Grid, List
} from 'antd';
import { EditOutlined, UserOutlined, PlusOutlined, BankOutlined, UploadOutlined, PaperClipOutlined, DeleteOutlined, DownloadOutlined, FunnelPlotOutlined, UserAddOutlined, SyncOutlined, TrophyOutlined } from '@ant-design/icons';
import { opportunitiesApi, usersApi, interactionsApi, competitorResearchApi, personsApi, companiesApi, attachmentsApi } from '../api';
import ResizableTable from '../components/ResizableTable';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const listPrimaryTextStyle = { fontSize: 14, color: '#1f2937', lineHeight: 1.6 };
const listSecondaryTextStyle = { fontSize: 12, color: '#6b7280', lineHeight: 1.5 };
const listTableRowStyle = { cursor: 'pointer', fontSize: 13 };
const listPlainTextStyle = { fontSize: 13, color: '#374151' };

const opportunityStatusMap = {
  new: { label: '新商机', color: '#4F46E5', bg: '#eef2ff', border: '#c7d2fe' },
  following: { label: '跟进中', color: '#D97706', bg: '#fffbeb', border: '#fde68a' },
  won: { label: '已成交', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  lost: { label: '已关闭', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
};

const renderTableText = (value, empty = '-') => (
  value
    ? <Text title={value} style={{ ...listPlainTextStyle, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Text>
    : <Text type="secondary" style={{ fontSize: 13 }}>{empty}</Text>
);

const renderShortDate = (value) => (
  value ? <Text style={listPlainTextStyle}>{dayjs(value).format('MM-DD')}</Text> : <Text type="secondary">-</Text>
);

const interactionTypeMap = {
  visit: '拜访', call: '通话', gift: '送礼', meal: '餐饮',
  wechat: '微信', email: '邮件', meeting: '会议', other: '其他',
};

export default function Leads() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
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

  // 添加商机
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

  const openDetail = async (record) => {
    setDetailRecord(record);
    setDetailOpen(true);
    setAttachmentsLoading(true);
    try {
      const atts = await attachmentsApi.list({ source_type: record.source_type, source_id: record.source_id });
      setAttachments(atts);
    } catch {
      setAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  };

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
          watcher_ids: values.watcher_ids || [],
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
          watcher_ids: values.watcher_ids || [],
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
          watcher_ids: values.watcher_ids || [],
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

      message.success('商机添加成功');
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
    // 复用添加商机表单，填充完整数据
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
      watcher_ids: record.watcher_ids ? record.watcher_ids.split(',').map(id => Number(id)).filter(Boolean) : [],
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

  const openAttachments = async (record, event) => {
    event?.stopPropagation?.();
    try {
      const atts = await attachmentsApi.list({ source_type: record.source_type, source_id: record.source_id });
      if (atts.length === 0) {
        message.info('暂无附件');
        return;
      }
      Modal.info({
        title: '附件列表',
        width: isMobile ? '100%' : 500,
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
  };

  const columns = [
    {
      title: '商机ID',
      dataIndex: 'source_id',
      width: 90,
      render: v => <Text strong style={{ fontSize: 13, color: '#374151' }}>{v || '-'}</Text>,
    },
    {
      title: '商机',
      key: 'subject',
      width: 360,
      render: (_, r) => {
        const isCompetitor = r.source_type === 'competitor_research';
        const subjectName = isCompetitor ? (r.company_name || '-') : (r.person_name || '-');
        const companyLine = isCompetitor ? '公司商机' : (r.company || r.current_company || '');
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <Text
                  strong
                  title={r.opportunity_title}
                  style={{ ...listPrimaryTextStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {r.opportunity_title || '-'}
                </Text>
                <Tag style={{ margin: 0, borderRadius: 4, fontSize: 11, lineHeight: '16px', padding: '0 6px', flex: '0 0 auto' }} color={isCompetitor ? 'orange' : 'blue'}>
                  {isCompetitor ? '竞研' : '互动'}
                </Tag>
                {r.attachment_count > 0 && (
                  <Button
                    type="text"
                    size="small"
                    icon={<PaperClipOutlined />}
                    onClick={(e) => openAttachments(r, e)}
                    style={{ padding: '0 4px', height: 18, fontSize: 11, color: '#6b7280', flex: '0 0 auto' }}
                  >
                    {r.attachment_count}
                  </Button>
                )}
              </div>
              <div
                title={`${subjectName}${companyLine && !isCompetitor ? ' · ' + companyLine : ''}`}
                style={{ ...listSecondaryTextStyle, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {subjectName}
                {companyLine && !isCompetitor && <span style={{ color: '#9ca3af' }}> · {companyLine}</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'opportunity_status',
      width: 100,
      render: v => {
        const s = opportunityStatusMap[v] || { label: v || '-' };
        return <Badge status="processing" text={s.label} />;
      },
    },
    {
      title: '指派给',
      dataIndex: 'assignee_name',
      width: 150,
      responsive: ['lg'],
      render: v => renderTableText(v, '未指派'),
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      width: 120,
      responsive: ['lg'],
      render: v => renderTableText(v),
    },
    {
      title: '关注人',
      dataIndex: 'watcher_names',
      width: 160,
      responsive: ['lg'],
      render: v => v
        ? <Text title={v} style={{ display: 'block', maxWidth: 132, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#374151' }}>{v}</Text>
        : <Text style={{ fontSize: 12, color: '#d1d5db' }}>-</Text>,
    },
    {
      title: '最近互动',
      dataIndex: 'date',
      width: 120,
      sorter: (a, b) => (a.date || '').localeCompare(b.date || ''),
      render: renderShortDate,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(r); }}>编辑</Button>
        </Space>
      ),
    },
  ];

  const renderLeadCard = (record) => {
    const status = opportunityStatusMap[record.opportunity_status] || { label: record.opportunity_status || '-', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
    const isCompetitor = record.source_type === 'competitor_research';
    const subjectName = isCompetitor ? (record.company_name || '-') : (record.person_name || '-');
    const subjectSub = isCompetitor ? '公司' : (record.company || record.current_company || '');

    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => openDetail(record)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openDetail(record);
          }}
          style={{
            width: '100%',
            padding: 14,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
          }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 6 }}>{record.opportunity_title}</div>
                <Space size={6} align="center">
                  <Avatar size={24} style={{ background: isCompetitor ? '#f0f5ff' : '#f0fdf4', color: isCompetitor ? '#4F46E5' : '#059669', fontSize: 12 }} icon={isCompetitor ? <BankOutlined /> : <UserOutlined />} />
                  <div>
                    <Text strong style={{ fontSize: 13, color: '#1f2937' }}>{subjectName}</Text>
                    {subjectSub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{subjectSub}</div>}
                  </div>
                </Space>
              </div>
              <Space direction="vertical" size={6} align="end">
                <Tag style={{ borderRadius: 6, fontSize: 12 }} color={isCompetitor ? 'orange' : 'blue'}>
                  {isCompetitor ? '竞研' : '互动'}
                </Tag>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500,
                  color: status.color, background: status.bg, border: `1px solid ${status.border}`,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: status.color, flexShrink: 0,
                  }} />
                  {status.label}
                </span>
              </Space>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Typography.Text type="secondary">指派给：{record.assignee_name || '未指派'}</Typography.Text>
              <Typography.Text type="secondary">日期：{record.date || '-'}</Typography.Text>
              <Typography.Text type="secondary">创建人：{record.created_by_name || '-'}</Typography.Text>
            </div>

            {record.follow_result && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                跟进结果：{record.follow_result}
              </Typography.Paragraph>
            )}

            {record.watcher_names && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                关注人：{record.watcher_names}
              </Typography.Paragraph>
            )}

            <Space size="small" wrap>
              <Button type="link" size="small" onClick={(event) => { event.stopPropagation(); openDetail(record); }}>详情</Button>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={(event) => { event.stopPropagation(); openEdit(record); }}>编辑</Button>
              <Button
                type="link"
                size="small"
                icon={<PaperClipOutlined />}
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    const atts = await attachmentsApi.list({ source_type: record.source_type, source_id: record.source_id });
                    if (atts.length === 0) {
                      message.info('暂无附件');
                      return;
                    }
                    Modal.info({
                      title: '附件列表',
                      width: isMobile ? '100%' : 500,
                      content: (
                        <div style={{ marginTop: 16 }}>
                          {atts.map(att => (
                            <div key={att.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
                附件 {record.attachment_count || 0}
              </Button>
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      {/* 统计概览 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 16 : 24,
          width: '100%',
        }}
      >
        {[
          { label: '全部商机', value: data.length, icon: <FunnelPlotOutlined />, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { label: '新商机', value: data.filter(d => d.opportunity_status === 'new').length, icon: <UserAddOutlined />, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
          { label: '跟进中', value: data.filter(d => d.opportunity_status === 'following').length, icon: <SyncOutlined />, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '已成交', value: data.filter(d => d.opportunity_status === 'won').length, icon: <TrophyOutlined />, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
        ].map((item, idx) => (
          <div key={idx} style={{ minWidth: 0 }}>
            <Card
              className="stat-card"
              style={{ background: item.gradient, borderRadius: 12, border: 'none', cursor: 'default' }}
              styles={{ body: { padding: isMobile ? '16px 18px' : '18px 18px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: isMobile ? 12 : 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.label}</div>
                  <div style={{ fontSize: isMobile ? 28 : 32, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{item.value}</div>
                </div>
                <div style={{ width: isMobile ? 34 : 42, height: isMobile ? 34 : 42, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 20, color: '#fff' }}>
                  {item.icon}
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* 筛选与表格 */}
      <Card style={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
            <Select
              placeholder="商机状态"
              allowClear
              style={{ width: isMobile ? '100%' : 130 }}
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
              style={{ width: isMobile ? '100%' : 160 }}
              value={filterAssignee || undefined}
              onChange={v => setFilterAssignee(v || '')}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddLead} style={{ width: isMobile ? '100%' : undefined }}>添加商机</Button>
        </div>

        {isMobile ? (
          <List
            dataSource={data}
            rowKey={(record) => `${record.source_type}-${record.source_id}`}
            loading={loading}
            pagination={{ defaultPageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: '暂无商机记录' }}
            renderItem={renderLeadCard}
          />
        ) : (
          <ResizableTable
            storageKey="leads-table-columns"
            columns={columns}
            dataSource={data}
            rowKey={(record) => `${record.source_type}-${record.source_id}`}
            loading={loading}
            size="small"
            scroll={{ x: 1150 }}
            tableLayout="fixed"
            pagination={{ defaultPageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            locale={{ emptyText: '暂无商机记录' }}
            onRow={(record) => ({
              onClick: () => openDetail(record),
              style: listTableRowStyle,
            })}
          />
        )}
      </Card>

      <Modal
        title={<span style={{ fontWeight: 600, fontSize: 15, color: '#1f2937' }}>编辑商机信息</span>}
        open={editModalOpen}
        onOk={handleSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
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
        width={isMobile ? '100%' : 520}
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
              <Descriptions.Item label="指派给">{detailRecord.assignee_name || <Text style={{ color: '#d1d5db' }}>未指派</Text>}</Descriptions.Item>
              <Descriptions.Item label="商机说明"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.opportunity_note || '-'}</div></Descriptions.Item>
              <Descriptions.Item label="互动日期">{detailRecord.date}</Descriptions.Item>
              <Descriptions.Item label="互动描述"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.description || '-'}</div></Descriptions.Item>
              <Descriptions.Item label="互动结果"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.outcome || '-'}</div></Descriptions.Item>
              <Descriptions.Item label="跟进结果"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.follow_result || '-'}</div></Descriptions.Item>
              <Descriptions.Item label="关注人">{detailRecord.watcher_names || '-'}</Descriptions.Item>
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

      {/* 添加/编辑商机 Modal */}
      <Modal
        title={<span style={{ fontWeight: 600, fontSize: 15, color: '#1f2937' }}>{editTarget ? '编辑商机' : '添加商机'}</span>}
        open={addModalOpen}
        onOk={handleAddLead}
        onCancel={() => { setAddModalOpen(false); setEditTarget(null); }}
        confirmLoading={addLoading}
        okText="提交"
        cancelText="取消"
        width={isMobile ? '100%' : 620}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 12 }}>
          {/* 来源类型 */}
          <Form.Item label="商机来源" name="source_type" rules={[{ required: true, message: '请选择商机来源' }]}>
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
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="商机状态" name="opportunity_status">
                <Select>
                  {Object.entries(opportunityStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
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
            <Input.TextArea rows={2} placeholder="填写当前商机跟进结果" />
          </Form.Item>
          <Form.Item label="关注人" name="watcher_ids">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="可选择需要关注该商机的人"
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
            />
          </Form.Item>

          <Divider style={{ margin: '8px 0 16px', borderColor: '#f0f0f5' }} />

          {/* 记录详情（通用） */}
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="日期" name="date" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
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
            <Col span={isMobile ? 24 : 12}>
              <Form.Item label="下一步行动" name="next_action">
                <Input placeholder="后续跟进事项" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
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
