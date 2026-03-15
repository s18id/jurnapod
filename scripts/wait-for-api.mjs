#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env file if exists
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch (error) {
    // .env file not found, continue with system env vars
  }
}

loadEnv();

// Match the API server's env var usage (see apps/api/src/server.ts)
// PORT or API_PORT for the port number (default: 3001)
// HOST for the bind address (default: 0.0.0.0)
const API_PORT = process.env.PORT || process.env.API_PORT || "3001";
const API_HOST = process.env.HOST || "0.0.0.0";
const HEALTH_PATH = "/api/health";
const TIMEOUT_MS = 60000; // 60 seconds
const POLL_INTERVAL_MS = 1000; // 1 second

// Detect which service is waiting (from npm script name)
const serviceName = process.env.npm_lifecycle_event || "service";
const serviceLabel = serviceName.includes("backoffice") ? "backoffice" :
                     serviceName.includes("pos") ? "pos" : serviceName;

// For health checks, use localhost instead of 0.0.0.0
// (0.0.0.0 means "bind all interfaces" but we connect to localhost)
const healthCheckHost = API_HOST === "0.0.0.0" ? "127.0.0.1" : API_HOST;
const healthUrl = `http://${healthCheckHost}:${API_PORT}${HEALTH_PATH}`;

console.log(`[${serviceLabel}] Waiting for API health check: ${healthUrl}`);

const startTime = Date.now();

async function checkHealth() {
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000) // 5s per request
    });

    if (response.ok) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${serviceLabel}] ✓ API is ready (${elapsed}s)`);
      process.exit(0);
    }
  } catch (error) {
    // API not ready yet, will retry
  }

  const elapsed = Date.now() - startTime;
  if (elapsed > TIMEOUT_MS) {
    console.error(`[${serviceLabel}] ✗ Timeout waiting for API after ${TIMEOUT_MS / 1000}s`);
    console.error(`[${serviceLabel}]   Health URL: ${healthUrl}`);
    console.error(`[${serviceLabel}]   API should be listening on ${API_HOST}:${API_PORT}`);
    console.error(`[${serviceLabel}]   Check: curl ${healthUrl}`);
    process.exit(1);
  }

  // Retry
  setTimeout(checkHealth, POLL_INTERVAL_MS);
}

checkHealth();
