"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { EMOJI_OPTIONS } from "@/lib/data";
import type { FeedSpot } from "@/lib/feed-types";
import { MAX_REACTIONS_PER_SPOT } from "@/lib/reaction-rules";
import type { PopoverAnchor } from "@/lib/types";

type EmojiPopoverProps = {
  anchor: PopoverAnchor;
  spot: FeedSpot | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export function EmojiPopover({ anchor, spot, onSelect, onClose }: EmojiPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const existing = spot?.reactions ?? [];
  const mine = spot?.myEmoji ?? null;
  const atCapacity = existing.length >= MAX_REACTIONS_PER_SPOT;
  const canSwap = mine !== null;
  const palette = EMOJI_OPTIONS.filter(
    (emoji) => !existing.some((reaction) => reaction.emoji === emoji),
  );
  const showPalette = palette.length > 0 && (!atCapacity || canSwap);

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Choose a reaction"
      className="emoji-popover absolute z-40 flex flex-col items-center"
      style={{
        left: `clamp(6.5rem, ${anchor.x}px, calc(100% - 6.5rem))`,
        top: anchor.y - 10,
      }}
    >
      <div className="glass-panel flex flex-col gap-1 rounded-2xl border border-cyan-400/50 bg-slate-900/95 p-1.5 shadow-2xl">
        {existing.length > 0 ? (
          <div className="flex items-center gap-1">
            {existing.map((reaction) => {
              const isMine = mine === reaction.emoji;

              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  aria-pressed={isMine}
                  aria-label={
                    isMine
                      ? `Remove your ${reaction.emoji} reaction`
                      : `Add ${reaction.emoji} reaction, ${reaction.count} so far`
                  }
                  onClick={() => onSelect(reaction.emoji)}
                  className={cn(
                    "flex items-center gap-0.5 rounded-full border px-2 py-1 text-sm transition-transform active:scale-110",
                    isMine
                      ? "border-cyan-300 bg-cyan-500/20 ring-1 ring-cyan-400"
                      : "border-transparent hover:bg-slate-800",
                  )}
                >
                  <span>{reaction.emoji}</span>
                  <span className="text-[9px] font-bold tabular-nums text-cyan-300">
                    {reaction.count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {showPalette ? (
          <div className="flex items-center gap-1">
            {palette.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React with ${emoji}`}
                onClick={() => onSelect(emoji)}
                className="flex size-7 items-center justify-center rounded-full text-base transition-transform hover:bg-slate-800 active:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        {!showPalette && existing.length > 0 ? (
          <span className="px-2 py-0.5 text-center text-[10px] text-slate-400">Spot is full</span>
        ) : null}
      </div>
      <div className="-mt-1.5 size-2.5 rotate-45 border-b border-r border-cyan-400/50 bg-slate-900" />
    </div>
  );
}
