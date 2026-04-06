// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  trackActionMenuOpen,
  trackActionSelect,
  trackActionError,
  setTelemetryHandler,
  type TelemetryEvent,
} from "../lib/telemetry";

// Telemetry event types for test assertions
type UserActionName =
  | "edit-user"
  | "manage-roles"
  | "assign-outlets"
  | "change-password"
  | "deactivate"
  | "reactivate";

const USER_ACTION_ORDER: UserActionName[] = [
  "edit-user",
  "manage-roles",
  "assign-outlets",
  "change-password",
  "deactivate",
  "reactivate",
];

// Role-based action visibility logic
interface ActionVisibility {
  canEdit: boolean;
  canManageRoles: boolean;
  canChangePassword: boolean;
  canDeactivate: boolean;
  isSelf: boolean;
  isSuperAdminUser: boolean;
}

function computeActionVisibility(
  currentUserId: number,
  targetUserId: number,
  targetUserGlobalRoles: string[]
): ActionVisibility {
  const isSelf = currentUserId === targetUserId;
  const isSuperAdminUser = targetUserGlobalRoles.includes("SUPER_ADMIN");

  return {
    canEdit: true,
    canManageRoles: !isSelf && !isSuperAdminUser,
    canChangePassword: true,
    canDeactivate: !isSelf && !isSuperAdminUser,
    isSelf,
    isSuperAdminUser,
  };
}

function getActionOrder(): UserActionName[] {
  return [...USER_ACTION_ORDER];
}

// Tests
describe("Users Page Telemetry", () => {
  const capturedEvents: TelemetryEvent[] = [];

  beforeEach(() => {
    capturedEvents.length = 0;
    setTelemetryHandler((event) => {
      capturedEvents.push(event);
    });
  });

  afterEach(() => {
    // Reset to default console logging
    setTelemetryHandler((event) => {
      console.log("[Telemetry]", JSON.stringify(event));
    });
  });

  describe("trackActionMenuOpen", () => {
    it("emits action-menu-open event with correct metadata", () => {
      trackActionMenuOpen("users", "ADMIN");

      assert.strictEqual(capturedEvents.length, 1);
      const event = capturedEvents[0];
      assert.strictEqual(event.event, "action-menu-open");
      assert.strictEqual(event.page, "users");
      assert.strictEqual(event.actorRole, "ADMIN");
      assert.strictEqual(event.outcome, "success");
      assert.ok(event.timestamp > 0);
    });
  });

  describe("trackActionSelect", () => {
    it("emits action-select event on success", () => {
      trackActionSelect("users", "ADMIN", "edit-user", "success");

      assert.strictEqual(capturedEvents.length, 1);
      const event = capturedEvents[0];
      assert.strictEqual(event.event, "action-select");
      assert.strictEqual(event.page, "users");
      assert.strictEqual(event.actorRole, "ADMIN");
      assert.strictEqual(event.actionName, "edit-user");
      assert.strictEqual(event.outcome, "success");
    });

    it("emits action-error event on error with error message", () => {
      trackActionSelect("users", "ADMIN", "edit-user", "error", "Network failure");

      assert.strictEqual(capturedEvents.length, 1);
      const event = capturedEvents[0];
      assert.strictEqual(event.event, "action-error");
      assert.strictEqual(event.outcome, "error");
      assert.strictEqual(event.errorMessage, "Network failure");
    });
  });

  describe("trackActionError", () => {
    it("emits action-error event with correct metadata", () => {
      trackActionError("users", "ADMIN", "edit-user", "Server rejected request");

      assert.strictEqual(capturedEvents.length, 1);
      const event = capturedEvents[0];
      assert.strictEqual(event.event, "action-error");
      assert.strictEqual(event.outcome, "error");
      assert.strictEqual(event.errorMessage, "Server rejected request");
    });
  });
});

describe("Users Page Action Visibility - computeActionVisibility", () => {
  it("disables role actions for self", () => {
    const visibility = computeActionVisibility(1, 1, ["ADMIN"]);

    assert.strictEqual(visibility.isSelf, true);
    assert.strictEqual(visibility.canManageRoles, false);
    assert.strictEqual(visibility.canDeactivate, false);
  });

  it("disables role actions for SUPER_ADMIN target", () => {
    const visibility = computeActionVisibility(1, 2, ["SUPER_ADMIN"]);

    assert.strictEqual(visibility.isSuperAdminUser, true);
    assert.strictEqual(visibility.canManageRoles, false);
    assert.strictEqual(visibility.canDeactivate, false);
  });

  it("allows actions for non-self non-super-admin users", () => {
    const visibility = computeActionVisibility(1, 2, ["ADMIN"]);

    assert.strictEqual(visibility.isSelf, false);
    assert.strictEqual(visibility.isSuperAdminUser, false);
    assert.strictEqual(visibility.canEdit, true);
    assert.strictEqual(visibility.canManageRoles, true);
    assert.strictEqual(visibility.canChangePassword, true);
    assert.strictEqual(visibility.canDeactivate, true);
  });
});

describe("Users Page Action Order - getActionOrder", () => {
  it("returns consistent action order", () => {
    const order = getActionOrder();

    assert.strictEqual(order[0], "edit-user");
    assert.strictEqual(order[1], "manage-roles");
    assert.strictEqual(order[2], "assign-outlets");
    assert.strictEqual(order[3], "change-password");
    assert.strictEqual(order[4], "deactivate");
    assert.strictEqual(order[5], "reactivate");
    assert.strictEqual(order.length, 6);
  });

  it("returns a copy to prevent mutation", () => {
    const order1 = getActionOrder();
    const order2 = getActionOrder();

    order1.push("new-action" as UserActionName);

    assert.strictEqual(order2.length, 6);
    assert.strictEqual(order1.length, 7);
  });
});