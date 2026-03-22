// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReservationStatus } from "@jurnapod/shared";
import {
  getCheckInTargetStatus,
  getReservationStatusLabel,
  isReservationFinalStatus,
  RESERVATION_STATUS_META,
  RESERVATION_STATUS_OPTIONS,
  RESERVATION_STATUS_TRANSITIONS
} from "./reservation-status";

describe("reservation-status helpers", () => {
  test("preserves canonical transitions", () => {
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.BOOKED, ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"]);
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.CONFIRMED, ["ARRIVED", "CANCELLED", "NO_SHOW"]);
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.ARRIVED, ["SEATED", "CANCELLED", "NO_SHOW"]);
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.SEATED, ["COMPLETED"]);
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.COMPLETED, []);
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.CANCELLED, []);
    assert.deepStrictEqual(RESERVATION_STATUS_TRANSITIONS.NO_SHOW, []);
  });

  test("identifies final statuses", () => {
    assert.strictEqual(isReservationFinalStatus("COMPLETED"), true);
    assert.strictEqual(isReservationFinalStatus("CANCELLED"), true);
    assert.strictEqual(isReservationFinalStatus("NO_SHOW"), true);
    assert.strictEqual(isReservationFinalStatus("BOOKED"), false);
    assert.strictEqual(isReservationFinalStatus("CONFIRMED"), false);
    assert.strictEqual(isReservationFinalStatus("ARRIVED"), false);
    assert.strictEqual(isReservationFinalStatus("SEATED"), false);
  });

  test("maps check-in target statuses", () => {
    assert.strictEqual(getCheckInTargetStatus("BOOKED"), "ARRIVED");
    assert.strictEqual(getCheckInTargetStatus("CONFIRMED"), "ARRIVED");
    assert.strictEqual(getCheckInTargetStatus("ARRIVED"), "SEATED");
    assert.strictEqual(getCheckInTargetStatus("SEATED"), null);
    assert.strictEqual(getCheckInTargetStatus("COMPLETED"), null);
    assert.strictEqual(getCheckInTargetStatus("CANCELLED"), null);
    assert.strictEqual(getCheckInTargetStatus("NO_SHOW"), null);
  });

  test("exposes labels and options from metadata", () => {
    const statuses: ReservationStatus[] = ["BOOKED", "CONFIRMED", "ARRIVED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"];
    for (const status of statuses) {
      assert.strictEqual(getReservationStatusLabel(status), RESERVATION_STATUS_META[status].label);
    }

    assert.deepStrictEqual(
      RESERVATION_STATUS_OPTIONS,
      statuses.map((status) => ({
        value: status,
        label: RESERVATION_STATUS_META[status].label
      }))
    );
  });
});
