import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnvironmentManager } from '../src/main/environments';
import type { FetchImpl } from '../src/main/health';
import { envIdFor } from '../src/main/paths';
import { SecretStore, type CryptoAdapter } from '../src/main/secrets';
import { SettingsStore } from '../src/main/settings';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 't3w-envs-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const TOKEN = 'valid-token-abcdef';
const ORIGIN = 'https://dev-mac.example.ts.net';
const ID = envIdFor(ORIGIN);

const crypto = (available = true): CryptoAdapter => ({
  isAvailable: () => available,
  encrypt: (p) => Buffer.from(`enc:${p}`),
  decrypt: (c) => c.toString().slice(4),
});

interface Behaviour { reachable?: boolean; shellStatus?: number; acceptedToken?: string }
function fakeFetch(b: Behaviour = {}) {
  const calls: string[] = [];
  const impl = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push(url);
    if (url.endsWith('/.well-known/t3/environment')) {
      if (b.reachable === false) throw new Error('down');
      const body = { environmentId: 'env-9', label: 'Dev Mac', serverVersion: '1.0' };
      return { ok: true, status: 200, json: async () => body };
    }
    const auth = init?.headers?.authorization;
    const status = b.shellStatus ?? (b.acceptedToken && auth !== `Bearer ${b.acceptedToken}` ? 401 : 200);
    const body = { projects: [], threads: [] };
    return { ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) };
  }) as FetchImpl;
  return { impl, calls };
}

async function setup(opts: { available?: boolean; fetch?: Behaviour } = {}) {
  const store = new SettingsStore(dir);
  await store.load();
  const secrets = new SecretStore(dir, crypto(opts.available ?? true));
  const f = fakeFetch(opts.fetch);
  const mgr = createEnvironmentManager({ store, secrets, clientDeps: { fetchImpl: f.impl } });
  return { store, secrets, mgr, ...f };
}

describe('EnvironmentManager.add', () => {
  it('verifies, stores the token securely, saves the machine and activates it', async () => {
    const { store, secrets, mgr } = await setup();
    const env = await mgr.add({ origin: `${ORIGIN}/ignored/path`, token: TOKEN });
    expect(env).toEqual({ id: ID, label: 'Dev Mac', origin: ORIGIN, environmentId: 'env-9' });
    expect(JSON.stringify(env)).not.toContain(TOKEN);
    expect(store.get()).toMatchObject({ activeEnvironmentId: ID, environments: [env] });
    expect(await secrets.get(ID)).toBe(TOKEN);
    expect(readFileSync(path.join(dir, 'settings.json'), 'utf8')).not.toContain(TOKEN);
    expect(readFileSync(path.join(dir, 'secrets.json'), 'utf8')).not.toContain(TOKEN);
  });

  it('prefers a user-supplied label', async () => {
    const { mgr } = await setup();
    expect((await mgr.add({ origin: ORIGIN, token: TOKEN, label: '  Studio\n Mac ' })).label).toBe('Studio Mac');
  });

  it('rejects bad input before any network call', async () => {
    const { mgr, calls } = await setup();
    await expect(mgr.add({ origin: 'http://example.com', token: TOKEN })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(mgr.add({ origin: ORIGIN, token: 'bad token' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(calls).toEqual([]);
  });

  it('refuses when secure storage is unavailable', async () => {
    const { mgr, store, calls } = await setup({ available: false });
    await expect(mgr.add({ origin: ORIGIN, token: TOKEN })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('Keychain') });
    expect(calls).toEqual([]);
    expect(store.get().environments).toEqual([]);
  });

  it('rejects a rejected token and saves nothing', async () => {
    const { mgr, store, secrets } = await setup({ fetch: { shellStatus: 401 } });
    await expect(mgr.add({ origin: ORIGIN, token: TOKEN })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(store.get().environments).toEqual([]);
    expect(await secrets.get(ID)).toBeNull();
  });

  it('rejects an unreachable machine', async () => {
    const { mgr, store } = await setup({ fetch: { reachable: false } });
    await expect(mgr.add({ origin: ORIGIN, token: TOKEN })).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(store.get().environments).toEqual([]);
  });

  it('enforces the machine limit but lets an existing machine be re-added', async () => {
    const { mgr, store } = await setup();
    for (let i = 0; i < 10; i++) await mgr.add({ origin: `https://m${i}.example.com`, token: TOKEN });
    await expect(mgr.add({ origin: 'https://extra.example.com', token: TOKEN })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(mgr.add({ origin: 'https://m3.example.com', token: TOKEN, label: 'Renamed' })).resolves.toMatchObject({ label: 'Renamed' });
    expect(store.get().environments).toHaveLength(10);
  });

  it('rolls the secret back when saving settings fails', async () => {
    const { mgr, store, secrets } = await setup();
    vi.spyOn(store, 'mutate').mockRejectedValue(new Error('disk full'));
    await expect(mgr.add({ origin: ORIGIN, token: TOKEN })).rejects.toThrow('disk full');
    expect(await secrets.get(ID)).toBeNull();
  });

  it('restores the previous token when a re-add fails to save', async () => {
    const { mgr, store, secrets } = await setup();
    await mgr.add({ origin: ORIGIN, token: TOKEN });
    vi.spyOn(store, 'mutate').mockRejectedValue(new Error('disk full'));
    await expect(mgr.add({ origin: ORIGIN, token: 'another-token-9999' })).rejects.toThrow();
    expect(await secrets.get(ID)).toBe(TOKEN);
  });
});

describe('EnvironmentManager.get / updateToken / remove', () => {
  it('returns a memoized client that reads the stored token', async () => {
    const { mgr, calls } = await setup();
    await mgr.add({ origin: ORIGIN, token: TOKEN });
    const c = mgr.get(ID);
    expect(mgr.get(ID)).toBe(c);
    calls.length = 0;
    await c.fetchShell({ force: true });
    expect(calls).toEqual([`${ORIGIN}/api/orchestration/shell`]);
  });

  it('rejects unknown and local ids', async () => {
    const { mgr } = await setup();
    expect(() => mgr.get('local')).toThrow();
    expect(() => mgr.get('r-0123456789')).toThrow();
    expect(() => mgr.get('bogus')).toThrow();
  });

  it('updates the token only after it is verified', async () => {
    const { mgr, secrets } = await setup({ fetch: { acceptedToken: 'fresh-token-12345' } });
    // Seed directly, since the fake only accepts the fresh token.
    await secrets.set(ID, TOKEN);
    await mgr['add' as 'add']({ origin: ORIGIN, token: 'fresh-token-12345' });
    await expect(mgr.updateToken(ID, 'wrong-token-00000')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await secrets.get(ID)).toBe('fresh-token-12345');
    await mgr.updateToken(ID, 'fresh-token-12345');
    expect(await secrets.get(ID)).toBe('fresh-token-12345');
  });

  it('refreshes the client after a token update', async () => {
    const { mgr } = await setup();
    await mgr.add({ origin: ORIGIN, token: TOKEN });
    const before = mgr.get(ID);
    await mgr.updateToken(ID, 'second-token-12345');
    expect(mgr.get(ID)).not.toBe(before);
  });

  it('rejects updating an unknown machine', async () => {
    const { mgr } = await setup();
    await expect(mgr.updateToken(ID, TOKEN)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('removes the secret, the machine and its project choice, and falls back to local', async () => {
    const { mgr, store, secrets } = await setup();
    await mgr.add({ origin: ORIGIN, token: TOKEN });
    await store.update({ activeTargetByEnv: { [ID]: 'p1' } });
    await mgr.remove(ID);
    expect(await secrets.get(ID)).toBeNull();
    expect(store.get()).toMatchObject({ environments: [], activeEnvironmentId: 'local', activeTargetByEnv: {} });
    expect(() => mgr.get(ID)).toThrow();
  });

  it('keeps another active machine when removing a different one', async () => {
    const { mgr, store } = await setup();
    await mgr.add({ origin: 'https://a.example.com', token: TOKEN });
    const b = await mgr.add({ origin: 'https://b.example.com', token: TOKEN });
    await mgr.remove(envIdFor('https://a.example.com'));
    expect(store.get().activeEnvironmentId).toBe(b.id);
  });

  it('never removes local', async () => {
    const { mgr } = await setup();
    await expect(mgr.remove('local')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
