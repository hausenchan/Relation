import axios from 'axios';

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
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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
  listSimple: () => api.get('/users/simple').then(r => r.data),
  create: (data) => api.post('/users', data).then(r => r.data),
  update: (id, data) => api.put(`/users/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/users/${id}`).then(r => r.data),
  resetPassword: (id, data) => api.put(`/users/${id}/reset-password`, data).then(r => r.data),
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
  create: (data) => api.post('/persons', data).then(r => r.data),
  update: (id, data) => api.put(`/persons/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/persons/${id}`).then(r => r.data),
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

export const companiesApi = {
  list: (params) => api.get('/companies', { params }).then(r => r.data),
  get: (id) => api.get(`/companies/${id}`).then(r => r.data),
  summary: (id) => api.get(`/companies/${id}/summary`).then(r => r.data),
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
  create: (data) => api.post('/company_products', data).then(r => r.data),
  update: (id, data) => api.put(`/company_products/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/company_products/${id}`).then(r => r.data),
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

export const goalsApi = {
  list: (params) => api.get('/goals', { params }).then(r => r.data),
  get: (id) => api.get(`/goals/${id}`).then(r => r.data),
  create: (data) => api.post('/goals', data).then(r => r.data),
  update: (id, data) => api.put(`/goals/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/goals/${id}`).then(r => r.data),
};

export const attachmentsApi = {
  upload: (formData) => api.post('/attachments/upload', formData).then(r => r.data),
  list: (params) => api.get('/attachments', { params }).then(r => r.data),
  delete: (id) => api.delete(`/attachments/${id}`).then(r => r.data),
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
