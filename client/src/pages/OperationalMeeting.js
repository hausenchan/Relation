import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Collapse, DatePicker, Divider, Drawer, Empty, Form, Grid,
  Input, Modal, Progress, Select, Space, Spin, Table, Tag, Tooltip, Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined, FileDoneOutlined, LockOutlined, PlusOutlined,
  ReloadOutlined, RobotOutlined, SaveOutlined, SendOutlined, UnlockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { cryptoKeysApi, operationalMeetingsApi } from '../api';
import { useAuth } from '../AuthContext';
import { RichTextEditor, RichTextView, richTextToPlain } from '../components/RichText';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const MODULE_KEY = 'operational_meeting';
const DEFAULT_QUESTIONS = [
  { key: 'weekly_result', title: '本周核心结果' },
  { key: 'key_judgment', title: '一个最重要的判断' },
  { key: 'decision_needed', title: '需要会上决策的问题' },
  { key: 'next_action', title: '下周建议动作' },
];

const statusMeta = {
  draft: { color: 'default', label: '草稿' },
  filling: { color: 'blue', label: '填写中' },
  brief_completed: { color: 'green', label: '简报已完成' },
  agenda_generated: { color: 'purple', label: '提纲已生成' },
  completed: { color: 'cyan', label: '已开会' },
  archived: { color: 'default', label: '已归档' },
};

const sectionStatusMeta = {
  draft: { color: 'default', label: '未提交' },
  submitted: { color: 'green', label: '已提交' },
  locked: { color: 'gold', label: '已锁定' },
};

function normalizeQuestionBlocks(value) {
  const source = value?.questions || value || [];
  const list = Array.isArray(source) && source.length ? source : DEFAULT_QUESTIONS;
  return {
    questions: list.map((item, index) => ({
      key: item.key || `q_${index + 1}`,
      title: item.title || DEFAULT_QUESTIONS[index]?.title || `问题 ${index + 1}`,
      content: item.content || '',
    })),
  };
}

function blocksToPlain(blocks) {
  return normalizeQuestionBlocks(blocks).questions
    .map(item => `${item.title}\n${richTextToPlain(item.content || '')}`.trim())
    .filter(Boolean)
    .join('\n\n');
}

function sanitizeForAi(value) {
  return String(value || '')
    .replace(/(毛利率?|利润率?|利润|gross\s*profit|gross\s*margin|\bGM\b)[^\n。；;]{0,120}/ig, '[已脱敏经营指标]')
    .replace(/(收入|成本|分成比例|分成后)[^\n。；;]{0,80}(利润|毛利)[^\n。；;]{0,80}/ig, '[已脱敏经营指标]');
}

function agendaToPlain(agenda) {
  if (!agenda) return '';
  return [
    `一、本次会议目标\n${agenda.meeting_goal || ''}`,
    `二、本周经营总览\n${agenda.weekly_overview || ''}`,
    `三、本次重点讨论和决策议题\n${agenda.key_topics || ''}`,
    `四、建议会议议程\n${agenda.agenda || ''}`,
    `五、下周动作建议\n${agenda.next_actions || ''}`,
    `六、请大家会前准备\n${agenda.preparation || ''}`,
  ].join('\n\n');
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return window.btoa(binary);
}

function base64ToBuffer(value) {
  const binary = window.atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function randomBase64(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return bufferToBase64(bytes.buffer);
}

async function derivePasswordKey(password, saltBase64, iterations = 210000) {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBuffer(saltBase64),
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function createUserKeyBundle(password) {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const salt = randomBase64(16);
  const iv = randomBase64(12);
  const iterations = 210000;
  const wrappingKey = await derivePasswordKey(password, salt, iterations);
  const encryptedPrivate = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(privateJwk)),
  );
  return {
    public_key_jwk: JSON.stringify(publicJwk),
    encrypted_private_key_jwk: JSON.stringify({
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      salt,
      iv,
      iterations,
      data: bufferToBase64(encryptedPrivate),
    }),
    privateKey: keyPair.privateKey,
  };
}

async function unlockPrivateKey(keyInfo, password) {
  const encrypted = JSON.parse(keyInfo.encrypted_private_key_jwk || '{}');
  const wrappingKey = await derivePasswordKey(password, encrypted.salt, Number(encrypted.iterations || 210000));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(encrypted.iv) },
    wrappingKey,
    base64ToBuffer(encrypted.data),
  );
  const privateJwk = JSON.parse(new TextDecoder().decode(decrypted));
  return window.crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
}

async function encryptPayloadForUsers(payload, userIds) {
  const publicKeys = await cryptoKeysApi.publicKeys(userIds);
  if (!publicKeys.length) {
    throw new Error('授权人员尚未设置安全密钥，无法保存加密内容');
  }
  const encoder = new TextEncoder();
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const iv = randomBase64(12);
  const encryptedPayload = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    aesKey,
    encoder.encode(JSON.stringify(payload)),
  );
  const rawDek = await window.crypto.subtle.exportKey('raw', aesKey);
  const recordKeys = [];
  for (const row of publicKeys) {
    const publicKey = await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(row.public_key_jwk),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    const encryptedDek = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawDek);
    recordKeys.push({
      user_id: Number(row.user_id),
      encrypted_dek: bufferToBase64(encryptedDek),
      key_version: Number(row.key_version || 1),
    });
  }
  return {
    ciphertext: JSON.stringify({
      alg: 'A256GCM',
      iv,
      data: bufferToBase64(encryptedPayload),
    }),
    record_keys: recordKeys,
  };
}

async function decryptRecordPayload(ciphertext, recordKey, privateKey) {
  if (!ciphertext) return null;
  if (!recordKey?.encrypted_dek || !privateKey) throw new Error('当前账号缺少此记录的解密授权');
  const packed = JSON.parse(ciphertext);
  const rawDek = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToBuffer(recordKey.encrypted_dek),
  );
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(packed.iv) },
    aesKey,
    base64ToBuffer(packed.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export default function OperationalMeeting() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { user, canAccessSensitiveModule } = useAuth();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [keyInfo, setKeyInfo] = useState(null);
  const [unlocked, setUnlocked] = useState(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyPassword, setKeyPassword] = useState('');
  const [keyPasswordConfirm, setKeyPasswordConfirm] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [sectionDrafts, setSectionDrafts] = useState({});
  const [agendaDraft, setAgendaDraft] = useState(null);
  const [decisionDraft, setDecisionDraft] = useState('');
  const [savingSectionId, setSavingSectionId] = useState(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [decisionSaving, setDecisionSaving] = useState(false);

  const hasSensitiveAccess = canAccessSensitiveModule?.(MODULE_KEY);
  const authorizedUserIds = useMemo(() => {
    const ids = detail?.authorized_user_ids || [];
    return [...new Set([...ids.map(Number), Number(user?.id)].filter(Boolean))];
  }, [detail, user?.id]);

  const loadKeyInfo = useCallback(async () => {
    try {
      const data = await cryptoKeysApi.getUserKey();
      setKeyInfo(data || null);
    } catch (error) {
      message.error(error.response?.data?.error || '加载安全密钥失败');
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const [meetingRows, templateRows] = await Promise.all([
        operationalMeetingsApi.list(),
        operationalMeetingsApi.templates(),
      ]);
      setMeetings(Array.isArray(meetingRows) ? meetingRows : []);
      setTemplates(Array.isArray(templateRows) ? templateRows : []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载经营周会失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const data = await operationalMeetingsApi.get(id);
      setDetail(data);
    } catch (error) {
      message.error(error.response?.data?.error || '加载经营周会详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeyInfo();
    loadMeetings();
  }, [loadKeyInfo, loadMeetings]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!detail) return;
      const nextSections = {};
      for (const section of detail.sections || []) {
        const fallback = normalizeQuestionBlocks(section.default_blocks || { questions: section.default_questions });
        if (section.content_ciphertext && unlocked?.privateKey) {
          try {
            nextSections[section.id] = normalizeQuestionBlocks(await decryptRecordPayload(
              section.content_ciphertext,
              section.my_record_key,
              unlocked.privateKey,
            ));
          } catch {
            nextSections[section.id] = fallback;
          }
        } else {
          nextSections[section.id] = fallback;
        }
      }
      let nextAgenda = null;
      if (detail.agenda?.agenda_ciphertext && unlocked?.privateKey) {
        try {
          nextAgenda = await decryptRecordPayload(detail.agenda.agenda_ciphertext, detail.agenda.my_record_key, unlocked.privateKey);
        } catch {
          nextAgenda = null;
        }
      }
      let nextDecision = '';
      if (detail.decision?.decision_ciphertext && unlocked?.privateKey) {
        try {
          const decrypted = await decryptRecordPayload(detail.decision.decision_ciphertext, detail.decision.my_record_key, unlocked.privateKey);
          nextDecision = decrypted?.text || '';
        } catch {
          nextDecision = '';
        }
      }
      if (!cancelled) {
        setSectionDrafts(nextSections);
        setAgendaDraft(nextAgenda);
        setDecisionDraft(nextDecision);
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [detail, unlocked]);

  const openCreate = () => {
    createForm.resetFields();
    const start = dayjs().startOf('week').add(1, 'day');
    const end = start.add(6, 'day');
    createForm.setFieldsValue({
      range: [start, end],
      template_id: templates[0]?.id,
    });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const [start, end] = values.range || [];
      const result = await operationalMeetingsApi.create({
        week_start: start.format('YYYY-MM-DD'),
        week_end: end.format('YYYY-MM-DD'),
        template_id: values.template_id,
      });
      setCreateOpen(false);
      await loadMeetings();
      setSelectedId(result.id);
      await loadDetail(result.id);
      message.success('经营周会已创建');
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '创建失败');
    }
  };

  const openDetail = async (record) => {
    setSelectedId(record.id);
    await loadDetail(record.id);
  };

  const handleKeyAction = async () => {
    if (!keyPassword || keyPassword.length < 8) {
      message.warning('安全密码至少 8 位');
      return;
    }
    if (!keyInfo && keyPassword !== keyPasswordConfirm) {
      message.warning('两次安全密码不一致');
      return;
    }
    setKeyBusy(true);
    try {
      if (keyInfo) {
        const privateKey = await unlockPrivateKey(keyInfo, keyPassword);
        setUnlocked({ privateKey, keyVersion: Number(keyInfo.key_version || 1) });
        message.success('安全密钥已解锁');
      } else {
        const bundle = await createUserKeyBundle(keyPassword);
        await cryptoKeysApi.saveUserKey({
          public_key_jwk: bundle.public_key_jwk,
          encrypted_private_key_jwk: bundle.encrypted_private_key_jwk,
          kdf_algorithm: 'PBKDF2-SHA256',
          key_version: 1,
        });
        setUnlocked({ privateKey: bundle.privateKey, keyVersion: 1 });
        await loadKeyInfo();
        message.success('安全密钥已创建并解锁');
      }
      setKeyPassword('');
      setKeyPasswordConfirm('');
      setKeyModalOpen(false);
    } catch (error) {
      message.error(error.message || '安全密钥处理失败，请确认密码正确');
    } finally {
      setKeyBusy(false);
    }
  };

  const ensureUnlocked = () => {
    if (!window.crypto?.subtle) {
      message.error('当前浏览器不支持 Web Crypto，无法处理加密内容');
      return false;
    }
    if (!unlocked?.privateKey) {
      setKeyModalOpen(true);
      return false;
    }
    return true;
  };

  const patchQuestionContent = (sectionId, questionKey, content) => {
    setSectionDrafts(prev => {
      const base = normalizeQuestionBlocks(prev[sectionId]);
      return {
        ...prev,
        [sectionId]: {
          questions: base.questions.map(item => (
            item.key === questionKey ? { ...item, content } : item
          )),
        },
      };
    });
  };

  const saveSection = async (section, submitAfter = false) => {
    if (!ensureUnlocked()) return;
    setSavingSectionId(section.id);
    try {
      const payload = normalizeQuestionBlocks(sectionDrafts[section.id] || section.default_blocks || { questions: section.default_questions });
      const encrypted = await encryptPayloadForUsers(payload, authorizedUserIds);
      await operationalMeetingsApi.updateSection(section.id, {
        content_ciphertext: encrypted.ciphertext,
        crypto_version: 'v2_client',
        record_keys: encrypted.record_keys,
      });
      if (submitAfter) {
        await operationalMeetingsApi.submitSection(section.id);
        message.success('填写块已提交');
      } else {
        message.success('填写块已保存');
      }
      await loadMeetings();
      await loadDetail(section.meeting_id);
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '保存失败');
    } finally {
      setSavingSectionId(null);
    }
  };

  const generateAgenda = async () => {
    if (!detail?.meeting?.id || !ensureUnlocked()) return;
    setAgendaLoading(true);
    try {
      const sections = (detail.sections || []).map(section => ({
        title: section.title,
        owner: section.owner_name || section.owner_username || '',
        content: sanitizeForAi(blocksToPlain(sectionDrafts[section.id])),
      }));
      const result = await operationalMeetingsApi.generateAgenda(detail.meeting.id, { sections });
      const agenda = result.agenda;
      const encrypted = await encryptPayloadForUsers(agenda, authorizedUserIds);
      await operationalMeetingsApi.saveAgenda(detail.meeting.id, {
        agenda_ciphertext: encrypted.ciphertext,
        crypto_version: 'v2_client',
        record_keys: encrypted.record_keys,
        source_hash: result.source_hash,
        model_provider: result.runtime?.provider || 'rule',
        model_name: result.runtime?.model_name || '',
        prompt_version: result.prompt_version,
        safety_scan_status: 'passed',
      });
      setAgendaDraft(agenda);
      await loadMeetings();
      await loadDetail(detail.meeting.id);
      message.success(result.runtime?.mode === 'llm' ? 'AI 提纲已生成' : '已生成规则兜底提纲');
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '生成提纲失败');
    } finally {
      setAgendaLoading(false);
    }
  };

  const saveDecision = async () => {
    if (!detail?.meeting?.id || !ensureUnlocked()) return;
    setDecisionSaving(true);
    try {
      const encrypted = await encryptPayloadForUsers({ text: decisionDraft || '' }, authorizedUserIds);
      await operationalMeetingsApi.saveDecision(detail.meeting.id, {
        decision_ciphertext: encrypted.ciphertext,
        crypto_version: 'v2_client',
        record_keys: encrypted.record_keys,
        status: decisionDraft?.trim() ? 'saved' : 'draft',
      });
      await loadMeetings();
      await loadDetail(detail.meeting.id);
      message.success('会议结论已保存');
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '保存会议结论失败');
    } finally {
      setDecisionSaving(false);
    }
  };

  const columns = [
    {
      title: '周时间范围',
      key: 'week_range',
      width: 210,
      render: (_, record) => <Text strong>{record.week_start} ~ {record.week_end}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: value => {
        const meta = statusMeta[value] || statusMeta.draft;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '简报进度',
      key: 'progress',
      width: 180,
      render: (_, record) => {
        const required = Number(record.required_sections || 0);
        const submitted = Number(record.submitted_required_sections || 0);
        const percent = required ? Math.round((submitted / required) * 100) : 0;
        return <Progress percent={percent} size="small" format={() => `${submitted}/${required}`} />;
      },
    },
    {
      title: 'AI 提纲',
      dataIndex: 'agenda_status',
      width: 110,
      render: value => value === 'generated' ? <Tag color="purple">已生成</Tag> : <Tag>未生成</Tag>,
    },
    {
      title: '会议结论',
      dataIndex: 'decision_status',
      width: 110,
      render: value => value === 'saved' ? <Tag color="cyan">已保存</Tag> : <Tag>未填写</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
      render: value => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => <Button type="link" onClick={() => openDetail(record)}>查看</Button>,
    },
  ];

  const canGenerateAgenda = useMemo(() => {
    const required = Number(detail?.meeting?.required_sections || 0);
    const submitted = Number(detail?.meeting?.submitted_required_sections || 0);
    return required > 0 && submitted >= required;
  }, [detail]);

  const renderSection = (section) => {
    const status = sectionStatusMeta[section.status] || sectionStatusMeta.draft;
    const draft = normalizeQuestionBlocks(sectionDrafts[section.id] || section.default_blocks || { questions: section.default_questions });
    const lacksDecryptGrant = Boolean(section.content_ciphertext && !section.my_record_key);
    const disabled = !section.can_edit || !unlocked?.privateKey || lacksDecryptGrant;
    return (
      <Collapse.Panel
        key={String(section.id)}
        header={(
          <Space wrap>
            <Text strong>{section.title}</Text>
            <Tag color={status.color}>{status.label}</Tag>
            {section.owner_name && <Tag>{section.owner_name}</Tag>}
            {section.submitted_at && <Text type="secondary">{dayjs(section.submitted_at).format('MM-DD HH:mm')}</Text>}
          </Space>
        )}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {section.content_ciphertext && !unlocked?.privateKey && (
            <Alert type="info" showIcon message="内容已加密，解锁安全密钥后可查看和编辑。" />
          )}
          {lacksDecryptGrant && (
            <Alert type="warning" showIcon message="当前账号没有此填写块的记录密钥，无法查看或覆盖原内容。" />
          )}
          {draft.questions.map(item => (
            <div key={item.key}>
              <Text strong>{item.title}</Text>
              <div style={{ marginTop: 8 }}>
                <RichTextEditor
                  value={item.content || ''}
                  onChange={value => patchQuestionContent(section.id, item.key, value)}
                  minHeight={96}
                  placeholder={`填写${item.title}`}
                  enableTables
                  readOnly={disabled}
                />
              </div>
            </div>
          ))}
          <Space wrap>
            <Button
              icon={<SaveOutlined />}
              loading={savingSectionId === section.id}
              disabled={!section.can_edit}
              onClick={() => saveSection(section, false)}
            >
              保存
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={savingSectionId === section.id}
              disabled={!section.can_edit}
              onClick={() => saveSection(section, true)}
            >
              保存并提交
            </Button>
          </Space>
        </Space>
      </Collapse.Panel>
    );
  };

  if (!hasSensitiveAccess) {
    return (
      <Alert
        type="error"
        showIcon
        message="无经营周会敏感信息权限"
        description="请联系系统管理员在“通用配置 -> 敏感授权”中添加授权。"
      />
    );
  }

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          title={<Space><FileDoneOutlined />经营周会</Space>}
          extra={(
            <Space wrap>
              {unlocked?.privateKey ? (
                <Tag icon={<UnlockOutlined />} color="green">安全密钥已解锁</Tag>
              ) : (
                <Button icon={<LockOutlined />} onClick={() => setKeyModalOpen(true)}>
                  {keyInfo ? '解锁安全密钥' : '设置安全密钥'}
                </Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={loadMeetings}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建周会</Button>
            </Space>
          )}
        >
          {!keyInfo && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="首次使用需要设置安全密码"
              description="经营周会内容会在浏览器本地加密后保存。安全密码不会上传服务器，忘记后需要由其他已授权人员重新授权。"
            />
          )}
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={meetings}
            scroll={{ x: 900 }}
            pagination={{ defaultPageSize: 20, showTotal: total => `共 ${total} 条` }}
            onRow={record => ({ onDoubleClick: () => openDetail(record) })}
          />
        </Card>
      </Space>

      <Drawer
        title={detail?.meeting ? `${detail.meeting.week_start} ~ ${detail.meeting.week_end} 经营周会` : '经营周会'}
        open={Boolean(selectedId)}
        width={isMobile ? '100%' : 1040}
        onClose={() => {
          setSelectedId(null);
          setDetail(null);
        }}
        destroyOnClose
      >
        <Spin spinning={detailLoading}>
          {!detail?.meeting ? (
            <Empty description="暂无详情" />
          ) : (
            <Space direction="vertical" size={18} style={{ width: '100%' }}>
              <Alert
                type={unlocked?.privateKey ? 'success' : 'info'}
                showIcon
                message={unlocked?.privateKey ? '安全密钥已解锁，当前内容在浏览器本地解密。' : '请先解锁安全密钥，才能查看或保存加密内容。'}
                action={!unlocked?.privateKey && (
                  <Button size="small" onClick={() => setKeyModalOpen(true)}>解锁</Button>
                )}
              />

              <Card size="small">
                <Space wrap size={16}>
                  <Tag color={(statusMeta[detail.meeting.status] || statusMeta.draft).color}>
                    {(statusMeta[detail.meeting.status] || statusMeta.draft).label}
                  </Tag>
                  <Text>简报：{detail.meeting.submitted_required_sections}/{detail.meeting.required_sections}</Text>
                  <Text>提纲：{detail.meeting.agenda_status === 'generated' ? '已生成' : '未生成'}</Text>
                  <Text>结论：{detail.meeting.decision_status === 'saved' ? '已保存' : '未填写'}</Text>
                </Space>
              </Card>

              <Card title="简报填写" size="small">
                <Collapse defaultActiveKey={(detail.sections || []).map(item => String(item.id))}>
                  {(detail.sections || []).map(renderSection)}
                </Collapse>
              </Card>

              <Card
                title={<Space><RobotOutlined />AI 会议提纲</Space>}
                size="small"
                extra={(
                  <Tooltip title={!canGenerateAgenda ? '所有必填简报提交后可生成' : ''}>
                    <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      loading={agendaLoading}
                      disabled={!canGenerateAgenda}
                      onClick={generateAgenda}
                    >
                      生成会议提纲
                    </Button>
                  </Tooltip>
                )}
              >
                {agendaDraft ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <RichTextView value={agendaToPlain(agendaDraft).replace(/\n/g, '<br />')} />
                    <Alert type="success" showIcon message="提纲已加密保存，毛利和利润类敏感字段已在生成前后过滤。" />
                  </Space>
                ) : (
                  <Empty description={detail.agenda?.agenda_ciphertext && !unlocked?.privateKey ? '提纲已加密，解锁后可查看' : '暂无会议提纲'} />
                )}
              </Card>

              <Card
                title={<Space><CheckCircleOutlined />会议结论</Space>}
                size="small"
                extra={<Button icon={<SaveOutlined />} loading={decisionSaving} onClick={saveDecision}>保存结论</Button>}
              >
                <Input.TextArea
                  value={decisionDraft}
                  onChange={event => setDecisionDraft(event.target.value)}
                  placeholder="记录会议最终决策、负责人、截止时间和后续动作"
                  rows={6}
                  disabled={!unlocked?.privateKey}
                />
              </Card>
            </Space>
          )}
        </Spin>
      </Drawer>

      <Modal
        title="新建经营周会"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="周时间范围" name="range" rules={[{ required: true, message: '请选择周时间范围' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="模板" name="template_id" rules={[{ required: true, message: '请选择模板' }]}>
            <Select
              options={templates.map(item => ({ value: item.id, label: item.name }))}
              placeholder="请选择模板"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={keyInfo ? '解锁安全密钥' : '设置安全密码'}
        open={keyModalOpen}
        onCancel={() => {
          setKeyModalOpen(false);
          setKeyPassword('');
          setKeyPasswordConfirm('');
        }}
        onOk={handleKeyAction}
        okText={keyInfo ? '解锁' : '创建'}
        cancelText="取消"
        confirmLoading={keyBusy}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="安全密码不会上传服务器"
            description="它只用于在浏览器里解开你的私钥。服务器和运维拿不到明文私钥。"
          />
          <Input.Password
            value={keyPassword}
            onChange={event => setKeyPassword(event.target.value)}
            placeholder="请输入安全密码，至少 8 位"
            autoComplete="new-password"
          />
          {!keyInfo && (
            <Input.Password
              value={keyPasswordConfirm}
              onChange={event => setKeyPasswordConfirm(event.target.value)}
              placeholder="再次输入安全密码"
              autoComplete="new-password"
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}
