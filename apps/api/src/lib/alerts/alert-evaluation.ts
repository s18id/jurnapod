// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// =============================================================================
// ALERT EVALUATION ADAPTER
// =============================================================================
// This is a thin adapter that re-exports from the package runtime.
// The package runtime is the single source of truth for alert evaluation.
// =============================================================================

import { register } from "prom-client";

import {
  AlertManager as PackageAlertManager,
  AlertEvaluationService as PackageAlertEvaluationService,
  getAlertThresholds,
  getAlertCooldownMs,
  getWebhookConfig,
  type AlertEvaluationConfig as PackageAlertEvaluationConfig,
} from "@jurnapod/telemetry/runtime";

// Re-export the config interface
export type {
  AlertEvaluationConfig,
} from "@jurnapod/telemetry/runtime";

// Re-export getAlertThresholds
export { getAlertThresholds };

// =============================================================================
// ALERT MANAGER (re-export from alert-manager adapter)
// =============================================================================

// Re-export AlertManager and alertManager singleton from alert-manager
export { AlertManager, alertManager } from "./alert-manager.js";
import { alertManager as apiAlertManager } from "./alert-manager.js";

// =============================================================================
// ALERT EVALUATION SERVICE ADAPTER
// =============================================================================

/**
 * Alert evaluation service class
 * Runs periodic evaluation of alert rules against metrics
 * 
 * NOTE: This adapter uses the package runtime's AlertEvaluationService
 * but ensures the API's alertManager singleton is used for backwards compatibility.
 */
class AlertEvaluationServiceAdapter extends PackageAlertEvaluationService {
  constructor(config?: Partial<PackageAlertEvaluationConfig>) {
    // Pass the inner package AlertManager (from our adapter's composition)
    super(apiAlertManager.inner, config);
  }
}

// Re-export the adapted class
export { AlertEvaluationServiceAdapter as AlertEvaluationService };

// =============================================================================
// SINGLETON INSTANCE (for backwards compatibility)
// =============================================================================

/**
 * Global singleton instance for alert evaluation
 */
export const alertEvaluationService = new AlertEvaluationServiceAdapter({
  intervalMs: 30000, // 30 seconds
  enabled: process.env.NODE_ENV === "production" || process.env.ALERT_EVALUATION_ENABLED === "true",
});
