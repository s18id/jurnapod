// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "./db";
import type {
  CreateVariantAttributeRequest,
  UpdateVariantAttributeRequest,
  UpdateVariantRequest,
  StockAdjustmentRequest,
  ItemVariantResponse,
  VariantAttribute,
  SyncPullVariant
} from "@jurnapod/shared";

const pool = getDbPool();

type VariantAttributeRow = RowDataPacket & {
  id: number;
  company_id: number;
  item_id: number;
  attribute_name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type VariantAttributeValueRow = RowDataPacket & {
  id: number;
  company_id: number;
  attribute_id: number;
  value: string;
  sort_order: number;
  created_at: string;
};

type ItemVariantRow = RowDataPacket & {
  id: number;
  company_id: number;
  item_id: number;
  sku: string;
  variant_name: string;
  price_override: string | null;
  stock_quantity: string;
  barcode: string | null;
  is_active: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type VariantCombinationRow = RowDataPacket & {
  variant_id: number;
  attribute_name: string;
  value: string;
};

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`SKU '${sku}' already exists`);
    this.name = "DuplicateSkuError";
  }
}

export class VariantNotFoundError extends Error {
  constructor(id: number) {
    super(`Variant ${id} not found`);
    this.name = "VariantNotFoundError";
  }
}

export class AttributeNotFoundError extends Error {
  constructor(id: number) {
    super(`Attribute ${id} not found`);
    this.name = "AttributeNotFoundError";
  }
}

export class ItemNotFoundError extends Error {
  constructor(id: number) {
    super(`Item ${id} not found`);
    this.name = "ItemNotFoundError";
  }
}

function generateVariantSku(
  parentSku: string,
  variantAttributes: Array<{ name: string; value: string }>
): string {
  const suffix = variantAttributes
    .map((attr) =>
      attr.value
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
    )
    .join("-");
  return `${parentSku}-${suffix}`;
}

function generateVariantCombinations(
  attributes: Array<{ name: string; values: string[] }>
): Array<Array<{ name: string; value: string }>> {
  if (attributes.length === 0) return [];
  if (attributes.length === 1) {
    return attributes[0].values.map((v) => [{ name: attributes[0].name, value: v }]);
  }
  const [first, ...rest] = attributes;
  const restCombinations = generateVariantCombinations(rest);
  const combinations: Array<Array<{ name: string; value: string }>> = [];
  for (const value of first.values) {
    for (const restCombo of restCombinations) {
      combinations.push([{ name: first.name, value }, ...restCombo]);
    }
  }
  return combinations;
}

function buildVariantName(
  attributes: Array<{ name: string; value: string }>
): string {
  return attributes.map((a) => a.value).join(", ");
}

export async function getItemById(
  companyId: number,
  itemId: number
): Promise<{ sku: string; price: number } | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT i.sku, COALESCE(ip.price, 0) as price
     FROM items i
     LEFT JOIN item_prices ip ON ip.item_id = i.id AND ip.outlet_id IS NULL AND ip.is_active = 1
     WHERE i.id = ? AND i.company_id = ?`,
    [itemId, companyId]
  );
  if (rows.length === 0) return null;
  return {
    sku: rows[0].sku || `ITEM-${itemId}`,
    price: Number(rows[0].price)
  };
}

export async function createVariantAttribute(
  companyId: number,
  itemId: number,
  input: CreateVariantAttributeRequest
): Promise<VariantAttribute> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify item exists
    const [itemRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, sku FROM items WHERE id = ? AND company_id = ?",
      [itemId, companyId]
    );
    if (itemRows.length === 0) {
      throw new ItemNotFoundError(itemId);
    }
    const parentSku = itemRows[0].sku || `ITEM-${itemId}`;

    // Create attribute
    const [attrResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO item_variant_attributes (company_id, item_id, attribute_name, sort_order)
       VALUES (?, ?, ?, ?)`,
      [companyId, itemId, input.attribute_name, 0]
    );
    const attributeId = attrResult.insertId;

    // Create values
    const valueIds: number[] = [];
    for (let i = 0; i < input.values.length; i++) {
      const [valResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO item_variant_attribute_values (company_id, attribute_id, value, sort_order)
         VALUES (?, ?, ?, ?)`,
        [companyId, attributeId, input.values[i], i]
      );
      valueIds.push(valResult.insertId);
    }

    // Get all existing attributes for this item to regenerate combinations
    const [existingAttrs] = await connection.execute<VariantAttributeRow[]>(
      `SELECT id, attribute_name, sort_order
       FROM item_variant_attributes
       WHERE item_id = ? AND company_id = ?
       ORDER BY sort_order, id`,
      [itemId, companyId]
    );

    const allAttributes: Array<{ id: number; name: string; values: string[] }> = [];
    for (const attr of existingAttrs) {
      const [valueRows] = await connection.execute<VariantAttributeValueRow[]>(
        `SELECT id, value FROM item_variant_attribute_values
         WHERE attribute_id = ? AND company_id = ?
         ORDER BY sort_order, id`,
        [attr.id, companyId]
      );
      allAttributes.push({
        id: attr.id,
        name: attr.attribute_name,
        values: valueRows.map((v) => v.value)
      });
    }

    // Generate all combinations
    const combinations = generateVariantCombinations(
      allAttributes.map((a) => ({ name: a.name, values: a.values }))
    );

    // Archive all existing variants before generating new combinations
    // This ensures old single-attribute variants are retired when multi-attribute variants are created
    await connection.execute(
      `UPDATE item_variants
       SET is_active = FALSE, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE item_id = ? AND company_id = ? AND archived_at IS NULL`,
      [itemId, companyId]
    );

    // Check existing variants (including archived ones to preserve stock history)
    const [existingVariants] = await connection.execute<ItemVariantRow[]>(
      `SELECT id, sku, variant_name, is_active FROM item_variants
       WHERE item_id = ? AND company_id = ?`,
      [itemId, companyId]
    );
    const existingSkus = new Set(existingVariants.map((v) => v.sku));

    // Create or reactivate variants for valid combinations
    for (const combo of combinations) {
      const sku = generateVariantSku(parentSku, combo);
      const variantName = buildVariantName(combo);

      // Check if this variant already exists (even if archived)
      const existingVariant = existingVariants.find((v) => v.sku === sku);

      if (existingVariant) {
        // Reactivate the archived variant
        if (!existingVariant.is_active) {
          await connection.execute(
            `UPDATE item_variants
             SET is_active = TRUE, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND company_id = ?`,
            [existingVariant.id, companyId]
          );
        }
      } else {
        // Create new variant
        const [variantResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO item_variants (company_id, item_id, sku, variant_name, price_override, stock_quantity, is_active)
           VALUES (?, ?, ?, ?, NULL, 0, TRUE)`,
          [companyId, itemId, sku, variantName]
        );
        const variantId = variantResult.insertId;

        // Link to attribute values
        for (const attrCombo of combo) {
          const attr = allAttributes.find((a) => a.name === attrCombo.name);
          if (attr) {
            const [valueRows] = await connection.execute<VariantAttributeValueRow[]>(
              `SELECT id FROM item_variant_attribute_values
               WHERE attribute_id = ? AND value = ? AND company_id = ?`,
              [attr.id, attrCombo.value, companyId]
            );
            if (valueRows.length > 0) {
              await connection.execute(
                `INSERT INTO item_variant_combinations (company_id, variant_id, attribute_id, value_id)
                 VALUES (?, ?, ?, ?)`,
                [companyId, variantId, attr.id, valueRows[0].id]
              );
            }
          }
        }
      }
    }

    await connection.commit();

    return {
      id: attributeId,
      attribute_name: input.attribute_name,
      sort_order: 0,
      values: input.values.map((v, i) => ({
        id: valueIds[i],
        value: v,
        sort_order: i
      }))
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateVariantAttribute(
  companyId: number,
  attributeId: number,
  input: UpdateVariantAttributeRequest
): Promise<VariantAttribute> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get current attribute info
    const [attrRows] = await connection.execute<VariantAttributeRow[]>(
      `SELECT id, item_id, attribute_name, sort_order
       FROM item_variant_attributes
       WHERE id = ? AND company_id = ?`,
      [attributeId, companyId]
    );
    if (attrRows.length === 0) {
      throw new AttributeNotFoundError(attributeId);
    }
    const attr = attrRows[0];

    // Update attribute name if provided
    if (input.attribute_name !== undefined) {
      await connection.execute(
        `UPDATE item_variant_attributes
         SET attribute_name = ?
         WHERE id = ? AND company_id = ?`,
        [input.attribute_name, attributeId, companyId]
      );
    }

    // Update values if provided
    if (input.values !== undefined) {
      // Get existing values
      const [existingValues] = await connection.execute<VariantAttributeValueRow[]>(
        `SELECT id, value FROM item_variant_attribute_values
         WHERE attribute_id = ? AND company_id = ?
         ORDER BY sort_order`,
        [attributeId, companyId]
      );

      const existingValueMap = new Map(existingValues.map((v) => [v.value, v.id]));
      const newValueSet = new Set(input.values);

      // Remove values that are no longer present
      for (const [value, valueId] of existingValueMap) {
        if (!newValueSet.has(value)) {
          // Archive variants using this value
          await connection.execute(
            `UPDATE item_variants SET is_active = FALSE
             WHERE id IN (
               SELECT variant_id FROM item_variant_combinations
               WHERE value_id = ? AND company_id = ?
             ) AND company_id = ?`,
            [valueId, companyId, companyId]
          );

          await connection.execute(
            `DELETE FROM item_variant_attribute_values
             WHERE id = ? AND company_id = ?`,
            [valueId, companyId]
          );
        }
      }

      // Add new values
      for (let i = 0; i < input.values.length; i++) {
        const value = input.values[i];
        if (!existingValueMap.has(value)) {
          await connection.execute(
            `INSERT INTO item_variant_attribute_values (company_id, attribute_id, value, sort_order)
             VALUES (?, ?, ?, ?)`,
            [companyId, attributeId, value, i]
          );
        } else {
          // Update sort order
          const existingValueId = existingValueMap.get(value);
          if (existingValueId) {
            await connection.execute(
              `UPDATE item_variant_attribute_values
               SET sort_order = ?
               WHERE id = ? AND company_id = ?`,
              [i, existingValueId, companyId]
            );
          }
        }
      }

      // Regenerate variants
      const parentSku =
        (await getItemById(companyId, attr.item_id))?.sku || `ITEM-${attr.item_id}`;

      const [existingAttrs] = await connection.execute<VariantAttributeRow[]>(
        `SELECT id, attribute_name, sort_order
         FROM item_variant_attributes
         WHERE item_id = ? AND company_id = ?
         ORDER BY sort_order, id`,
        [attr.item_id, companyId]
      );

      const allAttributes: Array<{ id: number; name: string; values: string[] }> = [];
      for (const a of existingAttrs) {
        const [valueRows] = await connection.execute<VariantAttributeValueRow[]>(
          `SELECT id, value FROM item_variant_attribute_values
           WHERE attribute_id = ? AND company_id = ?
           ORDER BY sort_order, id`,
          [a.id, companyId]
        );
        allAttributes.push({
          id: a.id,
          name: a.attribute_name,
          values: valueRows.map((v) => v.value)
        });
      }

      const combinations = generateVariantCombinations(
        allAttributes.map((a) => ({ name: a.name, values: a.values }))
      );

      // Archive all existing variants before generating new combinations
      await connection.execute(
        `UPDATE item_variants
         SET is_active = FALSE, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE item_id = ? AND company_id = ? AND archived_at IS NULL`,
        [attr.item_id, companyId]
      );

      const [existingVariants] = await connection.execute<ItemVariantRow[]>(
        `SELECT id, sku, variant_name, is_active FROM item_variants
         WHERE item_id = ? AND company_id = ?`,
        [attr.item_id, companyId]
      );

      for (const combo of combinations) {
        const sku = generateVariantSku(parentSku, combo);
        const variantName = buildVariantName(combo);

        // Check if this variant already exists (even if archived)
        const existingVariant = existingVariants.find((v) => v.sku === sku);

        if (existingVariant) {
          // Reactivate the archived variant
          if (!existingVariant.is_active) {
            await connection.execute(
              `UPDATE item_variants
               SET is_active = TRUE, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND company_id = ?`,
              [existingVariant.id, companyId]
            );
          }
        } else {
          // Create new variant
          const [variantResult] = await connection.execute<ResultSetHeader>(
            `INSERT INTO item_variants (company_id, item_id, sku, variant_name, price_override, stock_quantity, is_active)
             VALUES (?, ?, ?, ?, NULL, 0, TRUE)`,
            [companyId, attr.item_id, sku, variantName]
          );
          const variantId = variantResult.insertId;

          for (const attrCombo of combo) {
            const a = allAttributes.find((x) => x.name === attrCombo.name);
            if (a) {
              const [valueRows] = await connection.execute<VariantAttributeValueRow[]>(
                `SELECT id FROM item_variant_attribute_values
                 WHERE attribute_id = ? AND value = ? AND company_id = ?`,
                [a.id, attrCombo.value, companyId]
              );
              if (valueRows.length > 0) {
                await connection.execute(
                  `INSERT INTO item_variant_combinations (company_id, variant_id, attribute_id, value_id)
                   VALUES (?, ?, ?, ?)`,
                  [companyId, variantId, a.id, valueRows[0].id]
                );
              }
            }
          }
        }
      }
    }

    await connection.commit();

    // Return updated attribute
    const [values] = await pool.execute<VariantAttributeValueRow[]>(
      `SELECT id, value, sort_order
       FROM item_variant_attribute_values
       WHERE attribute_id = ? AND company_id = ?
       ORDER BY sort_order, id`,
      [attributeId, companyId]
    );

    return {
      id: attributeId,
      attribute_name: input.attribute_name || attr.attribute_name,
      sort_order: attr.sort_order,
      values: values.map((v) => ({
        id: v.id,
        value: v.value,
        sort_order: v.sort_order
      }))
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteVariantAttribute(
  companyId: number,
  attributeId: number
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Archive variants using this attribute
    await connection.execute(
      `UPDATE item_variants SET is_active = FALSE
       WHERE id IN (
         SELECT variant_id FROM item_variant_combinations
         WHERE attribute_id = ? AND company_id = ?
       ) AND company_id = ?`,
      [attributeId, companyId, companyId]
    );

    // Delete attribute (cascade will handle values and combinations)
    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM item_variant_attributes
       WHERE id = ? AND company_id = ?`,
      [attributeId, companyId]
    );

    if (result.affectedRows === 0) {
      throw new AttributeNotFoundError(attributeId);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listVariantAttributes(
  companyId: number,
  itemId: number
): Promise<VariantAttribute[]> {
  const [attrs] = await pool.execute<VariantAttributeRow[]>(
    `SELECT id, attribute_name, sort_order
     FROM item_variant_attributes
     WHERE item_id = ? AND company_id = ?
     ORDER BY sort_order, id`,
    [itemId, companyId]
  );

  const attributes: VariantAttribute[] = [];
  for (const attr of attrs) {
    const [values] = await pool.execute<VariantAttributeValueRow[]>(
      `SELECT id, value, sort_order
       FROM item_variant_attribute_values
       WHERE attribute_id = ? AND company_id = ?
       ORDER BY sort_order, id`,
      [attr.id, companyId]
    );

    attributes.push({
      id: attr.id,
      attribute_name: attr.attribute_name,
      sort_order: attr.sort_order,
      values: values.map((v) => ({
        id: v.id,
        value: v.value,
        sort_order: v.sort_order
      }))
    });
  }

  return attributes;
}

export async function getVariantEffectivePrice(
  companyId: number,
  variantId: number,
  outletId?: number
): Promise<number> {
  const [variantRows] = await pool.execute<RowDataPacket[]>(
    `SELECT price_override, item_id FROM item_variants
     WHERE id = ? AND company_id = ?`,
    [variantId, companyId]
  );
  if (variantRows.length === 0) {
    throw new VariantNotFoundError(variantId);
  }

  const priceOverride = variantRows[0].price_override;
  if (priceOverride !== null) {
    return Number(priceOverride);
  }

  // Fall back to parent item price
  const itemId = variantRows[0].item_id;

  if (outletId !== undefined) {
    // Try outlet-specific price first
    const [priceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT price FROM item_prices
       WHERE item_id = ? AND outlet_id = ? AND is_active = 1 AND company_id = ?`,
      [itemId, outletId, companyId]
    );
    if (priceRows.length > 0) {
      return Number(priceRows[0].price);
    }
  }

  // Fall back to company default price
  const [priceRows] = await pool.execute<RowDataPacket[]>(
    `SELECT price FROM item_prices
     WHERE item_id = ? AND outlet_id IS NULL AND is_active = 1 AND company_id = ?`,
    [itemId, companyId]
  );
  if (priceRows.length > 0) {
    return Number(priceRows[0].price);
  }

  return 0;
}

/**
 * Batch fetch effective prices for multiple variants in a single query.
 * Eliminates N+1 query problem when resolving prices for sync operations.
 */
export async function getVariantEffectivePricesBatch(
  companyId: number,
  variantIds: number[],
  outletId?: number
): Promise<Map<number, number>> {
  if (variantIds.length === 0) {
    return new Map();
  }

  // Fetch all variant data with price overrides and item_ids
  const placeholders = variantIds.map(() => '?').join(',');
  const [variantRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, price_override, item_id FROM item_variants
     WHERE id IN (${placeholders}) AND company_id = ?`,
    [...variantIds, companyId]
  );

  const priceMap = new Map<number, number>();
  const variantsNeedingParentPrice: Array<{ variantId: number; itemId: number }> = [];

  // First pass: handle price overrides
  for (const row of variantRows) {
    if (row.price_override !== null) {
      priceMap.set(row.id, Number(row.price_override));
    } else {
      variantsNeedingParentPrice.push({ variantId: row.id, itemId: row.item_id });
    }
  }

  if (variantsNeedingParentPrice.length === 0) {
    return priceMap;
  }

  // Get unique item IDs that need price lookup
  const uniqueItemIds = [...new Set(variantsNeedingParentPrice.map(v => v.itemId))];
  const itemPlaceholders = uniqueItemIds.map(() => '?').join(',');

  // Batch fetch outlet-specific prices first
  if (outletId !== undefined) {
    const [outletPriceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT item_id, price FROM item_prices
       WHERE item_id IN (${itemPlaceholders}) AND outlet_id = ? AND is_active = 1 AND company_id = ?`,
      [...uniqueItemIds, outletId, companyId]
    );

    const outletPriceMap = new Map<number, number>();
    for (const row of outletPriceRows) {
      outletPriceMap.set(row.item_id, Number(row.price));
    }

    // Assign outlet prices where available
    const itemsNeedingDefaultPrice: number[] = [];
    for (const { variantId, itemId } of variantsNeedingParentPrice) {
      if (outletPriceMap.has(itemId)) {
        priceMap.set(variantId, outletPriceMap.get(itemId)!);
      } else {
        itemsNeedingDefaultPrice.push(itemId);
      }
    }

    if (itemsNeedingDefaultPrice.length === 0) {
      return priceMap;
    }

    // Fetch default prices for remaining items
    const defaultPlaceholders = itemsNeedingDefaultPrice.map(() => '?').join(',');
    const [defaultPriceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT item_id, price FROM item_prices
       WHERE item_id IN (${defaultPlaceholders}) AND outlet_id IS NULL AND is_active = 1 AND company_id = ?`,
      [...itemsNeedingDefaultPrice, companyId]
    );

    const defaultPriceMap = new Map<number, number>();
    for (const row of defaultPriceRows) {
      defaultPriceMap.set(row.item_id, Number(row.price));
    }

    // Assign default prices
    for (const { variantId, itemId } of variantsNeedingParentPrice) {
      if (!priceMap.has(variantId)) {
        priceMap.set(variantId, defaultPriceMap.get(itemId) ?? 0);
      }
    }
  } else {
    // No outlet specified, fetch default prices for all
    const [defaultPriceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT item_id, price FROM item_prices
       WHERE item_id IN (${itemPlaceholders}) AND outlet_id IS NULL AND is_active = 1 AND company_id = ?`,
      [...uniqueItemIds, companyId]
    );

    const defaultPriceMap = new Map<number, number>();
    for (const row of defaultPriceRows) {
      defaultPriceMap.set(row.item_id, Number(row.price));
    }

    // Assign default prices
    for (const { variantId, itemId } of variantsNeedingParentPrice) {
      priceMap.set(variantId, defaultPriceMap.get(itemId) ?? 0);
    }
  }

  return priceMap;
}

export async function getItemVariants(
  companyId: number,
  itemId: number
): Promise<ItemVariantResponse[]> {
  const [variants] = await pool.execute<ItemVariantRow[]>(
    `SELECT id, item_id, sku, variant_name, price_override, stock_quantity, barcode, is_active, created_at, updated_at
     FROM item_variants
     WHERE item_id = ? AND company_id = ?
     ORDER BY sku`,
    [itemId, companyId]
  );

  const responses: ItemVariantResponse[] = [];
  for (const v of variants) {
    const [combos] = await pool.execute<VariantCombinationRow[]>(
      `SELECT ivc.variant_id, iva.attribute_name, ivav.value
       FROM item_variant_combinations ivc
       JOIN item_variant_attributes iva ON iva.id = ivc.attribute_id
       JOIN item_variant_attribute_values ivav ON ivav.id = ivc.value_id
       WHERE ivc.variant_id = ? AND ivc.company_id = ?
       ORDER BY iva.sort_order, ivav.sort_order`,
      [v.id, companyId]
    );

    const effectivePrice = await getVariantEffectivePrice(companyId, v.id);

    responses.push({
      id: v.id,
      item_id: v.item_id,
      sku: v.sku,
      variant_name: v.variant_name,
      price_override: v.price_override ? Number(v.price_override) : null,
      effective_price: effectivePrice,
      stock_quantity: Number(v.stock_quantity),
      barcode: v.barcode,
      is_active: Boolean(v.is_active),
      attributes: combos.map((c) => ({ attribute_name: c.attribute_name, value: c.value })),
      created_at: v.created_at,
      updated_at: v.updated_at
    });
  }

  return responses;
}

export async function getVariantById(
  companyId: number,
  variantId: number
): Promise<ItemVariantResponse | null> {
  const [variants] = await pool.execute<ItemVariantRow[]>(
    `SELECT id, item_id, sku, variant_name, price_override, stock_quantity, barcode, is_active, created_at, updated_at
     FROM item_variants
     WHERE id = ? AND company_id = ?`,
    [variantId, companyId]
  );
  if (variants.length === 0) return null;

  const v = variants[0];
  const [combos] = await pool.execute<VariantCombinationRow[]>(
    `SELECT ivc.variant_id, iva.attribute_name, ivav.value
     FROM item_variant_combinations ivc
     JOIN item_variant_attributes iva ON iva.id = ivc.attribute_id
     JOIN item_variant_attribute_values ivav ON ivav.id = ivc.value_id
     WHERE ivc.variant_id = ? AND ivc.company_id = ?
     ORDER BY iva.sort_order, ivav.sort_order`,
    [v.id, companyId]
  );

  const effectivePrice = await getVariantEffectivePrice(companyId, v.id);

  return {
    id: v.id,
    item_id: v.item_id,
    sku: v.sku,
    variant_name: v.variant_name,
    price_override: v.price_override ? Number(v.price_override) : null,
    effective_price: effectivePrice,
    stock_quantity: Number(v.stock_quantity),
    barcode: v.barcode,
    is_active: Boolean(v.is_active),
    attributes: combos.map((c) => ({ attribute_name: c.attribute_name, value: c.value })),
    created_at: v.created_at,
    updated_at: v.updated_at
  };
}

export async function updateVariant(
  companyId: number,
  variantId: number,
  input: UpdateVariantRequest
): Promise<ItemVariantResponse> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify variant exists
    const [variantRows] = await connection.execute<ItemVariantRow[]>(
      `SELECT id FROM item_variants
       WHERE id = ? AND company_id = ?`,
      [variantId, companyId]
    );
    if (variantRows.length === 0) {
      throw new VariantNotFoundError(variantId);
    }

    // Check SKU uniqueness if updating SKU
    if (input.sku !== undefined) {
      const [existingRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM item_variants
         WHERE sku = ? AND company_id = ? AND id != ?`,
        [input.sku, companyId, variantId]
      );
      if (existingRows.length > 0) {
        throw new DuplicateSkuError(input.sku);
      }
    }

    // Build update fields
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (input.sku !== undefined) {
      updates.push("sku = ?");
      values.push(input.sku);
    }
    if (input.price_override !== undefined) {
      updates.push("price_override = ?");
      values.push(input.price_override);
    }
    if (input.stock_quantity !== undefined) {
      updates.push("stock_quantity = ?");
      values.push(input.stock_quantity);
    }
    if (input.barcode !== undefined) {
      updates.push("barcode = ?");
      values.push(input.barcode);
    }
    if (input.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(input.is_active ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(variantId, companyId);
      await connection.execute(
        `UPDATE item_variants SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`,
        values
      );
    }

    await connection.commit();

    return (await getVariantById(companyId, variantId))!;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function adjustVariantStock(
  companyId: number,
  variantId: number,
  adjustment: number,
  reason: string
): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get current stock
    const [variantRows] = await connection.execute<ItemVariantRow[]>(
      `SELECT stock_quantity FROM item_variants
       WHERE id = ? AND company_id = ? FOR UPDATE`,
      [variantId, companyId]
    );
    if (variantRows.length === 0) {
      throw new VariantNotFoundError(variantId);
    }

    const currentStock = Number(variantRows[0].stock_quantity);
    const newStock = Math.max(0, currentStock + adjustment);

    await connection.execute(
      `UPDATE item_variants
       SET stock_quantity = ?
       WHERE id = ? AND company_id = ?`,
      [newStock, variantId, companyId]
    );

    // TODO: Add audit log entry for stock adjustment

    await connection.commit();
    return newStock;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function validateVariantSku(
  companyId: number,
  sku: string,
  excludeVariantId?: number
): Promise<{ valid: boolean; error?: string }> {
  let sql = `SELECT id FROM item_variants WHERE sku = ? AND company_id = ?`;
  const params: (string | number)[] = [sku, companyId];
  if (excludeVariantId !== undefined) {
    sql += " AND id != ?";
    params.push(excludeVariantId);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  if (rows.length > 0) {
    return { valid: false, error: `SKU '${sku}' already exists` };
  }
  return { valid: true };
}

// Sync functions
export async function getVariantsForSync(
  companyId: number,
  outletId?: number
): Promise<SyncPullVariant[]> {
  // Fetch all variants in one query
  const [variants] = await pool.execute<ItemVariantRow[]>(
    `SELECT v.id, v.item_id, v.sku, v.variant_name, v.price_override, v.stock_quantity, v.barcode, v.is_active
     FROM item_variants v
     JOIN items i ON i.id = v.item_id
     WHERE v.company_id = ? AND v.is_active = TRUE AND i.is_active = TRUE`,
    [companyId]
  );

  if (variants.length === 0) {
    return [];
  }

  // Collect all variant IDs for batch combination fetch
  const variantIds = variants.map((v) => v.id);

  // Single query to fetch all combinations for all variants (avoids N+1)
  const [allCombos] = await pool.execute<VariantCombinationRow[]>(
    `SELECT 
      ivc.variant_id,
      iva.attribute_name, 
      ivav.value
     FROM item_variant_combinations ivc
     JOIN item_variant_attributes iva ON iva.id = ivc.attribute_id
     JOIN item_variant_attribute_values ivav ON ivav.id = ivc.value_id
      WHERE ivc.variant_id IN (${variantIds.map(() => '?').join(',')}) AND ivc.company_id = ?
      ORDER BY iva.sort_order, ivav.sort_order`,
    [...variantIds, companyId]
  );

  // Group combinations by variant_id in memory
  const combosByVariant = new Map<number, Array<{ attribute_name: string; value: string }>>();
  for (const combo of allCombos) {
    const existing = combosByVariant.get(combo.variant_id) ?? [];
    existing.push({
      attribute_name: combo.attribute_name,
      value: combo.value
    });
    combosByVariant.set(combo.variant_id, existing);
  }

  // Batch fetch all effective prices in a single query to eliminate N+1
  const priceMap = await getVariantEffectivePricesBatch(companyId, variantIds, outletId);

  // Build results with pre-grouped combinations
  const results: SyncPullVariant[] = [];
  for (const v of variants) {
    const attributes: Record<string, string> = {};
    const variantCombos = combosByVariant.get(v.id) ?? [];
    for (const c of variantCombos) {
      attributes[c.attribute_name] = c.value;
    }

    results.push({
      id: v.id,
      item_id: v.item_id,
      sku: v.sku,
      variant_name: v.variant_name,
      price: priceMap.get(v.id) ?? 0,
      stock_quantity: Number(v.stock_quantity),
      barcode: v.barcode,
      is_active: Boolean(v.is_active),
      attributes
    });
  }

  return results;
}