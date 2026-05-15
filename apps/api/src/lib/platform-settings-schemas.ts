// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Re-export platform settings schemas from shared (canonical location)
export {
  MailerSettingsSchema,
  PlatformSettingsUpdateSchema,
  validateMailerDependencies,
  flattenMailerSettings,
  parseMailerSettings,
  type MailerSettings,
  type PlatformSettingsUpdate,
} from '@jurnapod/shared';
