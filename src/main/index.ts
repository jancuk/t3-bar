import { app, nativeTheme } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { fetchEnvironment } from './health';
import { runCli } from './exec';
import { registerIpc } from './ipc';
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

function initialProjectCandidates(): string[] {
  const out: string[] = [];
  if (process.env.T3_WIDGET_INITIAL_PROJECT) out.push(process.env.T3_WIDGET_INITIAL_PROJECT);
  const arg = process.argv.find((a) => a.startsWith('--initial-project='));
  if (arg) out.push(arg.slice('--initial-project='.length));
  out.push(process.cwd());
  return out.filter((p) => path.isAbsolute(p) && p !== '/');
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

  const controller = registerIpc({
    store,
    client,
    popup,
    shortcuts,
    devServerOrigin: dev ? new URL(dev).origin : undefined,
    rendererHtmlPath: path.join(__dirname, '../renderer/index.html'),
    onSettings: (s) => tray.setPinned(s.pinned),
    quit: () => app.quit(),
  });

  const openT3 = async () => {
    const active = store.get().projects.find((p) => p.id === store.get().activeProjectId);
    if (!active) return popup.showPopup(tray.tray.getBounds());
    try {
      await client.openApp(active.path);
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

  // Show the popover immediately on launch so the widget is visible right away.
  await popup.loaded.catch(() => undefined);
  popup.showPopup(tray.tray.getBounds());
  console.log(`T3 Widget running in the menu bar (toggle with ${store.get().shortcut}).`);

  if (store.get().projects.length === 0) {
    for (const candidate of initialProjectCandidates()) {
      try {
        await controller.addProject(candidate);
        break;
      } catch {
        // silent: not a T3 project
      }
    }
  }
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
  const probe = `(() => ({ api: typeof window.t3widget?.getState === 'function', ready: !!document.querySelector('[data-app-ready]') }))()`;
  let ready = false;
  while (Date.now() < deadline) {
    const r = (await popup.window.webContents.executeJavaScript(probe).catch(() => null)) as { api: boolean; ready: boolean } | null;
    if (r?.api && r.ready) { ready = true; break; }
    await new Promise((res) => setTimeout(res, 100));
  }
  if (!ready) return fail('renderer did not become ready within 10s');
  const state = (await popup.window.webContents
    .executeJavaScript('window.t3widget.getState()')
    .catch(() => null)) as { ok?: boolean } | null;
  if (!state?.ok) return fail('getState IPC failed');
  const health = await fetchEnvironment(serverUrl).catch(() => null); // info only
  console.log(`SMOKE_OK ${JSON.stringify({ ipc: true, ready: true, trayIconSize, serverReachable: health?.reachable ?? false })}`);
  app.exit(0);
}

main().catch((e) => {
  console.error(e);
  if (smoke) console.log(`SMOKE_FAIL ${e instanceof Error ? e.message : String(e)}`);
  app.exit(1);
});
