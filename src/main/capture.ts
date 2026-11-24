import { app, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import type { ClipboardStatus, PillPayload } from '../shared/types';
import { makePreview } from './clipboardWatcher';
import {
  createFixtureClient,
  DEMO_CLIPBOARD_TEXT,
  DEMO_HOME,
  DEMO_PROJECTS,
  demoHealth,
} from './captureFixtures';
import { registerIpc } from './ipc';
import type { SettingsStore } from './settings';
import { createPopupWindow } from './window';

const STAGE_SIZE = { width: 760, height: 560 } as const;
const PILL_STAGE_SIZE = { width: 424, height: 124 } as const;
const DEADLINE_MS = 30_000;

export const isCaptureRun = process.argv.includes('--capture-screenshots');

/** Must run before `app.whenReady()`. Pins the device scale to 1 so the 2x screenshot clip is the only scaling. */
export function prepareCapture(): void {
  if (!isCaptureRun) return;
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function resolveOutDir(): Promise<string> {
  const arg = process.argv.find((a) => a.startsWith('--capture-out='));
  if (!arg) throw new Error('missing --capture-out=<dir>');
  const dir = await fs.realpath(arg.slice('--capture-out='.length));
  const root = await fs.realpath(process.cwd());
  const stat = await fs.stat(dir);
  if (!stat.isDirectory()) throw new Error('--capture-out must be a directory');
  if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) throw new Error('--capture-out must be inside the project');
  return dir;
}

async function waitFor(wc: Electron.WebContents, expr: string, what: string, timeoutMs = 10_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ok = await wc.executeJavaScript(expr).catch(() => false);
    if (ok) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Captures the page at 2x through the DevTools protocol, independent of the display scale. */
async function savePng(wc: Electron.WebContents, file: string): Promise<void> {
  const { width, height } = (await wc.executeJavaScript('({ width: innerWidth, height: innerHeight })')) as { width: number; height: number };
  const dbg = wc.debugger;
  dbg.attach('1.3');
  try {
    const shot = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width, height, scale: 2 },
    })) as { data: string };
    await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
  } finally {
    dbg.detach();
  }
}

function key(wc: Electron.WebContents, keyCode: string): void {
  wc.sendInputEvent({ type: 'keyDown', keyCode });
  wc.sendInputEvent({ type: 'keyUp', keyCode });
}

export interface CaptureDeps {
  store: SettingsStore;
  preloadPath: string;
  pillPreloadPath: string;
  rendererHtmlPath: string;
  pillHtmlPath: string;
}

export async function runCapture(deps: CaptureDeps): Promise<void> {
  const deadline = setTimeout(() => {
    console.log('CAPTURE_FAIL deadline exceeded');
    app.exit(1);
  }, DEADLINE_MS);
  try {
    if (app.isPackaged) throw new Error('screenshot capture is disabled in packaged builds');
    if (!process.env.T3_BAR_USER_DATA) throw new Error('T3_BAR_USER_DATA must point to a temporary profile');
    const outDir = await resolveOutDir();

    await deps.store.update({ projects: DEMO_PROJECTS, activeProjectId: DEMO_PROJECTS[0]!.id });

    let clip: ClipboardStatus = { state: 'off' };
    const stubController = {
      enable: async () => {
        await deps.store.update({ clipboardConsent: true, clipboardCapture: true });
        clip = { state: 'watching', checkedAt: Date.now() };
        return clip;
      },
      recheck: async () => clip,
      accept: async () => undefined,
      dismiss: () => undefined,
      markOwnWrite: () => undefined,
      status: () => clip,
    };

    const popup = createPopupWindow({
      preloadPath: deps.preloadPath,
      rendererHtmlPath: deps.rendererHtmlPath,
      pinned: false,
      devTools: false,
      size: STAGE_SIZE,
      query: 'capture=1',
    });
    registerIpc({
      store: deps.store,
      client: createFixtureClient(),
      clipboard: { writeText: () => undefined },
      clipboardController: stubController,
      popup,
      shortcuts: { register: () => ({ ok: true, accelerator: null }), unregister: () => undefined, status: () => ({ ok: true, accelerator: 'Control+Option+T' }) },
      rendererHtmlPath: deps.rendererHtmlPath,
      pillHtmlPath: deps.pillHtmlPath,
      pillWebContents: () => null,
      pillReady: () => undefined,
      checkHealth: async () => demoHealth(),
      appVersion: app.getVersion(),
      homeDir: DEMO_HOME,
      scratchPath: `${DEMO_HOME}/.t3/scratch`,
      onSettings: () => undefined,
      quit: () => undefined,
    });

    await popup.withBlurSuppressed(async () => {
      await popup.loaded;
      popup.showPopup();
      const wc = popup.window.webContents;
      await waitFor(
        wc,
        `!!document.querySelector('[data-app-ready]') && document.querySelectorAll('[role="option"]').length >= 5`,
        'launcher with threads',
      );
      await sleep(600);
      await savePng(wc, path.join(outDir, 't3-bar-main.png'));

      key(wc, 'Down');
      await waitFor(
        wc,
        `(document.querySelector('[aria-label="Thread preview"]')?.textContent ?? '').includes('calcTotal')`,
        'thread preview',
      );
      const point = (await wc.executeJavaScript(`(() => {
        const root = document.querySelector('[aria-label="Thread preview"]');
        const p = root && [...root.querySelectorAll('p')].find((el) => el.textContent.includes('rounding bug'));
        const r = (p ?? root)?.getBoundingClientRect();
        return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
      })()`)) as { x: number; y: number } | null;
      if (point) wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
      await sleep(500);
      await savePng(wc, path.join(outDir, 't3-bar-preview.png'));

      const click = (expr: string) => wc.executeJavaScript(`${expr}?.click()`);
      key(wc, 'Up');
      await sleep(300);
      await click(`document.querySelector('[aria-label="Settings"]')`);
      await waitFor(wc, `!!document.querySelector('[aria-label="Clipboard quick-capture"]')`, 'settings popover');
      await click(`document.querySelector('[aria-label="Clipboard quick-capture"]')`);
      await waitFor(wc, `document.body.innerText.includes('Allow clipboard quick-capture?')`, 'consent view');
      await click(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Allow'))`);
      await waitFor(wc, `document.body.innerText.includes('Permission granted')`, 'enabled settings');
      await sleep(400);
      await savePng(wc, path.join(outDir, 't3-bar-settings.png'));
    });
    popup.window.hide();

    const pill = new BrowserWindow({
      ...PILL_STAGE_SIZE,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#0b0b0e',
      webPreferences: {
        preload: deps.pillPreloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        devTools: false,
      },
    });
    await pill.loadURL(`${pathToFileURL(deps.pillHtmlPath).href}?capture=1`);
    pill.showInactive();
    const payload: PillPayload = { id: 'c-0123456789abcdef', preview: makePreview(DEMO_CLIPBOARD_TEXT), durationMs: 3500 };
    const end = Date.now() + 8000;
    for (;;) {
      pill.webContents.send(IPC.clipboardShow, payload);
      await sleep(250);
      const shown = await pill.webContents.executeJavaScript(`document.body.innerText.includes('Paste to T3 Bar')`).catch(() => false);
      if (shown) break;
      if (Date.now() > end) throw new Error('timed out waiting for the clipboard pill');
    }
    await sleep(500);
    await savePng(pill.webContents, path.join(outDir, 't3-bar-clipboard-pill.png'));

    clearTimeout(deadline);
    console.log('CAPTURE_OK');
    app.exit(0);
  } catch (e) {
    clearTimeout(deadline);
    console.log(`CAPTURE_FAIL ${e instanceof Error ? e.message : String(e)}`);
    app.exit(1);
  }
}
