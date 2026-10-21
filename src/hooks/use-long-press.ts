"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";

type LongPressOptions = {
  onTap: () => void;
  onLongPress: () => void;
  delay?: number;
  moveTolerance?: number;
  /** When false the hold timer never starts; tap still works. */
  enabled?: boolean;
};

/**
 * Distinguishes a tap from a press-and-hold on the same element.
 *
 * Tap stays on `click` so keyboard activation keeps working; pointer events
 * only drive the hold timer. A fired hold swallows the trailing click, which
 * would otherwise increment the counter right after opening the picker.
 */
export function useLongPress({
  onTap,
  onLongPress,
  delay = 500,
  moveTolerance = 10,
  enabled = true,
}: LongPressOptions) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  const suppressClick = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
    setHolding(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  const bind = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      // Keep the deck swipe from claiming the same finger.
      event.stopPropagation();
      if (!enabled) return;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic or already-released pointers cannot be captured.
      }

      longPressFired.current = false;
      suppressClick.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      setHolding(true);

      timer.current = window.setTimeout(() => {
        timer.current = null;
        longPressFired.current = true;
        setHolding(false);
        onLongPress();
      }, delay);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = origin.current;
      if (!start) return;

      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > moveTolerance) {
        cancel();
      }
    },
    onPointerUp: () => {
      if (longPressFired.current) {
        longPressFired.current = false;
        suppressClick.current = true;
      }
      cancel();
    },
    onPointerCancel: () => {
      longPressFired.current = false;
      cancel();
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      // Desktop equivalent of the hold, and a guard against the native menu.
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = true;
      cancel();
      onLongPress();
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
        return;
      }
      onTap();
    },
  };

  return { holding, bind };
}
