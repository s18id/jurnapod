// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requestRefreshToken } from "./auth-refresh";
import { getApiBaseUrl } from "./api-base-url";
import { getStoredAccessToken } from "./auth-storage";

export { getApiBaseUrl } from "./api-base-url";
export { getStoredAccessToken } from "./auth-storage";

export { resolveToken };

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

export type ApiRequestOptions = {
  accessToken?: string;  // temporary migration override
  skipAuth?: boolean;    // for public endpoints
};

export type StreamingRequestOptions = {
  accessToken?: string;
  skipAuth?: boolean;
};

function resolveToken(third?: string | ApiRequestOptions): string | undefined {
  if (typeof third === 'string') {
    return third;
  }
  if (third && typeof third === 'object' && 'accessToken' in third) {
    return third.accessToken;
  }
  if (!third || !(third as ApiRequestOptions).skipAuth) {
    return getStoredAccessToken() ?? undefined;
  }
  return undefined;
}

export async function apiRequest<TResponse>(
  path: string,
  init: RequestInit = {},
  third?: string | ApiRequestOptions,
  _isRetry = false
): Promise<TResponse> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  const accessToken = resolveToken(third);
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | TResponse | null;
  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    const errorData = errorPayload.data ?? errorPayload.error ?? {};

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

export async function apiStreamingRequest(
  path: string,
  init: RequestInit = {},
  third?: string | StreamingRequestOptions
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});

  const accessToken = resolveToken(third);
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });
}

// ============================================================================
// XHR Upload Wrappers (for progress tracking)
// ============================================================================

export type UploadProgressCallback = (percentage: number) => void;

export function uploadWithProgress<TResponse>(
  path: string,
  body: FormData,
  onProgress?: UploadProgressCallback
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          reject(new Error("Invalid response format"));
        }
      } else {
        try {
          const errorResp = JSON.parse(xhr.responseText);
          reject(new Error(errorResp.message || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    xhr.open("POST", `${getApiBaseUrl()}${path}`);

    const token = resolveToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.send(body);
  });
}

export type ApplyProgressCallback = (progress: {
  current: number;
  total: number;
  currentRow: number;
  percentage: number;
}) => void;

export function applyWithProgress<TResponse>(
  path: string,
  jsonBody: Record<string, unknown>,
  onProgress?: ApplyProgressCallback
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress?.({
          current: 0,
          total: 100,
          currentRow: 0,
          percentage: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    xhr.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress?.({
          current: 0,
          total: 100,
          currentRow: 0,
          percentage: 50 + Math.round((event.loaded / event.total) * 50),
        });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          reject(new Error("Invalid response format"));
        }
      } else {
        try {
          const errorResp = JSON.parse(xhr.responseText);
          reject(new Error(errorResp.message || `Request failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Request failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during request"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Request cancelled"));
    });

    xhr.open("POST", `${getApiBaseUrl()}${path}`);

    const token = resolveToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(jsonBody));
  });
}
