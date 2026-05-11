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
export declare function getPushSyncMode(): PushSyncMode;
/**
 * Determine if a company should use the new push sync path.
 * Uses deterministic rollout based on companyId.
 *
 * @param companyId - The company ID to check for rollout
 * @returns true if new path should be used, false otherwise
 */
export declare function shouldUseNewPushSync(companyId: number): boolean;
/**
 * Get rollout percentage description for logging.
 */
export declare function getPushSyncModeDescription(): string;
//# sourceMappingURL=index.d.ts.map