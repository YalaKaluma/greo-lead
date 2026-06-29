// src/config.js
// API configuration that works in both dev and production

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In production (built static files), use relative URLs
  // This works because FastAPI serves both frontend and API
  if (import.meta.env.PROD) {
    return ''; // Empty string = relative URLs like /api/tasks
  }
  
  // In development, use environment variable or localhost
  return import.meta.env.VITE_API_URL || 'http://localhost:8000';
};

export const API_BASE_URL = getApiBaseUrl();
export const USER_NUMBER = import.meta.env.VITE_USER_NUMBER || 'whatsapp:+17707789240';

console.log('API Config:', {
  mode: import.meta.env.MODE,
  apiBaseUrl: API_BASE_URL,
  userNumber: USER_NUMBER
});
// Alias export for compatibility
export const API_URL = API_BASE_URL;
