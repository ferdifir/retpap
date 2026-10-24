import type { Metadata } from "next";
import { RatingIcon } from "@/components/pap/rating-icon";
import { RATING_LEVEL_NAMES } from "@/lib/rating";

export const metadata: Metadata = {
  title: "Mock: ikon rating — RetPAP",
};

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

function band(level: number): string {
  const low = level === 1 ? 1 : level - 0.5;
  const high = level === 10 ? 10 : level + 0.4;
  return low.toFixed(1) + "–" + high.toFixed(1);
}

export default function RatingIconMockPage() {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain" style={{ touchAction: "auto" }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 text-slate-200">
        <header className="mb-8">
          <h1 className="text-xl font-bold text-white">Mock: 10 level kristal rating</h1>
          <p className="mt-1 text-sm text-slate-400">
            Satu siluet kristal, energi yang bertambah: es → api → petir → ledakan.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Tangga 1–10 · 96px
          </h2>
          <div className="grid grid-cols-5 gap-2">
            {LEVELS.map((level) => (
              <div
                key={level}
                className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-900/70 p-3"
              >
                <RatingIcon level={level} className="size-20" />
                <span className="text-[11px] font-semibold text-white">
                  {level} · {RATING_LEVEL_NAMES[level - 1]}
                </span>
                <span className="text-[9px] text-slate-500 tabular-nums">{band(level)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Ukuran nyata · 48 / 24 / 20 px
          </h2>
          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/70 p-4">
            {[48, 24, 20].map((size) => (
              <div key={size} className="flex flex-wrap items-end gap-4">
                <span className="w-10 text-[9px] text-slate-500 tabular-nums">{size}px</span>
                {LEVELS.map((level) => (
                  <RatingIcon key={level} level={level} size={size} className="shrink-0" />
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Konteks header
          </h2>
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/70 p-4">
            {[2.3, 5.8, 7.5, 9.6].map((score) => (
              <div key={score} className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/70">
                  <RatingIcon level={Math.round(score)} className="size-7" />
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-extrabold text-amber-400 tabular-nums">
                      {score.toFixed(1)}
                    </span>
                    <span className="text-xs text-slate-400">/ 10.0</span>
                  </div>
                  <p className="text-[10px] text-slate-400">128 penilaian</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Konteks overlay rating
          </h2>
          <div className="flex flex-wrap gap-3">
            {[3.4, 6.2, 8.7, 10].map((score) => (
              <div
                key={score}
                className="flex flex-col items-center rounded-2xl border border-white/15 bg-slate-900/80 px-6 py-4"
              >
                <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                  Nilaimu
                </span>
                <span className="text-4xl font-black text-white tabular-nums">{score.toFixed(1)}</span>
                <RatingIcon level={Math.round(score)} className="mt-1 size-14" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
