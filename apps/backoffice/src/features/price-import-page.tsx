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
import { useItems } from "../hooks/use-items";
import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

interface PriceImportPageProps {
  user: SessionUser;
  accessToken: string;
}

type NormalizedPriceImportRow = {
  item_sku: string;
  price: number;
  is_active: boolean;
  scope: "default" | "outlet";
  outlet_id: number | null;
};

interface ItemPrice {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: number;
  is_active: boolean;
  updated_at: string;
}

export function PriceImportPage({ user, accessToken }: PriceImportPageProps) {
  const navigate = useNavigate();

  // Data hooks
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
  } = useItems({ user, accessToken });

  // Fetch prices for refresh
  const fetchPrices = useCallback(async () => {
    try {
      await apiRequest<{ data: ItemPrice[] }>(
        `/inventory/item-prices?outlet_id=${user.outlets[0]?.id ?? 0}`,
        {},
        accessToken
      );
    } catch {
      // Silently fail - prices are only fetched for refresh
    }
  }, [accessToken, user.outlets]);

  // Import configuration for ImportWizard
  const importConfig: ImportWizardConfig<NormalizedPriceImportRow> = useMemo(() => {
    return {
      title: "Import Prices",
      entityName: "prices",
      entityType: "prices",
      csvTemplate: "item_sku,price,is_active,scope,outlet_id\nSKU001,25000,true,outlet,1\nSKU002,30000,true,default,",
      csvDescription: "Format: item_sku, price, is_active, scope (default/outlet), outlet_id",
      columns: [
        { key: "item_sku", header: "Item SKU", required: true },
        { key: "price", header: "Price", required: true },
        { key: "is_active", header: "Active", required: false },
        { key: "scope", header: "Scope", required: true },
        { key: "outlet_id", header: "Outlet ID", required: false },
      ],
      parseRow: (row: Record<string, string>, _columnMap: Record<string, string>) => {
        return {
          item_sku: row.item_sku || "",
          price: Number(row.price) || 0,
          is_active: row.is_active?.toLowerCase() === "true",
          scope: (row.scope?.toLowerCase() === "default" ? "default" : "outlet") as "default" | "outlet",
          outlet_id: row.outlet_id ? Number(row.outlet_id) : null,
        };
      },
      validateRow: (parsed: Partial<NormalizedPriceImportRow>) => {
        if (!parsed.item_sku) return "Item SKU is required";
        if (!parsed.price || parsed.price <= 0) return "Valid price is required";
        if (!parsed.scope) return "Scope (default/outlet) is required";
        if (parsed.scope === "outlet" && !parsed.outlet_id) {
          return "Outlet ID is required for outlet scope";
        }
        return null;
      },
      importFn: async (rows: ImportPlanRow<NormalizedPriceImportRow>[]) => {
        const results: ImportResult = { success: 0, failed: 0, created: 0, updated: 0, skipped: 0, errors: [] };
        
        for (const row of rows) {
          try {
            const item = items.find(i => i.sku?.toLowerCase() === row.parsed.item_sku?.toLowerCase());
            if (!item) {
              results.failed++;
              results.errors.push({
                row: row.rowIndex + 1,
                error: `Item with SKU '${row.parsed.item_sku}' not found`,
              });
              continue;
            }

            await apiRequest(
              "/inventory/item-prices",
              {
                method: "POST",
                body: JSON.stringify({
                  item_id: item.id,
                  price: row.parsed.price,
                  is_active: row.parsed.is_active ?? true,
                  outlet_id: row.parsed.scope === "default" ? null : row.parsed.outlet_id,
                }),
              },
              accessToken
            );
            results.success++;
            results.created++;
          } catch (err) {
            results.failed++;
            results.errors.push({
              row: row.rowIndex + 1,
              error: err instanceof Error ? err.message : "Import failed",
            });
          }
        }
        
        await fetchPrices();
        return results;
      },
      accessToken,
    };
  }, [items, accessToken, fetchPrices]);

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
        <ImportWizard
          config={importConfig}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      </Card>
    </Stack>
  );
}
