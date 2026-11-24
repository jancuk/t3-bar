import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacySettings } from '../src/main/legacy';

let root: string;
let appData: string;
let userData: string;
const legacyDir = () => path.join(appData, 't3-widget');
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 't3b-legacy-'));
  appData = path.join(root, 'appData');
  userData = path.join(appData, 'T3 Bar');
  mkdirSync(legacyDir(), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (env: NodeJS.ProcessEnv = {}) => migrateLegacySettings({ userDataDir: userData, appDataDir: appData, env });

describe('migrateLegacySettings', () => {
  it('copies and sanitizes the old settings with private permissions', async () => {
    writeFileSync(path.join(legacyDir(), 'settings.json'), JSON.stringify({
      version: 1, pinned: true, previewCount: 12,
      projects: [{ id: 'p1', name: 'A', path: '/a' }], activeProjectId: 'p1',
      environments: [{ id: 'r-0123456789', label: 'Old', origin: 'https://old.example.com' }],
      activeEnvironmentId: 'r-0123456789',
      clipboardCapture: true, clipboardConsent: true,
    }));
    expect(await run()).toBe(true);
    const target = path.join(userData, 'settings.json');
    const out = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect(out).toMatchObject({ version: 1, pinned: true, previewCount: 12, activeProjectId: 'p1', clipboardCapture: false, clipboardConsent: false });
    expect(out).not.toHaveProperty('environments');
    expect(out).not.toHaveProperty('activeEnvironmentId');
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it('never overwrites an existing settings file', async () => {
    writeFileSync(path.join(legacyDir(), 'settings.json'), JSON.stringify({ pinned: true }));
    mkdirSync(userData, { recursive: true });
    writeFileSync(path.join(userData, 'settings.json'), '{"pinned":false}');
    expect(await run()).toBe(false);
    expect(readFileSync(path.join(userData, 'settings.json'), 'utf8')).toBe('{"pinned":false}');
  });

  it('never copies secrets.json and leaves the old directory untouched', async () => {
    writeFileSync(path.join(legacyDir(), 'settings.json'), JSON.stringify({ pinned: true }));
    writeFileSync(path.join(legacyDir(), 'secrets.json'), '{"r-0123456789":"token"}');
    await run();
    expect(existsSync(path.join(userData, 'secrets.json'))).toBe(false);
    expect(readFileSync(path.join(legacyDir(), 'secrets.json'), 'utf8')).toBe('{"r-0123456789":"token"}');
    expect(JSON.parse(readFileSync(path.join(legacyDir(), 'settings.json'), 'utf8'))).toEqual({ pinned: true });
  });

  it('skips corrupt or missing legacy files', async () => {
    expect(await run()).toBe(false);
    writeFileSync(path.join(legacyDir(), 'settings.json'), '{not json');
    expect(await run()).toBe(false);
    expect(existsSync(path.join(userData, 'settings.json'))).toBe(false);
  });

  it('skips when T3_BAR_USER_DATA is set', async () => {
    writeFileSync(path.join(legacyDir(), 'settings.json'), JSON.stringify({ pinned: true }));
    expect(await run({ T3_BAR_USER_DATA: '/tmp/x' })).toBe(false);
    expect(existsSync(path.join(userData, 'settings.json'))).toBe(false);
  });
});
