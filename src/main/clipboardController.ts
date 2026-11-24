import type { ClipboardPosition, ClipboardStatus, PillPayload, Settings } from '../shared/types';
import { validateCaptureId } from '../shared/validation';
import { makePreview, type ClipboardWatcher, type WatcherStatus } from './clipboardWatcher';
import type { StorePatch } from './settings';

export const PILL_DURATION_MS = 3500;
/** Main hides the pill this long after its own timer should have ended. Not paused by hover. */
export const PILL_HIDE_SLACK_MS = 1000;

export interface ControllerPill {
  show(payload: PillPayload, position: ClipboardPosition): void;
  hide(): void;
}

export interface ControllerDeps {
  watcherFactory(handlers: { onCapture(text: string): void; onStatus(status: WatcherStatus): void }): ClipboardWatcher;
  pill: ControllerPill;
  getSettings(): Settings;
  persist(patch: StorePatch): Promise<unknown>;
  showLauncher(): Promise<void> | void;
  sendPrefill(text: string): void;
  emitState(): void;
  randomId(): string;
  now?(): number;
  setTimeout?(fn: () => void, ms: number): unknown;
  clearTimeout?(handle: unknown): void;
}

export interface ClipboardController {
  sync(settings: Settings): Promise<void>;
  enable(): Promise<ClipboardStatus>;
  recheck(): Promise<ClipboardStatus>;
  accept(id: unknown): Promise<void>;
  dismiss(id: unknown): void;
  markOwnWrite(text: string): void;
  status(): ClipboardStatus;
  destroy(): void;
}

export function createClipboardController(deps: ControllerDeps): ClipboardController {
  const now = deps.now ?? Date.now;
  const schedule = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const unschedule = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let watcher: ClipboardWatcher | null = null;
  let pending: { id: string; text: string } | null = null;
  let pendingTimer: unknown = null;
  let current: ClipboardStatus = { state: 'off' };

  const clearPending = () => {
    pending = null;
    if (pendingTimer !== null) unschedule(pendingTimer);
    pendingTimer = null;
  };

  const setStatus = (s: WatcherStatus) => {
    current = { state: s, checkedAt: now() };
    deps.emitState();
  };

  const ensureWatcher = (): ClipboardWatcher => {
    watcher ??= deps.watcherFactory({
      onStatus: setStatus,
      onCapture: (text) => {
        clearPending();
        const id = deps.randomId();
        pending = { id, text };
        pendingTimer = schedule(() => {
          clearPending();
          deps.pill.hide();
        }, PILL_DURATION_MS + PILL_HIDE_SLACK_MS);
        deps.pill.show(
          { id, preview: makePreview(text), durationMs: PILL_DURATION_MS },
          deps.getSettings().clipboardPosition,
        );
      },
    });
    return watcher;
  };

  const stop = () => {
    const was = current.state !== 'off';
    watcher?.stop();
    clearPending();
    deps.pill.hide();
    current = { state: 'off' };
    if (was) deps.emitState();
  };

  const sync = async (settings: Settings): Promise<void> => {
    if (settings.clipboardCapture && settings.clipboardConsent) {
      const w = ensureWatcher();
      await w.start();
    } else {
      stop();
    }
  };

  return {
    sync,
    async enable() {
      await deps.persist({ clipboardConsent: true, clipboardCapture: true });
      try {
        await sync(deps.getSettings());
      } catch {
        setStatus('blocked');
      }
      return current;
    },
    async recheck() {
      if (watcher?.isRunning()) await watcher.recheck();
      return current;
    },
    async accept(id) {
      if (!validateCaptureId(id).ok) return;
      if (pending === null) {
        deps.pill.hide();
        return;
      }
      if (pending.id !== id) return;
      const { text } = pending;
      clearPending();
      deps.pill.hide();
      await deps.showLauncher();
      deps.sendPrefill(text);
    },
    dismiss(id) {
      if (!validateCaptureId(id).ok || (pending !== null && pending.id !== id)) return;
      clearPending();
      deps.pill.hide();
    },
    markOwnWrite(text) {
      watcher?.markOwnWrite(text);
    },
    status: () => current,
    destroy() {
      stop();
      watcher = null;
    },
  };
}
