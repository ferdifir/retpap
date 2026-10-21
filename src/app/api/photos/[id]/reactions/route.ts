import { z } from "zod";
import { clearReaction, getPhotoSpots, reactToPhoto } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";

const bodySchema = z
  .object({
    spotId: z.number().int().positive().optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    emoji: z.string().min(1).max(8),
  })
  .refine(
    (value) => value.spotId !== undefined || (value.x !== undefined && value.y !== undefined),
    { message: "spotId or coordinates are required" },
  );

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId)) return Response.json({ error: "bad_photo" }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const outcome = await reactToPhoto(photoId, userId, parsed.data);
  if (!outcome.ok) {
    const status = outcome.reason === "spot_full" ? 409 : 404;
    return Response.json({ error: outcome.reason }, { status });
  }

  return Response.json({
    spotId: outcome.spotId,
    removed: outcome.removed,
    spots: await getPhotoSpots(photoId, userId),
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId)) return Response.json({ error: "bad_photo" }, { status: 400 });

  await clearReaction(photoId, userId);
  return Response.json({ ok: true, spots: await getPhotoSpots(photoId, userId) });
}
