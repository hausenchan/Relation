import axios from 'axios';
import { buildLoginPath, getBrowserPath } from '../utils/redirect';

const api = axios.create({ baseURL: '/api' });

// 自动带 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// 401 自动跳登录
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && err.config?.url !== '/auth/login') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = buildLoginPath(getBrowserPath());
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (data) => api.post('/auth/login', data).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  changePassword: (data) => api.put('/auth/password', data).then(r => r.data),
};

export const usersApi = {
  list: () => api.get('/users').then(r => r.data),
  listSimple: (params) => api.get('/users/simple', { params }).then(r => r.data),
  create: (data) => api.post('/users', data).then(r => r.data),
  update: (id, data) => api.put(`/users/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/users/${id}`).then(r => r.data),
  resetPassword: (id, data) => api.put(`/users/${id}/reset-password`, data).then(r => r.data),
  updateAccountStatus: (id, data) => api.put(`/users/${id}/account-status`, data).then(r => r.data),
  getDirectorTeams: (id) => api.get(`/users/${id}/director-teams`).then(r => r.data),
};

export const teamsApi = {
  list: (params) => api.get('/teams', { params }).then(r => r.data),
  create: (data) => api.post('/teams', data).then(r => r.data),
  update: (id, data) => api.put(`/teams/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/teams/${id}`).then(r => r.data),
};

export const projectGroupsApi = {
  list: () => api.get('/project-groups').then(r => r.data),
  create: (data) => api.post('/project-groups', data).then(r => r.data),
  update: (id, data) => api.put(`/project-groups/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/project-groups/${id}`).then(r => r.data),
};

export const personsApi = {
  list: (params) => api.get('/persons', { params }).then(r => r.data),
  get: (id) => api.get(`/persons/${id}`).then(r => r.data),
  duplicateCheck: (params) => api.get('/persons/duplicate-check', { params }).then(r => r.data),
  create: (data) => api.post('/persons', data).then(r => r.data),
  update: (id, data) => api.put(`/persons/${id}`, data).then(r => r.data),
  batchUpdate: (data) => api.put('/persons/batch', data).then(r => r.data),
  delete: (id) => api.delete(`/persons/${id}`).then(r => r.data),
  importPreview: (rows) => api.post('/persons/import/preview', rows).then(r => r.data),
  import: (rows) => api.post('/persons/import', rows).then(r => r.data),
  assign: (id, data) => api.put(`/persons/${id}/assign`, data).then(r => r.data),
  mapData: (params) => api.get('/persons/map', { params }).then(r => r.data),
};

export const interactionsApi = {
  list: (params) => api.get('/interactions', { params }).then(r => r.data),
  create: (data) => api.post('/interactions', data).then(r => r.data),
  update: (id, data) => api.put(`/interactions/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/interactions/${id}`).then(r => r.data),
};

export const opportunitiesApi = {
  list: (params) => api.get('/opportunities', { params }).then(r => r.data),
  update: (interactionId, data) => api.put(`/opportunities/${interactionId}`, data).then(r => r.data),
};

export const followUpTasksApi = {
  list: (params) => api.get('/follow-up-tasks', { params }).then(r => r.data),
  count: () => api.get('/follow-up-tasks/count').then(r => r.data),
  watch: (params) => api.get('/follow-up-tasks/watch', { params }).then(r => r.data),
  watchCount: () => api.get('/follow-up-tasks/watch/count').then(r => r.data),
  update: (id, data) => api.put(`/follow-up-tasks/${id}`, data).then(r => r.data),
};

export const remindersApi = {
  list: (params) => api.get('/reminders', { params }).then(r => r.data),
  create: (data) => api.post('/reminders', data).then(r => r.data),
  done: (id) => api.put(`/reminders/${id}/done`).then(r => r.data),
  delete: (id) => api.delete(`/reminders/${id}`).then(r => r.data),
};

export const statsApi = {
  get: () => api.get('/stats').then(r => r.data),
};

export const aiSuggestionsApi = {
  list: (params) => api.get('/ai-suggestions', { params }).then(r => r.data),
};

export const companiesApi = {
  list: (params) => api.get('/companies', { params }).then(r => r.data),
  get: (id) => api.get(`/companies/${id}`).then(r => r.data),
  summary: (id) => api.get(`/companies/${id}/summary`).then(r => r.data),
  duplicateCheck: (params) => api.get('/companies/duplicate-check', { params }).then(r => r.data),
  create: (data) => api.post('/companies', data).then(r => r.data),
  update: (id, data) => api.put(`/companies/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/companies/${id}`).then(r => r.data),
};

export const companyPersonnelApi = {
  list: (params) => api.get('/company_personnel', { params }).then(r => r.data),
  create: (data) => api.post('/company_personnel', data).then(r => r.data),
  update: (id, data) => api.put(`/company_personnel/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/company_personnel/${id}`).then(r => r.data),
  toPerson: (id) => api.post(`/company_personnel/${id}/to_person`).then(r => r.data),
};

export const companyEntitiesApi = {
  list: (params) => api.get('/company_entities', { params }).then(r => r.data),
  create: (data) => api.post('/company_entities', data).then(r => r.data),
  update: (id, data) => api.put(`/company_entities/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/company_entities/${id}`).then(r => r.data),
};

export const companyProductsApi = {
  list: (params) => api.get('/company_products', { params }).then(r => r.data),
  get: (id) => api.get(`/company_products/${id}`).then(r => r.data),
  create: (data) => api.post('/company_products', data).then(r => r.data),
  update: (id, data) => api.put(`/company_products/${id}`, data).then(r => r.data),
  notifyTaskCenter: (id, data) => api.post(`/company_products/${id}/task-center-notification`, data).then(r => r.data),
  delete: (id) => api.delete(`/company_products/${id}`).then(r => r.data),
};

export const mobileTaskCenterApi = {
  listApps: () => api.get('/mobile-task-center/apps').then(r => r.data),
  createApp: (data) => api.post('/mobile-task-center/apps', data).then(r => r.data),
  updateApp: (id, data) => api.put(`/mobile-task-center/apps/${id}`, data).then(r => r.data),
  deleteApp: (id) => api.delete(`/mobile-task-center/apps/${id}`).then(r => r.data),
  getSummary: (params) => api.get('/mobile-task-center/summary', { params }).then(r => r.data),
  listRecords: (params) => api.get('/mobile-task-center/records', { params }).then(r => r.data),
  createRecord: (data) => api.post('/mobile-task-center/records', data).then(r => r.data),
  updateRecordReview: (id, data) => api.put(`/mobile-task-center/records/${id}/review`, data).then(r => r.data),
  downloadAttachment: (id, filename) => attachmentsApi.download(id, filename),
};

export const networkCaptureApi = {
  status: () => api.get('/network-capture/status').then(r => r.data),
  start: (data) => api.post('/network-capture/start', data).then(r => r.data),
  stop: () => api.post('/network-capture/stop').then(r => r.data),
  clear: () => api.post('/network-capture/clear').then(r => r.data),
  records: (params) => api.get('/network-capture/records', { params }).then(r => r.data),
  getRecord: (id) => api.get(`/network-capture/records/${id}`).then(r => r.data),
  exportHar: () => api.get('/network-capture/export.har', { responseType: 'blob' }),
};

export const giftsApi = {
  list: () => api.get('/gifts').then(r => r.data),
  create: (data) => api.post('/gifts', data).then(r => r.data),
  update: (id, data) => api.put(`/gifts/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/gifts/${id}`).then(r => r.data),
};

export const giftPlansApi = {
  list: () => api.get('/gift_plans').then(r => r.data),
  create: (data) => api.post('/gift_plans', data).then(r => r.data),
  update: (id, data) => api.put(`/gift_plans/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/gift_plans/${id}`).then(r => r.data),
};

export const giftRequestsApi = {
  list: (params) => api.get('/gift_requests', { params }).then(r => r.data),
  create: (data) => api.post('/gift_requests', data).then(r => r.data),
  delete: (id) => api.delete(`/gift_requests/${id}`).then(r => r.data),
  review: (id, data) => api.post(`/gift_requests/${id}/review`, data).then(r => r.data),
};

export const giftRecordsApi = {
  list: (params) => api.get('/gift_records', { params }).then(r => r.data),
  update: (id, data) => api.put(`/gift_records/${id}`, data).then(r => r.data),
};

export const companyDynamicsApi = {
  list: (params) => api.get('/company_dynamics', { params }).then(r => r.data),
  create: (data) => api.post('/company_dynamics', data).then(r => r.data),
  update: (id, data) => api.put(`/company_dynamics/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/company_dynamics/${id}`).then(r => r.data),
};

export const competitorResearchApi = {
  list: (params) => api.get('/competitor_research', { params }).then(r => r.data),
  create: (data) => api.post('/competitor_research', data).then(r => r.data),
  update: (id, data) => api.put(`/competitor_research/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/competitor_research/${id}`).then(r => r.data),
};

export const groupsApi = {
  list: () => api.get('/groups').then(r => r.data),
  create: (data) => api.post('/groups', data).then(r => r.data),
  update: (id, data) => api.put(`/groups/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/groups/${id}`).then(r => r.data),
};

export const tripsApi = {
  list: (params) => api.get('/trips', { params }).then(r => r.data),
  get: (id) => api.get(`/trips/${id}`).then(r => r.data),
  create: (data) => api.post('/trips', data).then(r => r.data),
  update: (id, data) => api.put(`/trips/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/trips/${id}`).then(r => r.data),
  submit: (id) => api.post(`/trips/${id}/submit`).then(r => r.data),
  approve: (id, data) => api.post(`/trips/${id}/approve`, data).then(r => r.data),
  complete: (id) => api.post(`/trips/${id}/complete`).then(r => r.data),
  getExpenses: (id) => api.get(`/trips/${id}/expenses`).then(r => r.data),
  addExpense: (id, data) => api.post(`/trips/${id}/expenses`, data).then(r => r.data),
  getReport: (id) => api.get(`/trips/${id}/report`).then(r => r.data),
  createReport: (id) => api.post(`/trips/${id}/report`).then(r => r.data),
  stats: (params) => api.get('/trips/stats/summary', { params }).then(r => r.data),
};

export const tripCollaborationApi = {
  listTrips: (params) => api.get('/trip-collaboration/trips', { params }).then(r => r.data),
  createTrip: (data) => api.post('/trip-collaboration/trips', data).then(r => r.data),
  updateTrip: (id, data) => api.put(`/trip-collaboration/trips/${id}`, data).then(r => r.data),
  deleteTrip: (id) => api.delete(`/trip-collaboration/trips/${id}`).then(r => r.data),
  listSchedules: (tripId, params) => api.get(`/trip-collaboration/trips/${tripId}/schedules`, { params }).then(r => r.data),
  createSchedule: (tripId, data) => api.post(`/trip-collaboration/trips/${tripId}/schedules`, data).then(r => r.data),
  updateSchedule: (id, data) => api.put(`/trip-collaboration/schedules/${id}`, data).then(r => r.data),
  deleteSchedule: (id) => api.delete(`/trip-collaboration/schedules/${id}`).then(r => r.data),
};

export const expensesApi = {
  update: (id, data) => api.put(`/trip_expenses/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/trip_expenses/${id}`).then(r => r.data),
};

export const reportsApi = {
  submit: (id) => api.post(`/reports/${id}/submit`).then(r => r.data),
  approve: (id, data) => api.post(`/reports/${id}/approve`, data).then(r => r.data),
};

export const menuPermsApi = {
  get: (userId) => api.get(`/admin/menu-perms/${userId}`).then(r => r.data),
  save: (userId, menuKeys) => api.put(`/admin/menu-perms/${userId}`, { menuKeys }).then(r => r.data),
};

export const operationLogsApi = {
  list: (params) => api.get('/operation-logs', { params }).then(r => r.data),
  meta: () => api.get('/operation-logs/meta').then(r => r.data),
  get: (id) => api.get(`/operation-logs/${id}`).then(r => r.data),
};

export const tasksApi = {
  list: (params) => api.get('/tasks', { params }).then(r => r.data),
  count: () => api.get('/tasks/count').then(r => r.data),
  board: (params) => api.get('/tasks/board', { params }).then(r => r.data),
  create: (data) => api.post('/tasks', data).then(r => r.data),
  update: (id, data) => api.put(`/tasks/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/tasks/${id}`).then(r => r.data),
};

export const budgetsApi = {
  list: (params) => api.get('/budgets', { params }).then(r => r.data),
  create: (data) => api.post('/budgets', data).then(r => r.data),
  update: (id, data) => api.put(`/budgets/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/budgets/${id}`).then(r => r.data),
};

export const agentsApi = {
  definitions: () => api.get('/agents/definitions').then(r => r.data),
  runs: (params) => api.get('/agents/runs', { params }).then(r => r.data),
  runBudgetResearch: (data) => api.post('/agents/budget-research/run', data).then(r => r.data),
  budgetSummary: () => api.get('/agents/budget-opportunities/summary').then(r => r.data),
  budgetOpportunities: (params) => api.get('/agents/budget-opportunities', { params }).then(r => r.data),
  getBudgetOpportunity: (id) => api.get(`/agents/budget-opportunities/${id}`).then(r => r.data),
  createBudgetOpportunity: (data) => api.post('/agents/budget-opportunities', data).then(r => r.data),
  updateBudgetOpportunity: (id, data) => api.put(`/agents/budget-opportunities/${id}`, data).then(r => r.data),
  reviewBudgetOpportunity: (id, data) => api.post(`/agents/budget-opportunities/${id}/review`, data).then(r => r.data),
  notificationRules: () => api.get('/agents/notification-rules').then(r => r.data),
  createNotificationRule: (data) => api.post('/agents/notification-rules', data).then(r => r.data),
  updateNotificationRule: (id, data) => api.put(`/agents/notification-rules/${id}`, data).then(r => r.data),
  deleteNotificationRule: (id) => api.delete(`/agents/notification-rules/${id}`).then(r => r.data),
};

export const productAssetsApi = {
  list: (params) => api.get('/product-assets', { params }).then(r => r.data),
  get: (id) => api.get(`/product-assets/${id}`).then(r => r.data),
  create: (data) => api.post('/product-assets', data).then(r => r.data),
  update: (id, data) => api.put(`/product-assets/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/product-assets/${id}`).then(r => r.data),
  importPreview: (payload) => api.post('/product-assets/import/preview', Array.isArray(payload) ? { rows: payload } : payload).then(r => r.data),
  import: (payload) => api.post('/product-assets/import', Array.isArray(payload) ? { rows: payload } : payload).then(r => r.data),
  createReduction: (assetId, data) => api.post(`/product-assets/${assetId}/reductions`, data).then(r => r.data),
  updateReduction: (id, data) => api.put(`/product-asset-reductions/${id}`, data).then(r => r.data),
  deleteReduction: (id) => api.delete(`/product-asset-reductions/${id}`).then(r => r.data),
  reductionsSimple: () => api.get('/product-asset-reductions/simple').then(r => r.data),
};

export const companySubjectsApi = {
  list: (params) => api.get('/company-subjects', { params }).then(r => r.data),
  simple: () => api.get('/company-subjects/simple').then(r => r.data),
  get: (id) => api.get(`/company-subjects/${id}`).then(r => r.data),
  create: (data) => api.post('/company-subjects', data).then(r => r.data),
  update: (id, data) => api.put(`/company-subjects/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/company-subjects/${id}`).then(r => r.data),
  uploadAttachment: (id, formData) => api.post(`/company-subjects/${id}/attachments`, formData).then(r => r.data),
  deleteAttachment: (id) => api.delete(`/company-subject-attachments/${id}`).then(r => r.data),
};

export const goalsApi = {
  list: (params) => api.get('/goals', { params }).then(r => r.data),
  get: (id) => api.get(`/goals/${id}`).then(r => r.data),
  create: (data) => api.post('/goals', data).then(r => r.data),
  update: (id, data) => api.put(`/goals/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/goals/${id}`).then(r => r.data),
};

export const documentsApi = {
  list: (params) => api.get('/documents', { params }).then(r => r.data),
  get: (id) => api.get(`/documents/${id}`).then(r => r.data),
  live: (id, params) => api.get(`/documents/${id}/live`, { params }).then(r => r.data),
  create: (data) => api.post('/documents', data).then(r => r.data),
  update: (id, data) => api.put(`/documents/${id}`, data).then(r => r.data),
  updateContent: (id, data) => api.put(`/documents/${id}/content`, data).then(r => r.data),
  updatePageOptions: (id, data) => api.put(`/documents/${id}/page-options`, data).then(r => r.data),
  renumber: (id, data) => api.post(`/documents/${id}/renumber`, data).then(r => r.data),
  delete: (id) => api.delete(`/documents/${id}`).then(r => r.data),
  listFolders: (params) => api.get('/document-folders', { params }).then(r => r.data),
  createFolder: (data) => api.post('/document-folders', data).then(r => r.data),
  updateFolder: (id, data) => api.put(`/document-folders/${id}`, data).then(r => r.data),
  deleteFolder: (id) => api.delete(`/document-folders/${id}`).then(r => r.data),
  applyFolderTemplate: (data) => api.post('/document-folders/apply-template', data).then(r => r.data),
  listShares: (id) => api.get(`/documents/${id}/shares`).then(r => r.data),
  saveShares: (id, shares) => api.put(`/documents/${id}/shares`, { shares }).then(r => r.data),
  accessSummary: (id) => api.get(`/documents/${id}/access-summary`).then(r => r.data),
  favorite: (id) => api.post(`/documents/${id}/favorite`).then(r => r.data),
  unfavorite: (id) => api.delete(`/documents/${id}/favorite`).then(r => r.data),
  listChangeLogs: (id) => api.get(`/documents/${id}/change-logs`).then(r => r.data),
  createChangeLog: (id, data) => api.post(`/documents/${id}/change-logs`, data).then(r => r.data),
  updateChangeLog: (logId, data) => api.put(`/document-change-logs/${logId}`, data).then(r => r.data),
  deleteChangeLog: (logId) => api.delete(`/document-change-logs/${logId}`).then(r => r.data),
  restoreEditRecord: (recordId) => api.post(`/document-edit-records/${recordId}/restore`).then(r => r.data),
  uploadAttachment: (id, formData, config = {}) => api.post(`/documents/${id}/attachments`, formData, config).then(r => r.data),
  listAttachments: (id) => api.get(`/documents/${id}/attachments`).then(r => r.data),
  previewAttachment: (id) => api.get(`/document-attachments/${id}/preview`).then(r => r.data),
  renameAttachment: (id, data) => api.put(`/document-attachments/${id}/rename`, data).then(r => r.data),
  replaceAttachment: (id, formData, config = {}) => api.post(`/document-attachments/${id}/replace`, formData, config).then(r => r.data),
  copyAttachmentLink: (id, data) => api.post(`/document-attachments/${id}/copy-link`, data).then(r => r.data),
  deleteAttachment: (id) => api.delete(`/document-attachments/${id}`).then(r => r.data),
  listBlockComments: (id, blockId) => api.get(`/documents/${id}/blocks/${blockId}/comments`).then(r => r.data),
  createBlockComment: (id, blockId, data) => api.post(`/documents/${id}/blocks/${blockId}/comments`, data).then(r => r.data),
  downloadAttachment: async (id, filename) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/document-attachments/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const attachmentsApi = {
  upload: (formData) => api.post('/attachments/upload', formData).then(r => r.data),
  list: (params) => api.get('/attachments', { params }).then(r => r.data),
  delete: (id) => api.delete(`/attachments/${id}`).then(r => r.data),
  getBlob: async (id) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/attachments/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('附件读取失败');
    return res.blob();
  },
  download: async (id, filename) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/attachments/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
