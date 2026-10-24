import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/** ffmpeg is installed on the deploy host; FFMPEG_PATH is an escape hatch. */
function ffmpegPath(): string {
  const configured = process.env.FFMPEG_PATH?.trim();
  return configured && configured.length > 0 ? configured : "ffmpeg";
}

const POSTER_TIMEOUT_MS = 15_000;
const POSTER_MAX_DIMENSION = 1600;

/** Reads the whole video from memory, so no temp file is needed. */
export async function extractPoster(video: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (frame: Buffer | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(frame);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        ffmpegPath(),
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          "pipe:0",
          "-frames:v",
          "1",
          "-f",
          "image2pipe",
          "-vcodec",
          "mjpeg",
          "pipe:1",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch {
      finish(null);
      return;
    }

    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    // Drain stderr: an unread pipe would block ffmpeg.
    child.stderr?.on("data", () => undefined);
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 && chunks.length > 0 ? Buffer.concat(chunks) : null));
    // The child may die before it reads everything; that is a normal failure.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(video);

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, POSTER_TIMEOUT_MS);
  });
}

const TEASER_SECONDS = 3;
const TEASER_BOX = 480;
const TEASER_FPS = 15;
const TEASER_BLUR_SIGMA = 7;
const TEASER_CRF = 32;
const TEASER_TIMEOUT_MS = 20_000;

/**
 * Renders the first seconds of a stored video into a small, silent, blurred
 * MP4. Motion is what makes a video distinguishable from a blurred photo in
 * the channel. The result is only a few hundred KB and is discarded after the
 * Telegram upload, so it never needs a permanent path.
 */
export async function extractTeaser(videoPath: string): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "retpap-teaser-"));
  const output = join(dir, "teaser.mp4");

  try {
    const rendered = await new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(ok);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(
          ffmpegPath(),
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            videoPath,
            "-t",
            String(TEASER_SECONDS),
            "-vf",
            "fps=" +
              TEASER_FPS +
              ",scale=" +
              TEASER_BOX +
              ":" +
              TEASER_BOX +
              ":force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,gblur=sigma=" +
              TEASER_BLUR_SIGMA,
            // Audio is never part of the teaser: blur does not hide voices.
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            String(TEASER_CRF),
            "-pix_fmt",
            "yuv420p",
            // Keep one core free for the web app; uploads are infrequent.
            "-threads",
            "1",
            "-movflags",
            "+faststart",
            output,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
      } catch {
        finish(false);
        return;
      }

      // Drain stderr: an unread pipe would block ffmpeg.
      child.stderr?.on("data", () => undefined);
      child.on("error", () => finish(false));
      child.on("close", (code) => finish(code === 0));
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(false);
      }, TEASER_TIMEOUT_MS);
    });

    if (!rendered) return null;
    return await readFile(output);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type Poster = { bytes: Buffer; width: number; height: number };

/** Normalises the extracted frame into a compact JPEG with EXIF stripped. */
export async function normalisePoster(frame: Buffer): Promise<Poster> {
  const { data, info } = await sharp(frame, { failOn: "none" })
    .rotate()
    .resize({
      width: POSTER_MAX_DIMENSION,
      height: POSTER_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return { bytes: data, width: info.width, height: info.height };
}

/**
 * Telegram's width/height are the source of truth, but a rotated video can
 * report the pre-rotation aspect. The poster comes from ffmpeg, which already
 * applies rotation, so use its aspect when the two disagree. Coordinates are
 * normalised, so only the ratio matters.
 */
export function matchAspect(
  width: number,
  height: number,
  posterWidth: number,
  posterHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || posterWidth <= 0 || posterHeight <= 0) {
    return { width, height };
  }

  const stored = height / width;
  const actual = posterHeight / posterWidth;
  if (Math.abs(stored - actual) / stored <= 0.02) return { width, height };

  return { width, height: Math.max(1, Math.round(width * actual)) };
}
