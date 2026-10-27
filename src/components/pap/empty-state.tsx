"use client";

import Image from "next/image";
import Link from "next/link";
import { markPushedPage } from "@/lib/navigation";
import { botStartUrl } from "@/lib/share";
import { openTelegramUrl } from "@/lib/telegram";

type Props = {
  /** True when a feed filter emptied the deck, not when the feed is empty. */
  filtered?: boolean;
  onShowAll?: () => void;
};

/** Shown when the feed has nothing in it, or when the filter matches nothing. */
export function EmptyState({ filtered = false, onShowAll }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <Image
        src="/logo.png"
        alt="RetPAP"
        width={88}
        height={88}
        priority
        className="size-[88px] rounded-3xl shadow-2xl shadow-cyan-500/20"
      />
      <div className="space-y-1.5">
        <h2 className="text-base font-black text-slate-100">
          {filtered ? "Belum ada konten untuk pilihan ini" : "Belum ada foto atau video"}
        </h2>
        <p className="text-xs leading-relaxed text-slate-400">
          {filtered
            ? "Filter yang kamu pilih belum ada isinya. Tampilkan semua konten dulu, atau cek lagi nanti."
            : "Upload PAP pertamamu lewat bot: kirim /upload, lalu ikuti langkahnya. Kontennya langsung muncul di sini dan bisa di-rating orang lain."}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {filtered ? (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-cyan-500/25 active:scale-95"
          >
            Tampilkan semua
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openTelegramUrl(botStartUrl())}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-cyan-500/25 active:scale-95"
          >
            Buka Bot
          </button>
        )}
        <Link
          href="/leaderboard"
          onClick={() => markPushedPage()}
          className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-white"
        >
          Lihat leaderboard
        </Link>
      </div>
    </div>
  );
}
