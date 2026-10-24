import { getLeaderboard } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";

export async function GET() {
  const userId = await getSessionUserId();
  if (userId === null) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json({ entries: await getLeaderboard(10) });
}
