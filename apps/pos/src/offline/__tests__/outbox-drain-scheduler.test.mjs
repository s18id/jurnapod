import assert from "node:assert/strict";
import { test } from "node:test";

import { createOutboxDrainScheduler } from "../../../dist/offline/outbox-drain-scheduler.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve
  };
}

test("scheduler coalesces concurrent triggers into single flight run", async () => {
  const gate = createDeferred();
  const runs = [];
  let activeRuns = 0;
  let maxActiveRuns = 0;

  const scheduler = createOutboxDrainScheduler({
    drain: async (context) => {
      activeRuns += 1;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      runs.push(context.reasons.slice().sort());
      try {
        await gate.promise;
      } finally {
        activeRuns -= 1;
      }
    }
  });

  try {
    const p1 = scheduler.requestDrain("INTERVAL");
    const p2 = scheduler.requestDrain("ONLINE");
    const p3 = scheduler.requestDrain("MANUAL_PUSH");

    await Promise.resolve();
    assert.equal(scheduler.snapshot().in_flight, true);
    assert.equal(runs.length, 1);

    gate.resolve();
    await Promise.all([p1, p2, p3]);

    assert.equal(maxActiveRuns, 1);
    const flattenedReasons = runs.flat().sort();
    assert.deepEqual(flattenedReasons, ["INTERVAL", "MANUAL_PUSH", "ONLINE"]);
  } finally {
    scheduler.dispose();
  }
});

test("scheduler runs second cycle when new trigger arrives in-flight", async () => {
  const firstGate = createDeferred();
  const runs = [];

  const scheduler = createOutboxDrainScheduler({
    drain: async (context) => {
      runs.push(context.reasons.slice().sort());
      if (runs.length === 1) {
        await firstGate.promise;
      }
    }
  });

  try {
    const firstRequest = scheduler.requestDrain("INTERVAL");
    await Promise.resolve();
    const secondRequest = scheduler.requestDrain("FOCUS");

    firstGate.resolve();
    await Promise.all([firstRequest, secondRequest]);

    assert.equal(runs.length, 2);
    assert.deepEqual(runs[0], ["INTERVAL"]);
    assert.deepEqual(runs[1], ["FOCUS"]);
  } finally {
    scheduler.dispose();
  }
});
