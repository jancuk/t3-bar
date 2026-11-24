import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normalizeThreadDetail, normalizeThreadList, parseJsonOutput, parseSendResult, parseStartResult,
} from '../src/main/parse';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')) as unknown;
const out = (stdout: string, exitCode = 0, stderr = '') => ({ stdout, stderr, exitCode });

describe('parseJsonOutput', () => {
  it('parses valid JSON', () => {
    expect(parseJsonOutput(out('[1,2]'))).toEqual([1, 2]);
  });
  it('detects project not found even with exit 0', () => {
    expect(() => parseJsonOutput(out('No T3 Code project matches /x'))).toThrowError(expect.objectContaining({ code: 'PROJECT_NOT_FOUND' }));
  });
  it('detects thread gone', () => {
    expect(() => parseJsonOutput(out('', 1, 'Thread is no longer available'))).toThrowError(expect.objectContaining({ code: 'THREAD_NOT_FOUND' }));
  });
  it('detects connection errors', () => {
    expect(() => parseJsonOutput(out('', 1, 'fetch failed ECONNREFUSED'))).toThrowError(expect.objectContaining({ code: 'SERVER_UNREACHABLE' }));
  });
  it('maps non-zero exit to CLI_ERROR', () => {
    expect(() => parseJsonOutput(out('', 2, 'bad'))).toThrowError(expect.objectContaining({ code: 'CLI_ERROR', message: 'bad' }));
  });
  it('rejects non-JSON on exit 0 with the requested code', () => {
    expect(() => parseJsonOutput(out('hello'))).toThrowError(expect.objectContaining({ code: 'CLI_ERROR' }));
    expect(() => parseJsonOutput(out('hello'), { nonJsonCode: 'PROJECT_NOT_FOUND' })).toThrowError(expect.objectContaining({ code: 'PROJECT_NOT_FOUND' }));
  });
  it('allows empty output when asked', () => {
    expect(parseJsonOutput(out(''), { allowEmpty: true })).toEqual({});
    expect(() => parseJsonOutput(out(''))).toThrow();
  });
  it('does not misclassify error phrases inside valid JSON data', () => {
    const payload = JSON.stringify({
      thread: { threadId: 't-1', title: 'Debug fetch failed / connection refused' },
      messages: [
        { role: 'user', text: 'I saw No T3 Code project matches and is no longer available in the logs' },
        { role: 'assistant', text: 'ECONNREFUSED happens when the server is not running.' },
      ],
    });
    const parsed = parseJsonOutput(out(payload));
    const detail = normalizeThreadDetail(parsed);
    expect(detail.thread.threadId).toBe('t-1');
    expect(detail.messages).toHaveLength(2);
  });
  it('accepts non-JSON stdout on exit 0 when allowNonJson is true (send/start)', () => {
    expect(parseJsonOutput(out('Queued message'), { allowNonJson: true })).toEqual({});
    expect(() => parseJsonOutput(out('Thread is no longer available'), { allowNonJson: true })).toThrowError(
      expect.objectContaining({ code: 'THREAD_NOT_FOUND' }),
    );
  });
});

describe('normalizers', () => {
  it('normalizes the thread list and skips junk', () => {
    const list = normalizeThreadList(fx('thread-list.json'));
    expect(list.map((t) => t.threadId)).toEqual(['11111111-aaaa-bbbb-cccc-000000000001', '22222222-aaaa-bbbb-cccc-000000000002', '33333333']);
    expect(list[0]).toMatchObject({ title: 'Fix login redirect', pinned: true, provider: 'claudeAgent', settled: false });
    expect(list[1]?.settled).toBe(true);
    expect(list[2]?.title).toBe('Untitled thread');
  });
  it('rejects a non-list', () => {
    expect(() => normalizeThreadList('x')).toThrow();
  });
  it('normalizes thread detail and drops bad messages', () => {
    const d = normalizeThreadDetail(fx('thread-show.json'));
    expect(d.thread.status).toBe('waiting');
    expect(d.pendingRequestCount).toBe(2);
    expect(d.messages).toHaveLength(2);
    expect(d.messages[1]).toMatchObject({ role: 'assistant', text: 'Done. I updated `auth.ts`.' });
  });
  it('parses send/start results tolerantly', () => {
    expect(parseSendResult({ threadId: 'a' }).threadId).toBe('a');
    expect(parseStartResult({ thread: { threadId: 'b', link: 'https://x.y/z' } })).toEqual({ threadId: 'b', link: 'https://x.y/z' });
    expect(parseStartResult({ id: 'c' }).threadId).toBe('c');
    expect(parseStartResult({})).toEqual({ threadId: undefined, link: undefined });
    expect(parseSendResult('weird')).toEqual({});
  });
});
