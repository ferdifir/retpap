import { z } from "zod";
import { addComment, deleteOwnComment, getPhotoSpots, getSpotComments } from "@/db/queries";
import { getSessionUserId } from "@/lib/auth-server";
import { MAX_COMMENT_LENGTH, normaliseComment } from "@/lib/comment-rules";

const bodySchema = z
  .object({
    spotId: z.number().int().positive().optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    body: z.string().min(1).max(MAX_COMMENT_LENGTH * 2),
  })
  .refine((value) => value.spotId !== undefined || (value.x !== undefined && value.y !== undefined), {
    message: "spotId or coordinates are required",
  });

async function photoIdFrom(context: { params: Promise<{ id: string }> }): Promise<number | null> {
  const photoId = Number((await context.params).id);
  return Number.isInteger(photoId) ? photoId : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const photoId = await photoIdFrom(context);
  if (photoId === null) return Response.json({ error: "bad_photo" }, { status: 400 });

  const spotId = Number(new URL(request.url).searchParams.get("spotId"));
  if (!Number.isInteger(spotId) || spotId <= 0) {
    return Response.json({ error: "bad_spot" }, { status: 400 });
  }

  return Response.json({ comments: await getSpotComments(photoId, spotId, userId) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const photoId = await photoIdFrom(context);
  if (photoId === null) return Response.json({ error: "bad_photo" }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const body = normaliseComment(parsed.data.body);
  if (body.length === 0 || body.length > MAX_COMMENT_LENGTH) {
    return Response.json({ error: "bad_length" }, { status: 400 });
  }

  const outcome = await addComment(photoId, userId, {
    spotId: parsed.data.spotId,
    x: parsed.data.x,
    y: parsed.data.y,
    body,
  });

  if (!outcome.ok) {
    return Response.json({ error: outcome.reason }, { status: 404 });
  }

  return Response.json({
    spotId: outcome.spotId,
    comments: await getSpotComments(photoId, outcome.spotId, userId),
    spots: await getPhotoSpots(photoId, userId),
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (userId === null) return Response.json({ error: "unauthorized" }, { status: 401 });

  const photoId = await photoIdFrom(context);
  if (photoId === null) return Response.json({ error: "bad_photo" }, { status: 400 });

  const removed = await deleteOwnComment(photoId, userId);
  if (!removed) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({ spotId: removed.spotId, spots: await getPhotoSpots(photoId, userId) });
}
