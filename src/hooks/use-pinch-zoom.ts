"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Zoom = { scale: number; ox: number; oy: number };

const IDENTITY: Zoom = { scale: 1, ox: 0, oy: 0 };

type Options = {
  /** 4 for photos, lower for video where pixels break up sooner. */
  maxScale: number;
  enabled: boolean;
  /** Fired once when the gesture crosses 1x, so the deck can lock swiping. */
  onZoomChange?: (zoomed: boolean) => void;
};

/**
 * Two-finger pinch on the media surface. Deliberately minimal: no pan, no
 * inertia, no persistent zoom. The magnification only lives while the fingers
 * are down, so the card is a magnifier, not a canvas.
 */
export function usePinchZoom({ maxScale, enabled, onZoomChange }: Options) {
  const [zoom, setZoom] = useState<Zoom>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ distance: number; ox: number; oy: number } | null>(null);
  const zoomedRef = useRef(false);

  const announce = useCallback(
    (next: boolean) => {
      if (zoomedRef.current === next) return;
      zoomedRef.current = next;
      onZoomChange?.(next);
    },
    [onZoomChange],
  );

  const reset = useCallback(() => {
    start.current = null;
    setZoom(IDENTITY);
    announce(false);
  }, [announce]);

  /** Returns true when this pointer completed a pinch (two fingers down). */
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): boolean => {
      if (!enabled) return false;

      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size !== 2) return false;

      const [first, second] = [...pointers.current.values()];
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      // Undo the CSS scale on inactive cards, same correction as toPct().
      const scaleX = element.clientWidth > 0 ? rect.width / element.clientWidth : 1;
      const scaleY = element.clientHeight > 0 ? rect.height / element.clientHeight : 1;

      start.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
        ox: ((first.x + second.x) / 2 - rect.left) / scaleX,
        oy: ((first.y + second.y) / 2 - rect.top) / scaleY,
      };
      return true;
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const origin = start.current;
      if (!origin || pointers.current.size < 2) return;

      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
      const scale = Math.min(maxScale, Math.max(1, distance / origin.distance));

      if (scale <= 1) {
        setZoom(IDENTITY);
        announce(false);
        return;
      }

      setZoom({ scale, ox: origin.ox, oy: origin.oy });
      announce(true);
    },
    [announce, maxScale],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) start.current = null;
      if (pointers.current.size === 0) reset();
    },
    [reset],
  );

  return {
    zoom,
    zoomed: zoom.scale > 1,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
