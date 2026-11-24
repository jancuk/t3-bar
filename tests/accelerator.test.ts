import { describe, expect, it } from 'vitest';
import { formatAccelerator } from '../src/shared/accelerator';

describe('formatAccelerator', () => {
  it('maps modifiers to symbols', () => {
    expect(formatAccelerator('Control+Option+T')).toEqual(['⌃', '⌥', 'T']);
    expect(formatAccelerator('Command+Shift+k')).toEqual(['⌘', '⇧', 'K']);
    expect(formatAccelerator('CmdOrCtrl+Alt+Space')).toEqual(['⌘', '⌥', 'Space']);
  });
  it('handles named keys and stray whitespace', () => {
    expect(formatAccelerator(' Ctrl + Enter ')).toEqual(['⌃', '↩']);
    expect(formatAccelerator('Alt+F5')).toEqual(['⌥', 'F5']);
  });
  it('returns an empty list for an empty accelerator', () => {
    expect(formatAccelerator('')).toEqual([]);
  });
});
