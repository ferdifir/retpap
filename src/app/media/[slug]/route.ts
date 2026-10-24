import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { MEDIA_EXTENSIONS, mediaPath, type MediaExtension } from "@/lib/bot/media";

const CONTENT_TYPES: Record<MediaExtension, string> = {
  jpg: "image/jpeg",
  mp4: "video/mp4",
};

type RangeSpan = { start: number; end: number };

function parseMediaParam(raw: string): { slug: string; ext: MediaExtension } | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const ext = raw.slice(dot + 1).toLowerCase();
  if (!MEDIA_EXTENSIONS.includes(ext as MediaExtension)) return null;

  return { slug: raw.slice(0, dot), ext: ext as MediaExtension };
}

/**
 * Single-range parser. Returns null for headers we do not understand (ignored,
 * full response) and "unsatisfiable" when the client asked outside the file.
 * Multi-range requests are rare for video playback and are treated as unknown.
 */
function parseRange(header: string, size: number): RangeSpan | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || start >= size || end < start) return "unsatisfiable";

  return { start, end: Math.min(end, size - 1) };
}

function streamFrom(file: string, span?: RangeSpan): ReadableStream {
  return Readable.toWeb(createReadStream(file, span)) as unknown as ReadableStream;
}

/** Serves uploaded photos and videos. Slugs are immutable, so responses cache forever. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const parsed = parseMediaParam(raw);
  if (!parsed) return new Response("not found", { status: 404 });

  const file = mediaPath(parsed.slug, parsed.ext);
  if (!file) return new Response("not found", { status: 404 });

  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("not found", { status: 404 });
  }

  const headers = {
    "content-type": CONTENT_TYPES[parsed.ext],
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
  };

  const range = request.headers.get("range");
  const span = range ? parseRange(range, size) : null;

  if (span === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "accept-ranges": "bytes", "content-range": "bytes */" + size },
    });
  }

  if (!span) {
    return new Response(streamFrom(file), {
      headers: { ...headers, "content-length": String(size) },
    });
  }

  return new Response(streamFrom(file, span), {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(span.end - span.start + 1),
      "content-range": "bytes " + span.start + "-" + span.end + "/" + size,
    },
  });
}

/** Used by some video clients before they start streaming. */
export async function HEAD(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const parsed = parseMediaParam(raw);
  if (!parsed) return new Response(null, { status: 404 });

  const file = mediaPath(parsed.slug, parsed.ext);
  if (!file) return new Response(null, { status: 404 });

  try {
    const size = (await stat(file)).size;
    return new Response(null, {
      headers: {
        "content-type": CONTENT_TYPES[parsed.ext],
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(size),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
