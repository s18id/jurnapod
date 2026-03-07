// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useEffect, useState } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { LoginForm, GoogleAuthButton, useAuthCallback } from "../features/auth/index.js";
import { writeAccessToken } from "../offline/auth-session.js";
import { API_CONFIG, buildGoogleAuthUrl, OAUTH_STATE_KEY, OAUTH_COMPANY_KEY } from "../shared/utils/constants.js";

interface LoginPageProps {
  context: WebBootstrapContext;
  onAuthSuccess: (token: string | null) => Promise<void> | void;
}

export function LoginPage({ context, onAuthSuccess }: LoginPageProps): JSX.Element {
  const [companyCode, setCompanyCode] = useState("JP");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginInFlight, setLoginInFlight] = useState(false);
  const [authStatus, setAuthStatus] = useState<"loading" | "anonymous" | "authenticated">("loading");
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const GOOGLE_CLIENT_ID = API_CONFIG.googleClientId;
  const googleEnabled = GOOGLE_CLIENT_ID.length > 0;

  const handleAuthSuccess = useCallback(async (accessToken: string, message?: string) => {
    onAuthSuccess(accessToken);
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
          company_code: companyCode
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
      const message = error instanceof Error ? error.message : "Login failed";
      setAuthMessage(message);
    } finally {
      setLoginInFlight(false);
    }
  };

  return (
    <LoginForm
      companyCode={companyCode}
      email={email}
      password={password}
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
  );
}
