// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
/**
 * Get the current PUSH_SYNC_MODE setting.
 * Defaults to "shadow" if not set or invalid.
 */
export function getPushSyncMode() {
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
export function shouldUseNewPushSync(companyId) {
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
export function getPushSyncModeDescription() {
    const mode = getPushSyncMode();
    if (mode === "shadow") {
        return "shadow mode (logging comparison, using old path)";
    }
    return `${mode}% rollout (using new path)`;
}
//# sourceMappingURL=index.js.map