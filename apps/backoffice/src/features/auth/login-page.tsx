import { useState, type FormEvent } from "react";

type LoginPageProps = {
  isLoading: boolean;
  error: string | null;
  onSubmit: (input: { companyCode: string; email: string; password: string }) => Promise<void>;
  onGoogleSignIn?: (companyCode: string) => void;
  googleEnabled?: boolean;
};

const cardStyle = {
  width: "100%",
  maxWidth: "440px",
  border: "1px solid #e2ddd2",
  borderRadius: "16px",
  padding: "40px",
  backgroundColor: "#ffffff",
  boxShadow: "0 20px 60px rgba(47, 95, 74, 0.1), 0 4px 16px rgba(0, 0, 0, 0.04)"
} as const;

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #f5f1e8 0%, #e8ede9 100%)",
  padding: "20px",
  fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
} as const;

const logoStyle = {
  textAlign: "center" as const,
  marginBottom: "32px"
} as const;

const titleStyle = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#2f5f4a",
  margin: "0 0 8px 0",
  letterSpacing: "-0.5px"
} as const;

const subtitleStyle = {
  fontSize: "14px",
  color: "#6b5d48",
  margin: 0,
  lineHeight: 1.5
} as const;

const labelStyle = {
  display: "block",
  fontSize: "14px",
  fontWeight: 600,
  color: "#4a4034",
  marginBottom: "8px",
  marginTop: "20px"
} as const;

const inputStyle = {
  width: "100%",
  border: "1px solid #d1c7b8",
  borderRadius: "8px",
  padding: "12px 14px",
  fontSize: "15px",
  backgroundColor: "#fafaf8",
  transition: "all 0.2s ease",
  boxSizing: "border-box" as const
} as const;

const inputFocusStyle = {
  outline: "none",
  borderColor: "#2f5f4a",
  backgroundColor: "#ffffff"
} as const;

const submitStyle = {
  marginTop: "28px",
  width: "100%",
  border: "none",
  borderRadius: "8px",
  padding: "14px 16px",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
  backgroundColor: "#2f5f4a",
  color: "#fff",
  transition: "all 0.2s ease",
  boxShadow: "0 2px 8px rgba(47, 95, 74, 0.2)"
} as const;

const submitHoverStyle = {
  backgroundColor: "#254a3a",
  boxShadow: "0 4px 12px rgba(47, 95, 74, 0.3)"
} as const;

const submitDisabledStyle = {
  opacity: 0.6,
  cursor: "not-allowed"
} as const;

const dividerStyle = {
  display: "flex",
  alignItems: "center",
  margin: "24px 0",
  color: "#9c8f7c",
  fontSize: "13px"
} as const;

const dividerLineStyle = {
  flex: 1,
  height: "1px",
  backgroundColor: "#e2ddd2"
} as const;

const dividerTextStyle = {
  padding: "0 16px"
} as const;

const googleStyle = {
  width: "100%",
  border: "1px solid #d1c7b8",
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
  backgroundColor: "#ffffff",
  color: "#4a4034",
  transition: "all 0.2s ease",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px"
} as const;

const googleHoverStyle = {
  backgroundColor: "#fafaf8",
  borderColor: "#c8bead",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)"
} as const;

const googleDisabledStyle = {
  opacity: 0.5,
  cursor: "not-allowed"
} as const;

const errorStyle = {
  marginTop: "16px",
  padding: "12px 16px",
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  color: "#991b1b",
  fontSize: "14px",
  marginBottom: 0
} as const;

const footerStyle = {
  marginTop: "32px",
  textAlign: "center" as const,
  fontSize: "13px",
  color: "#9c8f7c"
} as const;

export function LoginPage(props: LoginPageProps) {
  const [companyCode, setCompanyCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitHovered, setSubmitHovered] = useState(false);
  const [googleHovered, setGoogleHovered] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSubmit({
      companyCode,
      email,
      password
    });
  }

  const getSubmitButtonStyle = () => {
    if (props.isLoading) {
      return { ...submitStyle, ...submitDisabledStyle };
    }
    if (submitHovered) {
      return { ...submitStyle, ...submitHoverStyle };
    }
    return submitStyle;
  };

  const getGoogleButtonStyle = () => {
    const disabled = props.isLoading || companyCode.trim().length === 0;
    if (disabled) {
      return { ...googleStyle, ...googleDisabledStyle };
    }
    if (googleHovered) {
      return { ...googleStyle, ...googleHoverStyle };
    }
    return googleStyle;
  };

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={logoStyle}>
          <h1 style={titleStyle}>Jurnapod</h1>
          <p style={subtitleStyle}>Backoffice Management System</p>
        </div>

        <div>
          <label style={labelStyle} htmlFor="company_code">
            Company Code
          </label>
          <input
            style={inputStyle}
            id="company_code"
            name="company_code"
            data-testid="login-company-code"
            placeholder="Enter your company code"
            value={companyCode}
            onChange={(event) => setCompanyCode(event.target.value)}
            autoComplete="organization"
            required
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="email">
            Email Address
          </label>
          <input
            style={inputStyle}
            id="email"
            name="email"
            data-testid="login-email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            type="email"
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="password">
            Password
          </label>
          <input
            style={inputStyle}
            id="password"
            name="password"
            data-testid="login-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            type="password"
          />
        </div>

        <button
          disabled={props.isLoading}
          style={getSubmitButtonStyle()}
          type="submit"
          onMouseEnter={() => setSubmitHovered(true)}
          onMouseLeave={() => setSubmitHovered(false)}
        >
          {props.isLoading ? "Signing in..." : "Sign In"}
        </button>

        {props.googleEnabled ? (
          <>
            <div style={dividerStyle}>
              <div style={dividerLineStyle} />
              <span style={dividerTextStyle}>or</span>
              <div style={dividerLineStyle} />
            </div>
            <button
              disabled={props.isLoading || companyCode.trim().length === 0}
              style={getGoogleButtonStyle()}
              type="button"
              onClick={() => props.onGoogleSignIn?.(companyCode)}
              onMouseEnter={() => setGoogleHovered(true)}
              onMouseLeave={() => setGoogleHovered(false)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
                <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </>
        ) : null}

        {props.error ? <p style={errorStyle}>{props.error}</p> : null}

        <div style={footerStyle}>
          <p style={{ margin: 0 }}>Jurnapod ERP &copy; 2026</p>
        </div>
      </form>
    </main>
  );
}
