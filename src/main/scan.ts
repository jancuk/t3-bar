import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SavedProject, ScanResult } from '../shared/types';
import { AppError } from './errors';
import { projectIdFor } from './paths';
import { TIMEOUTS } from './t3cli';

const DENYLIST = new Set(['node_modules', '.git', 'Library', 'dist', 'build', 'target', 'vendor']);
const MAX_RAW_ENTRIES = 2000;
const ABORT_CODES = new Set(['CLI_NOT_FOUND', 'SERVER_UNREACHABLE', 'T3_APP_MISSING']);

export interface ScanDirent {
  name: string;
  isDirectory(): boolean;
}

/** Keeps real directories only (opendir/readdir report symlinks as non-directories). */
export function filterScanEntries(
  dirents: ScanDirent[],
  opts: { max?: number } = {},
): { names: string[]; truncated: boolean } {
  const max = opts.max ?? 40;
  const names = dirents
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n.length > 0 && !n.startsWith('.') && !DENYLIST.has(n) && !n.includes('/') && !n.includes('\0'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { names: names.slice(0, max), truncated: names.length > max };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export interface ScanDeps {
  listThreads(target: string, timeoutMs?: number): Promise<unknown>;
  savedPaths: Set<string>;
  scratch: string;
  homeDir?: string;
  /** Defaults to fs.opendir; injectable for tests. */
  readdir?(dir: string, max: number): Promise<{ entries: ScanDirent[]; truncatedRaw: boolean }>;
  realpath?(p: string): Promise<string>;
}

async function readDirCapped(dir: string, max: number): Promise<{ entries: ScanDirent[]; truncatedRaw: boolean }> {
  const handle = await fs.opendir(dir);
  const entries: ScanDirent[] = [];
  let truncatedRaw = false;
  try {
    for await (const d of handle) {
      if (entries.length >= max) { truncatedRaw = true; break; }
      entries.push(d);
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
  return { entries, truncatedRaw };
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);

export async function scanParentFolder(dir: string, deps: ScanDeps): Promise<ScanResult> {
  const realpath = deps.realpath ?? fs.realpath;
  const base = await realpath(dir);
  const scratchReal = await realpath(deps.scratch).catch(() => deps.scratch);
  if (base === '/' || (deps.homeDir && base === deps.homeDir)) {
    throw new AppError('VALIDATION_ERROR', 'That folder is too broad to scan. Pick a folder that holds your projects.');
  }
  if (inside(base, deps.scratch) || inside(base, scratchReal)) {
    throw new AppError('VALIDATION_ERROR', 'Already available as No project');
  }

  try {
    await deps.listThreads(base, TIMEOUTS.probe);
    throw new AppError('VALIDATION_ERROR', 'This folder is inside a T3 Code project. Use Add folder instead.');
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== 'PROJECT_NOT_FOUND') throw e;
  }

  const { entries, truncatedRaw } = await (deps.readdir ?? readDirCapped)(base, MAX_RAW_ENTRIES);
  const { names, truncated } = filterScanEntries(entries, { max: 40 });

  let alreadySaved = 0;
  const toProbe: string[] = [];
  for (const name of names) {
    const full = path.join(base, name);
    if (inside(full, deps.scratch) || inside(full, scratchReal)) continue;
    if (deps.savedPaths.has(full)) alreadySaved++;
    else toProbe.push(full);
  }

  const added: SavedProject[] = [];
  let notProjects = 0;
  let failed = 0;
  let fatal: AppError | null = null;

  await mapLimit(toProbe, 4, async (full) => {
    if (fatal) { failed++; return; }
    try {
      await deps.listThreads(full, TIMEOUTS.probe);
      added.push({ id: projectIdFor(full), name: path.basename(full), path: full });
    } catch (e) {
      if (e instanceof AppError && e.code === 'PROJECT_NOT_FOUND') notProjects++;
      else {
        failed++;
        if (e instanceof AppError && ABORT_CODES.has(e.code)) fatal = e;
      }
    }
  });

  // Nothing could be checked at all: surface the real cause instead of an empty summary.
  if (fatal && added.length === 0 && notProjects === 0) throw fatal;

  added.sort((a, b) => (a.name < b.name ? -1 : 1));
  return {
    parent: base,
    scanned: names.length,
    truncated: truncated || truncatedRaw,
    added,
    alreadySaved,
    notProjects,
    failed,
  };
}
