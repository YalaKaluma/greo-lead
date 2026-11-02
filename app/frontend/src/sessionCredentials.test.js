import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  enabled: true, available: true, saved: null,
  get: vi.fn(), set: vi.fn(), clear: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.enabled, isPluginAvailable: () => native.available },
  registerPlugin: () => native,
}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  native.enabled = true; native.available = true; native.saved = null;
  native.get.mockImplementation(async () => ({ token: native.saved }));
  native.set.mockImplementation(async ({ token }) => { native.saved = token; });
  native.clear.mockImplementation(async () => { native.saved = null; });
});

describe('protected device credentials', () => {
  it('restores access and refresh credentials from native secure storage', async () => {
    let credentials = await import('./sessionCredentials');
    await credentials.storeSessionResponse({ access_token: 'access', refresh_token: 'refresh', remember_device: true }, { replace: true });
    expect(native.saved).toContain('refresh');
    expect(localStorage.length).toBe(0);
    vi.resetModules();
    credentials = await import('./sessionCredentials');
    await credentials.hydrateSessionCredentials();
    expect(credentials.getSessionToken()).toBe('access');
    expect(credentials.getRefreshToken()).toBe('refresh');
    await credentials.storeSessionResponse({ access_token: 'elevated' });
    expect(credentials.getRefreshToken()).toBe('refresh');
  });
  it('keeps unremembered native sessions in memory only', async () => {
    const credentials = await import('./sessionCredentials');
    native.saved = 'old-session';
    await credentials.storeSessionResponse({ access_token: 'access', refresh_token: 'refresh', remember_device: false });
    expect(credentials.getSessionToken()).toBe('access');
    expect(native.saved).toBeNull();
    expect(native.set).not.toHaveBeenCalled();
  });
  it('never stores browser bearer or refresh tokens in web storage', async () => {
    native.enabled = false;
    const credentials = await import('./sessionCredentials');
    await credentials.storeSessionResponse({ access_token: 'access', refresh_token: 'refresh' });
    expect(credentials.getSessionToken()).toBeNull();
    expect(credentials.getRefreshToken()).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(native.set).not.toHaveBeenCalled();
  });
  it('preserves secure storage on a transient read failure and can retry', async () => {
    const credentials = await import('./sessionCredentials');
    native.saved = 'legacy-token';
    native.get.mockRejectedValueOnce(new Error('Keychain busy'));
    await credentials.hydrateSessionCredentials();
    expect(credentials.credentialStorageUnavailable()).toBe(true);
    expect(native.clear).not.toHaveBeenCalled();
    await credentials.hydrateSessionCredentials();
    expect(credentials.getSessionToken()).toBe('legacy-token');
    expect(credentials.credentialStorageUnavailable()).toBe(false);
  });
  it('serializes a pending secure save before logout clears it', async () => {
    const credentials = await import('./sessionCredentials');
    let release;
    native.set.mockImplementationOnce(async ({ token }) => {
      await new Promise(resolve => { release = resolve; });
      native.saved = token;
    });
    const saving = credentials.storeSessionResponse({ access_token: 'access', refresh_token: 'refresh' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const clearing = credentials.clearSessionCredentials();
    release(); await saving; await clearing;
    expect(native.saved).toBeNull();
    expect(credentials.getSessionToken()).toBeNull();
  });
});
