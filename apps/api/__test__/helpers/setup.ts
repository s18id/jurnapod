// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * In-Process Test Server with File-Based RWLock Pattern
 * 
 * This module provides a shared test HTTP server that multiple test processes
 * can coordinate via file-based locking (using proper-lockfile).
 * 
 * - The first process to acquire the lock starts the server
 * - Other processes wait for the lock, then connect to the existing server
 * - The lock is released when all processes release their locks (or exit)
 * 
 * Usage:
 * ```typescript
 * import { acquireReadLock, releaseReadLock } from './helpers/setup';
 * 
 * let baseUrl: string;
 * beforeAll(async () => { baseUrl = await acquireReadLock(); });
 * afterAll(async () => { await releaseReadLock(); });
 * 
 * it('makes HTTP request', async () => {
 *   const res = await fetch(`${baseUrl}/api/health`);
 *   expect(res.ok).toBe(true);
 * });
 * ```
 */

import { createServer, type Server } from 'node:http';
import properLockfile from 'proper-lockfile';
import path from 'node:path';
import fs from 'node:fs';

// =============================================================================
// Constants
// =============================================================================

const LOCK_FILE_PATH = '/tmp/jurnapod-test-server.lock';
const SERVER_INFO_FILE = '/tmp/jurnapod-test-server.json';

// =============================================================================
// In-Memory RWLock State (within a single process)
// =============================================================================

let serverInstance: Server | null = null;
let isReady: boolean = false;
let appFetch: ((request: Request) => Response | Promise<Response>) | null = null;
let actualServerPort: number = 0;

// RWLock: readers count and lock promise for write exclusion (in-memory per process)
let readLockCount: number = 0;
let writeLockResolve: (() => void) | null = null;
let serverStartPromise: Promise<string> | null = null;

// File lock release function (set when we hold the file lock)
let fileLockRelease: (() => Promise<void>) | null = null;

// =============================================================================
// Server Info File (for sharing port between processes)
// =============================================================================

interface ServerInfo {
  port: number;
  pid: number;
  startedAt: number;
}

function readServerInfo(): ServerInfo | null {
  try {
    if (!fs.existsSync(SERVER_INFO_FILE)) {
      return null;
    }
    const content = fs.readFileSync(SERVER_INFO_FILE, 'utf-8');
    return JSON.parse(content) as ServerInfo;
  } catch {
    return null;
  }
}

function writeServerInfo(port: number): void {
  const info: ServerInfo = {
    port,
    pid: process.pid,
    startedAt: Date.now()
  };
  fs.writeFileSync(SERVER_INFO_FILE, JSON.stringify(info), 'utf-8');
}

function removeServerInfo(): void {
  try {
    if (fs.existsSync(SERVER_INFO_FILE)) {
      fs.unlinkSync(SERVER_INFO_FILE);
    }
  } catch {
    // Ignore errors
  }
}

// =============================================================================
// In-Memory RWLock (within a single process)
// =============================================================================

/**
 * Get test server port from env or 0 (OS assigns)
 */
function getTestPort(): number {
  const port = process.env.JP_TEST_PORT;
  return port ? Number(port) : 0;
}

/**
 * RWLock: Acquire a read lock on the shared test server (in-memory).
 * Multiple tests within the same process can hold read locks simultaneously.
 * The server starts on first read lock acquisition.
 * 
 * @returns The base URL of the test server
 */
export async function acquireReadLock(): Promise<string> {
  // If a write lock is in progress within this process, wait for it
  if (writeLockResolve) {
    await new Promise<void>((resolve) => {
      const oldResolve = writeLockResolve!;
      writeLockResolve = () => {
        oldResolve();
        resolve();
      };
    });
  }

  readLockCount++;

  // If this is the first reader, start the server
  if (readLockCount === 1 && !serverInstance) {
    serverStartPromise = startServerInternal();
    try {
      await serverStartPromise;
    } catch (error) {
      readLockCount--;
      throw error;
    }
  } else if (serverInstance && !isReady && serverStartPromise) {
    // Server is starting, wait for it
    await serverStartPromise;
  }

  // Return the actual port the server is listening on
  return `http://127.0.0.1:${actualServerPort}`;
}

/**
 * RWLock: Release a read lock.
 * When all read locks are released, the server is stopped.
 */
export async function releaseReadLock(): Promise<void> {
  if (readLockCount <= 0) {
    console.warn('releaseReadLock called but no locks held');
    return;
  }

  readLockCount--;

  // If this is the last reader, stop the server
  if (readLockCount === 0) {
    await stopServerInternal();
  }
}

/**
 * Check if the test server is currently running
 */
export function isTestServerRunning(): boolean {
  return serverInstance !== null && isReady;
}

/**
 * Get current read lock count (useful for debugging)
 */
export function getReadLockCount(): number {
  return readLockCount;
}

// =============================================================================
// Internal Server Management
// =============================================================================

async function startServerInternal(): Promise<string> {
  const requestedPort = getTestPort();

  // Import the app from app.ts (not server.ts - server starts HTTP listener)
  try {
    const appModule = await import('../../src/app.js');
    appFetch = appModule.app?.fetch;
    if (!appFetch) {
      throw new Error('app.ts does not export app');
    }
  } catch (error) {
    throw new Error(`Failed to import app from app.ts: ${error}`);
  }

  return new Promise<string>((resolve, reject) => {
    serverInstance = createServer(async (req, res) => {
      if (!appFetch) {
        res.statusCode = 500;
        res.end('Server not initialized');
        return;
      }

      try {
        // Build URL
        const host = req.headers.host ?? `localhost:${actualServerPort}`;
        const protocol = 'http:';
        const url = `${protocol}//${host}${req.url}`;

        // Convert headers
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              for (const v of value) {
                headers.append(key, v);
              }
            } else {
              headers.set(key, value);
            }
          }
        }

        // Read body
        const chunks: Buffer[] = [];
        const nodeReq = req as any;
        nodeReq.on('data', (chunk: Buffer) => chunks.push(chunk));
        const body: Buffer | undefined = await new Promise((resolve) => {
          nodeReq.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
          nodeReq.on('error', () => resolve(undefined));
        });

        // Create request
        const requestInit: RequestInit = {
          method: req.method,
          headers,
        };
        if (body && req.method !== 'GET' && req.method !== 'HEAD') {
          (requestInit as any).body = body;
          (requestInit as any).duplex = 'half';
        }

        const request = new Request(url, requestInit);

        // Call app.fetch
        const response = await appFetch(request);

        // Write response
        res.statusCode = response.status;
        response.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });

        if (response.body) {
          const reader = (response.body as any).getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
          } finally {
            reader.releaseLock();
          }
        }
        res.end();
      } catch (error) {
        console.error('Test server request error:', error);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      }
    });

    serverInstance.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${requestedPort} is already in use`));
      } else {
        reject(error);
      }
    });

    serverInstance.listen(requestedPort, '127.0.0.1', () => {
      const address = serverInstance!.address();
      actualServerPort = typeof address === 'object' && address?.port ? address.port : requestedPort;
      isReady = true;
      resolve(`http://127.0.0.1:${actualServerPort}`);
    });
  });
}

async function stopServerInternal(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverInstance) {
      resolve();
      return;
    }

    // Signal write lock start
    let writeLockDone = false;
    const cleanup = () => {
      if (!writeLockDone) {
        writeLockDone = true;
        serverInstance = null;
        isReady = false;
        appFetch = null;
        serverStartPromise = null;
        if (writeLockResolve) {
          writeLockResolve();
          writeLockResolve = null;
        }
      }
    };

    serverInstance.close(() => {
      cleanup();
      resolve();
    });

    // Force close after 5 seconds
    setTimeout(() => {
      cleanup();
      resolve();
    }, 5000);
  });
}

// =============================================================================
// File-Based Lock Coordination (across processes)
// =============================================================================

/**
 * Acquire a file-based lock for coordinating test server startup across processes.
 * 
 * If the server is already running (from another process), this waits and returns
 * the existing server's URL.
 * 
 * If this process is the first to acquire the lock, it starts the server.
 * 
 * @returns The base URL of the test server
 */
export async function acquireFileLock(): Promise<string> {
  // First, try to read existing server info (from another process)
  const existingInfo = readServerInfo();
  
  if (existingInfo) {
    // Check if the existing process is still running
    try {
      process.kill(existingInfo.pid, 0);
      // Process exists, wait for lock release with a timeout
      console.log(`[Setup] Server already running on port ${existingInfo.port}, waiting for lock...`);
    } catch {
      // Process doesn't exist, remove stale info
      removeServerInfo();
    }
  }

  // Try to acquire the lock file
  try {
    // Use proper-lockfile with updateLockFile to track our lock
    const releaseLock = await properLockfile.lock(LOCK_FILE_PATH, {
      retries: {
        retries: 50,
        minTimeout: 100,
        maxTimeout: 2000
      },
      stale: 15000, // Lock is stale after 15 seconds
      update: 5000 // Update lock file every 5 seconds
    });

    fileLockRelease = releaseLock;
    console.log('[Setup] Acquired file lock');
  } catch (error) {
    // Could not acquire lock - server is starting elsewhere
    // Wait a bit and read the server info
    console.log('[Setup] Could not acquire lock, waiting for server...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const serverInfo = readServerInfo();
    if (serverInfo) {
      return `http://127.0.0.1:${serverInfo.port}`;
    }
    
    throw new Error('Failed to acquire lock and no server info available');
  }

  // We hold the lock - check if we need to start the server
  const serverInfo = readServerInfo();
  
  if (serverInfo) {
    // Server already running, release lock immediately but keep in-memory lock
    console.log(`[Setup] Server already running on port ${serverInfo.port}`);
    if (fileLockRelease) {
      await fileLockRelease();
      fileLockRelease = null;
    }
    return `http://127.0.0.1:${serverInfo.port}`;
  }

  // We need to start the server
  console.log('[Setup] Starting test server...');
  
  try {
    // Start server synchronously - we already hold the file lock
    const url = await startServerInternal();
    const port = actualServerPort;
    
    // Write server info so other processes can find us
    writeServerInfo(port);
    
    // Release the file lock - other processes can now acquire their own read locks
    // but the server stays running
    if (fileLockRelease) {
      await fileLockRelease();
      fileLockRelease = null;
    }
    
    console.log(`[Setup] Server started on port ${port}`);
    return url;
  } catch (error) {
    // Failed to start - release lock
    if (fileLockRelease) {
      await fileLockRelease();
      fileLockRelease = null;
    }
    throw error;
  }
}

/**
 * Release the file lock and clean up server info if we started the server.
 * 
 * WARNING: This should only be called by the process that started the server,
 * and only when all tests are completely done (not just this test file).
 */
export async function releaseFileLock(): Promise<void> {
  if (fileLockRelease) {
    await fileLockRelease();
    fileLockRelease = null;
  }
  
  // Clean up server info if we own the lock
  removeServerInfo();
}

// =============================================================================
// Cleanup on process exit
// =============================================================================

// Ensure locks are released on exit
process.on('exit', () => {
  if (fileLockRelease) {
    // Synchronous cleanup not possible, but at least log it
    console.log('[Setup] Process exiting, file lock will be cleaned up by stale timeout');
  }
});

// Handle SIGINT/SIGTERM
process.on('SIGINT', async () => {
  console.log('[Setup] Received SIGINT');
  if (readLockCount > 0) {
    await releaseReadLock();
  }
  if (fileLockRelease) {
    await releaseFileLock();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Setup] Received SIGTERM');
  if (readLockCount > 0) {
    await releaseReadLock();
  }
  if (fileLockRelease) {
    await releaseFileLock();
  }
  process.exit(0);
});