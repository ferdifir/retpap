"use client";

import Image from "next/image";
import { haptic } from "@/lib/telegram";

/** Feed filter; null means the user has not picked yet. */
export type GenderPreference = "female" | "male" | "all";

const OPTIONS: { value: GenderPreference; label: string; hint: string }[] = [
  { value: "female", label: "Cewek", hint: "Konten dari cewek" },
  { value: "male", label: "Cowok", hint: "Konten dari cowok" },
  { value: "all", label: "Semua", hint: "Tampilkan semuanya" },
];

type Props = {
  /** Current pick; null on the first visit, when nothing is stored yet. */
  value: GenderPreference | null;
  busy: boolean;
  error: string | null;
  onPick: (value: GenderPreference) => void;
  /** Only available when reopening the picker from the header. */
  onClose?: () => void;
};

/** First-run filter chooser, also reused when the user changes the filter. */
export function GenderPicker({ value, busy, error, onPick, onClose }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <Image
        src="/logo.png"
        alt="RetPAP"
        width={88}
        height={88}
        priority
        className="size-[88px] rounded-3xl shadow-2xl shadow-cyan-500/20"
      />

      <div className="space-y-1.5">
        <h2 className="text-base font-black text-slate-100">Mau lihat konten siapa?</h2>
        <p className="text-xs leading-relaxed text-slate-400">
          Pilihan ini menyaring feed. Kamu bisa menggantinya kapan saja dari tombol di header.
        </p>
      </div>

      <div className="flex w-full max-w-[240px] flex-col gap-2">
        {OPTIONS.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => {
                haptic("selection");
                onPick(option.value);
              }}
              className={
                "flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-transform active:scale-[0.98] disabled:opacity-50 " +
                (active
                  ? "border-cyan-300/70 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25"
                  : "border-white/10 bg-slate-900/60 text-slate-200")
              }
            >
              <span className="text-xs font-extrabold">{option.label}</span>
              <span className={"text-[10px] " + (active ? "text-cyan-50/80" : "text-slate-500")}>
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p className="text-[11px] font-medium text-amber-400">{error}</p> : null}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-5 py-2 text-[11px] font-bold text-slate-300 active:scale-95"
        >
          Tutup
        </button>
      ) : null}
    </div>
  );
}
