import { app, BrowserWindow, screen, type WebContents } from 'electron';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import type { ClipboardPosition, PillPayload } from '../shared/types';
import type { ControllerPill } from './clipboardController';
import { computePillPosition } from './positioning';

export const PILL_SIZE = { width: 344, height: 44 } as const;

export interface ClipboardPillOptions {
  preloadPath: string;
  pillHtmlPath: string;
  devServerUrl?: string;
  devTools: boolean;
}

export interface ClipboardPill extends ControllerPill {
  /** Null until the pill window has been created. */
  webContents(): WebContents | null;
  /** Delivers the payload that was shown before the page subscribed. */
  markReady(): void;
  destroy(): void;
}

export function createClipboardPill(opts: ClipboardPillOptions): ClipboardPill {
  let win: BrowserWindow | null = null;
  let loaded: Promise<void> = Promise.resolve();
  let seq = 0;
  let ready = false;
  let queued: PillPayload | null = null;

  const pillUrl = opts.devServerUrl ? new URL('pill.html', opts.devServerUrl).href : pathToFileURL(opts.pillHtmlPath).href;

  const ensure = (): BrowserWindow => {
    if (win && !win.isDestroyed()) return win;
    const w = new BrowserWindow({
      ...PILL_SIZE,
      show: false,
      frame: false,
      transparent: true,
      focusable: false,
      resizable: false,
      movable: false,
      hasShadow: false,
      skipTaskbar: true,
      acceptFirstMouse: true,
      type: 'panel',
      webPreferences: {
        preload: opts.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        devTools: opts.devTools,
      },
    });
    w.setAlwaysOnTop(true, 'floating');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    app.dock?.hide();

    const wc = w.webContents;
    const origin = new URL(pillUrl).origin;
    wc.on('will-navigate', (e, url) => {
      if (new URL(url).origin !== origin) e.preventDefault();
      else if (!opts.devServerUrl && url !== pillUrl) e.preventDefault();
    });
    wc.on('will-attach-webview', (e) => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.on('closed', () => {
      if (win === w) win = null;
    });
    ready = false;
    queued = null;
    w.webContents.on('did-start-loading', () => {
      ready = false;
    });
    loaded = w.loadURL(pillUrl).then(() => undefined);
    loaded.catch((err) => console.error('[t3-bar] failed to load pill:', err));
    win = w;
    return w;
  };

  return {
    show(payload: PillPayload, position: ClipboardPosition) {
      const w = ensure();
      const mine = ++seq;
      void loaded.then(() => {
        if (w.isDestroyed() || mine !== seq) return;
        const cursor = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursor);
        const pos = computePillPosition({ position, cursor, workArea: display.workArea, pillSize: PILL_SIZE });
        w.setBounds({ ...pos, ...PILL_SIZE }, false);
        w.showInactive();
        if (ready) w.webContents.send(IPC.clipboardShow, payload);
        else queued = payload;
      }, () => undefined);
    },
    markReady() {
      ready = true;
      const next = queued;
      queued = null;
      if (next && win && !win.isDestroyed() && win.isVisible()) win.webContents.send(IPC.clipboardShow, next);
    },
    hide() {
      seq++;
      queued = null;
      if (win && !win.isDestroyed() && win.isVisible()) win.hide();
    },
    webContents: () => (win && !win.isDestroyed() ? win.webContents : null),
    destroy() {
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
    },
  };
}
