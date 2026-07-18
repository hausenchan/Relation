import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, DatePicker, Divider, Empty, Form, Grid,
  Input, Modal, Progress, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, FileDoneOutlined,
  LockOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, SaveOutlined,
  TeamOutlined, UnlockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { cryptoKeysApi, operationalMeetingsApi } from '../api';
import { useAuth } from '../AuthContext';
import { richTextToPlain } from '../components/RichText';
import DocumentBodyEditor from '../components/DocumentBodyEditor';
import {
  createDocumentBodyBlock,
  documentBodyHasContent,
  documentBodyToPlain,
  normalizeDocumentBodyValue,
  sanitizeDocumentBodyInlineHtml,
} from '../utils/documentBodyBlocks';
import {
  inspectStoredKeyInfo,
  parseEncryptedPrivateKeyEnvelope,
  parseRsaPublicJwk,
  publicJwkFromPrivateJwk,
} from '../utils/operationalMeetingCrypto';
import {
  getDefaultPreparationSectionKeys,
  getPreparationEditorState,
} from '../utils/operationalMeetingAccess';
import {
  getOperationalPreparationSignature,
  getOperationalPreparationSubmissionSignature,
  normalizeOperationalPreparationContent,
  operationalPreparationHasAnswers,
  operationalPreparationToPlain,
} from '../utils/operationalMeetingPreparation';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const MODULE_KEY = 'operational_meeting';
const SECTION_AUTO_SAVE_DELAY = 3000;
const SECTION_AUTO_SAVE_INTERVAL = 30000;
const MEETING_CONTENT_AUTO_SAVE_DELAY = 3000;
const OPERATIONAL_AGENDA_FIELDS = [
  ['meeting_goal', '一、本次会议目标'],
  ['weekly_overview', '二、本周经营总览'],
  ['key_topics', '三、本次重点讨论和决策议题'],
  ['agenda', '四、建议会议议程'],
  ['next_actions', '五、下周动作建议'],
  ['preparation', '六、请大家会前准备'],
];
const statusMeta = {
  draft: { color: 'default', label: '草稿' },
  filling: { color: 'blue', label: '准备中' },
  brief_completed: { color: 'green', label: '准备已完成' },
  agenda_generated: { color: 'purple', label: '提纲已生成' },
  completed: { color: 'cyan', label: '已开会' },
  archived: { color: 'default', label: '已归档' },
};

const sectionStatusMeta = {
  draft: { color: 'default', label: '未提交' },
  submitted: { color: 'green', label: '已提交' },
  locked: { color: 'gold', label: '已锁定' },
};

function blocksToPlain(blocks) {
  return operationalPreparationToPlain(blocks, richTextToPlain);
}

function sanitizeForAi(value) {
  return String(value || '')
    .replace(/(毛利率?|利润率?|利润|gross\s*profit|gross\s*margin|\bGM\b)[^\n。；;]{0,120}/ig, '[已脱敏经营指标]')
    .replace(/(收入|成本|分成比例|分成后)[^\n。；;]{0,80}(利润|毛利)[^\n。；;]{0,80}/ig, '[已脱敏经营指标]');
}

function agendaToPlain(agenda) {
  if (!agenda) return '';
  if (agenda?.blocks) return documentBodyToPlain(normalizeDocumentBodyValue(agenda), richTextToPlain);
  return [
    `一、本次会议目标\n${agenda.meeting_goal || ''}`,
    `二、本周经营总览\n${agenda.weekly_overview || ''}`,
    `三、本次重点讨论和决策议题\n${agenda.key_topics || ''}`,
    `四、建议会议议程\n${agenda.agenda || ''}`,
    `五、下周动作建议\n${agenda.next_actions || ''}`,
    `六、请大家会前准备\n${agenda.preparation || ''}`,
  ].join('\n\n');
}

function textToDocumentBlocks(text, type = 'paragraph', extra = {}) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
  return lines.length
    ? lines.map(line => createDocumentBodyBlock(type, sanitizeDocumentBodyInlineHtml(line.trim()), extra))
    : [createDocumentBodyBlock('paragraph', '')];
}

function agendaObjectToDocumentBody(agenda) {
  const blocks = [];
  OPERATIONAL_AGENDA_FIELDS.forEach(([key, title]) => {
    blocks.push(createDocumentBodyBlock('heading3', title));
    textToDocumentBlocks(agenda?.[key] || '').forEach(block => blocks.push(block));
  });
  return normalizeDocumentBodyValue({ blocks });
}

function normalizeOperationalAgendaContent(value) {
  if (!value) return null;
  if (value?.blocks) return normalizeDocumentBodyValue(value);
  if (typeof value === 'string') return normalizeDocumentBodyValue(value);
  return agendaObjectToDocumentBody(value);
}

function normalizeOperationalDecisionContent(value) {
  if (value?.blocks) return normalizeDocumentBodyValue(value);
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'text')) {
    return normalizeDocumentBodyValue(value.text || '');
  }
  return normalizeDocumentBodyValue(value || '');
}

function meetingContentToPlain(value) {
  return documentBodyToPlain(normalizeDocumentBodyValue(value), richTextToPlain);
}

function getDocumentBodySignature(value) {
  return JSON.stringify(normalizeDocumentBodyValue(value));
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
    publicKeyJwk: publicJwk,
  };
}

async function unlockPrivateKey(keyInfo, password) {
  const encrypted = parseEncryptedPrivateKeyEnvelope(keyInfo.encrypted_private_key_jwk);
  const wrappingKey = await derivePasswordKey(password, encrypted.salt, Number(encrypted.iterations || 210000));
  let decrypted;
  try {
    decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(encrypted.iv) },
      wrappingKey,
      base64ToBuffer(encrypted.data),
    );
  } catch {
    throw new Error('安全密码不正确，或私钥数据已经损坏');
  }
  let privateJwk;
  try {
    privateJwk = JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new Error('安全密码不正确，或私钥数据已经损坏');
  }
  const publicKeyJwk = publicJwkFromPrivateJwk(privateJwk);
  const privateKey = await window.crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
  return { privateKey, publicKeyJwk };
}

async function encryptPayloadForUsers(payload, userIds, localPublicKeys = {}) {
  const publicKeys = await cryptoKeysApi.publicKeys(userIds);
  const requestedUserIds = [...new Set((userIds || []).map(Number).filter(Boolean))];
  const candidates = new Map((Array.isArray(publicKeys) ? publicKeys : []).map(row => [Number(row.user_id), row]));
  Object.entries(localPublicKeys || {}).forEach(([userId, publicKeyJwk]) => {
    const localKey = publicKeyJwk?.jwk ? publicKeyJwk : { jwk: publicKeyJwk, key_version: 1 };
    if (Number(userId) && localKey.jwk) {
      candidates.set(Number(userId), {
        user_id: Number(userId),
        public_key_jwk: localKey.jwk,
        key_version: Number(localKey.key_version || 1),
      });
    }
  });
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
  for (const row of candidates.values()) {
    try {
      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        parseRsaPublicJwk(row.public_key_jwk),
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
    } catch {
      // An unavailable recipient must not expose a low-level JSON/Web Crypto error or block the author.
    }
  }
  if (!recordKeys.length) {
    throw new Error('当前账号的安全密钥不可用，请先解锁或修复安全密钥');
  }
  const encryptedUserIds = new Set(recordKeys.map(item => Number(item.user_id)));
  return {
    ciphertext: JSON.stringify({
      alg: 'A256GCM',
      iv,
      data: bufferToBase64(encryptedPayload),
    }),
    record_keys: recordKeys,
    unavailable_user_ids: requestedUserIds.filter(id => !encryptedUserIds.has(id)),
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
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, canAccessMenu, canAccessSensitiveModule, isExecutive } = useAuth();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [eligibleParticipants, setEligibleParticipants] = useState([]);
  const [detail, setDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [keyInfo, setKeyInfo] = useState(null);
  const [keyInfoLoaded, setKeyInfoLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyPassword, setKeyPassword] = useState('');
  const [keyPasswordConfirm, setKeyPasswordConfirm] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyRepairMode, setKeyRepairMode] = useState(false);
  const [sectionDrafts, setSectionDrafts] = useState({});
  const [agendaDraft, setAgendaDraft] = useState(null);
  const [decisionDraft, setDecisionDraft] = useState(() => normalizeOperationalDecisionContent(''));
  const [sectionSaveStates, setSectionSaveStates] = useState({});
  const [sectionLocalStatuses, setSectionLocalStatuses] = useState({});
  const [dirtySectionIds, setDirtySectionIds] = useState([]);
  const [submittingSectionId, setSubmittingSectionId] = useState(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaSaveState, setAgendaSaveState] = useState({ phase: 'idle', savedAt: null });
  const [decisionSaveState, setDecisionSaveState] = useState({ phase: 'idle', savedAt: null });
  const [participantOpen, setParticipantOpen] = useState(false);
  const [participantUserIds, setParticipantUserIds] = useState([]);
  const [participantBusy, setParticipantBusy] = useState(false);
  const [annualLoading, setAnnualLoading] = useState(false);
  const [annualYear, setAnnualYear] = useState(dayjs().year());
  const [annualRows, setAnnualRows] = useState([]);
  const [annualDrafts, setAnnualDrafts] = useState({});
  const [annualKeyword, setAnnualKeyword] = useState('');
  const [annualOnlyConclusion, setAnnualOnlyConclusion] = useState(false);
  const sectionDraftsRef = useRef({});
  const dirtySectionIdsRef = useRef(new Set());
  const sectionLastSavedSignatureRef = useRef({});
  const sectionPendingSaveRef = useRef({});
  const sectionAutoSaveTimerRef = useRef(null);
  const persistSectionRef = useRef(null);
  const sectionSaveStatesRef = useRef({});
  const sectionLocalStatusesRef = useRef({});
  const agendaDraftRef = useRef(null);
  const decisionDraftRef = useRef(normalizeOperationalDecisionContent(''));
  const agendaLastSavedSignatureRef = useRef('');
  const decisionLastSavedSignatureRef = useRef('');
  const agendaDirtyRef = useRef(false);
  const decisionDirtyRef = useRef(false);
  const agendaAutoSaveTimerRef = useRef(null);
  const decisionAutoSaveTimerRef = useRef(null);
  const firstSecurityPromptRef = useRef(false);

  const hasSensitiveAccess = canAccessSensitiveModule?.(MODULE_KEY);
  const hasMenuAccess = canAccessMenu?.('/executive/operational');
  const cxoIdentity = Boolean(isExecutive?.());
  const isDetailView = Boolean(meetingId);
  const listView = searchParams.get('view') === 'annual' ? 'annual' : 'records';
  const detailTab = searchParams.get('tab') === 'meeting' ? 'meeting' : 'preparation';
  const keyHealth = useMemo(() => inspectStoredKeyInfo(keyInfo), [keyInfo]);
  const meetingAuthorizedUserIds = useMemo(() => {
    const ids = detail?.meeting_authorized_user_ids || [];
    return [...new Set([...ids.map(Number), Number(user?.id)].filter(Boolean))];
  }, [detail, user?.id]);

  const updateSectionSaveState = useCallback((sectionId, patch) => {
    setSectionSaveStates((prev) => {
      const previous = prev[sectionId] || {};
      const nextValue = typeof patch === 'function' ? patch(previous) : { ...previous, ...patch };
      const next = { ...prev, [sectionId]: nextValue };
      sectionSaveStatesRef.current = next;
      return next;
    });
  }, []);

  const updateSectionLocalStatus = useCallback((sectionId, status) => {
    setSectionLocalStatuses((prev) => {
      const next = { ...prev, [sectionId]: status };
      sectionLocalStatusesRef.current = next;
      return next;
    });
  }, []);

  const loadKeyInfo = useCallback(async () => {
    try {
      const data = await cryptoKeysApi.getUserKey();
      setKeyInfo(data || null);
    } catch (error) {
      message.error(error.response?.data?.error || '加载安全密钥失败');
    } finally {
      setKeyInfoLoaded(true);
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const [meetingRows, templateRows, participantRows] = await Promise.all([
        operationalMeetingsApi.list(),
        operationalMeetingsApi.templates(),
        cxoIdentity ? operationalMeetingsApi.eligibleParticipants() : Promise.resolve([]),
      ]);
      setMeetings(Array.isArray(meetingRows) ? meetingRows : []);
      setTemplates(Array.isArray(templateRows) ? templateRows : []);
      setEligibleParticipants(Array.isArray(participantRows) ? participantRows : []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载经营周会失败');
    } finally {
      setLoading(false);
    }
  }, [cxoIdentity]);

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

  const loadAnnualSummary = useCallback(async () => {
    setAnnualLoading(true);
    try {
      const result = await operationalMeetingsApi.annualSummary({ year: annualYear });
      setAnnualRows(Array.isArray(result?.meetings) ? result.meetings : []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载年度汇总失败');
    } finally {
      setAnnualLoading(false);
    }
  }, [annualYear]);

  useEffect(() => {
    loadKeyInfo();
    loadMeetings();
  }, [loadKeyInfo, loadMeetings]);

  useEffect(() => {
    if (!keyInfoLoaded || keyInfo || firstSecurityPromptRef.current) return;
    if (!hasMenuAccess || !hasSensitiveAccess) return;
    firstSecurityPromptRef.current = true;
    setKeyPassword('');
    setKeyPasswordConfirm('');
    setKeyRepairMode(false);
    setKeyModalOpen(true);
  }, [hasMenuAccess, hasSensitiveAccess, keyInfo, keyInfoLoaded]);

  useEffect(() => {
    if (meetingId) loadDetail(meetingId);
    else setDetail(null);
  }, [meetingId, loadDetail]);

  useEffect(() => {
    if (!isDetailView && listView === 'annual') loadAnnualSummary();
  }, [isDetailView, listView, loadAnnualSummary]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!detail) return;
      const nextSections = {};
      const nextSavedSignatures = {};
      const nextSaveStates = {};
      const nextLocalStatuses = {};
      for (const section of detail.sections || []) {
        const fallback = normalizeOperationalPreparationContent(section.default_blocks, section.default_questions);
        const hasPendingLocalDraft = dirtySectionIdsRef.current.has(Number(section.id))
          && sectionDraftsRef.current[section.id];
        if (hasPendingLocalDraft) {
          nextSections[section.id] = sectionDraftsRef.current[section.id];
        } else if (section.content_ciphertext && unlocked?.privateKey) {
          try {
            nextSections[section.id] = normalizeOperationalPreparationContent(await decryptRecordPayload(
              section.content_ciphertext,
              section.my_record_key,
              unlocked.privateKey,
            ), section.default_questions);
          } catch {
            nextSections[section.id] = fallback;
          }
        } else {
          nextSections[section.id] = fallback;
        }
        nextSavedSignatures[section.id] = hasPendingLocalDraft
          ? (sectionLastSavedSignatureRef.current[section.id] || '')
          : (section.content_ciphertext
            ? getOperationalPreparationSignature(nextSections[section.id], section.default_questions)
            : '');
        nextSaveStates[section.id] = hasPendingLocalDraft
          ? {
              ...(sectionSaveStatesRef.current[section.id] || {}),
              phase: unlocked?.privateKey ? 'dirty' : 'unlock_required',
            }
          : {
              phase: section.content_ciphertext ? 'saved' : 'idle',
              savedAt: section.updated_at || null,
            };
        nextLocalStatuses[section.id] = hasPendingLocalDraft
          ? (sectionLocalStatusesRef.current[section.id] || { status: 'draft', submittedAt: null })
          : {
              status: section.status || 'draft',
              submittedAt: section.submitted_at || null,
            };
      }
      let nextAgenda = null;
      if (detail.agenda?.agenda_ciphertext && unlocked?.privateKey) {
        try {
          nextAgenda = normalizeOperationalAgendaContent(await decryptRecordPayload(
            detail.agenda.agenda_ciphertext,
            detail.agenda.my_record_key,
            unlocked.privateKey,
          ));
        } catch {
          nextAgenda = null;
        }
      }
      let nextDecision = normalizeOperationalDecisionContent('');
      if (detail.decision?.decision_ciphertext && unlocked?.privateKey) {
        try {
          const decrypted = await decryptRecordPayload(detail.decision.decision_ciphertext, detail.decision.my_record_key, unlocked.privateKey);
          nextDecision = normalizeOperationalDecisionContent(decrypted);
        } catch {
          nextDecision = normalizeOperationalDecisionContent('');
        }
      }
      if (!cancelled) {
        const preservedDirtySectionIds = new Set(dirtySectionIdsRef.current);
        sectionDraftsRef.current = nextSections;
        sectionLastSavedSignatureRef.current = nextSavedSignatures;
        sectionSaveStatesRef.current = nextSaveStates;
        sectionLocalStatusesRef.current = nextLocalStatuses;
        setSectionDrafts(nextSections);
        setDirtySectionIds([...preservedDirtySectionIds]);
        setSectionSaveStates(nextSaveStates);
        setSectionLocalStatuses(nextLocalStatuses);
        agendaDraftRef.current = nextAgenda;
        decisionDraftRef.current = nextDecision;
        agendaLastSavedSignatureRef.current = nextAgenda ? getDocumentBodySignature(nextAgenda) : '';
        decisionLastSavedSignatureRef.current = detail.decision?.decision_ciphertext ? getDocumentBodySignature(nextDecision) : '';
        agendaDirtyRef.current = false;
        decisionDirtyRef.current = false;
        setAgendaDraft(nextAgenda);
        setDecisionDraft(nextDecision);
        setAgendaSaveState({ phase: detail.agenda?.agenda_ciphertext ? 'saved' : 'idle', savedAt: detail.agenda?.updated_at || detail.agenda?.generated_at || null });
        setDecisionSaveState({ phase: detail.decision?.decision_ciphertext ? 'saved' : 'idle', savedAt: detail.decision?.updated_at || null });
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [detail, unlocked]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateAnnual() {
      const next = {};
      for (const row of annualRows) {
        let agenda = null;
        let decision = null;
        let decryptError = false;
        if (row.agenda?.agenda_ciphertext && unlocked?.privateKey) {
          try {
            agenda = normalizeOperationalAgendaContent(await decryptRecordPayload(
              row.agenda.agenda_ciphertext,
              row.agenda.my_record_key,
              unlocked.privateKey,
            ));
          } catch {
            decryptError = true;
          }
        }
        if (row.decision?.decision_ciphertext && unlocked?.privateKey) {
          try {
            const payload = await decryptRecordPayload(
              row.decision.decision_ciphertext,
              row.decision.my_record_key,
              unlocked.privateKey,
            );
            decision = normalizeOperationalDecisionContent(payload);
          } catch {
            decryptError = true;
          }
        }
        next[row.meeting.id] = { agenda, decision, decryptError };
      }
      if (!cancelled) setAnnualDrafts(next);
    }
    hydrateAnnual();
    return () => { cancelled = true; };
  }, [annualRows, unlocked]);

  const openCreate = () => {
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!createOpen) return;
    const start = dayjs().startOf('week').add(1, 'day');
    const end = start.add(6, 'day');
    createForm.resetFields();
    createForm.setFieldsValue({
      range: [start, end],
      template_id: templates[0]?.id,
      participant_user_ids: [],
    });
  }, [createForm, createOpen, templates]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const [start, end] = values.range || [];
      const result = await operationalMeetingsApi.create({
        week_start: start.format('YYYY-MM-DD'),
        week_end: end.format('YYYY-MM-DD'),
        template_id: values.template_id,
        participant_user_ids: values.participant_user_ids || [],
      });
      setCreateOpen(false);
      await loadMeetings();
      navigate(`/executive/operational/${result.id}`);
      message.success('经营周会已创建');
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '创建失败');
    }
  };

  const openDetail = async (record) => {
    navigate(`/executive/operational/${record.id}`);
  };

  const handleKeyAction = async () => {
    const creatingKey = !keyInfo || keyRepairMode;
    if (!keyPassword || keyPassword.length < 8) {
      message.warning('安全密码至少 8 位');
      return;
    }
    if (creatingKey && keyPassword !== keyPasswordConfirm) {
      message.warning('两次安全密码不一致');
      return;
    }
    setKeyBusy(true);
    try {
      if (keyInfo && !keyRepairMode) {
        const unlockedKey = await unlockPrivateKey(keyInfo, keyPassword);
        let repaired = false;
        try {
          const storedPublicKey = parseRsaPublicJwk(keyInfo.public_key_jwk);
          repaired = storedPublicKey.n !== unlockedKey.publicKeyJwk.n || storedPublicKey.e !== unlockedKey.publicKeyJwk.e;
        } catch {
          repaired = true;
        }
        if (repaired) {
          await cryptoKeysApi.saveUserKey({
            public_key_jwk: JSON.stringify(unlockedKey.publicKeyJwk),
            encrypted_private_key_jwk: keyInfo.encrypted_private_key_jwk,
            kdf_algorithm: keyInfo.kdf_algorithm || 'PBKDF2-SHA256',
            kdf_params_json: keyInfo.kdf_params_json || null,
            key_version: Number(keyInfo.key_version || 1),
          });
          await loadKeyInfo();
        }
        setUnlocked({
          privateKey: unlockedKey.privateKey,
          publicKeyJwk: unlockedKey.publicKeyJwk,
          keyVersion: Number(keyInfo.key_version || 1),
        });
        message.success(repaired ? '安全密钥已解锁，损坏的公钥已自动修复' : '安全密钥已解锁');
      } else {
        const bundle = await createUserKeyBundle(keyPassword);
        const keyVersion = keyInfo ? Number(keyInfo.key_version || 1) + 1 : 1;
        await cryptoKeysApi.saveUserKey({
          public_key_jwk: bundle.public_key_jwk,
          encrypted_private_key_jwk: bundle.encrypted_private_key_jwk,
          kdf_algorithm: 'PBKDF2-SHA256',
          key_version: keyVersion,
        });
        setUnlocked({
          privateKey: bundle.privateKey,
          publicKeyJwk: bundle.publicKeyJwk,
          keyVersion,
        });
        await loadKeyInfo();
        message.success(keyRepairMode ? '安全密钥已修复并解锁' : '安全密钥已创建并解锁');
      }
      setKeyPassword('');
      setKeyPasswordConfirm('');
      setKeyRepairMode(false);
      setKeyModalOpen(false);
    } catch (error) {
      message.error(error.message || '安全密钥处理失败，请确认密码正确');
    } finally {
      setKeyBusy(false);
    }
  };

  const openKeyRepair = () => {
    Modal.confirm({
      title: '检测到安全密钥需要修复',
      content: '你之前已经设置过安全密钥，但系统检测到旧版本保存的数据不完整，当前无法正常解锁。修复会生成一套新密钥，你可以继续使用原安全密码，也可以设置新密码。少数仅由旧密钥授权的历史内容，可能需要其他已授权 CXO 打开并重新保存后才能恢复访问。',
      okText: '开始修复',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setKeyRepairMode(true);
        setKeyPassword('');
        setKeyPasswordConfirm('');
        setKeyModalOpen(true);
      },
    });
  };

  const ensureUnlocked = () => {
    if (!window.crypto?.subtle) {
      message.error('当前浏览器不支持 Web Crypto，无法处理加密内容');
      return false;
    }
    if (!unlocked?.privateKey) {
      if (keyInfo && !keyHealth.privateEnvelopeValid) openKeyRepair();
      else setKeyModalOpen(true);
      return false;
    }
    return true;
  };

  const updateDirtySection = useCallback((sectionId, dirty) => {
    const next = new Set(dirtySectionIdsRef.current);
    if (dirty) next.add(Number(sectionId));
    else next.delete(Number(sectionId));
    dirtySectionIdsRef.current = next;
    setDirtySectionIds([...next]);
  }, []);

  const patchPreparationContent = (section, content) => {
    const sectionId = Number(section.id);
    const previous = sectionDraftsRef.current[sectionId]
      || normalizeOperationalPreparationContent(section.default_blocks, section.default_questions);
    const next = normalizeOperationalPreparationContent(content, section.default_questions);
    const previousSignature = getOperationalPreparationSignature(previous, section.default_questions);
    const nextSignature = getOperationalPreparationSignature(next, section.default_questions);
    if (previousSignature === nextSignature) return;

    sectionDraftsRef.current = { ...sectionDraftsRef.current, [sectionId]: next };
    setSectionDrafts(prev => ({ ...prev, [sectionId]: next }));
    updateDirtySection(sectionId, true);
    updateSectionSaveState(sectionId, { phase: unlocked?.privateKey ? 'dirty' : 'unlock_required' });

    const submissionChanged = getOperationalPreparationSubmissionSignature(previous, section.default_questions)
      !== getOperationalPreparationSubmissionSignature(next, section.default_questions);
    if (submissionChanged) {
      updateSectionLocalStatus(sectionId, { status: 'draft', submittedAt: null });
    }
  };

  const persistSection = useCallback(async (sectionId, { showError = false } = {}) => {
    const normalizedSectionId = Number(sectionId);
    const section = (detail?.sections || []).find(item => Number(item.id) === normalizedSectionId);
    if (!section) return false;

    const pending = sectionPendingSaveRef.current[normalizedSectionId];
    if (pending) {
      await pending.catch(() => null);
      return persistSectionRef.current?.(normalizedSectionId, { showError }) || false;
    }

    const payload = normalizeOperationalPreparationContent(
      sectionDraftsRef.current[normalizedSectionId] || section.default_blocks,
      section.default_questions,
    );
    const signature = getOperationalPreparationSignature(payload, section.default_questions);
    if (sectionLastSavedSignatureRef.current[normalizedSectionId] === signature) {
      updateDirtySection(normalizedSectionId, false);
      updateSectionSaveState(normalizedSectionId, { phase: 'saved' });
      return true;
    }

    if (!unlocked?.privateKey) {
      updateSectionSaveState(normalizedSectionId, { phase: 'unlock_required' });
      return false;
    }

    const savePromise = (async () => {
      updateSectionSaveState(normalizedSectionId, { phase: 'saving' });
      try {
        const sectionAuthorizedUserIds = [...new Set([
          ...(section.authorized_user_ids || []).map(Number),
          Number(user?.id),
        ].filter(Boolean))];
        const encrypted = await encryptPayloadForUsers(payload, sectionAuthorizedUserIds, {
          [user?.id]: { jwk: unlocked?.publicKeyJwk, key_version: unlocked?.keyVersion },
        });
        await operationalMeetingsApi.updateSection(normalizedSectionId, {
          content_ciphertext: encrypted.ciphertext,
          crypto_version: 'v2_client',
          record_keys: encrypted.record_keys,
        });
        sectionLastSavedSignatureRef.current[normalizedSectionId] = signature;
        const latest = sectionDraftsRef.current[normalizedSectionId] || payload;
        const latestSignature = getOperationalPreparationSignature(latest, section.default_questions);
        const isCurrent = latestSignature === signature;
        updateDirtySection(normalizedSectionId, !isCurrent);
        updateSectionSaveState(normalizedSectionId, () => ({
          phase: isCurrent ? 'saved' : 'dirty',
          savedAt: new Date().toISOString(),
          unavailableUserCount: encrypted.unavailable_user_ids.length,
        }));
        return true;
      } catch (error) {
        updateSectionSaveState(normalizedSectionId, {
          phase: 'error',
          error: error.response?.data?.error || error.message || '自动保存失败',
        });
        if (showError) message.error(error.response?.data?.error || error.message || '自动保存失败');
        return false;
      }
    })();

    sectionPendingSaveRef.current[normalizedSectionId] = savePromise;
    try {
      return await savePromise;
    } finally {
      if (sectionPendingSaveRef.current[normalizedSectionId] === savePromise) {
        delete sectionPendingSaveRef.current[normalizedSectionId];
      }
    }
  }, [detail?.sections, unlocked, updateDirtySection, updateSectionSaveState, user?.id]);

  persistSectionRef.current = persistSection;

  useEffect(() => {
    if (sectionAutoSaveTimerRef.current) window.clearTimeout(sectionAutoSaveTimerRef.current);
    if (!dirtySectionIds.length) return undefined;
    sectionAutoSaveTimerRef.current = window.setTimeout(() => {
      dirtySectionIds.forEach(sectionId => {
        persistSectionRef.current?.(sectionId).catch(() => {});
      });
    }, SECTION_AUTO_SAVE_DELAY);
    return () => {
      if (sectionAutoSaveTimerRef.current) window.clearTimeout(sectionAutoSaveTimerRef.current);
    };
  }, [dirtySectionIds, sectionDrafts, persistSection]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      dirtySectionIdsRef.current.forEach(sectionId => {
        persistSectionRef.current?.(sectionId).catch(() => {});
      });
    }, SECTION_AUTO_SAVE_INTERVAL);
    const flushOnHide = () => {
      if (document.visibilityState !== 'hidden') return;
      dirtySectionIdsRef.current.forEach(sectionId => {
        persistSectionRef.current?.(sectionId).catch(() => {});
      });
    };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', flushOnHide);
      if (sectionAutoSaveTimerRef.current) window.clearTimeout(sectionAutoSaveTimerRef.current);
    };
  }, []);

  const submitSection = async (section) => {
    if (!ensureUnlocked()) return;
    const sectionId = Number(section.id);
    const payload = normalizeOperationalPreparationContent(
      sectionDraftsRef.current[sectionId] || section.default_blocks,
      section.default_questions,
    );
    if (!operationalPreparationHasAnswers(payload, section.default_questions)) {
      message.warning('请先填写准备内容，再标记已提交');
      return;
    }

    setSubmittingSectionId(sectionId);
    try {
      let saved = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        saved = await persistSection(sectionId, { showError: true });
        if (!saved || !dirtySectionIdsRef.current.has(sectionId)) break;
      }
      if (!saved || dirtySectionIdsRef.current.has(sectionId)) {
        message.warning('最新内容仍在保存，请稍后再标记提交');
        return;
      }
      await operationalMeetingsApi.submitSection(sectionId);
      const submittedAt = new Date().toISOString();
      updateSectionLocalStatus(sectionId, { status: 'submitted', submittedAt });
      await Promise.all([loadMeetings(), loadDetail(section.meeting_id)]);
      message.success('已标记提交，会议提纲将使用当前版本');
      const unavailableUserCount = Number(sectionSaveStatesRef.current[sectionId]?.unavailableUserCount || 0);
      if (unavailableUserCount) {
        message.warning(`${unavailableUserCount} 位授权人的安全密钥尚未就绪，暂时无法查看本次内容`);
      }
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '标记提交失败');
    } finally {
      setSubmittingSectionId(null);
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
      const agenda = normalizeOperationalAgendaContent(result.agenda);
      const encrypted = await encryptPayloadForUsers(agenda, meetingAuthorizedUserIds, {
        [user?.id]: { jwk: unlocked?.publicKeyJwk, key_version: unlocked?.keyVersion },
      });
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
      agendaDraftRef.current = agenda;
      agendaLastSavedSignatureRef.current = getDocumentBodySignature(agenda);
      agendaDirtyRef.current = false;
      setAgendaDraft(agenda);
      setAgendaSaveState({ phase: 'saved', savedAt: new Date().toISOString(), unavailableUserCount: encrypted.unavailable_user_ids.length });
      await loadMeetings();
      await loadDetail(detail.meeting.id);
      message.success(result.runtime?.mode === 'llm' ? 'AI 提纲已生成' : '已生成规则兜底提纲');
      if (encrypted.unavailable_user_ids.length) {
        message.warning(`${encrypted.unavailable_user_ids.length} 位参与人的安全密钥尚未就绪，暂时无法查看本次提纲`);
      }
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '生成提纲失败');
    } finally {
      setAgendaLoading(false);
    }
  };

  const patchAgendaContent = (content) => {
    const next = normalizeOperationalAgendaContent(content);
    agendaDraftRef.current = next;
    agendaDirtyRef.current = true;
    setAgendaDraft(next);
    setAgendaSaveState(prev => ({ ...prev, phase: unlocked?.privateKey ? 'dirty' : 'unlock_required' }));
  };

  const patchDecisionContent = (content) => {
    const next = normalizeOperationalDecisionContent(content);
    decisionDraftRef.current = next;
    decisionDirtyRef.current = true;
    setDecisionDraft(next);
    setDecisionSaveState(prev => ({ ...prev, phase: unlocked?.privateKey ? 'dirty' : 'unlock_required' }));
  };

  const saveAgenda = async ({ silent = false } = {}) => {
    if (!detail?.meeting?.id) return false;
    const payload = normalizeOperationalAgendaContent(agendaDraftRef.current);
    if (!payload) return false;
    const signature = getDocumentBodySignature(payload);
    if (signature === agendaLastSavedSignatureRef.current) {
      agendaDirtyRef.current = false;
      setAgendaSaveState(prev => ({ ...prev, phase: 'saved' }));
      return true;
    }
    if (!ensureUnlocked()) {
      setAgendaSaveState(prev => ({ ...prev, phase: 'unlock_required' }));
      return false;
    }
    setAgendaSaveState(prev => ({ ...prev, phase: 'saving' }));
    try {
      const encrypted = await encryptPayloadForUsers(payload, meetingAuthorizedUserIds, {
        [user?.id]: { jwk: unlocked?.publicKeyJwk, key_version: unlocked?.keyVersion },
      });
      await operationalMeetingsApi.saveAgenda(detail.meeting.id, {
        agenda_ciphertext: encrypted.ciphertext,
        crypto_version: 'v2_client',
        record_keys: encrypted.record_keys,
        source_hash: detail.agenda?.source_hash || null,
        model_provider: detail.agenda?.model_provider || 'edited',
        model_name: detail.agenda?.model_name || '',
        prompt_version: detail.agenda?.prompt_version || '',
        safety_scan_status: detail.agenda?.safety_scan_status || 'passed',
      });
      agendaLastSavedSignatureRef.current = signature;
      agendaDirtyRef.current = false;
      setAgendaSaveState({ phase: 'saved', savedAt: new Date().toISOString(), unavailableUserCount: encrypted.unavailable_user_ids.length });
      await loadMeetings();
      if (!silent) message.success('会议提纲已保存');
      if (encrypted.unavailable_user_ids.length && !silent) {
        message.warning(`${encrypted.unavailable_user_ids.length} 位参与人的安全密钥尚未就绪，暂时无法查看本次提纲`);
      }
      return true;
    } catch (error) {
      setAgendaSaveState(prev => ({ ...prev, phase: 'error', error: error.response?.data?.error || error.message || '保存会议提纲失败' }));
      if (!silent) message.error(error.response?.data?.error || error.message || '保存会议提纲失败');
      return false;
    }
  };

  const saveDecision = async ({ silent = false } = {}) => {
    if (!detail?.meeting?.id || !ensureUnlocked()) return;
    const payload = normalizeOperationalDecisionContent(decisionDraftRef.current);
    const signature = getDocumentBodySignature(payload);
    if (signature === decisionLastSavedSignatureRef.current) {
      decisionDirtyRef.current = false;
      setDecisionSaveState(prev => ({ ...prev, phase: 'saved' }));
      return true;
    }
    setDecisionSaveState(prev => ({ ...prev, phase: 'saving' }));
    try {
      const encrypted = await encryptPayloadForUsers(payload, meetingAuthorizedUserIds, {
        [user?.id]: { jwk: unlocked?.publicKeyJwk, key_version: unlocked?.keyVersion },
      });
      await operationalMeetingsApi.saveDecision(detail.meeting.id, {
        decision_ciphertext: encrypted.ciphertext,
        crypto_version: 'v2_client',
        record_keys: encrypted.record_keys,
        status: documentBodyHasContent(payload) ? 'saved' : 'draft',
      });
      decisionLastSavedSignatureRef.current = signature;
      decisionDirtyRef.current = false;
      setDecisionSaveState({ phase: 'saved', savedAt: new Date().toISOString(), unavailableUserCount: encrypted.unavailable_user_ids.length });
      await loadMeetings();
      if (!silent) message.success('会议结论已保存');
      if (encrypted.unavailable_user_ids.length && !silent) {
        message.warning(`${encrypted.unavailable_user_ids.length} 位参与人的安全密钥尚未就绪，暂时无法查看本次结论`);
      }
      return true;
    } catch (error) {
      setDecisionSaveState(prev => ({ ...prev, phase: 'error', error: error.response?.data?.error || error.message || '保存会议结论失败' }));
      if (!silent) message.error(error.response?.data?.error || error.message || '保存会议结论失败');
      return false;
    }
  };

  useEffect(() => {
    if (agendaAutoSaveTimerRef.current) window.clearTimeout(agendaAutoSaveTimerRef.current);
    if (!agendaDirtyRef.current || !agendaDraft) return undefined;
    agendaAutoSaveTimerRef.current = window.setTimeout(() => {
      if (!unlocked?.privateKey) {
        setAgendaSaveState(prev => ({ ...prev, phase: 'unlock_required' }));
        return;
      }
      saveAgenda({ silent: true });
    }, MEETING_CONTENT_AUTO_SAVE_DELAY);
    return () => {
      if (agendaAutoSaveTimerRef.current) window.clearTimeout(agendaAutoSaveTimerRef.current);
    };
  }, [agendaDraft, unlocked?.privateKey]);

  useEffect(() => {
    if (decisionAutoSaveTimerRef.current) window.clearTimeout(decisionAutoSaveTimerRef.current);
    if (!decisionDirtyRef.current) return undefined;
    decisionAutoSaveTimerRef.current = window.setTimeout(() => {
      if (!unlocked?.privateKey) {
        setDecisionSaveState(prev => ({ ...prev, phase: 'unlock_required' }));
        return;
      }
      saveDecision({ silent: true });
    }, MEETING_CONTENT_AUTO_SAVE_DELAY);
    return () => {
      if (decisionAutoSaveTimerRef.current) window.clearTimeout(decisionAutoSaveTimerRef.current);
    };
  }, [decisionDraft, unlocked?.privateKey]);

  const openParticipantManager = () => {
    setParticipantUserIds((detail?.participants || [])
      .filter(item => item.participant_type === 'designated')
      .map(item => Number(item.user_id)));
    setParticipantOpen(true);
  };

  const saveParticipants = async () => {
    if (!detail?.meeting?.id) return;
    const hasEncryptedMeetingContent = Boolean(
      detail.agenda?.agenda_ciphertext || detail.decision?.decision_ciphertext,
    );
    if (hasEncryptedMeetingContent && !ensureUnlocked()) return;
    setParticipantBusy(true);
    try {
      const result = await operationalMeetingsApi.updateParticipants(detail.meeting.id, {
        participant_user_ids: participantUserIds,
      });
      let rekeyIncomplete = false;
      const recipientIds = [...new Set([
        ...(result.meeting_authorized_user_ids || []).map(Number),
        Number(user?.id),
      ].filter(Boolean))];

      if (result.requires_rekey && detail.agenda?.agenda_ciphertext) {
        if (!agendaDraft) {
          rekeyIncomplete = true;
        } else {
          const encryptedAgenda = await encryptPayloadForUsers(agendaDraft, recipientIds, {
            [user?.id]: { jwk: unlocked?.publicKeyJwk, key_version: unlocked?.keyVersion },
          });
          await operationalMeetingsApi.saveAgenda(detail.meeting.id, {
            agenda_ciphertext: encryptedAgenda.ciphertext,
            crypto_version: 'v2_client',
            record_keys: encryptedAgenda.record_keys,
            source_hash: detail.agenda.source_hash,
            model_provider: detail.agenda.model_provider,
            model_name: detail.agenda.model_name,
            prompt_version: detail.agenda.prompt_version,
            safety_scan_status: detail.agenda.safety_scan_status || 'passed',
          });
          if (encryptedAgenda.unavailable_user_ids.length) rekeyIncomplete = true;
        }
      }
      if (result.requires_rekey && detail.decision?.decision_ciphertext) {
        if (!unlocked?.privateKey) {
          rekeyIncomplete = true;
        } else {
          const encryptedDecision = await encryptPayloadForUsers(normalizeOperationalDecisionContent(decisionDraft), recipientIds, {
            [user?.id]: { jwk: unlocked?.publicKeyJwk, key_version: unlocked?.keyVersion },
          });
          await operationalMeetingsApi.saveDecision(detail.meeting.id, {
            decision_ciphertext: encryptedDecision.ciphertext,
            crypto_version: 'v2_client',
            record_keys: encryptedDecision.record_keys,
            status: detail.decision.status || 'saved',
          });
          if (encryptedDecision.unavailable_user_ids.length) rekeyIncomplete = true;
        }
      }

      setParticipantOpen(false);
      await loadDetail(detail.meeting.id);
      await loadMeetings();
      if (rekeyIncomplete) {
        message.warning('参与人已更新，但部分历史会议内容需要由能正常解密的 CXO 重新保存后，新参与人才可查看');
      } else {
        message.success(result.requires_rekey ? '参与人及会议内容授权已更新' : '参与人已更新');
      }
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '参与人更新失败');
    } finally {
      setParticipantBusy(false);
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
      title: '准备进度',
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
    return Boolean(detail?.can_generate_agenda);
  }, [detail?.can_generate_agenda]);

  const preparationSubmissionStats = useMemo(() => {
    const requiredSections = (detail?.sections || []).filter(section => Number(section.is_required ?? 1) === 1);
    const submitted = requiredSections.filter((section) => {
      const localStatus = sectionLocalStatuses[section.id]?.status || section.status;
      return localStatus === 'submitted' || localStatus === 'locked';
    }).length;
    return { required: requiredSections.length, submitted };
  }, [detail?.sections, sectionLocalStatuses]);

  const filteredAnnualRows = useMemo(() => {
    const keyword = annualKeyword.trim().toLowerCase();
    return annualRows.filter(row => {
      const draft = annualDrafts[row.meeting.id] || {};
      if (annualOnlyConclusion && !meetingContentToPlain(draft.decision).trim()) return false;
      if (!keyword) return true;
      const searchable = [
        row.meeting.week_start,
        row.meeting.week_end,
        row.meeting.title,
        agendaToPlain(draft.agenda),
        meetingContentToPlain(draft.decision),
      ].join('\n').toLowerCase();
      return searchable.includes(keyword);
    });
  }, [annualDrafts, annualKeyword, annualOnlyConclusion, annualRows]);

  const renderSection = (section) => {
    const localStatus = sectionLocalStatuses[section.id] || {
      status: section.status || 'draft',
      submittedAt: section.submitted_at || null,
    };
    const status = sectionStatusMeta[localStatus.status] || sectionStatusMeta.draft;
    const saveState = sectionSaveStates[section.id] || { phase: 'idle', savedAt: null };
    const draft = normalizeOperationalPreparationContent(
      sectionDrafts[section.id] || section.default_blocks,
      section.default_questions,
    );
    const isOwnPreparation = Number(section.owner_user_id) === Number(user?.id);
    const {
      canEdit,
      lacksDecryptGrant,
      needsUnlockForExistingContent,
      readOnly,
    } = getPreparationEditorState(section, Boolean(unlocked?.privateKey));
    const saveStatusLabel = (() => {
      if (saveState.phase === 'dirty') return { text: '待自动保存', color: '#8c8c8c' };
      if (saveState.phase === 'saving') return { text: '自动保存中...', color: '#1677ff' };
      if (saveState.phase === 'error') return { text: '自动保存失败', color: '#cf1322' };
      if (saveState.phase === 'unlock_required') return { text: '解锁后自动保存', color: '#d46b08' };
      if (saveState.phase === 'saved') {
        return {
          text: saveState.savedAt ? `已自动保存 ${dayjs(saveState.savedAt).format('HH:mm')}` : '已自动保存',
          color: '#389e0d',
        };
      }
      return { text: '自动保存已开启', color: '#8c8c8c' };
    })();
    return (
      <Collapse.Panel
        key={String(section.id)}
        header={(
          <Space wrap>
            <Text strong>{section.title}</Text>
            <Tag color={canEdit ? 'blue' : 'default'}>
              {isOwnPreparation ? '我的准备' : (canEdit ? '可编辑' : '仅查看')}
            </Tag>
          </Space>
        )}
        extra={(
          <Space
            wrap
            size={6}
            onClick={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
          >
            {canEdit && (
              <Text style={{ fontSize: 12, color: saveStatusLabel.color }}>
                <SaveOutlined style={{ marginRight: 4 }} />
                {saveStatusLabel.text}
              </Text>
            )}
            {saveState.phase === 'error' && canEdit && (
              <Button
                type="link"
                size="small"
                onClick={() => persistSection(section.id, { showError: true })}
                style={{ paddingInline: 2 }}
              >
                重试
              </Button>
            )}
            <Tag color={status.color} style={{ marginInlineEnd: 0 }}>
              {status.label}
              {localStatus.status === 'submitted' && localStatus.submittedAt
                ? ` · ${dayjs(localStatus.submittedAt).format('MM-DD HH:mm')}`
                : ''}
            </Tag>
            {canEdit && localStatus.status !== 'submitted' && localStatus.status !== 'locked' && (
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={submittingSectionId === Number(section.id)}
                onClick={() => submitSection(section)}
              >
                标记已提交
              </Button>
            )}
          </Space>
        )}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {!canEdit && (
            <Alert
              type="info"
              showIcon
              message="当前准备块为只读"
              description={section.owner_name
                ? `当前登录账号“${user?.display_name || user?.username || '-'}”正在查看“${section.owner_name}”负责的准备内容。CXO 可以编辑全部准备块，其他参与人仅可编辑自己的准备块。`
                : '当前账号没有此准备块的编辑权限。'}
            />
          )}
          {canEdit && needsUnlockForExistingContent && (
            <Alert
              type="info"
              showIcon
              message="内容已加密"
              description="请使用页面右上角的安全密码入口解锁后查看和编辑。"
            />
          )}
          {lacksDecryptGrant && (
            <Alert type="warning" showIcon message="当前账号没有此准备块的记录密钥，无法查看或覆盖原内容。" />
          )}
          <DocumentBodyEditor
            value={draft}
            onChange={value => patchPreparationContent(section, value)}
            onSave={async () => {
              if (!ensureUnlocked()) return false;
              const saved = await persistSection(section.id, { showError: true });
              if (saved) message.success('准备内容已保存');
              return saved;
            }}
            minHeight={280}
            placeholder="填写本周准备内容"
            readOnly={readOnly}
          />
        </Space>
      </Collapse.Panel>
    );
  };

  if (!hasMenuAccess || !hasSensitiveAccess) {
    return (
      <Alert
        type="error"
        showIcon
        message={!hasMenuAccess ? '无经营周会菜单权限' : '无经营周会敏感信息权限'}
        description={!hasMenuAccess
          ? '请联系系统管理员开放“目标计划 -> 经营周会”菜单。'
          : '请联系系统管理员在“通用配置 -> 敏感授权”中添加授权。'}
      />
    );
  }

  const renderKeyAction = () => (
    unlocked?.privateKey ? (
      <Tag icon={<UnlockOutlined />} color="green">安全密码已解锁</Tag>
    ) : (
      <Button
        icon={<LockOutlined />}
        onClick={() => {
          if (keyInfo && !keyHealth.privateEnvelopeValid) openKeyRepair();
          else setKeyModalOpen(true);
        }}
      >
        {keyInfo && !keyHealth.privateEnvelopeValid ? '修复安全密码' : (keyInfo ? '解锁安全密码' : '设置安全密码')}
      </Button>
    )
  );

  const preparationPanel = detail?.meeting ? (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {detail.sections?.length ? (
        <Collapse
          ghost
          defaultActiveKey={getDefaultPreparationSectionKeys(detail.sections)}
          style={{ background: 'transparent' }}
        >
          {(detail.sections || []).map(renderSection)}
        </Collapse>
      ) : (
        <Empty description="暂无可查看的准备内容" />
      )}
    </Space>
  ) : null;

  const renderMeetingSaveStatus = (state, emptyText = '编辑后自动保存') => {
    const meta = {
      dirty: { text: '待自动保存', color: '#8c8c8c' },
      saving: { text: '自动保存中...', color: '#1677ff' },
      error: { text: state.error || '自动保存失败', color: '#cf1322' },
      unlock_required: { text: '解锁后自动保存', color: '#d46b08' },
      saved: {
        text: state.savedAt ? `已自动保存 ${dayjs(state.savedAt).format('HH:mm')}` : '已自动保存',
        color: '#389e0d',
      },
    }[state.phase] || { text: emptyText, color: '#8c8c8c' };
    return (
      <Text style={{ fontSize: 12, color: meta.color }}>
        <SaveOutlined style={{ marginRight: 4 }} />
        {meta.text}
      </Text>
    );
  };

  const meetingPanel = detail?.meeting ? (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={(
          <Space wrap>
            <RobotOutlined />
            AI 会议提纲
            {preparationSubmissionStats.required > 0 && (
              <Tag color={preparationSubmissionStats.submitted >= preparationSubmissionStats.required ? 'green' : 'gold'}>
                准备 {preparationSubmissionStats.submitted}/{preparationSubmissionStats.required} 已提交
              </Tag>
            )}
          </Space>
        )}
        size="small"
        extra={(
          <Space wrap>
            {agendaDraft && Boolean(detail.can_generate_agenda) && renderMeetingSaveStatus(agendaSaveState)}
            {agendaSaveState.phase === 'error' && Boolean(detail.can_generate_agenda) && (
              <Button size="small" onClick={() => saveAgenda({ silent: false })}>重试</Button>
            )}
            {Boolean(detail.can_generate_agenda) && (
              <Button
                icon={<SaveOutlined />}
                loading={agendaSaveState.phase === 'saving'}
                disabled={!agendaDraft}
                onClick={() => saveAgenda({ silent: false })}
              >
                保存提纲
              </Button>
            )}
            {Boolean(detail.can_generate_agenda) && (
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={agendaLoading}
                disabled={!canGenerateAgenda}
                onClick={generateAgenda}
              >
                {detail.agenda ? '重新生成提纲' : '生成会议提纲'}
              </Button>
            )}
          </Space>
        )}
      >
        {agendaDraft ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <DocumentBodyEditor
              value={agendaDraft}
              onChange={patchAgendaContent}
              onSave={() => saveAgenda({ silent: false })}
              minHeight={360}
              placeholder="编辑会议提纲"
              readOnly={!detail.can_generate_agenda || !unlocked?.privateKey}
            />
            <Alert type="success" showIcon message="提纲已加密保存，毛利和利润类敏感字段已在生成前后过滤。" />
          </Space>
        ) : (
          <Empty description={detail.agenda?.agenda_ciphertext && !unlocked?.privateKey ? '提纲已加密，解锁后可查看' : '暂无会议提纲'} />
        )}
      </Card>

      <Card
        title={<Space><CheckCircleOutlined />会议结论</Space>}
        size="small"
        extra={Boolean(detail.can_edit_decision) && (
          <Space wrap>
            {renderMeetingSaveStatus(decisionSaveState)}
            {decisionSaveState.phase === 'error' && (
              <Button size="small" onClick={() => saveDecision({ silent: false })}>重试</Button>
            )}
            <Button
              icon={<SaveOutlined />}
              loading={decisionSaveState.phase === 'saving'}
              onClick={() => saveDecision({ silent: false })}
            >
              保存结论
            </Button>
          </Space>
        )}
      >
        <DocumentBodyEditor
          value={decisionDraft}
          onChange={patchDecisionContent}
          onSave={() => saveDecision({ silent: false })}
          placeholder="记录会议最终决策、负责人、截止时间和后续动作"
          minHeight={280}
          readOnly={!detail.can_edit_decision || !unlocked?.privateKey}
        />
      </Card>
    </Space>
  ) : null;

  return (
    <div style={{ padding: isMobile ? 0 : 24 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {isDetailView ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Space wrap>
                <Tooltip title="返回周会列表">
                  <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executive/operational')} />
                </Tooltip>
                <div>
                  <Title level={4} style={{ margin: 0 }}>经营周会</Title>
                  <Text type="secondary">
                    {detail?.meeting ? `${detail.meeting.week_start} ~ ${detail.meeting.week_end}` : '加载中'}
                  </Text>
                </div>
              </Space>
              <Space wrap>
                {renderKeyAction()}
                {Boolean(detail?.can_manage_participants) && (
                  <Button icon={<TeamOutlined />} onClick={openParticipantManager}>参与人</Button>
                )}
                <Button icon={<ReloadOutlined />} onClick={() => loadDetail(meetingId)}>刷新</Button>
              </Space>
            </div>

            <Spin spinning={detailLoading}>
              {!detail?.meeting ? (
                <Empty description="暂无详情" />
              ) : (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {keyInfoLoaded && !keyInfo && (
                    <Alert
                      type="warning"
                      showIcon
                      message="首次使用需要设置安全密码"
                      description="请在页面右上角设置安全密码。经营周会内容会在浏览器本地加密后保存，安全密码不会上传服务器。"
                    />
                  )}
                  {keyInfo && !unlocked?.privateKey && (
                    <Alert
                      type="info"
                      showIcon
                      message="安全内容当前已锁定"
                      description="请使用页面右上角的“解锁安全密码”查看加密内容；未加密的新内容可先编辑，解锁后会自动保存。"
                    />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Tag color={(statusMeta[detail.meeting.status] || statusMeta.draft).color}>
                      {(statusMeta[detail.meeting.status] || statusMeta.draft).label}
                    </Tag>
                    <Text>准备：{detail.meeting.submitted_required_sections}/{detail.meeting.required_sections}</Text>
                    <Text>提纲：{detail.meeting.agenda_status === 'generated' ? '已生成' : '未生成'}</Text>
                    <Text>结论：{detail.meeting.decision_status === 'saved' ? '已保存' : '未填写'}</Text>
                    {(detail.participants || []).map(item => (
                      <Tag key={item.user_id} color={item.participant_type === 'cxo' ? 'blue' : 'default'}>
                        {item.display_name || item.username}
                      </Tag>
                    ))}
                  </div>
                  <Tabs
                    activeKey={detailTab}
                    onChange={key => setSearchParams(key === 'meeting' ? { tab: 'meeting' } : {})}
                    items={[
                      { key: 'preparation', label: '准备', children: preparationPanel },
                      { key: 'meeting', label: '会议', children: meetingPanel },
                    ]}
                  />
                </Space>
              )}
            </Spin>
          </>
        ) : (
          <Card
            title={<Space><FileDoneOutlined />经营周会</Space>}
            extra={(
            <Space wrap>
              {renderKeyAction()}
              <Button icon={<ReloadOutlined />} onClick={loadMeetings}>刷新</Button>
              {cxoIdentity && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建周会</Button>}
            </Space>
            )}
          >
            {keyInfoLoaded && !keyInfo && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="首次使用需要设置安全密码"
                description="请在页面右上角设置安全密码。安全密码不会上传服务器，忘记后需要由其他已授权 CXO 重新授权。"
              />
            )}
            <Tabs
              activeKey={listView}
              onChange={key => setSearchParams(key === 'annual' ? { view: 'annual' } : {})}
              items={[
                {
                  key: 'records',
                  label: '周会记录',
                  children: (
                    <Table
                      rowKey="id"
                      loading={loading}
                      columns={columns}
                      dataSource={meetings}
                      scroll={{ x: 900 }}
                      pagination={{ defaultPageSize: 20, showTotal: total => `共 ${total} 条` }}
                      onRow={record => ({ onDoubleClick: () => openDetail(record) })}
                    />
                  ),
                },
                {
                  key: 'annual',
                  label: '年度汇总',
                  children: (
                    <Spin spinning={annualLoading}>
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Select
                            value={annualYear}
                            onChange={setAnnualYear}
                            style={{ width: 120 }}
                            suffixIcon={<CalendarOutlined />}
                            options={Array.from({ length: 6 }, (_, index) => dayjs().year() + 1 - index)
                              .map(year => ({ value: year, label: `${year} 年` }))}
                          />
                          <Input.Search
                            allowClear
                            value={annualKeyword}
                            onChange={event => setAnnualKeyword(event.target.value)}
                            placeholder="搜索提纲或会议结论"
                            style={{ width: isMobile ? '100%' : 280 }}
                          />
                          <Checkbox
                            checked={annualOnlyConclusion}
                            onChange={event => setAnnualOnlyConclusion(event.target.checked)}
                          >
                            仅看有结论
                          </Checkbox>
                          <Text type="secondary">共 {filteredAnnualRows.length} 周</Text>
                        </div>
                        {!unlocked?.privateKey && annualRows.length > 0 && (
                          <Alert
                            type="info"
                            showIcon
                            message="解锁安全密码后可在本页查看全年提纲和会议结论"
                            description="请使用页面右上角的安全密码入口。"
                          />
                        )}
                        {filteredAnnualRows.length ? (
                          <Collapse
                            defaultActiveKey={filteredAnnualRows.map(row => String(row.meeting.id))}
                            items={filteredAnnualRows.map(row => {
                              const draft = annualDrafts[row.meeting.id] || {};
                              const meta = statusMeta[row.meeting.status] || statusMeta.draft;
                              return {
                                key: String(row.meeting.id),
                                label: (
                                  <Space wrap>
                                    <Text strong>{row.meeting.week_start} ~ {row.meeting.week_end}</Text>
                                    <Tag color={meta.color}>{meta.label}</Tag>
                                  </Space>
                                ),
                                extra: (
                                  <Button
                                    type="link"
                                    size="small"
                                    onClick={event => {
                                      event.stopPropagation();
                                      navigate(`/executive/operational/${row.meeting.id}?tab=meeting`);
                                    }}
                                  >
                                    查看本周
                                  </Button>
                                ),
                                children: (
                                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <Text strong>AI 会议提纲</Text>
                                    {draft.agenda ? (
                                      <DocumentBodyEditor
                                        value={draft.agenda}
                                        readOnly
                                        minHeight={120}
                                        placeholder="暂无会议提纲"
                                      />
                                    ) : (
                                      <Text type="secondary">{row.agenda?.agenda_ciphertext ? '内容已加密，解锁后可查看' : '未生成'}</Text>
                                    )}
                                    <Divider style={{ margin: '4px 0' }} />
                                    <Text strong>会议结论</Text>
                                    {meetingContentToPlain(draft.decision).trim() ? (
                                      <DocumentBodyEditor
                                        value={draft.decision}
                                        readOnly
                                        minHeight={100}
                                        placeholder="暂无会议结论"
                                      />
                                    ) : (
                                      <Text type="secondary">{row.decision?.decision_ciphertext ? '内容已加密，解锁后可查看' : '未填写'}</Text>
                                    )}
                                    {draft.decryptError && <Alert type="warning" showIcon message="当前账号缺少部分记录密钥" />}
                                  </Space>
                                ),
                              };
                            })}
                          />
                        ) : (
                          <Empty description="该年度暂无可查看的会议内容" />
                        )}
                      </Space>
                    </Spin>
                  ),
                },
              ]}
            />
          </Card>
        )}
      </Space>

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
          <Form.Item label="指定参与人（可选）" name="participant_user_ids">
            <Select
              mode="multiple"
              allowClear
              options={eligibleParticipants
                .filter(item => item.participant_type === 'designated')
                .map(item => ({ value: Number(item.id), label: item.display_name || item.username }))}
              placeholder="参与人只能查看自己的准备内容，可查看本周提纲和结论"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="管理本周参与人"
        open={participantOpen}
        onCancel={() => setParticipantOpen(false)}
        onOk={saveParticipants}
        okText="保存"
        cancelText="取消"
        confirmLoading={participantBusy}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text type="secondary">CXO</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {eligibleParticipants
                  .filter(item => item.participant_type === 'cxo')
                  .map(item => <Tag color="blue" key={item.id}>{item.display_name || item.username}</Tag>)}
              </Space>
            </div>
          </div>
          <div>
            <Text type="secondary">指定参与人</Text>
            <Select
              mode="multiple"
              allowClear
              value={participantUserIds}
              onChange={setParticipantUserIds}
              style={{ width: '100%', marginTop: 8 }}
              options={eligibleParticipants
                .filter(item => item.participant_type === 'designated')
                .map(item => ({ value: Number(item.id), label: item.display_name || item.username }))}
              placeholder="选择本周指定参与人"
            />
          </div>
          <Alert
            type="info"
            showIcon
            message="指定参与人只能查看自己的准备内容；AI 会议提纲和会议结论对本周全部参与人共享。"
          />
        </Space>
      </Modal>

      <Modal
        title={keyRepairMode ? '修复安全密码' : (keyInfo ? '解锁安全密码' : '设置安全密码')}
        open={keyModalOpen}
        onCancel={() => {
          setKeyModalOpen(false);
          setKeyPassword('');
          setKeyPasswordConfirm('');
          setKeyRepairMode(false);
        }}
        onOk={handleKeyAction}
        okText={keyRepairMode ? '完成修复' : (keyInfo ? '解锁' : '创建')}
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
            autoComplete={keyInfo && !keyRepairMode ? 'current-password' : 'new-password'}
          />
          {(!keyInfo || keyRepairMode) && (
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
