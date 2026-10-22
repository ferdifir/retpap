"use client";

import Image from "next/image";
import { openTelegramUrl } from "@/lib/telegram";
import { botStartUrl } from "@/lib/share";

/** Blocking screen for people who opened the app without starting the bot. */
export function StartGate() {
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
        <h2 className="text-base font-black text-slate-100">Start bot dulu</h2>
        <p className="text-xs leading-relaxed text-slate-400">
          RetPAP hanya bisa dibuka setelah kamu menekan Start di chat bot. Setelah itu balik ke
          sini, aplikasinya akan terbuka sendiri.
        </p>
      </div>
      <button
        type="button"
        onClick={() => openTelegramUrl(botStartUrl())}
        className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-cyan-500/25 active:scale-95"
      >
        Buka Bot
      </button>
    </div>
  );
}
