import { readPhoto } from "@/lib/bot/media";

/** Serves uploaded photos. Slugs are immutable, so the response is cacheable. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bytes = await readPhoto(slug.replace(/\.jpg$/, ""));

  if (!bytes) {
    return new Response("not found", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
