import type { NextRequest } from "next/server";

/**
 * Fixed-window rate limiting for the routes that cost real resources —
 * sharp, ffmpeg, outbound fetches, bucket writes.
 *
 * ponytail: per-instance and in-memory, so N replicas allow N times the limit,
 * and a restart forgets everything. That is the right trade here — the point is
 * to stop a runaway loop or a casual scraper, not to meter a paid API. Move to
 * Redis only when the limit itself has to be exact.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
let lastSweep = 0;

/** Drop expired entries so a stream of distinct keys cannot grow the map forever. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of windows) {
    if (now >= w.resetAt) windows.delete(key);
  }
}

export interface RateVerdict {
  ok: boolean;
  /** Seconds until the window resets. Zero when allowed. */
  retryAfter: number;
  remaining: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateVerdict {
  sweep(now);

  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - 1 };
  }

  w.count += 1;
  if (w.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)), remaining: 0 };
  }
  return { ok: true, retryAfter: 0, remaining: limit - w.count };
}

/** Test seam — the module keeps state between calls by design. */
export function resetRateLimits(): void {
  windows.clear();
  lastSweep = 0;
}

/**
 * Who to charge. A signed-in user is the fair unit; anonymous callers fall back
 * to the forwarded client address, which is the best a proxy gives us.
 */
export function callerKey(req: NextRequest, userId: string | null): string {
  if (userId) return "u:" + userId;
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return "ip:" + ip;
}

export function tooMany(verdict: RateVerdict): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(verdict.retryAfter),
      },
    },
  );
}
