import type { NextRequest } from "next/server";
import { forbidden, requireAdmin } from "@/lib/admin/auth";
import { listPhotosForAdmin } from "@/lib/admin/queries";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const nsfw = params.get("nsfw");
  const status = params.get("status");
  const userId = Number(params.get("userId"));

  const result = await listPhotosForAdmin({
    q: params.get("q")?.trim() || undefined,
    type: type === "photo" || type === "video" ? type : undefined,
    nsfw: nsfw === "yes" || nsfw === "no" ? nsfw : undefined,
    status: status === "active" || status === "inactive" ? status : undefined,
    userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
    page: Number(params.get("page")) || 1,
  });

  return Response.json(result);
}
