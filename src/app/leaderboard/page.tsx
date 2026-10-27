import type { Metadata } from "next";
import { Suspense } from "react";
import { Leaderboard, LeaderboardLoading } from "@/components/pap/leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard — RetPAP",
};

export default function LeaderboardPage() {
  return (
    <div className="safe-shell mx-auto flex h-dvh w-full max-w-md flex-col">
      <div className="min-h-0 flex-1">
        {/* The tab lives in the query string, so the client tree reads it. The
            Suspense boundary keeps the page itself prerendered. */}
        <Suspense fallback={<LeaderboardLoading />}>
          <Leaderboard />
        </Suspense>
      </div>
    </div>
  );
}
