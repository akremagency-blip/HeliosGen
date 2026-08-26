import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveS3Config, resolvePublicBase } from "./s3Config.ts";

test("defaults to Cloudflare R2 from the account id", () => {
  const c = resolveS3Config({ R2_ACCOUNT_ID: "abc123" });
  assert.equal(c.endpoint, "https://abc123.r2.cloudflarestorage.com");
  assert.equal(c.region, "auto");
  // Cloudflare uses virtual-host style; forcing path style here would be a
  // silent behaviour change for every existing deployment.
  assert.equal(c.forcePathStyle, false);
});

test("a custom endpoint wins and turns on path style", () => {
  const c = resolveS3Config({ S3_ENDPOINT: "http://127.0.0.1:9000", R2_ACCOUNT_ID: "abc123" });
  assert.equal(c.endpoint, "http://127.0.0.1:9000");
  assert.equal(c.forcePathStyle, true, "MinIO addresses buckets by path");
});

test("path style can be overridden either way", () => {
  assert.equal(
    resolveS3Config({ S3_ENDPOINT: "https://s3.example.com", S3_FORCE_PATH_STYLE: "false" }).forcePathStyle,
    false,
  );
  assert.equal(
    resolveS3Config({ R2_ACCOUNT_ID: "abc", S3_FORCE_PATH_STYLE: "true" }).forcePathStyle,
    true,
  );
});

test("missing configuration fails with a message that names the fix", () => {
  // The old code built "https://undefined.r2.cloudflarestorage.com" and failed
  // later with a DNS error that pointed at nothing.
  assert.throws(() => resolveS3Config({}), /S3_ENDPOINT|R2_ACCOUNT_ID/);
});

test("blank values are treated as unset, not as a hostname", () => {
  assert.throws(() => resolveS3Config({ S3_ENDPOINT: "   " }), /S3_ENDPOINT|R2_ACCOUNT_ID/);
  const c = resolveS3Config({ S3_ENDPOINT: "  ", R2_ACCOUNT_ID: "abc" });
  assert.equal(c.endpoint, "https://abc.r2.cloudflarestorage.com");
});

test("the public base drops a trailing slash and refuses to be empty", () => {
  assert.equal(resolvePublicBase({ R2_PUBLIC_URL: "https://cdn.example.com/" }), "https://cdn.example.com");
  assert.throws(() => resolvePublicBase({}), /R2_PUBLIC_URL/);
});
