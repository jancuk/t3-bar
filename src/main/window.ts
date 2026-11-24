import { app, BrowserWindow, screen, session } from 'electron';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import { computePopupPosition, type Rect } from './positioning';

export const WINDOW_SIZE = { width: 400, height: 560 } as const;
const TRAY_RACE_MS = 250;

export interface PopupWindow {
  window: BrowserWindow;
  /** Resolves when the renderer finished loading. */
  loaded: Promise<void>;
  rendererUrl: string;
  showPopup(trayBounds?: Rect, opts?: { fromShortcut?: boolean }): void;
  hidePopup(): void;
  toggle(trayBounds?: Rect, opts?: { fromShortcut?: boolean }): void;
  isVisible(): boolean;
  setPinned(pinned: boolean): void;
  isPinned(): boolean;
  allowDestroy(): void;
  withBlurSuppressed<T>(fn: () => Promise<T>): Promise<T>;
}

export interface CreatePopupOptions {
  preloadPath: string;
  rendererHtmlPath: string;
  devServerUrl?: string;
  pinned: boolean;
  devTools: boolean;
}

export function createPopupWindow(opts: CreatePopupOptions): PopupWindow {
  const win = new BrowserWindow({
    ...WINDOW_SIZE,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'popover',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: opts.devTools,
    },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const rendererUrl = opts.devServerUrl ?? pathToFileURL(opts.rendererHtmlPath).href;
  const rendererOrigin = new URL(rendererUrl).origin;

  // Lockdown: no navigation, no new windows, no permissions, no webviews.
  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== rendererOrigin || (!opts.devServerUrl && url !== rendererUrl)) e.preventDefault();
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  let pinned = opts.pinned;
  let blurSuppressed = 0;
  let lastBlurHideAt = 0;
  let allowClose = false;

  // Prevent Cmd+W or system close from destroying the reusable popover window.
  win.on('close', (e) => {
    if (!allowClose) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('blur', () => {
    if (pinned || blurSuppressed > 0 || wc.isDevToolsOpened()) return;
    if (win.isVisible()) {
      win.hide();
      lastBlurHideAt = Date.now();
    }
  });

  const place = (trayBounds?: Rect, fromShortcut = false) => {
    const cursor = screen.getCursorScreenPoint();
    const cursorDisplay = screen.getDisplayNearestPoint(cursor);
    const hasTray = Boolean(trayBounds && trayBounds.width > 0 && trayBounds.height > 0);
    const trayDisplay = hasTray && trayBounds ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }) : null;
    const useTray = Boolean(hasTray && trayDisplay && (!fromShortcut || trayDisplay.id === cursorDisplay.id));
    const display = useTray && trayDisplay ? trayDisplay : cursorDisplay;
    const pos = computePopupPosition({
      trayBounds: useTray ? trayBounds : undefined,
      cursor,
      windowSize: WINDOW_SIZE,
      workArea: display.workArea,
    });
    win.setBounds({ x: pos.x, y: pos.y, width: WINDOW_SIZE.width, height: WINDOW_SIZE.height }, false);
  };

  const loaded = (opts.devServerUrl ? win.loadURL(opts.devServerUrl) : win.loadFile(opts.rendererHtmlPath)).then(() => undefined);
  loaded.catch((err) => {
    console.error('[t3-widget] failed to load renderer:', err);
  });

  const api: PopupWindow = {
    window: win,
    rendererUrl,
    loaded,
    showPopup(trayBounds, showOpts) {
      if (win.isDestroyed()) return;
      place(trayBounds, showOpts?.fromShortcut);
      if (process.platform === 'darwin') app.focus({ steal: true });
      win.show();
      win.moveTop();
      win.focus();
      if (!wc.isDestroyed()) wc.send(IPC.windowShown);
    },
    hidePopup() {
      if (!win.isDestroyed() && win.isVisible()) win.hide();
    },
    toggle(trayBounds, toggleOpts) {
      if (win.isDestroyed()) return;
      if (win.isVisible()) {
        win.hide();
        return;
      }
      // The click that blurred the window already hid it: do not re-show.
      if (!toggleOpts?.fromShortcut && Date.now() - lastBlurHideAt < TRAY_RACE_MS) return;
      api.showPopup(trayBounds, toggleOpts);
    },
    isVisible: () => !win.isDestroyed() && win.isVisible(),
    setPinned(p) {
      pinned = p;
      if (!win.isDestroyed()) win.setAlwaysOnTop(p, 'floating');
    },
    isPinned: () => pinned,
    allowDestroy() {
      allowClose = true;
    },
    async withBlurSuppressed(fn) {
      blurSuppressed++;
      try {
        return await fn();
      } finally {
        blurSuppressed--;
        if (!win.isDestroyed() && win.isVisible()) win.focus();
      }
    },
  };
  api.setPinned(pinned);
  return api;
}
