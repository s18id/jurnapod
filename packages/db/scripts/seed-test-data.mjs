// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Comprehensive test data seeding script for Jurnapod
 * 
 * This script creates realistic test data for all major entities:
 * - Additional users and outlets
 * - Chart of accounts (if not exists)
 * - Items and pricing
 * - POS transactions with items and payments
 * - Sales invoices and orders
 * - Cash/bank transactions
 * - Journal entries
 * - Audit logs
 * 
 * Usage:
 *   node seed-test-data.mjs
 * 
 * Environment variables:
 *   JP_COMPANY_CODE - Target company (default: JP)
 *   JP_TEST_USERS_COUNT - Number of test users to create (default: 5)
 *   JP_TEST_OUTLETS_COUNT - Number of additional outlets (default: 2)
 *   JP_TEST_ACCOUNTS_COUNT - Number of accounts if none exist (default: 50)
 *   JP_TEST_ITEMS_COUNT - Number of items to create (default: 30)
 *   JP_TEST_POS_TRANSACTIONS_COUNT - Number of POS transactions (default: 100)
 *   JP_TEST_SALES_INVOICES_COUNT - Number of sales invoices (default: 25)
 *   JP_TEST_SALES_ORDERS_COUNT - Number of sales orders (default: 15)
 *   JP_TEST_CASH_TRANSACTIONS_COUNT - Number of cash/bank transactions (default: 20)
 *   JP_TEST_DAYS_BACK - Number of days back to spread transactions (default: 30)
 */

import "./load-env.mjs";
import { hash as argon2Hash } from "@node-rs/argon2";
import mysql from "mysql2/promise";

// Configuration parsing functions
function parsePositiveInt(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeMoney(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }

  return parsed;
}

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

function seedConfigFromEnv() {
  return {
    companyCode: process.env.JP_COMPANY_CODE ?? "JP",
    usersCount: parsePositiveInt(process.env.JP_TEST_USERS_COUNT, 5, "JP_TEST_USERS_COUNT"),
    outletsCount: parsePositiveInt(process.env.JP_TEST_OUTLETS_COUNT, 2, "JP_TEST_OUTLETS_COUNT"),
    accountsCount: parsePositiveInt(process.env.JP_TEST_ACCOUNTS_COUNT, 50, "JP_TEST_ACCOUNTS_COUNT"),
    itemsCount: parsePositiveInt(process.env.JP_TEST_ITEMS_COUNT, 30, "JP_TEST_ITEMS_COUNT"),
    posTransactionsCount: parsePositiveInt(process.env.JP_TEST_POS_TRANSACTIONS_COUNT, 100, "JP_TEST_POS_TRANSACTIONS_COUNT"),
    salesInvoicesCount: parsePositiveInt(process.env.JP_TEST_SALES_INVOICES_COUNT, 25, "JP_TEST_SALES_INVOICES_COUNT"),
    salesOrdersCount: parsePositiveInt(process.env.JP_TEST_SALES_ORDERS_COUNT, 15, "JP_TEST_SALES_ORDERS_COUNT"),
    cashTransactionsCount: parsePositiveInt(process.env.JP_TEST_CASH_TRANSACTIONS_COUNT, 20, "JP_TEST_CASH_TRANSACTIONS_COUNT"),
    daysBack: parsePositiveInt(process.env.JP_TEST_DAYS_BACK, 30, "JP_TEST_DAYS_BACK"),
    minPrice: parseNonNegativeMoney(process.env.JP_TEST_PRICE_MIN, 5000, "JP_TEST_PRICE_MIN"),
    maxPrice: parseNonNegativeMoney(process.env.JP_TEST_PRICE_MAX, 150000, "JP_TEST_PRICE_MAX")
  };
}

// Utility functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick(values) {
  return values[randomInt(0, values.length - 1)];
}

function randomSuffix(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function randomPrice(min, max, step = 1000) {
  const steppedMin = Math.ceil(min / step) * step;
  const steppedMax = Math.floor(max / step) * step;
  if (steppedMax <= steppedMin) {
    return steppedMin;
  }
  return randomInt(steppedMin / step, steppedMax / step) * step;
}

function randomDateInPast(daysBack) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (Math.random() * daysBack * 24 * 60 * 60 * 1000));
  return pastDate.toISOString().slice(0, 19).replace('T', ' ');
}

function generateClientTxId() {
  return `test_${Date.now()}_${randomSuffix(8)}`;
}

async function hashPassword(password) {
  return argon2Hash(password, {
    algorithm: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1
  });
}

// Data access functions
async function readCompanyData(connection, companyCode) {
  const [rows] = await connection.execute(
    `SELECT c.id, c.name, c.code
     FROM companies c
     WHERE c.code = ?
     LIMIT 1`,
    [companyCode]
  );

  if (!rows[0]) {
    throw new Error(
      `Company not found for JP_COMPANY_CODE=${companyCode}. Run db:seed first.`
    );
  }

  return {
    id: Number(rows[0].id),
    name: rows[0].name,
    code: rows[0].code
  };
}

async function readCompanyOutlets(connection, companyId) {
  const [rows] = await connection.execute(
    `SELECT id, code, name FROM outlets WHERE company_id = ? ORDER BY id`,
    [companyId]
  );

  return rows.map(row => ({
    id: Number(row.id),
    code: row.code,
    name: row.name
  }));
}

async function readRoles(connection) {
  const [rows] = await connection.execute(
    `SELECT id, code, name, is_global, role_level FROM roles WHERE company_id IS NULL ORDER BY role_level DESC`
  );

  return rows.map(row => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    is_global: Boolean(row.is_global),
    role_level: Number(row.role_level)
  }));
}

async function readCompanyAccounts(connection, companyId) {
  const [rows] = await connection.execute(
    `SELECT id, code, name, type_name, normal_balance, report_group, is_group, is_active
     FROM accounts 
     WHERE company_id = ? AND is_active = 1
     ORDER BY id`,
    [companyId]
  );

  return rows.map(row => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    typeName: row.type_name,
    normalBalance: row.normal_balance,
    reportGroup: row.report_group,
    isGroup: Boolean(row.is_group),
    isActive: Boolean(row.is_active)
  }));
}

async function readCompanyItems(connection, companyId) {
  const [rows] = await connection.execute(
    `SELECT i.id, i.sku, i.name, i.item_type, i.item_group_id,
            ip.price as default_price
     FROM items i
     LEFT JOIN item_prices ip ON ip.item_id = i.id AND ip.outlet_id IS NULL AND ip.is_active = 1
     WHERE i.company_id = ? AND i.is_active = 1
     ORDER BY i.id`,
    [companyId]
  );

  return rows.map(row => ({
    id: Number(row.id),
    sku: row.sku,
    name: row.name,
    itemType: row.item_type,
    itemGroupId: row.item_group_id ? Number(row.item_group_id) : null,
    defaultPrice: row.default_price ? Number(row.default_price) : null
  }));
}

// Seeding functions
async function seedUsers(connection, companyId, outlets, roles, count) {
  const created = [];
  
  // Separate global and outlet-specific roles
  const globalRoles = roles.filter(r => r.is_global && ['OWNER', 'COMPANY_ADMIN'].includes(r.code));
  const outletRoles = roles.filter(r => !r.is_global && ['ADMIN', 'ACCOUNTANT', 'CASHIER'].includes(r.code));
  
  if (globalRoles.length === 0 && outletRoles.length === 0) {
    console.warn("No suitable roles found for test users");
    return created;
  }

  for (let i = 0; i < count; i++) {
    const email = `testuser${i + 1}@${randomSuffix(4).toLowerCase()}.test`;
    const passwordHash = await hashPassword(`TestPass123!`);

    // Create user
    const [userResult] = await connection.execute(
      `INSERT INTO users (company_id, email, password_hash, is_active)
       VALUES (?, ?, ?, 1)`,
      [companyId, email, passwordHash]
    );
    const userId = Number(userResult.insertId);

    // Decide user type: 20% chance of global role (OWNER/COMPANY_ADMIN), 80% outlet-specific
    const isGlobalUser = Math.random() < 0.2 && globalRoles.length > 0;
    const assignedRoles = [];

    if (isGlobalUser) {
      // Assign global role (OWNER or COMPANY_ADMIN)
      const globalRole = randomPick(globalRoles);
      await connection.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, company_id, outlet_id)
         VALUES (?, ?, ?, NULL)`,
        [userId, globalRole.id, companyId]
      );
      assignedRoles.push({ role: globalRole.code, scope: 'global' });
    } else if (outletRoles.length > 0) {
      // Assign outlet-specific role(s)
      const primaryRole = randomPick(outletRoles);
      const assignedOutlets = [];
      
      // Assign to 1-3 random outlets
      const outletCount = Math.min(randomInt(1, 3), outlets.length);
      const selectedOutlets = [];
      
      // Select random outlets without duplicates
      while (selectedOutlets.length < outletCount) {
        const outlet = randomPick(outlets);
        if (!selectedOutlets.find(o => o.id === outlet.id)) {
          selectedOutlets.push(outlet);
        }
      }
      
      for (const outlet of selectedOutlets) {
        // Assign role to this outlet
        await connection.execute(
          `INSERT IGNORE INTO user_role_assignments (user_id, role_id, company_id, outlet_id)
           VALUES (?, ?, ?, ?)`,
          [userId, primaryRole.id, companyId, outlet.id]
        );
        
        assignedOutlets.push(outlet.code);
      }
      
      assignedRoles.push({ 
        role: primaryRole.code, 
        scope: 'outlet', 
        outlets: assignedOutlets 
      });
    }

    created.push({ 
      id: userId, 
      email, 
      roles: assignedRoles,
      type: isGlobalUser ? 'global' : 'outlet-specific'
    });
  }

  return created;
}

async function seedOutlets(connection, companyId, count) {
  const created = [];
  
  for (let i = 0; i < count; i++) {
    const code = `OUT${i + 1}_${randomSuffix(4)}`;
    const name = `Test Outlet ${i + 1} ${randomSuffix(3)}`;

    const [result] = await connection.execute(
      `INSERT INTO outlets (company_id, code, name)
       VALUES (?, ?, ?)`,
      [companyId, code, name]
    );

    created.push({
      id: Number(result.insertId),
      code,
      name
    });
  }

  return created;
}

async function seedAccountsIfNeeded(connection, companyId, targetCount) {
  const existingAccounts = await readCompanyAccounts(connection, companyId);
  if (existingAccounts.length >= targetCount) {
    console.log(`Accounts already exist (${existingAccounts.length}), skipping account seeding`);
    return existingAccounts;
  }

  console.log(`Creating ${targetCount} test accounts...`);
  const created = [];
  
  // Account type profiles
  const typeProfiles = [
    { type_name: "Kas", normal_balance: "D", report_group: "NRC" },
    { type_name: "Bank", normal_balance: "D", report_group: "NRC" },
    { type_name: "Piutang", normal_balance: "D", report_group: "NRC" },
    { type_name: "Persediaan", normal_balance: "D", report_group: "NRC" },
    { type_name: "Aset Tetap", normal_balance: "D", report_group: "NRC" },
    { type_name: "Hutang", normal_balance: "K", report_group: "NRC" },
    { type_name: "Modal", normal_balance: "K", report_group: "NRC" },
    { type_name: "Pendapatan", normal_balance: "K", report_group: "PL" },
    { type_name: "Beban", normal_balance: "D", report_group: "PL" }
  ];

  for (let i = 0; i < targetCount; i++) {
    const profile = randomPick(typeProfiles);
    const code = `TACC-${randomSuffix(8)}`;
    const name = `Test ${profile.type_name} ${randomSuffix(4)}`;

    const [result] = await connection.execute(
      `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_group, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
      [companyId, code, name, profile.type_name, profile.normal_balance, profile.report_group]
    );

    created.push({
      id: Number(result.insertId),
      code,
      name,
      typeName: profile.type_name,
      normalBalance: profile.normal_balance,
      reportGroup: profile.report_group,
      isGroup: false,
      isActive: true
    });
  }

  return [...existingAccounts, ...created];
}

async function seedItemsAndGroups(connection, companyId, outlets, count, minPrice, maxPrice) {
  const created = { groups: [], items: [] };
  
  // Create a few item groups first
  const groupCount = Math.min(5, Math.ceil(count / 6));
  const groupNames = ["Beverages", "Food", "Desserts", "Snacks", "Services"];
  
  for (let i = 0; i < groupCount; i++) {
    const code = `TGRP-${randomSuffix(6)}`;
    const name = `Test ${groupNames[i] || `Group ${i + 1}`} ${randomSuffix(3)}`;

    const [groupResult] = await connection.execute(
      `INSERT INTO item_groups (company_id, code, name, is_active)
       VALUES (?, ?, ?, 1)`,
      [companyId, code, name]
    );

    created.groups.push({
      id: Number(groupResult.insertId),
      code,
      name
    });
  }

  // Create items
  const itemTypes = ["PRODUCT", "SERVICE"];
  const adjectives = ["Premium", "Special", "Fresh", "Hot", "Cold", "Signature"];
  const nouns = ["Coffee", "Tea", "Sandwich", "Pasta", "Rice", "Salad", "Burger", "Noodles"];

  for (let i = 0; i < count; i++) {
    const group = randomPick(created.groups);
    const itemType = randomPick(itemTypes);
    const sku = `TSKU-${randomSuffix(8)}`;
    const name = `${randomPick(adjectives)} ${randomPick(nouns)} ${randomSuffix(3)}`;

    const [itemResult] = await connection.execute(
      `INSERT INTO items (company_id, sku, name, item_type, item_group_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [companyId, sku, name, itemType, group.id]
    );

    const itemId = Number(itemResult.insertId);

    // Create default price
    const defaultPrice = randomPrice(minPrice, maxPrice);
    await connection.execute(
      `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
       VALUES (?, NULL, ?, ?, 1)`,
      [companyId, itemId, defaultPrice]
    );

    // Maybe create outlet-specific prices
    for (const outlet of outlets) {
      if (Math.random() < 0.3) { // 30% chance of outlet override
        const outletPrice = Math.max(0, defaultPrice + randomInt(-5000, 10000));
        await connection.execute(
          `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
           VALUES (?, ?, ?, ?, 1)`,
          [companyId, outlet.id, itemId, outletPrice]
        );
      }
    }

    created.items.push({
      id: itemId,
      sku,
      name,
      itemType,
      groupId: group.id,
      defaultPrice
    });
  }

  return created;
}

async function seedPOSTransactions(connection, companyId, outlets, items, accounts, count, daysBack) {
  const created = [];
  const paymentMethods = ["CASH", "CARD", "TRANSFER"];
  
  // Find cash/bank accounts for posting (be defensive about account types)
  const cashAccounts = accounts.filter(a => 
    a.typeName === "Kas" || a.typeName === "Bank" || 
    (a.typeName && a.typeName.toLowerCase().includes("kas")) ||
    (a.typeName && a.typeName.toLowerCase().includes("bank")) ||
    a.normalBalance === "D" // Default to debit balance accounts if no specific types
  );
  const salesAccounts = accounts.filter(a => 
    a.typeName === "Pendapatan" ||
    (a.typeName && a.typeName.toLowerCase().includes("pendapatan")) ||
    (a.typeName && a.typeName.toLowerCase().includes("sales")) ||
    a.normalBalance === "K" // Default to credit balance accounts if no specific types
  );

  if (cashAccounts.length === 0 || salesAccounts.length === 0) {
    console.warn(`No suitable accounts found for POS transaction posting. Cash accounts: ${cashAccounts.length}, Sales accounts: ${salesAccounts.length}`);
    console.warn(`Available account types: ${[...new Set(accounts.map(a => a.typeName))].join(', ')}`);
    return created;
  }

  for (let i = 0; i < count; i++) {
    const outlet = randomPick(outlets);
    const clientTxId = generateClientTxId();
    const transactionDate = randomDateInPast(daysBack);
    const itemCount = randomInt(1, 5);
    const selectedItems = [];
    
    // Select random items for this transaction
    for (let j = 0; j < itemCount; j++) {
      selectedItems.push(randomPick(items));
    }

    // Calculate total
    let subtotal = 0;
    const transactionItems = selectedItems.map(item => {
      const quantity = randomInt(1, 3);
      const unitPrice = item.defaultPrice || randomPrice(5000, 50000);
      const amount = quantity * unitPrice;
      subtotal += amount;
      
      return {
        itemId: item.id,
        itemName: item.name,
        quantity,
        unitPrice,
        amount
      };
    });

    const total = subtotal; // Total calculated from line items

    // Create POS transaction (no amount fields here - calculated from related tables)
    const [txResult] = await connection.execute(
      `INSERT INTO pos_transactions (
         company_id, outlet_id, client_tx_id, status, trx_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?)`,
      [companyId, outlet.id, clientTxId, transactionDate, transactionDate, transactionDate]
    );
    const transactionId = Number(txResult.insertId);

    // Create transaction items
    for (let idx = 0; idx < transactionItems.length; idx++) {
      const txItem = transactionItems[idx];
      await connection.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id, company_id, outlet_id, line_no, item_id, 
           qty, price_snapshot, name_snapshot, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionId, companyId, outlet.id, idx + 1, txItem.itemId, 
         txItem.quantity, txItem.unitPrice, txItem.itemName, transactionDate]
      );
    }

    // Create payment
    const paymentMethod = randomPick(paymentMethods);
    await connection.execute(
      `INSERT INTO pos_transaction_payments (
         pos_transaction_id, company_id, outlet_id, payment_no, method, amount, created_at
       ) VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [transactionId, companyId, outlet.id, paymentMethod, total, transactionDate]
    );

    // Create journal entries for accounting
    const [batchResult] = await connection.execute(
      `INSERT INTO journal_batches (
         company_id, outlet_id, doc_type, doc_id, posted_at
       ) VALUES (?, ?, 'POS_TRANSACTION', ?, ?)`,
      [companyId, outlet.id, transactionId, transactionDate]
    );
    const batchId = Number(batchResult.insertId);

    // Debit cash account
    const cashAccount = randomPick(cashAccounts);
    const lineDate = transactionDate.slice(0, 10); // Extract date part
    await connection.execute(
      `INSERT INTO journal_lines (
         journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description
       ) VALUES (?, ?, ?, ?, ?, ?, 0, 'Cash received from POS sale')`,
      [batchId, companyId, outlet.id, cashAccount.id, lineDate, total]
    );

    // Credit sales account  
    const salesAccount = randomPick(salesAccounts);
    await connection.execute(
      `INSERT INTO journal_lines (
         journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description
       ) VALUES (?, ?, ?, ?, ?, 0, ?, 'Sales revenue from POS')`,
      [batchId, companyId, outlet.id, salesAccount.id, lineDate, total]
    );

    created.push({
      id: transactionId,
      clientTxId,
      total,
      itemCount: transactionItems.length,
      outlet: outlet.code
    });
  }

  return created;
}

async function seedSalesInvoices(connection, companyId, outlets, items, accounts, count, daysBack) {
  const created = [];
  const statuses = ["DRAFT", "APPROVED", "POSTED", "VOID"];
  const paymentStatuses = ["UNPAID", "PARTIAL", "PAID"];
  
  for (let i = 0; i < count; i++) {
    const outlet = randomPick(outlets);
    const status = randomPick(statuses);
    const paymentStatus = randomPick(paymentStatuses);
    const invoiceDate = randomDateInPast(daysBack);
    const dueDateStr = new Date(invoiceDate);
    dueDateStr.setDate(dueDateStr.getDate() + randomInt(1, 30));
    
    const itemCount = randomInt(1, 4);
    let subtotal = 0;

    // Create invoice
    const [invResult] = await connection.execute(
      `INSERT INTO sales_invoices (
         company_id, outlet_id, invoice_no, invoice_date, 
         due_date, status, payment_status, subtotal, tax_amount, grand_total, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
      [companyId, outlet.id, `INV-TEST-${randomSuffix(8)}`, 
       invoiceDate, dueDateStr.toISOString().slice(0, 10), status, paymentStatus, invoiceDate]
    );
    const invoiceId = Number(invResult.insertId);

    // Create invoice items
    for (let j = 0; j < itemCount; j++) {
      const item = randomPick(items);
      const quantity = randomInt(1, 10);
      const unitPrice = item.defaultPrice || randomPrice(5000, 100000);
      const amount = quantity * unitPrice;
      subtotal += amount;

      await connection.execute(
        `INSERT INTO sales_invoice_lines (
           invoice_id, company_id, outlet_id, line_no, description,
           qty, unit_price, line_total
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, companyId, outlet.id, j + 1, item.name,
         quantity, unitPrice, amount]
      );
    }

    const tax = Math.round(subtotal * 0.1);
    const total = subtotal + tax;

    // Update invoice totals
    await connection.execute(
      `UPDATE sales_invoices 
       SET subtotal = ?, tax_amount = ?, grand_total = ?
       WHERE id = ?`,
      [subtotal, tax, total, invoiceId]
    );

    created.push({
      id: invoiceId,
      total,
      status,
      outlet: outlet.code
    });
  }

  return created;
}

async function seedSalesOrders(connection, companyId, outlets, items, count, daysBack) {
  const created = [];
  const statuses = ["DRAFT", "CONFIRMED", "COMPLETED", "VOID"];
  
  for (let i = 0; i < count; i++) {
    const outlet = randomPick(outlets);
    const status = randomPick(statuses);
    const orderDate = randomDateInPast(daysBack);
    
    const itemCount = randomInt(1, 5);
    let total = 0;

    // Create order
    const [orderResult] = await connection.execute(
      `INSERT INTO sales_orders (
         company_id, outlet_id, order_no, order_date,
         subtotal, tax_amount, grand_total, status, created_at
       ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      [companyId, outlet.id, `SO-TEST-${randomSuffix(8)}`, 
       orderDate, status, orderDate]
    );
    const orderId = Number(orderResult.insertId);

    // Create order items
    for (let j = 0; j < itemCount; j++) {
      const item = randomPick(items);
      const quantity = randomInt(1, 5);
      const unitPrice = item.defaultPrice || randomPrice(10000, 200000);
      const amount = quantity * unitPrice;
      total += amount;

      await connection.execute(
        `INSERT INTO sales_order_lines (
           order_id, company_id, outlet_id, line_no, description,
           qty, unit_price, line_total
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, companyId, outlet.id, j + 1, item.name,
         quantity, unitPrice, amount]
      );
    }

    // Update order total
    await connection.execute(
      `UPDATE sales_orders SET subtotal = ?, grand_total = ? WHERE id = ?`,
      [total, total, orderId]
    );

    created.push({
      id: orderId,
      total,
      status,
      outlet: outlet.code
    });
  }

  return created;
}

async function seedCashBankTransactions(connection, companyId, outlets, accounts, count, daysBack) {
  const created = [];
  const transactionTypes = ["MUTATION", "TOP_UP", "WITHDRAWAL"];
  const statuses = ["DRAFT", "POSTED"];
  
  // Find cash/bank accounts
  const cashBankAccounts = accounts.filter(a => 
    a.typeName === "Kas" || a.typeName === "Bank" ||
    (a.typeName && a.typeName.toLowerCase().includes("kas")) ||
    (a.typeName && a.typeName.toLowerCase().includes("bank")) ||
    a.normalBalance === "D" // Fallback to debit accounts
  );
  
  if (cashBankAccounts.length === 0) {
    console.warn("No cash/bank accounts found for cash transactions");
    return created;
  }

  for (let i = 0; i < count; i++) {
    const outlet = randomPick(outlets);
    const sourceAccount = randomPick(cashBankAccounts);
    const transactionType = randomPick(transactionTypes);
    const status = randomPick(statuses);
    const amount = randomPrice(10000, 500000);
    const transactionDate = randomDateInPast(daysBack);

    // Make sure source and destination are different
    let destinationAccount;
    do {
      destinationAccount = randomPick(cashBankAccounts);
    } while (destinationAccount.id === sourceAccount.id && cashBankAccounts.length > 1);
    
    const [result] = await connection.execute(
      `INSERT INTO cash_bank_transactions (
         company_id, outlet_id, source_account_id, destination_account_id, 
         transaction_type, amount, description, transaction_date, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, outlet.id, sourceAccount.id, destinationAccount.id, transactionType, amount,
       `Test ${transactionType.toLowerCase()} - ${randomSuffix(6)}`, transactionDate, status, transactionDate]
    );

    created.push({
      id: Number(result.insertId),
      type: transactionType,
      amount,
      sourceAccount: sourceAccount.code,
      destinationAccount: destinationAccount.code,
      outlet: outlet.code
    });
  }

  return created;
}

async function seedAuditLogs(connection, companyId, outlets, users, count) {
  const created = [];
  const actions = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT"];
  const entities = ["pos_transactions", "sales_invoices", "items", "accounts", "users"];
  
  for (let i = 0; i < count; i++) {
    const outlet = randomPick(outlets);
    const user = randomPick(users);
    const action = randomPick(actions);
    const entity = randomPick(entities);
    const entityId = randomInt(1, 1000);
    const success = Math.random() > 0.1; // 90% success rate
    const timestamp = randomDateInPast(30);

    await connection.execute(
      `INSERT INTO audit_logs (
         company_id, outlet_id, user_id, action, entity_type, entity_id,
         success, result, payload_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, outlet.id, user.id, action, entity, entityId,
       success ? 1 : 0, success ? 'SUCCESS' : 'ERROR',
       JSON.stringify({ test: true, action: action.toLowerCase() }), timestamp]
    );

    created.push({ action, entity, success, userId: user.id });
  }

  return created;
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const seedConfig = seedConfigFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.beginTransaction();

    console.log("🌱 Starting comprehensive test data seeding...");
    console.log(`Company: ${seedConfig.companyCode}`);

    // Get company data
    const company = await readCompanyData(connection, seedConfig.companyCode);
    const existingOutlets = await readCompanyOutlets(connection, company.id);
    const roles = await readRoles(connection);

    console.log(`📊 Company: ${company.name} (ID: ${company.id})`);
    console.log(`🏪 Existing outlets: ${existingOutlets.length}`);

    // Seed additional outlets
    console.log(`\n🏪 Creating ${seedConfig.outletsCount} additional outlets...`);
    const newOutlets = await seedOutlets(connection, company.id, seedConfig.outletsCount);
    const allOutlets = [...existingOutlets, ...newOutlets];
    console.log(`✅ Created ${newOutlets.length} new outlets`);

    // Seed users
    console.log(`\n👥 Creating ${seedConfig.usersCount} test users...`);
    const users = await seedUsers(connection, company.id, allOutlets, roles, seedConfig.usersCount);
    
    // Count user types
    const globalUsers = users.filter(u => u.type === 'global').length;
    const outletUsers = users.filter(u => u.type === 'outlet-specific').length;
    
    console.log(`✅ Created ${users.length} users (${globalUsers} global, ${outletUsers} outlet-specific)`);

    // Seed accounts if needed
    console.log(`\n💰 Ensuring chart of accounts exists...`);
    const accounts = await seedAccountsIfNeeded(connection, company.id, seedConfig.accountsCount);
    console.log(`✅ Chart of accounts ready (${accounts.length} accounts)`);

    // Seed items and groups
    console.log(`\n📦 Creating ${seedConfig.itemsCount} items with groups...`);
    const itemData = await seedItemsAndGroups(connection, company.id, allOutlets, seedConfig.itemsCount, seedConfig.minPrice, seedConfig.maxPrice);
    console.log(`✅ Created ${itemData.groups.length} item groups and ${itemData.items.length} items`);

    // Seed POS transactions
    console.log(`\n🛒 Creating ${seedConfig.posTransactionsCount} POS transactions...`);
    const posTransactions = await seedPOSTransactions(connection, company.id, allOutlets, itemData.items, accounts, seedConfig.posTransactionsCount, seedConfig.daysBack);
    console.log(`✅ Created ${posTransactions.length} POS transactions`);

    // Seed sales invoices
    console.log(`\n📄 Creating ${seedConfig.salesInvoicesCount} sales invoices...`);
    const salesInvoices = await seedSalesInvoices(connection, company.id, allOutlets, itemData.items, accounts, seedConfig.salesInvoicesCount, seedConfig.daysBack);
    console.log(`✅ Created ${salesInvoices.length} sales invoices`);

    // Seed sales orders
    console.log(`\n📋 Creating ${seedConfig.salesOrdersCount} sales orders...`);
    const salesOrders = await seedSalesOrders(connection, company.id, allOutlets, itemData.items, seedConfig.salesOrdersCount, seedConfig.daysBack);
    console.log(`✅ Created ${salesOrders.length} sales orders`);

    // Seed cash/bank transactions
    console.log(`\n💳 Creating ${seedConfig.cashTransactionsCount} cash/bank transactions...`);
    const cashTransactions = await seedCashBankTransactions(connection, company.id, allOutlets, accounts, seedConfig.cashTransactionsCount, seedConfig.daysBack);
    console.log(`✅ Created ${cashTransactions.length} cash/bank transactions`);

    // Seed audit logs
    const auditLogCount = Math.min(200, seedConfig.posTransactionsCount + seedConfig.salesInvoicesCount + 50);
    console.log(`\n📝 Creating ${auditLogCount} audit log entries...`);
    const auditLogs = await seedAuditLogs(connection, company.id, allOutlets, users, auditLogCount);
    console.log(`✅ Created ${auditLogs.length} audit log entries`);

    await connection.commit();

    console.log("\n🎉 Test data seeding completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`  • Company: ${company.name} (${company.code})`);
    console.log(`  • Outlets: ${allOutlets.length} total (${newOutlets.length} new)`);
    console.log(`  • Users: ${users.length} new`);
    console.log(`  • Accounts: ${accounts.length} total`);
    console.log(`  • Item groups: ${itemData.groups.length}`);
    console.log(`  • Items: ${itemData.items.length}`);
    console.log(`  • POS transactions: ${posTransactions.length}`);
    console.log(`  • Sales invoices: ${salesInvoices.length}`);
    console.log(`  • Sales orders: ${salesOrders.length}`);
    console.log(`  • Cash/bank transactions: ${cashTransactions.length}`);
    console.log(`  • Audit logs: ${auditLogs.length}`);

    console.log("\n🔑 Sample test credentials:");
    for (const user of users.slice(0, 5)) {
      const roleInfo = user.roles.map(r => {
        if (r.scope === 'global') {
          return `${r.role} (Global)`;
        } else {
          return `${r.role} (${r.outlets.join(', ')})`;
        }
      }).join(', ');
      console.log(`  • ${user.email} / TestPass123! - ${roleInfo}`);
    }

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("\n❌ Test data seeding failed:");
  console.error(error.message);
  if (process.env.NODE_ENV === "development") {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
