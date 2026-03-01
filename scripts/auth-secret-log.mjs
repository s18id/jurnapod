import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const logDirectory = path.resolve(process.cwd(), "logs");
const logPath = path.join(logDirectory, "security-events.log");

export async function writeSecretEvent(event) {
  const payload = {
    timestamp: new Date().toISOString(),
    actor: process.env.USER ?? process.env.USERNAME ?? "unknown",
    host: os.hostname(),
    ...event
  };

  await mkdir(logDirectory, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

export function getSecretLogPath() {
  return logPath;
}
