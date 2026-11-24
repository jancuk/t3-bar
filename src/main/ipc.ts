import { dialog, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import type { AppState, Health, Result, SavedProject, Settings, SettingsPatch, ThreadDetail, ThreadSummary } from '../shared/types';
import {
  validateExternalUrl,
  validateMessageText,
  validatePreviewCount,
  validateProjectId,
  validateProjectTarget,
  validateThreadId,
  validateTitle,
  type Validated,
} from '../shared/validation';
import { AppError, errorToResult } from './errors';
import { fetchEnvironment } from './health';
import type { SettingsStore } from './settings';
import type { ShortcutManager } from './shortcuts';
import type { T3Client } from './t3cli';
import type { PopupWindow } from './window';

export interface IpcDeps {
  store: SettingsStore;
  client: T3Client;
  popup: PopupWindow;
  shortcuts: ShortcutManager;
  devServerOrigin?: string;
  rendererHtmlPath: string;
  onSettings(settings: Settings): void;
  quit(): void;
}

export interface AppController {
  getState(): AppState;
  applyPatch(patch: SettingsPatch): Promise<AppState>;
  addProject(p: string, name?: string): Promise<SavedProject>;
}

const unwrap = <T>(v: Validated<T>): T => {
  if (!v.ok) throw new AppError('VALIDATION_ERROR', v.message);
  return v.value;
};

export function projectIdFor(p: string): string {
  return `p-${createHash('sha1').update(p).digest('hex').slice(0, 10)}`;
}

export function registerIpc(deps: IpcDeps): AppController {
  const { store, client, popup, shortcuts } = deps;
  const rendererFileUrl = pathToFileURL(deps.rendererHtmlPath).href;
  const linkCache = new Set<string>();
  const inFlight = new Set<string>();
  const inFlightReads = new Map<string, Promise<unknown>>();

  const coalesceRead = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const existing = inFlightReads.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fn().finally(() => {
      inFlightReads.delete(key);
    });
    inFlightReads.set(key, promise);
    return promise;
  };

  const getState = (): AppState => ({
    settings: store.get(),
    shortcutOk: shortcuts.status().ok,
    platform: process.platform,
  });

  const cacheLink = (link?: string) => {
    if (!link) return;
    const v = validateExternalUrl(link);
    if (v.ok) {
      linkCache.add(v.value);
      if (linkCache.size > 2000) linkCache.delete(linkCache.values().next().value as string);
    }
  };

  const isTrusted = (sender: IpcMainInvokeEvent['sender'] | IpcMainEvent['sender'], url: string | undefined): boolean => {
    if (sender !== popup.window.webContents || !url) return false;
    try {
      const u = new URL(url);
      if (deps.devServerOrigin) return u.origin === deps.devServerOrigin;
      return u.protocol === 'file:' && u.origin + u.pathname === new URL(rendererFileUrl).origin + new URL(rendererFileUrl).pathname;
    } catch {
      return false;
    }
  };

  const resolveTarget = (projectId: unknown): string => {
    const id = unwrap(validateProjectId(projectId));
    const p = store.get().projects.find((x) => x.id === id);
    if (!p) throw new AppError('PROJECT_NOT_FOUND', 'Project is not saved in the widget');
    return unwrap(validateProjectTarget(p.path));
  };

  const emitSettings = (): AppState => {
    const state = getState();
    deps.onSettings(state.settings);
    if (!popup.window.webContents.isDestroyed()) popup.window.webContents.send(IPC.settingsChanged, state);
    return state;
  };

  const applyPatch = async (patch: SettingsPatch): Promise<AppState> => {
    const prev = store.get();
    if (patch.shortcut !== undefined && patch.shortcut.trim() !== prev.shortcut) {
      const r = shortcuts.register(patch.shortcut.trim());
      if (!r.ok) {
        throw new AppError('VALIDATION_ERROR', 'Shortcut unavailable. Another app may already use it.');
      }
    }
    const next = await store.update(patch);
    if (next.pinned !== prev.pinned) popup.setPinned(next.pinned);
    return emitSettings();
  };

  const addProject = async (rawPath: string, name?: string): Promise<SavedProject> => {
    const target = unwrap(validateProjectTarget(rawPath));
    if (!target.startsWith('/')) throw new AppError('VALIDATION_ERROR', 'Project must be a folder path');
    const st = await fs.stat(target).catch(() => null);
    if (!st?.isDirectory()) throw new AppError('VALIDATION_ERROR', 'That folder does not exist');
    const existing = store.get().projects.find((p) => p.path === target);
    if (existing) return existing;
    try {
      await client.listThreads(target);
    } catch (e) {
      if (e instanceof AppError && e.code === 'PROJECT_NOT_FOUND') {
        throw new AppError(
          'PROJECT_NOT_FOUND',
          'That folder is not a T3 Code project. Open it in T3 Code first (or run "t3 project add").',
        );
      }
      throw e;
    }
    const project: SavedProject = {
      id: projectIdFor(target),
      name: (name?.trim() || path.basename(target) || target).slice(0, 100),
      path: target,
    };
    await store.mutate((cur) => {
      if (cur.projects.some((p) => p.path === target)) return {};
      return {
        projects: [...cur.projects, project],
        activeProjectId: cur.activeProjectId ?? project.id,
      };
    });
    emitSettings();
    return project;
  };

  // `invoke` handler wrapper: verifies the sender and converts throws to Results.
  const handle = <T>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T) => {
    ipcMain.handle(channel, async (e, ...args): Promise<Result<T>> => {
      if (!isTrusted(e.sender, e.senderFrame?.url)) {
        return { ok: false, code: 'VALIDATION_ERROR', message: 'Untrusted sender' };
      }
      try {
        return { ok: true, data: await fn(e, ...args) };
      } catch (err) {
        return errorToResult(err);
      }
    });
  };
  const on = (channel: string, fn: (e: IpcMainEvent) => void) => {
    ipcMain.on(channel, (e) => {
      if (isTrusted(e.sender, e.senderFrame?.url)) fn(e);
    });
  };

  handle(IPC.getState, () => getState());

  handle<Health>(IPC.healthCheck, () => fetchEnvironment(store.get().serverUrl));

  handle<ThreadSummary[]>(IPC.threadsList, async (_e, projectId) => {
    const target = resolveTarget(projectId);
    const threads = await coalesceRead(`list:${target}`, () => client.listThreads(target));
    threads.forEach((t) => cacheLink(t.link));
    return threads;
  });

  handle<ThreadDetail>(IPC.threadsShow, async (_e, projectId, threadId, count) => {
    resolveTarget(projectId); // must be a saved project
    const id = unwrap(validateThreadId(threadId));
    const n = unwrap(validatePreviewCount(count ?? store.get().previewCount));
    const detail = await coalesceRead(`show:${id}:${n}`, () => client.showThread(id, n));
    cacheLink(detail.thread.link);
    return detail;
  });

  handle(IPC.threadsSend, async (_e, projectId, threadId, text) => {
    resolveTarget(projectId);
    const id = unwrap(validateThreadId(threadId));
    const body = unwrap(validateMessageText(text));
    const key = `send:${id}`;
    if (inFlight.has(key)) throw new AppError('IN_FLIGHT', 'A message to this thread is already being sent');
    inFlight.add(key);
    try {
      const r = await client.sendMessage(id, body);
      cacheLink(r.link);
      return r;
    } finally {
      inFlight.delete(key);
    }
  });

  handle(IPC.threadsStart, async (_e, projectId, text, title) => {
    const target = resolveTarget(projectId);
    const body = unwrap(validateMessageText(text));
    const t = unwrap(validateTitle(title));
    const key = `start:${target}`;
    if (inFlight.has(key)) throw new AppError('IN_FLIGHT', 'A thread is already being started');
    inFlight.add(key);
    try {
      const r = await client.startThread(target, body, t);
      cacheLink(r.link);
      return r;
    } finally {
      inFlight.delete(key);
    }
  });

  handle<true>(IPC.threadsOpen, async (_e, link) => {
    const url = unwrap(validateExternalUrl(link));
    if (!linkCache.has(url)) throw new AppError('VALIDATION_ERROR', 'Unknown link');
    await shell.openExternal(url);
    return true as const;
  });

  handle<string | null>(IPC.projectsPickFolder, async () => {
    const r = await popup.withBlurSuppressed(() =>
      dialog.showOpenDialog(popup.window, { properties: ['openDirectory'], title: 'Choose a T3 Code project folder' }),
    );
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });

  handle(IPC.projectsAdd, (_e, p, name) => addProject(String(p), typeof name === 'string' ? name : undefined));

  handle<true>(IPC.projectsRemove, async (_e, id) => {
    const pid = unwrap(validateProjectId(id));
    await store.mutate((cur) => {
      const projects = cur.projects.filter((p) => p.id !== pid);
      const activeProjectId = cur.activeProjectId === pid ? projects[0]?.id ?? null : cur.activeProjectId;
      return { projects, activeProjectId };
    });
    emitSettings();
    return true as const;
  });

  handle<true>(IPC.projectsOpenInApp, async (_e, projectId) => {
    await client.openApp(resolveTarget(projectId));
    return true as const;
  });

  handle(IPC.settingsUpdate, async (_e, patch) => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid settings');
    }
    // Projects are managed only through projects:add / projects:remove.
    const { projects: _p, version: _v, ...allowed } = patch as Record<string, unknown>;
    return applyPatch(allowed as SettingsPatch);
  });

  handle<boolean>(IPC.windowSetPinned, async (_e, pinned) => {
    if (typeof pinned !== 'boolean') throw new AppError('VALIDATION_ERROR', 'Invalid value');
    await applyPatch({ pinned });
    return pinned;
  });

  on(IPC.windowHide, () => popup.hidePopup());
  on(IPC.quit, () => deps.quit());

  return { getState, applyPatch, addProject };
}


