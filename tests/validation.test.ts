import { describe, expect, it } from 'vitest';
import {
  validateExternalUrl, validateMessageText, validatePreviewCount, validateProjectId, validateProjectTarget,
  validateServerUrl, validateThreadId, validateTitle,
  isTokenSafeOrigin, validateAccessToken, validateClipboardText, validateEnvId, validateEnvLabel, validateRemoteId, validateRemoteOrigin,
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

describe('remote validation', () => {
  it('accepts https anywhere, and http only for loopback or tailscale', () => {
    for (const v of ['https://example.com', 'https://example.com/path?x=1', 'http://127.0.0.1:3773', 'http://localhost:3773', 'http://[::1]:3773', 'http://dev-mac.tail1234.ts.net:3773']) {
      expect(validateRemoteOrigin(v).ok).toBe(true);
    }
    expect(validateRemoteOrigin('https://Example.com/a/b')).toEqual({ ok: true, value: 'https://example.com' });
  });
  it('rejects unsafe origins', () => {
    for (const v of ['http://example.com', 'http://192.168.1.5:3773', 'http://100.64.0.1:3773', 'http://ts.net', 'http://x.ts.net', 'http://evil.ts.net.example.com', 'http://.ts.net', 'ftp://example.com', 'https://u:p@example.com', 'not a url', '', 5, null]) {
      expect(validateRemoteOrigin(v).ok).toBe(false);
    }
  });
  it('isTokenSafeOrigin', () => {
    expect(isTokenSafeOrigin('https://a.example.com')).toBe(true);
    expect(isTokenSafeOrigin('http://host.tailnet.ts.net')).toBe(true);
    expect(isTokenSafeOrigin('http://x.ts.net')).toBe(false);
    expect(isTokenSafeOrigin('http://a.example.com')).toBe(false);
    expect(isTokenSafeOrigin('https://u@a.example.com')).toBe(false);
    expect(isTokenSafeOrigin('nope')).toBe(false);
  });
  it('access token', () => {
    expect(validateAccessToken('abcdefgh').ok).toBe(true);
    for (const bad of ['short', 'has space1234', 'tab\there1234', 'x'.repeat(4097), '', 5, 'unicodé-token-1']) expect(validateAccessToken(bad).ok).toBe(false);
  });
  it('remote id and env id', () => {
    expect(validateRemoteId('a1b2:c_3-d').ok).toBe(true);
    for (const bad of ['', '-x', 'a/b', 'a b', 'x'.repeat(201)]) expect(validateRemoteId(bad).ok).toBe(false);
    expect(validateEnvId('local').ok).toBe(true);
    expect(validateEnvId('r-0123456789').ok).toBe(true);
    for (const bad of ['r-012345678', 'r-0123456789a', 'r-ABCDEFGHIJ', 'remote', '']) expect(validateEnvId(bad).ok).toBe(false);
  });
  it('env label', () => {
    expect(validateEnvLabel('  Dev \n Mac\t ')).toEqual({ ok: true, value: 'Dev Mac' });
    expect(validateEnvLabel('   ')).toEqual({ ok: true, value: undefined });
    expect(validateEnvLabel(undefined)).toEqual({ ok: true, value: undefined });
    const long = validateEnvLabel('x'.repeat(100));
    expect(long.ok && long.value?.length).toBe(60);
    expect(validateEnvLabel(5).ok).toBe(false);
  });
  it('clipboard text allows whitespace but not empty, NUL or oversize', () => {
    expect(validateClipboardText('  \n ').ok).toBe(true);
    expect(validateClipboardText('hi').ok).toBe(true);
    for (const bad of ['', 'a\0b', 'x'.repeat(MAX_MESSAGE_CHARS + 1), 5]) expect(validateClipboardText(bad).ok).toBe(false);
  });
});
