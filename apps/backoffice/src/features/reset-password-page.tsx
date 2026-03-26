// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Button,
  Card,
  Container,
  PasswordInput,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { useState } from "react";

import { apiRequest, ApiError, getApiBaseUrl } from "../lib/api-client";

type ResetPasswordPageProps = {
  token: string;
};

type ResetResponse = {
  success: true;
  data: { message: string };
};

export function ResetPasswordPage({ token }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiRequest<ResetResponse>(
        `${getApiBaseUrl()}/api/auth/password-reset/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ token, new_password: password })
        }
      );
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to reset password");
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
            <Title order={2}>Password Reset</Title>
            <Alert color="green">
              Your password has been reset successfully. You can now login with your new password.
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
          <Title order={2}>Reset Password</Title>
          <Text size="sm" c="dimmed">
            Enter your new password below.
          </Text>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}

          <PasswordInput
            label="New Password"
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />

          <PasswordInput
            label="Confirm Password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            required
          />

          <Button
            onClick={handleSubmit}
            loading={loading}
            fullWidth
            disabled={!password || !confirmPassword}
          >
            Reset Password
          </Button>
        </Stack>
      </Card>
    </Container>
  );
}
