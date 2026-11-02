import sharp from "sharp";
import { ERASER_COLOR, type DrawStroke } from "@/lib/draw";
import {
  CHANNEL_BLUR_SIGMA,
  CHANNEL_MAX_DIMENSION,
} from "./media";

/**
 * Renders the channel teaser for a shared drawing: the photo and the strokes
 * are blurred with the same strength, so the post hints at the drawing without
 * giving it away. The original media stays untouched; this buffer is only ever
 * uploaded to the channel.
 */
export async function renderDrawingTeaser(
  photo: Buffer,
  strokes: DrawStroke[],
): Promise<Buffer> {
  const base = await sharp(photo, { failOn: "none" })
    .rotate()
    .resize({
      width: CHANNEL_MAX_DIMENSION,
      height: CHANNEL_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .blur(CHANNEL_BLUR_SIGMA)
    .toBuffer({ resolveWithObject: true });

  const { width, height } = base.info;
  const layer = await sharp(Buffer.from(strokeSvg(strokes, width, height)))
    .png()
    .toBuffer();

  const blurredLayer = await sharp(layer)
    .blur(CHANNEL_BLUR_SIGMA)
    .png()
    .toBuffer();

  return sharp(base.data)
    .composite([{ input: blurredLayer }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** One polyline per stroke; a single tap becomes a dot instead. */
function strokeSvg(strokes: DrawStroke[], width: number, height: number): string {
  const drawn: string[] = [];
  const erased: string[] = [];

  for (const stroke of strokes) {
    const points = stroke.points.map(
      ([x, y]) => round(x * width) + "," + round(y * height),
    );
    const lineWidth = Math.max(1, round(stroke.width * width));
    const target = stroke.color === ERASER_COLOR ? erased : drawn;
    const color = stroke.color === ERASER_COLOR ? "#000" : stroke.color;

    if (points.length === 1) {
      const [cx, cy] = points[0].split(",");
      target.push(
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + lineWidth / 2 +
          '" fill="' + color + '"/>',
      );
      continue;
    }

    target.push(
      '<polyline points="' + points.join(" ") + '" fill="none" stroke="' +
        color + '" stroke-width="' + lineWidth +
        '" stroke-linecap="round" stroke-linejoin="round"/>',
    );
  }

  // The mask keeps erasing honest: erased areas drop out of the drawing layer
  // instead of painting over the photo.
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width +
    '" height="' + height + '">' +
    '<defs><mask id="erase"><rect width="' + width + '" height="' + height +
    '" fill="#fff"/>' + erased.join("") + "</mask></defs>" +
    '<g mask="url(#erase)">' + drawn.join("") + "</g>" +
    "</svg>"
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
