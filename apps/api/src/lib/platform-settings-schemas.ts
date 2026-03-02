// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

/**
 * Mailer settings schema (v1)
 */
export const MailerSettingsSchema = z.object({
  "mailer.driver": z.enum(["smtp", "log", "disabled"]).optional(),
  "mailer.from_name": z.string().trim().min(1).max(191).optional(),
  "mailer.from_email": z.string().email().max(191).optional(),
  "mailer.smtp.host": z.string().trim().min(1).max(191).optional(),
  "mailer.smtp.port": z.number().int().positive().max(65535).optional(),
  "mailer.smtp.user": z.string().trim().min(1).max(191).optional(),
  "mailer.smtp.pass": z.string().min(1).max(500).optional(),
  "mailer.smtp.secure": z.boolean().optional(),
  "mailer.smtp.tls_reject_unauthorized": z.boolean().optional()
});

export type MailerSettings = z.infer<typeof MailerSettingsSchema>;

/**
 * Platform settings update request schema
 */
export const PlatformSettingsUpdateSchema = z.object({
  settings: z.record(z.string(), z.any())
}).strict();

export type PlatformSettingsUpdate = z.infer<typeof PlatformSettingsUpdateSchema>;

/**
 * Validate mailer settings dependencies
 * If driver is "smtp", require SMTP configuration fields
 */
export function validateMailerDependencies(settings: Record<string, any>): string | null {
  const driver = settings["mailer.driver"];

  if (driver === "smtp") {
    const required = [
      "mailer.from_email",
      "mailer.smtp.host",
      "mailer.smtp.port",
      "mailer.smtp.user",
      "mailer.smtp.pass"
    ];

    for (const key of required) {
      const value = settings[key];
      if (!value || (typeof value === "string" && value.trim().length === 0)) {
        // Allow masked password if it's already set
        if (key === "mailer.smtp.pass" && value === "*****") {
          continue;
        }
        return `${key} is required when mailer.driver is "smtp"`;
      }
    }
  }

  return null;
}

/**
 * Convert mailer settings to flat key-value format
 */
export function flattenMailerSettings(settings: Partial<MailerSettings>): Record<string, string | number | boolean> {
  const flattened: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (value !== undefined) {
      flattened[key] = value;
    }
  }

  return flattened;
}

/**
 * Parse mailer settings from flat key-value format
 */
export function parseMailerSettings(settings: Record<string, any>): Partial<MailerSettings> {
  const mailerKeys = Object.keys(MailerSettingsSchema.shape);
  const parsed: Partial<MailerSettings> = {};

  for (const key of mailerKeys) {
    if (key in settings) {
      (parsed as any)[key] = settings[key];
    }
  }

  return parsed;
}
