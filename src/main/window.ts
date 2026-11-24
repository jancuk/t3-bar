import { app, BrowserWindow, screen, session } from 'electron';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import { computeLauncherPosition, type Rect } from './positioning';

export const WINDOW_SIZE = { width: 640, height: 460 } as const;
const TRAY_RACE_MS = 250;

export interface PopupWindow {
  window: BrowserWindow;
  /** Resolves when the renderer finished loading. */
  loaded: Promise<void>;
  rendererUrl: string;
  showPopup(trayBounds?: Rect, opts?: { fromShortcut?: boolean }): void;
  hidePopup(opts?: { restoreFocus?: boolean }): void;
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
    vibrancy: 'under-window',
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
      api.hidePopup({ restoreFocus: true });
    }
  });

  win.on('blur', () => {
    if (pinned || blurSuppressed > 0 || wc.isDevToolsOpened()) return;
    if (win.isVisible()) {
      win.hide();
      lastBlurHideAt = Date.now();
    }
  });

  const place = () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const pos = computeLauncherPosition({ workArea: display.workArea, windowSize: WINDOW_SIZE });
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
    showPopup() {
      if (win.isDestroyed()) return;
      place();
      win.setAlwaysOnTop(true, 'floating');
      if (process.platform === 'darwin') {
        app.show();
        app.focus({ steal: true });
      }
      win.show();
      win.moveTop();
      win.focus();
      if (!wc.isDestroyed()) wc.send(IPC.windowShown);
    },
    hidePopup(hideOpts) {
      if (win.isDestroyed() || !win.isVisible()) return;
      win.hide();
      // Hiding the whole app hands focus back to the previously active app.
      if (process.platform === 'darwin' && hideOpts?.restoreFocus && blurSuppressed === 0) app.hide();
    },
    toggle(trayBounds, toggleOpts) {
      if (win.isDestroyed()) return;
      if (win.isVisible()) {
        api.hidePopup({ restoreFocus: Boolean(toggleOpts?.fromShortcut) });
        return;
      }
      // The click that blurred the window already hid it: do not re-show.
      if (!toggleOpts?.fromShortcut && Date.now() - lastBlurHideAt < TRAY_RACE_MS) return;
      api.showPopup(trayBounds, toggleOpts);
    },
    isVisible: () => !win.isDestroyed() && win.isVisible(),
    setPinned(p) {
      pinned = p;
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
  return api;
}
