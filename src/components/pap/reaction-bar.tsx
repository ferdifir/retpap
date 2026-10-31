"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type BarEmoji = { emoji: string; count: number; mine: boolean };

type ReactionBarProps = {
  /** Tap point in container pixels; the tail points here. */
  anchorX: number;
  anchorY: number;
  frameWidth: number;
  frameHeight: number;
  emojis: BarEmoji[];
  onEmoji: (emoji: string) => void;
  onMore: () => void;
};

/** Upper bound for the strip: roughly five emoji, then it scrolls. */
const STRIP = 228;

/**
 * One-row reaction picker anchored to the tapped point. The strip scrolls
 * horizontally, the expand button sits outside it so it never moves.
 */
export function ReactionBar({
  anchorX,
  anchorY,
  frameWidth,
  frameHeight,
  emojis,
  onEmoji,
  onMore,
}: ReactionBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: STRIP + 56, height: 44 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, [emojis]);

  const above = anchorY > size.height + 26;
  const left = Math.max(8, Math.min(anchorX - size.width / 2, frameWidth - size.width - 8));
  const top = Math.max(
    6,
    Math.min(above ? anchorY - size.height - 14 : anchorY + 14, frameHeight - size.height - 6),
  );
  const tailX = Math.max(18, Math.min(anchorX - left, size.width - 18));

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Pilih reaksi"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className="absolute z-30 flex items-center gap-1 rounded-full bg-[#16233a] py-1.5 pr-1.5 pl-1.5 shadow-2xl shadow-slate-950/70"
      style={{ left, top }}
    >
      <span
        aria-hidden="true"
        className="absolute size-3 rotate-45 rounded-[3px] bg-[#16233a]"
        style={{ left: tailX - 6, bottom: above ? -6 : undefined, top: above ? undefined : -6 }}
      />

      <div
        data-native-scroll
        className="flex gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
        style={{ maxWidth: STRIP }}
      >
        {emojis.map((entry) => (
          <button
            key={entry.emoji}
            type="button"
            aria-pressed={entry.mine}
            aria-label={"Reaksi " + entry.emoji + (entry.count > 0 ? ", " + entry.count : "")}
            onClick={() => onEmoji(entry.emoji)}
            className={cn(
              "flex h-9 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 text-[19px] leading-none ring-1 transition-colors ring-inset",
              entry.mine
                ? "bg-amber-400/25 ring-amber-300/80"
                : "bg-amber-400/8 ring-amber-400/25 hover:bg-amber-400/15",
            )}
          >
            <span aria-hidden="true">{entry.emoji}</span>
            {entry.count > 0 ? (
              <span className="text-[9px] font-black text-amber-300 tabular-nums">{entry.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onMore}
        aria-label="Emoji lainnya"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-400/15 text-[15px] leading-none text-slate-300 transition-colors hover:bg-slate-400/25 hover:text-white"
      >
        <span aria-hidden="true">⌄</span>
      </button>
    </div>
  );
}
