// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SLO Configuration Loader
 * 
 * Loads and validates SLO configuration from YAML files.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  SLO_CONFIG_SCHEMA,
  DEFAULT_SLO_CONFIG,
  type SLOConfig,
} from "./metrics.js";

/**
 * Find and load the SLO configuration file
 * Searches in the following order:
 * 1. $CWD/config/slos.yaml
 * 2. $CWD/config/slos.yml
 * 3. Returns default config if no file found
 */
export function loadSLOConfig(): SLOConfig {
  try {
    const cwd = process.cwd();
    const possiblePaths = [
      resolve(cwd, "config/slos.yaml"),
      resolve(cwd, "config/slos.yml"),
    ];

    for (const configPath of possiblePaths) {
      try {
        const fileContent = readFileSync(configPath, "utf-8");
        const parsed = parseYAML(fileContent);
        const validated = SLO_CONFIG_SCHEMA.parse(parsed);
        return validated;
      } catch {
        // Try next path
        continue;
      }
    }

    // No file found, return defaults
    console.warn("[slo-config] No config/slos.yaml found, using default SLO configuration");
    return DEFAULT_SLO_CONFIG;
  } catch (error) {
    console.error("[slo-config] Failed to load SLO config:", error);
    return DEFAULT_SLO_CONFIG;
  }
}

/**
 * Parse YAML content (uses native YAML parsing or js-yaml if available)
 */
function parseYAML(content: string): unknown {
  // Try native YAML parsing first (available in Node.js)
  try {
    // Node.js native YAML support (v22+)
    const { parse } = require("node:yaml");
    if (typeof parse === "function") {
      return parse(content);
    }
  } catch {
    // Fall through to js-yaml
  }

  // Fallback: simple key-value parsing for basic YAML
  // This handles the simple structure of slos.yaml
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentSection: Record<string, unknown> | null = null;
  let currentKey = "";

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    // Check for section headers (no colon = section)
    if (trimmed.endsWith(":") && !trimmed.includes(" ")) {
      const sectionName = trimmed.slice(0, -1);
      result[sectionName] = {};
      currentSection = result[sectionName] as Record<string, unknown>;
      currentKey = "";
      continue;
    }

    // Parse key-value pairs
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value: string | number | boolean = trimmed.slice(colonIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Convert to number if numeric
      if (/^\d+(\.\d+)?$/.test(value)) {
        value = parseFloat(value);
      } else if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      }

      if (currentSection) {
        currentSection[key] = value;
      }
    }
  }

  return result;
}

/**
 * Validate SLO configuration from YAML and return validation result
 */
export function validateSLOYamlConfig(config: unknown): {
  valid: boolean;
  config?: SLOConfig;
  errors?: z.ZodError["errors"];
} {
  try {
    const validated = SLO_CONFIG_SCHEMA.parse(config);
    return { valid: true, config: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors };
    }
    throw error;
  }
}

/**
 * Get SLO threshold for sync latency
 */
export function getSyncLatencyThreshold(
  config: SLOConfig,
  percentile: "p50" | "p95" | "p99"
): number {
  const key = `${percentile}_threshold_ms` as keyof typeof config.sync.latency;
  return config.sync.latency[key] as number;
}

/**
 * Get SLO threshold for sync success rate
 */
export function getSyncSuccessRateThreshold(config: SLOConfig): number {
  return config.sync.success_rate_threshold;
}

/**
 * Get SLO threshold for duplicate rate
 */
export function getDuplicateRateThreshold(config: SLOConfig): number {
  return config.sync.duplicate_rate_threshold;
}

/**
 * Get outbox lag warning threshold
 */
export function getOutboxLagWarningThreshold(config: SLOConfig): number {
  return config.outbox.lag_warning_threshold;
}

/**
 * Get outbox lag critical threshold
 */
export function getOutboxLagCriticalThreshold(config: SLOConfig): number {
  return config.outbox.lag_critical_threshold;
}

/**
 * Get journal posting success rate threshold
 */
export function getJournalPostingSuccessThreshold(config: SLOConfig): number {
  return config.journal.posting_success_rate_threshold;
}

/**
 * Check if GL balance check is enabled
 */
export function isGLBalanceCheckEnabled(config: SLOConfig): boolean {
  return config.journal.gl_balance_check_enabled;
}
