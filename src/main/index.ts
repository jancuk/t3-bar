import { app, clipboard, nativeTheme, safeStorage } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { NO_PROJECT_ID } from '../shared/types';
import { createEnvironmentManager } from './environments';
import { fetchEnvironment } from './health';
import { runCli } from './exec';
import { registerIpc } from './ipc';
import { resolveT3Home, scratchDir } from './paths';
import { SecretStore } from './secrets';
import { SettingsStore } from './settings';
import { createShortcutManager } from './shortcuts';
import { createT3Client } from './t3cli';
import { createTray } from './tray';
import { createPopupWindow } from './window';

const smoke = process.argv.includes('--smoke-test');

// Must run before the single-instance lock so tests can use an isolated profile.
if (process.env.T3_WIDGET_USER_DATA) app.setPath('userData', process.env.T3_WIDGET_USER_DATA);

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

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.dock?.hide();
  nativeTheme.themeSource = 'dark';
  app.on('window-all-closed', () => undefined); // menu-bar app keeps running

  await app.whenReady();

  const store = new SettingsStore(app.getPath('userData'));
  await store.load();

  const secrets = new SecretStore(app.getPath('userData'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (cipher) => safeStorage.decryptString(cipher),
  });
  const envs = createEnvironmentManager({ store, secrets });

  const client = createT3Client({
    getCliPath: () => store.get().cliPath,
    run: runCli,
    cwd: os.homedir(),
  });

  const dev = devServerUrl();
  const popup = createPopupWindow({
    preloadPath: path.join(__dirname, '../preload/index.cjs'),
    rendererHtmlPath: path.join(__dirname, '../renderer/index.html'),
    devServerUrl: dev,
    pinned: store.get().pinned,
    devTools: Boolean(dev) || smoke,
  });
  // Re-hide Dock icon after setVisibleOnAllWorkspaces (macOS Electron quirk).
  app.dock?.hide();

  const shortcuts = createShortcutManager(() => popup.toggle(tray.tray.getBounds(), { fromShortcut: true }));

  const scratchPath = scratchDir(resolveT3Home(process.env, os.homedir()));

  const controller = registerIpc({
    store,
    client,
    envs,
    secrets,
    clipboard: { writeText: (text) => clipboard.writeText(text) },
    popup,
    shortcuts,
    devServerOrigin: dev ? new URL(dev).origin : undefined,
    rendererHtmlPath: path.join(__dirname, '../renderer/index.html'),
    scratchPath,
    onSettings: (s) => tray.setPinned(s.pinned),
    quit: () => app.quit(),
  });

  const openT3 = async () => {
    if (store.get().activeEnvironmentId !== 'local') return popup.showPopup(tray.tray.getBounds());
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
    onTogglePin: (pinned) => void controller.applyPatch({ pinned }),
    onOpenT3: () => void openT3(),
    onQuit: () => app.quit(),
  });

  app.on('second-instance', () => popup.showPopup(tray.tray.getBounds()));
  app.on('activate', () => popup.showPopup(tray.tray.getBounds()));
  app.on('before-quit', () => popup.allowDestroy());
  app.on('will-quit', () => shortcuts.unregister());

  if (smoke) {
    await runSmoke(popup, store.get().serverUrl, tray.imageSize);
    return;
  }

  shortcuts.register(store.get().shortcut);

  // Show the launcher right away so it is visible on first run.
  await popup.loaded.catch(() => undefined);
  popup.showPopup(tray.tray.getBounds());
  console.log(`T3 Code Launcher running in the menu bar (toggle with ${store.get().shortcut}).`);
}

async function runSmoke(
  popup: ReturnType<typeof createPopupWindow>,
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
  const probe = `(() => ({ api: typeof window.t3widget?.getState === 'function', ready: !!document.querySelector('[data-app-ready]'), input: document.querySelector('[data-launcher-input]') !== null }))()`;
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
    .executeJavaScript(`({ copyText: typeof window.t3widget.copyText, addEnvironment: typeof window.t3widget.addEnvironment })`)
    .catch(() => null)) as { copyText?: string; addEnvironment?: string } | null;
  if (fns?.copyText !== 'function') return fail('window.t3widget.copyText is missing');
  if (fns?.addEnvironment !== 'function') return fail('window.t3widget.addEnvironment is missing');
  const state = (await popup.window.webContents
    .executeJavaScript('window.t3widget.getState()')
    .catch(() => null)) as {
    ok?: boolean;
    data?: { settings?: { activeProjectId?: string; activeEnvironmentId?: string; environments?: unknown[] } };
  } | null;
  if (!state?.ok) return fail('getState IPC failed');
  const activeProjectId = state.data?.settings?.activeProjectId;
  if (activeProjectId !== 'no-project') return fail(`unexpected activeProjectId ${String(activeProjectId)}`);
  const settings = state.data?.settings;
  if (settings?.activeEnvironmentId !== 'local') return fail(`unexpected activeEnvironmentId ${String(settings?.activeEnvironmentId)}`);
  if (!Array.isArray(settings.environments) || settings.environments.length !== 0) return fail('expected no saved machines');
  const health = await fetchEnvironment(serverUrl).catch(() => null); // info only
  console.log(`SMOKE_OK ${JSON.stringify({ ipc: true, ready: true, launcherInput: inputMounted, activeProjectId, trayIconSize, serverReachable: health?.reachable ?? false })}`);
  app.exit(0);
}

main().catch((e) => {
  console.error(e);
  if (smoke) console.log(`SMOKE_FAIL ${e instanceof Error ? e.message : String(e)}`);
  app.exit(1);
});
