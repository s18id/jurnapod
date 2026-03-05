// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

type ApiErrorPayload = {
  data?: {
    code?: string;
    message?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

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

let refreshPromise: Promise<string | null> | null = null;

async function requestRefreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshAccessToken } = await import("./session");
      return refreshAccessToken();
    })();
  }

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiRequest<TResponse>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
  _isRetry = false
): Promise<TResponse> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  // Always include credentials for cross-site refresh cookie
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | TResponse | null;
  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    const errorData = errorPayload.data ?? errorPayload.error ?? {};
    
    // On 401 (unauthorized), attempt refresh and retry once
    if (response.status === 401 && !_isRetry) {
      const newToken = await requestRefreshToken();
      if (newToken) {
        return apiRequest<TResponse>(path, init, newToken, true);
      }
    }
    
    throw new ApiError(
      response.status,
      errorData.code ?? "HTTP_ERROR",
      errorData.message ?? `Request failed with status ${response.status}`
    );
  }

  return payload as TResponse;
}
