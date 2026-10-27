import { getLeaderboard } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";
import { parseLeaderboardPeriod } from "@/lib/leaderboard-period";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (userId === null) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const period = parseLeaderboardPeriod(
    new URL(request.url).searchParams.get("period"),
  );
  return Response.json(await getLeaderboard(period, 10));
}
