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

type InvitePageProps = {
  token: string;
};

type InviteResponse = {
  success: true;
  data: { message: string };
};

export function InvitePage({ token }: InvitePageProps) {
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
      await apiRequest<InviteResponse>(
        `${getApiBaseUrl()}/api/auth/invite/accept`,
        {
          method: "POST",
          body: JSON.stringify({ token, password })
        }
      );
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to accept invitation");
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
            <Title order={2}>Invitation Accepted</Title>
            <Alert color="green">
              Your account has been activated. You can now login.
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
          <Title order={2}>Accept Invitation</Title>
          <Text size="sm" c="dimmed">
            You have been invited to join Jurnapod. Set your password below to get started.
          </Text>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}

          <PasswordInput
            label="Password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />

          <PasswordInput
            label="Confirm Password"
            placeholder="Confirm password"
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
            Accept Invitation
          </Button>
        </Stack>
      </Card>
    </Container>
  );
}
