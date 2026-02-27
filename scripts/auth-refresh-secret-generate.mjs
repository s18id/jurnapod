import crypto from "node:crypto";
import { getSecretLogPath, writeSecretEvent } from "./auth-secret-log.mjs";

async function main() {
  const byteLengthArg = process.argv[2];
  const byteLength = byteLengthArg ? Number(byteLengthArg) : 48;

  if (!Number.isInteger(byteLength) || byteLength < 32) {
    await writeSecretEvent({
      event: "AUTH_REFRESH_SECRET_GENERATE",
      status: "FAILED",
      reason: "INVALID_BYTE_LENGTH",
      byteLength: byteLengthArg ?? null,
      logPath: getSecretLogPath()
    });
    console.error("Invalid byte length. Use an integer >= 32.");
    process.exit(1);
  }

  const secret = crypto.randomBytes(byteLength).toString("base64url");

  await writeSecretEvent({
    event: "AUTH_REFRESH_SECRET_GENERATE",
    status: "SUCCESS",
    byteLength,
    logPath: getSecretLogPath()
  });

  process.stdout.write(`${secret}\n`);
  process.stderr.write(`Logged event to ${getSecretLogPath()}\n`);
}

main().catch(async (error) => {
  try {
    await writeSecretEvent({
      event: "AUTH_REFRESH_SECRET_GENERATE",
      status: "FAILED",
      reason: "UNEXPECTED_ERROR",
      message: error?.message ?? String(error),
      logPath: getSecretLogPath()
    });
  } catch {
    // Ignore logging failures to preserve original error signal.
  }

  console.error(error?.message ?? String(error));
  process.exit(1);
});
