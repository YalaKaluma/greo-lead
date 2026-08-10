import axios from 'axios';
import { API_BASE_URL } from './config.js';
import { getSessionToken } from './sessionCredentials.js';

const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password-recovery/request',
  '/api/auth/password-recovery/reset',
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

function trustedApiRequest(input, baseURL) {
  const url = requestUrl(input, baseURL);
  if (!url || !TRUSTED_API_ORIGINS.has(url.origin)) return false;
  const path = url.pathname.replace(/\/$/, '') || '/';
  return path.startsWith('/api/');
}

function bearerTokenFor(input, baseURL) {
  if (!trustedApiRequest(input, baseURL)) return null;
  const url = requestUrl(input, baseURL);
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (PUBLIC_API_PATHS.has(path)) return null;
  return getSessionToken();
}

axios.interceptors.request.use((config) => {
  if (trustedApiRequest(config.url, config.baseURL)) config.withCredentials = true;
  const token = bearerTokenFor(config.url, config.baseURL);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const trusted = trustedApiRequest(input);
  const token = bearerTokenFor(input);
  if (!trusted) return nativeFetch(input, init);

  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return nativeFetch(input, { ...init, headers, credentials: 'include' });
};
