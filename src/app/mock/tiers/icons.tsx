import type { ReactNode } from "react";

type Props = { size?: number; accent?: string; className?: string };

const CRYSTAL = "M24 6 L35 15 L35 31 L24 43 L13 31 L13 15 Z";

function Svg({ size = 48, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function Crystal({ dim = false }: { dim?: boolean }) {
  return (
    <g stroke="currentColor" fill="none" strokeLinejoin="round" opacity={dim ? 0.45 : 1}>
      <path d={CRYSTAL} strokeWidth="2.4" />
      <path d="M13 20 H35" strokeWidth="1.3" opacity="0.35" />
      <path d="M24 20 V43" strokeWidth="1.3" opacity="0.25" />
    </g>
  );
}

/** 1 — beku total: kristal dengan es menggantung. */
export function FrostIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal />
      <g fill={accent}>
        <path d="M18 35 L18 42 L21 37 Z" />
        <path d="M30 36 L30 42 L27 37 Z" />
      </g>
      <path d="M22 13 L26 17 L23 21" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

/** 2 — es: kristal dengan jarum frost keluar. */
export function IceIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal />
      <g stroke={accent} strokeWidth="1.7" strokeLinecap="round" fill="none">
        <path d="M12 14 L7 9 M12 14 L7 14 M12 14 L12 9" />
        <path d="M36 14 L41 9 M36 14 L41 14 M36 14 L36 9" />
        <path d="M18 32 L14 37 M30 32 L34 37" />
      </g>
    </Svg>
  );
}

/** 3 — mencair: retak dan titik leleh. */
export function ThawIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal />
      <path
        d="M24 9 L21 16 L26 20 L21 27"
        fill="none"
        stroke={accent}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35 38 C35 38 37.4 40.6 37.4 42.2 A2.4 2.4 0 0 1 32.6 42.2 C32.6 40.6 35 38 35 38 Z"
        fill={accent}
      />
    </Svg>
  );
}

/** 4 — bara: inti memanas. */
export function EmberIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal />
      <circle cx="24" cy="26" r="6" fill={accent} opacity="0.25" />
      <circle cx="24" cy="26" r="2.6" fill={accent} />
      <g fill={accent}>
        <circle cx="38" cy="13" r="1.7" />
        <circle cx="42" cy="19" r="1.1" />
      </g>
    </Svg>
  );
}

/** 5 — percikan: api pertama di sisi kristal. */
export function SparkIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal />
      <path
        d="M33 5 C35.2 9 37 10.6 37 14 C37 17.6 35.2 19.6 33 19.6 C30.8 19.6 29 17.6 29 14 C29 11.6 30.8 10.2 31.8 8.4 C31.9 10.4 32.7 11 33 11.4 C33.6 9.4 32.9 7 33 5 Z"
        fill={accent}
      />
      <circle cx="38.5" cy="23" r="1.4" fill={accent} />
    </Svg>
  );
}

/** 6 — api: kristal mulai terbakar dari atas. */
export function FlameIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <path
        d="M24 1 C28 7 33 9 33 16 C33 22.5 29 26.5 24 26.5 C19 26.5 15 22.5 15 16 C15 11.5 18 9 20 5.5 C20.4 9.5 22 10.6 22.8 11.2 C23.6 7.6 22.9 4 24 1 Z"
        fill={accent}
        opacity="0.9"
      />
      <Crystal />
    </Svg>
  );
}

/** 7 — kobaran: api menelan kristal. */
export function BlazeIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <path
        d="M24 0 C29 7 36 9.5 36 18 C36 26 30.5 31 24 31 C17.5 31 12 26 12 18 C12 12.5 15.5 9.5 18 5 C18.5 10 20.6 11.4 21.6 12.2 C22.6 7.8 21.8 3.6 24 0 Z"
        fill={accent}
      />
      <path d={CRYSTAL} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" opacity="0.55" />
      <g fill={accent}>
        <circle cx="39" cy="10" r="1.7" />
        <circle cx="43" cy="17" r="1.1" />
        <circle cx="36" cy="4" r="1.2" />
      </g>
    </Svg>
  );
}

/** 8 — petir: energi keluar dari kristal. */
export function BoltIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal dim />
      <path d="M29 3 L12 26 H21.5 L17.5 45 L36 20 H25.5 Z" fill={accent} />
    </Svg>
  );
}

/** 9 — overcharge: dua busur mengapit inti. */
export function OverchargeIcon({ size, accent = "currentColor" }: Props) {
  return (
    <Svg size={size}>
      <Crystal dim />
      <path d="M27 5 L15 24 H22.5 L19.5 41 L33 21 H24.5 Z" fill={accent} />
      <g stroke={accent} strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path d="M8 19 Q3.5 26 8 33" />
        <path d="M40 19 Q44.5 26 40 33" />
      </g>
    </Svg>
  );
}

/** 10 — supernova: kristal pecah jadi ledakan. */
export function NovaIcon({ size, accent = "currentColor" }: Props) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return {
      x1: 24 + Math.cos(a) * 15,
      y1: 24 + Math.sin(a) * 15,
      x2: 24 + Math.cos(a) * 22,
      y2: 24 + Math.sin(a) * 22,
    };
  });

  return (
    <Svg size={size}>
      <g stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.9">
        {rays.map((r, i) => (
          <line key={i} {...r} />
        ))}
      </g>
      <path d={CRYSTAL} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.4" />
      <path d="M26 11 L17 25 H22.5 L20 37 L31 22 H25.5 Z" fill={accent} />
    </Svg>
  );
}

export type Tier = {
  level: number;
  name: string;
  accent: string;
  Icon: (props: Props) => ReactNode;
};

export const TIERS: Tier[] = [
  { level: 1, name: "Frost", accent: "#7dd3fc", Icon: FrostIcon },
  { level: 2, name: "Ice", accent: "#60a5fa", Icon: IceIcon },
  { level: 3, name: "Thaw", accent: "#38bdf8", Icon: ThawIcon },
  { level: 4, name: "Ember", accent: "#fbbf24", Icon: EmberIcon },
  { level: 5, name: "Spark", accent: "#f59e0b", Icon: SparkIcon },
  { level: 6, name: "Flame", accent: "#f97316", Icon: FlameIcon },
  { level: 7, name: "Blaze", accent: "#ea580c", Icon: BlazeIcon },
  { level: 8, name: "Bolt", accent: "#facc15", Icon: BoltIcon },
  { level: 9, name: "Overcharge", accent: "#fde047", Icon: OverchargeIcon },
  { level: 10, name: "Supernova", accent: "#fef08a", Icon: NovaIcon },
];

export function tierFor(score: number): Tier {
  const level = Math.min(10, Math.max(1, Math.round(score)));
  return TIERS[level - 1];
}
