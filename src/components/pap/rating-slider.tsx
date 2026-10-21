"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { ArrowsUpDownIcon, ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { getRatingTone, ratingToPercent } from "@/lib/rating";
import type { InputSource } from "@/lib/types";

type RatingSliderProps = {
  value: number;
  dragging: boolean;
  disabled: boolean;
  onDragStart: (clientY: number, source: InputSource) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onBlur: () => void;
};

export function RatingSlider({
  value,
  dragging,
  disabled,
  onDragStart,
  onKeyDown,
  onBlur,
}: RatingSliderProps) {
  const tone = getRatingTone(value);
  const trackRef = useRef<HTMLDivElement>(null);

  // Touch fallback: some Android WebViews never deliver pointer events.
  useEffect(() => {
    const element = trackRef.current;
    if (!element || disabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (isTouchEcho() || event.touches.length !== 1) return;

      // Keep the deck swipe from starting on the same finger.
      event.stopPropagation();
      onDragStart(event.touches[0].clientY, "touch");
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => element.removeEventListener("touchstart", handleTouchStart);
  }, [disabled, onDragStart]);

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Rate this photo"
      aria-valuemin={1}
      aria-valuemax={10}
      aria-valuenow={value}
      aria-valuetext={`${value.toFixed(1)} out of 10`}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) return;
        notePointerInput();
        event.stopPropagation();
        // Keep receiving moves even when the finger slides off the track.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onDragStart(event.clientY, "pointer");
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={cn(
        "vertical-slider-track absolute right-2 top-1/2 z-30 flex h-44 w-10 -translate-y-1/2 touch-none flex-col items-center justify-between rounded-full border border-cyan-500/30 py-2.5 shadow-2xl outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        "focus-visible:ring-2 focus-visible:ring-cyan-400/70",
      )}
    >
      <ChevronUpIcon className="pointer-events-none size-2.5 animate-pulse text-cyan-400" />

      <div className="pointer-events-none relative my-1 w-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/80">
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-75",
            tone.fill,
          )}
          style={{ height: `${ratingToPercent(value)}%` }}
        />
      </div>

      <div className="pointer-events-none my-0.5 flex size-7 items-center justify-center rounded-full border border-cyan-400/80 bg-slate-900 shadow-lg">
        <ArrowsUpDownIcon className="size-2.5 text-cyan-400" />
      </div>

      <ChevronDownIcon className="pointer-events-none size-2.5 text-slate-500" />
    </div>
  );
}
