import { useState, type FormEvent } from "react";

type LoginPageProps = {
  isLoading: boolean;
  error: string | null;
  onSubmit: (input: { companyCode: string; email: string; password: string }) => Promise<void>;
};

const cardStyle = {
  width: "100%",
  maxWidth: "380px",
  border: "1px solid #d7cebf",
  borderRadius: "12px",
  padding: "18px",
  backgroundColor: "#ffffff",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.06)"
} as const;

const pageStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "radial-gradient(circle at top right, #f3e5cd, #efe8dc 45%, #e5e9e7)",
  padding: "20px",
  fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
} as const;

const inputStyle = {
  width: "100%",
  border: "1px solid #c8bead",
  borderRadius: "8px",
  padding: "8px 10px",
  marginTop: "6px"
} as const;

const submitStyle = {
  marginTop: "14px",
  width: "100%",
  border: "1px solid #2f5f4a",
  borderRadius: "8px",
  padding: "9px 12px",
  cursor: "pointer",
  backgroundColor: "#2f5f4a",
  color: "#fff"
} as const;

export function LoginPage(props: LoginPageProps) {
  const [companyCode, setCompanyCode] = useState("DEMO");
  const [email, setEmail] = useState("owner@demo.local");
  const [password, setPassword] = useState("password");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSubmit({
      companyCode,
      email,
      password
    });
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Jurnapod Backoffice</h1>
        <p style={{ marginTop: 0 }}>Sign in to open M7 report routes.</p>

        <label>
          Company code
          <input
            style={inputStyle}
            name="company_code"
            data-testid="login-company-code"
            placeholder="Company code"
            value={companyCode}
            onChange={(event) => setCompanyCode(event.target.value)}
            autoComplete="organization"
            required
          />
        </label>

        <label>
          Email
          <input
            style={inputStyle}
            name="email"
            data-testid="login-email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            type="email"
          />
        </label>

        <label>
          Password
          <input
            style={inputStyle}
            name="password"
            data-testid="login-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            type="password"
          />
        </label>

        <button disabled={props.isLoading} style={submitStyle} type="submit">
          {props.isLoading ? "Signing in..." : "Sign in"}
        </button>

        {props.error ? <p style={{ color: "#8d2626", marginBottom: 0 }}>{props.error}</p> : null}
      </form>
    </main>
  );
}
