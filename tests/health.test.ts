import { describe, expect, it, vi } from 'vitest';
import { fetchEnvironment, probeEnvironment, type FetchImpl } from '../src/main/health';

const body = {
  environmentId: 'env-1', label: "Dev Mac", serverVersion: '0.1.11',
  platform: { os: 'darwin', arch: 'arm64' },
};
const okFetch = (b: unknown): FetchImpl => async () => ({ ok: true, status: 200, json: async () => b });

describe('fetchEnvironment', () => {
  it('reads the documented environment descriptor', async () => {
    const f = vi.fn(okFetch(body));
    const h = await fetchEnvironment('http://127.0.0.1:3773/', f);
    expect(f).toHaveBeenCalledWith('http://127.0.0.1:3773/.well-known/t3/environment', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(h).toMatchObject({ reachable: true, label: "Dev Mac", serverVersion: '0.1.11', platform: 'darwin arm64', environmentId: 'env-1' });
  });
  it('reports HTTP errors as unreachable', async () => {
    const h = await fetchEnvironment('http://localhost:3773', async () => ({ ok: false, status: 503, json: async () => ({}) }));
    expect(h).toMatchObject({ reachable: false, error: 'HTTP 503' });
  });
  it('reports network failures and timeouts', async () => {
    const h1 = await fetchEnvironment('http://127.0.0.1:3773', async () => { throw new Error('ECONNREFUSED'); });
    expect(h1).toMatchObject({ reachable: false, error: 'Not reachable' });
    const h2 = await fetchEnvironment('http://127.0.0.1:3773', async () => { throw new DOMException('t', 'TimeoutError'); });
    expect(h2.error).toBe('Timed out');
  });
  it('tolerates a malformed body', async () => {
    const h = await fetchEnvironment('http://127.0.0.1:3773', okFetch(null));
    expect(h.reachable).toBe(true);
    expect(h.label).toBeUndefined();
  });
  it('refuses non-loopback URLs without calling fetch', async () => {
    const f = vi.fn(okFetch(body));
    await expect(fetchEnvironment('http://example.com', f)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(fetchEnvironment('https://127.0.0.1:3773', f)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('probeEnvironment', () => {
  it('probes an already-validated remote origin with redirect disabled', async () => {
    const f = vi.fn(okFetch(body));
    const h = await probeEnvironment('https://dev-mac.example.ts.net', f, 500);
    expect(f).toHaveBeenCalledWith(
      'https://dev-mac.example.ts.net/.well-known/t3/environment',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    );
    expect(h).toMatchObject({ reachable: true, serverUrl: 'https://dev-mac.example.ts.net', label: 'Dev Mac' });
  });
  it('never throws', async () => {
    const h = await probeEnvironment('https://x.example.com', async () => { throw new Error('boom'); });
    expect(h).toMatchObject({ reachable: false, error: 'Not reachable' });
  });
});
