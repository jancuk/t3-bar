import { describe, expect, it, vi } from 'vitest';
import { appArgs, createT3Client, listArgs, sendArgs, showArgs, startArgs } from '../src/main/t3cli';

describe('arg builders', () => {
  it('puts --json and flags before positionals', () => {
    expect(listArgs('/p')).toEqual(['thread', 'list', '--json', '--project', '/p']);
    expect(showArgs('abc', 8)).toEqual(['thread', 'show', '--json', '--messages', '8', 'abc']);
    expect(sendArgs('abc')).toEqual(['thread', 'send', '--json', 'abc', '-']);
    expect(startArgs('/p')).toEqual(['thread', 'start', '--json', '/p', '-']);
    expect(startArgs('/p', 'Hello')).toEqual(['thread', 'start', '--json', '--title', 'Hello', '/p', '-']);
    expect(appArgs('/p')).toEqual(['app', '/p']);
  });

  it('never includes --wait and always reads messages from stdin', () => {
    for (const a of [sendArgs('x'), startArgs('/p', 't')]) {
      expect(a).not.toContain('--wait');
      expect(a[a.length - 1]).toBe('-');
    }
  });

  it('all flags precede the first positional', () => {
    const a = startArgs('/p', 't');
    const firstPositional = a.findIndex((x, i) => i >= 2 && !x.startsWith('--') && a[i - 1] !== '--title');
    expect(a.slice(firstPositional).some((x) => x.startsWith('--'))).toBe(false);
  });
});

describe('createT3Client', () => {
  it('passes stdin text, timeouts and cli path', async () => {
    const run = vi.fn(async () => ({ stdout: '{"threadId":"t1"}', stderr: '', exitCode: 0 }));
    const c = createT3Client({ getCliPath: () => '/bin/t3', run, cwd: '/' });
    const r = await c.sendMessage('abc', 'hi\nthere');
    expect(r.threadId).toBe('t1');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ file: '/bin/t3', args: sendArgs('abc'), stdin: 'hi\nthere', timeoutMs: 30_000, cwd: '/' }),
    );
    await c.listThreads('/p').catch(() => undefined);
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ timeoutMs: 15_000, stdin: undefined }));
  });

  it('maps a missing project on list', async () => {
    const run = async () => ({ stdout: 'No T3 Code project matches /x', stderr: '', exitCode: 0 });
    const c = createT3Client({ getCliPath: () => '/bin/t3', run });
    await expect(c.listThreads('/x')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });
});
