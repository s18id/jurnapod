// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SLO Configuration - Service Level Objectives for Critical Flows
 * 
 * Defines SLIs, targets, and measurement windows for all critical flows
 * as defined in Epic 11: Operational Trust and Scale Readiness.
 */

import { z } from "zod";

/**
 * Critical flow names that require SLO instrumentation
 */
export const CRITICAL_FLOWS = [
  "payment_capture",
  "offline_local_commit",
  "sync_replay_idempotency",
  "pos_to_gl_posting",
  "trial_balance",
  "general_ledger",
] as const;

export type CriticalFlowName = (typeof CRITICAL_FLOWS)[number];

/**
 * Service Level Indicator types
 */
export const SLI_TYPES = ["latency", "availability", "success_rate", "duplicate_rate", "accuracy"] as const;
export type SLIType = (typeof SLI_TYPES)[number];

/**
 * SLO target schema with measurement window
 */
export const SLOTargetSchema = z.object({
  flow_name: z.enum(CRITICAL_FLOWS),
  sli_type: z.enum(SLI_TYPES),
  target: z.string(), // e.g., "< 1s", ">= 99.9%", "100%"
  target_value: z.number(), // numeric value for calculations
  unit: z.enum(["seconds", "percent", "ratio", "count"]),
  measurement_window_days: z.number().default(28),
  description: z.string().optional(),
});

export type SLOTarget = z.infer<typeof SLOTargetSchema>;

/**
 * Business hours configuration schema
 */
export const BusinessHoursSchema = z.object({
  start_hour: z.number().min(0).max(23).default(9), // 9 AM
  end_hour: z.number().min(0).max(23).default(17), // 5 PM
  timezone: z.string().default("outlet"), // Resolved per-outlet
  weekdays: z.array(z.number().min(1).max(7)).default([1, 2, 3, 4, 5]), // Mon-Fri
});

export type BusinessHours = z.infer<typeof BusinessHoursSchema>;

/**
 * Default business hours configuration
 * Used for availability SLOs measured during business hours only
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start_hour: 9,
  end_hour: 17,
  timezone: "outlet", // Resolved per-outlet from company settings
  weekdays: [1, 2, 3, 4, 5], // Monday through Friday
};

/**
 * SLO configuration for all critical flows
 * Aligned to NFRs: POS p95 < 1s, sync completion < 30s, report p95 < 5s, availability >= 99.9%
 */
export const SLO_CONFIG: SLOTarget[] = [
  // payment_capture
  {
    flow_name: "payment_capture",
    sli_type: "latency",
    target: "< 1s",
    target_value: 1.0,
    unit: "seconds",
    measurement_window_days: 28,
    description: "POS payment processing latency p95 must be under 1 second",
  },
  {
    flow_name: "payment_capture",
    sli_type: "availability",
    target: ">= 99.9%",
    target_value: 99.9,
    unit: "percent",
    measurement_window_days: 28,
    description: "Payment capture availability during business hours",
  },
  // offline_local_commit
  {
    flow_name: "offline_local_commit",
    sli_type: "success_rate",
    target: ">= 99.9%",
    target_value: 99.9,
    unit: "percent",
    measurement_window_days: 28,
    description: "Offline transaction commit durability success rate",
  },
  // sync_replay_idempotency
  {
    flow_name: "sync_replay_idempotency",
    sli_type: "duplicate_rate",
    target: "< 0.01%",
    target_value: 0.01,
    unit: "percent",
    measurement_window_days: 28,
    description: "Sync replay duplicate detection rate must be below 0.01%",
  },
  {
    flow_name: "sync_replay_idempotency",
    sli_type: "latency",
    target: "< 30s",
    target_value: 30.0,
    unit: "seconds",
    measurement_window_days: 28,
    description: "Sync completion time must be under 30 seconds",
  },
  // pos_to_gl_posting
  {
    flow_name: "pos_to_gl_posting",
    sli_type: "latency",
    target: "< 5s",
    target_value: 5.0,
    unit: "seconds",
    measurement_window_days: 28,
    description: "POS to GL journal entry posting latency p95",
  },
  {
    flow_name: "pos_to_gl_posting",
    sli_type: "accuracy",
    target: "100%",
    target_value: 100.0,
    unit: "percent",
    measurement_window_days: 28,
    description: "Zero drift accuracy for GL posting",
  },
  // trial_balance
  {
    flow_name: "trial_balance",
    sli_type: "latency",
    target: "< 5s",
    target_value: 5.0,
    unit: "seconds",
    measurement_window_days: 28,
    description: "Trial balance report generation latency p95",
  },
  // general_ledger
  {
    flow_name: "general_ledger",
    sli_type: "latency",
    target: "< 5s",
    target_value: 5.0,
    unit: "seconds",
    measurement_window_days: 28,
    description: "General ledger report generation latency p95",
  },
];

/**
 * Get SLO targets for a specific flow
 */
export function getSLOsForFlow(flowName: CriticalFlowName): SLOTarget[] {
  return SLO_CONFIG.filter((slo) => slo.flow_name === flowName);
}

/**
 * Validate SLO configuration
 */
export function validateSLOConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const slo of SLO_CONFIG) {
    if (!CRITICAL_FLOWS.includes(slo.flow_name)) {
      errors.push(`Invalid flow name: ${slo.flow_name}`);
    }
    if (!SLI_TYPES.includes(slo.sli_type)) {
      errors.push(`Invalid SLI type: ${slo.sli_type}`);
    }
    if (slo.target_value < 0) {
      errors.push(`Negative target value for ${slo.flow_name}: ${slo.target_value}`);
    }
    if (slo.measurement_window_days !== 28) {
      errors.push(`Non-28-day window for ${slo.flow_name}: ${slo.measurement_window_days}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a given UTC timestamp is within business hours for a given timezone
 * 
 * @param utcTimestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone string (e.g., "Asia/Jakarta", "America/New_York")
 * @param businessHours - Business hours configuration (uses defaults if not provided)
 * @returns true if the timestamp falls within business hours
 */
export function isWithinBusinessHours(
  utcTimestamp: number,
  timezone: string,
  businessHours: BusinessHours = DEFAULT_BUSINESS_HOURS
): boolean {
  // Convert UTC timestamp to a Date object
  const date = new Date(utcTimestamp);
  
  // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  // Convert to Monday=1, Sunday=7 format
  const utcDayOfWeek = date.getUTCDay();
  const dayOfWeek = utcDayOfWeek === 0 ? 7 : utcDayOfWeek;
  
  // Check if it's a business day
  if (!businessHours.weekdays.includes(dayOfWeek)) {
    return false;
  }
  
  // Get hours and minutes in UTC
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const utcTotalMinutes = utcHour * 60 + utcMinute;
  
  // Get timezone offset in minutes
  const timezoneOffsetMinutes = getTimezoneOffsetMinutes(timezone);
  
  // Calculate local time in minutes
  const localTotalMinutes = utcTotalMinutes + timezoneOffsetMinutes;
  
  // Normalize to 0-1440 range (minutes in a day)
  const normalizedLocalMinutes = ((localTotalMinutes % 1440) + 1440) % 1440;
  const localHour = Math.floor(normalizedLocalMinutes / 60);
  
  // Check if within business hours (start inclusive, end exclusive)
  return localHour >= businessHours.start_hour && localHour < businessHours.end_hour;
}

/**
 * Get timezone offset from UTC in minutes for a given IANA timezone
 * This is a simplified implementation - for production, use a proper timezone library
 */
function getTimezoneOffsetMinutes(timezone: string): number {
  // Common timezone offsets in minutes (simplified - doesn't handle DST)
  const offsets: Record<string, number> = {
    "Asia/Jakarta": 7 * 60,      // +7:00
    "Asia/Singapore": 8 * 60,     // +8:00
    "Asia/Kolkata": 5 * 60 + 30, // +5:30
    "Europe/London": 0,           // +0:00
    "Europe/Paris": 60,           // +1:00
    "America/New_York": -5 * 60,  // -5:00
    "America/Los_Angeles": -8 * 60, // -8:00
    "UTC": 0,
  };
  
  // Check exact match
  if (offsets[timezone] !== undefined) {
    return offsets[timezone];
  }
  
  // Check prefix match for regions (e.g., "Asia/Jakarta" matches "Asia/*")
  for (const [key, value] of Object.entries(offsets)) {
    const [region] = key.split("/");
    if (region && timezone.startsWith(region)) {
      return value;
    }
  }
  
  // Default offset (UTC)
  return 0;
}
