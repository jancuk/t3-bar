import { NO_PROJECT_ID, type SavedProject } from './types';

export interface TargetGroup {
  key: string;
  label: string;
  items: SavedProject[];
}

const cmp = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

/** Pure POSIX dirname so this file stays safe in the browser bundle. */
export function dirname(p: string): string {
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  const i = trimmed.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return trimmed.slice(0, i);
}

/** `/Users/x/code/dev` -> `~/code/dev` when `home` is `/Users/x`. */
export function tildify(p: string, home: string): string {
  const h = home.length > 1 ? home.replace(/\/+$/, '') : home;
  const v = p.length > 1 ? p.replace(/\/+$/, '') : p;
  if (!h || h === '/') return v;
  if (v === h) return '~';
  if (v.startsWith(`${h}/`)) return `~${v.slice(h.length)}`;
  return v;
}

export function groupProjectsByParent(projects: SavedProject[], home: string): TargetGroup[] {
  const map = new Map<string, SavedProject[]>();
  for (const p of projects) {
    const key = dirname(p.path);
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  const groups: TargetGroup[] = [];
  for (const [key, items] of map) {
    groups.push({ key, label: tildify(key, home), items: [...items].sort((a, b) => cmp(a.name, b.name)) });
  }
  return groups.sort((a, b) => cmp(a.label, b.label));
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
  return i === needle.length;
}

export function filterTargets(
  query: string,
  groups: TargetGroup[],
): { includeNoProject: boolean; groups: TargetGroup[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { includeNoProject: true, groups };
  const includeNoProject = isSubsequence(q, 'no project') || isSubsequence(q, 'scratch');
  const out: TargetGroup[] = [];
  for (const g of groups) {
    const groupHit = isSubsequence(q, g.label.toLowerCase());
    const items = groupHit ? g.items : g.items.filter((p) => isSubsequence(q, p.name.toLowerCase()));
    if (items.length) out.push({ ...g, items });
  }
  return { includeNoProject, groups: out };
}

export function flattenForNav(groups: TargetGroup[], includeNoProject: boolean): string[] {
  const ids: string[] = includeNoProject ? [NO_PROJECT_ID] : [];
  for (const g of groups) for (const p of g.items) ids.push(p.id);
  return ids;
}
