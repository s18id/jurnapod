// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useEffect, useState } from "react";
import { IonContent, IonPage } from "@ionic/react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { LoginForm, useAuthCallback } from "../features/auth/index.js";
import { writeAccessToken } from "../offline/auth-session.js";
import { API_CONFIG, buildGoogleAuthUrl, OAUTH_STATE_KEY, OAUTH_COMPANY_KEY } from "../shared/utils/constants.js";

const LAST_COMPANY_CODE_KEY = "pos:last-company-code";

function readStoredCompanyCode(): string {
  try {
    const value = globalThis.localStorage.getItem(LAST_COMPANY_CODE_KEY);
    if (!value) {
      return "JP";
    }
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : "JP";
  } catch {
    return "JP";
  }
}

function getLoginErrorMessage(error: unknown): string {
  const fallback = "Unable to sign in. Check credentials and try again.";
  const message = error instanceof Error ? error.message : fallback;
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid") || normalized.includes("credentials") || normalized.includes("password")) {
    return "Invalid email or password.";
  }
  if (normalized.includes("disabled") || normalized.includes("inactive") || normalized.includes("blocked")) {
    return "This account is disabled. Contact your manager.";
  }
  if (normalized.includes("throttle") || normalized.includes("too many") || normalized.includes("rate")) {
    return "Too many attempts. Please wait a moment before retrying.";
  }
  if (normalized.includes("network") || normalized.includes("failed to fetch")) {
    return "Network issue detected. Login still works offline if your session is cached.";
  }

  return message || fallback;
}

interface LoginPageProps {
  context: WebBootstrapContext;
  onAuthSuccess: (token: string | null) => Promise<void> | void;
}

export function LoginPage({ context, onAuthSuccess }: LoginPageProps): JSX.Element {
  const [companyCode, setCompanyCode] = useState(readStoredCompanyCode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginInFlight, setLoginInFlight] = useState(false);
  const [authStatus, setAuthStatus] = useState<"loading" | "anonymous" | "authenticated">("loading");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const GOOGLE_CLIENT_ID = API_CONFIG.googleClientId;
  const googleEnabled = GOOGLE_CLIENT_ID.length > 0;

  const handleAuthSuccess = useCallback(async (accessToken: string) => {
    await onAuthSuccess(accessToken);
  }, [onAuthSuccess]);

  const { bootstrapAuth } = useAuthCallback({
    onAuthSuccess: handleAuthSuccess,
    onAuthError: (msg) => setAuthMessage(msg),
    onStatusChange: setAuthStatus,
    setLoginInFlight,
    setAuthMessage
  });

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
    };
    const onOffline = () => {
      setIsOnline(false);
    };

    globalThis.addEventListener("online", onOnline);
    globalThis.addEventListener("offline", onOffline);
    return () => {
      globalThis.removeEventListener("online", onOnline);
      globalThis.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const normalized = companyCode.trim().toUpperCase();
      if (normalized.length > 0) {
        globalThis.localStorage.setItem(LAST_COMPANY_CODE_KEY, normalized);
      }
    } catch {
      // No-op when storage is unavailable.
    }
  }, [companyCode]);

  const handleGoogleLogin = () => {
    const state = crypto.randomUUID();
    globalThis.sessionStorage.setItem(OAUTH_STATE_KEY, state);
    globalThis.sessionStorage.setItem(OAUTH_COMPANY_KEY, companyCode);
    
    const url = buildGoogleAuthUrl({
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: `${globalThis.location.origin}/auth/callback`,
      state
    });
    globalThis.location.href = url;
  };

  const handleEmailLogin = async () => {
    setLoginInFlight(true);
    setAuthMessage(null);

    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          company_code: companyCode.trim().toUpperCase()
        })
      });

      const payload = (await response.json()) as
        | { success: true; data: { access_token: string } }
        | { success: false; data?: { message?: string } };

      if (!response.ok || !payload || payload.success !== true || typeof payload.data?.access_token !== "string") {
        const msg = payload && payload.success === false ? payload.data?.message ?? "Login failed" : "Login failed";
        throw new Error(msg);
      }

      writeAccessToken(payload.data.access_token);
      await handleAuthSuccess(payload.data.access_token);
    } catch (error) {
      const message = getLoginErrorMessage(error);
      setAuthMessage(message);
    } finally {
      setLoginInFlight(false);
    }
  };

  return (
    <IonPage>
      <IonContent
        style={{
          ["--background" as string]: "#f8fafc"
        }}
      >
        <LoginForm
          companyCode={companyCode}
          email={email}
          password={password}
          isOnline={isOnline}
          onCompanyCodeChange={setCompanyCode}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onLogin={handleEmailLogin}
          onGoogleLogin={handleGoogleLogin}
          loginInFlight={loginInFlight}
          googleEnabled={googleEnabled}
          authMessage={authMessage}
          authStatus={authStatus}
        />
      </IonContent>
    </IonPage>
  );
}
