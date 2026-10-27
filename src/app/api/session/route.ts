import { cookies } from "next/headers";
import { z } from "zod";
import { upsertUser } from "@/db/queries";
import { probePrivateChat } from "@/lib/bot/api";
import { CHANNEL_URL, isChannelMember, ownerTelegramId } from "@/lib/bot/channel";
import { verifyInitData } from "@/lib/init-data";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/session";

const bodySchema = z.object({
  initData: z.string().optional(),
  devUserId: z.string().optional(),
});

/** Deterministic dev-only id, kept away from real and seed Telegram ids. */
function devTelegramId(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 800000000 + (Math.abs(hash) % 99999999);
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let profile: Parameters<typeof upsertUser>[0];

  if (botToken && parsed.data.initData) {
    const result = verifyInitData(parsed.data.initData, botToken);
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 401 });
    }

    profile = {
      telegramId: result.user.id,
      firstName: result.user.first_name,
      username: result.user.username,
      lastName: result.user.last_name,
      languageCode: result.user.language_code,
      isPremium: result.user.is_premium === true,
      photoUrl: result.user.photo_url,
    };
  } else if (process.env.NODE_ENV !== "production") {
    // Local development has no Telegram client; give each browser its own user.
    profile = {
      telegramId: devTelegramId(parsed.data.devUserId ?? "local"),
      firstName: "Dev User",
      username: "dev",
    };
  } else {
    return Response.json({ error: "telegram_required" }, { status: 401 });
  }

  const user = await upsertUser(profile);

  // Ask Telegram directly instead of trusting the historical flag: a chat that
  // never started does not exist, and a bot the user blocked answers 403.
  let started = user.startedAt !== null;
  if (process.env.NODE_ENV === "production" && process.env.TELEGRAM_BOT_TOKEN) {
    const probe = await probePrivateChat(user.telegramId);
    if (probe === "ok") started = true;
    else if (probe === "missing" || probe === "blocked") started = false;
    // "unknown" keeps the stored flag: a network blip must not lock users out.
  }
  // Same idea for the channel: ask Telegram, never trust a stored flag.
  const subscribed = await isChannelMember(user.telegramId);
  const token = createSessionToken(user.id);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return Response.json({
    // Local dev has no bot conversation to start, so it always passes.
    started: started || process.env.NODE_ENV !== "production",
    subscribed: subscribed || process.env.NODE_ENV !== "production",
    channelUrl: CHANNEL_URL,
    // null until the user picks a feed filter; the picker only shows then.
    preference: user.genderPreference,
    // Only tells the caller about themselves; every owner route still checks
    // the session server-side.
    owner: ownerTelegramId() === user.telegramId,
    user: {
      id: user.id,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl,
    },
  });
}
