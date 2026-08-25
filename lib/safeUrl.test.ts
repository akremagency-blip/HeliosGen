import test from "node:test";
import assert from "node:assert/strict";
import { originAllowed, isBlockedHost, readCapped } from "./safeUrl.ts";

test("originAllowed matches origins, not string prefixes", () => {
  const allow = ["https://cdn.kie.ai", "https://pub-abc.r2.dev/"];

  assert.equal(originAllowed("https://cdn.kie.ai/a.png", allow), true);
  assert.equal(originAllowed("https://pub-abc.r2.dev/v/1.mp4", allow), true);

  // The bug this replaced: startsWith() let an attacker register a hostname
  // that begins with an allowed one.
  assert.equal(originAllowed("https://cdn.kie.ai.evil.com/a.png", allow), false);
  assert.equal(originAllowed("https://pub-abc.r2.dev.evil.com/x", allow), false);

  assert.equal(originAllowed("http://cdn.kie.ai/a.png", allow), false); // scheme
  assert.equal(originAllowed("https://cdn.kie.ai:8443/a", allow), false); // port
  assert.equal(originAllowed("file:///etc/passwd", allow), false);
  assert.equal(originAllowed("not a url", allow), false);
});

test("isBlockedHost rejects the SSRF targets", () => {
  for (const bad of [
    "http://169.254.169.254/latest/meta-data/",  // cloud metadata
    "http://localhost:3000/api/callback",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://100.64.0.1/",                        // CGNAT
    "http://db.internal/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "file:///etc/passwd",
    "gopher://x/",
  ]) assert.equal(isBlockedHost(bad), true, bad);

  for (const ok of [
    "https://cdn.kie.ai/x.png",
    "https://example.com/a",
    "http://172.15.0.1/",   // just outside 172.16/12
    "http://11.0.0.1/",
  ]) assert.equal(isBlockedHost(ok), false, ok);
});

test("readCapped stops at the limit instead of buffering it all", async () => {
  const body = (n: number) => new Response(new Uint8Array(n));

  assert.equal((await readCapped(body(100), 1000))!.byteLength, 100);
  assert.equal(await readCapped(body(2000), 1000), null);
});
