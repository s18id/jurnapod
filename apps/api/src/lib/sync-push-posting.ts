import type { PoolConnection } from "mysql2/promise";

const DEFAULT_SYNC_PUSH_POSTING_MODE = "disabled" as const;
const SYNC_PUSH_POSTING_MODE_ENV_KEY = "SYNC_PUSH_POSTING_MODE";

export type SyncPushPostingMode = "disabled" | "shadow";

export interface SyncPushPostingContext {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  trxAt: string;
  posTransactionId: number;
}

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

export class SyncPushPostingHookError extends Error {
  readonly mode: SyncPushPostingMode;
  readonly cause: unknown;

  constructor(mode: SyncPushPostingMode, cause: unknown) {
    super("SYNC_PUSH_POSTING_HOOK_FAILED");
    this.name = "SyncPushPostingHookError";
    this.mode = mode;
    this.cause = cause;
  }
}

function resolveSyncPushPostingMode(): SyncPushPostingMode {
  const rawMode = process.env[SYNC_PUSH_POSTING_MODE_ENV_KEY];
  if (!rawMode) {
    return DEFAULT_SYNC_PUSH_POSTING_MODE;
  }

  const normalized = rawMode.trim().toLowerCase();
  if (normalized === "disabled" || normalized === "shadow") {
    return normalized;
  }

  console.warn("Invalid sync push posting mode, falling back to disabled", {
    env_key: SYNC_PUSH_POSTING_MODE_ENV_KEY,
    env_value: rawMode,
    fallback_mode: DEFAULT_SYNC_PUSH_POSTING_MODE
  });
  return DEFAULT_SYNC_PUSH_POSTING_MODE;
}

async function runShadowPostingHook(_dbExecutor: QueryExecutor, _context: SyncPushPostingContext): Promise<void> {
  return;
}

/*
Error handling strategy:
- disabled (default): preserve current M4 behavior (audit-only, no posting side effects).
- shadow: run a non-mutating hook; on failure caller records diagnostics and keeps sync result unchanged.
*/
export async function runSyncPushPostingHook(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<SyncPushPostingMode> {
  const mode = resolveSyncPushPostingMode();
  if (mode === "disabled") {
    return mode;
  }

  try {
    await runShadowPostingHook(dbExecutor, context);
    return mode;
  } catch (error) {
    throw new SyncPushPostingHookError(mode, error);
  }
}
