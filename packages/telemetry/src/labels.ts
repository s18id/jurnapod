// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Telemetry Labels - Cardinality-Safe Label Definitions
 * 
 * Defines which labels are safe to use in metrics and traces
 * and validates against high-cardinality/PII leakage.
 */

import { z } from "zod";

/**
 * Low-cardinality labels safe for metrics
 * All labels here are validated against the FORBIDDEN list
 */
export const TELEMETRY_LABELS = {
  // Scope identifiers (cardinality-safe)
  company_id: {
    description: "Company identifier",
    cardinality: "low",
    pii: false,
    pattern: /^\d+$/,
  },
  outlet_id: {
    description: "Outlet identifier",
    cardinality: "low",
    pii: false,
    pattern: /^\d+$/,
  },
  // Flow identification
  flow_name: {
    description: "Critical flow name",
    cardinality: "fixed",
    pii: false,
    allowed: [
      "payment_capture",
      "offline_local_commit",
      "sync_replay_idempotency",
      "pos_to_gl_posting",
      "trial_balance",
      "general_ledger",
    ],
  },
  // Status classification
  status: {
    description: "Request status",
    cardinality: "fixed",
    pii: false,
    allowed: ["success", "error", "timeout"],
  },
  // Error classification
  error_class: {
    description: "Error class for error categorization",
    cardinality: "low",
    pii: false,
    allowed: [
      "timeout",
      "validation",
      "duplicate",
      "not_found",
      "unauthorized",
      "internal",
      "network",
    ],
  },
} as const;

export type TelemetryLabelName = keyof typeof TELEMETRY_LABELS;

/**
 * Labels that are FORBIDDEN in telemetry due to high cardinality or PII
 */
export const FORBIDDEN_LABELS = [
  "user_id",
  "transaction_id",
  "item_id",
  "customer_id",
  "email",
  "name",
  "card_number",
  "phone",
  "address",
  "ssn",
  "ip_address",
] as const;

export type ForbiddenLabelName = (typeof FORBIDDEN_LABELS)[number];

/**
 * Label validation result
 */
export interface LabelValidationResult {
  valid: boolean;
  label: string;
  reason?: string;
}

/**
 * Validate a label name is allowed in telemetry
 */
export function validateLabelName(label: string): LabelValidationResult {
  // Check if it's in the forbidden list
  if (FORBIDDEN_LABELS.includes(label as ForbiddenLabelName)) {
    return {
      valid: false,
      label,
      reason: `Label '${label}' is forbidden due to high cardinality or PII risk`,
    };
  }

  // Check if it's a known safe label
  if (!(label in TELEMETRY_LABELS)) {
    return {
      valid: false,
      label,
      reason: `Label '${label}' is not in the allowed telemetry labels list`,
    };
  }

  return { valid: true, label };
}

/**
 * Validate a label value contains no PII
 */
export function validateLabelValue(label: string, value: string): LabelValidationResult {
  // Check for PII patterns FIRST (before general numeric check)
  // because some PII like credit cards and phones are purely numeric

  // Check for credit card pattern (13-19 digits with optional separators)
  if (/^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/.test(value) ||
      /^\d{13,19}$/.test(value)) {
    return {
      valid: false,
      label,
      reason: "Label value appears to be a credit card number (PII)",
    };
  }

  // Check for phone pattern (7-15 digits with optional formatting)
  if (/^\+?[\d\s-]{10,}$/.test(value)) {
    return {
      valid: false,
      label,
      reason: "Label value appears to be a phone number (PII)",
    };
  }

  // Check for email pattern
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
    return {
      valid: false,
      label,
      reason: "Label value appears to be an email address (PII)",
    };
  }

  // Short numeric IDs are safe (likely internal identifiers)
  if (/^\d{1,10}$/.test(value)) {
    return { valid: true, label };
  }

  // Fixed set values are safe
  const labelDef = TELEMETRY_LABELS[label as TelemetryLabelName];
  if (labelDef && "allowed" in labelDef) {
    if ((labelDef.allowed as readonly string[]).includes(value)) {
      return { valid: true, label };
    }
  }

  return { valid: true, label };
}

/**
 * Validate a complete label set for telemetry
 */
export function validateLabelSet(
  labels: Record<string, string>
): { valid: boolean; errors: LabelValidationResult[] } {
  const errors: LabelValidationResult[] = [];

  for (const [label, value] of Object.entries(labels)) {
    const nameResult = validateLabelName(label);
    if (!nameResult.valid) {
      errors.push(nameResult);
      continue;
    }

    const valueResult = validateLabelValue(label, value);
    if (!valueResult.valid) {
      errors.push(valueResult);
    }
  }

  return { valid: errors.length === 0, errors };
}
