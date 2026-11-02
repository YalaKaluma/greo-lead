import axios from 'axios';
import { API_BASE_URL } from './config.js';
import {
  getSessionToken, getRefreshToken, getCredentialGeneration, isNativeApp, storeSessionResponse,
} from './sessionCredentials.js';

const PUBLIC_API_PATHS = new Set([
  '/api/auth/login', '/api/auth/register', '/api/auth/password-recovery/request',
  '/api/auth/password-recovery/reset', '/api/health', '/api/onboarding/login', '/api/waitlist',
]);
const NO_REFRESH_PATHS = new Set([...PUBLIC_API_PATHS, '/api/auth/refresh']);
const TRUSTED_API_ORIGINS = new Set([window.location.origin]);
try {
  if (API_BASE_URL) TRUSTED_API_ORIGINS.add(new URL(API_BASE_URL, window.location.origin).origin);
} catch { /* An invalid configured API URL must not receive credentials. */ }

function requestUrl(input, baseURL) {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    return new URL(raw, baseURL || window.location.origin);
  } catch { return null; }
}
function pathFor(input, baseURL) {
  return requestUrl(input, baseURL)?.pathname.replace(/\/$/, '') || '/';
}
function trustedApiRequest(input, baseURL) {
  const url = requestUrl(input, baseURL);
  return Boolean(url && TRUSTED_API_ORIGINS.has(url.origin) && url.pathname.startsWith('/api/'));
}
function bearerTokenFor(input, baseURL) {
  return trustedApiRequest(input, baseURL) && !PUBLIC_API_PATHS.has(pathFor(input, baseURL))
    ? getSessionToken() : null;
}
function canRefresh(input, baseURL) {
  return trustedApiRequest(input, baseURL) && !NO_REFRESH_PATHS.has(pathFor(input, baseURL));
}
function signalAdminReauthentication(status, data) {
  if (status === 403 && data?.detail?.code === 'admin_reauthentication_required') {
    window.dispatchEvent(new Event('alfred-admin-reauthentication'));
  }
}

const nativeFetch = window.fetch.bind(window);
let refreshInFlight = null;

export function renewSession() {
  if (refreshInFlight) return refreshInFlight;
  const startedGeneration = getCredentialGeneration();
  refreshInFlight = (async () => {
    const headers = { 'Content-Type': 'application/json' };
    if (isNativeApp()) headers['X-Alfred-Client'] = 'native';
    const response = await nativeFetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST', credentials: 'include', headers,
      body: JSON.stringify({ refresh_token: getRefreshToken() }),
    });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error('Session renewal temporarily unavailable');
    const data = await response.json();
    if (getCredentialGeneration() !== startedGeneration) return false;
    await storeSessionResponse(data);
    return true;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

axios.interceptors.request.use((config) => {
  if (trustedApiRequest(config.url, config.baseURL)) {
    config.withCredentials = true;
    if (isNativeApp()) config.headers.set('X-Alfred-Client', 'native');
  }
  const token = bearerTokenFor(config.url, config.baseURL);
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});
axios.interceptors.response.use(response => response, async error => {
  const config = error.config;
  if (!config || !trustedApiRequest(config.url, config.baseURL)) return Promise.reject(error);
  signalAdminReauthentication(error.response?.status, error.response?.data);
  if (error.response?.status === 401 && !config._alfredRetried && canRefresh(config.url, config.baseURL)) {
    config._alfredRetried = true;
    if (await renewSession()) return axios.request(config);
  }
  return Promise.reject(error);
});

window.fetch = async (input, init = {}) => {
  if (!trustedApiRequest(input)) return nativeFetch(input, init);
  // Retain a fresh Request body before the first attempt (e.g. an audio upload).
  const retryInput = input instanceof Request ? input.clone() : input;
  const send = (requestInput) => {
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const token = bearerTokenFor(input);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (isNativeApp()) headers.set('X-Alfred-Client', 'native');
    return nativeFetch(requestInput, { ...init, headers, credentials: 'include' });
  };
  let response = await send(input);
  if (response.status === 401 && canRefresh(input) && await renewSession()) {
    response = await send(retryInput);
  }
  if (response.status === 403) {
    signalAdminReauthentication(response.status, await response.clone().json().catch(() => null));
  }
  return response;
};
