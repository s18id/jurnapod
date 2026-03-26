// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Memory-only token storage (no localStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryCompanyTimezone: string | null = null;

export function getStoredAccessToken(): string | null {
  if (typeof window !== "undefined" && (window as { __E2E_ACCESS_TOKEN__?: string }).__E2E_ACCESS_TOKEN__) {
    return (window as { __E2E_ACCESS_TOKEN__?: string }).__E2E_ACCESS_TOKEN__ ?? null;
  }
  return inMemoryAccessToken;
}

export function storeAccessToken(token: string): void {
  inMemoryAccessToken = token;
}

export function clearAccessToken(): void {
  inMemoryAccessToken = null;
  inMemoryCompanyTimezone = null;
}

export function getStoredCompanyTimezone(): string | null {
  return inMemoryCompanyTimezone;
}

export function storeCompanyTimezone(timezone: string | null | undefined): void {
  inMemoryCompanyTimezone = timezone && timezone.trim() ? timezone : null;
}
