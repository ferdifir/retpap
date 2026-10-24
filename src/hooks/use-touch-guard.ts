"use client";

import { useEffect } from "react";

/**
 * Mobile WebViews (Telegram Android in particular) start a native pan on the
 * first touchmove. That pan fires pointercancel/touchcancel and silently kills
 * custom drag gestures, which is why mouse input works but touch does not.
 *
 * The page never scrolls by design, so blocking the native pan keeps the
 * pointer/touch stream alive for the whole gesture.
 */
export function useTouchGuard(): void {
  useEffect(() => {
    const blockNativePan = (event: TouchEvent) => {
      // The reaction sheet opts out so its own list can scroll: CSS touch-action
      // cannot undo a preventDefault issued by a non-passive listener.
      const target = event.target;
      if (target instanceof Element && target.closest("[data-native-scroll]")) return;
      if (event.cancelable) event.preventDefault();
    };

    document.addEventListener("touchmove", blockNativePan, { passive: false });

    return () => {
      document.removeEventListener("touchmove", blockNativePan);
    };
  }, []);
}
