// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonLoading } from "@ionic/react";
import { Button, Input } from "../../shared/components/index.js";

export interface LoginFormProps {
  companyCode: string;
  email: string;
  password: string;
  isOnline: boolean;
  onCompanyCodeChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
  onGoogleLogin: () => void;
  loginInFlight: boolean;
  googleEnabled: boolean;
  authMessage: string | null;
  authStatus: "loading" | "anonymous" | "authenticated";
}

export function LoginForm({
  companyCode,
  email,
  password,
  isOnline,
  onCompanyCodeChange,
  onEmailChange,
  onPasswordChange,
  onLogin,
  onGoogleLogin,
  loginInFlight,
  googleEnabled,
  authMessage,
  authStatus
}: LoginFormProps): JSX.Element {
  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        display: "grid",
        placeItems: "center",
        boxSizing: "border-box"
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          maxHeight: "100%",
          overflowY: "auto",
          padding: 24,
          borderRadius: 16,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 16px 32px rgba(15, 23, 42, 0.08)",
          boxSizing: "border-box"
        }}
      >
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Jurnapod POS</h1>
          <p style={{ margin: "6px 0 0", color: "#475569", fontSize: 14 }}>
            Sign in to access checkout, sync, and offline cache.
          </p>
          <div
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              color: isOnline ? "#166534" : "#9a3412",
              background: isOnline ? "#dcfce7" : "#ffedd5",
              border: `1px solid ${isOnline ? "#86efac" : "#fdba74"}`
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isOnline ? "#22c55e" : "#f97316"
              }}
            />
            {isOnline ? "Online" : "Offline mode enabled"}
          </div>
        </header>

        <div style={{ display: "grid", gap: 12 }}>
          <label htmlFor="login-company-code" style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
            Company code
          </label>
          <Input
            id="login-company-code"
            name="companyCode"
            value={companyCode}
            onChange={onCompanyCodeChange}
            placeholder="Company code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <label htmlFor="login-email" style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
            Email
          </label>
          <Input
            id="login-email"
            name="email"
            type="email"
            value={email}
            onChange={onEmailChange}
            placeholder="Email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <label htmlFor="login-password" style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
            Password
          </label>
          <Input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={onPasswordChange}
            placeholder="Password"
            autoComplete="current-password"
          />
          <Button
            id="login-submit"
            name="loginSubmit"
            variant="primary"
            fullWidth
            size="large"
            onClick={() => {
              void onLogin();
            }}
            disabled={loginInFlight}
          >
            {loginInFlight ? "Signing in..." : "Sign in"}
          </Button>
          {googleEnabled ? (
            <Button
              id="login-google-submit"
              name="loginGoogleSubmit"
              variant="secondary"
              fullWidth
              size="large"
              onClick={onGoogleLogin}
              disabled={loginInFlight || companyCode.trim().length === 0 || !isOnline}
            >
              {isOnline ? "Sign in with Google" : "Google login needs internet"}
            </Button>
          ) : null}
          {authStatus === "loading" ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>Checking session...</div>
          ) : null}
          {authMessage ? <div style={{ fontSize: 12, color: "#334155" }}>{authMessage}</div> : null}
        </div>
      </section>
      <IonLoading isOpen={loginInFlight} message="Signing in..." />
    </main>
  );
}
