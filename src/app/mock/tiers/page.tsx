import Image from "next/image";
import type { ReactNode } from "react";
import { TIERS, tierFor } from "./icons";

function Watermark({ score }: { score: number }) {
  const tier = tierFor(score);
  const { Icon } = tier;

  return (
    <div className="relative aspect-3/4 overflow-hidden rounded-2xl bg-slate-800">
      <Image src="/foto.jpg" alt="" fill sizes="(max-width: 768px) 50vw, 220px" className="object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pt-14 pb-3">
        <div className="flex items-end gap-2.5 text-white">
          <div className="shrink-0">
            <Icon size={42} accent={tier.accent} />
          </div>
          <div className="min-w-0">
            <div className="text-[28px] leading-none font-black tracking-tight tabular-nums">{score.toFixed(1)}</div>
            <div className="mt-1 truncate text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: tier.accent }}>
              {tier.name}
            </div>
            <div className="text-[8px] font-medium tracking-wide text-white/55">ratepap · t.me/ratepap</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Band({ level }: { level: number }) {
  const lo = level - 0.5;
  const hi = level === 10 ? 10 : level + 0.4;
  return (
    <span className="text-[9px] tabular-nums text-slate-500">
      {lo.toFixed(1)}–{hi.toFixed(1)}
    </span>
  );
}

export default function TierLadderPage() {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain" style={{ touchAction: "auto" }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 text-slate-200">
        <header className="mb-8">
          <h1 className="text-xl font-bold text-white">Mock: 10 ikon nilai</h1>
          <p className="mt-1 text-sm text-slate-400">
            Satu bahasa bentuk: kristal yang memanas lalu meledak. Es → api → petir.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">Tangga 1–10 · 48px</h2>
          <div className="grid grid-cols-5 gap-2">
            {TIERS.map((t) => (
              <div key={t.level} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex h-12 items-center">
                  <t.Icon size={46} accent={t.accent} />
                </div>
                <div className="text-[11px] font-semibold text-white">
                  {t.level} · {t.name}
                </div>
                <Band level={t.level} />
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">Ukuran nyata · 24px</h2>
          <div className="flex flex-wrap items-end gap-5 rounded-xl border border-white/10 bg-slate-900/70 p-4">
            {TIERS.map((t) => (
              <div key={t.level} className="flex flex-col items-center gap-1">
                <t.Icon size={24} accent={t.accent} />
                <span className="text-[9px] tabular-nums text-slate-500">{t.level}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-5 rounded-xl border border-white/10 p-4">
            {TIERS.map((t) => (
              <div key={t.level} className="relative size-8 overflow-hidden rounded-md">
                <Image src="/foto.jpg" alt="" fill sizes="32px" className="object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                  <t.Icon size={22} accent={t.accent} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Baris kedua: kontras di atas foto.</p>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">Watermark share</h2>
          <div className="grid grid-cols-3 gap-3">
            {[3.2, 6.8, 9.4].map((score) => (
              <Watermark key={score} score={score} />
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Skor desimal dibulatkan ke ikon terdekat (6.8 → Flame, 9.4 → Overcharge), angka tetap menampilkan nilai asli.
          </p>
        </section>
      </div>
    </div>
  );
}
