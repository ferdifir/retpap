/**
 * Freehand drawing layer. Strokes are stored in the same coordinate space as
 * reaction spots: 0..1 relative to the rendered media box, so a line lands on
 * the same part of the photo on every screen and inside letterboxed video.
 */

export type DrawPoint = [x: number, y: number];

export type DrawStroke = {
  /** Hex colour, or "erase" to punch a hole in earlier strokes. */
  color: string;
  /** Line width as a fraction of the media width, so it scales with the photo. */
  width: number;
  points: DrawPoint[];
};

export const ERASER_COLOR = "erase";

export const DRAW_COLORS = ["#ffffff", "#fbbf24", "#22d3ee", "#fb7185"] as const;

export const DRAW_WIDTHS = [0.004, 0.011] as const;

/** Guard rails: a canvas, not a place to park megabytes of JSON. */
const MAX_STROKES = 200;
const MAX_POINTS_PER_STROKE = 1500;
const MAX_TOTAL_POINTS = 20000;
const MIN_WIDTH = 0.001;
const MAX_WIDTH = 0.05;

const HEX = /^#[0-9a-f]{6}$/i;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Server-side sanitiser. Anything that does not look like a stroke is dropped
 * rather than rejected, so one bad point cannot cost the user the whole canvas.
 */
export function sanitiseStrokes(value: unknown): DrawStroke[] {
  if (!Array.isArray(value)) return [];

  const strokes: DrawStroke[] = [];
  let total = 0;

  for (const raw of value) {
    if (strokes.length >= MAX_STROKES || total >= MAX_TOTAL_POINTS) break;
    if (typeof raw !== "object" || raw === null) continue;

    const entry = raw as { color?: unknown; width?: unknown; points?: unknown };
    const color =
      entry.color === ERASER_COLOR
        ? ERASER_COLOR
        : typeof entry.color === "string" && HEX.test(entry.color)
          ? entry.color
          : null;
    if (!color) continue;

    const width =
      typeof entry.width === "number" && Number.isFinite(entry.width)
        ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, entry.width))
        : DRAW_WIDTHS[0];

    if (!Array.isArray(entry.points)) continue;

    const points: DrawPoint[] = [];
    for (const point of entry.points) {
      if (points.length >= MAX_POINTS_PER_STROKE || total >= MAX_TOTAL_POINTS) break;
      if (!Array.isArray(point) || point.length < 2) continue;
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([clamp01(x), clamp01(y)]);
      total += 1;
    }

    if (points.length > 0) strokes.push({ color, width, points });
  }

  return strokes;
}
