import dayjs from 'dayjs';

export const mediaImportanceOptions = [
  { value: 'key', label: '重点', color: 'red' },
  { value: 'medium', label: '中等', color: 'gold' },
  { value: 'general', label: '一般', color: 'default' },
];

export const mediaCategoryOptions = [
  ['ecommerce', '电商'], ['tool', '工具'], ['news', '资讯'], ['audio_video', '音视频'],
  ['travel_service', '出行服务'], ['rebate', '返利'], ['life_service', '生活服务'],
  ['online_earning', '网赚'], ['novel', '小说'], ['campus', '校园'], ['game', '游戏'],
  ['alipay_mini_program', '支付宝小程序'], ['other', '其他'],
].map(([value, label]) => ({ value, label }));

export const mediaYyzVersionOptions = [
  ['alipay_h5', '支付宝H5'],
  ['api_h5_callback', 'API（H5+回调）'],
  ['cpd_api', 'CPD-API'],
  ['sdk_data_ui', 'SDK-数据版+UI版'],
  ['sdk_data', 'SDK-数据版'],
  ['sdk_ui', 'SDK-UI版'],
].map(([value, label]) => ({ value, label }));

export const mediaDisplayStyleOptions = [
  ['single_budget', '单预算独立'],
  ['flat', '平铺'],
  ['yyz_aggregate', 'YYZ聚合'],
  ['yyz_aggregate_single_budget', 'YYZ聚合-单预算独立'],
  ['yyz_aggregate_flat', 'YYZ聚合-平铺'],
].map(([value, label]) => ({ value, label }));

export const mediaBudgetOptions = [
  ['h5', 'H5'], ['weixin_mini', '微小'], ['alipay_mini', '支小'], ['taobao_mini', '淘小'],
  ['wish_star', '许愿星'], ['cpa_standard', 'CPA-普通'], ['cpa_reactivation', 'CPA-拉新拉活'],
  ['cpa_weixin_mini', 'CPA-微小'], ['self_app', '自研APP'],
].map(([value, label]) => ({ value, label }));

export const mediaProgressOptions = [
  { value: 'pending', label: '待对接', color: 'default' },
  { value: 'integrating', label: '对接中', color: 'processing' },
  { value: 'testing', label: '测试中', color: 'cyan' },
  { value: 'shelved', label: '搁浅', color: 'warning' },
  { value: 'scaling', label: '跑量中', color: 'success' },
  { value: 'no_volume', label: '无量', color: 'volcano' },
  { value: 'offline', label: '下线', color: 'default' },
];

export const mediaPornApiOptions = [
  ['yes', '是'],
  ['informed_not_integrating', '已告知但暂不对接'],
  ['communicated_pending', '已沟通待反馈'],
].map(([value, label]) => ({ value, label }));

export function optionMap(options = []) {
  return Object.fromEntries(options.map(option => [option.value, option]));
}

export const mediaOptionMaps = {
  importance: optionMap(mediaImportanceOptions),
  category: optionMap(mediaCategoryOptions),
  yyz_version: optionMap(mediaYyzVersionOptions),
  display_style: optionMap(mediaDisplayStyleOptions),
  budget_types: optionMap(mediaBudgetOptions),
  integration_progress: optionMap(mediaProgressOptions),
  porn_api_status: optionMap(mediaPornApiOptions),
};

export const MEDIA_CID_MAX_LENGTH = 20;
export const MEDIA_NAME_COLUMN_MIN_WIDTH = 168;
export const MEDIA_NAME_COLUMN_MAX_WIDTH = 240;

function estimateMediaNameTextWidth(value) {
  return Array.from(String(value || '').trim()).reduce((width, character) => (
    width + (/[^\u0000-\u00ff]/.test(character) ? 14 : 8)
  ), 0);
}

export function getMediaNameColumnWidth(records = []) {
  const widestName = (Array.isArray(records) ? records : []).reduce((width, record) => (
    Math.max(width, estimateMediaNameTextWidth(record?.media_name))
  ), estimateMediaNameTextWidth('媒体'));
  return Math.min(
    MEDIA_NAME_COLUMN_MAX_WIDTH,
    Math.max(MEDIA_NAME_COLUMN_MIN_WIDTH, Math.ceil(widestName + 40)),
  );
}

export function isValidMediaCid(value) {
  return new RegExp(`^\\d{1,${MEDIA_CID_MAX_LENGTH}}$`).test(String(value || '').trim());
}

export function canShowMediaDelete(record) {
  return Number(record?.can_delete) === 1;
}

export function getMediaRowActionKeys(record = {}) {
  return [
    'detail',
    ...(Number(record.can_edit) === 1 ? ['edit'] : []),
    ...(canShowMediaDelete(record) ? ['delete'] : []),
  ];
}

export function normalizeMediaFormPayload(values = {}) {
  const normalizeDate = value => (value?.format ? value.format('YYYY-MM-DD') : (value || null));
  return {
    ...values,
    cid: String(values.cid || '').trim(),
    media_name: String(values.media_name || '').trim(),
    endpoint_description: String(values.endpoint_description || '').trim() || null,
    budget_types: Array.isArray(values.budget_types) ? values.budget_types : [],
    latest_release_date: normalizeDate(values.latest_release_date),
    contract_valid_until: normalizeDate(values.contract_valid_until),
    launch_date: normalizeDate(values.launch_date),
    owner_id: values.owner_id || null,
    porn_api_status: values.porn_api_status || null,
  };
}

export function mediaRecordToFormValues(record = {}) {
  return {
    ...record,
    budget_types: Array.isArray(record.budget_types) ? record.budget_types : [],
    latest_release_date: record.latest_release_date ? dayjs(record.latest_release_date) : null,
    contract_valid_until: record.contract_valid_until ? dayjs(record.contract_valid_until) : null,
    launch_date: record.launch_date ? dayjs(record.launch_date) : null,
    owner_id: record.owner_id || undefined,
    porn_api_status: record.porn_api_status || undefined,
  };
}

export function buildMediaListParams(filters = {}) {
  return Object.fromEntries(Object.entries(filters).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.length ? [[key, value.join(',')]] : [];
    if (value === undefined || value === null || value === '') return [];
    return [[key, value]];
  }));
}
