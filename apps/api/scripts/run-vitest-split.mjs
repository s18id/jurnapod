#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const TEST_ROOT = path.join(ROOT, "__test__");

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function isSlowTest(content) {
  const hasTimeoutConstant = /\bTEST_TIMEOUT_MS\b/m.test(content);
  const hasTimeoutOption = /\{[^{}]*\btimeout\s*:/m.test(content);
  const hasDeferMarker = /@defer\b|\bdeferred\b/m.test(content);
  return hasTimeoutConstant || hasTimeoutOption || hasDeferMarker;
}

async function classify(scope = "integration") {
  if (!new Set(["integration", "unit", "all"]).has(scope)) {
    throw new Error(`Invalid scope '${scope}'. Use one of: integration | unit | all`);
  }

  const baseDir = scope === "unit"
    ? path.join(TEST_ROOT, "unit")
    : scope === "all"
      ? TEST_ROOT
      : path.join(TEST_ROOT, "integration");

  const files = await walk(baseDir);
  const slow = [];
  const fast = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const rel = path.relative(ROOT, file);
    if (isSlowTest(content)) slow.push(rel);
    else fast.push(rel);
  }

  slow.sort();
  fast.sort();
  return { slow, fast, total: files.length, scope };
}

function runVitest(files, passthroughArgs = []) {
  return new Promise((resolve) => {
    const args = ["run", ...files, ...passthroughArgs];
    const child = spawn("vitest", args, { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const [, , mode = "list", ...rest] = process.argv;
  const scopeArg = rest.find((a) => a.startsWith("--scope="));
  const scope = scopeArg ? scopeArg.split("=")[1] : "integration";
  const writeLists = rest.includes("--write-lists");
  const verbose = rest.includes("--verbose");
  const split = rest.indexOf("--");
  const passthroughArgs = split >= 0 ? rest.slice(split + 1) : [];

  const { slow, fast, total } = await classify(scope);

  if (writeLists) {
    await writeFile(path.join(ROOT, ".test-slow.list"), `${slow.join("\n")}\n`, "utf8");
    await writeFile(path.join(ROOT, ".test-fast.list"), `${fast.join("\n")}\n`, "utf8");
  }

  if (mode === "list") {
    console.log(`[split] scope=${scope} total=${total} slow=${slow.length} fast=${fast.length}`);
    if (verbose) {
      console.log("\n[slow]");
      for (const f of slow) console.log(f);
      console.log("\n[fast]");
      for (const f of fast) console.log(f);
    }
    process.exit(0);
  }

  if (mode === "slow") {
    if (slow.length === 0) {
      console.error("[split] no slow tests found");
      process.exit(1);
    }
    const code = await runVitest(slow, passthroughArgs);
    process.exit(code);
  }

  if (mode === "fast") {
    if (fast.length === 0) {
      console.error("[split] no fast tests found");
      process.exit(1);
    }
    const code = await runVitest(fast, passthroughArgs);
    process.exit(code);
  }

  console.error(`Unknown mode '${mode}'. Use: list | slow | fast`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
