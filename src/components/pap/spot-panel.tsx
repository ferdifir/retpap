"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { EMOJI_OPTIONS } from "@/lib/data";
import { MAX_COMMENT_LENGTH } from "@/lib/comment-rules";
import { cn } from "@/lib/cn";
import type { FeedComment, FeedSpot } from "@/lib/feed-types";

export type PanelMode = "chooser" | "emoji" | "comments" | "composer";

type SpotPanelProps = {
  x: number;
  y: number;
  above: boolean;
  mode: PanelMode;
  /** Null while drafting a brand new spot. */
  spot: FeedSpot | null;
  comments: FeedComment[] | null;
  busy: boolean;
  onMode: (mode: PanelMode) => void;
  onEmoji: (emoji: string) => void;
  onComment: (body: string) => void;
  onClose: () => void;
};

/** Tallest a single comment card may get before its text scrolls instead. */
const MAX_CARD_HEIGHT = 220;
const SWIPE_DISTANCE = 40;

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
  mode,
  spot,
  comments,
  busy,
  onMode,
  onEmoji,
  onComment,
  onClose,
}: SpotPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const commentCount = spot?.comments ?? 0;
  const accent =
    mode === "emoji"
      ? "border-amber-400/50"
      : mode === "comments" || mode === "composer"
        ? "border-cyan-400/50"
        : "border-slate-600/50";

  return (
    <div
      role="group"
      aria-label="Titik foto"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        SHELL,
        accent,
        // The chooser is two chips, so it hugs its content instead of sitting
        // in a wide box with empty space on the right.
        mode === "chooser" ? "border" : "w-[236px] border",
      )}
      style={{
        left: x,
        top: above ? y - 34 : y + 34,
        transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)",
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-slate-900/97",
          above ? "-bottom-1" : "-top-1",
        )}
      />

      {mode === "chooser" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMode("emoji")}
            className="flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-gradient-to-br from-amber-500 to-amber-600 px-3 py-1.5 text-[13px] font-black text-amber-950"
          >
            <span aria-hidden="true">{spot?.reactions[0]?.emoji ?? "🙂"}</span>
            <span className="text-[10px]">{spot?.total ?? 0}</span>
          </button>
          <button
            type="button"
            onClick={() => onMode("comments")}
            className="flex items-center gap-1.5 rounded-full border border-cyan-200/70 bg-gradient-to-br from-cyan-400 to-sky-500 px-3 py-1.5 text-[13px] font-black text-slate-950"
          >
            <span aria-hidden="true">💬</span>
            <span className="text-[10px]">{commentCount}</span>
          </button>
        </div>
      ) : null}

      {mode === "emoji" ? <EmojiBody spot={spot} onEmoji={onEmoji} /> : null}

      {mode === "comments" ? (
        comments === null ? (
          <p className="py-2 text-[10px] text-slate-500">Memuat…</p>
        ) : (
          <CommentCarousel comments={comments} busy={busy} onSubmit={onComment} />
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

function EmojiBody({
  spot,
  onEmoji,
}: {
  spot: FeedSpot | null;
  onEmoji: (emoji: string) => void;
}) {
  const counts = new Map((spot?.reactions ?? []).map((reaction) => [reaction.emoji, reaction.count]));
  const mine = spot?.myEmoji ?? null;

  // The full palette always stays visible: an emoji with no count yet is still
  // a valid choice, and hiding used ones made the list shrink as people voted.
  return (
    <div className="flex flex-wrap items-center gap-1">
      {EMOJI_OPTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const isMine = mine === emoji;

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onEmoji(emoji)}
            aria-pressed={isMine}
            aria-label={"Reaksi " + emoji + ", " + count}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-1 text-[13px] leading-none transition-colors",
              isMine
                ? "border-amber-300 bg-amber-400/25"
                : "border-amber-400/25 bg-amber-400/8 hover:bg-amber-400/15",
            )}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 ? <span className="text-[9px] font-black text-amber-300">{count}</span> : null}
          </button>
        );
      })}
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
  busy,
  onSubmit,
}: {
  comments: FeedComment[];
  busy: boolean;
  onSubmit: (body: string) => void;
}) {
  const mine = comments.some((comment) => comment.mine);
  const slides: ("form" | FeedComment)[] = mine ? comments : ["form", ...comments];

  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null; id: number } | null>(null);

  const safeIndex = Math.min(index, slides.length - 1);

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
                  <CommentLine comment={slide} />
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

function CommentLine({ comment }: { comment: FeedComment }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="grid size-4.5 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-[8px] font-black text-white">
          {comment.author.firstName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-[10px] font-bold text-slate-200">
          {comment.mine ? "Kamu" : comment.author.firstName}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug break-words text-slate-300">{comment.body}</p>
    </div>
  );
}
