// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// ADAPTER: Re-exports from @jurnapod/notifications for backward compatibility.
// The canonical implementation lives in packages/notifications/src/templates/email.ts

export {
  buildPasswordResetEmail,
  buildUserInviteEmail,
  buildVerifyEmail,
  type EmailTemplateParams,
  type BuiltEmail
} from "@jurnapod/notifications/templates/email";
