// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

export const FeatureFlagKeySchema = z.string().trim().min(1);

export const FeatureFlagEntrySchema = z.object({
  key: FeatureFlagKeySchema,
  enabled: z.boolean(),
  config_json: z.string(),
  rollout_percentage: z.number().int().min(0).max(100).default(100),
  target_segments: z.array(z.string()).nullable().optional(),
  start_at: z.string().datetime().nullable().optional(),
  end_at: z.string().datetime().nullable().optional()
});

export const FeatureFlagsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(FeatureFlagEntrySchema)
});

export const FeatureFlagsUpdateSchema = z.object({
  flags: z.array(FeatureFlagEntrySchema).min(1)
});

export type FeatureFlagEntry = z.infer<typeof FeatureFlagEntrySchema>;
export type FeatureFlagsResponse = z.infer<typeof FeatureFlagsResponseSchema>;
export type FeatureFlagsUpdate = z.infer<typeof FeatureFlagsUpdateSchema>;
