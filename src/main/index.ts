import { app, BrowserWindow, clipboard, nativeTheme } from 'electron';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import { NO_PROJECT_ID } from '../shared/types';
import { MAX_MESSAGE_CHARS } from '../shared/validation';
import { isCaptureRun, prepareCapture, runCapture } from './capture';
import { createClipboardController } from './clipboardController';
import { createClipboardPill } from './clipboardPill';
import { createClipboardWatcher, SKIP_FORMATS } from './clipboardWatcher';
import { runCli } from './exec';
import { fetchEnvironment } from './health';
import { registerIpc } from './ipc';
import { migrateLegacySettings } from './legacy';
import { resolveT3Home, scratchDir } from './paths';
import { SettingsStore } from './settings';
import { createShortcutManager } from './shortcuts';
import { createT3Client } from './t3cli';
import { createTray } from './tray';
import { createPopupWindow } from './window';

const smoke = process.argv.includes('--smoke-test');

// Must run before the single-instance lock so tests can use an isolated profile.
if (process.env.T3_BAR_USER_DATA) app.setPath('userData', process.env.T3_BAR_USER_DATA);
prepareCapture();

function devServerUrl(): string | undefined {
  const v = process.env.VITE_DEV_SERVER_URL;
  if (!v || app.isPackaged) return undefined;
  try {
    const u = new URL(v);
    const ok = u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
    return ok ? u.href : undefined;
  } catch {
    return undefined;
  }
}

// Electron's clipboard is async and has no format list: probe the formats we care about one by one.
async function pasteboardFormats(): Promise<string[]> {
  const skip = await Promise.all(
    SKIP_FORMATS.map(async (f) => ((await clipboard.has(`electron application/osclipboard;format="${f}"`)) ? f : null)),
  );
  const found = skip.filter((f): f is (typeof SKIP_FORMATS)[number] => f !== null);
  if (found.length === 0 && (await clipboard.has('text/plain'))) return ['text/plain'];
  return found;
}

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.dock?.hide();
  nativeTheme.themeSource = 'dark';
  app.on('window-all-closed', () => undefined); // menu-bar app keeps running

  await app.whenReady();

  const rendererHtmlPath = path.join(__dirname, '../renderer/index.html');
  const pillHtmlPath = path.join(__dirname, '../renderer/pill.html');
  const preloadPath = path.join(__dirname, '../preload/index.cjs');
  const pillPreloadPath = path.join(__dirname, '../preload/pill.cjs');

  const userData = app.getPath('userData');
  if (isCaptureRun) {
    await runCapture({ store: new SettingsStore(userData), preloadPath, pillPreloadPath, rendererHtmlPath, pillHtmlPath });
    return;
  }
  await migrateLegacySettings({ userDataDir: userData, appDataDir: app.getPath('appData') }).catch(() => false);
  const store = new SettingsStore(userData);
  await store.load();

  const client = createT3Client({
    getCliPath: () => store.get().cliPath,
    run: runCli,
    cwd: os.homedir(),
  });

  const dev = devServerUrl();
  const popup = createPopupWindow({
    preloadPath,
    rendererHtmlPath,
    devServerUrl: dev,
    pinned: store.get().pinned,
    devTools: Boolean(dev) || smoke,
    onShown: () => pill.hide(),
  });
  // Re-hide Dock icon after setVisibleOnAllWorkspaces (macOS Electron quirk).
  app.dock?.hide();

  const pill = createClipboardPill({
    preloadPath: pillPreloadPath,
    pillHtmlPath,
    devServerUrl: dev,
    devTools: Boolean(dev) || smoke,
  });

  const shortcuts = createShortcutManager(() => popup.toggle(tray.tray.getBounds(), { fromShortcut: true }));

  const scratchPath = scratchDir(resolveT3Home(process.env, os.homedir()));

  const clipboardController = createClipboardController({
    watcherFactory: ({ onCapture, onStatus }) =>
      createClipboardWatcher({
        adapter: { formats: pasteboardFormats, readText: () => clipboard.readText() },
        isLauncherFocused: () => popup.isVisible() && popup.window.isFocused(),
        onCapture,
        onStatus,
        maxChars: MAX_MESSAGE_CHARS,
      }),
    pill,
    getSettings: () => store.get(),
    persist: (patch) => store.update(patch),
    showLauncher: async () => {
      popup.showPopup(tray.tray.getBounds());
      await popup.loaded.catch(() => undefined);
    },
    sendPrefill: (text) => {
      if (!popup.window.webContents.isDestroyed()) popup.window.webContents.send(IPC.clipboardPrefill, { text });
    },
    emitState: () => {
      if (appController && !popup.window.webContents.isDestroyed()) {
        popup.window.webContents.send(IPC.settingsChanged, appController.getState());
      }
    },
    randomId: () => `c-${randomBytes(8).toString('hex')}`,
  });

  const appController = registerIpc({
    store,
    client,
    clipboard: { writeText: (text) => clipboard.writeText(text) },
    clipboardController,
    popup,
    shortcuts,
    devServerOrigin: dev ? new URL(dev).origin : undefined,
    rendererHtmlPath,
    pillHtmlPath,
    pillWebContents: () => pill.webContents(),
    pillReady: () => pill.markReady(),
    checkHealth: () => fetchEnvironment(store.get().serverUrl),
    appVersion: app.getVersion(),
    homeDir: os.homedir(),
    scratchPath,
    onSettings: (s) => {
      tray.setPinned(s.pinned);
      void clipboardController.sync(s);
    },
    quit: () => app.quit(),
  });

  const openT3 = async () => {
    const id = store.get().activeProjectId;
    const target = id === NO_PROJECT_ID ? scratchPath : store.get().projects.find((p) => p.id === id)?.path;
    if (!target) return popup.showPopup(tray.tray.getBounds());
    try {
      await client.openApp(target);
    } catch {
      popup.showPopup(tray.tray.getBounds());
    }
  };

  const tray = createTray({
    popup,
    initialPinned: store.get().pinned,
    onTogglePin: (pinned) => void appController.applyPatch({ pinned }),
    onOpenT3: () => void openT3(),
    onQuit: () => app.quit(),
    loginItem: app.isPackaged
      ? {
          get: () => app.getLoginItemSettings().openAtLogin,
          set: (openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
        }
      : undefined,
  });

  app.on('second-instance', () => popup.showPopup(tray.tray.getBounds()));
  app.on('activate', () => popup.showPopup(tray.tray.getBounds()));
  app.on('before-quit', () => {
    popup.allowDestroy();
    clipboardController.destroy();
    pill.destroy();
  });
  app.on('will-quit', () => shortcuts.unregister());

  if (smoke) {
    await runSmoke(popup, pill, store.get().serverUrl, tray.imageSize);
    return;
  }

  shortcuts.register(store.get().shortcut);
  void clipboardController.sync(store.get());

  // Show the launcher right away so it is visible on first run, but stay quiet when macOS starts it at login.
  await popup.loaded.catch(() => undefined);
  if (!app.getLoginItemSettings().wasOpenedAtLogin) popup.showPopup(tray.tray.getBounds());
  console.log(`T3 Bar running in the menu bar (toggle with ${store.get().shortcut}).`);
}

async function runSmoke(
  popup: ReturnType<typeof createPopupWindow>,
  pill: ReturnType<typeof createClipboardPill>,
  serverUrl: string,
  trayIconSize: { width: number; height: number },
) {
  const fail = (reason: string) => {
    console.log(`SMOKE_FAIL ${reason}`);
    app.exit(1);
  };
  if (trayIconSize.width <= 0 || trayIconSize.height <= 0) {
    return fail(`empty tray icon (${trayIconSize.width}x${trayIconSize.height})`);
  }
  popup.window.webContents.on('render-process-gone', (_e, d) => fail(`render-process-gone ${d.reason}`));
  try {
    await popup.loaded;
  } catch (e) {
    return fail(`load failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const deadline = Date.now() + 10_000;
  const probe = `(() => ({ api: typeof window.t3bar?.getState === 'function', ready: !!document.querySelector('[data-app-ready]'), input: document.querySelector('[data-launcher-input]') !== null }))()`;
  let ready = false;
  let inputMounted = false;
  while (Date.now() < deadline) {
    const r = (await popup.window.webContents.executeJavaScript(probe).catch(() => null)) as
      | { api: boolean; ready: boolean; input: boolean }
      | null;
    if (r?.api && r.ready && r.input) { ready = true; inputMounted = true; break; }
    await new Promise((res) => setTimeout(res, 100));
  }
  if (!ready) return fail('renderer did not become ready (with launcher input) within 10s');
  const fns = (await popup.window.webContents
    .executeJavaScript(
      `({ copyText: typeof window.t3bar.copyText, enableClipboard: typeof window.t3bar.enableClipboard, onClipboardPrefill: typeof window.t3bar.onClipboardPrefill, addEnvironment: typeof window.t3bar.addEnvironment, legacy: typeof window.t3widget })`,
    )
    .catch(() => null)) as Record<string, string> | null;
  if (fns?.copyText !== 'function') return fail('window.t3bar.copyText is missing');
  if (fns.enableClipboard !== 'function') return fail('window.t3bar.enableClipboard is missing');
  if (fns.onClipboardPrefill !== 'function') return fail('window.t3bar.onClipboardPrefill is missing');
  if (fns.addEnvironment !== 'undefined') return fail('window.t3bar.addEnvironment should not exist');
  if (fns.legacy !== 'undefined') return fail('window.t3widget should not exist');
  const state = (await popup.window.webContents
    .executeJavaScript('window.t3bar.getState()')
    .catch(() => null)) as {
    ok?: boolean;
    data?: {
      appVersion?: unknown;
      clipboard?: { state?: string };
      settings?: { activeProjectId?: string; clipboardCapture?: boolean; environments?: unknown };
    };
  } | null;
  if (!state?.ok) return fail('getState IPC failed');
  const settings = state.data?.settings;
  const activeProjectId = settings?.activeProjectId;
  if (activeProjectId !== 'no-project') return fail(`unexpected activeProjectId ${String(activeProjectId)}`);
  if (settings && 'environments' in settings) return fail('legacy environments key survived');
  if (settings?.clipboardCapture !== false) return fail('clipboard capture should be off by default');
  if (state.data?.clipboard?.state !== 'off') return fail(`unexpected clipboard state ${String(state.data?.clipboard?.state)}`);
  if (typeof state.data?.appVersion !== 'string') return fail('appVersion missing');
  if (pill.webContents() !== null) return fail('pill window should not be created while capture is off');
  if (BrowserWindow.getAllWindows().length !== 1) return fail('unexpected extra window');
  const health = await fetchEnvironment(serverUrl).catch(() => null); // info only
  console.log(`SMOKE_OK ${JSON.stringify({ ipc: true, ready: true, launcherInput: inputMounted, activeProjectId, trayIconSize, serverReachable: health?.reachable ?? false })}`);
  app.exit(0);
}

main().catch((e) => {
  console.error(e);
  if (smoke) console.log(`SMOKE_FAIL ${e instanceof Error ? e.message : String(e)}`);
  app.exit(1);
});
