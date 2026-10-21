"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { EMOJI_OPTIONS } from "@/lib/data";
import { MAX_COMMENT_LENGTH } from "@/lib/comment-rules";
import { cn } from "@/lib/cn";
import type { FeedComment, FeedSpot } from "@/lib/feed-types";

export type PanelMode = "chooser" | "emoji" | "comments" | "composer";

type SpotPanelProps = {
  x: number;
  y: number;
  above: boolean;
  mode: PanelMode;
  /** Null while drafting a brand new spot. */
  spot: FeedSpot | null;
  comments: FeedComment[] | null;
  busy: boolean;
  onMode: (mode: PanelMode) => void;
  onEmoji: (emoji: string) => void;
  onComment: (body: string) => void;
  onClose: () => void;
};

const SHELL =
  "spot-panel absolute z-30 w-[236px] rounded-2xl bg-slate-900/97 p-2.5 shadow-2xl shadow-slate-950/70";

function CommentForm({
  placeholder,
  busy,
  onSubmit,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (body: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = value.trim();
    if (!body || busy) return;
    onSubmit(body);
    setValue("");
  };

  return (
    <form onSubmit={submit} className="mt-2 flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-slate-600/40 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
      />
      <button
        type="submit"
        disabled={busy || value.trim().length === 0}
        className="rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-950 disabled:opacity-40"
      >
        Kirim
      </button>
    </form>
  );
}

export function SpotPanel({
  x,
  y,
  above,
  mode,
  spot,
  comments,
  busy,
  onMode,
  onEmoji,
  onComment,
  onClose,
}: SpotPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const commentCount = spot?.comments ?? 0;
  const accent =
    mode === "emoji" ? "border-amber-400/50" : mode === "comments" || mode === "composer" ? "border-cyan-400/50" : "border-slate-600/50";

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Titik foto"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={cn(SHELL, accent)}
      style={{
        left: x,
        top: above ? y - 34 : y + 34,
        transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)",
      }}
    >
      {mode === "chooser" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMode("emoji")}
            className="flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-gradient-to-br from-amber-500 to-amber-600 px-3 py-1.5 text-[13px] font-black text-amber-950"
          >
            <span aria-hidden="true">{spot?.reactions[0]?.emoji ?? "🙂"}</span>
            <span className="text-[10px]">{spot?.total ?? 0}</span>
          </button>
          <button
            type="button"
            onClick={() => onMode("comments")}
            className="flex items-center gap-1.5 rounded-full border border-cyan-200/70 bg-gradient-to-br from-cyan-400 to-sky-500 px-3 py-1.5 text-[13px] font-black text-slate-950"
          >
            <span aria-hidden="true">💬</span>
            <span className="text-[10px]">{commentCount}</span>
          </button>
        </div>
      ) : null}

      {mode === "emoji" ? (
        <EmojiBody spot={spot} onEmoji={onEmoji} />
      ) : null}

      {mode === "comments" ? (
        <CommentsBody comments={comments} busy={busy} onSubmit={onComment} />
      ) : null}

      {mode === "composer" ? (
        <CommentForm placeholder="Tulis komentar di titik ini…" busy={busy} onSubmit={onComment} />
      ) : null}
    </div>
  );
}

function EmojiBody({
  spot,
  onEmoji,
}: {
  spot: FeedSpot | null;
  onEmoji: (emoji: string) => void;
}) {
  const counts = new Map((spot?.reactions ?? []).map((reaction) => [reaction.emoji, reaction.count]));
  const mine = spot?.myEmoji ?? null;

  // The full palette always stays visible: an emoji with no count yet is still
  // a valid choice, and hiding used ones made the list shrink as people voted.
  return (
    <div className="flex flex-wrap items-center gap-1">
      {EMOJI_OPTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const isMine = mine === emoji;

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onEmoji(emoji)}
            aria-pressed={isMine}
            aria-label={"Reaksi " + emoji + ", " + count}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-1 text-[13px] leading-none transition-colors",
              isMine
                ? "border-amber-300 bg-amber-400/25"
                : "border-amber-400/25 bg-amber-400/8 hover:bg-amber-400/15",
            )}
          >
            <span aria-hidden="true">{emoji}</span>
            <span
              className={cn(
                "text-[9px] font-black",
                count > 0 ? "text-amber-300" : "text-slate-500",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CommentsBody({
  comments,
  busy,
  onSubmit,
}: {
  comments: FeedComment[] | null;
  busy: boolean;
  onSubmit: (body: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (comments === null) {
    return <p className="py-2 text-[10px] text-slate-500">Memuat…</p>;
  }

  const mine = comments.some((comment) => comment.mine);
  const latest = comments[0] ?? null;

  return (
    <div>
      {latest === null ? null : expanded ? (
        <ul className="max-h-44 space-y-2 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentLine comment={comment} />
            </li>
          ))}
        </ul>
      ) : (
        <CommentLine comment={latest} />
      )}

      {comments.length > 1 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1.5 text-[9px] font-bold text-cyan-300/90"
        >
          {expanded ? "Ringkas" : comments.length + " komentar · lihat semua"}
        </button>
      ) : null}

      {/* One comment per photo: once it exists there is nothing left to type. */}
      {mine ? null : (
        <CommentForm
          placeholder={comments.length > 0 ? "Tulis balasan di titik ini…" : "Tulis komentar di titik ini…"}
          busy={busy}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}

function CommentLine({ comment }: { comment: FeedComment }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="grid size-4.5 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-[8px] font-black text-white">
          {comment.author.firstName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-[10px] font-bold text-slate-200">
          {comment.mine ? "Kamu" : comment.author.firstName}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug break-words text-slate-300">{comment.body}</p>
    </div>
  );
}
