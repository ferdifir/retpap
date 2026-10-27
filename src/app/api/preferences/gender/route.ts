import { z } from "zod";
import { setGenderPreference } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";

const bodySchema = z.object({
  preference: z.enum(["female", "male", "all"]),
});

/** Feed filter chosen from the Mini App; stored per user, not per device. */
export async function PUT(request: Request) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  await setGenderPreference(userId, parsed.data.preference);
  return Response.json({ preference: parsed.data.preference });
}
