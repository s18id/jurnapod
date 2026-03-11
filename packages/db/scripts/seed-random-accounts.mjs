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

function parseRatio(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${key} must be a number between 0 and 1`);
  }

  return parsed;
}

function parsePrefix(value, fallback, key) {
  const candidate = (value ?? fallback).trim().toUpperCase();
  if (candidate.length < 2 || candidate.length > 12) {
    throw new Error(`${key} length must be between 2 and 12`);
  }
  if (!/^[A-Z0-9_-]+$/.test(candidate)) {
    throw new Error(`${key} must contain only A-Z, 0-9, underscore, or dash`);
  }
  return candidate;
}

function seedConfigFromEnv() {
  return {
    companyCode: process.env.JP_COMPANY_CODE ?? "JP",
    count: parsePositiveInt(process.env.JP_TEST_SEED_ACCOUNTS_COUNT, 120, "JP_TEST_SEED_ACCOUNTS_COUNT"),
    groupRatio: parseRatio(process.env.JP_TEST_SEED_ACCOUNTS_GROUP_RATIO, 0.2, "JP_TEST_SEED_ACCOUNTS_GROUP_RATIO"),
    maxDepth: parsePositiveInt(process.env.JP_TEST_SEED_ACCOUNTS_MAX_DEPTH, 3, "JP_TEST_SEED_ACCOUNTS_MAX_DEPTH"),
    payableRatio: parseRatio(process.env.JP_TEST_SEED_ACCOUNTS_PAYABLE_RATIO, 0.08, "JP_TEST_SEED_ACCOUNTS_PAYABLE_RATIO"),
    inactiveRatio: parseRatio(process.env.JP_TEST_SEED_ACCOUNTS_INACTIVE_RATIO, 0.05, "JP_TEST_SEED_ACCOUNTS_INACTIVE_RATIO"),
    inheritNullRatio: parseRatio(process.env.JP_TEST_SEED_ACCOUNTS_INHERIT_NULL_RATIO, 0.18, "JP_TEST_SEED_ACCOUNTS_INHERIT_NULL_RATIO"),
    prefix: parsePrefix(process.env.JP_TEST_SEED_ACCOUNTS_PREFIX, "TACC", "JP_TEST_SEED_ACCOUNTS_PREFIX")
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

const TYPE_PROFILES = [
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

const NAME_PREFIX_BY_TYPE = {
  Kas: ["Kas Kecil", "Kas Operasional", "Kas Outlet"],
  Bank: ["Bank BCA", "Bank Mandiri", "Bank Operasional"],
  Piutang: ["Piutang Usaha", "Piutang Karyawan", "Piutang Lainnya"],
  Persediaan: ["Persediaan Bahan", "Persediaan Barang", "Persediaan Kemasan"],
  "Aset Tetap": ["Aset Peralatan", "Aset Kendaraan", "Aset Furnitur"],
  Hutang: ["Hutang Usaha", "Hutang Pajak", "Hutang Lainnya"],
  Modal: ["Modal Disetor", "Laba Ditahan", "Ekuitas Pemilik"],
  Pendapatan: ["Pendapatan Penjualan", "Pendapatan Jasa", "Pendapatan Lain"],
  Beban: ["Beban Gaji", "Beban Sewa", "Beban Operasional"]
};

async function readCompanyId(connection, companyCode) {
  const [rows] = await connection.execute(
    `SELECT id FROM companies WHERE code = ? LIMIT 1`,
    [companyCode]
  );

  if (!rows[0]) {
    throw new Error(
      `Company not found for JP_COMPANY_CODE=${companyCode}. Run db:seed first or use a valid company code.`
    );
  }

  return Number(rows[0].id);
}

function pickClassification(inheritNullRatio) {
  if (Math.random() < inheritNullRatio) {
    return {
      type_name: null,
      normal_balance: null,
      report_group: null
    };
  }

  const profile = randomPick(TYPE_PROFILES);
  return {
    type_name: profile.type_name,
    normal_balance: profile.normal_balance,
    report_group: profile.report_group
  };
}

function buildAccountName(typeName, isGroup) {
  if (!typeName) {
    return `${isGroup ? "Grup Akun" : "Akun Detail"} ${randomSuffix(4)}`;
  }

  const pool = NAME_PREFIX_BY_TYPE[typeName] ?? ["Akun Umum"];
  const base = randomPick(pool);
  return `${base} ${isGroup ? "Grup" : "Detail"} ${randomSuffix(3)}`;
}

function pickParentId(candidateParents, maxDepth, targetDepth) {
  const eligible = candidateParents.filter((node) => node.depth < maxDepth && node.depth < targetDepth);
  if (eligible.length === 0) {
    return null;
  }
  const parent = randomPick(eligible);
  return parent.id;
}

function createCode(prefix) {
  return `${prefix}-${randomSuffix(8)}`;
}

async function insertAccountWithUniqueCode(connection, accountRow, codePrefix) {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    attempts += 1;
    const code = createCode(codePrefix);

    try {
      const [result] = await connection.execute(
        `INSERT INTO accounts (
          company_id, code, name, type_name, normal_balance, report_group,
          parent_account_id, is_group, is_payable, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountRow.company_id,
          code,
          accountRow.name,
          accountRow.type_name,
          accountRow.normal_balance,
          accountRow.report_group,
          accountRow.parent_account_id,
          accountRow.is_group ? 1 : 0,
          accountRow.is_payable ? 1 : 0,
          accountRow.is_active ? 1 : 0
        ]
      );

      return {
        id: Number(result.insertId),
        code
      };
    } catch (error) {
      const isDuplicateCode =
        (error && error.code === "ER_DUP_ENTRY") ||
        (typeof error?.message === "string" && error.message.includes("uq_accounts_company_code"));

      if (!isDuplicateCode) {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate unique account code after multiple attempts");
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const seedConfig = seedConfigFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.beginTransaction();

    const companyId = await readCompanyId(connection, seedConfig.companyCode);

    const totalCount = seedConfig.count;
    const targetGroupCount = Math.max(1, Math.floor(totalCount * seedConfig.groupRatio));
    const rootGroupCount = Math.max(1, Math.min(targetGroupCount, Math.ceil(targetGroupCount * 0.25)));
    const nestedGroupCount = Math.max(0, targetGroupCount - rootGroupCount);
    const leafCount = Math.max(0, totalCount - targetGroupCount);

    const created = [];
    const groupParents = [];
    const depthCounts = new Map();

    const registerDepth = (depth) => {
      depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);
    };

    for (let i = 0; i < rootGroupCount; i += 1) {
      const classification = pickClassification(seedConfig.inheritNullRatio * 0.5);
      const depth = 0;
      const name = buildAccountName(classification.type_name, true);

      const inserted = await insertAccountWithUniqueCode(
        connection,
        {
          company_id: companyId,
          name,
          type_name: classification.type_name,
          normal_balance: classification.normal_balance,
          report_group: classification.report_group,
          parent_account_id: null,
          is_group: true,
          is_payable: false,
          is_active: Math.random() >= seedConfig.inactiveRatio
        },
        seedConfig.prefix
      );

      const row = {
        id: inserted.id,
        code: inserted.code,
        depth,
        is_group: true
      };
      created.push(row);
      groupParents.push(row);
      registerDepth(depth);
    }

    for (let i = 0; i < nestedGroupCount; i += 1) {
      const targetDepth = randomInt(1, Math.max(1, seedConfig.maxDepth - 1));
      const parentId = pickParentId(groupParents, seedConfig.maxDepth - 1, targetDepth);
      const parentDepth = parentId == null
        ? 0
        : (groupParents.find((node) => node.id === parentId)?.depth ?? 0);
      const depth = parentId == null ? 0 : parentDepth + 1;

      const classification = pickClassification(seedConfig.inheritNullRatio);
      const name = buildAccountName(classification.type_name, true);

      const inserted = await insertAccountWithUniqueCode(
        connection,
        {
          company_id: companyId,
          name,
          type_name: classification.type_name,
          normal_balance: classification.normal_balance,
          report_group: classification.report_group,
          parent_account_id: parentId,
          is_group: true,
          is_payable: false,
          is_active: Math.random() >= seedConfig.inactiveRatio
        },
        seedConfig.prefix
      );

      const row = {
        id: inserted.id,
        code: inserted.code,
        depth,
        is_group: true
      };
      created.push(row);
      groupParents.push(row);
      registerDepth(depth);
    }

    for (let i = 0; i < leafCount; i += 1) {
      const targetDepth = randomInt(1, Math.max(1, seedConfig.maxDepth));
      const parentId = pickParentId(groupParents, seedConfig.maxDepth, targetDepth);
      const parentDepth = parentId == null
        ? 0
        : (groupParents.find((node) => node.id === parentId)?.depth ?? 0);
      const depth = parentId == null ? 0 : parentDepth + 1;

      const classification = pickClassification(seedConfig.inheritNullRatio);
      const name = buildAccountName(classification.type_name, false);

      const inserted = await insertAccountWithUniqueCode(
        connection,
        {
          company_id: companyId,
          name,
          type_name: classification.type_name,
          normal_balance: classification.normal_balance,
          report_group: classification.report_group,
          parent_account_id: parentId,
          is_group: false,
          is_payable: Math.random() < seedConfig.payableRatio,
          is_active: Math.random() >= seedConfig.inactiveRatio
        },
        seedConfig.prefix
      );

      const row = {
        id: inserted.id,
        code: inserted.code,
        depth,
        is_group: false
      };
      created.push(row);
      registerDepth(depth);
    }

    await connection.commit();

    const createdGroups = created.filter((row) => row.is_group).length;
    const createdLeaves = created.length - createdGroups;
    const depthSummary = Array.from(depthCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([depth, count]) => `d${depth}:${count}`)
      .join(", ");

    console.log("random account seed completed");
    console.log(`company=${seedConfig.companyCode} prefix=${seedConfig.prefix}`);
    console.log(`created_accounts=${created.length} groups=${createdGroups} leaves=${createdLeaves}`);
    console.log(`depth_distribution=${depthSummary || "d0:0"}`);
    console.log("sample_codes=");
    for (const row of created.slice(0, 8)) {
      console.log(`  ${row.code} | depth=${row.depth} | ${row.is_group ? "group" : "leaf"}`);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("random account seed failed");
  console.error(error.message);
  process.exitCode = 1;
});
