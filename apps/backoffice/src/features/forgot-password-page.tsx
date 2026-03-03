// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, type FormEvent } from "react";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Container,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { apiRequest, ApiError, getApiBaseUrl } from "../lib/api-client";

type ForgotPasswordResponse = {
  success: true;
  data: { message: string };
};

export function ForgotPasswordPage() {
  const [companyCode, setCompanyCode] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiRequest<ForgotPasswordResponse>(
        `${getApiBaseUrl()}/api/auth/password-reset/request`,
        {
          method: "POST",
          body: JSON.stringify({ company_code: companyCode.trim().toUpperCase(), email: email.trim().toLowerCase() })
        }
      );
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "RATE_LIMIT_EXCEEDED") {
          setError("Too many requests. Please try again later.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to process request");
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Container size="xs" py="xl">
        <Card shadow="sm" padding="lg" radius="md">
          <Stack gap="md">
            <Title order={2}>Check Your Email</Title>
            <Alert color="green">
              If an account exists with that email, you will receive a password reset link shortly.
            </Alert>
            <Anchor component="a" href="#/" ta="center">
              Back to Login
            </Anchor>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="xs" py="xl">
      <Card shadow="sm" padding="lg" radius="md">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Title order={2}>Forgot Password</Title>
            <Text size="sm" c="dimmed">
              Enter your company code and email address. If an account exists, you will receive a password reset link.
            </Text>

            {error && (
              <Alert color="red" title="Error">
                {error}
              </Alert>
            )}

            <TextInput
              label="Company Code"
              placeholder="Enter your company code"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.currentTarget.value)}
              required
              autoComplete="organization"
            />

            <TextInput
              label="Email Address"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
              type="email"
              autoComplete="email"
            />

            <Button
              type="submit"
              loading={loading}
              fullWidth
              disabled={!companyCode.trim() || !email.trim()}
            >
              Send Reset Link
            </Button>

            <Anchor component="a" href="#/" ta="center" size="sm">
              Back to Login
            </Anchor>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}
