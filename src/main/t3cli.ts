import os from 'node:os';
import type { SendResult, StartResult, ThreadDetail, ThreadSummary } from '../shared/types';
import type { CliOutput, RunCliOptions } from './exec';
import {
  normalizeThreadDetail,
  normalizeThreadList,
  parseJsonOutput,
  parseSendResult,
  parseStartResult,
} from './parse';

// Rules: flags (including --json) always come BEFORE positionals, messages go
// through stdin ("-"), and --wait is never passed.

export const listArgs = (target: string): string[] => ['thread', 'list', '--json', '--project', target];

export const showArgs = (threadId: string, count: number): string[] => [
  'thread', 'show', '--json', '--messages', String(count), threadId,
];

export const sendArgs = (threadId: string): string[] => ['thread', 'send', '--json', threadId, '-'];

export const startArgs = (target: string, title?: string): string[] => [
  'thread', 'start', '--json', ...(title ? ['--title', title] : []), target, '-',
];

export const appArgs = (path: string): string[] => ['app', path];

export const TIMEOUTS = { list: 15_000, show: 15_000, send: 30_000, start: 30_000, app: 10_000 } as const;

export type RunFn = (opts: RunCliOptions) => Promise<CliOutput>;

export interface T3Client {
  listThreads(target: string): Promise<ThreadSummary[]>;
  showThread(threadId: string, count: number): Promise<ThreadDetail>;
  sendMessage(threadId: string, text: string): Promise<SendResult>;
  startThread(target: string, text: string, title?: string): Promise<StartResult>;
  openApp(path: string): Promise<void>;
}

export function createT3Client(deps: { getCliPath: () => string; run: RunFn; cwd?: string }): T3Client {
  const cwd = deps.cwd ?? os.homedir();
  const call = (args: string[], timeoutMs: number, stdin?: string) =>
    deps.run({ file: deps.getCliPath(), args, stdin, timeoutMs, cwd });

  return {
    async listThreads(target) {
      const res = await call(listArgs(target), TIMEOUTS.list);
      return normalizeThreadList(parseJsonOutput(res, { nonJsonCode: 'PROJECT_NOT_FOUND' }));
    },
    async showThread(threadId, count) {
      const res = await call(showArgs(threadId, count), TIMEOUTS.show);
      return normalizeThreadDetail(parseJsonOutput(res, { nonJsonCode: 'THREAD_NOT_FOUND' }));
    },
    async sendMessage(threadId, text) {
      const res = await call(sendArgs(threadId), TIMEOUTS.send, text);
      return parseSendResult(parseJsonOutput(res, { allowEmpty: true, allowNonJson: true }));
    },
    async startThread(target, text, title) {
      const res = await call(startArgs(target, title), TIMEOUTS.start, text);
      return parseStartResult(parseJsonOutput(res, { allowEmpty: true, allowNonJson: true }));
    },
    async openApp(path) {
      const res = await call(appArgs(path), TIMEOUTS.app);
      parseJsonOutput(res, { allowEmpty: true, allowNonJson: true });
    },
  };
}
