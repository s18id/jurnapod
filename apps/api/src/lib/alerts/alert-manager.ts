// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Manager
 * 
 * Evaluates alert conditions and dispatches webhook notifications.
 * Maintains alert state to prevent duplicate alerts.
 */

import {
  ALERT_THRESHOLDS,
  getThresholdValue,
  getThresholdWindow,
  getWebhookConfig,
  type AlertType,
  type AlertSeverity,
  type WebhookConfig,
} from "./alert-rules";

/**
 * Alert event structure
 */
export interface AlertEvent {
  type: AlertType;
  severity: AlertSeverity;
  name: string;
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
}

/**
 * Alert evaluation result
 */
export interface AlertEvaluationResult {
  type: AlertType;
  firing: boolean;
  value: number;
  threshold: number;
  windowSeconds: number;
}

/**
 * Alert manager class
 */
export class AlertManager {
  private alertStates: Map<AlertType, AlertState> = new Map();
  private readonly cooldownMs: number;

  constructor(cooldownMs: number = 60000) {
    // Initialize alert states
    for (const threshold of ALERT_THRESHOLDS) {
      this.alertStates.set(threshold.type, {
        firing: false,
        lastValue: 0,
        lastChecked: Date.now(),
      });
    }

    // Cooldown between alerts (default: 1 minute)
    this.cooldownMs = cooldownMs;
  }

  /**
   * Evaluate an alert condition
   */
  evaluate(type: AlertType, value: number): AlertEvaluationResult {
    const threshold = ALERT_THRESHOLDS.find((t) => t.type === type);
    if (!threshold) {
      throw new Error(`Unknown alert type: ${type}`);
    }

    const thresholdValue = getThresholdValue(threshold);
    const windowSeconds = getThresholdWindow(threshold);

    const state = this.alertStates.get(type)!;
    state.lastValue = value;
    state.lastChecked = Date.now();

    const firing = value >= thresholdValue;
    state.firing = firing;

    return {
      type,
      firing,
      value,
      threshold: thresholdValue,
      windowSeconds,
    };
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
  createAlertEvent(result: AlertEvaluationResult, message: string, labels?: Record<string, string>): AlertEvent {
    const threshold = ALERT_THRESHOLDS.find((t) => t.type === result.type)!;

    return {
      type: result.type,
      severity: threshold.severity,
      name: threshold.name,
      message,
      value: result.value,
      threshold: result.threshold,
      windowSeconds: result.windowSeconds,
      timestamp: new Date().toISOString(),
      labels,
    };
  }

  /**
   * Dispatch alert to webhook
   */
  async dispatchAlert(event: AlertEvent): Promise<boolean> {
    const config = getWebhookConfig();
    if (!config) {
      // No webhook configured, just log
      console.warn(`[alert] Alert firing: ${event.name} (${event.severity}): ${event.message}`);
      console.warn(`[alert] Value: ${event.value}, Threshold: ${event.threshold}, Window: ${event.windowSeconds}s`);
      return false;
    }

    try {
      const payload = this.formatWebhookPayload(event);
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeout ?? 5000),
      });

      if (!response.ok) {
        console.error(`[alert] Webhook failed: ${response.status} ${response.statusText}`);
        return false;
      }

      console.info(`[alert] Alert dispatched: ${event.name} (${event.severity})`);
      return true;
    } catch (error) {
      console.error(`[alert] Webhook error: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  /**
   * Format webhook payload (Slack-compatible)
   */
  private formatWebhookPayload(event: AlertEvent): Record<string, unknown> {
    const severityEmoji = {
      P1: "🔴",
      P2: "🟠",
      P3: "🟡",
    }[event.severity];

    const color = {
      P1: "#FF0000",
      P2: "#FF8C00",
      P3: "#FFD700",
    }[event.severity];

    return {
      text: `${severityEmoji} Alert: ${event.name}`,
      attachments: [
        {
          color,
          fields: [
            {
              title: "Severity",
              value: event.severity,
              short: true,
            },
            {
              title: "Type",
              value: event.type,
              short: true,
            },
            {
              title: "Current Value",
              value: String(event.value),
              short: true,
            },
            {
              title: "Threshold",
              value: String(event.threshold),
              short: true,
            },
            {
              title: "Window",
              value: `${event.windowSeconds}s`,
              short: true,
            },
            {
              title: "Time",
              value: event.timestamp,
              short: false,
            },
          ],
          text: event.message,
        },
      ],
      // Include full event for other webhook consumers
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
}

/**
 * Global singleton instance
 */
export const alertManager = new AlertManager();
