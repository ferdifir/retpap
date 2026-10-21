type GlyphProps = {
  score: number;
  size?: number;
  accent?: string;
  track?: string;
  /** Required for FilmGlyph: SVG mask ids must be unique per instance. */
  uid?: string;
};

const MIN = 1;
const MAX = 10;

function t(score: number) {
  return (Math.min(MAX, Math.max(MIN, score)) - MIN) / (MAX - MIN);
}

export type Tier = { label: string; accent: string };

export function tierFor(score: number): Tier {
  if (score < 4) return { label: "Blur", accent: "#60a5fa" };
  if (score < 6) return { label: "Snapshot", accent: "#94a3b8" };
  if (score < 7.5) return { label: "Solid", accent: "#fbbf24" };
  if (score < 9) return { label: "Sharp", accent: "#fb923c" };
  return { label: "Frame-worthy", accent: "#fde68a" };
}

/** A — plain vertical fader. Mirrors the app's core gesture. */
export function FaderGlyph({ score, size = 48, accent = "currentColor", track = "currentColor" }: GlyphProps) {
  const top = 4;
  const bottom = 52;
  const y = bottom - t(score) * (bottom - top);
  const ticks = [1, 5, 10].map((v) => bottom - t(v) * (bottom - top));

  return (
    <svg viewBox="0 0 32 56" width={(size * 32) / 56} height={size} aria-hidden="true">
      <rect x="12" y={top} width="8" height={bottom - top} rx="4" fill={track} opacity="0.22" />
      <rect x="12" y={y} width="8" height={bottom - y} rx="4" fill={accent} />
      {ticks.map((ty, i) => (
        <g key={i} stroke={track} strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
          <line x1="4" x2="9" y1={ty} y2={ty} />
          <line x1="23" x2="28" y1={ty} y2={ty} />
        </g>
      ))}
      <rect
        x="7"
        y={y - 3}
        width="18"
        height="6"
        rx="3"
        fill={accent}
        stroke="#fff"
        strokeOpacity="0.9"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A' — fader shaped like a film strip. */
export function FilmGlyph({ score, size = 48, accent = "currentColor", track = "currentColor", uid = "film" }: GlyphProps) {
  const top = 4;
  const bottom = 52;
  const y = bottom - t(score) * (bottom - top);
  const holes = [3, 13, 23, 33, 43];

  return (
    <svg viewBox="0 0 40 56" width={(size * 40) / 56} height={size} aria-hidden="true">
      <defs>
        <mask id={`mask-${uid}`}>
          <rect width="40" height="56" rx="3" fill="#fff" />
          {holes.map((hy) => (
            <g key={hy} fill="#000">
              <rect x="3" y={hy} width="5" height="4" rx="1" />
              <rect x="32" y={hy} width="5" height="4" rx="1" />
            </g>
          ))}
        </mask>
      </defs>
      <rect width="40" height="56" rx="3" fill={track} opacity="0.3" mask={`url(#mask-${uid})`} />
      <rect x="16" y={top} width="8" height={bottom - top} rx="2" fill={track} opacity="0.18" />
      <rect x="16" y={y} width="8" height={bottom - y} rx="2" fill={accent} />
      <rect
        x="10"
        y={y - 3.5}
        width="20"
        height="7"
        rx="3.5"
        fill={accent}
        stroke="#fff"
        strokeOpacity="0.9"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** B — camera light meter. */
export function MeterGlyph({ score, size = 48, accent = "currentColor", track = "currentColor" }: GlyphProps) {
  const cx = 32;
  const cy = 34;
  const r = 26;
  const at = (k: number, rr: number): [number, number] => [
    cx - rr * Math.cos(Math.PI * k),
    cy - rr * Math.sin(Math.PI * k),
  ];
  const [ex, ey] = at(t(score), r);
  const [nx, ny] = at(t(score), r - 7);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => {
    const [x1, y1] = at(k, r);
    const [x2, y2] = at(k, r - 5);
    return { x1, y1, x2, y2 };
  });

  return (
    <svg viewBox="0 0 64 40" width={size} height={(size * 40) / 64} aria-hidden="true">
      <path
        d={`M 6 34 A 26 26 0 0 1 ${ex} ${ey}`}
        fill="none"
        stroke={accent}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M 6 34 A 26 26 0 0 1 58 34" fill="none" stroke={track} strokeWidth="4" opacity="0.18" />
      {ticks.map((p, i) => (
        <line key={i} {...p} stroke={track} strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="2.6" fill={accent} />
    </svg>
  );
}

/** D — viewfinder focus bracket that tightens as the score rises. */
export function BracketGlyph({ score, size = 48, accent = "currentColor" }: GlyphProps) {
  const inset = 9 - t(score) * 6;
  const arm = 9;
  const far = 48 - inset;
  const d = [
    `M ${inset + arm} ${inset} H ${inset} V ${inset + arm}`,
    `M ${far - arm} ${inset} H ${far} V ${inset + arm}`,
    `M ${inset} ${far - arm} V ${far} H ${inset + arm}`,
    `M ${far} ${far - arm} V ${far} H ${far - arm}`,
  ];

  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      {d.map((p, i) => (
        <path key={i} d={p} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
