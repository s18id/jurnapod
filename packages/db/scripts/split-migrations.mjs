#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Migration Splitter - Parses 0000_version_1.sql into individual table files

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceFile = path.resolve(__dirname, "../migrations/0000_version_1.sql");
const outputDir = path.resolve(__dirname, "../migrations");

// Table creation order based on dependency analysis.
// NOTE: keep this list aligned with canonical active schema. If the source dump
// contains legacy tables, they are handled automatically via `extraTables` below.
const tableOrder = [
  // Tier 0: Root tables (no dependencies)
  "companies",
  "modules", 
  "schema_migrations",
  "platform_settings",
  "auth_login_throttles",
  "auth_password_reset_throttles",
  "sync_audit_events",
  "sync_audit_events_archive",
  
  // Tier 1: Companies-dependent
  "account_types",
  "item_groups",
  "outlets",
  "users",
  "roles",
  "tax_rates",
  "fixed_asset_categories",
  "supplies",
  "feature_flags",
  "backoffice_sync_queue",
  "data_imports",
  "static_pages",
  
  // Tier 2: Accounts, Items, Auth extensions
  "accounts",
  "items",
  "company_modules",
  "auth_oauth_accounts",
  "auth_refresh_tokens",
  "email_tokens",
  "email_outbox",
  "module_roles",
  "fiscal_years",
  
  // Tier 3: Outlet-scoped master data
  "outlet_tables",
  "item_prices",
  "user_role_assignments",
  "inventory_stock",
  "company_settings",
  "numbering_templates",
  
  // Tier 4-5: Fixed Assets and Journal
  "fixed_assets",
  "fixed_asset_books",
  "journal_batches",
  "fixed_asset_events",
  "journal_lines",
  "account_balances_current",
  "company_account_mappings",
  "outlet_account_mappings",
  "company_tax_defaults",
  "company_payment_method_mappings",
  "outlet_payment_method_mappings",
  
  // Tier 6: Fixed Asset completion
  "asset_depreciation_plans",
  "asset_depreciation_runs",
  "fixed_asset_disposals",
  
  // Tier 7: Sales Orders
  "sales_orders",
  "sales_order_lines",
  
  // Tier 8: Sales Invoices
  "sales_invoices",
  "sales_invoice_lines",
  "sales_invoice_taxes",
  
  // Tier 9: Payments and Credit Notes
  "sales_payments",
  "sales_payment_splits",
  "sales_credit_notes",
  "sales_credit_note_lines",
  
  // Tier 10: POS
  "reservations",
  "pos_transactions",
  "pos_transaction_items",
  "pos_transaction_payments",
  "pos_transaction_taxes",
  
  // Tier 11: POS Order Management
  "pos_order_snapshots",
  "pos_order_snapshot_lines",
  "pos_order_updates",
  "pos_item_cancellations",
  
  // Tier 12: Analytics and remaining
  "sales_forecasts",
  "scheduled_exports",
  "export_files",
  "pos_sync_metadata",
  "inventory_transactions",
  "cash_bank_transactions",
  "audit_logs"
];

async function ensureDirectory(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function padNumber(num, length = 4) {
  return String(num).padStart(length, "0");
}

function sanitizeCollation(sql) {
  // Replace MariaDB-specific collation with portable one
  return sql.replace(/utf8mb4_uca1400_ai_ci/g, "utf8mb4_unicode_ci");
}

function extractTableDefinitions(content) {
  const tables = new Map();
  const views = [];
  
  // Regular expressions for parsing
  const tableRegex = /CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)`\s*\(([\s\S]*?)\)\s*ENGINE=InnoDB[^;]*;/gi;
  const viewRegex = /\/\*!50001\s*CREATE(?:\s+ALGORITHM=[^\s]+)?\s+VIEW\s+`([^`]+)`[^;]+;/gi;
  
  // Extract tables
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const tableDef = match[0];
    tables.set(tableName, sanitizeCollation(tableDef));
  }
  
  // Extract views - capture everything from first view section to end of file
  // Views are at the end of the dump, after all tables
  const viewSectionMatch = content.match(/(--\s*Final view structure[\s\S]*$)/i);
  if (viewSectionMatch) {
    // Get all content from the view section to the end
    let viewContent = viewSectionMatch[1];
    
    // Also include the temporary view definition that precedes it (if exists)
    const tempViewMatch = content.match(/(\/\*!50001 DROP VIEW IF EXISTS `v_pos_daily_totals`\*\/;[\s\S]*?SET character_set_client = @saved_cs_client;)/);
    if (tempViewMatch) {
      viewContent = tempViewMatch[1] + '\n\n' + viewContent;
    }
    
    views.push({ 
      name: 'v_pos_daily_totals', 
      definition: sanitizeCollation(viewContent) 
    });
  }
  
  return { tables, views };
}

async function writeMigrationFile(index, name, content, isView = false) {
  const paddedIndex = padNumber(index);
  const fileName = isView 
    ? `${paddedIndex}_views.sql`
    : `${paddedIndex}_${name}.sql`;
  const filePath = path.join(outputDir, fileName);
  
  // Add header - views don't need FK checks
  const wrapper = isView 
    ? `${content}`
    : `SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

${content}

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;`;
  
  const header = `-- Migration: ${fileName}
-- Generated from: 0000_version_1.sql
-- Table: ${name}${isView ? ' (Views)' : ''}
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

${wrapper}
`;
  
  await writeFile(filePath, header, "utf8");
  console.log(`✓ Created: ${fileName}`);
}

async function main() {
  console.log("🔧 Migration Splitter");
  console.log("====================\n");
  
  // Read source file
  console.log(`Reading: ${sourceFile}`);
  const content = await readFile(sourceFile, "utf8");
  
  // Extract definitions
  console.log("Parsing SQL dump...\n");
  const { tables, views } = extractTableDefinitions(content);
  
  console.log(`Found ${tables.size} tables`);
  console.log(`Found ${views.length} views\n`);
  
  // Track missing tables
  const missingTables = [];
  const foundTables = [];
  
  // Write table migrations in order
  console.log("Generating table migrations...");
  for (let i = 0; i < tableOrder.length; i++) {
    const tableName = tableOrder[i];
    const tableDef = tables.get(tableName);
    
    if (!tableDef) {
      missingTables.push(tableName);
      console.log(`⚠ Missing: ${tableName}`);
      continue;
    }
    
    foundTables.push(tableName);
    await writeMigrationFile(i, tableName, tableDef);
  }
  
  // Check for extra tables not in our list
  const extraTables = [];
  for (const [tableName] of tables) {
    if (!tableOrder.includes(tableName)) {
      extraTables.push(tableName);
    }
  }
  
  if (extraTables.length > 0) {
    console.log(`\n⚠ Extra tables found (not in dependency order):`);
    extraTables.forEach(t => console.log(`  - ${t}`));
    
    // Add extra tables at the end
    let extraIndex = tableOrder.length;
    for (const tableName of extraTables) {
      const tableDef = tables.get(tableName);
      await writeMigrationFile(extraIndex++, tableName, tableDef);
    }
  }
  
  // Write views migration
  if (views.length > 0) {
    console.log("\nGenerating views migration...");
    const viewsContent = views.map(v => v.definition).join("\n\n");
    await writeMigrationFile(tableOrder.length + extraTables.length, "views", viewsContent, true);
  }
  
  // Summary
  console.log("\n====================");
  console.log("✅ Migration split complete!");
  console.log(`Tables: ${foundTables.length} created, ${missingTables.length} missing, ${extraTables.length} extra`);
  console.log(`Views: ${views.length}`);
  console.log(`\nTotal files: ${foundTables.length + extraTables.length + (views.length > 0 ? 1 : 0)}`);
  
  if (missingTables.length > 0) {
    console.log("\n⚠ Missing tables (check dependency order):");
    missingTables.forEach(t => console.log(`  - ${t}`));
  }
  
  console.log("\nNext steps:");
  console.log("1. Review generated files in packages/db/migrations/");
  console.log("2. Run: npm run db:migrate (on fresh database)");
  console.log("3. Test with: node packages/db/scripts/test-compatibility.mjs");
}

main().catch(err => {
  console.error("\n❌ Error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
