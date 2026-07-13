import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Row,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  ClearOutlined,
  CloudDownloadOutlined,
  CopyOutlined,
  EyeOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { networkCaptureApi } from '../api';

const { Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const diagnosticPath = '/__network_capture_ping';

function formatTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function statusTag(record) {
  if (record?.kind === 'diagnostic') return <Tag color="green">诊断</Tag>;
  if (record?.error_message || record?.status === 'error') return <Tag color="red">异常</Tag>;
  if (record?.status === 'pending' || record?.status === 'receiving') return <Tag color="blue">进行中</Tag>;
  if (record?.status === 'tunneling') return <Tag color="purple">隧道中</Tag>;
  if (record?.status === 'blocked') return <Tag color="red">已拦截</Tag>;
  if (record?.kind === 'connect') return <Tag color="gold">隧道</Tag>;
  const code = Number(record?.status_code);
  if (code >= 500) return <Tag color="red">{code}</Tag>;
  if (code >= 400) return <Tag color="orange">{code}</Tag>;
  if (code >= 300) return <Tag color="cyan">{code}</Tag>;
  if (code >= 200) return <Tag color="green">{code}</Tag>;
  return <Tag>{record?.status || '-'}</Tag>;
}

function methodTag(method) {
  const colorMap = {
    GET: 'green',
    POST: 'blue',
    PUT: 'purple',
    PATCH: 'geekblue',
    DELETE: 'red',
    CONNECT: 'gold',
    RAW: 'red',
  };
  return <Tag color={colorMap[method] || 'default'}>{method || '-'}</Tag>;
}

function copyText(text, successText = '已复制') {
  if (!text) return;
  navigator.clipboard?.writeText(text)
    .then(() => message.success(successText))
    .catch(() => message.error('复制失败，请手动复制'));
}

function renderHeaderBlock(headers) {
  if (!headers || Object.keys(headers).length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Header" />;
  return (
    <Descriptions column={1} size="small" bordered>
      {Object.entries(headers).map(([key, value]) => (
        <Descriptions.Item key={key} label={key}>
          <Text style={{ wordBreak: 'break-all' }}>{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</Text>
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}

function buildProxyAddresses(status) {
  const port = status?.config?.port || 8888;
  const currentHost = window.location.hostname;
  const pageHost = currentHost && !['localhost', '127.0.0.1', '::1'].includes(currentHost)
    ? currentHost
    : '';
  const localAddresses = status?.local_addresses || [];
  const addresses = [
    pageHost,
    ...localAddresses,
    !pageHost && !localAddresses.length ? currentHost : '',
  ].filter(Boolean);
  return [...new Set(addresses)].map(address => `${address}:${port}`);
}

function buildProxyAddress(status) {
  const addresses = buildProxyAddresses(status);
  if (addresses.length) return addresses[0];
  const port = status?.config?.port || 8888;
  return `127.0.0.1:${port}`;
}

function buildDiagnosticUrl(proxyAddress) {
  return `http://${proxyAddress}${diagnosticPath}`;
}

export default function NetworkCapture() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm();
  const [status, setStatus] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const running = Boolean(status?.running);
  const proxyAddresses = useMemo(() => buildProxyAddresses(status), [status]);
  const proxyAddress = buildProxyAddress(status);
  const diagnosticUrl = buildDiagnosticUrl(proxyAddress);

  const loadStatus = useCallback(async () => {
    try {
      const data = await networkCaptureApi.status();
      setStatus(data);
      form.setFieldsValue({
        port: data.config?.port || 8888,
        captureBodies: data.config?.captureBodies !== false,
        maxBodyBytes: data.config?.maxBodyBytes || 65536,
        maxRecords: data.config?.maxRecords || 800,
        allowedClientIps: data.config?.allowedClientIps || '',
      });
      return data;
    } catch (err) {
      message.error(err.response?.data?.error || '加载抓包状态失败');
      return null;
    }
  }, [form]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      setRecords(await networkCaptureApi.records({ limit: 300 }));
    } catch (err) {
      message.error(err.response?.data?.error || '加载抓包记录失败');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadStatus();
      await loadRecords();
    } finally {
      setLoading(false);
    }
  }, [loadRecords, loadStatus]);

  useEffect(() => { refreshAll(); }, [refreshAll]);
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(loadRecords, 2500);
    return () => window.clearInterval(timer);
  }, [loadRecords, running]);

  const stats = useMemo(() => status?.stats || {
    total: records.length,
    http: records.filter(item => item.kind === 'http').length,
    httpsTunnels: records.filter(item => item.kind === 'connect').length,
    errors: records.filter(item => item.error_message).length,
  }, [records, status]);

  const handleStart = async () => {
    try {
      const values = await form.validateFields();
      setActionLoading(true);
      const nextStatus = await networkCaptureApi.start(values);
      setStatus(nextStatus);
      message.success('网络抓包代理已启动');
      await loadRecords();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || '启动失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      setStatus(await networkCaptureApi.stop());
      message.success('网络抓包代理已停止');
    } catch (err) {
      message.error(err.response?.data?.error || '停止失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClear = async () => {
    setActionLoading(true);
    try {
      setStatus(await networkCaptureApi.clear());
      setRecords([]);
      setDetail(null);
      message.success('抓包记录已清空');
    } catch (err) {
      message.error(err.response?.data?.error || '清空失败');
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = async (record) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await networkCaptureApi.getRecord(record.id));
    } catch (err) {
      message.error(err.response?.data?.error || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const exportHar = async () => {
    try {
      const response = await networkCaptureApi.exportHar();
      const blob = response.data;
      const disposition = response.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `network-capture-${dayjs().format('YYYYMMDD-HHmmss')}.har`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(err.response?.data?.error || '导出 HAR 失败');
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 150,
      render: value => <Text type="secondary" style={{ fontSize: 12 }}>{value ? dayjs(value).format('HH:mm:ss') : '-'}</Text>,
    },
    {
      title: '状态',
      width: 96,
      render: (_, record) => statusTag(record),
    },
    {
      title: '方法',
      dataIndex: 'method',
      width: 96,
      render: value => methodTag(value),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      ellipsis: true,
      render: (value, record) => (
        <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
          <Text style={{ maxWidth: isMobile ? 240 : 720 }} ellipsis={{ tooltip: value }}>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.client_ip || '-'} · {record.protocol || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      width: 92,
      render: value => value === null || value === undefined ? '-' : `${value} ms`,
    },
    {
      title: '大小',
      width: 110,
      render: (_, record) => formatBytes((record.request_size || 0) + (record.response_size || 0)),
    },
    {
      title: '操作',
      width: 84,
      fixed: isMobile ? undefined : 'right',
      render: (_, record) => (
        <Tooltip title="查看详情">
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)} />
        </Tooltip>
      ),
    },
  ];

  const guideItems = [
    {
      icon: <WifiOutlined />,
      title: '手机连接同一 Wi-Fi',
      description: '确保 Android 手机和当前服务在同一局域网，手机能够访问上方代理地址。',
    },
    {
      icon: <ApiOutlined />,
      title: '先做连通性测试',
      description: `手机浏览器打开 ${diagnosticUrl}；如果列表出现诊断记录，说明手机已经能连到代理端口。`,
    },
    {
      icon: <MobileOutlined />,
      title: '配置 Wi-Fi 代理',
      description: `Android Wi-Fi 高级设置中选择手动代理，主机填 ${proxyAddress.split(':')[0]}，端口填 ${proxyAddress.split(':')[1]}。`,
    },
    {
      icon: <GlobalOutlined />,
      title: '开始访问 App 或网页',
      description: 'HTTP 请求会显示完整 URL、Header 和文本 Body；HTTPS 当前记录 CONNECT 隧道域名与流量。',
    },
  ];

  return (
    <div style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title={
                <Space>
                  <ApiOutlined />
                  <span>抓包会话</span>
                  <Badge status={running ? 'processing' : 'default'} text={running ? '运行中' : '未启动'} />
                </Space>
              }
              extra={
                <Tooltip title="刷新">
                  <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading} />
                </Tooltip>
              }
              styles={{ body: { paddingBottom: 16 } }}
            >
              <Form form={form} layout="vertical" initialValues={{
                port: 8888,
                captureBodies: true,
                maxBodyBytes: 65536,
                maxRecords: 800,
                allowedClientIps: '',
              }}>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      name="port"
                      label="代理端口"
                      rules={[{ required: true, message: '请输入端口' }]}
                    >
                      <InputNumber min={1024} max={65535} disabled={running} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="maxRecords" label="记录上限">
                      <InputNumber min={50} max={5000} disabled={running} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="captureBodies" label="抓取文本 Body" valuePropName="checked">
                      <Switch disabled={running} checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="maxBodyBytes" label="Body 上限">
                      <InputNumber min={1024} max={1024 * 1024} step={1024} disabled={running} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  name="allowedClientIps"
                  label={
                    <Space size={4}>
                      <span>允许的手机 IP</span>
                      <Tooltip title="留空表示允许局域网内任意设备访问；多个 IP 用英文逗号分隔。">
                        <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                      </Tooltip>
                    </Space>
                  }
                >
                  <Input disabled={running} placeholder="例如：192.168.1.23" />
                </Form.Item>
              </Form>

              <Space wrap style={{ width: '100%' }}>
                {running ? (
                  <Button danger type="primary" icon={<StopOutlined />} loading={actionLoading} onClick={handleStop}>
                    停止抓包
                  </Button>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} loading={actionLoading} onClick={handleStart}>
                    开始抓包
                  </Button>
                )}
                <Popconfirm title="确认清空当前抓包记录？" onConfirm={handleClear} okText="清空" cancelText="取消">
                  <Button icon={<ClearOutlined />} loading={actionLoading}>清空记录</Button>
                </Popconfirm>
                <Button icon={<CloudDownloadOutlined />} onClick={exportHar}>导出 HAR</Button>
              </Space>
            </Card>

            <Card title={<Space><MobileOutlined />手机代理配置</Space>}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="代理地址">
                  <Space>
                    <Text strong>{proxyAddress}</Text>
                    <Tooltip title="复制代理地址">
                      <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(proxyAddress, '代理地址已复制')} />
                    </Tooltip>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="可选代理地址">
                  <Space wrap>
                    {proxyAddresses.length
                      ? proxyAddresses.map(address => (
                        <Tooltip title="点击复制" key={address}>
                          <Tag
                            color={address === proxyAddress ? 'blue' : 'default'}
                            style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                            onClick={() => copyText(address, '代理地址已复制')}
                          >
                            {address}
                          </Tag>
                        </Tooltip>
                      ))
                      : <Text type="secondary">暂无可用局域网地址</Text>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="连通性测试">
                  <Space align="start">
                    <Text style={{ wordBreak: 'break-all' }}>{diagnosticUrl}</Text>
                    <Tooltip title="复制测试地址">
                      <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(diagnosticUrl, '测试地址已复制')} />
                    </Tooltip>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="本机 IP">
                  <Space wrap>
                    {(status?.local_addresses || []).length
                      ? status.local_addresses.map(ip => <Tag key={ip}>{ip}</Tag>)
                      : <Text type="secondary">暂无可用局域网 IP</Text>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="启动时间">{formatTime(status?.started_at)}</Descriptions.Item>
              </Descriptions>

              <List
                style={{ marginTop: 16 }}
                dataSource={guideItems}
                renderItem={(item, index) => (
                  <List.Item style={{ alignItems: 'flex-start', padding: '10px 0' }}>
                    <List.Item.Meta
                      avatar={<span style={{ color: '#4f46e5', fontSize: 18 }}>{item.icon}</span>}
                      title={<span>{index + 1}. {item.title}</span>}
                      description={item.description}
                    />
                  </List.Item>
                )}
              />
            </Card>

            <Alert
              type="warning"
              showIcon
              icon={<SafetyCertificateOutlined />}
              message="HTTPS 解密说明"
              description="当前版本已支持 HTTP 明文抓取和 HTTPS CONNECT 隧道记录。要看到 HTTPS 的完整 path、query、Header 和 Body，需要下一阶段接入 MITM CA 证书生成与 Android 信任配置；遇到证书固定的 App 仍可能无法解密。"
            />
          </Space>
        </Col>

        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={[12, 12]}>
              {[
                { label: '总记录', value: stats.total || 0, color: '#4f46e5' },
                { label: 'HTTP', value: stats.http || 0, color: '#059669' },
                { label: 'HTTPS 隧道', value: stats.httpsTunnels || 0, color: '#d97706' },
                { label: '异常', value: stats.errors || 0, color: '#dc2626' },
              ].map(item => (
                <Col xs={12} md={6} key={item.label}>
                  <Card size="small">
                    <Text type="secondary">{item.label}</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: item.color, lineHeight: '32px' }}>
                      {item.value}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            <Card
              title={<Space><GlobalOutlined />请求记录</Space>}
              extra={
                <Space>
                  {running && <Tag color="processing">自动刷新</Tag>}
                  <Button icon={<ReloadOutlined />} onClick={loadRecords} loading={recordsLoading}>刷新</Button>
                </Space>
              }
            >
              {running && !records.length && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="还没有收到手机连接"
                  description={
                    <Space direction="vertical" size={4}>
                      <span>先用手机浏览器打开连通性测试地址，确认代理端口能访问。</span>
                      <Text code style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{diagnosticUrl}</Text>
                      <span>如果手机浏览器也打不开，通常是手机和电脑不在同一 Wi-Fi、端口被系统防火墙拦截，或服务运行在容器内但 8888 端口没有映射到宿主机。</span>
                    </Space>
                  }
                />
              )}
              <Table
                rowKey="id"
                columns={columns}
                dataSource={records}
                loading={recordsLoading}
                size="middle"
                scroll={{ x: 940 }}
                pagination={{ pageSize: 12, showSizeChanger: false }}
                locale={{ emptyText: <Empty description="暂无抓包记录，先用手机浏览器打开连通性测试地址排查网络是否到达代理" /> }}
              />
            </Card>
          </Space>
        </Col>
      </Row>

      <Drawer
        title="请求详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 760}
      >
        {detailLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>加载中...</div>
        ) : detail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="URL">
                <Space align="start">
                  <Text style={{ wordBreak: 'break-all' }}>{detail.url}</Text>
                  <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(detail.url, 'URL 已复制')} />
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="方法">{methodTag(detail.method)}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(detail)}</Descriptions.Item>
              <Descriptions.Item label="客户端 IP">{detail.client_ip || '-'}</Descriptions.Item>
              <Descriptions.Item label="耗时">{detail.duration_ms === null || detail.duration_ms === undefined ? '-' : `${detail.duration_ms} ms`}</Descriptions.Item>
              <Descriptions.Item label="请求 / 响应大小">{formatBytes(detail.request_size)} / {formatBytes(detail.response_size)}</Descriptions.Item>
              {detail.note && <Descriptions.Item label="说明">{detail.note}</Descriptions.Item>}
              {detail.error_message && <Descriptions.Item label="异常">{detail.error_message}</Descriptions.Item>}
            </Descriptions>

            <Tabs
              items={[
                {
                  key: 'requestHeaders',
                  label: '请求 Header',
                  children: renderHeaderBlock(detail.request_headers),
                },
                {
                  key: 'requestBody',
                  label: '请求 Body',
                  children: detail.request_body_text ? (
                    <>
                      {detail.request_body_truncated && <Alert type="info" showIcon message="Body 内容已按上限截断" style={{ marginBottom: 12 }} />}
                      <TextArea value={detail.request_body_text} rows={10} readOnly />
                    </>
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无请求 Body" />,
                },
                {
                  key: 'responseHeaders',
                  label: '响应 Header',
                  children: renderHeaderBlock(detail.response_headers),
                },
                {
                  key: 'responseBody',
                  label: '响应 Body',
                  children: detail.response_body_text ? (
                    <>
                      {detail.response_body_truncated && <Alert type="info" showIcon message="Body 内容已按上限截断" style={{ marginBottom: 12 }} />}
                      <TextArea value={detail.response_body_text} rows={14} readOnly />
                    </>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={detail.kind === 'connect' ? 'HTTPS 隧道记录没有明文 Body' : '暂无响应 Body'}
                    />
                  ),
                },
              ]}
            />
          </Space>
        ) : (
          <Empty description="请选择一条请求记录" />
        )}
      </Drawer>

    </div>
  );
}
