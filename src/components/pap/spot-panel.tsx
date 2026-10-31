"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { MAX_COMMENT_LENGTH } from "@/lib/comment-rules";
import { cn } from "@/lib/cn";
import type { FeedComment } from "@/lib/feed-types";
import { CaptionText } from "./caption-text";

export type PanelMode = "comments" | "composer";

type SpotPanelProps = {
  x: number;
  y: number;
  above: boolean;
  /** Horizontal centre of the tail, in px from the panel's left edge. */
  tailX: number;
  mode: PanelMode;
  comments: FeedComment[] | null;
  /** Preview mode: slides advance on their own. */
  autoPlay: boolean;
  /** First touch inside the panel hands control back to the user. */
  onInteract: () => void;
  busy: boolean;
  onComment: (body: string) => void;
  onDeleteComment: () => void;
};

/** Tallest a single comment card may get before its text scrolls instead. */
const MAX_CARD_HEIGHT = 220;
const SWIPE_DISTANCE = 40;
/** Dwell time per comment while the automatic preview plays. */
const AUTO_SLIDE_MS = 2000;

const SHELL =
  "spot-panel absolute z-30 rounded-2xl bg-slate-900/97 p-2.5 shadow-2xl shadow-slate-950/70";

function CommentForm({
  placeholder,
  busy,
  onSubmit,
  autoFocus,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (body: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = value.trim();
    if (!body || busy) return;
    onSubmit(body);
    setValue("");
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-slate-600/40 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
      />
      <button
        type="submit"
        disabled={busy || value.trim().length === 0}
        className="rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-950 disabled:opacity-40"
      >
        Kirim
      </button>
    </form>
  );
}

export function SpotPanel({
  x,
  y,
  above,
  tailX,
  mode,
  comments,
  autoPlay,
  onInteract,
  busy,
  onComment,
  onDeleteComment,
}: SpotPanelProps) {
  const accent = "border-cyan-400/50";

  return (
    <div
      role="group"
      aria-label="Titik foto"
      onPointerDown={(event) => {
        event.stopPropagation();
        onInteract();
      }}
      onClick={(event) => event.stopPropagation()}
      className={cn(SHELL, accent, "w-[236px] border")}
      style={{
        left: x,
        top: above ? y - 34 : y + 34,
        transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ left: tailX }}
        className={cn(
          "absolute size-2.5 -translate-x-1/2 rotate-45 bg-slate-900/97",
          above ? "-bottom-1" : "-top-1",
        )}
      />

      {mode === "comments" ? (
        comments === null ? (
          <p className="py-2 text-[10px] text-slate-500">Memuat…</p>
        ) : (
          <CommentCarousel
            comments={comments}
            autoPlay={autoPlay}
            busy={busy}
            onSubmit={onComment}
            onDelete={onDeleteComment}
          />
        )
      ) : null}

      {mode === "composer" ? (
        <CommentForm
          placeholder="Tulis komentar di titik ini…"
          busy={busy}
          onSubmit={onComment}
          autoFocus
        />
      ) : null}
    </div>
  );
}

/**
 * Comments as a horizontal deck: the composer is the first card, every
 * comment after it. No expand/collapse, so a thread of twenty stays one swipe
 * away per comment. The panel height follows the active card, capped so a long
 * comment scrolls inside its card instead of covering the photo.
 */
function CommentCarousel({
  comments,
  autoPlay,
  busy,
  onSubmit,
  onDelete,
}: {
  comments: FeedComment[];
  autoPlay: boolean;
  busy: boolean;
  onSubmit: (body: string) => void;
  onDelete: () => void;
}) {
  const mine = comments.some((comment) => comment.mine);
  // Newest first, always: the deck must not depend on the server's order.
  const ordered = [...comments].sort((a, b) => b.id - a.id);
  const slides: ("form" | FeedComment)[] = mine ? ordered : ["form", ...ordered];

  // Open on the newest comment, not on the composer: the form stays one swipe
  // to the right, the thread reads newest to oldest.
  const [index, setIndex] = useState(slides.length > 1 ? 1 : 0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null; id: number } | null>(null);

  const safeIndex = Math.min(index, slides.length - 1);

  // Preview mode: walk the thread on its own and stop on the last slide. Any
  // manual swipe takes over from there.
  useEffect(() => {
    if (!autoPlay || safeIndex >= slides.length - 1) return;

    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, slides.length - 1));
    }, AUTO_SLIDE_MS);

    return () => window.clearTimeout(timer);
  }, [autoPlay, safeIndex, slides.length]);

  useLayoutEffect(() => {
    const element = slideRefs.current[safeIndex];
    if (!element) return;

    const measure = () => setHeight(Math.min(element.offsetHeight, MAX_CARD_HEIGHT));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [safeIndex, slides.length]);

  const settle = useCallback(
    (delta: number) => {
      if (delta <= -SWIPE_DISTANCE) setIndex((current) => Math.min(current + 1, slides.length - 1));
      if (delta >= SWIPE_DISTANCE) setIndex((current) => Math.max(current - 1, 0));
      setDrag(0);
      setDragging(false);
    },
    [slides.length],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    gesture.current = { x: event.clientX, y: event.clientY, axis: null, id: event.pointerId };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (start.axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      // Vertical intent belongs to the card's own scroll, not the deck.
      if (start.axis === "y") {
        setDragging(false);
        return;
      }
      viewportRef.current?.setPointerCapture(event.pointerId);
    }

    if (start.axis === "x") setDrag(dx);
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.axis !== "x") {
      setDragging(false);
      setDrag(0);
      return;
    }

    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId);
    }

    settle(event.clientX - start.x);
  };

  const isForm = slides[safeIndex] === "form";

  return (
    <div>
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        className="overflow-hidden transition-[height] duration-200"
        style={{ height: height ?? undefined, touchAction: "pan-y" }}
      >
        <div
          className={cn("flex items-start", !dragging && "transition-transform duration-200")}
          style={{ transform: "translateX(calc(" + -safeIndex * 100 + "% + " + drag + "px))" }}
        >
          {slides.map((slide, slideIndex) => (
            <div
              key={slide === "form" ? "form" : slide.id}
              ref={(element) => {
                slideRefs.current[slideIndex] = element;
              }}
              className="w-full shrink-0"
              aria-hidden={slideIndex !== safeIndex}
            >
              {slide === "form" ? (
                <CommentForm
                  placeholder={comments.length > 0 ? "Tulis balasan di titik ini…" : "Tulis komentar di titik ini…"}
                  busy={busy}
                  onSubmit={onSubmit}
                />
              ) : (
                <div className="max-h-[220px] overflow-y-auto pr-1">
                  <CommentLine comment={slide} onDelete={onDelete} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 ? (
        <p className="mt-1.5 text-center text-[9px] font-bold text-slate-500">
          {isForm ? "geser untuk lihat komentar" : safeIndex + 1 + " / " + slides.length}
        </p>
      ) : null}
    </div>
  );
}

function CommentLine({ comment, onDelete }: { comment: FeedComment; onDelete?: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="grid size-4.5 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-[8px] font-black text-white">
          {comment.author.firstName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-[10px] font-bold text-slate-200">
          {comment.mine ? "Kamu" : comment.author.firstName}
        </span>
        {comment.mine && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Hapus komentar"
            className="ml-auto rounded-md px-1 py-0.5 text-[9px] font-bold text-rose-400/90 transition-colors hover:text-rose-300"
          >
            Hapus
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] leading-snug break-words text-slate-300">
        <CaptionText text={comment.body} />
      </p>
    </div>
  );
}
