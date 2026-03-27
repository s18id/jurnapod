#!/usr/bin/env npx tsx
/**
 * Check for direct SQL in test files
 * Run: npx tsx scripts/check-test-sql.ts
 */

import { glob } from "glob";
import { readFile } from "fs/promises";

const TEST_FILES = await glob("apps/api/src/**/*.test.ts");

let issues = 0;
for (const file of TEST_FILES) {
  const content = await readFile(file, "utf-8");
  
  // Check for INSERT/UPDATE/DELETE in pool.execute
  const directSql = content.match(/pool\.execute\(`.*?(INSERT|UPDATE|DELETE).*?`/g);
  
  if (directSql) {
    console.log(`❌ ${file}: Found ${directSql.length} direct SQL statements`);
    issues++;
  }
}

if (issues > 0) {
  console.log(`\n❌ Found ${issues} files with direct SQL in tests`);
  console.log("Consider using library functions instead:");
  console.log("  - createItem() from lib/items");
  console.log("  - createUser() from lib/users");
  console.log("  - createCompanyBasic() from lib/companies");
  process.exit(1);
} else {
  console.log("✅ No direct SQL found in test files");
}