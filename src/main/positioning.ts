export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }

export interface LauncherPositionInput {
  workArea: Rect;
  windowSize: Size;
  /** Fraction of the work area height where the window top sits. */
  topRatio?: number;
  margin?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Top-left for a Spotlight-style launcher: centered horizontally, in the upper third, kept on screen. */
export function computeLauncherPosition(input: LauncherPositionInput): Point {
  const { workArea, windowSize, topRatio = 0.2, margin = 8 } = input;
  const x = workArea.x + Math.round((workArea.width - windowSize.width) / 2);
  const y = workArea.y + Math.round(workArea.height * topRatio);
  return {
    x: clamp(x, workArea.x + margin, workArea.x + workArea.width - windowSize.width - margin),
    y: clamp(y, workArea.y, workArea.y + workArea.height - windowSize.height - margin),
  };
}

export interface PillPositionInput {
  position: 'top-right' | 'cursor';
  cursor: Point;
  workArea: Rect;
  pillSize: Size;
  margin?: number;
  offset?: number;
}

/** Top-left for the clipboard pill: the work area's top-right corner, or just below and right of the cursor. */
export function computePillPosition(input: PillPositionInput): Point {
  const { position, cursor, workArea: wa, pillSize, margin = 12, offset = 16 } = input;
  const maxX = wa.x + wa.width - pillSize.width;
  const maxY = wa.y + wa.height - pillSize.height;
  if (position === 'top-right') return { x: wa.x + wa.width - pillSize.width - margin, y: wa.y + margin };
  let x = cursor.x + margin;
  let y = cursor.y + offset;
  if (x + pillSize.width > wa.x + wa.width) x = cursor.x - margin - pillSize.width;
  if (y + pillSize.height > wa.y + wa.height) y = cursor.y - offset - pillSize.height;
  return { x: clamp(x, wa.x, maxX), y: clamp(y, wa.y, maxY) };
}
