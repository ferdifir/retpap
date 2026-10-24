"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { ChevronRightIcon, ChevronUpIcon } from "@/components/icons";
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
  // The rail is inset 12px from each end, so its usable length is (100% - 24px).
  // The chevron rides at that fraction of the rail; the filled segment runs
  // from the low end to the chevron, so its length == the chosen rating.
  const fill = "calc((100% - 24px) * " + (percent / 100) + ")";
  const marker = "calc(12px + (100% - 24px) * " + (percent / 100) + ")";

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
      aria-valuetext={value.toFixed(1) + " out of 10"}
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
          ? "horizontal-slider-track bottom-2 left-1/2 h-10 w-[min(80%,300px)] -translate-x-1/2 rounded-full"
          : "vertical-slider-track right-2 top-1/2 h-44 w-10 -translate-y-1/2 rounded-full",
      )}
    >
      {/* Empty rail */}
      <div
        className={cn(
          "pointer-events-none absolute rounded-full bg-slate-700/80",
          horizontal ? "inset-y-[17px] left-3 right-3" : "inset-x-[17px] top-3 bottom-3",
        )}
      />

      {/* Filled segment: length tracks the chosen rating */}
      <div
        className={cn(
          "pointer-events-none absolute rounded-full transition-[width,height] duration-75",
          tone.fill,
          horizontal ? "inset-y-[17px] left-3" : "inset-x-[17px] bottom-3",
        )}
        style={horizontal ? { width: fill } : { height: fill }}
      />

      {/* Chevron marker: rides at the value position, points toward "increase" */}
      <div
        className="pointer-events-none absolute flex animate-pulse items-center justify-center text-cyan-400"
        style={
          horizontal
            ? { left: marker, top: "50%", transform: "translate(-50%, -50%)" }
            : { bottom: marker, left: "50%", transform: "translate(-50%, 50%)" }
        }
      >
        {horizontal ? (
          <ChevronRightIcon className="size-3" />
        ) : (
          <ChevronUpIcon className="size-3" />
        )}
      </div>
    </div>
  );
}
