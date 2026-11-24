import { describe, expect, it } from 'vitest';
import { filterTargets, flattenForNav, groupProjectsByParent, tildify } from '../src/shared/targets';

const home = '/Users/x';
const projects = [
  { id: 'p-b', name: 'beta', path: '/Users/x/code/dev/beta' },
  { id: 'p-a', name: 'Alpha', path: '/Users/x/code/dev/Alpha' },
  { id: 'p-o', name: 'other', path: '/opt/work/other' },
  { id: 'p-h', name: 'dot', path: '/Users/x/dot' },
];

describe('tildify', () => {
  it('shortens paths under home', () => {
    expect(tildify('/Users/x/code/dev', home)).toBe('~/code/dev');
    expect(tildify('/Users/x', home)).toBe('~');
    expect(tildify('/Users/x/', home)).toBe('~');
    expect(tildify('/Users/x/code/', `${home}/`)).toBe('~/code');
  });
  it('leaves outside paths alone', () => {
    expect(tildify('/opt/work', home)).toBe('/opt/work');
    expect(tildify('/Users/xavier/code', home)).toBe('/Users/xavier/code');
  });
});

describe('groupProjectsByParent', () => {
  it('groups by parent, sorts groups and items case-insensitively', () => {
    const g = groupProjectsByParent(projects, home);
    expect(g.map((x) => x.label)).toEqual(['/opt/work', '~', '~/code/dev']);
    expect(g[2]?.items.map((p) => p.name)).toEqual(['Alpha', 'beta']);
  });
});

describe('filterTargets', () => {
  const groups = groupProjectsByParent(projects, home);
  it('returns everything for an empty query', () => {
    const r = filterTargets('  ', groups);
    expect(r.includeNoProject).toBe(true);
    expect(r.groups).toBe(groups);
  });
  it('matches subsequences on name, case-insensitively, and drops empty groups', () => {
    const r = filterTargets('ALP', groups);
    expect(r.groups.map((g) => g.label)).toEqual(['~/code/dev']);
    expect(r.groups[0]?.items.map((p) => p.id)).toEqual(['p-a']);
    expect(r.includeNoProject).toBe(false);
  });
  it('matches a group label and keeps all its items', () => {
    const r = filterTargets('code/dev', groups);
    expect(r.groups[0]?.items).toHaveLength(2);
  });
  it('matches No project by "no project" or "scratch" subsequences', () => {
    expect(filterTargets('scr', groups).includeNoProject).toBe(true);
    expect(filterTargets('nopr', groups).includeNoProject).toBe(true);
    expect(filterTargets('zzz', groups)).toEqual({ includeNoProject: false, groups: [] });
  });
});

describe('flattenForNav', () => {
  it('puts no-project first, then ids in group order', () => {
    const g = groupProjectsByParent(projects, home);
    expect(flattenForNav(g, true)).toEqual(['no-project', 'p-o', 'p-h', 'p-a', 'p-b']);
    expect(flattenForNav(g, false)[0]).toBe('p-o');
  });
});
