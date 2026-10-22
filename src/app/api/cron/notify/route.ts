import { flushNotifications } from "@/lib/bot/notify";

/** Called by the system cron every minute; authenticated with a shared secret. */
async function run(request: Request) {
  const expected = process.env.CRON_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return Response.json(await flushNotifications());
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
