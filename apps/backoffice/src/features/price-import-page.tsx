// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack,
  Card,
  Title,
  Text,
  Group,
  Button,
  Alert,
  Loader,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";

import { useItems } from "../hooks/use-items";
import type { SessionUser } from "../lib/session";
import { canAccessStagedImport, getImportDeniedMessage } from "./import/import-permission-gates";
import { StagedImportWorkflow } from "./import/staged-import-workflow";

interface PriceImportPageProps {
  user: SessionUser;
}

export function PriceImportPage({ user }: PriceImportPageProps) {
  const navigate = useNavigate();
  const canImport = canAccessStagedImport(user, "prices");

  // Data hooks
  const {
    loading: itemsLoading,
    error: itemsError,
  } = useItems({ user });

  const handleComplete = useCallback(() => {
    navigate("/prices");
  }, [navigate]);

  const handleCancel = useCallback(() => {
    navigate("/prices");
  }, [navigate]);

  // Loading state
  if (itemsLoading) {
    return (
      <Stack gap="md" p="md">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Import Prices</Title>
            <Text size="sm" c="dimmed">
              Bulk import prices from CSV file
            </Text>
          </div>
        </Group>
        <Group justify="center" py="xl">
          <Loader />
          <Text>Loading...</Text>
        </Group>
      </Stack>
    );
  }

  // Error state
  if (itemsError) {
    return (
      <Stack gap="md" p="md">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Import Prices</Title>
            <Text size="sm" c="dimmed">
              Bulk import prices from CSV file
            </Text>
          </div>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate("/prices")}
          >
            Back to Prices
          </Button>
        </Group>
        <Alert color="red" title="Error loading data">
          {itemsError}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>Import Prices</Title>
          <Text size="sm" c="dimmed">
            Bulk import prices from CSV file
          </Text>
        </div>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate("/prices")}
        >
          Back to Prices
        </Button>
      </Group>

      {/* Wizard */}
      <Card withBorder>
        {canImport ? (
          <StagedImportWorkflow
            entityType="prices"
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        ) : (
          <Alert color="orange" title="Permission required">
            {getImportDeniedMessage("prices")}
          </Alert>
        )}
      </Card>
    </Stack>
  );
}
