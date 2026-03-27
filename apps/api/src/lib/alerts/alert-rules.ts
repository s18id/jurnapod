// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Threshold Definitions
 * 
 * Defines alert thresholds for production monitoring.
 * These thresholds can be overridden via environment variables.
 */

/**
 * Alert severity levels
 */
export type AlertSeverity = "P1" | "P2" | "P3";

/**
 * Alert type identifiers
 */
export type AlertType =
  | "IMPORT_FAILURE_RATE"
  | "EXPORT_DURATION"
  | "SYNC_CONFLICT_RATE"
  | "BACKPRESSURE_RATE"
  | "MEMORY_USAGE";

/**
 * Alert threshold definition
 */
export interface AlertThreshold {
  type: AlertType;
  severity: AlertSeverity;
  name: string;
  description: string;
  /** Threshold value */
  threshold: number;
  /** Window in seconds for evaluation */
  windowSeconds: number;
  /** Environment variable to override threshold */
  envVar?: string;
  /** Environment variable to override window */
  windowEnvVar?: string;
}

/**
 * Alert thresholds configuration
 */
export const ALERT_THRESHOLDS: AlertThreshold[] = [
  {
    type: "IMPORT_FAILURE_RATE",
    severity: "P2",
    name: "Import Failure Rate",
    description: "Alert when import failure rate exceeds threshold",
    threshold: 5, // 5% failure rate
    windowSeconds: 300, // 5 minutes
    envVar: "ALERT_IMPORT_FAILURE_RATE_THRESHOLD",
    windowEnvVar: "ALERT_IMPORT_FAILURE_RATE_WINDOW",
  },
  {
    type: "EXPORT_DURATION",
    severity: "P2",
    name: "Export Average Duration",
    description: "Alert when export average duration exceeds threshold",
    threshold: 30, // 30 seconds
    windowSeconds: 600, // 10 minutes
    envVar: "ALERT_EXPORT_DURATION_THRESHOLD",
    windowEnvVar: "ALERT_EXPORT_DURATION_WINDOW",
  },
  {
    type: "SYNC_CONFLICT_RATE",
    severity: "P1",
    name: "Sync Conflict Rate",
    description: "Alert when sync conflict rate exceeds threshold",
    threshold: 1, // 1% conflict rate
    windowSeconds: 300, // 5 minutes
    envVar: "ALERT_SYNC_CONFLICT_RATE_THRESHOLD",
    windowEnvVar: "ALERT_SYNC_CONFLICT_RATE_WINDOW",
  },
  {
    type: "BACKPRESSURE_RATE",
    severity: "P2",
    name: "Backpressure Events Rate",
    description: "Alert when backpressure events exceed threshold per minute",
    threshold: 10, // 10 events per minute
    windowSeconds: 60, // 1 minute
    envVar: "ALERT_BACKPRESSURE_RATE_THRESHOLD",
    windowEnvVar: "ALERT_BACKPRESSURE_RATE_WINDOW",
  },
  {
    type: "MEMORY_USAGE",
    severity: "P1",
    name: "Memory Usage",
    description: "Alert when process memory usage exceeds threshold",
    threshold: 500, // 500 MB
    windowSeconds: 60, // 1 minute
    envVar: "ALERT_MEMORY_USAGE_THRESHOLD",
    windowEnvVar: "ALERT_MEMORY_USAGE_WINDOW",
  },
];

/**
 * Get threshold value, with environment variable override
 */
export function getThresholdValue(threshold: AlertThreshold): number {
  if (threshold.envVar && process.env[threshold.envVar]) {
    return parseFloat(process.env[threshold.envVar]!);
  }
  return threshold.threshold;
}

/**
 * Get window value, with environment variable override
 */
export function getThresholdWindow(threshold: AlertThreshold): number {
  if (threshold.windowEnvVar && process.env[threshold.windowEnvVar]) {
    return parseInt(process.env[threshold.windowEnvVar]!, 10);
  }
  return threshold.windowSeconds;
}

/**
 * Get threshold by type
 */
export function getThresholdByType(type: AlertType): AlertThreshold | undefined {
  return ALERT_THRESHOLDS.find((t) => t.type === type);
}

/**
 * Webhook configuration for alerts
 */
export interface WebhookConfig {
  url: string;
  method: "POST" | "PUT";
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Get webhook configuration from environment
 */
export function getWebhookConfig(): WebhookConfig | null {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return null;
  }

  return {
    url: webhookUrl,
    method: (process.env.ALERT_WEBHOOK_METHOD as "POST" | "PUT") ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.ALERT_WEBHOOK_HEADERS
        ? JSON.parse(process.env.ALERT_WEBHOOK_HEADERS)
        : {}),
    },
    timeout: process.env.ALERT_WEBHOOK_TIMEOUT
      ? parseInt(process.env.ALERT_WEBHOOK_TIMEOUT, 10)
      : 5000,
  };
}
