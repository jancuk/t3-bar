import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_PROJECT_ID } from '../src/shared/types';
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

describe('legacy remote keys', () => {
  it('drops environment keys on load and on the next write', async () => {
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
      environments: [{ id: 'r-0123456789', label: 'Old', origin: 'https://old.example.com' }],
      activeEnvironmentId: 'r-0123456789',
      activeTargetByEnv: { 'r-0123456789': 'p1' },
      pinned: true,
    }));
    const store = new SettingsStore(dir);
    const s = await store.load();
    expect(s).not.toHaveProperty('environments');
    expect(s).not.toHaveProperty('activeEnvironmentId');
    expect(s).not.toHaveProperty('activeTargetByEnv');
    expect(s.pinned).toBe(true);
    await store.update({ showSettled: true });
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8')) as Record<string, unknown>;
    expect(onDisk).not.toHaveProperty('environments');
    expect(onDisk).not.toHaveProperty('activeEnvironmentId');
    expect(onDisk.version).toBe(1);
  });
});

describe('clipboard settings', () => {
  const write = (v: unknown) => writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(v));

  it('has safe defaults', async () => {
    const s = await new SettingsStore(dir).load();
    expect(s).toMatchObject({ clipboardCapture: false, clipboardConsent: false, clipboardPosition: 'top-right' });
    expect(DEFAULT_SETTINGS).toMatchObject({ clipboardCapture: false, clipboardConsent: false, clipboardPosition: 'top-right' });
  });

  it('sanitizes capture on load when consent is missing', async () => {
    write({ clipboardCapture: true });
    expect((await new SettingsStore(dir).load()).clipboardCapture).toBe(false);
    write({ clipboardCapture: true, clipboardConsent: true, clipboardPosition: 'cursor' });
    expect(await new SettingsStore(dir).load()).toMatchObject({ clipboardCapture: true, clipboardConsent: true, clipboardPosition: 'cursor' });
  });

  it('falls back to top-right for an invalid position on load', async () => {
    write({ clipboardPosition: 'middle' });
    expect((await new SettingsStore(dir).load()).clipboardPosition).toBe('top-right');
  });

  it('rejects capture without consent and accepts it with consent', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await expect(store.update({ clipboardCapture: true })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(store.get().clipboardCapture).toBe(false);
    await store.update({ clipboardConsent: true, clipboardCapture: true });
    expect(store.get()).toMatchObject({ clipboardConsent: true, clipboardCapture: true });
    await store.update({ clipboardCapture: false });
    expect(store.get()).toMatchObject({ clipboardConsent: true, clipboardCapture: false });
    await store.update({ clipboardCapture: true });
    expect(store.get().clipboardCapture).toBe(true);
  });

  it('rejects an invalid position patch', async () => {
    const store = new SettingsStore(dir);
    await store.load();
    await expect(store.update({ clipboardPosition: 'nowhere' as never })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await store.update({ clipboardPosition: 'cursor' });
    expect(store.get().clipboardPosition).toBe('cursor');
  });
});
