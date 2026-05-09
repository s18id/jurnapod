import mysql from "mysql2/promise";

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? "3306"),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod",
  });

  console.log("=== Modules table ===");
  const [mods] = await db.execute("SELECT code, name FROM modules ORDER BY code");
  for (const row of mods) {
    console.log(`  ${row.code}: ${row.name}`);
  }

  console.log("\n=== module_roles: treasury by role ===");
  const [treasuryRows] = await db.execute(
    `SELECT r.code as role_code, mr.resource, mr.permission_mask
     FROM module_roles mr
     JOIN roles r ON r.id = mr.role_id
     WHERE mr.module = 'treasury'
     GROUP BY r.code, mr.resource, mr.permission_mask
     ORDER BY r.code, mr.resource`
  );
  for (const row of treasuryRows) {
    console.log(`  ${row.role_code}: treasury.${row.resource}=${row.permission_mask}`);
  }

  console.log("\n=== module_roles: total unique by module ===");
  const [moduleCounts] = await db.execute(
    `SELECT module, COUNT(DISTINCT CONCAT(company_id,'-',role_id,'-',resource)) as cnt FROM module_roles GROUP BY module ORDER BY module`
  );
  for (const row of moduleCounts) {
    console.log(`  ${row.module}: ${row.cnt} unique (company,role,resource) combos`);
  }

  console.log("\n=== ACCOUNTANT treasury.transactions=1 check ===");
  const [accountantRows] = await db.execute(
    `SELECT COUNT(*) as cnt FROM module_roles mr
     JOIN roles r ON r.id = mr.role_id
     WHERE r.code = 'ACCOUNTANT' AND mr.module = 'treasury' AND mr.resource = 'transactions' AND mr.permission_mask = 1`
  );
  const count = accountantRows[0].cnt;
  console.log(`  ${count} row(s) — ${count > 0 ? '✅ PRESENT' : '❌ MISSING'}`);

  console.log("\n=== Company counts ===");
  const [companyCount] = await db.execute("SELECT COUNT(*) as cnt FROM companies");
  console.log(`  companies: ${companyCount[0].cnt}`);

  await db.end();
}

main().catch(err => { console.error(err); process.exit(1); });
