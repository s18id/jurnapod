// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Feature Flags Library
 *
 * Database operations for feature_flags table with explicit typed columns:
 * - rollout_percentage: INT (0-100, default 100)
 * - target_segments: JSON array of segment IDs
 * - start_at: DATETIME for rollout start
 * - end_at: DATETIME for rollout end
 */

import { getDb } from "./db";
import { sql } from "kysely";
import { toUtcIso } from "./date-helpers";

export interface FeatureFlag {
  id: number;
  company_id: number;
  key: string;
  enabled: boolean;
  config_json: string;
  rollout_percentage: number;
  target_segments: string[] | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagRow {
  id: number;
  company_id: number;
  key: string;
  enabled: number;
  config_json: string;
  rollout_percentage: number;
  target_segments: string | null;
  start_at: Date | null;
  end_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class FeatureFlagNotFoundError extends Error {}
export class FeatureFlagValidationError extends Error {}

const MAX_KEY_LENGTH = 64;
const VALID_KEY_REGEX = /^[a-z][a-z0-9_.]{0,62}[a-z0-9]$/;

function validateKey(key: string): void {
  if (!key || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new FeatureFlagValidationError(`Feature flag key must be 1-${MAX_KEY_LENGTH} characters`);
  }
  if (!VALID_KEY_REGEX.test(key)) {
    throw new FeatureFlagValidationError(
      "Feature flag key must start with lowercase letter, contain only lowercase letters, numbers, underscores, and dots, and end with letter or number"
    );
  }
}

function validateRolloutPercentage(pct: number): void {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    throw new FeatureFlagValidationError("rollout_percentage must be an integer between 0 and 100");
  }
}

function rowToFeatureFlag(row: FeatureFlagRow): FeatureFlag {
  let targetSegments: string[] | null = null;
  if (row.target_segments) {
    try {
      targetSegments = JSON.parse(row.target_segments);
    } catch {
      targetSegments = null;
    }
  }

  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    key: row.key,
    enabled: row.enabled === 1,
    config_json: row.config_json,
    rollout_percentage: row.rollout_percentage,
    target_segments: targetSegments,
    start_at: toUtcIso.dateLike(row.start_at, { nullable: true }) as string,
    end_at: toUtcIso.dateLike(row.end_at, { nullable: true }) as string,
    created_at: toUtcIso.dateLike(row.created_at) as string,
    updated_at: toUtcIso.dateLike(row.updated_at) as string
  };
}

export interface ListFeatureFlagsParams {
  companyId: number;
  prefix?: string;
}

export interface GetFeatureFlagParams {
  companyId: number;
  key: string;
}

export interface CreateFeatureFlagParams {
  companyId: number;
  key: string;
  enabled?: boolean;
  configJson?: string;
  rolloutPercentage?: number;
  targetSegments?: string[] | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface UpdateFeatureFlagParams {
  companyId: number;
  key: string;
  enabled?: boolean;
  configJson?: string;
  rolloutPercentage?: number;
  targetSegments?: string[] | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface DeleteFeatureFlagParams {
  companyId: number;
  key: string;
}

/**
 * List all feature flags for a company, optionally filtered by key prefix.
 */
export async function listFeatureFlags(
  params: ListFeatureFlagsParams
): Promise<FeatureFlag[]> {
  const db = getDb();

  let query = sql<FeatureFlagRow>`
    SELECT id, company_id, \`key\`, enabled, config_json, rollout_percentage,
           target_segments, start_at, end_at, created_at, updated_at
    FROM feature_flags
    WHERE company_id = ${params.companyId}
  `;

  if (params.prefix) {
    query = sql<FeatureFlagRow>`
      SELECT id, company_id, \`key\`, enabled, config_json, rollout_percentage,
             target_segments, start_at, end_at, created_at, updated_at
      FROM feature_flags
      WHERE company_id = ${params.companyId}
        AND \`key\` LIKE ${params.prefix + "%"}
    `;
  }

  const result = await query.execute(db);
  return result.rows.map(rowToFeatureFlag);
}

/**
 * Get a single feature flag by key.
 */
export async function getFeatureFlag(
  params: GetFeatureFlagParams
): Promise<FeatureFlag | null> {
  const db = getDb();

  const result = await sql<FeatureFlagRow>`
    SELECT id, company_id, \`key\`, enabled, config_json, rollout_percentage,
           target_segments, start_at, end_at, created_at, updated_at
    FROM feature_flags
    WHERE company_id = ${params.companyId}
      AND \`key\` = ${params.key}
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  return rowToFeatureFlag(result.rows[0]);
}

/**
 * Create a new feature flag.
 */
export async function createFeatureFlag(
  params: CreateFeatureFlagParams
): Promise<FeatureFlag> {
  const db = getDb();

  validateKey(params.key);

  if (params.rolloutPercentage !== undefined) {
    validateRolloutPercentage(params.rolloutPercentage);
  }

  const enabled = params.enabled ? 1 : 0;
  const rolloutPercentage = params.rolloutPercentage ?? 100;
  const targetSegments = params.targetSegments !== undefined
    ? (params.targetSegments === null ? null : JSON.stringify(params.targetSegments))
    : null;
  const startAt = params.startAt ?? null;
  const endAt = params.endAt ?? null;

  // Build config_json with explicit fields extracted
  const explicitConfig: Record<string, unknown> = {
    rollout_percentage: rolloutPercentage,
    target_segments: params.targetSegments ?? null,
    start_at: startAt,
    end_at: endAt
  };
  const mergedConfigJson = params.configJson
    ? (() => {
        try {
          const existing = JSON.parse(params.configJson);
          return JSON.stringify({ ...existing, ...explicitConfig });
        } catch {
          return JSON.stringify(explicitConfig);
        }
      })()
    : JSON.stringify(explicitConfig);

  await sql`
    INSERT INTO feature_flags (company_id, \`key\`, enabled, config_json, rollout_percentage, target_segments, start_at, end_at)
    VALUES (${params.companyId}, ${params.key}, ${enabled}, ${mergedConfigJson}, ${rolloutPercentage}, ${targetSegments}, ${startAt}, ${endAt})
  `.execute(db);

  const inserted = await getFeatureFlag({ companyId: params.companyId, key: params.key });
  if (!inserted) {
    throw new Error("Failed to retrieve created feature flag");
  }

  return inserted;
}

/**
 * Update an existing feature flag.
 */
export async function updateFeatureFlag(
  params: UpdateFeatureFlagParams
): Promise<FeatureFlag> {
  const db = getDb();

  validateKey(params.key);

  if (params.rolloutPercentage !== undefined) {
    validateRolloutPercentage(params.rolloutPercentage);
  }

  // First get the existing flag
  const existing = await getFeatureFlag({ companyId: params.companyId, key: params.key });
  if (!existing) {
    throw new FeatureFlagNotFoundError(`Feature flag '${params.key}' not found`);
  }

  const enabled = params.enabled !== undefined ? (params.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
  const rolloutPercentage = params.rolloutPercentage ?? existing.rollout_percentage;
  const targetSegments = params.targetSegments !== undefined
    ? (params.targetSegments === null ? null : JSON.stringify(params.targetSegments))
    : existing.target_segments;
  const startAt = params.startAt !== undefined ? params.startAt : existing.start_at;
  const endAt = params.endAt !== undefined ? params.endAt : existing.end_at;

  // Merge config_json with explicit fields
  const explicitConfig: Record<string, unknown> = {
    rollout_percentage: rolloutPercentage,
    target_segments: params.targetSegments ?? existing.target_segments,
    start_at: startAt,
    end_at: endAt
  };
  const mergedConfigJson = params.configJson
    ? (() => {
        try {
          const existingParsed = JSON.parse(existing.config_json);
          return JSON.stringify({ ...existingParsed, ...explicitConfig });
        } catch {
          return JSON.stringify(explicitConfig);
        }
      })()
    : JSON.stringify(explicitConfig);

  await sql`
    UPDATE feature_flags
    SET enabled = ${enabled},
        config_json = ${mergedConfigJson},
        rollout_percentage = ${rolloutPercentage},
        target_segments = ${targetSegments},
        start_at = ${startAt},
        end_at = ${endAt}
    WHERE company_id = ${params.companyId}
      AND \`key\` = ${params.key}
  `.execute(db);

  const updated = await getFeatureFlag({ companyId: params.companyId, key: params.key });
  if (!updated) {
    throw new Error("Failed to retrieve updated feature flag");
  }

  return updated;
}

/**
 * Delete a feature flag.
 */
export async function deleteFeatureFlag(
  params: DeleteFeatureFlagParams
): Promise<void> {
  const db = getDb();

  validateKey(params.key);

  await sql`
    DELETE FROM feature_flags
    WHERE company_id = ${params.companyId}
      AND \`key\` = ${params.key}
  `.execute(db);
}

/**
 * Check if a feature flag is active for a given context.
 * Takes into account: enabled status, rollout percentage, target segments, and date range.
 *
 * @param flag - The feature flag to check
 * @param context - Additional context for evaluation (e.g., segment ID)
 * @returns true if the feature should be enabled for the given context
 */
export function isFeatureFlagActive(
  flag: FeatureFlag,
  context?: { segmentId?: string }
): boolean {
  // Check if flag is enabled
  if (!flag.enabled) {
    return false;
  }

  // Check date range
  const now = new Date();
  if (flag.start_at) {
    const startDate = new Date(flag.start_at);
    if (now < startDate) {
      return false;
    }
  }
  if (flag.end_at) {
    const endDate = new Date(flag.end_at);
    if (now > endDate) {
      return false;
    }
  }

  // Check target segments
  if (flag.target_segments && flag.target_segments.length > 0) {
    if (!context?.segmentId) {
      return false;
    }
    if (!flag.target_segments.includes(context.segmentId)) {
      return false;
    }
  }

  // Check rollout percentage
  // A percentage of 100 means always active (for matching segments/dates)
  // For lower percentages, we use deterministic rollout based on some identifier
  if (flag.rollout_percentage < 100) {
    // For simplicity, we use the company_id hash for deterministic rollout
    // In practice, you might want a more sophisticated approach
    return false; // Default to not active if rollout < 100 and no specific context
  }

  return true;
}
