import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Table, Modal, Form, Input, AutoComplete, Space, Tag, message, Popconfirm, Descriptions, Grid, List, Switch, Drawer, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import axios from 'axios';

const ROLE_LABEL = { ceo: 'CEO', coo: 'COO', cto: 'CTO', cmo: 'CMO' };
const ROLE_DESC = {
  ceo: '其他岗位',
  coo: '产品 / 运营',
  cto: '研发 / 技术',
  cmo: '商务 / 销售'
};

export default function RecruitRadarConfig() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [targets, setTargets] = useState([]);
  const [bossStatus, setBossStatus] = useState({});
  const [dingtalkStatus, setDingtalkStatus] = useState({});
  const [targetModal, setTargetModal] = useState(false);
  const [cookieModal, setCookieModal] = useState(false);
  const [dingtalkModal, setDingtalkModal] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companySearching, setCompanySearching] = useState(false);
  const searchTimerRef = useRef(null);
  const [targetForm] = Form.useForm();
  const [cookieForm] = Form.useForm();
  const [dingtalkForm] = Form.useForm();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = () => {
    fetchTargets();
    fetchBossStatus();
    fetchDingtalkStatus();
  };

  const fetchTargets = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/targets');
      setTargets(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchBossStatus = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/boss-status');
      setBossStatus(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchDingtalkStatus = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/dingtalk-status');
      setDingtalkStatus(res.data);
    } catch (err) { console.error(err); }
  };

  const handleAddTarget = async (values) => {
    try {
      await axios.post('/api/boss-watcher/targets', values);
      message.success('添加成功');
      setTargetModal(false);
      targetForm.resetFields();
      setCompanyOptions([]);
      fetchTargets();
    } catch (err) {
      message.error(err.response?.data?.error || '添加失败');
    }
  };

  const searchCompany = (keyword) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!keyword || keyword.length < 2) {
      setCompanyOptions([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setCompanySearching(true);
      try {
        const res = await axios.get('/api/boss-watcher/companies/search', { params: { keyword } });
        const opts = (res.data || []).map(c => ({
          value: c.company_name,
          label: (
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <span><strong>{c.company_name}</strong> <Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.boss_company_id}</Typography.Text></span>
              {(c.industry || c.scale) && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{[c.industry, c.scale].filter(Boolean).join(' · ')}</Typography.Text>}
            </Space>
          ),
          data: c
        }));
        setCompanyOptions(opts);
      } catch (err) {
        setCompanyOptions([]);
      } finally {
        setCompanySearching(false);
      }
    }, 400);
  };

  const handleSelectCompany = (_value, option) => {
    if (option?.data) {
      targetForm.setFieldsValue({
        company_name: option.data.company_name,
        boss_company_id: option.data.boss_company_id
      });
    }
  };

  const handleDeleteTarget = async (id) => {
    await axios.delete(`/api/boss-watcher/targets/${id}`);
    message.success('已删除');
    fetchTargets();
  };

  const handleToggleTarget = async (id, enabled) => {
    await axios.put(`/api/boss-watcher/targets/${id}`, { enabled: enabled ? 1 : 0 });
    fetchTargets();
  };

  const handleSaveCookie = async (values) => {
    try {
      await axios.post('/api/boss-watcher/boss-cookie', { cookie: values.cookie });
      message.success('Cookie 已保存');
      setCookieModal(false);
      cookieForm.resetFields();
      fetchBossStatus();
    } catch (err) {
      message.error('保存失败');
    }
  };

  const handleSaveDingtalk = async (values) => {
    try {
      const { appKey, appSecret, agentId, baseUrl, ceo, coo, cto, cmo } = values;
      const receivers = {};
      if (ceo) receivers.ceo = ceo;
      if (coo) receivers.coo = coo;
      if (cto) receivers.cto = cto;
      if (cmo) receivers.cmo = cmo;
      await axios.post('/api/boss-watcher/dingtalk-config', { appKey, appSecret, agentId, baseUrl, receivers });
      message.success('钉钉配置已保存');
      setDingtalkModal(false);
      dingtalkForm.resetFields();
      fetchDingtalkStatus();
    } catch (err) {
      message.error(err.response?.data?.error || '保存失败');
    }
  };

  const handleSyncPositions = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/boss-watcher/positions/sync');
      message.success(`同步完成，共 ${res.data.count} 个岗位`);
    } catch (err) {
      message.error(err.response?.data?.error || '同步失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTestDingtalk = async () => {
    try {
      const res = await axios.post('/api/boss-watcher/dingtalk-test');
      const failed = (res.data.results || []).filter(r => !r.success);
      if (failed.length === 0) {
        message.success('测试消息已发送，请在钉钉查收');
      } else {
        message.warning(`部分发送失败：${failed.map(f => `${ROLE_LABEL[f.role]}(${f.error})`).join(', ')}`);
      }
    } catch (err) {
      message.error(err.response?.data?.error || '发送失败');
    }
  };

  const handlePreview = async () => {
    try {
      const res = await axios.get('/api/boss-watcher/dispatch-preview');
      setPreviewData(res.data);
      setPreviewOpen(true);
    } catch (err) {
      message.error(err.response?.data?.error || '加载失败');
    }
  };

  const openDingtalkModal = () => {
    dingtalkForm.setFieldsValue({
      appKey: undefined,
      appSecret: undefined,
      agentId: dingtalkStatus.agentId || undefined,
      baseUrl: dingtalkStatus.baseUrl || undefined,
      ceo: dingtalkStatus.receivers?.ceo,
      coo: dingtalkStatus.receivers?.coo,
      cto: dingtalkStatus.receivers?.cto,
      cmo: dingtalkStatus.receivers?.cmo,
    });
    setDingtalkModal(true);
  };

  const targetColumns = [
    { title: '公司名称', dataIndex: 'company_name', key: 'company_name' },
    { title: 'Boss 公司ID', dataIndex: 'boss_company_id', key: 'boss_company_id', ellipsis: true },
    { title: '备注', dataIndex: 'keyword_memo', key: 'keyword_memo', ellipsis: true },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (val, record) => <Switch checked={val === 1} onChange={(v) => handleToggleTarget(record.id, v)} size="small" />
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_, record) => (
        <Popconfirm title="确认删除？" onConfirm={() => handleDeleteTarget(record.id)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ];

  const renderTargetCard = (record) => (
    <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
      <Card size="small" style={{ width: '100%' }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{record.company_name}</strong>
            <Space>
              <Switch checked={record.enabled === 1} onChange={(v) => handleToggleTarget(record.id, v)} size="small" />
              <Popconfirm title="确认删除？" onConfirm={() => handleDeleteTarget(record.id)}>
                <Button type="link" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          </div>
          <span style={{ fontSize: 12, color: '#999' }}>ID: {record.boss_company_id}</span>
          {record.keyword_memo && <span style={{ fontSize: 12 }}>备注: {record.keyword_memo}</span>}
        </Space>
      </Card>
    </List.Item>
  );

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 账号状态 */}
        <Card title="系统状态" size="small">
          <Descriptions column={isMobile ? 1 : 3} size="small">
            <Descriptions.Item label="Boss 账号">
              {bossStatus.status === 'active' ? <Tag icon={<CheckCircleOutlined />} color="success">登录有效</Tag> :
               bossStatus.status === 'expired' ? <Tag icon={<CloseCircleOutlined />} color="error">已失效</Tag> :
               <Tag color="default">未配置</Tag>}
              <Button type="link" size="small" onClick={() => setCookieModal(true)}>
                {bossStatus.status === 'no_session' ? '配置' : '更新'}
              </Button>
            </Descriptions.Item>
            <Descriptions.Item label="钉钉推送">
              {dingtalkStatus.configured ? <Tag icon={<CheckCircleOutlined />} color="success">已配置</Tag> : <Tag color="default">未配置</Tag>}
              <Button type="link" size="small" onClick={openDingtalkModal}>
                {dingtalkStatus.configured ? '修改' : '配置'}
              </Button>
              {dingtalkStatus.configured && (
                <>
                  <Button type="link" size="small" onClick={handleTestDingtalk}>测试</Button>
                  <Button type="link" size="small" onClick={handlePreview}>分发预览</Button>
                </>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="岗位同步">
              <Button type="link" size="small" icon={<SyncOutlined />} loading={loading} onClick={handleSyncPositions}>
                同步在招岗位
              </Button>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 目标公司 */}
        <Card
          title="监控目标公司"
          size="small"
          extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setTargetModal(true)}>添加</Button>}
        >
          {isMobile ? (
            <List dataSource={targets} rowKey="id" renderItem={renderTargetCard} />
          ) : (
            <Table dataSource={targets} columns={targetColumns} rowKey="id" size="small" pagination={false} />
          )}
        </Card>
      </Space>

      {/* 添加目标公司弹窗 */}
      <Modal title="添加监控公司" open={targetModal} onCancel={() => { setTargetModal(false); setCompanyOptions([]); }} onOk={() => targetForm.submit()} destroyOnClose>
        <Form form={targetForm} onFinish={handleAddTarget} layout="vertical">
          <Form.Item name="company_name" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}
            extra="输入 2 个字以上自动搜索 Boss 在搜公司，选中后自动填 ID；找不到也可手填">
            <AutoComplete
              options={companyOptions}
              onSearch={searchCompany}
              onSelect={handleSelectCompany}
              placeholder="如：字节跳动"
              allowClear
              notFoundContent={companySearching ? '搜索中...' : null}
            />
          </Form.Item>
          <Form.Item name="boss_company_id" label="Boss 公司ID" rules={[{ required: true, message: '请输入 Boss 公司ID' }]}
            extra="选中搜索结果会自动填充；也可手动从 Boss 公司主页 URL 复制（如 encXXXXXX）">
            <Input placeholder="如：enc1234567890" />
          </Form.Item>
          <Form.Item name="keyword_memo" label="备注">
            <Input placeholder="可选，如：主要竞品" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Boss Cookie 弹窗 */}
      <Modal title="配置 Boss Cookie" open={cookieModal} onCancel={() => setCookieModal(false)} onOk={() => cookieForm.submit()} destroyOnClose>
        <Form form={cookieForm} onFinish={handleSaveCookie} layout="vertical">
          <Form.Item name="cookie" label="Cookie" rules={[{ required: true, message: '请粘贴 Cookie' }]}
            extra="Chrome → F12 → Application → Cookies → www.zhipin.com → 复制所有 cookie 值">
            <Input.TextArea rows={4} placeholder="粘贴完整 Cookie 字符串" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 钉钉配置弹窗 */}
      <Modal title="钉钉推送配置" open={dingtalkModal} onCancel={() => setDingtalkModal(false)} onOk={() => dingtalkForm.submit()} destroyOnClose width={600}>
        <Form form={dingtalkForm} onFinish={handleSaveDingtalk} layout="vertical">
          <Form.Item name="appKey" label="AppKey" rules={[{ required: true }]}>
            <Input placeholder="钉钉应用 AppKey" />
          </Form.Item>
          <Form.Item name="appSecret" label="AppSecret" rules={[{ required: true }]}>
            <Input.Password placeholder="钉钉应用 AppSecret" />
          </Form.Item>
          <Form.Item name="agentId" label="AgentId" rules={[{ required: true }]}>
            <Input placeholder="钉钉应用 AgentId" />
          </Form.Item>
          <Form.Item name="baseUrl" label="系统访问地址（可选）" extra="用于钉钉消息中拼接“查看详情”链接，如 https://relation.example.com">
            <Input placeholder="https://your-domain" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            按岗位分发：产品/运营 → COO，研发/技术 → CTO，商务/销售 → CMO，其他 → CEO
          </Typography.Text>
          {['ceo', 'coo', 'cto', 'cmo'].map(r => (
            <Form.Item key={r} name={r} label={`${ROLE_LABEL[r]}（${ROLE_DESC[r]}）UserId`}>
              <Input placeholder="钉钉 userId，可留空" />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      <Drawer title="分发规则预览" open={previewOpen} onClose={() => setPreviewOpen(false)} width={isMobile ? '100%' : 480}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text type="secondary">以下是当前在抓岗位按关键词归属到各位老板的分桶结果：</Typography.Text>
          {['ceo', 'coo', 'cto', 'cmo'].map(r => (
            <Card key={r} size="small" title={`${ROLE_LABEL[r]}（${ROLE_DESC[r]}）· ${previewData?.[r]?.length || 0} 个岗位`}>
              {previewData?.[r]?.length > 0 ? (
                <List
                  size="small"
                  dataSource={previewData[r]}
                  renderItem={p => <List.Item>{p.title}</List.Item>}
                />
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无归属岗位</Typography.Text>
              )}
            </Card>
          ))}
        </Space>
      </Drawer>
    </div>
  );
}
