import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminPanel } from "@/components/pap/admin-panel";
import { isOwner } from "@/lib/analytics/queries";
import { getSessionUserId } from "@/lib/auth-server";

export const metadata: Metadata = { title: "Admin · RetPAP" };

export default function AdminPage() {
  // Same shape as /stats: Cache Components prerenders the shell, so the
  // cookie read and the owner check must sit inside Suspense.
  return (
    <div className="safe-shell mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <Suspense
        fallback={<p className="px-2 py-10 text-xs text-slate-500">Memuat admin…</p>}
      >
        <AdminContent />
      </Suspense>
    </div>
  );
}

async function AdminContent() {
  await connection();

  const userId = await getSessionUserId();
  if (userId === null || !(await isOwner(userId))) notFound();

  return <AdminPanel />;
}
