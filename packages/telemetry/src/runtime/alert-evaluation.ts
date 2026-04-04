// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Evaluation Service Runtime
 * 
 * Periodically evaluates alert conditions against metrics
 * and dispatches alerts when thresholds are breached.
 */

import type { AlertManager, AlertEvaluationResult, AlertThreshold, AlertType } from "./alert-manager.js";
import { getAlertThresholds } from "./alert-rules.js";

/**
 * Alert evaluation service configuration
 */
export interface AlertEvaluationConfig {
  /** Evaluation interval in milliseconds (default: 30 seconds) */
  intervalMs: number;
  /** Whether to enable evaluation (default: true in production) */
  enabled: boolean;
}

/**
 * Default configuration for alert evaluation
 */
const DEFAULT_CONFIG: AlertEvaluationConfig = {
  intervalMs: 30000, // 30 seconds
  enabled: process.env.NODE_ENV === "production" || process.env.ALERT_EVALUATION_ENABLED === "true",
};

/**
 * Alert evaluation service class
 * Runs periodic evaluation of alert rules against metrics
 */
export class AlertEvaluationService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly config: AlertEvaluationConfig;
  private evaluationCount: number = 0;
  private lastEvaluationTime: number = 0;
  private lastEvaluationResults: AlertEvaluationResult[] = [];
  private readonly alertManager: AlertManager;

  constructor(alertManager: AlertManager, config: Partial<AlertEvaluationConfig> = {}) {
    this.alertManager = alertManager;
    this.config = {
      intervalMs: config.intervalMs ?? DEFAULT_CONFIG.intervalMs,
      enabled: config.enabled ?? DEFAULT_CONFIG.enabled,
    };
  }

  /**
   * Start the alert evaluation service
   */
  start(): void {
    if (this.intervalId !== null) {
      console.warn("[alert-eval] Service already started");
      return;
    }

    if (!this.config.enabled) {
      console.info("[alert-eval] Alert evaluation disabled (enable via ALERT_EVALUATION_ENABLED=true in production)");
      return;
    }

    console.info(`[alert-eval] Starting alert evaluation service (interval: ${this.config.intervalMs}ms)`);

    // Run initial evaluation
    this.runEvaluation().catch((err) => {
      console.error("[alert-eval] Initial evaluation failed:", err);
    });

    // Schedule periodic evaluation
    this.intervalId = setInterval(() => {
      this.runEvaluation().catch((err) => {
        console.error("[alert-eval] Scheduled evaluation failed:", err);
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop the alert evaluation service
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info("[alert-eval] Alert evaluation service stopped");
    }
  }

  /**
   * Run a single evaluation cycle
   */
  async runEvaluation(): Promise<void> {
    this.evaluationCount++;
    this.lastEvaluationTime = Date.now();

    try {
      const results = await this.alertManager.evaluateAllAlerts();
      this.lastEvaluationResults = results;

      await this.processFiringAlerts(results);

      console.debug(`[alert-eval] Evaluation #${this.evaluationCount} completed`, {
        total: results.length,
        firing: results.filter((r) => r.firing).length,
      });
    } catch (error) {
      console.error("[alert-eval] Evaluation failed:", error);
    }
  }

  /**
   * Process firing alerts - dispatch to webhook if needed
   */
  private async processFiringAlerts(results: AlertEvaluationResult[]): Promise<void> {
    for (const result of results) {
      if (!result.firing) {
        continue;
      }

      if (!this.alertManager.shouldFire(result.type)) {
        console.debug(`[alert-eval] Alert ${result.type} is in cooldown, skipping`);
        continue;
      }

      const message = this.createAlertMessage(result);
      const event = this.alertManager.createAlertEvent(result, message);

      const dispatched = await this.alertManager.dispatchAlert(event);

      if (dispatched) {
        this.alertManager.markFired(result.type);
        console.info(`[alert-eval] Alert dispatched: ${result.type}`, {
          value: result.value,
          threshold: result.threshold,
        });
      }
    }
  }

  /**
   * Create a human-readable alert message based on threshold type
   */
  private createAlertMessage(result: AlertEvaluationResult): string {
    const threshold = getAlertThresholds().find((t) => t.type === result.type);
    const description = threshold?.description ?? `Alert ${result.type}`;

    switch (result.thresholdType) {
      case "greater_than":
        return `${description}: current value ${result.value} exceeds threshold ${result.threshold}`;
      case "less_than":
        return `${description}: current value ${result.value} is below threshold ${result.threshold}`;
      case "rate_percent":
        return `${description}: rate ${result.value.toFixed(2)}% exceeds threshold ${result.threshold}%`;
      case "rate_minute":
        return `${description}: rate ${result.value.toFixed(2)}/min is below minimum threshold ${result.threshold}/min`;
      default:
        return `${description}: value ${result.value} (threshold: ${result.threshold})`;
    }
  }

  /**
   * Get the number of evaluations performed
   */
  getEvaluationCount(): number {
    return this.evaluationCount;
  }

  /**
   * Get the timestamp of the last evaluation
   */
  getLastEvaluationTime(): number {
    return this.lastEvaluationTime;
  }

  /**
   * Get results from the last evaluation
   */
  getLastEvaluationResults(): AlertEvaluationResult[] {
    return this.lastEvaluationResults;
  }

  /**
   * Check if the service is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
