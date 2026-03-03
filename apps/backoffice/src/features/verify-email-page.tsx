// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useRef } from "react";
import {
  Alert,
  Button,
  Card,
  Container,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { apiRequest, ApiError, getApiBaseUrl } from "../lib/api-client";

type VerifyEmailPageProps = {
  token: string;
};

type VerifyResponse = {
  success: true;
  data: { message: string };
};

export function VerifyEmailPage({ token }: VerifyEmailPageProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAttempted = useRef(false);

  async function handleVerify() {
    if (!token) {
      setError("Invalid or missing verification link");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiRequest<VerifyResponse>(
        `${getApiBaseUrl()}/api/auth/email/verify/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ token })
        }
      );
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "INVALID_TOKEN" || err.code === "INVALID_REQUEST") {
          setError("This verification link is invalid or has expired. Please request a new verification email.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to verify email");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token && !hasAttempted.current) {
      hasAttempted.current = true;
      handleVerify();
    }
  }, [token]);

  if (!token) {
    return (
      <Container size="xs" py="xl">
        <Card shadow="sm" padding="lg" radius="md">
          <Stack gap="md">
            <Title order={2}>Verify Email</Title>
            <Alert color="red" title="Invalid Link">
              Invalid or missing verification link. Please check your email for the correct link or request a new verification email.
            </Alert>
            <Button component="a" href="/">
              Go to Login
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (success) {
    return (
      <Container size="xs" py="xl">
        <Card shadow="sm" padding="lg" radius="md">
          <Stack gap="md">
            <Title order={2}>Email Verified</Title>
            <Alert color="green">
              Your email has been verified successfully. You can now access your account.
            </Alert>
            <Button component="a" href="/">
              Go to Login
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="xs" py="xl">
      <Card shadow="sm" padding="lg" radius="md">
        <Stack gap="md">
          <Title order={2}>Verify Email</Title>
          <Text size="sm" c="dimmed">
            Verifying your email address...
          </Text>

          {error && (
            <Alert color="red" title="Verification Failed">
              {error}
            </Alert>
          )}

          <Button
            onClick={handleVerify}
            loading={loading}
            fullWidth
            disabled={!token}
          >
            {loading ? "Verifying..." : "Verify Email"}
          </Button>
        </Stack>
      </Card>
    </Container>
  );
}
