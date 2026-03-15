// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const waitScript = path.join(repoRoot, "scripts", "wait-for-api.mjs");

test("multiple wait-for-api instances can run concurrently", async () => {
  // Start two instances concurrently (simulating backoffice and pos)
  const backoffice = spawn("node", [waitScript], {
    env: { ...process.env, npm_lifecycle_event: "dev:backoffice:wait" },
    timeout: 3000
  });

  const pos = spawn("node", [waitScript], {
    env: { ...process.env, npm_lifecycle_event: "dev:pos:wait" },
    timeout: 3000
  });

  // Collect output
  let backofficeOutput = "";
  let posOutput = "";

  backoffice.stdout.on("data", (data) => {
    backofficeOutput += data.toString();
  });

  pos.stdout.on("data", (data) => {
    posOutput += data.toString();
  });

  // Wait for both to timeout (since API isn't running)
  await Promise.all([
    new Promise((resolve) => backoffice.on("exit", resolve)),
    new Promise((resolve) => pos.on("exit", resolve))
  ]);

  // Verify each instance labeled its output correctly
  assert.match(backofficeOutput, /\[backoffice\]/);
  assert.match(posOutput, /\[pos\]/);

  // Verify both were waiting for the same health endpoint
  assert.match(backofficeOutput, /Waiting for API health check/);
  assert.match(posOutput, /Waiting for API health check/);
});

test("wait-for-api uses correct environment variables", async () => {
  const customPort = "9999";
  const customHost = "localhost";

  const proc = spawn("node", [waitScript], {
    env: {
      ...process.env,
      PORT: customPort,
      HOST: customHost,
      npm_lifecycle_event: "test"
    },
    timeout: 2000
  });

  let output = "";
  proc.stdout.on("data", (data) => {
    output += data.toString();
  });

  await new Promise((resolve) => proc.on("exit", resolve));

  // Verify custom port and host were used
  assert.match(output, new RegExp(`http://${customHost}:${customPort}/api/health`));
});

test("wait-for-api respects default port and host when not configured", async () => {
  const proc = spawn("node", [waitScript], {
    env: {
      PATH: process.env.PATH,
      npm_lifecycle_event: "test"
      // No PORT or HOST set
    },
    timeout: 2000
  });

  let output = "";
  proc.stdout.on("data", (data) => {
    output += data.toString();
  });

  await new Promise((resolve) => proc.on("exit", resolve));

  // Verify defaults: HOST=0.0.0.0 → healthcheck uses 127.0.0.1, PORT=3001
  assert.match(output, /http:\/\/127\.0\.0\.1:3001\/api\/health/);
});

test("wait-for-api translates 0.0.0.0 to localhost for health check", async () => {
  const proc = spawn("node", [waitScript], {
    env: {
      ...process.env,
      HOST: "0.0.0.0",
      PORT: "3001",
      npm_lifecycle_event: "test"
    },
    timeout: 2000
  });

  let output = "";
  proc.stdout.on("data", (data) => {
    output += data.toString();
  });

  await new Promise((resolve) => proc.on("exit", resolve));

  // When API binds to 0.0.0.0, health check should use 127.0.0.1
  assert.match(output, /http:\/\/127\.0\.0\.1:3001\/api\/health/);
});
