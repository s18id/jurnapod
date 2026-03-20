// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

function dbConfigFromEnv() {
  const port = Number(process.env.DB_PORT ?? "3306");
  if (Number.isNaN(port)) {
    throw new Error("DB_PORT must be a number");
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod",
    multipleStatements: true
  };
}

function resolveScriptPath(inputPath) {
  if (!inputPath) {
    throw new Error("Usage: npm run db:script -- <path-to-sql-file>");
  }

  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  const cwdPath = path.resolve(process.cwd(), inputPath);
  const repoRootPath = path.resolve(process.cwd(), "../../", inputPath);

  return inputPath.startsWith("packages/") ? repoRootPath : cwdPath;
}

function printResultSet(rows) {
  if (!Array.isArray(rows)) {
    return;
  }

  if (rows.length === 0) {
    console.log("(no rows)");
    return;
  }

  if (typeof rows[0] === "object" && rows[0] !== null && !Buffer.isBuffer(rows[0])) {
    console.table(rows);
    return;
  }

  console.log(rows);
}

async function main() {
  const scriptArg = process.argv[2];
  const scriptPath = resolveScriptPath(scriptArg);
  const sql = await readFile(scriptPath, "utf8");

  if (!sql.trim()) {
    throw new Error(`SQL script is empty: ${scriptPath}`);
  }

  const config = dbConfigFromEnv();
  const connection = await mysql.createConnection(config);

  try {
    const [results] = await connection.query(sql);
    const resultSets = Array.isArray(results) ? results : [results];

    for (const result of resultSets) {
      if (Array.isArray(result)) {
        printResultSet(result);
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("db:script failed");
  console.error(error.message);
  process.exitCode = 1;
});
