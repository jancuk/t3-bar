import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecretStore, type CryptoAdapter } from '../src/main/secrets';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 't3w-secrets-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fake = (available = true): CryptoAdapter => ({
  isAvailable: () => available,
  encrypt: (p) => Buffer.from(`enc:${p.split('').reverse().join('')}`),
  decrypt: (c) => {
    const s = c.toString();
    if (!s.startsWith('enc:')) throw new Error('bad');
    return s.slice(4).split('').reverse().join('');
  },
});

const ID = 'r-0123456789';
const TOKEN = 'super-secret-token-123';

describe('SecretStore', () => {
  it('round-trips a token without writing it in plaintext', async () => {
    const s = new SecretStore(dir, fake());
    await s.set(ID, TOKEN);
    expect(await s.get(ID)).toBe(TOKEN);
    const raw = readFileSync(path.join(dir, 'secrets.json'), 'utf8');
    expect(raw).not.toContain(TOKEN);
    expect(JSON.parse(raw)).toMatchObject({ version: 1, tokens: { [ID]: expect.any(String) } });
  });

  it('writes with mode 0600 and leaves no tmp files', async () => {
    const s = new SecretStore(dir, fake());
    await s.set(ID, TOKEN);
    expect(statSync(path.join(dir, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses to save when secure storage is unavailable, and never writes a file', async () => {
    const s = new SecretStore(dir, fake(false));
    expect(s.isAvailable()).toBe(false);
    await expect(s.set(ID, TOKEN)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('Keychain') });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('validates the id and the token', async () => {
    const s = new SecretStore(dir, fake());
    await expect(s.set('local', TOKEN)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(s.set('nope', TOKEN)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(s.set(ID, 'short')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(s.set(ID, 'has a space in it')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns null for missing ids and for undecryptable data', async () => {
    const s = new SecretStore(dir, fake());
    expect(await s.get(ID)).toBeNull();
    writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ version: 1, tokens: { [ID]: Buffer.from('garbage').toString('base64') } }));
    expect(await s.get(ID)).toBeNull();
    expect(await s.get('__proto__')).toBeNull();
  });

  it('deletes tokens', async () => {
    const s = new SecretStore(dir, fake());
    await s.set(ID, TOKEN);
    await s.delete(ID);
    expect(await s.get(ID)).toBeNull();
    await expect(s.delete(ID)).resolves.toBeUndefined();
  });

  it('moves corrupt JSON aside and starts empty', async () => {
    writeFileSync(path.join(dir, 'secrets.json'), '{not json');
    const s = new SecretStore(dir, fake());
    expect(await s.get(ID)).toBeNull();
    expect(readdirSync(dir).some((f) => f.startsWith('secrets.json.bak-'))).toBe(true);
    await s.set(ID, TOKEN);
    expect(await s.get(ID)).toBe(TOKEN);
  });

  it('serializes concurrent writes so none are lost', async () => {
    const s = new SecretStore(dir, fake());
    const ids = Array.from({ length: 8 }, (_, i) => `r-000000000${i}`);
    await Promise.all(ids.map((id, i) => s.set(id, `token-number-${i}`)));
    for (const [i, id] of ids.entries()) expect(await s.get(id)).toBe(`token-number-${i}`);
  });
});
