import mysql, { type Pool } from "mysql2/promise";
import { getAppEnv } from "./env";

const globalForDb = globalThis as typeof globalThis & {
  __jurnapodApiDbPool?: Pool;
};

export function getDbPool(): Pool {
  if (globalForDb.__jurnapodApiDbPool) {
    return globalForDb.__jurnapodApiDbPool;
  }

  const env = getAppEnv();
  const pool = mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    queueLimit: 0
  });

  globalForDb.__jurnapodApiDbPool = pool;
  return pool;
}
