import "./load-env.mjs";
import mysql from "mysql2/promise";

function parsePositiveInt(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return parsed;
}

function parseMinInt(value, fallback, key, minValue) {
  const parsed = parsePositiveInt(value, fallback, key);
  if (parsed < minValue) {
    throw new Error(`${key} must be >= ${minValue}`);
  }
  return parsed;
}

function parseBoolean(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`${key} must be "true" or "false"`);
}

function parseCostingMethod(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "AVG" || normalized === "FIFO" || normalized === "LIFO") {
    return normalized;
  }

  throw new Error(`${key} must be AVG, FIFO, or LIFO`);
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

const SETTINGS_DEFINITIONS = [
  {
    key: "feature.pos.auto_sync_enabled",
    valueType: "boolean",
    envKey: "JP_FEATURE_POS_AUTO_SYNC_ENABLED",
    parse: (value) => parseBoolean(value, true, "JP_FEATURE_POS_AUTO_SYNC_ENABLED")
  },
  {
    key: "feature.pos.sync_interval_seconds",
    valueType: "int",
    envKey: "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS",
    parse: (value) =>
      parseMinInt(value, 60, "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS", 5)
  },
  {
    key: "feature.sales.tax_included_default",
    valueType: "boolean",
    envKey: "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT",
    parse: (value) => parseBoolean(value, false, "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT")
  },
  {
    key: "feature.inventory.allow_backorder",
    valueType: "boolean",
    envKey: "JP_FEATURE_INVENTORY_ALLOW_BACKORDER",
    parse: (value) => parseBoolean(value, false, "JP_FEATURE_INVENTORY_ALLOW_BACKORDER")
  },
  {
    key: "feature.purchasing.require_approval",
    valueType: "boolean",
    envKey: "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL",
    parse: (value) => parseBoolean(value, true, "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL")
  },
  {
    key: "inventory.low_stock_threshold",
    valueType: "int",
    envKey: "JP_INVENTORY_LOW_STOCK_THRESHOLD",
    parse: (value) => parsePositiveInt(value, 5, "JP_INVENTORY_LOW_STOCK_THRESHOLD")
  },
  {
    key: "inventory.reorder_point",
    valueType: "int",
    envKey: "JP_INVENTORY_REORDER_POINT",
    parse: (value) => parsePositiveInt(value, 10, "JP_INVENTORY_REORDER_POINT")
  },
  {
    key: "inventory.allow_negative_stock",
    valueType: "boolean",
    envKey: "JP_INVENTORY_ALLOW_NEGATIVE_STOCK",
    parse: (value) => parseBoolean(value, false, "JP_INVENTORY_ALLOW_NEGATIVE_STOCK")
  },
  {
    key: "inventory.costing_method",
    valueType: "enum",
    envKey: "JP_INVENTORY_COSTING_METHOD",
    parse: (value) => parseCostingMethod(value, "AVG", "JP_INVENTORY_COSTING_METHOD")
  },
  {
    key: "inventory.warn_on_negative",
    valueType: "boolean",
    envKey: "JP_INVENTORY_WARN_ON_NEGATIVE",
    parse: (value) => parseBoolean(value, true, "JP_INVENTORY_WARN_ON_NEGATIVE")
  }
];

async function main() {
  const connection = await mysql.createConnection(dbConfigFromEnv());
  try {
    const [rows] = await connection.execute(
      `SELECT c.id AS company_id, MIN(o.id) AS outlet_id
       FROM companies c
       INNER JOIN outlets o ON o.company_id = c.id
       GROUP BY c.id`
    );

    const targets = rows.map((row) => ({
      companyId: Number(row.company_id),
      outletId: Number(row.outlet_id)
    }));

    if (targets.length === 0) {
      console.log("No companies with outlets found. Skipping settings seed.");
      return;
    }

    let inserted = 0;
    for (const target of targets) {
      for (const setting of SETTINGS_DEFINITIONS) {
        const rawValue = process.env[setting.envKey];
        const parsedValue = setting.parse(rawValue);
        const valueJson = JSON.stringify(parsedValue);

        const [result] = await connection.execute(
          `INSERT IGNORE INTO company_settings (
             company_id,
             outlet_id,
             \`key\`,
             value_type,
             value_json,
             created_by_user_id,
             updated_by_user_id
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
          [target.companyId, target.outletId, setting.key, setting.valueType, valueJson]
        );

        if (result.affectedRows > 0) {
          inserted += 1;
        }
      }
    }

    console.log(`Settings seed completed. Inserted ${inserted} setting rows.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Settings seed failed", error);
  process.exitCode = 1;
});
