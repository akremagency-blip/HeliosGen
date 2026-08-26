import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import https from "node:https";
import http  from "node:http";
import { lookupAssetHash, storeAssetHash } from "./db";
import { stripMetadata } from "../mediaMetadata";
import { isBlockedHost } from "../safeUrl";

// Guest mode is single-user, but the README has you expose it over ngrok, and
// resolveUserId waves every caller through as "guest" there. So this fetcher is
// reachable from the internet with a caller-chosen URL, exactly like the R2 one.
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const GENERATED_DIR = join(process.cwd(), "public", "generated");

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function ext(contentType: string): string {
  if (contentType.includes("mp4"))  return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("png"))  return "png";
  if (contentType.includes("gif"))  return "gif";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export async function uploadBuffer(buffer: Buffer, contentType: string, folder: string): Promise<string> {
  buffer = await stripMetadata(buffer, contentType);
  const hash   = hashBuffer(buffer);
  const cached = lookupAssetHash(hash);
  if (cached) return cached;

  await mkdir(join(GENERATED_DIR, folder), { recursive: true });
  const filename = `${randomUUID()}.${ext(contentType)}`;
  await writeFile(join(GENERATED_DIR, folder, filename), buffer);
  const url = `/generated/${folder}/${filename}`;

  storeAssetHash(hash, url, contentType, buffer.byteLength);
  return url;
}

function fetchToBuffer(url: string, maxRedirects = 5): Promise<{ buf: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
    // Checked on every hop, since this recurses through redirects.
    if (isBlockedHost(url)) return reject(new Error("Blocked URL"));
    const u   = new URL(url);
    const mod = u.protocol === "https:" ? https : (http as unknown as typeof https);
    mod.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchToBuffer(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data",  (c: Buffer) => {
        total += c.byteLength;
        // Unbounded before this: the response went straight to disk.
        if (total > MAX_BYTES) { res.destroy(); reject(new Error("Response exceeds 500 MB limit")); return; }
        chunks.push(c);
      });
      res.on("end",   () => resolve({ buf: Buffer.concat(chunks), contentType: res.headers["content-type"] ?? "image/jpeg" }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export async function mirrorToStorage(url: string, folder: string): Promise<string> {
  const { buf, contentType } = await fetchToBuffer(url);
  return uploadBuffer(buf, contentType, folder);
}

export async function uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
  const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) throw new Error("Not a valid data URL");
  return uploadBuffer(Buffer.from(m[2], "base64"), m[1], folder);
}

/** Kie.ai fetches this over the internet, so a bare "/generated/..." path
 *  won't resolve — prefix with the public tunnel URL (e.g. ngrok) when set.
 *  Only used for outbound reference URLs, never for stored results (those
 *  must stay same-origin so the browser doesn't have to cross the tunnel). */
function toPublicUrl(path: string, base = process.env.CALLBACK_BASE_URL?.replace(/\/$/, "")): string {
  return base && path.startsWith("/") ? `${base}${path}` : path;
}

export async function ensureStorage(url: string, folder: string): Promise<string> {
  const base = process.env.CALLBACK_BASE_URL?.replace(/\/$/, "");
  if (base && url.startsWith(`${base}/generated/`)) return url; // already public

  const stored = url.startsWith("data:")
    ? await uploadDataUrl(url, folder)
    : url.startsWith("/generated/")
    ? url
    : await mirrorToStorage(url, folder);

  return toPublicUrl(stored, base);
}
