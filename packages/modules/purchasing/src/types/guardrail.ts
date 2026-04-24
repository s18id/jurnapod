// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Guardrail decision type for period-close override evaluation.
 *
 * Produced by the API adapter layer (needs AuthContext).
 * Passed to package services as a pre-evaluated decision.
 */

// =============================================================================
// Guardrail Decision (produced by API layer)
// =============================================================================

export type GuardrailDecision = {
  allowed: boolean;
  overrideRequired: boolean;
  periodId: number | null;
  blockReason: string | null;
  blockCode: string | null;
};
