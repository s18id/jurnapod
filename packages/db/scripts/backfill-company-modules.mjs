// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs";
import mysql from "mysql2/promise";

const KNOWN_FLAGS = new Set([
  "pos.enabled",
  "sales.enabled",
  "inventory.enabled",
  "purchasing.enabled",
  "pos.tax",
  "pos.payment_methods",
  "pos.config"
]);

function parsePositiveInt(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(argv) {
  let mode = "dry-run";
  let modeSetBy = null;
  let companyId = null;
  let allCompanies = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      if (modeSetBy === "--execute") {
        throw new Error("--dry-run and --execute are mutually exclusive");
      }
      mode = "dry-run";
      modeSetBy = "--dry-run";
      continue;
    }

    if (arg === "--execute") {
      if (modeSetBy === "--dry-run") {
        throw new Error("--dry-run and --execute are mutually exclusive");
      }
      mode = "execute";
      modeSetBy = "--execute";
      continue;
    }

    if (arg === "--all-companies") {
      allCompanies = true;
      continue;
    }

    if (arg === "--help") {
      return {
        help: true,
        mode,
        companyId,
        allCompanies
      };
    }

    if (arg.startsWith("--company-id=")) {
      companyId = parsePositiveInt(arg.slice("--company-id=".length), "--company-id");
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (allCompanies && companyId != null) {
    throw new Error("--all-companies cannot be combined with --company-id");
  }

  if (companyId == null && !allCompanies) {
    throw new Error("Provide --company-id or --all-companies");
  }

  return {
    help: false,
    mode,
    companyId,
    allCompanies
  };
}

function printHelp() {
  console.log("Usage: node packages/db/scripts/backfill-company-modules.mjs [--dry-run|--execute] [--company-id=<id>|--all-companies]");
  console.log("Defaults to --dry-run when mode is omitted");
  console.log("--execute requires --company-id unless --all-companies is provided");
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

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, sortJsonValue(val)])
    );
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizePaymentMethods(value) {
  if (!value) {
    return null;
  }

  const candidates = Array.isArray(value) ? value : value?.methods;
  if (!Array.isArray(candidates)) {
    return null;
  }

  const normalized = candidates
    .map((method) => {
      if (typeof method === "string") {
        return method.trim();
      }
      if (isPlainObject(method) && typeof method.code === "string") {
        return method.code.trim();
      }
      return "";
    })
    .filter((method) => method.length > 0);

  return normalized.length > 0 ? normalized : null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return null;
}

function normalizeTaxConfig(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const result = {};
  const rate = Number(value.rate);
  if (Number.isFinite(rate) && rate >= 0) {
    result.rate = rate;
  }

  const inclusive = normalizeBoolean(value.inclusive);
  if (inclusive !== null) {
    result.inclusive = inclusive;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function mergeObjects(base, override) {
  if (!isPlainObject(override)) {
    return base;
  }

  const next = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergeObjects(next[key], value);
    } else {
      next[key] = value;
    }
  }

  return next;
}

function resolveModuleCatalog() {
  return [
    { code: "platform", name: "Platform", description: "Core platform services" },
    { code: "pos", name: "POS", description: "Point of sale" },
    { code: "sales", name: "Sales", description: "Sales invoices" },
    { code: "inventory", name: "Inventory", description: "Stock movements and recipes" },
    { code: "purchasing", name: "Purchasing", description: "Purchasing and payables" },
    { code: "reports", name: "Reports", description: "Reporting and analytics" },
    { code: "settings", name: "Settings", description: "Settings and configuration" },
    { code: "accounts", name: "Accounts", description: "Chart of accounts" },
    { code: "journals", name: "Journals", description: "Journal entries and posting" }
  ];
}

async function upsertModules(connection, catalog) {
  const moduleIds = new Map();
  for (const moduleEntry of catalog) {
    const [result] = await connection.execute(
      `INSERT INTO modules (code, name, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         name = VALUES(name),
         description = VALUES(description),
         updated_at = CURRENT_TIMESTAMP`,
      [moduleEntry.code, moduleEntry.name, moduleEntry.description]
    );
    moduleIds.set(moduleEntry.code, Number(result.insertId));
  }
  return moduleIds;
}

function buildCompanyModules(flags) {
  const flagsByKey = new Map(flags.map((flag) => [flag.key, flag]));
  const legacyFlags = {};

  for (const flag of flags) {
    if (!KNOWN_FLAGS.has(flag.key)) {
      legacyFlags[flag.key] = {
        enabled: flag.enabled === 1,
        config_json: safeJsonParse(flag.config_json) ?? {}
      };
    }
  }

  const posConfig = {};
  const posTaxConfig = normalizeTaxConfig(safeJsonParse(flagsByKey.get("pos.tax")?.config_json));
  if (posTaxConfig) {
    posConfig.tax = posTaxConfig;
  }

  const posPaymentConfig = safeJsonParse(flagsByKey.get("pos.payment_methods")?.config_json);
  const posPaymentMethods = normalizePaymentMethods(posPaymentConfig);
  if (posPaymentMethods) {
    posConfig.payment_methods = posPaymentMethods;
  }

  const posConfigFlag = safeJsonParse(flagsByKey.get("pos.config")?.config_json);
  if (posConfigFlag) {
    if (isPlainObject(posConfigFlag)) {
      if (posConfigFlag.payment_methods) {
        const normalized = normalizePaymentMethods(posConfigFlag.payment_methods);
        if (normalized) {
          posConfigFlag.payment_methods = normalized;
        }
      }
      Object.assign(posConfig, mergeObjects(posConfig, posConfigFlag));
    } else {
      const normalized = normalizePaymentMethods(posConfigFlag);
      if (normalized) {
        posConfig.payment_methods = normalized;
      }
    }
  }

  const inventoryConfig = {};
  const inventoryFlag = safeJsonParse(flagsByKey.get("inventory.enabled")?.config_json);
  if (isPlainObject(inventoryFlag) && Number.isFinite(Number(inventoryFlag.level))) {
    inventoryConfig.level = Number(inventoryFlag.level);
  }

  return {
    platform: {
      enabled: true,
      config: Object.keys(legacyFlags).length > 0 ? { legacy_flags: legacyFlags } : {}
    },
    pos: {
      enabled: flagsByKey.get("pos.enabled")?.enabled === 1,
      config: posConfig
    },
    sales: {
      enabled: flagsByKey.get("sales.enabled")?.enabled === 1,
      config: {}
    },
    inventory: {
      enabled: flagsByKey.get("inventory.enabled")?.enabled === 1,
      config: inventoryConfig
    },
    purchasing: {
      enabled: flagsByKey.get("purchasing.enabled")?.enabled === 1,
      config: {}
    },
    reports: { enabled: true, config: {} },
    settings: { enabled: true, config: {} },
    accounts: { enabled: true, config: {} },
    journals: { enabled: true, config: {} }
  };
}

async function listCompanyIds(connection, options) {
  if (options.companyId != null) {
    return [options.companyId];
  }

  const [rows] = await connection.execute("SELECT id FROM companies ORDER BY id ASC");
  return rows.map((row) => Number(row.id));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.mode === "execute" && !options.companyId && !options.allCompanies) {
    throw new Error("--execute requires --company-id or --all-companies");
  }

  const connection = await mysql.createConnection(dbConfigFromEnv());
  try {
    const moduleCatalog = resolveModuleCatalog();
    const moduleIds = await upsertModules(connection, moduleCatalog);
    const companyIds = await listCompanyIds(connection, options);

    for (const companyId of companyIds) {
      const [flagRows] = await connection.execute(
        `SELECT \`key\`, enabled, config_json
         FROM feature_flags
         WHERE company_id = ?`,
        [companyId]
      );

      const modules = buildCompanyModules(
        flagRows.map((row) => ({
          key: String(row.key ?? ""),
          enabled: Number(row.enabled ?? 0),
          config_json: typeof row.config_json === "string" ? row.config_json : "{}"
        }))
      );

      const legacyCount = isPlainObject(modules.platform.config.legacy_flags)
        ? Object.keys(modules.platform.config.legacy_flags).length
        : 0;

      if (options.mode === "dry-run") {
        console.log(
          `[dry-run] company ${companyId}: pos=${modules.pos.enabled} sales=${modules.sales.enabled} inventory=${modules.inventory.enabled} purchasing=${modules.purchasing.enabled} legacy_flags=${legacyCount}`
        );
        continue;
      }

      await connection.beginTransaction();
      try {
        for (const [code, moduleEntry] of Object.entries(modules)) {
          const moduleId = moduleIds.get(code);
          if (!moduleId) {
            throw new Error(`missing module id for ${code}`);
          }

          await connection.execute(
            `INSERT INTO company_modules (
               company_id,
               module_id,
               enabled,
               config_json,
               created_by_user_id,
               updated_by_user_id
             ) VALUES (?, ?, ?, ?, NULL, NULL)
             ON DUPLICATE KEY UPDATE
               enabled = VALUES(enabled),
               config_json = VALUES(config_json),
               updated_at = CURRENT_TIMESTAMP`,
            [companyId, moduleId, moduleEntry.enabled ? 1 : 0, stableStringify(moduleEntry.config)]
          );
        }
        await connection.commit();
        console.log(
          `backfilled company ${companyId}: pos=${modules.pos.enabled} sales=${modules.sales.enabled} inventory=${modules.inventory.enabled} purchasing=${modules.purchasing.enabled} legacy_flags=${legacyCount}`
        );
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("backfill company_modules failed");
  console.error(error.message);
  process.exitCode = 1;
});
