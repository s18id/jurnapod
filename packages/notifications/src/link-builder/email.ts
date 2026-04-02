// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Email link builder factory.
 * 
 * Creates a buildEmailLink function that:
 * - Normalizes the base URL by removing trailing slashes
 * - URL-encodes the token to handle special characters safely
 * - Validates that the base URL starts with http:// or https://
 * 
 * Usage:
 *   const { buildEmailLink } = createEmailLinkBuilder('https://example.com');
 *   const link = buildEmailLink('/verify-email', 'my-token');
 */

export type EmailLinkBuilder = {
  buildEmailLink: (path: string, token: string) => string;
};

export function createEmailLinkBuilder(baseUrl: string): EmailLinkBuilder {
  // Normalize base URL by removing trailing slashes
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  // Basic scheme validation
  if (!normalizedBaseUrl.startsWith("http://") && !normalizedBaseUrl.startsWith("https://")) {
    throw new Error("Base URL must start with http:// or https://");
  }

  function buildEmailLink(path: string, token: string): string {
    const encodedToken = encodeURIComponent(token);
    return `${normalizedBaseUrl}${path}?token=${encodedToken}`;
  }

  return { buildEmailLink };
}
