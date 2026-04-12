import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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
