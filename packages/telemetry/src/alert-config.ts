// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Configuration Loader
 * 
 * Loads and validates alert configuration from YAML files.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Alert severity levels
 */
export const ALERT_SEVERITIES = ["warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * Threshold type for alert evaluation
 * 
 * NOTE on rate_percent: This is a growth-rate threshold, NOT a ratio-of-two-counters.
 * It measures how fast a single counter is incrementing (delta per time interval).
 * A threshold of 0.5 means the counter must grow by 0.5% per minute to fire.
 * For absolute ratios (e.g., failed/total), use greater_than with a calculated metric instead.
 */
export const THRESHOLD_TYPES = ["greater_than", "less_than", "rate_percent", "rate_minute"] as const;
export type ThresholdType = (typeof THRESHOLD_TYPES)[number];

/**
 * Alert rule schema
 */
export const AlertRuleSchema = z.object({
  name: z.string().min(1),
  metric: z.string().min(1),
  labels: z.record(z.string()).optional(),
  threshold: z.number(),
  threshold_type: z.enum(THRESHOLD_TYPES),
  severity: z.enum(ALERT_SEVERITIES),
  window: z.string(),
  description: z.string().optional(),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

/**
 * Webhook configuration schema
 */
export const WebhookConfigSchema = z.object({
  url: z.string().url().optional(),
  cooldown_seconds: z.number().positive().int().default(300),
});

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

/**
 * Complete alert configuration schema
 */
export const AlertConfigSchema = z.object({
  webhook_url: z.string().url().optional(),
  deduplication: z.object({
    cooldown_seconds: z.number().positive().int().default(300),
  }).optional(),
  alerts: z.array(AlertRuleSchema),
});

export type AlertConfig = z.infer<typeof AlertConfigSchema>;

/**
 * Parse time window string to seconds
 * Supported formats: 1m, 5m, 1h, 30s, etc.
 */
export function parseWindowToSeconds(window: string): number {
  const match = window.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(`Invalid window format: ${window}. Expected format like 1m, 5m, 1h, 30s`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Default alert configuration
 */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  deduplication: {
    cooldown_seconds: 300,
  },
  alerts: [
    {
      name: "sync_latency_breach",
      metric: "sync_push_latency_ms",
      threshold: 500,
      threshold_type: "greater_than",
      severity: "warning",
      window: "5m",
      description: "Sync push latency p95 exceeds 500ms threshold",
    },
    {
      name: "sync_failure_rate",
      metric: "sync_push_total",
      labels: { status: "failed" },
      threshold: 0.5,
      threshold_type: "rate_percent",
      severity: "critical",
      window: "5m",
      description: "Sync push failure rate exceeds 0.5%",
    },
    {
      name: "outbox_lag_critical",
      metric: "outbox_lag_items",
      threshold: 100,
      threshold_type: "greater_than",
      severity: "critical",
      window: "1m",
      description: "Outbox lag exceeds 100 pending items",
    },
    {
      name: "journal_failure_rate",
      metric: "journal_post_failure_total",
      threshold: 0.1,
      threshold_type: "rate_percent",
      severity: "critical",
      window: "5m",
      description: "Journal posting failure rate exceeds 0.1%",
    },
    {
      name: "gl_imbalance_detected",
      metric: "gl_imbalance_detected_total",
      threshold: 0,
      threshold_type: "greater_than",
      severity: "critical",
      window: "1m",
      description: "GL imbalance detected (debit != credit in journal entry)",
    },
    {
      name: "sync_duplicate_rate",
      metric: "sync_push_results_total",
      labels: { result: "DUPLICATE" },
      threshold: 5,
      threshold_type: "rate_percent",
      severity: "warning",
      window: "5m",
      description: "Sync push duplicate counter growth rate > 5%/min indicates possible replay storm or client bug",
    },
    {
      name: "sync_error_rate",
      metric: "sync_push_results_total",
      labels: { result: "ERROR" },
      threshold: 1,
      threshold_type: "rate_percent",
      severity: "critical",
      window: "5m",
      description: "Sync push error counter growth rate > 1%/min indicates possible validation drift or schema mismatch",
    },
    {
      name: "heartbeat",
      metric: "alert_evaluation_total",
      threshold: 0,
      threshold_type: "rate_minute",
      severity: "warning",
      window: "5m",
      description: "Heartbeat alert - fires if alerting system stops evaluating",
    },
  ],
};

/**
 * Load alert configuration from YAML file
 * Searches in the following order:
 * 1. $CWD/config/alerts.yaml
 * 2. Returns default config if no file found
 */
export function loadAlertConfig(): AlertConfig {
  try {
    const cwd = process.cwd();
    const possiblePaths = [
      resolve(cwd, "config/alerts.yaml"),
      resolve(cwd, "config/alerts.yml"),
    ];

    for (const configPath of possiblePaths) {
      try {
        const fileContent = readFileSync(configPath, "utf-8");
        const parsed = parseYAMLAlertConfig(fileContent);
        
        // Validate and fill defaults
        const validated = AlertConfigSchema.parse(parsed);
        
        // Apply defaults for optional fields
        return {
          webhook_url: validated.webhook_url ?? process.env.ALERT_WEBHOOK_URL,
          deduplication: {
            cooldown_seconds: validated.deduplication?.cooldown_seconds ?? 300,
          },
          alerts: validated.alerts,
        };
      } catch {
        // Try next path
        continue;
      }
    }

    // No file found, return defaults
    console.warn("[alert-config] No config/alerts.yaml found, using default alert configuration");
    return DEFAULT_ALERT_CONFIG;
  } catch (error) {
    console.error("[alert-config] Failed to load alert config:", error);
    return DEFAULT_ALERT_CONFIG;
  }
}

/**
 * Parse YAML content for alert configuration
 */
function parseYAMLAlertConfig(content: string): unknown {
  // Try native YAML parsing first (available in Node.js)
  try {
    const { parse } = require("node:yaml");
    if (typeof parse === "function") {
      return parse(content);
    }
  } catch {
    // Fall through to fallback parser
  }

  // Fallback: simple key-value parsing for basic YAML
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentSection: Record<string, unknown> | null = null;
  let currentKey = "";
  let inAlertsArray = false;
  let currentAlertIndex = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    // Check for section headers
    if (trimmed.endsWith(":") && !trimmed.includes(" ")) {
      const sectionName = trimmed.slice(0, -1);
      
      if (sectionName === "alerts") {
        result[sectionName] = [];
        inAlertsArray = true;
        currentAlertIndex = -1;
      } else if (sectionName === "deduplication") {
        result[sectionName] = {};
        currentSection = result[sectionName] as Record<string, unknown>;
        inAlertsArray = false;
      } else {
        result[sectionName] = {};
        currentSection = result[sectionName] as Record<string, unknown>;
        inAlertsArray = false;
      }
      currentKey = "";
      continue;
    }

    // Parse key-value pairs
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value: string | number | boolean | Record<string, unknown> = trimmed.slice(colonIndex + 1).trim();

      // Handle array items (alerts)
      if (inAlertsArray && !trimmed.includes(":")) {
        continue; // Skip array bullet points for now
      }

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Convert to number if numeric
      if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
        value = parseFloat(value);
      } else if (typeof value === "string" && value === "true") {
        value = true;
      } else if (typeof value === "string" && value === "false") {
        value = false;
      }

      if (inAlertsArray) {
        // We're in the alerts array
        const alertsArray = result["alerts"] as Record<string, unknown>[];
        if (key === "-") {
          // New alert item
          alertsArray.push({});
          currentAlertIndex++;
          currentSection = alertsArray[currentAlertIndex];
        } else if (currentSection) {
          if (key === "labels") {
            // Parse labels as nested object
            currentSection[key] = parseLabelsObject(trimmed);
          } else {
            currentSection[key] = value;
          }
        }
      } else if (currentSection) {
        currentSection[key] = value;
      }
    }
  }

  return result;
}

/**
 * Parse labels object from YAML
 */
function parseLabelsObject(line: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const content = line.slice(line.indexOf(":") + 1).trim();
  
  // Remove braces if present
  const inner = content.replace(/[{}]/g, "").trim();
  
  if (!inner) return labels;
  
  // Parse key: value pairs
  const pairs = inner.split(",");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split(":");
    if (key && valueParts.length > 0) {
      labels[key.trim()] = valueParts.join(":").trim().replace(/['"]/g, "");
    }
  }
  
  return labels;
}

/**
 * Validate alert configuration
 */
export function validateAlertConfig(config: unknown): {
  valid: boolean;
  config?: AlertConfig;
  errors?: z.ZodError["errors"];
} {
  try {
    const validated = AlertConfigSchema.parse(config);
    return { valid: true, config: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors };
    }
    throw error;
  }
}

/**
 * Get alert rule by name
 */
export function getAlertRuleByName(config: AlertConfig, name: string): AlertRule | undefined {
  return config.alerts.find((rule) => rule.name === name);
}

/**
 * Get alert rules by severity
 */
export function getAlertRulesBySeverity(config: AlertConfig, severity: AlertSeverity): AlertRule[] {
  return config.alerts.filter((rule) => rule.severity === severity);
}
