import { describe, expect, it, vi } from 'vitest';
import { createClipboardController, PILL_HIDE_SLACK_MS } from '../src/main/clipboardController';
import type { ClipboardWatcher, WatcherStatus } from '../src/main/clipboardWatcher';
import { DEFAULT_SETTINGS } from '../src/main/settings';
import type { Settings } from '../src/shared/types';

const on = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, clipboardCapture: true, clipboardConsent: true, ...over });

function setup(initial: Settings = DEFAULT_SETTINGS, startStatus: WatcherStatus = 'watching') {
  let settings = initial;
  let handlers!: { onCapture(text: string): void; onStatus(s: WatcherStatus): void };
  let running = false;
  const watcher: ClipboardWatcher = {
    start: vi.fn(async () => {
      running = true;
      handlers.onStatus(startStatus);
    }),
    stop: vi.fn(() => { running = false; }),
    isRunning: () => running,
    markOwnWrite: vi.fn(),
    recheck: vi.fn(async () => {
      handlers.onStatus('watching');
      return 'watching' as const;
    }),
    tick: vi.fn(async () => undefined),
  };
  const pill = { show: vi.fn(), hide: vi.fn() };
  const order: string[] = [];
  const timeouts: { fn: () => void; ms: number }[] = [];
  let n = 0;
  const ctl = createClipboardController({
    watcherFactory: (h) => { handlers = h; return watcher; },
    pill,
    getSettings: () => settings,
    persist: vi.fn(async (patch) => { settings = { ...settings, ...patch } as Settings; }),
    showLauncher: async () => { order.push('show'); },
    sendPrefill: (text) => { order.push(`prefill:${text}`); },
    emitState: vi.fn(),
    randomId: () => `c-${String(++n).padStart(16, '0')}`,
    now: () => 1000,
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearTimeout: () => undefined,
  });
  return { ctl, watcher, pill, order, timeouts, capture: (t: string) => handlers.onCapture(t), setSettings: (s: Settings) => { settings = s; } };
}

describe('clipboard controller', () => {
  it('sync starts only with capture and consent', async () => {
    const t = setup();
    for (const s of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, clipboardConsent: true }, { ...DEFAULT_SETTINGS, clipboardCapture: true }]) {
      await t.ctl.sync(s);
      expect(t.watcher.start).not.toHaveBeenCalled();
    }
    await t.ctl.sync(on());
    expect(t.watcher.start).toHaveBeenCalledTimes(1);
    expect(t.ctl.status()).toEqual({ state: 'watching', checkedAt: 1000 });
  });

  it('turning capture off stops the watcher and hides the pill', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('hello');
    await t.ctl.sync(on({ clipboardCapture: false }));
    expect(t.watcher.stop).toHaveBeenCalled();
    expect(t.pill.hide).toHaveBeenCalled();
    expect(t.ctl.status()).toEqual({ state: 'off' });
    const id = t.pill.show.mock.calls[0]![0].id as string;
    await t.ctl.accept(id);
    expect(t.order).toEqual([]);
  });

  it('gives the pill only the id, a preview and the duration', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    const secret = `npm run build ${'x'.repeat(200)}`;
    t.capture(secret);
    const [payload, position] = t.pill.show.mock.calls[0]!;
    expect(Object.keys(payload).sort()).toEqual(['durationMs', 'id', 'preview']);
    expect(JSON.stringify(payload)).not.toContain('x'.repeat(100));
    expect(payload.preview.length).toBeLessThanOrEqual(81);
    expect(position).toBe('top-right');
  });

  it('ignores accept with a wrong or malformed id', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('hello');
    await t.ctl.accept('c-ffffffffffffffff');
    await t.ctl.accept('nope');
    await t.ctl.accept(undefined);
    await t.ctl.accept({ id: 1 });
    expect(t.order).toEqual([]);
  });

  it('accept shows the launcher first, then prefills once', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('git status');
    const id = t.pill.show.mock.calls[0]![0].id as string;
    await t.ctl.accept(id);
    await t.ctl.accept(id);
    expect(t.order).toEqual(['show', 'prefill:git status']);
    expect(t.pill.hide).toHaveBeenCalled();
  });

  it('dismiss clears the pending capture', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('hello');
    const id = t.pill.show.mock.calls[0]![0].id as string;
    t.ctl.dismiss(id);
    expect(t.pill.hide).toHaveBeenCalled();
    await t.ctl.accept(id);
    expect(t.order).toEqual([]);
  });

  it('expires a pending capture after the safety timeout', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('hello');
    const id = t.pill.show.mock.calls[0]![0].id as string;
    const expire = t.timeouts.find((x) => x.ms === 3500 + PILL_HIDE_SLACK_MS);
    expect(expire).toBeDefined();
    t.pill.hide.mockClear();
    expire!.fn();
    expect(t.pill.hide).toHaveBeenCalled();
    await t.ctl.accept(id);
    expect(t.order).toEqual([]);
  });

  it('accept after expiry still hides the pill but never prefills', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('hello');
    const id = t.pill.show.mock.calls[0]![0].id as string;
    t.timeouts.find((x) => x.ms === 3500 + PILL_HIDE_SLACK_MS)!.fn();
    t.pill.hide.mockClear();
    await t.ctl.accept(id);
    expect(t.pill.hide).toHaveBeenCalled();
    expect(t.order).toEqual([]);
  });

  it('a newer capture replaces the pending one', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.capture('first');
    t.capture('second');
    const [first, second] = t.pill.show.mock.calls.map((c) => c[0].id as string);
    await t.ctl.accept(first!);
    expect(t.order).toEqual([]);
    await t.ctl.accept(second!);
    expect(t.order).toEqual(['show', 'prefill:second']);
  });

  it('enable persists consent even when macOS blocks access', async () => {
    const t = setup(DEFAULT_SETTINGS, 'blocked');
    const status = await t.ctl.enable();
    expect(status).toEqual({ state: 'blocked', checkedAt: 1000 });
    await t.ctl.sync(DEFAULT_SETTINGS);
    expect(t.watcher.start).toHaveBeenCalledTimes(1);
  });

  it('enable turns the watcher on and reports watching', async () => {
    const t = setup();
    expect(await t.ctl.enable()).toEqual({ state: 'watching', checkedAt: 1000 });
    expect(t.watcher.start).toHaveBeenCalledTimes(1);
  });

  it('recheck refreshes the status', async () => {
    const t = setup(on(), 'blocked');
    await t.ctl.sync(on());
    expect(t.ctl.status().state).toBe('blocked');
    expect((await t.ctl.recheck()).state).toBe('watching');
  });

  it('forwards own writes to the watcher', async () => {
    const t = setup(on());
    await t.ctl.sync(on());
    t.ctl.markOwnWrite('copied answer');
    expect(t.watcher.markOwnWrite).toHaveBeenCalledWith('copied answer');
  });

  it('enable does not reject when the watcher fails after consent was persisted', async () => {
    const t = setup(DEFAULT_SETTINGS);
    (t.watcher.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    await expect(t.ctl.enable()).resolves.toMatchObject({ state: 'blocked' });
  });
});
