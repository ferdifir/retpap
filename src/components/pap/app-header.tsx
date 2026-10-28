import { formatVotes, ratingLevel } from "@/lib/rating";
import { RatingAchievementIcon, RATING_ACHIEVEMENT_NAMES } from "./rating-achievement-icon";

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
  const level = ratingLevel(avgRating);
  const achievementName = votes > 0 ? RATING_ACHIEVEMENT_NAMES[level - 1] : "Menunggu rating";

  return (
    <header className="glass-panel z-30 flex shrink-0 items-center justify-between rounded-2xl p-3">
      <div className="flex min-w-0 items-center gap-2">
        <RatingAchievementIcon
          level={level}
          earned={votes > 0}
          className="size-11 shrink-0 drop-shadow-md"
        />
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-extrabold leading-none tracking-wide text-amber-400">
              {avgRating.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-slate-400">/ 10.0</span>
          </div>
          <p className="truncate text-[9px] font-bold leading-tight text-amber-200">{achievementName}</p>
          <p className="truncate text-[9px] font-medium leading-tight text-slate-400">{formatVotes(votes)}</p>
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
