"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { useImageBox } from "@/hooks/use-image-box";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { findSpotAt } from "@/lib/reaction-rules";
import { pushRecentEmoji, readRecentEmojis } from "@/lib/reactions/recent";
import { haptic } from "@/lib/telegram";
import type { FeedComment, FeedPhoto, FeedSpot } from "@/lib/feed-types";
import type { CardPosition, InputSource, ReactionResult, SpotTarget } from "@/lib/types";
import { CaptionText } from "./caption-text";
import { RatingSlider } from "./rating-slider";
import { ReactionSheet } from "./reaction-sheet";
import { SpotMarker } from "./spot-marker";
import { SpotPanel, type PanelMode } from "./spot-panel";
import { VideoSurface } from "./video-surface";

type RippleState = { key: number; x: number; y: number };

type Interaction = {
  xPct: number;
  yPct: number;
  spotId: number | null;
  mode: PanelMode;
};

type PapCardProps = {
  item: FeedPhoto;
  position: CardPosition;
  /** Hidden by default so a photo is seen without the reaction layer. */
  showReactions: boolean;
  priority: boolean;
  rating: number;
  ratingDragging: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onReact: (target: SpotTarget, emoji: string) => Promise<ReactionResult>;
  onComment: (
    target: SpotTarget,
    body: string,
  ) => Promise<{ spotId: number; comments: FeedComment[] } | null>;
  onLoadComments: (spotId: number) => Promise<FeedComment[]>;
  onDeleteComment: () => Promise<boolean>;
  onRatingStart: (clientY: number, source: InputSource) => void;
  onRatingKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRatingBlur: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

const TRANSFORMS: Record<CardPosition, string> = {
  previous: "translateY(-120%) rotateX(65deg) scale(0.85)",
  active: "translateY(0%) rotateX(0deg) scale(1)",
  next: "translateY(120%) rotateX(-65deg) scale(0.85)",
};

const LONG_PRESS_MS = 420;
const TAP_SLOP_PX = 12;

export function PapCard({
  item,
  position,
  showReactions,
  priority,
  rating,
  ratingDragging,
  canGoPrevious,
  canGoNext,
  onReact,
  onComment,
  onLoadComments,
  onDeleteComment,
  onRatingStart,
  onRatingKeyDown,
  onRatingBlur,
  onPrevious,
  onNext,
}: PapCardProps) {
  const isActive = position === "active";
  const [ripple, setRipple] = useState<RippleState | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);
  // The card only mounts after the feed fetch, so reading storage in the
  // initializer cannot cause a hydration mismatch.
  const [recent, setRecent] = useState<string[]>(() => readRecentEmojis());
  // Telegram can report a pre-rotation size for videos; the real video size
  // wins once metadata is available so markers stay on the frame.
  const [mediaSize, setMediaSize] = useState({
    width: item.imageWidth,
    height: item.imageHeight,
  });

  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const touchTapStart = useRef<{ x: number; y: number } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const commentRequest = useRef(0);
  const photoRef = useRef<HTMLDivElement>(null);
  const box = useImageBox(photoRef, mediaSize.width, mediaSize.height);

  const handleIntrinsicSize = useCallback((width: number, height: number) => {
    setMediaSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const aspect = mediaSize.height / mediaSize.width;
  const spot = interaction?.spotId ? (item.spots.find((entry) => entry.id === interaction.spotId) ?? null) : null;

  const toPct = useCallback((clientX: number, clientY: number) => {
    const element = photoRef.current;
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const scaleX = element.clientWidth > 0 ? rect.width / element.clientWidth : 1;
    const scaleY = element.clientHeight > 0 ? rect.height / element.clientHeight : 1;
    const containerX = (clientX - rect.left) / scaleX;
    const containerY = (clientY - rect.top) / scaleY;

    return {
      x: (containerX - box.left) / box.width,
      y: (containerY - box.top) / box.height,
      containerX,
      containerY,
    };
  }, [box.left, box.top, box.width, box.height]);

  const loadComments = useCallback(
    async (spotId: number) => {
      const token = ++commentRequest.current;
      setComments(null);
      const list = await onLoadComments(spotId);
      if (token === commentRequest.current) setComments(list);
    },
    [onLoadComments],
  );

  const openForSpot = useCallback(
    (target: FeedSpot, mode?: PanelMode) => {
      const both = target.total > 0 && target.comments > 0;
      const next: PanelMode = mode ?? (both ? "chooser" : target.total > 0 ? "emoji" : "comments");

      setInteraction({ xPct: target.x, yPct: target.y, spotId: target.id, mode: next });
      if (next === "comments") void loadComments(target.id);
      haptic("selection");
    },
    [loadComments],
  );

  const openPoint = useCallback(
    (xPct: number, yPct: number, mode: PanelMode) => {
      const snapped = findSpotAt(item.spots, xPct, yPct, aspect);
      // A hold on empty space writes a new comment; only an existing spot has
      // a thread to open.
      const nextMode: PanelMode = mode === "comments" && snapped === null ? "composer" : mode;

      setInteraction({ xPct, yPct, spotId: snapped, mode: nextMode });
      if (nextMode === "comments" && snapped !== null) void loadComments(snapped);
      haptic(nextMode === "composer" || nextMode === "comments" ? "impact" : "selection");
    },
    [aspect, item.spots, loadComments],
  );

  const closePanel = useCallback(() => {
    setInteraction(null);
    setComments(null);
    setSheetOpen(false);
    setReactError(null);
  }, []);

  // One Escape owner: the sheet closes first, then the panel. Two document
  // listeners would close both at once.
  useEffect(() => {
    if (!isActive) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sheetOpen) {
        setSheetOpen(false);
        return;
      }
      if (interaction) closePanel();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closePanel, interaction, isActive, sheetOpen]);

  const handleEmoji = useCallback(
    async (emoji: string) => {
      if (!interaction || busy) return;
      setBusy(true);
      setReactError(null);
      const result = await onReact(
        { spotId: interaction.spotId, xPct: interaction.xPct, yPct: interaction.yPct },
        emoji,
      );
      setBusy(false);

      if (!result.ok) {
        setReactError(
          result.code === "unknown_emoji"
            ? "Emoji ini tidak dikenal. Perbarui aplikasi."
            : "Gagal menyimpan reaksi.",
        );
        haptic("warning");
        return;
      }

      setRecent(pushRecentEmoji(emoji));
      // Picking an emoji is the whole interaction: the panel gets out of the
      // way instead of turning into a counter view.
      closePanel();
    },
    [busy, closePanel, interaction, onReact],
  );

  const handleComment = useCallback(
    async (body: string) => {
      if (!interaction || busy) return;
      setBusy(true);
      const result = await onComment(
        { spotId: interaction.spotId, xPct: interaction.xPct, yPct: interaction.yPct },
        body,
      );
      setBusy(false);
      if (!result) return;

      // One comment per photo: nothing left to type here.
      commentRequest.current += 1;
      closePanel();
    },
    [busy, closePanel, interaction, onComment],
  );

  const handleDeleteComment = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const removed = await onDeleteComment();
    setBusy(false);
    if (removed) closePanel();
  }, [busy, closePanel, onDeleteComment]);

  /* ---- gestures on the photo surface ---- */

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = (clientX: number, clientY: number) => {
    clearPress();
    longFired.current = false;
    pressOrigin.current = { x: clientX, y: clientY };

    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longFired.current = true;
      const at = toPct(clientX, clientY);
      if (!at || at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) return;
      // Hold is the heavier gesture: it always means "write a comment".
      openPoint(at.x, at.y, "comments");
    }, LONG_PRESS_MS);
  };

  const movePress = (clientX: number, clientY: number) => {
    const origin = pressOrigin.current;
    if (!origin) return;
    if (Math.hypot(clientX - origin.x, clientY - origin.y) > 10) clearPress();
  };

  const finishPress = (clientX: number, clientY: number) => {
    clearPress();
    pressOrigin.current = null;

    if (longFired.current) {
      longFired.current = false;
      return;
    }

    // Any open panel: the first tap outside just dismisses it.
    if (interaction) {
      closePanel();
      return;
    }

    const at = toPct(clientX, clientY);
    if (!at || at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) return;

    setRipple({ key: Date.now(), x: at.containerX, y: at.containerY });
    openPoint(at.x, at.y, "emoji");
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    notePointerInput();
    tapStart.current = { x: event.clientX, y: event.clientY };
    startPress(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    movePress(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > TAP_SLOP_PX && !longFired.current) {
      clearPress();
      return;
    }

    finishPress(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho()) return;

    const touch = event.touches[0];
    if (!touch) return;

    touchTapStart.current = { x: touch.clientX, y: touch.clientY };
    startPress(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (touch) movePress(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho()) return;

    const start = touchTapStart.current;
    touchTapStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) {
      clearPress();
      return;
    }

    finishPress(touch.clientX, touch.clientY);
  };

  const handleTapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const at = toPct(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!at) return;
    openPoint(at.x, at.y, "emoji");
  };

  // Frame width without touching the ref during render: the image box is
  // centred, so frame = left + width + left.
  const frameWidth = box.width > 0 ? box.left * 2 + box.width : 360;
  const panelHalf = 118 + 8;
  const panelX = interaction
    ? Math.max(panelHalf, Math.min(frameWidth - panelHalf, box.left + interaction.xPct * box.width))
    : 0;
  const panelY = interaction ? box.top + interaction.yPct * box.height : 0;

  return (
    <article
      aria-hidden={!isActive}
      inert={!isActive}
      className="card-face glass-panel border border-slate-700/60 p-2 sm:p-3"
      style={{
        transform: TRANSFORMS[position],
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 10 : 5,
        pointerEvents: isActive ? "auto" : "none",
      }}
    >
      <div className="flex h-full flex-col gap-2">
        <div
          ref={photoRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-inner"
        >
          {item.mediaType === "video" ? (
            <VideoSurface
              src={item.imageUrl}
              poster={item.posterUrl}
              durationSeconds={item.durationSeconds}
              active={isActive}
              suspended={interaction !== null || ratingDragging}
              onIntrinsicSize={handleIntrinsicSize}
            />
          ) : (
            <Image
              src={item.imageUrl}
              alt={item.caption}
              fill
              sizes="(max-width: 640px) 100vw, 448px"
              preload={priority}
              className="pointer-events-none select-none object-contain"
            />
          )}

          <div
            role="button"
            tabIndex={isActive ? 0 : -1}
            aria-label="Tap untuk reaksi emoji, tahan untuk komentar"
            className="absolute inset-0 z-10 cursor-pointer touch-manipulation outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={() => {
              touchTapStart.current = null;
              clearPress();
            }}
            onKeyDown={handleTapKeyDown}
          >
            {ripple ? (
              <span
                key={ripple.key}
                className="tap-ripple"
                style={{ left: ripple.x - 20, top: ripple.y - 20 }}
              />
            ) : null}
          </div>

          {/* Markers live on the image box, not on the letterboxed container. */}
          {showReactions ? (
            <div
              className="pointer-events-none absolute z-20"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            >
              {item.spots.map((entry) => (
                <div
                  key={entry.id}
                  className="absolute"
                  style={{
                    left: "clamp(2.75rem, " + entry.x * 100 + "%, calc(100% - 2.75rem))",
                    top: entry.y * 100 + "%",
                  }}
                >
                  <SpotMarker
                    spot={entry}
                    onOpen={() => openForSpot(entry)}
                    onOpenComments={() => openForSpot(entry, "comments")}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* Hidden together with the reaction layer: the slider is the drag
              handle, so keeping it invisible would still swallow taps there. */}
          {showReactions ? (
            <RatingSlider
              value={rating}
              dragging={ratingDragging}
              disabled={!isActive}
              onDragStart={(clientY, source) => {
                onRatingStart(clientY, source);
              }}
              onKeyDown={onRatingKeyDown}
              onBlur={onRatingBlur}
            />
          ) : null}

          {isActive && interaction ? (
            <SpotPanel
              x={panelX}
              y={panelY}
              above={interaction.yPct > 0.36}
              mode={interaction.mode}
              spot={spot}
              comments={comments}
              busy={busy}
              recent={recent}
              reactError={reactError}
              onMode={(mode) => {
                setInteraction((current) => (current ? { ...current, mode } : current));
                setReactError(null);
                if (mode === "comments" && interaction.spotId !== null) {
                  void loadComments(interaction.spotId);
                }
              }}
              onEmoji={(emoji) => void handleEmoji(emoji)}
              onMore={() => setSheetOpen(true)}
              onComment={(body) => void handleComment(body)}
              onDeleteComment={() => void handleDeleteComment()}
            />
          ) : null}

          {isActive && interaction && sheetOpen ? (
            <ReactionSheet
              spot={spot}
              error={reactError}
              onPick={(emoji) => {
                setSheetOpen(false);
                void handleEmoji(emoji);
              }}
              onClose={() => setSheetOpen(false)}
            />
          ) : null}
        </div>

        <div className="relative z-10 shrink-0 space-y-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-1.5">
            <p className="line-clamp-2 text-center text-xs font-medium text-slate-200">
              <CaptionText text={item.caption} />
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className="glass-panel flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-40"
            >
              <ChevronUpIcon className="size-2.5 text-cyan-400" />
              <span>Sebelumnya</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-40"
            >
              <span>PAP Berikutnya</span>
              <ChevronDownIcon className="size-2.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
