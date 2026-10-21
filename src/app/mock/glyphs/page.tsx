import Image from "next/image";
import type { ReactNode } from "react";
import { BracketGlyph, FaderGlyph, FilmGlyph, MeterGlyph, tierFor } from "./glyphs";

const VARIANTS = [
  {
    key: "fader",
    name: "A · Fader",
    note: "Echo gestur slider. Paling netral, paling mudah dibaca di 20px.",
    render: (score: number, size: number, uid: string) => (
      <FaderGlyph score={score} size={size} accent={tierFor(score).accent} uid={uid} />
    ),
  },
  {
    key: "film",
    name: "A' · Film-strip Fader",
    note: "Fader yang dibentuk film strip. Paling brandable, tapi paling ramai.",
    render: (score: number, size: number, uid: string) => (
      <FilmGlyph score={score} size={size} accent={tierFor(score).accent} uid={uid} />
    ),
  },
  {
    key: "meter",
    name: "B · Light Meter",
    note: "Metafora exposure. Kontinu dan fotografi, tapi bentuknya lebar.",
    render: (score: number, size: number, uid: string) => (
      <MeterGlyph score={score} size={size} accent={tierFor(score).accent} uid={uid} />
    ),
  },
  {
    key: "bracket",
    name: "D · Focus Bracket",
    note: "Paling bersih, tapi nilainya nyaris tidak terbaca tanpa angka.",
    render: (score: number, size: number, uid: string) => (
      <BracketGlyph score={score} size={size} accent={tierFor(score).accent} uid={uid} />
    ),
  },
];

const SCORES = [2, 5.5, 7.5, 9.5];

function Watermark({
  score,
  glyph,
  uid,
}: {
  score: number;
  glyph: (score: number, size: number, uid: string) => ReactNode;
  uid: string;
}) {
  const tier = tierFor(score);

  return (
    <div className="relative aspect-3/4 overflow-hidden rounded-2xl bg-slate-800">
      <Image src="/foto.jpg" alt="" fill sizes="(max-width: 768px) 50vw, 240px" className="object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pt-14 pb-3">
        <div className="flex items-end gap-2.5 text-white">
          <div className="shrink-0">{glyph(score, 40, uid)}</div>
          <div className="min-w-0">
            <div className="text-[28px] leading-none font-black tracking-tight tabular-nums">
              {score.toFixed(1)}
            </div>
            <div className="mt-1 truncate text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: tier.accent }}>
              {tier.label}
            </div>
            <div className="text-[8px] font-medium tracking-wide text-white/55">ratepap · t.me/ratepap</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlyphMockPage() {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain" style={{ touchAction: "auto" }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 text-slate-200">
        <header className="mb-8">
          <h1 className="text-xl font-bold text-white">Mock: ikon nilai rating</h1>
          <p className="mt-1 text-sm text-slate-400">
            Empat varian glyph, skala 1–10. Warna mengikuti tier, bukan ikon berbeda.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">Ukuran &amp; skor</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {VARIANTS.map((v) => (
              <div key={v.key} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <div className="mb-1 text-sm font-semibold text-white">{v.name}</div>
                <p className="mb-4 text-xs leading-relaxed text-slate-400">{v.note}</p>

                <div className="mb-4 flex items-end gap-5">
                  {[56, 32, 20].map((size) => (
                    <div key={size} className="flex flex-col items-center gap-1.5">
                      <div className="flex h-14 items-end">{v.render(8.4, size, `${v.key}-size-${size}`)}</div>
                      <span className="text-[9px] text-slate-500">{size}px</span>
                    </div>
                  ))}
                  <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                    <Image src="/foto.jpg" alt="" fill sizes="56px" className="object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                      {v.render(8.4, 36, `${v.key}-chip`)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t border-white/5 pt-3">
                  {SCORES.map((score) => (
                    <div key={score} className="flex flex-col items-center gap-1">
                      <div className="flex h-11 items-end">{v.render(score, 34, `${v.key}-${score}`)}</div>
                      <span className="text-[10px] tabular-nums text-slate-400">{score.toFixed(1)}</span>
                      <span className="text-[8px] font-bold tracking-wider uppercase" style={{ color: tierFor(score).accent }}>
                        {tierFor(score).label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400 uppercase">Watermark share · skor 8.4</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VARIANTS.map((v) => (
              <div key={v.key}>
                <Watermark score={8.4} glyph={v.render} uid={`${v.key}-wm`} />
                <div className="mt-2 text-center text-[11px] text-slate-400">{v.name}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Uji baca: perkecil layar ke lebar ponsel, lalu lihat apakah glyph masih terbaca sebagai indikator nilai.
          </p>
        </section>
      </div>
    </div>
  );
}
