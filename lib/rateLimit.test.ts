import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "./rateLimit.ts";

test("rateLimit allows up to the limit, then refuses", () => {
  resetRateLimits();
  const t = 1_000_000;

  for (let i = 1; i <= 5; i++) {
    const v = rateLimit("k", 5, 60_000, t);
    assert.equal(v.ok, true, "call " + i + " should pass");
    assert.equal(v.remaining, 5 - i);
  }

  const over = rateLimit("k", 5, 60_000, t);
  assert.equal(over.ok, false);
  assert.ok(over.retryAfter >= 1, "must tell the caller when to come back");
});

test("rateLimit reopens once the window rolls over", () => {
  resetRateLimits();
  const t = 2_000_000;

  rateLimit("k", 1, 60_000, t);
  assert.equal(rateLimit("k", 1, 60_000, t).ok, false);

  // one millisecond past the window
  assert.equal(rateLimit("k", 1, 60_000, t + 60_001).ok, true);
});

test("rateLimit counts each key separately", () => {
  resetRateLimits();
  const t = 3_000_000;

  rateLimit("u:alice", 1, 60_000, t);
  assert.equal(rateLimit("u:alice", 1, 60_000, t).ok, false);
  // Bob must not inherit Alice's exhausted window.
  assert.equal(rateLimit("u:bob", 1, 60_000, t).ok, true);
});
