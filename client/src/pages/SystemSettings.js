import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Form, Grid, Input, InputNumber,
  Row, Select, Space, Spin, Switch, Tabs, Tag, Typography, message,
} from 'antd';
import {
  ApiOutlined, ReloadOutlined, SaveOutlined, SettingOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { systemSettingsApi } from '../api';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const DEFAULT_AI_MODEL_BASE_URL = 'https://ai.midongtech.com/v1';
const DEFAULT_AI_MODEL_NAME = 'gpt-5.5';
const DEFAULT_AI_TIMEOUT_MS = 25000;

const AI_MODEL_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai_compatible', label: 'OpenAI 兼容接口' },
];

function formatTime(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value);
}

function runtimeSourceLabel(source) {
  if (source === 'system') return '系统模型';
  if (source === 'env') return '环境变量模型';
  if (source === 'user') return '个人模型';
  return '规则模式';
}

function testStatusTag(status) {
  if (status === 'success') return <Tag color="green">成功</Tag>;
  if (status === 'failed') return <Tag color="red">失败</Tag>;
  return <Tag>未测试</Tag>;
}

export default function SystemSettings() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm();
  const [setting, setSetting] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const fillForm = useCallback((nextSetting) => {
    form.setFieldsValue({
      provider: nextSetting?.provider || 'openai_compatible',
      model: nextSetting?.model || DEFAULT_AI_MODEL_NAME,
      base_url: nextSetting?.base_url || DEFAULT_AI_MODEL_BASE_URL,
      api_key: '',
      enabled: nextSetting?.enabled !== false,
      timeout_ms: nextSetting?.timeout_ms || DEFAULT_AI_TIMEOUT_MS,
    });
  }, [form]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await systemSettingsApi.getAiModelSetting();
      setSetting(data?.setting || null);
      setRuntimeStatus(data?.runtime_status || null);
      fillForm(data?.setting || null);
    } catch (error) {
      message.error(error.response?.data?.error || '加载系统配置失败');
    } finally {
      setLoading(false);
    }
  }, [fillForm]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await systemSettingsApi.saveAiModelSetting(values);
      setSetting(result?.setting || null);
      setRuntimeStatus(result?.runtime_status || null);
      fillForm(result?.setting || null);
      message.success('系统模型设置已保存');
    } catch (error) {
      message.error(error.response?.data?.error || '保存系统模型设置失败');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const values = await form.validateFields();
    setTesting(true);
    try {
      const result = await systemSettingsApi.testAiModelSetting(values);
      setSetting(result?.setting || setting);
      if (result?.runtime_status) setRuntimeStatus(result.runtime_status);
      message.success(result?.message || '模型连接成功');
    } catch (error) {
      const nextSetting = error.response?.data?.setting;
      if (nextSetting) setSetting(nextSetting);
      if (error.response?.data?.runtime_status) setRuntimeStatus(error.response.data.runtime_status);
      message.error(error.response?.data?.error || '模型连接失败');
    } finally {
      setTesting(false);
    }
  };

  const runtimeTag = useMemo(() => {
    if (!runtimeStatus) return <Tag>未知</Tag>;
    return runtimeStatus.llm_enabled ? <Tag color="green">已启用</Tag> : <Tag color="gold">规则模式</Tag>;
  }, [runtimeStatus]);

  const aiModelTab = (
    <Spin spinning={loading}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="保存后对所有账号生效"
          description="AI训练台会统一使用这里的 Base URL、API Key 和模型名称；API Key 只脱敏展示。"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={15}>
            <Card
              title={<Space><ApiOutlined />模型设置</Space>}
              extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
              bodyStyle={{ padding: isMobile ? 16 : 20 }}
            >
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  provider: 'openai_compatible',
                  model: DEFAULT_AI_MODEL_NAME,
                  base_url: DEFAULT_AI_MODEL_BASE_URL,
                  enabled: true,
                  timeout_ms: DEFAULT_AI_TIMEOUT_MS,
                }}
              >
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item label="服务商" name="provider" rules={[{ required: true, message: '请选择服务商' }]}>
                      <Select options={AI_MODEL_PROVIDER_OPTIONS} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="模型" name="model" rules={[{ required: true, message: '请输入模型名' }]}>
                      <Input placeholder={DEFAULT_AI_MODEL_NAME} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  label="Base URL"
                  name="base_url"
                  extra="公司统一 OpenAI 兼容网关需要填写到 /v1。"
                  rules={[{ required: true, message: '请输入 Base URL' }]}
                >
                  <Input placeholder={DEFAULT_AI_MODEL_BASE_URL} />
                </Form.Item>
                <Form.Item
                  label={setting?.key_mask ? `API Key（已保存 ${setting.key_mask}）` : 'API Key'}
                  name="api_key"
                >
                  <Input.Password placeholder={setting?.has_key ? '不填写则保留当前 Key' : '请输入系统 API Key'} autoComplete="new-password" />
                </Form.Item>
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item label="启用系统模型" name="enabled" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label="超时时间（毫秒）"
                      name="timeout_ms"
                      rules={[{ required: true, message: '请输入超时时间' }]}
                    >
                      <InputNumber min={5000} max={120000} step={1000} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Space wrap>
                  <Button icon={<ThunderboltOutlined />} loading={testing} onClick={test}>测试连接</Button>
                  <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>保存设置</Button>
                </Space>
              </Form>
            </Card>
          </Col>
          <Col xs={24} lg={9}>
            <Card title={<Space><SettingOutlined />连接状态</Space>} bodyStyle={{ padding: isMobile ? 16 : 20 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="运行状态">{runtimeTag}</Descriptions.Item>
                <Descriptions.Item label="配置来源">{runtimeSourceLabel(runtimeStatus?.config_source)}</Descriptions.Item>
                <Descriptions.Item label="当前模型">{runtimeStatus?.model_name || setting?.model || DEFAULT_AI_MODEL_NAME}</Descriptions.Item>
                <Descriptions.Item label="Base URL">{runtimeStatus?.base_url || setting?.base_url || DEFAULT_AI_MODEL_BASE_URL}</Descriptions.Item>
                <Descriptions.Item label="当前 Key">{setting?.has_key ? setting.key_mask : '未配置'}</Descriptions.Item>
                <Descriptions.Item label="最近测试">
                  <Space size={8} wrap>
                    {testStatusTag(setting?.last_test_status)}
                    <Text type="secondary">{setting?.last_test_message || '-'}</Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="测试时间">{formatTime(setting?.last_tested_at)}</Descriptions.Item>
                <Descriptions.Item label="最后更新">
                  <Space direction="vertical" size={0}>
                    <Text>{formatTime(setting?.updated_at)}</Text>
                    {setting?.updated_by_name ? <Text type="secondary">{setting.updated_by_name}</Text> : null}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      </Space>
    </Spin>
  );

  return (
    <div>
      <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>通用配置</Title>
        <Text type="secondary">统一管理系统级参数。</Text>
      </Space>
      <Tabs
        defaultActiveKey="ai-model"
        items={[
          {
            key: 'ai-model',
            label: <Space><ApiOutlined />模型设置</Space>,
            children: aiModelTab,
          },
        ]}
      />
    </div>
  );
}
