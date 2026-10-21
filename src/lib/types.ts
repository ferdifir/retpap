export type CardPosition = "previous" | "active" | "next";

/** Which event family owns the current gesture. */
export type InputSource = "pointer" | "touch";

/** Screen anchor (px inside the photo area) plus its normalised position. */
export type PopoverAnchor = {
  x: number;
  y: number;
  /** 0..1 relative to the rendered image box. */
  xPct: number;
  yPct: number;
  /** Existing spot to react on, or null to create one at the anchor. */
  spotId: number | null;
};
