// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// ADAPTER: Re-exports from @jurnapod/notifications for backward compatibility.
// The canonical implementation lives in packages/notifications/src/link-builder/email.ts

import { getAppEnv } from "./env";
import { createEmailLinkBuilder, type EmailLinkBuilder } from "@jurnapod/notifications/link-builder/email";

// Create a singleton link builder with the app's public URL
let _linkBuilder: EmailLinkBuilder | null = null;

function getLinkBuilder(): EmailLinkBuilder {
  if (!_linkBuilder) {
    const env = getAppEnv();
    _linkBuilder = createEmailLinkBuilder(env.app.publicUrl);
  }
  return _linkBuilder;
}

export function buildEmailLink(path: string, token: string): string {
  return getLinkBuilder().buildEmailLink(path, token);
}
