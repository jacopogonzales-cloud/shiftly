import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDelta } from "./format";

test("deltas under an hour read in minutes, longer ones in hours", () => {
  assert.equal(formatDelta(0), "—");
  assert.equal(formatDelta(30), "+30 min");
  assert.equal(formatDelta(-15), "−15 min");
  assert.equal(formatDelta(60), "+1h");
  assert.equal(formatDelta(-75), "−1h 15m");
});
