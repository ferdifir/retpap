import type { NextRequest } from "next/server";
import { forbidden, requireAdmin } from "@/lib/admin/auth";
import { listUsersForAdmin } from "@/lib/admin/queries";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const params = request.nextUrl.searchParams;
  const blocked = params.get("blocked");

  const result = await listUsersForAdmin({
    q: params.get("q")?.trim() || undefined,
    blocked: blocked === "yes" ? true : blocked === "no" ? false : undefined,
    hasUpload: params.get("hasUpload") === "1",
    page: Number(params.get("page")) || 1,
  });

  return Response.json(result);
}
