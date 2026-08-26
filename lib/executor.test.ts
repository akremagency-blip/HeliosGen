import test from "node:test";
import assert from "node:assert/strict";
import type { Edge } from "@xyflow/react";
import { topoSort, buildPipelineWaves } from "./executor.ts";

// Derived from the function itself so the test needs no import from ./store,
// which would drag zustand in and break node:test's type stripping.
type GraphNode = Parameters<typeof topoSort>[0][number];

const n = (id: string, type = "generateNode") =>
  ({ id, type, position: { x: 0, y: 0 }, data: {} }) as unknown as GraphNode;
const e = (source: string, target: string) =>
  ({ id: `${source}->${target}`, source, target }) as Edge;

test("topoSort orders by dependency", () => {
  const order = topoSort([n("a"), n("b"), n("c")], [e("a", "b"), e("b", "c")]);
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("topoSort survives an edge whose node is gone", () => {
  // Used to throw "Cannot read properties of undefined (reading 'push')",
  // which took down the canvas for any workflow carrying a stale edge.
  const nodes = [n("a"), n("b")];
  assert.doesNotThrow(() => topoSort(nodes, [e("a", "ghost"), e("ghost", "b")]));
  assert.deepEqual(topoSort(nodes, [e("a", "ghost"), e("ghost", "b")]).sort(), ["a", "b"]);
});

test("buildPipelineWaves groups independent nodes", () => {
  assert.deepEqual(buildPipelineWaves([n("a"), n("b"), n("c")], [e("a", "c"), e("b", "c")]),
    { waves: [["a", "b"], ["c"]], cyclic: [] });
});

test("buildPipelineWaves reports cyclic nodes instead of dropping them", () => {
  // a<->b is unsatisfiable. The guard must return rather than spin forever, and
  // the caller needs to know so it can tell the user something was skipped.
  assert.deepEqual(buildPipelineWaves([n("a"), n("b")], [e("a", "b"), e("b", "a")]),
    { waves: [], cyclic: ["a", "b"] });

  // A cycle must not take the schedulable nodes down with it.
  const mixed = buildPipelineWaves([n("a"), n("b"), n("c")], [e("b", "c"), e("c", "b")]);
  assert.deepEqual(mixed.waves, [["a"]]);
  assert.deepEqual(mixed.cyclic.sort(), ["b", "c"]);
});
