// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

#!/usr/bin/env node
/**
 * Quick smoke test for sales endpoints - validates server can start and endpoints respond
 * This is a lightweight test to ensure the full test suite won't hang
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const nextCliPath = path.resolve(repoRoot, "node_modules/next/dist/bin/next");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function testServerStartup() {
  console.log('🧪 Quick smoke test for sales integration tests\n');
  
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  
  console.log(`Starting server on port ${port}...`);
  
  const childProcess = spawn(
    process.execPath,
    [nextCliPath, "dev", "-p", String(port)],
    {
      cwd: apiRoot,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const logs = [];
  childProcess.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  childProcess.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  let serverReady = false;
  const start = Date.now();
  const timeout = 60000;

  while (Date.now() - start < timeout && !serverReady) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${baseUrl}/api/health`, {
        method: "GET",
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        serverReady = true;
        console.log(`✅ Server ready in ${Date.now() - start}ms`);
      }
    } catch (err) {
      // Still waiting
    }
    
    if (!serverReady) {
      await delay(500);
    }
  }

  if (!serverReady) {
    console.error('❌ Server failed to start within timeout');
    console.error('Recent logs:', logs.slice(-10).join('\n'));
    childProcess.kill("SIGKILL");
    process.exit(1);
  }

  // Test health endpoint
  console.log('\n📍 Testing /api/health...');
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthOk = healthRes.ok;
  console.log(healthOk ? '✅ Health endpoint OK' : '❌ Health endpoint failed');

  // Test sales invoices endpoint (should require auth)
  console.log('\n📍 Testing /api/sales/invoices (should return 401)...');
  const invoicesRes = await fetch(`${baseUrl}/api/sales/invoices`);
  const invoicesUnauth = invoicesRes.status === 401;
  console.log(invoicesUnauth ? '✅ Invoices endpoint requires auth' : `❌ Unexpected status: ${invoicesRes.status}`);

  // Test sales payments endpoint (should require auth)
  console.log('\n📍 Testing /api/sales/payments (should return 401)...');
  const paymentsRes = await fetch(`${baseUrl}/api/sales/payments`);
  const paymentsUnauth = paymentsRes.status === 401;
  console.log(paymentsUnauth ? '✅ Payments endpoint requires auth' : `❌ Unexpected status: ${paymentsRes.status}`);

  // Cleanup
  console.log('\n🧹 Stopping server...');
  childProcess.kill("SIGTERM");
  
  await new Promise((resolve) => {
    childProcess.once("exit", resolve);
    setTimeout(() => {
      childProcess.kill("SIGKILL");
      resolve();
    }, 3000);
  });

  const allPassed = healthOk && invoicesUnauth && paymentsUnauth;
  
  if (allPassed) {
    console.log('\n✅ All smoke tests passed! Full integration tests should work.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some smoke tests failed. Check the output above.\n');
    process.exit(1);
  }
}

testServerStartup().catch((err) => {
  console.error('💥 Smoke test failed:', err);
  process.exit(1);
});
