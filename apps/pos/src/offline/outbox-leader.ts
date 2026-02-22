export type OutboxDrainLeaderMechanism = "WEB_LOCKS" | "LOCAL_STORAGE" | "IN_MEMORY";

export interface OutboxDrainLeaderResult<T> {
  acquired: boolean;
  mechanism: OutboxDrainLeaderMechanism;
  value: T | null;
}

export interface OutboxDrainLeaderOptions {
  lock_name?: string;
  lease_ms?: number;
  owner_id?: string;
  acquire_settle?: () => Promise<void>;
  now?: () => number;
  navigator?: NavigatorLike;
  storage?: StorageLike | null;
}

export interface OutboxDrainLeader {
  readonly owner_id: string;
  runIfLeader<T>(operation: () => Promise<T> | T): Promise<OutboxDrainLeaderResult<T>>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface NavigatorLike {
  locks?: LockManagerLike;
}

interface LockManagerLike {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: LockLike | null) => Promise<void> | void
  ): Promise<void>;
}

interface LockLike {
  readonly name: string;
}

interface StorageLeasePayload {
  owner_id: string;
  expires_at: number;
  ownership_token: string | null;
  lease_version: number | null;
}

const DEFAULT_LOCK_NAME = "jurnapod:pos:outbox-drainer";
const DEFAULT_LEASE_MS = 15_000;
const MIN_LEASE_RENEW_INTERVAL_MS = 25;
const heldInProcessLocks = new Set<string>();

function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function resolveStorageKey(lockName: string): string {
  return `${lockName}:leader`;
}

function resolveStorage(storageOverride: StorageLike | null | undefined): StorageLike | null {
  if (storageOverride !== undefined) {
    return storageOverride;
  }

  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    localStorage.getItem("__jurnapod_pos_lock_probe__");
    return localStorage;
  } catch {
    return null;
  }
}

function parseStorageLease(rawValue: string | null): StorageLeasePayload | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StorageLeasePayload>;
    if (typeof parsed.owner_id !== "string" || typeof parsed.expires_at !== "number" || !Number.isFinite(parsed.expires_at)) {
      return null;
    }

    let ownershipToken: string | null = null;
    if (typeof parsed.ownership_token === "string" && parsed.ownership_token.length > 0) {
      ownershipToken = parsed.ownership_token;
    }

    let leaseVersion: number | null = null;
    if (typeof parsed.lease_version === "number" && Number.isFinite(parsed.lease_version)) {
      leaseVersion = parsed.lease_version;
    }

    return {
      owner_id: parsed.owner_id,
      expires_at: parsed.expires_at,
      ownership_token: ownershipToken,
      lease_version: leaseVersion
    };
  } catch {
    return null;
  }
}

function createOwnershipToken(ownerId: string): string {
  return `${ownerId}:${crypto.randomUUID()}`;
}

function hasSameLeaseIdentity(left: StorageLeasePayload | null, right: StorageLeasePayload): boolean {
  if (!left) {
    return false;
  }

  return (
    left.owner_id === right.owner_id &&
    left.expires_at === right.expires_at &&
    left.ownership_token === right.ownership_token &&
    left.lease_version === right.lease_version
  );
}

function hasSameLeaseOwnership(left: StorageLeasePayload | null, right: StorageLeasePayload): boolean {
  if (!left) {
    return false;
  }

  if (left.owner_id !== right.owner_id) {
    return false;
  }

  if (left.ownership_token && right.ownership_token) {
    return left.ownership_token === right.ownership_token;
  }

  return hasSameLeaseIdentity(left, right);
}

async function tryAcquireStorageLease(
  storage: StorageLike,
  storageKey: string,
  ownerId: string,
  nowMs: number,
  leaseMs: number,
  settle: () => Promise<void>
): Promise<StorageLeasePayload | null> {
  const current = parseStorageLease(storage.getItem(storageKey));
  if (current && current.owner_id !== ownerId && current.expires_at > nowMs) {
    return null;
  }

  const next: StorageLeasePayload = {
    owner_id: ownerId,
    expires_at: nowMs + leaseMs,
    ownership_token: createOwnershipToken(ownerId),
    lease_version: (current?.lease_version ?? 0) + 1
  };

  storage.setItem(storageKey, JSON.stringify(next));

  const confirmed = parseStorageLease(storage.getItem(storageKey));
  if (!hasSameLeaseIdentity(confirmed, next)) {
    return null;
  }

  await settle();

  const settled = parseStorageLease(storage.getItem(storageKey));
  if (!hasSameLeaseIdentity(settled, next)) {
    return null;
  }

  return next;
}

function releaseStorageLease(storage: StorageLike, storageKey: string, lease: StorageLeasePayload): void {
  const current = parseStorageLease(storage.getItem(storageKey));
  if (hasSameLeaseOwnership(current, lease)) {
    storage.removeItem(storageKey);
  }
}

function renewStorageLease(
  storage: StorageLike,
  storageKey: string,
  lease: StorageLeasePayload,
  nowMs: number,
  leaseMs: number
): StorageLeasePayload | null {
  const current = parseStorageLease(storage.getItem(storageKey));
  if (!hasSameLeaseOwnership(current, lease)) {
    return null;
  }

  const next: StorageLeasePayload = {
    owner_id: lease.owner_id,
    expires_at: nowMs + leaseMs,
    ownership_token: lease.ownership_token,
    lease_version: (current?.lease_version ?? lease.lease_version ?? 0) + 1
  };

  storage.setItem(storageKey, JSON.stringify(next));

  const confirmed = parseStorageLease(storage.getItem(storageKey));
  if (!hasSameLeaseIdentity(confirmed, next)) {
    return null;
  }

  return next;
}

async function runWithInMemoryLease<T>(lockName: string, operation: () => Promise<T> | T): Promise<OutboxDrainLeaderResult<T>> {
  if (heldInProcessLocks.has(lockName)) {
    return {
      acquired: false,
      mechanism: "IN_MEMORY",
      value: null
    };
  }

  heldInProcessLocks.add(lockName);
  try {
    const value = await operation();
    return {
      acquired: true,
      mechanism: "IN_MEMORY",
      value
    };
  } finally {
    heldInProcessLocks.delete(lockName);
  }
}

async function runWithStorageLease<T>(
  storage: StorageLike,
  lockName: string,
  ownerId: string,
  leaseMs: number,
  now: () => number,
  settle: () => Promise<void>,
  operation: () => Promise<T> | T
): Promise<OutboxDrainLeaderResult<T>> {
  if (heldInProcessLocks.has(lockName)) {
    return {
      acquired: false,
      mechanism: "LOCAL_STORAGE",
      value: null
    };
  }

  const storageKey = resolveStorageKey(lockName);
  let heldLease: StorageLeasePayload | null = null;
  let hasInProcessLock = false;
  let renewLeaseIntervalId: ReturnType<typeof globalThis.setInterval> | null = null;
  try {
    heldLease = await tryAcquireStorageLease(storage, storageKey, ownerId, now(), leaseMs, settle);
    if (!heldLease) {
      return {
        acquired: false,
        mechanism: "LOCAL_STORAGE",
        value: null
      };
    }

    if (heldInProcessLocks.has(lockName)) {
      return {
        acquired: false,
        mechanism: "LOCAL_STORAGE",
        value: null
      };
    }

    heldInProcessLocks.add(lockName);
    hasInProcessLock = true;

    let activeLease = heldLease;
    const renewIntervalMs = Math.max(MIN_LEASE_RENEW_INTERVAL_MS, Math.floor(leaseMs / 3));
    renewLeaseIntervalId = globalThis.setInterval(() => {
      try {
        const renewedLease = renewStorageLease(storage, storageKey, activeLease, now(), leaseMs);
        if (renewedLease) {
          activeLease = renewedLease;
          heldLease = renewedLease;
        }
      } catch {
        // Best-effort renewal; deterministic lease checks still guard overlaps.
      }
    }, renewIntervalMs);

    const value = await operation();
    return {
      acquired: true,
      mechanism: "LOCAL_STORAGE",
      value
    };
  } finally {
    if (renewLeaseIntervalId !== null) {
      globalThis.clearInterval(renewLeaseIntervalId);
    }

    if (hasInProcessLock) {
      heldInProcessLocks.delete(lockName);
    }

    if (heldLease) {
      releaseStorageLease(storage, storageKey, heldLease);
    }
  }
}

async function runWithWebLocks<T>(
  lockManager: LockManagerLike,
  lockName: string,
  operation: () => Promise<T> | T
): Promise<OutboxDrainLeaderResult<T>> {
  let acquired = false;
  let value: T | null = null;

  await lockManager.request(lockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) {
      return;
    }

    acquired = true;
    value = await operation();
  });

  return {
    acquired,
    mechanism: "WEB_LOCKS",
    value
  };
}

export function outboxDrainStorageKey(lockName: string = DEFAULT_LOCK_NAME): string {
  return resolveStorageKey(lockName);
}

export function createOutboxDrainLeader(options: OutboxDrainLeaderOptions = {}): OutboxDrainLeader {
  const lockName = options.lock_name ?? DEFAULT_LOCK_NAME;
  const leaseMs = options.lease_ms ?? DEFAULT_LEASE_MS;
  const ownerId = options.owner_id ?? crypto.randomUUID();
  const settle = options.acquire_settle ?? nextTask;
  const now = options.now ?? Date.now;
  const navigatorRef = options.navigator ?? (typeof navigator === "undefined" ? undefined : navigator);
  const storageRef = resolveStorage(options.storage);

  return {
    owner_id: ownerId,
    async runIfLeader<T>(operation: () => Promise<T> | T): Promise<OutboxDrainLeaderResult<T>> {
      if (navigatorRef?.locks) {
        return runWithWebLocks(navigatorRef.locks, lockName, operation);
      }

      if (storageRef) {
        return runWithStorageLease(storageRef, lockName, ownerId, leaseMs, now, settle, operation);
      }

      return runWithInMemoryLease(lockName, operation);
    }
  };
}

const defaultOutboxDrainLeader = createOutboxDrainLeader();

export async function runOutboxDrainAsLeader<T>(
  operation: () => Promise<T> | T,
  leader: OutboxDrainLeader = defaultOutboxDrainLeader
): Promise<OutboxDrainLeaderResult<T>> {
  return leader.runIfLeader(operation);
}
