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

  useEffect(() => {
    const element = trackRef.current;
    if (!element || disabled) return;
    const handleTouchStart = (event: TouchEvent) => {
      if (isTouchEcho() || event.touches.length !== 1) return;
      event.stopPropagation();
      const touch = event.touches[0];
      onDragStart(horizontal ? touch.clientX : touch.clientY, "touch", axis);
    };
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => element.removeEventListener("touchstart", handleTouchStart);
  }, [axis, disabled, horizontal, onDragStart]);

  const percent = ratingToPercent(value);
  // End chevrons claim a 24px cap at each end, leaving (100% - 48px) of rail.
  // The badge rides at that fraction of the rail: at the end of the fill.
  const marker = "calc(24px + (100% - 48px) * " + (percent / 100) + ")";

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
      {/* 2. end chevrons (static) */}
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

      {/* 3. filled segment (length = value) */}
      <div
        className={cn(
          "pointer-events-none absolute overflow-hidden rounded-full bg-slate-700/80",
          horizontal ? "inset-y-[17px] left-6 right-6" : "inset-x-[17px] top-6 bottom-6",
        )}
      >
        <div
          className={cn(
            "absolute rounded-full transition-[height,width] duration-75",
            tone.fill,
            horizontal ? "inset-y-0 left-0" : "inset-x-0 bottom-0",
          )}
          style={horizontal ? { width: percent + "%" } : { height: percent + "%" }}
        />
      </div>

      {/* 4. badge (moves to the end of the fill) */}
      <div
        className="pointer-events-none absolute flex size-6 items-center justify-center rounded-full border border-cyan-400/80 bg-slate-900 text-cyan-400 shadow-lg"
        style={
          horizontal
            ? { left: marker, top: "50%", transform: "translate(-50%, -50%)" }
            : { bottom: marker, left: "50%", transform: "translate(-50%, 50%)" }
        }
      >
        {horizontal ? (
          <ArrowsLeftRightIcon className="size-4 text-cyan-400" />
        ) : (
          <ArrowsUpDownIcon className="size-4 text-cyan-400" />
        )}
      </div>
    </div>
  );
}
