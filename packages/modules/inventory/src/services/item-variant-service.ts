// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item variant service implementation.
 * 
 * All methods require company_id scoping.
 */

import { getKysely } from "@jurnapod/db";
import { withTransactionRetry } from "@jurnapod/db";
import type { KyselySchema } from "@jurnapod/db";
import type {
  CreateVariantAttributeRequest,
  UpdateVariantAttributeRequest,
  UpdateVariantRequest,
  ItemVariantResponse,
  VariantAttribute,
  SyncPullVariant
} from "@jurnapod/shared";
import { toRfc3339Required } from "@jurnapod/shared";
import type { ItemVariantService } from "../interfaces/item-variant-service.js";
import { VariantNotFoundError, AttributeNotFoundError, ItemNotFoundError, DuplicateSkuError } from "../errors.js";
import { getInventoryDb } from "../db.js";

export {
  type CreateVariantAttributeRequest,
  type UpdateVariantAttributeRequest,
  type UpdateVariantRequest,
  type ItemVariantResponse,
  type VariantAttribute,
  type SyncPullVariant
};

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

/**
 * Parse JSON attributes column into array format.
 * JSON column stores: { "size": "Large", "color": "Red" }
 * Returns: [{ attribute_name: "size", value: "Large" }, { attribute_name: "color", value: "Red" }]
 */
function parseJsonAttributes(attributesJson: string | null): Array<{ attribute_name: string; value: string }> {
  if (!attributesJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(attributesJson);
    if (typeof parsed !== 'object' || parsed === null) {
      return [];
    }
    return Object.entries(parsed).map(([attribute_name, value]) => ({
      attribute_name,
      value: String(value)
    }));
  } catch {
    return [];
  }
}


/**
 * Item variant service implementation.
 */
export class ItemVariantServiceImpl implements ItemVariantService {
  async listVariantAttributes(companyId: number, itemId: number): Promise<VariantAttribute[]> {
    const db = getInventoryDb();
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

  async createVariantAttribute(
    companyId: number,
    itemId: number,
    input: CreateVariantAttributeRequest
  ): Promise<VariantAttribute> {
    const db = getInventoryDb();
    return withTransactionRetry(db, async (trx) => {
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
        .executeTakeFirst();
      
      const attributeId = Number(attrResult!.insertId);

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
          .executeTakeFirst();
        valueIds.push(Number(valResult!.insertId));
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
      await trx
        .updateTable("item_variants")
        .set({ is_active: 0, archived_at: new Date(), updated_at: new Date() })
        .where("item_id", "=", itemId)
        .where("company_id", "=", companyId)
        .where("archived_at", "is", null)
        .execute();

      // Check existing variants (including archived ones to preserve stock history)
      const existingVariants = await trx
        .selectFrom("item_variants")
        .where("item_id", "=", itemId)
        .where("company_id", "=", companyId)
        .select(["id", "sku", "variant_name", "is_active"])
        .execute();

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
            .executeTakeFirst();
          
          const variantId = Number(variantResult!.insertId);

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

  async updateVariantAttribute(
    companyId: number,
    attributeId: number,
    input: UpdateVariantAttributeRequest
  ): Promise<VariantAttribute> {
    const db = getInventoryDb();
    return withTransactionRetry(db, async (trx) => {
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
            await trx
              .updateTable("item_variants")
              .set({ is_active: 0 })
              .where("company_id", "=", companyId)
              .where((eb) => eb.exists(
                trx
                  .selectFrom("item_variant_combinations")
                  .select("variant_id")
                  .where("value_id", "=", valueId)
                  .where("company_id", "=", companyId)
              ))
              .execute();

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
        const itemInfo = await this.getItemById(companyId, attr.item_id);
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
        await trx
          .updateTable("item_variants")
          .set({ is_active: 0, archived_at: new Date(), updated_at: new Date() })
          .where("item_id", "=", attr.item_id)
          .where("company_id", "=", companyId)
          .where("archived_at", "is", null)
          .execute();

        const existingVariants = await trx
          .selectFrom("item_variants")
          .where("item_id", "=", attr.item_id)
          .where("company_id", "=", companyId)
          .select(["id", "sku", "variant_name", "is_active"])
          .execute();

        for (const combo of combinations) {
          const sku = generateVariantSku(parentSku, combo);
          const variantName = buildVariantName(combo);

          const existingVariant = existingVariants.find((v) => (v as { sku: string }).sku === sku);

          if (existingVariant) {
            if (!(existingVariant as { is_active: number }).is_active) {
              await trx
                .updateTable("item_variants")
                .set({ is_active: 1, archived_at: null, updated_at: new Date() })
                .where("id", "=", (existingVariant as { id: number }).id)
                .where("company_id", "=", companyId)
                .execute();
            }
          } else {
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
              .executeTakeFirst();
            
            const variantId = Number(variantResult!.insertId);

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

  async deleteVariantAttribute(companyId: number, attributeId: number): Promise<void> {
    const db = getInventoryDb();
    return withTransactionRetry(db, async (trx) => {
      // Archive variants using this attribute
      await trx
        .updateTable("item_variants")
        .set({ is_active: 0 })
        .where("company_id", "=", companyId)
        .where((eb) => eb.exists(
          trx
            .selectFrom("item_variant_combinations")
            .select("variant_id")
            .where("attribute_id", "=", attributeId)
            .where("company_id", "=", companyId)
        ))
        .execute();

      // Delete attribute (cascade will handle values and combinations)
      const result = await trx
        .deleteFrom("item_variant_attributes")
        .where("id", "=", attributeId)
        .where("company_id", "=", companyId)
        .execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        throw new AttributeNotFoundError(attributeId);
      }
    });
  }

  async getItemById(companyId: number, itemId: number): Promise<{ sku: string; price: number } | null> {
    const db = getInventoryDb();
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

  async getItemVariants(companyId: number, itemId: number): Promise<ItemVariantResponse[]> {
    const db = getInventoryDb();
    const variants = await db
      .selectFrom("item_variants")
      .where("item_id", "=", itemId)
      .where("company_id", "=", companyId)
      .select(["id", "item_id", "sku", "variant_name", "price_override", "stock_quantity", "barcode", "is_active", "attributes", "created_at", "updated_at"])
      .orderBy("sku", "asc")
      .execute();

    const responses: ItemVariantResponse[] = [];
    for (const v of variants) {
      const effectivePrice = await this.getVariantEffectivePrice(companyId, v.id);
      const attributesJson = (v as { attributes: string | null }).attributes;

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
        attributes: parseJsonAttributes(attributesJson),
        created_at: toRfc3339Required((v as { created_at: Date | string }).created_at),
        updated_at: toRfc3339Required((v as { updated_at: Date | string }).updated_at)
      });
    }

    return responses;
  }

  async getVariantById(companyId: number, variantId: number): Promise<ItemVariantResponse | null> {
    const db = getInventoryDb();
    const variants = await db
      .selectFrom("item_variants")
      .where("id", "=", variantId)
      .where("company_id", "=", companyId)
      .select(["id", "item_id", "sku", "variant_name", "price_override", "stock_quantity", "barcode", "is_active", "attributes", "created_at", "updated_at"])
      .execute();

    if (variants.length === 0) return null;

    const v = variants[0];
    const effectivePrice = await this.getVariantEffectivePrice(companyId, v.id);
    const attributesJson = (v as { attributes: string | null }).attributes;

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
      attributes: parseJsonAttributes(attributesJson),
      created_at: toRfc3339Required((v as { created_at: Date | string }).created_at),
      updated_at: toRfc3339Required((v as { updated_at: Date | string }).updated_at)
    };
  }

  async updateVariant(
    companyId: number,
    variantId: number,
    input: UpdateVariantRequest
  ): Promise<ItemVariantResponse> {
    const db = getInventoryDb();
    return withTransactionRetry(db, async (trx) => {
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

      // Read back the updated variant using the transaction connection (trx)
      // to ensure we see uncommitted changes before the transaction commits.
      // Do NOT call this.getVariantById() here — it uses getInventoryDb()
      // which is a separate connection and would return stale pre-commit data.
      const updatedRows = await trx
        .selectFrom("item_variants")
        .where("id", "=", variantId)
        .where("company_id", "=", companyId)
        .select(["id", "item_id", "sku", "variant_name", "price_override", "stock_quantity", "barcode", "is_active", "attributes", "created_at", "updated_at"])
        .execute();

      const v = updatedRows[0];
      const attributesJson = (v as { attributes: string | null }).attributes;

      // Inline effective price calculation within the transaction to stay consistent
      const priceOverride = (v as { price_override: string | null }).price_override;
      let effectivePrice = 0;
      if (priceOverride !== null) {
        effectivePrice = Number(priceOverride);
      } else {
        const itemId = (v as { item_id: number }).item_id;
        // Try outlet-specific price (outletId not available here, skip to default)
        const defaultPriceRow = await trx
          .selectFrom("item_prices")
          .where("item_id", "=", itemId)
          .where("outlet_id", "is", null)
          .where("is_active", "=", 1)
          .where("company_id", "=", companyId)
          .select(["price"])
          .executeTakeFirst();
        if (defaultPriceRow) {
          effectivePrice = Number((defaultPriceRow as { price: number | string }).price);
        }
      }

      return {
        id: v.id,
        item_id: (v as { item_id: number }).item_id,
        sku: (v as { sku: string }).sku,
        variant_name: (v as { variant_name: string }).variant_name,
        price_override: priceOverride !== null ? Number(priceOverride) : null,
        effective_price: effectivePrice,
        stock_quantity: Number((v as { stock_quantity: number | string }).stock_quantity),
        barcode: (v as { barcode: string | null }).barcode,
        is_active: Boolean((v as { is_active: number }).is_active),
        attributes: parseJsonAttributes(attributesJson),
        created_at: toRfc3339Required((v as { created_at: Date | string }).created_at),
        updated_at: toRfc3339Required((v as { updated_at: Date | string }).updated_at)
      };
    });
  }

  async getVariantEffectivePrice(companyId: number, variantId: number, outletId?: number): Promise<number> {
    const db = getInventoryDb();
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

  async adjustVariantStock(
    companyId: number,
    variantId: number,
    adjustment: number,
    reason: string
  ): Promise<number> {
    const db = getInventoryDb();
    return withTransactionRetry(db, async (trx) => {
      // Get current stock
      const variantRows = await trx
        .selectFrom("item_variants")
        .where("id", "=", variantId)
        .where("company_id", "=", companyId)
        .select(["stock_quantity"])
        .forUpdate()
        .execute();
      
      if (variantRows.length === 0) {
        throw new VariantNotFoundError(variantId);
      }

      const currentStock = Number((variantRows[0] as { stock_quantity: number | string }).stock_quantity);
      const newStock = Math.max(0, currentStock + adjustment);

      await trx
        .updateTable("item_variants")
        .set({ stock_quantity: newStock })
        .where("id", "=", variantId)
        .where("company_id", "=", companyId)
        .execute();

      return newStock;
    });
  }

  async validateVariantSku(
    companyId: number,
    sku: string,
    excludeVariantId?: number
  ): Promise<{ valid: boolean; error?: string }> {
    const db = getInventoryDb();
    
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

  async getVariantsForSync(companyId: number, outletId?: number): Promise<SyncPullVariant[]> {
    const db = getInventoryDb();
    // Fetch all variants in one query - now includes attributes JSON column
    const variants = await db
      .selectFrom("item_variants as v")
      .innerJoin("items as i", "i.id", "v.item_id")
      .where("v.company_id", "=", companyId)
      .where("v.is_active", "=", 1)
      .where("i.is_active", "=", 1)
      .select(["v.id", "v.item_id", "v.sku", "v.variant_name", "v.price_override", "v.stock_quantity", "v.barcode", "v.is_active", "v.attributes"])
      .execute();

    if (variants.length === 0) {
      return [];
    }

    // Collect all variant IDs for batch price fetch
    const variantIds = variants.map((v) => (v as { id: number }).id);

    // Batch fetch all effective prices in a single query to eliminate N+1
    const priceMap = await this.getVariantEffectivePricesBatch(companyId, variantIds, outletId);

    // Build results - attributes now come from JSON column directly
    const results: SyncPullVariant[] = [];
    for (const v of variants) {
      const variantId = (v as { id: number }).id;
      const attributesJson = (v as { attributes: string | null }).attributes;
      
      // Parse JSON attributes to Record<string, string> format
      let attributes: Record<string, string> = {};
      if (attributesJson) {
        try {
          const parsed = JSON.parse(attributesJson);
          if (typeof parsed === 'object' && parsed !== null) {
            attributes = parsed as Record<string, string>;
          }
        } catch {
          // If JSON parsing fails, keep empty object
          attributes = {};
        }
      }

      results.push({
        id: variantId,
        item_id: (v as { item_id: number }).item_id,
        sku: (v as { sku: string }).sku,
        variant_name: (v as { variant_name: string }).variant_name,
        price: priceMap.get(variantId) ?? 0,
        stock_quantity: Number((v as { stock_quantity: number | string }).stock_quantity),
        barcode: (v as { barcode: string | null }).barcode,
        is_active: Boolean((v as { is_active: number }).is_active),
        attributes
      });
    }

    return results;
  }

  /**
   * Batch fetch effective prices for multiple variants.
   */
  private async getVariantEffectivePricesBatch(
    companyId: number,
    variantIds: number[],
    outletId?: number
  ): Promise<Map<number, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const db = getInventoryDb();

    // Fetch all variant data with price overrides and item_ids
    const variantRows = await db
      .selectFrom("item_variants")
      .where("id", "in", variantIds)
      .where("company_id", "=", companyId)
      .select(["id", "price_override", "item_id"])
      .execute();

    const priceMap = new Map<number, number>();
    const variantsNeedingParentPrice: Array<{ variantId: number; itemId: number }> = [];

    // First pass: handle price overrides
    for (const row of variantRows) {
      const priceOverride = (row as { price_override: string | null }).price_override;
      if (priceOverride !== null) {
        priceMap.set(row.id, Number(priceOverride));
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
      const outletPriceRows = await db
        .selectFrom("item_prices")
        .where("item_id", "in", uniqueItemIds)
        .where("outlet_id", "=", outletId)
        .where("is_active", "=", 1)
        .where("company_id", "=", companyId)
        .select(["item_id", "price"])
        .execute();

      const outletPriceMap = new Map<number, number>();
      for (const row of outletPriceRows) {
        outletPriceMap.set((row as { item_id: number }).item_id, Number((row as { price: number | string }).price));
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
      const defaultPriceRows = await db
        .selectFrom("item_prices")
        .where("item_id", "in", itemsNeedingDefaultPrice)
        .where("outlet_id", "is", null)
        .where("is_active", "=", 1)
        .where("company_id", "=", companyId)
        .select(["item_id", "price"])
        .execute();

      const defaultPriceMap = new Map<number, number>();
      for (const row of defaultPriceRows) {
        defaultPriceMap.set((row as { item_id: number }).item_id, Number((row as { price: number | string }).price));
      }

      // Assign default prices
      for (const { variantId, itemId } of variantsNeedingParentPrice) {
        if (!priceMap.has(variantId)) {
          priceMap.set(variantId, defaultPriceMap.get(itemId) ?? 0);
        }
      }
    } else {
      // No outlet specified, fetch default prices for all
      const defaultPriceRows = await db
        .selectFrom("item_prices")
        .where("item_id", "in", uniqueItemIds)
        .where("outlet_id", "is", null)
        .where("is_active", "=", 1)
        .where("company_id", "=", companyId)
        .select(["item_id", "price"])
        .execute();

      const defaultPriceMap = new Map<number, number>();
      for (const row of defaultPriceRows) {
        defaultPriceMap.set((row as { item_id: number }).item_id, Number((row as { price: number | string }).price));
      }

      // Assign default prices
      for (const { variantId, itemId } of variantsNeedingParentPrice) {
        priceMap.set(variantId, defaultPriceMap.get(itemId) ?? 0);
      }
    }

    return priceMap;
  }
}

// Default instance for convenience
export const itemVariantService = new ItemVariantServiceImpl();