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
  // End chevrons claim a 28px cap at each end, leaving (100% - 56px) of rail.
  // The double-arrow marker rides at that fraction; the filled segment runs
  // from the low end to the marker, so its length == the chosen rating.
  const fill = "calc((100% - 56px) * " + (percent / 100) + ")";
  const marker = "calc(28px + (100% - 56px) * " + (percent / 100) + ")";

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
      {/* End chevrons: static direction hints */}
      {horizontal ? (
        <>
          <ChevronLeftIcon className="pointer-events-none absolute left-1.5 top-1/2 size-2.5 -translate-y-1/2 text-slate-500" />
          <ChevronRightIcon className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 animate-pulse text-cyan-400" />
        </>
      ) : (
        <>
          <ChevronUpIcon className="pointer-events-none absolute left-1/2 top-1.5 size-2.5 -translate-x-1/2 animate-pulse text-cyan-400" />
          <ChevronDownIcon className="pointer-events-none absolute bottom-1.5 left-1/2 size-2.5 -translate-x-1/2 text-slate-500" />
        </>
      )}

      {/* Empty rail */}
      <div
        className={cn(
          "pointer-events-none absolute rounded-full bg-slate-700/80",
          horizontal ? "inset-y-[17px] left-7 right-7" : "inset-x-[17px] top-7 bottom-7",
        )}
      />

      {/* Filled segment: length tracks the chosen rating */}
      <div
        className={cn(
          "pointer-events-none absolute rounded-full transition-[width,height] duration-75",
          tone.fill,
          horizontal ? "inset-y-[17px] left-7" : "inset-x-[17px] bottom-7",
        )}
        style={horizontal ? { width: fill } : { height: fill }}
      />

      {/* Double-arrow marker: rides at the value position (the indicator) */}
      <div
        className="pointer-events-none absolute flex animate-pulse items-center justify-center text-cyan-400"
        style={
          horizontal
            ? { left: marker, top: "50%", transform: "translate(-50%, -50%)" }
            : { bottom: marker, left: "50%", transform: "translate(-50%, 50%)" }
        }
      >
        {horizontal ? (
          <ArrowsLeftRightIcon className="size-3" />
        ) : (
          <ArrowsUpDownIcon className="size-3" />
        )}
      </div>
    </div>
  );
}
