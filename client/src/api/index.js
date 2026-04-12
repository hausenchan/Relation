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
  create: (data) => api.post('/users', data).then(r => r.data),
  update: (id, data) => api.put(`/users/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/users/${id}`).then(r => r.data),
};

export const personsApi = {
  list: (params) => api.get('/persons', { params }).then(r => r.data),
  get: (id) => api.get(`/persons/${id}`).then(r => r.data),
  create: (data) => api.post('/persons', data).then(r => r.data),
  update: (id, data) => api.put(`/persons/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/persons/${id}`).then(r => r.data),
  import: (rows) => api.post('/persons/import', rows).then(r => r.data),
};

export const interactionsApi = {
  list: (params) => api.get('/interactions', { params }).then(r => r.data),
  create: (data) => api.post('/interactions', data).then(r => r.data),
  update: (id, data) => api.put(`/interactions/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/interactions/${id}`).then(r => r.data),
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

export const companyDynamicsApi = {
  list: (params) => api.get('/company_dynamics', { params }).then(r => r.data),
  create: (data) => api.post('/company_dynamics', data).then(r => r.data),
  update: (id, data) => api.put(`/company_dynamics/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/company_dynamics/${id}`).then(r => r.data),
};
