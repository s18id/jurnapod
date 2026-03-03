// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getAppEnv } from "./env";

/**
 * Build a secure email link with proper URL normalization and token encoding.
 * 
 * - Normalizes APP_PUBLIC_URL by removing trailing slashes
 * - URL-encodes the token to handle special characters safely
 * - Validates that the base URL starts with http:// or https://
 */
export function buildEmailLink(path: string, token: string): string {
  const env = getAppEnv();
  const baseUrl = env.app.publicUrl.replace(/\/+$/, ""); // Remove trailing slashes
  
  // Basic scheme validation
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw new Error("APP_PUBLIC_URL must start with http:// or https://");
  }

  const encodedToken = encodeURIComponent(token);
  return `${baseUrl}${path}?token=${encodedToken}`;
}
