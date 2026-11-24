import type { SendResult, StartResult, ThreadDetail, ThreadMessage, ThreadSummary } from '../shared/types';
import { AppError } from './errors';
import type { CliOutput } from './exec';
import type { ErrorCode } from '../shared/types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const CONNECTION_RE = /ECONNREFUSED|ECONNRESET|fetch failed|unable to connect|connection refused|server (is )?not running|no running (t3|server)/i;

export interface ParseOptions {
  /** Code used when exit is 0 but stdout is not JSON. */
  nonJsonCode?: ErrorCode;
  /** Accept empty stdout as `{}`. */
  allowEmpty?: boolean;
  /** Accept non-JSON stdout on exit 0 (when no error text matched) as `{}`. */
  allowNonJson?: boolean;
}

function snippet(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 300 ? `${t.slice(0, 300)}...` : t;
}

function throwMatchedError(text: string): void {
  if (/No T3 Code project matches/i.test(text)) {
    throw new AppError('PROJECT_NOT_FOUND', 'No T3 Code project matches that folder or id');
  }
  if (/is no longer available/i.test(text)) {
    throw new AppError('THREAD_NOT_FOUND', 'That thread is no longer available');
  }
  if (CONNECTION_RE.test(text)) {
    throw new AppError('SERVER_UNREACHABLE', 'Cannot reach the T3 Code server');
  }
}

/** Never trusts exit code 0 alone, and never scans valid JSON data for error phrases. */
export function parseJsonOutput(res: CliOutput, opts: ParseOptions = {}): unknown {
  const out = res.stdout.trim();
  if (res.exitCode === 0 && out !== '') {
    try {
      return JSON.parse(out);
    } catch {
      // Fall through to text-based error classification below.
    }
  }
  throwMatchedError(`${res.stdout}\n${res.stderr}`);
  if (res.exitCode !== 0) {
    throw new AppError('CLI_ERROR', snippet(res.stderr || res.stdout) || `CLI exited with code ${res.exitCode}`);
  }
  if (out === '') {
    if (opts.allowEmpty || opts.allowNonJson) return {};
    throw new AppError(opts.nonJsonCode ?? 'CLI_ERROR', 'CLI returned no output');
  }
  if (opts.allowNonJson) return {};
  throw new AppError(opts.nonJsonCode ?? 'CLI_ERROR', `CLI returned non-JSON output: ${snippet(out)}`);
}

export function normalizeThreadSummary(raw: unknown): ThreadSummary | null {
  if (!isObj(raw)) return null;
  const threadId = str(raw.threadId) ?? str(raw.id);
  if (!threadId) return null;
  return {
    threadId,
    title: str(raw.title) ?? 'Untitled thread',
    status: str(raw.status) ?? 'unknown',
    model: str(raw.model),
    provider: str(raw.providerInstanceId) ?? str(raw.provider),
    link: str(raw.link),
    updatedAt: str(raw.updatedAt),
    createdAt: str(raw.createdAt),
    pinned: raw.pinned === true,
    settled: raw.settled === true,
    archived: raw.archived === true,
  };
}

export function normalizeThreadList(raw: unknown): ThreadSummary[] {
  const arr = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.threads) ? raw.threads : null;
  if (!arr) throw new AppError('CLI_ERROR', 'Unexpected thread list format');
  const out: ThreadSummary[] = [];
  for (const item of arr) {
    const t = normalizeThreadSummary(item);
    if (t) out.push(t);
  }
  return out;
}

function normalizeMessage(raw: unknown): ThreadMessage | null {
  if (!isObj(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text : typeof raw.content === 'string' ? raw.content : null;
  if (text === null) return null;
  return { role: str(raw.role) ?? 'unknown', text, createdAt: str(raw.createdAt) };
}

export function normalizeThreadDetail(raw: unknown): ThreadDetail {
  if (!isObj(raw)) throw new AppError('CLI_ERROR', 'Unexpected thread format');
  const thread = normalizeThreadSummary(raw.thread ?? raw);
  if (!thread) throw new AppError('CLI_ERROR', 'Thread data is missing an id');
  const messages: ThreadMessage[] = [];
  if (Array.isArray(raw.messages)) {
    for (const m of raw.messages) {
      const n = normalizeMessage(m);
      if (n) messages.push(n);
    }
  }
  const t = isObj(raw.thread) ? raw.thread : raw;
  const pending = typeof t.pendingRequestCount === 'number' ? t.pendingRequestCount : 0;
  return { thread, messages, pendingRequestCount: pending };
}

function parseIdAndLink(raw: unknown): { threadId?: string; link?: string } {
  if (!isObj(raw)) return {};
  const inner = isObj(raw.thread) ? raw.thread : null;
  return {
    threadId: str(raw.threadId) ?? str(inner?.threadId) ?? str(raw.id) ?? str(inner?.id),
    link: str(raw.link) ?? str(inner?.link),
  };
}

export function parseSendResult(raw: unknown): SendResult {
  return parseIdAndLink(raw);
}

export function parseStartResult(raw: unknown): StartResult {
  return parseIdAndLink(raw);
}
