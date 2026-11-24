import { describe, expect, it } from 'vitest';
import { shortRelativeTime } from '../src/renderer/lib/format';

const now = Date.parse('2026-11-24T12:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('shortRelativeTime', () => {
  it('shows now under a minute', () => {
    expect(shortRelativeTime(ago(5_000), now)).toBe('now');
    expect(shortRelativeTime(ago(59_000), now)).toBe('now');
    expect(shortRelativeTime(ago(-30_000), now)).toBe('now');
  });
  it('uses minutes, hours and days', () => {
    expect(shortRelativeTime(ago(2 * MIN), now)).toBe('2m');
    expect(shortRelativeTime(ago(14 * MIN), now)).toBe('14m');
    expect(shortRelativeTime(ago(15 * HOUR), now)).toBe('15h');
    expect(shortRelativeTime(ago(3 * DAY), now)).toBe('3d');
  });
  it('falls back to a short date after a week', () => {
    expect(shortRelativeTime(new Date(2026, 9, 3, 12).toISOString(), now)).toBe('Oct 3');
  });
  it('returns an empty string for missing or invalid dates', () => {
    expect(shortRelativeTime(undefined, now)).toBe('');
    expect(shortRelativeTime('nope', now)).toBe('');
  });
});
