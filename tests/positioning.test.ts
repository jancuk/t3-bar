import { describe, expect, it } from 'vitest';
import { computePopupPosition } from '../src/main/positioning';

const workArea = { x: 0, y: 24, width: 1440, height: 875 };
const windowSize = { width: 400, height: 560 };

describe('computePopupPosition', () => {
  it('centers under the tray icon', () => {
    const p = computePopupPosition({ trayBounds: { x: 1000, y: 0, width: 24, height: 24 }, cursor: { x: 0, y: 0 }, windowSize, workArea });
    expect(p).toEqual({ x: 812, y: 28 });
  });
  it('clamps to the right edge with margin', () => {
    const p = computePopupPosition({ trayBounds: { x: 1430, y: 0, width: 24, height: 24 }, cursor: { x: 0, y: 0 }, windowSize, workArea });
    expect(p.x).toBe(1440 - 400 - 8);
  });
  it('clamps to the left edge with margin', () => {
    const p = computePopupPosition({ trayBounds: { x: 0, y: 0, width: 20, height: 24 }, cursor: { x: 0, y: 0 }, windowSize, workArea });
    expect(p.x).toBe(8);
  });
  it('falls back to the cursor when tray bounds are missing or empty', () => {
    const a = computePopupPosition({ cursor: { x: 700, y: 10 }, windowSize, workArea });
    const b = computePopupPosition({ trayBounds: { x: 0, y: 0, width: 0, height: 0 }, cursor: { x: 700, y: 10 }, windowSize, workArea });
    expect(a).toEqual(b);
    expect(a.x).toBe(500);
  });
  it('flips above the anchor when there is no room below', () => {
    const p = computePopupPosition({ trayBounds: { x: 600, y: 850, width: 24, height: 24 }, cursor: { x: 0, y: 0 }, windowSize, workArea });
    expect(p.y).toBe(850 - 4 - 560);
  });
  it('stays inside the work area on tiny screens', () => {
    const small = { x: 0, y: 0, width: 300, height: 300 };
    const p = computePopupPosition({ cursor: { x: 10, y: 10 }, windowSize, workArea: small });
    expect(p).toEqual({ x: 8, y: 0 });
  });
  it('supports a secondary display with a non-zero origin', () => {
    const wa = { x: 1440, y: 25, width: 1920, height: 1000 };
    const p = computePopupPosition({ trayBounds: { x: 3000, y: 0, width: 24, height: 24 }, cursor: { x: 0, y: 0 }, windowSize, workArea: wa });
    expect(p.x).toBeGreaterThanOrEqual(1448);
    expect(p.x + 400).toBeLessThanOrEqual(3360 - 8);
  });
});
