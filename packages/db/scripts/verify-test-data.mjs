// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Verification script for test data seeding
 * 
 * This script validates that test data was created correctly
 * and provides a summary of what exists in the database.
 * 
 * Usage:
 *   node verify-test-data.mjs
 * 
 * Environment variables:
 *   JP_COMPANY_CODE - Target company to verify (default: JP)
 */

import "./load-env.mjs";
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

async function verifyCompany(connection, companyCode) {
  const [rows] = await connection.execute(
    `SELECT id, code, name, created_at FROM companies WHERE code = ?`,
    [companyCode]
  );

  if (rows.length === 0) {
    throw new Error(`Company ${companyCode} not found. Run db:seed first.`);
  }

  return {
    id: Number(rows[0].id),
    code: rows[0].code,
    name: rows[0].name,
    createdAt: rows[0].created_at
  };
}

async function getTableCounts(connection, companyId) {
  const queries = [
    { name: "outlets", query: "SELECT COUNT(*) as count FROM outlets WHERE company_id = ?" },
    { name: "users", query: "SELECT COUNT(*) as count FROM users WHERE company_id = ?" },
    { name: "accounts", query: "SELECT COUNT(*) as count FROM accounts WHERE company_id = ?" },
    { name: "item_groups", query: "SELECT COUNT(*) as count FROM item_groups WHERE company_id = ?" },
    { name: "items", query: "SELECT COUNT(*) as count FROM items WHERE company_id = ?" },
    { name: "item_prices", query: "SELECT COUNT(*) as count FROM item_prices WHERE company_id = ?" },
    { name: "pos_transactions", query: "SELECT COUNT(*) as count FROM pos_transactions WHERE company_id = ?" },
    { name: "pos_transaction_items", query: `
      SELECT COUNT(*) as count 
      FROM pos_transaction_items pti 
      JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id 
      WHERE pt.company_id = ?
    `},
    { name: "pos_transaction_payments", query: `
      SELECT COUNT(*) as count 
      FROM pos_transaction_payments ptp
      JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id 
      WHERE pt.company_id = ?
    `},
    { name: "sales_invoices", query: "SELECT COUNT(*) as count FROM sales_invoices WHERE company_id = ?" },
    { name: "sales_invoice_lines", query: `
      SELECT COUNT(*) as count 
      FROM sales_invoice_lines sil
      JOIN sales_invoices si ON si.id = sil.invoice_id 
      WHERE si.company_id = ?
    `},
    { name: "sales_orders", query: "SELECT COUNT(*) as count FROM sales_orders WHERE company_id = ?" },
    { name: "sales_order_lines", query: `
      SELECT COUNT(*) as count 
      FROM sales_order_lines sol
      JOIN sales_orders so ON so.id = sol.order_id 
      WHERE so.company_id = ?
    `},
    { name: "cash_bank_transactions", query: "SELECT COUNT(*) as count FROM cash_bank_transactions WHERE company_id = ?" },
    { name: "journal_batches", query: "SELECT COUNT(*) as count FROM journal_batches WHERE company_id = ?" },
    { name: "journal_lines", query: "SELECT COUNT(*) as count FROM journal_lines WHERE company_id = ?" },
    { name: "audit_logs", query: "SELECT COUNT(*) as count FROM audit_logs WHERE company_id = ?" }
  ];

  const counts = {};
  for (const { name, query } of queries) {
    try {
      const [rows] = await connection.execute(query, [companyId]);
      counts[name] = Number(rows[0].count);
    } catch (error) {
      counts[name] = `Error: ${error.message}`;
    }
  }

  return counts;
}

async function getDataSamples(connection, companyId) {
  const samples = {};

  // Sample users
  try {
    const [userRows] = await connection.execute(
      `SELECT u.email, r.code as role_code
       FROM users u
       JOIN user_role_assignments ura ON ura.user_id = u.id
       JOIN roles r ON r.id = ura.role_id
       WHERE u.company_id = ? AND u.email LIKE 'testuser%'
       ORDER BY u.id LIMIT 3`,
      [companyId]
    );
    samples.users = userRows;
  } catch (error) {
    samples.users = `Error: ${error.message}`;
  }

  // Sample POS transactions
  try {
    const [posRows] = await connection.execute(
      `SELECT client_tx_id, total_amount, status, transaction_date
       FROM pos_transactions 
       WHERE company_id = ? AND client_tx_id LIKE 'test_%'
       ORDER BY id LIMIT 3`,
      [companyId]
    );
    samples.pos_transactions = posRows;
  } catch (error) {
    samples.pos_transactions = `Error: ${error.message}`;
  }

  // Sample items
  try {
    const [itemRows] = await connection.execute(
      `SELECT i.sku, i.name, i.item_type
       FROM items i
       WHERE i.company_id = ? AND i.sku LIKE 'TSKU-%'
       ORDER BY i.id LIMIT 3`,
      [companyId]
    );
    samples.items = itemRows;
  } catch (error) {
    samples.items = `Error: ${error.message}`;
  }

  // Journal balance verification
  try {
    const [balanceRows] = await connection.execute(
      `SELECT 
         SUM(debit) as total_debits,
         SUM(credit) as total_credits,
         SUM(debit) - SUM(credit) as balance_diff
       FROM journal_lines 
       WHERE company_id = ?`,
      [companyId]
    );
    samples.journal_balance = balanceRows[0];
  } catch (error) {
    samples.journal_balance = `Error: ${error.message}`;
  }

  return samples;
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const companyCode = process.env.JP_COMPANY_CODE ?? "JP";
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log("🔍 Verifying test data...");
    console.log(`Target company: ${companyCode}`);

    // Verify company exists
    const company = await verifyCompany(connection, companyCode);
    console.log(`\n✅ Company found: ${company.name} (ID: ${company.id})`);
    console.log(`   Created: ${company.createdAt}`);

    // Get table counts
    console.log("\n📊 Data counts by table:");
    const counts = await getTableCounts(connection, company.id);
    
    const maxNameLength = Math.max(...Object.keys(counts).map(k => k.length));
    for (const [table, count] of Object.entries(counts)) {
      const paddedName = table.padEnd(maxNameLength);
      console.log(`   ${paddedName}: ${count}`);
    }

    // Get data samples
    console.log("\n📋 Data samples:");
    const samples = await getDataSamples(connection, company.id);

    if (Array.isArray(samples.users) && samples.users.length > 0) {
      console.log("\n👥 Sample test users:");
      for (const user of samples.users) {
        console.log(`   ${user.email} (${user.role_code})`);
      }
    }

    if (Array.isArray(samples.items) && samples.items.length > 0) {
      console.log("\n📦 Sample items:");
      for (const item of samples.items) {
        console.log(`   ${item.sku}: ${item.name} (${item.item_type})`);
      }
    }

    if (Array.isArray(samples.pos_transactions) && samples.pos_transactions.length > 0) {
      console.log("\n🛒 Sample POS transactions:");
      for (const tx of samples.pos_transactions) {
        console.log(`   ${tx.client_tx_id}: ${tx.total_amount} (${tx.status}) - ${tx.transaction_date}`);
      }
    }

    // Journal balance check
    if (samples.journal_balance && typeof samples.journal_balance === 'object') {
      console.log("\n⚖️ Journal balance verification:");
      const { total_debits, total_credits, balance_diff } = samples.journal_balance;
      console.log(`   Total debits:  ${total_debits}`);
      console.log(`   Total credits: ${total_credits}`);
      console.log(`   Balance diff:  ${balance_diff}`);
      
      if (Math.abs(Number(balance_diff)) < 0.01) {
        console.log("   ✅ Journal entries are balanced!");
      } else {
        console.log("   ⚠️  Journal entries may be unbalanced");
      }
    }

    // Summary assessment
    console.log("\n🎯 Data quality assessment:");
    
    const criticalTables = ['outlets', 'users', 'accounts', 'items'];
    const missingCritical = criticalTables.filter(table => counts[table] === 0);
    
    if (missingCritical.length > 0) {
      console.log(`   ❌ Missing critical data: ${missingCritical.join(', ')}`);
    } else {
      console.log("   ✅ All critical tables have data");
    }

    const totalRecords = Object.values(counts)
      .filter(count => typeof count === 'number')
      .reduce((sum, count) => sum + count, 0);
    
    console.log(`   📈 Total records across all tables: ${totalRecords}`);

    if (totalRecords > 100) {
      console.log("   ✅ Substantial test data available");
    } else if (totalRecords > 20) {
      console.log("   ⚠️  Minimal test data available");
    } else {
      console.log("   ❌ Insufficient test data");
    }

    console.log("\n✅ Verification completed!");

  } catch (error) {
    console.error("\n❌ Verification failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Verification script error:", error);
  process.exitCode = 1;
});