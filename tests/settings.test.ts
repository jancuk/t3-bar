import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_PROJECT_ID } from '../src/shared/types';
import { DEFAULT_SETTINGS, SettingsStore } from '../src/main/settings';
import { envIdFor } from '../src/main/paths';

const envA = { id: envIdFor('https://a.example.com'), label: 'A', origin: 'https://a.example.com' };
const envB = { id: envIdFor('https://b.example.com'), label: 'B', origin: 'https://b.example.com' };

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 't3w-settings-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('loads defaults when no file exists', async () => {
    const s = await new SettingsStore(dir).load();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.showSettled).toBe(false);
    expect(s.previewCount).toBe(8);
    expect(s.activeProjectId).toBe(NO_PROJECT_ID);
    expect(s.autoHideOnSend).toBe(true);
  });

  it('validates per field and keeps good ones', async () => {
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
      version: 1, cliPath: '/x/t3', serverUrl: 'https://evil.example.com', previewCount: 999, pinned: true,
      autoHideOnSend: 'nope', shortcut: 'Alt+X',
      projects: [{ id: 'p1', name: 'A', path: '/a' }, { id: 'no-project', name: 'X', path: '/x' }, { id: '../bad', name: 'B', path: '/b' }, { id: 'p3', name: 'C', path: 'relative' }],
      activeProjectId: 'missing',
    }));
    const s = await new SettingsStore(dir).load();
    expect(s.cliPath).toBe('/x/t3');
    expect(s.serverUrl).toBe(DEFAULT_SETTINGS.serverUrl);
    expect(s.previewCount).toBe(8);
    expect(s.pinned).toBe(true);
    expect(s.autoHideOnSend).toBe(true);
    expect(s.shortcut).toBe('Alt+X');
    expect(s.projects.map((p) => p.id)).toEqual(['p1']);
    expect(s.activeProjectId).toBe(NO_PROJECT_ID);
  });

  it('keeps a saved active project and caps the project list', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}`, name: `n${i}`, path: `/x/${i}` }));
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ projects: many, activeProjectId: 'p7' }));
    const s = await new SettingsStore(dir).load();
    expect(s.projects).toHaveLength(200);
    expect(s.activeProjectId).toBe('p7');
  });

  it('validates activeProjectId and autoHideOnSend patches', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await expect(store.update({ activeProjectId: 'ghost' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ autoHideOnSend: 'no' as unknown as boolean })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ projects: [{ id: 'no-project', name: 'x', path: '/x' }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await store.update({ projects: [{ id: 'p1', name: 'A', path: '/a' }], activeProjectId: 'p1', autoHideOnSend: false });
    expect(store.get()).toMatchObject({ activeProjectId: 'p1', autoHideOnSend: false });
    await expect(store.update({ activeProjectId: NO_PROJECT_ID })).resolves.toMatchObject({ activeProjectId: NO_PROJECT_ID });
  });

  it('backs up corrupt JSON and falls back to defaults', async () => {
    writeFileSync(path.join(dir, 'settings.json'), '{not json');
    const s = await new SettingsStore(dir).load();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(readdirSync(dir).some((f) => f.startsWith('settings.json.bak-'))).toBe(true);
  });

  it('persists updates atomically and leaves no tmp file', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await store.update({ previewCount: 12, showSettled: true });
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8')) as Record<string, unknown>;
    expect(onDisk).toMatchObject({ previewCount: 12, showSettled: true, version: 1 });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects invalid patches without changing state', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await expect(store.update({ previewCount: 0 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ serverUrl: 'http://example.com' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ cliPath: '/bin/sh' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ cliPath: 't3' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ pinned: 'yes' as unknown as boolean })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    // queue still works after failures
    await expect(store.update({ pinned: true })).resolves.toMatchObject({ pinned: true });
  });

  it('serializes concurrent updates', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.update({ previewCount: i + 1 })));
    expect(store.get().previewCount).toBe(10);
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8')) as { previewCount: number };
    expect(onDisk.previewCount).toBe(10);
  });

  it('returns frozen snapshots', async () => {
    const store = new SettingsStore(dir);
    const s = await store.load();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.projects)).toBe(true);
    const before = store.get();
    await store.update({ pinned: true });
    expect(before.pinned).toBe(false);
  });
});

describe('remote environments in settings', () => {
  it('defaults to local with no machines', async () => {
    const s = await new SettingsStore(dir).load();
    expect(s).toMatchObject({ environments: [], activeEnvironmentId: 'local', activeTargetByEnv: {} });
  });

  it('sanitizes saved machines on load', async () => {
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
      environments: [
        envA,
        { ...envB, id: 'r-0000000000' },
        { id: envIdFor('http://example.com'), label: 'X', origin: 'http://example.com' },
        { ...envA },
        'junk',
      ],
      activeEnvironmentId: envA.id,
      activeTargetByEnv: { [envA.id]: 'proj-1', [envB.id]: 'proj-2', 'r-1111111111': 'p' },
    }));
    const s = await new SettingsStore(dir).load();
    expect(s.environments.map((e) => e.id)).toEqual([envA.id]);
    expect(s.activeEnvironmentId).toBe(envA.id);
    expect(s.activeTargetByEnv).toEqual({ [envA.id]: 'proj-1' });
  });

  it('falls back to local when the active machine is unknown, and caps at 10', async () => {
    const many = Array.from({ length: 12 }, (_, i) => {
      const origin = `https://m${i}.example.com`;
      return { id: envIdFor(origin), label: `M${i}`, origin };
    });
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ environments: many, activeEnvironmentId: 'r-ffffffffff' }));
    const s = await new SettingsStore(dir).load();
    expect(s.environments).toHaveLength(10);
    expect(s.activeEnvironmentId).toBe('local');
  });

  it('persists environments and merges activeTargetByEnv patches', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await store.update({ environments: [envA, envB], activeEnvironmentId: envA.id });
    await store.update({ activeTargetByEnv: { [envA.id]: 'p1' } });
    await store.update({ activeTargetByEnv: { [envB.id]: 'p2' } });
    expect(store.get().activeTargetByEnv).toEqual({ [envA.id]: 'p1', [envB.id]: 'p2' });
    await store.update({ activeTargetByEnv: { [envA.id]: null } });
    expect(store.get().activeTargetByEnv).toEqual({ [envB.id]: 'p2' });
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8')) as { environments: unknown[] };
    expect(onDisk.environments).toHaveLength(2);
    expect(Object.isFrozen(store.get().environments)).toBe(true);
    expect(Object.isFrozen(store.get().activeTargetByEnv)).toBe(true);
  });

  it('rejects invalid environment patches', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await expect(store.update({ activeEnvironmentId: envA.id })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ environments: [{ ...envA, origin: 'http://example.com' }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ environments: [{ ...envA, id: 'r-0000000000' }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const eleven = Array.from({ length: 11 }, (_, i) => {
      const origin = `https://m${i}.example.com`;
      return { id: envIdFor(origin), label: `M${i}`, origin };
    });
    await expect(store.update({ environments: eleven })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await store.update({ environments: [envA] });
    await expect(store.update({ activeTargetByEnv: { [envB.id]: 'p' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.update({ activeTargetByEnv: { [envA.id]: '../bad' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(store.get().environments).toHaveLength(1);
  });

  it('drops a removed machine from the active choice and target map', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await store.update({ environments: [envA], activeEnvironmentId: envA.id, activeTargetByEnv: { [envA.id]: 'p1' } });
    await store.update({ environments: [], activeEnvironmentId: 'local', activeTargetByEnv: { [envA.id]: null } });
    expect(store.get()).toMatchObject({ environments: [], activeEnvironmentId: 'local', activeTargetByEnv: {} });
  });
});
