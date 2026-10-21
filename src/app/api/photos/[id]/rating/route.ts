import { z } from "zod";
import { ratePhoto } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";

const bodySchema = z.object({ score: z.number().min(1).max(10) });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId)) return Response.json({ error: "bad_photo" }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  return Response.json(await ratePhoto(photoId, userId, parsed.data.score));
}
