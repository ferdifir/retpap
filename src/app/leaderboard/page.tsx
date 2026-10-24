import type { Metadata } from "next";
import { Leaderboard } from "@/components/pap/leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard — RetPAP",
};

export default function LeaderboardPage() {
  return (
    <div className="safe-shell mx-auto flex h-dvh w-full max-w-md flex-col">
      <div className="min-h-0 flex-1">
        <Leaderboard />
      </div>
    </div>
  );
}
