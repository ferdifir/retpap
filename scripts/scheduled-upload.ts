/**
 * scheduled-upload.ts - upload berkala foto dari folder lokal ke RetPAP.
 *
 * Cara jalan (di VPS, setelah npm run deploy):
 *   npx tsx scripts/scheduled-upload.ts
 *   DRY_RUN=1 npx tsx scripts/scheduled-upload.ts   # hanya laporkan, tak upload
 *
 * Environment (warisi dari .env.local / crontab):
 *   INBOX_DIR          folder sumber foto (default ~/develop/video pap di lokal)
 *   UPLOAD_DIR         target savePhoto (sudah dipakai app)
 *   DATABASE_URL       koneksi DB
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
 *   MORNING_START/END  window pagi WIB, default 7 / 12
 *   UPLOAD_START/END   jam upload WIB, default 7 / 23 (tidak ada upload tengah malam)
 *   GAP_MIN_MINUTES    jeda minimum antar-upload dalam menit, default 90
 *   GAP_MAX_MINUTES    jeda maksimum antar-upload dalam menit, default 300
 *   START_MIN          menit slot pertama hari itu (WIB), default 420 (07:00)
 *   START_MAX          menit slot pertama maksimum (WIB), default 540 (09:00)
 *   MAX_PER_DAY        kuota harian, default 3
 *   MAX_PER_RUN        foto per eksekusi, default 1 (biar spread)
 *   UPLOAD_GENDER      label konten terjadwal: female (default) atau male
 *   UPLOAD_STATE_FILE  default scripts/.upload-state.json
 *   TZ                 di-set Asia/Jakarta oleh cron
 */
import "./dotenv-load";

import path from "node:path";
import os from "node:os";
import { readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { getDb } from "../src/db/client";
import { photos } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createPhoto } from "../src/db/upload";
import {
  savePhoto, blurPhoto, mediaUrl, saveVideo, savePoster, videoUrl, blurredThumbnail, mediaPath,
} from "../src/lib/bot/media";
import { channelConfigured, channelId } from "../src/lib/bot/channel";
import { sendPhotoFile, sendVideoFile } from "../src/lib/bot/api";
import { extractPoster, normalisePoster, probeVideo, extractTeaser, type Poster } from "../src/lib/bot/video";
import { readQueueMeta } from "../src/lib/bot/queue";
import sharp from "sharp";

// --- konfigurasi ----------------------------------------------------------
const TZ = "Asia/Jakarta";
const MORNING_KEYWORDS = ["morn", "morning", "mowning", "pagi", "subuh", "fajar", "dawn", "sunrise", "dini"];
const MORNING_START = Number(process.env.MORNING_START ?? 7);
const MORNING_END = Number(process.env.MORNING_END ?? 12);
const MAX_PER_DAY = Number(process.env.MAX_PER_DAY ?? 3);
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN ?? 1);
/** Jam upload: kuota harian tidak lagi habis di menit-menit awal. */
const UPLOAD_START = Number(process.env.UPLOAD_START ?? 7);
const UPLOAD_END = Number(process.env.UPLOAD_END ?? 23);
/** Jeda antar-upload diacak dalam rentang ini supaya polanya tak terbaca. */
const GAP_MIN_MINUTES = Number(process.env.GAP_MIN_MINUTES ?? 90);
const GAP_MAX_MINUTES = Number(process.env.GAP_MAX_MINUTES ?? 300);
/** Slot pertama hari itu diacak dalam rentang menit WIB ini (07:00-09:00). */
const START_MIN = Number(process.env.START_MIN ?? 420);
const START_MAX = Number(process.env.START_MAX ?? 540);
/** Folder inbox is treated as one gender; override with UPLOAD_GENDER=male. */
const UPLOAD_GENDER: "female" | "male" = process.env.UPLOAD_GENDER === "male" ? "male" : "female";
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"]);
const VIDEO_EXT = new Set([".mp4", ".webm"]);
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

const INBOX_DIR =
  process.env.INBOX_DIR ?? path.join(os.homedir(), "develop", "video pap");
const STATE_FILE =
  process.env.UPLOAD_STATE_FILE ?? path.resolve(process.cwd(), "scripts", ".upload-state.json");

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "menfesaibot";
const CHANNEL_CTA = "Rate foto ini, atau upload punyamu 👇";

// --- helpers ---------------------------------------------------------------
function wibNow(): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";

  return {
    date: pick("year") + "-" + pick("month") + "-" + pick("day"),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
  };
}
function clockLabel(hour: number, minute: number): string {
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}
/** Bilangan bulat acak inklusif; dipakai untuk jeda dan slot pertama. */
function randomInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
/** Timestamp absolut untuk jam dinding WIB pada tanggal YYYY-MM-DD. */
function wibTimestamp(date: string, minutesOfDay: number): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 0, minutesOfDay) - 7 * 60 * 60_000;
}
/** Label jam:menit WIB dari sebuah timestamp ISO. */
function wibClock(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return pick("hour") + ":" + pick("minute");
}
function collapse(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}
function tokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
function isMorning(filename: string): boolean {
  const base = path.parse(filename).name;
  for (const tok of tokens(base)) {
    const t = collapse(tok);
    if (t.length === 0) continue;
    for (const kw of MORNING_KEYWORDS) {
      // token berisi keyword (mornn->morn, mowning, morning, pagi, ...)
      if (t.includes(kw)) return true;
      // keyword berisi token, hanya kata >=4 huruf biar "mor" tdk ke-match
      if (t.length >= 4 && kw.includes(t)) return true;
      // fuzzy ketat cuma untuk kata panjang (mis. "mourning" -> "morning")
      if (t.length >= 5 && levenshtein(t, kw) <= 1) return true;
    }
  }
  return false;
}
/** Skip file bernama murni angka (1.jpg) atau export otomatis (5_123.mp4). */
function shouldSkip(filename: string): boolean {
  return /^\d+(_\d+)?$/.test(path.parse(filename).name);
}
function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function channelCaption(caption: string): string {
  // Bold + quotes separate the upload's caption from the call to action.
  return "<b>“" + escapeHtml(caption) + "”</b>\n\n" + CHANNEL_CTA;
}
function shareUrlFor(slug: string): string {
  return "https://t.me/" + BOT_USERNAME + "?startapp=" + encodeURIComponent(slug);
}
function uploadUrl(): string {
  return "https://t.me/" + BOT_USERNAME + "?start=upload";
}
function channelKeyboard(slug: string) {
  return {
    inline_keyboard: [
      [
        { text: "Lihat versi jelas", url: shareUrlFor(slug) },
        { text: "Upload", url: uploadUrl() },
      ],
    ],
  };
}

interface State {
  date: string;
  count: number;
  uploaded: Record<string, string>;
  /** ISO time of the last successful upload; missing in older state files. */
  lastUploadAt?: string | null;
  /** ISO time of the next allowed upload; randomised after every run. */
  nextUploadAt?: string | null;
}
function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { date: "", count: 0, uploaded: {} };
  }
}
async function saveState(state: State): Promise<void> {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function markChannelPost(photoId: number, messageId: number): Promise<void> {
  const { db } = getDb();
  await db.update(photos).set({ channelMessageId: messageId }).where(eq(photos.id, photoId));
}

/** ffmpeg first; null when extraction fails (video still uploads, just no cover). */
async function buildVideoPoster(video: Buffer): Promise<Poster | null> {
  const frame = await extractPoster(video);
  if (!frame) return null;
  try {
    return await normalisePoster(frame);
  } catch (error) {
    console.error("[poster] normalise failed", error);
    return null;
  }
}

/** Returns true when the content is visible to users (channel post succeeded). */
async function uploadOne(file: string): Promise<boolean> {
  const full = path.join(INBOX_DIR, file);
  const bytes = await readFile(full);
  const ext = path.extname(file).toLowerCase();
  const isVideo = VIDEO_EXT.has(ext);
  // Antrean owner: caption, gender, 18+ dan pemilik ada di sidecar, karena
  // nama file hanya memuat caption. File manual tidak punya sidecar.
  const queued = await readQueueMeta(full + ".json");
  const caption = (queued?.caption ?? path.parse(file).name).slice(0, 500);
  const gender = queued?.gender ?? UPLOAD_GENDER;
  const isNsfw = queued?.isNsfw ?? false;
  const userId = queued?.userId ?? null;

  let slug: string;
  let imageUrl: string;
  let mediaType: "photo" | "video";
  let imageWidth = 0;
  let imageHeight = 0;
  let durationSeconds: number | null = null;
  let posterUrl: string | null = null;
  let poster: Poster | null = null;

  if (isVideo) {
    // Batas ukuran sama dengan flow bot (20 MB); file lebih besar dilewati.
    if (bytes.length > 20 * 1024 * 1024) {
      console.error("[upload] video terlalu besar (" + Math.round(bytes.length / (1024 * 1024)) + " MB), skip: " + file);
      return false;
    }
    slug = await saveVideo(bytes);
    imageUrl = videoUrl(slug);
    mediaType = "video";

    const probe = await probeVideo(bytes);
    poster = await buildVideoPoster(bytes);
    if (poster) {
      await savePoster(slug, poster.bytes).catch((error) =>
        console.error("[poster] save failed", slug, error),
      );
      posterUrl = mediaUrl(slug);
      imageWidth = poster.width;
      imageHeight = poster.height;
    } else if (probe) {
      // No cover frame: fall back to probe dimensions so the row still passes
      // the width/height > 0 constraint.
      imageWidth = probe.width;
      imageHeight = probe.height;
    } else {
      console.error("[upload] tidak bisa baca dimensi video, skip: " + file);
      return false;
    }

    // Schema only accepts duration null or 1..60; clamp anything else.
    if (probe && probe.duration >= 1 && probe.duration <= 60) {
      durationSeconds = probe.duration;
    }
  } else {
    slug = await savePhoto(bytes);
    imageUrl = mediaUrl(slug);
    mediaType = "photo";
    const meta = await sharp(bytes).metadata();
    imageWidth = meta.width ?? 0;
    imageHeight = meta.height ?? 0;
  }

  const photoId = await createPhoto({
    slug,
    caption,
    mediaType,
    imageUrl,
    imageWidth,
    imageHeight,
    durationSeconds,
    posterUrl,
    userId,
    isNsfw,
    gender,
  });

  // Tanpa channel, konten tetap dianggap tayang (tidak ada post yang bisa gagal).
  let posted = !channelConfigured();

  if (channelConfigured()) {
    try {
      let message;
      if (mediaType === "video") {
        // Prefer a short blurred clip (motion signals "video"); else a blurred
        // still cover. Skips the channel post if both fail.
        const videoPath = mediaPath(slug, "mp4");
        let teaser: Buffer | null = null;
        if (videoPath) {
          try {
            teaser = await extractTeaser(videoPath, { nsfw: isNsfw });
          } catch (error) {
            console.error("[channel] teaser failed", slug, error);
          }
        }
        if (teaser) {
          message = await sendVideoFile(channelId(), teaser, {
            caption: channelCaption(caption),
            keyboard: channelKeyboard(slug),
          });
        } else if (poster) {
          const thumbnail = await blurredThumbnail(poster.bytes);
          message = await sendPhotoFile(channelId(), thumbnail, {
            caption: channelCaption(caption),
            keyboard: channelKeyboard(slug),
          });
        } else {
          console.error("[channel] tidak ada teaser/poster, skip channel: " + slug);
          message = null;
        }
      } else {
        const blurred = await blurPhoto(bytes);
        message = await sendPhotoFile(channelId(), blurred, {
          caption: channelCaption(caption),
          keyboard: channelKeyboard(slug),
        });
      }

      if (message) {
        await markChannelPost(photoId, message.message_id);
        posted = true;
      }
    } catch (error) {
      console.error("[channel] post failed for", slug, error);
    }
  }
  // Sidecar hanya berlaku sekali; media tetap di folder seperti file manual.
  if (queued) await rm(full + ".json", { force: true });

  console.log(
    "[upload] " + file + " -> " + slug + " (" + mediaType + ")" +
      (DRY_RUN ? " (DRY_RUN)" : "") +
      (posted ? "" : " (channel gagal, kuota tidak dipakai)"),
  );

  return posted;
}

async function main(): Promise<void> {
  const now = wibNow();
  const dateToday = now.date;
  const minutesNow = now.hour * 60 + now.minute;
  const inMorningWindow = now.hour >= MORNING_START && now.hour < MORNING_END;
  const inUploadWindow = minutesNow >= UPLOAD_START * 60 && minutesNow < UPLOAD_END * 60;

  console.log(
    "[run] " + dateToday + " " + clockLabel(now.hour, now.minute) + " WIB" +
      " | morning-window=" + inMorningWindow +
      " | upload-window=" + inUploadWindow +
      " | inbox=" + INBOX_DIR,
  );

  const state = loadState();
  // Kuota harian di-reset tiap hari, tapi map "uploaded" tetap persisten
  // supaya foto yang sama tidak pernah di-upload ulang di hari berikutnya.
  if (state.date !== dateToday) {
    state.date = dateToday;
    state.count = 0;
    // Slot pertama hari itu diacak 07:00-09:00 WIB, termasuk menitnya.
    const startMinute = randomInt(START_MIN, START_MAX);
    state.nextUploadAt = new Date(wibTimestamp(dateToday, startMinute)).toISOString();
    console.log("[run] slot pertama hari ini " + clockLabel(Math.floor(startMinute / 60), startMinute % 60) + " WIB");
  }
  const remaining = MAX_PER_DAY - state.count;
  if (remaining <= 0) {
    console.log("[run] kuota harian (" + MAX_PER_DAY + ") sudah habis untuk " + dateToday);
    await saveState(state);
    return;
  }

  // Tanpa window ini, kuota 3 langsung habis di menit-menit pertama setelah
  // tengah malam dan konten pagi tidak pernah kebagian.
  if (!inUploadWindow) {
    console.log("[run] di luar window upload " + UPLOAD_START + ":00-" + UPLOAD_END + ":00 WIB");
    await saveState(state);
    return;
  }

  // Jeda diacak tiap kali upload, jadi post di channel tidak berpola.
  const nextAt = state.nextUploadAt ? Date.parse(state.nextUploadAt) : NaN;
  if (Number.isFinite(nextAt) && Date.now() < nextAt) {
    const waitMinutes = Math.ceil((nextAt - Date.now()) / 60_000);
    console.log("[run] jadwal berikutnya " + wibClock(state.nextUploadAt as string) + " WIB, tunggu " + waitMinutes + " menit");
    await saveState(state);
    return;
  }

  let entries: string[];
  try {
    entries = await readdir(INBOX_DIR);
  } catch (error) {
    console.error("[run] tidak bisa baca INBOX_DIR:", INBOX_DIR, error);
    return;
  }

  const candidates: { file: string; morning: boolean; key: string }[] = [];
  for (const f of entries) {
    const ext = path.extname(f).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    // Antrean owner ikut pool yang sama: tanpa prioritas dan tanpa aturan
    // "pagi", karena captionnya bukan penanda jadwal.
    const queued = await readQueueMeta(path.join(INBOX_DIR, f) + ".json");
    if (!queued && shouldSkip(f)) continue;
    const st = await stat(path.join(INBOX_DIR, f));
    const key = f + "|" + st.size + "|" + st.mtimeMs;
    if (state.uploaded[key]) continue;
    const morning = queued ? false : isMorning(f);
    if (morning && !inMorningWindow) {
      console.log("[skip] pagi di luar window: " + f);
      continue;
    }
    candidates.push({ file: f, morning, key });
  }

  if (candidates.length === 0) {
    console.log("[run] tidak ada kandidat eligible");
    await saveState(state);
    return;
  }

  // Selagi window pagi buka, konten pagi didahulukan supaya tidak kalah
  // oleh konten biasa yang kuotanya sudah terpakai lebih dulu.
  const pool = inMorningWindow && candidates.some((c) => c.morning)
    ? candidates.filter((c) => c.morning)
    : candidates;

  // acak biar variasi tiap run
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const toUpload = pool.slice(0, Math.min(MAX_PER_RUN, remaining));
  console.log("[run] kandidat=" + candidates.length + " pool=" + pool.length + " akan upload=" + toUpload.length + " sisa kuota=" + remaining);

  for (const c of toUpload) {
    if (!DRY_RUN) {
      const posted = await uploadOne(c.file);
      // File tetap ditandai sudah dipakai walau post gagal: mengulang file yang
      // sama hanya akan membuat baris foto duplikat di DB.
      state.uploaded[c.key] = dateToday;
      state.lastUploadAt = new Date().toISOString();
      if (posted) state.count += 1;
      // Jeda berikutnya dihitung dari sini, bukan dari jadwal sebelumnya, supaya
      // jarak yang terlihat di channel benar-benar acak.
      const gap = randomInt(GAP_MIN_MINUTES, GAP_MAX_MINUTES);
      state.nextUploadAt = new Date(Date.now() + gap * 60_000).toISOString();
      console.log("[run] upload berikutnya " + wibClock(state.nextUploadAt) + " WIB (+" + gap + " menit)");
      await saveState(state);
    } else {
      console.log("[dry-run] akan upload: " + c.file + (c.morning ? " (pagi)" : " (biasa)"));
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { pool } = getDb();
      await pool.end();
    } catch {
      /* env belum load */
    }
    if (!DRY_RUN) process.exit(process.exitCode ?? 0);
  });
