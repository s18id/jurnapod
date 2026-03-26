// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo, useCallback } from "react";
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

import { ImportWizard, type ImportWizardConfig, type ImportPlanRow, type ImportResult } from "../components/import-wizard";
import { useItems, type ItemType } from "../hooks/use-items";
import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

interface ItemImportPageProps {
  user: SessionUser;
  accessToken: string;
}

type ItemFormData = {
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_id: number | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
};

export function ItemImportPage({ user, accessToken }: ItemImportPageProps) {
  const navigate = useNavigate();

  // Data hooks
  const {
    loading: itemsLoading,
    error: itemsError,
    refresh: refreshItems,
  } = useItems({ user, accessToken });

  // Import configuration for ImportWizard
  const importConfig: ImportWizardConfig<ItemFormData> = useMemo(() => ({
    title: "Import Items",
    entityName: "items",
    entityType: "items",
    csvTemplate: "sku,name,type,item_group_code,is_active\nSKU001,Product Name,PRODUCT,GROUP1,true",
    csvDescription: "CSV format: sku (optional), name (required), type (SERVICE/PRODUCT/INGREDIENT/RECIPE), item_group_code (optional), is_active (true/false)",
    columns: [
      { key: "sku", header: "SKU", required: false },
      { key: "name", header: "Name", required: true },
      { key: "type", header: "Type", required: true },
      { key: "item_group_code", header: "Group Code", required: false },
      { key: "is_active", header: "Active", required: false },
    ],
    parseRow: (row: Record<string, string>, _columnMap: Record<string, string>) => {
      const type = (row.type?.toUpperCase() as ItemType) || "PRODUCT";
      if (!["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"].includes(type)) {
        return null;
      }
      return {
        sku: row.sku?.trim() || null,
        name: row.name?.trim() || "",
        type,
        item_group_id: null, // Will be resolved from group code
        cogs_account_id: null,
        inventory_asset_account_id: null,
        is_active: row.is_active?.toLowerCase() !== "false",
      };
    },
    validateRow: (parsed: Partial<ItemFormData>) => {
      if (!parsed.name?.trim()) return "Name is required";
      if (!parsed.type) return "Type is required";
      return null;
    },
    importFn: async (rows: ImportPlanRow<ItemFormData>[]) => {
      const results: ImportResult = { success: 0, failed: 0, created: 0, updated: 0, skipped: 0, errors: [] };
      
      for (const row of rows) {
        try {
          await apiRequest(
            "/inventory/items",
            {
              method: "POST",
              body: JSON.stringify(row.parsed),
            },
            accessToken
          );
          results.success++;
          results.created++;
        } catch (err) {
          results.failed++;
          results.errors.push({
            row: row.rowIndex + 1,
            error: err instanceof Error ? err.message : "Failed to create item",
          });
        }
      }
      
      await refreshItems();
      return results;
    },
    accessToken,
  }), [accessToken, refreshItems]);

  const handleComplete = useCallback(() => {
    navigate("/items");
  }, [navigate]);

  const handleCancel = useCallback(() => {
    navigate("/items");
  }, [navigate]);

  // Loading state
  if (itemsLoading) {
    return (
      <Stack gap="md" p="md">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Import Items</Title>
            <Text size="sm" c="dimmed">
              Bulk import items from CSV file
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
            <Title order={2}>Import Items</Title>
            <Text size="sm" c="dimmed">
              Bulk import items from CSV file
            </Text>
          </div>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate("/items")}
          >
            Back to Items
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
          <Title order={2}>Import Items</Title>
          <Text size="sm" c="dimmed">
            Bulk import items from CSV file
          </Text>
        </div>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate("/items")}
        >
          Back to Items
        </Button>
      </Group>

      {/* Wizard */}
      <Card withBorder>
        <ImportWizard
          config={importConfig}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      </Card>
    </Stack>
  );
}
