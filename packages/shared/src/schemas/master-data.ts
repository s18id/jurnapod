import { z } from "zod";
import { NumericIdSchema } from "./common";

/**
 * Item Type Taxonomy
 * 
 * SERVICE: Non-tangible offerings (labor, delivery, consulting)
 *   - Never tracked in inventory
 *   - Examples: Delivery fee, barista service, event catering
 * 
 * PRODUCT: Finished goods sold to customers (default type)
 *   - Physical items or prepared menu items
 *   - Optional inventory tracking (level 1+)
 *   - Can be made from recipes (level 2+)
 *   - Examples: Coffee drinks, pastries, retail items
 * 
 * INGREDIENT: Raw materials used to make products
 *   - Used in recipe composition (level 2+)
 *   - Inventory tracking recommended (level 1+)
 *   - Can be sold directly (flexible for retail scenarios)
 *   - Examples: Coffee beans, milk, sugar, cups
 * 
 * RECIPE: Bill of Materials (BOM) / formulas
 *   - Templates for making products from ingredients
 *   - Not physical items (no stock tracking)
 *   - Functional in inventory level 2+ only
 *   - Examples: "Latte recipe", "Cookie recipe"
 * 
 * @see docs/adr/ADR-0002-item-types-taxonomy.md for detailed documentation
 */
export const ItemTypeSchema = z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]);

const optionalSkuSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => {
    if (!value) {
      return null;
    }

    return value;
  });

const optionalShortTextSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => {
      if (!value) {
        return null;
      }

      return value;
    });

export const ItemCreateRequestSchema = z.object({
  sku: optionalSkuSchema,
  name: z.string().trim().min(1).max(191),
  type: ItemTypeSchema,
  is_active: z.boolean().optional()
});

export const ItemUpdateRequestSchema = z
  .object({
    sku: optionalSkuSchema,
    name: z.string().trim().min(1).max(191).optional(),
    type: ItemTypeSchema.optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const ItemPriceCreateRequestSchema = z.object({
  item_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  price: z.coerce.number().finite().nonnegative(),
  is_active: z.boolean().optional()
});

export const ItemPriceUpdateRequestSchema = z
  .object({
    item_id: NumericIdSchema.optional(),
    outlet_id: NumericIdSchema.optional(),
    price: z.coerce.number().finite().nonnegative().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SupplyCreateRequestSchema = z.object({
  sku: optionalSkuSchema,
  name: z.string().trim().min(1).max(191),
  unit: z.string().trim().min(1).max(32).optional(),
  is_active: z.boolean().optional()
});

export const SupplyUpdateRequestSchema = z
  .object({
    sku: optionalSkuSchema,
    name: z.string().trim().min(1).max(191).optional(),
    unit: z.string().trim().min(1).max(32).optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const FixedAssetCreateRequestSchema = z.object({
  asset_tag: optionalShortTextSchema(64),
  name: z.string().trim().min(1).max(191),
  serial_number: optionalShortTextSchema(128),
  outlet_id: NumericIdSchema.optional(),
  purchase_date: z.string().trim().min(1).optional(),
  purchase_cost: z.coerce.number().finite().nonnegative().optional(),
  is_active: z.boolean().optional()
});

export const FixedAssetUpdateRequestSchema = z
  .object({
    asset_tag: optionalShortTextSchema(64),
    name: z.string().trim().min(1).max(191).optional(),
    serial_number: optionalShortTextSchema(128),
    outlet_id: NumericIdSchema.optional(),
    purchase_date: z.string().trim().min(1).optional(),
    purchase_cost: z.coerce.number().finite().nonnegative().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SyncPullRequestQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  since_version: z.coerce.number().int().min(0).default(0)
});

export const SyncPullItemSchema = z.object({
  id: NumericIdSchema,
  sku: z.string().nullable(),
  name: z.string(),
  type: ItemTypeSchema,
  is_active: z.boolean(),
  updated_at: z.string().datetime()
});

export const SyncPullPriceSchema = z.object({
  id: NumericIdSchema,
  item_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  price: z.number().finite().nonnegative(),
  is_active: z.boolean(),
  updated_at: z.string().datetime()
});

export const SyncPullConfigSchema = z.object({
  tax: z.object({
    rate: z.number().finite().min(0).default(0),
    inclusive: z.boolean().default(false)
  }),
  payment_methods: z.array(z.string().trim().min(1)).default(["CASH"])
});

export const SyncPullResponseSchema = z.object({
  data_version: z.coerce.number().int().min(0),
  items: z.array(SyncPullItemSchema),
  prices: z.array(SyncPullPriceSchema),
  config: SyncPullConfigSchema
});

export type ItemType = z.infer<typeof ItemTypeSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
