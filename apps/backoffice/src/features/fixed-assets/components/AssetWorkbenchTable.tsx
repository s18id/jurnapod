// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Table, Badge, Group, Text, Box, LoadingOverlay, ActionIcon } from "@mantine/core";
import { IconEye, IconTrash } from "@tabler/icons-react";

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

type AssetWorkbenchTableProps = {
  assets: FixedAsset[];
  loading: boolean;
  categoryLabelById: Map<number, string>;
  outletLabelById: Map<number, string>;
  onSelectAsset: (asset: FixedAsset) => void;
  onDeleteAsset: (assetId: number) => void;
  selectedAssetId: number | null;
};

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function getStatusBadge(asset: FixedAsset): { label: string; color: string } {
  if (asset.disposed_at) {
    return { label: "Disposed", color: "red" };
  }
  if (asset.is_active) {
    return { label: "Active", color: "green" };
  }
  return { label: "Inactive", color: "gray" };
}

export function AssetWorkbenchTable({
  assets,
  loading,
  categoryLabelById,
  outletLabelById,
  onSelectAsset,
  onDeleteAsset,
  selectedAssetId
}: AssetWorkbenchTableProps) {
  return (
    <Box
      pos="relative"
      style={{
        backgroundColor: "white",
        borderRadius: 8,
        border: "1px solid #e9ecef",
        minHeight: 400
      }}
    >
      <LoadingOverlay visible={loading} overlayProps={{ blur: 2 }} />
      
      <Box style={{ overflowX: "auto" }}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Tag</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Outlet</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {assets.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed" ta="center" py="xl">
                    No assets found. Click "New" to create one.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              assets.map((asset) => {
                const status = getStatusBadge(asset);
                const isSelected = selectedAssetId === asset.id;
                return (
                  <Table.Tr
                    key={asset.id}
                    onClick={() => onSelectAsset(asset)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--mantine-color-blue-light)" : undefined
                    }}
                  >
                    <Table.Td>{asset.id}</Table.Td>
                    <Table.Td>
                      <Text fw={500}>{asset.name}</Text>
                    </Table.Td>
                    <Table.Td>{asset.asset_tag ?? "-"}</Table.Td>
                    <Table.Td>
                      {asset.category_id
                        ? categoryLabelById.get(asset.category_id) ?? `#${asset.category_id}`
                        : "-"}
                    </Table.Td>
                    <Table.Td>
                      {asset.outlet_id
                        ? outletLabelById.get(asset.outlet_id) ?? `#${asset.outlet_id}`
                        : "-"}
                    </Table.Td>
                    <Table.Td>{formatCurrency(asset.purchase_cost)}</Table.Td>
                    <Table.Td>
                      <Badge color={status.color}>{status.label}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAsset(asset);
                          }}
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          size="sm"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteAsset(asset.id);
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}
