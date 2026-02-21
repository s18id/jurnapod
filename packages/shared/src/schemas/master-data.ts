import { z } from "zod";

export const NumericIdSchema = z.coerce.number().int().positive();

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
