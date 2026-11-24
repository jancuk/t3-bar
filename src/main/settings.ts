import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NO_PROJECT_ID, type SavedProject, type Settings, type SettingsPatch } from '../shared/types';
import { validatePreviewCount, validateServerUrl } from '../shared/validation';
import { AppError } from './errors';

export const MAX_PROJECTS = 200;

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  version: 1,
  cliPath: '~/.t3/bin/t3',
  serverUrl: 'http://127.0.0.1:3773',
  projects: [],
  activeProjectId: NO_PROJECT_ID,
  pinned: false,
  previewCount: 8,
  shortcut: 'Control+Option+T',
  showSettled: false,
  autoHideOnSend: true,
}) as Settings;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanCliPath(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.includes('\0')) return null;
  if (!trimmed.startsWith('/') && !trimmed.startsWith('~/')) return null;
  if (path.basename(trimmed) !== 't3') return null;
  return trimmed;
}

function cleanProject(v: unknown): SavedProject | null {
  if (!isObj(v)) return null;
  const { id, name, path: p } = v;
  if (typeof id !== 'string' || id === NO_PROJECT_ID || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return null;
  if (typeof p !== 'string' || !p.startsWith('/') || p.includes('\0')) return null;
  const n = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : path.basename(p) || p;
  return { id, name: n, path: p };
}

function cleanShortcut(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= 60 && /^[A-Za-z0-9+_ ]+$/.test(s) ? s : null;
}

/** Validates each field independently; invalid ones fall back to `base`. */
export function sanitizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const r = isObj(raw) ? raw : {};
  const projects: SavedProject[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.projects)) {
    for (const p of r.projects) {
      if (projects.length >= MAX_PROJECTS) break;
      const c = cleanProject(p);
      if (c && !seen.has(c.id)) { seen.add(c.id); projects.push(c); }
    }
  }
  const active =
    typeof r.activeProjectId === 'string' && (r.activeProjectId === NO_PROJECT_ID || seen.has(r.activeProjectId))
      ? r.activeProjectId
      : NO_PROJECT_ID;

  const pc = validatePreviewCount(r.previewCount);
  const su = validateServerUrl(r.serverUrl);
  return {
    version: 1,
    cliPath: cleanCliPath(r.cliPath) ?? base.cliPath,
    serverUrl: su.ok ? su.value : base.serverUrl,
    projects,
    activeProjectId: active,
    pinned: typeof r.pinned === 'boolean' ? r.pinned : base.pinned,
    previewCount: pc.ok ? pc.value : base.previewCount,
    shortcut: cleanShortcut(r.shortcut) ?? base.shortcut,
    showSettled: typeof r.showSettled === 'boolean' ? r.showSettled : base.showSettled,
    autoHideOnSend: typeof r.autoHideOnSend === 'boolean' ? r.autoHideOnSend : base.autoHideOnSend,
  };
}

function freeze(s: Settings): Settings {
  return Object.freeze({
    ...s,
    projects: Object.freeze(s.projects.map((p) => Object.freeze({ ...p }))) as SavedProject[],
  }) as Settings;
}

export class SettingsStore {
  private current: Settings = freeze(DEFAULT_SETTINGS);
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'settings.json');
  }

  get(): Settings {
    return this.current;
  }

  async load(): Promise<Settings> {
    let text: string | null = null;
    try {
      text = await fs.readFile(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (text === null) {
      this.current = freeze(DEFAULT_SETTINGS);
      return this.current;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      await fs.rename(this.file, `${this.file}.bak-${Date.now()}`).catch(() => undefined);
      this.current = freeze(DEFAULT_SETTINGS);
      return this.current;
    }
    this.current = freeze(sanitizeSettings(parsed));
    return this.current;
  }

  update(patch: SettingsPatch): Promise<Settings> {
    const run = this.queue.then(() => this.applyPatch(patch));
    this.queue = run.catch(() => undefined);
    return run;
  }

  mutate(fn: (current: Settings) => SettingsPatch): Promise<Settings> {
    const run = this.queue.then(() => this.applyPatch(fn(this.current)));
    this.queue = run.catch(() => undefined);
    return run;
  }

  validate(patch: SettingsPatch): Settings {
    return this.buildNext(patch, this.current);
  }

  private buildNext(patch: SettingsPatch, cur: Settings): Settings {
    const next: Record<string, unknown> = { ...cur };
    const strict = (k: keyof SettingsPatch, ok: boolean, msg: string) => {
      if (!ok) throw new AppError('VALIDATION_ERROR', msg);
      next[k] = patch[k];
    };
    for (const key of Object.keys(patch) as (keyof SettingsPatch)[]) {
      const v = patch[key];
      if (v === undefined) continue;
      switch (key) {
        case 'cliPath': {
          const cleaned = cleanCliPath(v);
          if (!cleaned) {
            throw new AppError('VALIDATION_ERROR', 'CLI path must be an absolute or ~/ path ending in "t3"');
          }
          next.cliPath = cleaned;
          break;
        }
        case 'serverUrl': {
          const r = validateServerUrl(v);
          if (!r.ok) throw new AppError('VALIDATION_ERROR', r.message);
          next.serverUrl = r.value;
          break;
        }
        case 'previewCount': {
          const r = validatePreviewCount(v);
          if (!r.ok) throw new AppError('VALIDATION_ERROR', r.message);
          next.previewCount = r.value;
          break;
        }
        case 'shortcut':
          strict(key, cleanShortcut(v) !== null, 'Invalid shortcut');
          next.shortcut = cleanShortcut(v);
          break;
        case 'pinned':
        case 'showSettled':
        case 'autoHideOnSend':
          strict(key, typeof v === 'boolean', `Invalid ${key}`);
          break;
        case 'projects':
          if (!Array.isArray(v) || v.some((p) => cleanProject(p) === null)) {
            throw new AppError('VALIDATION_ERROR', 'Invalid projects');
          }
          if (v.length > MAX_PROJECTS) {
            throw new AppError('VALIDATION_ERROR', `Project limit reached (${MAX_PROJECTS} max)`);
          }
          next.projects = v;
          break;
        case 'activeProjectId': {
          const list = Array.isArray(patch.projects) ? patch.projects : cur.projects;
          if (typeof v !== 'string' || (v !== NO_PROJECT_ID && !list.some((p) => p.id === v))) {
            throw new AppError('VALIDATION_ERROR', 'Unknown project');
          }
          next.activeProjectId = v;
          break;
        }
        default:
          break;
      }
    }
    return freeze(sanitizeSettings(next, cur));
  }

  private async applyPatch(patch: SettingsPatch): Promise<Settings> {
    const clean = this.buildNext(patch, this.current);
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(clean, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.file);
    this.current = clean;
    return clean;
  }
}
