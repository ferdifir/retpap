"use client";

import { cn } from "@/lib/cn";
import { useLongPress } from "@/hooks/use-long-press";
import type { FeedSpot } from "@/lib/feed-types";

type ReactionPillProps = {
  spot: FeedSpot;
  onToggle: () => void;
  onOpenPicker: () => void;
};

const CHIP =
  "flex size-7 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900 text-[13px] leading-none ring-2 ring-slate-950/80";

/**
 * One pill per spot: the leading emoji, the runner-up, then a +N chip for the
 * rest, followed by the total number of people who reacted there.
 */
export function ReactionPill({ spot, onToggle, onOpenPicker }: ReactionPillProps) {
  const ordered = spot.reactions;
  const mineIndex = spot.myEmoji ? ordered.findIndex((r) => r.emoji === spot.myEmoji) : -1;

  // Your own emoji leads so you can see what you picked; otherwise the
  // dominant emoji leads.
  const leading = mineIndex >= 0 ? ordered[mineIndex] : ordered[0];
  const rest = ordered.filter((reaction) => reaction !== leading);
  const second = rest[0];
  const hidden = rest.length - (second ? 1 : 0);
  const single = ordered.length === 1;

  const { holding, bind } = useLongPress({
    onTap: single ? onToggle : onOpenPicker,
    onLongPress: onOpenPicker,
    // With several emoji a tap already opens the picker, so holding would
    // promise a different action that does not exist.
    enabled: single,
  });

  const label = ordered
    .map((reaction) => `${reaction.emoji} ${reaction.count}`)
    .join(", ");

  return (
    <button
      type="button"
      {...bind}
      aria-label={`${spot.total} reaction${spot.total === 1 ? "" : "s"}: ${label}${spot.myEmoji ? `, you reacted with ${spot.myEmoji}` : ""}`}
      className={cn(
        "pointer-events-auto flex items-center gap-0.5 rounded-full border py-0.5 pl-0.5 pr-2 outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-400",
        spot.myEmoji
          ? "border-cyan-400/80 bg-slate-900/95 shadow-lg shadow-cyan-500/20"
          : "border-slate-700/80 bg-slate-900/90",
        holding && "reaction-holding",
      )}
    >
      <span className="flex items-center">
        <span key={leading.emoji} className={cn(CHIP, "emoji-badge z-20")}>
          {leading.emoji}
        </span>
        {second ? (
          <span key={second.emoji} className={cn(CHIP, "emoji-badge z-10 -ml-1.5")}>
            {second.emoji}
          </span>
        ) : null}
        {hidden > 0 ? (
          <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border border-slate-500/70 bg-slate-700/90 text-[10px] font-bold text-cyan-200 ring-2 ring-slate-950/80">
            +{hidden}
          </span>
        ) : null}
      </span>
      <span className="ml-1.5 text-[11px] font-bold tabular-nums text-slate-200">{spot.total}</span>
    </button>
  );
}
