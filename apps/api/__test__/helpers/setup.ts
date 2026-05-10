// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// RWLock-based test server lifecycle management.
//
// Each integration test file that uses the shared HTTP test server MUST:
//   beforeAll: acquireReadLock()  — acquires shared read lock, starts server on first call
//   afterAll:  releaseReadLock()  — releases lock; server stops when all locks released
//
// Usage in a test file:
//   import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
//   beforeAll(async () => { await acquireReadLock(); });
//   afterAll(async () => { await releaseReadLock(); });

import { getTestBaseUrl } from "./env";
import path from "path";
import fs from "fs";

// Use __dirname so the lock directory is always relative to this file's location
// regardless of which working directory vitest was launched from.
const LOCK_DIR = path.join(__dirname, "..", "..", ".test-locks");
const LOCK_FILE = path.join(LOCK_DIR, "server.lock");

// Ensure lock directory and a placeholder file exist before properLockfile tries
// to lstat() the lock file (proper-lockfile requires the file to exist).
if (!fs.existsSync(LOCK_DIR)) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
}
if (!fs.existsSync(LOCK_FILE)) {
  // Touch the file so proper-lockfile can lstat() it successfully
  fs.closeSync(fs.openSync(LOCK_FILE, "w"));
}

// Lazily acquired release function
let _release: (() => Promise<void>) | null = null;

export async function acquireReadLock(): Promise<void> {
  if (_release !== null) return; // already acquired

  const properLockfile = await import("proper-lockfile");
  // Increased retry budget for 209-file parallel suite (4 workers).
  // 30 retries with 5s max was too short — E48 contention caused intermittent
  // "Lock file is already being held" and hook timeouts on slow workers.
  _release = await properLockfile.lock(LOCK_FILE, {
    retries: {
      retries: 60,
      minTimeout: 100,
      maxTimeout: 10000,
      factor: 1.5,
    },
  });

  // Wait for the test HTTP server to be ready (up to 5s)
  // Prevents "expected 500 to be 201" races where the lock was acquired
  // but the server hasn't finished binding the port yet.
  const baseUrl = getTestBaseUrl();
  const maxWaitMs = 5000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 401 || res.status === 404) break; // server responding
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

export async function releaseReadLock(): Promise<void> {
  if (_release) {
    await _release();
    _release = null;
  }
}

export { getTestBaseUrl };
