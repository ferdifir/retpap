"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PlayIcon, TrophyIcon } from "@/components/icons";
import { useTelegram } from "@/hooks/use-telegram";
import { useTelegramUser } from "@/hooks/use-telegram-user";
import { cn } from "@/lib/cn";
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResult,
} from "@/lib/feed-types";
import {
  LEADERBOARD_PERIOD_ORDER,
  LEADERBOARD_PERIODS,
  parseLeaderboardPeriod,
} from "@/lib/leaderboard-period";
import { hasPushedPage, markPushedPage } from "@/lib/navigation";
import {
  leaderboardPath,
  markStartTargetHandled,
  SHARE_PHOTO_PARAM,
} from "@/lib/share";
import {
  getTelegramWebApp,
  haptic,
  TELEGRAM_READY_EVENT,
} from "@/lib/telegram";

type LoadState = "loading" | "ready" | "error";

const RANK_STYLES = {
  1: {
    width: "w-[88px] min-[360px]:w-[100px]",
    ring: "bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 shadow-[0_10px_30px_rgba(245,158,11,0.18)]",
    badge:
      "bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950 shadow-[0_0_12px_rgba(245,158,11,0.45)]",
    score: "text-xl text-amber-300",
    pedestal:
      "h-[86px] border-amber-400/25 bg-gradient-to-b from-amber-400/15 to-slate-950/90",
    pedestalNumber: "text-3xl",
  },
  2: {
    width: "w-[72px] min-[360px]:w-[82px]",
    ring: "bg-gradient-to-br from-slate-100 via-slate-400 to-slate-600 shadow-[0_10px_26px_rgba(148,163,184,0.12)]",
    badge:
      "bg-gradient-to-br from-slate-100 to-slate-400 text-slate-950 shadow-[0_0_10px_rgba(203,213,225,0.25)]",
    score: "text-[17px] text-slate-100",
    pedestal:
      "h-[60px] border-slate-400/15 bg-gradient-to-b from-slate-700/60 to-slate-950/90",
    pedestalNumber: "text-[27px]",
  },
  3: {
    width: "w-[72px] min-[360px]:w-[82px]",
    ring: "bg-gradient-to-br from-orange-200 via-orange-500 to-orange-800 shadow-[0_10px_26px_rgba(249,115,22,0.12)]",
    badge:
      "bg-gradient-to-br from-orange-200 to-orange-500 text-orange-950 shadow-[0_0_10px_rgba(249,115,22,0.3)]",
    score: "text-[17px] text-orange-200",
    pedestal:
      "h-[48px] border-orange-400/15 bg-gradient-to-b from-orange-500/10 to-slate-950/90",
    pedestalNumber: "text-2xl",
  },
} as const;

/** Empty-state copy per tab, so the user knows which window is thin. */
const EMPTY_HINT: Record<LeaderboardPeriod, string> = {
  day: "Belum ada cukup rating hari ini.",
  week: "Belum ada cukup rating minggu ini.",
  month: "Belum ada cukup rating bulan ini.",
  all: "Belum ada PAP yang cukup di-rating.",
};

function PeriodTabs({
  period,
  onChange,
}: {
  period: LeaderboardPeriod;
  onChange: (period: LeaderboardPeriod) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Periode leaderboard"
      className="mx-1 mb-2 flex shrink-0 gap-1 rounded-2xl border border-slate-700/30 bg-slate-900/70 p-1"
    >
      {LEADERBOARD_PERIOD_ORDER.map((item) => {
        const active = item === period;

        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item)}
            className={cn(
              "flex-1 rounded-xl px-1.5 py-1.5 text-[10px] font-extrabold tracking-tight transition-colors",
              active
                ? "bg-gradient-to-r from-cyan-500/25 to-blue-600/25 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                : "text-slate-500 hover:text-slate-300",
            )}
          >
            {LEADERBOARD_PERIODS[item].label}
          </button>
        );
      })}
    </div>
  );
}

function thumbnailFor(entry: LeaderboardEntry): string {
  if (entry.mediaType === "video") return entry.posterUrl ?? "/logo.png";
  return entry.imageUrl;
}

function VideoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Video"
      className={cn(
        "absolute inline-flex items-center justify-center rounded-md border border-white/20 bg-slate-950/80 text-white backdrop-blur",
        compact
          ? "bottom-1 left-1 size-4"
          : "bottom-1.5 left-1.5 h-[18px] gap-1 px-1.5 text-[8px] font-extrabold",
      )}
    >
      <PlayIcon className="size-2" />
      {compact ? null : <span>VID</span>}
    </span>
  );
}

function PodiumCard({
  entry,
  rank,
  onOpen,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  onOpen: (slug: string) => void;
}) {
  const styles = RANK_STYLES[rank];

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.slug)}
      aria-label={`Buka ${entry.caption || "PAP"} di feed`}
      className={cn(
        "group flex min-w-0 shrink-0 flex-col items-center text-center transition-transform active:scale-[0.98]",
        styles.width,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[22px] items-center text-lg leading-none",
          rank === 1
            ? "text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]"
            : "invisible",
        )}
      >
        ♛
      </span>

      <span
        className={cn(
          "relative block w-full rounded-[17px] p-[3px]",
          styles.ring,
        )}
      >
        <span className="relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-slate-950">
          <Image
            src={thumbnailFor(entry)}
            alt={entry.caption || "PAP"}
            fill
            sizes={
              rank === 1
                ? "(min-width: 360px) 100px, 88px"
                : "(min-width: 360px) 82px, 72px"
            }
            loading="eager"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          {entry.mediaType === "video" ? <VideoBadge /> : null}
        </span>
        <span
          className={cn(
            "absolute -bottom-2.5 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full border-2 border-slate-950 text-[10px] font-black",
            styles.badge,
          )}
        >
          {rank}
        </span>
      </span>

      <span className="mt-3.5 line-clamp-1 w-full text-[10.5px] font-extrabold text-slate-100">
        {entry.caption || "Tanpa caption"}
      </span>
      <span
        className={cn(
          "mt-1 font-black leading-none tracking-tight tabular-nums",
          styles.score,
        )}
      >
        {entry.avg.toFixed(1)}
        <span className="text-[8px] font-bold tracking-normal text-slate-500">
          /10
        </span>
      </span>
      <span className="mt-0.5 text-[8.5px] text-slate-500">
        {entry.votes} rating
      </span>

      <span
        className={cn(
          "mt-1.5 flex w-full items-start justify-center overflow-hidden rounded-t-[9px] border border-b-0 border-slate-700/40 pt-1.5",
          styles.pedestal,
        )}
      >
        <span
          className={cn(
            "font-black leading-none tracking-tighter text-slate-200/10 tabular-nums",
            styles.pedestalNumber,
          )}
        >
          #{rank}
        </span>
      </span>
    </button>
  );
}

export function LeaderboardLoading() {
  return (
    <div className="flex h-full flex-col pb-1">
      <p className="sr-only">Memuat leaderboard…</p>
      <div className="mx-1 h-[300px] animate-pulse rounded-[22px] border border-slate-700/30 bg-slate-900/80 motion-reduce:animate-none" />
      <div className="mx-1 mt-3 space-y-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-[54px] animate-pulse rounded-[13px] border border-slate-700/20 bg-slate-900/60 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

export function Leaderboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = parseLeaderboardPeriod(searchParams.get("period"));
  const [result, setResult] = useState<LeaderboardResult | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  useTelegram();

  const identity = useTelegramUser();

  useEffect(() => {
    // Arriving here by any route (deeplink, reload, or the feed) settles the
    // launch target, so going back to the feed cannot re-trigger a redirect.
    markStartTargetHandled();
  }, []);

  useEffect(() => {
    // A deep link or a reload can land here without a session cookie, so the
    // page bootstraps one exactly like the feed does before asking for data.
    if (!identity) return;

    const controller = new AbortController();

    const load = async () => {
      setLoadState("loading");

      try {
        const session = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            initData: identity.initData || undefined,
            devUserId: identity.userId,
          }),
          signal: controller.signal,
        });
        if (!session.ok) throw new Error("session");

        const sessionBody = (await session.json()) as {
          started: boolean;
          subscribed: boolean;
        };
        if (controller.signal.aborted) return;

        // The feed owns the channel gate; send the user there to pass it.
        if (!sessionBody.subscribed) {
          router.replace("/");
          return;
        }

        const response = await fetch(`/api/leaderboard?period=${period}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error("leaderboard");

        const body = (await response.json()) as LeaderboardResult;
        setResult(body);
        setLoadState("ready");
      } catch {
        if (controller.signal.aborted) return;
        setLoadState("error");
      }
    };

    void load();

    // A tab switch aborts the old request so its response cannot win the race.
    return () => controller.abort();
  }, [identity, period, retryKey, router]);

  useEffect(() => {
    let attached = false;

    const back = () => {
      haptic("light");
      // A cold start (a deeplink or a reload) has no in-app page underneath,
      // so popping would close the Mini App. Navigate to the feed instead.
      if (hasPushedPage() && window.history.length > 1) {
        router.back();
        return;
      }

      markPushedPage();
      router.push("/");
    };

    const sync = () => {
      const webApp = getTelegramWebApp();
      if (
        !webApp?.BackButton ||
        webApp.platform === "unknown" ||
        !webApp.initData ||
        attached
      ) {
        return;
      }

      try {
        webApp.BackButton.show();
        webApp.BackButton.onClick(back);
        attached = true;
      } catch {
        // Older Telegram clients expose the button but reject the call.
      }
    };

    sync();
    window.addEventListener(TELEGRAM_READY_EVENT, sync);

    return () => {
      window.removeEventListener(TELEGRAM_READY_EVENT, sync);
      const webApp = getTelegramWebApp();
      try {
        webApp?.BackButton?.offClick(back);
        webApp?.BackButton?.hide();
      } catch {
        // The client cannot show a native back button.
      }
    };
  }, [router]);

  const openEntry = (slug: string) => {
    haptic("light");
    router.push(`/?${SHARE_PHOTO_PARAM}=${encodeURIComponent(slug)}`);
  };

  const goToFeed = () => {
    markPushedPage();
    router.push("/");
  };

  const entries = result?.entries ?? [];
  const meta = LEADERBOARD_PERIODS[period];

  const changePeriod = (next: LeaderboardPeriod) => {
    if (next === period) return;
    haptic("selection");
    // replace, not push: Telegram's back button should return to the feed
    // rather than walk back through every tab the user opened.
    router.replace(leaderboardPath(next), { scroll: false });
  };

  const tabs = <PeriodTabs period={period} onChange={changePeriod} />;
  const scrollArea =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  if (
    loadState === "loading" ||
    (loadState === "ready" && result?.period !== period)
  ) {
    return (
      <div className="flex h-full flex-col">
        {tabs}
        <div className={scrollArea}>
          <LeaderboardLoading />
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex h-full flex-col">
        {tabs}
        <div className="min-h-0 flex-1">
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <TrophyIcon className="size-8 text-slate-600" />
            <p className="text-xs font-medium text-slate-400">
              Gagal memuat leaderboard.
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((key) => key + 1)}
              className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-slate-700 active:scale-95"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={goToFeed}
              className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-white"
            >
              Kembali ke feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {tabs}
        <div className="min-h-0 flex-1">
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
              <TrophyIcon className="size-6" />
            </div>
            <h1 className="text-base font-black text-slate-100">
              Belum ada juara
            </h1>
            <p className="max-w-[260px] text-xs leading-relaxed text-slate-400">
              {EMPTY_HINT[period]} Minimal {meta.minVotes} rating.
            </p>
            <button
              type="button"
              onClick={goToFeed}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-[11px] font-extrabold text-white shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              Kembali ke feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  const [first, second, third] = entries;
  const rest = entries.slice(3, 10);

  return (
    <div className="flex h-full flex-col">
      {tabs}
      <div className={scrollArea}>
        <section
          aria-label="Tiga PAP teratas"
          className="relative mx-1 overflow-hidden rounded-[22px] border border-slate-700/30"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.13), transparent 48%), radial-gradient(ellipse at 12% 32%, rgba(34,211,238,0.10), transparent 40%), linear-gradient(180deg, #0d1728 0%, #0a1220 100%)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-36 opacity-70"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,211,238,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.12) 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              transform: "perspective(240px) rotateX(58deg)",
              transformOrigin: "bottom center",
              maskImage: "linear-gradient(to top, #000 10%, transparent 88%)",
              WebkitMaskImage:
                "linear-gradient(to top, #000 10%, transparent 88%)",
            }}
          />

          <div className="relative z-10 flex items-end justify-center gap-2 px-2 pt-4">
            {second ? (
              <PodiumCard entry={second} rank={2} onOpen={openEntry} />
            ) : null}
            <PodiumCard entry={first} rank={1} onOpen={openEntry} />
            {third ? (
              <PodiumCard entry={third} rank={3} onOpen={openEntry} />
            ) : null}
          </div>
        </section>

        {rest.length > 0 ? (
          <section aria-label="Peringkat 4 sampai 10" className="mt-3">
            <div className="flex items-baseline justify-between px-1 pb-2 text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
              <span>Peringkat 4–10</span>
              <span>Rating</span>
            </div>

            {rest.map((entry, index) => {
              const rank = index + 4;

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => openEntry(entry.slug)}
                  aria-label={`Buka ${entry.caption || "PAP"} di feed`}
                  className="mb-1.5 grid w-full grid-cols-[22px_42px_minmax(0,1fr)_auto_10px] items-center gap-2 rounded-[13px] border border-slate-700/25 bg-slate-800/40 px-2.5 py-1.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:scale-[0.99]"
                >
                  <span className="text-center text-[10px] font-black text-slate-500 tabular-nums">
                    {String(rank).padStart(2, "0")}
                  </span>

                  <span className="relative block size-[42px] overflow-hidden rounded-[10px] border border-slate-700/30 bg-slate-950">
                    <Image
                      src={thumbnailFor(entry)}
                      alt=""
                      fill
                      sizes="42px"
                      className="object-cover"
                    />
                    {entry.mediaType === "video" ? (
                      <VideoBadge compact />
                    ) : null}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-[10.5px] font-bold text-slate-100">
                      {entry.caption || "Tanpa caption"}
                    </span>
                    <span className="block text-[8.5px] text-slate-500">
                      {entry.votes} rating
                    </span>
                  </span>

                  <span className="min-w-[35px] rounded-lg border border-amber-400/25 bg-amber-400/10 px-1.5 py-1 text-center text-[10.5px] font-black text-amber-300 tabular-nums">
                    {entry.avg.toFixed(1)}
                  </span>

                  <span
                    aria-hidden="true"
                    className="text-[15px] leading-none text-slate-500"
                  >
                    ›
                  </span>
                </button>
              );
            })}
          </section>
        ) : null}

        <p className="mx-3 mb-1 mt-2 flex items-start gap-1.5 text-[8.5px] leading-relaxed text-slate-500">
          <span aria-hidden="true" className="mt-px">
            ⓘ
          </span>
          <span>
            Diurutkan dari{" "}
            <b className="font-bold text-slate-400">rata-rata rating</b> ·{" "}
            <b className="font-bold text-slate-400">{meta.label}</b> · minimal{" "}
            <b className="font-bold text-slate-400">{meta.minVotes} rating</b>.
            Rating sama: yang lebih banyak di-rating, lalu upload lebih baru.
          </span>
        </p>
      </div>
    </div>
  );
}
