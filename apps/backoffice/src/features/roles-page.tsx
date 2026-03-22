// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Title,
  Select
} from "@mantine/core";
import type { SessionUser } from "../lib/session";
import {
  useRoles,
  createRole,
  updateRole,
  deleteRole
} from "../hooks/use-users";
import { useCompanies } from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import {
  DataTable,
  type DataTableColumnDef,
  type PaginationState,
  type SortState,
  type RowSelectionState,
} from "../components/ui/DataTable";
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import type { RoleResponse } from "@jurnapod/shared";

type RolesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

type RoleFormData = {
  code: string;
  name: string;
  role_level: number;
};

const emptyForm: RoleFormData = {
  code: "",
  name: "",
  role_level: 0
};

const SYSTEM_ROLE_CODES = new Set([
  "SUPER_ADMIN",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "CASHIER",
  "ACCOUNTANT"
]);

export function RolesPage(props: RolesPageProps) {
  const { accessToken, user } = props;
  const userCompanyId = user.company_id;
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  
  const [filterCompanyId, setFilterCompanyId] = useState<number | undefined>(
    isSuperAdmin ? undefined : userCompanyId
  );
  
  const rolesQuery = useRoles(accessToken, filterCompanyId);
  const companiesQuery = useCompanies(accessToken, { enabled: isSuperAdmin });

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingRole, setEditingRole] = useState<RoleResponse | null>(null);
  const [formData, setFormData] = useState<RoleFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RoleFormData, string>>>({});

  const [confirmState, setConfirmState] = useState<RoleResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Pagination, sort, and selection state (placeholder for complex DataTable)
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 25
  });
  const [sort, setSort] = useState<SortState | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredRoles = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (rolesQuery.data || []).filter((role) => {
      if (!normalizedSearch) {
        return true;
      }
      return (
        role.code.toLowerCase().includes(normalizedSearch) ||
        role.name.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [rolesQuery.data, searchTerm]);
  
  // Handlers
  const openCreateDialog = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setEditingRole(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openEditDialog = (role: RoleResponse) => {
    setFormData({
      code: role.code,
      name: role.name,
      role_level: role.role_level
    });
    setFormErrors({});
    setEditingRole(role);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };
  
  const closeDialog = () => {
    setDialogMode(null);
    setEditingRole(null);
    setFormData(emptyForm);
    setFormErrors({});
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof RoleFormData, string>> = {};
    
    if (dialogMode === "create") {
      if (!formData.code.trim()) {
        errors.code = "Role code is required";
      } else if (!/^[A-Z_]+$/.test(formData.code)) {
        errors.code = "Role code must be uppercase letters and underscores only";
      }
    }
    
    if (!formData.name.trim()) {
      errors.name = "Role name is required";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      if (dialogMode === "create") {
        await createRole(
          {
            code: formData.code.trim().toUpperCase(),
            name: formData.name.trim(),
            role_level: formData.role_level
          },
          accessToken
        );
        setSuccessMessage("Role created successfully");
        await rolesQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingRole) {
        await updateRole(
          editingRole.id,
          {
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Role updated successfully");
        await rolesQuery.refetch();
        closeDialog();
      }
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  };
  
  const columns = useMemo<DataTableColumnDef<RoleResponse>[]>(() => {
    return [
      {
        id: "code",
        header: "Code",
        sortable: true,
        cell: (info) => <Text fw={600}>{info.row.original.code}</Text>
      },
      {
        id: "name",
        header: "Name",
        sortable: true,
        cell: (info) => <Text>{info.row.original.name}</Text>
      },
      {
        id: "scope",
        header: "Scope",
        sortable: false,
        cell: (info) => {
          const { company_id, is_global } = info.row.original;
          if (company_id === null) {
            return (
              <Badge variant="light" color="blue">
                System
              </Badge>
            );
          }
          if (is_global) {
            return (
              <Badge variant="light" color="cyan">
                Global
              </Badge>
            );
          }
          return (
            <Badge variant="light" color="green">
              Company
            </Badge>
          );
        }
      },
      {
        id: "level",
        header: "Level",
        sortable: true,
        cell: (info) => (
          <Badge variant="light" size="sm" color="gray">
            {info.row.original.role_level}
          </Badge>
        )
      },
      {
        id: "actions",
        header: "Actions",
        sortable: false,
        isRowAction: true,
        cell: (info) => {
          const role = info.row.original;
          const isSystem = SYSTEM_ROLE_CODES.has(role.code);
          const isCustomForOtherCompany = role.company_id !== null && role.company_id !== userCompanyId;
          const isLocked = role.is_global || isSystem || isCustomForOtherCompany;
          const systemTooltip = isLocked
            ? isCustomForOtherCompany
              ? "You can only edit roles from your company."
              : "System roles cannot be changed."
            : undefined;
          return (
            <Group gap="xs" justify="flex-end" wrap="wrap">
              <Button
                size="xs"
                variant="light"
                onClick={() => openEditDialog(role)}
                disabled={isLocked}
                title={systemTooltip}
              >
                Edit
              </Button>
              <Button
                size="xs"
                color="red"
                variant="light"
                onClick={() => setConfirmState(role)}
                disabled={isLocked}
                title={systemTooltip}
              >
                Delete
              </Button>
            </Group>
          );
        }
      }
    ];
  }, [openEditDialog, userCompanyId]);

  async function handleConfirmDelete() {
    if (!confirmState) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await deleteRole(confirmState.id, accessToken);
      setSuccessMessage(`Role "${confirmState.name}" deleted successfully`);
      await rolesQuery.refetch();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete role");
      }
    } finally {
      setConfirmState(null);
    }
  }
  
  return (
    <>
      <Stack gap="md">
        <PageCard
          title="Role Management"
          description="Manage system roles for access control."
          actions={
            <Button onClick={openCreateDialog}>Create Role</Button>
          }
        >
          <Stack gap="sm">
            <FilterBar>
              {isSuperAdmin && companiesQuery.data ? (
                <Select
                  label="Company"
                  placeholder="All companies"
                  value={filterCompanyId?.toString() ?? ""}
                  onChange={(value) => setFilterCompanyId(value ? Number(value) : undefined)}
                  data={[
                    { value: "", label: "All companies" },
                    ...companiesQuery.data.map((company) => ({
                      value: company.id.toString(),
                      label: company.name
                    }))
                  ]}
                  style={{ minWidth: 200 }}
                  clearable
                />
              ) : null}
              <TextInput
                label="Search"
                placeholder="Search by code or name"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                style={{ minWidth: 220 }}
              />
            </FilterBar>

            {rolesQuery.loading ? (
              <Text size="sm" c="dimmed">
                Loading roles...
              </Text>
            ) : null}
            {rolesQuery.error ? (
              <Alert color="red" title="Unable to load roles">
                {rolesQuery.error}
              </Alert>
            ) : null}
            {error ? (
              <Alert color="red" title="Action failed">
                {error}
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert color="green" title="Success">
                {successMessage}
              </Alert>
            ) : null}
          </Stack>
        </PageCard>

        <PageCard title={`Roles (${filteredRoles.length})`}>
          <DataTable
            columns={columns}
            data={filteredRoles}
            getRowId={(role) => role.id.toString()}
            pagination={pagination}
            sort={sort}
            selection={selection}
            onPaginationChange={setPagination}
            onSortChange={setSort}
            onSelectionChange={setSelection}
            emptyState={
              searchTerm.trim().length > 0
                ? "No roles match your search."
                : "No roles found."
            }
          />
        </PageCard>
      </Stack>

      <Modal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create New Role" : "Edit Role"}
          </Title>
        }
        centered
      >
        <Stack gap="md">
          {dialogMode === "create" ? (
            <TextInput
              label="Role Code"
              placeholder="e.g., MANAGER, SUPERVISOR"
              value={formData.code}
              onChange={(event) =>
                setFormData({ ...formData, code: event.currentTarget.value.toUpperCase() })
              }
              maxLength={64}
              error={formErrors.code}
              description="Uppercase letters and underscores only"
              withAsterisk
            />
          ) : (
            <TextInput
              label="Role Code"
              value={editingRole?.code ?? ""}
              disabled
              description="Code cannot be changed"
            />
          )}

          <TextInput
            label="Role Name"
            placeholder="e.g., Manager, Supervisor"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.currentTarget.value })}
            maxLength={191}
            error={formErrors.name}
            withAsterisk
          />

          {dialogMode === "create" && (
            <NumberInput
              label="Role Level"
              description="Users can only create roles with level lower than their own"
              value={formData.role_level}
              onChange={(value) => setFormData({ ...formData, role_level: typeof value === "number" ? value : 0 })}
              min={0}
              max={99}
            />
          )}

          {error ? (
            <Alert color="red" title="Unable to save">
              {error}
            </Alert>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={<Title order={4}>Delete Role</Title>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete role <Text span fw={600}>"{confirmState?.name}"</Text>?
          </Text>
          <Alert color="yellow" title="Warning">
            If this role is assigned to any users, the deletion will fail.
            Users must be reassigned to a different role before deleting this one.
          </Alert>
          <Text size="sm" c="dimmed">
            This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmState(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
