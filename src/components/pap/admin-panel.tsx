"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type AdminPhoto = {
  id: number;
  slug: string;
  caption: string;
  mediaType: "photo" | "video";
  gender: "female" | "male" | null;
  isNsfw: boolean;
  isActive: boolean;
  channelMessageId: number | null;
  createdAt: string;
  userId: number | null;
  uploaderTelegramId: number | null;
  uploaderUsername: string | null;
  votes: number;
  avg: number | null;
  reactions: number;
  comments: number;
};

type AdminUser = {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  createdAt: string;
  lastSeenAt: string;
  uploadCount: number;
  avgReceived: number | null;
  ratingCount: number;
  uploadBlocked: boolean;
  uploadBlockedAt: string | null;
  uploadBlockedReason: string | null;
};

type AdminReport = {
  id: number;
  photoId: number;
  slug: string;
  caption: string;
  mediaType: "photo" | "video";
  isActive: boolean;
  body: string;
  createdAt: string;
  reporterTelegramId: number | null;
  reporterUsername: string | null;
  reporterFirstName: string | null;
};

type AdminAction = {
  id: number;
  actorTelegramId: number;
  action: string;
  targetType: string;
  targetId: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

type Page<T> = { rows: T[]; total: number; page: number; perPage: number };

type Tab = "photos" | "reports" | "users" | "log";

const PER_PAGE = 25;

const BTN =
  "rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-200 active:scale-95 disabled:opacity-40";
const BTN_ON = "border-cyan-300/60 bg-cyan-500/20 text-cyan-100";
const BTN_DANGER = "border-red-500/40 bg-red-500/10 text-red-300";
const INPUT =
  "w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none";

function time(iso: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "red" | "cyan" | "amber";
}) {
  const tones = {
    slate: "border-slate-700 text-slate-400",
    red: "border-red-500/40 text-red-300",
    cyan: "border-cyan-400/40 text-cyan-300",
    amber: "border-amber-400/40 text-amber-300",
  };
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("photos");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Photo filters and page.
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [nsfw, setNsfw] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [photoPage, setPhotoPage] = useState(1);
  const [photos, setPhotos] = useState<Page<AdminPhoto> | null>(null);

  // User filters and page.
  const [userQ, setUserQ] = useState("");
  const [blocked, setBlocked] = useState("");
  const [hasUpload, setHasUpload] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState<Page<AdminUser> | null>(null);

  const [reports, setReports] = useState<AdminReport[] | null>(null);

  const [actions, setActions] = useState<AdminAction[]>([]);
  const [confirm, setConfirm] = useState<{ kind: "hard" | "purge"; id: number } | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<number, string>>({});

  const fetchPhotos = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("type", type);
    if (nsfw) params.set("nsfw", nsfw);
    if (status) params.set("status", status);
    if (userId) params.set("userId", String(userId));
    params.set("page", String(photoPage));

    const response = await fetch("/api/admin/photos?" + params.toString());
    if (!response.ok) throw new Error("gagal memuat konten");
    return (await response.json()) as Page<AdminPhoto>;
  }, [q, type, nsfw, status, userId, photoPage]);

  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams();
    if (userQ.trim()) params.set("q", userQ.trim());
    if (blocked) params.set("blocked", blocked);
    if (hasUpload) params.set("hasUpload", "1");
    params.set("page", String(userPage));

    const response = await fetch("/api/admin/users?" + params.toString());
    if (!response.ok) throw new Error("gagal memuat user");
    return (await response.json()) as Page<AdminUser>;
  }, [userQ, blocked, hasUpload, userPage]);

  const fetchReports = useCallback(async () => {
    const response = await fetch("/api/admin/reports?limit=50");
    if (!response.ok) throw new Error("gagal memuat laporan");
    const body = (await response.json()) as { rows: AdminReport[] };
    return body.rows;
  }, []);

  const fetchActions = useCallback(async () => {
    const response = await fetch("/api/admin/actions?limit=40");
    if (!response.ok) throw new Error("gagal memuat log");
    const body = (await response.json()) as { rows: AdminAction[] };
    return body.rows;
  }, []);

  useEffect(() => {
    if (tab !== "photos") return;
    let cancelled = false;

    fetchPhotos()
      .then((body) => {
        if (!cancelled) setPhotos(body);
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage({ ok: false, text: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [tab, fetchPhotos]);

  useEffect(() => {
    if (tab !== "users") return;
    let cancelled = false;

    fetchUsers()
      .then((body) => {
        if (!cancelled) setUsers(body);
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage({ ok: false, text: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [tab, fetchUsers]);

  useEffect(() => {
    if (tab !== "reports") return;
    let cancelled = false;

    fetchReports()
      .then((rows) => {
        if (!cancelled) setReports(rows);
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage({ ok: false, text: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [tab, fetchReports]);

  useEffect(() => {
    if (tab !== "log") return;
    let cancelled = false;

    fetchActions()
      .then((rows) => {
        if (!cancelled) setActions(rows);
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage({ ok: false, text: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [tab, fetchActions]);

  async function call(key: string, run: () => Promise<Response>, okText: string) {
    setBusy(key);
    setMessage(null);
    try {
      const response = await run();
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; messageId?: number; count?: number; reposted?: boolean; channelNote?: string }
        | null;

      if (!response.ok || body?.ok === false) {
        setMessage({ ok: false, text: body?.reason ?? "aksi gagal" });
      } else {
        const suffix = body?.channelNote ? " (" + body.channelNote + ")" : "";
        setMessage({ ok: true, text: okText + suffix });
      }

      if (tab === "photos") setPhotos(await fetchPhotos());
      if (tab === "reports") setReports(await fetchReports());
      if (tab === "users") setUsers(await fetchUsers());
      if (tab === "log") setActions(await fetchActions());
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "aksi gagal" });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  function patchPhoto(photo: AdminPhoto, body: Record<string, unknown>, okText: string) {
    return call(
      "photo:" + photo.id,
      () =>
        fetch("/api/admin/photos/" + photo.id, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      okText,
    );
  }

  function deletePhoto(photo: AdminPhoto, mode: "soft" | "hard") {
    return call(
      "delete:" + photo.id,
      () => fetch("/api/admin/photos/" + photo.id + "?mode=" + mode, { method: "DELETE" }),
      mode === "hard" ? "Konten dihapus permanen." : "Konten dinonaktifkan.",
    );
  }

  function repostPhoto(photo: AdminPhoto) {
    return call(
      "repost:" + photo.id,
      () => fetch("/api/admin/photos/" + photo.id + "/repost", { method: "POST" }),
      "Post channel dibuat ulang.",
    );
  }

  function toggleBlock(user: AdminUser) {
    const reason = reasonDraft[user.id] ?? user.uploadBlockedReason ?? "";
    return call(
      "user:" + user.id,
      () =>
        fetch("/api/admin/users/" + user.id, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ uploadBlocked: !user.uploadBlocked, reason }),
        }),
      user.uploadBlocked ? "Blokir upload dibuka." : "Upload diblokir.",
    );
  }

  function purgeUser(user: AdminUser) {
    return call(
      "purge:" + user.id,
      () =>
        fetch("/api/admin/users/" + user.id, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "soft", notify: false }),
        }),
      "Konten user dinonaktifkan.",
    );
  }

  const photoPages = photos ? Math.max(1, Math.ceil(photos.total / PER_PAGE)) : 1;
  const userPages = users ? Math.max(1, Math.ceil(users.total / PER_PAGE)) : 1;

  return (
    <main className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain touch-pan-y px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-100">Admin RetPAP</h1>
          <p className="text-[10.5px] text-slate-500">
            Konten dan user. Semua aksi tercatat di log.
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            call("recap", () => fetch("/api/admin/leaderboard", { method: "POST" }), "Recap harian dikirim ulang.")
          }
          className={cn(BTN, "shrink-0")}
        >
          Recap harian
        </button>
      </header>

      <div className="flex gap-1.5">
        {(
          [
            ["photos", "Konten"],
            ["reports", "Laporan"],
            ["users", "User"],
            ["log", "Log"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(BTN, "flex-1 py-1.5", tab === value && BTN_ON)}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? (
        <p
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-[11px]",
            message.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300",
          )}
        >
          {message.text}
        </p>
      ) : null}

      {tab === "photos" ? (
        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPhotoPage(1);
              }}
              placeholder="Cari caption"
              className={cn(INPUT, "col-span-2")}
            />
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPhotoPage(1);
              }}
              className={INPUT}
            >
              <option value="">Semua tipe</option>
              <option value="photo">Foto</option>
              <option value="video">Video</option>
            </select>
            <select
              value={nsfw}
              onChange={(event) => {
                setNsfw(event.target.value);
                setPhotoPage(1);
              }}
              className={INPUT}
            >
              <option value="">18+ semua</option>
              <option value="yes">18+</option>
              <option value="no">Bukan 18+</option>
            </select>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPhotoPage(1);
              }}
              className={INPUT}
            >
              <option value="">Status semua</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
            <div className="flex items-center gap-1">
              {userId ? (
                <button
                  type="button"
                  onClick={() => {
                    setUserId(null);
                    setPhotoPage(1);
                  }}
                  className={cn(BTN, "w-full", BTN_ON)}
                >
                  User #{userId} ×
                </button>
              ) : (
                <span className="text-[10px] text-slate-600">Filter user dari tab User</span>
              )}
            </div>
          </div>

          {photos === null ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Memuat…</p>
          ) : photos.rows.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Tidak ada konten.</p>
          ) : (
            photos.rows.map((photo) => (
              <article
                key={photo.id}
                className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2.5"
              >
                <div className="flex gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={"/media/" + photo.slug + ".jpg"}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-[11px] font-bold text-slate-100">
                      {photo.caption}
                    </p>
                    <p className="text-[9.5px] text-slate-500">
                      #{photo.id} · {photo.mediaType} ·{" "}
                      {photo.uploaderTelegramId ?? "tanpa user"} · {time(photo.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {photo.isNsfw ? <Badge tone="red">18+</Badge> : null}
                      {photo.gender ? <Badge tone="cyan">{photo.gender}</Badge> : <Badge>gender ?</Badge>}
                      {photo.isActive ? null : <Badge tone="amber">nonaktif</Badge>}
                      <Badge>
                        {photo.avg === null ? "belum di-rate" : photo.avg.toFixed(1) + "/10"}
                        {" · " + photo.votes + " rate"}
                      </Badge>
                      <Badge>{photo.reactions + " reaksi"}</Badge>
                      <Badge>{photo.comments + " komentar"}</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => patchPhoto(photo, { isNsfw: !photo.isNsfw }, photo.isNsfw ? "Tanda 18+ dicabut." : "Ditandai 18+.")}
                    className={cn(BTN, photo.isNsfw && BTN_ON)}
                  >
                    18+
                  </button>
                  {(["female", "male"] as const).map((gender) => (
                    <button
                      key={gender}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => patchPhoto(photo, { gender }, "Gender disimpan.")}
                      className={cn(BTN, photo.gender === gender && BTN_ON)}
                    >
                      {gender === "female" ? "Cewek" : "Cowok"}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => patchPhoto(photo, { gender: null }, "Gender dikosongkan.")}
                    className={cn(BTN, photo.gender === null && BTN_ON)}
                  >
                    Netral
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => patchPhoto(photo, { isActive: !photo.isActive }, photo.isActive ? "Konten diaktifkan." : "Konten dinonaktifkan.")}
                    className={cn(BTN, !photo.isActive && BTN_ON)}
                  >
                    {photo.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => repostPhoto(photo)}
                    className={BTN}
                  >
                    Repost
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => deletePhoto(photo, "soft")}
                    className={cn(BTN, BTN_DANGER)}
                  >
                    Nonaktif + hapus post
                  </button>
                  {confirm?.kind === "hard" && confirm.id === photo.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => deletePhoto(photo, "hard")}
                        className={cn(BTN, "border-red-500 bg-red-500/30 text-red-100")}
                      >
                        Yakin hapus permanen?
                      </button>
                      <button type="button" onClick={() => setConfirm(null)} className={BTN}>
                        Batal
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirm({ kind: "hard", id: photo.id })}
                      className={cn(BTN, BTN_DANGER)}
                    >
                      Hapus permanen
                    </button>
                  )}
                </div>
              </article>
            ))
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={photoPage <= 1}
              onClick={() => setPhotoPage((page) => Math.max(1, page - 1))}
              className={BTN}
            >
              ← Sebelumnya
            </button>
            <span className="text-[10px] text-slate-500">
              {photos ? photos.total : 0} konten · hal {photoPage}/{photoPages}
            </span>
            <button
              type="button"
              disabled={photoPage >= photoPages}
              onClick={() => setPhotoPage((page) => page + 1)}
              className={BTN}
            >
              Berikutnya →
            </button>
          </div>
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="space-y-2">
          {reports === null ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Memuat…</p>
          ) : reports.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Belum ada laporan.</p>
          ) : (
            reports.map((report) => (
              <article
                key={report.id}
                className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2.5"
              >
                <div className="flex gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={"/media/" + report.slug + ".jpg"}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-[11px] font-bold text-slate-100">
                      {report.caption}
                    </p>
                    <p className="text-[9.5px] text-slate-500">
                      PAP #{report.photoId} · {report.mediaType} · {time(report.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {report.isActive ? null : <Badge tone="amber">nonaktif</Badge>}
                      <Badge>
                        {report.reporterUsername
                          ? "@" + report.reporterUsername
                          : (report.reporterFirstName ?? "tanpa user")}
                      </Badge>
                    </div>
                  </div>
                </div>
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] whitespace-pre-wrap text-amber-100">
                  {report.body}
                </p>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={userQ}
              onChange={(event) => {
                setUserQ(event.target.value);
                setUserPage(1);
              }}
              placeholder="Cari nama"
              className={cn(INPUT, "col-span-2")}
            />
            <select
              value={blocked}
              onChange={(event) => {
                setBlocked(event.target.value);
                setUserPage(1);
              }}
              className={INPUT}
            >
              <option value="">Blokir semua</option>
              <option value="yes">Diblokir</option>
              <option value="no">Tidak diblokir</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setHasUpload((value) => !value);
                setUserPage(1);
              }}
              className={cn(BTN, "py-1.5", hasUpload && BTN_ON)}
            >
              Punya upload
            </button>
          </div>

          {users === null ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Memuat…</p>
          ) : users.rows.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Tidak ada user.</p>
          ) : (
            users.rows.map((user) => (
              <article
                key={user.id}
                className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2.5"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-slate-100">
                      {user.firstName}
                      {user.username ? " @" + user.username : ""}
                    </p>
                    {user.uploadBlocked ? <Badge tone="red">diblokir</Badge> : null}
                  </div>
                  <p className="text-[9.5px] text-slate-500">
                    #{user.id} · {user.telegramId} · gabung {time(user.createdAt)} · lihat{" "}
                    {time(user.lastSeenAt)}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge>{user.uploadCount + " upload"}</Badge>
                    <Badge>
                      {user.avgReceived === null ? "tanpa rate" : user.avgReceived.toFixed(1) + "/10"}
                      {" · " + user.ratingCount + " rate"}
                    </Badge>
                    {user.uploadBlockedReason ? (
                      <Badge tone="amber">{user.uploadBlockedReason}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <input
                    value={reasonDraft[user.id] ?? user.uploadBlockedReason ?? ""}
                    onChange={(event) =>
                      setReasonDraft((draft) => ({ ...draft, [user.id]: event.target.value }))
                    }
                    placeholder="Alasan blokir"
                    className={cn(INPUT, "max-w-[150px] flex-1")}
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => toggleBlock(user)}
                    className={cn(BTN, user.uploadBlocked ? BTN_ON : BTN_DANGER)}
                  >
                    {user.uploadBlocked ? "Buka blokir" : "Blokir upload"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setUserId(user.id);
                      setPhotoPage(1);
                      setTab("photos");
                    }}
                    className={BTN}
                  >
                    Lihat konten
                  </button>
                  {confirm?.kind === "purge" && confirm.id === user.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => purgeUser(user)}
                        className={cn(BTN, "border-red-500 bg-red-500/30 text-red-100")}
                      >
                        Yakin nonaktifkan {user.uploadCount} konten?
                      </button>
                      <button type="button" onClick={() => setConfirm(null)} className={BTN}>
                        Batal
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null || user.uploadCount === 0}
                      onClick={() => setConfirm({ kind: "purge", id: user.id })}
                      className={cn(BTN, BTN_DANGER)}
                    >
                      Nonaktifkan semua konten
                    </button>
                  )}
                </div>
              </article>
            ))
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={userPage <= 1}
              onClick={() => setUserPage((page) => Math.max(1, page - 1))}
              className={BTN}
            >
              ← Sebelumnya
            </button>
            <span className="text-[10px] text-slate-500">
              {users ? users.total : 0} user · hal {userPage}/{userPages}
            </span>
            <button
              type="button"
              disabled={userPage >= userPages}
              onClick={() => setUserPage((page) => page + 1)}
              className={BTN}
            >
              Berikutnya →
            </button>
          </div>
        </section>
      ) : null}

      {tab === "log" ? (
        <section className="space-y-1.5">
          {actions.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-slate-500">Belum ada aksi.</p>
          ) : (
            actions.map((action) => (
              <div
                key={action.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5"
              >
                <p className="text-[11px] font-bold text-slate-200">
                  {action.action}
                  <span className="font-normal text-slate-500">
                    {" · " + action.targetType + " #" + action.targetId}
                  </span>
                </p>
                <p className="text-[9.5px] text-slate-500">
                  {time(action.createdAt)} · oleh {action.actorTelegramId}
                </p>
              </div>
            ))
          )}
        </section>
      ) : null}
    </main>
  );
}
