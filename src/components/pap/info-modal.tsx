"use client";

import { useEffect } from "react";
import {
  CommentIcon,
  SlidersIcon,
  SparklesIcon,
  SwipeIcon,
  TapIcon,
  UploadIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import type { FeedUser } from "@/lib/feed-types";

type InfoModalProps = {
  open: boolean;
  user: FeedUser | null;
  onClose: () => void;
};

const TIPS = [
  {
    icon: TapIcon,
    title: "Tap foto",
    body: "menempelkan reaksi emoji di titik itu.",
  },
  {
    icon: CommentIcon,
    title: "Tahan foto",
    body: "menulis komentar di titik itu.",
  },
  {
    icon: SparklesIcon,
    title: "Tap marker",
    body: "membuka reaksi dan komentar di titik itu. Tahan marker untuk langsung ke komentar.",
  },
  {
    icon: SlidersIcon,
    title: "Geser slider kanan",
    body: "memberi nilai 1 sampai 10.",
  },
  {
    icon: SwipeIcon,
    title: "Geser kartu",
    body: "pindah ke foto berikutnya atau sebelumnya.",
  },
  {
    icon: UploadIcon,
    title: "Upload PAP",
    body: "lewat bot: /upload, kirim foto, kirim caption, lalu tekan Upload.",
  },
];

export function InfoModal({ open, user, onClose }: InfoModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-to-use-title"
      aria-hidden={!open}
      inert={!open}
      onClick={onClose}
      className={cn(
        "safe-shell fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-opacity duration-300",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xs rounded-3xl border border-slate-700/80 bg-slate-900 p-6 text-center shadow-2xl"
      >
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/20 text-cyan-400">
          <SparklesIcon className="size-5" />
        </div>
        <h2 id="how-to-use-title" className="mb-2 text-lg font-bold text-white">
          Cara Pakai
        </h2>
        <ul className="mb-5 space-y-2.5 text-left text-xs text-slate-300">
          {TIPS.map((tip) => (
            <li key={tip.title} className="flex items-start">
              <tip.icon className="mr-2 mt-0.5 size-3.5 shrink-0 text-cyan-400" />
              <span>
                <strong className="text-slate-100">{tip.title}</strong> {tip.body}
              </span>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-[10px] leading-relaxed text-slate-500">
          Satu reaksi dan satu komentar per foto. Memilih titik lain akan memindahkannya, dan
          komentarmu bisa dihapus kapan saja.
        </p>
        {user ? (
          <p className="mb-3 text-[10px] text-slate-500">
            Masuk sebagai {user.firstName}
            {user.username ? ` (@${user.username})` : ""}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 py-2.5 text-xs font-semibold text-white transition-all hover:bg-slate-700 active:scale-95"
        >
          Mengerti
        </button>
      </div>
    </div>
  );
}
