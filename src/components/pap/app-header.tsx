import { EyeIcon, EyeOffIcon, InfoIcon, ShareIcon } from "@/components/icons";
import { formatVotes, getRatingTone } from "@/lib/rating";

type AppHeaderProps = {
  avgRating: number;
  votes: number;
  reactionsVisible: boolean;
  onToggleReactions: () => void;
  onShare: () => void;
  onInfoClick: () => void;
};

export function AppHeader({
  avgRating,
  votes,
  reactionsVisible,
  onToggleReactions,
  onShare,
  onInfoClick,
}: AppHeaderProps) {
  // Same tone the slider overlay uses, so the icon always matches the score.
  const tone = getRatingTone(avgRating);

  return (
    <header className="glass-panel z-30 flex shrink-0 items-center justify-between rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-base shadow-lg shadow-cyan-500/30"
        >
          {tone.emoji}
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
          onClick={onInfoClick}
          aria-label="How to use this app"
          className="glass-pill flex size-8 items-center justify-center rounded-full text-slate-300 transition-transform hover:text-white active:scale-95"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </div>
    </header>
  );
}
