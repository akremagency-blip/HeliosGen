import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

/**
 * Serves guest-mode media out of public/generated.
 *
 * Next only serves what public/ contained at build time, so under
 * `next build && next start` — the command the README hands you — every
 * generated image and video was written to disk and then 404'd. It worked in
 * `next dev` only, which is why it survived this long.
 *
 * Cloud mode never reaches here; those URLs point at R2.
 */
const ROOT = join(process.cwd(), "public", "generated");

const TYPES: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", avif: "image/avif",
};

function resolveSafe(parts: string[]): string | null {
  const rel = normalize(parts.join("/"));
  if (rel.includes("\0")) return null;
  const file = join(ROOT, rel);
  // normalize() collapses "..", so compare the result rather than the input
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  return file;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const file = resolveSafe(path ?? []);
  if (!file) return new Response("Forbidden", { status: 403 });

  let size: number;
  try {
    const s = await stat(file);
    if (!s.isFile()) return new Response("Not found", { status: 404 });
    size = s.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = TYPES[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  // <video> seeks with Range requests; without this the scrubber does nothing.
  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || start >= size || end < start) {
      return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as NodeReadableStream;
    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as NodeReadableStream;
  return new Response(stream as unknown as BodyInit, {
    headers: { ...headers, "Content-Length": String(size) },
  });
}
