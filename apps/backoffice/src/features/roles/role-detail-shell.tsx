// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RolePermissionEntry, RoleResponse } from "@jurnapod/shared";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { PageCard } from "@/components/PageCard";
import { ScopeBadge } from "@/components/data-grid";
import { PermissionMatrix } from "@/components/permissions/PermissionMatrix";
import {
  CANONICAL_MODULE_RESOURCES,
  calculatePermissionDiff,
  formatPermissionDiff,
  groupPermissionDiffs,
  isSystemRole,
  type CanonicalModule,
  type GroupedPermissionDiff,
  type PermissionDiff,
} from "@/lib/auth/permissions";
import type { PermissionCell } from "@/components/permissions/PermissionMatrix";

export const ROLE_PERMISSION_CONTRACT_GAP =
  "Role permission read/write is blocked until GET and PUT/PATCH /api/roles/:id/permissions are approved.";

export const ROLE_OUTLET_SCOPING_CONTRACT_GAP =
  "Outlet role scoping detail is unavailable until a safe role outlet-scope read contract is approved.";

export const ROLE_CHANGE_HISTORY_CONTRACT_GAP =
  "Role change history is unavailable until GET /api/audit-logs exposes role-management events.";

export const ROLE_DETAIL_TABS = [
  "overview",
  "permission-matrix",
  "outlet-scoping",
  "change-history",
] as const;

export type RoleDetailTab = (typeof ROLE_DETAIL_TABS)[number];

export interface RoleDetailShellProps {
  role: RoleResponse | null;
  loading?: boolean;
  error?: string | null;
  permissions?: readonly RolePermissionEntry[];
  permissionsLoading?: boolean;
  permissionsError?: string | null;
  canManageRoles?: boolean;
  onSavePermissions?: (permissions: RolePermissionEntry[]) => Promise<void>;
  onClose?: () => void;
}

export function isReadOnlyRole(role: RoleResponse | null): boolean {
  if (!role) return true;
  return role.company_id === null || role.is_global || isSystemRole(role.code);
}

export function buildCanonicalEmptyPermissionCells() {
  return (Object.keys(CANONICAL_MODULE_RESOURCES) as CanonicalModule[]).flatMap((module) =>
    CANONICAL_MODULE_RESOURCES[module].map((resource) => ({
      module,
      resource,
      mask: 0,
    })),
  );
}

export function rolePermissionEntriesToCells(
  entries: readonly RolePermissionEntry[]
): PermissionCell[] {
  return entries
    .filter((entry) => (Object.keys(CANONICAL_MODULE_RESOURCES) as string[]).includes(entry.module))
    .map((entry) => ({
      module: entry.module as CanonicalModule,
      resource: entry.resource,
      mask: entry.mask,
    }));
}

export function permissionCellsToRolePermissionEntries(
  cells: readonly PermissionCell[]
): RolePermissionEntry[] {
  return cells
    .filter((cell) => cell.mask > 0)
    .map((cell) => ({
      module: cell.module,
      resource: cell.resource,
      mask: cell.mask,
    }))
    .sort((a, b) => a.module.localeCompare(b.module) || a.resource.localeCompare(b.resource));
}

export function buildRolePermissionReviewGroups(
  before: readonly PermissionCell[],
  after: readonly PermissionCell[]
): GroupedPermissionDiff[] {
  const diffs = calculatePermissionDiff(before, after);
  return groupPermissionDiffs(diffs);
}

function RoleScopeBadges(props: { role: RoleResponse }) {
  const { role } = props;
  const roleIsSystem = role.company_id === null || isSystemRole(role.code);

  return (
    <Group gap="xs" wrap="wrap">
      {roleIsSystem ? (
        <ScopeBadge label="System Role" color="yellow" data-testid="role-detail-system-badge" />
      ) : null}
      {role.is_global ? <ScopeBadge label="Global Role" color="cyan" /> : null}
      {role.company_id !== null ? (
        <ScopeBadge label={`Company #${role.company_id}`} color="blue" />
      ) : null}
      <ScopeBadge label={`Level ${role.role_level}`} color="gray" />
    </Group>
  );
}

function ContractGapAlert(props: { title: string; message: string }) {
  return (
    <Alert color="yellow" title={props.title} data-testid="role-detail-contract-gap">
      {props.message}
    </Alert>
  );
}

export function RoleDetailShell(props: RoleDetailShellProps) {
  const {
    role,
    loading = false,
    error = null,
    permissions = [],
    permissionsLoading = false,
    permissionsError = null,
    canManageRoles = false,
    onSavePermissions,
    onClose,
  } = props;
  const roleIsReadOnly = isReadOnlyRole(role);
  const loadedPermissionCells = useMemo(
    () => rolePermissionEntriesToCells(permissions),
    [permissions],
  );
  const [editedPermissionCells, setEditedPermissionCells] = useState<PermissionCell[]>(loadedPermissionCells);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditedPermissionCells(loadedPermissionCells);
    setReviewOpen(false);
    setSaveError(null);
  }, [loadedPermissionCells, role?.id]);

  const permissionDiffs: PermissionDiff[] = useMemo(
    () => calculatePermissionDiff(loadedPermissionCells, editedPermissionCells),
    [editedPermissionCells, loadedPermissionCells],
  );
  const reviewGroups = useMemo(() => groupPermissionDiffs(permissionDiffs), [permissionDiffs]);
  const canEditPermissions = Boolean(role && !roleIsReadOnly && canManageRoles && !permissionsLoading && !permissionsError && onSavePermissions);

  const handleReviewSave = () => {
    setSaveError(null);
    if (!canEditPermissions || permissionDiffs.length === 0) return;
    setReviewOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!onSavePermissions) return;
    setSavingPermissions(true);
    setSaveError(null);
    try {
      await onSavePermissions(permissionCellsToRolePermissionEntries(editedPermissionCells));
      setReviewOpen(false);
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : "Failed to update role permissions");
    } finally {
      setSavingPermissions(false);
    }
  };

  if (loading) {
    return (
      <PageCard title="Role Detail" description="Loading role detail from GET /roles/:id.">
        <Text size="sm" c="dimmed">Loading role detail...</Text>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard title="Role Detail" description="Unable to load role detail from GET /roles/:id.">
        <Alert color="red" title="Unable to load role detail">
          {error}
        </Alert>
      </PageCard>
    );
  }

  if (!role) {
    return (
      <PageCard title="Role Detail" description="Select a role to inspect role management details.">
        <Text size="sm" c="dimmed">No role selected.</Text>
      </PageCard>
    );
  }

  return (
    <PageCard
      title="Role Detail"
      description="Read-only role detail shell. Backend ACL remains authoritative."
      actions={onClose ? <Button variant="light" onClick={onClose}>Close</Button> : undefined}
    >
      <Stack gap="md" data-testid="role-detail-shell">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={3}>{role.name}</Title>
            <Text size="sm" c="dimmed">{role.code}</Text>
          </div>
          <RoleScopeBadges role={role} />
        </Group>

        {roleIsReadOnly ? (
          <Alert color="blue" title="Read-only role" data-testid="role-detail-readonly-alert">
            {isSystemRole(role.code) || role.company_id === null
              ? "System roles are immutable in the backoffice. Permission cells remain read-only."
              : "Global roles are read-only in this shell. Permission cells remain blocked until the safe backend contract is approved."}
          </Alert>
        ) : !canManageRoles ? (
          <Alert color="yellow" title="Permission editing unavailable" data-testid="role-detail-manage-blocked-alert">
            You need platform.roles.MANAGE to edit role permissions.
          </Alert>
        ) : (
          <Alert color="green" title="Custom role editable" data-testid="role-detail-editable-alert">
            Custom role permission changes require grouped review before mutation.
          </Alert>
        )}

        <Tabs defaultValue="overview">
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="permission-matrix">Permission Matrix</Tabs.Tab>
            <Tabs.Tab value="outlet-scoping">Outlet Scoping</Tabs.Tab>
            <Tabs.Tab value="change-history">Change History</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Role ID</Text>
                <Text fw={600}>{role.id}</Text>
              </Stack>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Role Code</Text>
                <Text fw={600}>{role.code}</Text>
              </Stack>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Role Name</Text>
                <Text fw={600}>{role.name}</Text>
              </Stack>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Scope</Text>
                <Text fw={600}>{role.company_id === null ? "System" : role.is_global ? "Global" : "Company"}</Text>
              </Stack>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="permission-matrix" pt="md">
            <Stack gap="sm">
              {permissionsError ? (
                <Alert color="red" title="Unable to load role permissions">
                  {permissionsError}
                </Alert>
              ) : null}
              {permissionsLoading ? (
                <Text size="sm" c="dimmed">Loading role permissions...</Text>
              ) : null}
              <Group gap="xs">
                <Badge color={canEditPermissions ? "green" : "gray"} variant="light">
                  {canEditPermissions ? "Editable" : "Read-only"}
                </Badge>
                <Badge color={permissionDiffs.length > 0 ? "yellow" : "gray"} variant="light">
                  {permissionDiffs.length} pending changes
                </Badge>
              </Group>
              <PermissionMatrix
                roleCode={role.code}
                permissions={editedPermissionCells}
                onChange={setEditedPermissionCells}
                readOnly={!canEditPermissions}
                maxHeight="48vh"
              />
              <Group justify="flex-end">
                <Button
                  disabled={!canEditPermissions || permissionDiffs.length === 0}
                  onClick={handleReviewSave}
                >
                  Save permission changes
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="outlet-scoping" pt="md">
            <ContractGapAlert title="Outlet scoping unavailable" message={ROLE_OUTLET_SCOPING_CONTRACT_GAP} />
          </Tabs.Panel>

          <Tabs.Panel value="change-history" pt="md">
            <ContractGapAlert title="Change history unavailable" message={ROLE_CHANGE_HISTORY_CONTRACT_GAP} />
          </Tabs.Panel>
        </Tabs>

        <Modal
          opened={reviewOpen}
          onClose={() => setReviewOpen(false)}
          title={<Title order={4}>Review Permission Changes</Title>}
          centered
        >
          <Stack gap="md" data-testid="role-permission-review-modal">
            {saveError ? <Alert color="red" title="Unable to save permissions">{saveError}</Alert> : null}
            {reviewGroups.length === 0 ? (
              <Text size="sm" c="dimmed">No permission changes to review.</Text>
            ) : (
              reviewGroups.map((group) => (
                <Stack key={group.module} gap={4}>
                  <Text fw={700}>{group.module}</Text>
                  {group.diffs.map((diff) => (
                    <Text key={`${diff.module}.${diff.resource}`} size="sm">
                      {formatPermissionDiff(diff)}
                    </Text>
                  ))}
                </Stack>
              ))
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setReviewOpen(false)} disabled={savingPermissions}>
                Cancel
              </Button>
              <Button onClick={handleConfirmSave} loading={savingPermissions} disabled={reviewGroups.length === 0}>
                Confirm permission update
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </PageCard>
  );
}
