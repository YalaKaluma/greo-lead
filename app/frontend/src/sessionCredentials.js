import { Capacitor, registerPlugin } from '@capacitor/core';

const ACCESS_TOKEN_KEY = 'access_token';
const SessionCredentials = registerPlugin('SessionCredentials');
let nativeSessionToken = null;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function hydrateSessionCredentials() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  if (!isNativeApp()) return;
  try {
    const result = await SessionCredentials.get();
    nativeSessionToken = result?.token || null;
  } catch {
    nativeSessionToken = null;
  }
}

export async function storeSessionToken(token) {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  nativeSessionToken = isNativeApp() && token ? token : null;
  if (!isNativeApp()) return;
  if (nativeSessionToken) await SessionCredentials.set({ token: nativeSessionToken });
  else await SessionCredentials.clear();
}

export function getSessionToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  return isNativeApp() ? nativeSessionToken : null;
}

export function clearSessionCredentials() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  nativeSessionToken = null;
  if (isNativeApp()) SessionCredentials.clear().catch(() => {});
}
