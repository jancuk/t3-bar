import { describe, expect, it } from 'vitest';
import { computeLauncherPosition } from '../src/main/positioning';

const workArea = { x: 0, y: 24, width: 1440, height: 875 };
const windowSize = { width: 640, height: 460 };

describe('computeLauncherPosition', () => {
  it('centers horizontally in the upper third', () => {
    expect(computeLauncherPosition({ workArea, windowSize })).toEqual({ x: 400, y: 24 + 175 });
  });
  it('honors a custom top ratio', () => {
    expect(computeLauncherPosition({ workArea, windowSize, topRatio: 0.1 }).y).toBe(24 + Math.round(87.5));
  });
  it('supports a secondary display with a non-zero origin', () => {
    const wa = { x: 1440, y: 25, width: 1920, height: 1000 };
    expect(computeLauncherPosition({ workArea: wa, windowSize })).toEqual({ x: 1440 + 640, y: 25 + 200 });
  });
  it('keeps the window above the bottom margin', () => {
    const wa = { x: 0, y: 0, width: 1000, height: 500 };
    expect(computeLauncherPosition({ workArea: wa, windowSize, topRatio: 0.9 }).y).toBe(500 - 460 - 8);
  });
  it('pins safely on screens smaller than the window', () => {
    const small = { x: 0, y: 0, width: 300, height: 300 };
    const p = computeLauncherPosition({ workArea: small, windowSize });
    expect(p).toEqual({ x: 8, y: 0 });
  });
});
