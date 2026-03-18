// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";
import { ReservationStatusSchema } from "./reservations";
import { OutletTableStatusSchema } from "./outlet-tables";

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
  item_group_id: NumericIdSchema.nullable().optional(),
  cogs_account_id: NumericIdSchema.nullable().optional(),
  inventory_asset_account_id: NumericIdSchema.nullable().optional(),
  is_active: z.boolean().optional()
});

export const ItemUpdateRequestSchema = z
  .object({
    sku: optionalSkuSchema,
    name: z.string().trim().min(1).max(191).optional(),
    type: ItemTypeSchema.optional(),
    item_group_id: NumericIdSchema.nullable().optional(),
    cogs_account_id: NumericIdSchema.nullable().optional(),
    inventory_asset_account_id: NumericIdSchema.nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const ItemPriceCreateRequestSchema = z.object({
  item_id: NumericIdSchema,
  outlet_id: NumericIdSchema.nullable(),
  price: z.coerce.number().finite().nonnegative(),
  is_active: z.boolean().optional()
});

export const ItemPriceUpdateRequestSchema = z
  .object({
    item_id: NumericIdSchema.optional(),
    outlet_id: NumericIdSchema.nullable().optional(),
    price: z.coerce.number().finite().nonnegative().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const ItemGroupCreateRequestSchema = z.object({
  code: optionalShortTextSchema(64),
  name: z.string().trim().min(1).max(191),
  parent_id: NumericIdSchema.nullable().optional(),
  is_active: z.boolean().optional()
});

export const ItemGroupUpdateRequestSchema = z
  .object({
    code: optionalShortTextSchema(64),
    name: z.string().trim().min(1).max(191).optional(),
    parent_id: NumericIdSchema.nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

const optionalShortTextSchemaWithMax64 = z.string().trim().max(64);
const requiredCodeSchema = z.string().trim().min(1).max(64);

export const ItemGroupBulkCreateRowSchema = z.object({
  code: requiredCodeSchema,
  name: z.string().trim().min(1).max(191),
  parent_code: optionalShortTextSchemaWithMax64.nullable().optional(),
  is_active: z.boolean().optional()
});

// Recipe Ingredient Schemas
export const CreateRecipeIngredientSchema = z.object({
  ingredient_item_id: NumericIdSchema,
  quantity: z.coerce.number().finite().positive(),
  unit_of_measure: z.string().trim().min(1).max(20).optional()
});

export const UpdateRecipeIngredientSchema = z
  .object({
    quantity: z.coerce.number().finite().positive().optional(),
    unit_of_measure: z.string().trim().min(1).max(20).optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const RecipeIngredientResponseSchema = z.object({
  id: NumericIdSchema,
  recipe_item_id: NumericIdSchema,
  ingredient_item_id: NumericIdSchema,
  ingredient_name: z.string(),
  ingredient_sku: z.string().nullable(),
  ingredient_type: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
  quantity: z.number(),
  unit_of_measure: z.string(),
  unit_cost: z.number(),
  total_cost: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string()
});

export const RecipeCostResponseSchema = z.object({
  recipe_item_id: NumericIdSchema,
  total_ingredient_cost: z.number(),
  ingredient_count: z.number(),
  ingredients: z.array(
    z.object({
      ingredient_item_id: NumericIdSchema,
      name: z.string(),
      sku: z.string().nullable(),
      quantity: z.number(),
      unit_of_measure: z.string(),
      unit_cost: z.number(),
      line_cost: z.number()
    })
  )
});

export const ItemGroupBulkCreateRequestSchema = z.object({
  rows: z.array(ItemGroupBulkCreateRowSchema).min(1).max(500)
});

export type ItemGroupBulkCreateRow = z.infer<typeof ItemGroupBulkCreateRowSchema>;
export type ItemGroupBulkCreateRequest = z.infer<typeof ItemGroupBulkCreateRequestSchema>;

export const SupplyCreateRequestSchema = z.object({
  sku: optionalSkuSchema,
  name: z.string().trim().min(1).max(191),
  unit: z.string().trim().min(1).max(32).optional(),
  is_active: z.boolean().optional()
});

export const SupplyUpdateRequestSchema = z
  .unknown()
  .refine((input) => {
    if (typeof input !== 'object' || input === null) {
      return false;
    }
    // Check if the input has at least one property before any transformations
    return Object.keys(input).length > 0;
  }, {
    message: "At least one field must be provided"
  })
  .pipe(
    z.object({
      sku: optionalSkuSchema,
      name: z.string().trim().min(1).max(191).optional(),
      unit: z.string().trim().min(1).max(32).optional(),
      is_active: z.boolean().optional()
    })
  );

export const FixedAssetCreateRequestSchema = z.object({
  asset_tag: optionalShortTextSchema(64),
  name: z.string().trim().min(1).max(191),
  serial_number: optionalShortTextSchema(128),
  outlet_id: NumericIdSchema.optional(),
  category_id: NumericIdSchema.optional(),
  purchase_date: z.string().trim().min(1).optional(),
  purchase_cost: z.coerce.number().finite().nonnegative().optional(),
  is_active: z.boolean().optional()
});

export const FixedAssetUpdateRequestSchema = z
  .object({
    asset_tag: optionalShortTextSchema(64).optional(),
    name: z.string().trim().min(1).max(191).optional(),
    serial_number: optionalShortTextSchema(128).optional(),
    outlet_id: NumericIdSchema.nullable().optional(),
    category_id: NumericIdSchema.nullable().optional(),
    purchase_date: z.string().trim().min(1).nullable().optional(),
    purchase_cost: z.coerce.number().finite().nonnegative().nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const FixedAssetCategoryMethodSchema = z.enum([
  "STRAIGHT_LINE",
  "DECLINING_BALANCE",
  "SUM_OF_YEARS"
]);

export const FixedAssetCategoryCreateRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(191),
  depreciation_method: FixedAssetCategoryMethodSchema.optional(),
  useful_life_months: z.coerce.number().int().positive(),
  residual_value_pct: z.coerce.number().min(0).max(100).optional(),
  expense_account_id: NumericIdSchema.nullable().optional(),
  accum_depr_account_id: NumericIdSchema.nullable().optional(),
  is_active: z.boolean().optional()
});

export const FixedAssetCategoryUpdateRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(191).optional(),
    depreciation_method: FixedAssetCategoryMethodSchema.optional(),
    useful_life_months: z.coerce.number().int().positive().optional(),
    residual_value_pct: z.coerce.number().min(0).max(100).optional(),
    expense_account_id: NumericIdSchema.nullable().optional(),
    accum_depr_account_id: NumericIdSchema.nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SyncPullRequestQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  since_version: z.coerce.number().int().min(0).default(0),
  orders_cursor: z.coerce.number().int().min(0).optional()
});

export const SyncPullOpenOrderSchema = z.object({
  order_id: z.string().uuid(),
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  service_type: z.enum(["TAKEAWAY", "DINE_IN"]),
  source_flow: z.enum(["WALK_IN", "RESERVATION", "PHONE", "ONLINE", "MANUAL"]).optional(),
  settlement_flow: z.enum(["IMMEDIATE", "DEFERRED", "SPLIT"]).optional(),
  table_id: NumericIdSchema.nullable(),
  reservation_id: NumericIdSchema.nullable(),
  guest_count: z.number().int().positive().nullable(),
  is_finalized: z.boolean(),
  order_status: z.enum(["OPEN", "READY_TO_PAY", "COMPLETED", "CANCELLED"]),
  order_state: z.enum(["OPEN", "CLOSED"]),
  paid_amount: z.number().finite().min(0),
  opened_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)),
  closed_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).nullable(),
  notes: z.string().nullable(),
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const SyncPullOpenOrderLineSchema = z.object({
  order_id: z.string().uuid(),
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  item_id: NumericIdSchema,
  sku_snapshot: z.string().nullable(),
  name_snapshot: z.string().min(1),
  item_type_snapshot: ItemTypeSchema,
  unit_price_snapshot: z.number().finite().nonnegative(),
  qty: z.number().positive(),
  discount_amount: z.number().finite().min(0),
  variant_id: z.number().optional(),
  variant_name_snapshot: z.string().nullable().optional(),
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const SyncPullOrderUpdateSchema = z.object({
  update_id: z.string().uuid(),
  order_id: z.string().uuid(),
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  base_order_updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).nullable(),
  event_type: z.enum([
    "SNAPSHOT_FINALIZED",
    "ITEM_ADDED",
    "ITEM_REMOVED",
    "QTY_CHANGED",
    "ITEM_CANCELLED",
    "NOTES_CHANGED",
    "ORDER_RESUMED",
    "ORDER_CLOSED"
  ]),
  delta_json: z.string(),
  actor_user_id: NumericIdSchema.nullable(),
  device_id: z.string().min(1),
  event_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)),
  created_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)),
  sequence_no: z.number().int().positive()
});

export const SyncPullItemSchema = z.object({
  id: NumericIdSchema,
  sku: z.string().nullable(),
  name: z.string(),
  type: ItemTypeSchema,
  item_group_id: NumericIdSchema.nullable(),
  barcode: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  is_active: z.boolean(),
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const SyncPullItemGroupSchema = z.object({
  id: NumericIdSchema,
  parent_id: NumericIdSchema.nullable(),
  code: z.string().nullable(),
  name: z.string(),
  is_active: z.boolean(),
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const SyncPullPriceSchema = z.object({
  id: NumericIdSchema,
  item_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  price: z.number().finite().nonnegative(),
  is_active: z.boolean(),
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const PaymentMethodConfigSchema = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  method: z.string().trim().min(1).optional()
});

export const SyncPullConfigSchema = z.object({
  tax: z.object({
    rate: z.number().finite().min(0).default(0),
    inclusive: z.boolean().default(false)
  }),
  tax_rates: z
    .array(
      z.object({
        id: NumericIdSchema,
        code: z.string().trim().min(1),
        name: z.string().trim().min(1),
        rate_percent: z.number().finite().min(0).max(100),
        account_id: NumericIdSchema.nullable(),
        is_inclusive: z.boolean(),
        is_active: z.boolean()
      })
    )
    .default([]),
  default_tax_rate_ids: z.array(NumericIdSchema).default([]),
  payment_methods: z
    .array(z.string().trim().min(1))
    .or(z.array(PaymentMethodConfigSchema))
    .default(["CASH"])
});

export const SyncPullVariantSchema = z.object({
  id: NumericIdSchema,
  item_id: NumericIdSchema,
  sku: z.string(),
  variant_name: z.string(),
  price: z.number(),
  stock_quantity: z.number().default(0),
  barcode: z.string().nullable(),
  is_active: z.boolean(),
  attributes: z.record(z.string(), z.string())
});

export const SyncPullTableSchema = z.object({
  table_id: NumericIdSchema,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(191),
  zone: z.string().max(64).nullable(),
  capacity: z.number().int().positive().nullable(),
  status: OutletTableStatusSchema,
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const SyncPullReservationSchema = z.object({
  reservation_id: NumericIdSchema,
  table_id: NumericIdSchema.nullable(),
  customer_name: z.string().min(1).max(191),
  customer_phone: z.string().max(64).nullable(),
  guest_count: z.number().int().positive(),
  reservation_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)),
  duration_minutes: z.number().int().positive().nullable(),
  status: ReservationStatusSchema,
  notes: z.string().max(500).nullable(),
  linked_order_id: z.string().uuid().nullable(),
  arrived_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).nullable(),
  seated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).nullable(),
  cancelled_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).nullable(),
  updated_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/))
});

export const SyncPullPayloadSchema = z.object({
  data_version: z.coerce.number().int().min(0),
  items: z.array(SyncPullItemSchema),
  item_groups: z.array(SyncPullItemGroupSchema),
  prices: z.array(SyncPullPriceSchema),
  config: SyncPullConfigSchema,
  open_orders: z.array(SyncPullOpenOrderSchema).default([]),
  open_order_lines: z.array(SyncPullOpenOrderLineSchema).default([]),
  order_updates: z.array(SyncPullOrderUpdateSchema).default([]),
  orders_cursor: z.number().int().min(0).default(0),
  tables: z.array(SyncPullTableSchema).default([]),
  reservations: z.array(SyncPullReservationSchema).default([]),
  variants: z.array(SyncPullVariantSchema).default([])
});

export const SyncPullResponseSchema = z.object({
  success: z.literal(true),
  data: SyncPullPayloadSchema
});

export type ItemType = z.infer<typeof ItemTypeSchema>;
export type SyncPullPayload = z.infer<typeof SyncPullPayloadSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

// Recipe Ingredient Types
export type CreateRecipeIngredientRequest = z.infer<typeof CreateRecipeIngredientSchema>;
export type UpdateRecipeIngredientRequest = z.infer<typeof UpdateRecipeIngredientSchema>;
export type RecipeIngredientResponse = z.infer<typeof RecipeIngredientResponseSchema>;
export type RecipeCostResponse = z.infer<typeof RecipeCostResponseSchema>;

// Item Variant Schemas
export const VariantAttributeValueInputSchema = z.object({
  id: NumericIdSchema.optional(),
  value: z.string().trim().min(1).max(50),
  sort_order: z.number().int().default(0)
});

export const CreateVariantAttributeSchema = z.object({
  attribute_name: z.string().trim().min(1).max(50),
  values: z.array(z.string().trim().min(1).max(50)).min(1)
});

export const UpdateVariantAttributeSchema = z
  .object({
    attribute_name: z.string().trim().min(1).max(50).optional(),
    sort_order: z.number().int().optional(),
    values: z.array(z.string().trim().min(1).max(50)).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const VariantAttributeValueSchema = z.object({
  id: NumericIdSchema,
  value: z.string(),
  sort_order: z.number()
});

export const VariantAttributeSchema = z.object({
  id: NumericIdSchema,
  attribute_name: z.string(),
  sort_order: z.number(),
  values: z.array(VariantAttributeValueSchema)
});

export const UpdateVariantSchema = z
  .object({
    sku: z.string().trim().min(1).max(100).optional(),
    price_override: z.coerce.number().finite().nonnegative().nullable().optional(),
    stock_quantity: z.coerce.number().finite().min(0).optional(),
    barcode: z.string().trim().max(100).nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const StockAdjustmentSchema = z.object({
  adjustment: z.coerce.number().int().finite(),
  reason: z.string().trim().min(1).max(255)
});

export const VariantAttributePairSchema = z.object({
  attribute_name: z.string(),
  value: z.string()
});

export const ItemVariantResponseSchema = z.object({
  id: NumericIdSchema,
  item_id: NumericIdSchema,
  sku: z.string(),
  variant_name: z.string(),
  price_override: z.number().nullable(),
  effective_price: z.number(),
  stock_quantity: z.number(),
  barcode: z.string().nullable(),
  is_active: z.boolean(),
  attributes: z.array(VariantAttributePairSchema),
  created_at: z.string(),
  updated_at: z.string()
});

// Barcode Schemas
export const BarcodeTypeSchema = z.enum(['EAN13', 'UPCA', 'CODE128', 'CUSTOM']);

export const UpdateItemBarcodeSchema = z.object({
  barcode: z.string().trim().max(100),
  barcode_type: BarcodeTypeSchema
});

export const BarcodeLookupResponseSchema = z.object({
  items: z.array(z.object({
    id: NumericIdSchema,
    name: z.string(),
    sku: z.string().nullable(),
    barcode: z.string(),
    base_price: z.number(),
    image_thumbnail_url: z.string().nullable(),
    variants: z.array(z.object({
      id: NumericIdSchema,
      sku: z.string(),
      variant_name: z.string(),
      barcode: z.string(),
      price: z.number()
    })).optional()
  }))
});

// Image Schemas
export const UploadImageResponseSchema = z.object({
  id: NumericIdSchema,
  item_id: NumericIdSchema,
  file_name: z.string(),
  original_url: z.string(),
  large_url: z.string(),
  medium_url: z.string(),
  thumbnail_url: z.string(),
  width_pixels: z.number(),
  height_pixels: z.number(),
  is_primary: z.boolean()
});

export const ItemImagesResponseSchema = z.object({
  images: z.array(z.object({
    id: NumericIdSchema,
    file_name: z.string(),
    original_url: z.string(),
    large_url: z.string(),
    medium_url: z.string(),
    thumbnail_url: z.string(),
    width_pixels: z.number(),
    height_pixels: z.number(),
    file_size_bytes: z.number(),
    is_primary: z.boolean(),
    sort_order: z.number(),
    created_at: z.string()
  }))
});

export const UpdateImageRequestSchema = z.object({
  is_primary: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

// Item Variant Types
export type CreateVariantAttributeRequest = z.infer<typeof CreateVariantAttributeSchema>;
export type UpdateVariantAttributeRequest = z.infer<typeof UpdateVariantAttributeSchema>;
export type UpdateVariantRequest = z.infer<typeof UpdateVariantSchema>;
export type StockAdjustmentRequest = z.infer<typeof StockAdjustmentSchema>;
export type ItemVariantResponse = z.infer<typeof ItemVariantResponseSchema>;
export type VariantAttribute = z.infer<typeof VariantAttributeSchema>;
export type SyncPullVariant = z.infer<typeof SyncPullVariantSchema>;

// Barcode Types
export type BarcodeType = z.infer<typeof BarcodeTypeSchema>;
export type UpdateItemBarcodeRequest = z.infer<typeof UpdateItemBarcodeSchema>;
export type BarcodeLookupResponse = z.infer<typeof BarcodeLookupResponseSchema>;

// Image Types
export type UploadImageResponse = z.infer<typeof UploadImageResponseSchema>;
export type ItemImagesResponse = z.infer<typeof ItemImagesResponseSchema>;
export type UpdateImageRequest = z.infer<typeof UpdateImageRequestSchema>;
