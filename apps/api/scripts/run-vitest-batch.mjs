#!/usr/bin/env node

import { createWriteStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const cwd = process.cwd();
const apiRoot = cwd;
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate free port"));
        return;
      }
      const port = address.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function startManagedServer(port) {
  const serverLogs = [];
  const childProcess = spawn(process.execPath, ["--import", "tsx", serverScriptPath], {
    cwd: apiRoot,
    env: { ...process.env, NODE_ENV: "test", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  childProcess.stdout?.on("data", (chunk) => {
    serverLogs.push(String(chunk));
    if (serverLogs.length > 300) serverLogs.shift();
  });
  childProcess.stderr?.on("data", (chunk) => {
    serverLogs.push(String(chunk));
    if (serverLogs.length > 300) serverLogs.shift();
  });

  return { childProcess, serverLogs };
}

async function waitForHealthcheck(baseUrl, childProcess, serverLogs, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (childProcess.exitCode != null) {
      throw new Error(`Managed server exited early: ${childProcess.exitCode}\n${serverLogs.join("")}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.status === 200) return;
    } catch {
      // startup race
    }
    await delay(400);
  }
  throw new Error(`Managed server healthcheck timeout\n${serverLogs.join("")}`);
}

async function stopManagedServer(childProcess) {
  if (!childProcess || childProcess.exitCode != null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        childProcess.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, 8000);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      childProcess.kill("SIGTERM");
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });

  try {
    childProcess.stdout?.destroy();
  } catch {
    // ignore
  }
  try {
    childProcess.stderr?.destroy();
  } catch {
    // ignore
  }
}

function parseArgs(argv) {
  const files = [];
  const passthrough = [];
  let logPath = null;
  let jsonPath = null;
  let managedServer = true;

  for (const arg of argv) {
    if (arg.startsWith("--log=")) {
      logPath = arg.slice("--log=".length);
      continue;
    }
    if (arg.startsWith("--json=")) {
      jsonPath = arg.slice("--json=".length);
      continue;
    }
    if (arg === "--no-managed-server") {
      managedServer = false;
      continue;
    }
    if (arg === "--managed-server") {
      managedServer = true;
      continue;
    }

    if (arg.endsWith(".test.ts") || arg.includes("__test__/")) {
      files.push(arg);
      continue;
    }

    passthrough.push(arg);
  }

  return { files, passthrough, logPath, jsonPath, managedServer };
}

function validateFiles(files) {
  const missing = [];
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.resolve(cwd, file);
    if (!existsSync(abs)) {
      missing.push(file);
    }
  }
  return missing;
}

async function run() {
  const { files, passthrough, logPath, jsonPath, managedServer } = parseArgs(process.argv.slice(2));

  if (files.length === 0) {
    console.error("Usage: npm run test:batch -w @jurnapod/api -- <file1> <file2> [--log=/tmp/api-batch.log] [--json=/tmp/api-batch.json] [--no-managed-server] [vitest args]");
    process.exit(2);
  }

  const missing = validateFiles(files);
  if (missing.length > 0) {
    console.error("These files were not found:");
    for (const m of missing) console.error(` - ${m}`);
    process.exit(2);
  }

  const args = ["run", ...files, ...passthrough];
  if (jsonPath) {
    args.push("--reporter=json", `--outputFile=${jsonPath}`);
  }

  console.log(`[batch] running ${files.length} file(s)`);
  console.log(`[batch] managedServer=${managedServer ? "on" : "off"}`);
  if (logPath) console.log(`[batch] log: ${logPath}`);
  if (jsonPath) console.log(`[batch] json: ${jsonPath}`);

  let managed = null;
  let managedBaseUrl = null;

  if (managedServer) {
    const port = await getFreePort();
    managedBaseUrl = `http://127.0.0.1:${port}`;
    managed = startManagedServer(port);
    await waitForHealthcheck(managedBaseUrl, managed.childProcess, managed.serverLogs);
    console.log(`[batch] managed API server: ${managedBaseUrl}`);
  }

  const childEnv = {
    ...process.env,
    ...(managedBaseUrl
      ? {
          JP_TEST_BASE_URL: managedBaseUrl,
          JP_TEST_ALLOW_LOCAL_SERVER: "0",
          JP_BATCH_MANAGED_SERVER: "1",
        }
      : {}),
  };

  const child = spawn("vitest", args, {
    cwd,
    env: childEnv,
    stdio: logPath ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  let tearingDown = false;
  const teardown = async (signal = null) => {
    if (tearingDown) return;
    tearingDown = true;
    try {
      if (child.exitCode == null) {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
      if (managed) {
        await stopManagedServer(managed.childProcess);
      }
    } finally {
      if (signal) process.exit(130);
    }
  };

  process.once("SIGINT", () => void teardown("SIGINT"));
  process.once("SIGTERM", () => void teardown("SIGTERM"));

  let logStream = null;
  if (logPath) {
    logStream = createWriteStream(logPath, { flags: "w" });
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });
  }

  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  if (managed) {
    await stopManagedServer(managed.childProcess);
  }

  if (logStream) {
    await new Promise((resolve) => logStream.end(resolve));
  }

  console.log(`[batch] exit=${exitCode}`);
  process.exit(exitCode);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
