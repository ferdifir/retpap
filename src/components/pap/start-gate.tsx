"use client";

import Image from "next/image";
import { useState } from "react";
import { openTelegramUrl } from "@/lib/telegram";
import { botStartUrl } from "@/lib/share";

/** Which requirement is still missing: the bot chat, or the channel. */
export type GateKind = "start" | "channel";

const COPY = {
  start: {
    title: "Start bot dulu",
    body: "RetPAP hanya bisa dibuka setelah kamu menekan Start di chat bot. Setelah itu balik ke sini, aplikasinya akan terbuka sendiri.",
    action: "Buka Bot",
  },
  channel: {
    title: "Join channel dulu",
    body: "RetPAP hanya bisa dibuka untuk member channel. Tekan Join Channel, lalu kembali ke sini dan tekan Saya sudah join.",
    action: "Join Channel",
  },
} as const;

type Props = {
  kind: GateKind;
  channelUrl: string;
  /** Returns true when the subscription is now valid. */
  onRecheck: () => Promise<boolean>;
};

/** Blocking screen for people who skipped the bot or the channel. */
export function StartGate({ kind, channelUrl, onRecheck }: Props) {
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const copy = COPY[kind];

  const recheck = async () => {
    setChecking(true);
    setHint(null);

    const ok = await onRecheck().catch(() => false);

    setChecking(false);
    if (!ok) setHint("Belum terdeteksi. Pastikan kamu sudah join, lalu coba lagi.");
  };

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
        <h2 className="text-base font-black text-slate-100">{copy.title}</h2>
        <p className="text-xs leading-relaxed text-slate-400">{copy.body}</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => openTelegramUrl(kind === "start" ? botStartUrl() : channelUrl)}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-cyan-500/25 active:scale-95"
        >
          {copy.action}
        </button>

        {kind === "channel" ? (
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={checking}
            className="rounded-xl border border-white/10 px-5 py-2 text-[11px] font-bold text-slate-300 disabled:opacity-50"
          >
            {checking ? "Memeriksa…" : "Saya sudah join"}
          </button>
        ) : null}
      </div>

      {hint ? <p className="text-[11px] font-medium text-amber-400">{hint}</p> : null}
    </div>
  );
}
