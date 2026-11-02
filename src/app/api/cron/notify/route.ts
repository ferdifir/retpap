import { maybeAnnounceLeaderboards } from "@/lib/bot/leaderboard-announce";

/**
 * Called by the system cron; authenticated with a shared secret. Uploader
 * notifications are delivered by the request that created them, so this route
 * only handles the time-based leaderboard recaps.
 */
async function run(request: Request) {
  const expected = process.env.CRON_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const leaderboard = await maybeAnnounceLeaderboards();

  return Response.json({ leaderboard });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
