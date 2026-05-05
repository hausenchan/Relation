import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Modal, Form, Input, Space, Tag, message, Popconfirm, Descriptions, Grid, List, Switch } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import axios from 'axios';

export default function RecruitRadarConfig() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [targets, setTargets] = useState([]);
  const [bossStatus, setBossStatus] = useState({});
  const [dingtalkStatus, setDingtalkStatus] = useState({});
  const [targetModal, setTargetModal] = useState(false);
  const [cookieModal, setCookieModal] = useState(false);
  const [dingtalkModal, setDingtalkModal] = useState(false);
  const [loading, setLoading] = useState(false);
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
      fetchTargets();
    } catch (err) {
      message.error(err.response?.data?.error || '添加失败');
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
      await axios.post('/api/boss-watcher/dingtalk-config', values);
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
              <Button type="link" size="small" onClick={() => setDingtalkModal(true)}>
                {dingtalkStatus.configured ? '修改' : '配置'}
              </Button>
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
      <Modal title="添加监控公司" open={targetModal} onCancel={() => setTargetModal(false)} onOk={() => targetForm.submit()} destroyOnClose>
        <Form form={targetForm} onFinish={handleAddTarget} layout="vertical">
          <Form.Item name="company_name" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
            <Input placeholder="如：字节跳动" />
          </Form.Item>
          <Form.Item name="boss_company_id" label="Boss 公司ID" rules={[{ required: true, message: '请输入 Boss 公司ID' }]}
            extra="在 Boss 直聘搜索公司，复制公司主页 URL 中的 ID（如 encXXXXXX）">
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
      <Modal title="钉钉推送配置" open={dingtalkModal} onCancel={() => setDingtalkModal(false)} onOk={() => dingtalkForm.submit()} destroyOnClose>
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
          <Form.Item name="receiverUserId" label="接收人 UserId" rules={[{ required: true }]}
            extra="钉钉管理后台 → 通讯录 → 找到自己 → userId">
            <Input placeholder="你的钉钉 userId" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
