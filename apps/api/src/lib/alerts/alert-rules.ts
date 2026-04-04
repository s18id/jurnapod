// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// =============================================================================
// ALERT RULES ADAPTER
// =============================================================================
// This is a thin adapter that re-exports from the package runtime.
// The package runtime is the single source of truth for alert rules.
// =============================================================================

// Re-export all types and functions from the package runtime
export {
  getAlertThresholds,
  getAlertThresholdByType,
  getAlertWebhookUrl,
  getAlertCooldownMs,
  getWebhookConfig,
  resetAlertConfig,
  type AlertSeverity,
  type ThresholdType,
  type AlertType,
  type AlertThreshold,
  type WebhookConfig,
} from "@jurnapod/telemetry/runtime";

// Alias for backwards compatibility with existing API imports
export { getAlertThresholds as loadAlertThresholds } from "@jurnapod/telemetry/runtime";
