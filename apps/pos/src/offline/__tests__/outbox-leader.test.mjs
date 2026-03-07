// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";

import { createOutboxDrainLeader, outboxDrainStorageKey } from "../../../dist/offline/outbox-leader.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createHookedMemoryStorage(onFirstGet) {
  const storage = createMemoryStorage();
  let fired = false;

  return {
    getItem(key) {
      if (!fired) {
        fired = true;
        onFirstGet();
      }

      return storage.getItem(key);
    },
    setItem(key, value) {
      storage.setItem(key, value);
    },
    removeItem(key) {
      storage.removeItem(key);
    }
  };
}

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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test("localStorage fallback elects one active outbox drainer", async () => {
  const lockName = `jp-pos-outbox-leader-${crypto.randomUUID()}`;
  const storage = createMemoryStorage();
  const gate = createDeferred();
  let nowMs = 10_000;

  const firstLeader = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "tab-a",
    lease_ms: 5_000,
    now: () => nowMs,
    navigator: {},
    storage
  });

  const secondLeader = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "tab-b",
    lease_ms: 5_000,
    now: () => nowMs,
    navigator: {},
    storage
  });

  const firstRun = firstLeader.runIfLeader(async () => {
    await gate.promise;
    return "A";
  });

  await Promise.resolve();

  const blockedRun = await secondLeader.runIfLeader(async () => "B");
  assert.equal(blockedRun.acquired, false);
  assert.equal(blockedRun.mechanism, "LOCAL_STORAGE");
  assert.equal(blockedRun.value, null);

  gate.resolve();

  const firstResult = await firstRun;
  assert.equal(firstResult.acquired, true);
  assert.equal(firstResult.mechanism, "LOCAL_STORAGE");
  assert.equal(firstResult.value, "A");

  const secondAfterRelease = await secondLeader.runIfLeader(async () => "B");
  assert.equal(secondAfterRelease.acquired, true);
  assert.equal(secondAfterRelease.value, "B");
});

test("expired lease is reclaimable in localStorage fallback", async () => {
  const lockName = `jp-pos-outbox-leader-${crypto.randomUUID()}`;
  const storage = createMemoryStorage();
  let nowMs = 10_000;

  storage.setItem(
    outboxDrainStorageKey(lockName),
    JSON.stringify({
      owner_id: "crashed-tab",
      expires_at: nowMs + 2_000
    })
  );

  const contender = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "replacement-tab",
    lease_ms: 5_000,
    now: () => nowMs,
    navigator: {},
    storage
  });

  const blockedBeforeExpiry = await contender.runIfLeader(async () => "should-not-run");
  assert.equal(blockedBeforeExpiry.acquired, false);

  nowMs += 3_000;

  const acquiredAfterExpiry = await contender.runIfLeader(async () => "runs");
  assert.equal(acquiredAfterExpiry.acquired, true);
  assert.equal(acquiredAfterExpiry.mechanism, "LOCAL_STORAGE");
  assert.equal(acquiredAfterExpiry.value, "runs");
});

test("localStorage fallback settles near-simultaneous contenders to one winner", async () => {
  const lockName = `jp-pos-outbox-leader-${crypto.randomUUID()}`;
  let contenderPromise = null;
  let firstOperations = 0;
  let secondOperations = 0;
  let secondLeader;

  const storage = createHookedMemoryStorage(() => {
    contenderPromise = secondLeader.runIfLeader(async () => {
      secondOperations += 1;
      return "B";
    });
  });

  const firstLeader = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "tab-a",
    lease_ms: 5_000,
    navigator: {},
    storage
  });

  secondLeader = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "tab-b",
    lease_ms: 5_000,
    navigator: {},
    storage
  });

  const firstPromise = firstLeader.runIfLeader(async () => {
    firstOperations += 1;
    return "A";
  });

  assert.ok(contenderPromise);

  const [firstResult, secondResult] = await Promise.all([firstPromise, contenderPromise]);
  const winners = [firstResult, secondResult].filter((result) => result.acquired === true);

  assert.equal(winners.length, 1);
  assert.equal(firstOperations + secondOperations, 1);
});

test("localStorage fallback maintains single winner across deterministic contention rounds", async () => {
  for (let round = 0; round < 25; round += 1) {
    const lockName = `jp-pos-outbox-leader-${crypto.randomUUID()}`;
    let contenderPromise = null;
    let firstOperations = 0;
    let secondOperations = 0;
    let secondLeader;

    const storage = createHookedMemoryStorage(() => {
      contenderPromise = secondLeader.runIfLeader(async () => {
        secondOperations += 1;
        return "B";
      });
    });

    const firstLeader = createOutboxDrainLeader({
      lock_name: lockName,
      owner_id: `tab-a-${round}`,
      lease_ms: 5_000,
      navigator: {},
      storage
    });

    secondLeader = createOutboxDrainLeader({
      lock_name: lockName,
      owner_id: `tab-b-${round}`,
      lease_ms: 5_000,
      navigator: {},
      storage
    });

    const firstPromise = firstLeader.runIfLeader(async () => {
      firstOperations += 1;
      return "A";
    });

    assert.ok(contenderPromise);

    const [firstResult, secondResult] = await Promise.all([firstPromise, contenderPromise]);
    const winners = [firstResult, secondResult].filter((result) => result.acquired === true);

    assert.equal(winners.length, 1);
    assert.equal(firstOperations + secondOperations, 1);
  }
});

test("localStorage lease renewal keeps long-running leader exclusive", async () => {
  const lockName = `jp-pos-outbox-leader-${crypto.randomUUID()}`;
  const storage = createMemoryStorage();
  const gate = createDeferred();
  let nowMs = 10_000;

  const firstLeader = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "tab-a-long",
    lease_ms: 80,
    now: () => nowMs,
    navigator: {},
    storage
  });

  const secondLeader = createOutboxDrainLeader({
    lock_name: lockName,
    owner_id: "tab-b-long",
    lease_ms: 80,
    now: () => nowMs,
    navigator: {},
    storage
  });

  const logicalClockId = setInterval(() => {
    nowMs += 25;
  }, 10);

  try {
    const firstRun = firstLeader.runIfLeader(async () => {
      await gate.promise;
      return "A";
    });

    await delay(160);

    const blockedDuringLongRun = await secondLeader.runIfLeader(async () => "B");
    assert.equal(blockedDuringLongRun.acquired, false);
    assert.equal(blockedDuringLongRun.mechanism, "LOCAL_STORAGE");
    assert.equal(blockedDuringLongRun.value, null);

    gate.resolve();

    const firstResult = await firstRun;
    assert.equal(firstResult.acquired, true);
    assert.equal(firstResult.mechanism, "LOCAL_STORAGE");
    assert.equal(firstResult.value, "A");

    const secondAfterRelease = await secondLeader.runIfLeader(async () => "B");
    assert.equal(secondAfterRelease.acquired, true);
    assert.equal(secondAfterRelease.value, "B");
  } finally {
    clearInterval(logicalClockId);
  }
});
