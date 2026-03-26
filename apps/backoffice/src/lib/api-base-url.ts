// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function readConfiguredBaseUrl(): string {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envBaseUrl) {
    const normalized = normalizeBaseUrl(envBaseUrl);
    if (normalized.endsWith("/api")) {
      return normalized;
    }
    return `${normalized}/api`;
  }

  return "/api";
}

export function getApiBaseUrl(): string {
  return readConfiguredBaseUrl();
}
