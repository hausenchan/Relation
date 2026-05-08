import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, Tag, Space, Popconfirm, Button, Modal, Form, Input, InputNumber, DatePicker, Row, Col, message, Dropdown, Collapse, Divider, Grid, List, Typography, Descriptions, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, CalendarOutlined, CloseCircleOutlined, RiseOutlined, UploadOutlined, EyeOutlined } from '@ant-design/icons';
import { interactionsApi, personsApi, usersApi } from '../api';
import ResizableTable from '../components/ResizableTable';
import AttachmentList from '../components/AttachmentList';
import { validateAttachment, uploadAttachments, ATTACHMENT_ACCEPT } from '../utils/attachments';
import { RichTextEditor, RichTextView, richTextToPlain } from '../components/RichText';
import dayjs from 'dayjs';


const { Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const typeMap = {
  visit: { label: '拜访', color: 'blue' },
  call: { label: '通话', color: 'green' },
  gift: { label: '送礼', color: 'gold' },
  meal: { label: '餐饮', color: 'orange' },
  wechat: { label: '微信', color: 'cyan' },
  email: { label: '邮件', color: 'purple' },
  meeting: { label: '会议', color: 'magenta' },
  other: { label: '其他', color: 'default' },
};

const importanceMap = {
  high: { label: '重要', color: 'red' },
  medium: { label: '中等', color: 'orange' },
  normal: { label: '一般', color: 'default' },
};

const categoryMap = {
  business: { label: '商务圈', color: 'blue' },
  talent:   { label: '人才圈', color: 'green' },
  startup:  { label: '创业圈', color: 'orange' },
  social:   { label: '社交圈', color: 'purple' },
};

const opportunityStatusMap = {
  new: { label: '新商机', color: 'blue' },
  following: { label: '跟进中', color: 'orange' },
  won: { label: '已成交', color: 'green' },
  lost: { label: '已关闭', color: 'default' },
};

export default function Interactions() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [filterImportance, setFilterImportance] = useState('');
  const [dateRange, setDateRange] = useState(null); // { start, end, label }
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [users, setUsers] = useState([]);

  // 快捷日期选项
  const DATE_SHORTCUTS = [
    { label: '今天',     getRange: () => { const d = dayjs().format('YYYY-MM-DD'); return { start: d, end: d }; } },
    { label: '昨天',     getRange: () => { const d = dayjs().subtract(1,'day').format('YYYY-MM-DD'); return { start: d, end: d }; } },
    { label: '最近7天',  getRange: () => ({ start: dayjs().subtract(6,'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }) },
    { label: '最近30天', getRange: () => ({ start: dayjs().subtract(29,'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }) },
    { label: '本月',     getRange: () => ({ start: dayjs().startOf('month').format('YYYY-MM-DD'), end: dayjs().endOf('month').format('YYYY-MM-DD') }) },
  ];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [persons, setPersons] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();
  const interactionType = Form.useWatch('type', form);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filterType) params.type = filterType;
    if (filterCity) params.city = filterCity;
    if (filterWeight) params.weight = filterWeight;
    if (filterImportance) params.importance = filterImportance;
    if (dateRange) { params.date_start = dateRange.start; params.date_end = dateRange.end; }
    const res = await interactionsApi.list(params);
    setData(res);
    setLoading(false);
  }, [filterType, filterCity, filterWeight, filterImportance, dateRange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    personsApi.list({}).then(setPersons);
    usersApi.listSimple().then(setUsers).catch(() => {});
  }, []);

  const handleDelete = async (id) => {
    await interactionsApi.delete(id);
    load();
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ date: dayjs() });
    setFileList([]);
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      date: record.date ? dayjs(record.date) : null,
      next_action_date: record.next_action_date ? dayjs(record.next_action_date) : null,
      opportunity_assignee: record.opportunity_assignee || undefined,
    });
    setFileList([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      date: values.date?.format('YYYY-MM-DD'),
      next_action_date: values.next_action_date?.format('YYYY-MM-DD'),
    };
    let recordId;
    if (editing) {
      await interactionsApi.update(editing.id, payload);
      recordId = editing.id;
      message.success('更新成功');
    } else {
      const res = await interactionsApi.create(payload);
      recordId = res.id;
      message.success('添加成功');
    }
    if (fileList.length > 0) {
      try {
        await uploadAttachments('interaction', recordId, fileList);
      } catch {
        message.warning('附件上传失败，但记录已保存');
      }
    }
    setModalOpen(false);
    setFileList([]);
    load();
  };

  const columns = [
    {
      title: '圈子',
      render: (_, r) => {
        const m = categoryMap[r.person_category];
        return m ? <Tag color={m.color}>{m.label}</Tag> : null;
      },
    },
    {
      title: '姓名',
      dataIndex: 'person_name',
      render: v => v || '-',
    },
    { title: '日期', dataIndex: 'date', sorter: (a, b) => a.date.localeCompare(b.date) },
    {
      title: '类型',
      dataIndex: 'type',
      render: v => <Tag color={typeMap[v]?.color}>{typeMap[v]?.label || v}</Tag>,
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: v => richTextToPlain(v) || '-' },
    {
      title: '重要程度',
      dataIndex: 'importance',
      render: v => {
        const m = importanceMap[v] || importanceMap.normal;
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    { title: '结果', dataIndex: 'outcome', ellipsis: true },
    { title: '下次跟进', dataIndex: 'next_action', ellipsis: true },
    { title: '跟进日期', dataIndex: 'next_action_date' },
    {
      title: '商机',
      render: (_, r) => {
        if (!r.opportunity_title) return null;
        const s = opportunityStatusMap[r.opportunity_status] || { label: r.opportunity_status, color: 'default' };
        return (
          <Space size={4} wrap>
            <Tag color="blue" icon={<RiseOutlined />}>{r.opportunity_title}</Tag>
            <Tag color={s.color}>{s.label}</Tag>
          </Space>
        );
      },
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space onDoubleClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderInteractionCard = (record) => {
    const type = typeMap[record.type] || { label: record.type, color: 'default' };
    const importance = importanceMap[record.importance] || importanceMap.normal;
    const opportunity = record.opportunity_title ? (opportunityStatusMap[record.opportunity_status] || { label: record.opportunity_status, color: 'default' }) : null;

    return (
      <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
        <div
          style={{
            width: '100%',
            padding: 14,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginBottom: 4 }}>{record.person_name || '-'}</div>
                <Space wrap size={[6, 6]}>
                  {record.person_category && <Tag color={categoryMap[record.person_category]?.color}>{categoryMap[record.person_category]?.label}</Tag>}
                  <Tag color={type.color}>{type.label}</Tag>
                  <Tag color={importance.color}>{importance.label}</Tag>
                </Space>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>{record.date || '-'}</Text>
            </div>

            {(record.city || record.weight) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {record.city && <Text type="secondary">城市：{record.city}</Text>}
                {record.weight && <Text type="secondary">权重：{record.weight}</Text>}
              </div>
            )}

            {record.description && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                描述：{richTextToPlain(record.description)}
              </Typography.Paragraph>
            )}
            {record.outcome && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                结果：{record.outcome}
              </Typography.Paragraph>
            )}
            {record.next_action && (
              <Typography.Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
                下次跟进：{record.next_action}
              </Typography.Paragraph>
            )}

            {record.opportunity_title && (
              <Space wrap size={[6, 6]}>
                <Tag color="blue" icon={<RiseOutlined />}>{record.opportunity_title}</Tag>
                {opportunity && <Tag color={opportunity.color}>{opportunity.label}</Tag>}
              </Space>
            )}

            <Space size="small" wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </Space>
          </Space>
        </div>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ width: isMobile ? '100%' : undefined }}>添加记录</Button>
      </div>
      <Space style={{ marginBottom: 16, width: isMobile ? '100%' : undefined }} wrap direction={isMobile ? 'vertical' : 'horizontal'}>
        <Select placeholder="互动类型" allowClear style={{ width: isMobile ? '100%' : 120 }} onChange={setFilterType}>
          {Object.entries(typeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
        </Select>
        <Input.Search
          placeholder="城市"
          allowClear
          style={{ width: isMobile ? '100%' : 120 }}
          onSearch={setFilterCity}
          onChange={e => !e.target.value && setFilterCity('')}
        />
        <Select placeholder="人脉权重" allowClear style={{ width: isMobile ? '100%' : 110 }} value={filterWeight || undefined} onChange={v => setFilterWeight(v || '')}>
          <Option value="high"><Tag color="red">高</Tag></Option>
          <Option value="medium"><Tag color="orange">中</Tag></Option>
          <Option value="low"><Tag color="default">低</Tag></Option>
        </Select>
        <Select placeholder="信息重要程度" allowClear style={{ width: isMobile ? '100%' : 130 }} value={filterImportance || undefined} onChange={v => setFilterImportance(v || '')}>
          {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Option>)}
        </Select>

        {/* 日期范围选择器 */}
        <Dropdown
          trigger={['click']}
          open={customPickerOpen}
          onOpenChange={open => { if (!open) setCustomPickerOpen(false); }}
          dropdownRender={() => (
            <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 12, minWidth: 240 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>快捷选择</div>
              <Space wrap style={{ marginBottom: 12 }}>
                {DATE_SHORTCUTS.map(s => (
                  <Button
                    key={s.label}
                    size="small"
                    type={dateRange?.label === s.label ? 'primary' : 'default'}
                    onClick={() => { setDateRange({ ...s.getRange(), label: s.label }); setCustomPickerOpen(false); }}
                  >
                    {s.label}
                  </Button>
                ))}
              </Space>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>自定义范围</div>
              <DatePicker.RangePicker
                size="small"
                style={{ width: '100%' }}
                onChange={(_, strs) => {
                  if (strs[0] && strs[1]) {
                    setDateRange({ start: strs[0], end: strs[1], label: `${strs[0]} ~ ${strs[1]}` });
                    setCustomPickerOpen(false);
                  }
                }}
              />
            </div>
          )}
        >
          <Button
            icon={<CalendarOutlined />}
            type={dateRange ? 'primary' : 'default'}
            ghost={!!dateRange}
            onClick={() => setCustomPickerOpen(v => !v)}
          >
            {dateRange ? dateRange.label : '日期范围'}
            {dateRange && (
              <CloseCircleOutlined
                style={{ marginLeft: 6, fontSize: 12 }}
                onClick={e => { e.stopPropagation(); setDateRange(null); setCustomPickerOpen(false); }}
              />
            )}
          </Button>
        </Dropdown>
      </Space>
      {isMobile ? (
        <List
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无互动记录' }}
          renderItem={renderInteractionCard}
        />
      ) : (
        <ResizableTable
          storageKey="interactions-table-columns"
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 20 }}
          onRow={(record) => ({
            onDoubleClick: () => setDetailRecord(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Modal
        title={editing ? '编辑互动记录' : '添加互动记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            {!editing && (
              <Col span={24}>
                <Form.Item label="选择人员" name="person_id" rules={[{ required: true }]}>
                  <Select
                    placeholder="选择姓名"
                    showSearch
                    filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                  >
                    {persons.map(p => (
                      <Option key={p.id} value={p.id}>
                        {p.name}
                        {(p.company || p.current_company) && ` (${p.company || p.current_company})`}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="日期" name="date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(typeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            {/* 送礼时显示礼物 */}
            {interactionType === 'gift' && (
              <Col span={isMobile ? 24 : 8}>
                <Form.Item label="礼物" name="gift_name">
                  <Input placeholder="如：茅台、月饼礼盒" />
                </Form.Item>
              </Col>
            )}
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="信息重要程度" name="importance" initialValue="normal">
                <Select>
                  {Object.entries(importanceMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="描述" name="description" valuePropName="value" trigger="onChange">
                <RichTextEditor placeholder="互动描述..." minHeight={120} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="结果/收获" name="outcome">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下次跟进事项" name="next_action">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="跟进日期" name="next_action_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0' }} />
          <Collapse ghost>
            <Collapse.Panel key="opp" header={<span style={{ color: '#1677ff', fontWeight: 500 }}><RiseOutlined /> 商机信息（可选）</span>}>
              <Row gutter={16}>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item label="商机标题" name="opportunity_title">
                    <Input placeholder="简述商机，如：XX采购合作意向" />
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item label="商机状态" name="opportunity_status" initialValue="new">
                    <Select allowClear placeholder="选择状态">
                      {Object.entries(opportunityStatusMap).map(([k, v]) => (
                        <Select.Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="指派跟进人" name="opportunity_assignee">
                    <Select
                      allowClear
                      showSearch
                      placeholder="选择系统用户（指派后对方会收到跟进任务）"
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={users.map(u => ({
                        value: u.id,
                        label: `${u.display_name || u.username}`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="商机补充说明" name="opportunity_note">
                    <Input.TextArea rows={2} placeholder="背景、需求或其他说明" />
                  </Form.Item>
                </Col>
              </Row>
            </Collapse.Panel>
          </Collapse>

          <Form.Item label="附件">
            <Upload
              fileList={fileList}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={validateAttachment}
              maxCount={10}
              accept={ATTACHMENT_ACCEPT}
            >
              <Button icon={<UploadOutlined />}>选择文件（最多10个，单个最大50MB）</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="互动记录详情"
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        width={isMobile ? '100%' : 720}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        footer={[
          <Button key="close" onClick={() => setDetailRecord(null)}>关闭</Button>,
        ]}
      >
        {detailRecord && (() => {
          const r = detailRecord;
          const cat = categoryMap[r.person_category];
          const t = typeMap[r.type] || { label: r.type, color: 'default' };
          const imp = importanceMap[r.importance] || importanceMap.normal;
          const oppStatus = r.opportunity_title
            ? (opportunityStatusMap[r.opportunity_status] || { label: r.opportunity_status, color: 'default' })
            : null;
          const assignee = users.find(u => u.id === r.opportunity_assignee);
          const creator = users.find(u => u.id === r.created_by);
          return (
            <>
              <Descriptions
                size="small"
                column={isMobile ? 1 : 2}
                bordered
                labelStyle={{ width: 110 }}
              >
                <Descriptions.Item label="圈子">
                  {cat ? <Tag color={cat.color}>{cat.label}</Tag> : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="姓名">{r.person_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="日期">{r.date || '-'}</Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Tag color={t.color}>{t.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="重要程度">
                  <Tag color={imp.color}>{imp.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="城市">{r.city || '-'}</Descriptions.Item>
                <Descriptions.Item label="人脉权重">{r.weight || '-'}</Descriptions.Item>
                <Descriptions.Item label="跟进日期">{r.next_action_date || '-'}</Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  <RichTextView value={r.description} />
                </Descriptions.Item>
                <Descriptions.Item label="结果" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.outcome || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="下次跟进" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.next_action || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="商机" span={2}>
                  {r.opportunity_title ? (
                    <Space size={4} wrap>
                      <Tag color="blue" icon={<RiseOutlined />}>{r.opportunity_title}</Tag>
                      {oppStatus && <Tag color={oppStatus.color}>{oppStatus.label}</Tag>}
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机跟进人">
                  {assignee ? (assignee.display_name || assignee.username) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="商机说明" span={isMobile ? 1 : 1}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.opportunity_note || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="创建人">
                  {creator ? (creator.display_name || creator.username) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{r.created_at || '-'}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 20 }}>
                <AttachmentList sourceType="interaction" sourceId={r.id} />
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
