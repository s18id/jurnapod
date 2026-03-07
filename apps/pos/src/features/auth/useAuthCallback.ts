// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useCallback, useRef } from "react";
import { readAccessToken, writeAccessToken, clearAccessToken } from "../../offline/auth-session.js";
import { OAUTH_STATE_KEY, OAUTH_COMPANY_KEY, API_CONFIG } from "../../shared/utils/constants.js";

const API_ORIGIN = API_CONFIG.baseUrl;

export interface UseAuthCallbackOptions {
  onAuthSuccess: (accessToken: string, message?: string) => Promise<void>;
  onAuthError: (message: string) => void;
  onStatusChange: (status: "loading" | "anonymous" | "authenticated") => void;
  setLoginInFlight: (inFlight: boolean) => void;
  setAuthMessage: (message: string | null) => void;
}

export interface UseAuthCallbackReturn {
  handleGoogleCallback: () => Promise<boolean>;
  bootstrapAuth: () => Promise<void>;
}

export function useAuthCallback({
  onAuthSuccess,
  onAuthError,
  onStatusChange,
  setLoginInFlight,
  setAuthMessage
}: UseAuthCallbackOptions): UseAuthCallbackReturn {
  const disposedRef = useRef(false);

  const handleGoogleCallback = useCallback(async (): Promise<boolean> => {
    const url = new URL(globalThis.location.href);
    if (url.pathname !== "/auth/callback") {
      return false;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = globalThis.sessionStorage.getItem(OAUTH_STATE_KEY);
    const storedCompany = globalThis.sessionStorage.getItem(OAUTH_COMPANY_KEY);
    globalThis.sessionStorage.removeItem(OAUTH_STATE_KEY);
    globalThis.sessionStorage.removeItem(OAUTH_COMPANY_KEY);

    setAuthMessage(null);
    setLoginInFlight(true);
    onStatusChange("loading");

    if (!code || !state || !storedState || storedState !== state || !storedCompany) {
      setAuthMessage("Google sign-in failed. Please try again.");
      onStatusChange("anonymous");
      setLoginInFlight(false);
      globalThis.history.replaceState({}, "", "/");
      return true;
    }

    try {
      const redirectUri = `${globalThis.location.origin}/auth/callback`;
      const response = await fetch(`${API_ORIGIN}/api/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode: storedCompany,
          code,
          redirect_uri: redirectUri
        })
      });

      const payload = (await response.json()) as
        | { success: true; data: { access_token: string } }
        | { success: false; data?: { message?: string } };

      if (
        !response.ok ||
        !payload ||
        payload.success !== true ||
        typeof payload.data?.access_token !== "string"
      ) {
        const msg = payload && payload.success === false ? payload.data?.message ?? "Login failed" : "Login failed";
        throw new Error(msg);
      }

      writeAccessToken(payload.data.access_token);
      await onAuthSuccess(payload.data.access_token, "Authenticated. Sync pull and push are now authorized.");
      globalThis.history.replaceState({}, "", "/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setAuthMessage(`Auth failed: ${message}`);
      onStatusChange("anonymous");
      globalThis.history.replaceState({}, "", "/");
    } finally {
      if (!disposedRef.current) {
        setLoginInFlight(false);
      }
    }

    return true;
  }, [onAuthSuccess, onStatusChange, setAuthMessage, setLoginInFlight]);

  const bootstrapAuth = useCallback(async (): Promise<void> => {
    const handledCallback = await handleGoogleCallback();
    if (handledCallback || disposedRef.current) {
      return;
    }

    const storedToken = readAccessToken();
    if (!storedToken) {
      onStatusChange("anonymous");
      return;
    }

    try {
      await onAuthSuccess(storedToken);
    } catch {
      clearAccessToken();
      onStatusChange("anonymous");
    }
  }, [handleGoogleCallback, onAuthSuccess, onStatusChange]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
    };
  }, []);

  return {
    handleGoogleCallback,
    bootstrapAuth
  };
}
