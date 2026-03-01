// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, type FormEvent } from "react";
import {
  Button,
  Card,
  Center,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";

type LoginPageProps = {
  isLoading: boolean;
  error: string | null;
  onSubmit: (input: { companyCode: string; email: string; password: string }) => Promise<void>;
  onGoogleSignIn?: (companyCode: string) => void;
  googleEnabled?: boolean;
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage(props: LoginPageProps) {
  const [companyCode, setCompanyCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const googleDisabled = props.isLoading || companyCode.trim().length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSubmit({
      companyCode,
      email,
      password
    });
  }

  return (
    <Center mih="100vh" px="md">
      <Card withBorder shadow="md" padding="xl" maw={460} w="100%">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <div>
              <Title order={2}>Jurnapod</Title>
              <Text c="dimmed" size="sm">
                Backoffice Management System
              </Text>
            </div>

            <TextInput
              label="Company Code"
              placeholder="Enter your company code"
              value={companyCode}
              onChange={(event) => setCompanyCode(event.target.value)}
              data-testid="login-company-code"
              autoComplete="organization"
              required
            />

            <TextInput
              label="Email Address"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="login-email"
              autoComplete="email"
              required
              type="email"
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="login-password"
              autoComplete="current-password"
              required
            />

            <Button type="submit" loading={props.isLoading} fullWidth>
              {props.isLoading ? "Signing in..." : "Sign In"}
            </Button>

            {props.googleEnabled ? (
              <>
                <Divider label="or" labelPosition="center" />
                <Button
                  variant="default"
                  leftSection={<GoogleIcon />}
                  fullWidth
                  disabled={googleDisabled}
                  onClick={() => props.onGoogleSignIn?.(companyCode)}
                >
                  Continue with Google
                </Button>
              </>
            ) : null}

            {props.error ? (
              <Group>
                <Text c="red" size="sm">
                  {props.error}
                </Text>
              </Group>
            ) : null}

            <Text size="xs" c="dimmed" ta="center">
              Jurnapod ERP (c) 2026
            </Text>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
