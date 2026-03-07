// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

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

function seedConfigFromEnv() {
  const minPrice = parseNonNegativeMoney(process.env.JP_TEST_SEED_PRICE_MIN, 10000, "JP_TEST_SEED_PRICE_MIN");
  const maxPrice = parseNonNegativeMoney(process.env.JP_TEST_SEED_PRICE_MAX, 120000, "JP_TEST_SEED_PRICE_MAX");
  if (maxPrice < minPrice) {
    throw new Error("JP_TEST_SEED_PRICE_MAX must be greater than or equal to JP_TEST_SEED_PRICE_MIN");
  }

  return {
    companyCode: process.env.JP_COMPANY_CODE ?? "JP",
    outletCode: process.env.JP_OUTLET_CODE ?? "MAIN",
    groupCount: parsePositiveInt(process.env.JP_TEST_SEED_GROUP_COUNT, 3, "JP_TEST_SEED_GROUP_COUNT"),
    itemCount: parsePositiveInt(process.env.JP_TEST_SEED_ITEM_COUNT, 25, "JP_TEST_SEED_ITEM_COUNT"),
    minPrice,
    maxPrice,
    outletOverrideRatio: Math.min(
      1,
      Math.max(0, Number(process.env.JP_TEST_SEED_OUTLET_OVERRIDE_RATIO ?? "0.65"))
    )
  };
}

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

function randomPrice(min, max) {
  const step = 500;
  const steppedMin = Math.ceil(min / step) * step;
  const steppedMax = Math.floor(max / step) * step;
  if (steppedMax <= steppedMin) {
    return steppedMin;
  }
  return randomInt(steppedMin / step, steppedMax / step) * step;
}

async function readCompanyAndOutlet(connection, companyCode, outletCode) {
  const [rows] = await connection.execute(
    `SELECT c.id AS company_id, o.id AS outlet_id
     FROM companies c
     INNER JOIN outlets o ON o.company_id = c.id
     WHERE c.code = ? AND o.code = ?
     LIMIT 1`,
    [companyCode, outletCode]
  );

  const row = rows[0];
  if (!row) {
    throw new Error(
      `Company/outlet not found for JP_COMPANY_CODE=${companyCode} and JP_OUTLET_CODE=${outletCode}. Run db:seed first.`
    );
  }

  return {
    companyId: Number(row.company_id),
    outletId: Number(row.outlet_id)
  };
}

async function insertItemGroup(connection, companyId, code, name) {
  const [result] = await connection.execute(
    `INSERT INTO item_groups (company_id, code, name, is_active)
     VALUES (?, ?, ?, 1)`,
    [companyId, code, name]
  );

  return Number(result.insertId);
}

async function insertItem(connection, companyId, groupId, sku, name, itemType) {
  const [result] = await connection.execute(
    `INSERT INTO items (company_id, sku, name, item_type, item_group_id, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [companyId, sku, name, itemType, groupId]
  );

  return Number(result.insertId);
}

async function insertItemPrice(connection, companyId, outletId, itemId, price, isOutletOverride) {
  await connection.execute(
    `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [companyId, isOutletOverride ? outletId : null, itemId, price]
  );
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const seedConfig = seedConfigFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  const itemTypePool = ["PRODUCT", "SERVICE"];
  const adjectivePool = ["Iced", "Hot", "Crispy", "Spicy", "Fresh", "Signature"];
  const nounPool = ["Latte", "Tea", "Burger", "Pasta", "Rice Bowl", "Salad", "Noodles"];

  try {
    await connection.beginTransaction();

    const { companyId, outletId } = await readCompanyAndOutlet(
      connection,
      seedConfig.companyCode,
      seedConfig.outletCode
    );

    const createdGroups = [];
    const createdItems = [];

    for (let i = 0; i < seedConfig.groupCount; i += 1) {
      const code = `TGRP-${randomSuffix(6)}`;
      const name = `Test Group ${i + 1} ${randomSuffix(4)}`;
      const groupId = await insertItemGroup(connection, companyId, code, name);
      createdGroups.push({ groupId, code, name });
    }

    for (let i = 0; i < seedConfig.itemCount; i += 1) {
      const group = randomPick(createdGroups);
      const itemType = randomPick(itemTypePool);
      const itemName = `${randomPick(adjectivePool)} ${randomPick(nounPool)} ${randomSuffix(3)}`;
      const sku = `TSKU-${randomSuffix(8)}`;
      const itemId = await insertItem(connection, companyId, group.groupId, sku, itemName, itemType);

      const defaultPrice = randomPrice(seedConfig.minPrice, seedConfig.maxPrice);
      await insertItemPrice(connection, companyId, outletId, itemId, defaultPrice, false);

      let outletPrice = null;
      if (Math.random() < seedConfig.outletOverrideRatio) {
        const delta = randomInt(-4000, 6000);
        outletPrice = Math.max(0, defaultPrice + delta);
        await insertItemPrice(connection, companyId, outletId, itemId, outletPrice, true);
      }

      createdItems.push({
        itemId,
        sku,
        itemName,
        itemType,
        groupCode: group.code,
        defaultPrice,
        outletPrice
      });
    }

    await connection.commit();

    console.log("random test seed completed");
    console.log(`company=${seedConfig.companyCode} outlet=${seedConfig.outletCode}`);
    console.log(`created_groups=${createdGroups.length} created_items=${createdItems.length}`);
    console.log("sample_items=");
    for (const item of createdItems.slice(0, 5)) {
      console.log(
        `  ${item.sku} | ${item.itemName} | type=${item.itemType} | group=${item.groupCode} | default=${item.defaultPrice} | outlet=${item.outletPrice ?? "-"}`
      );
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("random test seed failed");
  console.error(error.message);
  process.exitCode = 1;
});
