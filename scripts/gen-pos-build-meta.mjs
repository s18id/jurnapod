#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const formatArg = argv.find((arg) => arg.startsWith("--format="));
  return {
    format: formatArg ? formatArg.slice("--format=".length) : "shell"
  };
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function utcBuildTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds())
  ].join("");
}

async function readAppVersion(repoRoot) {
  const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  const version = String(pkg.version ?? "").trim();
  if (!version) {
    throw new Error("package.json version is missing");
  }
  return version;
}

async function readShortSha(repoRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot
    });
    const sha = stdout.trim();
    if (!sha) {
      return null;
    }
    return sha;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");

  const appVersion = await readAppVersion(repoRoot);
  const shortSha = await readShortSha(repoRoot);
  const buildNumber = shortSha ?? utcBuildTimestamp();

  if (args.format === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          VITE_APP_VERSION: appVersion,
          VITE_BUILD_NUMBER: buildNumber
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (args.format !== "shell") {
    throw new Error(`unsupported format: ${args.format}`);
  }

  process.stdout.write(
    [
      `export VITE_APP_VERSION=${shellEscape(appVersion)}`,
      `export VITE_BUILD_NUMBER=${shellEscape(buildNumber)}`
    ].join("\n") + "\n"
  );
}

main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exit(1);
});
