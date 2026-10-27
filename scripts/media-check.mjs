#!/usr/bin/env node
/**
 * media-check — cek watermark & konten duplikat tanpa layanan pihak ketiga.
 *
 *   node scripts/media-check.mjs <file...> [--ocr] [--json]
 *
 * Tiga lapis pemeriksaan:
 *   1. phash     — sidik jari 64-bit, menangkap foto yang di-upload ulang
 *                  (walau sudah dikompres ulang atau diganti namanya).
 *   2. template  — cocokkan patch watermark yang sudah dikenal ke seluruh
 *                  gambar (normalized cross-correlation).
 *   3. ocr       — baca teks di gambar, opsional karena lambat dan tidak
 *                  selalu berhasil pada watermark semi-transparan.
 *
 * Skrip ini tidak menyentuh DB dan tidak mengubah file apa pun.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/* ---------------------------------------------------------------- ambang */

const HASH_MATCH_MAX = 6;     // jarak Hamming maksimum untuk dianggap duplikat
const TEMPLATE_MATCH_MIN = 0.9; // skor NCC minimum
const TEMPLATE_WIDTH = 64;     // lebar template kerja
const SCAN_WIDTH = 320;        // lebar gambar kerja saat mencocokkan
const SCAN_STEP = 2;           // langkah pencarian (piksel)

/* ---------------------------------------------------------------- sidik jari */

async function toGray(input, width) {
  const { data, info } = await sharp(input)
    .greyscale()
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** dHash 64-bit: tahan recompress, gagal pada crop berat. */
async function dhash(input, { crop = false } = {}) {
  let pipeline = sharp(input);
  if (crop) {
    const meta = await sharp(input).metadata();
    const w = meta.width ?? 1;
    const h = meta.height ?? 1;
    pipeline = sharp(input).extract({
      left: Math.round(w * 0.1),
      top: Math.round(h * 0.1),
      width: Math.round(w * 0.8),
      height: Math.round(h * 0.8),
    });
  }
  const { data } = await pipeline.greyscale().resize(9, 8, { fit: "fill" }).raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits += data[y * 9 + x] < data[y * 9 + x + 1] ? "1" : "0";
    }
  }
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

export function hamming(a, b) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/* ------------------------------------------------------------ template */

/** Zero-mean normalized cross-correlation pada satu posisi. */
function ncc(img, tmpl, ox, oy) {
  const { data, w } = img;
  const t = tmpl.data;
  const { w: tw, h: th } = tmpl;
  const n = tw * th;
  let sI = 0, sI2 = 0, sT = 0, sT2 = 0, sIT = 0;

  for (let y = 0; y < th; y += 1) {
    const row = (oy + y) * w + ox;
    for (let x = 0; x < tw; x += 1) {
      const iv = data[row + x];
      const tv = t[y * tw + x];
      sI += iv; sI2 += iv * iv; sT += tv; sT2 += tv * tv; sIT += iv * tv;
    }
  }

  const den = Math.sqrt((n * sI2 - sI * sI) * (n * sT2 - sT * sT));
  return den === 0 ? 0 : (n * sIT - sI * sT) / den;
}

function bestMatch(img, tmpl, step = SCAN_STEP) {
  let score = -1, x = 0, y = 0;
  for (let oy = 0; oy <= img.h - tmpl.h; oy += step) {
    for (let ox = 0; ox <= img.w - tmpl.w; ox += step) {
      const s = ncc(img, tmpl, ox, oy);
      if (s > score) { score = s; x = ox; y = oy; }
    }
  }
  return { score, x, y };
}

async function loadTemplates(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => {
      const file = path.join(dir, f);
      const metaFile = file.replace(/\.png$/, ".json");
      const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
      return { name: path.basename(f, ".png"), file, ...meta };
    });
}

async function prepareTemplates(templates) {
  const prepared = [];
  for (const entry of templates) {
    const { data, info } = await sharp(readFileSync(entry.file))
      .greyscale()
      .resize({ width: TEMPLATE_WIDTH })
      .raw()
      .toBuffer({ resolveWithObject: true });
    prepared.push({ ...entry, data, w: info.width, h: info.height });
  }
  return prepared;
}

/* ------------------------------------------------------------------ ocr */

/** Teks yang hampir selalu berarti watermark / ajakan dari situs lain. */
const BLOCKLIST = [
  /\bbullgp\b/i, /\bwatermark\b/i, /\brate\s*dong\b/i, /\bratr\s*dong\b/i,
  /\bfollow\b/i, /\bsubscribe\b/i, /t\.me\//i, /@[a-z0-9_]{3,}/i,
  /\b(onlyfans|fansly|fanhouse)\b/i,
];

async function readText(buffer, width, height) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { logger: () => {} });
  const prepared = await sharp(buffer)
    .greyscale()
    .resize({ width: Math.min(1600, Math.round(width * 1.4)) })
    .normalize()
    .png()
    .toBuffer();

  const { data } = await worker.recognize(prepared, {}, { blocks: true });
  await worker.terminate();

  const words = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          if (!word.text || word.text.trim().length < 3) continue;
          const b = word.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
          words.push({
            text: word.text.trim(),
            conf: Math.round(word.confidence ?? 0),
            area: ((b.x1 - b.x0) * (b.y1 - b.y0)) / (width * height),
            cx: (b.x0 + b.x1) / 2 / width,
            cy: (b.y0 + b.y1) / 2 / height,
          });
        }
      }
    }
  }
  return words;
}

/* ------------------------------------------------------------- pemeriksaan */

export async function analyze(file, { ocr = false, templates = [], known = [] } = {}) {
  const buffer = readFileSync(file);
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const phash = await dhash(buffer);
  const phashCrop = await dhash(buffer, { crop: true });
  const reasons = [];

  // Lapis 1 — duplikat antar konten.
  for (const entry of known) {
    const distance = hamming(phash, entry.phash);
    if (distance <= HASH_MATCH_MAX) {
      reasons.push("duplikat dari " + entry.label + " (jarak " + distance + ")");
      break;
    }
  }

  // Lapis 2 — watermark yang sudah dikenal.
  let best = { score: -1 };
  if (templates.length > 0) {
    const gray = await toGray(buffer, SCAN_WIDTH);
    for (const tmpl of templates) {
      const match = bestMatch(gray, tmpl);
      if (match.score > (best.score ?? -1)) best = { ...match, name: tmpl.name, label: tmpl.label };
      if (match.score >= TEMPLATE_MATCH_MIN) {
        reasons.push(
          "watermark \"" + (tmpl.label ?? tmpl.name) + "\" cocok (skor " + match.score.toFixed(3) + ")",
        );
      }
    }
  }

  // Lapis 3 — teks di gambar.
  let words = [];
  if (ocr) {
    words = await readText(buffer, width, height);
    for (const word of words) {
      if (word.conf < 55) continue;
      const blocked = BLOCKLIST.find((re) => re.test(word.text));
      const central = word.cy > 0.28 && word.cy < 0.72;
      if (blocked) reasons.push("teks \"" + word.text + "\" (cocok blocklist)");
      else if (word.area >= 0.015 && central) {
        reasons.push("teks besar di tengah: \"" + word.text + "\" (" + (word.area * 100).toFixed(1) + "%)");
      }
    }
  }

  return {
    file,
    width,
    height,
    kb: Math.round(buffer.length / 1024),
    phash,
    phashCrop,
    watermarkScore: best.score >= 0 ? Number(best.score.toFixed(3)) : null,
    watermarkName: best.score >= TEMPLATE_MATCH_MIN ? best.name : null,
    words,
    verdict: reasons.length > 0 ? "review" : "clean",
    reasons,
  };
}

/* ------------------------------------------------------------------- cli */

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const ocr = args.includes("--ocr");
  const files = args.filter((a) => !a.startsWith("--"));

  if (files.length === 0) {
    console.error("pemakaian: node scripts/media-check.mjs <file...> [--ocr] [--json]");
    process.exit(1);
  }

  const templates = await prepareTemplates(
    await loadTemplates(path.join(process.cwd(), "scripts/watermarks")),
  );

  // Sidik jari konten yang sudah dinyatakan bermasalah, kalau ada.
  const knownFile = path.join(process.cwd(), "scripts/known-hashes.json");
  const known = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, "utf8")) : [];

  const results = [];
  for (const file of files) {
    const result = await analyze(file, { ocr, templates, known });
    results.push(result);

    if (!asJson) {
      console.log("\n" + path.basename(file) + "  " + result.width + "x" + result.height + "  " + result.kb + " KB");
      console.log("  verdict  : " + result.verdict.toUpperCase());
      console.log("  phash    : " + result.phash + "   crop " + result.phashCrop);
      if (result.watermarkScore !== null) {
        console.log("  watermark: skor " + result.watermarkScore.toFixed(3) +
          (result.watermarkName ? "  → " + result.watermarkName : "  (di bawah ambang " + TEMPLATE_MATCH_MIN + ")"));
      }
      if (result.reasons.length === 0) console.log("  alasan   : tidak ada sinyal");
      for (const reason of result.reasons) console.log("  - " + reason);
    }
  }

  if (asJson) console.log(JSON.stringify(results, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith("media-check.mjs")) {
  main().catch((error) => { console.error("gagal:", error.message); process.exit(1); });
}
