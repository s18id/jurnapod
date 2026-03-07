// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Button, Input } from "../../shared/components/index.js";

export interface LoginFormProps {
  companyCode: string;
  email: string;
  password: string;
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
        padding: 24,
        background: "linear-gradient(135deg, #ecfeff 0%, #fef3c7 100%)",
        color: "#0f172a",
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        display: "grid",
        placeItems: "center"
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 20,
          borderRadius: 14,
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid #e2e8f0",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)"
        }}
      >
        <header style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Jurnapod POS</h1>
          <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
            Sign in to access checkout, sync, and offline cache.
          </p>
        </header>

        <div style={{ display: "grid", gap: 10 }}>
          <Input
            value={companyCode}
            onChange={onCompanyCodeChange}
            placeholder="Company code"
          />
          <Input
            type="email"
            value={email}
            onChange={onEmailChange}
            placeholder="Email"
          />
          <Input
            type="password"
            value={password}
            onChange={onPasswordChange}
            placeholder="Password"
          />
          <Button
            variant="primary"
            onClick={() => {
              void onLogin();
            }}
            disabled={loginInFlight}
          >
            {loginInFlight ? "Signing in..." : "Sign in"}
          </Button>
          {googleEnabled ? (
            <Button
              variant="secondary"
              onClick={onGoogleLogin}
              disabled={loginInFlight || companyCode.trim().length === 0}
            >
              Sign in with Google
            </Button>
          ) : null}
          {authStatus === "loading" ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>Checking session...</div>
          ) : null}
          {authMessage ? <div style={{ fontSize: 12, color: "#334155" }}>{authMessage}</div> : null}
        </div>
      </section>
    </main>
  );
}
