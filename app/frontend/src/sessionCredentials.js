import { Capacitor } from '@capacitor/core';

const ACCESS_TOKEN_KEY = 'access_token';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function storeSessionToken(token) {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  if (isNativeApp() && token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getSessionToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  return isNativeApp() ? sessionStorage.getItem(ACCESS_TOKEN_KEY) : null;
}

export function clearSessionCredentials() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
