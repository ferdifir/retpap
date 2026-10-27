"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { FeedSpot } from "@/lib/feed-types";
import { REACTION_EMOJIS, searchReactions, type ReactionEmoji } from "@/lib/reactions/catalog";
import { useRecentEmojis } from "@/lib/reactions/recent";
import { haptic } from "@/lib/telegram";

type ReactionSheetProps = {
  /** Counts and the user's own pick; null while drafting a new spot. */
  spot: FeedSpot | null;
  error: string | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
};

function EmojiCell({
  entry,
  count,
  mine,
  onPick,
}: {
  entry: ReactionEmoji;
  count: number;
  mine: boolean;
  onPick: (emoji: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(entry.emoji)}
      aria-pressed={mine}
      aria-label={"Reaksi " + entry.label + (count > 0 ? ", " + count + " reaksi" : "")}
      className={cn(
        "relative grid aspect-square place-items-center rounded-xl text-[22px] leading-none transition-colors",
        mine ? "bg-amber-400/25 ring-2 ring-amber-300" : "hover:bg-slate-800 active:bg-slate-700",
      )}
    >
      <span aria-hidden="true">{entry.emoji}</span>
      {count > 0 ? (
        <span className="absolute right-0.5 bottom-0.5 text-[8px] font-black text-amber-300 tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Full reaction picker, mounted only while open: the parent unmounts it on
 * close, which also resets the search and keeps the exit free of state
 * choreography. It is portaled to the body because the card sits inside a 3D
 * transformed ancestor, where position:fixed would be trapped.
 */
export function ReactionSheet({ spot, error, onPick, onClose }: ReactionSheetProps) {
  const recent = useRecentEmojis();
  const [query, setQuery] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the close button rather than the search field: autofocusing the
    // input opens the Android keyboard and hides the grid the user just opened.
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(timer);
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>("[data-emoji-more]")?.focus();
    };
  }, []);

  const counts = useMemo(
    () => new Map((spot?.reactions ?? []).map((reaction) => [reaction.emoji, reaction.count])),
    [spot],
  );
  const mine = spot?.myEmoji ?? null;
  const results = useMemo(() => searchReactions(query), [query]);
  const recentEntries = useMemo(
    () =>
      recent
        .map((emoji) => REACTION_EMOJIS.find((entry) => entry.emoji === emoji))
        .filter((entry): entry is ReactionEmoji => entry !== undefined),
    [recent],
  );

  const pick = (emoji: string) => {
    haptic("selection");
    onPick(emoji);
  };

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const root = dialogRef.current;
    if (!root) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), input'),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="reaction-backdrop absolute inset-0 bg-slate-950/70"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        className="reaction-sheet absolute inset-x-0 bottom-0 flex max-h-[72dvh] flex-col rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-[0_-20px_50px_rgba(2,6,23,0.7)]"
      >
        <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-600/70" />

        <div className="flex shrink-0 items-center justify-between px-4 pt-2">
          <h2 id={titleId} className="text-[11px] font-extrabold tracking-wide text-slate-200">
            Pilih reaksi
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup pilihan emoji"
            className="grid size-7 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              ✕
            </span>
          </button>
        </div>

        <div className="shrink-0 px-3 pt-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari emoji…"
            aria-label="Cari emoji"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            className="w-full select-text rounded-xl border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-400/60"
          />
        </div>

        {error ? (
          <p role="alert" className="shrink-0 px-4 pt-2 text-[10px] text-rose-400">
            {error}
          </p>
        ) : null}

        <div
          data-native-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2"
          style={{
            touchAction: "pan-y",
            paddingBottom: "calc(var(--app-inset-bottom) + 0.75rem)",
          }}
        >
          {query.trim() === "" && recentEntries.length > 0 ? (
            <section aria-label="Sering dipakai" className="mb-2">
              <p className="px-1 pb-1 text-[9px] font-extrabold tracking-[0.08em] text-slate-500 uppercase">
                Sering dipakai
              </p>
              <div className="grid grid-cols-8 gap-1">
                {recentEntries.map((entry) => (
                  <EmojiCell
                    key={"recent-" + entry.emoji}
                    entry={entry}
                    count={counts.get(entry.emoji) ?? 0}
                    mine={mine === entry.emoji}
                    onPick={pick}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {results.length > 0 ? (
            <section aria-label="Semua reaksi">
              {query.trim() === "" ? (
                <p className="px-1 pb-1 text-[9px] font-extrabold tracking-[0.08em] text-slate-500 uppercase">
                  Semua reaksi
                </p>
              ) : null}
              <div className="grid grid-cols-8 gap-1">
                {results.map((entry) => (
                  <EmojiCell
                    key={entry.emoji}
                    entry={entry}
                    count={counts.get(entry.emoji) ?? 0}
                    mine={mine === entry.emoji}
                    onPick={pick}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="px-2 py-6 text-center text-[11px] text-slate-500">
              Tidak ada emoji untuk “{query.trim()}”.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
