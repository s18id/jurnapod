// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for outbox guard logic.
// Run with: npm run test -w @jurnapod/backoffice

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canDeleteFailedOutboxItem, canShowSyncQueueActions, type OutboxItem } from "./outbox-guards";

const makeItem = (overrides: Partial<OutboxItem> = {}): OutboxItem => ({
  id: "test-id",
  type: "journal",
  payload: {},
  timestamp: new Date(),
  status: "pending",
  retryCount: 0,
  userId: 1,
  ...overrides
});

describe("canDeleteFailedOutboxItem", () => {
  test("returns true when item exists, belongs to user, and status is failed", () => {
    const item = makeItem({ userId: 42, status: "failed" });
    const result = canDeleteFailedOutboxItem(item, 42);
    assert.equal(result, true);
  });

  test("returns false when item is undefined", () => {
    const result = canDeleteFailedOutboxItem(undefined, 1);
    assert.equal(result, false);
  });

  test("returns false when item.userId does not match actor userId", () => {
    const item = makeItem({ userId: 1, status: "failed" });
    const result = canDeleteFailedOutboxItem(item, 999);
    assert.equal(result, false);
  });

  test("returns false when status is pending", () => {
    const item = makeItem({ userId: 1, status: "pending" });
    const result = canDeleteFailedOutboxItem(item, 1);
    assert.equal(result, false);
  });

  test("returns false when status is syncing", () => {
    const item = makeItem({ userId: 1, status: "syncing" });
    const result = canDeleteFailedOutboxItem(item, 1);
    assert.equal(result, false);
  });
});

describe("canShowSyncQueueActions", () => {
  test("returns true for failed status", () => {
    assert.equal(canShowSyncQueueActions("failed"), true);
  });

  test("returns false for pending status", () => {
    assert.equal(canShowSyncQueueActions("pending"), false);
  });

  test("returns false for syncing status", () => {
    assert.equal(canShowSyncQueueActions("syncing"), false);
  });

  test("returns false for invalid status (defensive)", () => {
    assert.equal(canShowSyncQueueActions("invalid" as OutboxItem["status"]), false);
  });
});
