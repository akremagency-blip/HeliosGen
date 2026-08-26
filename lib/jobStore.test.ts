import test from "node:test";
import assert from "node:assert/strict";
import { mayReadJob } from "./jobStore.ts";

test("mayReadJob only hands a job back to its owner", () => {
  assert.equal(mayReadJob("user-a", "user-a"), true);

  // The gap this closed: knowing a taskId was enough to read someone's result.
  assert.equal(mayReadJob("user-a", "user-b"), false);
  assert.equal(mayReadJob("user-a", null), false);
  assert.equal(mayReadJob("user-a", ""), false);
});

test("mayReadJob lets pre-existing unowned jobs through", () => {
  // Jobs settled before ownership was recorded have no userId. Refusing them
  // would strand every generation in flight across the deploy that adds this.
  assert.equal(mayReadJob(undefined, "user-a"), true);
  assert.equal(mayReadJob(undefined, null), true);
});
