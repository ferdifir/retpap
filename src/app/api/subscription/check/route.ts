import { getUserTelegramId } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";
import { isChannelMember } from "@/lib/bot/channel";

/** Re-checks the channel after the user pressed "Saya sudah join". */
export async function POST() {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const telegramId = await getUserTelegramId(userId);
  if (telegramId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  return Response.json({ subscribed: await isChannelMember(telegramId) });
}
