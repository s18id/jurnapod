// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Foreground re-auth trigger model for sensitive transitions.
//
// Sensitive operations (fiscal close, void/refund, permission changes) require
// the user to re-authenticate to prove they are still the person holding the
// session. This module provides:
//
//   1. A registry of sensitive action types that require re-auth.
//   2. A tracker for pending re-auth requirements.
//   3. Utilities for callers to check and clear re-auth state.
//
// The actual re-auth UI (password prompt modal) is a Batch C concern.
// This module provides the data model and helpers that the UI will consume.

// ---------------------------------------------------------------------------
// Re-auth context types
// ---------------------------------------------------------------------------

export type ReAuthAction =
  | "fiscal_close"
  | "void_transaction"
  | "refund_transaction"
  | "permission_change"
  | "company_delete"
  | "user_delete"
  | "role_edit";

export interface ReAuthContext {
  /** The action that triggered the re-auth requirement */
  action: ReAuthAction;
  /** Human-readable reason for the re-auth prompt */
  reason: string;
  /** Epoch ms when re-auth was last successfully completed for this action */
  lastVerifiedAt: number | null;
}

// ---------------------------------------------------------------------------
// Re-auth state
// ---------------------------------------------------------------------------

interface ReAuthState {
  /** Whether a re-auth challenge is currently pending */
  pending: boolean;
  /** The context for the pending re-auth challenge */
  context: ReAuthContext | null;
  /** Map of action → last successful re-auth timestamp */
  verifiedActions: Map<ReAuthAction, number>;
}

let _reAuthState: ReAuthState = {
  pending: false,
  context: null,
  verifiedActions: new Map(),
};

// ---------------------------------------------------------------------------
// Sensitive action definitions
// ---------------------------------------------------------------------------

const SENSITIVE_ACTIONS: Map<ReAuthAction, string> = new Map([
  ["fiscal_close", "Fiscal year close requires re-authentication"],
  ["void_transaction", "Voiding a transaction requires re-authentication"],
  ["refund_transaction", "Issuing a refund requires re-authentication"],
  ["permission_change", "Changing permissions requires re-authentication"],
  ["company_delete", "Deleting a company requires re-authentication"],
  ["user_delete", "Deleting a user requires re-authentication"],
  ["role_edit", "Editing roles requires re-authentication"],
]);

// ---------------------------------------------------------------------------
// Re-auth expiry: how long a re-auth remains valid (5 minutes)
// ---------------------------------------------------------------------------

const REAUTH_VALIDITY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the given sensitive action requires foreground re-authentication.
 *
 * Returns true if:
 *   - The action has never been verified, OR
 *   - The last verification was more than REAUTH_VALIDITY_MS ago.
 */
export function isReAuthRequired(action: ReAuthAction): boolean {
  const lastVerified = _reAuthState.verifiedActions.get(action);
  if (lastVerified === undefined) {
    return true;
  }
  return Date.now() - lastVerified > REAUTH_VALIDITY_MS;
}

/**
 * Request foreground re-authentication for a sensitive action.
 *
 * Sets the pending state and returns the ReAuthContext that the UI MUST
 * present to the user. The caller MUST call markReAuthenticated() after the
 * user successfully re-authenticates.
 *
 * If a re-auth is already pending, returns the existing context.
 */
export function requestReAuth(action: ReAuthAction): ReAuthContext {
  if (_reAuthState.pending && _reAuthState.context) {
    return _reAuthState.context;
  }

  const context: ReAuthContext = {
    action,
    reason: SENSITIVE_ACTIONS.get(action) ?? `This action requires re-authentication`,
    lastVerifiedAt: _reAuthState.verifiedActions.get(action) ?? null,
  };

  _reAuthState = {
    ..._reAuthState,
    pending: true,
    context,
  };

  return context;
}

/**
 * Mark the current re-auth challenge as successfully completed.
 *
 * Call this after the user successfully re-authenticates (password verified).
 * Clears the pending flag and records the verification timestamp.
 */
export function markReAuthenticated(success: boolean): void {
  if (success && _reAuthState.context) {
    const { action } = _reAuthState.context;
    _reAuthState.verifiedActions.set(action, Date.now());
  }
  _reAuthState = {
    ..._reAuthState,
    pending: false,
    context: null,
  };
}

/**
 * Cancel a pending re-auth challenge (e.g., user cancelled the modal).
 */
export function cancelReAuth(): void {
  _reAuthState = {
    ..._reAuthState,
    pending: false,
    context: null,
  };
}

/**
 * Get the currently pending re-auth context, if any.
 */
export function getPendingReAuth(): ReAuthContext | null {
  return _reAuthState.pending ? _reAuthState.context : null;
}

/**
 * Clear all re-auth state (useful on sign-out).
 */
export function resetReAuthState(): void {
  _reAuthState = {
    pending: false,
    context: null,
    verifiedActions: new Map(),
  };
}
