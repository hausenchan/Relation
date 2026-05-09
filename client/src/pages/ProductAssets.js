import React, { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Button, Card, Col, Descriptions, Drawer, Form, Grid, Input, InputNumber,
  List, message, Modal, Row, Select, Space, Table, Tag, Typography, DatePicker, Upload
} from 'antd';
import {
  AppstoreOutlined, BankOutlined, EditOutlined, PlusOutlined, DeleteOutlined,
  BranchesOutlined, WarningOutlined, DownloadOutlined, UploadOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { companySubjectsApi, productAssetsApi, usersApi } from '../api';
import ResizableTable from '../components/ResizableTable';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const budgetTypeMap = {
  zhixiao: { label: '支小', color: 'blue' },
  douxiao: { label: '抖小', color: 'orange' },
  weixiao: { label: '微小', color: 'green' },
  kuaiyingyong: { label: '快应用', color: 'volcano' },
  h5: { label: 'H5', color: 'geekblue' },
  other: { label: '其他', color: 'default' },
};

const platformMap = {
  android: 'Android',
  ios: 'iOS',
  h5: 'H5',
  mini_program: '小程序',
  quick_app: '快应用',
  other: '其他',
};

const launchStatusMap = {
  not_launched: { label: '未上线', color: 'default' },
  launched: { label: '已上线', color: 'blue' },
  running: { label: '投放中', color: 'green' },
  paused: { label: '暂停投放', color: 'orange' },
  offline: { label: '已下线', color: 'red' },
};

const reductionReasonMap = {
  data_quality: '数据质量问题',
  roi: 'ROI 不达标',
  spend_abnormal: '消耗异常',
  conversion_abnormal: '转化异常',
  policy_adjust: '上游政策调整',
  budget_shrink: '预算整体收缩',
  product_material: '产品 / 素材问题',
  settlement_compliance: '结算 / 合规问题',
  competition: '竞争挤压',
  other: '其他',
};

const reductionStatusMap = {
  pending_analysis: { label: '待分析', color: 'default' },
  analyzed: { label: '已分析', color: 'blue' },
  processing: { label: '处理中', color: 'orange' },
  observing: { label: '持续观察', color: 'purple' },
  recovered: { label: '已恢复', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
};

const punishmentObjectMap = {
  entity: '主体',
  app: '应用',
  ad_slot: '广告位',
};

const csvHeaders = [
  ['group_name', '集团名字'],
  ['company_entity', '公司主体'],
  ['app_name', '应用名称'],
  ['appid', 'APPID'],
  ['budget_type', '预算类型'],
  ['platform', '平台'],
  ['app_identifier', '应用标识'],
  ['launch_status', '上线状态'],
  ['owner_name', '运营负责人'],
  ['remark', '备注'],
];

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let quoted = false;
  const normalized = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(v => v !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0];
  return rows.slice(1).map(values => {
    const item = {};
    header.forEach((key, index) => {
      const match = csvHeaders.find(([field, label]) => key === field || key === label);
      if (match) item[match[0]] = values[index] || '';
    });
    return item;
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusTag(map, value) {
  const cfg = map[value] || { label: value || '-', color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

export default function ProductAssets() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    budget_type: '',
    platform: '',
    launch_status: '',
    has_reduction: '',
    reduction_status: '',
    owner_id: '',
    group_name: '',
    company_entity: '',
    company_subject_id: searchParams.get('company_subject_id') || '',
    appid: '',
  });
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetForm] = Form.useForm();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reductionModalOpen, setReductionModalOpen] = useState(false);
  const [editingReduction, setEditingReduction] = useState(null);
  const [reductionForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined && v !== null));
      const data = await productAssetsApi.list(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      message.error(err.response?.data?.error || '产品资产加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersApi.listSimple().then(setUsers).catch(() => {});
    companySubjectsApi.simple().then(setSubjects).catch(() => {});
  }, []);

  const openCreateAsset = () => {
    setEditingAsset(null);
    assetForm.resetFields();
    assetForm.setFieldsValue({ launch_status: 'not_launched' });
    setAssetModalOpen(true);
  };

  const openEditAsset = (record) => {
    setEditingAsset(record);
    assetForm.setFieldsValue({ ...record, company_subject_id: record.company_subject_id || undefined });
    setAssetModalOpen(true);
  };

  const saveAsset = async () => {
    try {
      const values = await assetForm.validateFields();
      if (editingAsset) {
        await productAssetsApi.update(editingAsset.id, values);
        message.success('产品资产已更新');
      } else {
        await productAssetsApi.create(values);
        message.success('产品资产已新增');
      }
      setAssetModalOpen(false);
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
      const data = await productAssetsApi.get(id);
      setDetailRecord(data);
    } catch (err) {
      message.error(err.response?.data?.error || '详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreateReduction = (asset = detailRecord) => {
    setEditingReduction(null);
    reductionForm.resetFields();
    reductionForm.setFieldsValue({
      reduction_date: dayjs(),
      status: 'pending_analysis',
      owner_id: asset?.owner_id,
    });
    setReductionModalOpen(true);
  };

  const openEditReduction = (record) => {
    setEditingReduction(record);
    reductionForm.setFieldsValue({
      ...record,
      reduction_date: record.reduction_date ? dayjs(record.reduction_date) : null,
    });
    setReductionModalOpen(true);
  };

  const saveReduction = async () => {
    try {
      const values = await reductionForm.validateFields();
      const payload = {
        ...values,
        reduction_date: values.reduction_date?.format('YYYY-MM-DD'),
      };
      if (editingReduction) {
        await productAssetsApi.updateReduction(editingReduction.id, payload);
        message.success('核减记录已更新');
      } else {
        await productAssetsApi.createReduction(detailRecord.id, payload);
        message.success('核减记录已新增');
      }
      setReductionModalOpen(false);
      await openDetail(detailRecord.id);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || '保存失败');
    }
  };

  const deleteAsset = (record) => {
    Modal.confirm({
      title: '删除产品资产',
      content: `确定删除「${record.app_name}」吗？相关核减记录也会删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await productAssetsApi.delete(record.id);
        message.success('已删除');
        load();
      },
    });
  };

  const deleteReduction = (record) => {
    Modal.confirm({
      title: '删除核减记录',
      content: '确定删除这条核减记录吗？已关联的策略不会删除，但会失去来源对象。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await productAssetsApi.deleteReduction(record.id);
        message.success('已删除');
        await openDetail(detailRecord.id);
        load();
      },
    });
  };

  const createLinkedStrategy = (reduction) => {
    navigate(`/strategies?action=create&source_type=asset_reduction&source_id=${reduction.id}`);
  };

  const downloadTemplate = () => {
    const sample = {
      group_name: '示例集团',
      company_entity: '示例公司主体',
      app_name: '示例应用',
      appid: 'wx123456',
      budget_type: '支小',
      platform: '小程序',
      app_identifier: 'com.example.app',
      launch_status: '投放中',
      owner_name: '',
      remark: '',
    };
    const csv = [
      csvHeaders.map(([, label]) => csvEscape(label)).join(','),
      csvHeaders.map(([field]) => csvEscape(sample[field])).join(','),
    ].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '产品资产导入模板.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file) => {
    try {
      const text = await file.text();
      const importRows = parseCsv(text);
      if (importRows.length === 0) {
        message.warning('CSV 中没有可导入的数据');
        return Upload.LIST_IGNORE;
      }
      const result = await productAssetsApi.import(importRows);
      if (result.failCount > 0) {
        Modal.warning({
          title: `导入完成：成功 ${result.successCount} 条，失败 ${result.failCount} 条`,
          content: (
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {(result.results || []).filter(r => !r.success).map(r => (
                <div key={r.line}>第 {r.line} 行：{r.error}</div>
              ))}
            </div>
          ),
        });
      } else {
        message.success(`成功导入 ${result.successCount} 条产品资产`);
      }
      load();
    } catch (err) {
      message.error(err.response?.data?.error || '导入失败');
    }
    return Upload.LIST_IGNORE;
  };

  const stats = {
    total: rows.length,
    launched: rows.filter(r => ['launched', 'running'].includes(r.launch_status)).length,
    running: rows.filter(r => r.launch_status === 'running').length,
    reduced: rows.filter(r => Number(r.reduction_count) > 0).length,
    processing: rows.filter(r => ['pending_analysis', 'analyzed', 'processing', 'observing'].includes(r.latest_reduction_status)).length,
  };

  const columns = [
    {
      title: '产品资产',
      key: 'asset',
      width: 280,
      render: (_, record) => (
        <Space size={10}>
          <Avatar icon={<AppstoreOutlined />} style={{ background: '#eef2ff', color: '#4F46E5' }} />
          <div style={{ minWidth: 0 }}>
            <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => openDetail(record)}>
              {record.app_name}
            </Button>
            <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {record.group_name ? `${record.group_name} · ` : ''}{record.company_entity}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '集团',
      dataIndex: 'group_name',
      width: 130,
      render: v => v || '-',
    },
    {
      title: '预算类型',
      dataIndex: 'budget_type',
      width: 100,
      render: v => statusTag(budgetTypeMap, v),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: v => platformMap[v] || '-',
    },
    {
      title: 'APPID',
      dataIndex: 'appid',
      width: 140,
      render: v => v || '-',
    },
    {
      title: '上线状态',
      dataIndex: 'launch_status',
      width: 120,
      render: v => statusTag(launchStatusMap, v),
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 110,
      render: v => v || '-',
    },
    {
      title: '核减',
      key: 'reduction',
      width: 170,
      render: (_, record) => Number(record.reduction_count) > 0 ? (
        <Space direction="vertical" size={0}>
          <Text>{record.reduction_count} 次</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.latest_reduction_date || '-'} {statusTag(reductionStatusMap, record.latest_reduction_status)}
          </Text>
        </Space>
      ) : <Text type="secondary">未核减</Text>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 150,
      render: v => v?.replace('T', ' ').slice(0, 19) || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditAsset(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteAsset(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  const renderAssetCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => openDetail(record)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') openDetail(record);
        }}
        style={{ width: '100%', padding: 14, border: '1px solid #f0f0f0', borderRadius: 12, background: '#fff', cursor: 'pointer' }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Text strong>{record.app_name}</Text>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{record.company_entity}</div>
            </div>
            {statusTag(launchStatusMap, record.launch_status)}
          </div>
          <Space wrap size={[6, 6]}>
            {statusTag(budgetTypeMap, record.budget_type)}
            <Tag>{platformMap[record.platform] || '未填平台'}</Tag>
            <Tag icon={<WarningOutlined />}>{Number(record.reduction_count) > 0 ? `${record.reduction_count} 次核减` : '未核减'}</Tag>
          </Space>
          <Text type="secondary">负责人：{record.owner_name || '-'}</Text>
          <Space size="small" wrap>
            <Button type="link" size="small" onClick={(event) => { event.stopPropagation(); openDetail(record); }}>详情</Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={(event) => { event.stopPropagation(); openEditAsset(record); }}>编辑</Button>
          </Space>
        </Space>
      </div>
    </List.Item>
  );

  const reductionColumns = [
    { title: '核减日期', dataIndex: 'reduction_date', width: 110 },
    { title: '处罚对象', dataIndex: 'punishment_object', width: 100, render: v => punishmentObjectMap[v] || v || '-' },
    { title: '原因', dataIndex: 'reason_type', width: 140, render: v => reductionReasonMap[v] || v || '-' },
    { title: '状态', dataIndex: 'status', width: 110, render: v => statusTag(reductionStatusMap, v) },
    { title: '核减金额', dataIndex: 'reduction_amount', width: 100, render: v => v ?? '-' },
    { title: '负责人', dataIndex: 'owner_name', width: 100, render: v => v || '-' },
    { title: '关联策略', dataIndex: 'strategy_count', width: 100, render: v => v || 0 },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<BranchesOutlined />} onClick={() => createLinkedStrategy(record)}>新增关联策略</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditReduction(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteReduction(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 0 : undefined }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { label: '全部资产', value: stats.total, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
          { label: '已上线', value: stats.launched, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
          { label: '投放中', value: stats.running, gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
          { label: '被核减', value: stats.reduced, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
          { label: '处理中', value: stats.processing, gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
        ].map(item => (
          <Col xs={12} sm={8} md={4} key={item.label}>
            <div style={{ background: item.gradient, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Card style={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : undefined }}>
            <Select placeholder="预算类型" allowClear style={{ width: isMobile ? '100%' : 120 }} value={filters.budget_type || undefined} onChange={v => setFilters({ ...filters, budget_type: v || '' })}>
              {Object.entries(budgetTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
            <Select placeholder="平台" allowClear style={{ width: isMobile ? '100%' : 120 }} value={filters.platform || undefined} onChange={v => setFilters({ ...filters, platform: v || '' })}>
              {Object.entries(platformMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
            <Select placeholder="上线状态" allowClear style={{ width: isMobile ? '100%' : 130 }} value={filters.launch_status || undefined} onChange={v => setFilters({ ...filters, launch_status: v || '' })}>
              {Object.entries(launchStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
            <Select placeholder="是否核减" allowClear style={{ width: isMobile ? '100%' : 120 }} value={filters.has_reduction || undefined} onChange={v => setFilters({ ...filters, has_reduction: v || '' })}>
              <Option value="yes">已核减</Option>
              <Option value="no">未核减</Option>
            </Select>
            <Select placeholder="核减状态" allowClear style={{ width: isMobile ? '100%' : 130 }} value={filters.reduction_status || undefined} onChange={v => setFilters({ ...filters, reduction_status: v || '' })}>
              {Object.entries(reductionStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
            <Select
              placeholder="负责人"
              allowClear
              showSearch
              style={{ width: isMobile ? '100%' : 140 }}
              value={filters.owner_id || undefined}
              onChange={v => setFilters({ ...filters, owner_id: v || '' })}
              options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))}
              optionFilterProp="label"
            />
            <Select
              placeholder="关联主体"
              allowClear
              showSearch
              style={{ width: isMobile ? '100%' : 220 }}
              value={filters.company_subject_id || undefined}
              onChange={v => setFilters({ ...filters, company_subject_id: v || '' })}
              options={subjects.map(s => ({ value: s.id, label: `${s.group_name || '-'} · ${s.company_entity || '-'}` }))}
              optionFilterProp="label"
            />
            <Input placeholder="集团名字" allowClear style={{ width: isMobile ? '100%' : 140 }} value={filters.group_name} onChange={e => setFilters({ ...filters, group_name: e.target.value })} />
            <Input placeholder="公司主体" allowClear style={{ width: isMobile ? '100%' : 160 }} value={filters.company_entity} onChange={e => setFilters({ ...filters, company_entity: e.target.value })} />
            <Input placeholder="APPID" allowClear style={{ width: isMobile ? '100%' : 140 }} value={filters.appid} onChange={e => setFilters({ ...filters, appid: e.target.value })} />
          </Space>
          <Space wrap style={{ width: isMobile ? '100%' : undefined }}>
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate} style={{ width: isMobile ? '100%' : undefined }}>下载模板</Button>
            <Upload accept=".csv" showUploadList={false} beforeUpload={importCsv}>
              <Button icon={<UploadOutlined />} style={{ width: isMobile ? '100%' : undefined }}>CSV 导入</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAsset} style={{ width: isMobile ? '100%' : undefined }}>新增产品资产</Button>
          </Space>
        </div>

        {isMobile ? (
          <List
            dataSource={rows}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: '暂无产品资产' }}
            renderItem={renderAssetCard}
          />
        ) : (
          <ResizableTable
            storageKey="product-assets-table-columns"
            columns={columns}
            dataSource={rows}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条` }}
          />
        )}
      </Card>

      <Modal
        title={editingAsset ? '编辑产品资产' : '新增产品资产'}
        open={assetModalOpen}
        onOk={saveAsset}
        onCancel={() => setAssetModalOpen(false)}
        width={isMobile ? '100%' : 620}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={assetForm} layout="vertical">
          <Form.Item name="app_name" label="应用名称" rules={[{ required: true, message: '请输入应用名称' }]}>
            <Input placeholder="请输入应用名称" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="budget_type" label="预算类型" rules={[{ required: true, message: '请选择预算类型' }]}>
                <Select placeholder="请选择预算类型">
                  {Object.entries(budgetTypeMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="launch_status" label="上线状态" rules={[{ required: true, message: '请选择上线状态' }]}>
                <Select placeholder="请选择上线状态">
                  {Object.entries(launchStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="company_subject_id" label="公司主体" rules={[{ required: true, message: '请选择公司主体' }]}>
            <Select
              showSearch
              placeholder="请选择主体管理中的公司主体"
              options={subjects.map(s => ({ value: s.id, label: `${s.group_name || '-'} · ${s.company_entity || '-'}` }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="platform" label="平台">
                <Select allowClear placeholder="请选择平台">
                  {Object.entries(platformMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="appid" label="APPID">
                <Input placeholder="小程序或应用 APPID" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="app_identifier" label="应用标识">
                <Input placeholder="包名、小程序 ID 等" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="owner_id" label="运营负责人">
            <Select allowClear showSearch optionFilterProp="label" placeholder="请选择负责人" options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="补充说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="产品资产详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 860}
      >
        {detailRecord && !detailLoading && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 100 }}>
              <Descriptions.Item label="应用名称">{detailRecord.app_name}</Descriptions.Item>
              <Descriptions.Item label="集团名字">{detailRecord.group_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="预算类型">{statusTag(budgetTypeMap, detailRecord.budget_type)}</Descriptions.Item>
              <Descriptions.Item label="公司主体">{detailRecord.company_entity}</Descriptions.Item>
              <Descriptions.Item label="平台">{platformMap[detailRecord.platform] || '-'}</Descriptions.Item>
              <Descriptions.Item label="上线状态">{statusTag(launchStatusMap, detailRecord.launch_status)}</Descriptions.Item>
              <Descriptions.Item label="APPID">{detailRecord.appid || '-'}</Descriptions.Item>
              <Descriptions.Item label="应用标识">{detailRecord.app_identifier || '-'}</Descriptions.Item>
              <Descriptions.Item label="运营负责人">{detailRecord.owner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注"><div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.remark || '-'}</div></Descriptions.Item>
            </Descriptions>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong><WarningOutlined /> 核减记录</Text>
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openCreateReduction(detailRecord)}>新增核减</Button>
              </div>
              {isMobile ? (
                <List
                  dataSource={detailRecord.reductions || []}
                  rowKey="id"
                  locale={{ emptyText: '暂无核减记录' }}
                  renderItem={(record) => (
                    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
                      <div style={{ width: '100%', padding: 12, border: '1px solid #f0f0f0', borderRadius: 10 }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                            <Text strong>{record.reduction_date}</Text>
                            {statusTag(reductionStatusMap, record.status)}
                          </Space>
                          <Text>原因：{reductionReasonMap[record.reason_type] || record.reason_type}</Text>
                          <Text>处罚对象：{punishmentObjectMap[record.punishment_object] || record.punishment_object || '-'}</Text>
                          <Text type="secondary">关联策略：{record.strategy_count || 0}</Text>
                          <Space wrap>
                            <Button type="link" size="small" icon={<BranchesOutlined />} onClick={() => createLinkedStrategy(record)}>新增关联策略</Button>
                            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditReduction(record)}>编辑</Button>
                          </Space>
                        </Space>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Table
                  dataSource={detailRecord.reductions || []}
                  rowKey="id"
                  size="small"
                  columns={reductionColumns}
                  expandable={{
                    expandedRowRender: record => (
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label="上游">{record.upstream || '-'}</Descriptions.Item>
                          <Descriptions.Item label="处罚对象">{punishmentObjectMap[record.punishment_object] || record.punishment_object || '-'}</Descriptions.Item>
                          <Descriptions.Item label="核减前预算">{record.before_budget ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="核减后预算">{record.after_budget ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="核减比例">{record.reduction_ratio ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="原因分析"><div style={{ whiteSpace: 'pre-wrap' }}>{record.reason_analysis || '-'}</div></Descriptions.Item>
                          <Descriptions.Item label="影响范围"><div style={{ whiteSpace: 'pre-wrap' }}>{record.impact_scope || '-'}</div></Descriptions.Item>
                        </Descriptions>
                        {(record.strategies || []).length > 0 && (
                          <Space direction="vertical" size={4}>
                            <Text strong>已关联策略</Text>
                            {record.strategies.map(strategy => (
                              <Button
                                key={strategy.id}
                                type="link"
                                size="small"
                                style={{ padding: 0, height: 'auto' }}
                                onClick={() => navigate(`/strategies?id=${strategy.id}`)}
                              >
                                {strategy.id} · {strategy.title}
                              </Button>
                            ))}
                          </Space>
                        )}
                      </Space>
                    ),
                  }}
                  pagination={false}
                />
              )}
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={editingReduction ? '编辑核减记录' : '新增核减记录'}
        open={reductionModalOpen}
        onOk={saveReduction}
        onCancel={() => setReductionModalOpen(false)}
        width={isMobile ? '100%' : 720}
        style={isMobile ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
        okText="保存"
        cancelText="取消"
      >
        <Form form={reductionForm} layout="vertical">
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="reduction_date" label="核减日期" rules={[{ required: true, message: '请选择核减日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="reason_type" label="原因分类" rules={[{ required: true, message: '请选择原因分类' }]}>
                <Select placeholder="请选择原因分类">
                  {Object.entries(reductionReasonMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="status" label="当前状态">
                <Select>
                  {Object.entries(reductionStatusMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="owner_id" label="负责人">
                <Select allowClear showSearch optionFilterProp="label" options={users.map(u => ({ value: u.id, label: u.display_name || u.username }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="punishment_object" label="处罚对象">
                <Select allowClear placeholder="请选择处罚对象">
                  {Object.entries(punishmentObjectMap).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="upstream" label="核减方 / 上游">
                <Input placeholder="平台、渠道、客户等" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="before_budget" label="核减前预算">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="after_budget" label="核减后预算">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="reduction_amount" label="核减金额">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="reduction_ratio" label="核减比例">
                <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reason_analysis" label="原因分析">
            <TextArea rows={3} placeholder="说明被核减的背景和判断" />
          </Form.Item>
          <Form.Item name="impact_scope" label="影响范围">
            <TextArea rows={3} placeholder="说明对预算、收入、投放、资源的影响" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
