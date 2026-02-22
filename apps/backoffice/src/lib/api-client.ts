const DEFAULT_API_BASE_URL = "http://localhost:3001/api";

type RuntimeConfig = {
  __JURNAPOD_API_BASE_URL__?: string;
};

type ApiErrorPayload = {
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

function readConfiguredBaseUrl(): string {
  const runtimeConfig = globalThis as RuntimeConfig;
  const configured = runtimeConfig.__JURNAPOD_API_BASE_URL__?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;
}

export function getApiBaseUrl(): string {
  return readConfiguredBaseUrl().replace(/\/$/, "");
}

export async function apiRequest<TResponse>(
  path: string,
  init: RequestInit = {},
  accessToken?: string
): Promise<TResponse> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers
  });

  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | TResponse | null;
  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    throw new ApiError(
      response.status,
      errorPayload.error?.code ?? "HTTP_ERROR",
      errorPayload.error?.message ?? `Request failed with status ${response.status}`
    );
  }

  return payload as TResponse;
}
