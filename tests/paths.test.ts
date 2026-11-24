import { describe, expect, it } from 'vitest';
import { resolveT3Home, scratchDir } from '../src/main/paths';

describe('resolveT3Home', () => {
  it('defaults to ~/.t3', () => {
    expect(resolveT3Home({}, '/Users/x')).toBe('/Users/x/.t3');
  });
  it('uses an absolute T3CODE_HOME', () => {
    expect(resolveT3Home({ T3CODE_HOME: '/data/t3' }, '/Users/x')).toBe('/data/t3');
  });
  it('ignores empty, relative or NUL values', () => {
    expect(resolveT3Home({ T3CODE_HOME: '' }, '/Users/x')).toBe('/Users/x/.t3');
    expect(resolveT3Home({ T3CODE_HOME: 'rel/t3' }, '/Users/x')).toBe('/Users/x/.t3');
    expect(resolveT3Home({ T3CODE_HOME: '/a\0b' }, '/Users/x')).toBe('/Users/x/.t3');
  });
});

describe('scratchDir', () => {
  it('appends scratch', () => {
    expect(scratchDir('/Users/x/.t3')).toBe('/Users/x/.t3/scratch');
  });
});
