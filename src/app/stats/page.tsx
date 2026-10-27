import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getSessionUserId } from "@/lib/auth-server";
import {
  getDailySeries,
  getGateFunnel,
  getOverview,
  getRetention,
  getTopPhotos,
  getUploadFunnel,
  isOwner,
  type RetentionRow,
} from "@/lib/analytics/queries";

export const metadata = { title: "Stats · RetPAP" };

function num(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function pct(part: number, total: number): string {
  if (total <= 0) return "—";
  return Math.round((part / total) * 100) + "%";
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-[10.5px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-black tracking-wider text-cyan-300 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800">
      <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: width + "%" }} />
    </div>
  );
}

function RetentionTable({ rows }: { rows: RetentionRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">Belum ada data retensi.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-900/80 text-slate-400">
          <tr>
            <th className="px-3 py-2 font-bold">Kohort</th>
            <th className="px-3 py-2 font-bold">User</th>
            <th className="px-3 py-2 font-bold">D1</th>
            <th className="px-3 py-2 font-bold">D7</th>
          </tr>
        </thead>
        <tbody className="text-slate-200">
          {rows.map((row) => (
            <tr key={row.day} className="border-t border-slate-800/70">
              <td className="px-3 py-1.5 font-mono">{row.day}</td>
              <td className="px-3 py-1.5">{num(row.cohort)}</td>
              <td className="px-3 py-1.5">{pct(row.d1, row.cohort)}</td>
              <td className="px-3 py-1.5">{pct(row.d7, row.cohort)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsPage() {
  // Cache Components prerenders the shell; the data part must sit inside
  // Suspense or the build fails on cookies() + database reads.
  return (
    <div className="safe-shell mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <Suspense
        fallback={
          <p className="px-2 py-10 text-xs text-slate-500">Memuat stats…</p>
        }
      >
        <StatsContent />
      </Suspense>
    </div>
  );
}

async function StatsContent() {
  await connection();

  const userId = await getSessionUserId();
  if (userId === null || !(await isOwner(userId))) notFound();

  const [overview, daily, upload, gate, top, retention] = await Promise.all([
    getOverview(),
    getDailySeries(),
    getUploadFunnel(),
    getGateFunnel(),
    getTopPhotos(),
    getRetention(),
  ]);

  const maxOpens = Math.max(1, ...daily.map((point) => point.opens));
  const maxViews = Math.max(1, ...daily.map((point) => point.views));
  const feedRate = overview.opensToday > 0 ? overview.feedLoadedToday / overview.opensToday : 0;

  return (
    <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain touch-pan-y px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <header className="space-y-1">
        <h1 className="text-lg font-black text-slate-100">Analytics RetPAP</h1>
        <p className="text-[11px] text-slate-500">
          Data first-party, zona waktu Asia/Jakarta. Angka engagement diambil dari tabel
          aslinya, bukan dari event.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="DAU" value={num(overview.dau)} hint="app_open hari ini" />
        <Card label="WAU" value={num(overview.wau)} hint="7 hari" />
        <Card label="MAU" value={num(overview.mau)} hint="30 hari" />
        <Card
          label="Feed loaded"
          value={pct(overview.feedLoadedToday, overview.opensToday)}
          hint={num(overview.opensToday) + " buka hari ini"}
        />
        <Card label="Upload 7 hari" value={num(overview.uploadsWeek)} hint="photos.created_at" />
        <Card label="Foto aktif" value={num(overview.photosTotal)} />
        <Card
          label="View / foto"
          value={String(overview.avgViewsPerPhoto)}
          hint="7 hari, foto yang dilihat"
        />
        <Card
          label="Buka hari ini"
          value={num(overview.opensToday)}
          hint={feedRate > 0 ? "rasio feed " + pct(overview.feedLoadedToday, overview.opensToday) : undefined}
        />
      </div>

      <Section title="14 hari terakhir">
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-bold">Tanggal</th>
                <th className="px-3 py-2 font-bold">User</th>
                <th className="px-3 py-2 font-bold">Buka</th>
                <th className="px-3 py-2 font-bold">View</th>
                <th className="px-3 py-2 font-bold">18+ dibuka</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {daily.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={5}>
                    Belum ada event.
                  </td>
                </tr>
              ) : (
                daily.map((point) => (
                  <tr key={point.day} className="border-t border-slate-800/70">
                    <td className="px-3 py-1.5 font-mono">{point.day}</td>
                    <td className="px-3 py-1.5">{num(point.users)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0">{num(point.opens)}</span>
                        <Bar value={point.opens} max={maxOpens} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0">{num(point.views)}</span>
                        <Bar value={point.views} max={maxViews} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">{num(point.reveals)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Funnel upload (7 hari)">
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            {[
              ["Mulai /upload", upload.stepPhoto],
              ["Kirim media", upload.stepCaption],
              ["Caption selesai", upload.stepConfirm],
              ["Jawab gender", upload.questionGender],
              ["Jawab 18+", upload.questionNsfw],
              ["Publish", upload.published],
            ].map(([label, value]) => (
              <div key={String(label)} className="space-y-1">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-slate-300">{label}</span>
                  <span className="font-bold text-slate-100">{num(Number(value))}</span>
                </div>
                <Bar value={Number(value)} max={Math.max(1, upload.stepPhoto)} />
              </div>
            ))}
            <p className="pt-1 text-[10px] text-slate-500">
              Dihitung per sesi bot. Angka bisa turun karena user memulai upload baru.
            </p>
          </div>
        </Section>

        <Section title="Funnel gate (7 hari)">
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-slate-300">Gate tampil</span>
                <span className="font-bold text-slate-100">{num(gate.shown)}</span>
              </div>
              <Bar value={gate.shown} max={Math.max(1, gate.shown)} />
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-slate-300">Lolos lewat cek ulang</span>
                <span className="font-bold text-slate-100">{num(gate.passed)}</span>
              </div>
              <Bar value={gate.passed} max={Math.max(1, gate.shown)} />
            </div>
            <p className="text-[10px] text-slate-500">
              Lolos otomatis saat boot tidak dihitung; hanya tombol cek ulang.
            </p>
          </div>
        </Section>
      </div>

      <Section title="Konten teratas (7 hari)">
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-bold">Foto</th>
                <th className="px-3 py-2 font-bold">View</th>
                <th className="px-3 py-2 font-bold">Viewer</th>
                <th className="px-3 py-2 font-bold">Reaksi</th>
                <th className="px-3 py-2 font-bold">Rating</th>
                <th className="px-3 py-2 font-bold">Komentar</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {top.map((photo) => (
                <tr key={photo.id} className="border-t border-slate-800/70">
                  <td className="max-w-[220px] px-3 py-1.5">
                    <span className="line-clamp-1">
                      {photo.isNsfw ? <span className="mr-1 text-red-400">18+</span> : null}
                      {photo.caption}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-bold">{num(photo.views)}</td>
                  <td className="px-3 py-1.5">{num(photo.viewers)}</td>
                  <td className="px-3 py-1.5">{num(photo.reactions)}</td>
                  <td className="px-3 py-1.5">{num(photo.ratings)}</td>
                  <td className="px-3 py-1.5">{num(photo.comments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Retensi (30 hari kohort)">
        <RetentionTable rows={retention} />
      </Section>

      <p className="pb-4 text-[10px] text-slate-600">
        Sesi: app_open dihitung sekali per pembukaan Mini App. Retensi memakai app_open
        per user per hari.
      </p>
    </main>
  );
}
