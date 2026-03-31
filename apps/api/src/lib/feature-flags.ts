// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Feature Flags for gradual rollout of sync architecture changes.
 * 
 * PUSH_SYNC_MODE values:
 * - "shadow": Run both paths, log comparison, return old path result (default)
 * - "10": 10% rollout using new path
 * - "50": 50% rollout using new path
 * - "100": 100% rollout using new path only
 */

export type PushSyncMode = "shadow" | number;

/**
 * Get the current PUSH_SYNC_MODE setting.
 * Defaults to "shadow" if not set or invalid.
 */
export function getPushSyncMode(): PushSyncMode {
  const mode = process.env.PUSH_SYNC_MODE || "shadow";
  
  if (mode === "shadow") {
    return "shadow";
  }
  
  const pct = parseInt(mode, 10);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    return "shadow";
  }
  
  return pct;
}

/**
 * Determine if a company should use the new push sync path.
 * Uses deterministic rollout based on companyId.
 * 
 * @param companyId - The company ID to check for rollout
 * @returns true if new path should be used, false otherwise
 */
export function shouldUseNewPushSync(companyId: number): boolean {
  const mode = getPushSyncMode();
  
  if (mode === "shadow") {
    return false;
  }
  
  // Deterministic rollout based on companyId
  // companyId % 100 gives us a value 0-99
  // If that value is less than the percentage, use new path
  return (companyId % 100) < mode;
}

/**
 * Get rollout percentage description for logging.
 */
export function getPushSyncModeDescription(): string {
  const mode = getPushSyncMode();
  
  if (mode === "shadow") {
    return "shadow mode (logging comparison, using old path)";
  }
  
  return `${mode}% rollout (using new path)`;
}
