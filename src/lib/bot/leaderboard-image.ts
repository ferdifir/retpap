import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import type { LeaderboardEntry, LeaderboardResult } from "@/lib/feed-types";
import { mediaPath } from "./media";

/** Card geometry per rank: centre card is taller so the podium reads at once. */
const CARD = {
  1: { x: 435, w: 330, h: 412, y: 170, ring: "#fbbf24", score: "#fbbf24" },
  2: { x: 95, w: 300, h: 375, y: 207, ring: "#94a3b8", score: "#e2e8f0" },
  3: { x: 805, w: 300, h: 375, y: 207, ring: "#d97706", score: "#fcd34d" },
} as const;

const WIDTH = 1200;
const HEIGHT = 760;
const PAD = 4;
const CAPTION_MAX = 24;

/**
 * Every channel post is a blurred teaser, so the podium keeps that rule: the
 * recap never shows a sharp frame. Tuned for the ~300px card, not the 1600px
 * channel upload.
 */
const CARD_BLUR_SIGMA = 12;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * SVG text has no colour emoji font, so emoji would render as boxes. The
 * channel caption still carries them; the image keeps plain Latin text.
 */
function plainText(value: string): string {
  return value.replace(/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}]/gu, "").replace(/\s+/g, " ").trim();
}

function cardCaption(entry: LeaderboardEntry): string {
  const text = plainText(entry.caption) || "Tanpa caption";
  const chars = Array.from(text);
  return chars.length <= CAPTION_MAX ? text : chars.slice(0, CAPTION_MAX).join("") + "…";
}

/** One rounded thumbnail, cropped to the card aspect. */
async function thumbnail(slug: string, width: number, height: number): Promise<Buffer | null> {
  const file = mediaPath(slug, "jpg");
  if (!file) return null;

  try {
    const bytes = await readFile(file);
    const radius = 18;

    const mask = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        width +
        '" height="' +
        height +
        '"><rect width="' +
        width +
        '" height="' +
        height +
        '" rx="' +
        radius +
        '" ry="' +
        radius +
        '" fill="#fff"/></svg>',
    );

    return await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .blur(CARD_BLUR_SIGMA)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** Rank badges ride on top of the thumbnails, so they are a separate layer. */
function badgeSvg(entries: LeaderboardEntry[]): Buffer {
  const parts: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT + '">',
  ];

  for (const [index] of entries.slice(0, 3).entries()) {
    const rank = (index + 1) as 1 | 2 | 3;
    const card = CARD[rank];
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h - 4;

    parts.push(
      '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="' + card.ring + '" stroke="#0b1220" stroke-width="4"/>',
    );
    parts.push(
      '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold" fill="#0b1220">' + rank + "</text>",
    );
  }

  parts.push("</svg>");
  return Buffer.from(parts.join(""));
}
function podiumSvg(entries: LeaderboardEntry[], title: string, subtitle: string): string {
  const parts: string[] = [];

  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      WIDTH +
      '" height="' +
      HEIGHT +
      '" viewBox="0 0 ' +
      WIDTH +
      " " +
      HEIGHT +
      '">',
  );
  parts.push(
    "<defs>",
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#0b1220"/>',
    '<stop offset="1" stop-color="#131f33"/>',
    "</linearGradient>",
    '<radialGradient id="glow" cx="0.5" cy="0" r="0.8">',
    '<stop offset="0" stop-color="#22d3ee" stop-opacity="0.18"/>',
    '<stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>',
    "</radialGradient>",
    "</defs>",
  );
  parts.push('<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="url(#bg)"/>');
  parts.push('<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="url(#glow)"/>');

  // Header
  parts.push(
    '<text x="' +
      WIDTH / 2 +
      '" y="86" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="bold" fill="#f8fafc">' +
      escapeXml(title) +
      "</text>",
  );
  parts.push(
    '<text x="' +
      WIDTH / 2 +
      '" y="130" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#94a3b8">' +
      escapeXml(subtitle) +
      "</text>",
  );

  // Card frames; the thumbnails are composited afterwards.
  for (const [index, entry] of entries.slice(0, 3).entries()) {
    const rank = (index + 1) as 1 | 2 | 3;
    const card = CARD[rank];
    const inner = { x: card.x + PAD, y: card.y + PAD, w: card.w - PAD * 2, h: card.h - PAD * 2 };

    parts.push(
      '<rect x="' +
        card.x +
        '" y="' +
        card.y +
        '" width="' +
        card.w +
        '" height="' +
        card.h +
        '" rx="22" fill="#0f172a" stroke="' +
        card.ring +
        '" stroke-width="3"/>',
    );
    parts.push(
      '<rect x="' +
        inner.x +
        '" y="' +
        inner.y +
        '" width="' +
        inner.w +
        '" height="' +
        inner.h +
        '" rx="18" fill="#0b1220"/>',
    );

    // Caption, score and vote count.
    const captionY = card.y + card.h + 46;
    parts.push(
      '<text x="' +
        (card.x + card.w / 2) +
        '" y="' +
        captionY +
        '" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" font-weight="bold" fill="#e2e8f0">' +
        escapeXml(cardCaption(entry)) +
        "</text>",
    );
    parts.push(
      '<text x="' +
        (card.x + card.w / 2) +
        '" y="' +
        (captionY + 46) +
        '" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold" fill="' +
        card.score +
        '">' +
        entry.avg.toFixed(1) +
        '<tspan font-size="18" font-weight="normal" fill="#64748b"> /10</tspan></text>',
    );
    parts.push(
      '<text x="' +
        (card.x + card.w / 2) +
        '" y="' +
        (captionY + 76) +
        '" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" fill="#64748b">' +
        entry.votes +
        " rating</text>",
    );
  }

  // Footer
  parts.push(
    '<text x="' +
      WIDTH / 2 +
      '" y="' +
      (HEIGHT - 22) +
      '" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="#22d3ee">RetPAP</text>',
  );

  parts.push("</svg>");
  return parts.join("");
}

/**
 * Podium image for the channel recap: same order as the app (2 · 1 · 3) with
 * each winner's thumbnail, caption, average and vote count.
 */
export async function renderPodiumImage(
  result: LeaderboardResult,
  title: string,
  subtitle: string,
): Promise<Buffer | null> {
  if (result.entries.length === 0) return null;

  // Default density keeps SVG units 1:1 with pixels, so the composite offsets
  // below match the card geometry exactly.
  const base = sharp(Buffer.from(podiumSvg(result.entries, title, subtitle)));

  const layers: OverlayOptions[] = [];

  for (const [index, entry] of result.entries.slice(0, 3).entries()) {
    const card = CARD[(index + 1) as 1 | 2 | 3];
    const image = await thumbnail(entry.slug, card.w - PAD * 2, card.h - PAD * 2);
    if (!image) continue;
    layers.push({ input: image, top: card.y + PAD, left: card.x + PAD });
  }

  layers.push({ input: badgeSvg(result.entries), top: 0, left: 0 });

  const png = await base
    .composite(layers)
    // Palette keeps the channel upload small without visible banding here.
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();

  return png;
}
