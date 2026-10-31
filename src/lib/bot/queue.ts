import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Antrean upload owner. File ditulis ke folder inbox yang sama dengan yang
 * dibaca scripts/scheduled-upload.ts, jadi script tidak perlu tahu asalnya:
 * satu pool, satu shuffle, tanpa aturan prioritas.
 *
 * Nama file = caption, persis seperti file inbox manual. Gender, 18+ dan
 * pemilik tidak punya tempat di nama file, jadi disimpan di sidecar
 * `<nama file>.json` di sebelahnya (script mengabaikannya karena bukan media).
 */
export interface QueueMeta {
  /** Id pendek untuk tombol "hapus dari antrean"; callback_data dibatasi 64 byte. */
  id: string;
  caption: string;
  gender: "female" | "male";
  isNsfw: boolean;
  userId: number | null;
  telegramId: number;
  queuedAt: string;
}

/** Folder antrean = INBOX_DIR; di VPS pm2 dan cron sama-sama di /var/www/retpap. */
export function queueDir(): string {
  const configured = process.env.INBOX_DIR?.trim();
  return configured && configured.length > 0 ? configured : path.join(process.cwd(), "inbox");
}

/** Caption jadi nama file: buang karakter ilegal dan batasi panjangnya. */
function fileNameFor(caption: string): string {
  const cleaned = caption
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();

  return cleaned || "pap";
}

export interface QueueInput {
  bytes: Buffer;
  caption: string;
  gender: "female" | "male";
  isNsfw: boolean;
  userId: number | null;
  telegramId: number;
  mediaType: "photo" | "video";
}

/** Menulis satu upload ke folder antrean; nama bentrok diberi akhiran (2), (3), ... */
export async function enqueueUpload(input: QueueInput): Promise<{ file: string; id: string }> {
  const dir = queueDir();
  await mkdir(dir, { recursive: true });

  const ext = input.mediaType === "video" ? "mp4" : "jpg";
  const base = fileNameFor(input.caption);
  const meta: QueueMeta = {
    id: randomBytes(4).toString("hex"),
    caption: input.caption.slice(0, 500),
    gender: input.gender,
    isNsfw: input.isNsfw,
    userId: input.userId,
    telegramId: input.telegramId,
    queuedAt: new Date().toISOString(),
  };

  for (let i = 1; i <= 100; i++) {
    const name = i === 1 ? base + "." + ext : base + " (" + i + ")." + ext;
    const full = path.join(dir, name);

    try {
      await writeFile(full, input.bytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }

    try {
      await writeFile(full + ".json", JSON.stringify(meta, null, 2), { flag: "wx" });
    } catch (error) {
      // Tanpa sidecar, gender/18+ ikut hilang: buang file dan laporkan gagal.
      await rm(full, { force: true });
      throw error;
    }

    return { file: name, id: meta.id };
  }

  throw new Error("tidak bisa membuat nama file unik di " + dir);
}

/** Sidecar untuk satu file media; null kalau tidak ada atau rusak. */
export async function readQueueMeta(sidecar: string): Promise<QueueMeta | null> {
  try {
    const parsed = JSON.parse(await readFile(sidecar, "utf8")) as Partial<QueueMeta>;

    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.caption !== "string") return null;
    if (parsed.gender !== "female" && parsed.gender !== "male") return null;

    return {
      id: String(parsed.id ?? ""),
      caption: parsed.caption,
      gender: parsed.gender,
      isNsfw: parsed.isNsfw === true,
      userId: typeof parsed.userId === "number" ? parsed.userId : null,
      telegramId: typeof parsed.telegramId === "number" ? parsed.telegramId : 0,
      queuedAt: String(parsed.queuedAt ?? ""),
    };
  } catch {
    return null;
  }
}

/** Membatalkan satu antrean: hapus media dan sidecar-nya. */
export async function removeQueued(id: string): Promise<boolean> {
  const dir = queueDir();

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;

    const sidecar = path.join(dir, entry);
    const meta = await readQueueMeta(sidecar);
    if (!meta || meta.id !== id) continue;

    await rm(sidecar, { force: true });
    await rm(path.join(dir, entry.slice(0, -".json".length)), { force: true });
    return true;
  }

  return false;
}
