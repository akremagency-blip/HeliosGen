import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * /api/callback is a webhook — kie.ai POSTs generation results to it, so it
 * carries no user session and is excluded from the auth proxy. Unauthenticated,
 * anyone who guesses a taskId can settle someone else's job with a URL of their
 * choosing: that both poisons the victim's gallery and turns mirrorToR2 into an
 * SSRF/arbitrary-storage-write primitive. So the URL we hand kie.ai carries a
 * shared secret that the route checks back.
 *
 * The token is derived from a secret the deployment already has, so upgrading
 * needs no new env var. Set CALLBACK_SECRET to rotate it independently.
 */
const SEED =
  process.env.CALLBACK_SECRET ||
  process.env.KIE_API_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

export const CALLBACK_TOKEN = SEED
  ? createHmac("sha256", SEED).update("heliosgen:callback:v1").digest("hex").slice(0, 32)
  : "";

export function callbackTokenValid(given: string | null): boolean {
  if (!CALLBACK_TOKEN || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(CALLBACK_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The webhook URL handed to the provider, secret included. */
export function callbackUrl(base: string): string {
  return `${base.replace(/\/$/, "")}/api/callback?s=${CALLBACK_TOKEN}`;
}
