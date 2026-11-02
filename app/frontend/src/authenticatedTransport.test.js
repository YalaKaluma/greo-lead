import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ token: 'expired', refresh: 'refresh', generation: 0, native: true }));
const axiosMock = vi.hoisted(() => ({
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }, request: vi.fn(),
}));
vi.mock('axios', () => ({ default: axiosMock }));
vi.mock('./config.js', () => ({ API_BASE_URL: 'https://alfred.example' }));
vi.mock('./sessionCredentials.js', () => ({
  getSessionToken: () => state.native ? state.token : null,
  getRefreshToken: () => state.refresh,
  getCredentialGeneration: () => state.generation,
  isNativeApp: () => state.native,
  storeSessionResponse: vi.fn(async data => { state.token = data.access_token; state.refresh = data.refresh_token; }),
}));
const response = (status, body = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetchMock;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  Object.assign(state, { token: 'expired', refresh: 'refresh', generation: 0, native: true });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('automatic session renewal', () => {
  it('shares one renewal across concurrent failed requests and retries with the fresh credential', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/refresh')) return response(200, { access_token: 'fresh', refresh_token: 'rotated' });
      return response(new Headers(init.headers).get('Authorization') === 'Bearer fresh' ? 200 : 401);
    });
    await import('./authenticatedTransport');
    const results = await Promise.all([fetch('https://alfred.example/api/one'), fetch('https://alfred.example/api/two')]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  });
  it('propagates temporary refresh failures without treating them as a logout', async () => {
    fetchMock.mockImplementation(async url => response(url.endsWith('/refresh') ? 503 : 401));
    await import('./authenticatedTransport');
    await expect(fetch('https://alfred.example/api/auth/me')).rejects.toThrow('temporarily unavailable');
    expect(state.refresh).toBe('refresh');
  });
  it('does not loop when renewal is rejected', async () => {
    fetchMock.mockResolvedValue(response(401));
    await import('./authenticatedTransport');
    expect((await fetch('https://alfred.example/api/auth/me')).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('never sends Alfred credentials or renews for another origin', async () => {
    fetchMock.mockResolvedValue(response(401));
    await import('./authenticatedTransport');
    await fetch('https://untrusted.example/api/data');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://untrusted.example/api/data', {});
  });
  it('preserves a POST body while renewing an expired session', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith('/refresh')) return response(200, { access_token: 'fresh', refresh_token: 'rotated' });
      return response(new Headers(init.headers).get('Authorization') === 'Bearer fresh' ? 200 : 401);
    });
    await import('./authenticatedTransport');
    const body = new Blob(['recorded audio']);
    expect((await fetch('https://alfred.example/api/meetings/upload', { method: 'POST', body })).status).toBe(200);
    const uploads = fetchMock.mock.calls.filter(([url]) => url.endsWith('/upload'));
    expect(uploads).toHaveLength(2);
    expect(uploads.every(([, init]) => init.body === body && init.method === 'POST')).toBe(true);
  });
  it('does not automatically repeat privileged mutations after elevation expires', async () => {
    fetchMock.mockResolvedValue(response(403, { detail: { code: 'admin_reauthentication_required' } }));
    const listener = vi.fn(); window.addEventListener('alfred-admin-reauthentication', listener);
    await import('./authenticatedTransport');
    await fetch('https://alfred.example/api/admin/users', { method: 'POST', body: '{}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('alfred-admin-reauthentication', listener);
  });
  it('discards a renewal that finishes after logout', async () => {
    fetchMock.mockImplementation(async () => {
      state.generation += 1;
      return response(200, { access_token: 'must-not-restore', refresh_token: 'rotated' });
    });
    const { renewSession } = await import('./authenticatedTransport');
    expect(await renewSession()).toBe(false);
    expect(state.token).toBe('expired');
  });
});
