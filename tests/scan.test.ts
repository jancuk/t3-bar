import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/main/errors';
import { projectIdFor } from '../src/main/paths';
import { filterScanEntries, mapLimit, scanParentFolder } from '../src/main/scan';

const d = (name: string, dir = true) => ({ name, isDirectory: () => dir });

describe('filterScanEntries', () => {
  it('keeps only plain directories, skips hidden and denylisted, sorts', () => {
    const r = filterScanEntries([
      d('zeta'), d('alpha'), d('.git'), d('.hidden'), d('node_modules'), d('Library'), d('dist'),
      d('build'), d('target'), d('vendor'), d('file.txt', false), d('a/b'), d('nul\0'),
    ]);
    expect(r).toEqual({ names: ['alpha', 'zeta'], truncated: false });
  });
  it('caps at max and reports truncation', () => {
    const many = Array.from({ length: 55 }, (_, i) => d(`p${String(i).padStart(2, '0')}`));
    const r = filterScanEntries(many);
    expect(r.names).toHaveLength(40);
    expect(r.truncated).toBe(true);
    expect(filterScanEntries(many, { max: 55 }).truncated).toBe(false);
  });
});

describe('mapLimit', () => {
  it('never exceeds the concurrency limit and keeps result order', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });
});

describe('scanParentFolder', () => {
  let root: string;
  let scratch: string;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 't3w-scan-')));
    scratch = path.join(root, '.t3', 'scratch');
    mkdirSync(scratch, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const notFound = () => new AppError('PROJECT_NOT_FOUND', 'nope');
  const mk = (...names: string[]) => {
    const parent = path.join(root, 'code');
    mkdirSync(parent, { recursive: true });
    for (const n of names) mkdirSync(path.join(parent, n));
    return parent;
  };

  it('adds projects, counts the rest, skips symlinks and files', async () => {
    const parent = mk('app', 'lib', 'saved', 'plain');
    writeFileSync(path.join(parent, 'README.md'), 'x');
    symlinkSync(path.join(parent, 'app'), path.join(parent, 'link'));
    const projects = new Set([path.join(parent, 'app'), path.join(parent, 'lib')]);
    const probed: string[] = [];
    const r = await scanParentFolder(parent, {
      scratch,
      savedPaths: new Set([path.join(parent, 'saved')]),
      listThreads: async (t) => {
        probed.push(t);
        if (t === parent || !projects.has(t)) throw notFound();
        return [];
      },
    });
    expect(probed).not.toContain(path.join(parent, 'link'));
    expect(probed).not.toContain(path.join(parent, 'saved'));
    expect(r.added.map((p) => p.name)).toEqual(['app', 'lib']);
    expect(r.added[0]).toEqual({ id: projectIdFor(path.join(parent, 'app')), name: 'app', path: path.join(parent, 'app') });
    expect(r).toMatchObject({ parent, scanned: 4, truncated: false, alreadySaved: 1, notProjects: 1, failed: 0 });
  });

  it('refuses when the parent is itself a project', async () => {
    const parent = mk('a');
    await expect(scanParentFolder(parent, { scratch, savedPaths: new Set(), listThreads: async () => [] })).rejects.toThrow(
      'This folder is inside a T3 Code project. Use Add folder instead.',
    );
  });

  it('rethrows non-PROJECT_NOT_FOUND errors from the parent probe', async () => {
    const parent = mk('a');
    await expect(
      scanParentFolder(parent, { scratch, savedPaths: new Set(), listThreads: async () => { throw new AppError('CLI_TIMEOUT', 't'); } }),
    ).rejects.toMatchObject({ code: 'CLI_TIMEOUT' });
  });

  it('rejects /, home and scratch', async () => {
    const deps = { scratch, savedPaths: new Set<string>(), listThreads: async () => { throw notFound(); } };
    await expect(scanParentFolder('/', deps)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(scanParentFolder(root, { ...deps, homeDir: root })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(scanParentFolder(scratch, deps)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    mkdirSync(path.join(scratch, 'inner'));
    await expect(scanParentFolder(path.join(scratch, 'inner'), deps)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('probes at most 4 at a time', async () => {
    const parent = mk(...Array.from({ length: 12 }, (_, i) => `d${i}`));
    let running = 0;
    let peak = 0;
    await scanParentFolder(parent, {
      scratch,
      savedPaths: new Set(),
      listThreads: async (t) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        throw notFound();
      },
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('never probes scratch when scanning its parent folder', async () => {
    const parent = path.join(root, '.t3');
    mkdirSync(path.join(parent, 'other'), { recursive: true });
    const probed: string[] = [];
    const r = await scanParentFolder(parent, {
      scratch,
      savedPaths: new Set(),
      listThreads: async (t) => {
        probed.push(t);
        if (t === parent) throw notFound();
        return [];
      },
    });
    expect(probed).not.toContain(scratch);
    expect(r.added.map((p) => p.name)).toEqual(['other']);
  });

  it('aborts early with CLI_NOT_FOUND and stops probing', async () => {
    const parent = mk(...Array.from({ length: 20 }, (_, i) => `d${String(i).padStart(2, '0')}`));
    let calls = 0;
    await expect(
      scanParentFolder(parent, {
        scratch,
        savedPaths: new Set(),
        listThreads: async (t) => {
          calls++;
          if (t === parent) throw notFound();
          throw new AppError('CLI_NOT_FOUND', 'missing');
        },
      }),
    ).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
    expect(calls).toBeLessThanOrEqual(1 + 4);
  });

  it('counts per-folder failures without aborting', async () => {
    const parent = mk('a', 'b');
    const r = await scanParentFolder(parent, {
      scratch,
      savedPaths: new Set(),
      listThreads: async (t) => {
        if (t === parent) throw notFound();
        if (t.endsWith('/a')) throw new AppError('CLI_TIMEOUT', 'slow');
        return [];
      },
    });
    expect(r).toMatchObject({ failed: 1, notProjects: 0 });
    expect(r.added.map((p) => p.name)).toEqual(['b']);
  });

  it('flags truncation when more than 40 folders exist', async () => {
    const parent = mk(...Array.from({ length: 45 }, (_, i) => `d${String(i).padStart(2, '0')}`));
    const r = await scanParentFolder(parent, { scratch, savedPaths: new Set(), listThreads: async () => { throw notFound(); } });
    expect(r.scanned).toBe(40);
    expect(r.truncated).toBe(true);
  });
});
