// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * API Client Types and Utilities
 *
 * Shared types and utilities for API clients used by backoffice and POS.
 * This provides a typed wrapper around fetch for RPC-style calls.
 */

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

/**
 * API Error class
 */
export class ClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ClientError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Base URL configuration
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const envBaseUrl = (window as any).ENV?.VITE_API_BASE_URL?.trim();
    if (envBaseUrl) {
      return envBaseUrl.replace(/\/+$/, "");
    }
    return "";
  }
  return "";
}

/**
 * Create headers for API request
 */
export function createApiHeaders(accessToken?: string, contentType = "application/json"): HeadersInit {
  const headers = new Headers();
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

/**
 * Generic API request function
 */
export async function apiRequest<TResponse>(
  baseUrl: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    accessToken?: string;
    params?: Record<string, string | number | undefined>;
  } = {}
): Promise<TResponse> {
  const { method = "GET", body, accessToken, params } = options;

  let url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  // Add query params
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers = createApiHeaders(accessToken);

  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorData: { code?: string; message?: string } = {};
    try {
      const payload = await response.json();
      errorData = (payload as any)?.error ?? {};
    } catch {
      // ignore parse errors
    }
    throw new ClientError(
      response.status,
      errorData.code ?? "HTTP_ERROR",
      errorData.message ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<TResponse>;
}

/**
 * Type guard for API response
 */
export function isApiSuccess<T>(result: ApiResult<T>): result is ApiResponse<T> {
  return result.success === true;
}
