import { describe, expect, it } from 'vitest';
import {
  validateExternalUrl, validateMessageText, validatePreviewCount, validateProjectId, validateProjectTarget,
  validateServerUrl, validateThreadId, validateTitle,
  validateCaptureId, validateClipboardPosition, validateClipboardText,
  MAX_MESSAGE_CHARS,
} from '../src/shared/validation';

describe('validation', () => {
  it('threadId', () => {
    for (const ok of ['00000000-0000-4000-8000-000000000001', 'thread:abc_1', 'a']) expect(validateThreadId(ok).ok).toBe(true);
    for (const bad of ['', '-flag', '--wait', 'a b', 'a/b', 'x'.repeat(201), 5, null]) expect(validateThreadId(bad).ok).toBe(false);
  });

  it('project target', () => {
    expect(validateProjectTarget('/Users/me/../me/code/./app/')).toEqual({ ok: true, value: '/Users/me/code/app' });
    expect(validateProjectTarget('proj_1')).toEqual({ ok: true, value: 'proj_1' });
    for (const bad of ['', 'relative/path', '-x', '--help', '/a\0b', 'a b', 5]) expect(validateProjectTarget(bad).ok).toBe(false);
    expect(validateProjectId('p-1234').ok).toBe(true);
    expect(validateProjectId('/abs').ok).toBe(false);
  });

  it('title', () => {
    expect(validateTitle('  hello\nworld  ')).toEqual({ ok: true, value: 'hello world' });
    expect(validateTitle('--wait now')).toEqual({ ok: true, value: 'wait now' });
    expect(validateTitle('   ')).toEqual({ ok: true, value: undefined });
    expect(validateTitle(undefined)).toEqual({ ok: true, value: undefined });
    const long = validateTitle('x'.repeat(500));
    expect(long.ok && long.value?.length).toBe(200);
    expect(validateTitle(5).ok).toBe(false);
  });

  it('message text', () => {
    expect(validateMessageText('hi').ok).toBe(true);
    expect(validateMessageText('  \n ').ok).toBe(false);
    expect(validateMessageText('x'.repeat(100_000)).ok).toBe(true);
    expect(validateMessageText('x'.repeat(100_001)).ok).toBe(false);
    expect(validateMessageText(1).ok).toBe(false);
  });

  it('previewCount', () => {
    for (const ok of [1, 8, 50]) expect(validatePreviewCount(ok).ok).toBe(true);
    for (const bad of [0, 51, 1.5, '8', NaN]) expect(validatePreviewCount(bad).ok).toBe(false);
  });

  it('serverUrl is loopback http only', () => {
    expect(validateServerUrl('http://127.0.0.1:3773/')).toEqual({ ok: true, value: 'http://127.0.0.1:3773' });
    expect(validateServerUrl('http://localhost:3773').ok).toBe(true);
    expect(validateServerUrl('http://[::1]:3773').ok).toBe(true);
    for (const bad of ['https://127.0.0.1:3773', 'http://192.168.1.2:3773', 'http://example.com', 'http://127.0.0.1.evil.com', 'http://u:p@127.0.0.1', 'ftp://127.0.0.1', 'nope', 1]) {
      expect(validateServerUrl(bad).ok).toBe(false);
    }
  });

  it('external urls are http(s) only', () => {
    expect(validateExternalUrl('https://app.t3.codes/threads/x').ok).toBe(true);
    expect(validateExternalUrl('http://localhost:3773/x').ok).toBe(true);
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'vscode://x', 'nope', null]) {
      expect(validateExternalUrl(bad).ok).toBe(false);
    }
  });
});

describe('clipboard validation', () => {
  it('clipboard text allows whitespace but not empty, NUL or oversize', () => {
    expect(validateClipboardText('  \n ').ok).toBe(true);
    expect(validateClipboardText('hi').ok).toBe(true);
    for (const bad of ['', 'a\0b', 'x'.repeat(MAX_MESSAGE_CHARS + 1), 5]) expect(validateClipboardText(bad).ok).toBe(false);
  });
  it('clipboard position', () => {
    for (const ok of ['top-right', 'cursor']) expect(validateClipboardPosition(ok)).toEqual({ ok: true, value: ok });
    for (const bad of ['', 'left', 'TOP-RIGHT', null, 5]) expect(validateClipboardPosition(bad).ok).toBe(false);
  });
  it('capture id', () => {
    expect(validateCaptureId('c-0123456789abcdef').ok).toBe(true);
    for (const bad of ['c-0123456789abcde', 'c-0123456789abcdeg', 'C-0123456789abcdef', 'c-0123456789abcdef0', '', null, 5]) {
      expect(validateCaptureId(bad).ok).toBe(false);
    }
  });
});
