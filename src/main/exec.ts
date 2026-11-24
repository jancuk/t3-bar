import { execFile } from 'node:child_process';
import { promises as fs, constants as fsc } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { AppError } from './errors';

export interface CliOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  timeout: number;
  maxBuffer: number;
  encoding: 'utf8';
  windowsHide: boolean;
  killSignal: NodeJS.Signals;
}

export interface ExecError extends Error {
  code?: string | number;
  killed?: boolean;
  signal?: string | null;
}

export type ExecFileImpl = (
  file: string,
  args: string[],
  options: ExecOptions,
  callback: (err: ExecError | null, stdout: string, stderr: string) => void,
) => { stdin: Writable | null };

export interface RunCliOptions {
  file: string;
  args: string[];
  stdin?: string;
  timeoutMs: number;
  cwd?: string;
  execFileImpl?: ExecFileImpl;
  maxBuffer?: number;
}

export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function runCli(opts: RunCliOptions): Promise<CliOutput> {
  const file = expandHome(opts.file.trim());
  if (!path.isAbsolute(file)) {
    throw new AppError('CLI_NOT_FOUND', `CLI path must be absolute: ${opts.file}`);
  }
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error('not a file');
    await fs.access(file, fsc.X_OK);
  } catch {
    throw new AppError('CLI_NOT_FOUND', `T3 CLI not found or not executable at ${file}`);
  }

  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env.ELECTRON_RUN_AS_NODE;

  const impl = opts.execFileImpl ?? (execFile as unknown as ExecFileImpl);

  return new Promise<CliOutput>((resolve, reject) => {
    let child: { stdin: Writable | null };
    try {
      child = impl(
        file,
        opts.args,
        {
          cwd: opts.cwd,
          env,
          timeout: opts.timeoutMs,
          maxBuffer: opts.maxBuffer ?? MAX_OUTPUT_BYTES,
          encoding: 'utf8',
          windowsHide: true,
          killSignal: 'SIGKILL',
        },
        (err, stdout, stderr) => {
          const out = String(stdout ?? '');
          const errOut = String(stderr ?? '');
          if (!err) return resolve({ stdout: out, stderr: errOut, exitCode: 0 });
          if (err.code === 'ENOENT' || err.code === 'EACCES') {
            return reject(new AppError('CLI_NOT_FOUND', `Cannot run T3 CLI at ${file}`));
          }
          if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            return reject(new AppError('OUTPUT_TOO_LARGE', 'CLI output was too large'));
          }
          if (err.killed) {
            return reject(new AppError('CLI_TIMEOUT', `CLI timed out after ${Math.round(opts.timeoutMs / 1000)}s`));
          }
          if (typeof err.code === 'number') {
            if (err.code === 127) {
              return reject(new AppError('T3_APP_MISSING', 'The T3 Code app is not installed or could not be found'));
            }
            return resolve({ stdout: out, stderr: errOut, exitCode: err.code });
          }
          return reject(new AppError('CLI_ERROR', err.message));
        },
      );
    } catch (e) {
      return reject(new AppError('CLI_ERROR', e instanceof Error ? e.message : String(e)));
    }
    const stdin = child.stdin;
    if (stdin) {
      stdin.on('error', () => undefined); // EPIPE if the child exits early
      if (opts.stdin !== undefined) stdin.write(opts.stdin);
      stdin.end();
    }
  });
}
