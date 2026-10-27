import type { NextRequest } from "next/server";
import { forbidden, requireAdmin } from "@/lib/admin/auth";
import { listAdminActions } from "@/lib/admin/queries";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const limit = Number(request.nextUrl.searchParams.get("limit")) || 30;
  return Response.json({ rows: await listAdminActions(limit) });
}
