// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
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

  async function handleVerify() {
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
        setError(err.message);
      } else {
        setError("Failed to verify email");
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
            <Title order={2}>Email Verified</Title>
            <Alert color="green">
              Your email has been verified successfully.
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
            Click the button below to verify your email address.
          </Text>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}

          <Button
            onClick={handleVerify}
            loading={loading}
            fullWidth
          >
            Verify Email
          </Button>
        </Stack>
      </Card>
    </Container>
  );
}
