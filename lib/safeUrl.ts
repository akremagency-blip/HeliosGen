/**
 * Guards for the routes that fetch or proxy a caller-supplied URL.
 */

/**
 * Exact-origin allowlist check.
 *
 * `url.startsWith(base)` is NOT an origin check: with base "https://cdn.kie.ai"
 * the attacker-registered "https://cdn.kie.ai.evil.com/x" passes it. Compare
 * parsed origins instead.
 */
export function originAllowed(url: string, allowed: readonly string[]): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  return allowed.some((base) => {
    try { return new URL(base).origin === u.origin; } catch { return false; }
  });
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|.*\.local|.*\.internal)$/i;
const PRIVATE_IPV4 = /^(?:10|127|0)\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\.|^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

/**
 * Rejects the obvious SSRF targets: loopback, RFC1918, CGNAT, and link-local —
 * cloud instance metadata lives on 169.254.169.254.
 *
 * ponytail: literal-host check only. A hostname whose DNS resolves to a private
 * IP still gets through; closing that needs resolve-then-pin on a custom HTTP
 * agent. Every caller also requires an authenticated user, which is what keeps
 * these routes from being an open relay — upgrade this if one ever goes public.
 */
export function isBlockedHost(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return true; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return true;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (PRIVATE_HOST.test(u.hostname) || PRIVATE_IPV4.test(host)) return true;
  // IPv6 loopback / unique-local / link-local
  return host === "::1" || /^(fc|fd|fe80)/.test(host);
}

/**
 * Read a response body with a hard byte cap, returning null if it overruns.
 * `res.arrayBuffer()` buffers whatever the far end sends first and only then
 * lets you check the size — a hostile (or just huge) source OOMs the server
 * before the check ever runs.
 */
export async function readCapped(res: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * fetch() with the host check applied to every hop.
 *
 * `redirect: "follow"` re-opens what isBlockedHost closes: a perfectly public
 * URL can 302 straight to 169.254.169.254. Following by hand is the only way to
 * vet each target.
 */
export async function fetchGuarded(url: string, init: RequestInit = {}, maxHops = 3): Promise<Response> {
  let target = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (isBlockedHost(target)) throw new Error("Blocked URL");
    const res = await fetch(target, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) return res;
    target = new URL(loc, target).toString();
  }
  throw new Error("Too many redirects");
}
