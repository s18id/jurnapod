// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Manager Runtime
 * 
 * Evaluates alert conditions and dispatches webhook notifications.
 * Maintains alert state to prevent duplicate alerts.
 * 
 * NOTE: This is the package-ported version. The API layer passes the prom-client
 * registry for metric access.
 */

import type { Registry } from "prom-client";

// Import types from alert-rules (single source of truth)
import type {
  AlertSeverity,
  ThresholdType,
  AlertType,
  AlertThreshold,
  WebhookConfig,
} from "./alert-rules.js";

// Re-export types for external consumers
export type {
  AlertSeverity,
  ThresholdType,
  AlertType,
  AlertThreshold,
  WebhookConfig,
};

/**
 * Alert event structure
 */
export interface AlertEvent {
  type: AlertType;
  severity: AlertSeverity;
  name: string;
  metric: string;
  message: string;
  value: number;
  threshold: number;
  windowSeconds: number;
  timestamp: string;
  labels?: Record<string, string>;
}

/**
 * Alert state for tracking firing alerts
 */
interface AlertState {
  firing: boolean;
  lastValue: number;
  lastChecked: number;
  lastFired?: number;
  // For rate calculation
  previousValue?: number;
  previousTime?: number;
}

/**
 * Global evaluation cycle tracking for heartbeat semantics.
 * Tracks the last time an evaluation CYCLE (not individual alert) occurred.
 * This is used to detect when the entire alert evaluation loop stops.
 */
interface EvaluationCycleState {
  lastCycleTime: number;
}

/**
 * Alert evaluation result
 */
export interface AlertEvaluationResult {
  type: AlertType;
  firing: boolean;
  value: number;
  threshold: number;
  thresholdType: ThresholdType;
  windowSeconds: number;
  metric: string;
  labels?: Record<string, string>;
}

/**
 * Retry options for withRetry
 */
interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries - 1) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      onRetry?.(attempt + 1, lastError, delay);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Alert manager class
 */
export class AlertManager {
  private alertStates: Map<AlertType, AlertState> = new Map();
  private readonly cooldownMs: number;
  
  // Counter for tracking alert evaluation cycles (not individual evaluations)
  // Using static to ensure only one metric instance across all AlertManager instances
  private static evaluationCounter: { inc: () => void } | null = null;
  private static evaluationCycleState: EvaluationCycleState = {
    lastCycleTime: Date.now(),
  };
  // Guard to emit warning only once when counter not registered
  private static counterNotRegisteredWarned: boolean = false;

  private readonly registry: Registry;
  private readonly getThresholds: () => AlertThreshold[];
  private readonly getCooldownMs: () => number;
  private readonly getWebhookConfig: () => WebhookConfig | null;

  constructor(
    registry: Registry,
    getThresholds: () => AlertThreshold[],
    getCooldownMs: () => number,
    getWebhookConfig: () => WebhookConfig | null
  ) {
    this.registry = registry;
    this.getThresholds = getThresholds;
    this.getCooldownMs = getCooldownMs;
    this.getWebhookConfig = getWebhookConfig;
    this.cooldownMs = getCooldownMs();

    // Initialize alert states from configuration
    const thresholds = getThresholds();
    for (const threshold of thresholds) {
      this.alertStates.set(threshold.type, {
        firing: false,
        lastValue: 0,
        lastChecked: Date.now(),
      });
    }
  }

  /**
   * Initialize the evaluation counter (called by API layer after metrics are registered)
   */
  registerEvaluationCounter(counter: { inc: () => void }): void {
    AlertManager.evaluationCounter = counter;
  }

  /**
   * Called at the start of each evaluation cycle (evaluateAllAlerts) to:
   * 1. Increment the evaluation counter (once per cycle, not per alert)
   * 2. Update global cycle tracking for heartbeat
   */
  private recordEvaluationCycle(): void {
    const now = Date.now();

    // Update global cycle time for heartbeat dead-man-switch detection
    AlertManager.evaluationCycleState.lastCycleTime = now;

    // Increment the counter (once per cycle)
    if (AlertManager.evaluationCounter) {
      AlertManager.evaluationCounter.inc();
    } else if (!AlertManager.counterNotRegisteredWarned) {
      console.warn("[alert] Evaluation counter not registered; heartbeat alerts will not fire. Call registerEvaluationCounter() at startup.");
      AlertManager.counterNotRegisteredWarned = true;
    }
  }

  /**
   * Evaluate an alert condition
   * NOTE: Counter increment (for heartbeat) is done once per evaluation cycle
   * in recordEvaluationCycle(), not here.
   */
  evaluate(type: AlertType, value: number): AlertEvaluationResult {
    const threshold = this.getThresholds().find((t) => t.type === type);
    if (!threshold) {
      throw new Error(`Unknown alert type: ${type}`);
    }

    const state = this.alertStates.get(type)!;
    const now = Date.now();

    // Calculate rate for rate-based thresholds
    let rate: number | null = null;
    if (state.previousValue !== undefined && state.previousTime !== undefined) {
      const timeDiffSeconds = (now - state.previousTime) / 1000;
      if (timeDiffSeconds > 0) {
        // Counter reset detection: if current value is lower than previous,
        // the counter was reset (process restart, etc.). Treat as 0 delta to
        // avoid spurious rate spikes from re-initialized counters.
        const valueDiff = value >= state.previousValue ? (value - state.previousValue) : 0;
        rate = valueDiff / timeDiffSeconds; // events per second
      }
    }

    // Update state
    state.previousValue = value;
    state.previousTime = now;
    state.lastValue = value;
    state.lastChecked = now;

    // Evaluate based on threshold type
    const firing = this.evaluateCondition(type, value, rate, threshold.threshold, threshold.thresholdType, threshold.windowSeconds);
    state.firing = firing;

    return {
      type,
      firing,
      value,
      threshold: threshold.threshold,
      thresholdType: threshold.thresholdType,
      windowSeconds: threshold.windowSeconds,
      metric: threshold.metric,
      labels: threshold.labels,
    };
  }

  /**
   * Evaluate condition based on threshold type
   * 
   * For rate_percent: rate = (value_diff / time_diff) * 100 to get percentage change per minute
   *   NOTE: rate_percent measures growth-rate of a single counter (current delta vs prior delta),
   *   NOT a ratio of two separate counters. A value of 0.5 means the counter grew by 0.5% per minute.
   * For rate_minute: rate = events per minute
   * Heartbeat: fires when NO evaluation cycles occur over the window
   */
  private evaluateCondition(
    type: AlertType,
    value: number, 
    rate: number | null, 
    threshold: number, 
    thresholdType: ThresholdType,
    windowSeconds: number
  ): boolean {
    switch (thresholdType) {
      case "greater_than":
        return value > threshold;
      case "less_than":
        return value < threshold;
      case "rate_percent":
      case "rate_minute":
        // Heartbeat special case: fires when NO evaluation cycles occur over the window
        if (type === "heartbeat" && thresholdType === "rate_minute" && threshold === 0) {
          const timeSinceLastCycle = (Date.now() - AlertManager.evaluationCycleState.lastCycleTime) / 1000;
          return timeSinceLastCycle > windowSeconds;
        }
        
        if (rate === null) {
          return false;
        }
        
        if (thresholdType === "rate_percent") {
          const ratePercentPerMinute = rate * 60 * 100;
          return ratePercentPerMinute > threshold;
        }
        
        const ratePerMinute = rate * 60;
        return ratePerMinute > threshold;
      default:
        return value > threshold;
    }
  }

  /**
   * Check if alert should fire (respects cooldown)
   */
  shouldFire(type: AlertType): boolean {
    const state = this.alertStates.get(type);
    if (!state || !state.firing) {
      return false;
    }

    const now = Date.now();
    const lastFired = state.lastFired ?? 0;

    // Check cooldown
    if (now - lastFired < this.cooldownMs) {
      return false;
    }

    return true;
  }

  /**
   * Mark alert as fired
   */
  markFired(type: AlertType): void {
    const state = this.alertStates.get(type);
    if (state) {
      state.lastFired = Date.now();
    }
  }

  /**
   * Get all firing alerts
   */
  getFiringAlerts(): AlertType[] {
    const firing: AlertType[] = [];
    for (const [type, state] of this.alertStates) {
      if (state.firing) {
        firing.push(type);
      }
    }
    return firing;
  }

  /**
   * Get alert state
   */
  getAlertState(type: AlertType): AlertState | undefined {
    return this.alertStates.get(type);
  }

  /**
   * Create alert event from evaluation result
   */
  createAlertEvent(result: AlertEvaluationResult, message: string): AlertEvent {
    const threshold = this.getThresholds().find((t) => t.type === result.type)!;

    return {
      type: result.type,
      severity: threshold.severity,
      name: threshold.name,
      metric: threshold.metric,
      message,
      value: result.value,
      threshold: result.threshold,
      windowSeconds: result.windowSeconds,
      timestamp: new Date().toISOString(),
      labels: result.labels ?? threshold.labels,
    };
  }

  /**
   * Get current metric value from prom-client registry
   */
  async getMetricValue(metricName: string, labels?: Record<string, string>): Promise<number> {
    try {
      const metric = this.registry.getSingleMetric(metricName);
      if (!metric) {
        return 0;
      }

      const metricData = await metric.get();
      const values = metricData.values;
      
      if (!labels || Object.keys(labels).length === 0) {
        let total = 0;
        for (const entry of values) {
          total += typeof entry.value === "number" ? entry.value : 0;
        }
        return total;
      }

      for (const entry of values) {
        const labelValues = entry.labels ?? {};
        const matches = Object.entries(labels).every(
          ([key, value]) => labelValues[key] === value
        );
        
        if (matches) {
          return typeof entry.value === "number" ? entry.value : 0;
        }
      }

      return 0;
    } catch (error) {
      console.error(`[alert] Failed to get metric ${metricName}:`, error);
      return 0;
    }
  }

  /**
   * Evaluate all configured alerts against current metrics
   * Called periodically by the alert evaluation service (e.g., every 30 seconds)
   * 
   * NOTE: This method records ONE evaluation cycle, which increments the
   * alert_evaluation_total counter ONCE.
   */
  async evaluateAllAlerts(): Promise<AlertEvaluationResult[]> {
    const thresholds = this.getThresholds();
    const results: AlertEvaluationResult[] = [];

    // Record the start of a new evaluation cycle (for heartbeat tracking)
    this.recordEvaluationCycle();

    for (const threshold of thresholds) {
      try {
        const value = await this.getMetricValue(threshold.metric, threshold.labels);
        const result = this.evaluate(threshold.type, value);
        results.push(result);
      } catch (error) {
        console.error(`[alert] Failed to evaluate alert ${threshold.name}:`, error);
      }
    }

    return results;
  }

  /**
   * Dispatch alert to webhook with exponential backoff retry
   */
  async dispatchAlert(event: AlertEvent): Promise<boolean> {
    const config = this.getWebhookConfig();
    if (!config) {
      console.warn(`[alert] Alert firing: ${event.name} (${event.severity}): ${event.message}`);
      console.warn(`[alert] Value: ${event.value}, Threshold: ${event.threshold}, Window: ${event.windowSeconds}s`);
      return false;
    }

    const payload = this.formatWebhookPayload(event);

    try {
      await withRetry(
        async () => {
          const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(config.timeout ?? 5000),
          });

          if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
          }
        },
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt, error, delay) => {
            console.warn(`[alert] Retry ${attempt}/3 in ${delay}ms: ${error.message}`);
          },
        }
      );

      console.info(`[alert] Alert dispatched: ${event.name} (${event.severity})`);
      return true;
    } catch (error) {
      console.error(`[alert] Webhook error after retries: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  /**
   * Format webhook payload (Slack-compatible)
   */
  private formatWebhookPayload(event: AlertEvent): Record<string, unknown> {
    const severityEmoji = {
      critical: "🔴",
      warning: "⚠️",
    }[event.severity];

    const color = {
      critical: "#FF0000",
      warning: "#FFD700",
    }[event.severity];

    return {
      text: `${severityEmoji} Alert: ${event.name}`,
      attachments: [
        {
          color,
          fields: [
            { title: "Severity", value: event.severity, short: true },
            { title: "Type", value: event.type, short: true },
            { title: "Metric", value: event.metric, short: true },
            { title: "Current Value", value: String(event.value), short: true },
            { title: "Threshold", value: String(event.threshold), short: true },
            { title: "Window", value: `${event.windowSeconds}s`, short: true },
            { title: "Time", value: event.timestamp, short: false },
          ],
          text: event.message,
        },
      ],
      event: {
        ...event,
        labels: event.labels ?? {},
      },
    };
  }

  /**
   * Reset all alert states
   */
  reset(): void {
    for (const state of this.alertStates.values()) {
      state.firing = false;
      state.lastValue = 0;
      state.lastChecked = Date.now();
      state.lastFired = undefined;
    }
  }

  /**
   * Reset the static evaluation cycle state (for testing)
   */
  static resetEvaluationCycleState(): void {
    AlertManager.evaluationCycleState = {
      lastCycleTime: Date.now(),
    };
  }
}
