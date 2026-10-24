"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import {
  ArrowsLeftRightIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { isTouchEcho, notePointerInput } from "@/lib/pointer-input";
import { getRatingTone, ratingToPercent } from "@/lib/rating";
import type { DragAxis, InputSource } from "@/lib/types";

type RatingSliderProps = {
  value: number;
  dragging: boolean;
  disabled: boolean;
  /**
   * Portrait media keeps the slider on the right edge, dragged up and down.
   * Landscape media moves it to the bottom edge, dragged left and right.
   */
  orientation?: "vertical" | "horizontal";
  onDragStart: (position: number, source: InputSource, axis: DragAxis) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onBlur: () => void;
};

export function RatingSlider({
  value,
  dragging,
  disabled,
  orientation = "vertical",
  onDragStart,
  onKeyDown,
  onBlur,
}: RatingSliderProps) {
  const tone = getRatingTone(value);
  const trackRef = useRef<HTMLDivElement>(null);

  const horizontal = orientation === "horizontal";
  const axis: DragAxis = horizontal ? "x" : "y";

  // Touch fallback: some Android WebViews never deliver pointer events.
  useEffect(() => {
    const element = trackRef.current;
    if (!element || disabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (isTouchEcho() || event.touches.length !== 1) return;

      // Keep the deck swipe from starting on the same finger.
      event.stopPropagation();
      const touch = event.touches[0];
      onDragStart(horizontal ? touch.clientX : touch.clientY, "touch", axis);
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => element.removeEventListener("touchstart", handleTouchStart);
  }, [axis, disabled, horizontal, onDragStart]);

  const percent = ratingToPercent(value);

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Beri nilai foto ini"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
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
        onDragStart(horizontal ? event.clientX : event.clientY, "pointer", axis);
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={cn(
        "absolute z-30 touch-none outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        "focus-visible:ring-2 focus-visible:ring-cyan-400/70",
        horizontal
          ? "horizontal-slider-track bottom-2 left-1/2 flex h-10 w-[min(80%,300px)] -translate-x-1/2 items-center justify-between gap-1.5 rounded-full px-2.5"
          : "vertical-slider-track right-2 top-1/2 flex h-44 w-10 -translate-y-1/2 flex-col items-center justify-between rounded-full py-2.5",
      )}
    >
      {horizontal ? (
        <>
          <ChevronLeftIcon className="pointer-events-none size-2.5 text-slate-500" />

          <div className="pointer-events-none relative mx-0.5 h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/80">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-75",
                tone.fill,
              )}
              style={{ width: percent + "%" }}
            />
          </div>

          <div className="pointer-events-none flex size-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/80 bg-slate-900 shadow-lg">
            <ArrowsLeftRightIcon className="size-2.5 text-cyan-400" />
          </div>

          <ChevronRightIcon className="pointer-events-none size-2.5 animate-pulse text-cyan-400" />
        </>
      ) : (
        <>
          <ChevronUpIcon className="pointer-events-none size-2.5 animate-pulse text-cyan-400" />

          <div className="pointer-events-none relative my-1 w-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/80">
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-75",
                tone.fill,
              )}
              style={{ height: percent + "%" }}
            />
          </div>

          <div className="pointer-events-none my-0.5 flex size-7 items-center justify-center rounded-full border border-cyan-400/80 bg-slate-900 shadow-lg">
            <ArrowsUpDownIcon className="size-2.5 text-cyan-400" />
          </div>

          <ChevronDownIcon className="pointer-events-none size-2.5 text-slate-500" />
        </>
      )}
    </div>
  );
}
