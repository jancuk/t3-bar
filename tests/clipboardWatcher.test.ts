import { describe, expect, it, vi } from 'vitest';
import {
  classifyClip,
  createClipboardWatcher,
  makePreview,
  SKIP_FORMATS,
  type ClipboardAdapter,
  type WatcherTimers,
} from '../src/main/clipboardWatcher';
import { MAX_MESSAGE_CHARS } from '../src/shared/validation';

const base = { formats: ['text/plain'], text: 'hello', last: null, ownWrite: null, maxChars: MAX_MESSAGE_CHARS };

describe('classifyClip', () => {
  it('captures new text', () => {
    expect(classifyClip(base)).toEqual({ kind: 'capture', text: 'hello' });
  });
  it('skips every concealed format, case-insensitively', () => {
    for (const f of SKIP_FORMATS) {
      for (const variant of [f, f.toLowerCase(), f.toUpperCase()]) {
        expect(classifyClip({ ...base, formats: ['text/plain', variant] })).toEqual({ kind: 'skip', reason: 'concealed' });
      }
    }
  });
  it('skips empty and whitespace-only text', () => {
    expect(classifyClip({ ...base, text: '' })).toEqual({ kind: 'skip', reason: 'empty' });
    expect(classifyClip({ ...base, text: ' \n\t ' })).toEqual({ kind: 'skip', reason: 'empty' });
    expect(classifyClip({ ...base, text: null })).toEqual({ kind: 'skip', reason: 'empty' });
  });
  it('skips text longer than the message limit', () => {
    expect(classifyClip({ ...base, text: 'x'.repeat(MAX_MESSAGE_CHARS + 1) })).toEqual({ kind: 'skip', reason: 'too-long' });
    expect(classifyClip({ ...base, text: 'x'.repeat(MAX_MESSAGE_CHARS) }).kind).toBe('capture');
  });
  it('skips unchanged text and our own writes', () => {
    expect(classifyClip({ ...base, last: 'hello' })).toEqual({ kind: 'skip', reason: 'unchanged' });
    expect(classifyClip({ ...base, ownWrite: 'hello' })).toEqual({ kind: 'skip', reason: 'own-write' });
  });
});

describe('makePreview', () => {
  it('collapses whitespace across lines', () => {
    expect(makePreview('  git   push\n\n  origin\tmain  ')).toBe('git push origin main');
  });
  it('keeps text up to 80 characters and cuts longer text with an ellipsis', () => {
    expect(makePreview('a'.repeat(80))).toBe('a'.repeat(80));
    expect(makePreview('a'.repeat(81))).toBe(`${'a'.repeat(80)}…`);
  });
  it('never splits a surrogate pair', () => {
    const out = makePreview('😀'.repeat(100), 5);
    expect(out).toBe(`${'😀'.repeat(5)}…`);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

function setup(opts: { focused?: () => boolean } = {}) {
  const state = { text: 'initial', formats: ['text/plain'] as string[] };
  const adapter = {
    formats: vi.fn<ClipboardAdapter['formats']>(() => state.formats),
    readText: vi.fn<ClipboardAdapter['readText']>(() => state.text),
  };
  let fn: (() => void) | null = null;
  const timers: WatcherTimers = {
    setInterval: (f) => { fn = f; return 1; },
    clearInterval: () => { fn = null; },
  };
  const onCapture = vi.fn();
  const onStatus = vi.fn();
  const focus = { value: false };
  const watcher = createClipboardWatcher({
    adapter,
    isLauncherFocused: opts.focused ?? (() => focus.value),
    onCapture,
    onStatus,
    maxChars: MAX_MESSAGE_CHARS,
    timers,
  });
  return { state, adapter, watcher, onCapture, onStatus, focus, hasTimer: () => fn !== null };
}

describe('createClipboardWatcher', () => {
  it('baselines on start without firing', async () => {
    const t = setup();
    await t.watcher.start();
    expect(t.onCapture).not.toHaveBeenCalled();
    expect(t.onStatus).toHaveBeenCalledWith('watching');
    await t.watcher.tick();
    expect(t.onCapture).not.toHaveBeenCalled();
  });

  it('fires once per external copy', async () => {
    const t = setup();
    await t.watcher.start();
    t.state.text = 'npm test';
    await t.watcher.tick();
    await t.watcher.tick();
    expect(t.onCapture).toHaveBeenCalledTimes(1);
    expect(t.onCapture).toHaveBeenCalledWith('npm test');
    t.state.text = 'second';
    await t.watcher.tick();
    expect(t.onCapture).toHaveBeenCalledTimes(2);
  });

  it('never reads the text while a concealed format is present', async () => {
    const t = setup();
    await t.watcher.start();
    t.adapter.readText.mockClear();
    t.state.text = 's3cret';
    t.state.formats = ['text/plain', 'org.nspasteboard.ConcealedType'];
    await t.watcher.tick();
    await t.watcher.tick();
    expect(t.adapter.readText).not.toHaveBeenCalled();
    expect(t.onCapture).not.toHaveBeenCalled();
  });

  it('does not read at start when the clipboard is concealed', async () => {
    const t = setup();
    t.state.formats = ['text/plain', 'com.agilebits.onepassword'];
    await t.watcher.start();
    expect(t.adapter.readText).not.toHaveBeenCalled();
  });

  it('does not read while the launcher is focused, then re-baselines without firing', async () => {
    const t = setup();
    await t.watcher.start();
    t.adapter.readText.mockClear();
    t.focus.value = true;
    t.state.text = 'copied inside the launcher';
    await t.watcher.tick();
    expect(t.adapter.readText).not.toHaveBeenCalled();
    t.focus.value = false;
    await t.watcher.tick();
    expect(t.onCapture).not.toHaveBeenCalled();
    t.state.text = 'real external copy';
    await t.watcher.tick();
    expect(t.onCapture).toHaveBeenCalledWith('real external copy');
  });

  it('markOwnWrite suppresses our own copy', async () => {
    const t = setup();
    await t.watcher.start();
    t.watcher.markOwnWrite('answer text');
    t.state.text = 'answer text';
    await t.watcher.tick();
    expect(t.onCapture).not.toHaveBeenCalled();
    t.state.text = 'other';
    await t.watcher.tick();
    expect(t.onCapture).toHaveBeenCalledTimes(1);
  });

  it('stop clears the timer and state', async () => {
    const t = setup();
    await t.watcher.start();
    expect(t.watcher.isRunning()).toBe(true);
    t.watcher.stop();
    expect(t.watcher.isRunning()).toBe(false);
    expect(t.hasTimer()).toBe(false);
    t.adapter.readText.mockClear();
    t.state.text = 'after stop';
    await t.watcher.tick();
    expect(t.adapter.readText).not.toHaveBeenCalled();
    await t.watcher.start();
    t.state.text = 'after stop';
    await t.watcher.tick();
    expect(t.onCapture).not.toHaveBeenCalled();
  });

  it('reports blocked and stops reading until recheck succeeds', async () => {
    const t = setup();
    t.state.text = '';
    await t.watcher.start();
    expect(t.onStatus).toHaveBeenLastCalledWith('blocked');
    t.adapter.readText.mockClear();
    await t.watcher.tick();
    await t.watcher.tick();
    expect(t.adapter.readText).not.toHaveBeenCalled();

    t.state.text = 'allowed now';
    await expect(t.watcher.recheck()).resolves.toBe('watching');
    expect(t.onStatus).toHaveBeenLastCalledWith('watching');
    t.state.text = 'fresh copy';
    await t.watcher.tick();
    expect(t.onCapture).toHaveBeenCalledWith('fresh copy');
  });

  it('stays blocked when recheck still fails', async () => {
    const t = setup();
    t.state.text = '';
    await t.watcher.start();
    await expect(t.watcher.recheck()).resolves.toBe('blocked');
  });

  it('does not treat a clipboard without text as blocked', async () => {
    const t = setup();
    t.state.formats = ['image/png'];
    t.state.text = '';
    await t.watcher.start();
    expect(t.onStatus).toHaveBeenLastCalledWith('watching');
    expect(t.adapter.readText).not.toHaveBeenCalled();
  });

  it('discards text when a concealed format appears between the check and the read', async () => {
    const t = setup();
    await t.watcher.start();
    let calls = 0;
    t.adapter.formats.mockImplementation(() => {
      calls++;
      return calls % 2 === 0 ? ['text/plain', 'org.nspasteboard.ConcealedType'] : ['text/plain'];
    });
    t.state.text = 'late secret';
    await t.watcher.tick();
    expect(t.onCapture).not.toHaveBeenCalled();
  });

  it('an empty read inside a tick is skipped, not latched as blocked', async () => {
    const t = setup();
    await t.watcher.start();
    t.onStatus.mockClear();
    t.state.text = '';
    await t.watcher.tick();
    expect(t.onStatus).not.toHaveBeenCalledWith('blocked');
    t.state.text = 'next copy';
    await t.watcher.tick();
    expect(t.onCapture).toHaveBeenCalledWith('next copy');
  });

  it('overlapping ticks read once', async () => {
    const t = setup();
    await t.watcher.start();
    t.adapter.readText.mockClear();
    t.state.text = 'copied';
    await Promise.all([t.watcher.tick(), t.watcher.tick(), t.watcher.tick()]);
    expect(t.adapter.readText).toHaveBeenCalledTimes(1);
    expect(t.onCapture).toHaveBeenCalledTimes(1);
  });

  it('stop mid-flight prevents a later read', async () => {
    const t = setup();
    await t.watcher.start();
    t.adapter.readText.mockClear();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    t.adapter.formats.mockImplementation(async () => { await gate; return ['text/plain']; });
    t.state.text = 'copied';
    const pending = t.watcher.tick();
    t.watcher.stop();
    release();
    await pending;
    expect(t.adapter.readText).not.toHaveBeenCalled();
    expect(t.onCapture).not.toHaveBeenCalled();
  });

  it('own-write suppression expires', async () => {
    let now = 0;
    const state = { text: 'initial' };
    const onCapture = vi.fn();
    const watcher = createClipboardWatcher({
      adapter: { formats: () => ['text/plain'], readText: () => state.text },
      isLauncherFocused: () => false,
      onCapture,
      onStatus: () => undefined,
      maxChars: MAX_MESSAGE_CHARS,
      timers: { setInterval: () => 1, clearInterval: () => undefined },
      now: () => now,
    });
    await watcher.start();
    watcher.markOwnWrite('A');
    state.text = 'A';
    await watcher.tick();
    state.text = 'B';
    await watcher.tick();
    expect(onCapture).toHaveBeenLastCalledWith('B');
    state.text = 'A';
    await watcher.tick();
    expect(onCapture).toHaveBeenLastCalledWith('A');
    expect(onCapture).toHaveBeenCalledTimes(2);

    watcher.markOwnWrite('C');
    now = 5000;
    state.text = 'D';
    await watcher.tick();
    state.text = 'C';
    await watcher.tick();
    expect(onCapture).toHaveBeenLastCalledWith('C');
  });

  it('a throwing adapter reports blocked instead of rejecting', async () => {
    const t = setup();
    t.adapter.formats.mockImplementation(() => { throw new Error('boom'); });
    await expect(t.watcher.start()).resolves.toBeUndefined();
    expect(t.onStatus).toHaveBeenLastCalledWith('blocked');
    await expect(t.watcher.recheck()).resolves.toBe('blocked');

    const u = setup();
    await u.watcher.start();
    u.adapter.readText.mockImplementation(() => { throw new Error('boom'); });
    await expect(u.watcher.tick()).resolves.toBeUndefined();
    expect(u.onStatus).toHaveBeenLastCalledWith('blocked');
  });
});
