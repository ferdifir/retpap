"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, EraserIcon, TrashIcon, UndoIcon } from "@/components/icons";
import type { ImageBox } from "@/hooks/use-image-box";
import { cn } from "@/lib/cn";
import {
  DRAW_COLORS,
  DRAW_WIDTHS,
  ERASER_COLOR,
  type DrawPoint,
  type DrawStroke,
} from "@/lib/draw";

/** Colour, thickness and eraser mode, owned by the card so the toolbar and the
 *  canvas never drift apart. */
export type DrawTool = { color: string; width: number; erasing: boolean };

export const DEFAULT_DRAW_TOOL: DrawTool = {
  color: DRAW_COLORS[0],
  width: DRAW_WIDTHS[1],
  erasing: false,
};

/** Brush size limits, mirrored by the sanitiser in lib/draw. */
const MIN_WIDTH = 0.002;
const MAX_WIDTH = 0.03;
/** Smallest distance between samples, as a fraction of the media width. */
const SAMPLE_STEP = 0.0025;
const MAX_POINTS = 1500;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  stroke: DrawStroke,
  box: ImageBox,
): number {
  const width = Math.max(1, stroke.width * box.width);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.color === ERASER_COLOR) {
    // Punching a hole keeps the photo underneath intact, so erasing never
    // leaves a white scar over the image.
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
  }

  return width;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawStroke,
  box: ImageBox,
): void {
  const width = applyStrokeStyle(ctx, stroke, box);
  const points = stroke.points;
  if (points.length === 0) return;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0] * box.width, points[0][1] * box.height, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0][0] * box.width, points[0][1] * box.height);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index][0] * box.width, points[index][1] * box.height);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

/** Sizes the bitmap for the current box and repaints every stroke on it. */
function paintAll(canvas: HTMLCanvasElement, box: ImageBox, strokes: DrawStroke[]): void {
  if (box.width <= 0 || box.height <= 0) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  for (const stroke of strokes) drawStroke(ctx, stroke, box);
}

/**
 * Read-only view of the signed-in user's own canvas, shown while they browse
 * the photo normally. Hidden with the photo when 18+ content is still blurred.
 */
export function DrawingOverlay({ box, strokes }: { box: ImageBox; strokes: DrawStroke[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) paintAll(canvas, box, strokes);
  }, [box, strokes]);

  if (strokes.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute z-20 select-none"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    />
  );
}

type DrawCanvasProps = {
  /** Where object-contain actually paints the media, measured by the card. */
  box: ImageBox;
  strokes: DrawStroke[];
  tool: DrawTool;
  /** Called after every finished stroke. */
  onCommit: (strokes: DrawStroke[]) => void;
};

/**
 * Freehand layer over the media. Strokes are normalised (0..1) exactly like
 * reaction spots, so the drawing stays on the same part of the photo when the
 * screen size changes, and it is drawn on the image box rather than the
 * letterboxed container.
 */
export function DrawCanvas({ box, strokes, tool, onCommit }: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = useRef<DrawStroke | null>(null);
  const lastPoint = useRef<DrawPoint | null>(null);

  // Repaint from the stored strokes: the canvas is a view of state, never the
  // source of truth, so undo and resize are the same code path.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    paintAll(canvas, box, active.current ? [...strokes, active.current] : strokes);
  }, [box, strokes]);

  const toPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): DrawPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [0, 0];
    return [
      clamp01((event.clientX - rect.left) / rect.width),
      clamp01((event.clientY - rect.top) / rect.height),
    ];
  }, []);

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPoint(event);
    const stroke: DrawStroke = {
      color: tool.erasing ? ERASER_COLOR : tool.color,
      width: tool.width,
      points: [point],
    };

    active.current = stroke;
    lastPoint.current = point;
    drawStroke(ctx, stroke, box);
  };

  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = active.current;
    const previous = lastPoint.current;
    if (!stroke || !previous) return;
    if (stroke.points.length >= MAX_POINTS) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const point = toPoint(event);
    // Skip micro-moves: they add JSON weight without changing the line.
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < SAMPLE_STEP) return;

    stroke.points.push(point);
    lastPoint.current = point;

    applyStrokeStyle(ctx, stroke, box);
    ctx.beginPath();
    ctx.moveTo(previous[0] * box.width, previous[1] * box.height);
    ctx.lineTo(point[0] * box.width, point[1] * box.height);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const handleUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const stroke = active.current;
    active.current = null;
    lastPoint.current = null;
    if (!stroke) return;

    onCommit([...strokes, stroke]);
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Kanvas gambar"
      className="absolute z-30 touch-none select-none"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    />
  );
}

type DrawToolbarProps = {
  tool: DrawTool;
  canUndo: boolean;
  onTool: (tool: DrawTool) => void;
  onUndo: () => void;
  onClear: () => void;
  /** Close and keep what was drawn. */
  onDone: () => void;
  /** Close and throw away everything drawn in this session. */
  onCancel: () => void;
};

/**
 * Sits in the card footer, where the caption and the deck buttons normally are:
 * the photo keeps its full height while drawing, and there is room for the
 * colour, size and cancel controls.
 */
export function DrawToolbar({
  tool,
  canUndo,
  onTool,
  onUndo,
  onClear,
  onDone,
  onCancel,
}: DrawToolbarProps) {
  const preview = 4 + ((tool.width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)) * 16;
  const swatch = tool.erasing ? "#94a3b8" : tool.color;
  const toolClass = "grid size-7 place-items-center rounded-full transition-colors";

  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5">
          {DRAW_COLORS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-label={"Warna " + entry}
              aria-pressed={!tool.erasing && tool.color === entry}
              onClick={() => onTool({ ...tool, color: entry, erasing: false })}
              className={cn(
                "size-6 rounded-full border-2 transition-transform",
                !tool.erasing && tool.color === entry
                  ? "scale-110 border-white"
                  : "border-slate-600",
              )}
              style={{ backgroundColor: entry }}
            />
          ))}

          <label
            className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-slate-500"
            title="Warna lain"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full opacity-70"
              style={{
                background:
                  "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #22d3ee, #a78bfa, #f87171)",
              }}
            />
            <span
              className="relative size-2.5 rounded-full ring-1 ring-slate-950"
              style={{ backgroundColor: swatch }}
            />
            <input
              type="color"
              value={tool.color}
              aria-label="Pilih warna lain"
              onChange={(event) => onTool({ ...tool, color: event.target.value, erasing: false })}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center">
            <span
              className="rounded-full"
              style={{ width: preview, height: preview, backgroundColor: swatch }}
            />
          </span>
          <input
            type="range"
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            step={0.001}
            value={tool.width}
            aria-label="Ukuran kuas"
            onChange={(event) => onTool({ ...tool, width: Number(event.target.value) })}
            className="h-1 w-0 min-w-0 flex-1 accent-cyan-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-300 active:scale-95"
        >
          Batal
        </button>

        <button
          type="button"
          aria-label="Penghapus"
          aria-pressed={tool.erasing}
          onClick={() => onTool({ ...tool, erasing: !tool.erasing })}
          className={cn(
            toolClass,
            tool.erasing ? "bg-amber-400 text-slate-950" : "text-slate-300 hover:bg-slate-800",
          )}
        >
          <EraserIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Batalkan goresan terakhir"
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(toolClass, "text-slate-300 hover:bg-slate-800 disabled:opacity-35")}
        >
          <UndoIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Hapus semua gambar"
          onClick={onClear}
          disabled={!canUndo}
          className={cn(toolClass, "text-rose-300 hover:bg-rose-500/20 disabled:opacity-35")}
        >
          <TrashIcon className="size-4" />
        </button>

        <button
          type="button"
          onClick={onDone}
          className="ml-auto flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-3 py-1.5 text-[10px] font-extrabold text-slate-950 active:scale-95"
        >
          <CheckIcon className="size-3.5" />
          <span>Selesai</span>
        </button>
      </div>
    </div>
  );
}
