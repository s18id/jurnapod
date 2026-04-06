import assert from "node:assert/strict";
import test from "node:test";
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { closeDbPool } from "./db";
import {
  cleanupSyncModules,
  getPosSyncModule,
  initializeSyncModules,
} from "./sync-modules";

test("initializeSyncModules publishes singleton only after successful init", async () => {
  await initializeSyncModules();
  const module = getPosSyncModule();
  assert.ok(module);

  await cleanupSyncModules();
  assert.throws(
    () => getPosSyncModule(),
    /PosSyncModule not initialized/,
  );
});

test("initializeSyncModules failure does not publish singleton and attempts cleanup", async () => {
  const originalInitialize = syncModuleRegistry.initialize.bind(syncModuleRegistry);
  const originalCleanup = syncModuleRegistry.cleanup.bind(syncModuleRegistry);

  let cleanupCalled = false;

  (syncModuleRegistry as unknown as { initialize: () => Promise<void> }).initialize = async () => {
    throw new Error("forced-init-failure");
  };

  (syncModuleRegistry as unknown as { cleanup: () => Promise<void> }).cleanup = async () => {
    cleanupCalled = true;
    await originalCleanup();
  };

  try {
    await assert.rejects(
      async () => initializeSyncModules(),
      /forced-init-failure/,
    );

    assert.equal(cleanupCalled, true);
    assert.throws(
      () => getPosSyncModule(),
      /PosSyncModule not initialized/,
    );
  } finally {
    (syncModuleRegistry as unknown as { initialize: typeof originalInitialize }).initialize = originalInitialize;
    (syncModuleRegistry as unknown as { cleanup: typeof originalCleanup }).cleanup = originalCleanup;
  }
});

test("cleanupSyncModules resets singleton even when registry cleanup throws", async () => {
  const originalCleanup = syncModuleRegistry.cleanup.bind(syncModuleRegistry);

  await initializeSyncModules();

  (syncModuleRegistry as unknown as { cleanup: () => Promise<void> }).cleanup = async () => {
    throw new Error("forced-cleanup-failure");
  };

  try {
    await cleanupSyncModules();
    assert.throws(
      () => getPosSyncModule(),
      /PosSyncModule not initialized/,
    );
  } finally {
    (syncModuleRegistry as unknown as { cleanup: typeof originalCleanup }).cleanup = originalCleanup;
    await cleanupSyncModules();
  }
});

test.after(async () => {
  await closeDbPool();
});
