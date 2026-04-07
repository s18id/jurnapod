// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// =============================================================================
// ALERT MANAGER ADAPTER
// =============================================================================
// This is a thin adapter that re-exports from the package runtime.
// The package runtime is the single source of truth for alert management.
// =============================================================================

import { register, Counter } from "prom-client";

import {
  AlertManager as PackageAlertManager,
  getAlertThresholds,
  getAlertCooldownMs,
  getWebhookConfig,
  type AlertEvent as PackageAlertEvent,
  type AlertEvaluationResult as PackageAlertEvaluationResult,
} from "@jurnapod/telemetry/runtime";

// Re-export types from package for backwards compatibility
export type {
  AlertEvent,
  AlertEvaluationResult,
} from "@jurnapod/telemetry/runtime";

// Re-export the AlertType and AlertThreshold types from alert-rules
export { type AlertSeverity, type ThresholdType, type AlertType, type AlertThreshold } from "./alert-rules";

// =============================================================================
// ALERT MANAGER WRAPPER
// =============================================================================

/**
 * Alert Manager Adapter
 * 
 * Thin adapter that wraps the package's AlertManager to provide:
 * 1. Backwards compatibility with existing API code
 * 2. Singleton pattern for the global alertManager instance
 * 3. API-specific initialization (using global prom-client register)
 * 
 * All actual logic is delegated to the package runtime.
 */
class AlertManagerAdapter {
  public inner: PackageAlertManager;

  constructor() {
    // Create the package AlertManager with the global prom-client registry and config getters
    this.inner = new PackageAlertManager(
      register,
      getAlertThresholds,
      getAlertCooldownMs,
      getWebhookConfig
    );
    
    // Register alert_evaluation_total counter once in global registry, then
    // hand counter ownership to package runtime (single source of truth).
    const existing = register.getSingleMetric("alert_evaluation_total") as Counter<string> | undefined;
    const counter = existing ?? new Counter({
      name: "alert_evaluation_total",
      help: "Total number of alert evaluation cycles performed",
      registers: [register],
    });
    this.inner.registerEvaluationCounter({ inc: () => counter.inc() });
  }

  /**
   * Evaluate an alert condition
   */
  evaluate(type: Parameters<typeof this.inner.evaluate>[0], value: number): ReturnType<typeof this.inner.evaluate> {
    return this.inner.evaluate(type, value);
  }

  /**
   * Check if alert should fire (respects cooldown)
   */
  shouldFire(type: Parameters<typeof this.inner.shouldFire>[0]): ReturnType<typeof this.inner.shouldFire> {
    return this.inner.shouldFire(type);
  }

  /**
   * Mark alert as fired
   */
  markFired(type: Parameters<typeof this.inner.markFired>[0]): ReturnType<typeof this.inner.markFired> {
    return this.inner.markFired(type);
  }

  /**
   * Get all firing alerts
   */
  getFiringAlerts(): ReturnType<typeof this.inner.getFiringAlerts> {
    return this.inner.getFiringAlerts();
  }

  /**
   * Get alert state
   */
  getAlertState(type: Parameters<typeof this.inner.getAlertState>[0]): ReturnType<typeof this.inner.getAlertState> {
    return this.inner.getAlertState(type);
  }

  /**
   * Create alert event from evaluation result
   */
  createAlertEvent(result: PackageAlertEvaluationResult, message: string, _labels?: Record<string, string>): PackageAlertEvent {
    return this.inner.createAlertEvent(result, message);
  }

  /**
   * Get current metric value from prom-client registry
   */
  async getMetricValue(metricName: string, labels?: Record<string, string>): Promise<number> {
    return this.inner.getMetricValue(metricName, labels);
  }

  async evaluateAllAlerts(): Promise<PackageAlertEvaluationResult[]> {
    return this.inner.evaluateAllAlerts();
  }

  /**
   * Dispatch alert to webhook
   * Delegates to package runtime for all dispatch/formatting logic.
   */
  async dispatchAlert(event: PackageAlertEvent): Promise<boolean> {
    return this.inner.dispatchAlert(event);
  }

  /**
   * Reset all alert states
   */
  reset(): void {
    return this.inner.reset();
  }

  /**
   * Reset the static evaluation cycle state (for testing)
   */
  static resetEvaluationCycleState(): void {
    PackageAlertManager.resetEvaluationCycleState();
  }
}

// Export the class for backwards compatibility
export { AlertManagerAdapter as AlertManager };

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Global singleton instance for backwards compatibility
 */
export const alertManager = new AlertManagerAdapter();
