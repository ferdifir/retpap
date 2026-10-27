import { formatVotes, ratingLevel } from "@/lib/rating";
import { RatingIcon } from "./rating-icon";

type AppHeaderProps = {
  avgRating: number;
  votes: number;
  reactionsVisible: boolean;
  onToggleReactions: () => void;
  onShare: () => void;
  onLeaderboardClick: () => void;
  /** Active feed filter; null before the first pick. */
  preference: "female" | "male" | "all" | null;
  onPreferenceClick: () => void;
};

const PREFERENCE_LABEL = {
  female: "Cewek",
  male: "Cowok",
  all: "Semua",
} as const;

/**
 * Animated Noto emoji, self-hosted at 64px and shown at 18px. The static PNG
 * is used when the user asks for reduced motion.
 */
const EMOJI = {
  "gender-female": "/emoji/gender-female",
  "gender-male": "/emoji/gender-male",
  "gender-all": "/emoji/gender-all",
  eyes: "/emoji/eyes",
  "eyes-off": "/emoji/eyes-off",
  share: "/emoji/share",
  trophy: "/emoji/trophy",
} as const;

type EmojiName = keyof typeof EMOJI;

function PillEmoji({ name }: { name: EmojiName }) {
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={EMOJI[name] + ".png"} />
      {/* Plain img: next/image would strip the animation. */}
      <img
        src={EMOJI[name] + ".webp"}
        alt=""
        width={18}
        height={18}
        draggable={false}
        className="pointer-events-none size-[18px] select-none"
      />
    </picture>
  );
}

function preferenceEmoji(preference: AppHeaderProps["preference"]): EmojiName {
  if (preference === "female") return "gender-female";
  if (preference === "male") return "gender-male";
  return "gender-all";
}

export function AppHeader({
  avgRating,
  votes,
  reactionsVisible,
  onToggleReactions,
  onShare,
  onLeaderboardClick,
  preference,
  onPreferenceClick,
}: AppHeaderProps) {
  const preferenceLabel = PREFERENCE_LABEL[preference ?? "all"];

  return (
    <header className="glass-panel z-30 flex shrink-0 items-center justify-between rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 shadow-lg shadow-slate-950/40"
        >
          <RatingIcon level={ratingLevel(avgRating)} className="size-7" />
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-extrabold leading-none tracking-wide text-amber-400">
              {avgRating.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-slate-400">/ 10.0</span>
          </div>
          <p className="text-[10px] font-medium text-slate-400">{formatVotes(votes)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreferenceClick}
          aria-label={"Ganti filter konten, sekarang " + preferenceLabel}
          title={"Filter: " + preferenceLabel}
          className="glass-pill flex size-8 items-center justify-center rounded-full transition-transform active:scale-90"
        >
          <PillEmoji name={preferenceEmoji(preference)} />
        </button>

        <button
          type="button"
          onClick={onToggleReactions}
          aria-pressed={reactionsVisible}
          aria-label={reactionsVisible ? "Sembunyikan reaksi emoji" : "Tampilkan reaksi emoji"}
          className="glass-pill flex size-8 items-center justify-center rounded-full transition-transform active:scale-90"
        >
          <PillEmoji name={reactionsVisible ? "eyes" : "eyes-off"} />
        </button>

        <button
          type="button"
          onClick={onShare}
          aria-label="Bagikan foto ini"
          className="glass-pill flex size-8 items-center justify-center rounded-full transition-transform active:scale-90"
        >
          <PillEmoji name="share" />
        </button>

        <button
          type="button"
          onClick={onLeaderboardClick}
          aria-label="Buka leaderboard"
          className="glass-pill flex size-8 items-center justify-center rounded-full transition-transform active:scale-90"
        >
          <PillEmoji name="trophy" />
        </button>
      </div>
    </header>
  );
}
