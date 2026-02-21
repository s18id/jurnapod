import bcrypt from "bcryptjs";
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
    database: process.env.DB_NAME ?? "jurnapod"
  };
}

function smokeConfigFromEnv() {
  return {
    companyCode: process.env.JP_COMPANY_CODE ?? "JP",
    outletCode: process.env.JP_OUTLET_CODE ?? "MAIN",
    ownerEmail: process.env.JP_OWNER_EMAIL ?? "owner@local",
    ownerPassword: process.env.JP_OWNER_PASSWORD ?? "ChangeMe123!"
  };
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const smokeConfig = smokeConfigFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [ownerRows] = await connection.execute(
      `SELECT u.id, u.password_hash, c.id AS company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE c.code = ? AND u.email = ?
       LIMIT 1`,
      [smokeConfig.companyCode, smokeConfig.ownerEmail]
    );

    const owner = ownerRows[0];
    if (!owner) {
      throw new Error("owner row not found for configured company/email");
    }

    const passwordMatches = await bcrypt.compare(
      smokeConfig.ownerPassword,
      owner.password_hash
    );
    if (!passwordMatches) {
      throw new Error("owner password hash does not match configured password");
    }

    const [ownerRoleRows] = await connection.execute(
      `SELECT 1
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.code = 'OWNER'
       LIMIT 1`,
      [owner.id]
    );
    if (ownerRoleRows.length === 0) {
      throw new Error("user_roles relation missing OWNER membership");
    }

    const [ownerOutletRows] = await connection.execute(
      `SELECT 1
       FROM user_outlets uo
       INNER JOIN outlets o ON o.id = uo.outlet_id
       WHERE uo.user_id = ? AND o.company_id = ? AND o.code = ?
       LIMIT 1`,
      [owner.id, owner.company_id, smokeConfig.outletCode]
    );
    if (ownerOutletRows.length === 0) {
      throw new Error("user_outlets relation missing default outlet membership");
    }

    console.log("smoke checks passed");
    console.log(`owner=${smokeConfig.ownerEmail} company=${smokeConfig.companyCode}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("smoke checks failed");
  console.error(error.message);
  process.exitCode = 1;
});
