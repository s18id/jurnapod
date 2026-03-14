// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  TextInput,
  Select,
  Button,
  Menu,
  Group,
  Box,
  Text
} from "@mantine/core";
import { IconPlus, IconFilter } from "@tabler/icons-react";

type CategoryOption = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

type OutletOption = {
  id: number;
  code: string;
  name: string;
};

type FixedAssetsToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  outletFilter: string | "ALL";
  onOutletFilterChange: (value: string | "ALL") => void;
  statusFilter: "ALL" | "active" | "inactive" | "disposed";
  onStatusFilterChange: (value: "ALL" | "active" | "inactive" | "disposed") => void;
  showInactive: boolean;
  onShowInactiveChange: (value: boolean) => void;
  categoryFilter: string | "ALL";
  onCategoryFilterChange: (value: string | "ALL") => void;
  categoryOptions: CategoryOption[];
  outletOptions: OutletOption[];
  onCreateAsset: () => void;
  onCreateCategory: () => void;
  assetsCount?: number;
};

export function FixedAssetsToolbar({
  search,
  onSearchChange,
  outletFilter,
  onOutletFilterChange,
  statusFilter,
  onStatusFilterChange,
  showInactive,
  onShowInactiveChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  outletOptions,
  onCreateAsset,
  onCreateCategory,
  assetsCount
}: FixedAssetsToolbarProps) {
  return (
    <Box
      p="md"
      style={{
        backgroundColor: "white",
        borderRadius: 8,
        border: "1px solid #e9ecef"
      }}
    >
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 300 }}>
          <TextInput
            placeholder="Search assets..."
            value={search}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            style={{ width: 200, minWidth: 150 }}
            aria-label="Search assets"
          />

          <Select
            placeholder="Outlet"
            value={outletFilter === "ALL" ? "ALL" : String(outletFilter)}
            onChange={(v) => {
              if (v === null || v === "ALL") {
                onOutletFilterChange("ALL");
              } else if (v === "UNASSIGNED") {
                onOutletFilterChange("UNASSIGNED");
              } else {
                onOutletFilterChange(v);
              }
            }}
            data={[
              { value: "ALL", label: "All outlets" },
              { value: "UNASSIGNED", label: "Unassigned" },
              ...outletOptions.map((o) => ({
                value: String(o.id),
                label: `${o.code} - ${o.name}`
              }))
            ]}
            style={{ width: 160 }}
            clearable
            aria-label="Filter by outlet"
          />

          <Select
            placeholder="Status"
            value={statusFilter}
            onChange={(v) =>
              onStatusFilterChange(
                (v as "ALL" | "active" | "inactive" | "disposed") || "active"
              )
            }
            data={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "disposed", label: "Disposed" },
              { value: "ALL", label: "All" }
            ]}
            style={{ width: 130 }}
            aria-label="Filter by status"
          />

          <Select
            placeholder="Category"
            value={categoryFilter}
            onChange={(v) => onCategoryFilterChange(v ?? "ALL")}
            data={[
              { value: "ALL", label: "All categories" },
              ...categoryOptions.map((c) => ({
                value: String(c.id),
                label: `${c.code} - ${c.name}`
              }))
            ]}
            style={{ width: 180 }}
            clearable
            aria-label="Filter by category"
          />

          <Button
            variant={showInactive ? "filled" : "subtle"}
            size="sm"
            onClick={() => onShowInactiveChange(!showInactive)}
            leftSection={<IconFilter size={16} />}
          >
            <Text size="xs">Inactive</Text>
          </Button>
        </Group>

        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button leftSection={<IconPlus size={16} />}>New</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onCreateAsset}>New Asset</Menu.Item>
            <Menu.Item onClick={onCreateCategory}>New Category</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {assetsCount !== undefined && assetsCount > 0 && (
        <Text size="sm" c="dimmed" mt="xs">
          Showing {assetsCount} assets
        </Text>
      )}
    </Box>
  );
}
