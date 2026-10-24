import { EyeIcon, EyeOffIcon, ShareIcon, TrophyIcon } from "@/components/icons";
import { formatVotes, ratingLevel } from "@/lib/rating";
import { RatingIcon } from "./rating-icon";

type AppHeaderProps = {
  avgRating: number;
  votes: number;
  reactionsVisible: boolean;
  onToggleReactions: () => void;
  onShare: () => void;
  onLeaderboardClick: () => void;
};

export function AppHeader({
  avgRating,
  votes,
  reactionsVisible,
  onToggleReactions,
  onShare,
  onLeaderboardClick,
}: AppHeaderProps) {
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
          onClick={onToggleReactions}
          aria-pressed={reactionsVisible}
          aria-label={reactionsVisible ? "Sembunyikan reaksi emoji" : "Tampilkan reaksi emoji"}
          className={
            "glass-pill flex size-8 items-center justify-center rounded-full transition-transform active:scale-95 " +
            (reactionsVisible ? "text-cyan-300" : "text-slate-400 hover:text-white")
          }
        >
          {reactionsVisible ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
        </button>

        <button
          type="button"
          onClick={onShare}
          aria-label="Bagikan foto ini"
          className="glass-pill flex size-8 items-center justify-center rounded-full text-slate-300 transition-transform hover:text-white active:scale-95"
        >
          <ShareIcon className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={onLeaderboardClick}
          aria-label="Buka leaderboard"
          className="glass-pill flex size-8 items-center justify-center rounded-full text-amber-300 transition-transform hover:text-amber-200 active:scale-95"
        >
          <TrophyIcon className="size-3.5" />
        </button>
      </div>
    </header>
  );
}
