import type { NextRequest } from "next/server";
import { adminRepostPhoto } from "@/lib/admin/actions";
import { forbidden, requireAdmin } from "@/lib/admin/auth";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();

  const photoId = Number((await context.params).id);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return Response.json({ error: "bad_photo" }, { status: 400 });
  }

  const result = await adminRepostPhoto({
    photoId,
    actorTelegramId: actor.telegramId,
  });

  return Response.json(result);
}
