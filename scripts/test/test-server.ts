// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Standalone Test Server - Run this before tests, stop after
// Usage: npx tsx scripts/test/test-server.ts
// 
// This starts the API server on a fixed port for integration tests.
// Tests connect via HTTP without managing the server lifecycle.

import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_SERVER_PORT ?? '3003');
const HOST = '127.0.0.1';

// Dynamically import from apps/api
async function main() {
  const { app } = await import('../../apps/api/src/app.js');
  const { assertAppEnvReady } = await import('../../apps/api/src/lib/env.js');
  
  assertAppEnvReady();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    
    // Skip logging for health checks
    if (url.pathname !== '/api/health') {
      console.log(`[TestServer] ${req.method} ${url.pathname}`);
    }

    // Build headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    // Create request
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    // Get response
    const response = await app.fetch(request);

    // Write response
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
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
  });

  server.listen(PORT, HOST, () => {
    console.log(`[TestServer] Running at http://${HOST}:${PORT}`);
    console.log(`[TestServer] Press Ctrl+C to stop`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[TestServer] Shutting down...');
    server.close(() => {
      console.log('[TestServer] Stopped');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n[TestServer] Shutting down...');
    server.close(() => {
      console.log('[TestServer] Stopped');
      process.exit(0);
    });
  });
}

main().catch(console.error);
