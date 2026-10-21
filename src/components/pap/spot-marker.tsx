"use client";

import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/cn";
import type { FeedSpot } from "@/lib/feed-types";

type SpotMarkerProps = {
  spot: FeedSpot;
  onOpen: () => void;
  onOpenComments: () => void;
};

/**
 * One marker per spot, holding both layers: the leading emoji and two
 * badges. Tap opens the chooser, hold jumps straight to the comments.
 */
export function SpotMarker({ spot, onOpen, onOpenComments }: SpotMarkerProps) {
  const hasEmoji = spot.total > 0;
  const hasComments = spot.comments > 0;
  const leading = spot.myEmoji ?? spot.reactions[0]?.emoji ?? "💬";

  const { bind } = useLongPress({
    onTap: onOpen,
    onLongPress: onOpenComments,
    delay: 420,
  });

  return (
    <button
      type="button"
      {...bind}
      aria-label={
        "Titik dengan " +
        spot.total +
        " reaksi dan " +
        spot.comments +
        " komentar"
      }
      className={cn(
        "pointer-events-auto absolute grid size-[34px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-slate-950 text-[15px] leading-none shadow-lg shadow-slate-950/70 transition-transform active:scale-110",
        hasEmoji && hasComments && "bg-gradient-to-br from-cyan-500 to-blue-600",
        !hasEmoji && hasComments && "bg-gradient-to-br from-sky-500 to-sky-700",
        hasEmoji && !hasComments && "bg-gradient-to-br from-amber-500 to-amber-700",
      )}
    >
      <span aria-hidden="true">{leading}</span>

      {hasComments ? (
        <span className="absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full border border-slate-950 bg-cyan-400 px-1 text-[9px] font-black text-slate-950">
          {spot.comments}
        </span>
      ) : null}

      {hasEmoji ? (
        <span className="absolute -right-2 -bottom-1.5 grid h-4 min-w-4 place-items-center rounded-full border border-slate-950 bg-amber-400 px-1 text-[9px] font-black text-amber-950">
          {spot.total}
        </span>
      ) : null}
    </button>
  );
}
