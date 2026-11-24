import { chmodSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli, type ExecFileImpl } from '../src/main/exec';
import { createT3Client } from '../src/main/t3cli';

const fake = path.resolve(import.meta.dirname, 'fixtures/fake-t3.sh');
const dec = (b: string) => Buffer.from(b, 'base64').toString('utf8');
const tmp = mkdtempSync(path.join(tmpdir(), 't3w-exec-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('runCli with fake-t3.sh', () => {
  it('passes args verbatim and multiline/special-char stdin intact', async () => {
    const message = 'line one\n"quoted" $HOME `ls` $(whoami) \\n ; | & > <\n\ttabbed ünï 🎉\n- starts with dash';
    process.env.ELECTRON_RUN_AS_NODE = '1';
    const res = await runCli({ file: fake, args: ['thread', 'send', '--json', 'abc', '-'], stdin: message, timeoutMs: 10_000 });
    delete process.env.ELECTRON_RUN_AS_NODE;
    const j = JSON.parse(res.stdout) as { argsB64: string[]; stdinB64: string; env: Record<string, string> };
    expect(j.argsB64.map(dec)).toEqual(['thread', 'send', '--json', 'abc', '-']);
    expect(dec(j.stdinB64)).toBe(message);
    expect(j.env).toEqual({ ELECTRON_RUN_AS_NODE: 'unset', NO_COLOR: '1', FORCE_COLOR: '0' });
  });

  it('does not interpret shell metacharacters in args', async () => {
    const res = await runCli({ file: fake, args: ['$(echo pwned)', '; rm -rf x', '*'], timeoutMs: 10_000, stdin: '' });
    const j = JSON.parse(res.stdout) as { argsB64: string[] };
    expect(j.argsB64.map(dec)).toEqual(['$(echo pwned)', '; rm -rf x', '*']);
  });

  it('works end to end through the client', async () => {
    const c = createT3Client({ getCliPath: () => fake, run: runCli });
    // fake echoes its own JSON, which has no threadId: tolerant parse gives an empty result
    await expect(c.sendMessage('abc', 'multi\nline')).resolves.toEqual({ threadId: undefined, link: undefined });
  });

  it('returns non-zero exit codes for the parser to judge', async () => {
    process.env.FAKE_T3_MODE = 'exit3';
    const r = await runCli({ file: fake, args: [], timeoutMs: 5000 });
    delete process.env.FAKE_T3_MODE;
    expect(r).toMatchObject({ exitCode: 3, stderr: 'boom\n' });
  });

  it('maps exit 127 to T3_APP_MISSING', async () => {
    process.env.FAKE_T3_MODE = 'exit127';
    await expect(runCli({ file: fake, args: [], timeoutMs: 5000 })).rejects.toMatchObject({ code: 'T3_APP_MISSING' });
    delete process.env.FAKE_T3_MODE;
  });

  it('times out', async () => {
    process.env.FAKE_T3_MODE = 'sleep';
    await expect(runCli({ file: fake, args: [], timeoutMs: 300 })).rejects.toMatchObject({ code: 'CLI_TIMEOUT' });
    delete process.env.FAKE_T3_MODE;
  });

  it('caps output size', async () => {
    process.env.FAKE_T3_MODE = 'big';
    await expect(runCli({ file: fake, args: [], timeoutMs: 10_000, maxBuffer: 1024 })).rejects.toMatchObject({ code: 'OUTPUT_TOO_LARGE' });
    delete process.env.FAKE_T3_MODE;
  });
});

describe('runCli path checks', () => {
  it('rejects relative and missing paths', async () => {
    await expect(runCli({ file: 't3', args: [], timeoutMs: 1000 })).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
    await expect(runCli({ file: '/definitely/not/here', args: [], timeoutMs: 1000 })).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
  });
  it('rejects non-executable files', async () => {
    const f = path.join(tmp, 'noexec.sh');
    writeFileSync(f, '#!/bin/sh\n');
    chmodSync(f, 0o644);
    await expect(runCli({ file: f, args: [], timeoutMs: 1000 })).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
  });
  it('expands ~ and never sets shell:true', async () => {
    let seen: { file: string; opts: Record<string, unknown> } | null = null;
    const impl: ExecFileImpl = (file, _args, opts, cb) => {
      seen = { file, opts: opts as unknown as Record<string, unknown> };
      queueMicrotask(() => cb(null, '{}', ''));
      return { stdin: null };
    };
    const home = process.env.HOME as string;
    // use a real executable under HOME-less path by faking via tilde-less absolute check
    await expect(runCli({ file: '~/.t3bar-nonexistent-cli', args: [], timeoutMs: 1000, execFileImpl: impl })).rejects.toMatchObject({
      code: 'CLI_NOT_FOUND',
      message: expect.stringContaining(home),
    });
    await runCli({ file: fake, args: [], timeoutMs: 1000, execFileImpl: impl });
    expect(seen).not.toBeNull();
    expect(seen!.opts.shell).toBeUndefined();
  });
});
