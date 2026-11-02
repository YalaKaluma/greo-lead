import { Capacitor, registerPlugin } from '@capacitor/core';

const ACCESS_TOKEN_KEY = 'access_token';
const SessionCredentials = registerPlugin('SessionCredentials');
let nativeSessionToken = null;
let nativeRefreshToken = null;
let nativeRemember = true;
let generation = 0;
let storageWrite = Promise.resolve();
let storageReadFailed = false;

export function isNativeApp() { return Capacitor.isNativePlatform(); }
function hasSecureNativeStorage() {
  return isNativeApp() && Capacitor.isPluginAvailable('SessionCredentials');
}
function removeLegacyStorage() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
function writeSecureStorage(value) {
  storageWrite = storageWrite.catch(() => {}).then(() => (
    value ? SessionCredentials.set({ token: value }) : SessionCredentials.clear()
  ));
  return storageWrite;
}

export async function hydrateSessionCredentials() {
  removeLegacyStorage();
  storageReadFailed = false;
  if (!hasSecureNativeStorage()) return;
  try {
    const result = await SessionCredentials.get();
    const stored = result?.token;
    if (stored?.startsWith('{')) {
      const credentials = JSON.parse(stored);
      nativeSessionToken = credentials.accessToken || null;
      nativeRefreshToken = credentials.refreshToken || null;
      nativeRemember = true;
    } else {
      // Previously installed apps stored only the access token in this slot.
      nativeSessionToken = stored || null;
      nativeRefreshToken = null;
    }
  } catch {
    // A temporarily unavailable Keychain/Keystore is not a logout.
    storageReadFailed = true;
  }
}

export async function storeSessionToken(token, { refreshToken = null, remember = true } = {}) {
  removeLegacyStorage();
  nativeSessionToken = isNativeApp() && token ? token : null;
  nativeRefreshToken = isNativeApp() && refreshToken ? refreshToken : null;
  nativeRemember = remember;
  storageReadFailed = false;
  if (!hasSecureNativeStorage()) return;
  try {
    await writeSecureStorage(remember && nativeSessionToken ? JSON.stringify({
      accessToken: nativeSessionToken, refreshToken: nativeRefreshToken,
    }) : null);
  } catch {
    // Keep credentials in memory; never fall back to browser storage.
  }
}

export async function storeSessionResponse(data, { replace = false } = {}) {
  if (replace) generation += 1;
  await storeSessionToken(data.access_token, {
    refreshToken: data.refresh_token ?? (replace ? null : nativeRefreshToken),
    remember: data.remember_device ?? nativeRemember,
  });
}
export function getSessionToken() {
  removeLegacyStorage();
  return isNativeApp() ? nativeSessionToken : null;
}
export function getRefreshToken() { return isNativeApp() ? nativeRefreshToken : null; }
export function getCredentialGeneration() { return generation; }
export function credentialStorageUnavailable() { return storageReadFailed; }

export async function clearSessionCredentials() {
  generation += 1;
  removeLegacyStorage();
  nativeSessionToken = null;
  nativeRefreshToken = null;
  storageReadFailed = false;
  if (hasSecureNativeStorage()) await writeSecureStorage(null).catch(() => {});
}
