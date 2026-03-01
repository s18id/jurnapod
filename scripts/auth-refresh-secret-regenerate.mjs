import { readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { getSecretLogPath, writeSecretEvent } from "./auth-secret-log.mjs";

const ENV_KEY = "AUTH_REFRESH_SECRET";
const ENV_KEY_PATTERN = /^\s*(?:export\s+)?AUTH_REFRESH_SECRET\s*=/;
const AUTHORITATIVE_ENV_KEY_PATTERN = /^AUTH_REFRESH_SECRET=/;
const targetArg = process.argv[2];
const targetPath = path.resolve(process.cwd(), targetArg ?? ".env");
const secret = crypto.randomBytes(48).toString("base64url");
let failedEventWritten = false;

function createAuditError(reason, message) {
  const error = new Error(message);
  error.auditReason = reason;
  return error;
}

async function main() {
  let content;

  try {
    content = await readFile(targetPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw createAuditError("ENV_FILE_NOT_FOUND", `Env file not found: ${targetPath}`);
    }
    throw error;
  }

  const lines = content.split(/\r?\n/);
  let replaced = false;
  let entryCount = 0;

  const updatedLines = lines.reduce((accumulator, line) => {
    if (ENV_KEY_PATTERN.test(line)) {
      entryCount += 1;
      replaced = true;
      if (entryCount === 1) {
        accumulator.push(`${ENV_KEY}=${secret}`);
      }
      return accumulator;
    }
    accumulator.push(line);
    return accumulator;
  }, []);

  if (!replaced) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== "") {
      updatedLines.push("");
    }
    updatedLines.push(`${ENV_KEY}=${secret}`);
  }

  const updatedEntryCount = updatedLines.reduce(
    (count, line) => count + (AUTHORITATIVE_ENV_KEY_PATTERN.test(line) ? 1 : 0),
    0
  );

  if (updatedEntryCount !== 1) {
    throw createAuditError(
      "INTERNAL_VALIDATION_ERROR",
      `Expected exactly one ${ENV_KEY} entry, found ${updatedEntryCount}`
    );
  }

  await writeFile(targetPath, `${updatedLines.join("\n")}\n`, "utf8");

  await writeSecretEvent({
    event: "AUTH_REFRESH_SECRET_REGENERATE",
    status: "SUCCESS",
    targetPath,
    replaced,
    logPath: getSecretLogPath()
  });

  process.stdout.write(`Updated ${ENV_KEY} in ${targetPath}\n`);
  process.stdout.write("Restart API services so new token signing key is applied.\n");
  process.stdout.write(`Logged event to ${getSecretLogPath()}\n`);
}

async function writeFailedEventOnce(reason, message) {
  if (failedEventWritten) {
    return;
  }

  failedEventWritten = true;

  await writeSecretEvent({
    event: "AUTH_REFRESH_SECRET_REGENERATE",
    status: "FAILED",
    reason,
    targetPath,
    message,
    logPath: getSecretLogPath()
  });
}

main().catch(async (error) => {
  const reason =
    error && typeof error === "object" && "auditReason" in error && typeof error.auditReason === "string"
      ? error.auditReason
      : "UNEXPECTED_ERROR";

  try {
    await writeFailedEventOnce(reason, error?.message ?? String(error));
  } catch {
    // Ignore logging failures to preserve original error signal.
  }

  console.error(error.message);
  process.exit(1);
});
