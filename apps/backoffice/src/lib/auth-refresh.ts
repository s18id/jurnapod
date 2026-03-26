// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getApiBaseUrl } from "./api-base-url";
import { storeAccessToken } from "./auth-storage";

let refreshPromise: Promise<string | null> | null = null;

export async function requestRefreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          }
        });

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as {
          success?: boolean;
          data?: { access_token?: string };
        };

        if (data.success && data.data?.access_token) {
          storeAccessToken(data.data.access_token);
          return data.data.access_token;
        }

        return null;
      } catch {
        return null;
      }
    })();
  }

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
