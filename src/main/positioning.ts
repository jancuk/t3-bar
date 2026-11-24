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
