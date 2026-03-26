// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requestRefreshToken } from "./auth-refresh";
import { getApiBaseUrl } from "./api-base-url";

export { getApiBaseUrl } from "./api-base-url";

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
