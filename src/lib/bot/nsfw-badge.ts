import sharp from "sharp";

/**
 * Red "18+" badge burned into channel media. Telegram has no sticker overlay
 * for photos/videos, so the badge has to be part of the bytes.
 */
const cache = new Map<number, Promise<Buffer>>();

function badgeSvg(width: number): string {
  const height = Math.round(width * 0.54);
  const radius = Math.round(height * 0.24);
  const fontSize = Math.round(height * 0.6);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">',
    '<rect x="1" y="1" width="' + (width - 2) + '" height="' + (height - 2) + '" rx="' + radius + '" fill="#dc2626" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>',
    '<text x="50%" y="52%" font-family="Arial, Helvetica, sans-serif" font-size="' + fontSize + '" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">18+</text>',
    "</svg>",
  ].join("");
}

/** Cached per width: the channel only needs one or two sizes per process. */
export function nsfwBadge(width = 120): Promise<Buffer> {
  const exact = Math.max(48, Math.round(width));
  const cached = cache.get(exact);
  if (cached) return cached;

  const rendered = sharp(Buffer.from(badgeSvg(exact))).png().toBuffer();
  cache.set(exact, rendered);
  return rendered;
}

/** Places the badge in the top-right corner, scaled to the image width. */
export async function overlayNsfwBadge(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const imageWidth = meta.width ?? 1200;
  const badgeWidth = Math.max(56, Math.round(imageWidth * 0.11));
  const badge = await nsfwBadge(badgeWidth);
  const margin = Math.max(12, Math.round(imageWidth * 0.02));

  return sharp(image)
    .composite([
      {
        input: badge,
        top: margin,
        left: Math.max(0, imageWidth - badgeWidth - margin),
      },
    ])
    .toBuffer();
}
