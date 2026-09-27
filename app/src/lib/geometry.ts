export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 40;

/** Clamp a view rect: never zoom out past `fit`, never zoom in past MAX_ZOOM,
 * and keep at least half the view overlapping the artwork while panned. */
export function clampRect(rect: Rect, fit: Rect): Rect {
  const minW = fit.w / MAX_ZOOM;
  const maxW = fit.w;
  let w = Math.min(maxW, Math.max(minW, rect.w));
  const aspect = fit.h / fit.w;
  let h = w * aspect;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let x = cx - w / 2;
  let y = cy - h / 2;

  if (w >= maxW - 1e-9) {
    // At (or beyond) fit zoom: no panning, show the whole artwork centered.
    x = fit.x;
    y = fit.y;
  } else {
    const minX = fit.x - w / 2;
    const maxX = fit.x + fit.w - w / 2;
    const minY = fit.y - h / 2;
    const maxY = fit.y + fit.h - h / 2;
    x = Math.min(Math.max(x, minX), maxX);
    y = Math.min(Math.max(y, minY), maxY);
  }

  return { x, y, w, h };
}

/** Mirror a view rect horizontally within `fit` (for toggling the mirror SVG,
 * which has the same canvas dimensions as the original). */
export function mirrorRect(rect: Rect, fit: Rect): Rect {
  const localX = rect.x - fit.x;
  const mirroredLocalX = fit.w - localX - rect.w;
  return { x: fit.x + mirroredLocalX, y: rect.y, w: rect.w, h: rect.h };
}

/** Scale factor from SVG user units to screen pixels for a given
 * `preserveAspectRatio="xMidYMid meet"` render of `view` into a
 * `containerW`x`containerH` box. */
export function meetScale(view: Rect, containerW: number, containerH: number): number {
  return Math.min(containerW / view.w, containerH / view.h);
}
