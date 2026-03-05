// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Group, Select, Stack, Text } from "@mantine/core";
import type { ColumnDef } from "@tanstack/react-table";
import type { Module, ModuleRoleResponse, RoleResponse } from "@jurnapod/shared";
import { ModuleSchema } from "@jurnapod/shared";
import type { RoleCode, SessionUser } from "../lib/session";
import { useRoles } from "../hooks/use-users";
import { useModuleRoles, updateModuleRolePermission } from "../hooks/use-module-roles";
import { ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import { OfflinePage } from "../components/offline-page";

type ModuleRolesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type ModuleRow = {
  module: Module;
  label: string;
  permissionMask: number;
};

const MODULES = ModuleSchema.options as Module[];

const MODULE_LABELS: Record<Module, string> = {
  companies: "Companies",
  outlets: "Outlets",
  users: "Users",
  roles: "Roles",
  accounts: "Accounts",
  journals: "Journals",
  sales: "Sales",
  inventory: "Inventory",
  purchasing: "Purchasing",
  reports: "Reports",
  settings: "Settings"
};

const PERMISSION_BITS = {
  create: 1,
  read: 2,
  update: 4,
  delete: 8
} as const;

const FULL_PERMISSION_MASK = 15;

function buildEmptyMasks(): Record<Module, number> {
  return MODULES.reduce<Record<Module, number>>((acc, moduleName) => {
    acc[moduleName] = 0;
    return acc;
  }, {} as Record<Module, number>);
}

function buildMasksFromRoles(moduleRoles: ModuleRoleResponse[]): Record<Module, number> {
  const base = buildEmptyMasks();
  moduleRoles.forEach((entry) => {
    if (MODULES.includes(entry.module as Module)) {
      base[entry.module as Module] = entry.permission_mask ?? 0;
    }
  });
  return base;
}

function buildFullMasks(): Record<Module, number> {
  return MODULES.reduce<Record<Module, number>>((acc, moduleName) => {
    acc[moduleName] = FULL_PERMISSION_MASK;
    return acc;
  }, {} as Record<Module, number>);
}

function toggleMask(mask: number, bit: number, enabled: boolean): number {
  if (enabled) {
    return mask | bit;
  }
  return mask & ~bit;
}

function hasPermission(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}

export function ModuleRolesPage(props: ModuleRolesPageProps) {
  const { user, accessToken } = props;
  const isOnline = useOnlineStatus();
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");

  const rolesQuery = useRoles(accessToken);
  const availableRoles = useMemo(() => {
    const roles = rolesQuery.data ?? [];
    return isSuperAdmin ? roles : roles.filter((role) => role.code !== "SUPER_ADMIN");
  }, [rolesQuery.data, isSuperAdmin]);

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [moduleMasks, setModuleMasks] = useState<Record<Module, number>>(buildEmptyMasks());
  const [baselineMasks, setBaselineMasks] = useState<Record<Module, number>>(buildEmptyMasks());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const moduleRolesQuery = useModuleRoles(accessToken, selectedRoleId);

  useEffect(() => {
    if (availableRoles.length === 0) {
      setSelectedRoleId(null);
      return;
    }

    const hasSelected = selectedRoleId
      ? availableRoles.some((role) => role.id === selectedRoleId)
      : false;
    if (hasSelected) {
      return;
    }

    const preferred = availableRoles.find((role) => user.roles.includes(role.code as RoleCode));
    setSelectedRoleId(preferred?.id ?? availableRoles[0].id);
  }, [availableRoles, selectedRoleId, user.roles]);

  const selectedRole = useMemo<RoleResponse | null>(
    () => availableRoles.find((role) => role.id === selectedRoleId) ?? null,
    [availableRoles, selectedRoleId]
  );

  const isLockedRole = selectedRole?.is_global ?? false;

  useEffect(() => {
    if (!selectedRoleId) {
      const empty = buildEmptyMasks();
      setModuleMasks(empty);
      setBaselineMasks(empty);
      return;
    }

    if (isLockedRole) {
      const full = buildFullMasks();
      setModuleMasks(full);
      setBaselineMasks(full);
      setSaveSuccess(null);
      setSaveError(null);
      return;
    }

    const nextMasks = buildMasksFromRoles(moduleRolesQuery.data ?? []);
    setModuleMasks(nextMasks);
    setBaselineMasks(nextMasks);
    setSaveSuccess(null);
    setSaveError(null);
  }, [selectedRoleId, moduleRolesQuery.data, isLockedRole]);

  const roleOptions = useMemo(
    () =>
      availableRoles.map((role) => ({
        value: String(role.id),
        label: `${role.name} (${role.code})`
      })),
    [availableRoles]
  );

  const hasChanges = useMemo(
    () => MODULES.some((moduleName) => moduleMasks[moduleName] !== baselineMasks[moduleName]),
    [moduleMasks, baselineMasks]
  );

  function handleToggle(moduleName: Module, bit: number, enabled: boolean) {
    setModuleMasks((prev) => ({
      ...prev,
      [moduleName]: toggleMask(prev[moduleName] ?? 0, bit, enabled)
    }));
    setSaveSuccess(null);
  }

  async function handleSave() {
    if (!selectedRoleId) {
      return;
    }

    if (isLockedRole) {
      setSaveError("Global roles are locked to full access.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const updates = MODULES.filter(
        (moduleName) => moduleMasks[moduleName] !== baselineMasks[moduleName]
      ).map((moduleName) =>
        updateModuleRolePermission(selectedRoleId, moduleName, moduleMasks[moduleName], accessToken)
      );

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      await moduleRolesQuery.refetch({ force: true });
      setSaveSuccess("Module roles updated successfully.");
    } catch (error) {
      if (error instanceof ApiError) {
        setSaveError(error.message);
      } else {
        setSaveError("Failed to update module roles");
      }
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<ModuleRow>[]>(() => {
    return [
      {
        id: "module",
        header: "Module",
        cell: (info) => (
          <Stack gap={2}>
            <Text fw={600}>{info.row.original.label}</Text>
            <Text size="xs" c="dimmed">
              Code: {info.row.original.module}
            </Text>
          </Stack>
        )
      },
      {
        id: "permissions",
        header: "Permissions",
        cell: (info) => {
          const mask = info.row.original.permissionMask;
          const moduleName = info.row.original.module;
          return (
            <Stack gap={6}>
              <Group gap="xs" wrap="wrap">
                <Checkbox
                  label="Create"
                  checked={hasPermission(mask, PERMISSION_BITS.create)}
                  disabled={saving || moduleRolesQuery.loading || !selectedRoleId || isLockedRole}
                  onChange={(event) =>
                    handleToggle(moduleName, PERMISSION_BITS.create, event.currentTarget.checked)
                  }
                />
                <Checkbox
                  label="Read"
                  checked={hasPermission(mask, PERMISSION_BITS.read)}
                  disabled={saving || moduleRolesQuery.loading || !selectedRoleId || isLockedRole}
                  onChange={(event) =>
                    handleToggle(moduleName, PERMISSION_BITS.read, event.currentTarget.checked)
                  }
                />
                <Checkbox
                  label="Update"
                  checked={hasPermission(mask, PERMISSION_BITS.update)}
                  disabled={saving || moduleRolesQuery.loading || !selectedRoleId || isLockedRole}
                  onChange={(event) =>
                    handleToggle(moduleName, PERMISSION_BITS.update, event.currentTarget.checked)
                  }
                />
                <Checkbox
                  label="Delete"
                  checked={hasPermission(mask, PERMISSION_BITS.delete)}
                  disabled={saving || moduleRolesQuery.loading || !selectedRoleId || isLockedRole}
                  onChange={(event) =>
                    handleToggle(moduleName, PERMISSION_BITS.delete, event.currentTarget.checked)
                  }
                />
              </Group>
              <Text size="xs" c="dimmed">
                Mask: {mask}
              </Text>
            </Stack>
          );
        }
      }
    ];
  }, [moduleRolesQuery.loading, saving, selectedRoleId, isLockedRole]);

  const tableRows = useMemo<ModuleRow[]>(
    () =>
      MODULES.map((moduleName) => ({
        module: moduleName,
        label: MODULE_LABELS[moduleName] ?? moduleName,
        permissionMask: moduleMasks[moduleName] ?? 0
      })),
    [moduleMasks]
  );

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Module Roles"
        message="Module role updates require a connection."
      />
    );
  }

  return (
    <Stack gap="md">
      <PageCard
        title="Module Roles"
        description="Assign module-level permissions to roles for this company."
        actions={
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!selectedRoleId || !hasChanges || isLockedRole}
          >
            Save All
          </Button>
        }
      >
        <Stack gap="sm">
          <FilterBar>
            <Select
              label="Role"
              placeholder={rolesQuery.loading ? "Loading roles..." : "Select role"}
              data={roleOptions}
              value={selectedRoleId ? String(selectedRoleId) : null}
              onChange={(value) => setSelectedRoleId(value ? Number(value) : null)}
              searchable
              clearable
              style={{ minWidth: 240 }}
            />
          </FilterBar>

          {rolesQuery.error ? (
            <Alert color="red" title="Unable to load roles">
              {rolesQuery.error}
            </Alert>
          ) : null}

          {moduleRolesQuery.error ? (
            <Alert color="red" title="Unable to load module roles">
              {moduleRolesQuery.error}
            </Alert>
          ) : null}

          {isLockedRole ? (
            <Alert color="yellow" title="Permissions locked">
              Global roles always have full access and cannot be edited.
            </Alert>
          ) : null}

          {saveError ? (
            <Alert color="red" title="Save failed">
              {saveError}
            </Alert>
          ) : null}

          {saveSuccess ? (
            <Alert color="green" title="Saved">
              {saveSuccess}
            </Alert>
          ) : null}
        </Stack>
      </PageCard>

      <PageCard
        title={selectedRole ? `Permissions for ${selectedRole.name}` : "Role Permissions"}
        description={
          selectedRole
            ? `Edit access levels for ${selectedRole.name} (${selectedRole.code}).`
            : "Select a role to view module permissions."
        }
      >
        {moduleRolesQuery.loading ? (
          <Text size="sm" c="dimmed">
            Loading module roles...
          </Text>
        ) : selectedRoleId ? (
          <DataTable columns={columns} data={tableRows} emptyState="No modules found." />
        ) : (
          <Text size="sm" c="dimmed">
            Select a role to view module permissions.
          </Text>
        )}
      </PageCard>
    </Stack>
  );
}
