import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore } from '../src/main/settings';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 't3w-settings-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('loads defaults when no file exists', async () => {
    const s = await new SettingsStore(dir).load();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.showSettled).toBe(false);
    expect(s.previewCount).toBe(8);
  });

  it('validates per field and keeps good ones', async () => {
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
      version: 1, cliPath: '/x/t3', serverUrl: 'https://evil.example.com', previewCount: 999, pinned: true,
      lastMode: 'nope', shortcut: 'Alt+X',
      projects: [{ id: 'p1', name: 'A', path: '/a' }, { id: '../bad', name: 'B', path: '/b' }, { id: 'p3', name: 'C', path: 'relative' }],
      activeProjectId: 'missing', lastThreadByProject: { p1: 'thread-1', ghost: 'x' },
    }));
    const s = await new SettingsStore(dir).load();
    expect(s.cliPath).toBe('/x/t3');
    expect(s.serverUrl).toBe(DEFAULT_SETTINGS.serverUrl);
    expect(s.previewCount).toBe(8);
    expect(s.pinned).toBe(true);
    expect(s.lastMode).toBe('reply');
    expect(s.shortcut).toBe('Alt+X');
    expect(s.projects.map((p) => p.id)).toEqual(['p1']);
    expect(s.activeProjectId).toBe('p1');
    expect(s.lastThreadByProject).toEqual({ p1: 'thread-1' });
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
