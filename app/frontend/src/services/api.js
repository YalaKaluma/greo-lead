import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const USER_NUMBER = import.meta.env.VITE_USER_NUMBER || 'whatsapp:+17707789240';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const taskApi = {
  getTasks: (filterType = 'all') => 
    api.get('/tasks/', { 
      params: { user_number: USER_NUMBER, filter_type: filterType } 
    }),

  createTask: (taskData) => 
    api.post('/tasks/', taskData, { 
      params: { user_number: USER_NUMBER } 
    }),

  updateTask: (id, taskData) => 
    api.put(`/tasks/${id}`, taskData, { 
      params: { user_number: USER_NUMBER } 
    }),

  toggleTask: (id) => 
    api.patch(`/tasks/${id}/toggle`, {}, { 
      params: { user_number: USER_NUMBER } 
    }),

  deleteTask: (id) => 
    api.delete(`/tasks/${id}`, { 
      params: { user_number: USER_NUMBER } 
    }),
};

export default api;
