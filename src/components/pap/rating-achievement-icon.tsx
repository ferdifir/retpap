import Image from "next/image";
import { cn } from "@/lib/cn";

export const RATING_ACHIEVEMENT_NAMES = [
  "Awal Mula",
  "Pendatang Baru",
  "Mulai Bersinar",
  "Bintang Perunggu",
  "Bintang Perak",
  "Bintang Emas",
  "Favorit PAP",
  "Ikon PAP",
  "Superstar",
  "Legenda RetPAP",
] as const;

type RatingAchievementIconProps = {
  level: number;
  earned?: boolean;
  className?: string;
};

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number) {
  return Array.from({ length: points * 2 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    const radius = index % 2 === 0 ? outer : inner;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
}

function palette(level: number) {
  if (level === 1) return { edge: "#22d3ee", dark: "#0e7490", light: "#cffafe" };
  if (level <= 4) return { edge: "#f59e0b", dark: "#92400e", light: "#fde68a" };
  if (level === 5) return { edge: "#cbd5e1", dark: "#475569", light: "#f8fafc" };
  if (level <= 7) return { edge: "#facc15", dark: "#a16207", light: "#fef08a" };
  if (level <= 9) return { edge: "#c4b5fd", dark: "#6d28d9", light: "#f5f3ff" };
  return { edge: "#fde047", dark: "#b45309", light: "#fff7ad" };
}

export function RatingAchievementIcon({ level, earned = true, className }: RatingAchievementIconProps) {
  const rank = Math.min(10, Math.max(1, Math.round(level)));
  const colors = palette(rank);
  const gradientId = `rating-achievement-metal-${rank}`;

  if (!earned) {
    return (
      <div className={cn("relative isolate", className)} aria-hidden="true">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 108">
          <circle cx="50" cy="51" r="30" fill="#0f172a" stroke="#64748b" strokeDasharray="5 5" strokeWidth="4" />
          <polygon points={starPoints(50, 48, 15, 7, 5)} fill="none" stroke="#94a3b8" strokeWidth="3" />
        </svg>
      </div>
    );
  }

  const points = rank === 1 ? 5 : rank < 4 ? 8 : 12;
  const innerRadius = rank === 1 ? 24 : rank < 4 ? 27 : rank < 8 ? 28 : 30;
  const ribbons =
    rank >= 3 ? (
      <g fill={colors.dark} stroke={colors.edge} strokeWidth="2">
        <path d="M34 69 30 99 44 91 50 101 54 70Z" />
        <path d="M66 69 70 99 56 91 50 101 46 70Z" />
      </g>
    ) : null;
  const laurels =
    rank >= 6 ? (
      <g fill="none" stroke={colors.edge} strokeLinecap="round" strokeWidth="2.7">
        <path d="M23 66Q9 47 23 29M77 66Q91 47 77 29" />
        <path d="m18 55 8-1m-6-10 8 2m-3-11 7 4m50 16-8-1m6-10-8 2m3-11-7 4" />
      </g>
    ) : null;
  const rays =
    rank >= 9
      ? Array.from({ length: 8 }, (_, index) => (
          <path
            key={index}
            d={`M50 13V${index % 2 ? 4 : 0}`}
            stroke={colors.edge}
            strokeLinecap="round"
            strokeWidth={index % 2 ? 2 : 3}
            transform={`rotate(${index * 45} 50 48)`}
          />
        ))
      : null;
  const crown =
    rank >= 8 ? (
      <g stroke={colors.edge} strokeWidth="2.5" strokeLinejoin="round">
        <path d="m34 22-3-13 11 8 8-12 8 12 11-8-3 13Z" fill={`url(#${gradientId})`} />
        <circle cx="31" cy="8" r="2.4" fill={colors.light} />
        <circle cx="50" cy="4.5" r="2.8" fill={colors.light} />
        <circle cx="69" cy="8" r="2.4" fill={colors.light} />
      </g>
    ) : null;

  return (
    <div className={cn("relative isolate", className)} aria-hidden="true">
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 108">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor={colors.light} />
            <stop offset=".55" stopColor={colors.edge} />
            <stop offset="1" stopColor={colors.dark} />
          </linearGradient>
        </defs>
        <g fill="none">{rays}</g>
        {ribbons}
        {laurels}
        {crown}
        <polygon
          points={starPoints(50, 51, 32, innerRadius, points)}
          fill={`url(#${gradientId})`}
          stroke={colors.edge}
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <circle cx="50" cy="51" r="22" fill={colors.dark} stroke={colors.light} strokeWidth="2.5" />
        <polygon points={starPoints(50, 44, 13, 6, 5)} fill={colors.light} />
        <text
          x="50"
          y="70"
          fill="white"
          fontFamily="ui-sans-serif, system-ui"
          fontSize="13"
          fontWeight="900"
          textAnchor="middle"
        >
          {rank}
        </text>
        {rank === 10 ? (
          <path d="M20 70Q50 91 80 70" fill="none" stroke={colors.light} strokeLinecap="round" strokeWidth="3" />
        ) : null}
      </svg>
      <Image
        src="/rating-mascot.webp"
        alt=""
        width={64}
        height={64}
        className="absolute -bottom-0.5 -right-0.5 size-[18px] object-contain drop-shadow-md"
      />
    </div>
  );
}
