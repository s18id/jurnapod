// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";

const PREVIEW_URL = "http://127.0.0.1:4173/";
const REPORT_BASE = ".lighthouseci/lighthouse-report";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed (code=${code ?? "null"}, signal=${signal ?? "none"})`));
    });
  });
}

async function waitForPreview(url, timeoutMs = 30_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // keep retrying
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Preview server not ready at ${url} within ${timeoutMs}ms`);
}

function spawnPreview() {
  return spawn("npm", ["run", "qa:pwa:preview"], {
    stdio: "inherit",
    shell: false,
    detached: true
  });
}

async function terminatePreview(preview) {
  if (!preview || preview.pid == null) {
    return;
  }

  try {
    process.kill(-preview.pid, "SIGTERM");
  } catch {
    preview.kill("SIGTERM");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function runLighthouse(chromePath) {
  await runCommand(
    "npm",
    [
      "exec",
      "lighthouse",
      "--",
      PREVIEW_URL,
      `--chrome-path=${chromePath}`,
      "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu",
      "--output=json",
      "--output=html",
      `--output-path=${REPORT_BASE}`,
      "--quiet"
    ],
    { stdio: "inherit" }
  );
}

async function verifyPwaSignals() {
  const reportJson = JSON.parse(await readFile(`${REPORT_BASE}.report.json`, "utf8"));
  const requests = reportJson?.audits?.["network-requests"]?.details?.items;
  if (!Array.isArray(requests)) {
    throw new Error("Lighthouse report missing network requests details");
  }

  const hasManifest = requests.some((req) => typeof req.url === "string" && req.url.includes("manifest.webmanifest"));
  if (!hasManifest) {
    throw new Error("Lighthouse report did not observe manifest.webmanifest request");
  }
}

async function main() {
  await mkdir(".lighthouseci", { recursive: true });
  await runCommand("npm", ["run", "qa:pwa:build"]);

  const chromePath = process.env.CHROME_PATH?.trim();
  if (!chromePath) {
    throw new Error("CHROME_PATH is required. Set it to a local Chrome/Chromium executable.");
  }

  const preview = spawnPreview();
  try {
    await waitForPreview(PREVIEW_URL);
    await runLighthouse(chromePath);
    await verifyPwaSignals();
  } finally {
    await terminatePreview(preview);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
