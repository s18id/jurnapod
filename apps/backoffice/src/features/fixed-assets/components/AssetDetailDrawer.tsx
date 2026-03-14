// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Drawer,
  Stack,
  Text,
  Title,
  Badge,
  Group,
  Box,
  LoadingOverlay,
  Button,
  Divider
} from "@mantine/core";
import { IconPackage, IconCash, IconArrowRight, IconAlertTriangle } from "@tabler/icons-react";

type FixedAsset = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  is_active: boolean;
  disposed_at: string | null;
  updated_at: string;
};

type FixedAssetBook = {
  asset_id: number;
  cost_basis: number;
  accum_depreciation: number;
  accum_impairment: number;
  carrying_amount: number;
  as_of_date: string;
  last_event_id: number;
};

type FixedAssetEvent = {
  id: number;
  event_type: string;
  event_date: string;
  journal_batch_id: number | null;
  status: string;
  event_data: Record<string, unknown>;
};

type LedgerResponse = {
  asset_id: number;
  events: FixedAssetEvent[];
};

type SessionUser = {
  id: number;
  company_id: number;
  outlets: Array<{ id: number; code: string; name: string }>;
  roles: string[];
};

type AssetDetailDrawerProps = {
  opened: boolean;
  onClose: () => void;
  selectedAssetId: number | null;
  assets: FixedAsset[];
  categoryLabelById: Map<number, string>;
  outletLabelById: Map<number, string>;
  assetBook: FixedAssetBook | null;
  assetLedger: LedgerResponse | null;
  detailLoading: boolean;
  onRecordAcquisition: () => void;
  onRecordTransfer: () => void;
  onRecordImpairment: () => void;
  onRecordDisposal: () => void;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function getEventBadgeColor(eventType: string): string {
  switch (eventType) {
    case "ACQUISITION":
    case "FA_ACQUISITION":
      return "green";
    case "DEPRECIATION":
      return "blue";
    case "TRANSFER":
      return "violet";
    case "IMPAIRMENT":
      return "orange";
    case "DISPOSAL":
    case "FA_DISPOSAL":
      return "red";
    case "VOID":
      return "gray";
    default:
      return "gray";
  }
}

export function AssetDetailDrawer({
  opened,
  onClose,
  selectedAssetId,
  assets,
  categoryLabelById,
  outletLabelById,
  assetBook,
  assetLedger,
  detailLoading,
  onRecordAcquisition,
  onRecordTransfer,
  onRecordImpairment,
  onRecordDisposal
}: AssetDetailDrawerProps) {
  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const getStatusBadge = (asset: FixedAsset | undefined) => {
    if (!asset) return { label: "Unknown", color: "gray" };
    if (asset.disposed_at) return { label: "Disposed", color: "red" };
    if (asset.is_active) return { label: "Active", color: "green" };
    return { label: "Inactive", color: "gray" };
  };

  const status = getStatusBadge(selectedAsset);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Title order={4}>
          {selectedAsset ? selectedAsset.name : "Asset Details"}
        </Title>
      }
      position="right"
      size="md"
      styles={{
        body: { padding: 0 },
        header: { padding: "md", borderBottom: "1px solid #e9ecef" }
      }}
    >
      <LoadingOverlay visible={detailLoading} overlayProps={{ blur: 2 }} />

      {!selectedAsset ? (
        <Box p="xl" ta="center">
          <Text c="dimmed">Select an asset to view details</Text>
        </Box>
      ) : (
        <Stack gap="md" p="md">
          {/* Overview Section */}
          <Box>
            <Title order={6} mb="sm">
              Overview
            </Title>
            <Group grow>
              <div>
                <Text size="xs" c="dimmed">
                  Asset Tag
                </Text>
                <Text size="sm">{selectedAsset.asset_tag ?? "-"}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Serial Number
                </Text>
                <Text size="sm">{selectedAsset.serial_number ?? "-"}</Text>
              </div>
            </Group>
            <Group grow mt="sm">
              <div>
                <Text size="xs" c="dimmed">
                  Category
                </Text>
                <Text size="sm">
                  {selectedAsset.category_id
                    ? categoryLabelById.get(selectedAsset.category_id) ??
                      `#${selectedAsset.category_id}`
                    : "-"}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Outlet
                </Text>
                <Text size="sm">
                  {selectedAsset.outlet_id
                    ? outletLabelById.get(selectedAsset.outlet_id) ??
                      `#${selectedAsset.outlet_id}`
                    : "Unassigned"}
                </Text>
              </div>
            </Group>
            <Group grow mt="sm">
              <div>
                <Text size="xs" c="dimmed">
                  Purchase Date
                </Text>
                <Text size="sm">
                  {selectedAsset.purchase_date?.slice(0, 10) ?? "-"}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Status
                </Text>
                <Badge color={status.color}>{status.label}</Badge>
              </div>
            </Group>
          </Box>

          <Divider />

          {/* Book Value Section */}
          <Box>
            <Title order={6} mb="sm">
              Book Value
            </Title>
            {assetBook ? (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Cost Basis</Text>
                  <Text size="sm" fw={500}>
                    {formatCurrency(assetBook.cost_basis)}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Accum. Depreciation</Text>
                  <Text size="sm" fw={500} c="orange">
                    {formatCurrency(assetBook.accum_depreciation)}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Accum. Impairment</Text>
                  <Text size="sm" fw={500} c="red">
                    {formatCurrency(assetBook.accum_impairment)}
                  </Text>
                </Group>
                <Divider />
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    Carrying Amount
                  </Text>
                  <Text size="sm" fw={700} c="blue">
                    {formatCurrency(assetBook.carrying_amount)}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  As of {assetBook.as_of_date}
                </Text>
              </Stack>
            ) : (
              <Text c="dimmed" size="sm">
                No book data available. Record an acquisition to start.
              </Text>
            )}
          </Box>

          <Divider />

          {/* Lifecycle Timeline Section */}
          <Box>
            <Title order={6} mb="sm">
              Lifecycle Events
            </Title>
            {assetLedger && assetLedger.events.length > 0 ? (
              <Stack gap="xs">
                {assetLedger.events.slice(0, 5).map((event) => (
                  <Box
                    key={event.id}
                    p="xs"
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderRadius: 6,
                      border:
                        event.status === "VOIDED"
                          ? "1px dashed #dee2e6"
                          : "1px solid #e9ecef"
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap">
                        <Badge
                          size="sm"
                          color={getEventBadgeColor(event.event_type)}
                          variant="light"
                        >
                          {event.event_type}
                        </Badge>
                        <Text size="xs">{event.event_date}</Text>
                      </Group>
                      <Group gap="xs" wrap="nowrap">
                        {event.journal_batch_id && (
                          <Text
                            size="xs"
                            c="blue"
                            style={{ cursor: "pointer" }}
                            title="Click to copy"
                          >
                            #{event.journal_batch_id}
                          </Text>
                        )}
                        <Badge
                          size="xs"
                          color={event.status === "POSTED" ? "green" : "gray"}
                          variant="outline"
                        >
                          {event.status}
                        </Badge>
                      </Group>
                    </Group>
                  </Box>
                ))}
                {assetLedger.events.length > 5 && (
                  <Text size="xs" c="dimmed" ta="center">
                    +{assetLedger.events.length - 5} more events
                  </Text>
                )}
              </Stack>
            ) : (
              <Text c="dimmed" size="sm">
                No lifecycle events yet.
              </Text>
            )}
          </Box>

          <Divider />

          {/* Actions Section */}
          <Box>
            <Title order={6} mb="sm">
              Actions
            </Title>
            <Stack gap="xs">
              <Button
                variant="light"
                fullWidth
                leftSection={<IconPackage size={16} />}
                disabled={!!selectedAsset.disposed_at}
                onClick={onRecordAcquisition}
              >
                Record Acquisition
              </Button>
              <Button
                variant="light"
                fullWidth
                leftSection={<IconArrowRight size={16} />}
                disabled={!!selectedAsset.disposed_at}
                onClick={onRecordTransfer}
              >
                Transfer
              </Button>
              <Button
                variant="light"
                fullWidth
                leftSection={<IconAlertTriangle size={16} />}
                color="orange"
                disabled={!!selectedAsset.disposed_at}
                onClick={onRecordImpairment}
              >
                Impairment
              </Button>
              <Button
                variant="light"
                fullWidth
                leftSection={<IconCash size={16} />}
                color="red"
                disabled={!!selectedAsset.disposed_at}
                onClick={onRecordDisposal}
              >
                Dispose
              </Button>
            </Stack>
          </Box>
        </Stack>
      )}
    </Drawer>
  );
}
