import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, DatePicker, Divider, Empty, Form, Grid,
  Input, Modal, Progress, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, FileDoneOutlined,
  HistoryOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, SaveOutlined, TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { operationalMeetingsApi } from '../api';
import { useAuth } from '../AuthContext';
import { richTextToPlain } from '../components/RichText';
import DocumentBodyEditor from '../components/DocumentBodyEditor';
import ContentHistoryDrawer from '../components/ContentHistoryDrawer';
import { mergeCollaborativeDocumentBodies } from '../utils/collaborativeDocument';
import { formatBusinessDateTime } from '../utils/businessTime';
import {
  createDocumentBodyBlock,
  documentBodyHasContent,
  documentBodyToPlain,
  normalizeDocumentBodyValue,
  sanitizeDocumentBodyInlineHtml,
} from '../utils/documentBodyBlocks';
import {
  getDefaultPreparationSectionKeys,
  getOperationalMeetingDetailTab,
  getPreparationEditorState,
} from '../utils/operationalMeetingAccess';
import {
  getOperationalPreparationSubmissionStats,
  getOperationalPreparationSignature,
  getOperationalPreparationSubmissionSignature,
  normalizeOperationalPreparationContent,
  operationalPreparationCanSubmit,
} from '../utils/operationalMeetingPreparation';
import { pollOperationalAgendaGeneration } from '../utils/operationalAgendaGeneration';

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
  if (!value) return normalizeDocumentBodyValue('');
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
  const [sectionDrafts, setSectionDrafts] = useState({});
  const [agendaDraft, setAgendaDraft] = useState(null);
  const [decisionDraft, setDecisionDraft] = useState(() => normalizeOperationalDecisionContent(''));
  const [sectionSaveStates, setSectionSaveStates] = useState({});
  const [sectionLocalStatuses, setSectionLocalStatuses] = useState({});
  const [dirtySectionIds, setDirtySectionIds] = useState([]);
  const [submittingSectionId, setSubmittingSectionId] = useState(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaGenerationError, setAgendaGenerationError] = useState('');
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
  const [remoteUpdateHint, setRemoteUpdateHint] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyScope, setHistoryScope] = useState('agenda');
  const [historyTitle, setHistoryTitle] = useState('历史版本');
  const [historyCanRestore, setHistoryCanRestore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRevisions, setHistoryRevisions] = useState([]);
  const [restoringRevisionId, setRestoringRevisionId] = useState(null);
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
  const sectionRemoteSnapshotsRef = useRef({});
  const agendaRemoteSnapshotRef = useRef(null);
  const decisionRemoteSnapshotRef = useRef(null);
  const agendaPendingSaveRef = useRef(null);
  const decisionPendingSaveRef = useRef(null);
  const detailSyncPendingRef = useRef(false);
  const agendaGenerationAbortControllerRef = useRef(null);

  const hasSensitiveAccess = canAccessSensitiveModule?.(MODULE_KEY);
  const hasMenuAccess = canAccessMenu?.('/executive/operational');
  const cxoIdentity = Boolean(isExecutive?.());
  const isDetailView = Boolean(meetingId);
  const listView = searchParams.get('view') === 'annual' ? 'annual' : 'records';
  const requestedDetailTab = searchParams.get('tab') === 'meeting' ? 'meeting' : 'preparation';
  const canViewPreparationTab = Boolean(detail?.can_view_preparation);
  const detailTab = getOperationalMeetingDetailTab(requestedDetailTab, canViewPreparationTab);
  const canEditMeetingContent = Boolean(detail?.meeting)
    && !['readonly', 'guest'].includes(String(user?.role || '').toLowerCase());

  useEffect(() => {
    const previousController = agendaGenerationAbortControllerRef.current;
    agendaGenerationAbortControllerRef.current = null;
    previousController?.abort();
    setAgendaLoading(false);
    setAgendaGenerationError('');
    return () => {
      const activeController = agendaGenerationAbortControllerRef.current;
      agendaGenerationAbortControllerRef.current = null;
      activeController?.abort();
    };
  }, [meetingId]);

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

  const loadDetail = useCallback(async (id, { background = false } = {}) => {
    if (!id) return;
    if (!background) setDetailLoading(true);
    try {
      const data = await operationalMeetingsApi.get(id);
      setDetail(data);
      return data;
    } catch (error) {
      if (!background) message.error(error.response?.data?.error || '加载经营周会详情失败');
      return null;
    } finally {
      if (!background) setDetailLoading(false);
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
    loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    if (meetingId) loadDetail(meetingId);
    else setDetail(null);
  }, [meetingId, loadDetail]);

  useEffect(() => {
    if (!meetingId) return undefined;
    const sync = async () => {
      if (document.visibilityState !== 'visible' || detailSyncPendingRef.current) return;
      detailSyncPendingRef.current = true;
      try {
        await loadDetail(meetingId, { background: true });
      } finally {
        detailSyncPendingRef.current = false;
      }
    };
    const timer = window.setInterval(sync, 5000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadDetail, meetingId]);

  useEffect(() => {
    if (!remoteUpdateHint) return undefined;
    const timer = window.setTimeout(() => setRemoteUpdateHint(''), 5000);
    return () => window.clearTimeout(timer);
  }, [remoteUpdateHint]);

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
      const nextRemoteSectionSnapshots = {};
      let receivedRemoteUpdate = false;
      let hadMergeConflicts = false;
      for (const section of detail.sections || []) {
        const fallback = normalizeOperationalPreparationContent(section.default_blocks, section.default_questions);
        const remoteContent = section.content
          ? normalizeOperationalPreparationContent(section.content, section.default_questions)
          : fallback;
        const previousRemote = sectionRemoteSnapshotsRef.current[section.id];
        const hasPendingLocalDraft = dirtySectionIdsRef.current.has(Number(section.id))
          && sectionDraftsRef.current[section.id];
        if (hasPendingLocalDraft) {
          const merged = previousRemote
            ? mergeCollaborativeDocumentBodies(
                previousRemote.content,
                sectionDraftsRef.current[section.id],
                remoteContent,
              )
            : { value: sectionDraftsRef.current[section.id], hadConflicts: false };
          nextSections[section.id] = merged.value;
          hadMergeConflicts = hadMergeConflicts || merged.hadConflicts;
        } else {
          nextSections[section.id] = remoteContent;
        }
        if (previousRemote?.updated_at && previousRemote.updated_at !== section.updated_at) receivedRemoteUpdate = true;
        nextRemoteSectionSnapshots[section.id] = { content: remoteContent, updated_at: section.updated_at || '' };
        nextSavedSignatures[section.id] = hasPendingLocalDraft
          ? (sectionLastSavedSignatureRef.current[section.id] || '')
          : (section.content
            ? getOperationalPreparationSignature(remoteContent, section.default_questions)
            : '');
        nextSaveStates[section.id] = hasPendingLocalDraft
          ? {
              ...(sectionSaveStatesRef.current[section.id] || {}),
              phase: 'dirty',
            }
          : {
              phase: section.content ? 'saved' : 'idle',
              savedAt: section.updated_at || null,
            };
        nextLocalStatuses[section.id] = hasPendingLocalDraft
          ? (sectionLocalStatusesRef.current[section.id] || { status: 'draft', submittedAt: null })
          : {
              status: section.status || 'draft',
              submittedAt: section.submitted_at || null,
            };
      }
      const remoteAgenda = normalizeOperationalAgendaContent(detail.agenda?.agenda_content);
      const remoteDecision = normalizeOperationalDecisionContent(detail.decision?.decision_content || '');
      const previousAgendaRemote = agendaRemoteSnapshotRef.current;
      const previousDecisionRemote = decisionRemoteSnapshotRef.current;
      const agendaMerge = agendaDirtyRef.current && agendaDraftRef.current && previousAgendaRemote?.content && remoteAgenda
        ? mergeCollaborativeDocumentBodies(previousAgendaRemote.content, agendaDraftRef.current, remoteAgenda)
        : null;
      const decisionMerge = decisionDirtyRef.current && previousDecisionRemote?.content
        ? mergeCollaborativeDocumentBodies(previousDecisionRemote.content, decisionDraftRef.current, remoteDecision)
        : null;
      const nextAgenda = agendaDirtyRef.current ? (agendaMerge?.value || agendaDraftRef.current) : remoteAgenda;
      const nextDecision = decisionDirtyRef.current ? (decisionMerge?.value || decisionDraftRef.current) : remoteDecision;
      hadMergeConflicts = hadMergeConflicts || Boolean(agendaMerge?.hadConflicts || decisionMerge?.hadConflicts);
      if (previousAgendaRemote?.updated_at && previousAgendaRemote.updated_at !== detail.agenda?.updated_at) receivedRemoteUpdate = true;
      if (previousDecisionRemote?.updated_at && previousDecisionRemote.updated_at !== detail.decision?.updated_at) receivedRemoteUpdate = true;
      if (!cancelled) {
        const preservedDirtySectionIds = new Set(dirtySectionIdsRef.current);
        sectionRemoteSnapshotsRef.current = nextRemoteSectionSnapshots;
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
        agendaRemoteSnapshotRef.current = { content: remoteAgenda, updated_at: detail.agenda?.updated_at || '' };
        decisionRemoteSnapshotRef.current = { content: remoteDecision, updated_at: detail.decision?.updated_at || '' };
        agendaLastSavedSignatureRef.current = remoteAgenda ? getDocumentBodySignature(remoteAgenda) : '';
        decisionLastSavedSignatureRef.current = detail.decision?.decision_content ? getDocumentBodySignature(remoteDecision) : '';
        setAgendaDraft(nextAgenda);
        setDecisionDraft(nextDecision);
        setAgendaSaveState(prev => agendaDirtyRef.current
          ? { ...prev, phase: 'dirty' }
          : { phase: detail.agenda?.agenda_content ? 'saved' : 'idle', savedAt: detail.agenda?.updated_at || detail.agenda?.generated_at || null });
        setDecisionSaveState(prev => decisionDirtyRef.current
          ? { ...prev, phase: 'dirty' }
          : { phase: detail.decision?.decision_content ? 'saved' : 'idle', savedAt: detail.decision?.updated_at || null });
        if (receivedRemoteUpdate) {
          setRemoteUpdateHint(hadMergeConflicts
            ? '检测到协作者更新，已合并其他块并保留本地冲突内容'
            : '已同步协作者的最新修改');
        }
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [detail]);

  useEffect(() => {
    let cancelled = false;
    function hydrateAnnual() {
      const next = {};
      for (const row of annualRows) {
        next[row.meeting.id] = {
          agenda: normalizeOperationalAgendaContent(row.agenda?.agenda_content),
          decision: normalizeOperationalDecisionContent(row.decision?.decision_content || ''),
        };
      }
      if (!cancelled) setAnnualDrafts(next);
    }
    hydrateAnnual();
    return () => { cancelled = true; };
  }, [annualRows]);

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
    updateSectionSaveState(sectionId, { phase: 'dirty' });

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

    const savePromise = (async () => {
      updateSectionSaveState(normalizedSectionId, { phase: 'saving' });
      try {
        const result = await operationalMeetingsApi.updateSection(normalizedSectionId, {
          content: payload,
          ...(sectionRemoteSnapshotsRef.current[normalizedSectionId]?.updated_at
            ? { base_updated_at: sectionRemoteSnapshotsRef.current[normalizedSectionId].updated_at }
            : {}),
        });
        sectionLastSavedSignatureRef.current[normalizedSectionId] = signature;
        sectionRemoteSnapshotsRef.current[normalizedSectionId] = {
          content: payload,
          updated_at: result.updated_at || new Date().toISOString(),
        };
        const latest = sectionDraftsRef.current[normalizedSectionId] || payload;
        const latestSignature = getOperationalPreparationSignature(latest, section.default_questions);
        const isCurrent = latestSignature === signature;
        updateDirtySection(normalizedSectionId, !isCurrent);
        updateSectionSaveState(normalizedSectionId, () => ({
          phase: isCurrent ? 'saved' : 'dirty',
          savedAt: new Date().toISOString(),
        }));
        return true;
      } catch (error) {
        if (error?.response?.status === 409 && error.response?.data?.latest) {
          const latest = error.response.data.latest;
          const remoteContent = normalizeOperationalPreparationContent(
            latest.content,
            section.default_questions,
          );
          const base = sectionRemoteSnapshotsRef.current[normalizedSectionId]?.content || remoteContent;
          const local = sectionDraftsRef.current[normalizedSectionId] || payload;
          const merged = mergeCollaborativeDocumentBodies(base, local, remoteContent);
          sectionRemoteSnapshotsRef.current[normalizedSectionId] = {
            content: remoteContent,
            updated_at: latest.updated_at || '',
          };
          sectionLastSavedSignatureRef.current[normalizedSectionId] = getOperationalPreparationSignature(
            remoteContent,
            section.default_questions,
          );
          sectionDraftsRef.current = { ...sectionDraftsRef.current, [normalizedSectionId]: merged.value };
          setSectionDrafts(prev => ({ ...prev, [normalizedSectionId]: merged.value }));
          updateDirtySection(normalizedSectionId, true);
          setRemoteUpdateHint(merged.hadConflicts
            ? '准备内容存在同块冲突，已保留本地内容并合并其他修改'
            : '已合并协作者的最新准备内容');
        }
        updateSectionSaveState(normalizedSectionId, {
          phase: error?.response?.status === 409 ? 'dirty' : 'error',
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
  }, [detail?.sections, updateDirtySection, updateSectionSaveState]);

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
    const sectionId = Number(section.id);
    const payload = normalizeOperationalPreparationContent(
      sectionDraftsRef.current[sectionId] || section.default_blocks,
      section.default_questions,
    );
    if (!operationalPreparationCanSubmit(payload, section.default_questions)) {
      message.warning('请填写好内容再提交');
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
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '标记提交失败');
    } finally {
      setSubmittingSectionId(null);
    }
  };

  const generateAgenda = async () => {
    if (!detail?.meeting?.id) return;
    if (preparationSubmissionStats.required <= 0
      || preparationSubmissionStats.submitted < preparationSubmissionStats.required) {
      const pendingNames = preparationSubmissionStats.pendingOwners.map(item => item.name).join('、');
      message.warning(pendingNames ? `请先完成准备内容：${pendingNames}` : '请先完成全部必填准备内容');
      return;
    }
    if (detail.agenda) {
      const confirmed = await new Promise(resolve => {
        Modal.confirm({
          title: '重新生成会议提纲？',
          content: '重新生成会替换当前提纲，当前版本将保留在历史记录中。',
          okText: '重新生成',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    agendaGenerationAbortControllerRef.current?.abort();
    const generationController = new AbortController();
    agendaGenerationAbortControllerRef.current = generationController;
    setAgendaLoading(true);
    setAgendaGenerationError('');
    try {
      for (const sectionId of [...dirtySectionIdsRef.current]) {
        const saved = await persistSection(sectionId, { showError: true });
        if (!saved) {
          const errorText = '准备内容保存失败，未生成会议提纲';
          setAgendaGenerationError(errorText);
          message.error({ content: errorText, duration: 8 });
          return;
        }
      }
      if (agendaDirtyRef.current) {
        const saved = await saveAgenda({ silent: true });
        if (!saved) {
          const errorText = '当前会议提纲保存失败，未执行重新生成';
          setAgendaGenerationError(errorText);
          message.error({ content: errorText, duration: 8 });
          return;
        }
      }
      const startedJob = await operationalMeetingsApi.generateAgenda(
        detail.meeting.id,
        { base_updated_at: agendaRemoteSnapshotRef.current?.updated_at || null },
        { signal: generationController.signal },
      );
      const terminalJob = ['completed', 'failed'].includes(startedJob?.status)
        ? startedJob
        : await pollOperationalAgendaGeneration({
            jobId: startedJob?.job_id,
            pollAfterMs: startedJob?.poll_after_ms,
            signal: generationController.signal,
            getJob: (jobId, options) => operationalMeetingsApi.agendaGenerationJob(
              detail.meeting.id,
              jobId,
              options,
            ),
          });
      if (terminalJob.status === 'failed') {
        const generationError = new Error(terminalJob.error || '生成会议提纲失败');
        generationError.code = terminalJob.code || 'AI_GENERATION_FAILED';
        generationError.response = {
          status: terminalJob.http_status || 500,
          data: {
            error: terminalJob.error || '生成会议提纲失败',
            code: terminalJob.code || 'AI_GENERATION_FAILED',
          },
        };
        throw generationError;
      }
      const result = terminalJob.result;
      if (!result?.saved || !result?.agenda) {
        throw new Error('AI 提纲生成完成，但服务端未返回已保存的提纲');
      }
      if (result.runtime?.mode !== 'llm' && detail.agenda) {
        const errorText = result.runtime?.error || 'AI服务当前不可用，已保留原会议提纲';
        setAgendaGenerationError(errorText);
        message.error({ content: errorText, duration: 8 });
        return;
      }
      const agenda = normalizeOperationalAgendaContent(result.agenda);
      agendaDraftRef.current = agenda;
      agendaLastSavedSignatureRef.current = getDocumentBodySignature(agenda);
      agendaDirtyRef.current = false;
      agendaRemoteSnapshotRef.current = {
        content: agenda,
        updated_at: result.updated_at || new Date().toISOString(),
      };
      setAgendaDraft(agenda);
      setAgendaSaveState({ phase: 'saved', savedAt: result.updated_at || new Date().toISOString() });
      await loadMeetings();
      await loadDetail(detail.meeting.id);
      message.success(result.runtime?.mode === 'llm' ? 'AI 提纲已生成' : '已生成规则兜底提纲');
    } catch (error) {
      if (generationController.signal.aborted || error?.code === 'ERR_CANCELED') return;
      const errorText = error.response?.data?.error || error.message || '生成提纲失败';
      setAgendaGenerationError(errorText);
      message.error({ content: errorText, duration: 8 });
    } finally {
      if (agendaGenerationAbortControllerRef.current === generationController) {
        agendaGenerationAbortControllerRef.current = null;
        setAgendaLoading(false);
      }
    }
  };

  const patchAgendaContent = (content) => {
    const next = normalizeOperationalAgendaContent(content);
    agendaDraftRef.current = next;
    agendaDirtyRef.current = true;
    setAgendaDraft(next);
    setAgendaSaveState(prev => ({ ...prev, phase: 'dirty' }));
  };

  const patchDecisionContent = (content) => {
    const next = normalizeOperationalDecisionContent(content);
    decisionDraftRef.current = next;
    decisionDirtyRef.current = true;
    setDecisionDraft(next);
    setDecisionSaveState(prev => ({ ...prev, phase: 'dirty' }));
  };

  const saveAgenda = async ({ silent = false } = {}) => {
    if (!detail?.meeting?.id || !canEditMeetingContent) return false;
    if (agendaPendingSaveRef.current) {
      await agendaPendingSaveRef.current.catch(() => null);
      return saveAgenda({ silent });
    }
    const payload = normalizeOperationalAgendaContent(agendaDraftRef.current);
    if (!payload) return false;
    const signature = getDocumentBodySignature(payload);
    if (signature === agendaLastSavedSignatureRef.current) {
      agendaDirtyRef.current = false;
      setAgendaSaveState(prev => ({ ...prev, phase: 'saved' }));
      return true;
    }
    setAgendaSaveState(prev => ({ ...prev, phase: 'saving' }));
    const savePromise = operationalMeetingsApi.saveAgenda(detail.meeting.id, {
      agenda: payload,
      source_hash: detail.agenda?.source_hash || null,
      model_provider: detail.agenda?.model_provider || 'edited',
      model_name: detail.agenda?.model_name || '',
      prompt_version: detail.agenda?.prompt_version || '',
      safety_scan_status: detail.agenda?.safety_scan_status || 'passed',
      base_updated_at: agendaRemoteSnapshotRef.current?.updated_at || null,
    });
    agendaPendingSaveRef.current = savePromise;
    try {
      const saved = await savePromise;
      agendaLastSavedSignatureRef.current = signature;
      agendaDirtyRef.current = false;
      agendaRemoteSnapshotRef.current = {
        content: payload,
        updated_at: saved.updated_at || new Date().toISOString(),
      };
      setAgendaSaveState({ phase: 'saved', savedAt: saved.updated_at || new Date().toISOString() });
      await loadMeetings();
      if (!silent) message.success('会议提纲已保存');
      return true;
    } catch (error) {
      if (error?.response?.status === 409 && error.response?.data?.latest) {
        const latest = error.response.data.latest;
        const remote = normalizeOperationalAgendaContent(latest.agenda_content);
        const base = agendaRemoteSnapshotRef.current?.content || remote;
        const merged = mergeCollaborativeDocumentBodies(base, agendaDraftRef.current, remote);
        agendaRemoteSnapshotRef.current = { content: remote, updated_at: latest.updated_at || '' };
        agendaLastSavedSignatureRef.current = remote ? getDocumentBodySignature(remote) : '';
        agendaDraftRef.current = merged.value;
        agendaDirtyRef.current = true;
        setAgendaDraft(merged.value);
        setRemoteUpdateHint(merged.hadConflicts
          ? '会议提纲存在同块冲突，已保留本地内容并合并其他修改'
          : '已合并协作者的最新会议提纲');
      }
      setAgendaSaveState(prev => ({
        ...prev,
        phase: error?.response?.status === 409 ? 'dirty' : 'error',
        error: error.response?.data?.error || error.message || '保存会议提纲失败',
      }));
      if (!silent) message.error(error.response?.data?.error || error.message || '保存会议提纲失败');
      return false;
    } finally {
      if (agendaPendingSaveRef.current === savePromise) agendaPendingSaveRef.current = null;
    }
  };

  const saveDecision = async ({ silent = false } = {}) => {
    if (!detail?.meeting?.id || !canEditMeetingContent) return false;
    if (decisionPendingSaveRef.current) {
      await decisionPendingSaveRef.current.catch(() => null);
      return saveDecision({ silent });
    }
    const payload = normalizeOperationalDecisionContent(decisionDraftRef.current);
    const signature = getDocumentBodySignature(payload);
    if (signature === decisionLastSavedSignatureRef.current) {
      decisionDirtyRef.current = false;
      setDecisionSaveState(prev => ({ ...prev, phase: 'saved' }));
      return true;
    }
    setDecisionSaveState(prev => ({ ...prev, phase: 'saving' }));
    const savePromise = operationalMeetingsApi.saveDecision(detail.meeting.id, {
      decision: payload,
      status: documentBodyHasContent(payload) ? 'saved' : 'draft',
      base_updated_at: decisionRemoteSnapshotRef.current?.updated_at || null,
    });
    decisionPendingSaveRef.current = savePromise;
    try {
      const saved = await savePromise;
      decisionLastSavedSignatureRef.current = signature;
      decisionDirtyRef.current = false;
      decisionRemoteSnapshotRef.current = {
        content: payload,
        updated_at: saved.updated_at || new Date().toISOString(),
      };
      setDecisionSaveState({ phase: 'saved', savedAt: saved.updated_at || new Date().toISOString() });
      await loadMeetings();
      if (!silent) message.success('会议结论已保存');
      return true;
    } catch (error) {
      if (error?.response?.status === 409 && error.response?.data?.latest) {
        const latest = error.response.data.latest;
        const remote = normalizeOperationalDecisionContent(latest.decision_content || '');
        const base = decisionRemoteSnapshotRef.current?.content || remote;
        const merged = mergeCollaborativeDocumentBodies(base, decisionDraftRef.current, remote);
        decisionRemoteSnapshotRef.current = { content: remote, updated_at: latest.updated_at || '' };
        decisionLastSavedSignatureRef.current = getDocumentBodySignature(remote);
        decisionDraftRef.current = merged.value;
        decisionDirtyRef.current = true;
        setDecisionDraft(merged.value);
        setRemoteUpdateHint(merged.hadConflicts
          ? '会议结论存在同块冲突，已保留本地内容并合并其他修改'
          : '已合并协作者的最新会议结论');
      }
      setDecisionSaveState(prev => ({
        ...prev,
        phase: error?.response?.status === 409 ? 'dirty' : 'error',
        error: error.response?.data?.error || error.message || '保存会议结论失败',
      }));
      if (!silent) message.error(error.response?.data?.error || error.message || '保存会议结论失败');
      return false;
    } finally {
      if (decisionPendingSaveRef.current === savePromise) decisionPendingSaveRef.current = null;
    }
  };

  useEffect(() => {
    if (agendaAutoSaveTimerRef.current) window.clearTimeout(agendaAutoSaveTimerRef.current);
    if (!agendaDirtyRef.current || !agendaDraft) return undefined;
    agendaAutoSaveTimerRef.current = window.setTimeout(() => {
      saveAgenda({ silent: true });
    }, MEETING_CONTENT_AUTO_SAVE_DELAY);
    return () => {
      if (agendaAutoSaveTimerRef.current) window.clearTimeout(agendaAutoSaveTimerRef.current);
    };
  }, [agendaDraft]);

  useEffect(() => {
    if (decisionAutoSaveTimerRef.current) window.clearTimeout(decisionAutoSaveTimerRef.current);
    if (!decisionDirtyRef.current) return undefined;
    decisionAutoSaveTimerRef.current = window.setTimeout(() => {
      saveDecision({ silent: true });
    }, MEETING_CONTENT_AUTO_SAVE_DELAY);
    return () => {
      if (decisionAutoSaveTimerRef.current) window.clearTimeout(decisionAutoSaveTimerRef.current);
    };
  }, [decisionDraft]);

  const loadOperationalHistory = async (scope = historyScope) => {
    if (!detail?.meeting?.id || !scope) return;
    setHistoryLoading(true);
    try {
      const result = await operationalMeetingsApi.history(detail.meeting.id, { scope });
      setHistoryCanRestore(Boolean(result?.can_restore));
      setHistoryRevisions(Array.isArray(result?.revisions) ? result.revisions : []);
    } catch (error) {
      message.error(error.response?.data?.error || '加载历史版本失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openOperationalHistory = async (scope, title) => {
    setHistoryScope(scope);
    setHistoryTitle(title);
    setHistoryOpen(true);
    await loadOperationalHistory(scope);
  };

  const restoreOperationalHistory = async (revision) => {
    if (!detail?.meeting?.id || !revision?.id) return;
    setRestoringRevisionId(revision.id);
    try {
      if (historyScope.startsWith('section:')) {
        const sectionId = Number(historyScope.slice('section:'.length));
        if (dirtySectionIdsRef.current.has(sectionId)) {
          const saved = await persistSection(sectionId, { showError: true });
          if (!saved) {
            message.error('当前准备内容保存失败，未执行历史恢复');
            return;
          }
        }
      } else if (historyScope === 'agenda' && agendaDirtyRef.current) {
        const saved = await saveAgenda({ silent: true });
        if (!saved) {
          message.error('当前会议提纲保存失败，未执行历史恢复');
          return;
        }
      } else if (historyScope === 'decision' && decisionDirtyRef.current) {
        const saved = await saveDecision({ silent: true });
        if (!saved) {
          message.error('当前会议结论保存失败，未执行历史恢复');
          return;
        }
      }
      await operationalMeetingsApi.restoreHistory(detail.meeting.id, revision.id, { scope: historyScope });
      await loadDetail(detail.meeting.id, { background: true });
      await loadOperationalHistory(historyScope);
      message.success('已恢复历史版本');
    } catch (error) {
      message.error(error.response?.data?.error || '恢复历史版本失败');
    } finally {
      setRestoringRevisionId(null);
    }
  };

  const openParticipantManager = () => {
    setParticipantUserIds((detail?.participants || [])
      .filter(item => item.participant_type === 'designated')
      .map(item => Number(item.user_id)));
    setParticipantOpen(true);
  };

  const saveParticipants = async () => {
    if (!detail?.meeting?.id) return;
    setParticipantBusy(true);
    try {
      await operationalMeetingsApi.updateParticipants(detail.meeting.id, {
        participant_user_ids: participantUserIds,
      });
      setParticipantOpen(false);
      await loadDetail(detail.meeting.id);
      await loadMeetings();
      message.success('准备人员已更新');
    } catch (error) {
      message.error(error.response?.data?.error || error.message || '准备人员更新失败');
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
        if (!Number(record.can_view_preparation || 0)) {
          return <Text type="secondary">不参与准备</Text>;
        }
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
      render: value => formatBusinessDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => <Button type="link" onClick={() => openDetail(record)}>查看</Button>,
    },
  ];

  const preparationSubmissionStats = useMemo(() => {
    return getOperationalPreparationSubmissionStats(detail?.sections || [], sectionLocalStatuses);
  }, [detail?.sections, sectionLocalStatuses]);

  const canGenerateAgenda = useMemo(() => (
    Boolean(detail?.can_generate_agenda)
    && preparationSubmissionStats.required > 0
    && preparationSubmissionStats.submitted >= preparationSubmissionStats.required
  ), [detail?.can_generate_agenda, preparationSubmissionStats]);

  const generateAgendaDisabledReason = useMemo(() => {
    if (!detail?.can_generate_agenda) return '';
    if (preparationSubmissionStats.required <= 0) return '当前周会没有可用于生成的必填准备内容';
    if (preparationSubmissionStats.submitted < preparationSubmissionStats.required) {
      const pendingNames = preparationSubmissionStats.pendingOwners.map(item => item.name).join('、');
      return pendingNames ? `等待以下负责人提交：${pendingNames}` : '请先完成全部必填准备内容';
    }
    return '';
  }, [detail?.can_generate_agenda, preparationSubmissionStats]);

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
    const { canEdit, readOnly } = getPreparationEditorState(section);
    const saveStatusLabel = (() => {
      if (saveState.phase === 'dirty') return { text: '待自动保存', color: '#8c8c8c' };
      if (saveState.phase === 'saving') return { text: '自动保存中...', color: '#1677ff' };
      if (saveState.phase === 'error') return { text: '自动保存失败', color: '#cf1322' };
      if (saveState.phase === 'saved') {
        return {
          text: saveState.savedAt ? `已自动保存 ${formatBusinessDateTime(saveState.savedAt, 'HH:mm')}` : '已自动保存',
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
                ? ` · ${formatBusinessDateTime(localStatus.submittedAt, 'MM-DD HH:mm')}`
                : ''}
            </Tag>
            <Button
              type="text"
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => openOperationalHistory(`section:${section.id}`, `${section.title}历史版本`)}
            >
              历史
            </Button>
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
          <DocumentBodyEditor
            value={draft}
            onChange={value => patchPreparationContent(section, value)}
            onSave={async () => {
              const saved = await persistSection(section.id, { showError: true });
              if (saved) message.success('准备内容已保存');
              return saved;
            }}
            minHeight={280}
            placeholder="填写本周准备内容"
            readOnly={readOnly}
            mentionContext={detail?.meeting?.id ? {
              entity_type: 'operational_meeting',
              entity_id: detail.meeting.id,
              module_name: '经营周会',
              title: detail.meeting.title,
              scope: `section:${section.id}`,
            } : null}
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
      saved: {
        text: state.savedAt ? `已自动保存 ${formatBusinessDateTime(state.savedAt, 'HH:mm')}` : '已自动保存',
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
            <Button
              type="text"
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => openOperationalHistory('agenda', '会议提纲历史版本')}
            >
              历史
            </Button>
            {canEditMeetingContent && renderMeetingSaveStatus(agendaSaveState)}
            {agendaSaveState.phase === 'error' && canEditMeetingContent && (
              <Button size="small" onClick={() => saveAgenda({ silent: false })}>重试</Button>
            )}
            {canEditMeetingContent && (
              <Button
                icon={<SaveOutlined />}
                loading={agendaSaveState.phase === 'saving'}
                onClick={() => saveAgenda({ silent: false })}
              >
                保存提纲
              </Button>
            )}
            {Boolean(detail.can_generate_agenda) && (
              <Tooltip title={generateAgendaDisabledReason}>
                <span>
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    loading={agendaLoading}
                    disabled={!canGenerateAgenda}
                    onClick={generateAgenda}
                  >
                    {detail.agenda ? '重新生成提纲' : '生成提纲'}
                  </Button>
                </span>
              </Tooltip>
            )}
          </Space>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {agendaGenerationError && (
            <Alert
              type="error"
              showIcon
              closable
              message="会议提纲生成失败"
              description={agendaGenerationError}
              onClose={() => setAgendaGenerationError('')}
              action={Boolean(detail.can_generate_agenda) ? (
                <Button size="small" danger onClick={generateAgenda} disabled={agendaLoading}>
                  重试
                </Button>
              ) : null}
            />
          )}
          {agendaLoading && (
            <Alert
              type="info"
              showIcon
              message="正在后台生成会议提纲"
              description={`正在汇总 ${preparationSubmissionStats.submitted} 份准备内容，完成后会自动保存并显示。`}
            />
          )}
          {agendaLoading && !documentBodyHasContent(agendaDraft) ? (
            <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          ) : (
            <DocumentBodyEditor
              value={agendaDraft}
              onChange={patchAgendaContent}
              onSave={() => saveAgenda({ silent: false })}
              minHeight={360}
              placeholder="编辑会议提纲"
              readOnly={!canEditMeetingContent}
              mentionContext={detail?.meeting?.id ? {
                entity_type: 'operational_meeting',
                entity_id: detail.meeting.id,
                module_name: '经营周会',
                title: detail.meeting.title,
                scope: 'agenda',
              } : null}
            />
          )}
        </Space>
      </Card>

      <Card
        title={<Space><CheckCircleOutlined />会议结论</Space>}
        size="small"
        extra={(
          <Space wrap>
            <Button
              type="text"
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => openOperationalHistory('decision', '会议结论历史版本')}
            >
              历史
            </Button>
            {canEditMeetingContent && renderMeetingSaveStatus(decisionSaveState)}
            {canEditMeetingContent && decisionSaveState.phase === 'error' && (
              <Button size="small" onClick={() => saveDecision({ silent: false })}>重试</Button>
            )}
            {canEditMeetingContent && <Button
              icon={<SaveOutlined />}
              loading={decisionSaveState.phase === 'saving'}
              onClick={() => saveDecision({ silent: false })}
            >
              保存结论
            </Button>}
          </Space>
        )}
      >
        <DocumentBodyEditor
          value={decisionDraft}
          onChange={patchDecisionContent}
          onSave={() => saveDecision({ silent: false })}
          placeholder="记录会议最终决策、负责人、截止时间和后续动作"
          minHeight={280}
          readOnly={!canEditMeetingContent}
          mentionContext={detail?.meeting?.id ? {
            entity_type: 'operational_meeting',
            entity_id: detail.meeting.id,
            module_name: '经营周会',
            title: detail.meeting.title,
            scope: 'decision',
          } : null}
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
                <Button icon={<ReloadOutlined />} onClick={() => loadDetail(meetingId)}>刷新</Button>
              </Space>
            </div>

            <Spin spinning={detailLoading}>
              {!detail?.meeting ? (
                <Empty description="暂无详情" />
              ) : (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {remoteUpdateHint && (
                    <Alert type="info" showIcon message={remoteUpdateHint} />
                  )}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}>
                    <Space wrap size={10}>
                      <Tag color={(statusMeta[detail.meeting.status] || statusMeta.draft).color}>
                        {(statusMeta[detail.meeting.status] || statusMeta.draft).label}
                      </Tag>
                      {detailTab === 'preparation' ? (
                        <>
                          <Text>提交进度：{preparationSubmissionStats.submitted}/{preparationSubmissionStats.required}</Text>
                          {preparationSubmissionStats.pendingOwners.length ? (
                            <>
                              <Text type="secondary">未提交：</Text>
                              {preparationSubmissionStats.pendingOwners.map(owner => (
                                <Tag key={owner.userId || owner.name} color="default">{owner.name}</Tag>
                              ))}
                            </>
                          ) : preparationSubmissionStats.required > 0 ? (
                            <Tag color="green" icon={<CheckCircleOutlined />}>全部已提交</Tag>
                          ) : (
                            <Text type="secondary">暂无必填准备内容</Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Text>提纲：{detail.meeting.agenda_status === 'generated' ? '已生成' : '未生成'}</Text>
                          <Text>结论：{detail.meeting.decision_status === 'saved' ? '已保存' : '未填写'}</Text>
                        </>
                      )}
                    </Space>
                    {detailTab === 'preparation' && Boolean(detail?.can_manage_participants) && (
                      <Button icon={<TeamOutlined />} onClick={openParticipantManager}>管理准备人员</Button>
                    )}
                  </div>
                  <Tabs
                    activeKey={detailTab}
                    onChange={key => setSearchParams(key === 'meeting' ? { tab: 'meeting' } : {})}
                    items={[
                      ...(canViewPreparationTab
                        ? [{ key: 'preparation', label: '准备', children: preparationPanel }]
                        : []),
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
              <Button icon={<ReloadOutlined />} onClick={loadMeetings}>刷新</Button>
              {cxoIdentity && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建周会</Button>}
            </Space>
            )}
          >
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
                                      <Text type="secondary">未生成</Text>
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
                                      <Text type="secondary">未填写</Text>
                                    )}
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
          <Form.Item label="其他准备人员（可选）" name="participant_user_ids">
            <Select
              mode="multiple"
              allowClear
              options={eligibleParticipants
                .filter(item => item.participant_type === 'designated')
                .map(item => ({ value: Number(item.id), label: item.display_name || item.username }))}
              placeholder="选择需要额外撰写本周准备内容的人员"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="管理本周准备人员"
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
            <Text type="secondary">默认准备人员（CXO）</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {eligibleParticipants
                  .filter(item => item.participant_type === 'cxo')
                  .map(item => <Tag color="blue" key={item.id}>{item.display_name || item.username}</Tag>)}
              </Space>
            </div>
          </div>
          <div>
            <Text type="secondary">其他准备人员</Text>
            <Select
              mode="multiple"
              allowClear
              value={participantUserIds}
              onChange={setParticipantUserIds}
              style={{ width: '100%', marginTop: 8 }}
              options={eligibleParticipants
                .filter(item => item.participant_type === 'designated')
                .map(item => ({ value: Number(item.id), label: item.display_name || item.username }))}
              placeholder="选择需要撰写本周准备内容的人员"
            />
          </div>
        </Space>
      </Modal>

      <ContentHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="改动历史"
        entityTitle={historyTitle.replace(/历史版本$/, '')}
        revisions={historyRevisions}
        loading={historyLoading}
        restoringId={restoringRevisionId}
        canRestore={historyCanRestore}
        onRestore={restoreOperationalHistory}
        width={isMobile ? '100%' : 520}
      />

    </div>
  );
}
