export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }

export interface PositionInput {
  trayBounds?: Rect;
  cursor: Point;
  windowSize: Size;
  workArea: Rect;
  margin?: number;
  gap?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Popup top-left. Centered under the tray icon (or the cursor if no bounds),
 * clamped inside the work area. Flips above the anchor when there is no room below.
 */
export function computePopupPosition(input: PositionInput): Point {
  const { trayBounds, cursor, windowSize, workArea, margin = 8, gap = 4 } = input;
  const anchor: Rect =
    trayBounds && trayBounds.width > 0 && trayBounds.height > 0
      ? trayBounds
      : { x: cursor.x, y: cursor.y, width: 0, height: 0 };

  let x = Math.round(anchor.x + anchor.width / 2 - windowSize.width / 2);
  let y = Math.round(anchor.y + anchor.height + gap);

  const bottomLimit = workArea.y + workArea.height - margin;
  if (y + windowSize.height > bottomLimit) {
    const above = Math.round(anchor.y - gap - windowSize.height);
    y = above >= workArea.y ? above : bottomLimit - windowSize.height;
  }

  x = clamp(x, workArea.x + margin, workArea.x + workArea.width - windowSize.width - margin);
  // The work area already starts below the menu bar, so no top margin is added.
  y = clamp(y, workArea.y, workArea.y + workArea.height - windowSize.height - margin);
  return { x, y };
}
