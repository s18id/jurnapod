// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Runtime Index
 * 
 * Central exports for all runtime components that were moved
 * from apps/api to packages/telemetry.
 * 
 * These components can now be used by the API as thin adapters
 * or by other packages that need telemetry runtime logic.
 * 
 * NOTE: Types that conflict with alert-config.ts (AlertSeverity, ThresholdType,
 * WebhookConfig) are NOT re-exported here. Import them directly from the
 * specific module if needed, or use the types from alert-config.ts.
 */

// Export runtime classes/functions (no type conflicts)
export {
  AlertManager,
  type AlertEvent,
  type AlertEvaluationResult,
} from "./alert-manager.js";

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
} from "./alert-rules.js";

export {
  AlertEvaluationService,
  type AlertEvaluationConfig,
} from "./alert-evaluation.js";

export {
  getOutboxMetricsSnapshot,
  getSyncHealthMetricsSnapshot,
  getJournalHealthMetricsSnapshot,
  type OutboxMetricsSnapshot,
  type SyncHealthMetricsSnapshot,
  type JournalHealthMetricsSnapshot,
} from "./dashboard-snapshot.js";
