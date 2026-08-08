import axios from 'axios';
import { API_BASE_URL } from './config.js';

const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
  '/api/onboarding/login',
  '/api/waitlist',
]);

const TRUSTED_API_ORIGINS = new Set([window.location.origin]);
try {
  if (API_BASE_URL) TRUSTED_API_ORIGINS.add(new URL(API_BASE_URL, window.location.origin).origin);
} catch {
  // An invalid configured API URL must not receive credentials.
}

function requestUrl(input, baseURL) {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    return new URL(raw, baseURL || window.location.origin);
  } catch {
    return null;
  }
}

function bearerTokenFor(input, baseURL) {
  const url = requestUrl(input, baseURL);
  if (!url || !TRUSTED_API_ORIGINS.has(url.origin)) return null;
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (!path.startsWith('/api/') || PUBLIC_API_PATHS.has(path)) return null;
  return localStorage.getItem('access_token');
}

axios.interceptors.request.use((config) => {
  const token = bearerTokenFor(config.url, config.baseURL);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const token = bearerTokenFor(input);
  if (!token) return nativeFetch(input, init);

  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return nativeFetch(input, { ...init, headers });
};
