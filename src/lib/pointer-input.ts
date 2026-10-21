let lastPointerDownAt = Number.NEGATIVE_INFINITY;

/**
 * Marks that a pointer gesture started so the touch fallback can stand down.
 * Touch and pointer events both fire on modern Android, and handling both
 * would double-count taps and drags.
 */
export function notePointerInput(): void {
  lastPointerDownAt = performance.now();
}

/** True while a touch event is the compatibility echo of a pointer gesture. */
export function isTouchEcho(): boolean {
  return performance.now() - lastPointerDownAt < 150;
}
