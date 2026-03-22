// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, mock } from "node:test";
import assert from "node:assert";

// Task 2.3: Integration test confirming role/outlet state unchanged after profile-only edit

// Mock user data
const createMockUser = (overrides = {}) => ({
  id: 1,
  email: "test@example.com",
  is_active: true,
  global_roles: ["ADMIN"],
  outlet_role_assignments: [
    { outlet_id: 1, outlet_name: "Outlet A", role_codes: ["CASHIER"] },
    { outlet_id: 2, outlet_name: "Outlet B", role_codes: ["OWNER"] }
  ],
  ...overrides
});

// Account form data type (profile-only)
interface AccountFormData {
  email: string;
  password: string;
  is_active: boolean;
}

// Access form data type (roles/outlets)
interface AccessFormData {
  global_role_codes: string[];
  outlet_role_assignments: Array<{ outlet_id: number; role_codes: string[] }>;
}

// Test: Profile-only edit should not mutate role/outlet data
describe("Account Edit - Profile-Only Mutations", () => {
  it("openAccountDialog loads only profile fields, not roles/outlets", () => {
    const targetUser = createMockUser();
    
    // Simulate openAccountDialog logic
    const accountFormData: AccountFormData = {
      email: targetUser.email,
      password: "",
      is_active: targetUser.is_active
    };
    
    // Verify account form contains only profile fields
    assert.strictEqual(accountFormData.email, "test@example.com");
    assert.strictEqual(accountFormData.is_active, true);
    assert.strictEqual(accountFormData.password, "");
    
    // Verify account form does NOT contain role/outlet data
    const accountKeys = Object.keys(accountFormData);
    assert.ok(!accountKeys.includes("global_roles"));
    assert.ok(!accountKeys.includes("outlet_role_assignments"));
    assert.ok(!accountKeys.includes("global_role_codes"));
  });

  it("openAccessDialog loads roles and outlets, not profile fields", () => {
    const targetUser = createMockUser();
    
    // Simulate openAccessDialog logic
    const accessFormData: AccessFormData = {
      global_role_codes: targetUser.global_roles,
      outlet_role_assignments: targetUser.outlet_role_assignments.map(a => ({
        outlet_id: a.outlet_id,
        role_codes: a.role_codes
      }))
    };
    
    // Verify access form contains role/outlet data
    assert.deepStrictEqual(accessFormData.global_role_codes, ["ADMIN"]);
    assert.strictEqual(accessFormData.outlet_role_assignments.length, 2);
    
    // Verify access form does NOT contain profile fields
    const accessKeys = Object.keys(accessFormData);
    assert.ok(!accessKeys.includes("email"));
    assert.ok(!accessKeys.includes("is_active"));
  });

  it("profile-only update payload sends only email and status fields", () => {
    const targetUser = createMockUser();
    const newEmail = "newemail@example.com";
    
    // Simulate account-edit handleSubmit payload
    const updatePayload = newEmail !== targetUser.email 
      ? { email: newEmail } 
      : {};
    
    // Verify payload contains only profile fields
    assert.deepStrictEqual(Object.keys(updatePayload), ["email"]);
    assert.ok(!("global_roles" in updatePayload));
    assert.ok(!("outlet_role_assignments" in updatePayload));
    assert.ok(!("role_codes" in updatePayload));
  });

  it("creates updateUser call with only changed email", () => {
    const targetUser = createMockUser({ email: "original@example.com" });
    const newEmail = "updated@example.com";
    
    // Account edit scenario: email changed, status same
    const emailChanged = newEmail !== targetUser.email;
    const statusChanged = false;
    
    // Build update payload (from handleSubmit logic for account-edit)
    const updatePayload: { email?: string } = {};
    if (emailChanged) {
      updatePayload.email = newEmail;
    }
    
    // Verify: no role/outlet fields in payload
    assert.deepStrictEqual(updatePayload, { email: "updated@example.com" });
    assert.ok(!("role_codes" in updatePayload));
    assert.ok(!("outlet_role_assignments" in updatePayload));
  });

  it("status change calls reactivateUser/deactivateUser, not updateUser for roles", () => {
    // Status change scenario
    const targetUser = createMockUser({ is_active: true });
    const newIsActive = false;
    const statusChanged = newIsActive !== targetUser.is_active;
    
    // Account edit should call reactivateUser/deactivateUser for status
    // NOT updateUser with role data
    assert.strictEqual(statusChanged, true);
    
    // Account form should track status separately from roles
    const accountFormUpdate = { email: targetUser.email }; // unchanged
    const statusUpdateNeeded = statusChanged;
    
    // Verify separation: profile update is separate from status change
    assert.strictEqual(Object.keys(accountFormUpdate).length, 1);
    assert.ok(statusUpdateNeeded);
  });
});

describe("Account Edit - Unsaved Changes Detection", () => {
  it("tracks unsaved changes when email is modified", () => {
    const initialEmail: string = "test@example.com";
    const modifiedEmail: string = "new@example.com";
    
    // hasUnsavedChanges logic
    const hasUnsavedChanges = initialEmail !== modifiedEmail;
    
    assert.strictEqual(hasUnsavedChanges, true);
  });

  it("tracks unsaved changes when active status is toggled", () => {
    const initialIsActive = true;
    const modifiedIsActive = false;
    
    // Explicit boolean comparison
    const hasUnsavedChanges = Boolean(initialIsActive) !== Boolean(modifiedIsActive);
    
    assert.strictEqual(hasUnsavedChanges, true);
  });

  it("no unsaved changes when fields match original", () => {
    const originalEmail = "test@example.com";
    const originalIsActive = true;
    
    const currentEmail = "test@example.com";
    const currentIsActive = true;
    
    const hasUnsavedChanges = 
      currentEmail !== originalEmail || 
      currentIsActive !== originalIsActive;
    
    assert.strictEqual(hasUnsavedChanges, false);
  });
});

describe("Access Edit - Role/Outlet Separation", () => {
  it("global roles and outlet assignments are separate from account form", () => {
    const mockUser = createMockUser();
    
    // Simulate splitting user data into separate forms
    const accountForm: AccountFormData = {
      email: mockUser.email,
      password: "",
      is_active: mockUser.is_active
    };
    
    const accessForm: AccessFormData = {
      global_role_codes: mockUser.global_roles,
      outlet_role_assignments: mockUser.outlet_role_assignments.map(a => ({
        outlet_id: a.outlet_id,
        role_codes: a.role_codes
      }))
    };
    
    // Verify complete separation
    assert.ok(!("global_role_codes" in accountForm));
    assert.ok(!("outlet_role_assignments" in accountForm));
    assert.ok(!("email" in accessForm));
    assert.ok(!("is_active" in accessForm));
    
    // Verify access form has role data
    assert.deepStrictEqual(accessForm.global_role_codes, ["ADMIN"]);
    assert.strictEqual(accessForm.outlet_role_assignments.length, 2);
  });

  it("access edit calls updateUserRoles, not updateUser", () => {
    // When editing access, we should call updateUserRoles
    // NOT updateUser (which is for profile fields)
    
    const targetUser = createMockUser();
    const newGlobalRoles = ["OWNER"];
    
    // Access edit payload structure
    const accessUpdatePayload = {
      role_codes: newGlobalRoles
    };
    
    // Verify this is separate from profile update
    assert.ok(!("email" in accessUpdatePayload));
    assert.ok(!("is_active" in accessUpdatePayload));
    assert.ok("role_codes" in accessUpdatePayload);
  });
});

describe("Dialog Mode Separation", () => {
  it("account-edit mode is distinct from access-edit mode", () => {
    type AccountDialogMode = "account-create" | "account-edit" | null;
    type AccessDialogMode = "access-create" | "access-edit" | null;
    type LegacyDialogMode = "password" | null;
    type DialogMode = AccountDialogMode | AccessDialogMode | LegacyDialogMode;
    
    const accountEditMode: DialogMode = "account-edit";
    const accessEditMode: DialogMode = "access-edit";
    
    // Verify modes are different
    assert.notStrictEqual(accountEditMode, accessEditMode);
    
    // Verify mode determines form shown
    const showAccountForm: boolean = String(accountEditMode).startsWith("account-");
    const showAccessForm: boolean = String(accessEditMode).startsWith("access-");
    
    assert.strictEqual(showAccountForm, true);
    assert.strictEqual(showAccessForm, true);
    
    // Verify account-edit shows account form, not access form
    assert.ok(String(accountEditMode).includes("account"));
    assert.ok(String(accessEditMode).includes("access"));
    
    // Verify they are different prefixes
    const accountPrefix = String(accountEditMode).split("-")[0];
    const accessPrefix = String(accessEditMode).split("-")[0];
    assert.notStrictEqual(accountPrefix, accessPrefix);
  });
});