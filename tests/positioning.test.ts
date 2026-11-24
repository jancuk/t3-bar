import { describe, expect, it } from 'vitest';
import { computeLauncherPosition, computePillPosition } from '../src/main/positioning';

const workArea = { x: 0, y: 24, width: 1440, height: 875 };
const windowSize = { width: 640, height: 440 };

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
    expect(computeLauncherPosition({ workArea: wa, windowSize, topRatio: 0.9 }).y).toBe(500 - 440 - 8);
  });
  it('pins safely on screens smaller than the window', () => {
    const small = { x: 0, y: 0, width: 300, height: 300 };
    const p = computeLauncherPosition({ workArea: small, windowSize });
    expect(p).toEqual({ x: 8, y: 0 });
  });
});

describe('computePillPosition', () => {
  const pillSize = { width: 344, height: 44 };
  const wa = { x: 0, y: 24, width: 1440, height: 875 };
  const cursor0 = { x: 500, y: 400 };

  it('top-right sits in the corner of the primary work area', () => {
    expect(computePillPosition({ position: 'top-right', cursor: cursor0, workArea: wa, pillSize })).toEqual({ x: 1440 - 344 - 12, y: 24 + 12 });
  });
  it('top-right honors a secondary display offset', () => {
    const second = { x: 1440, y: 25, width: 1920, height: 1000 };
    expect(computePillPosition({ position: 'top-right', cursor: { x: 2000, y: 300 }, workArea: second, pillSize })).toEqual({
      x: 1440 + 1920 - 344 - 12,
      y: 25 + 12,
    });
  });
  it('cursor goes below and right of the pointer', () => {
    expect(computePillPosition({ position: 'cursor', cursor: cursor0, workArea: wa, pillSize })).toEqual({ x: 512, y: 416 });
  });
  it('cursor flips left near the right edge', () => {
    const p = computePillPosition({ position: 'cursor', cursor: { x: 1400, y: 400 }, workArea: wa, pillSize });
    expect(p).toEqual({ x: 1400 - 12 - 344, y: 416 });
  });
  it('cursor flips up near the bottom edge', () => {
    const p = computePillPosition({ position: 'cursor', cursor: { x: 500, y: 890 }, workArea: wa, pillSize });
    expect(p).toEqual({ x: 512, y: 890 - 16 - 44 });
  });
  it('clamps inside a tiny work area', () => {
    const tiny = { x: 10, y: 10, width: 200, height: 30 };
    const p = computePillPosition({ position: 'cursor', cursor: { x: 100, y: 20 }, workArea: tiny, pillSize });
    expect(p).toEqual({ x: 10, y: 10 });
  });
});
