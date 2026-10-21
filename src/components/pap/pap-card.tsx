"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { useImageBox } from "@/hooks/use-image-box";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { findSpotAt } from "@/lib/reaction-rules";
import { haptic } from "@/lib/telegram";
import type { FeedPhoto, FeedSpot } from "@/lib/feed-types";
import type { CardPosition, InputSource, PopoverAnchor } from "@/lib/types";
import { EmojiPopover } from "./emoji-popover";
import { RatingSlider } from "./rating-slider";
import { ReactionPill } from "./reaction-pill";

type RippleState = { key: number; x: number; y: number };

type PapCardProps = {
  item: FeedPhoto;
  position: CardPosition;
  popover: PopoverAnchor | null;
  onOpenPopover: (anchor: PopoverAnchor) => void;
  onClosePopover: () => void;
  priority: boolean;
  rating: number;
  ratingDragging: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onReact: (anchor: PopoverAnchor, emoji: string) => void;
  onRatingStart: (clientY: number, source: InputSource) => void;
  onRatingKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRatingBlur: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onInteraction: () => void;
};

const TRANSFORMS: Record<CardPosition, string> = {
  previous: "translateY(-120%) rotateX(65deg) scale(0.85)",
  active: "translateY(0%) rotateX(0deg) scale(1)",
  next: "translateY(120%) rotateX(-65deg) scale(0.85)",
};

export function PapCard({
  item,
  position,
  popover,
  onOpenPopover,
  onClosePopover,
  priority,
  rating,
  ratingDragging,
  canGoPrevious,
  canGoNext,
  onReact,
  onRatingStart,
  onRatingKeyDown,
  onRatingBlur,
  onPrevious,
  onNext,
  onInteraction,
}: PapCardProps) {
  const isActive = position === "active";
  const [ripple, setRipple] = useState<RippleState | null>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const touchTapStart = useRef<{ x: number; y: number } | null>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const box = useImageBox(photoRef, item.imageWidth, item.imageHeight);

  const aspect = item.imageHeight / item.imageWidth;

  function anchorFor(spot: FeedSpot): PopoverAnchor {
    return {
      x: box.left + spot.x * box.width,
      y: box.top + spot.y * box.height,
      xPct: spot.x,
      yPct: spot.y,
      spotId: spot.id,
    };
  }

  function openReaction(clientX: number, clientY: number) {
    const element = photoRef.current;
    if (!element || box.width === 0 || box.height === 0) return;

    const rect = element.getBoundingClientRect();
    const containerX = clientX - rect.left;
    const containerY = clientY - rect.top;
    const x = (containerX - box.left) / box.width;
    const y = (containerY - box.top) / box.height;

    // Taps in the letterbox do not belong to the photo.
    if (x < 0 || y < 0 || x > 1 || y > 1) return;

    setRipple({ key: Date.now(), x: containerX, y: containerY });
    onOpenPopover({
      x: containerX,
      y: containerY,
      xPct: x,
      yPct: y,
      spotId: findSpotAt(item.spots, x, y, aspect),
    });
    onInteraction();
    haptic("selection");
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    notePointerInput();
    tapStart.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start) return;

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;

    openReaction(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho()) return;

    const touch = event.touches[0];
    if (!touch) return;

    touchTapStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (isTouchEcho()) return;

    const start = touchTapStart.current;
    touchTapStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 12) return;

    openReaction(touch.clientX, touch.clientY);
  };

  const handleTapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    openReaction(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

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
          <Image
            src={item.imageUrl}
            alt={item.caption}
            fill
            sizes="(max-width: 640px) 100vw, 448px"
            preload={priority}
            className="pointer-events-none select-none object-contain"
          />

          <div
            role="button"
            tabIndex={isActive ? 0 : -1}
            aria-label="Tap photo to add an emoji reaction"
            className="absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={() => {
              touchTapStart.current = null;
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

          {/* Pills live on the image box, not on the letterboxed container. */}
          <div
            className="pointer-events-none absolute z-20"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          >
            {item.spots.map((spot) => (
              <div
                key={spot.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `clamp(2.75rem, ${spot.x * 100}%, calc(100% - 2.75rem))`,
                  top: `${spot.y * 100}%`,
                }}
              >
                <ReactionPill
                  spot={spot}
                  onToggle={() => onReact(anchorFor(spot), spot.reactions[0].emoji)}
                  onOpenPicker={() => {
                    onOpenPopover(anchorFor(spot));
                    onInteraction();
                    haptic("impact");
                  }}
                />
              </div>
            ))}
          </div>

          <RatingSlider
            value={rating}
            dragging={ratingDragging}
            disabled={!isActive}
            onDragStart={(clientY, source) => {
              onInteraction();
              onRatingStart(clientY, source);
            }}
            onKeyDown={onRatingKeyDown}
            onBlur={onRatingBlur}
          />

          {isActive && popover ? (
            <EmojiPopover
              anchor={popover}
              spot={popover.spotId ? (item.spots.find((s) => s.id === popover.spotId) ?? null) : null}
              onClose={onClosePopover}
              onSelect={(emoji) => {
                onReact(popover, emoji);
                onClosePopover();
              }}
            />
          ) : null}
        </div>

        <div className="relative z-10 shrink-0 space-y-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-1.5">
            <p className="line-clamp-2 text-center text-xs font-medium text-slate-200">
              {item.caption}
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
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-40"
            >
              <span>Next PAP</span>
              <ChevronDownIcon className="size-2.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
