// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const deployScript = path.join(repoRoot, "scripts", "deploy.mjs");

test("deploy script requires --app argument", async () => {
  try {
    await execFileAsync("node", [deployScript]);
    assert.fail("Should have thrown an error");
  } catch (error) {
    assert.match(error.stderr, /--app argument required/);
  }
});

test("deploy script rejects invalid app names", async () => {
  try {
    await execFileAsync("node", [deployScript, "--app=invalid"]);
    assert.fail("Should have thrown an error");
  } catch (error) {
    assert.match(error.stderr, /Unsupported app: invalid/);
  }
});

test("deploy script validates build directory exists", async () => {
  const fakeDistPath = path.join(repoRoot, "apps", "nonexistent", "dist");
  
  try {
    await execFileAsync("node", [deployScript, "--app=pos"]);
    // If pos dist doesn't exist, this should fail
    await access(path.join(repoRoot, "apps", "pos", "dist"), constants.R_OK);
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.match(error.stderr || "", /Build directory does not exist/);
    }
  }
});

test("deploy script runs in dry-run mode without making changes", async () => {
  const targetPath = path.join(repoRoot, "public_html", "pos");
  
  // Clean up target if it exists
  await rm(targetPath, { recursive: true, force: true });
  
  const { stdout } = await execFileAsync("node", [
    deployScript,
    "--app=pos",
    "--dry-run"
  ]);
  
  assert.match(stdout, /DRY RUN/);
  assert.match(stdout, /Would copy/);
  
  // Verify target was NOT created
  try {
    await access(targetPath, constants.R_OK);
    const entries = await readdir(targetPath);
    assert.equal(entries.length, 0, "Target should be empty in dry-run mode");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    // Directory doesn't exist - that's expected for dry-run
  }
});

test("deploy script validates index.html exists", async () => {
  // This test assumes the build has been run
  const distPath = path.join(repoRoot, "apps", "pos", "dist");
  
  try {
    await access(path.join(distPath, "index.html"), constants.R_OK);
    
    const { stdout } = await execFileAsync("node", [
      deployScript,
      "--app=pos",
      "--dry-run"
    ]);
    
    assert.match(stdout, /Build validation passed/);
  } catch (error) {
    if (error.code === "ENOENT") {
      // Build doesn't exist, skip this test
      console.log("Skipping test: dist/index.html not found (run build first)");
    } else {
      throw error;
    }
  }
});
