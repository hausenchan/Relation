import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Card, DatePicker, Descriptions, Drawer, Empty, Grid, Input,
  List, message, Select, Space, Table, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined,
  ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { operationLogsApi } from '../api';

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const actionColorMap = {
  创建: 'green',
  更新: 'blue',
  删除: 'red',
  导入: 'purple',
  审核: 'gold',
  审批: 'gold',
  提交: 'cyan',
  登录: 'green',
  登录失败: 'red',
};

function formatTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function getActionColor(action = '') {
  const key = Object.keys(actionColorMap).find(k => action.includes(k));
  return actionColorMap[key] || 'default';
}

function formatTarget(record) {
  if (record.business_name && record.business_id) return `${record.business_name} #${record.business_id}`;
  if (record.business_name) return record.business_name;
  if (record.business_id) return `#${record.business_id}`;
  return '-';
}

function renderStatusChange(record) {
  if (!record.status_before && !record.status_after) return <Text type="secondary">-</Text>;
  if (!record.status_before) return <Text>{record.status_after || '-'}</Text>;
  return (
    <Space size={4} wrap>
      <Text type="secondary">{record.status_before}</Text>
      <Text type="secondary">→</Text>
      <Text>{record.status_after || '-'}</Text>
    </Space>
  );
}

export default function OperationLogs() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ businessTypes: [], actions: [], operators: [] });
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [filters, setFilters] = useState({});
  const [range, setRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    operationLogsApi.meta()
      .then(setMeta)
      .catch(() => message.error('加载筛选项失败'));
  }, []);

  const queryParams = useMemo(() => {
    const params = {
      ...filters,
      page,
      page_size: pageSize,
    };
    if (range?.[0]) params.start_date = range[0].format('YYYY-MM-DD');
    if (range?.[1]) params.end_date = range[1].format('YYYY-MM-DD');
    return params;
  }, [filters, page, pageSize, range]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await operationLogsApi.list(queryParams);
      setRows(result.items || []);
      setTotal(result.total || 0);
    } catch (e) {
      message.error(e.response?.data?.error || '加载操作日志失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters(prev => {
      const next = { ...prev };
      if (value === undefined || value === null || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const handleSearch = () => updateFilter('keyword', keywordDraft.trim());

  const handleReset = () => {
    setKeywordDraft('');
    setFilters({});
    setRange(null);
    setPage(1);
  };

  const openDetail = async (record) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      const full = await operationLogsApi.get(record.id);
      setDetail(full);
    } catch (e) {
      message.error(e.response?.data?.error || '加载日志详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      fixed: 'left',
      render: formatTime,
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      width: 120,
      render: (value, record) => value || record.operator_id || '-',
    },
    {
      title: '业务类型',
      dataIndex: 'business_type',
      width: 130,
      render: value => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 110,
      render: value => <Tag color={getActionColor(value)}>{value}</Tag>,
    },
    {
      title: '对象',
      width: 190,
      render: (_, record) => (
        <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
          {formatTarget(record)}
        </Paragraph>
      ),
    },
    {
      title: '状态变更',
      width: 260,
      render: (_, record) => renderStatusChange(record),
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 90,
      render: value => value
        ? <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 180,
      render: value => value ? <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{value}</Paragraph> : <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
      ),
    },
  ];

  const renderMobileItem = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{record.business_type}</div>
              <Text type="secondary">{formatTime(record.created_at)}</Text>
            </div>
            {record.success
              ? <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
              : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>}
          </div>
          <Space wrap size={[6, 6]}>
            <Tag color={getActionColor(record.action)}>{record.action}</Tag>
            <Text type="secondary">操作人：{record.operator_name || '-'}</Text>
          </Space>
          <Text>对象：{formatTarget(record)}</Text>
          <div>{renderStatusChange(record)}</div>
          {record.remark && <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{record.remark}</Paragraph>}
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
        </Space>
      </Card>
    </List.Item>
  );

  const detailJson = detail?.details
    ? JSON.stringify(detail.details, null, 2)
    : (detail?.details_json || '');

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索操作人、对象、备注、路径"
              value={keywordDraft}
              onChange={e => setKeywordDraft(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: isMobile ? '100%' : 260 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
          <Text type="secondary">共 {total} 条</Text>
        </Space>

        <Space wrap>
          <RangePicker
            value={range}
            onChange={(value) => { setRange(value); setPage(1); }}
            style={{ width: isMobile ? '100%' : 260 }}
          />
          <Select
            allowClear
            showSearch
            placeholder="操作人"
            value={filters.operator_id}
            onChange={value => updateFilter('operator_id', value)}
            optionFilterProp="label"
            style={{ width: 180 }}
            options={meta.operators.map(u => ({
              value: u.id,
              label: u.display_name || u.username,
            }))}
          />
          <Select
            allowClear
            showSearch
            placeholder="业务类型"
            value={filters.business_type}
            onChange={value => updateFilter('business_type', value)}
            style={{ width: 160 }}
            options={meta.businessTypes.map(value => ({ value, label: value }))}
          />
          <Select
            allowClear
            showSearch
            placeholder="操作"
            value={filters.action}
            onChange={value => updateFilter('action', value)}
            style={{ width: 140 }}
            options={meta.actions.map(value => ({ value, label: value }))}
          />
          <Select
            allowClear
            placeholder="结果"
            value={filters.success}
            onChange={value => updateFilter('success', value)}
            style={{ width: 120 }}
            options={[
              { value: '1', label: '成功' },
              { value: '0', label: '失败' },
            ]}
          />
        </Space>

        {isMobile ? (
          rows.length ? (
            <List
              dataSource={rows}
              renderItem={renderMobileItem}
              loading={loading}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                },
              }}
            />
          ) : <Empty description="暂无操作日志" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            size="small"
            scroll={{ x: 1250 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: value => `共 ${value} 条`,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              },
            }}
          />
        )}
      </Space>

      <Drawer
        title="操作日志详情"
        open={!!detail}
        onClose={() => setDetail(null)}
        width={isMobile ? '100%' : 620}
        loading={detailLoading}
      >
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="时间">{formatTime(detail.created_at)}</Descriptions.Item>
              <Descriptions.Item label="操作人">{detail.operator_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="角色">{detail.operator_role || '-'}</Descriptions.Item>
              <Descriptions.Item label="业务类型">{detail.business_type}</Descriptions.Item>
              <Descriptions.Item label="操作">{detail.action}</Descriptions.Item>
              <Descriptions.Item label="对象">{formatTarget(detail)}</Descriptions.Item>
              <Descriptions.Item label="状态变更">{renderStatusChange(detail)}</Descriptions.Item>
              <Descriptions.Item label="结果">
                {detail.success ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="备注">{detail.remark || '-'}</Descriptions.Item>
              <Descriptions.Item label="错误">{detail.error_message || '-'}</Descriptions.Item>
              <Descriptions.Item label="请求">{detail.method || '-'} {detail.path || '-'}</Descriptions.Item>
              <Descriptions.Item label="IP">{detail.request_ip || '-'}</Descriptions.Item>
            </Descriptions>
            <div>
              <Text strong>请求摘要</Text>
              <pre style={{
                marginTop: 8,
                padding: 12,
                background: '#f8fafc',
                border: '1px solid #edf2f7',
                borderRadius: 8,
                maxHeight: 320,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {detailJson || '无'}
              </pre>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
