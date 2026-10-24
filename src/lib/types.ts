export type CardPosition = "previous" | "active" | "next";

/** Which event family owns the current gesture. */
export type InputSource = "pointer" | "touch";

/** Axis a drag follows: vertical on portrait media, horizontal on landscape. */
export type DragAxis = "x" | "y";

/** A write target: an existing spot, or a new one at the given point. */
export type SpotTarget = {
  /** 0..1 relative to the rendered image box. */
  xPct: number;
  yPct: number;
  spotId: number | null;
};

/** A reaction write either lands on a spot or reports the server's error code. */
export type ReactionResult = { ok: true; spotId: number } | { ok: false; code: string };
