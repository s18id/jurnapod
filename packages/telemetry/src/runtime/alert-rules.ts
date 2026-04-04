// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Rules Runtime Adapter
 * 
 * Provides alert thresholds to the AlertManager by wrapping
 * the telemetry package's alert-config loader.
 */

import {
  loadAlertConfig,
  parseWindowToSeconds,
  type AlertConfig,
} from "../alert-config.js";

/**
 * Alert severity level
 */
export type AlertSeverity = "warning" | "critical";

/**
 * Threshold type for alert evaluation
 */
export type ThresholdType = "greater_than" | "less_than" | "rate_percent" | "rate_minute";

/**
 * Alert type identifiers matching the metrics
 */
export type AlertType =
  | "sync_latency_breach"
  | "sync_failure_rate"
  | "outbox_lag_critical"
  | "journal_failure_rate"
  | "gl_imbalance_detected"
  | "heartbeat";

/**
 * Alert threshold definition with parsed values
 */
export interface AlertThreshold {
  type: AlertType;
  severity: AlertSeverity;
  name: string;
  metric: string;
  labels?: Record<string, string>;
  threshold: number;
  thresholdType: ThresholdType;
  windowSeconds: number;
  description?: string;
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
 * Alert thresholds configuration (parsed from YAML)
 */
let _alertThresholds: AlertThreshold[] | null = null;
let _webhookUrl: string | null = null;
let _cooldownMs: number = 300000; // 5 minutes default

/**
 * Initialize alert thresholds from configuration
 */
function initializeAlertThresholds(): void {
  if (_alertThresholds !== null) {
    return;
  }

  const config = loadAlertConfig();
  
  _webhookUrl = config.webhook_url ?? process.env.ALERT_WEBHOOK_URL ?? null;
  _cooldownMs = (config.deduplication?.cooldown_seconds ?? 300) * 1000;

  _alertThresholds = config.alerts.map((rule) => ({
    type: rule.name as AlertType,
    severity: rule.severity as AlertSeverity,
    name: rule.name,
    metric: rule.metric,
    labels: rule.labels,
    threshold: rule.threshold,
    thresholdType: rule.threshold_type as ThresholdType,
    windowSeconds: parseWindowToSeconds(rule.window),
    description: rule.description,
  }));
}

/**
 * Get all alert thresholds
 */
export function getAlertThresholds(): AlertThreshold[] {
  initializeAlertThresholds();
  return _alertThresholds!;
}

/**
 * Get alert threshold by type
 */
export function getAlertThresholdByType(type: AlertType): AlertThreshold | undefined {
  initializeAlertThresholds();
  return _alertThresholds!.find((t) => t.type === type);
}

/**
 * Get webhook URL
 */
export function getAlertWebhookUrl(): string | null {
  initializeAlertThresholds();
  return _webhookUrl;
}

/**
 * Get cooldown in milliseconds
 */
export function getAlertCooldownMs(): number {
  initializeAlertThresholds();
  return _cooldownMs;
}

/**
 * Get webhook configuration from environment
 */
export function getWebhookConfig(): WebhookConfig | null {
  const webhookUrl = getAlertWebhookUrl();
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

/**
 * Reset alert configuration (useful for testing)
 */
export function resetAlertConfig(): void {
  _alertThresholds = null;
  _webhookUrl = null;
  _cooldownMs = 300000;
}
