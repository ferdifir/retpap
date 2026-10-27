import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { nsfwBadge } from "./nsfw-badge";

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
const NSFW_TEASER_BLUR_SIGMA = 14;
const TEASER_CRF = 32;
const TEASER_TIMEOUT_MS = 20_000;

/**
 * Renders the first seconds of a stored video into a small, silent, blurred
 * MP4. Motion is what makes a video distinguishable from a blurred photo in
 * the channel. The result is only a few hundred KB and is discarded after the
 * Telegram upload, so it never needs a permanent path.
 */
export async function extractTeaser(
  videoPath: string,
  options: { nsfw?: boolean } = {},
): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "retpap-teaser-"));
  const output = join(dir, "teaser.mp4");
  const badgePath = join(dir, "badge.png");
  const hasBadge = options.nsfw === true;

  try {
    // Without the badge the 18+ teaser must not be produced at all, so a
    // failure here propagates and the caller falls back to a spoiler cover.
    if (hasBadge) await writeFile(badgePath, await nsfwBadge(84));

    const rendered = await new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(ok);
      };

      const blur =
        "fps=" +
        TEASER_FPS +
        ",scale=" +
        TEASER_BOX +
        ":" +
        TEASER_BOX +
        ":force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,gblur=sigma=" +
        (options.nsfw ? NSFW_TEASER_BLUR_SIGMA : TEASER_BLUR_SIGMA);

      const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath];
      if (hasBadge) args.push("-i", badgePath);
      args.push("-t", String(TEASER_SECONDS));
      if (hasBadge) {
        args.push(
          "-filter_complex",
          "[0:v]" + blur + "[bg];[bg][1:v]overlay=W-w-24:24[out]",
          "-map",
          "[out]",
        );
      } else {
        args.push("-vf", blur);
      }
      args.push(
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
      );

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
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

/** Path to ffprobe; FFPROBE_PATH is an escape hatch alongside FFMPEG_PATH. */
function ffprobePath(): string {
  const configured = process.env.FFPROBE_PATH?.trim();
  return configured && configured.length > 0 ? configured : "ffprobe";
}

const PROBE_TIMEOUT_MS = 20_000;

/**
 * Probes a video in memory for its display dimensions and duration. Writes the
 * bytes to a temp file first because some containers (notably MP4) need to
 * seek, which a pipe cannot provide. Returns null when ffprobe is missing or
 * the file is not a decodable video.
 */
export async function probeVideo(
  video: Buffer,
): Promise<{ width: number; height: number; duration: number } | null> {
  const dir = await mkdtemp(join(tmpdir(), "retpap-probe-"));
  const input = join(dir, "input");
  await writeFile(input, video);

  try {
    return await new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (value: { width: number; height: number; duration: number } | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(ffprobePath(), [
          "-v", "error",
          "-select_streams", "v:0",
          "-show_entries", "stream=width,height:format=duration",
          "-of", "json",
          input,
        ]);
      } catch {
        finish(null);
        return;
      }

      const chunks: Buffer[] = [];
      child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      // Drain stderr: an unread pipe would block ffprobe.
      child.stderr?.on("data", () => undefined);
      child.on("error", () => finish(null));
      child.on("close", (code) => {
        if (code !== 0) return finish(null);
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const stream = json.streams?.[0];
          const duration = Number(json.format?.duration);
          if (!stream?.width || !stream?.height || !Number.isFinite(duration)) {
            return finish(null);
          }
          finish({ width: stream.width, height: stream.height, duration: Math.round(duration) });
        } catch {
          finish(null);
        }
      });

      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(null);
      }, PROBE_TIMEOUT_MS);
    });
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
