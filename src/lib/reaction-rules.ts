/**
 * Snap radius as a fraction of the image width. Distance is measured in
 * normalised image space with the height scaled by the aspect ratio, so it
 * stays circular on screen regardless of the photo's shape.
 */
export const SNAP_RADIUS_RATIO = 0.04;

export type ReactionSummary = {
  emoji: string;
  count: number;
  /** Lowest reaction id for this emoji at the spot: the insertion order. */
  firstId: number;
};

/** Highest count first, ties broken by who was inserted first. */
export function sortReactionSummary(reactions: ReactionSummary[]): ReactionSummary[] {
  return [...reactions].sort((a, b) => b.count - a.count || a.firstId - b.firstId);
}

/**
 * Returns the spot closest to a point, if it is inside the snap radius.
 * Coordinates are normalised to the image; the height is scaled by the aspect
 * ratio so the radius stays circular on screen.
 */
export function findSpotAt(
  spots: { id: number; x: number; y: number }[],
  x: number,
  y: number,
  aspectRatio: number,
): number | null {
  let best: { id: number; distance: number } | null = null;

  for (const spot of spots) {
    const dx = spot.x - x;
    const dy = (spot.y - y) * aspectRatio;
    const distance = Math.hypot(dx, dy);

    if (distance <= SNAP_RADIUS_RATIO && (!best || distance < best.distance)) {
      best = { id: spot.id, distance };
    }
  }

  return best?.id ?? null;
}
