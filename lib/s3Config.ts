/**
 * Where uploads go.
 *
 * The endpoint used to be built from the Cloudflare account id, which made R2
 * the only possible target — self-hosting the whole stack on one box stopped
 * here. Any S3-compatible server (MinIO, Garage, Backblaze B2, Wasabi) works
 * now; Cloudflare stays the default so existing deployments need no new value.
 */

export interface S3Config {
  endpoint: string;
  region: string;
  /** MinIO and most self-hosted servers address buckets by path rather than by subdomain. */
  forcePathStyle: boolean;
}

type Env = Record<string, string | undefined>;

export function resolveS3Config(env: Env = process.env): S3Config {
  const custom = env.S3_ENDPOINT?.trim();

  if (!custom && !env.R2_ACCOUNT_ID) {
    // Without this the endpoint became "https://undefined.r2.cloudflarestorage.com"
    // and every upload failed at request time with a DNS error nobody could trace
    // back to a missing variable.
    throw new Error(
      "Storage is not configured: set S3_ENDPOINT for an S3-compatible server, or R2_ACCOUNT_ID for Cloudflare R2.",
    );
  }

  return {
    endpoint: custom || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: env.S3_REGION?.trim() || "auto",
    // Cloudflare accepts either style, so the default only has to be right for
    // the custom case — where path style is almost always what is needed.
    forcePathStyle: env.S3_FORCE_PATH_STYLE
      ? env.S3_FORCE_PATH_STYLE === "true"
      : Boolean(custom),
  };
}

/** The public base URL media is served from — a CDN domain, or your own host. */
export function resolvePublicBase(env: Env = process.env): string {
  const base = env.R2_PUBLIC_URL?.trim();
  if (!base) {
    throw new Error(
      "R2_PUBLIC_URL is not set. It is the public base URL your bucket serves from, e.g. https://cdn.example.com",
    );
  }
  return base.replace(/\/$/, "");
}
