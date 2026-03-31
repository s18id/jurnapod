// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb, type KyselySchema } from "./db";
import type {
  CreateVariantAttributeRequest,
  UpdateVariantAttributeRequest,
  UpdateVariantRequest,
  StockAdjustmentRequest,
  ItemVariantResponse,
  VariantAttribute,
  SyncPullVariant
} from "@jurnapod/shared";
import { withTransaction } from "@jurnapod/db";

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
  const db = getDb();
  const row = await db
    .selectFrom("items as i")
    .leftJoin("item_prices as ip", "ip.item_id", "i.id")
    .where("i.id", "=", itemId)
    .where("i.company_id", "=", companyId)
    .where((eb) => eb.or([
      eb("ip.outlet_id", "is", null),
      eb("ip.id", "is", null)
    ]))
    .where("ip.is_active", "=", 1)
    .select(["i.sku", "ip.price"])
    .executeTakeFirst();
  
  if (!row) return null;
  return {
    sku: (row as { sku: string | null }).sku || `ITEM-${itemId}`,
    price: Number((row as { price: number | null }).price ?? 0)
  };
}

export async function createVariantAttribute(
  companyId: number,
  itemId: number,
  input: CreateVariantAttributeRequest
): Promise<VariantAttribute> {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    // Verify item exists
    const itemRow = await trx
      .selectFrom("items")
      .where("id", "=", itemId)
      .where("company_id", "=", companyId)
      .select(["id", "sku"])
      .executeTakeFirst();
    
    if (!itemRow) {
      throw new ItemNotFoundError(itemId);
    }
    const parentSku = (itemRow as { sku: string | null }).sku || `ITEM-${itemId}`;

    // Create attribute
    const attrResult = await trx
      .insertInto("item_variant_attributes")
      .values({
        company_id: companyId,
        item_id: itemId,
        attribute_name: input.attribute_name,
        sort_order: 0
      })
      .returningAll()
      .executeTakeFirst();
    
    const attributeId = Number(attrResult!.id);

    // Create values
    const valueIds: number[] = [];
    for (let i = 0; i < input.values.length; i++) {
      const valResult = await trx
        .insertInto("item_variant_attribute_values")
        .values({
          company_id: companyId,
          attribute_id: attributeId,
          value: input.values[i],
          sort_order: i
        })
        .returningAll()
        .executeTakeFirst();
      valueIds.push(Number(valResult!.id));
    }

    // Get all existing attributes for this item to regenerate combinations
    const existingAttrs = await trx
      .selectFrom("item_variant_attributes")
      .where("item_id", "=", itemId)
      .where("company_id", "=", companyId)
      .select(["id", "attribute_name", "sort_order"])
      .orderBy("sort_order", "asc")
      .orderBy("id", "asc")
      .execute();

    const allAttributes: Array<{ id: number; name: string; values: string[] }> = [];
    for (const attr of existingAttrs) {
      const valueRows = await trx
        .selectFrom("item_variant_attribute_values")
        .where("attribute_id", "=", attr.id)
        .where("company_id", "=", companyId)
        .select(["id", "value"])
        .orderBy("sort_order", "asc")
        .orderBy("id", "asc")
        .execute();
      allAttributes.push({
        id: attr.id,
        name: (attr as { attribute_name: string }).attribute_name,
        values: valueRows.map((v) => (v as { value: string }).value)
      });
    }

    // Generate all combinations
    const combinations = generateVariantCombinations(
      allAttributes.map((a) => ({ name: a.name, values: a.values }))
    );

    // Archive all existing variants before generating new combinations
    // This ensures old single-attribute variants are retired when multi-attribute variants are created
    await sql`
      UPDATE item_variants
      SET is_active = FALSE, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE item_id = ${itemId} AND company_id = ${companyId} AND archived_at IS NULL
    `.execute(trx);

    // Check existing variants (including archived ones to preserve stock history)
    const existingVariants = await trx
      .selectFrom("item_variants")
      .where("item_id", "=", itemId)
      .where("company_id", "=", companyId)
      .select(["id", "sku", "variant_name", "is_active"])
      .execute();
    const existingSkus = new Set(existingVariants.map((v) => (v as { sku: string }).sku));

    // Create or reactivate variants for valid combinations
    for (const combo of combinations) {
      const sku = generateVariantSku(parentSku, combo);
      const variantName = buildVariantName(combo);

      // Check if this variant already exists (even if archived)
      const existingVariant = existingVariants.find((v) => (v as { sku: string }).sku === sku);

      if (existingVariant) {
        // Reactivate the archived variant
        if (!(existingVariant as { is_active: number }).is_active) {
          await trx
            .updateTable("item_variants")
            .set({ is_active: 1, archived_at: null, updated_at: new Date() })
            .where("id", "=", (existingVariant as { id: number }).id)
            .where("company_id", "=", companyId)
            .execute();
        }
      } else {
        // Create new variant
        const variantResult = await trx
          .insertInto("item_variants")
          .values({
            company_id: companyId,
            item_id: itemId,
            sku,
            variant_name: variantName,
            price_override: null,
            stock_quantity: 0,
            is_active: 1
          })
          .returningAll()
          .executeTakeFirst();
        
        const variantId = Number(variantResult!.id);

        // Link to attribute values
        for (const attrCombo of combo) {
          const attr = allAttributes.find((a) => a.name === attrCombo.name);
          if (attr) {
            const valueRows = await trx
              .selectFrom("item_variant_attribute_values")
              .where("attribute_id", "=", attr.id)
              .where("value", "=", attrCombo.value)
              .where("company_id", "=", companyId)
              .select(["id"])
              .execute();
            
            if (valueRows.length > 0) {
              await trx
                .insertInto("item_variant_combinations")
                .values({
                  company_id: companyId,
                  variant_id: variantId,
                  attribute_id: attr.id,
                  value_id: Number(valueRows[0].id)
                })
                .execute();
            }
          }
        }
      }
    }

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
  });
}

export async function updateVariantAttribute(
  companyId: number,
  attributeId: number,
  input: UpdateVariantAttributeRequest
): Promise<VariantAttribute> {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    // Get current attribute info
    const attrRows = await trx
      .selectFrom("item_variant_attributes")
      .where("id", "=", attributeId)
      .where("company_id", "=", companyId)
      .select(["id", "item_id", "attribute_name", "sort_order"])
      .execute();
    
    if (attrRows.length === 0) {
      throw new AttributeNotFoundError(attributeId);
    }
    const attr = attrRows[0] as { id: number; item_id: number; attribute_name: string; sort_order: number };

    // Update attribute name if provided
    if (input.attribute_name !== undefined) {
      await trx
        .updateTable("item_variant_attributes")
        .set({ attribute_name: input.attribute_name })
        .where("id", "=", attributeId)
        .where("company_id", "=", companyId)
        .execute();
    }

    // Update values if provided
    if (input.values !== undefined) {
      // Get existing values
      const existingValues = await trx
        .selectFrom("item_variant_attribute_values")
        .where("attribute_id", "=", attributeId)
        .where("company_id", "=", companyId)
        .select(["id", "value"])
        .orderBy("sort_order", "asc")
        .execute();

      const existingValueMap = new Map(existingValues.map((v) => [(v as { value: string }).value, (v as { id: number }).id]));
      const newValueSet = new Set(input.values);

      // Remove values that are no longer present
      for (const [value, valueId] of existingValueMap) {
        if (!newValueSet.has(value)) {
          // Archive variants using this value
          await sql`
            UPDATE item_variants SET is_active = FALSE
            WHERE id IN (
              SELECT variant_id FROM item_variant_combinations
              WHERE value_id = ${valueId} AND company_id = ${companyId}
            ) AND company_id = ${companyId}
          `.execute(trx);

          await trx
            .deleteFrom("item_variant_attribute_values")
            .where("id", "=", valueId)
            .where("company_id", "=", companyId)
            .execute();
        }
      }

      // Add new values
      for (let i = 0; i < input.values.length; i++) {
        const value = input.values[i];
        if (!existingValueMap.has(value)) {
          await trx
            .insertInto("item_variant_attribute_values")
            .values({
              company_id: companyId,
              attribute_id: attributeId,
              value,
              sort_order: i
            })
            .execute();
        } else {
          // Update sort order
          const existingValueId = existingValueMap.get(value);
          if (existingValueId !== undefined) {
            await trx
              .updateTable("item_variant_attribute_values")
              .set({ sort_order: i })
              .where("id", "=", existingValueId)
              .where("company_id", "=", companyId)
              .execute();
          }
        }
      }

      // Regenerate variants
      const itemInfo = await getItemById(companyId, attr.item_id);
      const parentSku = itemInfo?.sku || `ITEM-${attr.item_id}`;

      const existingAttrs = await trx
        .selectFrom("item_variant_attributes")
        .where("item_id", "=", attr.item_id)
        .where("company_id", "=", companyId)
        .select(["id", "attribute_name", "sort_order"])
        .orderBy("sort_order", "asc")
        .orderBy("id", "asc")
        .execute();

      const allAttributes: Array<{ id: number; name: string; values: string[] }> = [];
      for (const a of existingAttrs) {
        const valueRows = await trx
          .selectFrom("item_variant_attribute_values")
          .where("attribute_id", "=", a.id)
          .where("company_id", "=", companyId)
          .select(["id", "value"])
          .orderBy("sort_order", "asc")
          .execute();
        allAttributes.push({
          id: a.id,
          name: (a as { attribute_name: string }).attribute_name,
          values: valueRows.map((v) => (v as { value: string }).value)
        });
      }

      const combinations = generateVariantCombinations(
        allAttributes.map((a) => ({ name: a.name, values: a.values }))
      );

      // Archive all existing variants before generating new combinations
      await sql`
        UPDATE item_variants
        SET is_active = FALSE, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE item_id = ${attr.item_id} AND company_id = ${companyId} AND archived_at IS NULL
      `.execute(trx);

      const existingVariants = await trx
        .selectFrom("item_variants")
        .where("item_id", "=", attr.item_id)
        .where("company_id", "=", companyId)
        .select(["id", "sku", "variant_name", "is_active"])
        .execute();

      for (const combo of combinations) {
        const sku = generateVariantSku(parentSku, combo);
        const variantName = buildVariantName(combo);

        // Check if this variant already exists (even if archived)
        const existingVariant = existingVariants.find((v) => (v as { sku: string }).sku === sku);

        if (existingVariant) {
          // Reactivate the archived variant
          if (!(existingVariant as { is_active: number }).is_active) {
            await trx
              .updateTable("item_variants")
              .set({ is_active: 1, archived_at: null, updated_at: new Date() })
              .where("id", "=", (existingVariant as { id: number }).id)
              .where("company_id", "=", companyId)
              .execute();
          }
        } else {
          // Create new variant
          const variantResult = await trx
            .insertInto("item_variants")
            .values({
              company_id: companyId,
              item_id: attr.item_id,
              sku,
              variant_name: variantName,
              price_override: null,
              stock_quantity: 0,
              is_active: 1
            })
            .returningAll()
            .executeTakeFirst();
          
          const variantId = Number(variantResult!.id);

          for (const attrCombo of combo) {
            const a = allAttributes.find((x) => x.name === attrCombo.name);
            if (a) {
              const valueRows = await trx
                .selectFrom("item_variant_attribute_values")
                .where("attribute_id", "=", a.id)
                .where("value", "=", attrCombo.value)
                .where("company_id", "=", companyId)
                .select(["id"])
                .execute();
              
              if (valueRows.length > 0) {
                await trx
                  .insertInto("item_variant_combinations")
                  .values({
                    company_id: companyId,
                    variant_id: variantId,
                    attribute_id: a.id,
                    value_id: Number(valueRows[0].id)
                  })
                  .execute();
              }
            }
          }
        }
      }
    }

    // Return updated attribute
    const values = await trx
      .selectFrom("item_variant_attribute_values")
      .where("attribute_id", "=", attributeId)
      .where("company_id", "=", companyId)
      .select(["id", "value", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute();

    return {
      id: attributeId,
      attribute_name: input.attribute_name || (attr as { attribute_name: string }).attribute_name,
      sort_order: (attr as { sort_order: number }).sort_order,
      values: values.map((v) => ({
        id: (v as { id: number }).id,
        value: (v as { value: string }).value,
        sort_order: (v as { sort_order: number }).sort_order
      }))
    };
  });
}

export async function deleteVariantAttribute(
  companyId: number,
  attributeId: number
): Promise<void> {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    // Archive variants using this attribute
    await sql`
      UPDATE item_variants SET is_active = FALSE
      WHERE id IN (
        SELECT variant_id FROM item_variant_combinations
        WHERE attribute_id = ${attributeId} AND company_id = ${companyId}
      ) AND company_id = ${companyId}
    `.execute(trx);

    // Delete attribute (cascade will handle values and combinations)
    const result = await sql`
      DELETE FROM item_variant_attributes
      WHERE id = ${attributeId} AND company_id = ${companyId}
    `.execute(trx);

    if (result.numAffectedRows === BigInt(0)) {
      throw new AttributeNotFoundError(attributeId);
    }
  });
}

export async function listVariantAttributes(
  companyId: number,
  itemId: number
): Promise<VariantAttribute[]> {
  const db = getDb();
  const attrs = await db
    .selectFrom("item_variant_attributes")
    .where("item_id", "=", itemId)
    .where("company_id", "=", companyId)
    .select(["id", "attribute_name", "sort_order"])
    .orderBy("sort_order", "asc")
    .execute();

  const attributes: VariantAttribute[] = [];
  for (const attr of attrs) {
    const values = await db
      .selectFrom("item_variant_attribute_values")
      .where("attribute_id", "=", attr.id)
      .where("company_id", "=", companyId)
      .select(["id", "value", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute();

    attributes.push({
      id: attr.id,
      attribute_name: (attr as { attribute_name: string }).attribute_name,
      sort_order: (attr as { sort_order: number }).sort_order,
      values: values.map((v) => ({
        id: (v as { id: number }).id,
        value: (v as { value: string }).value,
        sort_order: (v as { sort_order: number }).sort_order
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
  const db = getDb();
  const variantRow = await db
    .selectFrom("item_variants")
    .where("id", "=", variantId)
    .where("company_id", "=", companyId)
    .select(["price_override", "item_id"])
    .executeTakeFirst();

  if (!variantRow) {
    throw new VariantNotFoundError(variantId);
  }

  const priceOverride = (variantRow as { price_override: string | null }).price_override;
  if (priceOverride !== null) {
    return Number(priceOverride);
  }

  // Fall back to parent item price
  const itemId = (variantRow as { item_id: number }).item_id;

  if (outletId !== undefined) {
    // Try outlet-specific price first
    const priceRow = await db
      .selectFrom("item_prices")
      .where("item_id", "=", itemId)
      .where("outlet_id", "=", outletId)
      .where("is_active", "=", 1)
      .where("company_id", "=", companyId)
      .select(["price"])
      .executeTakeFirst();

    if (priceRow) {
      return Number((priceRow as { price: number | string }).price);
    }
  }

  // Fall back to company default price
  const defaultPriceRow = await db
    .selectFrom("item_prices")
    .where("item_id", "=", itemId)
    .where("outlet_id", "is", null)
    .where("is_active", "=", 1)
    .where("company_id", "=", companyId)
    .select(["price"])
    .executeTakeFirst();

  if (defaultPriceRow) {
    return Number((defaultPriceRow as { price: number | string }).price);
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

  const db = getDb();

  // Fetch all variant data with price overrides and item_ids
  const variantRows = await sql<{ id: number; price_override: string | null; item_id: number }>`
    SELECT id, price_override, item_id FROM item_variants
    WHERE id IN (${sql.join(variantIds.map(id => sql`${id}`))}) AND company_id = ${companyId}
  `.execute(db);

  const priceMap = new Map<number, number>();
  const variantsNeedingParentPrice: Array<{ variantId: number; itemId: number }> = [];

  // First pass: handle price overrides
  for (const row of variantRows.rows) {
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

  // Batch fetch outlet-specific prices first
  if (outletId !== undefined) {
    const outletPriceRows = await sql<{ item_id: number; price: number }>`
      SELECT item_id, price FROM item_prices
      WHERE item_id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`))}) AND outlet_id = ${outletId} AND is_active = 1 AND company_id = ${companyId}
    `.execute(db);

    const outletPriceMap = new Map<number, number>();
    for (const row of outletPriceRows.rows) {
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
    const defaultPriceRows = await sql<{ item_id: number; price: number }>`
      SELECT item_id, price FROM item_prices
      WHERE item_id IN (${sql.join(itemsNeedingDefaultPrice.map(id => sql`${id}`))}) AND outlet_id IS NULL AND is_active = 1 AND company_id = ${companyId}
    `.execute(db);

    const defaultPriceMap = new Map<number, number>();
    for (const row of defaultPriceRows.rows) {
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
    const defaultPriceRows = await sql<{ item_id: number; price: number }>`
      SELECT item_id, price FROM item_prices
      WHERE item_id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`))}) AND outlet_id IS NULL AND is_active = 1 AND company_id = ${companyId}
    `.execute(db);

    const defaultPriceMap = new Map<number, number>();
    for (const row of defaultPriceRows.rows) {
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
  const db = getDb();
  const variants = await db
    .selectFrom("item_variants")
    .where("item_id", "=", itemId)
    .where("company_id", "=", companyId)
    .select(["id", "item_id", "sku", "variant_name", "price_override", "stock_quantity", "barcode", "is_active", "created_at", "updated_at"])
    .orderBy("sku", "asc")
    .execute();

  const responses: ItemVariantResponse[] = [];
  for (const v of variants) {
    const combos = await db
      .selectFrom("item_variant_combinations as ivc")
      .innerJoin("item_variant_attributes as iva", "iva.id", "ivc.attribute_id")
      .innerJoin("item_variant_attribute_values as ivav", "ivav.id", "ivc.value_id")
      .where("ivc.variant_id", "=", v.id)
      .where("ivc.company_id", "=", companyId)
      .select(["ivc.variant_id", "iva.attribute_name", "ivav.value"])
      .orderBy("iva.sort_order", "asc")
      .execute();

    const effectivePrice = await getVariantEffectivePrice(companyId, v.id);

    responses.push({
      id: v.id,
      item_id: (v as { item_id: number }).item_id,
      sku: (v as { sku: string }).sku,
      variant_name: (v as { variant_name: string }).variant_name,
      price_override: (v as { price_override: string | null }).price_override ? Number((v as { price_override: string | null }).price_override) : null,
      effective_price: effectivePrice,
      stock_quantity: Number((v as { stock_quantity: number | string }).stock_quantity),
      barcode: (v as { barcode: string | null }).barcode,
      is_active: Boolean((v as { is_active: number }).is_active),
      attributes: combos.map((c) => ({ attribute_name: (c as { attribute_name: string }).attribute_name, value: (c as { value: string }).value })),
      created_at: ((v as { created_at: Date }).created_at).toISOString(),
      updated_at: ((v as { updated_at: Date }).updated_at).toISOString()
    });
  }

  return responses;
}

export async function getVariantById(
  companyId: number,
  variantId: number
): Promise<ItemVariantResponse | null> {
  const db = getDb();
  const variants = await db
    .selectFrom("item_variants")
    .where("id", "=", variantId)
    .where("company_id", "=", companyId)
    .select(["id", "item_id", "sku", "variant_name", "price_override", "stock_quantity", "barcode", "is_active", "created_at", "updated_at"])
    .execute();

  if (variants.length === 0) return null;

  const v = variants[0];
  const combos = await db
    .selectFrom("item_variant_combinations as ivc")
    .innerJoin("item_variant_attributes as iva", "iva.id", "ivc.attribute_id")
    .innerJoin("item_variant_attribute_values as ivav", "ivav.id", "ivc.value_id")
    .where("ivc.variant_id", "=", v.id)
    .where("ivc.company_id", "=", companyId)
    .select(["ivc.variant_id", "iva.attribute_name", "ivav.value"])
    .orderBy("iva.sort_order", "asc")
    .execute();

  const effectivePrice = await getVariantEffectivePrice(companyId, v.id);

  return {
    id: v.id,
    item_id: (v as { item_id: number }).item_id,
    sku: (v as { sku: string }).sku,
    variant_name: (v as { variant_name: string }).variant_name,
    price_override: (v as { price_override: string | null }).price_override ? Number((v as { price_override: string | null }).price_override) : null,
    effective_price: effectivePrice,
    stock_quantity: Number((v as { stock_quantity: number | string }).stock_quantity),
    barcode: (v as { barcode: string | null }).barcode,
    is_active: Boolean((v as { is_active: number }).is_active),
    attributes: combos.map((c) => ({ attribute_name: (c as { attribute_name: string }).attribute_name, value: (c as { value: string }).value })),
    created_at: ((v as { created_at: Date }).created_at).toISOString(),
    updated_at: ((v as { updated_at: Date }).updated_at).toISOString()
  };
}

export async function updateVariant(
  companyId: number,
  variantId: number,
  input: UpdateVariantRequest
): Promise<ItemVariantResponse> {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    // Verify variant exists
    const variantRows = await trx
      .selectFrom("item_variants")
      .where("id", "=", variantId)
      .where("company_id", "=", companyId)
      .select(["id"])
      .execute();
    
    if (variantRows.length === 0) {
      throw new VariantNotFoundError(variantId);
    }

    // Check SKU uniqueness if updating SKU
    if (input.sku !== undefined) {
      const existingRows = await trx
        .selectFrom("item_variants")
        .where("sku", "=", input.sku)
        .where("company_id", "=", companyId)
        .where("id", "!=", variantId)
        .select(["id"])
        .execute();
      
      if (existingRows.length > 0) {
        throw new DuplicateSkuError(input.sku);
      }
    }

    // Build update values
    const updateData: Record<string, unknown> = {};
    
    if (input.sku !== undefined) {
      updateData.sku = input.sku;
    }
    if (input.price_override !== undefined) {
      updateData.price_override = input.price_override;
    }
    if (input.stock_quantity !== undefined) {
      updateData.stock_quantity = input.stock_quantity;
    }
    if (input.barcode !== undefined) {
      updateData.barcode = input.barcode;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active ? 1 : 0;
    }

    if (Object.keys(updateData).length > 0) {
      await trx
        .updateTable("item_variants")
        .set(updateData)
        .where("id", "=", variantId)
        .where("company_id", "=", companyId)
        .execute();
    }

    const result = await getVariantById(companyId, variantId);
    return result!;
  });
}

export async function adjustVariantStock(
  companyId: number,
  variantId: number,
  adjustment: number,
  reason: string
): Promise<number> {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    // Get current stock
    const variantRows = await sql<{ stock_quantity: number }>`
      SELECT stock_quantity FROM item_variants
      WHERE id = ${variantId} AND company_id = ${companyId}
      FOR UPDATE
    `.execute(trx);
    
    if (variantRows.rows.length === 0) {
      throw new VariantNotFoundError(variantId);
    }

    const currentStock = Number(variantRows.rows[0].stock_quantity);
    const newStock = Math.max(0, currentStock + adjustment);

    await trx
      .updateTable("item_variants")
      .set({ stock_quantity: newStock })
      .where("id", "=", variantId)
      .where("company_id", "=", companyId)
      .execute();

    // TODO: Add audit log entry for stock adjustment

    return newStock;
  });
}

export async function validateVariantSku(
  companyId: number,
  sku: string,
  excludeVariantId?: number
): Promise<{ valid: boolean; error?: string }> {
  const db = getDb();
  
  let query = db
    .selectFrom("item_variants")
    .where("sku", "=", sku)
    .where("company_id", "=", companyId)
    .select(["id"]);
  
  if (excludeVariantId !== undefined) {
    query = query.where("id", "!=", excludeVariantId);
  }

  const row = await query.executeTakeFirst();
  if (row) {
    return { valid: false, error: `SKU '${sku}' already exists` };
  }
  return { valid: true };
}

// Sync functions
export async function getVariantsForSync(
  companyId: number,
  outletId?: number
): Promise<SyncPullVariant[]> {
  const db = getDb();
  // Fetch all variants in one query
  const variants = await db
    .selectFrom("item_variants as v")
    .innerJoin("items as i", "i.id", "v.item_id")
    .where("v.company_id", "=", companyId)
    .where("v.is_active", "=", 1)
    .where("i.is_active", "=", 1)
    .select(["v.id", "v.item_id", "v.sku", "v.variant_name", "v.price_override", "v.stock_quantity", "v.barcode", "v.is_active"])
    .execute();

  if (variants.length === 0) {
    return [];
  }

  // Collect all variant IDs for batch combination fetch
  const variantIds = variants.map((v) => (v as { id: number }).id);

  // Single query to fetch all combinations for all variants (avoids N+1)
  const allCombos = await sql<{ variant_id: number; attribute_name: string; value: string }>`
    SELECT 
      ivc.variant_id,
      iva.attribute_name, 
      ivav.value
     FROM item_variant_combinations ivc
     JOIN item_variant_attributes iva ON iva.id = ivc.attribute_id
     JOIN item_variant_attribute_values ivav ON ivav.id = ivc.value_id
     WHERE ivc.variant_id IN (${sql.join(variantIds.map(id => sql`${id}`))}) AND ivc.company_id = ${companyId}
     ORDER BY iva.sort_order, ivav.sort_order
  `.execute(db);

  // Group combinations by variant_id in memory
  const combosByVariant = new Map<number, Array<{ attribute_name: string; value: string }>>();
  for (const combo of allCombos.rows) {
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
    const variantCombos = combosByVariant.get((v as { id: number }).id) ?? [];
    for (const c of variantCombos) {
      attributes[c.attribute_name] = c.value;
    }

    results.push({
      id: (v as { id: number }).id,
      item_id: (v as { item_id: number }).item_id,
      sku: (v as { sku: string }).sku,
      variant_name: (v as { variant_name: string }).variant_name,
      price: priceMap.get((v as { id: number }).id) ?? 0,
      stock_quantity: Number((v as { stock_quantity: number | string }).stock_quantity),
      barcode: (v as { barcode: string | null }).barcode,
      is_active: Boolean((v as { is_active: number }).is_active),
      attributes
    });
  }

  return results;
}
