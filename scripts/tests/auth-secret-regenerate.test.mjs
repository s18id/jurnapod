import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const regenerateScriptPath = path.resolve(repoRoot, "scripts/auth-secret-regenerate.mjs");

test("auth-secret-regenerate writes exactly one FAILED audit entry when env file is missing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jp-auth-secret-regenerate-"));
  const runMarker = `missing-${Date.now().toString(36)}`;
  const missingEnvPath = path.resolve(tempRoot, `${runMarker}.env`);
  const expectedTargetPath = missingEnvPath;

  try {
    const result = spawnSync(process.execPath, [regenerateScriptPath, missingEnvPath], {
      cwd: tempRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);

    const logPath = path.resolve(tempRoot, "logs/security-events.log");
    const logContent = await readFile(logPath, "utf8");
    const entries = logContent
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    const failedRegenerateEntries = entries.filter(
      (entry) =>
        entry.event === "AUTH_SECRET_REGENERATE" &&
        entry.status === "FAILED" &&
        entry.targetPath === expectedTargetPath
    );

    assert.equal(failedRegenerateEntries.length, 1);
    assert.equal(failedRegenerateEntries[0].reason, "ENV_FILE_NOT_FOUND");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
